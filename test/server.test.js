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
