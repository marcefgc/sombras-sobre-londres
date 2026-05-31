# Pruebas exploratorias — Sombras sobre Londres (Letters from Whitechapel)

Fecha: 2026-05-30 · App en `http://localhost:3000/` (Edge) · Pruebas en vivo + revisión de código + suite de tests.

> **Estado (2026-05-31): correcciones aplicadas.** Se arreglaron #1, #2, #3, #4,
> #5, #7, #8, #9 y #10 con tests (la suite pasó de 51 a **63/63**). #6 (callejón)
> no es viable sin datos de adyacencia en el tablero y #11 (persistencia) queda
> fuera por ser arquitectónico. Detalle al final, en «Correcciones aplicadas».

> Se probó en vivo en Edge (rol Jack, modo Aprendizaje/árbitro) además de lectura de
> código y ejecución de la suite. La extensión de Edge fue intermitente, así que
> algunas pruebas (segundo cliente detective, comportamiento exacto al llegar al turno
> 15) quedaron incompletas y se marcan como pendientes.

## Resumen

La base está sólida: los tests automatizados pasan (en el momento de la exploración
51/51; tras aplicar las correcciones **63/63**), el lobby
y el tablero completo (~190 círculos sobre el mapa de Whitechapel) renderizan sin
errores de consola, y el flujo de Jack en modo árbitro funciona (guarida, crimen,
movimientos, ruta privada, registro). Los hallazgos son sobre **reglas, robustez y
casos límite**, no fallos que rompan el arranque.

---

## Hallazgos de reglas del juego

### 1. El límite de 15 turnos es solo cosmético (no se impone)  ✅ CORREGIDO
La UI muestra "Movimientos de Jack: 7 / 15" (verificado en vivo), pero el `15`
(`MOVES_PER_NIGHT`) existe **únicamente en `client.js` como etiqueta de texto**. El
servidor (`server.js`, `game-state.js`, `referee.js`) **no tiene ninguna comprobación
de `jackMoves >= 15`**: `game.jackMoves` se incrementa sin tope y Jack puede seguir
moviéndose pasado el 15. "Amanecer" (`phase:dawn`) es un botón manual que termina la
partida cuando alguien lo pulsa, no una condición que el servidor verifique. La presión
de tiempo —el corazón del juego— queda a criterio de los jugadores. Falta imponer el
límite en el servidor.

### 2. `phase:dawn` no valida estado — victoria policial en cualquier momento  ✅ CORREGIDO
`socket.on('phase:dawn')` llama directamente a `endGame(state, 'Policía')` sin
comprobar fase, rol ni número de turnos. Cualquier cliente (incluso un espectador o el
propio Jack) puede terminar la partida con victoria policial instantánea, incluso en el
lobby. Debería exigir fase `hunt` y, idealmente, que se hayan agotado los turnos.

### 3. `phase:crimePrep` y `phase:nextNight` no comprueban rol  ✅ CORREGIDO
Estos handlers no verifican `roleOf() === 'jack'`. Cualquier jugador puede forzar el
avance de fase o de noche. Compárese con `jack:setLair`/`ref:moveJack`, que sí validan
rol. Inconsistencia que permite a un detective manipular el flujo.

### 4. `reset` abierto a cualquiera  ✅ CORREGIDO
`socket.on('reset')` reinicia toda la partida sin validar rol. Cualquier participante
puede borrar el progreso de todos. Convendría limitarlo (p. ej. solo Jack o anfitrión).

### 5. Carruaje en modo árbitro no respeta bloqueo policial intermedio  ✅ CORREGIDO
`legalCarriageTargets` calcula vecinos-de-vecinos pero **no comprueba los cuadrados
`via`** (a diferencia de `legalNormalTargets`, que sí filtra por `occ`). En el juego
real el carruaje son dos movimientos y la policía puede bloquear el paso intermedio.
Aquí el carruaje ignora bloqueos, lo que favorece a Jack.

### 6. Callejón es una aproximación por distancia, no por adyacencia real  ❌ NO VIABLE (falta de datos)
`legalAlleyTargets` usa un radio euclidiano (`ALLEY_RADIUS = 9`) sobre coordenadas del
mapa en vez de las conexiones reales de callejón del tablero. El README lo admite
("versión simplificada"), pero puede habilitar saltos que el tablero físico no permite
o bloquear los que sí. **No se corrige**: `public/assets/board-graph.json` no
contiene adyacencias de callejón (solo `circleAdj`, `squareAdj`, `squareCircles` y
coordenadas), así que la única alternativa al radio euclidiano sería inventar una
topología de callejones inexistente —peor que la simplificación documentada—. Queda
pendiente de aportar esos datos del tablero real para implementarlo bien.

---

## Robustez / casos límite

### 7. Desconexión deja la partida potencialmente colgada  ✅ CORREGIDO (reconexión por nombre)
`disconnect` solo hace `removePlayer`. Si Jack se desconecta a mitad de noche, su estado
(`state.jack`) persiste pero ya no hay socket de Jack: pistas/arrestos siguen
resolviéndose contra una ruta "huérfana" y nadie puede mover a Jack ni declarar guarida.
No hay reconexión por nombre ni reasignación de rol.

### 8. Roles duplicados permitidos  ✅ CORREGIDO
`addPlayer` no impide que dos clientes entren ambos como `jack` o ambos como `det1`.
Dos "Jack" comparten el mismo `state.jack` y `jackSocketId()` devuelve solo el primero.
Falta control de unicidad de rol.

### 9. Sin validación de nombre  ✅ CORREGIDO
El nombre puede ir vacío o duplicado. No es crítico, pero afecta la legibilidad del
registro y una futura reconexión por nombre.

### 10. `startCrime` en modo manual no valida el círculo  ✅ CORREGIDO
En modo árbitro `startCrimeAt` valida que el nodo sea un círculo; en modo manual
`phase:startCrime` acepta cualquier número como sede del crimen sin validar el tablero.

### 11. Estado global en memoria, sin persistencia  ⏭ FUERA DE ALCANCE (arquitectónico)
El servidor mantiene el estado en una variable global que **no se limpia al recargar la
página**: al reentrar apareció una partida previa ya en curso (noche 1, 7/15
movimientos). Hay que pulsar "Reiniciar" para empezar limpio. Combinado con #4 (reset
abierto), un reinicio del proceso Node pierde toda la partida.

---

## Cosas que están bien (verificadas)

- **En vivo:** el lobby renderiza correctamente (nombre, rol, modo de juego). Entrar
  como Jack en modo Aprendizaje carga el tablero completo (~190 círculos numerados
  sobre el mapa de Whitechapel), el panel de Jack, el registro y la ruta de la noche.
  Sin errores de consola.
- **En vivo:** el panel privado de Jack muestra guarida, posición, contadores de
  carruaje/callejón y la ruta paso a paso (188 → 19 → 43(C) → …). El registro refleja
  movimientos rechazados ("sin carruajes") y acciones correctas.
- `npm test`: **51/51 tests pasan**, incl. ocultación de info de Jack, victoria por
  arresto, avance de noches y victoria de Jack en la noche 4.
- `viewFor` oculta la ruta/guarida de Jack a detectives y espectadores (solo expone
  contadores de carruaje/callejón). La privacidad del asesino está bien resuelta.
- El dedup de `lastSent` evita broadcasts redundantes.

---

## Verificación en vivo contra el servidor real (cliente nuevo) — 2026-05-30

Con la nueva partida del anfitrión se ejercitaron las reglas de extremo a extremo
abriendo conexiones socket.io reales contra `localhost:3000` (rol Jack + rol Detective).
Resultados:

- **#1 Límite de 15 turnos — CONFIRMADO ROTO.** Tras iniciar el crimen se enviaron 20
  movimientos legales seguidos: `jackMoves` llegó a **20** y la fase siguió en `hunt`.
  El servidor nunca bloquea al pasar de 15. La presión de tiempo no existe en backend.
- **#2 `phase:dawn` desde un no-Jack — CONFIRMADO ROTO.** Un cliente **Detective** envió
  `phase:dawn` durante la caza y la partida terminó al instante con "Ganador: Policía".
  Sin validación de rol ni de turnos agotados.
- **#3 `phase:nextNight` desde Detective — CONFIRMADO ROTO.** Un detective avanzó la
  noche de 1 → 2. No se valida rol.
- **#8 Roles duplicados — CONFIRMADO.** Un segundo cliente entró como `jack` y recibió
  la **guarida real (100)** en su estado: filtración de info secreta a un Jack duplicado.
- **Privacidad (positivo) — CONFIRMADO OK.** El Detective solo ve
  `{carriages, alleys}`; `jack.path`, `jack.lair` y `ref.jackCircle` llegan `undefined`.
  La ocultación al detective funciona correctamente.

> Nota técnica: durante esta sesión el renderer de la pestaña quedó intermitente
> (clics/capturas con timeout), por eso la verificación se hizo vía sockets reales del
> propio servidor en vez de la UI. Las reglas probadas son las del backend en ejecución.

### Aún sin probar (requiere UI estable)
- Resaltado visual de destinos legales y rechazo de movimiento ilegal en el tablero.
- Bug #7 (desconexión de Jack a media noche) en condiciones reales de juego.
- Mover policía por cuadrados / buscar pista / arresto desde la UI del detective.

## Correcciones aplicadas (2026-05-31)

Todas con TDD (test rojo → implementación → verde). La suite pasó de **51 a 63
tests**, todos en verde. Resumen por hallazgo:

| # | Estado | Qué se hizo | Dónde |
|---|--------|-------------|-------|
| 1 | ✅ | `MOVES_PER_NIGHT = 15` + `movesExhausted()`. `referee.moveJack` y el `jack:logStep` manual rechazan moverse pasada la noche. | `game-state.js`, `referee.js`, `server.js` |
| 2 | ✅ | `phase:dawn` exige rol jugador (no espectador), fase `hunt` y noche agotada; antes cualquiera ganaba al instante. | `server.js` |
| 3 | ✅ | `phase:crimePrep` y `phase:nextNight` exigen `roleOf() === 'jack'`. | `server.js` |
| 4 | ✅ | `reset` exige rol Jack; conserva las reservas de rol de los conectados. | `server.js` |
| 5 | ✅ | `legalCarriageTargets` filtra el cuadrado `via` de **ambos** tramos; el carruaje ya no cruza bloqueos (pero sí rodea por un intermedio libre). | `referee.js` |
| 6 | ❌ | No viable: el tablero no tiene adyacencias de callejón (ver hallazgo). Pendiente de datos. | — |
| 7 | ✅ | `roleClaims` por nombre persiste tras desconexión: el mismo nombre reconecta y recupera su rol; otro nombre no puede apropiárselo. | `game-state.js`, `server.js` |
| 8 | ✅ | `addPlayer` rechaza un segundo jugador en un rol singular (`jack`, `det1`–`det5`); espectadores siguen siendo múltiples. | `game-state.js` |
| 9 | ✅ | `addPlayer` rechaza nombre vacío/espacios; el cliente avisa y vuelve al lobby. | `game-state.js`, `public/client.js` |
| 10 | ✅ | `phase:startCrime` manual valida que el número sea un círculo real del tablero. | `server.js` |
| 11 | ⏭ | Fuera de alcance (persistencia/arquitectura). | — |

Feedback en la UI: nuevo `join:rejected` (alerta + vuelta al lobby) y los rechazos
de fase/amanecer aparecen en el registro.

### Pendiente (no incluido en esta tanda)
- **#6 Callejón por adyacencia real**: requiere añadir la topología de callejones al
  `board-graph.json`.
- **#11 Persistencia**: el estado sigue en memoria; un reinicio del proceso Node
  pierde la partida.
- UI: ocultar a los detectives los botones «Siguiente noche» / «Amanecer» (hoy el
  servidor ya los ignora, pero siguen visibles).
