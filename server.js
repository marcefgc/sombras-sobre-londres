const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const G = require('./game-state');
const R = require('./referee');

function createServer() {
  const app = express();
  app.use(express.static(path.join(__dirname, 'public')));
  const server = http.createServer(app);
  const io = new Server(server);
  const state = G.createGame();

  // Last serialized view sent to each client, used to suppress redundant
  // broadcasts. Clients commonly poll with `socket.once('state')`, so emitting
  // an unchanged state would consume a poll and let the next real update slip
  // through the gap between `once` re-registrations. Deduping avoids that race.
  const lastSent = new Map();
  function viewForRole(role) {
    const view = G.viewFor(state, role);
    if (state.game.mode === 'referee' && state.ref) {
      if (role === 'jack' && state.ref.jackCircle != null) {
        view.ref.legal = {
          normal: R.legalNormalTargets(state),
          carriage: R.legalCarriageTargets(state),
          alley: R.legalAlleyTargets(state),
        };
      } else if (role && role.startsWith('det')) {
        const from = state.ref.police[role];
        view.ref.legalSquares = from != null ? R.reachableSquares(state, from, 2) : [];
        view.ref.searchable = R.circlesAroundPolice(state, role);
      }
    }
    return view;
  }
  function emitStates() {
    for (const [id, p] of Object.entries(state.players)) {
      const json = JSON.stringify(viewForRole(p.role));
      if (lastSent.get(id) === json) continue;
      lastSent.set(id, json);
      io.to(id).emit('state', JSON.parse(json));
    }
  }
  // Coalesce multiple synchronous mutations (e.g. addToken + moveToken) into a
  // single state broadcast carrying the final state.
  let scheduled = false;
  function sendStates() {
    if (scheduled) return;
    scheduled = true;
    setImmediate(() => {
      scheduled = false;
      emitStates();
    });
  }

  io.on('connection', (socket) => {
    function roleOf() { return state.players[socket.id] && state.players[socket.id].role; }
    function jackSocketId() {
      const e = Object.entries(state.players).find(([, p]) => p.role === 'jack');
      return e ? e[0] : null;
    }

    socket.on('join', ({ name, role }) => {
      const r = G.addPlayer(state, socket.id, name, role);
      if (!r.ok) return socket.emit('join:rejected', r);
      const json = JSON.stringify(viewForRole(r.role));
      lastSent.set(socket.id, json);
      socket.emit('state', JSON.parse(json));
      sendStates();
    });

    // Eventos del modo manual. En modo árbitro (referee) las fichas libres y las
    // acciones por número no aplican — el modo Aprendizaje usa los eventos ref:*
    // que validan todo. Por eso se ignoran si la partida está en modo referee.
    const manualOnly = () => state.game.mode === 'referee';
    socket.on('addToken', (token) => { if (manualOnly()) return; G.upsertToken(state, token); sendStates(); });
    socket.on('moveToken', ({ id, x, y }) => { if (manualOnly()) return; G.moveToken(state, id, x, y); sendStates(); });
    socket.on('removeToken', ({ id }) => { if (manualOnly()) return; G.removeToken(state, id); sendStates(); });

    socket.on('jack:setLair', ({ circle }) => {
      if (roleOf() !== 'jack') return;
      G.setLair(state, circle); sendStates();
    });
    socket.on('jack:logStep', ({ circle, special }) => {
      if (roleOf() !== 'jack' || state.game.mode !== 'manual') return;
      G.logJackStep(state, circle, special); sendStates();
    });
    socket.on('phase:crimePrep', () => {
      if (roleOf() !== 'jack') return;
      G.startCrimePrep(state); sendStates();
    });
    socket.on('phase:startCrime', ({ circle }) => {
      if (roleOf() !== 'jack' || state.game.mode !== 'manual') return;
      if (R.B.node(circle) == null || R.B.node(circle).type !== 'circle') return;
      G.startCrime(state, circle); sendStates();
    });
    socket.on('phase:nextNight', () => {
      if (roleOf() !== 'jack') return;
      G.nextNight(state); sendStates();
    });
    socket.on('reset', () => {
      const rolesAssigned = Object.values(state.players).some((p) => p.role === 'jack' || (p.role && p.role.startsWith('det')));
      if (rolesAssigned && roleOf() !== 'jack') return;
      const fresh = G.createGame();
      fresh.players = state.players;
      Object.assign(state, fresh);
      sendStates();
    });

    // Jack declara que llegó a su guarida (fin de noche). El servidor verifica
    // de forma autoritativa contra su posición real. Si es la noche final, gana
    // Jack; si no, avanza a la siguiente noche.
    socket.on('jack:reachedLair', () => {
      if (roleOf() !== 'jack') return;
      const reached = G.checkLairReached(state);
      if (reached) {
        if (state.game.night >= G.TOTAL_NIGHTS) {
          G.endGame(state, 'Jack');
        } else {
          state.log.push('Jack llegó a su guarida. Fin de la noche ' + state.game.night + '.');
          G.nextNight(state);
        }
      }
      socket.emit('lair:result', { reached, won: reached && state.game.phase === 'ended' });
      if (reached) sendStates();
    });

    // Amanecer: se agotaron los 15 turnos de la noche y Jack no llegó a su
    // guarida → gana la policía (lo deja atrapado fuera al amanecer).
    socket.on('phase:dawn', () => {
      if (state.game.phase !== 'hunt') return;
      const jackMovesExhausted = state.game.jackMoves >= G.MOVES_PER_NIGHT;
      if (roleOf() !== 'jack' && !jackMovesExhausted) return;
      G.endGame(state, 'Policía');
      sendStates();
    });

    socket.on('clue:ask', ({ circle }) => {
      if (manualOnly()) return; // en referee se usa ref:search (valida adyacencia)
      const passed = G.checkClue(state, circle);
      state.log.push('Pista en ' + circle + ': ' + (passed ? 'SÍ' : 'no'));
      io.emit('clue:result', { circle, passed });
      const jid = jackSocketId();
      if (jid) io.to(jid).emit('clue:asked', { circle });
      sendStates();
    });
    socket.on('arrest', ({ circle }) => {
      if (manualOnly()) return; // en referee se usa ref:arrest (valida adyacencia)
      const caught = G.checkArrest(state, circle);
      state.log.push('¡Arresto en ' + circle + '! ' + (caught ? 'ATRAPADO' : 'fallido'));
      io.emit('arrest:result', { circle, caught });
      if (caught) G.endGame(state, 'Policía');
      const jid = jackSocketId();
      if (jid) io.to(jid).emit('arrest:attempt', { circle });
      sendStates();
    });

    socket.on('setMode', ({ mode }) => {
      if (state.game.phase !== 'lobby') return; // el modo se fija antes de empezar
      if (roleOf() !== 'jack' && Object.values(state.players).some(p => p.role === 'jack')) return;
      G.setMode(state, mode);
      sendStates();
    });
    socket.on('ref:startCrime', ({ circle }) => {
      if (roleOf() !== 'jack' || state.game.mode !== 'referee') return;
      const r = R.startCrimeAt(state, circle);
      if (!r.ok) return socket.emit('ref:rejected', r);
      sendStates();
    });
    socket.on('ref:moveJack', ({ circle, kind }) => {
      if (roleOf() !== 'jack' || state.game.mode !== 'referee') return;
      const r = R.moveJack(state, circle, kind || 'normal');
      if (!r.ok) { state.log.push('Movimiento rechazado: ' + r.reason); socket.emit('ref:rejected', r); sendStates(); return; }
      sendStates();
    });
    socket.on('ref:movePolice', ({ square }) => {
      if (state.game.mode !== 'referee') return;
      const r = R.movePolice(state, roleOf(), square);
      if (!r.ok) return socket.emit('ref:rejected', r);
      sendStates();
    });
    socket.on('ref:search', ({ circle }) => {
      if (state.game.mode !== 'referee') return;
      const r = R.searchClue(state, roleOf(), circle);
      if (!r.ok) return socket.emit('ref:rejected', r);
      io.emit('clue:result', { circle, passed: r.passed });
      const jid = jackSocketId(); if (jid) io.to(jid).emit('clue:asked', { circle });
      sendStates();
    });
    socket.on('ref:arrest', ({ circle }) => {
      if (state.game.mode !== 'referee') return;
      const r = R.arrest(state, roleOf(), circle);
      if (!r.ok) return socket.emit('ref:rejected', r);
      io.emit('arrest:result', { circle, caught: r.caught });
      const jid = jackSocketId(); if (jid) io.to(jid).emit('arrest:attempt', { circle });
      sendStates();
    });

    socket.on('disconnect', () => {
      G.removePlayer(state, socket.id);
      lastSent.delete(socket.id);
      sendStates();
    });
  });

  return { app, server, io, state, G, sendStates };
}

if (require.main === module) {
  const { server } = createServer();
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log('Sombras sobre Londres escuchando en http://localhost:' + PORT);
  });
}

module.exports = { createServer };
