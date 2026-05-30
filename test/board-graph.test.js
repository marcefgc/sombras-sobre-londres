const { test } = require('node:test');
const assert = require('node:assert');
const B = require('../board-graph');

test('estructura básica del grafo', () => {
  assert.strictEqual(B.data.meta.circles, 195);
  assert.strictEqual(B.data.meta.squares, 227);
  assert.strictEqual(B.data.nodes.length, 422);
});

test('coordenadas en rango 0-100', () => {
  for (const n of B.data.nodes) {
    assert.ok(n.x >= 0 && n.x <= 100, 'x ' + n.x);
    assert.ok(n.y >= 0 && n.y <= 100, 'y ' + n.y);
  }
});

test('circleAdj es simétrico y sin círculos aislados', () => {
  for (let i = 0; i < 195; i++) {
    const nb = B.neighbors(i);
    assert.ok(nb.length > 0, 'círculo aislado ' + i);
    for (const { circle } of nb) {
      assert.ok(B.neighbors(circle).some((m) => m.circle === i), 'asimetría ' + i + '-' + circle);
    }
  }
});

test('grafo de círculos es un solo componente conexo', () => {
  const seen = new Set([0]); const q = [0];
  while (q.length) { const c = q.pop(); for (const { circle } of B.neighbors(c)) if (!seen.has(circle)) { seen.add(circle); q.push(circle); } }
  assert.strictEqual(seen.size, 195);
});

test('isAdjacent coincide con neighbors', () => {
  const nb = B.neighbors(0);
  assert.strictEqual(B.isAdjacent(0, nb[0].circle), true);
});

test('crimeStarts son círculos válidos', () => {
  assert.strictEqual(B.data.crimeStarts.length, 8);
  for (const c of B.data.crimeStarts) {
    assert.ok(c >= 0 && c < 195);
    assert.strictEqual(B.data.nodes[c].type, 'circle');
  }
});
