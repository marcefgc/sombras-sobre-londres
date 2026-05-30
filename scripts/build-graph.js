const fs = require('fs');
const path = require('path');

const DBG = path.join(__dirname, '..', 'docs', 'debug');
const full = require(path.join(DBG, 'graph_full.json'));
const cands = require(path.join(DBG, 'curve_cands.json'));
const raw = require(path.join(DBG, 'graph_raw.json'));

const W = 2526, H = 1788;
const V = full.V;
const NC = V.filter((v) => v.t === 'c').length; // 195

const adj = new Map();
const add = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
for (const [a, b] of cands) { add(a, b); add(b, a); }

const cadj = new Map();
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

const sadj = {};
for (let s = NC; s < V.length; s++) sadj[s] = [];
for (const [a, b] of cands) {
  if (a >= NC && b >= NC) { sadj[a].push(b); sadj[b].push(a); }
}
for (const k of Object.keys(sadj)) sadj[k] = [...new Set(sadj[k])];

const crimeStarts = raw.salmon.map((sp) => {
  let best = 0, bd = Infinity;
  for (let i = 0; i < NC; i++) { const d = (V[i].x - sp.x) ** 2 + (V[i].y - sp.y) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
});

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
