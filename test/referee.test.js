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

test('moveJack carruaje respeta el bloqueo policial del tramo intermedio', () => {
  const s = refGame();
  // Buscar un destino a 2 saltos cuyo ÚNICO intermedio sea un vecino conectado
  // por un cuadrado bloqueable: al ocupar ese cuadrado, el carruaje no debe poder
  // pasar (en el juego real el carruaje son dos movimientos y la policía bloquea
  // el paso intermedio).
  let from = -1, n1 = -1, via1 = null, to = -1;
  outer:
  for (let i = 0; i < 195; i++) {
    for (const a of B.neighbors(i)) {
      if (a.via == null) continue;               // primer tramo bloqueable
      for (const b of B.neighbors(a.circle)) {
        if (b.circle === i) continue;            // destino real a 2 saltos
        // ¿Existe OTRO intermedio de `i` que también alcance `b`? Si no, el único
        // camino pasa por `a` y bloquear su cuadrado deja a `b` inalcanzable.
        const otroCamino = B.neighbors(i).some((x) =>
          x.circle !== a.circle && B.neighbors(x.circle).some((y) => y.circle === b.circle));
        if (!otroCamino) { from = i; n1 = a.circle; via1 = a.via; to = b.circle; break outer; }
      }
    }
  }
  assert.ok(from >= 0, 'el tablero debe tener un destino de un solo intermedio bloqueable');
  R.startCrimeAt(s, from);
  // Sin bloqueo el carruaje sí puede llegar.
  assert.ok(R.legalCarriageTargets(s).includes(to));
  // Con la policía en el cuadrado intermedio, el destino deja de ser legal.
  s.ref.police['det1'] = via1;
  assert.ok(!R.legalCarriageTargets(s).includes(to));
  assert.strictEqual(R.moveJack(s, to, 'carriage').ok, false);
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
  const sq = +Object.keys(B.data.squareAdj).find((k) => B.squareNeighbors(+k).length > 0);
  const adjSq = B.squareNeighbors(sq)[0];
  s.ref.police['det1'] = sq;
  assert.strictEqual(R.movePolice(s, 'det1', adjSq).ok, true);
  assert.strictEqual(s.ref.police['det1'], adjSq);
  s.ref.police['det2'] = sq;
  assert.strictEqual(R.movePolice(s, 'det2', adjSq).ok, false);
});

test('searchClue automático coloca pista si el asesino pasó', () => {
  const s = refGame();
  const c = B.data.crimeStarts[0];
  R.startCrimeAt(s, c);
  const via = B.neighbors(c).find((n) => n.via != null);
  if (via) {
    s.ref.police['det1'] = via.via;
    const r = R.searchClue(s, 'det1', c);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.passed, true);
  }
});
