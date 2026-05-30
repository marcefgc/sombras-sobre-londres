const { test } = require('node:test');
const assert = require('node:assert');
const G = require('../game-state');
const R = require('../referee');

test('Jack cannot move more than 15 times', () => {
  const s = G.createGame();
  G.setMode(s, 'referee');
  R.startCrimeAt(s, 188); // crime at 188
  // 188 neighbors: 19(null)
  // 19 neighbors: 188(null), 33(228), 43(228), 44(226), 5(225), 8(225)

  for (let i = 0; i < 15; i++) {
    const from = i === 0 ? 188 : (i % 2 === 1 ? 19 : 188);
    const to = i % 2 === 0 ? 19 : 188;
    s.ref.jackCircle = from;
    const res = R.moveJack(s, to, 'normal');
    assert.ok(res.ok, `Move ${i+1} should be ok`);
  }

  // 16th move
  const res16 = R.moveJack(s, 19, 'normal');
  assert.strictEqual(res16.ok, false);
  assert.strictEqual(res16.reason, 'límite de movimientos alcanzado');
  assert.strictEqual(s.game.jackMoves, 15);
});

test('Role uniqueness for Jack', () => {
  const s = G.createGame();
  const r1 = G.addPlayer(s, 'sock1', 'Jack1', 'jack');
  assert.ok(r1.ok);

  const r2 = G.addPlayer(s, 'sock2', 'Jack2', 'jack');
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.reason, 'rol ya ocupado');
});

test('Reconnection by name', () => {
  const s = G.createGame();
  G.addPlayer(s, 'sock1', 'Ana', 'jack');
  G.removePlayer(s, 'sock1');
  assert.strictEqual(s.players['sock1'].disconnected, true);

  const r2 = G.addPlayer(s, 'sock2', 'Ana', 'jack');
  assert.ok(r2.ok);
  assert.strictEqual(r2.role, 'jack');
  assert.strictEqual(s.players['sock1'], undefined);
  assert.strictEqual(s.players['sock2'].name, 'Ana');
  assert.strictEqual(s.players['sock2'].role, 'jack');
  assert.strictEqual(s.players['sock2'].disconnected, false);
});

test('Carriage move blocked by police on intermediate square', () => {
  const s = G.createGame();
  G.setMode(s, 'referee');
  s.ref.jackCircle = 19;
  // 19 neighbors: 188(null), 33(228), 43(228), 44(226), 5(225), 8(225)
  // Target 35 is neighbor of 33 via null, or neighbor of 30 via null.
  // 33 is neighbor of 19 via 228.
  // Let's block 228.
  s.ref.police['det1'] = 228;

  const targets = R.legalCarriageTargets(s);
  // Targets reachable from 19 via 33 or 43 (both via 228) should be filtered out
  // unless they are reachable via another path.
  // 19 -> 5(225) -> 24(226) etc.
  assert.ok(!targets.includes(35), '35 should be blocked because intermediate square 228 is occupied');
});

test('Crime validation in manual mode (via server simulation logic)', () => {
    // We'll just test the R.B.node check we added
    assert.ok(R.B.node(1) !== null && R.B.node(1).type === 'circle');
    assert.ok(R.B.node(999) == null);
    assert.ok(R.B.node(195).type !== 'circle'); // 195 is a square
});
