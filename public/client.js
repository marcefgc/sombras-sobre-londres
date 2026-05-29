const socket = io();
let myRole = null;
let myName = null;
let lastState = null;

const $ = (id) => document.getElementById(id);

$('joinBtn').onclick = () => {
  myName = $('name').value.trim() || 'Jugador';
  myRole = $('role').value;
  socket.emit('join', { name: myName, role: myRole });
  $('lobby').hidden = true;
  $('game').hidden = false;
  $('jackPanel').hidden = myRole !== 'jack';
  buildControls();
};

$('resetBtn').onclick = () => {
  if (confirm('¿Reiniciar la partida para todos?')) socket.emit('reset');
};

socket.on('state', (state) => {
  lastState = state;
  renderStatus(state);
  renderTokens(state);
  renderLog(state);
  renderJackPanel(state);
});

function renderStatus(s) {
  const phases = { lobby: 'Lobby', 'crime-prep': 'Preparación del crimen',
                   hunt: 'La caza', ended: 'Partida terminada' };
  $('nightLabel').textContent = 'Noche ' + s.game.night + ' / 4';
  $('phaseLabel').textContent = phases[s.game.phase] || s.game.phase;
  $('movesLabel').textContent = 'Movimientos de Jack: ' + s.game.jackMoves + ' / 15';
}

function renderLog(s) {
  $('log').innerHTML = s.log.slice(-40).reverse()
    .map((l) => '<li>' + l + '</li>').join('');
}

function renderTokens(s) {
  const layer = $('tokenLayer');
  layer.innerHTML = '';
  for (const t of s.tokens) {
    const el = document.createElement('div');
    el.className = 'token ' + t.type;
    el.textContent = t.label || '';
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
    const wrap = $('boardWrap').getBoundingClientRect();
    const move = (ev) => {
      const x = ((ev.clientX - wrap.left) / wrap.width) * 100;
      const y = ((ev.clientY - wrap.top) / wrap.height) * 100;
      el.style.left = x + '%';
      el.style.top = y + '%';
    };
    const up = (ev) => {
      el.releasePointerCapture(e.pointerId);
      el.onpointermove = null;
      el.onpointerup = null;
      const x = ((ev.clientX - wrap.left) / wrap.width) * 100;
      const y = ((ev.clientY - wrap.top) / wrap.height) * 100;
      socket.emit('moveToken', { id, x, y });
    };
    el.onpointermove = move;
    el.onpointerup = up;
  };
}

function renderJackPanel(s) {
  if (myRole !== 'jack' || !s.jack) return;
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
}

function buildControls() {
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
socket.on('clue:result', ({ circle, passed }) => {
  alert('Pista en ' + circle + ': ' + (passed ? 'SÍ pasó por aquí' : 'no pasó'));
});
socket.on('arrest:result', ({ circle, caught }) => {
  alert(caught ? '¡ATRAPADO en ' + circle + '! Gana la policía.'
               : 'Arresto fallido en ' + circle + '.');
});
