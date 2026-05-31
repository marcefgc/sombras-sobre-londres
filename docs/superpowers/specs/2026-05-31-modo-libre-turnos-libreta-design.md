# Modo libre: turnos guiados + libreta de Jack + policías por color

**Fecha:** 2026-05-31
**Estado:** Aprobado para planificación
**Rama:** master

## Objetivo

Llevar el **modo libre** (Partida/manual) a una experiencia de mesa fiel pero honesta:
turnos guiados, la **libreta de Jack** para registrar sus movimientos a mano (con el
diseño del asset `jacks-move-track.png`), y un modelo de **policía por color** donde cada
jugador elige qué fichas controla. El modo Aprendizaje (referee) se adapta al nuevo modelo
por color y debe seguir funcionando.

## Sub-proyecto 1 — Modelo de policía por color (lobby + estado; ambos modos)

- El lobby ofrece rol: **Jack / Policía / Espectador**. Al elegir **Policía**, el jugador
  marca con casillas **qué colores controla** (blue, green, red, yellow, purple); solo se
  ofrecen los colores **libres**. Un policía solo puede tomar las 5; varios se reparten.
- Estado:
  - `state.jackName`: nombre que reservó Jack (singular, persiste para reconexión).
  - `state.colorOwners`: `{ blue:name|null, ... }` — qué jugador (por nombre) posee cada
    color; persiste para reconexión e impide que otro lo tome.
  - `state.players[socketId] = { name, role, colors: [] }` (colors solo para police).
- `addPlayer(state, socketId, name, role, colors)` → `{ ok }` o `{ ok:false, reason }`:
  - jack: singular (rechaza si `jackName` ya es de otro nombre).
  - police: requiere ≥1 color; rechaza si algún color pedido lo posee **otro** nombre.
    Reclama los colores (`colorOwners[c]=name`) y guarda `player.colors`.
  - spectator: sin reclamo.
- Las fichas/peones se identifican por **color** en todo el estado del árbitro:
  `ref.police[color]`, `ref.moved[color]`, `ref.acted[color]`.
- `viewFor` mantiene el filtrado del secreto de Jack (igual que hoy). El servidor añade a la
  vista de cada socket `view.me = { role, colors }` para que el cliente sepa sus fichas.

### Adaptación del modo Aprendizaje (referee) a colores
- `viewForRole`/handlers se re-claван de rol-detective a **color**: un policía con varios
  colores tiene **varias fichas**, cada una con su movimiento + acción por turno de policía.
- El cliente referee elige con **qué color** actúa (selector de ficha) y el servidor valida
  por color (`ref.moved[color]`, `ref.acted[color]`).
- `allPoliceActed` se evalúa sobre los **colores en juego** (los reclamados por policías
  presentes), no sobre roles.

## Sub-proyecto 2 — Turnos guiados + libreta de Jack (modo libre)

### Turnos guiados (sin bloquear)
- `game.turn` (`'jack' | 'police'`) también se usa en modo manual durante `hunt`.
- Indicador de turno en la barra y botón **"Pasar turno"** (Jack pasa tras registrar; la
  policía pasa tras mover). **No** se bloquea el arrastre de fichas (honesto). El coach guía.
- El contador de 15 avanza cuando Jack registra un paso en su libreta.

### Libreta de Jack ("Jack's Move Track")
- Panel privado de Jack en modo libre con el **diseño del asset**: fila de movimientos
  **1–15**, filas **Noche 1–4**, casilla **Guarida**, celdas para el número de círculo de
  cada paso. Fondo `assets/elements/jacks-move-track.png` o una rejilla CSS equivalente.
- Jack escribe/define la guarida y va anotando el número de cada paso (reusa
  `jack:setLair` y `jack:logStep`). La celda del paso actual se resalta.
- Botones de **carruaje/callejón** con sus tokens (`coach.png`/`alley.png`) y contadores.

## Sub-proyecto 3 — Otros elementos gráficos

- **Libretas de policía por color** (`police-notebook-*.png`) en la vista del policía
  (una por cada color que controle), a modo de panel temático.
- Tokens de **carruaje/callejón** en la libreta de Jack.

## No-objetivos (de esta iteración)

- Víctimas señuelo, faroles de patrulla, doble crimen de la noche 3, fichas azules y cartas.
- Recuperar los números impresos del mapa (se mantiene el registro por número introducido
  por Jack en modo libre; los círculos del tablero del modo libre no son clicables — se
  arrastran fichas y Jack anota números a mano, como en la mesa).

## Pruebas

- Unitarias: reclamo/reparto/liberación de colores; `addPlayer` por color; alternancia de
  turno; re-clave del árbitro por color (mover/buscar/arrestar/auto-fin por color).
- Integración por socket: dos policías se reparten colores; un policía toma 5; turno guiado.
- Navegador: lobby con selección de color, libreta de Jack registra pasos, turnos, libretas
  de policía. El modo Aprendizaje sigue jugable con el modelo por color.

## Compatibilidad / riesgo

Es un refactor del modelo de jugador (de `det1–det5` a `police`+colores) que toca lobby,
estado, servidor, cliente y tests de ambos modos. Se construye en 3 sub-proyectos
verificables; tras cada uno la suite debe quedar verde.
