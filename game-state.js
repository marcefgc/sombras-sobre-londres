const CARRIAGES_PER_NIGHT = 2;
const ALLEYS_PER_NIGHT = 3;
const TOTAL_NIGHTS = 4;
const MOVES_PER_NIGHT = 15;

// La noche se agota cuando Jack consumió sus 15 movimientos (el crimen es el
// paso 0 y no cuenta). A partir de aquí no puede moverse más: o llegó a su
// guarida o amanece y gana la policía.
function movesExhausted(state) { return state.game.jackMoves >= MOVES_PER_NIGHT; }

// Los cinco colores de la policía. Cada color es una ficha; un jugador-policía
// controla uno o varios colores.
const POLICE_COLORS = ['blue', 'green', 'red', 'yellow', 'purple'];

function createGame() {
  return {
    game: { night: 1, phase: 'lobby', jackMoves: 0, turn: 'jack', mode: 'manual' },
    players: {},
    // Reservas por NOMBRE (persisten tras desconexión para permitir reconexión y
    // evitar que otro se apropie del rol/color). jackName: quién es Jack;
    // colorOwners: qué jugador posee cada ficha de color.
    jackName: null,
    colorOwners: { blue: null, green: null, red: null, yellow: null, purple: null },
    tokens: [],
    jack: { lair: null, path: [], carriages: CARRIAGES_PER_NIGHT, alleys: ALLEYS_PER_NIGHT },
    // ref: estado del modo Aprendizaje. police/moved/acted se indexan por COLOR.
    ref: { jackCircle: null, police: {}, moved: {}, acted: {} },
    log: [],
  };
}
function setMode(state, mode) {
  const m = (mode === 'referee') ? 'referee' : 'manual';
  if (state.game.mode === m && state.ref) return; // sin cambios: no borrar posiciones
  state.game.mode = m;
  state.ref = { jackCircle: null, police: {}, moved: {}, acted: {} };
}
// Devuelve { ok } o { ok:false, reason }. Valida nombre, unicidad de Jack y de
// cada color, y reconexión por nombre. `colors` solo aplica al rol 'police'.
function addPlayer(state, socketId, name, role, colors) {
  const clean = String(name == null ? '' : name).trim();
  if (!clean) return { ok: false, reason: 'nombre requerido' };
  if (role === 'jack') {
    if (state.jackName != null && state.jackName !== clean) return { ok: false, reason: 'rol ya ocupado' };
    state.jackName = clean;
    state.players[socketId] = { name: clean, role: 'jack', colors: [] };
    return { ok: true };
  }
  if (role === 'police') {
    const req = (Array.isArray(colors) ? colors : []).filter((c) => POLICE_COLORS.includes(c));
    if (req.length === 0) return { ok: false, reason: 'elige al menos un color' };
    for (const c of req) {
      const owner = state.colorOwners[c];
      if (owner != null && owner !== clean) return { ok: false, reason: 'color ya ocupado: ' + c };
    }
    for (const c of req) state.colorOwners[c] = clean;
    state.players[socketId] = { name: clean, role: 'police', colors: req };
    return { ok: true };
  }
  // Espectador: sin reservas.
  state.players[socketId] = { name: clean, role: 'spectator', colors: [] };
  return { ok: true };
}
// No se borran las reservas (jackName/colorOwners): así el mismo nombre puede
// reconectar y nadie más puede tomar ese rol/color mientras la partida sigue.
function removePlayer(state, socketId) { delete state.players[socketId]; }
// Colores que están en juego (reclamados por algún policía conectado).
function activeColors(state) {
  const set = new Set();
  for (const p of Object.values(state.players)) if (p.role === 'police') for (const c of p.colors) set.add(c);
  return [...set];
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

module.exports = { CARRIAGES_PER_NIGHT, ALLEYS_PER_NIGHT, TOTAL_NIGHTS, MOVES_PER_NIGHT, POLICE_COLORS, createGame, setMode, addPlayer, removePlayer, activeColors, upsertToken, moveToken, removeToken, setLair, logJackStep, movesExhausted, getJackCircle, checkClue, checkArrest, checkLairReached, startCrimePrep, startCrime, nextNight, endGame, viewFor };
