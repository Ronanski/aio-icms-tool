/* Electrical simulation: component library (power + control + equipment) and the net solver.
   Model: every terminal is a node. Wires and closed contacts merge nodes into nets (union-find).
   Sources put potentials on nets (L1/L2/L3/N/PE, DC+:id / DC-:id). Loads (coils, lamps, PLC inputs,
   motors) look at the potentials on their terminals. Conflicting potentials on one net = short
   circuit → the nearest breaker trips. */
(function () {
  'use strict';
  const esc = UI.esc;
  const DEFS = {}, ORDER = [];
  function def(type, d) {
    d.type = type;
    d.terms.forEach(t => { if (t.l == null) t.l = t.id; });
    d.props = d.props || {};
    DEFS[type] = d; ORDER.push(type);
  }

  const RATINGS = ['24VDC', '230VAC', '400VAC'];
  const LVL = { '24VDC': 1, '230VAC': 2, '400VAC': 3 };
  function coilState(v, rating) {
    if (!v) return 'off';
    if (v.label === rating) return 'on';
    if (rating === '24VDC') return 'over';
    return LVL[v.label] > LVL[rating] ? 'over' : 'under';
  }
  function coilOn(c, api, a, b) {
    const v = api.v(c, a, b);
    const rating = c.props.coil || '24VDC';
    const st = coilState(v, rating);
    if (st === 'over' && !c.state.burnt) {
      c.state.burnt = true;
      api.alert(`${c.props.label}: burnt out — ${v.label} applied to a ${rating} device`, 'danger');
    }
    return st === 'on' && !c.state.burnt;
  }
  const set = (c, k, v) => { if (c.state[k] !== v) { c.state[k] = v; return true; } return false; };

  /* ---------- drawing helpers ---------- */
  const T = (x, y, s, cls = 'dt', anchor = 'middle') => `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(s)}</text>`;
  const R = (x, y, w, h, fill, rx = 4, stroke = '#5f5b53', sw = 1, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
  const led = (x, y, on, color = '#3ddc63', r = 3.2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${on ? color : '#4b4842'}" stroke="#1e1d1b" stroke-width=".7" ${on ? 'filter="url(#fGlow)"' : ''}/>`;
  const COLORS = { green: '#2fa84f', red: '#d33a2c', yellow: '#f2c230', amber: '#f39c1e', blue: '#2f6fd6', white: '#f4f4ef', black: '#2a2a2a' };
  const DIM = { green: '#1d5a2c', red: '#6b201a', yellow: '#7a6420', amber: '#7a4f14', blue: '#1d3b6b', white: '#8f8e88', black: '#1a1a1a' };
  const band = (y, w, h = 18, fill = '#3a3833') => `<rect x="1" y="${y}" width="${w - 2}" height="${h}" fill="${fill}" rx="2"/>`;
  const burnt = (w, h) => `<g opacity=".85"><rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="6" fill="#141210" opacity=".55"/><text class="dt burn" x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle">BURNT</text></g>`;
  const btn = (part, x, y, w, h, label, on) => `<g class="part" data-part="${part}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${on ? '#d97757' : '#e9e5dc'}" stroke="#6b665c"/><text class="dt btn-t${on ? ' on' : ''}" x="${x + w / 2}" y="${y + h / 2 + 3}" text-anchor="middle">${esc(label)}</text></g>`;

  /* ---------- POWER ---------- */
  def('supply3', {
    name: '3-Phase Supply', cat: 'Power', view: 'power', prefix: 'Q', w: 140, h: 70,
    info: '3-phase 400/230 V, 60 Hz with neutral and protective earth. Click the rotary switch to isolate.',
    terms: [{ id: 'L1', x: 20, y: 70 }, { id: 'L2', x: 40, y: 70 }, { id: 'L3', x: 60, y: 70 }, { id: 'N', x: 90, y: 70 }, { id: 'PE', x: 120, y: 70 }],
    init: () => ({ on: true }),
    sources: c => c.state.on ? { L1: 'L1', L2: 'L2', L3: 'L3', N: 'N', PE: 'PE' } : null,
    onPart(c, p, ev) { if (ev === 'down' && p === 'sw') { c.state.on = !c.state.on; return true; } },
    draw(c) {
      const on = c.state.on;
      return R(0, 0, 140, 70, 'url(#gDark)', 6) + T(48, 14, '3~ 400/230 V 60 Hz', 'dt light') +
        ['L1', 'L2', 'L3'].map((p, i) => led(20 + i * 20, 30, on, ['#e53935', '#f2c230', '#2b6fe0'][i]) + T(20 + i * 20, 43, p, 'dt light sm')).join('') +
        `<g class="part" data-part="sw" transform="translate(112 30)"><circle r="14" fill="#e3e0d8" stroke="#222"/><rect x="-3.5" y="-12" width="7" height="24" rx="3" fill="${on ? '#c0392b' : '#4a4a4a'}" transform="rotate(${on ? 90 : 0})"/></g>` +
        T(112, 53, on ? 'ON' : 'OFF', 'dt light sm');
    },
  });
  def('supply1', {
    name: '1-Phase Supply 230V', cat: 'Power', view: 'power', prefix: 'Q', w: 90, h: 70,
    info: 'Single-phase 230 V supply: line (L), neutral (N), earth (PE).',
    terms: [{ id: 'L', x: 20, y: 70 }, { id: 'N', x: 45, y: 70 }, { id: 'PE', x: 70, y: 70 }],
    init: () => ({ on: true }),
    sources: c => c.state.on ? { L: 'L1', N: 'N', PE: 'PE' } : null,
    onPart(c, p, ev) { if (ev === 'down' && p === 'sw') { c.state.on = !c.state.on; return true; } },
    draw(c) {
      const on = c.state.on;
      return R(0, 0, 90, 70, 'url(#gDark)', 6) + T(45, 14, '1~ 230 V', 'dt light') + led(16, 32, on, '#ffb347') +
        `<g class="part" data-part="sw" transform="translate(56 34)"><circle r="12" fill="#e3e0d8" stroke="#222"/><rect x="-3" y="-10" width="6" height="20" rx="3" fill="${on ? '#c0392b' : '#4a4a4a'}" transform="rotate(${on ? 90 : 0})"/></g>`;
    },
  });
  def('battery', {
    name: 'Battery 24 V', cat: 'Power', view: 'power', prefix: 'GB', w: 90, h: 60,
    info: '24 V DC battery: + and −. A DC source on its own, like the 24 V supply, for DC control circuits and DC motors.',
    terms: [{ id: 'P', x: 25, y: 0, l: '+' }, { id: 'M', x: 65, y: 0, l: '−' }],
    init: () => ({ on: true }),
    sources: c => ({ P: 'DC+:' + c.id, M: 'DC-:' + c.id }),
    draw() {
      return R(0, 8, 90, 52, '#2b2d30', 6, '#111') + R(14, 0, 22, 10, '#c0392b', 2, '#111') + R(54, 0, 22, 10, '#2b2d30', 2, '#111') +
        T(45, 38, '24 V', 'dt light big') + T(25, 24, '+', 'dt light') + T(65, 24, '−', 'dt light');
    },
    status: () => '24 V DC',
  });
  def('gen3', {
    name: '3-Phase Generator', cat: 'Power', view: 'power', prefix: 'G', w: 140, h: 80,
    info: 'Generator set 400/230 V, 60 Hz: L1 L2 L3 N PE. Click START/STOP to run it; it supplies like the 3-phase supply while it runs.',
    terms: [{ id: 'L1', x: 20, y: 80 }, { id: 'L2', x: 40, y: 80 }, { id: 'L3', x: 60, y: 80 }, { id: 'N', x: 90, y: 80 }, { id: 'PE', x: 120, y: 80 }],
    init: () => ({ on: false }),
    sources: c => c.state.on ? { L1: 'L1', L2: 'L2', L3: 'L3', N: 'N', PE: 'PE' } : null,
    onPart(c, p, ev) { if (ev === 'down' && p === 'run') { c.state.on = !c.state.on; return true; } },
    draw(c) {
      const on = c.state.on;
      return R(0, 0, 140, 80, '#c9a227', 6, '#6b5512') + R(8, 8, 76, 52, '#2b2d30', 4, '#111') + T(46, 30, 'GS 3~', 'dt light big') + T(46, 48, '400/230 V', 'dt light xs') +
        led(110, 18, on, '#3ddc63') + btn('run', 92, 32, 42, 18, on ? 'STOP' : 'START', on);
    },
    status: c => (c.state.on ? 'Running — 400/230 V' : 'Stopped'),
  });
  def('psu24', {
    name: '24VDC Power Supply', cat: 'Power', view: 'cabinet', prefix: 'G', w: 110, h: 90,
    info: 'Switch-mode PSU. Input L/N 230 VAC → output +24 V / 0 V. Two terminals each for convenience.',
    terms: [{ id: 'L', x: 20, y: 0 }, { id: 'N', x: 40, y: 0 }, { id: 'PE', x: 60, y: 0 },
      { id: 'P1', x: 20, y: 90, l: '+' }, { id: 'P2', x: 40, y: 90, l: '+' }, { id: 'M1', x: 70, y: 90, l: '−' }, { id: 'M2', x: 90, y: 90, l: '−' }],
    init: () => ({ ok: false, burnt: false }),
    conduct: () => [['P1', 'P2'], ['M1', 'M2']],
    sources: c => c.state.ok ? { P1: 'DC+:' + c.id, M1: 'DC-:' + c.id } : null,
    evaluate(c, api) {
      const v = api.v(c, 'L', 'N');
      if (v && v.label === '400VAC' && !c.state.burnt) { c.state.burnt = true; api.alert(`${c.props.label}: power supply destroyed — 400 VAC on a 230 VAC input`, 'danger'); }
      return set(c, 'ok', !!(v && v.label === '230VAC') && !c.state.burnt);
    },
    /* a short on the output puts the supply in current limit: DC OK goes off (shown, not modelled as a source change) */
    tick(c, api) {
      const sh = api.net.short, f = !!c.state.ok && (sh.has(api.root(c, 'P1')) || sh.has(api.root(c, 'M1')));
      if (f && !c.state.dcFault) api.alert(`${c.props.label}: 24 V output short circuit — supply in current limit, DC OK off`, 'danger');
      c.state.dcFault = f;
    },
    status: c => c.state.burnt ? 'Destroyed' : !c.state.ok ? 'No 230 VAC input' : c.state.dcFault ? 'OUTPUT SHORT — current limit, DC OK off' : 'DC OK',
    draw(c) {
      return R(0, 0, 110, 90, 'url(#gMetal)', 4) + band(0, 110) + band(72, 110) +
        T(55, 36, '24V DC', 'dt big') + T(55, 50, '5 A', 'dt sm') + led(92, 34, c.state.ok && !c.state.dcFault, '#3ddc63') + T(92, 46, 'DC OK', 'dt xs') +
        (c.state.burnt ? burnt(110, 90) : '');
    },
  });

  /* ---------- PROTECTION ---------- */
  function breakerOnPart(c, p, ev) {
    if (ev !== 'down' || p !== 'h') return;
    if (c.state.tripped) { c.state.tripped = false; c.state.on = false; } else c.state.on = !c.state.on;
    return true;
  }
  const handleTxt = c => c.state.tripped ? 'TRIP' : c.state.on ? 'ON' : 'OFF';
  def('mccb3', {
    name: 'MCCB 3-Pole', cat: 'Protection', view: 'power', prefix: 'QF', w: 90, h: 120, breaker: 2,
    info: 'Molded-case breaker. Line 1-3-5 → load 2-4-6. Trips on short circuit / ground fault. Click handle: ON/OFF; after a trip, click once to reset.',
    terms: [{ id: '1', x: 25, y: 0 }, { id: '3', x: 45, y: 0 }, { id: '5', x: 65, y: 0 }, { id: '2', x: 25, y: 120 }, { id: '4', x: 45, y: 120 }, { id: '6', x: 65, y: 120 }],
    init: () => ({ on: false, tripped: false }),
    closed: c => c.state.on && !c.state.tripped,
    conduct: c => (c.state.on && !c.state.tripped) ? [['1', '2'], ['3', '4'], ['5', '6']] : null,
    onPart: breakerOnPart,
    draw(c) {
      const s = c.state, hy = s.tripped ? 52 : s.on ? 40 : 64;
      return R(0, 0, 90, 120, 'url(#gDark)', 4) + band(0, 90, 20, '#24231f') + band(100, 90, 20, '#24231f') +
        R(28, 34, 34, 50, '#191816', 3) +
        `<g class="part" data-part="h"><rect x="31" y="${hy}" width="28" height="14" rx="2" fill="${s.tripped ? '#f39c1e' : '#ece9e1'}" stroke="#111"/></g>` +
        T(45, 30, 'MCCB 63A', 'dt light xs') + T(45, 95, handleTxt(c), `dt sm ${s.tripped ? 'warnt' : s.on ? 'ont' : 'light'}`);
    },
  });
  /* modular device on a DIN rail: light grey body, screw rows top and bottom, black legend strip */
  function modBody(w, h, legend, top = 18, bot = 18) {
    return R(0, 0, w, h, '#f1f1ef', 3, '#8b8b86') + R(0, 0, w, top, '#e1e1de', 3, '#8b8b86') + R(0, h - bot, w, bot, '#e1e1de', 3, '#8b8b86') +
      (legend ? `<rect x="0.5" y="${top + 1}" width="${w - 1}" height="9" fill="#1f1f1f"/>` + T(w / 2, top + 8, legend, 'dt light xs') : '');
  }
  function mcbDraw(c, w, poles) {
    const s = c.state, on = s.on && !s.tripped, pw = w / poles;
    let g = modBody(w, 100, 'C16');
    for (let i = 1; i < poles; i++) g += `<line x1="${i * pw}" y1="29" x2="${i * pw}" y2="82" stroke="#c8c8c4"/>`;
    // contact position window per pole: red = closed (ON), green = open
    for (let i = 0; i < poles; i++) g += R(i * pw + pw / 2 - 6, 33, 12, 7, on ? '#d33a2c' : '#3ddc63', 1, '#333');
    const hy = s.tripped ? 56 : on ? 48 : 64;
    return g + `<g class="part" data-part="h"><rect x="3" y="45" width="${w - 6}" height="34" rx="2" fill="#2e2e2c"/><rect x="5" y="${hy}" width="${w - 10}" height="13" rx="2" fill="${s.tripped ? '#f39c1e' : '#0f0f0f'}" stroke="#555"/></g>`;
  }
  def('mcb1', {
    name: 'MCB 1-Pole', cat: 'Protection', view: 'power', prefix: 'QF', w: 40, h: 100, breaker: 1,
    info: 'Miniature breaker for control circuits. 1 → 2. Red flag = ON.',
    terms: [{ id: '1', x: 20, y: 0 }, { id: '2', x: 20, y: 100 }],
    init: () => ({ on: false, tripped: false }),
    closed: c => c.state.on && !c.state.tripped,
    conduct: c => (c.state.on && !c.state.tripped) ? [['1', '2']] : null,
    onPart: breakerOnPart, draw: c => mcbDraw(c, 40, 1),
  });
  def('mcb2', {
    name: 'MCB 2-Pole', cat: 'Protection', view: 'power', prefix: 'QF', w: 70, h: 100, breaker: 1,
    info: 'Two-pole breaker (L + N). 1 → 2 and 3 → 4.',
    terms: [{ id: '1', x: 20, y: 0 }, { id: '3', x: 50, y: 0 }, { id: '2', x: 20, y: 100 }, { id: '4', x: 50, y: 100 }],
    init: () => ({ on: false, tripped: false }),
    closed: c => c.state.on && !c.state.tripped,
    conduct: c => (c.state.on && !c.state.tripped) ? [['1', '2'], ['3', '4']] : null,
    onPart: breakerOnPart, draw: c => mcbDraw(c, 70, 2),
  });
  def('mpcb', {
    name: 'Motor Protection Breaker', cat: 'Protection', view: 'power', prefix: 'QM', w: 100, h: 130, breaker: 1.5,
    props: { ir: '4', trip: 3 },
    pdefs: [{ k: 'ir', n: 'Current setting Ir (A)', opts: ['0.63', '1', '1.6', '2.5', '4', '6.3', '10', '16', '25'] }, { k: 'trip', n: 'Trip delay at overload (s)', type: 'number' }],
    info: 'Motor protection circuit breaker: 1/L1-3/L2-5/L3 → 2/T1-4/T2-6/T3. Trips on a short circuit and on motor overload (jammed or single-phasing). Aux 13-14 is closed while ON. Click the knob: ON/OFF; after a trip, click once to reset. TEST trips it.',
    terms: [{ id: '1', x: 18, y: 0, l: '1/L1' }, { id: '3', x: 40, y: 0, l: '3/L2' }, { id: '5', x: 62, y: 0, l: '5/L3' }, { id: '13', x: 86, y: 0 },
      { id: '2', x: 18, y: 130, l: '2/T1' }, { id: '4', x: 40, y: 130, l: '4/T2' }, { id: '6', x: 62, y: 130, l: '6/T3' }, { id: '14', x: 86, y: 130 }],
    init: () => ({ on: false, tripped: false, heat: 0 }),
    closed: c => c.state.on && !c.state.tripped,
    conduct: c => (c.state.on && !c.state.tripped) ? [['1', '2'], ['3', '4'], ['5', '6'], ['13', '14']] : null,
    tick(c, api, dt) {
      const s = c.state, hot = s.on && !s.tripped && api.feedsOverload(c);
      s.heat = hot ? s.heat + dt : Math.max(0, s.heat - dt * 0.4);
      const tr = Number(c.props.trip), lim = Number.isFinite(tr) ? Math.max(0.1, tr) : 3;
      if (!s.tripped && s.heat >= lim) { s.tripped = true; s.heat = 0; api.alert(`${c.props.label}: motor protection TRIPPED (overload)`, 'warn'); }
      s.heatPct = Math.round(Math.min(1, s.heat / lim) * 100);
    },
    onPart(c, p, ev) {
      if (ev !== 'down') return;
      if (p === 'h') return breakerOnPart(c, p, ev);
      if (p === 'test' && c.state.on && !c.state.tripped) { c.state.tripped = true; return true; }
    },
    draw(c) {
      const s = c.state, a = s.tripped ? 45 : s.on ? 90 : 0;
      return modBody(100, 130, '', 20, 20) + R(0.5, 21, 99, 9, '#1f1f1f', 0, 'none') +
        `<circle cx="26" cy="50" r="11" fill="#fff" stroke="#555"/><path d="M26 50 L33 43" stroke="#d33a2c" stroke-width="2" stroke-linecap="round"/>` + T(26, 72, c.props.ir + ' A', 'dt xs') +
        T(80, 40, s.tripped ? 'TRIPPED' : '', 'dt xs warnt') +
        `<g class="part" data-part="h"><circle cx="66" cy="66" r="17" fill="#3a3a38"/><rect x="62" y="50" width="8" height="32" rx="3" fill="#111" stroke="#555" transform="rotate(${a} 66 66)"/></g>` +
        T(90, 62, 'I', 'dt sm') + T(66, 96, 'O', 'dt sm') +
        `<g class="part" data-part="test"><rect x="12" y="84" width="28" height="12" rx="2" fill="#2fa84f" stroke="#1d5a2c"/>${T(26, 93, 'TEST', 'dt light xs')}</g>` +
        (s.heatPct ? R(12, 101, Math.max(1, 76 * s.heatPct / 100), 4, '#d33a2c', 1, 'none') : '');
    },
    status: c => c.state.tripped ? 'TRIPPED — click the knob to reset' : !c.state.on ? 'OFF' : c.state.heatPct ? `ON · overload ${c.state.heatPct}%` : 'ON',
  });
  def('olr', {
    name: 'Thermal Overload Relay', cat: 'Protection', view: 'power', prefix: 'F', w: 140, h: 110,
    props: { trip: 4 },
    pdefs: [{ k: 'trip', n: 'Trip delay at overload (s)', type: 'number' }],
    info: 'Main poles 1-3-5 → 2-4-6 (always closed). Aux: 95-96 NC opens on trip, 97-98 NO closes on trip. Trips when the motor it feeds is jammed or single-phasing. Blue = RESET, red = TEST.',
    terms: [{ id: '1', x: 20, y: 0 }, { id: '3', x: 40, y: 0 }, { id: '5', x: 60, y: 0 }, { id: '95', x: 85, y: 0 }, { id: '96', x: 100, y: 0 }, { id: '97', x: 115, y: 0 }, { id: '98', x: 130, y: 0 },
      { id: '2', x: 20, y: 110 }, { id: '4', x: 40, y: 110 }, { id: '6', x: 60, y: 110 }],
    init: () => ({ tripped: false, heat: 0 }),
    conduct: c => [['1', '2'], ['3', '4'], ['5', '6'], c.state.tripped ? ['97', '98'] : ['95', '96']],
    tick(c, api, dt) {
      const hot = api.feedsOverload(c);
      const s = c.state;
      s.heat = hot ? s.heat + dt : Math.max(0, s.heat - dt * 0.4);
      const tr = Number(c.props.trip), T = Number.isFinite(tr) ? Math.max(0.1, tr) : 4;   // 0 = trips at once
      if (!s.tripped && s.heat >= T) { s.tripped = true; api.alert(`${c.props.label}: overload relay TRIPPED (motor overcurrent)`, 'warn'); }
      s.heatPct = Math.round(Math.min(1, s.heat / T) * 100);
    },
    onPart(c, p, ev) {
      if (ev !== 'down') return;
      if (p === 'reset') { c.state.tripped = false; c.state.heat = 0; return true; }
      if (p === 'test') { c.state.tripped = true; return true; }
    },
    draw(c) {
      const s = c.state;
      return R(0, 0, 140, 110, 'url(#gPlastic)', 4) + band(0, 140, 18, '#d4cfc4') + band(92, 140, 18, '#d4cfc4') +
        `<circle cx="34" cy="52" r="16" fill="#2f6fd6" stroke="#1b3f7a"/><path d="M34 52 L34 40" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>` + T(34, 79, 'Ir 10A', 'dt xs') +
        `<g class="part" data-part="reset"><circle cx="78" cy="44" r="10" fill="#3a7bd5" stroke="#173e78"/>${T(78, 47, 'R', 'dt light sm')}</g>` +
        `<g class="part" data-part="test"><rect x="98" y="36" width="20" height="14" rx="3" fill="#d33a2c" stroke="#6b201a"/>${T(108, 46, 'T', 'dt light xs')}</g>` +
        R(70, 60, 56, 20, s.tripped ? '#f39c1e' : '#2fa84f', 3, '#333') + T(98, 74, s.tripped ? 'TRIPPED' : 'READY', 'dt light sm') +
        (s.heatPct ? R(70, 84, Math.max(1, 56 * s.heatPct / 100), 4, '#d33a2c', 1, 'none') : '');
    },
    status: c => c.state.tripped ? 'TRIPPED — press R to reset' : c.state.heatPct ? `heating ${c.state.heatPct}%` : 'Ready',
  });

  /* ---------- CONTROL ---------- */
  def('contactor', {
    name: 'Contactor', cat: 'Control', view: 'cabinet', prefix: 'KM', w: 120, h: 140,
    props: { coil: '230VAC' },
    pdefs: [{ k: 'coil', n: 'Coil voltage', opts: RATINGS }],
    info: 'Coil A1-A2. Main poles 1/L1-2/T1, 3/L2-4/T2, 5/L3-6/T3. Aux 13-14 NO, 21-22 NC. Wrong coil voltage → no pull-in (too low) or burnt coil (too high).',
    terms: [{ id: 'A1', x: 10, y: 0 }, { id: '1', x: 30, y: 0, l: '1/L1' }, { id: '3', x: 50, y: 0, l: '3/L2' }, { id: '5', x: 70, y: 0, l: '5/L3' }, { id: '13', x: 92, y: 0 }, { id: '21', x: 110, y: 0 },
      { id: 'A2', x: 10, y: 140 }, { id: '2', x: 30, y: 140, l: '2/T1' }, { id: '4', x: 50, y: 140, l: '4/T2' }, { id: '6', x: 70, y: 140, l: '6/T3' }, { id: '14', x: 92, y: 140 }, { id: '22', x: 110, y: 140 }],
    init: () => ({ pulled: false, burnt: false }),
    conduct: c => c.state.pulled ? [['1', '2'], ['3', '4'], ['5', '6'], ['13', '14']] : [['21', '22']],
    evaluate(c, api) { return set(c, 'pulled', coilOn(c, api, 'A1', 'A2')); },
    draw(c) {
      const p = c.state.pulled;
      // indicator window: the white bar drops into view when the contactor pulls in
      return modBody(120, 140, '', 22, 22) + T(20, 34, 'NO', 'dt xs') + T(101, 34, 'NC', 'dt xs') +
        R(30, 52, 60, 22, '#2a2a28', 2) + [0, 1, 2, 3].map(i => R(34 + i * 14, p ? 62 : 56, 10, 8, '#f4f4f2', 1, '#111')).join('') +
        T(60, 90, c.props.coil, 'dt xs') + T(60, 101, '3P + 1NO 1NC', 'dt xs') + led(100, 63, p, '#3ddc63', 3) +
        (c.state.burnt ? burnt(120, 140) : '');
    },
    status: c => c.state.burnt ? 'Coil burnt' : c.state.pulled ? 'Energized (pulled in)' : 'De-energized',
  });
  def('contactor4', {
    name: 'Contactor 4-Pole', cat: 'Control', view: 'cabinet', prefix: 'KM', w: 120, h: 140,
    props: { coil: '230VAC' },
    pdefs: [{ k: 'coil', n: 'Coil voltage', opts: RATINGS }],
    info: 'Coil A1-A2. Four main poles 1-2, 3-4, 5-6, 7-8 (e.g. L1 L2 L3 and N). Aux 13-14 N.O.',
    terms: [{ id: 'A1', x: 10, y: 0 }, { id: '1', x: 30, y: 0 }, { id: '3', x: 50, y: 0 }, { id: '5', x: 70, y: 0 }, { id: '7', x: 90, y: 0 }, { id: '13', x: 110, y: 0 },
      { id: 'A2', x: 10, y: 140 }, { id: '2', x: 30, y: 140 }, { id: '4', x: 50, y: 140 }, { id: '6', x: 70, y: 140 }, { id: '8', x: 90, y: 140 }, { id: '14', x: 110, y: 140 }],
    init: () => ({ pulled: false, burnt: false }),
    conduct: c => c.state.pulled ? [['1', '2'], ['3', '4'], ['5', '6'], ['7', '8'], ['13', '14']] : null,
    evaluate(c, api) { return set(c, 'pulled', coilOn(c, api, 'A1', 'A2')); },
    draw: c => DEFS.contactor.draw(c).replace('3P + 1NO 1NC', '4P + 1NO'),
    status: c => c.state.burnt ? 'Coil burnt' : c.state.pulled ? 'Energized (pulled in)' : 'De-energized',
  });
  /* impulse relay (latching, "teleruptor"): every pulse on the coil toggles the contact, which then stays */
  def('impulse', {
    name: 'Impulse Relay', cat: 'Control', view: 'cabinet', prefix: 'KI', w: 70, h: 110,
    props: { coil: '230VAC' },
    pdefs: [{ k: 'coil', n: 'Coil voltage', opts: RATINGS }],
    info: 'Coil A1-A2. Each pulse on the coil toggles the contact 1-2 (N.O.) and 3-4 (N.C.); it stays until the next pulse. Typical use: one lamp switched from several push buttons. Click the lever to toggle by hand.',
    terms: [{ id: 'A1', x: 12, y: 0 }, { id: '1', x: 36, y: 0 }, { id: '3', x: 58, y: 0 }, { id: 'A2', x: 12, y: 110 }, { id: '2', x: 36, y: 110 }, { id: '4', x: 58, y: 110 }],
    init: () => ({ pw: false, closed: false, burnt: false }),
    conduct: c => c.state.closed ? [['1', '2']] : [['3', '4']],
    evaluate(c, api) {
      const on = coilOn(c, api, 'A1', 'A2'), s = c.state;
      if (on && !s.pw) s.closed = !s.closed;   // rising edge of the coil
      return set(c, 'pw', on) || false;
    },
    onPart(c, p, ev) { if (p === 'lever' && ev === 'down') { c.state.closed = !c.state.closed; return true; } },
    draw(c) {
      const s = c.state;
      return modBody(70, 110, 'IMPULSE', 18, 18) + `<g class="part" data-part="lever">${R(22, 46, 26, 30, '#2a2a28', 3)}${R(26, s.closed ? 50 : 60, 18, 12, s.closed ? '#2fa84f' : '#e9e9e6', 2, '#111')}</g>` +
        T(35, 88, s.closed ? 'ON' : 'OFF', 'dt xs') + led(58, 40, s.pw, '#3ddc63', 3) + T(35, 100, c.props.coil, 'dt xs') + (s.burnt ? burnt(70, 110) : '');
    },
    status: c => (c.state.closed ? '1-2 closed (ON)' : '1-2 open (OFF)') + (c.state.pw ? ' · coil on' : ''),
  });
  /* latching relay: a pulse on the SET coil (A1-A2) closes 11-14, a pulse on the RESET coil (B1-B2) opens it again */
  def('latch', {
    name: 'Latching Relay (set/reset)', cat: 'Control', view: 'cabinet', prefix: 'KA', w: 90, h: 110,
    props: { coil: '24VDC' }, pdefs: [{ k: 'coil', n: 'Coil voltage', opts: RATINGS }],
    info: 'Two coils: SET A1-A2 and RESET B1-B2. A pulse on SET closes 11-14 (11-12 opens) and it stays, even with no power, until a pulse on RESET.',
    terms: [{ id: 'A1', x: 10, y: 0 }, { id: 'B1', x: 28, y: 0 }, { id: '11', x: 60, y: 0 }, { id: 'A2', x: 10, y: 110 }, { id: 'B2', x: 28, y: 110 }, { id: '12', x: 52, y: 110 }, { id: '14', x: 72, y: 110 }],
    init: () => ({ set: false, burnt: false }),
    conduct: c => c.state.set ? [['11', '14']] : [['11', '12']],
    evaluate(c, api) {
      const s = coilOn(c, api, 'A1', 'A2'), r = coilOn(c, api, 'B1', 'B2');
      if (s && !r) return set(c, 'set', true);
      if (r && !s) return set(c, 'set', false);
      return false;
    },
    draw(c) {
      const on = c.state.set;
      return modBody(90, 110, 'LATCH', 18, 18) + T(22, 42, 'SET', 'dt xs') + T(22, 54, 'RESET', 'dt xs') + R(46, 36, 34, 34, '#2a2a28', 3) + R(50, on ? 40 : 54, 26, 12, on ? '#2fa84f' : '#e9e9e6', 2, '#111') + T(45, 86, c.props.coil, 'dt xs') + (c.state.burnt ? burnt(90, 110) : '');
    },
    status: c => c.state.set ? 'SET — 11-14 closed' : 'RESET — 11-12 closed',
  });
  def('relay', {
    name: 'Control Relay', cat: 'Control', view: 'cabinet', prefix: 'KA', w: 90, h: 110,
    props: { coil: '24VDC' },
    pdefs: [{ k: 'coil', n: 'Coil voltage', opts: RATINGS }],
    info: 'Coil A1-A2. Two changeover contacts: 11 common → 12 NC / 14 NO, 21 common → 22 NC / 24 NO.',
    terms: [{ id: 'A1', x: 12, y: 0 }, { id: '11', x: 45, y: 0 }, { id: '21', x: 75, y: 0 },
      { id: 'A2', x: 12, y: 110 }, { id: '12', x: 35, y: 110 }, { id: '14', x: 52, y: 110 }, { id: '22', x: 67, y: 110 }, { id: '24', x: 84, y: 110 }],
    init: () => ({ pulled: false, burnt: false }),
    conduct: c => c.state.pulled ? [['11', '14'], ['21', '24']] : [['11', '12'], ['21', '22']],
    evaluate(c, api) { return set(c, 'pulled', coilOn(c, api, 'A1', 'A2')); },
    draw(c) {
      const p = c.state.pulled;
      return R(0, 0, 90, 110, '#e7e2d6', 5, '#7b766c') + band(0, 90, 18, '#cfc9bd') + band(92, 90, 18, '#cfc9bd') +
        R(14, 28, 62, 50, 'rgba(160,200,230,.35)', 4, '#8aa') +
        `<path d="M22 ${p ? 46 : 54} L68 ${p ? 46 : 54}" stroke="#b07a2a" stroke-width="3"/>` +
        led(70, 34, p, '#ff4b3a') + T(45, 72, c.props.coil, 'dt xs') + T(45, 87, '2 C/O', 'dt xs') +
        (c.state.burnt ? burnt(90, 110) : '');
    },
    status: c => c.state.burnt ? 'Coil burnt' : c.state.pulled ? 'Energized' : 'De-energized',
  });
  const TSTEPS = [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 45, 60];
  def('timer', {
    name: 'On-Delay Timer Relay', cat: 'Control', view: 'cabinet', prefix: 'KT', w: 90, h: 110,
    props: { coil: '230VAC', t: 5 },
    pdefs: [{ k: 'coil', n: 'Coil voltage', opts: RATINGS }, { k: 't', n: 'Delay (s)', type: 'number' }],
    info: 'Coil A1-A2. After the delay: 15-18 closes (NO), 15-16 opens (NC). Resets instantly when coil drops. Click − / + beside the dial to set the delay.',
    terms: [{ id: 'A1', x: 12, y: 0 }, { id: '15', x: 55, y: 0 }, { id: 'A2', x: 12, y: 110 }, { id: '16', x: 45, y: 110 }, { id: '18', x: 72, y: 110 }],
    init: () => ({ pw: false, el: 0, done: false, burnt: false }),
    conduct: c => c.state.done ? [['15', '18']] : [['15', '16']],
    evaluate(c, api) {
      const on = coilOn(c, api, 'A1', 'A2');
      let ch = set(c, 'pw', on);
      if (!on) { c.state.el = 0; ch = set(c, 'done', false) || ch; }
      return ch;
    },
    tick(c, api, dt) {
      const s = c.state, t = Number(c.props.t) || 0;
      if (s.pw && !s.done) { s.el = Math.min(t, s.el + dt); if (s.el >= t) s.done = true; }
      s.elD = Math.round(s.el * 10) / 10;
    },
    onPart(c, p, ev) {
      if (ev !== 'down' || (p !== 'up' && p !== 'dn')) return;
      const t = Number(c.props.t) || 0, i = TSTEPS.findIndex(x => x >= t);
      const k = p === 'up' ? (i < 0 ? TSTEPS.length - 1 : TSTEPS[i] > t ? i : Math.min(TSTEPS.length - 1, i + 1)) : Math.max(0, (i < 0 ? TSTEPS.length : i) - 1);
      c.props.t = TSTEPS[k];
      return true;
    },
    draw(c) {
      // set-point dial: the pointer shows the delay on a 0–60 s scale; the bar under it fills while timing
      const s = c.state, t = Number(c.props.t) || 0, fr = Math.min(1, t / 60), a = (-225 + 270 * fr) * Math.PI / 180;
      const tick = i => { const r = (-225 + 27 * i) * Math.PI / 180; return `<line x1="${45 + 19 * Math.cos(r)}" y1="${50 + 19 * Math.sin(r)}" x2="${45 + 22 * Math.cos(r)}" y2="${50 + 22 * Math.sin(r)}" stroke="#555"/>`; };
      return modBody(90, 110, '', 18, 18) + Array.from({ length: 11 }, (_, i) => tick(i)).join('') +
        `<circle cx="45" cy="50" r="16" fill="#2f6fd6" stroke="#1b3f7a"/><path d="M45 50 L${45 + 13 * Math.cos(a)} ${50 + 13 * Math.sin(a)}" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>` +
        `<g class="part" data-part="dn"><rect x="2" y="54" width="16" height="16" rx="3" fill="#e1e1de" stroke="#777"/>${T(10, 66, '−', 'dt sm')}</g>` +
        `<g class="part" data-part="up"><rect x="72" y="54" width="16" height="16" rx="3" fill="#e1e1de" stroke="#777"/>${T(80, 66, '+', 'dt sm')}</g>` +
        T(45, 80, `${t} s`, 'dt sm') + R(14, 84, 62, 4, '#d4d4d0', 1, 'none') + (t && s.el ? R(14, 84, Math.max(1, 62 * Math.min(1, s.el / t)), 4, '#f2c230', 1, 'none') : '') +
        led(14, 30, s.pw, '#3ddc63') + T(14, 41, 'U', 'dt xs') + led(76, 30, s.done, '#f2c230') + T(76, 41, 'R', 'dt xs') +
        (s.burnt ? burnt(90, 110) : '');
    },
    status: c => c.state.done ? 'Timed out — 15-18 closed' : c.state.pw ? `Timing ${(c.state.elD || 0).toFixed(1)} s` : 'Idle',
  });
  def('timer_off', {
    name: 'Off-Delay Timer Relay', cat: 'Control', view: 'cabinet', prefix: 'KT', w: 90, h: 110,
    props: { coil: '230VAC', t: 5 },
    pdefs: [{ k: 'coil', n: 'Coil voltage', opts: RATINGS }, { k: 't', n: 'Delay (s)', type: 'number' }],
    info: 'Coil A1-A2. With the coil on, 15-18 closes (NO) and 15-16 opens (NC) at once; when the coil drops they stay switched for the delay, then go back. Click − / + to set the delay.',
    terms: [{ id: 'A1', x: 12, y: 0 }, { id: '15', x: 55, y: 0 }, { id: 'A2', x: 12, y: 110 }, { id: '16', x: 45, y: 110 }, { id: '18', x: 72, y: 110 }],
    init: () => ({ pw: false, el: 0, on: false, burnt: false }),
    conduct: c => c.state.on ? [['15', '18']] : [['15', '16']],
    evaluate(c, api) {
      const on = coilOn(c, api, 'A1', 'A2');
      let ch = set(c, 'pw', on);
      if (on) { c.state.el = 0; ch = set(c, 'on', true) || ch; }
      return ch;
    },
    tick(c, api, dt) {
      const s = c.state, t = Number(c.props.t) || 0;
      if (!s.pw && s.on) { s.el = Math.min(t, s.el + dt); if (s.el >= t) { s.on = false; s.el = 0; } }
      s.elD = Math.round(s.el * 10) / 10;
    },
    onPart: (c, p, ev) => DEFS.timer.onPart(c, p, ev),
    draw: c => DEFS.timer.draw({ ...c, state: { ...c.state, done: c.state.on } }) + T(45, 104, 'OFF-DELAY', 'dt xs'),
    status: c => c.state.pw ? 'Coil on — 15-18 closed' : c.state.on ? `Delay ${(c.state.elD || 0).toFixed(1)} s — 15-18 still closed` : 'Idle',
  });
  def('tblock', {
    name: 'Terminal Strip (6)', cat: 'Control', view: 'none', prefix: 'X', w: 140, h: 60,
    info: 'Six feed-through terminals: top n is connected to bottom n. Use as junction points / bus.',
    terms: [0, 1, 2, 3, 4, 5].flatMap(i => [{ id: 't' + (i + 1), x: 15 + i * 22, y: 0, l: String(i + 1) }, { id: 'b' + (i + 1), x: 15 + i * 22, y: 60, l: String(i + 1) }]),
    conduct: () => [1, 2, 3, 4, 5, 6].map(i => ['t' + i, 'b' + i]),
    draw() {
      let s = '';
      for (let i = 0; i < 6; i++) s += R(5 + i * 22, 0, 20, 60, i % 2 ? '#8b8f95' : '#9ca1a8', 2, '#555') + R(9 + i * 22, 24, 12, 12, '#e8e6df', 1, '#666');
      return s;
    },
  });
  /* Terminal block group PE L1 L2 L3 N: each top terminal is linked to the one below it */
  const TB5 = [['PE', '#59a845'], ['L1', '#a7abb0'], ['L2', '#a7abb0'], ['L3', '#a7abb0'], ['N', '#f4f4f0']];
  def('tb5', {
    name: 'Terminal Block PE-L1-L2-L3-N', cat: 'Wiring', view: 'none', prefix: 'X', w: 100, h: 80,
    info: 'Five feed-through terminals on a DIN rail: green PE, grey L1 L2 L3, blue N. Each top terminal is connected to the one below it.',
    terms: TB5.flatMap(([n], i) => [{ id: n, x: 10 + i * 20, y: 0 }, { id: n + 'b', x: 10 + i * 20, y: 80, l: n }]),
    conduct: () => TB5.map(([n]) => [n, n + 'b']),
    draw() {
      return TB5.map(([n, col], i) => R(i * 20 + 0.5, 0, 19, 80, col, 2, '#4a4a46') + R(i * 20 + 3, 34, 14, 12, '#f4f4f2', 1, '#666') + T(i * 20 + 10, 43, n, 'dt xs')).join('') +
        `<rect x="2" y="37" width="16" height="2" fill="#f2c230"/><rect x="2" y="43" width="16" height="2" fill="#f2c230"/>`;
    },
  });
  /* DIN rail: mounting only (no terminals); devices dropped on it snap onto its centre line */
  def('din', {
    name: 'DIN Rail', cat: 'Wiring', view: 'none', prefix: 'RAIL', w: 400, h: 36, rail: true,
    props: { len: '400' },
    pdefs: [{ k: 'len', n: 'Length', opts: ['200', '300', '400', '600', '800', '1000'] }],
    info: 'Mounting rail. Drag a device onto it and the device snaps onto the rail. Change its length in the properties.',
    terms: [],
    dims: c => ({ w: Number(c.props.len) || 400 }),
    draw(c) {
      const w = c ? Number(c.props.len) || 400 : 400;
      let g = R(0, 0, w, 36, 'url(#gRail)', 2, '#8c7444') + `<rect x="0" y="9" width="${w}" height="18" fill="#a88a4e" opacity=".5"/>`;
      for (let x = 30; x < w - 20; x += 70) g += `<rect x="${x}" y="13" width="34" height="10" rx="5" fill="#f4f4f2" stroke="#8c7444"/>`;
      return g;
    },
  });
  /* Junction: a dot where wires meet (made by clicking an existing wire); one terminal, no drawing of its own */
  def('jct', {
    name: 'Wire junction', cat: 'Wiring', view: 'none', prefix: 'J', w: 0, h: 0, hidden: true, junction: true,
    info: 'Junction dot: every wire that ends here is connected. Right-click it to delete it with its wires.',
    terms: [{ id: 'J', x: 0, y: 0, l: '', dir: 0 }],
    draw: () => '',
  });
  /* PLC: compact controller. 12 DC inputs, 8 relay outputs in two groups. */
  const PLC_IN = 12, PLC_OUT = 8;
  def('plc', {
    name: 'PLC (compact, 12 in / 8 out)', cat: 'Control', view: 'cabinet', prefix: 'PLC', w: 440, h: 200, unique: 'cpu', uniqueMsg: 'Only one PLC (compact or CPU module) per project',
    info: 'Power L1/N 230 VAC. Built-in 24 VDC sensor supply (+24 / COM). Inputs I:0/0–I:0/11 are 24 VDC, referenced to input COM. Relay outputs: O:0/0–3 switch from VAC-VDC0, O:0/4–7 from VAC-VDC1. Click the key switch to change PROG/RUN.',
    terms: [{ id: 'L1', x: 20, y: 0 }, { id: 'N', x: 40, y: 0, l: 'L2/N' }, { id: 'PE', x: 62, y: 0 }, { id: 'V24', x: 90, y: 0, l: '+24' }, { id: 'C24', x: 112, y: 0, l: 'COM' },
      { id: 'COM', x: 150, y: 0, l: 'COM' }, ...Array.from({ length: PLC_IN }, (_, i) => ({ id: 'I' + i, x: 174 + i * 22, y: 0, l: String(i) })),
      { id: 'VAC0', x: 20, y: 200, l: 'VAC0' }, ...[0, 1, 2, 3].map(i => ({ id: 'O' + i, x: 50 + i * 22, y: 200, l: String(i) })),
      { id: 'VAC1', x: 160, y: 200, l: 'VAC1' }, ...[4, 5, 6, 7].map(i => ({ id: 'O' + i, x: 190 + (i - 4) * 22, y: 200, l: String(i) }))],
    init: () => ({ pw: false, burnt: false, badIn: 0 }),
    conduct(c, ctx) {
      if (!c.state.pw || !ctx || ctx.plcId !== c.id) return null;
      const out = [];
      for (let k = 0; k < PLC_OUT; k++) if ((ctx.plcOut >> k) & 1) out.push([k < 4 ? 'VAC0' : 'VAC1', 'O' + k]);
      return out;
    },
    sources: c => c.state.pw ? { V24: 'DC+:' + c.id, C24: 'DC-:' + c.id } : null,
    evaluate(c, api, ctx) {
      const v = api.v(c, 'L1', 'N');
      if (v && v.label === '400VAC' && !c.state.burnt) { c.state.burnt = true; api.alert('PLC destroyed — 400 VAC applied to 230 VAC power terminals', 'danger'); }
      const ch = set(c, 'pw', !!(v && v.kind === 'AC' && v.label === '230VAC') && !c.state.burnt);
      if (ctx && ctx.plcId === c.id) {
        let w = 0;
        if (c.state.pw) for (let i = 0; i < PLC_IN; i++) {
          const v = api.v(c, 'I' + i, 'COM');
          if (v && v.kind === 'AC' && !(c.state.badIn & (1 << i))) {
            c.state.badIn |= 1 << i;
            api.alert(`${c.props.label}: input I:0/${i} destroyed — ${v.label} applied to a 24 VDC input`, 'danger');
          }
          if (v && v.kind === 'DC' && !(c.state.badIn & (1 << i))) w |= 1 << i;
        }
        ctx.plcIn = w; ctx.plcPowered = c.state.pw;
      }
      return ch;
    },
    onPart(c, p, ev, ctx) { if (ev === 'down' && p === 'mode' && ctx && ctx.setMode) { ctx.setMode(ctx.mode === 'RUN' ? 'PROG' : 'RUN'); return true; } },
    draw(c, ctx) {
      const me = ctx && ctx.plcId === c.id;
      const pw = c.state.pw, run = me && pw && ctx.mode === 'RUN';
      const inW = me ? ctx.plcInRaw : 0, outW = me ? ctx.plcOut : 0;
      let s = R(0, 0, 440, 200, 'url(#gPlc)', 6, '#3a3833') + band(0, 440, 22, '#1e1d1a') + band(178, 440, 22, '#1e1d1a');
      const fmt = (ctx && ctx.fmt) || (a => a);
      s += T(48, 36, 'AC POWER', 'dt light xs') + T(101, 36, '24VDC OUT', 'dt light xs') + T(300, 36, `INPUTS  ${fmt('I:0/0')} – ${fmt('I:0/11')}  (24 VDC)`, 'dt light xs');
      s += T(90, 170, `RELAY OUT  ${fmt('O:0/0')} – ${fmt('O:0/3')}`, 'dt light xs') + T(225, 170, `RELAY OUT  ${fmt('O:0/4')} – ${fmt('O:0/7')}`, 'dt light xs');
      s += T(22, 66, 'PLC-20', 'dt light brand', 'start') + T(22, 80, 'Compact controller', 'dt light xs', 'start');
      const st = [['POWER', pw, '#3ddc63'], ['RUN', run, '#3ddc63'], ['FAULT', !!c.state.burnt, '#ff4b3a'], ['FORCE', me && pw && ctx.forces, '#f2c230']];
      st.forEach(([n, on, col], i) => { s += led(28, 98 + i * 15, on, col, 3.6) + T(38, 101 + i * 15, n, 'dt light xs', 'start'); });
      // LCD: I/O status, an active bit is shown inverted (dark cell, light digit)
      s += R(150, 52, 280, 92, '#3b4652', 4, '#1d232a') + R(156, 58, 268, 80, pw ? '#c9d86c' : '#8f9a5a', 2, '#2d3a1e');
      const cell = (x, y, n, on, bad) => R(x - 8, y - 11, 16, 15, on ? (bad ? '#a3241a' : '#1e2a10') : 'none', 1, 'none') + `<text class="lcd${on ? ' on' : ''}" x="${x}" y="${y}" text-anchor="middle">${n}</text>`;
      s += `<text class="lcd" x="162" y="80">I</text>`;
      for (let i = 0; i < PLC_IN; i++) { const bad = (c.state.badIn >> i) & 1; s += cell(186 + i * 20, 80, i, pw && (((inW >> i) & 1) || bad), bad); }
      s += `<text class="lcd" x="162" y="112">Q</text>`;
      for (let i = 0; i < PLC_OUT; i++) s += cell(186 + i * 20, 112, i, pw && (outW >> i) & 1);
      s += `<text class="lcd sm" x="416" y="132" text-anchor="end">${pw ? (me ? ctx.mode : 'INACTIVE') : ''}</text>`;
      s += `<g class="part" data-part="mode"><rect x="100" y="94" width="40" height="52" rx="4" fill="#33312c" stroke="#111"/><circle cx="120" cy="112" r="10" fill="#c9c5bb" stroke="#111"/><rect x="118" y="103" width="4" height="18" rx="1" fill="#333" transform="rotate(${run ? 40 : -40} 120 112)"/>${T(120, 138, me ? ctx.mode : '—', 'dt light xs')}</g>`;
      if (c.state.burnt) s += burnt(440, 200);
      return s;
    },
    status: (c, ctx) => (c.state.badIn ? `Damaged input(s): ${Array.from({ length: PLC_IN }, (_, i) => i).filter(i => (c.state.badIn >> i) & 1).map(i => 'I:0/' + i).join(', ')} — right-click → Repair. ` : '') +
      (!c.state.pw ? 'No power on L1/N' : (ctx && ctx.plcId === c.id ? ctx.mode + ' mode' : 'Second PLC (inactive)')),
  });

  /* ---------- MODULAR PLC: rack power supply, CPU (slot 0) and I/O cards (slots 1–7) ----------
     The modules snap on a DIN rail; the backplane is shared, so the cards follow the CPU and
     the rack power supply. A card in slot s is addressed I:s/b or O:s/b. */
  const SLOTS = ['1', '2', '3', '4', '5', '6', '7'];
  const rackOn = ctx => !!(ctx && ctx.rack && ctx.rack.pw);
  // the card works: a CPU is present, the card is the first one in its slot and the I/O configuration expects it there
  const cardOn = (c, ctx) => !!(ctx && ctx.rack && ctx.rack.cpu && ctx.plcId === ctx.rack.cpu && ctx.rack.slots[c.props.slot] === c.id && ctx.rack.conf[c.props.slot] === c.type);
  // why a card does not work (for its status line)
  const cardWhy = (c, ctx) => {
    const r = ctx && ctx.rack;
    if (!r || !r.cpu) return 'No CPU module in the rack';
    if (r.slots[c.props.slot] !== c.id) return `Slot ${c.props.slot} is already taken — inactive`;
    const want = r.conf[c.props.slot];
    return want ? `I/O configuration expects ${DEFS[want].name} in slot ${c.props.slot} — inactive` : `Slot ${c.props.slot} is not in the I/O configuration — inactive`;
  };
  const cardBody = (w, h, title, sub) => R(0, 0, w, h, 'url(#gPlc)', 4, '#3a3833') + T(8, 48, title, 'dt light brand', 'start') + T(8, 62, sub, 'dt light xs', 'start');
  // the card's address range in the chosen address style (ctx.fmt), e.g. I:1/0 – I:1/7 or I0.0 – I0.7
  const rng = (ctx, f, s) => { const fmt = (ctx && ctx.fmt) || (a => a); return `${fmt(`${f}:${s}/0`)} – ${fmt(`${f}:${s}/7`)}`; };
  const slotTag = (w, s) => R(w - 46, 36, 38, 16, '#e8e6df', 3, '#555') + T(w - 27, 47.5, s, 'dt xs');
  def('mpsu', {
    name: 'Rack Power Supply 230VAC / 24VDC', cat: 'PLC Rack', view: 'cabinet', prefix: 'PS', w: 100, h: 160, unique: 'psu', uniqueMsg: 'Only one rack power supply per project',
    info: 'Powers the rack backplane (CPU and I/O cards) from L1/N 230 VAC. Also gives 24 VDC (+24 / COM) for sensors, input cards and transistor outputs. Snap it on the DIN rail with the CPU and the cards.',
    terms: [{ id: 'L1', x: 20, y: 0 }, { id: 'N', x: 45, y: 0, l: 'N' }, { id: 'PE', x: 70, y: 0 }, { id: 'V24', x: 30, y: 160, l: '+24' }, { id: 'C24', x: 65, y: 160, l: 'COM' }],
    init: () => ({ pw: false, burnt: false }),
    sources: c => c.state.pw ? { V24: 'DC+:' + c.id, C24: 'DC-:' + c.id } : null,
    evaluate(c, api, ctx) {
      const v = api.v(c, 'L1', 'N');
      if (v && v.label === '400VAC' && !c.state.burnt) { c.state.burnt = true; api.alert(`${c.props.label}: destroyed — 400 VAC applied to a 230 VAC power supply`, 'danger'); }
      const ch = set(c, 'pw', !!(v && v.kind === 'AC' && v.label === '230VAC') && !c.state.burnt);
      if (ctx && ctx.rack) ctx.rack.pw = c.state.pw;
      return ch;
    },
    draw(c) {
      return R(0, 0, 100, 160, 'url(#gPlc)', 4, '#3a3833') + band(0, 100, 22, '#1e1d1a') + band(138, 100, 22, '#1e1d1a') +
        T(8, 44, 'PSU', 'dt light brand', 'start') + T(8, 58, '230VAC IN', 'dt light xs', 'start') + T(8, 70, '24VDC OUT', 'dt light xs', 'start') +
        led(16, 92, c.state.pw, '#3ddc63', 3.6) + T(26, 95, 'DC OK', 'dt light xs', 'start') +
        R(14, 106, 72, 24, '#2a2925', 3, '#111') + T(50, 122, 'RACK', 'dt light xs') + (c.state.burnt ? burnt(100, 160) : '');
    },
    status: c => c.state.burnt ? 'Destroyed' : c.state.pw ? 'Backplane powered, 24 VDC out' : 'No 230 VAC on L1/N',
  });
  def('mcpu', {
    name: 'PLC CPU Module (slot 0)', cat: 'PLC Rack', view: 'cabinet', prefix: 'CPU', w: 120, h: 160, unique: 'cpu', uniqueMsg: 'Only one PLC (compact or CPU module) per project',
    info: 'Controller of the modular PLC, always slot 0. It runs the ladder. Powered by the rack power supply. I/O cards in slots 1–7 are addressed I:slot/bit and O:slot/bit. Click the key switch to change PROG/RUN.',
    terms: [],
    init: () => ({ pw: false }),
    evaluate(c, api, ctx) {
      const ch = set(c, 'pw', rackOn(ctx));
      if (ctx && ctx.plcId === c.id) { ctx.plcIn = 0; ctx.plcPowered = c.state.pw; }
      return ch;
    },
    onPart(c, p, ev, ctx) { if (ev === 'down' && p === 'mode' && ctx && ctx.setMode) { ctx.setMode(ctx.mode === 'RUN' ? 'PROG' : 'RUN'); return true; } },
    ctxSig: (c, ctx) => `|${ctx.plcId}|${ctx.mode}|${ctx.forces}|${ctx.rack && ctx.rack.bad.length}`,
    draw(c, ctx) {
      const me = ctx && ctx.plcId === c.id, pw = c.state.pw, run = me && pw && ctx.mode === 'RUN';
      let s = cardBody(120, 160, 'CPU', 'Modular controller') + band(0, 120, 22, '#1e1d1a') + slotTag(120, 'SLOT 0');
      const st = [['PWR', pw, '#3ddc63'], ['RUN', run, '#3ddc63'], ['FLT', me && pw && ctx.rack && ctx.rack.bad.length > 0, '#ff4b3a'], ['FORCE', me && pw && ctx.forces, '#f2c230']];
      st.forEach(([n, on, col], i) => { s += led(14, 80 + i * 14, on, col, 3.4) + T(23, 83 + i * 14, n, 'dt light xs', 'start'); });
      s += `<g class="part" data-part="mode"><rect x="68" y="76" width="42" height="56" rx="4" fill="#33312c" stroke="#111"/><circle cx="89" cy="96" r="10" fill="#c9c5bb" stroke="#111"/><rect x="87" y="87" width="4" height="18" rx="1" fill="#333" transform="rotate(${run ? 40 : -40} 89 96)"/>${T(89, 124, me ? ctx.mode : '—', 'dt light xs')}</g>`;
      return s + R(10, 140, 100, 12, '#2a2925', 2, '#111') + T(60, 149, 'COMM', 'dt light xs');
    },
    status: (c, ctx) => !c.state.pw ? 'No power from the rack power supply' : (ctx && ctx.plcId === c.id ? ctx.mode + ' mode' + (ctx.rack && ctx.rack.bad.length ? ' — I/O configuration mismatch: ' + ctx.rack.bad.map(b => b.msg).join('; ') : '') : 'Second PLC (inactive)'),
  });
  /* input card: 8 inputs I0–I7 and their common on top; ok(v) says whether a voltage is a valid ON signal */
  function inCard(type, name, sub, info, ok, bad) {
    def(type, {
      name, cat: 'PLC Rack', view: 'cabinet', prefix: 'DI', w: 190, h: 160, slot: true,
      props: { slot: '1' }, pdefs: [{ k: 'slot', n: 'Slot', opts: SLOTS }],
      info,
      terms: [...Array.from({ length: 8 }, (_, i) => ({ id: 'I' + i, x: 15 + i * 20, y: 0, l: String(i) })), { id: 'COM', x: 175, y: 0 }],
      init: () => ({ badIn: 0 }),
      evaluate(c, api, ctx) {
        if (!cardOn(c, ctx)) return false;
        const s = Number(c.props.slot);
        let w = 0;
        if (rackOn(ctx)) for (let i = 0; i < 8; i++) {
          const v = api.v(c, 'I' + i, 'COM');
          if (v && bad(v) && !(c.state.badIn & (1 << i))) { c.state.badIn |= 1 << i; api.alert(`${c.props.label}: input I:${s}/${i} destroyed — ${v.label} applied to a ${sub} input`, 'danger'); }
          if (v && ok(v) && !(c.state.badIn & (1 << i))) w |= 1 << i;
        }
        ctx.plcInX[s] = w;
        return false;
      },
      ctxSig: (c, ctx) => `|${cardOn(c, ctx)}|${rackOn(ctx)}|${ctx.plcInX[c.props.slot]}|${ctx.fmt && ctx.fmt(`I:${c.props.slot}/0`)}`,
      draw(c, ctx) {
        const on = cardOn(c, ctx) && rackOn(ctx), w = on ? ctx.plcInX[c.props.slot] || 0 : 0;
        let s = cardBody(190, 160, 'INPUT 8', sub) + band(0, 190, 22, '#1e1d1a') + slotTag(190, 'SLOT ' + c.props.slot);
        for (let i = 0; i < 8; i++) { const b = (c.state.badIn >> i) & 1; s += led(20 + i * 20, 92, b || ((w >> i) & 1), b ? '#ff4b3a' : '#f2c230', 4) + T(20 + i * 20, 108, String(i), 'dt light xs'); }
        return s + T(95, 140, rng(ctx, 'I', c.props.slot), 'dt light xs') + led(178, 140, on, '#3ddc63', 3);
      },
      status: (c, ctx) => (c.state.badIn ? 'Damaged input(s) — right-click → Repair. ' : '') + (!cardOn(c, ctx) ? cardWhy(c, ctx) : rackOn(ctx) ? `Slot ${c.props.slot}: I:${c.props.slot}/0–7` : 'Rack not powered'),
    });
  }
  inCard('mdi8', 'PLC Input Card 8 × 24 VDC', '24 VDC', 'Eight 24 VDC inputs I0–I7 with a common (COM). Wire the sensor supply 0 V to COM; 24 VDC on an input turns it ON. Address: I:slot/bit. AC on an input destroys it.',
    v => v.kind === 'DC', v => v.kind === 'AC');
  inCard('mdi8ac', 'PLC Input Card 8 × 230 VAC', '230 VAC', 'Eight 230 VAC inputs I0–I7 with a common (COM = N). 230 VAC on an input turns it ON. Address: I:slot/bit. 400 VAC destroys an input; 24 VDC is too low to turn it ON.',
    v => v.kind === 'AC' && v.label === '230VAC', v => v.label === '400VAC');
  def('mdo8', {
    name: 'PLC Relay Output Card 8', cat: 'PLC Rack', view: 'cabinet', prefix: 'DO', w: 210, h: 160, slot: true,
    props: { slot: '2' }, pdefs: [{ k: 'slot', n: 'Slot', opts: SLOTS }],
    info: 'Eight relay outputs: O0–O3 switch from VAC0, O4–O7 from VAC1 (AC or DC). Address: O:slot/bit.',
    terms: [{ id: 'VAC0', x: 15, y: 160 }, ...[0, 1, 2, 3].map(i => ({ id: 'O' + i, x: 37 + i * 20, y: 160, l: String(i) })),
      { id: 'VAC1', x: 117, y: 160 }, ...[4, 5, 6, 7].map(i => ({ id: 'O' + i, x: 139 + (i - 4) * 20, y: 160, l: String(i) }))],
    conduct(c, ctx) {
      if (!cardOn(c, ctx) || !rackOn(ctx)) return null;
      const w = ctx.plcOutX[c.props.slot] || 0, out = [];
      for (let k = 0; k < 8; k++) if ((w >> k) & 1) out.push([k < 4 ? 'VAC0' : 'VAC1', 'O' + k]);
      return out;
    },
    ctxSig: (c, ctx) => `|${cardOn(c, ctx)}|${rackOn(ctx)}|${ctx.plcOutX[c.props.slot]}|${ctx.fmt && ctx.fmt(`O:${c.props.slot}/0`)}`,
    draw(c, ctx) {
      const on = cardOn(c, ctx) && rackOn(ctx), w = on ? ctx.plcOutX[c.props.slot] || 0 : 0;
      let s = cardBody(210, 160, 'OUTPUT 8', 'Relay') + band(138, 210, 22, '#1e1d1a') + slotTag(210, 'SLOT ' + c.props.slot);
      for (let i = 0; i < 8; i++) s += led(22 + i * 22, 92, (w >> i) & 1, '#f2c230', 4) + T(22 + i * 22, 108, String(i), 'dt light xs');
      return s + T(105, 128, rng(ctx, 'O', c.props.slot), 'dt light xs') + led(196, 128, on, '#3ddc63', 3);
    },
    status: (c, ctx) => !cardOn(c, ctx) ? cardWhy(c, ctx) : rackOn(ctx) ? `Slot ${c.props.slot}: O:${c.props.slot}/0–7` : 'Rack not powered',
  });
  def('mdo8t', {
    name: 'PLC Transistor Output Card 8 × 24 VDC', cat: 'PLC Rack', view: 'cabinet', prefix: 'DO', w: 210, h: 160, slot: true,
    props: { slot: '2' }, pdefs: [{ k: 'slot', n: 'Slot', opts: SLOTS }],
    info: 'Eight 24 VDC sourcing outputs: an ON output connects +V to its terminal. Feed +V with +24 VDC and COM with 0 V. Address: O:slot/bit. AC on +V destroys the card.',
    terms: [{ id: 'VP', x: 15, y: 160, l: '+V' }, ...Array.from({ length: 8 }, (_, i) => ({ id: 'O' + i, x: 37 + i * 20, y: 160, l: String(i) })), { id: 'COM', x: 195, y: 160 }],
    init: () => ({ burnt: false }),
    conduct(c, ctx) {
      if (c.state.burnt || !cardOn(c, ctx) || !rackOn(ctx)) return null;
      const w = ctx.plcOutX[c.props.slot] || 0, out = [];
      for (let k = 0; k < 8; k++) if ((w >> k) & 1) out.push(['VP', 'O' + k]);
      return out;
    },
    evaluate(c, api) {
      const v = api.v(c, 'VP', 'COM');
      if (v && v.kind === 'AC' && !c.state.burnt) { c.state.burnt = true; api.alert(`${c.props.label}: destroyed — ${v.label} applied to a 24 VDC output card`, 'danger'); return true; }
      return false;
    },
    ctxSig: (c, ctx) => `|${cardOn(c, ctx)}|${rackOn(ctx)}|${ctx.plcOutX[c.props.slot]}|${ctx.fmt && ctx.fmt(`O:${c.props.slot}/0`)}`,
    draw(c, ctx) {
      const on = cardOn(c, ctx) && rackOn(ctx) && !c.state.burnt, w = on ? ctx.plcOutX[c.props.slot] || 0 : 0;
      let s = cardBody(210, 160, 'OUTPUT 8', '24 VDC source') + band(138, 210, 22, '#1e1d1a') + slotTag(210, 'SLOT ' + c.props.slot);
      for (let i = 0; i < 8; i++) s += led(22 + i * 22, 92, (w >> i) & 1, '#f2c230', 4) + T(22 + i * 22, 108, String(i), 'dt light xs');
      return s + T(105, 128, rng(ctx, 'O', c.props.slot), 'dt light xs') + led(196, 128, on, '#3ddc63', 3) + (c.state.burnt ? burnt(210, 160) : '');
    },
    status: (c, ctx) => c.state.burnt ? 'Destroyed' : !cardOn(c, ctx) ? cardWhy(c, ctx) : rackOn(ctx) ? `Slot ${c.props.slot}: O:${c.props.slot}/0–7` : 'Rack not powered',
  });

  /* analog cards: the signal is not a potential in the net solver, it is looked up by net:
     a transmitter publishes ctx.anaSrc[key] = mA, an output card publishes ctx.anaOut[key] = V */
  const anaIn = (c, api, ctx, t) => { let v = null; for (const k in ctx.anaSrc || {}) if (api.sameNet(c.id + ':' + t, k)) v = Math.max(v || 0, ctx.anaSrc[k]); return v; };
  def('mai4', {
    name: 'PLC Analog Input Card 4 × 4–20 mA', cat: 'PLC Rack', view: 'cabinet', prefix: 'AI', w: 150, h: 160, slot: true, analog: 'I', chans: 4,
    props: { slot: '3' }, pdefs: [{ k: 'slot', n: 'Slot', opts: SLOTS }],
    info: 'Four 4–20 mA inputs CH0–CH3 (common COM = 0 V). Wire a transmitter output (e.g. a level transmitter OUT) to a channel. Value in I:slot.ch: 4 mA = 0, 20 mA = 32767; below 3.6 mA the channel reads 0 (wire break).',
    terms: [...[0, 1, 2, 3].map(i => ({ id: 'CH' + i, x: 15 + i * 30, y: 0, l: String(i) })), { id: 'COM', x: 135, y: 0 }],
    init: () => ({ mA: [0, 0, 0, 0] }),
    transient: ['mA'],
    evaluate(c, api, ctx) {
      if (!cardOn(c, ctx)) return false;
      const s = Number(c.props.slot), on = rackOn(ctx);
      c.state.mA = [0, 1, 2, 3].map(i => { const v = on ? anaIn(c, api, ctx, 'CH' + i) : null; return v == null ? 0 : v; });
      c.state.mA.forEach((ma, i) => { ctx.plcInX[PLCcore.ANA(s, i)] = ma < 3.6 ? 0 : Math.round(Math.max(0, Math.min(1, (ma - 4) / 16)) * 32767); });
      return false;
    },
    ctxSig: (c, ctx) => `|${cardOn(c, ctx)}|${rackOn(ctx)}|${(c.state.mA || []).map(v => v.toFixed(1))}|${ctx.fmt && ctx.fmt('I:0/0')}`,
    draw(c, ctx) {
      const on = cardOn(c, ctx) && rackOn(ctx);
      let s = cardBody(150, 160, 'ANALOG IN', '4–20 mA') + band(0, 150, 22, '#1e1d1a') + slotTag(150, 'SLOT ' + c.props.slot);
      (c.state.mA || []).forEach((ma, i) => { s += T(12, 86 + i * 14, `CH${i}`, 'dt light xs', 'start') + R(40, 78 + i * 14, 70, 9, '#2a2925', 2, '#111') + R(41, 79 + i * 14, Math.max(0, Math.min(1, (ma - 4) / 16)) * 68, 7, '#f2c230', 1, 'none') + T(140, 86 + i * 14, on ? ma.toFixed(1) : '—', 'dt light xs', 'end'); });
      return s + T(75, 148, `I:${c.props.slot}.0 – I:${c.props.slot}.3`, 'dt light xs') + led(140, 148, on, '#3ddc63', 3);
    },
    status: (c, ctx) => !cardOn(c, ctx) ? cardWhy(c, ctx) : rackOn(ctx) ? `Slot ${c.props.slot}: ${(c.state.mA || []).map((v, i) => `CH${i} ${v.toFixed(1)} mA`).join(', ')}` : 'Rack not powered',
  });
  def('mao2', {
    name: 'PLC Analog Output Card 2 × 0–10 V', cat: 'PLC Rack', view: 'cabinet', prefix: 'AO', w: 130, h: 160, slot: true, analog: 'O', chans: 2,
    props: { slot: '4' }, pdefs: [{ k: 'slot', n: 'Slot', opts: SLOTS }],
    info: 'Two 0–10 V outputs AO0, AO1 (common COM). O:slot.ch = 0 … 32767 gives 0 … 10 V. Wire AO0 to the speed reference (AI) of a VFD.',
    terms: [{ id: 'AO0', x: 25, y: 160, l: '0' }, { id: 'AO1', x: 60, y: 160, l: '1' }, { id: 'COM', x: 100, y: 160 }],
    init: () => ({ v: [0, 0] }),
    transient: ['v'],
    evaluate(c, api, ctx) {
      const on = cardOn(c, ctx) && rackOn(ctx), s = Number(c.props.slot);
      c.state.v = [0, 1].map(i => (on ? Math.max(0, Math.min(10, (ctx.plcOutX[PLCcore.ANA(s, i)] || 0) / 32767 * 10)) : 0));
      if (!ctx.anaOut) ctx.anaOut = {};
      c.state.v.forEach((v, i) => { ctx.anaOut[c.id + ':AO' + i] = v; });
      return false;
    },
    ctxSig: (c, ctx) => `|${cardOn(c, ctx)}|${rackOn(ctx)}|${(c.state.v || []).map(v => v.toFixed(2))}`,
    draw(c, ctx) {
      const on = cardOn(c, ctx) && rackOn(ctx);
      let s = cardBody(130, 160, 'ANALOG OUT', '0–10 V') + band(138, 130, 22, '#1e1d1a') + slotTag(130, 'SLOT ' + c.props.slot);
      (c.state.v || []).forEach((v, i) => { s += T(12, 90 + i * 16, `AO${i}`, 'dt light xs', 'start') + R(40, 82 + i * 16, 50, 9, '#2a2925', 2, '#111') + R(41, 83 + i * 16, v / 10 * 48, 7, '#2f6fd6', 1, 'none') + T(124, 90 + i * 16, on ? v.toFixed(1) + 'V' : '—', 'dt light xs', 'end'); });
      return s + T(65, 128, `O:${c.props.slot}.0 – O:${c.props.slot}.1`, 'dt light xs') + led(118, 128, on, '#3ddc63', 3);
    },
    status: (c, ctx) => !cardOn(c, ctx) ? cardWhy(c, ctx) : rackOn(ctx) ? `Slot ${c.props.slot}: AO0 ${(c.state.v[0] || 0).toFixed(2)} V, AO1 ${(c.state.v[1] || 0).toFixed(2)} V` : 'Rack not powered',
  });
  /* level transmitter: 3-wire, 24 V DC; OUT gives 4–20 mA for 0–100 % of the tank it measures (by tag), or its own test level */
  def('ltx', {
    name: 'Level Transmitter 4–20 mA', cat: 'Sensors', view: 'plant', prefix: 'LT', w: 70, h: 110,
    props: { tank: 'TK1', pv: 50 },
    pdefs: [{ k: 'tank', n: 'Tank it measures (tag)' }, { k: 'pv', n: 'Level when no tank is found (%)', type: 'number' }],
    info: 'Analog level transmitter: + (24 V DC), OUT (4–20 mA), − (0 V). It measures the tank named in its properties (TK1); without that tank it sends its own level. Wire OUT to a channel of an analog input card.',
    terms: [{ id: 'P', x: 15, y: 110, l: '+' }, { id: 'OUT', x: 35, y: 110 }, { id: 'M', x: 55, y: 110, l: '−' }],
    init: () => ({ lvl: 0, mA: 0 }),
    transient: ['mA'],
    evaluate(c, api, ctx) {
      const v = api.v(c, 'P', 'M'), t = ctx && ctx.tanks ? ctx.tanks[c.props.tank] : undefined;
      c.state.lvl = Math.max(0, Math.min(100, t != null ? t : Number(c.props.pv) || 0));
      const mA = v && v.kind === 'DC' && !v.rev ? 4 + 16 * c.state.lvl / 100 : 0;
      const ch = set(c, 'mA', Math.round(mA * 100) / 100);
      if (ctx) { if (!ctx.anaSrc) ctx.anaSrc = {}; ctx.anaSrc[c.id + ':OUT'] = c.state.mA; }
      return ch;
    },
    draw(c) {
      const s = c.state;
      return R(10, 0, 50, 70, '#d9dcd6', 6, '#5f5b53') + R(16, 8, 38, 22, '#24303a', 3, '#111') + T(35, 23, s.mA ? s.mA.toFixed(1) + 'mA' : '—', 'dt light xs') +
        T(35, 44, 'LT', 'dt big') + T(35, 60, Math.round(s.lvl) + ' %', 'dt xs') + R(30, 70, 10, 30, '#8a8f96', 2, '#555');
    },
    status: c => (c.state.mA ? `${c.state.lvl.toFixed(0)} % → ${c.state.mA.toFixed(2)} mA` : 'No 24 V DC on + / −'),
  });
  /* VFD: 400 V in L1 L2 L3, motor out U V W; FWD / REV inputs (24 V DC to DCOM); speed reference AI 0–10 V (to ACOM) or the keypad */
  def('vfd', {
    name: 'Variable Frequency Drive (VFD)', cat: 'Control', view: 'cabinet', prefix: 'VFD', w: 170, h: 200, breaker: 0.2,
    props: { hz: 50, ramp: 3 },
    pdefs: [{ k: 'hz', n: 'Keypad speed (Hz) when AI is not wired', type: 'number' }, { k: 'ramp', n: 'Ramp time 0 → 60 Hz (s)', type: 'number' }],
    info: 'Supply L1 L2 L3 (400 V) → motor U V W. Runs forward while FWD has 24 V DC (to DCOM), reverse with REV (both = stop). Speed: AI 0–10 V = 0–60 Hz from an analog output card, else the keypad speed. Ramps up and down.',
    terms: [{ id: 'L1', x: 20, y: 0 }, { id: 'L2', x: 40, y: 0 }, { id: 'L3', x: 60, y: 0 }, { id: 'PE', x: 85, y: 0 },
      { id: 'FWD', x: 110, y: 0 }, { id: 'REV', x: 130, y: 0 }, { id: 'DCOM', x: 150, y: 0, l: 'COM' },
      { id: 'U', x: 20, y: 200 }, { id: 'V', x: 40, y: 200 }, { id: 'W', x: 60, y: 200 }, { id: 'AI', x: 120, y: 200 }, { id: 'ACOM', x: 145, y: 200, l: 'COM' }],
    init: () => ({ pw: false, dir: 0, hz: 0, ref: 0, tripped: false }),
    transient: ['hz', 'dir'],
    // an output short trips the drive (its own electronic protection, before any breaker); it resets when its power is removed
    closed: c => !c.state.tripped,
    /* the drive makes its own output (it does not pass the mains through): U V W in sequence, V and W swapped for REV,
       so the input phase order does not change the rotation and a motor on the mains is not mixed up with it */
    sources(c) {
      if (!c.state.pw || c.state.tripped || !c.state.dir || c.state.hz < 0.5) return null;
      return c.state.dir > 0 ? { U: 'L1', V: 'L2', W: 'L3' } : { U: 'L1', V: 'L3', W: 'L2' };
    },
    evaluate(c, api, ctx) {
      const s = c.state, ph = ['L1', 'L2', 'L3'].map(t => api.phase(c, t));
      // input phase loss: the drive does not run
      const pw = ph.every(Boolean) && new Set(ph).size === 3;
      if (!pw && s.tripped) s.tripped = false;
      const din = t => { const x = api.v(c, t, 'DCOM'); return !!(x && x.kind === 'DC' && !x.rev); };
      const f = din('FWD'), r = din('REV');
      let ref = null;
      for (const k in (ctx && ctx.anaOut) || {}) if (api.sameNet(c.id + ':AI', k)) ref = ctx.anaOut[k] * 6;
      s.ref = Math.max(0, Math.min(60, ref != null ? ref : Number(c.props.hz) || 0));
      const want = pw && f !== r ? (f ? 1 : -1) : 0;
      // the direction changes only after the motor has ramped down
      const ch = set(c, 'pw', pw) | set(c, 'dir', s.hz < 0.5 ? want : s.dir);
      if (ctx) { if (!ctx.vfdOut) ctx.vfdOut = {}; ctx.vfdOut[c.id + ':U'] = s.dir ? s.hz : 0; }
      return !!ch;
    },
    tick(c, api, dt) {
      const s = c.state, f = api.v(c, 'FWD', 'DCOM'), r = api.v(c, 'REV', 'DCOM');
      const fw = !!(f && f.kind === 'DC' && !f.rev), rv = !!(r && r.kind === 'DC' && !r.rev);
      const want = s.pw && fw !== rv ? (fw ? 1 : -1) : 0;
      const target = want && want === s.dir ? s.ref : 0, rate = 60 / Math.max(0.2, Number(c.props.ramp) || 3);
      s.hz = s.hz < target ? Math.min(target, s.hz + rate * dt) : Math.max(target, s.hz - rate * dt);
      s.hz = Math.round(s.hz * 10) / 10;
    },
    draw(c) {
      const s = c.state;
      return R(0, 0, 170, 200, '#2b2d30', 6, '#111') + band(0, 170, 22, '#1e1d1a') + band(178, 170, 22, '#1e1d1a') +
        T(12, 42, 'VFD', 'dt light brand', 'start') + T(12, 56, '0–60 Hz', 'dt light xs', 'start') +
        R(20, 66, 130, 40, s.pw ? '#c9d86c' : '#8f9a5a', 3, '#2d3a1e') + `<text class="lcd" x="140" y="94" text-anchor="end">${s.pw ? s.hz.toFixed(1) + ' Hz' : ''}</text>` +
        led(30, 122, s.pw, '#3ddc63') + T(40, 125, 'PWR', 'dt light xs', 'start') + led(80, 122, s.dir > 0 && s.hz > 0, '#3ddc63') + T(90, 125, 'FWD', 'dt light xs', 'start') +
        led(125, 122, s.dir < 0 && s.hz > 0, '#f2c230') + T(135, 125, 'REV', 'dt light xs', 'start') + T(85, 150, `ref ${s.ref.toFixed(1)} Hz`, 'dt light xs');
    },
    status: c => (c.state.tripped ? 'FAULT: output short circuit — switch its supply off to reset' : !c.state.pw ? 'No 400 V on L1 L2 L3 (or a phase missing)' : c.state.hz > 0 ? `${c.state.dir > 0 ? 'FWD' : 'REV'} ${c.state.hz.toFixed(1)} Hz (ref ${c.state.ref.toFixed(1)})` : 'Stopped'),
  });

  /* ---------- CABINET: backplate, door, cable duct, HMI terminal ----------
     Plates (layer 'back') are drawn behind everything; moving one moves the devices mounted on it. */
  const SIZES_W = ['400', '600', '800', '1000', '1200', '1600'], SIZES_H = ['300', '400', '600', '800', '1000', '1200'];
  const plateDims = c => ({ w: Number(c.props.w) || 800, h: Number(c.props.h) || 600 });
  def('encl', {
    name: 'Control Cabinet (backplate)', cat: 'Cabinet', view: 'none', prefix: '+CP', w: 800, h: 600, layer: 'back', plate: true,
    props: { w: '800', h: '600', title: 'CONTROL CABINET' },
    pdefs: [{ k: 'w', n: 'Width', opts: SIZES_W }, { k: 'h', n: 'Height', opts: SIZES_H }, { k: 'title', n: 'Name plate' }],
    info: 'Inside of a control cabinet: the mounting plate. Put DIN rails and cable ducts on it, then the devices. Moving the cabinet moves everything mounted on it.',
    terms: [],
    dims: plateDims,
    draw(c) {
      const { w, h } = plateDims(c || { props: {} });
      let s = R(0, 0, w, h, '#8f959b', 8, '#4f5459', 2) + R(16, 16, w - 32, h - 32, '#e2e4df', 3, '#a6aaa8');
      for (const [x, y] of [[30, 30], [w - 30, 30], [30, h - 30], [w - 30, h - 30]]) s += `<circle cx="${x}" cy="${y}" r="5" fill="#c4c7c3" stroke="#8a8e8c"/>`;
      return s + R(40, 22, 220, 20, '#3b3f44', 2, 'none') + T(150, 36, (c && c.props.title) || 'CONTROL CABINET', 'dt light xs');
    },
  });
  def('door', {
    name: 'Cabinet Door', cat: 'Cabinet', view: 'none', prefix: '+CD', w: 600, h: 600, layer: 'back', plate: true,
    props: { w: '600', h: '600', title: 'MOTOR CONTROL' },
    pdefs: [{ k: 'w', n: 'Width', opts: SIZES_W }, { k: 'h', n: 'Height', opts: SIZES_H }, { k: 'title', n: 'Name plate' }],
    info: 'Front of the cabinet: put push buttons, selector switches, pilot lamps, the E-stop, meters and the HMI terminal on it. Moving the door moves everything mounted on it.',
    terms: [],
    dims: plateDims,
    draw(c) {
      const { w, h } = plateDims(c || { props: {} });
      return R(0, 0, w, h, '#cfd1cb', 10, '#777b7f', 2) + R(12, 12, w - 24, h - 24, 'none', 8, '#b3b6b0') +
        R(-6, h * 0.18, 10, 40, '#6d7176', 2, '#3f4245') + R(-6, h * 0.82 - 40, 10, 40, '#6d7176', 2, '#3f4245') +
        R(w - 30, h / 2 - 40, 16, 80, '#3a3d40', 6, '#1e2022') + R(w / 2 - 110, 26, 220, 26, '#2b2d30', 3, 'none') + T(w / 2, 43, (c && c.props.title) || 'MOTOR CONTROL', 'dt light xs');
    },
  });
  def('duct', {
    name: 'Cable Duct', cat: 'Cabinet', view: 'none', prefix: 'WD', w: 400, h: 40, layer: 'rail',
    props: { len: '400', dir: 'H' },
    pdefs: [{ k: 'len', n: 'Length', opts: ['200', '300', '400', '600', '800', '1000', '1200'] }, { k: 'dir', n: 'Direction', opts: ['H', 'V'] }],
    info: 'Slotted wiring duct: the wires between devices run inside it. Horizontal above and below the DIN rails, vertical at the sides.',
    terms: [],
    dims: c => (c.props.dir === 'V' ? { w: 40, h: Number(c.props.len) || 400 } : { w: Number(c.props.len) || 400, h: 40 }),
    draw(c) {
      const v = c && c.props.dir === 'V', L = c ? Number(c.props.len) || 400 : 400;
      let s = v ? R(0, 0, 40, L, '#a3a8a5', 2, '#6d7270') + R(12, 0, 16, L, '#b9bdba', 0, 'none') : R(0, 0, L, 40, '#a3a8a5', 2, '#6d7270') + R(0, 12, L, 16, '#b9bdba', 0, 'none');
      for (let p = 8; p < L - 6; p += 16) s += v ? `<rect x="2" y="${p}" width="8" height="8" fill="#7d827f"/><rect x="30" y="${p}" width="8" height="8" fill="#7d827f"/>` : `<rect x="${p}" y="2" width="8" height="8" fill="#7d827f"/><rect x="${p}" y="30" width="8" height="8" fill="#7d827f"/>`;
      return s;
    },
  });
  def('hmiterm', {
    name: 'HMI Terminal (operator panel)', cat: 'Cabinet', view: 'panel', prefix: 'HMI', w: 300, h: 220,
    info: 'Touch panel for the cabinet door. It shows the screen made in the HMI workspace, live, and its buttons can be pressed here. Needs 24 VDC on + / M (0 V).',
    terms: [{ id: 'P', x: 250, y: 220, l: '+' }, { id: 'M', x: 275, y: 220 }],
    init: () => ({ pw: false }),
    evaluate(c, api) { const v = api.v(c, 'P', 'M'); return set(c, 'pw', !!(v && v.kind === 'DC' && !v.rev)); },
    onPart(c, p, ev, ctx) { if (c.state.pw && p.startsWith('h:') && ctx && ctx.hmiPress) { ctx.hmiPress(p.slice(2), ev); return true; } },
    ctxSig: (c, ctx) => '|' + (c.state.pw && ctx.hmiMini ? ctx.hmiMini().key : ''),
    draw(c, ctx) {
      const pw = c && c.state.pw, m = pw && ctx && ctx.hmiMini ? ctx.hmiMini() : null;
      return R(0, 0, 300, 220, '#2a2b2d', 10, '#111') + R(18, 16, 264, 158.4, pw ? '#10161c' : '#050607', 2, '#000') +
        (m ? (() => { const k = Math.min(264 / m.w, 158.4 / m.h), ox = 18 + (264 - m.w * k) / 2, oy = 16 + (158.4 - m.h * k) / 2; return `<g transform="translate(${ox} ${oy}) scale(${k})">${m.svg}</g>`; })() : T(150, 100, pw ? '' : 'NO POWER', 'dt light xs')) +
        T(22, 196, 'Operator terminal', 'dt light xs', 'start') + [0, 1, 2, 3].map(i => R(150 + i * 22, 186, 16, 12, '#45474a', 2, '#111')).join('') + led(140, 192, pw, '#3ddc63', 3);
    },
    status: c => (c.state.pw ? 'On — shows the HMI screen' : 'No 24 VDC on + / M'),
  });

  /* ---------- PILOT DEVICES ---------- */
  function pb(type, name, contact, color, text) {
    const ids = contact === 'NO' ? ['13', '14'] : ['11', '12'];
    def(type, {
      name, cat: 'Pilot Devices', view: 'panel', prefix: 'S', w: 60, h: 90,
      props: { color, text },
      variant: { n: 'Contact type', of: { NO: 'pb_no', NC: 'pb_nc' } },
      pdefs: [{ k: 'color', n: 'Color', opts: Object.keys(COLORS) }, { k: 'text', n: 'Legend' }],
      info: contact === 'NO' ? 'Momentary push button, normally open contact 13-14 (closes while pressed).' : 'Momentary push button, normally closed contact 11-12 (opens while pressed).',
      terms: [{ id: ids[0], x: 15, y: 90 }, { id: ids[1], x: 45, y: 90 }],
      init: () => ({ pressed: false }),
      transient: ['pressed'],
      conduct: c => (contact === 'NO') === c.state.pressed ? [ids] : null,
      onPart(c, p, ev) { if (p === 'btn') { c.state.pressed = ev === 'down'; return true; } },
      draw(c) {
        const pr = c.state.pressed, col = COLORS[c.props.color] || COLORS.green;
        return R(0, 0, 60, 90, '#2b2a28', 6, '#111') + R(6, 4, 48, 13, '#f2efe6', 2, '#999') + T(30, 13.5, c.props.text || '', 'dt xs') +
          `<g class="part" data-part="btn"><circle cx="30" cy="42" r="20" fill="url(#gChrome)" stroke="#222"/><circle cx="30" cy="42" r="${pr ? 13.5 : 15}" fill="${col}" stroke="rgba(0,0,0,.4)"/>${pr ? '' : '<ellipse cx="25" cy="36" rx="6" ry="3.5" fill="#fff" opacity=".35"/>'}</g>` +
          R(12, 66, 36, 12, '#d7d3ca', 2, '#777') + T(30, 75, contact, 'dt xs');
      },
      status: c => c.state.pressed ? 'Pressed' : 'Released',
    });
  }
  pb('pb_no', 'Push Button (NO)', 'NO', 'green', 'START');
  pb('pb_nc', 'Push Button (NC)', 'NC', 'red', 'STOP');
  def('pb_co', {
    name: 'Push Button NO + NC', cat: 'Pilot Devices', view: 'panel', prefix: 'S', w: 70, h: 90,
    props: { color: 'black', text: 'JOG' },
    pdefs: [{ k: 'color', n: 'Color', opts: Object.keys(COLORS) }, { k: 'text', n: 'Legend' }],
    info: 'Momentary push button with two contact blocks: 13-14 N.O. closes and 21-22 N.C. opens while pressed (jog, interlocks).',
    terms: [{ id: '13', x: 10, y: 90 }, { id: '14', x: 26, y: 90 }, { id: '21', x: 44, y: 90 }, { id: '22', x: 60, y: 90 }],
    init: () => ({ pressed: false }),
    transient: ['pressed'],
    conduct: c => c.state.pressed ? [['13', '14']] : [['21', '22']],
    onPart(c, p, ev) { if (p === 'btn') { c.state.pressed = ev === 'down'; return true; } },
    draw(c) {
      const pr = c.state.pressed, col = COLORS[c.props.color] || COLORS.black;
      return R(0, 0, 70, 90, '#2b2a28', 6, '#111') + R(6, 4, 58, 13, '#f2efe6', 2, '#999') + T(35, 13.5, c.props.text || '', 'dt xs') +
        `<g class="part" data-part="btn"><circle cx="35" cy="42" r="20" fill="url(#gChrome)" stroke="#222"/><circle cx="35" cy="42" r="${pr ? 13.5 : 15}" fill="${col}" stroke="rgba(0,0,0,.4)"/></g>` + R(8, 66, 54, 12, '#d7d3ca', 2, '#777') + T(35, 75, 'NO + NC', 'dt xs');
    },
    status: c => c.state.pressed ? 'Pressed' : 'Released',
  });
  def('foot', {
    name: 'Foot Switch', cat: 'Pilot Devices', view: 'panel', prefix: 'S', w: 80, h: 70,
    info: 'Foot pedal: 13-14 N.O. closes while pressed, 21-22 N.C. opens.',
    terms: [{ id: '13', x: 12, y: 70 }, { id: '14', x: 30, y: 70 }, { id: '21', x: 50, y: 70 }, { id: '22', x: 68, y: 70 }],
    init: () => ({ pressed: false }),
    transient: ['pressed'],
    conduct: c => c.state.pressed ? [['13', '14']] : [['21', '22']],
    onPart(c, p, ev) { if (p === 'btn') { c.state.pressed = ev === 'down'; return true; } },
    draw(c) {
      const pr = c.state.pressed;
      return `<path d="M4 50 L76 50 L70 20 L10 20 Z" fill="#f2c230" stroke="#8a6a10"/>` + `<g class="part" data-part="btn"><path d="M14 ${pr ? 38 : 30} L66 ${pr ? 34 : 22} L66 ${pr ? 40 : 30} L14 ${pr ? 44 : 38} Z" fill="#2a2a28" stroke="#111"/><rect x="0" y="10" width="80" height="45" fill="transparent"/></g>` + T(40, 62, 'FOOT', 'dt xs');
    },
    status: c => c.state.pressed ? 'Pressed' : 'Released',
  });
  def('estop', {
    name: 'Emergency Stop', cat: 'Pilot Devices', view: 'panel', prefix: 'S', w: 80, h: 100,
    info: 'Latching mushroom head. NC 11-12 opens when pushed, NO 13-14 closes. Click again to twist-release.',
    terms: [{ id: '11', x: 12, y: 100 }, { id: '12', x: 30, y: 100 }, { id: '13', x: 50, y: 100 }, { id: '14', x: 68, y: 100 }],
    init: () => ({ latched: false }),
    conduct: c => c.state.latched ? [['13', '14']] : [['11', '12']],
    onPart(c, p, ev) { if (p === 'btn' && ev === 'down') { c.state.latched = !c.state.latched; return true; } },
    draw(c) {
      const l = c.state.latched;
      return `<circle cx="40" cy="42" r="36" fill="#f2c230" stroke="#8a6d10"/>` + T(40, 14, 'EMERGENCY', 'dt xs') +
        `<g class="part" data-part="btn"><circle cx="40" cy="44" r="${l ? 20 : 23}" fill="${l ? '#9e2a1f' : '#d33a2c'}" stroke="#5a140e" stroke-width="1.5"/>${l ? '' : '<ellipse cx="33" cy="36" rx="8" ry="4" fill="#fff" opacity=".3"/>'}</g>` +
        R(8, 80, 64, 12, '#d7d3ca', 2, '#777') + T(40, 89, l ? 'LATCHED' : 'NC + NO', 'dt xs');
    },
    status: c => c.state.latched ? 'LATCHED — click to release' : 'Released',
  });
  function sel2(type, contact) {
    const ids = contact === 'NO' ? ['13', '14'] : ['11', '12'];
    def(type, {
      name: contact === 'NO' ? 'Selector Switch 2-Pos' : 'Selector Switch 2-Pos (NC)', cat: 'Pilot Devices', view: 'panel', prefix: 'S', w: 60, h: 90,
      props: { text: 'OFF  ON' },
      pdefs: [{ k: 'text', n: 'Legend' }],
      variant: { n: 'Contact type', of: { NO: 'sel2', NC: 'sel2_nc' } },
      info: contact === 'NO' ? 'Maintained 2-position selector. Contact 13-14 closes in position I (right).' : 'Maintained 2-position selector. Contact 11-12 is closed in position 0 and opens in position I (right).',
      terms: [{ id: ids[0], x: 15, y: 90 }, { id: ids[1], x: 45, y: 90 }],
      init: () => ({ pos: 0 }),
      conduct: c => (contact === 'NO') === !!c.state.pos ? [ids] : null,
      onPart(c, p, ev) { if (p === 'knob' && ev === 'down') { c.state.pos = c.state.pos ? 0 : 1; return true; } },
      draw(c) {
        const a = c.state.pos ? 45 : -45;
        return R(0, 0, 60, 90, '#2b2a28', 6, '#111') + R(6, 4, 48, 13, '#f2efe6', 2, '#999') + T(30, 13.5, c.props.text || '', 'dt xs') +
          `<g class="part" data-part="knob"><circle cx="30" cy="42" r="20" fill="url(#gChrome)" stroke="#222"/><circle cx="30" cy="42" r="15" fill="#222"/><rect x="26" y="26" width="8" height="32" rx="3" fill="#e9e5dc" transform="rotate(${a} 30 42)"/></g>` +
          R(12, 66, 36, 12, '#d7d3ca', 2, '#777') + T(30, 75, (c.state.pos ? 'I' : '0') + ' · ' + contact, 'dt xs');
      },
      status: c => c.state.pos ? `Position I (${ids.join('-')} ${contact === 'NO' ? 'closed' : 'open'})` : `Position 0 (${ids.join('-')} ${contact === 'NO' ? 'open' : 'closed'})`,
    });
  }
  sel2('sel2', 'NO');
  sel2('sel2_nc', 'NC');
  def('sel3', {
    name: 'Selector H-O-A 3-Pos', cat: 'Pilot Devices', view: 'panel', prefix: 'S', w: 80, h: 90,
    info: 'HAND-OFF-AUTO. 13-14 closes in HAND (left), 23-24 closes in AUTO (right). Click left/right half to turn.',
    terms: [{ id: '13', x: 12, y: 90 }, { id: '14', x: 30, y: 90 }, { id: '23', x: 50, y: 90 }, { id: '24', x: 68, y: 90 }],
    init: () => ({ pos: 0 }),
    conduct: c => c.state.pos < 0 ? [['13', '14']] : c.state.pos > 0 ? [['23', '24']] : null,
    onPart(c, p, ev) {
      if (ev !== 'down') return;
      if (p === 'l') { c.state.pos = Math.max(-1, c.state.pos - 1); return true; }
      if (p === 'r') { c.state.pos = Math.min(1, c.state.pos + 1); return true; }
    },
    draw(c) {
      const a = c.state.pos * 45;
      return R(0, 0, 80, 90, '#2b2a28', 6, '#111') + R(6, 4, 68, 13, '#f2efe6', 2, '#999') + T(40, 13.5, 'HAND  OFF  AUTO', 'dt xs') +
        `<circle cx="40" cy="44" r="21" fill="url(#gChrome)" stroke="#222"/><circle cx="40" cy="44" r="16" fill="#222"/><rect x="36" y="27" width="8" height="34" rx="3" fill="#e9e5dc" transform="rotate(${a} 40 44)"/>` +
        `<rect class="part" data-part="l" x="10" y="20" width="30" height="48" fill="transparent"/><rect class="part" data-part="r" x="40" y="20" width="30" height="48" fill="transparent"/>` +
        R(8, 70, 64, 10, '#d7d3ca', 2, '#777') + T(40, 78, ['HAND', 'OFF', 'AUTO'][c.state.pos + 1], 'dt xs');
    },
    status: c => ['HAND (13-14)', 'OFF', 'AUTO (23-24)'][c.state.pos + 1],
  });
  def('lamp', {
    name: 'Pilot Lamp', cat: 'Pilot Devices', view: 'panel', prefix: 'H', w: 50, h: 80,
    props: { color: 'green', coil: '24VDC' },
    pdefs: [{ k: 'color', n: 'Lens color', opts: Object.keys(COLORS) }, { k: 'coil', n: 'Lamp voltage', opts: RATINGS }],
    info: 'Indicator lamp X1-X2. Lights at its rated voltage; over-voltage burns it.',
    terms: [{ id: 'X1', x: 13, y: 80 }, { id: 'X2', x: 37, y: 80 }],
    init: () => ({ on: false, burnt: false }),
    evaluate(c, api) { return set(c, 'on', coilOn(c, api, 'X1', 'X2')); },
    draw(c) {
      const on = c.state.on, col = c.props.color || 'green';
      return R(0, 0, 50, 80, '#2b2a28', 6, '#111') + `<circle cx="25" cy="30" r="19" fill="url(#gChrome)" stroke="#222"/>` +
        `<circle cx="25" cy="30" r="14" fill="${on ? COLORS[col] : DIM[col]}" ${on ? 'filter="url(#fGlowBig)"' : ''}/>` +
        (on ? `<circle cx="25" cy="30" r="7" fill="#fff" opacity=".55"/>` : '') +
        R(8, 56, 34, 12, '#d7d3ca', 2, '#777') + T(25, 65, c.props.coil, 'dt xs') + (c.state.burnt ? burnt(50, 80) : '');
    },
    status: c => c.state.burnt ? 'Burnt out' : c.state.on ? 'ON' : 'OFF',
  });

  def('fuse', {
    name: 'Fuse (1-pole)', cat: 'Protection', view: 'power', prefix: 'FU', w: 36, h: 90, breaker: 0.5,   // lower rank than any breaker: a fuse clears a fault first
    props: { rating: '2A' },
    pdefs: [{ k: 'rating', n: 'Rating', opts: ['1A', '2A', '4A', '6A', '10A', '16A'] }],
    info: 'Cartridge fuse 1 → 2. It blows on a short circuit before any breaker. Click it to replace a blown fuse.',
    terms: [{ id: '1', x: 18, y: 0 }, { id: '2', x: 18, y: 90 }],
    init: () => ({ tripped: false }),
    closed: c => !c.state.tripped,
    conduct: c => c.state.tripped ? null : [['1', '2']],
    onPart(c, p, ev) { if (p === 'f' && ev === 'down' && c.state.tripped) { c.state.tripped = false; return true; } },
    draw(c) {
      const b = c.state.tripped;
      return R(4, 6, 28, 78, 'url(#gPlastic)', 4) + `<g class="part" data-part="f">` + R(10, 22, 16, 46, '#e9e5dc', 6, '#555') +
        (b ? `<path d="M12 30 L24 60 M24 30 L12 60" stroke="#d33a2c" stroke-width="2.5"/>` : `<line x1="18" y1="26" x2="18" y2="64" stroke="#8a8f96" stroke-width="2"/>`) + `</g>` +
        T(18, 18, c.props.rating, 'dt xs') + T(18, 80, b ? 'BLOWN' : 'OK', `dt xs${b ? ' warnt' : ''}`);
    },
    status: c => c.state.tripped ? 'BLOWN — click to replace' : 'OK',
  });
  def('fuse3', {
    name: 'Fuse 3-Pole', cat: 'Protection', view: 'power', prefix: 'FU', w: 100, h: 90, breaker: 0.5,
    props: { rating: '10A' },
    pdefs: [{ k: 'rating', n: 'Rating', opts: ['2A', '4A', '6A', '10A', '16A', '25A', '32A'] }],
    info: 'Three cartridge fuses in one carrier: 1-3-5 → 2-4-6. A short circuit blows them before any breaker. Click to replace.',
    terms: [{ id: '1', x: 20, y: 0 }, { id: '3', x: 50, y: 0 }, { id: '5', x: 80, y: 0 }, { id: '2', x: 20, y: 90 }, { id: '4', x: 50, y: 90 }, { id: '6', x: 80, y: 90 }],
    init: () => ({ tripped: false }),
    closed: c => !c.state.tripped,
    conduct: c => c.state.tripped ? null : [['1', '2'], ['3', '4'], ['5', '6']],
    onPart(c, p, ev) { if (p === 'f' && ev === 'down' && c.state.tripped) { c.state.tripped = false; return true; } },
    draw(c) {
      const b = c.state.tripped;
      return modBody(100, 90, c.props.rating, 14, 14) + `<g class="part" data-part="f">` + [20, 50, 80].map(x => R(x - 8, 30, 16, 40, '#e9e5dc', 6, '#555') +
        (b ? `<path d="M${x - 6} 38 L${x + 6} 62 M${x + 6} 38 L${x - 6} 62" stroke="#d33a2c" stroke-width="2.5"/>` : `<line x1="${x}" y1="34" x2="${x}" y2="66" stroke="#8a8f96" stroke-width="2"/>`)).join('') + `</g>` +
        T(50, 82, b ? 'BLOWN' : '', 'dt xs warnt');
    },
    status: c => c.state.tripped ? 'BLOWN — click to replace' : 'OK',
  });
  def('mcb3', {
    name: 'MCB 3-Pole', cat: 'Protection', view: 'power', prefix: 'QF', w: 100, h: 100, breaker: 1,
    info: 'Three-pole miniature breaker: 1-3-5 → 2-4-6. Trips on a short circuit. Click the handle: ON/OFF; after a trip, click once to reset.',
    terms: [{ id: '1', x: 20, y: 0 }, { id: '3', x: 50, y: 0 }, { id: '5', x: 80, y: 0 }, { id: '2', x: 20, y: 100 }, { id: '4', x: 50, y: 100 }, { id: '6', x: 80, y: 100 }],
    init: () => ({ on: false, tripped: false }),
    closed: c => c.state.on && !c.state.tripped,
    conduct: c => (c.state.on && !c.state.tripped) ? [['1', '2'], ['3', '4'], ['5', '6']] : null,
    onPart: breakerOnPart, draw: c => mcbDraw(c, 100, 3),
  });
  def('isol3', {
    name: 'Disconnector 3-Pole', cat: 'Protection', view: 'power', prefix: 'QS', w: 100, h: 100,
    info: 'Load-break switch / isolator: 1-3-5 → 2-4-6. No protection: it never trips. Click the knob to switch ON/OFF.',
    terms: [{ id: '1', x: 20, y: 0 }, { id: '3', x: 50, y: 0 }, { id: '5', x: 80, y: 0 }, { id: '2', x: 20, y: 100 }, { id: '4', x: 50, y: 100 }, { id: '6', x: 80, y: 100 }],
    init: () => ({ on: false }),
    conduct: c => c.state.on ? [['1', '2'], ['3', '4'], ['5', '6']] : null,
    onPart(c, p, ev) { if (p === 'h' && ev === 'down') { c.state.on = !c.state.on; return true; } },
    draw(c) {
      const on = c.state.on;
      return modBody(100, 100, 'ISOLATOR', 16, 16) + `<g class="part" data-part="h"><circle cx="50" cy="58" r="20" fill="#f2c230" stroke="#8a6a10"/><rect x="45" y="40" width="10" height="36" rx="3" fill="#d33a2c" stroke="#6b201a" transform="rotate(${on ? 90 : 0} 50 58)"/></g>` +
        T(80, 46, 'I', 'dt sm') + T(50, 30 + 52, '', 'dt') + T(22, 46, 'O', 'dt sm') + T(50, 92, on ? 'ON' : 'OFF', 'dt xs');
    },
    status: c => c.state.on ? 'ON' : 'OFF',
  });
  def('rcd', {
    name: 'RCD 2-Pole 30 mA', cat: 'Protection', view: 'power', prefix: 'FI', w: 70, h: 100, breaker: 0.8, earthOnly: true,
    info: 'Residual current device: L 1 → 2 and N 3 → 4. Trips on an earth fault (line to PE) before the breakers; it does not trip on a line-to-neutral short. T = test button. Click the handle: ON/OFF, reset after a trip.',
    terms: [{ id: '1', x: 20, y: 0, l: '1 L' }, { id: '3', x: 50, y: 0, l: '3 N' }, { id: '2', x: 20, y: 100, l: '2 L' }, { id: '4', x: 50, y: 100, l: '4 N' }],
    init: () => ({ on: false, tripped: false }),
    closed: c => c.state.on && !c.state.tripped,
    conduct: c => (c.state.on && !c.state.tripped) ? [['1', '2'], ['3', '4']] : null,
    onPart(c, p, ev) {
      if (ev !== 'down') return;
      if (p === 'test' && c.state.on && !c.state.tripped) { c.state.tripped = true; return true; }
      return breakerOnPart(c, p, ev);
    },
    draw(c) {
      return mcbDraw(c, 70, 2).replace('>C16<', '>30mA<') + `<g class="part" data-part="test"><rect x="52" y="34" width="14" height="10" rx="2" fill="#2f6fd6" stroke="#1b3f7a"/>${T(59, 42, 'T', 'dt light xs')}</g>`;
    },
    status: c => c.state.tripped ? 'TRIPPED (earth fault) — click the handle to reset' : c.state.on ? 'ON' : 'OFF',
  });
  /* more pole counts of the same protection devices */
  const P4 = { ins: ['1', '3', '5', '7'], outs: ['2', '4', '6', '8'] };
  const polesTerms = (ins, outs, w, h) => [...ins.map((t, i) => ({ id: t, x: Math.round(w / (ins.length + 1) * (i + 1)), y: 0 })), ...outs.map((t, i) => ({ id: t, x: Math.round(w / (outs.length + 1) * (i + 1)), y: h }))];
  const pairs = (ins, outs) => ins.map((t, i) => [t, outs[i]]);
  function fuseN(type, n) {
    const ins = P4.ins.slice(0, n), outs = P4.outs.slice(0, n), w = 30 + n * 28;
    def(type, {
      name: `Fuse ${n}-Pole`, cat: 'Protection', view: 'power', prefix: 'FU', w, h: 90, breaker: 0.5,
      props: { rating: '10A' }, pdefs: [{ k: 'rating', n: 'Rating', opts: ['2A', '4A', '6A', '10A', '16A', '25A', '32A'] }],
      info: `${n} cartridge fuses in one carrier: ${ins.join('-')} → ${outs.join('-')}. A short circuit blows them before any breaker. Click to replace.`,
      terms: polesTerms(ins, outs, w, 90),
      init: () => ({ tripped: false }), closed: c => !c.state.tripped,
      conduct: c => c.state.tripped ? null : pairs(ins, outs),
      onPart(c, p, ev) { if (p === 'f' && ev === 'down' && c.state.tripped) { c.state.tripped = false; return true; } },
      draw(c) {
        const b = c.state.tripped;
        return modBody(w, 90, c.props.rating, 14, 14) + `<g class="part" data-part="f">` + polesTerms(ins, outs, w, 90).slice(0, n).map(({ x }) => R(x - 8, 30, 16, 40, '#e9e5dc', 6, '#555') +
          (b ? `<path d="M${x - 6} 38 L${x + 6} 62 M${x + 6} 38 L${x - 6} 62" stroke="#d33a2c" stroke-width="2.5"/>` : `<line x1="${x}" y1="34" x2="${x}" y2="66" stroke="#8a8f96" stroke-width="2"/>`)).join('') + `</g>` + T(w / 2, 82, b ? 'BLOWN' : '', 'dt xs warnt');
      },
      status: c => c.state.tripped ? 'BLOWN — click to replace' : 'OK',
    });
  }
  fuseN('fuse2', 2); fuseN('fuse4', 4);
  def('mcb4', {
    name: 'MCB 4-Pole', cat: 'Protection', view: 'power', prefix: 'QF', w: 130, h: 100, breaker: 1,
    info: 'Four-pole miniature breaker (L1 L2 L3 N): 1-3-5-7 → 2-4-6-8. Trips on a short circuit.',
    terms: polesTerms(P4.ins, P4.outs, 130, 100),
    init: () => ({ on: false, tripped: false }), closed: c => c.state.on && !c.state.tripped,
    conduct: c => (c.state.on && !c.state.tripped) ? pairs(P4.ins, P4.outs) : null,
    onPart: breakerOnPart, draw: c => mcbDraw(c, 130, 4),
  });
  def('isol4', {
    name: 'Disconnector 4-Pole', cat: 'Protection', view: 'power', prefix: 'QS', w: 130, h: 100,
    info: 'Load-break switch, 4 poles (L1 L2 L3 N): 1-3-5-7 → 2-4-6-8. Never trips. Click the knob to switch.',
    terms: polesTerms(P4.ins, P4.outs, 130, 100),
    init: () => ({ on: false }),
    conduct: c => c.state.on ? pairs(P4.ins, P4.outs) : null,
    onPart(c, p, ev) { if (p === 'h' && ev === 'down') { c.state.on = !c.state.on; return true; } },
    draw: c => DEFS.isol3.draw(c).replace(/width="100"/g, 'width="130"').replace(/cx="50"/g, 'cx="65"').replace(/x="45"/g, 'x="60"').replace(/rotate\((\d+) 50 58\)/, 'rotate($1 65 58)'),
    status: c => (c.state.on ? 'ON' : 'OFF'),
  });
  def('fsw3', {
    name: 'Fuse Disconnector 3-Pole', cat: 'Protection', view: 'power', prefix: 'QS', w: 100, h: 100, breaker: 0.5,
    props: { rating: '16A' }, pdefs: [{ k: 'rating', n: 'Fuse rating', opts: ['6A', '10A', '16A', '25A', '32A'] }],
    info: 'Switch with fuses in it (fuse-switch disconnector): 1-3-5 → 2-4-6. Click the knob to switch ON/OFF; the fuses blow on a short circuit (click F to replace them).',
    terms: polesTerms(['1', '3', '5'], ['2', '4', '6'], 100, 100),
    init: () => ({ on: false, tripped: false }), closed: c => c.state.on && !c.state.tripped,
    conduct: c => (c.state.on && !c.state.tripped) ? pairs(['1', '3', '5'], ['2', '4', '6']) : null,
    onPart(c, p, ev) {
      if (ev !== 'down') return;
      if (p === 'h') { c.state.on = !c.state.on; return true; }
      if (p === 'f' && c.state.tripped) { c.state.tripped = false; return true; }
    },
    draw(c) {
      const s = c.state;
      return DEFS.isol3.draw(c).replace('ISOLATOR', 'FUSE SW ' + c.props.rating) + `<g class="part" data-part="f"><rect x="78" y="72" width="18" height="14" rx="3" fill="${s.tripped ? '#d33a2c' : '#e9e5dc'}" stroke="#555"/>${T(87, 82, 'F', `dt xs${s.tripped ? ' light' : ''}`)}</g>`;
    },
    status: c => c.state.tripped ? 'Fuses BLOWN — click F to replace' : c.state.on ? 'ON' : 'OFF',
  });
  def('rcd4', {
    name: 'RCD 4-Pole 30 mA', cat: 'Protection', view: 'power', prefix: 'FI', w: 130, h: 100, breaker: 0.8, earthOnly: true,
    info: 'Residual current device for 3-phase + N: 1-3-5-7 → 2-4-6-8 (7-8 = N). Trips on an earth fault before the breakers. T = test.',
    terms: polesTerms(P4.ins, P4.outs, 130, 100),
    init: () => ({ on: false, tripped: false }), closed: c => c.state.on && !c.state.tripped,
    conduct: c => (c.state.on && !c.state.tripped) ? pairs(P4.ins, P4.outs) : null,
    onPart: (c, p, ev) => DEFS.rcd.onPart(c, p, ev),
    draw: c => mcbDraw(c, 130, 4).replace('>C16<', '>30mA<') + `<g class="part" data-part="test"><rect x="110" y="34" width="14" height="10" rx="2" fill="#2f6fd6" stroke="#1b3f7a"/>${T(117, 42, 'T', 'dt light xs')}</g>`,
    status: c => DEFS.rcd.status(c),
  });
  def('rcbo', {
    name: 'RCBO 2-Pole (RCD + MCB)', cat: 'Protection', view: 'power', prefix: 'QF', w: 70, h: 100, breaker: 0.9,
    info: 'Residual current breaker with overcurrent protection: L 1 → 2, N 3 → 4. Trips on an earth fault and on a short circuit, before the MCBs in front of it. T = test.',
    terms: [{ id: '1', x: 20, y: 0, l: '1 L' }, { id: '3', x: 50, y: 0, l: '3 N' }, { id: '2', x: 20, y: 100, l: '2 L' }, { id: '4', x: 50, y: 100, l: '4 N' }],
    init: () => ({ on: false, tripped: false }), closed: c => c.state.on && !c.state.tripped,
    conduct: c => (c.state.on && !c.state.tripped) ? [['1', '2'], ['3', '4']] : null,
    onPart: (c, p, ev) => DEFS.rcd.onPart(c, p, ev),
    draw: c => DEFS.rcd.draw(c).replace('>30mA<', '>B16 30mA<'),
    status: c => c.state.tripped ? 'TRIPPED — click the handle to reset' : c.state.on ? 'ON' : 'OFF',
  });
  def('buzzer', {
    name: 'Buzzer / Horn', cat: 'Pilot Devices', view: 'panel', prefix: 'HA', w: 50, h: 80,
    props: { coil: '24VDC' },
    pdefs: [{ k: 'coil', n: 'Voltage', opts: RATINGS }],
    info: 'Audible alarm X1-X2. Sounds at its rated voltage; over-voltage burns it.',
    terms: [{ id: 'X1', x: 13, y: 80 }, { id: 'X2', x: 37, y: 80 }],
    init: () => ({ on: false, burnt: false }),
    evaluate(c, api) { return set(c, 'on', coilOn(c, api, 'X1', 'X2')); },
    draw(c) {
      const on = c.state.on;
      return R(0, 0, 50, 80, '#2b2a28', 6, '#111') + `<circle cx="25" cy="30" r="17" fill="#3b3a36" stroke="#111"/>` +
        [6, 10, 14].map(r => `<circle cx="25" cy="30" r="${r}" fill="none" stroke="#9aa0a6" stroke-width="1.2"/>`).join('') +
        (on ? `<path d="M44 18 q6 12 0 24 M48 12 q10 18 0 36" fill="none" stroke="#f2c230" stroke-width="2" class="blink"/>` : '') +
        R(8, 56, 34, 12, '#d7d3ca', 2, '#777') + T(25, 65, c.props.coil, 'dt xs') + (c.state.burnt ? burnt(50, 80) : '');
    },
    status: c => c.state.burnt ? 'Burnt out' : c.state.on ? 'SOUNDING' : 'Silent',
  });
  def('selkey', {
    name: 'Key Selector 2-Pos', cat: 'Pilot Devices', view: 'panel', prefix: 'S', w: 60, h: 90,
    props: { text: 'OFF  ON' },
    pdefs: [{ k: 'text', n: 'Legend' }],
    info: 'Key-operated 2-position selector (maintained). Contact 13-14 closes in position I. Click the key to turn it.',
    terms: [{ id: '13', x: 15, y: 90 }, { id: '14', x: 45, y: 90 }],
    init: () => ({ pos: 0 }),
    conduct: c => c.state.pos ? [['13', '14']] : null,
    onPart(c, p, ev) { if (p === 'key' && ev === 'down') { c.state.pos = c.state.pos ? 0 : 1; return true; } },
    draw(c) {
      const a = c.state.pos ? 45 : -45;
      return R(0, 0, 60, 90, '#2b2a28', 6, '#111') + R(6, 4, 48, 13, '#f2efe6', 2, '#999') + T(30, 13.5, c.props.text || '', 'dt xs') +
        `<g class="part" data-part="key"><circle cx="30" cy="42" r="20" fill="url(#gChrome)" stroke="#222"/><circle cx="30" cy="42" r="9" fill="#555" stroke="#222"/><g transform="rotate(${a} 30 42)"><rect x="28" y="22" width="4" height="22" rx="1" fill="#d4af37" stroke="#7a6420"/><circle cx="30" cy="22" r="5" fill="#d4af37" stroke="#7a6420"/></g></g>` +
        R(12, 66, 36, 12, '#d7d3ca', 2, '#777') + T(30, 75, c.state.pos ? 'I' : '0', 'dt xs');
    },
    status: c => c.state.pos ? 'Position I (13-14 closed)' : 'Position 0',
  });

  /* ---------- SENSORS ---------- */
  def('limit', {
    name: 'Limit Switch', cat: 'Sensors', view: 'plant', prefix: 'SQ', w: 70, h: 90,
    info: 'Roller-lever limit switch. NO 13-14, NC 21-22. Click the lever to actuate / release.',
    terms: [{ id: '13', x: 10, y: 90 }, { id: '14', x: 26, y: 90 }, { id: '21', x: 44, y: 90 }, { id: '22', x: 60, y: 90 }],
    init: () => ({ act: false }),
    conduct: c => c.state.act ? [['13', '14']] : [['21', '22']],
    onPart(c, p, ev) { if (p === 'lever' && ev === 'down') { c.state.act = !c.state.act; return true; } },
    draw(c) {
      const a = c.state.act ? 35 : 0;
      return R(10, 30, 50, 46, 'url(#gMetal)', 4) + R(14, 64, 42, 10, '#d7d3ca', 2, '#777') + T(35, 72, '1NO 1NC', 'dt xs') +
        `<g class="part" data-part="lever" transform="rotate(${-a} 35 34)"><rect x="32" y="4" width="6" height="32" rx="2" fill="#555"/><circle cx="35" cy="8" r="7" fill="#2b2a28" stroke="#111"/><rect x="0" y="0" width="70" height="40" fill="transparent"/></g>` +
        led(52, 40, c.state.act, '#f2c230', 3);
    },
    status: c => c.state.act ? 'Actuated' : 'Free',
  });
  function prox(type, out, label = 'Proximity Sensor', variant = { PNP: 'prox', NPN: 'prox_npn' }) {
  def(type, {
    name: label + ' ' + out, cat: 'Sensors', view: 'plant', prefix: 'B', w: 60, h: 90,
    variant: { n: 'Output type', of: variant },
    info: out === 'PNP'
      ? '3-wire PNP sensor: BN brown = +24 V, BU blue = 0 V, BK black = output (switches +24 V to the PLC input when a target is present; use with a sinking input, COM to 0 V). Click to place/remove the target.'
      : '3-wire NPN sensor: BN brown = +24 V, BU blue = 0 V, BK black = output (switches 0 V to the PLC input when a target is present; use with a sourcing input, COM to +24 V). Click to place/remove the target.',
    terms: [{ id: 'BN', x: 12, y: 90 }, { id: 'BK', x: 30, y: 90 }, { id: 'BU', x: 48, y: 90 }],
    init: () => ({ tgt: false, act: false, pw: false }),
    conduct: c => c.state.act ? [[out === 'PNP' ? 'BN' : 'BU', 'BK']] : null,
    evaluate(c, api) {
      const v = api.v(c, 'BN', 'BU');
      const pw = !!(v && v.kind === 'DC' && !v.rev);
      return set(c, 'pw', pw) | set(c, 'act', pw && c.state.tgt);
    },
    onPart(c, p, ev) { if (p === 'tgt' && ev === 'down') { c.state.tgt = !c.state.tgt; return true; } },
    draw(c) {
      const s = c.state;
      return (s.pw ? `<path d="M24 13 L36 13 L50 0 L10 0 Z" fill="#ff3b30" opacity="${s.act ? 0.45 : 0.18}"/>` : '') +
        `<g class="part" data-part="tgt"><rect x="4" y="0" width="52" height="10" rx="2" fill="${s.tgt ? '#8b8f95' : 'transparent'}" stroke="${s.tgt ? '#444' : '#999'}" stroke-dasharray="${s.tgt ? '' : '3 2'}"/><rect x="0" y="0" width="60" height="62" fill="transparent"/></g>` +
        R(20, 14, 20, 46, 'url(#gMetal)', 2) + [20, 26, 32, 38, 44].map(y => `<line x1="20" y1="${y}" x2="40" y2="${y}" stroke="#777" stroke-width=".7"/>`).join('') +
        R(21, 13, 18, 4, '#f39c1e', 1, 'none') + led(30, 54, s.act, '#f2c230', 3) +
        `<path d="M27 60 L27 70 L12 80 L12 90" stroke="#8b4513" stroke-width="2" fill="none"/><path d="M30 60 L30 90" stroke="#111" stroke-width="2" fill="none"/><path d="M33 60 L33 70 L48 80 L48 90" stroke="#1e6fd9" stroke-width="2" fill="none"/>`;
    },
    status: c => !c.state.pw ? 'Not powered (BN +24V, BU 0V)' : c.state.act ? `Target detected (BK = ${out === 'PNP' ? '+24 V' : '0 V'})` : 'No target',
  });
  }
  prox('prox', 'PNP');
  prox('prox_npn', 'NPN');
  prox('photo', 'PNP', 'Photoelectric Sensor', { PNP: 'photo', NPN: 'photo_npn' });
  prox('photo_npn', 'NPN', 'Photoelectric Sensor', { PNP: 'photo', NPN: 'photo_npn' });

  /* process switches with one contact, N.O. or N.C. (contact type in the properties) */
  function procSwitch(type, base, name, contact, what) {
    const ids = contact === 'NO' ? ['13', '14'] : ['11', '12'];
    def(type, {
      name: name + (contact === 'NC' ? ' (NC)' : ''), cat: 'Sensors', view: 'plant', prefix: ({ pressure: 'SP', float: 'SL', temp: 'ST', flow: 'SF' })[what], w: 60, h: 90,
      variant: { n: 'Contact type', of: { NO: base, NC: base + '_nc' } },
      info: `${name}: contact ${ids.join('-')} is ${contact === 'NO' ? 'open, and closes when' : 'closed, and opens when'} the ${({ pressure: 'pressure reaches the setpoint', float: 'liquid lifts the float', temp: 'temperature reaches the setpoint', flow: 'flow is detected' })[what]}. Click it to change the process value.`,
      terms: [{ id: ids[0], x: 15, y: 90 }, { id: ids[1], x: 45, y: 90 }],
      init: () => ({ act: false }),
      conduct: c => (contact === 'NO') === c.state.act ? [ids] : null,
      onPart(c, p, ev) { if (p === 'pv' && ev === 'down') { c.state.act = !c.state.act; return true; } },
      draw(c) {
        const a = c.state.act;
        const body = what === 'temp'
          ? `<rect x="24" y="6" width="12" height="40" rx="6" fill="#f4f1ea" stroke="#555"/><rect x="27" y="${a ? 12 : 30}" width="6" height="${a ? 34 : 16}" rx="3" fill="#d33a2c"/><circle cx="30" cy="48" r="8" fill="#d33a2c" stroke="#555"/>${T(48, 20, a ? 'HOT' : 'COLD', 'dt xs')}`
          : what === 'flow'
          ? `<rect x="4" y="24" width="52" height="18" rx="3" fill="#9aa0a6"/><path d="M10 33 H48 M40 27 L48 33 L40 39" stroke="${a ? '#2f6fd6' : '#666'}" stroke-width="3" fill="none"/>${T(30, 56, a ? 'FLOW' : 'NO FLOW', 'dt xs')}`
          : what === 'pressure'
          ? `<circle cx="30" cy="34" r="22" fill="#f4f1ea" stroke="#555" stroke-width="2"/><path d="M30 34 L${a ? 44 : 18} ${a ? 24 : 26}" stroke="#d33a2c" stroke-width="2.5" stroke-linecap="round"/><circle cx="30" cy="34" r="3" fill="#333"/>${T(30, 50, a ? 'HIGH' : 'LOW', 'dt xs')}`
          : `<rect x="26" y="4" width="8" height="44" fill="#9aa0a6"/><rect x="8" y="${a ? 18 : 34}" width="44" height="14" rx="7" fill="#f39c1e" stroke="#7a4f14"/>${T(30, a ? 14 : 58, a ? 'HIGH' : 'LOW', 'dt xs')}`;
        return `<g class="part" data-part="pv"><rect x="0" y="0" width="60" height="64" fill="transparent"/>${body}</g>` + R(12, 66, 36, 12, '#d7d3ca', 2, '#777') + T(30, 75, contact, 'dt xs') + led(52, 70, (contact === 'NO') === a, '#f2c230', 3);
      },
      status: c => `${c.state.act ? 'Setpoint reached' : 'Below setpoint'} · ${ids.join('-')} ${(contact === 'NO') === c.state.act ? 'closed' : 'open'}`,
    });
  }
  procSwitch('pswitch', 'pswitch', 'Pressure Switch', 'NO', 'pressure');
  procSwitch('pswitch_nc', 'pswitch', 'Pressure Switch', 'NC', 'pressure');
  procSwitch('float', 'float', 'Float Switch', 'NO', 'float');
  procSwitch('float_nc', 'float', 'Float Switch', 'NC', 'float');
  procSwitch('tswitch', 'tswitch', 'Thermostat', 'NO', 'temp');
  procSwitch('tswitch_nc', 'tswitch', 'Thermostat', 'NC', 'temp');
  procSwitch('flowsw', 'flowsw', 'Flow Switch', 'NO', 'flow');
  procSwitch('flowsw_nc', 'flowsw', 'Flow Switch', 'NC', 'flow');

  /* ---------- LOADS & EQUIPMENT ---------- */
  const PH = { L1: 0, L2: 1, L3: 2 };
  function motorDrive(c, api, u, v, w) {
    const ps = [api.phase(c, u), api.phase(c, v), api.phase(c, w)];
    const nn = ps.filter(Boolean);
    const dist = new Set(nn).size;
    let drive = 'off', dir = 0;
    if (dist === 3) {
      drive = 'run';
      const a = PH[ps[0]], b = PH[ps[1]], d = PH[ps[2]];
      dir = ((b - a + 3) % 3 === 1 && (d - b + 3) % 3 === 1) ? 1 : -1;
    } else if (nn.length >= 2 && dist >= 2) drive = 'single';
    return { drive, dir };
  }
  function motorEval(c, api, u, v, w) {
    const { drive, dir } = motorDrive(c, api, u, v, w);
    c.state.drive = drive; c.state.dir = dir;
    if ((drive === 'run' && c.state.jam) || drive === 'single') api.overM.push({ c, t: [u, v, w] });
    return false;
  }
  function motorTick(c, dt) {
    const s = c.state;
    const target = s.drive === 'run' && !s.jam ? s.dir * (s.k || 1) : 0;
    const rate = s.drive === 'run' ? 1.6 : 0.7;
    if (s.spd < target) s.spd = Math.min(target, s.spd + rate * dt);
    else if (s.spd > target) s.spd = Math.max(target, s.spd - rate * dt);
    if (Math.abs(s.spd) < 0.001) s.spd = 0;
    s.ang = ((s.ang || 0) + s.spd * dt * 900) % 360;
    s.ang = Math.round(s.ang);
  }
  function motorStatus(s) {
    if (s.drive === 'single') return 'SINGLE-PHASING — humming, overcurrent!';
    if (s.drive === 'run' && s.jam) return 'JAMMED — overcurrent!';
    if (s.drive === 'run') return (s.dir > 0 ? 'RUN FWD' : 'RUN REV') + ` · ${Math.round(Math.abs(s.spd) * 1750)} rpm`;
    return Math.abs(s.spd) > 0.01 ? 'Coasting…' : 'Stopped';
  }
  function fan(cx, cy, r, ang, s) {
    let b = '';
    for (let i = 0; i < 3; i++) b += `<path d="M0 0 L${r * 0.9} ${-r * 0.22} Q${r} 0 ${r * 0.9} ${r * 0.22} Z" fill="#c9cdd2" stroke="#6b7076" stroke-width=".6" transform="rotate(${i * 120})"/>`;
    return `<g transform="translate(${cx} ${cy}) rotate(${ang})">${b}<circle r="${r * 0.18}" fill="#555"/></g>`;
  }
  def('motor', {
    name: '3-Phase Induction Motor', cat: 'Equipment', view: 'plant', prefix: 'M', w: 120, h: 120,
    props: { conn: 'Star' },
    pdefs: [{ k: 'conn', n: 'Terminal box bridges', opts: ['Star', 'Delta'] }],
    info: 'Terminals U1 V1 W1 + PE. The bridges in the terminal box show star or delta (the simulation runs the motor the same way). Phase sequence L1-L2-L3 → forward; swap any two phases → reverse. Missing a phase → single-phasing (overcurrent). Click JAM to simulate a mechanical jam.',
    terms: [{ id: 'U1', x: 30, y: 0 }, { id: 'V1', x: 50, y: 0 }, { id: 'W1', x: 70, y: 0 }, { id: 'PE', x: 100, y: 0 }],
    init: () => ({ spd: 0, ang: 0, drive: 'off', dir: 0, jam: false }),
    transient: ['spd', 'drive', 'dir'],
    evaluate(c, api, ctx) {
      const r = motorEval(c, api, 'U1', 'V1', 'W1');
      // fed by a VFD: the speed follows its frequency (60 Hz = full speed)
      let k = 1;
      for (const key in (ctx && ctx.vfdOut) || {}) if (api.sameNet(c.id + ':U1', key)) k = ctx.vfdOut[key] / 60;
      c.state.k = k;
      return r;
    },
    tick: (c, api, dt) => motorTick(c, dt),
    onPart(c, p, ev) { if (p === 'jam' && ev === 'down') { c.state.jam = !c.state.jam; return true; } },
    draw(c) {
      const s = c.state, warn = (s.drive === 'run' && s.jam) || s.drive === 'single', star = c.props.conn !== 'Delta';
      // terminal box on top: U1 V1 W1 / W2 U2 V2 with yellow bridges (star: one bar, delta: three links)
      let g = R(16, 2, 76, 34, '#8a8f96', 3, '#4a4f55') + R(20, 6, 68, 26, '#e2733b', 2, '#7a3a1a');
      g += (star ? R(26, 23, 48, 5, '#f2c230', 1, '#8a6a10') : [30, 50, 70].map(x => R(x - 2.5, 9, 5, 18, '#f2c230', 1, '#8a6a10')).join(''));
      g += [30, 50, 70].map(x => `<circle cx="${x}" cy="25.5" r="3" fill="#d9d9d6" stroke="#444"/>`).join('');
      // body: side view, cooling ribs, shaft on the right with a key mark that turns
      g += R(8, 38, 86, 56, 'url(#gMotor)', 10, '#1b3570', 1.2) + Array.from({ length: 7 }, (_, i) => `<line x1="${20 + i * 11}" y1="42" x2="${20 + i * 11}" y2="90" stroke="#1b3570" stroke-width="1.4" opacity=".55"/>`).join('') +
        R(94, 58, 18, 14, '#b9bdc2', 2, '#555') + `<g transform="translate(106 65) rotate(${s.ang || 0})"><circle r="6" fill="#d6d9dc" stroke="#555"/><rect x="-1" y="-6" width="2" height="5" fill="#333"/></g>` +
        R(14, 94, 18, 8, '#22488f', 1, '#1b3570') + R(70, 94, 18, 8, '#22488f', 1, '#1b3570') + T(51, 70, 'M 3~', 'dt light big');
      if (warn) g += `<rect x="6" y="36" width="90" height="60" rx="11" fill="none" stroke="#ff4b3a" stroke-width="3" class="blink"/>`;
      if (s.drive === 'run' && !s.jam) g += `<circle cx="106" cy="65" r="11" fill="none" stroke="#d33a2c" stroke-width="1.5"/>` + T(106, 88, s.dir > 0 ? 'CW' : 'CCW', 'dt xs warnt');
      return g + btn('jam', 88, 104, 28, 14, 'JAM', s.jam);
    },
    status: c => motorStatus(c.state),
  });

  /* Six-terminal motor for star-delta: windings U1-U2, V1-V2, W1-W2, all brought out (no bridges in the box).
     Star: U2 V2 W2 joined and dead, phases on U1 V1 W1. Delta: every winding across two different phases. */
  function m6Conn(c, api) {
    const p = t => api.phase(c, t), r = t => api.root(c, t);
    const a = ['U1', 'V1', 'W1'].map(p), b = ['U2', 'V2', 'W2'].map(p);
    if (!a.every(Boolean)) return a.some(Boolean) ? 'single' : 'off';
    if (new Set(a).size < 3) return 'single';
    // a star point may be tied to N or PE (it carries no current when balanced)
    const starPt = r('U2') === r('V2') && r('V2') === r('W2') && !b.some(Boolean) && ![...api.pots(c, 'U2')].some(livePot);
    if (starPt) return 'star';
    // delta: every winding across two different phases, each phase once at the winding ends
    if (b.every((x, i) => x && x !== a[i]) && new Set(b).size === 3) return 'delta';
    return b.some(Boolean) ? 'single' : 'open';
  }
  def('motor6', {
    name: 'Motor 6 terminals (star-delta)', cat: 'Equipment', view: 'plant', prefix: 'M', w: 140, h: 120,
    info: 'Windings U1-U2, V1-V2, W1-W2 all on the terminal box, for a star-delta starter. STAR: U2 V2 W2 joined, supply on U1 V1 W1 (reduced current, ~70 % speed in this model). DELTA: each winding across two phases (full speed). Swap two phases to reverse. Click JAM to simulate a jam.',
    terms: [{ id: 'U1', x: 20, y: 0 }, { id: 'V1', x: 40, y: 0 }, { id: 'W1', x: 60, y: 0 }, { id: 'W2', x: 80, y: 0 }, { id: 'U2', x: 100, y: 0 }, { id: 'V2', x: 120, y: 0 }, { id: 'PE', x: 136, y: 40, dir: 1 }],
    init: () => ({ spd: 0, ang: 0, drive: 'off', dir: 0, jam: false, conn: 'off', k: 1 }),
    transient: ['spd', 'drive', 'dir', 'conn'],
    evaluate(c, api) {
      const conn = m6Conn(c, api), s = c.state;
      s.conn = conn; s.k = conn === 'star' ? 0.7 : 1;
      if (conn === 'star' || conn === 'delta') {
        const { dir } = motorDrive(c, api, 'U1', 'V1', 'W1');
        s.drive = 'run'; s.dir = dir;
        if (s.jam) api.overM.push({ c, t: ['U1', 'V1', 'W1'] });
      } else if (conn === 'single') { s.drive = 'single'; s.dir = 0; api.overM.push({ c, t: ['U1', 'V1', 'W1'] }); }
      else { s.drive = 'off'; s.dir = 0; }
      return false;
    },
    tick: (c, api, dt) => motorTick(c, dt),
    onPart(c, p, ev) { if (p === 'jam' && ev === 'down') { c.state.jam = !c.state.jam; return true; } },
    draw(c) {
      const s = c.state, warn = (s.drive === 'run' && s.jam) || s.drive === 'single';
      let g = R(10, 2, 120, 30, '#8a8f96', 3, '#4a4f55') + R(14, 6, 112, 22, '#e2733b', 2, '#7a3a1a');
      g += `<text class="dt xs" x="70" y="22" text-anchor="middle">${s.conn === 'star' ? 'Y STAR' : s.conn === 'delta' ? 'Δ DELTA' : ''}</text>`;
      g += R(18, 36, 96, 56, 'url(#gMotor)', 10, '#1b3570', 1.2) + Array.from({ length: 8 }, (_, i) => `<line x1="${28 + i * 11}" y1="40" x2="${28 + i * 11}" y2="88" stroke="#1b3570" stroke-width="1.4" opacity=".55"/>`).join('') +
        R(114, 56, 18, 14, '#b9bdc2', 2, '#555') + `<g transform="translate(126 63) rotate(${s.ang || 0})"><circle r="6" fill="#d6d9dc" stroke="#555"/><rect x="-1" y="-6" width="2" height="5" fill="#333"/></g>` +
        R(24, 92, 18, 8, '#22488f', 1, '#1b3570') + R(90, 92, 18, 8, '#22488f', 1, '#1b3570') + T(66, 68, 'M 3~', 'dt light big');
      if (warn) g += `<rect x="16" y="34" width="100" height="60" rx="11" fill="none" stroke="#ff4b3a" stroke-width="3" class="blink"/>`;
      if (s.drive === 'run' && !s.jam) g += T(126, 86, s.dir > 0 ? 'CW' : 'CCW', 'dt xs warnt');
      return g + btn('jam', 4, 102, 28, 14, 'JAM', s.jam);
    },
    status: c => {
      const s = c.state;
      if (s.conn === 'open') return 'Windings not connected: join U2 V2 W2 (star) or wire them for delta';
      const base = motorStatus(s);
      return s.drive === 'run' && !s.jam ? `${s.conn === 'star' ? 'STAR (Y)' : 'DELTA (Δ)'} · ${base}` : base;
    },
  });

  /* motor drawn as a body under a terminal box; label shows the connection it runs in */
  function motorBox(c, w, label, sub) {
    const s = c.state, warn = (s.drive === 'run' && s.jam) || s.drive === 'single', bw = w - 24;
    let g = R(4, 2, w - 8, 30, '#8a8f96', 3, '#4a4f55') + R(8, 6, w - 16, 22, '#e2733b', 2, '#7a3a1a') + T(w / 2, 22, sub || '', 'dt xs');
    g += R(10, 36, bw - 4, 56, 'url(#gMotor)', 10, '#1b3570', 1.2) + R(bw + 6, 56, 16, 14, '#b9bdc2', 2, '#555') +
      `<g transform="translate(${bw + 14} 63) rotate(${s.ang || 0})"><circle r="6" fill="#d6d9dc" stroke="#555"/><rect x="-1" y="-6" width="2" height="5" fill="#333"/></g>` + T(w / 2 - 6, 68, label, 'dt light big');
    if (warn) g += `<rect x="8" y="34" width="${bw}" height="60" rx="11" fill="none" stroke="#ff4b3a" stroke-width="3" class="blink"/>`;
    return g + btn('jam', 4, 100, 28, 14, 'JAM', s.jam);
  }
  def('motor1', {
    name: 'Single-Phase Motor 230V', cat: 'Equipment', view: 'plant', prefix: 'M', w: 100, h: 120,
    info: 'Single-phase motor: L, N, PE. Runs at 230 V AC between L and N. Click JAM to simulate a jam (overcurrent).',
    terms: [{ id: 'L', x: 25, y: 0 }, { id: 'N', x: 50, y: 0 }, { id: 'PE', x: 80, y: 0 }],
    init: () => ({ spd: 0, ang: 0, drive: 'off', dir: 0, jam: false, burnt: false }),
    transient: ['spd', 'drive', 'dir'],
    evaluate(c, api) {
      const v = api.v(c, 'L', 'N'), s = c.state;
      if (v && v.label === '400VAC' && !s.burnt) { s.burnt = true; api.alert(`${c.props.label}: motor burnt — 400 VAC on a 230 V motor`, 'danger'); }
      const run = !!(v && v.kind === 'AC' && v.label === '230VAC') && !s.burnt;
      s.drive = run ? 'run' : 'off'; s.dir = run ? 1 : 0;
      if (run && s.jam) api.overM.push({ c, t: ['L'] });
      return false;
    },
    tick: (c, api, dt) => motorTick(c, dt),
    onPart(c, p, ev) { if (p === 'jam' && ev === 'down') { c.state.jam = !c.state.jam; return true; } },
    draw: c => motorBox(c, 100, 'M 1~', '230 V') + (c.state.burnt ? burnt(100, 120) : ''),
    status: c => c.state.burnt ? 'Burnt' : motorStatus(c.state),
  });
  def('motordc', {
    name: 'DC Motor 24 V', cat: 'Equipment', view: 'plant', prefix: 'M', w: 100, h: 120,
    info: 'Permanent-magnet DC motor: A1 (+) and A2 (−). Runs on 24 V DC; swap the polarity to reverse it. AC destroys it. Click JAM to simulate a jam.',
    terms: [{ id: 'A1', x: 30, y: 0, l: 'A1+' }, { id: 'A2', x: 60, y: 0, l: 'A2−' }],
    init: () => ({ spd: 0, ang: 0, drive: 'off', dir: 0, jam: false, burnt: false }),
    transient: ['spd', 'drive', 'dir'],
    evaluate(c, api) {
      const v = api.v(c, 'A1', 'A2'), s = c.state;
      if (v && v.kind === 'AC' && !s.burnt) { s.burnt = true; api.alert(`${c.props.label}: DC motor burnt — ${v.label} on a 24 V DC motor`, 'danger'); }
      const run = !!(v && v.kind === 'DC') && !s.burnt;
      s.drive = run ? 'run' : 'off'; s.dir = run ? (v.rev ? -1 : 1) : 0;
      if (run && s.jam) api.overM.push({ c, t: ['A1'] });
      return false;
    },
    tick: (c, api, dt) => motorTick(c, dt),
    onPart(c, p, ev) { if (p === 'jam' && ev === 'down') { c.state.jam = !c.state.jam; return true; } },
    draw: c => motorBox(c, 100, 'M =', '24 V DC') + (c.state.burnt ? burnt(100, 120) : ''),
    status: c => c.state.burnt ? 'Burnt' : motorStatus(c.state),
  });
  /* two speeds: separate windings (1U 1V 1W slow, 2U 2V 2W fast) or Dahlander (one tapped winding:
     slow = supply on 1U 1V 1W with 2U 2V 2W open; fast = supply on 2U 2V 2W with 1U 1V 1W joined) */
  function twoSpeed(type, name, dahl) {
    def(type, {
      name, cat: 'Equipment', view: 'plant', prefix: 'M', w: 150, h: 120,
      info: dahl
        ? 'Dahlander (pole-changing) motor. SLOW: supply on 1U 1V 1W, leave 2U 2V 2W open. FAST: supply on 2U 2V 2W and join 1U 1V 1W. Supply on both sets = fault.'
        : 'Two-speed motor with two separate windings. SLOW: supply on 1U 1V 1W. FAST: supply on 2U 2V 2W. Never both.',
      terms: [{ id: '1U', x: 18, y: 0 }, { id: '1V', x: 36, y: 0 }, { id: '1W', x: 54, y: 0 }, { id: '2U', x: 78, y: 0 }, { id: '2V', x: 96, y: 0 }, { id: '2W', x: 114, y: 0 }, { id: 'PE', x: 140, y: 0 }],
      init: () => ({ spd: 0, ang: 0, drive: 'off', dir: 0, jam: false, sp: 'off', k: 1 }),
      transient: ['spd', 'drive', 'dir', 'sp'],
      evaluate(c, api) {
        const s = c.state, ph = ts => ts.map(t => api.phase(c, t));
        const a = ph(['1U', '1V', '1W']), b = ph(['2U', '2V', '2W']), full = x => x.every(Boolean) && new Set(x).size === 3, none = x => !x.some(Boolean);
        const joined = ts => { const r = ts.map(t => api.root(c, t)); return r[0] === r[1] && r[1] === r[2] && !api.pots(c, ts[0]).size; };
        let sp = 'off';
        if (full(a) && none(b) && (!dahl || !joined(['2U', '2V', '2W']))) sp = 'slow';
        else if (full(b) && none(a) && (!dahl || joined(['1U', '1V', '1W']))) sp = 'fast';
        else if (a.some(Boolean) || b.some(Boolean)) sp = 'fault';
        s.sp = sp; s.k = sp === 'slow' ? 0.5 : 1;
        if (sp === 'slow' || sp === 'fast') {
          const t = sp === 'slow' ? ['1U', '1V', '1W'] : ['2U', '2V', '2W'];
          s.drive = 'run'; s.dir = motorDrive(c, api, ...t).dir;
          if (s.jam) api.overM.push({ c, t });
        } else if (sp === 'fault') { s.drive = 'single'; s.dir = 0; api.overM.push({ c, t: a.some(Boolean) ? ['1U', '1V', '1W'] : ['2U', '2V', '2W'] }); }
        else { s.drive = 'off'; s.dir = 0; }
        return false;
      },
      tick: (c, api, dt) => motorTick(c, dt),
      onPart(c, p, ev) { if (p === 'jam' && ev === 'down') { c.state.jam = !c.state.jam; return true; } },
      draw: c => motorBox(c, 150, 'M 3~', dahl ? 'DAHLANDER' : 'TWO SPEED') + T(75, 112, ({ slow: 'SLOW', fast: 'FAST', fault: 'FAULT' })[c.state.sp] || '', 'dt xs warnt'),
      status: c => (c.state.sp === 'fault' ? 'Wrong connection — overcurrent! ' : c.state.sp === 'slow' || c.state.sp === 'fast' ? c.state.sp.toUpperCase() + ' · ' : '') + motorStatus(c.state),
    });
  }
  twoSpeed('motor2s', 'Two-Speed Motor (2 windings)', false);
  twoSpeed('dahlander', 'Dahlander Motor (2 speeds)', true);

  def('heater', {
    name: 'Heater 230V', cat: 'Equipment', view: 'plant', prefix: 'EH', w: 70, h: 70,
    props: { coil: '230VAC' }, pdefs: [{ k: 'coil', n: 'Rated voltage', opts: RATINGS }],
    info: 'Resistive heater X1-X2 (e.g. cabinet or tank heater). It glows at its rated voltage; over-voltage burns it.',
    terms: [{ id: 'X1', x: 20, y: 70 }, { id: 'X2', x: 50, y: 70 }],
    init: () => ({ on: false, burnt: false }),
    evaluate(c, api) { return set(c, 'on', coilOn(c, api, 'X1', 'X2')); },
    draw(c) {
      const on = c.state.on;
      return R(4, 4, 62, 52, '#3a3a38', 6, '#111') + `<path d="M12 30 l6 -12 l6 24 l6 -24 l6 24 l6 -24 l6 24 l6 -12" fill="none" stroke="${on ? '#ff6a2a' : '#888'}" stroke-width="3" ${on ? 'filter="url(#fGlow)"' : ''}/>` + T(35, 64, c.props.coil, 'dt xs') + (c.state.burnt ? burnt(70, 70) : '');
    },
    status: c => c.state.burnt ? 'Burnt' : c.state.on ? 'Heating' : 'Off',
  });
  def('hourmeter', {
    name: 'Hour Meter', cat: 'Equipment', view: 'panel', prefix: 'P', w: 70, h: 60,
    props: { coil: '230VAC' }, pdefs: [{ k: 'coil', n: 'Rated voltage', opts: RATINGS }],
    info: 'Counts the running time while X1-X2 is powered (e.g. across a motor contactor coil). In this simulator it shows simulated seconds.',
    terms: [{ id: 'X1', x: 20, y: 60 }, { id: 'X2', x: 50, y: 60 }],
    init: () => ({ on: false, t: 0, burnt: false }),
    evaluate(c, api) { return set(c, 'on', coilOn(c, api, 'X1', 'X2')); },
    tick(c, api, dt) { if (c.state.on) c.state.t = Math.round((c.state.t + dt) * 100) / 100; c.state.tD = Math.floor(c.state.t); },
    draw(c) {
      const t = c.state.tD || 0, hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60, ss = t % 60, pad = n => String(n).padStart(2, '0');
      return R(2, 2, 66, 44, '#2b2a28', 5, '#111') + R(8, 10, 54, 20, '#c9d86c', 2, '#2d3a1e') + `<text class="lcd" x="35" y="25" text-anchor="middle">${hh}:${pad(mm)}:${pad(ss)}</text>` + T(35, 40, 'h', 'dt light xs') + led(60, 40, c.state.on, '#3ddc63', 2.5);
    },
    status: c => `${c.state.tD || 0} s counted${c.state.on ? ' · running' : ''}`,
  });
  def('vmeter', {
    name: 'Voltmeter', cat: 'Equipment', view: 'panel', prefix: 'PV', w: 70, h: 60,
    info: 'Panel voltmeter between V1 and V2: shows the voltage like the multimeter (it does not conduct).',
    terms: [{ id: 'V1', x: 20, y: 60 }, { id: 'V2', x: 50, y: 60 }],
    init: () => ({ v: 0, kind: '' }),
    transient: ['v', 'kind'],
    evaluate(c, api) { const v = api.v(c, 'V1', 'V2'); return set(c, 'v', v ? v.v : 0) | set(c, 'kind', v ? v.kind : ''); },
    draw(c) {
      return R(2, 2, 66, 44, '#f4f1ea', 5, '#555') + `<path d="M12 36 A24 24 0 0 1 58 36" fill="none" stroke="#555"/><path d="M35 36 L${35 - 20 * Math.cos(Math.min(1, c.state.v / 400) * Math.PI)} ${36 - 20 * Math.sin(Math.min(1, c.state.v / 400) * Math.PI)}" stroke="#d33a2c" stroke-width="2"/>` + T(35, 30, `${c.state.v} V ${c.state.kind}`, 'dt xs') + T(35, 44, 'V', 'dt xs');
    },
    status: c => `${c.state.v} V ${c.state.kind}`,
  });
  def('conveyor', {
    name: 'Conveyor (motor + 2 sensors)', cat: 'Equipment', view: 'plant', prefix: 'CV', w: 380, h: 170,
    info: 'Belt driven by a 3-phase motor (U1 V1 W1). Two PNP photo-eyes: B1 at the infeed, B2 at the discharge (BN +24 V, BU 0 V, BK output). Use +BOX / AUTO to feed boxes.',
    terms: [{ id: 'U1', x: 20, y: 0 }, { id: 'V1', x: 40, y: 0 }, { id: 'W1', x: 60, y: 0 }, { id: 'PE', x: 82, y: 0 },
      { id: 'S1BN', x: 140, y: 0, l: 'BN' }, { id: 'S1BK', x: 160, y: 0, l: 'BK' }, { id: 'S1BU', x: 180, y: 0, l: 'BU' },
      { id: 'S2BN', x: 290, y: 0, l: 'BN' }, { id: 'S2BK', x: 310, y: 0, l: 'BK' }, { id: 'S2BU', x: 330, y: 0, l: 'BU' }],
    init: () => ({ spd: 0, ang: 0, drive: 'off', dir: 0, jam: false, belt: 0, boxes: [], auto: false, ft: 0, count: 0, d1: false, d2: false, a1: false, a2: false }),
    transient: ['spd', 'drive', 'dir'],
    conduct(c) { const o = []; if (c.state.a1) o.push(['S1BN', 'S1BK']); if (c.state.a2) o.push(['S2BN', 'S2BK']); return o; },
    evaluate(c, api) {
      motorEval(c, api, 'U1', 'V1', 'W1');
      const p1 = api.v(c, 'S1BN', 'S1BU'), p2 = api.v(c, 'S2BN', 'S2BU');
      const ok = v => !!(v && v.kind === 'DC' && !v.rev);
      return set(c, 'a1', ok(p1) && c.state.d1) | set(c, 'a2', ok(p2) && c.state.d2);
    },
    tick(c, api, dt) {
      motorTick(c, dt);
      const s = c.state, v = s.spd * 90;
      s.belt = Math.round(((s.belt + v * dt) % 40 + 40) % 40 * 10) / 10;
      const L = 320;
      s.boxes.forEach(b => { b.x += v * dt; });
      // keep spacing: boxes cannot overlap when moving backward/forward
      s.boxes.sort((a, b) => a.x - b.x);
      const before = s.boxes.length;
      s.boxes = s.boxes.filter(b => b.x <= L + 10 && b.x >= -30);
      s.count += before - s.boxes.length;
      if (s.auto) {
        s.ft += dt;
        if (s.ft > 3 && s.spd > 0.3 && (!s.boxes.length || s.boxes[0].x > 50)) { s.ft = 0; s.boxes.unshift({ x: 0 }); }
      }
      s.boxes.forEach(b => { b.x = Math.round(b.x * 10) / 10; });
      const det = sx => s.boxes.some(b => Math.abs(b.x + 17 - sx) < 17);
      s.d1 = det(70); s.d2 = det(290);
    },
    onPart(c, p, ev) {
      if (ev !== 'down') return;
      const s = c.state;
      if (p === 'add') { if (!s.boxes.length || s.boxes[0].x > 40) s.boxes.unshift({ x: 0 }); return true; }
      if (p === 'auto') { s.auto = !s.auto; s.ft = 3; return true; }
      if (p === 'clr') { s.boxes = []; s.count = 0; return true; }
      if (p === 'jam') { s.jam = !s.jam; return true; }
    },
    draw(c) {
      const s = c.state, by = 112;
      let g = T(40, 30, 'M1  3~', 'dt xs') + T(160, 30, 'B1  infeed', 'dt xs') + T(310, 30, 'B2  discharge', 'dt xs');
      g += `<rect x="30" y="${by}" width="320" height="12" fill="#2b2a28"/>`;
      g += `<line x1="30" y1="${by + 1}" x2="350" y2="${by + 1}" stroke="#6b665c" stroke-width="2" stroke-dasharray="12 8" stroke-dashoffset="${-s.belt}"/>`;
      g += [30, 350].map(x => `<circle cx="${x}" cy="${by + 6}" r="9" fill="url(#gMetal)" stroke="#333"/><line x1="${x}" y1="${by + 6}" x2="${x + 7 * Math.cos(s.ang * Math.PI / 180)}" y2="${by + 6 + 7 * Math.sin(s.ang * Math.PI / 180)}" stroke="#333" stroke-width="2"/>`).join('');
      g += `<line x1="50" y1="${by + 14}" x2="44" y2="168" stroke="#6b665c" stroke-width="4"/><line x1="330" y1="${by + 14}" x2="336" y2="168" stroke="#6b665c" stroke-width="4"/>`;
      g += R(2, by + 18, 34, 22, '#5c6670', 3, '#333') + T(19, by + 33, 'M', 'dt light sm');
      s.boxes.forEach(b => { g += `<g transform="translate(${30 + b.x} ${by - 28})"><rect width="34" height="28" rx="2" fill="url(#gBox)" stroke="#7a5527"/><rect x="14" width="6" height="28" fill="#d9b77e" opacity=".7"/></g>`; });
      [[70, s.d1, s.a1], [290, s.d2, s.a2]].forEach(([x, d, a]) => {
        const sx = 30 + x;
        g += `<line x1="${sx}" y1="56" x2="${sx}" y2="${by}" stroke="#ff3b30" stroke-width="${d ? 2.5 : 1}" stroke-dasharray="3 3" opacity="${d ? 1 : .55}"/>`;
        g += R(sx - 12, 40, 24, 16, '#e9e5dc', 3, '#555') + led(sx + 6, 48, a, '#f2c230', 2.8);
      });
      g += btn('add', 110, 140, 44, 18, '+ BOX', false) + btn('auto', 162, 140, 56, 18, s.auto ? 'AUTO ON' : 'AUTO', s.auto) + btn('clr', 226, 140, 44, 18, 'CLEAR', false) + btn('jam', 278, 140, 40, 18, 'JAM', s.jam);
      g += T(376, 152, 'out: ' + s.count, 'dt sm', 'end');
      const warn = (s.drive === 'run' && s.jam) || s.drive === 'single';
      if (warn) g += `<rect x="2" y="${by + 18}" width="34" height="22" rx="3" fill="none" stroke="#ff4b3a" stroke-width="2.5" class="blink"/>`;
      return g;
    },
    status: c => motorStatus(c.state) + ` · boxes out: ${c.state.count}`,
  });

  def('tank', {
    name: 'Tank (fill/drain valves + level switches)', cat: 'Equipment', view: 'plant', prefix: 'TK', w: 210, h: 260,
    props: { coil: '24VDC' },
    pdefs: [{ k: 'coil', n: 'Solenoid voltage', opts: RATINGS }],
    info: 'Y1 fill valve (A1-A2), Y2 drain valve (A1-A2). LSH closes at ≥80 %, LSL closes at ≥20 % (dry contacts). USE opens a manual consumer outlet.',
    terms: [{ id: 'FV1', x: 15, y: 0, l: 'A1' }, { id: 'FV2', x: 35, y: 0, l: 'A2' }, { id: 'DV1', x: 65, y: 0, l: 'A1' }, { id: 'DV2', x: 85, y: 0, l: 'A2' },
      { id: 'H1', x: 125, y: 0, l: '1' }, { id: 'H2', x: 145, y: 0, l: '2' }, { id: 'L1', x: 175, y: 0, l: '1' }, { id: 'L2', x: 195, y: 0, l: '2' }],
    init: () => ({ lvl: 30, fill: false, drain: false, use: false, burnt: false, flow: 0 }),
    conduct(c) { const o = []; if (c.state.lvl >= 80) o.push(['H1', 'H2']); if (c.state.lvl >= 20) o.push(['L1', 'L2']); return o; },
    evaluate(c, api, ctx) {
      // a level transmitter finds this tank by its tag
      if (ctx) { if (!ctx.tanks) ctx.tanks = {}; ctx.tanks[c.props.label] = c.state.lvl; }
      return set(c, 'fill', coilOn(c, api, 'FV1', 'FV2')) | set(c, 'drain', coilOn(c, api, 'DV1', 'DV2'));
    },
    tick(c, api, dt) {
      const s = c.state;
      s.lvl = Math.max(0, Math.min(100, s.lvl + ((s.fill ? 9 : 0) - (s.drain ? 12 : 0) - (s.use ? 4 : 0)) * dt));
      s.lvl = Math.round(s.lvl * 100) / 100;
      s.flow = (s.flow + dt * 60) % 20;
      s.flow = Math.round(s.flow);
    },
    onPart(c, p, ev) { if (p === 'use' && ev === 'down') { c.state.use = !c.state.use; return true; } },
    draw(c) {
      const s = c.state, top = 70, bot = 230, H = bot - top, ly = bot - H * s.lvl / 100;
      let g = T(25, 30, 'Y1 FILL', 'dt xs') + T(75, 30, 'Y2 DRAIN', 'dt xs') + T(135, 30, 'LSH', 'dt xs') + T(185, 30, 'LSL', 'dt xs');
      g += `<path d="M0 50 H70 V${top + 2}" fill="none" stroke="#7d8790" stroke-width="7"/>`;
      g += valve(26, 50, s.fill) + R(18, 36, 16, 8, s.fill ? '#2fa84f' : '#9aa0a6', 2, '#333');
      if (s.fill) g += `<line x1="70" y1="${top + 4}" x2="70" y2="${ly}" stroke="#4aa3df" stroke-width="4" stroke-dasharray="6 4" stroke-dashoffset="${-s.flow}"/>`;
      g += R(40, top, 130, H, 'rgba(255,255,255,.55)', 8, '#5f5b53', 2);
      g += `<clipPath id="tkc${c.id}"><rect x="41" y="${top + 1}" width="128" height="${H - 2}" rx="7"/></clipPath><rect clip-path="url(#tkc${c.id})" x="41" y="${ly}" width="128" height="${bot - ly}" fill="url(#gWater)"/>`;
      g += `<line x1="41" y1="${ly}" x2="169" y2="${ly}" stroke="#2b7bbd" stroke-width="1.5"/>`;
      [[80, s.lvl >= 80, 'LSH'], [20, s.lvl >= 20, 'LSL']].forEach(([p, on, n]) => {
        const y = bot - H * p / 100;
        g += `<line x1="160" y1="${y}" x2="186" y2="${y}" stroke="#333" stroke-width="1.5"/><circle cx="160" cy="${y}" r="4" fill="${on ? '#f2c230' : '#ddd'}" stroke="#333"/>` + led(194, y, on, '#f2c230', 3.5) + T(194, y - 7, n, 'dt xs');
      });
      g += T(105, top + H / 2, Math.round(s.lvl) + ' %', 'dt big');
      if (s.lvl >= 99.5 && s.fill) g += T(105, top - 6, 'OVERFLOW!', 'dt warnt blink');
      g += `<path d="M150 ${bot} V245 H210" fill="none" stroke="#7d8790" stroke-width="7"/>` + valve(180, 245, s.drain) + R(172, 230, 16, 8, s.drain ? '#2fa84f' : '#9aa0a6', 2, '#333');
      g += `<path d="M60 ${bot} V250 H40" fill="none" stroke="#7d8790" stroke-width="5"/>` + btn('use', 2, 240, 36, 16, s.use ? 'USE ✓' : 'USE', s.use);
      if ((s.drain || s.use) && s.lvl > 0) g += `<circle cx="206" cy="245" r="3" fill="#4aa3df"/>`;
      return g + (s.burnt ? burnt(210, 260) : '');
    },
    status: c => `Level ${Math.round(c.state.lvl)} %` + (c.state.fill ? ' · filling' : '') + (c.state.drain ? ' · draining' : '') + (c.state.use ? ' · consumer open' : ''),
  });
  function valve(x, y, open) {
    const f = open ? '#2fa84f' : '#c9c5bb';
    return `<path d="M${x - 9} ${y - 7} L${x + 9} ${y + 7} L${x + 9} ${y - 7} L${x - 9} ${y + 7} Z" fill="${f}" stroke="#333"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 10}" stroke="#333"/>`;
  }

  def('valve', {
    name: 'Solenoid Valve 2/2', cat: 'Equipment', view: 'plant', prefix: 'Y', w: 90, h: 80,
    props: { coil: '24VDC' },
    pdefs: [{ k: 'coil', n: 'Coil voltage', opts: RATINGS }],
    info: 'Normally closed 2/2-way valve, coil A1-A2. Energized = open, flow passes.',
    terms: [{ id: 'A1', x: 30, y: 0 }, { id: 'A2', x: 60, y: 0 }],
    init: () => ({ open: false, burnt: false, flow: 0 }),
    evaluate(c, api) { return set(c, 'open', coilOn(c, api, 'A1', 'A2')); },
    tick(c, api, dt) { c.state.flow = Math.round(((c.state.flow || 0) + dt * 60) % 20); },
    draw(c) {
      const o = c.state.open;
      return R(25, 8, 40, 26, o ? '#2fa84f' : '#5c6670', 3, '#333') + T(45, 25, 'SOL', 'dt light xs') + `<line x1="45" y1="34" x2="45" y2="46" stroke="#333" stroke-width="3"/>` +
        `<path d="M0 58 H90" stroke="#7d8790" stroke-width="8"/>` + valve(45, 58, o) +
        (o ? `<line x1="0" y1="58" x2="90" y2="58" stroke="#4aa3df" stroke-width="3" stroke-dasharray="6 4" stroke-dashoffset="${-c.state.flow}"/>` : '') +
        T(45, 78, o ? 'OPEN' : 'CLOSED', 'dt xs') + (c.state.burnt ? burnt(90, 80) : '');
    },
    status: c => c.state.burnt ? 'Coil burnt' : c.state.open ? 'Open (energized)' : 'Closed',
  });
  def('fan', {
    name: 'Single-Phase Fan 230V', cat: 'Equipment', view: 'plant', prefix: 'M', w: 90, h: 100,
    props: { coil: '230VAC' },
    info: 'Single-phase 230 VAC fan motor: L, N and PE. Runs on 230 VAC between L and N; 400 VAC burns it.',
    terms: [{ id: 'L', x: 25, y: 0 }, { id: 'N', x: 45, y: 0 }, { id: 'PE', x: 70, y: 0 }],
    init: () => ({ on: false, burnt: false, spd: 0, ang: 0 }),
    transient: ['spd'],
    evaluate(c, api) { return set(c, 'on', coilOn(c, api, 'L', 'N')); },
    tick(c, api, dt) {
      const s = c.state;
      s.spd = s.on ? Math.min(1, s.spd + dt * 1.5) : Math.max(0, s.spd - dt * 0.6);
      s.ang = Math.round(((s.ang || 0) + s.spd * dt * 900) % 360);
    },
    draw(c) {
      const s = c.state;
      return `<circle cx="45" cy="56" r="38" fill="#3e464e" stroke="#2a3138" stroke-width="2"/>` + fan(45, 56, 32, s.ang, s) +
        Array.from({ length: 6 }, (_, i) => `<line x1="9" y1="${30 + i * 10}" x2="81" y2="${30 + i * 10}" stroke="#2a3138" stroke-width="1" opacity=".5"/>`).join('') +
        (s.burnt ? burnt(90, 100) : '');
    },
    status: c => c.state.burnt ? 'Burnt out' : c.state.on ? `Running ${Math.round(c.state.spd * 100)} %` : (c.state.spd > 0.01 ? 'Coasting…' : 'Stopped'),
  });

  def('cylinder', {
    name: 'Pneumatic Cylinder (5/2 valve + reeds)', cat: 'Equipment', view: 'plant', prefix: 'CY', w: 300, h: 130,
    props: { coil: '24VDC' },
    pdefs: [{ k: 'coil', n: 'Solenoid voltage', opts: RATINGS }],
    info: 'Double-acting cylinder with single-solenoid spring-return 5/2 valve. Y1 energized → extends. Reed B0 (1-2) closed when retracted, B1 (1-2) closed when extended.',
    terms: [{ id: 'YA1', x: 15, y: 0, l: 'A1' }, { id: 'YA2', x: 35, y: 0, l: 'A2' }, { id: 'B0a', x: 100, y: 0, l: '1' }, { id: 'B0b', x: 120, y: 0, l: '2' }, { id: 'B1a', x: 200, y: 0, l: '1' }, { id: 'B1b', x: 220, y: 0, l: '2' }],
    init: () => ({ pos: 0, sol: false, burnt: false }),
    conduct(c) { const o = []; if (c.state.pos <= 0.02) o.push(['B0a', 'B0b']); if (c.state.pos >= 0.98) o.push(['B1a', 'B1b']); return o; },
    evaluate(c, api) { return set(c, 'sol', coilOn(c, api, 'YA1', 'YA2')); },
    tick(c, api, dt) { const s = c.state; s.pos = Math.max(0, Math.min(1, s.pos + (s.sol ? 1 : -1) * dt * 0.9)); s.pos = Math.round(s.pos * 1000) / 1000; },
    draw(c) {
      const s = c.state, px = 80 + s.pos * 92;
      let g = T(25, 30, 'Y1 SOL', 'dt xs') + T(110, 30, 'B0 retracted', 'dt xs') + T(210, 30, 'B1 extended', 'dt xs');
      g += R(4, 50, 48, 34, '#e9e5dc', 3, '#555') + R(4, 50, 14, 34, s.sol ? '#2fa84f' : '#9aa0a6', 3, '#333') + T(11, 71, 'Y', 'dt light xs') +
        `<path d="M40 54 l4 3 -4 3 4 3 -4 3 4 3 -4 3 4 3" fill="none" stroke="#555"/>` + T(30, 96, '5/2', 'dt xs');
      g += `<path d="M28 84 V100 H84 V88" fill="none" stroke="#3a7bd5" stroke-width="2.5" opacity="${s.sol ? 1 : .35}"/><path d="M36 84 V108 H184 V88" fill="none" stroke="#3a7bd5" stroke-width="2.5" opacity="${s.sol ? .35 : 1}"/>`;
      g += R(78, 58, 112, 30, 'url(#gMetal)', 4, '#444');
      g += R(px, 60, 8, 26, '#3b3a36', 1, '#111') + R(px + 8, 69, 110, 8, '#d0d4d8', 1, '#666') + R(px + 118, 62, 10, 22, '#555', 2, '#222');
      [[92, s.pos <= 0.02], [178, s.pos >= 0.98]].forEach(([x, on]) => { g += R(x - 10, 50, 20, 8, '#333', 2, '#111') + led(x, 44, on, '#ff4b3a', 3); });
      return g + (s.burnt ? burnt(300, 130) : '');
    },
    status: c => `Stroke ${Math.round(c.state.pos * 100)} %` + (c.state.sol ? ' · Y1 ON' : ''),
  });

  /* ---------- Solver ---------- */
  const EMPTY = new Set();
  const isPh = p => p === 'L1' || p === 'L2' || p === 'L3';
  const livePot = p => isPh(p) || p.startsWith('DC');
  const V400 = { kind: 'AC', v: 400, label: '400VAC' }, V230 = { kind: 'AC', v: 230, label: '230VAC' };
  const V24 = { kind: 'DC', v: 24, label: '24VDC' }, V24R = { kind: 'DC', v: -24, label: '24VDC', rev: true };

  function build(circ, ctx, skip) {
    const idx = new Map(); let n = 0;
    for (const c of circ.comps) { const d = DEFS[c.type]; if (!d) continue; for (const t of d.terms) idx.set(c.id + ':' + t.id, n++); }
    const par = new Int32Array(n);
    for (let i = 0; i < n; i++) par[i] = i;
    const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const uni = (a, b) => { if (a == null || b == null) return; a = find(a); b = find(b); if (a !== b) par[a] = b; };
    for (const w of circ.wires) uni(idx.get(w.a), idx.get(w.b));
    for (const c of circ.comps) {
      const d = DEFS[c.type];
      if (d && d.conduct && c.id !== skip) { const ps = d.conduct(c, ctx); if (ps) for (const [a, b] of ps) uni(idx.get(c.id + ':' + a), idx.get(c.id + ':' + b)); }
    }
    const pots = new Map();
    for (const c of circ.comps) {
      const d = DEFS[c.type];
      if (!d || !d.sources) continue;
      const s = d.sources(c, ctx);
      if (s) for (const k in s) {
        const i = idx.get(c.id + ':' + k); if (i == null) continue;
        const r = find(i);
        let st = pots.get(r); if (!st) { st = new Set(); pots.set(r, st); }
        st.add(s[k]);
      }
    }
    return { idx, find, pots, short: new Map() };
  }
  function conflictOf(set) {
    const ac = []; let pe = false, dc = false;
    for (const p of set) {
      if (isPh(p) || p === 'N') ac.push(p);
      else if (p === 'PE') pe = true;
      else if (p.startsWith('DC')) { dc = true; const o = (p[2] === '+' ? 'DC-' : 'DC+') + p.slice(3); if (set.has(o)) return 'DC short circuit (+24 V to 0 V)'; }
    }
    if (ac.length > 1) return ac.includes('N') ? 'Short circuit (line to neutral)' : 'Short circuit (phase to phase)';
    if (pe && ac.some(isPh)) return 'Ground fault (line to earth)';
    // 0 V tied to N or PE is bad practice but no fault current; a phase on a DC circuit is a fault
    if (dc && ac.some(isPh)) return 'AC mains connected to a DC circuit';
    return null;
  }
  function shorts(net) {
    const res = new Map();
    for (const [r, s] of net.pots) if (s.size > 1) { const c = conflictOf(s); if (c) res.set(r, c); }
    return res;
  }
  /* terminals still on a live conductor (a phase or +24 V): the breaker nearest the fault keeps the most of the plant alive */
  function energized(net) {
    let n = 0;
    for (const i of net.idx.values()) {
      const st = net.pots.get(net.find(i));
      if (st) for (const p of st) if (isPh(p) || p.startsWith('DC+')) { n++; break; }
    }
    return n;
  }
  function solveNet(circ, ctx, alerts) {
    let net = build(circ, ctx);
    let sh = shorts(net);
    let guard = 0;
    while (sh.size && guard++ < 8) {
      const roots = new Set(sh.keys());
      const reason = [...sh.values()][0];
      const cands = circ.comps.filter(c => {
        const d = DEFS[c.type];
        return d.breaker && d.closed(c) && (!d.earthOnly || reason.startsWith('Ground fault')) && d.terms.some(t => roots.has(net.find(net.idx.get(c.id + ':' + t.id))));
      }).sort((a, b) => DEFS[a.type].breaker - DEFS[b.type].breaker);
      if (!cands.length) break;
      let fixed = null, best = -1, bestNet = null, bestSh = null;
      for (const c of cands) {
        if (fixed && DEFS[c.type].breaker !== DEFS[fixed.type].breaker) break;
        c.state.tripped = true;
        const n2 = build(circ, ctx), s2 = shorts(n2);
        c.state.tripped = false;
        if (s2.size < sh.size) { const live = energized(n2); if (live > best) { best = live; fixed = c; bestNet = n2; bestSh = s2; } }
      }
      if (fixed) { fixed.state.tripped = true; net = bestNet; sh = bestSh; }
      if (fixed) alerts.push({ msg: `${fixed.props.label} TRIPPED — ${reason}`, kind: 'danger' });
      else {
        // no single device clears it: trip them together only if that clears it, else the fault is before all protection
        cands.forEach(c => { c.state.tripped = true; });
        const n2 = build(circ, ctx), s2 = shorts(n2);
        if (s2.size < sh.size) { alerts.push({ msg: `${cands.map(c => c.props.label).join(', ')} TRIPPED — ${reason}`, kind: 'danger' }); net = n2; sh = s2; }
        else { cands.forEach(c => { c.state.tripped = false; }); alerts.push({ msg: `${reason} before any breaker or fuse: nothing can clear it — remove the fault`, kind: 'danger' }); break; }
      }
    }
    net.short = sh;
    for (const r of sh.keys()) net.pots.set(r, new Set());
    return net;
  }
  /* which devices does an overloaded motor draw its current through? A device feeds it when opening that device alone
     cuts a motor terminal off from every source of its phase (or DC pole): a bridge between the terminal and the
     sources in the graph of wire nets joined by closed device contacts. One pass per potential, not a rebuild per device. */
  function feeders(circ, ctx, net, overM, api) {
    const n = net.idx.size, par = new Int32Array(n);
    for (let i = 0; i < n; i++) par[i] = i;
    const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (const w of circ.wires) { const a = net.idx.get(w.a), b = net.idx.get(w.b); if (a != null && b != null) par[find(a)] = find(b); }
    const node = k => { const i = net.idx.get(k); return i == null ? -1 : find(i); };
    const edges = [], seen = new Set(), src = new Map();
    for (const c of circ.comps) {
      const d = DEFS[c.type]; if (!d) continue;
      if (d.conduct) for (const [a, b] of d.conduct(c, ctx) || []) {
        const u = node(c.id + ':' + a), v = node(c.id + ':' + b), key = c.id + '|' + Math.min(u, v) + '|' + Math.max(u, v);
        if (u >= 0 && v >= 0 && u !== v && !seen.has(key)) { seen.add(key); edges.push({ id: c.id, u, v }); }
      }
      if (d.sources) { const sm = d.sources(c, ctx); if (sm) for (const k in sm) { const u = node(c.id + ':' + k); if (u >= 0) { if (!src.has(sm[k])) src.set(sm[k], new Set()); src.get(sm[k]).add(u); } } }
    }
    const out = new Set(), S = n;   // S: one extra node joined to every source of the potential
    const done = new Set();
    for (const m of overM) for (const t of m.t) {
      let p = null; for (const q of api.pots(m.c, t)) if (livePot(q)) { p = q; break; }
      const T = node(m.c.id + ':' + t);
      if (!p || T < 0 || !src.has(p) || done.has(p + '|' + T)) continue;
      done.add(p + '|' + T);
      // adjacency with the extra source node
      const adj = new Map(), add = (u, v, e) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push([v, e]); };
      edges.forEach((e, i) => { add(e.u, e.v, i); add(e.v, e.u, i); });
      let k = edges.length;
      for (const u of src.get(p)) { add(S, u, k); add(u, S, k); k++; }
      // iterative DFS from S: discovery time, low link, tree parent edge
      const tin = new Map(), low = new Map(), pe = new Map(), stack = [[S, -1, 0]];
      let time = 0; tin.set(S, 0); low.set(S, 0);
      while (stack.length) {
        const top = stack[stack.length - 1], [u, from] = top, list = adj.get(u) || [];
        if (top[2] < list.length) {
          const [v, e] = list[top[2]++];
          if (e === from) continue;
          if (tin.has(v)) { low.set(u, Math.min(low.get(u), tin.get(v))); continue; }
          tin.set(v, ++time); low.set(v, time); pe.set(v, [u, e]); stack.push([v, e, 0]);
        } else {
          stack.pop();
          const q = pe.get(u); if (q) low.set(q[0], Math.min(low.get(q[0]), low.get(u)));
        }
      }
      // the bridges on the tree path from the motor terminal up to the sources
      for (let v = T; pe.has(v); v = pe.get(v)[0]) { const [u, e] = pe.get(v); if (low.get(v) > tin.get(u) && e < edges.length) out.add(edges[e].id); }
    }
    return out;
  }
  function makeApi(net, alerts, circ, ctx) {
    function voltR(ra, rb) {
      if (ra < 0 || rb < 0 || ra === rb) return null;
      const A = net.pots.get(ra), B = net.pots.get(rb);
      if (!A || !B) return null;
      let best = null;
      for (const a of A) for (const b of B) {
        let r = null;
        const pa = isPh(a), pb = isPh(b);
        if (pa && pb && a !== b) r = V400;
        else if ((pa && (b === 'N' || b === 'PE')) || (pb && (a === 'N' || a === 'PE'))) r = V230;
        else if (a.startsWith('DC+') && b === 'DC-' + a.slice(3)) r = V24;
        else if (a.startsWith('DC-') && b === 'DC+' + a.slice(3)) r = V24R;
        if (r && (!best || r.v > best.v)) best = r;
      }
      return best;
    }
    const rootK = k => { const i = net.idx.get(k); return i == null ? -1 : net.find(i); };
    return {
      net, overM: [],
      rootK,
      root: (c, t) => rootK(c.id + ':' + t),
      potsR: r => net.pots.get(r) || EMPTY,
      pots(c, t) { return this.potsR(this.root(c, t)); },
      v(c, a, b) { return voltR(this.root(c, a), this.root(c, b)); },
      vK(ka, kb) { return voltR(rootK(ka), rootK(kb)); },
      sameNet(ka, kb) { const a = rootK(ka); return a >= 0 && a === rootK(kb); },
      phase(c, t) { for (const p of this.pots(c, t)) if (isPh(p)) return p; return null; },
      /* does an overloaded motor draw its current through device c? Open c and see whether the motor loses a phase. */
      feedsOverload(c) {
        if (!this.overM.length) return false;
        if (!this._feed) this._feed = feeders(circ, ctx, net, this.overM, this);
        return this._feed.has(c.id);
      },
      alert(msg, kind) { alerts.push({ msg, kind }); },
    };
  }

  /* earth leakage, as an RCD sees it: the current of a working load must come back through the RCD it was fed through.
     It does not when the load returns to PE (phase-to-earth load), to an N that bypasses the RCD (borrowed neutral)
     or to an N that is bonded to PE after the RCD. That RCD trips; a phase-to-PE load with no RCD is reported. */
  const working = st => !!(st.on || st.pulled || st.pw || st.ok || st.open || st.sol || st.fill || st.drain || st.drive === 'run');
  function earthLeak(circ, ctx, api) {
    const rcds = circ.comps.filter(r => DEFS[r.type].earthOnly && DEFS[r.type].closed(r)), out = [];
    const potsIn = (n, k) => { const i = n.idx.get(k); return i == null ? null : n.pots.get(n.find(i)); };
    let trial = null;   // nets with each RCD tripped, built only when a load needs them
    for (const c of circ.comps) {
      const d = DEFS[c.type];
      if (!d || d.breaker || d.junction || !d.evaluate || !working(c.state)) continue;
      const live = d.terms.find(t => [...api.pots(c, t.id)].some(isPh));
      // return terminals: on N or PE and no phase (a 3-phase load returns on the other phases: balanced)
      const ret = d.terms.filter(t => t.id !== 'PE' && t !== live && (api.pots(c, t.id).has('N') || api.pots(c, t.id).has('PE')) && ![...api.pots(c, t.id)].some(isPh));
      if (!live || !ret.length) continue;
      if (!trial) trial = rcds.map(r => { r.state.tripped = true; const n = build(circ, ctx); r.state.tripped = false; return n; });
      let rcd = null;
      rcds.forEach((r, i) => {
        const n = trial[i], st = potsIn(n, c.id + ':' + live.id);
        if (st && [...st].some(isPh)) return;   // not fed through this RCD
        // fed through it: the return must lose its N/PE too when the RCD opens, else the current goes around it
        if (ret.some(t => { const rs = potsIn(n, c.id + ':' + t.id); return rs && (rs.has('N') || rs.has('PE')); })) rcd = rcd || r;
      });
      if (rcd) out.push({ c, rcd });
      else if (ret.some(t => api.pots(c, t.id).has('PE') && !api.pots(c, t.id).has('N'))) out.push({ c, rcd: null });
    }
    return out;
  }
  function solve(circ, dt, ctx) {
    const alerts = [];
    let api = null;
    for (let round = 0; round < 3; round++) {
      for (let it = 0; it < 16; it++) {
        const net = solveNet(circ, ctx, alerts);
        api = makeApi(net, alerts, circ, ctx);
        let ch = false;
        for (const c of circ.comps) { const d = DEFS[c.type]; if (d && d.evaluate && d.evaluate(c, api, ctx)) ch = true; }
        if (!ch) break;
        if (it === 15) alerts.push({ msg: 'The circuit does not settle: a relay or contactor keeps switching. Is a coil fed through its own N.C. contact?', kind: 'warn' });
      }
      const leaks = earthLeak(circ, ctx, api);
      leaks.filter(l => !l.rcd).forEach(l => alerts.push({ msg: `${l.c.props.label} is fed between a phase and PE: its current leaks to earth and no RCD protects it`, kind: 'warn' }));
      const trips = leaks.filter(l => l.rcd && !l.rcd.state.tripped);
      if (!trips.length) break;
      trips.forEach(l => { if (l.rcd.state.tripped) return; l.rcd.state.tripped = true; alerts.push({ msg: `${l.rcd.props.label} TRIPPED — earth leakage through ${l.c.props.label}`, kind: 'danger' }); });
    }
    // signals published by devices (tank levels, analog values, VFD speeds) of devices that are gone or renamed are dropped
    if (ctx) {
      const ids = new Set(circ.comps.map(c => c.id)), tanks = new Set(circ.comps.filter(c => c.type === 'tank').map(c => c.props.label));
      const prune = (o, ok) => { if (o) for (const k in o) if (!ok(k)) delete o[k]; };
      prune(ctx.tanks, k => tanks.has(k));
      [ctx.anaSrc, ctx.anaOut, ctx.vfdOut].forEach(o => prune(o, k => ids.has(k.split(':')[0])));
    }
    for (const c of circ.comps) { const d = DEFS[c.type]; if (d && d.tick) d.tick(c, api, dt, ctx); }
    return { api, alerts };
  }

  /* ---------- Instances ---------- */
  function create(type, x, y, circ) {
    const d = DEFS[type];
    circ.seq = (circ.seq || 0) + 1;
    const id = 'c' + circ.seq;
    const used = new Set(circ.comps.map(c => c.props.label));
    let n = 1; while (used.has(d.prefix + n)) n++;
    const props = { label: d.prefix + n, size: 1, ...JSON.parse(JSON.stringify(d.props)) };
    if (d.slot) {
      // a new I/O card takes the first free slot
      const taken = new Set(circ.comps.filter(c => DEFS[c.type] && DEFS[c.type].slot).map(c => c.props.slot));
      props.slot = SLOTS.find(s => !taken.has(s)) || props.slot;
    }
    return { id, type, x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10, props, state: d.init ? d.init() : {} };
  }
  const okNum = v => typeof v === 'number' && isFinite(v);
  function cleanVal(v, def) {
    if (def === undefined) return okNum(v) || typeof v === 'boolean' ? v : undefined;
    if (Array.isArray(def)) {
      if (!Array.isArray(v)) return def;
      // arrays hold small records (conveyor boxes): keep their numeric fields only
      return v.filter(x => x && typeof x === 'object').map(x => Object.fromEntries(Object.entries(x).filter(([, y]) => okNum(y)))).filter(x => Object.keys(x).length);
    }
    if (typeof def === 'number') { const n = Number(v); return (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && isFinite(n) ? n : def; }
    if (typeof def === 'string') return typeof v === 'string' || okNum(v) ? String(v) : def;
    return typeof v === typeof def ? v : def;
  }
  function normalize(c) {
    const d = DEFS[c.type];
    const dp = { label: d.prefix, size: 1, ...JSON.parse(JSON.stringify(d.props)) }, sp = c.props && typeof c.props === 'object' ? c.props : {};
    c.props = {};
    for (const k in dp) c.props[k] = cleanVal(k in sp ? sp[k] : dp[k], dp[k]);
    for (const f of d.pdefs || []) {
      if (f.opts && !f.opts.includes(c.props[f.k])) c.props[f.k] = dp[f.k];
      if (f.type === 'number') c.props[f.k] = Number(c.props[f.k]) || 0;
    }
    c.props.label = String(c.props.label).slice(0, 40);
    c.props.size = Math.max(0.4, Math.min(3, Number(c.props.size) || 1));
    const ds = d.init ? d.init() : {}, ss = c.state && typeof c.state === 'object' ? c.state : {};
    c.state = { ...ds };
    for (const k in ss) { const v = cleanVal(ss[k], ds[k]); if (v !== undefined) c.state[k] = v; }
    for (const k of d.transient || []) c.state[k] = ds[k];
    c.x = Number(c.x) || 0; c.y = Number(c.y) || 0;
    return c;
  }
  function retype(c, type, circ) {
    const a = DEFS[c.type].terms, b = DEFS[type].terms;
    const map = Object.fromEntries(a.map((t, i) => [t.id, b[i] ? b[i].id : null]));
    for (const w of circ.wires) for (const k of ['a', 'b']) {
      const [cid, tid] = w[k].split(':');
      if (cid === c.id && map[tid]) w[k] = cid + ':' + map[tid];
    }
    c.type = type;
    c.state = DEFS[type].init ? DEFS[type].init() : {};
  }
  function part(c, p, ev, ctx) { const d = DEFS[c.type]; return d && d.onPart ? !!d.onPart(c, p, ev, ctx) : false; }
  function drawTerms(d) {
    return d.terms.map(t => {
      const ly = t.y === 0 ? 13 : t.y - 7;
      // screw terminal: a round head with a cross slot
      return `<g class="term" data-term="${esc(t.id)}"><circle class="thit" cx="${t.x}" cy="${t.y}" r="9"/><circle cx="${t.x}" cy="${t.y}" r="5.2"/><line x1="${t.x - 3}" y1="${t.y}" x2="${t.x + 3}" y2="${t.y}"/><line x1="${t.x}" y1="${t.y - 3}" x2="${t.x}" y2="${t.y + 3}"/><text class="tlbl" x="${t.x}" y="${ly}">${esc(t.l)}</text></g>`;
    }).join('');
  }
  function sig(c, ctx) {
    let s = c.type + JSON.stringify(c.state) + JSON.stringify(c.props);
    if (c.type === 'plc' && ctx) s += `|${ctx.plcId}|${ctx.plcInRaw}|${ctx.plcOut}|${ctx.mode}|${ctx.forces}|${ctx.fmt && ctx.fmt('I:0/0')}`;
    else if (ctx && DEFS[c.type] && DEFS[c.type].ctxSig) s += DEFS[c.type].ctxSig(c, ctx);
    return s;
  }
  function draw(c, ctx) { const d = DEFS[c.type]; return d ? d.draw(c, ctx) : ''; }
  /* drawn size before scaling: a DIN rail's width follows its length */
  function dims(c) { const d = DEFS[c.type], x = d.dims ? d.dims(c) : {}; return { w: x.w || d.w, h: x.h || d.h }; }
  function status(c, ctx) { const d = DEFS[c.type]; return d && d.status ? d.status(c, ctx) : ''; }
  function repair(c) {
    const d = DEFS[c.type];
    if ('burnt' in c.state) c.state.burnt = false;
    if ('badIn' in c.state) c.state.badIn = 0;
    if ('tripped' in c.state && !d.breaker) c.state.tripped = false;
  }

  /* Philippine practice: L1 red, L2 yellow, L3 blue, neutral white, earth green; 24 V DC: + red, 0 V blue */
  const POT_COLORS = { L1: '#b3261e', L2: '#f2c230', L3: '#2b6fe0', N: '#f4f4f0', PE: '#58a83a', 'DC+': '#d33a2c', 'DC-': '#1f4fa8' };
  function potClass(set) {
    for (const p of ['L1', 'L2', 'L3', 'N']) if (set.has(p)) return p;
    for (const p of set) { if (p.startsWith('DC+')) return 'DC+'; }
    for (const p of set) { if (p.startsWith('DC-')) return 'DC-'; }
    if (set.has('PE')) return 'PE';
    return '';
  }
  function potText(set) {
    const out = [];
    for (const p of set) out.push(p.startsWith('DC+') ? '+24 V DC' : p.startsWith('DC-') ? '0 V DC' : p);
    return out.join(', ');
  }

  const CARDS = () => ORDER.filter(t => DEFS[t].slot);
  const ioFile = t => (DEFS[t].analog || (t.startsWith('mdi') ? 'I' : 'O'));
  /* keep only valid slots and card types of a saved I/O configuration */
  function cleanIo(io) {
    const slots = {}, src = io && typeof io === 'object' && io.slots && typeof io.slots === 'object' ? io.slots : {};
    for (const s of SLOTS) if (typeof src[s] === 'string' && DEFS[src[s]] && DEFS[src[s]].slot) slots[s] = src[s];
    return { slots };
  }
  /* the controller and its rack: which CPU runs, which card owns each slot (the first one found),
     the I/O configuration (conf) and every slot where the installed card does not match it (bad) */
  function rack(circ, io) {
    const ctl = circ.comps.find(c => DEFS[c.type] && DEFS[c.type].unique === 'cpu');
    const slots = {}, conf = (io && io.slots) || {}, bad = [];
    for (const c of circ.comps) if (DEFS[c.type] && DEFS[c.type].slot && !(c.props.slot in slots)) slots[c.props.slot] = c.id;
    const cpu = ctl && ctl.type === 'mcpu' ? ctl.id : null;
    if (cpu) for (const s of SLOTS) {
      const c = slots[s] && circ.comps.find(x => x.id === slots[s]), have = c ? c.type : '', want = conf[s] || '';
      if (have === want) continue;
      bad.push({ slot: s, want, have, msg: !want ? `slot ${s}: ${DEFS[have].name} installed but not configured` : !have ? `slot ${s}: ${DEFS[want].name} configured but missing` : `slot ${s}: ${DEFS[want].name} configured, ${DEFS[have].name} installed` });
    }
    return { ctl, cpu, slots, conf, bad, pw: circ.comps.some(c => c.type === 'mpsu' && c.state.pw) };
  }
  /* I/O words the data table shows: the compact PLC's I:0/O:0, or the configured rack slots */
  function ioMap(circ, io) {
    const r = rack(circ, io);
    if (!r.cpu) return [{ file: 'I', word: 0, n: 12 }, { file: 'O', word: 0, n: 8 }];
    return SLOTS.filter(s => r.conf[s]).map(s => {
      const c = r.slots[s] && circ.comps.find(x => x.id === r.slots[s]);
      const d = DEFS[r.conf[s]];
      return { file: ioFile(r.conf[s]), word: Number(s), n: d.analog ? d.chans : 8, analog: !!d.analog, label: c && c.type === r.conf[s] ? c.props.label : '(missing)', name: d.name };
    });
  }
  /* Address styles (display only; programs are always stored file-based):
     file 'I:1/0', bit/byte 'I0.0' / 'Q0.0', basic 'I1' / 'Q1'. Bit/byte and basic number the I/O points
     of the hardware in order (compact PLC, or the configured rack slots), inputs and outputs separately. */
  const STYLES = { file: 'File-based (I:1/0)', bitbyte: 'Bit/byte (I0.0, Q0.0)', basic: 'Basic (I1, Q1)' };
  function addrBook(circ, io, style) {
    const idx = { I: [], O: [] };
    for (const m of ioMap(circ, io)) if (!m.analog) for (let b = 0; b < m.n; b++) idx[m.file].push(`${m.file}:${m.word}/${b}`);
    const L = f => (f === 'I' ? 'I' : 'Q');
    const name = (f, i) => style === 'basic' ? `${L(f)}${i + 1}` : `${L(f)}${i >> 3}.${i & 7}`;
    const fwd = new Map();
    for (const f of ['I', 'O']) idx[f].forEach((a, i) => fwd.set(a, name(f, i)));
    return {
      style,
      // file-based address → the address in this style (unchanged when it is not a hardware I/O point)
      fmt: a => (style === 'file' ? a : fwd.get(a) || a),
      // address typed in any style → file-based (unchanged when it is not a bit/byte or basic I/O address)
      toFile(s) {
        const t = String(s).trim().toUpperCase().replace(/^%/, '');
        let m;
        if ((m = t.match(/^([IQ])X?(\d+)\.([0-7])$/))) return idx[m[1] === 'I' ? 'I' : 'O'][Number(m[2]) * 8 + Number(m[3])] || t;
        if ((m = t.match(/^([IQ])(\d+)$/)) && Number(m[2]) > 0) return idx[m[1] === 'I' ? 'I' : 'O'][Number(m[2]) - 1] || t;
        return t;
      },
      points: idx,
    };
  }
  /* is an I/O address real hardware? null when it is, else the reason (used by Verify) */
  function ioCheck(a, circ, io) {
    const r = rack(circ, io);
    if (!r.cpu) {
      const n = a.file === 'I' ? 12 : 8;
      if (a.word !== 0 || (a.kind === 'bit' && a.bit >= n)) return { warn: true, msg: `${a.norm} is not on the compact PLC (${a.file}:0/0–${n - 1})` };
      return null;
    }
    if (a.ana) {
      const s = (a.word - 8) >> 2, ch = (a.word - 8) & 3, t = r.conf[s];
      if (!t || !DEFS[t].analog || ioFile(t) !== a.file) return { msg: `${a.norm}: slot ${s} is not configured as an analog ${a.file === 'I' ? 'input' : 'output'} card (I/O Configuration)` };
      if (ch >= DEFS[t].chans) return { msg: `${a.norm}: the card in slot ${s} has ${DEFS[t].chans} channels` };
      return null;
    }
    if (a.word === 0) return { msg: `${a.norm}: slot 0 is the CPU, it has no I/O` };
    const t = r.conf[a.word];
    if (t && DEFS[t].analog) return { msg: `${a.norm}: slot ${a.word} is an analog card — use ${a.file}:${a.word}.0 … words` };
    if (!t || ioFile(t) !== a.file) return { msg: `${a.norm}: slot ${a.word} is not configured as ${a.file === 'I' ? 'an input' : 'an output'} card (I/O Configuration)` };
    if (a.kind === 'bit' && a.bit >= 8) return { msg: `${a.norm}: the card in slot ${a.word} has 8 points (${a.file}:${a.word}/0–7)` };
    return null;
  }
  window.Circuit = { DEFS, ORDER, RATINGS, COLORS, POT_COLORS, solve, create, normalize, retype, part, draw, dims, drawTerms, sig, status, repair, potClass, potText, rack, ioMap, ioCheck, cleanIo, CARDS, SLOTS, STYLES, addrBook };
})();
