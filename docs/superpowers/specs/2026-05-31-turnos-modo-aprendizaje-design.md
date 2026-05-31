# Caza por turnos + policía funcional (modo Aprendizaje)

**Fecha:** 2026-05-31
**Estado:** Aprobado para planificación
**Rama:** master (continúa sobre el juego ya publicado)

## Problema

En el modo Aprendizaje (`referee`):
1. **La policía no puede colocarse ni moverse.** Los cuadrados "legales" se calculan solo
   desde la posición actual del peón; antes de colocarse no tiene posición, así que la
   lista queda vacía y no hay nada clicable.
2. **No hay turnos.** El servidor no tiene noción de turno: Jack se mueve sin límite sin
   que la policía juegue.

## Objetivo (alcance acordado: "caza por turnos jugable")

Hacer la **caza** del modo Aprendizaje fiel y jugable: orden de turnos real, y policía que
se coloca, se mueve y actúa. Se mantiene la preparación simple actual (Jack fija guarida y
comete el crimen directo). El modo Partida (manual) **no se toca**.

Fuera de alcance: víctimas señuelo, matar-ya-o-esperar, faroles de patrulla, doble crimen
de la noche 3, fichas azules y cartas de variante (iteración futura).

## Modelo de turnos

- Nuevo `game.turn`: `'jack' | 'police'` (relevante solo en `referee` durante `hunt`).
- `state.ref` gana `moved: {}` y `acted: {}` (objetos keyed por rol de detective) que
  registran qué peones ya se movieron/actuaron en el turno de policía en curso.
- **Inicio:** al cometer el crimen (`startCrimeAt`) → `turn = 'jack'`, `moved/acted` vacíos.
- **Turno de Jack:** un único movimiento (normal/carruaje/callejón). Al confirmarse →
  `turn = 'police'` y se vacían `moved/acted`. El carruaje sigue siendo un turno.
- **Turno de la policía:** cada peón puede **moverse una vez** (0–2 cuadrados) y hacer
  **una acción** (buscar pista o arrestar). El turno de policía termina:
  - automáticamente cuando **todos los roles detective presentes** han actuado, o
  - manualmente cuando un detective pulsa **"Terminar turno de policía"**.
  Al terminar → `turn = 'jack'`.

## Reglas del motor (`referee.js`, puras y testeables)

- `moveJack`: rechaza si `game.turn !== 'jack'` (`'no es el turno de Jack'`). Tras mover con
  éxito: `game.turn = 'police'`, `ref.moved = {}`, `ref.acted = {}`. (Mantiene el tope de 15
  y la regla del carruaje que cruza bloqueos, ya existentes.)
- `movePolice(state, who, square)`: rechaza si `turn !== 'police'` o si `ref.moved[who]`.
  - Primera colocación (`police[who]` ausente): **cualquier** cuadrado no ocupado es válido.
  - Después: `reachableSquares(≤2)`. En ambos casos marca `ref.moved[who] = true`.
- `searchClue` / `arrest`: rechazan si `turn !== 'police'` o si `ref.acted[who]`. En éxito
  marcan `ref.acted[who] = true`.
  - **Fidelidad de pista:** una búsqueda sobre el círculo **actual** de Jack NO revela pista
    (las pistas marcan por dónde *pasó*, no dónde *está*). `passed = checkClue(circle) &&
    circle !== jackCircleActual`.
- `endPoliceTurn(state)`: `game.turn = 'jack'`, vacía `moved/acted`.
- `allPoliceActed(state, detRolesPresentes)`: helper para el auto-fin (la lista de roles
  presentes la aporta el servidor, que conoce `players`).

## Servidor (`server.js`)

- `ref:moveJack` ya delega en `R.moveJack` (ahora con guard de turno).
- `ref:movePolice` / `ref:search` / `ref:arrest`: delegan en las funciones (ahora con
  guards de turno y por-peón). Tras una acción con éxito, el servidor comprueba el auto-fin:
  si todos los roles `det*` presentes están en `ref.acted` → `R.endPoliceTurn`.
- Nuevo `ref:endPoliceTurn`: solo rol detective, modo referee, turno policía → `R.endPoliceTurn`.
- `viewForRole`:
  - **Jack:** los destinos legales (`ref.legal.*`) solo se calculan cuando `turn === 'jack'`;
    en turno de policía van vacíos (no se resalta nada).
  - **Detective:** `legalSquares` = si su peón no está colocado → **todos** los cuadrados no
    ocupados; si está colocado → `reachableSquares(≤2)`. Solo cuando `turn === 'police'` y el
    peón no se ha movido. `searchable` solo cuando `turn === 'police'`, el peón está colocado
    y no ha actuado.
  - Se incluye `game.turn` (ya viaja en `game`) y `ref.moved`/`ref.acted` (públicos) para que
    el cliente muestre el estado.

## Cliente (`public/client.js`, `index.html`, `style.css`)

- **Indicador de turno** en la barra de estado (solo referee): "Turno: Jack 🔪" / "Turno:
  Policía 🔎".
- Cuando **no es tu turno**, no hay destinos resaltados (el servidor los vacía) y el coach lo
  explica.
- **Botón "Terminar turno de policía"** para detectives (emite `ref:endPoliceTurn`).
- `coachTip` se amplía para guiar por turnos (esperar / colocarse / mover+actuar / terminar).
- Sin cambios en el modo Partida.

## Modelo de peones

Cada rol detective presente (det1–det5) controla su propio peón. Con pocos jugadores hay
pocos peones (adaptación digital; con más amigos se eligen más detectives para acercarse a
los 5 del juego de mesa).

## Simplificaciones conscientes

- La 1ª colocación se permite en **cualquier** cuadrado (el grafo no marca los cuadrados de
  borde amarillo de inicio).
- Si no hay ningún detective presente, el turno de policía no se auto-resuelve (se necesita
  policía para jugar; es correcto que no avance sin ella).

## Pruebas

- Unitarias de `referee.js`: alternancia de turno, rechazo fuera de turno, primera
  colocación libre, un movimiento + una acción por peón, `endPoliceTurn`, pista que no
  revela la posición actual.
- Integración por socket: la policía se coloca y mueve; `ref:moveJack` se rechaza en turno de
  policía y viceversa; auto-fin cuando el único detective actúa.
- Verificación en navegador (Jack + 1 detective): flujo de turnos completo.
- El modo Partida y sus tests siguen verdes.
