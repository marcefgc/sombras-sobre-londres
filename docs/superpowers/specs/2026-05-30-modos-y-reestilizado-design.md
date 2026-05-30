# Modos de juego (Partida / Aprendizaje) + reestilizado victoriano

**Fecha:** 2026-05-30
**Estado:** Aprobado para planificación
**Rama:** feat/tablero-online (continúa sobre el MVP ya construido — 30 tests verdes)

## Resumen

Ampliar "Sombras sobre Londres" con:
1. **Dos modos de juego** seleccionables en el lobby:
   - **Partida (`manual`)** — el juego ya construido: fichas arrastrables, honor, jugadores auto-aplican las reglas de movimiento.
   - **Aprendizaje (`referee`)** — nuevo modo árbitro: tablero con círculos/cuadrados clicables; el servidor valida cada movimiento (adyacencia, bloqueos) y resuelve pistas/arrestos automáticamente. Para aprender las reglas jugando 1+ veces antes de pasar al modo Partida.
2. **Reestilizado victoriano** (ambos modos) con la biblioteca de assets nueva (tokens PNG, pergamino, mapa con edificios, decoración) y la paleta/tipografías de `docs/Whitechapel Map.html`.

No se rompe nada de lo existente: el modo `manual` conserva su comportamiento; los 30 tests actuales siguen verdes.

## Datos disponibles (provistos por el usuario en docs/)

- `docs/assets/` — biblioteca gráfica: `whitechapel-map-buildings.jpg` (2526×1788), `parchment.png`, `tokens/*.png` (jack, police-{blue,green,red,yellow,purple}, clue-yellow, crime-scene-red, false-clue-blue, coach, alley, patrol, woman, wretched, time-of-crime), `decor/*.png` (blood splatters, fingerprint, magnifier, wax-seal), `elements/*.png` (jacks-move-track, police-notebook-{color}).
- `docs/Whitechapel Map.html` — guía de estilo: paleta (`--ink:#3a281a --paper:#e7d8b4 --blood:#7a140f --cream:#f6ecd2`), tipografías serif (Iowan Old Style/Palatino/Georgia), mapa enmarcado, tarjetas de ficha.
- `docs/debug/graph_full.json` — `V` (422 vértices: 195 círculos `t:'c'` + 227 cuadrados `t:'s'`, con x,y en 2526×1788) y `edges` (524, formato `[a,b,conf,dist]`).
- `docs/debug/graph_raw.json` — `circles`, `squares`, `salmon` (8 círculos de inicio de crimen).
- `docs/debug/curve_cands.json` — 744 aristas candidatas (mejor conectividad).

**Hallazgo de viabilidad:** las aristas de `graph_full` por sí solas dejan el grafo fragmentado (49/195 alcanzables). Usando `curve_cands` (grado medio ~4) + un paso de "cosido" que conecta cada componente aislado a su círculo más cercano se obtiene un tablero **totalmente conectado** (195/195) con grado realista. Decisión del usuario: modo árbitro **"completo pragmático"**, mapa **con edificios**.

## Sub-proyecto 1 — Reestilizado victoriano (modo Partida)

Aplica el estilo nuevo al juego actual sin cambiar su lógica.

- Copiar la biblioteca de assets a `public/assets/` (tokens/, decor/, elements/, parchment.png, whitechapel-map-buildings.jpg). El mapa de fondo pasa a ser `whitechapel-map-buildings.jpg`.
- Reescribir `public/style.css` con la paleta/tipografías de la guía: fondo pergamino, serif, acentos de sangre, mapa enmarcado (`.map-frame`), botones y paneles tipo carta, salpicaduras de ambiente de fondo (decor, `position:fixed`, no interfieren con clicks).
- Las fichas (`renderTokens`) pasan a renderizarse como **imágenes PNG** según `type`:
  `detective→police-{color}.png` (color por label/índice), `crime→crime-scene-red.png`, `clue→clue-yellow.png`, `victim→woman.png`. Se mantienen arrastrables.
- Panel de Jack y controles con estética de carta/pergamino; cabecera con título serif.
- Sin cambios de comportamiento ni de eventos; los 30 tests siguen verdes.

## Sub-proyecto 2 — Pipeline del grafo del tablero (datos)

- Script offline `scripts/build-graph.js` (sólo dev): lee `docs/debug/graph_full.json`, `docs/debug/curve_cands.json` y `docs/debug/graph_raw.json`; emite `public/assets/board-graph.json`:
  - `nodes`: `[{ id, type:'circle'|'square', x, y }]` con **x,y en % de 2526×1788**.
  - `circleAdj`: `{ [circleId]: [{ circle, via }] }` — vecinos de cada círculo y el cuadrado intermedio (`via`, o `null` si conexión directa/cosida). Derivado de aristas círculo-círculo directas + pares de círculos que comparten un cuadrado.
  - `squareAdj`: `{ [squareId]: [squareId...] }` — cuadrados vecinos (movimiento policial).
  - `crimeStarts`: `[circleId...]` — el círculo más cercano a cada uno de los 8 salmon.
  - Paso de **cosido**: tras derivar `circleAdj`, calcular componentes conexos; mientras haya >1, unir el par de círculos más cercano (euclidiano) entre el componente mayor y otro componente, con `via:null`. Resultado: un único componente.
- Módulo runtime `board-graph.js` (require del JSON) con helpers puros: `neighbors(circleId)`, `isAdjacent(a,b)`, `squareNeighbors(squareId)`, `circleById(id)`.
- Tests: 195 círculos / 227 cuadrados, `circleAdj` simétrico, **0 círculos aislados**, **un solo componente conexo**, los 8 `crimeStarts` son círculos válidos, coords en rango 0–100.

## Sub-proyecto 3 — Modo árbitro (motor + UI)

### Estado y selección de modo
- `game.mode: 'manual' | 'referee'` (default `'manual'`). Se elige en el lobby (selector) y se **bloquea** al iniciar la caza. La barra de estado muestra el modo. En `referee`, además se trackea la posición de cada policía (`square`) y la posición actual del asesino como `circleId` del grafo (no número escrito).

### Motor árbitro (lógica pura en `referee.js`, testeable, usada por el servidor sólo en modo `referee`)
- **Posiciones**: asesino en un `circleId`; cada policía en un `squareId`.
- **Movimiento del asesino** (valida y devuelve `{ok, reason}`):
  - *Normal*: el círculo destino debe ser vecino y el cuadrado `via` no puede estar ocupado por un policía (bloqueo). `via:null` siempre pasable.
  - *Carruaje*: destino alcanzable en 2 saltos de adyacencia (vecino-de-vecino), ignorando bloqueos; descuenta contador.
  - *Callejón* (simplificado): destino = cualquier círculo dentro de un radio corto (p. ej. ≤ 9% de distancia en el mapa) que no sea vecino normal; descuenta contador.
  - Registra el paso en la ruta (reusa `logJackStep` con el círculo destino).
- **Movimiento policial**: destino a ≤2 cuadrados de su posición (BFS sobre `squareAdj`), sin terminar en un cuadrado ocupado por otro policía.
- **Buscar pista**: policía nombra un círculo adyacente a su cuadrado → el servidor resuelve con la ruta real (reusa `checkClue`) y coloca pista amarilla automáticamente.
- **Arresto**: policía nombra un círculo adyacente → reusa `checkArrest`.
- Las condiciones de victoria (arresto, guarida, amanecer) y el filtrado por rol se reutilizan tal cual.

### UI cliente (modo `referee`)
- Capa de nodos clicable sobre el mapa: círculos y cuadrados como puntos posicionados por % del grafo.
- **Asesino**: al seleccionar modo de movimiento (normal/carruaje/callejón) se **resaltan los destinos legales**; clic mueve. La ruta privada se muestra como hasta ahora.
- **Policía**: clic en un cuadrado destino válido (resaltado) mueve su peón; luego clic en un círculo adyacente para "buscar pista" o "arrestar" (botón de modo). El servidor valida y responde.
- Los bloqueos y destinos ilegales se rechazan con mensaje en el log.
- En modo `manual` la capa de nodos no se usa (fichas arrastrables como hoy).

## No-objetivos (de esta iteración)
- Callejón fiel por manzanas (no hay datos) — se usa la versión simplificada por radio.
- Fase de patrullas ocultas (sigue fuera de alcance, como en el MVP).
- Corrección manual fina del grafo autodetectado (puede tener imperfecciones menores; el cosido garantiza jugabilidad).

## Pruebas
- Sub-1: verificación visual en navegador (Preview MCP): estilo aplicado, tokens PNG, sin errores; los 30 tests siguen verdes.
- Sub-2: tests unitarios del grafo (estructura, simetría, conectividad).
- Sub-3: tests unitarios de `referee.js` (adyacencia, bloqueo, carruaje, callejón, movimiento policial, pista/arresto) + tests de integración de socket en modo `referee` + verificación en navegador de click-para-mover.

## Compatibilidad
- El modo `manual` y todos sus eventos/tests actuales se conservan sin cambios de comportamiento. El campo `mode` default `'manual'` mantiene el flujo existente intacto.
