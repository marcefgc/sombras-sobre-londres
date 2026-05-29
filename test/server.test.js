const { test } = require('node:test');
const assert = require('node:assert');
const { io: Client } = require('socket.io-client');
const { createServer } = require('../server');
function once(socket, event) { return new Promise((resolve) => socket.once(event, resolve)); }

test('un detective que se une NUNCA recibe la guarida ni la ruta de Jack', async () => {
  const { server, state, G } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  G.setLair(state, 42);
  G.logJackStep(state, 7, null);
  const det = Client(`http://localhost:${port}`);
  det.emit('join', { name: 'Ana', role: 'det1' });
  const view = await once(det, 'state');
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
  a.emit('join', { name: 'A', role: 'det1' });
  b.emit('join', { name: 'B', role: 'spectator' });
  await once(a, 'state');
  await once(b, 'state');
  a.emit('addToken', { id: 'd1', type: 'detective', x: 0, y: 0, label: '1' });
  a.emit('moveToken', { id: 'd1', x: 80, y: 90 });
  let view;
  do { view = await once(b, 'state'); } while (!view.tokens.find((t) => t.id === 'd1' && t.x === 80));
  const t = view.tokens.find((t) => t.id === 'd1');
  assert.strictEqual(t.y, 90);
  a.close(); b.close();
  await new Promise((r) => server.close(r));
});
