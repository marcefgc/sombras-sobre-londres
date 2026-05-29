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

  function sendStates() {
    for (const [id, p] of Object.entries(state.players)) {
      io.to(id).emit('state', G.viewFor(state, p.role));
    }
  }

  io.on('connection', (socket) => {
    function roleOf() { return state.players[socket.id] && state.players[socket.id].role; }
    function jackSocketId() {
      const e = Object.entries(state.players).find(([, p]) => p.role === 'jack');
      return e ? e[0] : null;
    }

    socket.on('join', ({ name, role }) => {
      G.addPlayer(state, socket.id, name, role);
      socket.emit('state', G.viewFor(state, role));
      sendStates();
    });

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
