const { test } = require('node:test');
const assert = require('node:assert');
const G = require('../game-state');

test('createGame tiene valores por defecto', () => {
  const s = G.createGame();
  assert.strictEqual(s.game.night, 1);
  assert.strictEqual(s.game.phase, 'lobby');
  assert.strictEqual(s.game.jackMoves, 0);
  assert.deepStrictEqual(s.tokens, []);
  assert.deepStrictEqual(s.log, []);
  assert.strictEqual(s.jack.lair, null);
  assert.deepStrictEqual(s.jack.path, []);
  assert.strictEqual(s.jack.carriages, 2);
  assert.strictEqual(s.jack.alleys, 3);
});

test('addPlayer y removePlayer', () => {
  const s = G.createGame();
  G.addPlayer(s, 'sock1', 'Ana', 'det1');
  assert.deepStrictEqual(s.players['sock1'], { name: 'Ana', role: 'det1' });
  G.removePlayer(s, 'sock1');
  assert.strictEqual(s.players['sock1'], undefined);
});
