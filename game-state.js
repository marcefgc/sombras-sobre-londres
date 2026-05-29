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

function upsertToken(state, token) {
  const i = state.tokens.findIndex((t) => t.id === token.id);
  if (i >= 0) state.tokens[i] = { ...state.tokens[i], ...token };
  else state.tokens.push({ ...token });
}
function moveToken(state, id, x, y) {
  const t = state.tokens.find((t) => t.id === id);
  if (t) { t.x = x; t.y = y; }
}
function removeToken(state, id) { state.tokens = state.tokens.filter((t) => t.id !== id); }

module.exports = { CARRIAGES_PER_NIGHT, ALLEYS_PER_NIGHT, createGame, addPlayer, removePlayer, upsertToken, moveToken, removeToken };
