const CARRIAGES_PER_NIGHT = 2;
const ALLEYS_PER_NIGHT = 3;

function createGame() {
  return {
    game: { night: 1, phase: 'lobby', jackMoves: 0, turn: 'jack' },
    players: {},
    tokens: [],
    jack: { lair: null, path: [], carriages: CARRIAGES_PER_NIGHT, alleys: ALLEYS_PER_NIGHT },
    log: [],
  };
}
function addPlayer(state, socketId, name, role) { state.players[socketId] = { name, role }; }
function removePlayer(state, socketId) { delete state.players[socketId]; }

module.exports = { CARRIAGES_PER_NIGHT, ALLEYS_PER_NIGHT, createGame, addPlayer, removePlayer };
