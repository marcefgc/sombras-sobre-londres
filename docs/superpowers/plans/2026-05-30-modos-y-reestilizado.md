# Modos de juego + reestilizado victoriano — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Añadir un modo "Aprendizaje" (árbitro que valida movimientos y automatiza pistas/arrestos usando el grafo del tablero) junto al modo "Partida" ya existente, y reestilizar el juego con la estética victoriana y la biblioteca de assets nueva — sin romper el MVP (30 tests verdes).

**Architecture:** Sobre la base actual (game-state.js puro + server.js socket + cliente vanilla). Se añade un pipeline que convierte el grafo autodetectado en `public/assets/board-graph.json`, un módulo runtime `board-graph.js`, un motor árbitro puro `referee.js`, un campo `game.mode`, y wiring/UI mode-aware. El reestilizado toca `style.css`, los assets y el render de fichas.

**Tech Stack:** Node 22, Express, Socket.io, node:test, assets PNG provistos.

**Convención:** correr tests con `node --test`. Working dir `C:\Users\usuario\Documents\whitechapel`. Commit tras cada task.

---

# SUB-PROYECTO 1 — Reestilizado victoriano (modo Partida)

## Task 1: Copiar la biblioteca de assets al runtime

**Files:** copia de `docs/assets/**` a `public/assets/**`

- [ ] **Step 1: Copiar carpetas de assets**

Run (bash):
```bash
cd /c/Users/usuario/Documents/whitechapel
cp -r "docs/assets/tokens" public/assets/tokens
cp -r "docs/assets/decor" public/assets/decor
cp -r "docs/assets/elements" public/assets/elements
cp "docs/assets/parchment.png" public/assets/parchment.png
cp "docs/assets/whitechapel-map-buildings.jpg" public/assets/whitechapel-map-buildings.jpg
```

- [ ] **Step 2: Verificar**

Run: `ls public/assets/tokens public/assets/decor public/assets/elements && ls -la public/assets/whitechapel-map-buildings.jpg public/assets/parchment.png`
Expected: existen jack.png, police-*.png, clue-yellow.png, crime-scene-red.png, woman.png, etc.; el mapa y el pergamino presentes.

- [ ] **Step 3: Commit**
```bash
git add public/assets
git commit -m "chore: integrar biblioteca de assets victorianos al runtime"
```

## Task 2: Reescribir style.css con la estética victoriana

**Files:** Modify `public/style.css` (reescritura completa)

- [ ] **Step 1: Reemplazar `public/style.css` por completo**

Usar la paleta y tipografías de `docs/Whitechapel Map.html`. Requisitos concretos:
- Variables `:root`: `--ink:#3a281a; --ink-soft:#5a3d22; --paper:#e7d8b4; --paper-dk:#d3bd8f; --edge:#4a321a; --cream:#f6ecd2; --blood:#7a140f;`
- `body`: fondo `radial-gradient(120% 120% at 50% 0%, #2b2722 0%, #1a1714 60%, #100e0c 100%)`, color `var(--cream)`, fuente `"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif`.
- Conservar la regla crítica `[hidden] { display:none !important; }`.
- `#lobby`: tarjeta centrada sobre `parchment.png` (`background:url('assets/parchment.png')` con `background-size:cover`), borde `--edge`, sombra; inputs/select/botón con estilo de la guía (`.btn`: borde `rgba(180,150,95,.4)`, fondo `rgba(60,48,30,.5)`, texto `--cream`, `text-transform:uppercase`, `letter-spacing`).
- `#statusBar`: barra superior oscura con `letter-spacing`, color `#a08a5e`; el modo y la noche visibles.
- `#boardWrap`: marco estilo `.map-frame` de la guía (`box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(180,150,95,.25),0 0 0 12px rgba(20,16,12,.6),0 0 0 13px rgba(150,120,70,.35)`), `overflow:hidden`.
- `#mapImg`: `width:100%`.
- `.token`: ahora contenedor de imagen — `position:absolute; transform:translate(-50%,-50%); width:34px; height:34px; cursor:grab;` con `img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 4px 6px rgba(0,0,0,.6));}`. Quitar los `background-color` por tipo (se usan PNG).
- `#sidebar`, `#controls`, `#jackPanel`: tarjetas tipo pergamino/madera (`background:linear-gradient(180deg,rgba(58,46,30,.85),rgba(30,24,18,.9))`, borde `rgba(150,120,70,.25)`), encabezados serif color `#f0e3c4`.
- `#log li`: texto `#c9b487`, separadores tenues.
- Salpicaduras de ambiente: clases `.splat.s1/.s2/.s3` `position:fixed; pointer-events:none; z-index:0; opacity:.4` con tamaños/rotaciones (copiar de la guía). El contenido del juego va en `z-index:1`.
- `.row`, `.row > *` como hasta ahora.

- [ ] **Step 2: Añadir las salpicaduras de fondo al HTML**

Modify `public/index.html`: justo tras `<body>` añadir:
```html
  <img class="splat s1" src="assets/decor/blood-splatter-3.png" alt="" />
  <img class="splat s2" src="assets/decor/blood-spray.png" alt="" />
  <img class="splat s3" src="assets/decor/blood-splatter-1.png" alt="" />
```
Y cambiar el `src` del mapa: `<img id="mapImg" src="assets/whitechapel-map-buildings.jpg" alt="Mapa de Whitechapel" />`.

- [ ] **Step 3: Verificación (servidor + navegador)**

Arrancar `node server.js` y abrir en el navegador (o Preview MCP). Expected: lobby sobre pergamino, fondo con salpicaduras, mapa enmarcado, sin errores de consola. Detener el servidor.

- [ ] **Step 4: Commit**
```bash
git add public/style.css public/index.html
git commit -m "feat: reestilizado victoriano (pergamino, mapa con edificios, ambiente)"
```

## Task 3: Renderizar fichas como imágenes PNG

**Files:** Modify `public/client.js` (`renderTokens`)

- [ ] **Step 1: Mapear tipos de ficha a imágenes**

En `client.js`, añadir cerca del inicio un mapa de imágenes y reescribir el cuerpo de `renderTokens` para crear un `<img>` dentro de cada `.token`:
```js
const POLICE_COLORS = ['blue', 'green', 'red', 'yellow', 'purple'];
function tokenImg(t) {
  if (t.type === 'detective') {
    const n = parseInt(t.label, 10);
    const color = POLICE_COLORS[(Number.isNaN(n) ? 1 : n) - 1] || 'blue';
    return 'assets/tokens/police-' + color + '.png';
  }
  if (t.type === 'crime') return 'assets/tokens/crime-scene-red.png';
  if (t.type === 'clue') return 'assets/tokens/clue-yellow.png';
  if (t.type === 'victim') return 'assets/tokens/woman.png';
  return 'assets/tokens/patrol.png';
}
```
Y dentro del bucle de `renderTokens`, en lugar de `el.textContent = t.label`, construir:
```js
    const img = document.createElement('img');
    img.src = tokenImg(t);
    img.alt = t.type + (t.label ? ' ' + t.label : '');
    img.draggable = false;
    el.appendChild(img);
```
(Mantener `el.dataset.id`, posición `%`, `makeDraggable`, y la preservación de la ficha en arrastre. Quitar la línea `el.textContent = t.label || ''`.)

- [ ] **Step 2: Verificación en navegador**

Arrancar el servidor, entrar como Detective, pulsar "+ Detective" (n.º 1) y "+ Crimen": deben aparecer los PNG de policía azul y escena del crimen, arrastrables y sincronizados. Sin errores de consola.

- [ ] **Step 3: Suite + commit**
```bash
node --test   # siguen 30/30 (el cambio es sólo de render)
git add public/client.js
git commit -m "feat: fichas renderizadas como imágenes PNG del set victoriano"
```

---

# SUB-PROYECTO 2 — Pipeline del grafo del tablero

## Task 4: Script de construcción del grafo → board-graph.json

**Files:** Create `scripts/build-graph.js`, genera `public/assets/board-graph.json`

- [ ] **Step 1: Crear `scripts/build-graph.js`**

```js
const fs = require('fs');
const path = require('path');

const DBG = path.join(__dirname, '..', 'docs', 'debug');
const full = require(path.join(DBG, 'graph_full.json'));   // { V:[{x,y,r,t}], edges:[[a,b,conf,dist]] }
const cands = require(path.join(DBG, 'curve_cands.json'));  // [[a,b,conf,dist]] (mejor conectividad)
const raw = require(path.join(DBG, 'graph_raw.json'));      // { circles, squares, salmon:[{x,y}] }

const W = 2526, H = 1788;
const V = full.V;
const NC = V.filter((v) => v.t === 'c').length; // 195 (los círculos son los primeros índices)

// 1) Adyacencia bruta (círculo<->cuadrado y cuadrado<->cuadrado) desde el set de candidatos.
const adj = new Map();
const add = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
for (const [a, b] of cands) { add(a, b); add(b, a); }

// 2) Adyacencia círculo->círculo: aristas directas círculo-círculo + pares que comparten cuadrado.
const cadj = new Map(); // circleId -> Map(circleId -> via(squareId|null))
for (let i = 0; i < NC; i++) cadj.set(i, new Map());
for (const [a, b] of cands) {
  if (a < NC && b < NC) { cadj.get(a).set(b, null); cadj.get(b).set(a, null); }
}
for (let s = NC; s < V.length; s++) {
  const circleNb = [...(adj.get(s) || [])].filter((x) => x < NC);
  for (const a of circleNb) for (const b of circleNb) {
    if (a !== b && !cadj.get(a).has(b)) cadj.get(a).set(b, s);
  }
}

// 3) Cosido: conectar componentes aislados al componente mayor por el par de círculos más cercano.
function components() {
  const seen = new Set(); const comps = [];
  for (let i = 0; i < NC; i++) {
    if (seen.has(i)) continue;
    const comp = []; const q = [i]; seen.add(i);
    while (q.length) { const c = q.pop(); comp.push(c); for (const n of cadj.get(c).keys()) if (!seen.has(n)) { seen.add(n); q.push(n); } }
    comps.push(comp);
  }
  return comps;
}
const dist2 = (a, b) => (V[a].x - V[b].x) ** 2 + (V[a].y - V[b].y) ** 2;
let comps = components();
while (comps.length > 1) {
  comps.sort((x, y) => y.length - x.length);
  const main = comps[0]; const other = comps[1];
  let best = null;
  for (const a of main) for (const b of other) {
    const d = dist2(a, b);
    if (!best || d < best.d) best = { a, b, d };
  }
  cadj.get(best.a).set(best.b, null); cadj.get(best.b).set(best.a, null);
  comps = components();
}

// 4) squareAdj (movimiento policial): cuadrado<->cuadrado desde candidatos.
const sadj = {};
for (let s = NC; s < V.length; s++) sadj[s] = [];
for (const [a, b] of cands) {
  if (a >= NC && b >= NC) { sadj[a].push(b); sadj[b].push(a); }
}
for (const k of Object.keys(sadj)) sadj[k] = [...new Set(sadj[k])];

// 5) crimeStarts: círculo más cercano a cada salmon.
const crimeStarts = raw.salmon.map((sp) => {
  let best = 0, bd = Infinity;
  for (let i = 0; i < NC; i++) { const d = (V[i].x - sp.x) ** 2 + (V[i].y - sp.y) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
});

// 6) Emitir nodos con coords en %.
const nodes = V.map((v, id) => ({ id, type: v.t === 'c' ? 'circle' : 'square',
  x: +((v.x / W) * 100).toFixed(3), y: +((v.y / H) * 100).toFixed(3) }));
const circleAdj = {};
for (let i = 0; i < NC; i++) circleAdj[i] = [...cadj.get(i).entries()].map(([circle, via]) => ({ circle, via }));

const out = { meta: { width: W, height: H, circles: NC, squares: V.length - NC }, nodes, circleAdj, squareAdj: sadj, crimeStarts };
fs.writeFileSync(path.join(__dirname, '..', 'public', 'assets', 'board-graph.json'), JSON.stringify(out));
const degs = Object.values(circleAdj).map((a) => a.length);
console.log('board-graph.json escrito. círculos', NC, 'cuadrados', V.length - NC,
  'grado círculo avg', (degs.reduce((a, b) => a + b, 0) / NC).toFixed(2),
  'aislados', degs.filter((d) => !d).length, 'componentes', components().length);
```

- [ ] **Step 2: Ejecutar y verificar salida**

Run: `node scripts/build-graph.js`
Expected: imprime círculos 195, cuadrados 227, **aislados 0**, **componentes 1**; existe `public/assets/board-graph.json`.

- [ ] **Step 3: Commit**
```bash
git add scripts/build-graph.js public/assets/board-graph.json
git commit -m "feat: pipeline del grafo del tablero (board-graph.json)"
```

## Task 5: Módulo runtime board-graph.js + tests

**Files:** Create `board-graph.js`, Test `test/board-graph.test.js`

- [ ] **Step 1: Escribir tests que fallan**

```js
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
```

- [ ] **Step 2: Run para verificar fallo**

Run: `node --test test/board-graph.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `board-graph.js`**

```js
const data = require('./public/assets/board-graph.json');

function neighbors(circleId) { return data.circleAdj[circleId] || []; }
function isAdjacent(a, b) { return neighbors(a).some((n) => n.circle === b); }
function viaSquare(a, b) {
  const n = neighbors(a).find((x) => x.circle === b);
  return n ? n.via : undefined;
}
function squareNeighbors(squareId) { return data.squareAdj[squareId] || []; }
function node(id) { return data.nodes[id]; }

module.exports = { data, neighbors, isAdjacent, viaSquare, squareNeighbors, node };
```

- [ ] **Step 4: Run para verificar pase**

Run: `node --test test/board-graph.test.js` → PASS (6 tests).

- [ ] **Step 5: Commit**
```bash
git add board-graph.js test/board-graph.test.js
git commit -m "feat: módulo board-graph con helpers de adyacencia + tests"
```

---

# SUB-PROYECTO 3 — Modo árbitro (motor + UI)

## Task 6: Campo `mode` y posiciones de árbitro en game-state

**Files:** Modify `game-state.js`, Test `test/game-state.test.js`

- [ ] **Step 1: Tests que fallan (añadir a test/game-state.test.js)**

```js
test('createGame por defecto es modo manual', () => {
  const s = G.createGame();
  assert.strictEqual(s.game.mode, 'manual');
});

test('setMode cambia el modo y refPos existe en referee', () => {
  const s = G.createGame();
  G.setMode(s, 'referee');
  assert.strictEqual(s.game.mode, 'referee');
  assert.deepStrictEqual(s.ref, { jackCircle: null, police: {} });
});

test('viewFor no expone ref.jackCircle a no-Jack', () => {
  const s = G.createGame();
  G.setMode(s, 'referee');
  s.ref.jackCircle = 10;
  const v = G.viewFor(s, 'det1');
  assert.strictEqual(v.ref.jackCircle, undefined);
  // la posición de los policías sí es pública
  assert.deepStrictEqual(v.ref.police, {});
});

test('viewFor expone ref.jackCircle a Jack', () => {
  const s = G.createGame();
  G.setMode(s, 'referee');
  s.ref.jackCircle = 10;
  const v = G.viewFor(s, 'jack');
  assert.strictEqual(v.ref.jackCircle, 10);
});
```

- [ ] **Step 2: Run → FAIL.** `node --test test/game-state.test.js`

- [ ] **Step 3: Implementar**

- En `createGame`, añadir `mode: 'manual'` dentro de `game`, y al objeto raíz `ref: { jackCircle: null, police: {} }`.
- Añadir:
```js
function setMode(state, mode) {
  state.game.mode = (mode === 'referee') ? 'referee' : 'manual';
  state.ref = { jackCircle: null, police: {} };
}
```
- En `viewFor`, tras fijar `view.jack`, añadir el filtrado de `ref`:
```js
  view.ref = {
    police: state.ref ? state.ref.police : {},
  };
  if (role === 'jack' && state.ref) view.ref.jackCircle = state.ref.jackCircle;
```
- Exportar `setMode`.

(El `ref.jackCircle` es info privada del asesino — igual que `jack.path`; `ref.police` es pública.)

- [ ] **Step 4: Run → PASS.** Commit:
```bash
git add game-state.js test/game-state.test.js
git commit -m "feat: modo de juego y posiciones de árbitro en game-state"
```

## Task 7: Motor árbitro referee.js + tests

**Files:** Create `referee.js`, Test `test/referee.test.js`

Reglas (usa `board-graph.js` como `B` y `game-state.js` como `G`). Todas las funciones reciben `state` y devuelven `{ ok, reason }` (y mutan en caso ok).

- [ ] **Step 1: Tests que fallan** (`test/referee.test.js`)

```js
const { test } = require('node:test');
const assert = require('node:assert');
const G = require('../game-state');
const B = require('../board-graph');
const R = require('../referee');

function refGame() { const s = G.createGame(); G.setMode(s, 'referee'); return s; }

test('startCrimeAt fija posición del asesino y paso 0', () => {
  const s = refGame();
  const c = B.data.crimeStarts[0];
  const r = R.startCrimeAt(s, c);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(s.ref.jackCircle, c);
  assert.strictEqual(s.jack.path[0].circle, c);
  assert.strictEqual(s.game.phase, 'hunt');
});

test('moveJack normal acepta vecino y rechaza no-vecino', () => {
  const s = refGame();
  const c = B.data.crimeStarts[0];
  R.startCrimeAt(s, c);
  const nb = B.neighbors(c)[0].circle;
  assert.strictEqual(R.moveJack(s, nb, 'normal').ok, true);
  assert.strictEqual(s.ref.jackCircle, nb);
  // un círculo lejano cualquiera que no sea vecino
  let far = 0; while (far === nb || B.isAdjacent(nb, far)) far++;
  assert.strictEqual(R.moveJack(s, far, 'normal').ok, false);
});

test('moveJack normal se bloquea si un policía ocupa el cuadrado via', () => {
  const s = refGame();
  // buscar un par origen->destino cuya via no sea null
  let from = -1, to = -1, via = null;
  for (let i = 0; i < 195 && from < 0; i++) {
    for (const n of B.neighbors(i)) if (n.via != null) { from = i; to = n.circle; via = n.via; break; }
  }
  R.startCrimeAt(s, from);
  s.ref.police['det1'] = via;              // policía bloquea el cuadrado intermedio
  const r = R.moveJack(s, to, 'normal');
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /bloque/i);
});

test('moveJack carruaje cruza bloqueo y llega a 2 saltos', () => {
  const s = refGame();
  let from = -1, to = -1, via = null;
  for (let i = 0; i < 195 && from < 0; i++) {
    for (const n of B.neighbors(i)) if (n.via != null) { from = i; to = n.circle; via = n.via; break; }
  }
  R.startCrimeAt(s, from);
  s.ref.police['det1'] = via;
  assert.strictEqual(R.moveJack(s, to, 'carriage').ok, true); // ignora bloqueo
  assert.strictEqual(s.jack.carriages, 1);
});

test('movePolice valida distancia <=2 y no terminar sobre otro policía', () => {
  const s = refGame();
  // dos cuadrados a distancia 1
  const sq = +Object.keys(B.data.squareAdj).find((k) => B.squareNeighbors(+k).length > 0);
  const adjSq = B.squareNeighbors(sq)[0];
  s.ref.police['det1'] = sq;
  assert.strictEqual(R.movePolice(s, 'det1', adjSq).ok, true);
  assert.strictEqual(s.ref.police['det1'], adjSq);
  // otro policía no puede terminar encima
  s.ref.police['det2'] = sq;
  assert.strictEqual(R.movePolice(s, 'det2', adjSq).ok, false);
});

test('searchClue automático coloca pista si el asesino pasó', () => {
  const s = refGame();
  const c = B.data.crimeStarts[0];
  R.startCrimeAt(s, c);
  // un cuadrado adyacente al círculo c
  const via = B.neighbors(c).find((n) => n.via != null);
  if (via) {
    s.ref.police['det1'] = via.via;
    const r = R.searchClue(s, 'det1', c); // c está en la ruta (paso 0)
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.passed, true);
  }
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implementar `referee.js`**

```js
const B = require('./board-graph');
const G = require('./game-state');

const ALLEY_RADIUS = 9; // % de distancia en el mapa (callejón simplificado)

function dist(a, b) {
  const na = B.node(a), nb = B.node(b);
  return Math.hypot(na.x - nb.x, na.y - nb.y);
}
function occupiedSquares(state) { return new Set(Object.values(state.ref.police)); }

function startCrimeAt(state, circle) {
  if (B.node(circle) == null || B.node(circle).type !== 'circle') return { ok: false, reason: 'círculo inválido' };
  state.ref.jackCircle = circle;
  G.startCrime(state, circle); // fija fase hunt + paso 0 con este círculo
  return { ok: true };
}

function legalNormalTargets(state) {
  const from = state.ref.jackCircle;
  const occ = occupiedSquares(state);
  return B.neighbors(from).filter((n) => n.via == null || !occ.has(n.via)).map((n) => n.circle);
}
function legalCarriageTargets(state) {
  const from = state.ref.jackCircle;
  const set = new Set();
  for (const n of B.neighbors(from)) for (const m of B.neighbors(n.circle)) if (m.circle !== from) set.add(m.circle);
  return [...set];
}
function legalAlleyTargets(state) {
  const from = state.ref.jackCircle;
  const normal = new Set(B.neighbors(from).map((n) => n.circle));
  const out = [];
  for (let i = 0; i < B.data.meta.circles; i++) {
    if (i !== from && !normal.has(i) && dist(from, i) <= ALLEY_RADIUS) out.push(i);
  }
  return out;
}

function moveJack(state, circle, kind) {
  if (state.ref.jackCircle == null) return { ok: false, reason: 'sin posición' };
  let legal, special = null;
  if (kind === 'carriage') {
    if (state.jack.carriages <= 0) return { ok: false, reason: 'sin carruajes' };
    legal = legalCarriageTargets(state); special = 'carriage';
  } else if (kind === 'alley') {
    if (state.jack.alleys <= 0) return { ok: false, reason: 'sin callejones' };
    legal = legalAlleyTargets(state); special = 'alley';
  } else {
    legal = legalNormalTargets(state);
  }
  if (!legal.includes(circle)) return { ok: false, reason: kind === 'normal' ? 'movimiento ilegal o bloqueado' : 'destino fuera de alcance' };
  G.logJackStep(state, circle, special); // descuenta contadores y registra
  state.ref.jackCircle = circle;
  return { ok: true };
}

function reachableSquares(state, from, steps) {
  const occ = occupiedSquares(state);
  const seen = new Set([from]); let frontier = [from];
  for (let i = 0; i < steps; i++) {
    const next = [];
    for (const s of frontier) for (const n of B.squareNeighbors(s)) if (!seen.has(n)) { seen.add(n); next.push(n); }
    frontier = next;
  }
  seen.delete(from);
  // se puede pasar por cuadrados ocupados, pero no terminar en uno ocupado
  return [...seen].filter((s) => !occ.has(s));
}

function movePolice(state, who, square) {
  const from = state.ref.police[who];
  if (from == null) { // primera colocación libre
    if (occupiedSquares(state).has(square)) return { ok: false, reason: 'cuadrado ocupado' };
    state.ref.police[who] = square; return { ok: true };
  }
  if (!reachableSquares(state, from, 2).includes(square)) return { ok: false, reason: 'fuera de alcance o cuadrado ocupado' };
  state.ref.police[who] = square;
  return { ok: true };
}

// El policía sólo puede interrogar/arrestar círculos adyacentes a su cuadrado.
function circlesAroundPolice(state, who) {
  const sq = state.ref.police[who];
  if (sq == null) return [];
  // círculos cuyo via toca este cuadrado, o conectados directamente
  const out = new Set();
  for (let c = 0; c < B.data.meta.circles; c++) {
    for (const n of B.neighbors(c)) if (n.via === sq) { out.add(c); }
  }
  return [...out];
}

function searchClue(state, who, circle) {
  if (!circlesAroundPolice(state, who).includes(circle)) return { ok: false, reason: 'círculo no adyacente' };
  const passed = G.checkClue(state, circle);
  state.log.push('Pista en ' + circle + ': ' + (passed ? 'SÍ' : 'no'));
  return { ok: true, passed };
}

function arrest(state, who, circle) {
  if (!circlesAroundPolice(state, who).includes(circle)) return { ok: false, reason: 'círculo no adyacente' };
  const caught = G.checkArrest(state, circle);
  if (caught) G.endGame(state, 'Policía');
  return { ok: true, caught };
}

module.exports = { ALLEY_RADIUS, startCrimeAt, moveJack, movePolice, searchClue, arrest,
  legalNormalTargets, legalCarriageTargets, legalAlleyTargets, reachableSquares, circlesAroundPolice };
```

- [ ] **Step 4: Run → PASS.** Ajustar si algún test de adyacencia/cuadrado no encuentra datos (usar otro índice). Commit:
```bash
git add referee.js test/referee.test.js
git commit -m "feat: motor árbitro (validación de movimiento, bloqueo, pistas, arresto)"
```

## Task 8: Wiring del modo en el servidor + tests

**Files:** Modify `server.js`, Test `test/server.test.js`

- [ ] **Step 1: Tests que fallan** (añadir a test/server.test.js, reutilizan `stateWaiter`)

```js
const B = require('../board-graph');

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
  assert.strictEqual(dv.ref.jackCircle, undefined); // detective no ve la posición de Jack
  jack.close(); det.close();
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
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implementar wiring** en `server.js`, dentro de `io.on('connection')`. Requiere `const R = require('./referee');` arriba.

```js
    socket.on('setMode', ({ mode }) => {
      if (state.game.phase !== 'lobby' && state.game.phase !== 'crime-prep') return; // sólo antes de la caza
      G.setMode(state, mode);
      sendStates();
    });

    // --- Modo árbitro ---
    socket.on('ref:startCrime', ({ circle }) => {
      if (roleOf() !== 'jack' || state.game.mode !== 'referee') return;
      const r = R.startCrimeAt(state, circle);
      if (!r.ok) return socket.emit('ref:rejected', r);
      sendStates();
    });
    socket.on('ref:moveJack', ({ circle, kind }) => {
      if (roleOf() !== 'jack' || state.game.mode !== 'referee') return;
      const r = R.moveJack(state, circle, kind || 'normal');
      if (!r.ok) { state.log.push('Movimiento rechazado: ' + r.reason); socket.emit('ref:rejected', r); sendStates(); return; }
      sendStates();
    });
    socket.on('ref:movePolice', ({ square }) => {
      if (state.game.mode !== 'referee') return;
      const who = roleOf();
      const r = R.movePolice(state, who, square);
      if (!r.ok) { socket.emit('ref:rejected', r); return; }
      sendStates();
    });
    socket.on('ref:search', ({ circle }) => {
      if (state.game.mode !== 'referee') return;
      const r = R.searchClue(state, roleOf(), circle);
      if (!r.ok) return socket.emit('ref:rejected', r);
      io.emit('clue:result', { circle, passed: r.passed });
      const jid = jackSocketId(); if (jid) io.to(jid).emit('clue:asked', { circle });
      sendStates();
    });
    socket.on('ref:arrest', ({ circle }) => {
      if (state.game.mode !== 'referee') return;
      const r = R.arrest(state, roleOf(), circle);
      if (!r.ok) return socket.emit('ref:rejected', r);
      io.emit('arrest:result', { circle, caught: r.caught });
      const jid = jackSocketId(); if (jid) io.to(jid).emit('arrest:attempt', { circle });
      sendStates();
    });
```

- [ ] **Step 4: Run → PASS** (todos: game-state + board-graph + referee + server). Commit:
```bash
git add server.js test/server.test.js
git commit -m "feat: wiring del modo árbitro en el servidor"
```

## Task 9: UI cliente mode-aware (selector + tablero clicable)

**Files:** Modify `public/index.html`, `public/client.js`, `public/style.css`

- [ ] **Step 1: Selector de modo en el lobby**

`index.html`: en `#lobby`, antes del botón Entrar, añadir:
```html
    <label style="font-size:13px;color:#b89b6a;letter-spacing:.1em;">MODO DE JUEGO</label>
    <select id="mode">
      <option value="manual">Partida (manual, fichas libres)</option>
      <option value="referee">Aprendizaje (árbitro valida todo)</option>
    </select>
```
`client.js` en `joinBtn.onclick`, tras `socket.emit('join',...)`: `socket.emit('setMode', { mode: $('mode').value });`
Mostrar el modo en la barra de estado: en `renderStatus`, añadir el modo a `#phaseLabel` o un nuevo `#modeLabel` (`s.game.mode === 'referee' ? 'Aprendizaje' : 'Partida'`).

- [ ] **Step 2: Capa de nodos clicable (sólo modo referee)**

Añadir a `index.html` dentro de `#boardWrap`, tras `#tokenLayer`: `<svg id="nodeLayer" viewBox="0 0 100 100" preserveAspectRatio="none" hidden></svg>` con CSS `#nodeLayer{position:absolute;inset:0;width:100%;height:100%;}` y estilos para `.node-circle{fill:rgba(180,150,95,.25);stroke:#7a140f;stroke-width:.15;cursor:pointer;} .node-circle.legal{fill:rgba(120,200,120,.55);} .node-square{fill:rgba(40,40,60,.5);stroke:#85b7eb;stroke-width:.12;cursor:pointer;} .node-square.legal{fill:rgba(120,200,120,.55);}` (radios pequeños en unidades de viewBox, p. ej. círculos r=0.7, cuadrados como `<rect>` de 1×1).

`client.js`: cargar el grafo una vez (`fetch('assets/board-graph.json')`), y una función `renderNodes(state)` que:
- Si `state.game.mode !== 'referee'`: ocultar `#nodeLayer`, mostrar fichas arrastrables como hoy.
- Si `referee`: mostrar `#nodeLayer`; dibujar círculos y cuadrados; pintar `.legal` los destinos válidos según el rol y el modo de acción seleccionado.
  - **Jack**: botones de acción normal/carruaje/callejón; al elegir uno, resaltar destinos (pedir al cliente que los calcule con una copia de la lógica de `legal*Targets`, o —preferido— el servidor envía `state.ref.legal` para Jack). **Decisión:** el servidor incluye en la vista de Jack `ref.legalNormal/legalCarriage/legalAlley` (arrays de circleId) calculados con `referee.js`, así el cliente sólo pinta y no duplica lógica. Añadir esto en `viewFor` SOLO para rol jack en modo referee — implementar en game-state como parte de la vista, importando referee perezosamente, o calcular en server antes de emitir. Implementar en **server.js**: al construir la vista de Jack, adjuntar los destinos legales. (Mantener la regla: no enviar a otros roles.)
  - **Policía**: resaltar cuadrados alcanzables (`reachableSquares`) y, tras moverse, los círculos adyacentes para buscar/arrestar. El servidor adjunta `ref.legalSquares` y `ref.searchable` a la vista de ese policía.
- Clicks emiten `ref:moveJack`/`ref:movePolice`/`ref:search`/`ref:arrest`.

> Nota de implementación: para no duplicar la lógica de legalidad en el cliente, el servidor calcula los destinos legales por-rol y los incluye en la vista (`viewFor` se extiende en server.js tras obtener la vista base, usando `referee.js`). Esto mantiene una sola fuente de verdad.

- [ ] **Step 3: Posición de fichas en modo referee**

En modo referee, el peón del asesino no se muestra a la policía (oculto); los peones de policía se dibujan en su cuadrado (`state.ref.police`). Render: en `renderNodes`, colocar imágenes `police-{color}.png` en las coords del cuadrado de cada policía, y (solo en la vista de Jack) `jack.png` en `ref.jackCircle`.

- [ ] **Step 4: Verificación en navegador (Preview MCP)**

Levantar el servidor, abrir dos pestañas (Jack + Detective) en modo Aprendizaje:
- Jack: `ref:startCrime` en un crimeStart; aparecen destinos normales resaltados; click mueve; carruaje/callejón resaltan sus destinos.
- Detective: cuadrados alcanzables resaltados; mover; buscar pista en un círculo adyacente → resultado automático; arresto.
- Confirmar que el detective NO ve `ref.jackCircle` (revisar `lastState.ref` en consola).
Sin errores de consola.

- [ ] **Step 5: Suite completa + commit**
```bash
node --test   # todo verde
git add public/index.html public/client.js public/style.css
git commit -m "feat: UI mode-aware con tablero clicable para el modo árbitro"
```

---

## Verificación final
- `node --test`: game-state + board-graph + referee + server, todos verdes.
- Navegador: modo Partida (fichas PNG arrastrables, reestilizado) y modo Aprendizaje (click-para-mover validado, pistas/arrestos automáticos), ambos sin filtrar info privada de Jack.
- Revisión de código final del conjunto.

## Auto-revisión del plan
- **Cobertura del spec:** reestilizado (T1–T3), pipeline grafo (T4–T5), modo+posiciones (T6), motor árbitro (T7), wiring servidor (T8), UI mode-aware (T9). Sub-proyectos 1/2/3 cubiertos.
- **Compatibilidad:** `mode` default `manual`; eventos existentes intactos; los 30 tests previos no se modifican (sólo se añaden tests). 
- **Seguridad:** `ref.jackCircle` filtrado como info privada (test en T6 y T8); destinos legales se calculan en servidor y sólo se adjuntan a la vista del rol correspondiente.
- **Riesgo conocido:** grafo autodetectado con cosido — conectividad garantizada por test; fidelidad "pragmática" aceptada por el usuario. Callejón simplificado por radio (sin datos de manzanas).
