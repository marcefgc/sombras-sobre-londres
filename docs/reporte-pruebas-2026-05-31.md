# Reporte de pruebas — Sombras sobre Londres — 2026-05-31

Re-verificación tras aplicar las correcciones del reporte anterior
(`pruebas-exploratorias.md`). Probado en vivo contra el servidor real en
`http://localhost:3000/` mediante conexiones socket.io (roles Jack + Detective),
revisión de código y la suite de tests.

## Resumen

Las correcciones aplicadas son **mayormente correctas**: 6 de 7 hallazgos previos están
resueltos y verificados en vivo. La suite creció de 51 a **67 tests, todos pasan**.
Queda **un bug abierto** (corrección incompleta) y se detectó **un bug nuevo** de
consistencia, además de detalles menores.

---

## Correcciones verificadas (OK) ✅

| # previo | Fix | Verificación en vivo |
|---|---|---|
| #2 `phase:dawn` sin validar | Ahora exige fase `hunt` **y** `jackMoves >= 15` | Detective con turnos restantes → rechazado: `{"reason":"Jack aún tiene turnos"}`. Tras agotar turnos → termina con "Ganador: Policía". ✅ |
| #3 `crimePrep`/`nextNight` sin rol | Añadido `if (roleOf() !== 'jack') return` | Detective intentó `phase:nextNight`: noche quedó en 1→1. ✅ |
| #4 `reset` abierto | Añadido check de rol Jack | Detective intentó `reset`: ignorado. ✅ |
| #8 Roles duplicados | `isRoleTaken` rechaza Jack/detective ocupado | 2º cliente como `jack` → `join:rejected {"reason":"rol ocupado"}`, **no recibió estado** (sin filtración de guarida). ✅ |
| Privacidad | (ya estaba) | Detective sigue sin ver ruta/guarida de Jack. ✅ |

---

## 🔴 BUG ABIERTO — corrección incompleta

### B1. El límite de 15 turnos sigue sin imponerse en `ref:moveJack`
**Severidad: alta** (es el corazón del juego).

El fix añadió la constante `MOVES_PER_NIGHT = 15` y la usa para validar `phase:dawn`,
pero **`ref:moveJack` (y `jack:logStep`) nunca comprueban el tope**. Jack puede seguir
moviéndose indefinidamente.

**Verificado en vivo:** tras iniciar el crimen envié 18 movimientos legales seguidos →
`jackMoves` llegó a **18**, fase aún en `hunt`. El servidor no detiene a Jack en 15.

**Consecuencia de juego:** Jack puede llegar a su guarida en el turno 16+ y **ganar
ilegítimamente** después de que debería haber amanecido. La validación de `phase:dawn`
solo cubre el caso en que alguien pulsa "Amanecer"; no impide que Jack exceda los turnos.

**Fix sugerido** en `referee.moveJack` (o en `server.js` antes de mover):
```js
if (state.game.jackMoves >= G.MOVES_PER_NIGHT)
  return { ok: false, reason: 'noche agotada' };
```
E idealmente, al alcanzar 15 sin guarida, marcar la noche como "amanecer disponible"
o resolver la victoria policial automáticamente.

---

## 🟠 BUG NUEVO — consistencia

### B2. `jack:reachedLair` y `jack:nextNight` no validan que la noche esté en curso
**Severidad: media.**

`jack:reachedLair` se puede invocar en cualquier momento; si Jack no está sobre la
guarida responde `reached:false` (correcto), pero **no valida la fase**. Más relevante:
`phase:nextNight` lo puede llamar Jack **incluso a mitad de la caza**, saltándose la
noche sin haber llegado a la guarida.

**Verificado en vivo:** en plena caza (fase `hunt`, Jack en posición 4 con guarida en
100), Jack envió `phase:nextNight` → la partida avanzó **noche 1 → 2**, fase
`crime-prep`, `jackMoves` reiniciado a 0. Jack puede así **abandonar una noche perdida
sin penalización** y reiniciar contadores de carruaje/callejón.

**Fix sugerido:** `phase:nextNight` solo debería avanzar desde el flujo legítimo
(tras `jack:reachedLair` exitoso o tras resolverse la noche), no a demanda durante `hunt`.

---

## 🟡 Pendientes del reporte anterior aún sin abordar

Estos no eran "bugs de seguridad" sino de fidelidad de reglas; siguen igual:

- **#5 Carruaje ignora bloqueo policial intermedio** (`legalCarriageTargets` no filtra
  los cuadrados `via`). Sin cambios.
- **#6 Callejón por distancia euclidiana** (`ALLEY_RADIUS=9`) en vez de adyacencia real.
  Sin cambios (el README lo asume como simplificación).
- **#7 Desconexión de Jack a media noche** deja el estado huérfano; no hay reconexión.
  Sin cambios.
- **#10 `phase:startCrime` (modo manual) no valida el círculo** contra el tablero.
- **#11 Estado global en memoria sin persistencia** (un crash pierde la partida).

---

## Estado de la suite

`npm test` → **67/67 tests pasan** (antes 51). Buen aumento de cobertura, pero
**ningún test cubre el caso "Jack mueve más de 15 veces"** (B1), por eso pasó
desapercibido. Recomendado añadir un test que afirme que `ref:moveJack` se rechaza
con `jackMoves === 15`.

---

## Prioridad de corrección

1. **B1** — capar `ref:moveJack` en 15 turnos (alta; rompe el balance del juego).
2. **B2** — impedir `phase:nextNight` durante la caza.
3. Añadir test de regresión para el límite de 15 turnos.
4. Resto: reglas de carruaje/callejón (#5, #6), desconexión (#7), persistencia (#11).

---

## Actualización — corrección de B1/B2 (sesión posterior)

Verificado contra el HEAD actual antes de tocar nada (método sistemático):

- **B1 (cap de 15 movimientos en `ref:moveJack`): ya estaba resuelto.** `referee.moveJack`
  rechaza con `{ ok:false, reason:'se agotó la noche (15 movimientos)' }` cuando
  `jackMoves >= 15`, y existe test que lo cubre (`referee.test.js`). El reporte se
  escribió contra un estado previo; en HEAD ya no reproduce. Sin cambios.
- **B2 (`phase:nextNight` saltaba una noche en plena caza): CORREGIDO.** El handler
  ahora rechaza el avance cuando `phase === 'hunt'` (la noche solo termina al llegar a
  la guarida o al amanecer). Test de regresión añadido: *"B2: phase:nextNight se
  rechaza durante la caza"*. En el cliente se quitó el botón "Siguiente noche" del modo
  Aprendizaje (la noche avanza sola al llegar a la guarida).
- Suite: **64/64 verdes**.

### Regla del carruaje — CORREGIDO
`legalCarriageTargets` había sido modificado (en `fd38040`) para que el carruaje
**respetara** el bloqueo policial del tramo intermedio, lo que contradecía las reglas del
propio `Whitechapel.md`: *"El Carruaje… ¡Su gran ventaja! Permite cruzar un cuadrado
negro que esté ocupado por un policía."* Se revirtió a la regla documentada: el carruaje
**ignora** los bloqueos y cualquier destino a 2 saltos es legal. El test se reescribió
para afirmar que el carruaje **cruza** el bloqueo (`moveJack carruaje CRUZA el bloqueo…`).
Suite: 64/64 verdes.
