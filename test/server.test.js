const { test } = require('node:test');
const assert = require('node:assert');
const { io: Client } = require('socket.io-client');
const { createServer } = require('../server');
const B = require('../board-graph');

// One-shot result events (clue:result / arrest:result) are emitted exactly once
// in response to a request, so `once` is safe for them.
function once(socket, event) { return new Promise((resolve) => socket.once(event, resolve)); }

// 'state' events can arrive batched in a single network read; a bare
// `socket.once('state')` would catch the first and drop the rest, racing with
// the test's re-registration. This persistent accumulator keeps the latest
// state and resolves waiters against a predicate, so no state is ever missed.
function stateWaiter(socket) {
  let latest;
  const pending = [];
  socket.on('state', (s) => {
    latest = s;
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].pred(s)) { pending[i].resolve(s); pending.splice(i, 1); }
    }
  });
  return {
    get latest() { return latest; },
    wait(pred = () => true) {
      if (latest !== undefined && pred(latest)) return Promise.resolve(latest);
      return new Promise((resolve) => pending.push({ pred, resolve }));
    },
  };
}

test('un detective que se une NUNCA recibe la guarida ni la ruta de Jack', async () => {
  const { server, state, G } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  G.setLair(state, 42);
  G.logJackStep(state, 7, null);
  const det = Client(`http://localhost:${port}`);
  const detW = stateWaiter(det);
  det.emit('join', { name: 'Ana', role: 'det1' });
  const view = await detW.wait();
  assert.strictEqual(view.jack.lair, undefined);
  assert.strictEqual(view.jack.path, undefined);
  assert.strictEqual(view.tokens.length >= 0, true);
  det.close();
  await new Promise((r) => server.close(r));
});

test('moveToken se propaga a otro cliente', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const a = Client(`http://localhost:${port}`);
  const b = Client(`http://localhost:${port}`);
  const bW = stateWaiter(b);
  a.emit('join', { name: 'A', role: 'det1' });
  b.emit('join', { name: 'B', role: 'spectator' });
  await bW.wait();
  a.emit('addToken', { id: 'd1', type: 'detective', x: 0, y: 0, label: '1' });
  a.emit('moveToken', { id: 'd1', x: 80, y: 90 });
  const view = await bW.wait((s) => s.tokens.find((t) => t.id === 'd1' && t.x === 80));
  const t = view.tokens.find((t) => t.id === 'd1');
  assert.strictEqual(t.y, 90);
  a.close(); b.close();
  await new Promise((r) => server.close(r));
});

test('jack:setLair y jack:logStep solo afectan la vista de Jack', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const jack = Client(`http://localhost:${port}`);
  const jackW = stateWaiter(jack);
  jack.emit('join', { name: 'J', role: 'jack' });
  await jackW.wait();
  jack.emit('jack:setLair', { circle: 99 });
  jack.emit('jack:logStep', { circle: 10, special: null });
  const view = await jackW.wait((s) => s.jack && s.jack.lair === 99);
  assert.strictEqual(view.jack.path[0].circle, 10);
  jack.close();
  await new Promise((r) => server.close(r));
});

test('clue:ask devuelve resultado autoritativo y notifica a Jack', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const jack = Client(`http://localhost:${port}`);
  const det = Client(`http://localhost:${port}`);
  const detW = stateWaiter(det);
  jack.emit('join', { name: 'J', role: 'jack' });
  det.emit('join', { name: 'D', role: 'det1' });
  await detW.wait();
  jack.emit('jack:logStep', { circle: 32, special: null });
  await detW.wait((s) => s.game.jackMoves >= 1); // el servidor ya registró el paso
  det.emit('clue:ask', { circle: 32 });
  const result = await once(det, 'clue:result');
  assert.strictEqual(result.circle, 32);
  assert.strictEqual(result.passed, true);
  jack.close(); det.close();
  await new Promise((r) => server.close(r));
});

test('arrest acertado termina la partida con victoria policial', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const jack = Client(`http://localhost:${port}`);
  const det = Client(`http://localhost:${port}`);
  const detW = stateWaiter(det);
  jack.emit('join', { name: 'J', role: 'jack' });
  det.emit('join', { name: 'D', role: 'det1' });
  await detW.wait();
  jack.emit('jack:logStep', { circle: 12, special: null });
  await detW.wait((s) => s.game.jackMoves >= 1);
  det.emit('arrest', { circle: 12 });
  const res = await once(det, 'arrest:result');
  assert.strictEqual(res.caught, true);
  const view = await detW.wait((s) => s.game.phase === 'ended');
  assert.strictEqual(view.game.phase, 'ended');
  jack.close(); det.close();
  await new Promise((r) => server.close(r));
});

test('jack:reachedLair avanza la noche y, en la noche 4, hace ganar a Jack', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const jack = Client(`http://localhost:${port}`);
  const jackW = stateWaiter(jack);
  jack.emit('join', { name: 'J', role: 'jack' });
  await jackW.wait();
  jack.emit('jack:setLair', { circle: 7 });

  // Noche 1: comete crimen y llega a la guarida -> debe avanzar a la noche 2.
  jack.emit('phase:startCrime', { circle: 7 }); // crimen en la propia guarida = ya está allí
  const r1 = await new Promise((res) => { jack.once('lair:result', res); jack.emit('jack:reachedLair'); });
  assert.strictEqual(r1.reached, true);
  assert.strictEqual(r1.won, false);
  await jackW.wait((s) => s.game.night === 2);

  // Saltar a la noche 4.
  jack.emit('phase:nextNight'); // noche 3
  jack.emit('phase:nextNight'); // noche 4
  await jackW.wait((s) => s.game.night === 4);
  jack.emit('phase:startCrime', { circle: 7 });
  const r4 = await new Promise((res) => { jack.once('lair:result', res); jack.emit('jack:reachedLair'); });
  assert.strictEqual(r4.reached, true);
  assert.strictEqual(r4.won, true);
  const end = await jackW.wait((s) => s.game.phase === 'ended');
  assert.ok(end.log.some((l) => l.includes('Jack')));
  jack.close();
  await new Promise((r) => server.close(r));
});

test('phase:dawn termina con victoria policial', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const det = Client(`http://localhost:${port}`);
  const detW = stateWaiter(det);
  det.emit('join', { name: 'D', role: 'det1' });
  await detW.wait();
  det.emit('phase:dawn');
  const v = await detW.wait((s) => s.game.phase === 'ended');
  assert.ok(v.log.some((l) => l.includes('Policía')));
  det.close();
  await new Promise((r) => server.close(r));
});

test('setMode referee se propaga y bloquea info privada del asesino', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const jack = Client(`http://localhost:${port}`);
  const det = Client(`http://localhost:${port}`);
  const jackW = stateWaiter(jack), detW = stateWaiter(det);
  jack.emit('join', { name: 'J', role: 'jack' });
  det.emit('join', { name: 'D', role: 'det1' });
  await jackW.wait(); await detW.wait();
  jack.emit('setMode', { mode: 'referee' });
  const c = B.data.crimeStarts[0];
  jack.emit('ref:startCrime', { circle: c });
  const jv = await jackW.wait((s) => s.ref && s.ref.jackCircle === c);
  assert.strictEqual(jv.game.mode, 'referee');
  const dv = await detW.wait((s) => s.game.mode === 'referee');
  assert.strictEqual(dv.ref.jackCircle, undefined);
  jack.close(); det.close();
  await new Promise((r) => server.close(r));
});

test('Jack en referee recibe destinos legales en su vista', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const jack = Client(`http://localhost:${port}`);
  const jackW = stateWaiter(jack);
  jack.emit('join', { name: 'J', role: 'jack' });
  await jackW.wait();
  jack.emit('setMode', { mode: 'referee' });
  const c = B.data.crimeStarts[0];
  jack.emit('ref:startCrime', { circle: c });
  const jv = await jackW.wait((s) => s.ref && s.ref.legal && s.ref.legal.normal);
  assert.ok(Array.isArray(jv.ref.legal.normal));
  assert.ok(jv.ref.legal.normal.length > 0);
  jack.close();
  await new Promise((r) => server.close(r));
});

test('ref:moveJack ilegal es rechazado con motivo', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const jack = Client(`http://localhost:${port}`);
  const jackW = stateWaiter(jack);
  jack.emit('join', { name: 'J', role: 'jack' });
  await jackW.wait();
  jack.emit('setMode', { mode: 'referee' });
  const c = B.data.crimeStarts[0];
  jack.emit('ref:startCrime', { circle: c });
  await jackW.wait((s) => s.ref.jackCircle === c);
  const rej = await new Promise((res) => { jack.once('ref:rejected', res); jack.emit('ref:moveJack', { circle: 99999, kind: 'normal' }); });
  assert.ok(rej.reason);
  jack.close();
  await new Promise((r) => server.close(r));
});

test('ref:search en referee resuelve pista automáticamente', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const jack = Client(`http://localhost:${port}`);
  const det = Client(`http://localhost:${port}`);
  const jackW = stateWaiter(jack), detW = stateWaiter(det);
  jack.emit('join', { name: 'J', role: 'jack' });
  det.emit('join', { name: 'D', role: 'det1' });
  await jackW.wait(); await detW.wait();
  jack.emit('setMode', { mode: 'referee' });
  const c = B.data.crimeStarts[0];
  jack.emit('ref:startCrime', { circle: c });
  await detW.wait((s) => s.ref && s.ref.jackCircle === undefined && s.game.mode === 'referee');
  // coloca al policía en un cuadrado adyacente al círculo del crimen
  const via = B.neighbors(c).find((n) => n.via != null);
  if (via) {
    det.emit('ref:movePolice', { square: via.via });
    await detW.wait((s) => s.ref.police['det1'] === via.via);
    const res = await new Promise((r) => { det.once('clue:result', r); det.emit('ref:search', { circle: c }); });
    assert.strictEqual(res.circle, c);
    assert.strictEqual(res.passed, true);
  }
  jack.close(); det.close();
  await new Promise((r) => server.close(r));
});
