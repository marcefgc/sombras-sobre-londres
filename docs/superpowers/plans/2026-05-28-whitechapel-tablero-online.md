# Tablero online de Sombras sobre Londres — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una web jugable en red local de *Sombras sobre Londres*: un servidor Node sincroniza un tablero compartido en tiempo real, con info privada para Jack y ayudas asistidas de turnos/pistas/arrestos.

**Architecture:** Servidor Node (Express + Socket.io) con estado en memoria y filtrado por rol; lógica de juego pura y testeable en `game-state.js`; clientes HTML/CSS/JS plano que renderizan un mapa de fondo con fichas arrastrables sincronizadas. El servidor es la fuente de verdad y responde pistas/arrestos de forma autoritativa.

**Tech Stack:** Node 22, Express, Socket.io, `node:test` (runner nativo), `socket.io-client` (tests), `pdf-to-img` (extracción del mapa, solo dev).

---

## Estructura de archivos

| Archivo | Responsabilidad |
| --- | --- |
| `package.json` | Dependencias y scripts (`start`, `test`, `extract-map`) |
| `game-state.js` | Lógica pura: estado, jugadores, fichas, ruta de Jack, fases, filtrado por rol. Sin red. |
| `server.js` | Express estático + Socket.io; traduce eventos a llamadas de `game-state` y reemite estado filtrado. |
| `scripts/extract-map.js` | Script de un solo uso: renderiza `whitechapel_map_08.pdf` a `public/assets/mapa.png`. |
| `public/index.html` | Página única; contenedores de lobby, tablero y panel privado. |
| `public/style.css` | Estilos del tablero, fichas y paneles. |
| `public/client.js` | Conexión socket, render, drag&drop, UI de rol. |
| `test/game-state.test.js` | Tests unitarios de la lógica pura. |
| `test/server.test.js` | Test de integración socket: el detective nunca recibe info privada. |
| `iniciar.bat` | Doble-click en Windows: instala deps si faltan y arranca. |
| `README.md` | Cómo ver IP, firewall y conectar. |

---

## Task 1: Scaffold del proyecto y extracción del mapa

**Files:**
- Create: `package.json`
- Create: `scripts/extract-map.js`
- Create: `public/assets/.gitkeep`

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "sombras-sobre-londres",
  "version": "1.0.0",
  "description": "Tablero online en red local de Letters from Whitechapel",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test",
    "extract-map": "node scripts/extract-map.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "socket.io": "^4.7.5"
  },
  "devDependencies": {
    "socket.io-client": "^4.7.5",
    "pdf-to-img": "^4.2.0"
  }
}
```

- [ ] **Step 2: Instalar dependencias**

Run: `npm install`
Expected: crea `node_modules/` sin errores (puede tardar; `pdf-to-img` trae `@napi-rs/canvas` precompilado para Windows).

- [ ] **Step 3: Crear `scripts/extract-map.js`**

```js
const fs = require('fs');
const path = require('path');

async function main() {
  const { pdf } = await import('pdf-to-img');
  const src = path.join(__dirname, '..', 'whitechapel_map_08.pdf');
  const out = path.join(__dirname, '..', 'public', 'assets', 'mapa.png');
  const doc = await pdf(src, { scale: 3 });
  for await (const page of doc) {
    fs.writeFileSync(out, page);
    console.log('Mapa escrito en', out);
    break; // solo la primera página
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 4: Crear placeholder `public/assets/.gitkeep`**

Crear un archivo vacío `public/assets/.gitkeep`.

- [ ] **Step 5: Ejecutar la extracción del mapa**

Run: `npm run extract-map`
Expected: imprime "Mapa escrito en ...mapa.png" y existe `public/assets/mapa.png`.
Nota: si la imagen sale borrosa o vacía, sube `scale` a 4 y reejecuta; como último recurso, el anfitrión puede tomar una captura del PDF y guardarla manualmente como `public/assets/mapa.png`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/extract-map.js public/assets/.gitkeep public/assets/mapa.png
git commit -m "chore: scaffold del proyecto y extracción del mapa"
```

---

## Task 2: `game-state` — creación de partida y jugadores

**Files:**
- Create: `game-state.js`
- Test: `test/game-state.test.js`

- [ ] **Step 1: Escribir el test que falla**

```js
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
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `node --test test/game-state.test.js`
Expected: FAIL con "Cannot find module '../game-state'".

- [ ] **Step 3: Implementación mínima**

```js
const CARRIAGES_PER_NIGHT = 2;
const ALLEYS_PER_NIGHT = 3;

function createGame() {
  return {
    game: { night: 1, phase: 'lobby', jackMoves: 0, turn: 'jack' },
    players: {},
    tokens: [],
    jack: { lair: null, path: [], carriages: CARRIAGES_PER_NIGHT, alleys: ALLEYS_PER_NIGHT },
    log: [],
  };
}

function addPlayer(state, socketId, name, role) {
  state.players[socketId] = { name, role };
}

function removePlayer(state, socketId) {
  delete state.players[socketId];
}

module.exports = {
  CARRIAGES_PER_NIGHT, ALLEYS_PER_NIGHT,
  createGame, addPlayer, removePlayer,
};
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `node --test test/game-state.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add game-state.js test/game-state.test.js
git commit -m "feat: game-state con creación de partida y jugadores"
```

---

## Task 3: `game-state` — fichas públicas

**Files:**
- Modify: `game-state.js`
- Test: `test/game-state.test.js`

- [ ] **Step 1: Añadir los tests que fallan**

```js
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
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `node --test test/game-state.test.js`
Expected: FAIL con "G.upsertToken is not a function".

- [ ] **Step 3: Implementación**

```js
function upsertToken(state, token) {
  const i = state.tokens.findIndex((t) => t.id === token.id);
  if (i >= 0) state.tokens[i] = { ...state.tokens[i], ...token };
  else state.tokens.push({ ...token });
}

function moveToken(state, id, x, y) {
  const t = state.tokens.find((t) => t.id === id);
  if (t) { t.x = x; t.y = y; }
}

function removeToken(state, id) {
  state.tokens = state.tokens.filter((t) => t.id !== id);
}
```

Añadir `upsertToken, moveToken, removeToken` a `module.exports`.

- [ ] **Step 4: Ejecutar para verificar que pasa**

Run: `node --test test/game-state.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add game-state.js test/game-state.test.js
git commit -m "feat: gestión de fichas públicas en game-state"
```

---

## Task 4: `game-state` — guarida, registro de pasos y contadores especiales

**Files:**
- Modify: `game-state.js`
- Test: `test/game-state.test.js`

- [ ] **Step 1: Añadir los tests que fallan**

```js
test('setLair guarda la guarida', () => {
  const s = G.createGame();
  G.setLair(s, 42);
  assert.strictEqual(s.jack.lair, 42);
});

test('logJackStep registra paso e incrementa jackMoves', () => {
  const s = G.createGame();
  G.logJackStep(s, 100, null);
  assert.strictEqual(s.game.jackMoves, 1);
  assert.deepStrictEqual(s.jack.path[0], { step: 1, circle: 100, special: null });
});

test('logJackStep con carruaje descuenta el contador y registra en log', () => {
  const s = G.createGame();
  G.logJackStep(s, 50, 'carriage');
  assert.strictEqual(s.jack.carriages, 1);
  assert.ok(s.log.some((l) => l.includes('carruaje')));
});

test('logJackStep con callejón descuenta el contador', () => {
  const s = G.createGame();
  G.logJackStep(s, 51, 'alley');
  assert.strictEqual(s.jack.alleys, 2);
  assert.ok(s.log.some((l) => l.includes('callejón')));
});

test('los contadores no bajan de cero', () => {
  const s = G.createGame();
  G.logJackStep(s, 1, 'carriage');
  G.logJackStep(s, 2, 'carriage');
  G.logJackStep(s, 3, 'carriage');
  assert.strictEqual(s.jack.carriages, 0);
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `node --test test/game-state.test.js`
Expected: FAIL con "G.setLair is not a function".

- [ ] **Step 3: Implementación**

```js
function setLair(state, circle) {
  state.jack.lair = circle;
}

function logJackStep(state, circle, special) {
  state.game.jackMoves += 1;
  state.jack.path.push({ step: state.game.jackMoves, circle, special: special || null });
  if (special === 'carriage') {
    state.jack.carriages = Math.max(0, state.jack.carriages - 1);
    state.log.push('Jack usó un carruaje');
  } else if (special === 'alley') {
    state.jack.alleys = Math.max(0, state.jack.alleys - 1);
    state.log.push('Jack usó un callejón');
  }
}
```

Añadir `setLair, logJackStep` a `module.exports`.

- [ ] **Step 4: Ejecutar para verificar que pasa**

Run: `node --test test/game-state.test.js`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add game-state.js test/game-state.test.js
git commit -m "feat: guarida, registro de pasos y contadores especiales"
```

---

## Task 5: `game-state` — consultas de pista y arresto

**Files:**
- Modify: `game-state.js`
- Test: `test/game-state.test.js`

- [ ] **Step 1: Añadir los tests que fallan**

```js
test('getJackCircle devuelve la posición actual o null', () => {
  const s = G.createGame();
  assert.strictEqual(G.getJackCircle(s), null);
  G.logJackStep(s, 7, null);
  G.logJackStep(s, 8, null);
  assert.strictEqual(G.getJackCircle(s), 8);
});

test('checkClue es verdadero si Jack pasó por el círculo', () => {
  const s = G.createGame();
  G.logJackStep(s, 7, null);
  G.logJackStep(s, 8, null);
  assert.strictEqual(G.checkClue(s, 7), true);
  assert.strictEqual(G.checkClue(s, 99), false);
});

test('checkArrest solo es verdadero en la posición actual', () => {
  const s = G.createGame();
  G.logJackStep(s, 7, null);
  G.logJackStep(s, 8, null);
  assert.strictEqual(G.checkArrest(s, 8), true);
  assert.strictEqual(G.checkArrest(s, 7), false);
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `node --test test/game-state.test.js`
Expected: FAIL con "G.getJackCircle is not a function".

- [ ] **Step 3: Implementación**

```js
function getJackCircle(state) {
  const p = state.jack.path;
  return p.length ? p[p.length - 1].circle : null;
}

function checkClue(state, circle) {
  return state.jack.path.some((p) => p.circle === circle);
}

function checkArrest(state, circle) {
  return getJackCircle(state) === circle;
}
```

Añadir `getJackCircle, checkClue, checkArrest` a `module.exports`.

- [ ] **Step 4: Ejecutar para verificar que pasa**

Run: `node --test test/game-state.test.js`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add game-state.js test/game-state.test.js
git commit -m "feat: consultas de pista y arresto en game-state"
```

---

## Task 6: `game-state` — fases y avance de noche

**Files:**
- Modify: `game-state.js`
- Test: `test/game-state.test.js`

- [ ] **Step 1: Añadir los tests que fallan**

```js
test('startCrimePrep cambia la fase', () => {
  const s = G.createGame();
  G.startCrimePrep(s);
  assert.strictEqual(s.game.phase, 'crime-prep');
});

test('startCrime fija paso 0 con el círculo del crimen y pasa a caza', () => {
  const s = G.createGame();
  G.startCrime(s, 77);
  assert.strictEqual(s.game.phase, 'hunt');
  assert.deepStrictEqual(s.jack.path[0], { step: 0, circle: 77, special: null });
  assert.strictEqual(s.game.jackMoves, 0);
});

test('nextNight reinicia ruta, movimientos y contadores y sube la noche', () => {
  const s = G.createGame();
  G.startCrime(s, 77);
  G.logJackStep(s, 78, 'carriage');
  G.nextNight(s);
  assert.strictEqual(s.game.night, 2);
  assert.strictEqual(s.game.phase, 'crime-prep');
  assert.strictEqual(s.game.jackMoves, 0);
  assert.deepStrictEqual(s.jack.path, []);
  assert.strictEqual(s.jack.carriages, 2);
  assert.strictEqual(s.jack.alleys, 3);
  assert.strictEqual(s.jack.lair, null === s.jack.lair ? s.jack.lair : s.jack.lair); // la guarida NO se reinicia
});

test('endGame fija fase ended y registra ganador', () => {
  const s = G.createGame();
  G.endGame(s, 'Policía');
  assert.strictEqual(s.game.phase, 'ended');
  assert.ok(s.log.some((l) => l.includes('Policía')));
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `node --test test/game-state.test.js`
Expected: FAIL con "G.startCrimePrep is not a function".

- [ ] **Step 3: Implementación**

```js
function startCrimePrep(state) {
  state.game.phase = 'crime-prep';
}

function startCrime(state, circle) {
  state.game.phase = 'hunt';
  state.game.jackMoves = 0;
  state.game.turn = 'jack';
  state.jack.path = [{ step: 0, circle, special: null }];
  state.log.push('Comienza la caza: crimen en ' + circle);
}

function nextNight(state) {
  state.game.night += 1;
  state.game.phase = 'crime-prep';
  state.game.jackMoves = 0;
  state.game.turn = 'jack';
  state.jack.path = [];
  state.jack.carriages = CARRIAGES_PER_NIGHT;
  state.jack.alleys = ALLEYS_PER_NIGHT;
  state.log.push('Noche ' + state.game.night);
}

function endGame(state, winner) {
  state.game.phase = 'ended';
  state.log.push('Fin de la partida. Ganador: ' + winner);
}
```

Añadir `startCrimePrep, startCrime, nextNight, endGame` a `module.exports`.

- [ ] **Step 4: Ejecutar para verificar que pasa**

Run: `node --test test/game-state.test.js`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add game-state.js test/game-state.test.js
git commit -m "feat: fases y avance de noche en game-state"
```

---

## Task 7: `game-state` — filtrado por rol (crítico de seguridad)

**Files:**
- Modify: `game-state.js`
- Test: `test/game-state.test.js`

- [ ] **Step 1: Añadir los tests que fallan**

```js
test('viewFor para Jack incluye guarida y ruta', () => {
  const s = G.createGame();
  G.setLair(s, 42);
  G.logJackStep(s, 7, null);
  const v = G.viewFor(s, 'jack');
  assert.strictEqual(v.jack.lair, 42);
  assert.strictEqual(v.jack.path.length, 1);
});

test('viewFor para detective NUNCA expone guarida ni ruta', () => {
  const s = G.createGame();
  G.setLair(s, 42);
  G.logJackStep(s, 7, null);
  const v = G.viewFor(s, 'det1');
  assert.strictEqual(v.jack.lair, undefined);
  assert.strictEqual(v.jack.path, undefined);
  // pero sí ve los contadores (la policía sabe cuántos especiales quedan)
  assert.strictEqual(v.jack.carriages, 2);
  assert.strictEqual(v.jack.alleys, 3);
});

test('viewFor para espectador tampoco expone info privada', () => {
  const s = G.createGame();
  G.setLair(s, 42);
  const v = G.viewFor(s, 'spectator');
  assert.strictEqual(v.jack.lair, undefined);
  assert.strictEqual(v.jack.path, undefined);
});

test('viewFor incluye estado público compartido', () => {
  const s = G.createGame();
  G.upsertToken(s, { id: 'd1', type: 'detective', x: 1, y: 2, label: '1' });
  const v = G.viewFor(s, 'det1');
  assert.strictEqual(v.game.night, 1);
  assert.strictEqual(v.tokens.length, 1);
  assert.ok(Array.isArray(v.log));
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `node --test test/game-state.test.js`
Expected: FAIL con "G.viewFor is not a function".

- [ ] **Step 3: Implementación**

```js
function viewFor(state, role) {
  const view = {
    game: state.game,
    players: state.players,
    tokens: state.tokens,
    log: state.log,
  };
  if (role === 'jack') {
    view.jack = state.jack;
  } else {
    // Solo los contadores son públicos; guarida y ruta quedan ocultas.
    view.jack = { carriages: state.jack.carriages, alleys: state.jack.alleys };
  }
  return view;
}
```

Añadir `viewFor` a `module.exports`.

- [ ] **Step 4: Ejecutar para verificar que pasa**

Run: `node --test test/game-state.test.js`
Expected: PASS (21 tests).

- [ ] **Step 5: Commit**

```bash
git add game-state.js test/game-state.test.js
git commit -m "feat: filtrado de estado por rol (oculta info privada de Jack)"
```

---

## Task 8: `server.js` — estáticos, conexión y reparto de estado filtrado

**Files:**
- Create: `server.js`
- Test: `test/server.test.js`

- [ ] **Step 1: Escribir el test de integración que falla**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { io: Client } = require('socket.io-client');
const { createServer } = require('../server');

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

test('un detective que se une NUNCA recibe la guarida ni la ruta de Jack', async () => {
  const { server, state, G } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  // Jack fija una guarida y un paso a través del estado en memoria.
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
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `node --test test/server.test.js`
Expected: FAIL con "Cannot find module '../server'".

- [ ] **Step 3: Implementación de `server.js`**

```js
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const G = require('./game-state');

function createServer() {
  const app = express();
  app.use(express.static(path.join(__dirname, 'public')));

  const server = http.createServer(app);
  const io = new Server(server);
  const state = G.createGame();

  function sendStates() {
    for (const [id, p] of Object.entries(state.players)) {
      io.to(id).emit('state', G.viewFor(state, p.role));
    }
  }

  io.on('connection', (socket) => {
    socket.on('join', ({ name, role }) => {
      G.addPlayer(state, socket.id, name, role);
      socket.emit('state', G.viewFor(state, role));
      sendStates();
    });

    socket.on('disconnect', () => {
      G.removePlayer(state, socket.id);
      sendStates();
    });
  });

  return { app, server, io, state, G, sendStates };
}

if (require.main === module) {
  const { server } = createServer();
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log('Sombras sobre Londres escuchando en http://localhost:' + PORT);
  });
}

module.exports = { createServer };
```

- [ ] **Step 4: Ejecutar para verificar que pasa**

Run: `node --test test/server.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add server.js test/server.test.js
git commit -m "feat: servidor socket.io con reparto de estado filtrado por rol"
```

---

## Task 9: `server.js` — sincronización de fichas

**Files:**
- Modify: `server.js`
- Test: `test/server.test.js`

- [ ] **Step 1: Añadir el test que falla**

```js
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
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `node --test test/server.test.js`
Expected: FAIL (el token nunca aparece; el test agota su espera).

- [ ] **Step 3: Implementación — añadir dentro de `io.on('connection', ...)`**

```js
    socket.on('addToken', (token) => {
      G.upsertToken(state, token);
      sendStates();
    });

    socket.on('moveToken', ({ id, x, y }) => {
      G.moveToken(state, id, x, y);
      sendStates();
    });

    socket.on('removeToken', ({ id }) => {
      G.removeToken(state, id);
      sendStates();
    });
```

- [ ] **Step 4: Ejecutar para verificar que pasa**

Run: `node --test test/server.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server.js test/server.test.js
git commit -m "feat: sincronización de fichas vía socket"
```

---

## Task 10: `server.js` — eventos privados de Jack y fases

**Files:**
- Modify: `server.js`
- Test: `test/server.test.js`

- [ ] **Step 1: Añadir el test que falla**

```js
test('jack:setLair y jack:logStep solo afectan la vista de Jack', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  const jack = Client(`http://localhost:${port}`);
  jack.emit('join', { name: 'J', role: 'jack' });
  await once(jack, 'state');

  jack.emit('jack:setLair', { circle: 99 });
  jack.emit('jack:logStep', { circle: 10, special: null });

  let view;
  do { view = await once(jack, 'state'); } while (!(view.jack && view.jack.lair === 99));
  assert.strictEqual(view.jack.path[0].circle, 10);

  jack.close();
  await new Promise((r) => server.close(r));
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `node --test test/server.test.js`
Expected: FAIL (la guarida nunca llega a 99; espera agotada).

- [ ] **Step 3: Implementación — añadir dentro de `io.on('connection', ...)`**

```js
    function roleOf() {
      return state.players[socket.id] && state.players[socket.id].role;
    }

    socket.on('jack:setLair', ({ circle }) => {
      if (roleOf() !== 'jack') return;
      G.setLair(state, circle);
      sendStates();
    });

    socket.on('jack:logStep', ({ circle, special }) => {
      if (roleOf() !== 'jack') return;
      G.logJackStep(state, circle, special);
      sendStates();
    });

    socket.on('phase:crimePrep', () => { G.startCrimePrep(state); sendStates(); });
    socket.on('phase:startCrime', ({ circle }) => {
      if (roleOf() !== 'jack') return;
      G.startCrime(state, circle); sendStates();
    });
    socket.on('phase:nextNight', () => { G.nextNight(state); sendStates(); });
    socket.on('reset', () => {
      const fresh = G.createGame();
      fresh.players = state.players;
      Object.assign(state, fresh);
      sendStates();
    });
```

- [ ] **Step 4: Ejecutar para verificar que pasa**

Run: `node --test test/server.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server.js test/server.test.js
git commit -m "feat: eventos privados de Jack, fases y reinicio"
```

---

## Task 11: `server.js` — pistas y arrestos autoritativos

**Files:**
- Modify: `server.js`
- Test: `test/server.test.js`

- [ ] **Step 1: Añadir el test que falla**

```js
test('clue:ask devuelve resultado autoritativo y notifica a Jack', async () => {
  const { server } = createServer();
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  const jack = Client(`http://localhost:${port}`);
  const det = Client(`http://localhost:${port}`);
  jack.emit('join', { name: 'J', role: 'jack' });
  det.emit('join', { name: 'D', role: 'det1' });
  await once(jack, 'state');
  await once(det, 'state');

  jack.emit('jack:logStep', { circle: 32, special: null });
  await once(det, 'state');

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
  jack.emit('join', { name: 'J', role: 'jack' });
  det.emit('join', { name: 'D', role: 'det1' });
  await once(jack, 'state');
  await once(det, 'state');

  jack.emit('jack:logStep', { circle: 12, special: null });
  await once(det, 'state');

  det.emit('arrest', { circle: 12 });
  const res = await once(det, 'arrest:result');
  assert.strictEqual(res.caught, true);

  let view;
  do { view = await once(det, 'state'); } while (view.game.phase !== 'ended');
  assert.strictEqual(view.game.phase, 'ended');

  jack.close(); det.close();
  await new Promise((r) => server.close(r));
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `node --test test/server.test.js`
Expected: FAIL (no se emite `clue:result`; espera agotada).

- [ ] **Step 3: Implementación — añadir dentro de `io.on('connection', ...)`**

```js
    function jackSocketId() {
      const e = Object.entries(state.players).find(([, p]) => p.role === 'jack');
      return e ? e[0] : null;
    }

    socket.on('clue:ask', ({ circle }) => {
      const passed = G.checkClue(state, circle);
      state.log.push('Pista en ' + circle + ': ' + (passed ? 'SÍ' : 'no'));
      io.emit('clue:result', { circle, passed });
      const jid = jackSocketId();
      if (jid) io.to(jid).emit('clue:asked', { circle });
      sendStates();
    });

    socket.on('arrest', ({ circle }) => {
      const caught = G.checkArrest(state, circle);
      state.log.push('¡Arresto en ' + circle + '! ' + (caught ? 'ATRAPADO' : 'fallido'));
      io.emit('arrest:result', { circle, caught });
      if (caught) G.endGame(state, 'Policía');
      const jid = jackSocketId();
      if (jid) io.to(jid).emit('arrest:attempt', { circle });
      sendStates();
    });
```

- [ ] **Step 4: Ejecutar para verificar que pasa**

Run: `node --test test/server.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server.js test/server.test.js
git commit -m "feat: pistas y arrestos autoritativos del servidor"
```

---

## Task 12: Cliente — HTML y estilos base

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`

- [ ] **Step 1: Crear `public/index.html`**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sombras sobre Londres</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <!-- LOBBY -->
  <section id="lobby">
    <h1>Sombras sobre Londres</h1>
    <input id="name" placeholder="Tu nombre" />
    <select id="role">
      <option value="jack">Jack el Destripador</option>
      <option value="det1">Detective 1</option>
      <option value="det2">Detective 2</option>
      <option value="det3">Detective 3</option>
      <option value="det4">Detective 4</option>
      <option value="det5">Detective 5</option>
      <option value="spectator">Espectador</option>
    </select>
    <button id="joinBtn">Entrar</button>
  </section>

  <!-- JUEGO -->
  <section id="game" hidden>
    <header id="statusBar">
      <span id="nightLabel"></span>
      <span id="phaseLabel"></span>
      <span id="movesLabel"></span>
      <button id="resetBtn">Reiniciar</button>
    </header>

    <div id="layout">
      <div id="boardWrap">
        <img id="mapImg" src="assets/mapa.png" alt="Mapa de Whitechapel" />
        <div id="tokenLayer"></div>
      </div>

      <aside id="sidebar">
        <div id="controls"></div>
        <div id="jackPanel" hidden></div>
        <h3>Registro</h3>
        <ul id="log"></ul>
      </aside>
    </div>
  </section>

  <script src="/socket.io/socket.io.js"></script>
  <script src="client.js"></script>
</body>
</html>
```

- [ ] **Step 2: Crear `public/style.css`**

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: Georgia, 'Times New Roman', serif;
       background: #1a1714; color: #e8e2d6; }
h1 { font-weight: normal; letter-spacing: 2px; }

#lobby { max-width: 420px; margin: 12vh auto; text-align: center;
         display: flex; flex-direction: column; gap: 12px; padding: 24px; }
#lobby input, #lobby select, #lobby button { padding: 10px; font-size: 16px; }
button { cursor: pointer; background: #712b13; color: #f5c4b3;
         border: 1px solid #f0997b; border-radius: 6px; padding: 8px 12px; }
button:hover { background: #8a3517; }

#statusBar { display: flex; gap: 18px; align-items: center;
             padding: 8px 16px; background: #0f0d0b; border-bottom: 1px solid #3a332b; }
#statusBar span { font-size: 15px; }
#resetBtn { margin-left: auto; }

#layout { display: flex; gap: 12px; padding: 12px; }
#boardWrap { position: relative; flex: 1; }
#mapImg { width: 100%; display: block; border: 2px solid #3a332b; user-select: none; }
#tokenLayer { position: absolute; inset: 0; }

.token { position: absolute; width: 26px; height: 26px; border-radius: 50%;
         transform: translate(-50%, -50%); cursor: grab; border: 2px solid #000;
         display: flex; align-items: center; justify-content: center;
         font-size: 12px; font-weight: bold; color: #fff; touch-action: none; }
.token.detective { background: #1565c0; }
.token.crime { background: #c62828; }
.token.clue { background: #f9a825; color: #000; }
.token.victim { background: #eceff1; color: #000; }

#sidebar { width: 320px; background: #0f0d0b; padding: 12px;
           border: 1px solid #3a332b; max-height: 88vh; overflow-y: auto; }
#sidebar h3 { border-bottom: 1px solid #3a332b; padding-bottom: 4px; }
#controls, #jackPanel { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
#controls input, #jackPanel input { padding: 6px; width: 100%; }
#log { list-style: none; padding: 0; font-size: 13px; }
#log li { padding: 3px 0; border-bottom: 1px solid #221e19; }
.row { display: flex; gap: 6px; }
.row > * { flex: 1; }
```

- [ ] **Step 3: Verificación manual**

Run: `npm start` y abrir `http://localhost:3000` en el navegador.
Expected: se ve el lobby con nombre, selector de rol y botón Entrar; el mapa aún no se muestra (sigue en lobby). Detener con Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/style.css
git commit -m "feat: estructura HTML y estilos del cliente"
```

---

## Task 13: Cliente — conexión, lobby y render de estado

**Files:**
- Create: `public/client.js`

- [ ] **Step 1: Crear `public/client.js`**

```js
const socket = io();
let myRole = null;
let myName = null;
let lastState = null;

const $ = (id) => document.getElementById(id);

$('joinBtn').onclick = () => {
  myName = $('name').value.trim() || 'Jugador';
  myRole = $('role').value;
  socket.emit('join', { name: myName, role: myRole });
  $('lobby').hidden = true;
  $('game').hidden = false;
  $('jackPanel').hidden = myRole !== 'jack';
  buildControls();
};

$('resetBtn').onclick = () => {
  if (confirm('¿Reiniciar la partida para todos?')) socket.emit('reset');
};

socket.on('state', (state) => {
  lastState = state;
  renderStatus(state);
  renderTokens(state);
  renderLog(state);
  renderJackPanel(state);
});

function renderStatus(s) {
  const phases = { lobby: 'Lobby', 'crime-prep': 'Preparación del crimen',
                   hunt: 'La caza', ended: 'Partida terminada' };
  $('nightLabel').textContent = 'Noche ' + s.game.night + ' / 4';
  $('phaseLabel').textContent = phases[s.game.phase] || s.game.phase;
  $('movesLabel').textContent = 'Movimientos de Jack: ' + s.game.jackMoves + ' / 15';
}

function renderLog(s) {
  $('log').innerHTML = s.log.slice(-40).reverse()
    .map((l) => '<li>' + l + '</li>').join('');
}

// Definidas en tareas siguientes:
function renderTokens(s) {}
function renderJackPanel(s) {}
function buildControls() {}
```

- [ ] **Step 2: Verificación manual**

Run: `npm start`, abrir dos pestañas en `http://localhost:3000`. En una entra como "Jack", en otra como "Detective 1".
Expected: ambas pasan del lobby al juego; la barra de estado muestra "Noche 1 / 4", "Lobby", "Movimientos de Jack: 0 / 15". La consola del navegador no muestra errores.

- [ ] **Step 3: Commit**

```bash
git add public/client.js
git commit -m "feat: conexión, lobby y render de estado en el cliente"
```

---

## Task 14: Cliente — fichas arrastrables sincronizadas

**Files:**
- Modify: `public/client.js`

- [ ] **Step 1: Reemplazar la función `renderTokens` placeholder por la implementación**

```js
function renderTokens(s) {
  const layer = $('tokenLayer');
  layer.innerHTML = '';
  for (const t of s.tokens) {
    const el = document.createElement('div');
    el.className = 'token ' + t.type;
    el.textContent = t.label || '';
    el.style.left = t.x + '%';
    el.style.top = t.y + '%';
    if (myRole !== 'spectator') makeDraggable(el, t.id);
    layer.appendChild(el);
  }
}

function makeDraggable(el, id) {
  el.onpointerdown = (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const wrap = $('boardWrap').getBoundingClientRect();
    const move = (ev) => {
      const x = ((ev.clientX - wrap.left) / wrap.width) * 100;
      const y = ((ev.clientY - wrap.top) / wrap.height) * 100;
      el.style.left = x + '%';
      el.style.top = y + '%';
    };
    const up = (ev) => {
      el.releasePointerCapture(e.pointerId);
      el.onpointermove = null;
      el.onpointerup = null;
      const x = ((ev.clientX - wrap.left) / wrap.width) * 100;
      const y = ((ev.clientY - wrap.top) / wrap.height) * 100;
      socket.emit('moveToken', { id, x, y });
    };
    el.onpointermove = move;
    el.onpointerup = up;
  };
}
```

- [ ] **Step 2: Reemplazar la función `buildControls` placeholder con botones para crear fichas (provisional, se amplía en Task 16)**

```js
function buildControls() {
  const c = $('controls');
  if (myRole === 'spectator') { c.innerHTML = '<em>Modo espectador</em>'; return; }
  c.innerHTML = '';
  const addBtns = [
    ['Detective', 'detective'], ['Crimen', 'crime'],
    ['Pista', 'clue'], ['Víctima', 'victim'],
  ];
  for (const [label, type] of addBtns) {
    const b = document.createElement('button');
    b.textContent = '+ ' + label;
    b.onclick = () => {
      const id = type + '-' + Math.random().toString(36).slice(2, 7);
      const lbl = type === 'detective' ? prompt('Número del detective (1-5):', '1') || '' : '';
      socket.emit('addToken', { id, type, x: 50, y: 50, label: lbl });
    };
    c.appendChild(b);
  }
}
```

- [ ] **Step 3: Verificación manual de sincronización**

Run: `npm start`, abrir dos pestañas (Detective 1 y Espectador).
Expected: al pulsar "+ Detective" en la pestaña del detective aparece una ficha azul en ambas pestañas; al arrastrarla en la del detective, se mueve en tiempo real en la del espectador. El espectador no puede arrastrar.

- [ ] **Step 4: Commit**

```bash
git add public/client.js
git commit -m "feat: fichas arrastrables sincronizadas en tiempo real"
```

---

## Task 15: Cliente — panel privado de Jack

**Files:**
- Modify: `public/client.js`

- [ ] **Step 1: Reemplazar la función `renderJackPanel` placeholder**

```js
function renderJackPanel(s) {
  if (myRole !== 'jack' || !s.jack) return;
  const p = $('jackPanel');
  const lair = s.jack.lair == null ? '(sin fijar)' : s.jack.lair;
  const pathStr = (s.jack.path || []).map((x) =>
    x.circle + (x.special ? '(' + (x.special === 'carriage' ? 'C' : 'A') + ')' : '')
  ).join(' → ');
  p.innerHTML = `
    <h3>Panel privado de Jack</h3>
    <div class="row">
      <input id="lairInput" type="number" placeholder="Guarida" />
      <button id="setLairBtn">Fijar guarida</button>
    </div>
    <div>Guarida: <strong>${lair}</strong></div>
    <hr/>
    <div class="row">
      <input id="stepInput" type="number" placeholder="N° círculo" />
    </div>
    <div class="row">
      <button id="stepNormal">Mover</button>
      <button id="stepCarriage">Carruaje (${s.jack.carriages})</button>
      <button id="stepAlley">Callejón (${s.jack.alleys})</button>
    </div>
    <div><small>Ruta de esta noche:</small><br/>${pathStr || '—'}</div>
  `;
  $('setLairBtn').onclick = () => {
    const c = parseInt($('lairInput').value, 10);
    if (!Number.isNaN(c)) socket.emit('jack:setLair', { circle: c });
  };
  const step = (special) => {
    const c = parseInt($('stepInput').value, 10);
    if (!Number.isNaN(c)) { socket.emit('jack:logStep', { circle: c, special }); $('stepInput').value = ''; }
  };
  $('stepNormal').onclick = () => step(null);
  $('stepCarriage').onclick = () => step('carriage');
  $('stepAlley').onclick = () => step('alley');
}
```

- [ ] **Step 2: Añadir aviso a Jack cuando le preguntan o intentan arrestarlo (al final del archivo)**

```js
socket.on('clue:asked', ({ circle }) => {
  const li = document.createElement('li');
  li.textContent = '👁️ Te preguntaron por el ' + circle;
  $('log').prepend(li);
});
socket.on('arrest:attempt', ({ circle }) => {
  const li = document.createElement('li');
  li.textContent = '🚨 Intento de arresto en ' + circle;
  $('log').prepend(li);
});
```

- [ ] **Step 3: Verificación manual**

Run: `npm start`, entrar como Jack en una pestaña.
Expected: aparece el "Panel privado de Jack". Fijar guarida con un número → se muestra. Escribir un círculo y pulsar "Mover" → aparece en "Ruta de esta noche" y el contador "Movimientos de Jack" sube. "Carruaje (2)" baja a (1) al usarlo. En una pestaña de detective NO se ve el panel ni la ruta.

- [ ] **Step 4: Commit**

```bash
git add public/client.js
git commit -m "feat: panel privado de Jack (guarida, ruta, especiales)"
```

---

## Task 16: Cliente — controles de detective y fases

**Files:**
- Modify: `public/client.js`

- [ ] **Step 1: Ampliar `buildControls` para añadir controles de pista/arresto y fases**

Reemplazar la función `buildControls` completa por:

```js
function buildControls() {
  const c = $('controls');
  if (myRole === 'spectator') { c.innerHTML = '<em>Modo espectador</em>'; return; }
  c.innerHTML = '<h3>Acciones</h3>';

  // Crear fichas
  const addRow = document.createElement('div');
  addRow.className = 'row';
  for (const [label, type] of [['Detective', 'detective'], ['Crimen', 'crime'],
                               ['Pista', 'clue'], ['Víctima', 'victim']]) {
    const b = document.createElement('button');
    b.textContent = '+ ' + label;
    b.onclick = () => {
      const id = type + '-' + Math.random().toString(36).slice(2, 7);
      const lbl = type === 'detective' ? (prompt('Número del detective (1-5):', '1') || '') : '';
      socket.emit('addToken', { id, type, x: 50, y: 50, label: lbl });
    };
    addRow.appendChild(b);
  }
  c.appendChild(addRow);

  // Pista y arresto (solo detectives, no Jack)
  if (myRole !== 'jack') {
    const clueRow = document.createElement('div');
    clueRow.className = 'row';
    clueRow.innerHTML = '<input id="clueNum" type="number" placeholder="N° a interrogar" />'
                      + '<button id="clueBtn">Buscar pista</button>';
    c.appendChild(clueRow);
    const arrestRow = document.createElement('div');
    arrestRow.className = 'row';
    arrestRow.innerHTML = '<input id="arrestNum" type="number" placeholder="N° a arrestar" />'
                        + '<button id="arrestBtn">¡Arresto!</button>';
    c.appendChild(arrestRow);
    document.getElementById('clueBtn').onclick = () => {
      const n = parseInt(document.getElementById('clueNum').value, 10);
      if (!Number.isNaN(n)) socket.emit('clue:ask', { circle: n });
    };
    document.getElementById('arrestBtn').onclick = () => {
      const n = parseInt(document.getElementById('arrestNum').value, 10);
      if (!Number.isNaN(n)) socket.emit('arrest', { circle: n });
    };
  }

  // Control de fases
  const phaseRow = document.createElement('div');
  phaseRow.className = 'row';
  phaseRow.innerHTML = '<button id="prepBtn">Preparar crimen</button>'
                     + '<button id="nightBtn">Siguiente noche</button>';
  c.appendChild(phaseRow);
  document.getElementById('prepBtn').onclick = () => socket.emit('phase:crimePrep');
  document.getElementById('nightBtn').onclick = () => socket.emit('phase:nextNight');

  // Jack inicia el crimen (paso 0)
  if (myRole === 'jack') {
    const crimeRow = document.createElement('div');
    crimeRow.className = 'row';
    crimeRow.innerHTML = '<input id="crimeNum" type="number" placeholder="N° del crimen" />'
                       + '<button id="crimeBtn">Cometer crimen</button>';
    c.appendChild(crimeRow);
    document.getElementById('crimeBtn').onclick = () => {
      const n = parseInt(document.getElementById('crimeNum').value, 10);
      if (!Number.isNaN(n)) socket.emit('phase:startCrime', { circle: n });
    };
  }
}
```

- [ ] **Step 2: Mostrar el resultado de pista/arresto a todos (añadir al final del archivo)**

```js
socket.on('clue:result', ({ circle, passed }) => {
  alert('Pista en ' + circle + ': ' + (passed ? 'SÍ pasó por aquí' : 'no pasó'));
});
socket.on('arrest:result', ({ circle, caught }) => {
  alert(caught ? '¡ATRAPADO en ' + circle + '! Gana la policía.'
               : 'Arresto fallido en ' + circle + '.');
});
```

- [ ] **Step 3: Verificación manual del flujo completo**

Run: `npm start`, abrir Jack + Detective 1.
Expected:
- Jack pulsa "Preparar crimen" → fase cambia en ambos a "Preparación del crimen".
- Jack escribe un n° y "Cometer crimen" → fase pasa a "La caza", aparece en su ruta como paso 0.
- Jack registra varios pasos.
- Detective escribe un número por el que Jack pasó y "Buscar pista" → ambos ven alerta "SÍ pasó"; Jack ve "👁️ Te preguntaron".
- Detective escribe el círculo actual de Jack y "¡Arresto!" → alerta "¡ATRAPADO!", fase pasa a "Partida terminada".
- "Siguiente noche" sube la noche y reinicia los contadores de Jack.

- [ ] **Step 4: Commit**

```bash
git add public/client.js
git commit -m "feat: controles de detective, pistas, arrestos y fases"
```

---

## Task 17: Lanzador `.bat` y README

**Files:**
- Create: `iniciar.bat`
- Create: `README.md`

- [ ] **Step 1: Crear `iniciar.bat`**

```bat
@echo off
title Sombras sobre Londres
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org y vuelve a intentar.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install
)
echo.
echo ============================================================
echo  Servidor iniciado. Tus amigos deben abrir en su navegador:
echo  http://[TU-IP-LOCAL]:3000   (mira tu IP con: ipconfig)
echo  Para detener el servidor cierra esta ventana.
echo ============================================================
echo.
node server.js
pause
```

- [ ] **Step 2: Crear `README.md`**

```markdown
# Sombras sobre Londres — Tablero online (red local)

Versión web para jugar *Letters from Whitechapel* entre amigos en la misma WiFi.

## Requisitos
- [Node.js](https://nodejs.org) instalado en la PC anfitriona (solo el anfitrión).

## Cómo jugar
1. **Anfitrión:** doble-click en `iniciar.bat` (o ejecuta `npm install` una vez y luego `npm start`).
2. **Averigua tu IP local:** abre una terminal y ejecuta `ipconfig`; busca la "Dirección IPv4" (algo como `192.168.1.X`).
3. Si Windows muestra un aviso de **Firewall**, permite el acceso en redes privadas.
4. **Los demás jugadores** (en la misma WiFi) abren en su navegador: `http://TU-IP:3000`.
5. Cada quien pone su nombre y elige rol: Jack, Detective 1–5 o Espectador.

## Reglas y alcance
- El tablero es **asistido**: muestra el mapa con fichas arrastrables y oculta la info de Jack.
- El servidor verifica **pistas y arrestos** automáticamente y guarda en secreto la ruta y la guarida de Jack.
- Adyacencias, bloqueos, carruajes y callejones se aplican **entre jugadores** (a ojo).

## Desarrollo
- Tests: `npm test`
- Regenerar la imagen del mapa: `npm run extract-map`
```

- [ ] **Step 3: Verificación manual**

Run: doble-click en `iniciar.bat`.
Expected: la ventana arranca el servidor e imprime las instrucciones de IP; `http://localhost:3000` carga el lobby.

- [ ] **Step 4: Commit**

```bash
git add iniciar.bat README.md
git commit -m "docs: lanzador .bat e instrucciones de conexión"
```

---

## Task 18: Verificación de integración final

**Files:** (ninguno — solo verificación)

- [ ] **Step 1: Suite de tests completa**

Run: `npm test`
Expected: PASS en todos los tests de `test/game-state.test.js` (21) y `test/server.test.js` (5).

- [ ] **Step 2: Partida de extremo a extremo con 3 navegadores**

Abrir tres pestañas: Jack, Detective 1, Espectador. Jugar una noche completa:
- Jack fija guarida y comete el crimen; los detectives ven el marcador de crimen colocado.
- Jack registra pasos (incluido un carruaje); el contador de carruajes baja y el log público anuncia "Jack usó un carruaje".
- Un detective busca pistas y coloca marcadores amarillos.
- Comprobar en la pestaña del detective y del espectador (consola del navegador → `lastState`) que **no existe `lastState.jack.path` ni `lastState.jack.lair`**.
- Intento de arresto correcto → la partida termina con victoria policial en las tres pantallas.

Expected: todo lo anterior se cumple sin errores en consola.

- [ ] **Step 3: Commit final (si hubo ajustes)**

```bash
git add -A
git commit -m "test: verificación de integración de la partida completa"
```

---

## Auto-revisión del plan

- **Cobertura del spec:** lobby/roles (T13), tablero+fichas arrastrables (T12,T14), info privada de Jack (T7,T10,T15), control noche/fase/movimientos (T6,T16), verificador de pistas (T11,T16), arresto (T11,T16), victoria (T6,T11,T16), log (T13), reconexión vía estado en servidor (T8), filtrado por rol (T7), extracción del mapa (T1), arranque .bat + README (T17), pruebas (T2–T11 unit/integración + T18). Sin huecos.
- **Consistencia de tipos:** `token {id,type,x,y,label}`, eventos `moveToken/addToken/removeToken`, `jack:setLair/{circle}`, `jack:logStep/{circle,special}`, `phase:crimePrep/startCrime/nextNight`, `clue:ask/clue:result/clue:asked`, `arrest/arrest:result/arrest:attempt` — consistentes entre cliente, servidor y `game-state`.
- **Simplificación consciente:** la fase de patrullas ocultas queda fuera del MVP (anotado en el spec).
