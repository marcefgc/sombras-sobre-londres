const data = require('./public/assets/board-graph.json');

function neighbors(circleId) { return data.circleAdj[circleId] || []; }
function isAdjacent(a, b) { return neighbors(a).some((n) => n.circle === b); }
function viaSquare(a, b) {
  const n = neighbors(a).find((x) => x.circle === b);
  return n ? n.via : undefined;
}
function squareNeighbors(squareId) { return data.squareAdj[squareId] || []; }
// Círculos que un policía parado en este cuadrado puede interrogar/arrestar.
function squareCircles(squareId) { return (data.squareCircles && data.squareCircles[squareId]) || []; }
function node(id) { return data.nodes[id]; }

module.exports = { data, neighbors, isAdjacent, viaSquare, squareNeighbors, squareCircles, node };
