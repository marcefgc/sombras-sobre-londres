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
  det.emit('join', { name: 'Ana', role: 'police', colors: ['blue'] });
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
  a.emit('join', { name: 'A', role: 'police', colors: ['blue'] });
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
  det.emit('join', { name: 'D', role: 'police', colors: ['blue'] });
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
  det.emit('join', { name: 'D', role: 'police', colors: ['blue'] });
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

test('phase:dawn solo termina la partida con la noche agotada en fase de caza', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const jack = Client(`http://localhost:${port}`);
  const det = Client(`http://localhost:${port}`);
  const jackW = stateWaiter(jack), detW = stateWaiter(det);
  jack.emit('join', { name: 'J', role: 'jack' });
  det.emit('join', { name: 'D', role: 'police', colors: ['blue'] });
  await jackW.wait(); await detW.wait();

  // (a) Desde el lobby un detective NO puede declarar el amanecer.
  det.emit('phase:dawn');
  await detW.wait((s) => s.log.some((l) => l.includes('rechaz')));
  assert.notStrictEqual(detW.latest.game.phase, 'ended');

  // Comienza la caza; aún quedan turnos -> el amanecer sigue rechazado.
  jack.emit('phase:startCrime', { circle: 7 });
  await jackW.wait((s) => s.game.phase === 'hunt');
  det.emit('phase:dawn');
  await detW.wait((s) => s.log.filter((l) => l.includes('rechaz')).length >= 2);
  assert.notStrictEqual(detW.latest.game.phase, 'ended');

  // Se agotan los 15 movimientos -> ahora sí gana la policía.
  for (let i = 0; i < 15; i++) jack.emit('jack:logStep', { circle: 8, special: null });
  await jackW.wait((s) => s.game.jackMoves === 15);
  det.emit('phase:dawn');
  const v = await detW.wait((s) => s.game.phase === 'ended');
  assert.ok(v.log.some((l) => l.includes('Policía')));
  jack.close(); det.close();
  await new Promise((r) => server.close(r));
});

test('el servidor impone el límite de 15 movimientos en modo manual', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const jack = Client(`http://localhost:${port}`);
  const jackW = stateWaiter(jack);
  jack.emit('join', { name: 'J', role: 'jack' });
  await jackW.wait();
  jack.emit('phase:startCrime', { circle: 7 });
  await jackW.wait((s) => s.game.phase === 'hunt');
  for (let i = 0; i < 20; i++) jack.emit('jack:logStep', { circle: 8, special: null });
  await jackW.wait((s) => s.game.jackMoves >= 15);
  // Da tiempo a que el servidor procese los 20 intentos y se estabilice en 15.
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(jackW.latest.game.jackMoves, 15);
  jack.close();
  await new Promise((r) => server.close(r));
});

test('phase:nextNight y reset solo los puede ejecutar Jack', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const jack = Client(`http://localhost:${port}`);
  const det = Client(`http://localhost:${port}`);
  const jackW = stateWaiter(jack), detW = stateWaiter(det);
  jack.emit('join', { name: 'J', role: 'jack' });
  det.emit('join', { name: 'D', role: 'police', colors: ['blue'] });
  await jackW.wait(); await detW.wait();
  // Un detective no avanza la noche.
  det.emit('phase:nextNight');
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(jackW.latest.game.night, 1);
  // Jack sí.
  jack.emit('phase:nextNight');
  await jackW.wait((s) => s.game.night === 2);
  assert.strictEqual(jackW.latest.game.night, 2);
  jack.close(); det.close();
  await new Promise((r) => server.close(r));
});

test('join rechaza un segundo jugador en el mismo rol y avisa', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const a = Client(`http://localhost:${port}`);
  const b = Client(`http://localhost:${port}`);
  const aW = stateWaiter(a);
  a.emit('join', { name: 'Ana', role: 'police', colors: ['blue'] });
  await aW.wait();
  const rejected = once(b, 'join:rejected');
  b.emit('join', { name: 'Beto', role: 'police', colors: ['blue'] });
  const r = await rejected;
  assert.ok(r.reason);
  a.close(); b.close();
  await new Promise((r) => server.close(r));
});

test('phase:startCrime manual rechaza un número que no es círculo', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const jack = Client(`http://localhost:${port}`);
  const jackW = stateWaiter(jack);
  jack.emit('join', { name: 'J', role: 'jack' });
  await jackW.wait();
  jack.emit('phase:startCrime', { circle: 99999 }); // no existe en el tablero
  await new Promise((r) => setTimeout(r, 50));
  assert.notStrictEqual(jackW.latest.game.phase, 'hunt');
  jack.close();
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
  det.emit('join', { name: 'D', role: 'police', colors: ['blue'] });
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

test('caza por turnos: la policía solo actúa en su turno, se coloca, busca y auto-finaliza', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const jack = Client(`http://localhost:${port}`);
  const det = Client(`http://localhost:${port}`);
  const jackW = stateWaiter(jack), detW = stateWaiter(det);
  jack.emit('join', { name: 'J', role: 'jack' });
  det.emit('join', { name: 'D', role: 'police', colors: ['blue'] });
  await jackW.wait(); await detW.wait();
  jack.emit('setMode', { mode: 'referee' });
  // crimen en un círculo con vecino conectado por un cuadrado (via)
  let c = -1, n1 = -1, sq = -1;
  for (let i = 0; i < 195 && c < 0; i++) { const e = B.neighbors(i).find((x) => x.via != null); if (e) { c = i; n1 = e.circle; sq = e.via; } }
  jack.emit('ref:startCrime', { circle: c });
  await jackW.wait((s) => s.ref && s.ref.jackCircle === c);
  // Es el turno de Jack: la policía NO puede moverse todavía.
  const rejected = await new Promise((r) => { det.once('ref:rejected', r); det.emit('ref:movePolice', { color: 'blue', square: sq }); });
  assert.match(rejected.reason, /turno de la polic/i);
  assert.strictEqual(detW.latest.game.turn, 'jack');
  // Jack se mueve -> pasa el turno a la policía.
  jack.emit('ref:moveJack', { circle: n1, kind: 'normal' });
  const dv = await detW.wait((s) => s.game.turn === 'police');
  assert.ok(dv.ref.byColor.blue.legalSquares.length > 0); // ya puede colocar su ficha azul
  // La policía coloca su ficha azul y busca pista en el círculo PASADO (c) -> SÍ.
  det.emit('ref:movePolice', { color: 'blue', square: sq });
  await detW.wait((s) => s.ref.police['blue'] === sq);
  const res = await new Promise((r) => { det.once('clue:result', r); det.emit('ref:search', { color: 'blue', circle: c }); });
  assert.strictEqual(res.passed, true);
  // Actuó el único detective -> auto-fin del turno de policía -> vuelve a Jack.
  await jackW.wait((s) => s.game.turn === 'jack');
  jack.close(); det.close();
  await new Promise((r) => server.close(r));
});

test('B2: phase:nextNight se rechaza durante la caza (no se salta una noche perdida)', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const jack = Client(`http://localhost:${port}`);
  const jackW = stateWaiter(jack);
  jack.emit('join', { name: 'J', role: 'jack' });
  await jackW.wait();
  jack.emit('phase:startCrime', { circle: 7 });
  await jackW.wait((s) => s.game.phase === 'hunt');
  jack.emit('phase:nextNight'); // intento de abandonar la noche en plena caza
  await jackW.wait((s) => s.log.some((l) => /rechaz/i.test(l)));
  assert.strictEqual(jackW.latest.game.night, 1);   // sigue en la noche 1
  assert.strictEqual(jackW.latest.game.phase, 'hunt');
  jack.close();
  await new Promise((r) => server.close(r));
});
