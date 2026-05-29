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

test('upsertToken agrega y actualiza por id', () => {
  const s = G.createGame();
  G.upsertToken(s, { id: 'det1', type: 'detective', x: 10, y: 20, label: '1' });
  assert.strictEqual(s.tokens.length, 1);
  G.upsertToken(s, { id: 'det1', type: 'detective', x: 30, y: 40, label: '1' });
  assert.strictEqual(s.tokens.length, 1);
  assert.strictEqual(s.tokens[0].x, 30);
});
test('moveToken cambia coordenadas', () => {
  const s = G.createGame();
  G.upsertToken(s, { id: 'crime', type: 'crime', x: 0, y: 0, label: '' });
  G.moveToken(s, 'crime', 55, 66);
  assert.strictEqual(s.tokens[0].x, 55);
  assert.strictEqual(s.tokens[0].y, 66);
});
test('removeToken elimina por id', () => {
  const s = G.createGame();
  G.upsertToken(s, { id: 'clue1', type: 'clue', x: 1, y: 2, label: '' });
  G.removeToken(s, 'clue1');
  assert.strictEqual(s.tokens.length, 0);
});
