const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const G = require('./game-state');

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
  function emitStates() {
    for (const [id, p] of Object.entries(state.players)) {
      const json = JSON.stringify(G.viewFor(state, p.role));
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
      G.addPlayer(state, socket.id, name, role);
      const json = JSON.stringify(G.viewFor(state, role));
      lastSent.set(socket.id, json);
      socket.emit('state', JSON.parse(json));
      sendStates();
    });

    // Token, phase, clue/arrest and reset events are intentionally open to any
    // connected player (cooperative local-network trust model). Only the three
    // Jack-private events below are role-guarded.
    socket.on('addToken', (token) => { G.upsertToken(state, token); sendStates(); });
    socket.on('moveToken', ({ id, x, y }) => { G.moveToken(state, id, x, y); sendStates(); });
    socket.on('removeToken', ({ id }) => { G.removeToken(state, id); sendStates(); });

    socket.on('jack:setLair', ({ circle }) => {
      if (roleOf() !== 'jack') return;
      G.setLair(state, circle); sendStates();
    });
    socket.on('jack:logStep', ({ circle, special }) => {
      if (roleOf() !== 'jack') return;
      G.logJackStep(state, circle, special); sendStates();
    });
    socket.on('phase:crimePrep', () => { G.startCrimePrep(state); sendStates(); });
    socket.on('phase:startCrime', ({ circle }) => {
      if (roleOf() !== 'jack') return;
      G.startCrime(state, circle); sendStates();
    });
    socket.on('phase:nextNight', () => { G.nextNight(state); sendStates(); });
    socket.on('reset', () => {
      const fresh = G.createGame();
      fresh.players = state.players;
      Object.assign(state, fresh);
      sendStates();
    });

    socket.on('clue:ask', ({ circle }) => {
      const passed = G.checkClue(state, circle);
      state.log.push('Pista en ' + circle + ': ' + (passed ? 'SÍ' : 'no'));
      io.emit('clue:result', { circle, passed });
      const jid = jackSocketId();
      if (jid) io.to(jid).emit('clue:asked', { circle });
      sendStates();
    });
    socket.on('arrest', ({ circle }) => {
      const caught = G.checkArrest(state, circle);
      state.log.push('¡Arresto en ' + circle + '! ' + (caught ? 'ATRAPADO' : 'fallido'));
      io.emit('arrest:result', { circle, caught });
      if (caught) G.endGame(state, 'Policía');
      const jid = jackSocketId();
      if (jid) io.to(jid).emit('arrest:attempt', { circle });
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
