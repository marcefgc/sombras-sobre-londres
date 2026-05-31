const socket = io();
let myRole = null;
let myName = null;
let lastState = null;

// Modo Aprendizaje (árbitro): grafo del tablero + acción activa + control de re-build.
let boardGraph = null;
let refAction = null;       // jack: startcrime|normal|carriage|alley|lair · policía: move|search|arrest
let builtForMode = null;    // último modo para el que se construyeron los controles

const $ = (id) => document.getElementById(id);

fetch('assets/board-graph.json')
  .then((r) => r.json())
  .then((g) => { boardGraph = g; if (lastState) renderBoard(lastState); })
  .catch(() => { /* el modo Aprendizaje quedará inactivo si no carga */ });

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

$('joinBtn').onclick = () => {
  myName = $('name').value.trim() || 'Jugador';
  myRole = $('role').value;
  socket.emit('join', { name: myName, role: myRole });
  socket.emit('setMode', { mode: $('mode').value });
  $('lobby').hidden = true;
  $('game').hidden = false;
  $('jackPanel').hidden = myRole !== 'jack';
  // Los controles se construyen al llegar el primer estado (conociendo el modo real).
};

$('resetBtn').onclick = () => {
  if (confirm('¿Reiniciar la partida para todos?')) socket.emit('reset');
};

// ---- Modal de reglas ----
function openRules() {
  const f = $('rulesFrame');
  if (!f.getAttribute('src')) f.setAttribute('src', 'reglas.html');
  $('rulesModal').hidden = false;
}
$('rulesBtn').onclick = openRules;
$('rulesLobbyBtn').onclick = openRules;
$('rulesClose').onclick = () => { $('rulesModal').hidden = true; };
$('rulesModal').onclick = (e) => { if (e.target === $('rulesModal')) $('rulesModal').hidden = true; };

// ---- Tutor (coach) del modo Aprendizaje ----
let coachHidden = false;
let coachStickUntil = 0; // mientras dure, un aviso de rechazo no se sobreescribe
$('coachHide').onclick = () => { coachHidden = true; $('coach').hidden = true; $('coachReopen').hidden = false; };
$('coachReopen').onclick = () => { coachHidden = false; $('coachReopen').hidden = true; if (lastState) updateCoach(lastState); };

socket.on('state', (state) => {
  lastState = state;
  renderStatus(state);
  renderBoard(state);
  renderLog(state);
  renderJackPanel(state);
  if (state.game.mode !== builtForMode) { builtForMode = state.game.mode; buildControls(); }
  updateCoach(state);
});

function renderStatus(s) {
  const phases = { lobby: 'Lobby', 'crime-prep': 'Preparación del crimen',
                   hunt: 'La caza', ended: 'Partida terminada' };
  const modeTag = s.game.mode === 'referee' ? '[Aprendizaje] ' : '[Partida] ';
  $('nightLabel').textContent = 'Noche ' + s.game.night + ' / 4';
  $('phaseLabel').textContent = modeTag + (phases[s.game.phase] || s.game.phase);
  $('movesLabel').textContent = 'Movimientos de Jack: ' + s.game.jackMoves + ' / 15';
}

// ---- Tutor: muestra el consejo adecuado según el estado y el rol ----
function setCoach(text, rejected) {
  if (coachHidden || !text) { return; }
  $('coachText').textContent = text;
  $('coach').classList.toggle('rejected', !!rejected);
  $('coachIcon').textContent = rejected ? '⚠️' : '🎓';
  $('coach').hidden = false;
  $('coachReopen').hidden = true;
}
function updateCoach(state) {
  if (!state || state.game.mode !== 'referee') { $('coach').hidden = true; $('coachReopen').hidden = true; return; }
  if (coachHidden) { $('coach').hidden = true; $('coachReopen').hidden = false; return; }
  if (Date.now() < coachStickUntil) return; // no pisar un aviso de rechazo reciente
  setCoach(coachTip(state), false);
}
function coachTip(state) {
  const g = state.game; const ref = state.ref || {};
  if (g.phase === 'ended') return 'La partida terminó. Pulsa "Reiniciar" (arriba a la derecha) para jugar otra vez.';
  if (myRole === 'spectator') return 'Observas la partida en modo Aprendizaje: verás los movimientos de la policía y las pistas que encuentren.';
  if (myRole === 'jack') {
    if (state.jack && state.jack.lair == null) return 'Eres Jack 🔪. Primero fija tu escondite: pulsa "Fijar guarida" y haz click en un círculo del mapa.';
    if (ref.jackCircle == null) return 'Ahora comete tu crimen: pulsa "Elegir crimen" y haz click en uno de los puntos ROJOS resaltados.';
    if (g.jackMoves >= 13) return 'Te quedan pocos turnos ⏳. Vuelve a tu guarida y pulsa "Llegué a mi guarida". Si te bloquean, usa "Carruaje" o "Callejón".';
    return 'Tu turno: pulsa "Mover" y haz click en un círculo VERDE para avanzar en secreto. "Carruaje" salta 2 y cruza bloqueos; "Callejón" cambia de calle.';
  }
  if (myRole && myRole.startsWith('det')) {
    if (g.phase !== 'hunt') return 'Eres detective 🔎. Espera a que Jack cometa su primer crimen; cuando empiece la caza podrás moverte.';
    if (!ref.police || ref.police[myRole] == null) return 'Coloca tu detective: pulsa "Mover" y haz click en un CUADRADO verde (las esquinas de las calles).';
    return 'Pulsa "Buscar pista" y haz click en un círculo VERDE adyacente para investigar; o "Mover" para acercarte. Si crees saber dónde está Jack, usa "Arrestar".';
  }
  return '';
}

// Despacha el render del tablero según el modo: fichas arrastrables (Partida) o
// la capa de nodos clicable (Aprendizaje).
function renderBoard(state) {
  const refMode = state.game.mode === 'referee';
  $('nodeLayer').hidden = !refMode;
  $('tokenLayer').style.display = refMode ? 'none' : '';
  if (refMode) renderNodes(state); else renderTokens(state);
}

function renderLog(s) {
  // Usar textContent (no innerHTML) para que ningún texto del log se interprete
  // como HTML (evita inyección si un mensaje llegara a contener etiquetas).
  const ul = $('log');
  ul.innerHTML = '';
  for (const l of s.log.slice(-40).reverse()) {
    const li = document.createElement('li');
    li.textContent = l;
    ul.appendChild(li);
  }
}

// Id de la ficha que este cliente está arrastrando ahora mismo (o null). Sirve
// para no destruir su elemento cuando llega un estado de otro jugador a mitad
// del arrastre (dos personas pueden arrastrar a la vez).
let draggingId = null;

function renderTokens(s) {
  const layer = $('tokenLayer');
  // Si estamos arrastrando una ficha, conserva su elemento (con su gesto/captura
  // en curso) en vez de recrearlo cuando llega un estado de otro jugador.
  let kept = null;
  if (draggingId != null) {
    kept = layer.querySelector('[data-id="' + CSS.escape(draggingId) + '"]');
    if (kept) layer.removeChild(kept);
  }
  layer.innerHTML = '';
  for (const t of s.tokens) {
    if (kept && t.id === draggingId) { layer.appendChild(kept); continue; }
    const el = document.createElement('div');
    el.className = 'token ' + t.type;
    el.dataset.id = t.id;
    const img = document.createElement('img');
    img.src = tokenImg(t);
    img.alt = t.type + (t.label ? ' ' + t.label : '');
    img.draggable = false;
    el.appendChild(img);
    el.style.left = t.x + '%';
    el.style.top = t.y + '%';
    if (myRole !== 'spectator') makeDraggable(el, t.id);
    layer.appendChild(el);
  }
}

function makeDraggable(el, id) {
  el.onpointerdown = (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    draggingId = id;
    // Lee el rect del tablero en cada evento: si el layout se reajusta a mitad
    // del arrastre (el log crece, scroll, etc.) las coordenadas siguen exactas.
    const rect = () => $('boardWrap').getBoundingClientRect();
    const pct = (ev) => {
      const w = rect();
      return {
        x: ((ev.clientX - w.left) / w.width) * 100,
        y: ((ev.clientY - w.top) / w.height) * 100,
      };
    };
    const move = (ev) => {
      const { x, y } = pct(ev);
      el.style.left = x + '%';
      el.style.top = y + '%';
    };
    const up = (ev) => {
      el.releasePointerCapture(e.pointerId);
      el.onpointermove = null;
      el.onpointerup = null;
      draggingId = null;
      const { x, y } = pct(ev);
      socket.emit('moveToken', { id, x, y });
    };
    el.onpointermove = move;
    el.onpointerup = up;
  };
}

// ---- Modo Aprendizaje: tablero de nodos clicable ----
function policePawnImg(who) {
  const n = parseInt(String(who).replace('det', ''), 10);
  const color = POLICE_COLORS[(Number.isNaN(n) ? 1 : n) - 1] || 'blue';
  return 'assets/tokens/police-' + color + '.png';
}
function addPawn(layer, node, src) {
  const p = document.createElement('img');
  p.className = 'gpawn';
  p.src = src;
  p.style.left = node.x + '%';
  p.style.top = node.y + '%';
  layer.appendChild(p);
}
function highlightSets(state) {
  const ref = state.ref || {};
  const circleHi = new Set(); const squareHi = new Set();
  if (myRole === 'jack') {
    const L = ref.legal || {};
    if (refAction === 'startcrime') (boardGraph.crimeStarts || []).forEach((c) => circleHi.add(c));
    else if (refAction === 'normal') (L.normal || []).forEach((c) => circleHi.add(c));
    else if (refAction === 'carriage') (L.carriage || []).forEach((c) => circleHi.add(c));
    else if (refAction === 'alley') (L.alley || []).forEach((c) => circleHi.add(c));
    else if (refAction === 'lair') boardGraph.nodes.forEach((n) => { if (n.type === 'circle') circleHi.add(n.id); });
  } else if (myRole && myRole.startsWith('det')) {
    if (refAction === 'move') (ref.legalSquares || []).forEach((s) => squareHi.add(s));
    else if (refAction === 'search' || refAction === 'arrest') (ref.searchable || []).forEach((c) => circleHi.add(c));
  }
  return { circleHi, squareHi };
}
function renderNodes(state) {
  const layer = $('nodeLayer');
  layer.innerHTML = '';
  if (!boardGraph) return;
  const { circleHi, squareHi } = highlightSets(state);
  for (const n of boardGraph.nodes) {
    const el = document.createElement('div');
    el.className = 'gnode ' + n.type;
    el.style.left = n.x + '%';
    el.style.top = n.y + '%';
    const hi = n.type === 'circle' ? circleHi.has(n.id) : squareHi.has(n.id);
    if (hi) { el.classList.add('legal'); el.onclick = () => onNodeClick(n); }
    layer.appendChild(el);
  }
  const ref = state.ref || {};
  // Marcadores PRIVADOS de Jack: su recorrido (rastro dorado) y su guarida (🏠),
  // para que pueda orientarse y volver a casa sin depender de los números.
  if (myRole === 'jack') {
    for (const step of (state.jack && state.jack.path) || []) {
      const tn = boardGraph.nodes[step.circle];
      if (!tn) continue;
      const d = document.createElement('div');
      d.className = 'gtrail';
      d.style.left = tn.x + '%'; d.style.top = tn.y + '%';
      layer.appendChild(d);
    }
    if (state.jack && state.jack.lair != null) {
      const ln = boardGraph.nodes[state.jack.lair];
      if (ln) {
        const d = document.createElement('div');
        d.className = 'glair'; d.textContent = '🏠'; d.title = 'Tu guarida';
        d.style.left = ln.x + '%'; d.style.top = ln.y + '%';
        layer.appendChild(d);
      }
    }
  }
  for (const [who, sq] of Object.entries(ref.police || {})) {
    const node = boardGraph.nodes[sq];
    if (node) addPawn(layer, node, policePawnImg(who));
  }
  if (myRole === 'jack' && ref.jackCircle != null) {
    const node = boardGraph.nodes[ref.jackCircle];
    if (node) addPawn(layer, node, 'assets/tokens/jack.png');
  }
}
function onNodeClick(n) {
  if (myRole === 'jack') {
    if (refAction === 'startcrime') socket.emit('ref:startCrime', { circle: n.id });
    else if (refAction === 'lair') socket.emit('jack:setLair', { circle: n.id });
    else if (refAction === 'normal' || refAction === 'carriage' || refAction === 'alley') {
      socket.emit('ref:moveJack', { circle: n.id, kind: refAction });
    }
  } else if (myRole && myRole.startsWith('det')) {
    if (refAction === 'move') socket.emit('ref:movePolice', { square: n.id });
    else if (refAction === 'search') socket.emit('ref:search', { circle: n.id });
    else if (refAction === 'arrest') socket.emit('ref:arrest', { circle: n.id });
  }
}

function renderJackPanel(s) {
  if (myRole !== 'jack' || !s.jack) return;
  if (s.game.mode === 'referee') return renderJackPanelReferee(s);
  const p = $('jackPanel');
  const lair = s.jack.lair == null ? '(sin fijar)' : s.jack.lair;
  const pathStr = (s.jack.path || []).map((x) =>
    x.circle + (x.special ? '(' + (x.special === 'carriage' ? 'C' : 'A') + ')' : '')
  ).join(' → ');
  p.innerHTML = `
    <h3>Panel privado de Jack</h3>
    <div class="row">
      <input id="lairInput" type="number" placeholder="Guarida" />
      <button id="setLairBtn">Fijar guarida</button>
    </div>
    <div>Guarida: <strong>${lair}</strong></div>
    <hr/>
    <div class="row">
      <input id="stepInput" type="number" placeholder="N° círculo" />
    </div>
    <div class="row">
      <button id="stepNormal">Mover</button>
      <button id="stepCarriage">Carruaje (${s.jack.carriages})</button>
      <button id="stepAlley">Callejón (${s.jack.alleys})</button>
    </div>
    <div><small>Ruta de esta noche:</small><br/>${pathStr || '—'}</div>
    <hr/>
    <div class="row"><button id="reachedLairBtn">Llegué a mi guarida (fin de noche)</button></div>
  `;
  $('setLairBtn').onclick = () => {
    const c = parseInt($('lairInput').value, 10);
    if (!Number.isNaN(c)) socket.emit('jack:setLair', { circle: c });
  };
  const step = (special) => {
    const c = parseInt($('stepInput').value, 10);
    if (!Number.isNaN(c)) { socket.emit('jack:logStep', { circle: c, special }); $('stepInput').value = ''; }
  };
  $('stepNormal').onclick = () => step(null);
  $('stepCarriage').onclick = () => step('carriage');
  $('stepAlley').onclick = () => step('alley');
  $('reachedLairBtn').onclick = () => socket.emit('jack:reachedLair');
}

function renderJackPanelReferee(s) {
  const p = $('jackPanel');
  // En Aprendizaje todo es visual: la guarida se marca con 🏠 en el mapa, la
  // posición es tu peón y el recorrido es el rastro dorado. No se muestran los
  // números internos del tablero (no coinciden con los impresos en el mapa).
  const lairSet = s.jack.lair != null;
  const pasos = (s.jack.path || []).length ? (s.jack.path.length - 1) : 0; // sin contar el paso 0 (crimen)
  p.innerHTML = `
    <h3>Panel de Jack (Aprendizaje)</h3>
    <div>Guarida: <strong>${lairSet ? 'marcada con 🏠 en el mapa' : 'sin fijar — usa "Fijar guarida"'}</strong></div>
    <div>Tu posición: <strong>tu peón (la ficha de Jack)</strong></div>
    <div>Carruajes: <strong>${s.jack.carriages}</strong> · Callejones: <strong>${s.jack.alleys}</strong></div>
    <div><small>Mueve eligiendo una acción y haciendo click en un círculo VERDE. Tu recorrido se marca en oro; vuelve al 🏠 y pulsa el botón.</small></div>
    <div>Movimientos esta noche: <strong>${pasos}</strong> / 15</div>
    <hr/>
    <div class="row"><button id="reachedLairBtn">Llegué a mi guarida (fin de noche)</button></div>
  `;
  $('reachedLairBtn').onclick = () => socket.emit('jack:reachedLair');
}

function buildControls() {
  const mode = lastState ? lastState.game.mode : 'manual';
  if (mode === 'referee') return buildRefControls();
  const c = $('controls');
  if (myRole === 'spectator') { c.innerHTML = '<em>Modo espectador</em>'; return; }
  c.innerHTML = '<h3>Acciones</h3>';

  // Crear fichas
  const addRow = document.createElement('div');
  addRow.className = 'row';
  for (const [label, type] of [['Detective', 'detective'], ['Crimen', 'crime'],
                               ['Pista', 'clue'], ['Víctima', 'victim']]) {
    const b = document.createElement('button');
    b.textContent = '+ ' + label;
    b.onclick = () => {
      const id = type + '-' + Math.random().toString(36).slice(2, 7);
      const lbl = type === 'detective' ? (prompt('Número del detective (1-5):', '1') || '') : '';
      socket.emit('addToken', { id, type, x: 50, y: 50, label: lbl });
    };
    addRow.appendChild(b);
  }
  c.appendChild(addRow);

  // Pista y arresto (solo detectives, no Jack)
  if (myRole !== 'jack') {
    const clueRow = document.createElement('div');
    clueRow.className = 'row';
    clueRow.innerHTML = '<input id="clueNum" type="number" placeholder="N° a interrogar" />'
                      + '<button id="clueBtn">Buscar pista</button>';
    c.appendChild(clueRow);
    const arrestRow = document.createElement('div');
    arrestRow.className = 'row';
    arrestRow.innerHTML = '<input id="arrestNum" type="number" placeholder="N° a arrestar" />'
                        + '<button id="arrestBtn">¡Arresto!</button>';
    c.appendChild(arrestRow);
    document.getElementById('clueBtn').onclick = () => {
      const n = parseInt(document.getElementById('clueNum').value, 10);
      if (!Number.isNaN(n)) socket.emit('clue:ask', { circle: n });
    };
    document.getElementById('arrestBtn').onclick = () => {
      const n = parseInt(document.getElementById('arrestNum').value, 10);
      if (!Number.isNaN(n)) socket.emit('arrest', { circle: n });
    };
  }

  // Control de fases
  const phaseRow = document.createElement('div');
  phaseRow.className = 'row';
  phaseRow.innerHTML = '<button id="prepBtn">Preparar crimen</button>'
                     + '<button id="nightBtn">Siguiente noche</button>';
  c.appendChild(phaseRow);
  document.getElementById('prepBtn').onclick = () => socket.emit('phase:crimePrep');
  document.getElementById('nightBtn').onclick = () => socket.emit('phase:nextNight');

  // Amanecer: se agotaron los 15 turnos y Jack no llegó a su guarida -> gana la policía.
  const dawnRow = document.createElement('div');
  dawnRow.className = 'row';
  dawnRow.innerHTML = '<button id="dawnBtn">Amanecer: Jack atrapado (se agotó la noche)</button>';
  c.appendChild(dawnRow);
  document.getElementById('dawnBtn').onclick = () => {
    if (confirm('¿Declarar el amanecer? Si Jack no llegó a su guarida, gana la policía.')) {
      socket.emit('phase:dawn');
    }
  };

  // Jack inicia el crimen (paso 0)
  if (myRole === 'jack') {
    const crimeRow = document.createElement('div');
    crimeRow.className = 'row';
    crimeRow.innerHTML = '<input id="crimeNum" type="number" placeholder="N° del crimen" />'
                       + '<button id="crimeBtn">Cometer crimen</button>';
    c.appendChild(crimeRow);
    document.getElementById('crimeBtn').onclick = () => {
      const n = parseInt(document.getElementById('crimeNum').value, 10);
      if (!Number.isNaN(n)) socket.emit('phase:startCrime', { circle: n });
    };
  }
}

function buildRefControls() {
  const c = $('controls');
  c.innerHTML = '<h3>Acciones (Aprendizaje)</h3>';
  if (myRole === 'spectator') { c.innerHTML += '<em>Observas la partida.</em>'; return; }
  const setAct = (a, btn) => {
    refAction = a;
    for (const b of c.querySelectorAll('button[data-act]')) b.classList.toggle('act-on', b === btn);
    if (lastState) renderNodes(lastState);
  };
  const mk = (label, act) => {
    const b = document.createElement('button');
    b.textContent = label; b.dataset.act = act;
    b.onclick = () => setAct(act, b);
    return b;
  };
  const row = (...els) => { const r = document.createElement('div'); r.className = 'row'; els.forEach((e) => r.appendChild(e)); c.appendChild(r); };

  if (myRole === 'jack') {
    row(mk('Elegir crimen', 'startcrime'));
    row(mk('Mover', 'normal'), mk('Carruaje', 'carriage'), mk('Callejón', 'alley'));
    row(mk('Fijar guarida', 'lair'));
  } else if (myRole && myRole.startsWith('det')) {
    row(mk('Mover', 'move'), mk('Buscar pista', 'search'), mk('Arrestar', 'arrest'));
  }

  // Resolución de la noche (no espectador). En Aprendizaje la noche avanza sola
  // al llegar a la guarida (botón del panel de Jack); aquí solo queda el amanecer
  // para cuando se agotan los 15 movimientos sin volver a casa.
  const pr = document.createElement('div'); pr.className = 'row';
  pr.innerHTML = '<button id="dawnBtn">Amanecer (se agotó la noche)</button>';
  c.appendChild(pr);
  document.getElementById('dawnBtn').onclick = () => { if (confirm('¿Declarar el amanecer? Si Jack no llegó a su guarida y agotó sus 15 movimientos, gana la policía.')) socket.emit('phase:dawn'); };
}

socket.on('ref:rejected', ({ reason }) => {
  const li = document.createElement('li');
  li.textContent = '⛔ ' + (reason || 'movimiento rechazado');
  $('log').prepend(li);
  // Explica el rechazo en el tutor para guiar al principiante.
  const hints = {
    'movimiento ilegal o bloqueado': 'Ese círculo no es accesible: solo puedes ir a un círculo VERDE. Si una esquina con policía te bloquea, prueba "Carruaje".',
    'destino fuera de alcance': 'Ese destino no es válido para esa acción. Fíjate en los círculos resaltados en verde.',
    'fuera de alcance o cuadrado ocupado': 'Solo puedes ir a un CUADRADO verde, y no puedes terminar donde ya hay otro policía.',
    'círculo no adyacente': 'Solo puedes investigar/arrestar en un círculo VERDE adyacente a tu esquina. Acércate con "Mover" primero.',
    'sin carruajes': 'Ya no te quedan carruajes esta noche.',
    'sin callejones': 'Ya no te quedan callejones esta noche.',
    'se agotó la noche (15 movimientos)': 'Gastaste tus 15 movimientos. Si no estás en tu guarida (🏠), la policía declarará el amanecer y gana.',
  };
  const tip = hints[reason] || ('Acción rechazada: ' + (reason || '') + '.');
  coachStickUntil = Date.now() + 4500;
  setCoach(tip, true);
});

// El servidor rechazó la entrada (rol ocupado, nombre vacío o rol reservado por
// otro jugador). Volvemos al lobby para que el jugador elija otra cosa.
socket.on('join:rejected', ({ reason }) => {
  alert('No se pudo entrar: ' + (reason || 'rol no disponible') + '. Prueba con otro rol o nombre.');
  $('game').hidden = true;
  $('jackPanel').hidden = true;
  $('lobby').hidden = false;
  myRole = null;
});

socket.on('clue:asked', ({ circle }) => {
  const li = document.createElement('li');
  li.textContent = '👁️ Te preguntaron por el ' + circle;
  $('log').prepend(li);
});
socket.on('arrest:attempt', ({ circle }) => {
  const li = document.createElement('li');
  li.textContent = '🚨 Intento de arresto en ' + circle;
  $('log').prepend(li);
});
// En Aprendizaje no se muestra el número interno (no coincide con el del mapa);
// se habla del "círculo investigado". En Partida (manual) sí, porque el detective
// preguntó por un número concreto.
function refMode() { return lastState && lastState.game.mode === 'referee'; }
socket.on('clue:result', ({ circle, passed }) => {
  const donde = refMode() ? 'ese círculo' : ('el ' + circle);
  alert('Pista en ' + donde + ': ' + (passed ? 'el asesino SÍ pasó por aquí' : 'el asesino no pasó'));
});
socket.on('arrest:result', ({ circle, caught }) => {
  const donde = refMode() ? 'ese círculo' : ('el ' + circle);
  alert(caught ? '¡ATRAPADO en ' + donde + '! Gana la policía.'
               : 'Arresto fallido en ' + donde + '.');
});
socket.on('lair:result', ({ reached, won }) => {
  if (!reached) alert('Aún no estás en tu guarida.');
  else if (won) alert('¡Llegaste a tu guarida la última noche! GANA JACK.');
  else alert('Llegaste a tu guarida. Comienza la siguiente noche.');
});
