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

test('setLair guarda la guarida', () => {
  const s = G.createGame(); G.setLair(s, 42); assert.strictEqual(s.jack.lair, 42);
});
test('logJackStep registra paso e incrementa jackMoves', () => {
  const s = G.createGame(); G.logJackStep(s, 100, null);
  assert.strictEqual(s.game.jackMoves, 1);
  assert.deepStrictEqual(s.jack.path[0], { step: 1, circle: 100, special: null });
});
test('logJackStep con carruaje descuenta el contador y registra en log', () => {
  const s = G.createGame(); G.logJackStep(s, 50, 'carriage');
  assert.strictEqual(s.jack.carriages, 1);
  assert.ok(s.log.some((l) => l.includes('carruaje')));
});
test('logJackStep con callejón descuenta el contador', () => {
  const s = G.createGame(); G.logJackStep(s, 51, 'alley');
  assert.strictEqual(s.jack.alleys, 2);
  assert.ok(s.log.some((l) => l.includes('callejón')));
});
test('los contadores no bajan de cero', () => {
  const s = G.createGame();
  G.logJackStep(s, 1, 'carriage'); G.logJackStep(s, 2, 'carriage'); G.logJackStep(s, 3, 'carriage');
  assert.strictEqual(s.jack.carriages, 0);
});

test('getJackCircle devuelve la posición actual o null', () => {
  const s = G.createGame();
  assert.strictEqual(G.getJackCircle(s), null);
  G.logJackStep(s, 7, null); G.logJackStep(s, 8, null);
  assert.strictEqual(G.getJackCircle(s), 8);
});
test('checkClue es verdadero si Jack pasó por el círculo', () => {
  const s = G.createGame();
  G.logJackStep(s, 7, null); G.logJackStep(s, 8, null);
  assert.strictEqual(G.checkClue(s, 7), true);
  assert.strictEqual(G.checkClue(s, 99), false);
});
test('checkArrest solo es verdadero en la posición actual', () => {
  const s = G.createGame();
  G.logJackStep(s, 7, null); G.logJackStep(s, 8, null);
  assert.strictEqual(G.checkArrest(s, 8), true);
  assert.strictEqual(G.checkArrest(s, 7), false);
});
