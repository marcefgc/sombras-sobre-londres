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
  let far = 0; while (far === nb || B.isAdjacent(nb, far)) far++;
  assert.strictEqual(R.moveJack(s, far, 'normal').ok, false);
});

test('moveJack normal se bloquea si un policía ocupa el cuadrado via', () => {
  const s = refGame();
  let from = -1, to = -1, via = null;
  for (let i = 0; i < 195 && from < 0; i++) {
    for (const n of B.neighbors(i)) if (n.via != null) { from = i; to = n.circle; via = n.via; break; }
  }
  R.startCrimeAt(s, from);
  s.ref.police['det1'] = via;
  const r = R.moveJack(s, to, 'normal');
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /bloque/i);
});

test('moveJack carruaje llega a 2 saltos por un intermedio libre', () => {
  const s = refGame();
  const carriageTargets = (from) => {
    const set = new Set();
    for (const n of B.neighbors(from)) for (const m of B.neighbors(n.circle)) if (m.circle !== from) set.add(m.circle);
    return [...set];
  };
  // Origen con al menos un destino a 2 saltos y SIN bloqueos (todo libre).
  let from = -1, to = -1;
  for (let i = 0; i < 195 && from < 0; i++) {
    const ct = carriageTargets(i).filter((c) => c !== i);
    if (ct.length) { from = i; to = ct[0]; }
  }
  R.startCrimeAt(s, from);
  assert.strictEqual(R.moveJack(s, to, 'carriage').ok, true);
  assert.strictEqual(s.jack.carriages, 1);
});

test('moveJack carruaje CRUZA el bloqueo policial del tramo intermedio (su ventaja)', () => {
  const s = refGame();
  // Buscar un destino a 2 saltos cuyo ÚNICO intermedio se conecta por un cuadrado
  // bloqueable. Según las reglas (Whitechapel.md), el carruaje es la jugada que
  // permite cruzar un cuadrado ocupado por un policía: aun con el bloqueo, el
  // destino debe seguir siendo alcanzable en carruaje.
  let from = -1, via1 = null, to = -1;
  outer:
  for (let i = 0; i < 195; i++) {
    for (const a of B.neighbors(i)) {
      if (a.via == null) continue;               // primer tramo con cuadrado bloqueable
      for (const b of B.neighbors(a.circle)) {
        if (b.circle === i) continue;            // destino real a 2 saltos
        // ¿Existe OTRO intermedio de `i` que también alcance `b`? Si no, el único
        // camino pasa por `a`: probar el bloqueo sobre ese cuadrado es significativo.
        const otroCamino = B.neighbors(i).some((x) =>
          x.circle !== a.circle && B.neighbors(x.circle).some((y) => y.circle === b.circle));
        if (!otroCamino) { from = i; via1 = a.via; to = b.circle; break outer; }
      }
    }
  }
  assert.ok(from >= 0, 'el tablero debe tener un destino de un solo intermedio bloqueable');
  R.startCrimeAt(s, from);
  // Sin bloqueo el carruaje llega.
  assert.ok(R.legalCarriageTargets(s).includes(to));
  // Con la policía en el cuadrado intermedio, el carruaje IGUAL puede pasar.
  s.ref.police['det1'] = via1;
  assert.ok(R.legalCarriageTargets(s).includes(to));
  assert.strictEqual(R.moveJack(s, to, 'carriage').ok, true);
});

test('moveJack se rechaza cuando se agotaron los 15 movimientos de la noche', () => {
  const s = refGame();
  const c = B.data.crimeStarts[0];
  R.startCrimeAt(s, c);
  s.game.jackMoves = G.MOVES_PER_NIGHT; // noche agotada
  const nb = B.neighbors(c)[0].circle;
  const r = R.moveJack(s, nb, 'normal');
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /noche|agot/i);
});

test('movePolice valida distancia <=2 y no terminar sobre otro policía', () => {
  const s = refGame();
  s.game.turn = 'police';
  const sq = +Object.keys(B.data.squareAdj).find((k) => B.squareNeighbors(+k).length > 0);
  const adjSq = B.squareNeighbors(sq)[0];
  s.ref.police['det1'] = sq;
  assert.strictEqual(R.movePolice(s, 'det1', adjSq).ok, true);
  assert.strictEqual(s.ref.police['det1'], adjSq);
  s.ref.police['det2'] = sq;
  assert.strictEqual(R.movePolice(s, 'det2', adjSq).ok, false);
});

// Crimen + vecino conectados por un cuadrado (via): sirve para varios tests.
function crimeWithVia() {
  for (let i = 0; i < 195; i++) {
    const e = B.neighbors(i).find((x) => x.via != null);
    if (e) return { c: i, n1: e.circle, sq: e.via };
  }
  return null;
}

test('searchClue revela un círculo PASADO pero no la posición actual de Jack', () => {
  const s = refGame();
  const { c, n1, sq } = crimeWithVia();
  R.startCrimeAt(s, c);          // turno Jack, jackCircle=c (paso 0)
  R.moveJack(s, n1, 'normal');   // Jack pasa a n1; turno -> police; c queda como pasado
  s.ref.police['det1'] = sq;     // policía en el cuadrado entre c y n1
  const r1 = R.searchClue(s, 'det1', c);
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.passed, true);   // c es un círculo por el que pasó
  s.ref.acted = {};              // permitir otra búsqueda para la aserción
  const r2 = R.searchClue(s, 'det1', n1);
  assert.strictEqual(r2.passed, false);  // n1 es su posición ACTUAL: no se revela
});

test('la caza es por turnos: Jack mueve, luego policía, y alterna', () => {
  const s = refGame();
  const { c, n1, sq } = crimeWithVia();
  R.startCrimeAt(s, c);
  assert.strictEqual(s.game.turn, 'jack');
  assert.strictEqual(R.moveJack(s, n1, 'normal').ok, true);
  assert.strictEqual(s.game.turn, 'police');
  // En turno de policía, Jack no puede mover.
  const rej = R.moveJack(s, c, 'normal');
  assert.strictEqual(rej.ok, false);
  assert.match(rej.reason, /turno de Jack/i);
  // La policía mueve y actúa.
  assert.strictEqual(R.movePolice(s, 'det1', sq).ok, true);
  assert.strictEqual(R.searchClue(s, 'det1', c).ok, true);
  // Un peón no puede mover/actuar dos veces el mismo turno.
  assert.match(R.movePolice(s, 'det1', sq).reason, /ya se movió/i);
  assert.match(R.searchClue(s, 'det1', c).reason, /ya actuó/i);
  // Fin del turno de policía -> vuelve a Jack.
  R.endPoliceTurn(s);
  assert.strictEqual(s.game.turn, 'jack');
  assert.deepStrictEqual(s.ref.moved, {});
  s.ref.police = {}; // sin bloqueos para la aserción
  assert.strictEqual(R.moveJack(s, c, 'normal').ok, true); // Jack puede mover de nuevo
});

test('movePolice y searchClue se rechazan en el turno de Jack', () => {
  const s = refGame();
  const { c, sq } = crimeWithVia();
  R.startCrimeAt(s, c); // turno Jack
  assert.match(R.movePolice(s, 'det1', sq).reason, /turno de la polic/i);
  assert.match(R.searchClue(s, 'det1', c).reason, /turno de la polic/i);
});

test('allPoliceActed detecta cuando todos los detectives presentes actuaron', () => {
  const s = refGame();
  const { c, n1, sq } = crimeWithVia();
  R.startCrimeAt(s, c);
  R.moveJack(s, n1, 'normal'); // -> turno police
  s.ref.police['det1'] = sq;
  assert.strictEqual(R.allPoliceActed(s, ['det1']), false);
  R.searchClue(s, 'det1', c);
  assert.strictEqual(R.allPoliceActed(s, ['det1']), true);
  assert.strictEqual(R.allPoliceActed(s, ['det1', 'det2']), false);
});
