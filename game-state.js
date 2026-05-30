const CARRIAGES_PER_NIGHT = 2;
const ALLEYS_PER_NIGHT = 3;
const TOTAL_NIGHTS = 4;
const MOVES_PER_NIGHT = 15;

function createGame() {
  return {
    game: { night: 1, phase: 'lobby', jackMoves: 0, turn: 'jack', mode: 'manual' },
    players: {},
    tokens: [],
    jack: { lair: null, path: [], carriages: CARRIAGES_PER_NIGHT, alleys: ALLEYS_PER_NIGHT },
    ref: { jackCircle: null, police: {} },
    log: [],
  };
}
function setMode(state, mode) {
  const m = (mode === 'referee') ? 'referee' : 'manual';
  if (state.game.mode === m && state.ref) return; // sin cambios: no borrar posiciones
  state.game.mode = m;
  state.ref = { jackCircle: null, police: {} };
}
function addPlayer(state, socketId, name, role) {
  if (!name || !name.trim()) return { ok: false, reason: 'nombre requerido' };
  name = name.trim();

  // Reconexión: buscar si ya existe un jugador con este nombre
  const existing = Object.entries(state.players).find(([, p]) => p.name === name);
  if (existing) {
    const [oldId, p] = existing;
    // Si ya existe, movemos su estado al nuevo socketId
    delete state.players[oldId];
    state.players[socketId] = { ...p, socketId, disconnected: false };
    return { ok: true, role: p.role };
  }

  // Unicidad de rol: Jack y Detectives son únicos. Espectadores no.
  if (role === 'jack' || (role && role.startsWith('det'))) {
    const taken = Object.values(state.players).some((p) => p.role === role);
    if (taken) return { ok: false, reason: 'rol ya ocupado' };
  }

  state.players[socketId] = { name, role, disconnected: false };
  return { ok: true, role };
}
function removePlayer(state, socketId) {
  if (state.players[socketId]) {
    state.players[socketId].disconnected = true;
  }
}

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

function setLair(state, circle) { state.jack.lair = Number(circle); }
function logJackStep(state, circle, special) {
  if (state.game.jackMoves >= MOVES_PER_NIGHT) return;
  state.game.jackMoves += 1;
  state.jack.path.push({ step: state.game.jackMoves, circle: Number(circle), special: special || null });
  if (special === 'carriage') {
    state.jack.carriages = Math.max(0, state.jack.carriages - 1);
    state.log.push('Jack usó un carruaje');
  } else if (special === 'alley') {
    state.jack.alleys = Math.max(0, state.jack.alleys - 1);
    state.log.push('Jack usó un callejón');
  }
}

function getJackCircle(state) {
  const p = state.jack.path; return p.length ? p[p.length - 1].circle : null;
}
function checkClue(state, circle) { return state.jack.path.some((p) => p.circle === Number(circle)); }
function checkArrest(state, circle) { return getJackCircle(state) === Number(circle); }
// Jack está en su guarida si ya fijó una y su posición actual coincide con ella.
function checkLairReached(state) {
  return state.jack.lair != null && getJackCircle(state) === state.jack.lair;
}

function startCrimePrep(state) { state.game.phase = 'crime-prep'; }
function startCrime(state, circle) {
  state.game.phase = 'hunt';
  state.game.jackMoves = 0;
  state.game.turn = 'jack';
  state.jack.path = [{ step: 0, circle: Number(circle), special: null }];
  state.log.push('Comienza la caza: crimen en ' + circle);
}
function nextNight(state) {
  state.game.night += 1;
  state.game.phase = 'crime-prep';
  state.game.jackMoves = 0;
  state.game.turn = 'jack';
  state.jack.path = [];
  state.jack.carriages = CARRIAGES_PER_NIGHT;
  state.jack.alleys = ALLEYS_PER_NIGHT;
  state.log.push('Noche ' + state.game.night);
}
function endGame(state, winner) {
  state.game.phase = 'ended';
  state.log.push('Fin de la partida. Ganador: ' + winner);
}

function viewFor(state, role) {
  const view = { game: state.game, players: state.players, tokens: state.tokens, log: state.log };
  if (role === 'jack') view.jack = state.jack;
  else view.jack = { carriages: state.jack.carriages, alleys: state.jack.alleys };
  view.ref = { police: state.ref ? state.ref.police : {} };
  if (role === 'jack' && state.ref) view.ref.jackCircle = state.ref.jackCircle;
  return view;
}

module.exports = { CARRIAGES_PER_NIGHT, ALLEYS_PER_NIGHT, TOTAL_NIGHTS, MOVES_PER_NIGHT, createGame, setMode, addPlayer, removePlayer, upsertToken, moveToken, removeToken, setLair, logJackStep, getJackCircle, checkClue, checkArrest, checkLairReached, startCrimePrep, startCrime, nextNight, endGame, viewFor };
