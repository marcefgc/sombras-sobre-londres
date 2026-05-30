const { test } = require('node:test');
const assert = require('node:assert');
const G = require('../game-state');
const B = require('../board-graph');
const R = require('../referee');

function refGame() { const s = G.createGame(); G.setMode(s, 'referee'); return s; }

test('startCrimeAt fija posición del asesino y paso 0', () => {
  const s = refGame();
  const c = B.data.crimeStarts[0];
  const r = R.startCrimeAt(s, c);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.ref.jackCircle, c);
  assert.strictEqual(s.jack.path[0].circle, c);
  assert.strictEqual(s.game.phase, 'hunt');
});

test('moveJack normal acepta vecino y rechaza no-vecino', () => {
  const s = refGame();
  const c = B.data.crimeStarts[0];
  R.startCrimeAt(s, c);
  const nb = B.neighbors(c)[0].circle;
  assert.strictEqual(R.moveJack(s, nb, 'normal').ok, true);
  assert.strictEqual(s.ref.jackCircle, nb);
  let far = 0; while (far === nb || B.isAdjacent(nb, far)) far++;
  assert.strictEqual(R.moveJack(s, far, 'normal').ok, false);
});

test('moveJack normal se bloquea si un policía ocupa el cuadrado via', () => {
  const s = refGame();
  let from = -1, to = -1, via = null;
  for (let i = 0; i < 195 && from < 0; i++) {
    for (const n of B.neighbors(i)) if (n.via != null) { from = i; to = n.circle; via = n.via; break; }
  }
  R.startCrimeAt(s, from);
  s.ref.police['det1'] = via;
  const r = R.moveJack(s, to, 'normal');
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /bloque/i);
});

test('moveJack carruaje cruza bloqueo y llega a 2 saltos', () => {
  const s = refGame();
  let from = -1, to = -1, via = null;
  for (let i = 0; i < 195 && from < 0; i++) {
    for (const n of B.neighbors(i)) if (n.via != null) { from = i; to = n.circle; via = n.via; break; }
  }
  R.startCrimeAt(s, from);
  s.ref.police['det1'] = via;
  assert.strictEqual(R.moveJack(s, to, 'carriage').ok, true);
  assert.strictEqual(s.jack.carriages, 1);
});

test('movePolice valida distancia <=2 y no terminar sobre otro policía', () => {
  const s = refGame();
  const sq = +Object.keys(B.data.squareAdj).find((k) => B.squareNeighbors(+k).length > 0);
  const adjSq = B.squareNeighbors(sq)[0];
  s.ref.police['det1'] = sq;
  assert.strictEqual(R.movePolice(s, 'det1', adjSq).ok, true);
  assert.strictEqual(s.ref.police['det1'], adjSq);
  s.ref.police['det2'] = sq;
  assert.strictEqual(R.movePolice(s, 'det2', adjSq).ok, false);
});

test('searchClue automático coloca pista si el asesino pasó', () => {
  const s = refGame();
  const c = B.data.crimeStarts[0];
  R.startCrimeAt(s, c);
  const via = B.neighbors(c).find((n) => n.via != null);
  if (via) {
    s.ref.police['det1'] = via.via;
    const r = R.searchClue(s, 'det1', c);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.passed, true);
  }
});
