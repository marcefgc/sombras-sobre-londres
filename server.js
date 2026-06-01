const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const G = require('./game-state');
const R = require('./referee');
const B = require('./board-graph');

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
  // Vista por JUGADOR. player = { role, colors }. Añade los datos del modo
  // Aprendizaje (destinos legales) y `me` (rol y colores propios).
  function viewForPlayer(player) {
    const role = player.role;
    const view = G.viewFor(state, role);
    view.me = { role, colors: player.colors || [] };
    if (state.game.mode === 'referee' && state.ref) {
      const turn = state.game.turn;
      if (role === 'jack') {
        if (turn === 'jack' && state.ref.jackCircle != null) {
          view.ref.legal = {
            normal: R.legalNormalTargets(state),
            carriage: R.legalCarriageTargets(state),
            alley: R.legalAlleyTargets(state),
          };
        } else {
          view.ref.legal = { normal: [], carriage: [], alley: [] };
        }
      } else if (role === 'police') {
        // Por cada FICHA (color) del jugador: dónde puede ir y qué investigar.
        view.ref.byColor = {};
        for (const color of (player.colors || [])) {
          const placed = state.ref.police[color] != null;
          const moved = !!(state.ref.moved && state.ref.moved[color]);
          const acted = !!(state.ref.acted && state.ref.acted[color]);
          const legalSquares = (turn === 'police' && !moved)
            ? (placed ? R.reachableSquares(state, state.ref.police[color], 2) : R.placementSquares(state))
            : [];
          const searchable = (turn === 'police' && placed && !acted) ? R.circlesAroundPolice(state, color) : [];
          view.ref.byColor[color] = { placed, moved, acted, legalSquares, searchable };
        }
      }
    }
    return view;
  }
  function maybeEndPoliceTurn() {
    if (state.game.mode === 'referee' && state.game.turn === 'police'
        && R.allPoliceActed(state, G.activeColors(state))) {
      R.endPoliceTurn(state);
    }
  }
  function emitStates() {
    for (const [id, p] of Object.entries(state.players)) {
      const json = JSON.stringify(viewForPlayer(p));
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
    function me() { return state.players[socket.id]; }
    function roleOf() { return state.players[socket.id] && state.players[socket.id].role; }
    function ownsColor(color) { const p = me(); return !!(p && p.role === 'police' && p.colors.includes(color)); }
    function jackSocketId() {
      const e = Object.entries(state.players).find(([, p]) => p.role === 'jack');
      return e ? e[0] : null;
    }

    socket.on('join', ({ name, role, colors }) => {
      const r = G.addPlayer(state, socket.id, name, role, colors);
      if (!r.ok) { socket.emit('join:rejected', { reason: r.reason }); return; }
      const json = JSON.stringify(viewForPlayer(state.players[socket.id]));
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
      if (roleOf() !== 'jack' || manualOnly()) return;
      if (G.movesExhausted(state)) { // #1: el servidor impone el límite de la noche
        state.log.push('La noche está agotada (15 movimientos). Declara el amanecer.');
        sendStates();
        return;
      }
      G.logJackStep(state, circle, special); sendStates();
    });
    socket.on('phase:crimePrep', () => {
      if (roleOf() !== 'jack') return; // #3: solo Jack controla el avance de fase
      G.startCrimePrep(state); sendStates();
    });
    socket.on('phase:startCrime', ({ circle }) => {
      if (roleOf() !== 'jack' || manualOnly()) return;
      // Modo libre: Jack escribe el número impreso del mapa (1..195). Se acepta
      // ese número tal cual; solo se rechaza algo fuera de ese rango de casillas.
      const c = Number(circle);
      if (!Number.isInteger(c) || c < 1 || c > 199) { socket.emit('ref:rejected', { reason: 'escribe un número de casilla válido (1–195)' }); return; }
      G.startCrime(state, c); sendStates();
    });
    // Pasar turno (modo libre, guiado y sin bloquear): alterna Jack <-> policía.
    socket.on('phase:passTurn', () => {
      if (state.game.mode !== 'manual') return;
      const role = roleOf();
      if (role !== 'jack' && role !== 'police') return;
      G.passTurn(state); sendStates();
    });
    socket.on('phase:nextNight', () => {
      if (roleOf() !== 'jack') return; // #3: solo Jack avanza la noche
      // B2: durante la caza la noche NO se puede saltar a demanda. Solo termina
      // al llegar a la guarida (jack:reachedLair, que avanza) o al amanecer
      // (phase:dawn, victoria policial). Si no, Jack abandonaría una noche
      // perdida y recuperaría sus carruajes/callejones sin penalización.
      if (state.game.phase === 'hunt') {
        state.log.push('Avance de noche rechazado: la noche solo termina al llegar a la guarida o al amanecer.');
        sendStates();
        return;
      }
      G.nextNight(state); sendStates();
    });
    socket.on('reset', () => {
      if (roleOf() !== 'jack') return; // #4: solo Jack puede reiniciar la partida
      const fresh = G.createGame();
      fresh.players = state.players;
      fresh.roleClaims = state.roleClaims; // conservar reservas de rol de los conectados
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
    // guarida → gana la policía (lo deja atrapado fuera al amanecer). #2: solo
    // un jugador (no espectador) puede declararlo, únicamente en plena caza y
    // cuando la noche realmente se agotó. Antes cualquiera ganaba al instante.
    socket.on('phase:dawn', () => {
      const role = roleOf();
      const isPlayer = role === 'jack' || role === 'police';
      if (!isPlayer || state.game.phase !== 'hunt' || !G.movesExhausted(state)) {
        state.log.push('Amanecer rechazado: solo al agotarse la noche en plena caza.');
        sendStates();
        return;
      }
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
    socket.on('ref:movePolice', ({ color, square }) => {
      if (state.game.mode !== 'referee' || !ownsColor(color)) return;
      const r = R.movePolice(state, color, square);
      if (!r.ok) return socket.emit('ref:rejected', r);
      sendStates();
    });
    socket.on('ref:search', ({ color, circle }) => {
      if (state.game.mode !== 'referee' || !ownsColor(color)) return;
      const r = R.searchClue(state, color, circle);
      if (!r.ok) return socket.emit('ref:rejected', r);
      io.emit('clue:result', { circle, passed: r.passed });
      const jid = jackSocketId(); if (jid) io.to(jid).emit('clue:asked', { circle });
      maybeEndPoliceTurn();
      sendStates();
    });
    socket.on('ref:arrest', ({ color, circle }) => {
      if (state.game.mode !== 'referee' || !ownsColor(color)) return;
      const r = R.arrest(state, color, circle);
      if (!r.ok) return socket.emit('ref:rejected', r);
      io.emit('arrest:result', { circle, caught: r.caught });
      const jid = jackSocketId(); if (jid) io.to(jid).emit('arrest:attempt', { circle });
      maybeEndPoliceTurn();
      sendStates();
    });
    socket.on('ref:endPoliceTurn', () => {
      if (state.game.mode !== 'referee') return;
      if (roleOf() !== 'police') return; // solo la policía termina su turno
      if (state.game.turn !== 'police') return;
      R.endPoliceTurn(state);
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
