const B = require('./board-graph');
const G = require('./game-state');

const ALLEY_RADIUS = 9; // % de distancia en el mapa (callejón simplificado)

function dist(a, b) {
  const na = B.node(a), nb = B.node(b);
  return Math.hypot(na.x - nb.x, na.y - nb.y);
}
function occupiedSquares(state) { return new Set(Object.values(state.ref.police)); }

function startCrimeAt(state, circle) {
  if (B.node(circle) == null || B.node(circle).type !== 'circle') return { ok: false, reason: 'círculo inválido' };
  state.ref.jackCircle = circle;
  G.startCrime(state, circle);
  state.game.turn = 'jack';           // la caza empieza moviendo Jack
  state.ref.moved = {}; state.ref.acted = {};
  return { ok: true };
}

// Cuadrados libres para la primera colocación de un policía (cualquiera no ocupado).
function placementSquares(state) {
  const occ = occupiedSquares(state);
  return B.data.nodes.filter((n) => n.type === 'square' && !occ.has(n.id)).map((n) => n.id);
}
function endPoliceTurn(state) {
  state.game.turn = 'jack';
  state.ref.moved = {}; state.ref.acted = {};
}
// ¿Han actuado ya todos los roles detective presentes? (la lista la da el servidor).
function allPoliceActed(state, detRoles) {
  return detRoles.length > 0 && detRoles.every((r) => state.ref.acted[r]);
}

function legalNormalTargets(state) {
  const from = state.ref.jackCircle;
  const occ = occupiedSquares(state);
  return B.neighbors(from).filter((n) => n.via == null || !occ.has(n.via)).map((n) => n.circle);
}
function legalCarriageTargets(state) {
  const from = state.ref.jackCircle;
  const set = new Set();
  // El carruaje es la jugada de escape de Jack: avanza 2 círculos en un turno y,
  // su gran ventaja, PUEDE cruzar cuadrados ocupados por la policía (Whitechapel.md).
  // Por eso NO se filtran los cuadrados bloqueados: cualquier destino a 2 saltos
  // es legal, lo bloqueen o no.
  for (const n of B.neighbors(from)) {
    for (const m of B.neighbors(n.circle)) {
      if (m.circle !== from) set.add(m.circle);
    }
  }
  return [...set];
}
function legalAlleyTargets(state) {
  const from = state.ref.jackCircle;
  const normal = new Set(B.neighbors(from).map((n) => n.circle));
  const out = [];
  for (let i = 0; i < B.data.meta.circles; i++) {
    if (i !== from && !normal.has(i) && dist(from, i) <= ALLEY_RADIUS) out.push(i);
  }
  return out;
}

function moveJack(state, circle, kind) {
  if (state.ref.jackCircle == null) return { ok: false, reason: 'sin posición' };
  if (state.game.turn !== 'jack') return { ok: false, reason: 'no es el turno de Jack' };
  if (G.movesExhausted(state)) return { ok: false, reason: 'se agotó la noche (15 movimientos)' };
  let legal, special = null;
  if (kind === 'carriage') {
    if (state.jack.carriages <= 0) return { ok: false, reason: 'sin carruajes' };
    legal = legalCarriageTargets(state); special = 'carriage';
  } else if (kind === 'alley') {
    if (state.jack.alleys <= 0) return { ok: false, reason: 'sin callejones' };
    legal = legalAlleyTargets(state); special = 'alley';
  } else {
    legal = legalNormalTargets(state);
  }
  if (!legal.includes(circle)) return { ok: false, reason: kind === 'normal' ? 'movimiento ilegal o bloqueado' : 'destino fuera de alcance' };
  G.logJackStep(state, circle, special);
  state.ref.jackCircle = circle;
  // Tras mover Jack, juega la policía (y se reinician sus marcas de turno).
  state.game.turn = 'police';
  state.ref.moved = {}; state.ref.acted = {};
  return { ok: true };
}

function reachableSquares(state, from, steps) {
  const occ = occupiedSquares(state);
  const seen = new Set([from]); let frontier = [from];
  for (let i = 0; i < steps; i++) {
    const next = [];
    for (const s of frontier) for (const n of B.squareNeighbors(s)) if (!seen.has(n)) { seen.add(n); next.push(n); }
    frontier = next;
  }
  seen.delete(from);
  return [...seen].filter((s) => !occ.has(s));
}

function movePolice(state, who, square) {
  if (state.game.turn !== 'police') return { ok: false, reason: 'no es el turno de la policía' };
  if (state.ref.moved[who]) return { ok: false, reason: 'ese detective ya se movió este turno' };
  const from = state.ref.police[who];
  if (from == null) {
    // Primera colocación: cualquier cuadrado no ocupado.
    if (occupiedSquares(state).has(square)) return { ok: false, reason: 'cuadrado ocupado' };
    state.ref.police[who] = square; state.ref.moved[who] = true; return { ok: true };
  }
  if (!reachableSquares(state, from, 2).includes(square)) return { ok: false, reason: 'fuera de alcance o cuadrado ocupado' };
  state.ref.police[who] = square; state.ref.moved[who] = true;
  return { ok: true };
}

function circlesAroundPolice(state, who) {
  const sq = state.ref.police[who];
  if (sq == null) return [];
  // Los círculos directamente conectados a la esquina donde está el policía.
  return B.squareCircles(sq);
}

function searchClue(state, who, circle) {
  if (state.game.turn !== 'police') return { ok: false, reason: 'no es el turno de la policía' };
  if (state.ref.acted[who]) return { ok: false, reason: 'ese detective ya actuó este turno' };
  if (!circlesAroundPolice(state, who).includes(circle)) return { ok: false, reason: 'círculo no adyacente' };
  // Las pistas marcan por dónde PASÓ Jack, no dónde ESTÁ ahora: una búsqueda
  // sobre su círculo actual no revela nada.
  const passed = circle !== state.ref.jackCircle && G.checkClue(state, circle);
  state.ref.acted[who] = true;
  state.log.push('Pista en ' + circle + ': ' + (passed ? 'SÍ' : 'no'));
  return { ok: true, passed };
}

function arrest(state, who, circle) {
  if (state.game.turn !== 'police') return { ok: false, reason: 'no es el turno de la policía' };
  if (state.ref.acted[who]) return { ok: false, reason: 'ese detective ya actuó este turno' };
  if (!circlesAroundPolice(state, who).includes(circle)) return { ok: false, reason: 'círculo no adyacente' };
  const caught = G.checkArrest(state, circle);
  state.ref.acted[who] = true;
  if (caught) G.endGame(state, 'Policía');
  return { ok: true, caught };
}

module.exports = { ALLEY_RADIUS, startCrimeAt, moveJack, movePolice, searchClue, arrest,
  endPoliceTurn, allPoliceActed, placementSquares,
  legalNormalTargets, legalCarriageTargets, legalAlleyTargets, reachableSquares, circlesAroundPolice };
