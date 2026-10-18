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
        ['L1', 'L2', 'L3'].map((p, i) => led(20 + i * 20, 30, on, ['#a0522d', '#cfcfcf', '#9aa0a6'][i]) + T(20 + i * 20, 43, p, 'dt light sm')).join('') +
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
    draw(c) {
      return R(0, 0, 110, 90, 'url(#gMetal)', 4) + band(0, 110) + band(72, 110) +
        T(55, 36, '24V DC', 'dt big') + T(55, 50, '5 A', 'dt sm') + led(92, 34, c.state.ok, '#3ddc63') + T(92, 46, 'DC OK', 'dt xs') +
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
  function mcbDraw(c, w, poles) {
    const s = c.state, hy = s.tripped ? 40 : s.on ? 30 : 52;
    return R(0, 0, w, 100, 'url(#gPlastic)', 3) + band(0, w, 16, '#cfcac0') + band(84, w, 16, '#cfcac0') +
      T(w / 2, 26, poles + 'P C16', 'dt xs') +
      R(w / 2 - 11, 32, 22, 36, '#3b3a36', 2) +
      `<g class="part" data-part="h"><rect x="${w / 2 - 9}" y="${hy}" width="18" height="12" rx="2" fill="${s.tripped ? '#f39c1e' : '#2a2a2a'}" stroke="#111"/></g>` +
      R(w / 2 - 6, 72, 12, 8, s.on && !s.tripped ? '#d33a2c' : '#2fa84f', 1, '#333');
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
      const hot = ['2', '4', '6'].some(t => api.over.has(api.root(c, t)));
      const s = c.state;
      s.heat = hot ? s.heat + dt : Math.max(0, s.heat - dt * 0.4);
      if (!s.tripped && s.heat >= (Number(c.props.trip) || 4)) { s.tripped = true; api.alert(`${c.props.label}: overload relay TRIPPED (motor overcurrent)`, 'warn'); }
      s.heatPct = Math.round(Math.min(1, s.heat / (Number(c.props.trip) || 4)) * 100);
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
    terms: [{ id: 'A1', x: 10, y: 0 }, { id: '1', x: 30, y: 0 }, { id: '3', x: 50, y: 0 }, { id: '5', x: 70, y: 0 }, { id: '13', x: 92, y: 0 }, { id: '21', x: 110, y: 0 },
      { id: 'A2', x: 10, y: 140 }, { id: '2', x: 30, y: 140 }, { id: '4', x: 50, y: 140 }, { id: '6', x: 70, y: 140 }, { id: '14', x: 92, y: 140 }, { id: '22', x: 110, y: 140 }],
    init: () => ({ pulled: false, burnt: false }),
    conduct: c => c.state.pulled ? [['1', '2'], ['3', '4'], ['5', '6'], ['13', '14']] : [['21', '22']],
    evaluate(c, api) { return set(c, 'pulled', coilOn(c, api, 'A1', 'A2')); },
    draw(c) {
      const p = c.state.pulled;
      return R(0, 0, 120, 140, 'url(#gPlastic)', 5) + band(0, 120, 20, '#d4cfc4') + band(120, 120, 20, '#d4cfc4') +
        R(36, 44, 48, 40, '#2b2a27', 4) + R(40, p ? 60 : 48, 40, 20, p ? '#2fa84f' : '#ece9e1', 2, '#111') +
        T(60, p ? 74 : 62, p ? 'I' : 'O', p ? 'dt light big' : 'dt big') +
        T(60, 100, c.props.coil, 'dt xs') + T(60, 112, '3P + 1NO 1NC', 'dt xs') +
        (c.state.burnt ? burnt(120, 140) : '');
    },
    status: c => c.state.burnt ? 'Coil burnt' : c.state.pulled ? 'Energized (pulled in)' : 'De-energized',
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
  def('timer', {
    name: 'On-Delay Timer Relay', cat: 'Control', view: 'cabinet', prefix: 'KT', w: 90, h: 110,
    props: { coil: '230VAC', t: 5 },
    pdefs: [{ k: 'coil', n: 'Coil voltage', opts: RATINGS }, { k: 't', n: 'Delay (s)', type: 'number' }],
    info: 'Coil A1-A2. After the delay: 15-18 closes (NO), 15-16 opens (NC). Resets instantly when coil drops.',
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
    draw(c) {
      const s = c.state, t = Number(c.props.t) || 0, fr = t ? s.el / t : 1;
      const a = -220 + 260 * fr, rad = a * Math.PI / 180;
      return R(0, 0, 90, 110, 'url(#gPlastic)', 5) + band(0, 90, 18, '#d4cfc4') + band(92, 90, 18, '#d4cfc4') +
        `<circle cx="45" cy="50" r="18" fill="#f4f1ea" stroke="#555"/><path d="M45 50 L${45 + 14 * Math.cos(rad)} ${50 + 14 * Math.sin(rad)}" stroke="#d33a2c" stroke-width="2.5" stroke-linecap="round"/>` +
        T(45, 80, `${(s.elD || 0).toFixed(1)} / ${t}s`, 'dt xs') + led(16, 30, s.pw, '#3ddc63') + T(16, 41, 'U', 'dt xs') + led(74, 30, s.done, '#f2c230') + T(74, 41, 'R', 'dt xs') +
        (s.burnt ? burnt(90, 110) : '');
    },
    status: c => c.state.done ? 'Timed out — 15-18 closed' : c.state.pw ? `Timing ${(c.state.elD || 0).toFixed(1)} s` : 'Idle',
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
  /* PLC: AB MicroLogix-like. 12 DC inputs, 8 relay outputs in two groups. */
  const PLC_IN = 12, PLC_OUT = 8;
  def('plc', {
    name: 'PLC (MicroLogix-style)', cat: 'Control', view: 'cabinet', prefix: 'PLC', w: 440, h: 200, unique: true,
    info: 'Power L1/N 230 VAC. Built-in 24 VDC sensor supply (+24 / COM). Inputs I:0/0–I:0/11 are 24 VDC, referenced to input COM. Relay outputs: O:0/0–3 switch from VAC-VDC0, O:0/4–7 from VAC-VDC1. Click the key switch to change PROG/RUN.',
    terms: [{ id: 'L1', x: 20, y: 0 }, { id: 'N', x: 40, y: 0, l: 'L2/N' }, { id: 'PE', x: 62, y: 0 }, { id: 'V24', x: 90, y: 0, l: '+24' }, { id: 'C24', x: 112, y: 0, l: 'COM' },
      { id: 'COM', x: 150, y: 0, l: 'COM' }, ...Array.from({ length: PLC_IN }, (_, i) => ({ id: 'I' + i, x: 174 + i * 22, y: 0, l: String(i) })),
      { id: 'VAC0', x: 20, y: 200, l: 'VAC0' }, ...[0, 1, 2, 3].map(i => ({ id: 'O' + i, x: 50 + i * 22, y: 200, l: String(i) })),
      { id: 'VAC1', x: 160, y: 200, l: 'VAC1' }, ...[4, 5, 6, 7].map(i => ({ id: 'O' + i, x: 190 + (i - 4) * 22, y: 200, l: String(i) }))],
    init: () => ({ pw: false, burnt: false }),
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
        if (c.state.pw) for (let i = 0; i < PLC_IN; i++) { if (api.v(c, 'I' + i, 'COM')) w |= 1 << i; }
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
      s += T(48, 36, 'AC POWER', 'dt light xs') + T(101, 36, '24VDC OUT', 'dt light xs') + T(300, 36, 'INPUTS  I:0/0 – I:0/11  (24 VDC)', 'dt light xs');
      s += T(90, 170, 'RELAY OUT  O:0/0–3', 'dt light xs') + T(225, 170, 'RELAY OUT  O:0/4–7', 'dt light xs');
      s += T(22, 66, 'PLC-1100', 'dt light brand', 'start') + T(22, 80, 'AB-style controller', 'dt light xs', 'start');
      const st = [['POWER', pw, '#3ddc63'], ['RUN', run, '#3ddc63'], ['FAULT', !!c.state.burnt, '#ff4b3a'], ['FORCE', me && pw && ctx.forces, '#f2c230']];
      st.forEach(([n, on, col], i) => { s += led(28, 98 + i * 15, on, col, 3.6) + T(38, 101 + i * 15, n, 'dt light xs', 'start'); });
      s += R(150, 52, 280, 92, '#24231f', 4, '#111');
      s += T(160, 66, 'IN', 'dt light xs', 'start');
      for (let i = 0; i < PLC_IN; i++) s += led(186 + i * 20, 80, (inW >> i) & 1, '#f2c230', 4) + T(186 + i * 20, 94, String(i), 'dt light xs');
      s += T(160, 112, 'OUT', 'dt light xs', 'start');
      for (let i = 0; i < PLC_OUT; i++) s += led(186 + i * 20, 124, (outW >> i) & 1, '#ff8a3a', 4) + T(186 + i * 20, 138, String(i), 'dt light xs');
      s += `<g class="part" data-part="mode"><rect x="100" y="94" width="40" height="52" rx="4" fill="#33312c" stroke="#111"/><circle cx="120" cy="112" r="10" fill="#c9c5bb" stroke="#111"/><rect x="118" y="103" width="4" height="18" rx="1" fill="#333" transform="rotate(${run ? 40 : -40} 120 112)"/>${T(120, 138, me ? ctx.mode : '—', 'dt light xs')}</g>`;
      if (c.state.burnt) s += burnt(440, 200);
      return s;
    },
    status: (c, ctx) => !c.state.pw ? 'No power on L1/N' : (ctx && ctx.plcId === c.id ? ctx.mode + ' mode' : 'Second PLC (inactive)'),
  });

  /* ---------- PILOT DEVICES ---------- */
  function pb(type, name, contact, color, text) {
    const ids = contact === 'NO' ? ['13', '14'] : ['11', '12'];
    def(type, {
      name, cat: 'Pilot Devices', view: 'panel', prefix: 'S', w: 60, h: 90,
      props: { color, text },
      pdefs: [{ k: 'color', n: 'Color', opts: Object.keys(COLORS) }, { k: 'text', n: 'Legend' }],
      info: contact === 'NO' ? 'Momentary push button, normally open contact 13-14 (closes while pressed).' : 'Momentary push button, normally closed contact 11-12 (opens while pressed).',
      terms: [{ id: ids[0], x: 15, y: 90 }, { id: ids[1], x: 45, y: 90 }],
      init: () => ({ pressed: false }),
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
  def('sel2', {
    name: 'Selector Switch 2-Pos', cat: 'Pilot Devices', view: 'panel', prefix: 'S', w: 60, h: 90,
    props: { text: 'OFF  ON' },
    pdefs: [{ k: 'text', n: 'Legend' }],
    info: 'Maintained 2-position selector. Contact 13-14 closes in position I (right).',
    terms: [{ id: '13', x: 15, y: 90 }, { id: '14', x: 45, y: 90 }],
    init: () => ({ pos: 0 }),
    conduct: c => c.state.pos ? [['13', '14']] : null,
    onPart(c, p, ev) { if (p === 'knob' && ev === 'down') { c.state.pos = c.state.pos ? 0 : 1; return true; } },
    draw(c) {
      const a = c.state.pos ? 45 : -45;
      return R(0, 0, 60, 90, '#2b2a28', 6, '#111') + R(6, 4, 48, 13, '#f2efe6', 2, '#999') + T(30, 13.5, c.props.text || '', 'dt xs') +
        `<g class="part" data-part="knob"><circle cx="30" cy="42" r="20" fill="url(#gChrome)" stroke="#222"/><circle cx="30" cy="42" r="15" fill="#222"/><rect x="26" y="26" width="8" height="32" rx="3" fill="#e9e5dc" transform="rotate(${a} 30 42)"/></g>` +
        R(12, 66, 36, 12, '#d7d3ca', 2, '#777') + T(30, 75, c.state.pos ? 'I' : '0', 'dt xs');
    },
    status: c => c.state.pos ? 'Position I (13-14 closed)' : 'Position 0',
  });
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
  def('prox', {
    name: 'Proximity Sensor PNP', cat: 'Sensors', view: 'plant', prefix: 'B', w: 60, h: 90,
    info: '3-wire PNP sensor: BN brown = +24 V, BU blue = 0 V, BK black = output (switches +24 V to the PLC input when a target is present). Click to place/remove the target.',
    terms: [{ id: 'BN', x: 12, y: 90 }, { id: 'BK', x: 30, y: 90 }, { id: 'BU', x: 48, y: 90 }],
    init: () => ({ tgt: false, act: false, pw: false }),
    conduct: c => c.state.act ? [['BN', 'BK']] : null,
    evaluate(c, api) {
      const v = api.v(c, 'BN', 'BU');
      const pw = !!(v && v.kind === 'DC' && !v.rev);
      return set(c, 'pw', pw) | set(c, 'act', pw && c.state.tgt);
    },
    onPart(c, p, ev) { if (p === 'tgt' && ev === 'down') { c.state.tgt = !c.state.tgt; return true; } },
    draw(c) {
      const s = c.state;
      return `<g class="part" data-part="tgt"><rect x="4" y="0" width="52" height="10" rx="2" fill="${s.tgt ? '#8b8f95' : 'transparent'}" stroke="${s.tgt ? '#444' : '#999'}" stroke-dasharray="${s.tgt ? '' : '3 2'}"/><rect x="0" y="0" width="60" height="62" fill="transparent"/></g>` +
        R(20, 14, 20, 46, 'url(#gMetal)', 2) + [20, 26, 32, 38, 44].map(y => `<line x1="20" y1="${y}" x2="40" y2="${y}" stroke="#777" stroke-width=".7"/>`).join('') +
        R(21, 13, 18, 4, '#f39c1e', 1, 'none') + led(30, 54, s.act, '#f2c230', 3) +
        `<path d="M27 60 L27 70 L12 80 L12 90" stroke="#8b4513" stroke-width="2" fill="none"/><path d="M30 60 L30 90" stroke="#111" stroke-width="2" fill="none"/><path d="M33 60 L33 70 L48 80 L48 90" stroke="#1e6fd9" stroke-width="2" fill="none"/>`;
    },
    status: c => !c.state.pw ? 'Not powered (BN +24V, BU 0V)' : c.state.act ? 'Target detected' : 'No target',
  });

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
    if ((drive === 'run' && c.state.jam) || drive === 'single') [u, v, w].forEach(t => api.over.add(api.root(c, t)));
    return false;
  }
  function motorTick(c, dt) {
    const s = c.state;
    const target = s.drive === 'run' && !s.jam ? s.dir : 0;
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
    info: 'Terminals U1 V1 W1 + PE. Phase sequence L1-L2-L3 → forward; swap any two phases → reverse. Missing a phase → single-phasing (overcurrent). Click JAM to simulate a mechanical jam.',
    terms: [{ id: 'U1', x: 30, y: 0 }, { id: 'V1', x: 50, y: 0 }, { id: 'W1', x: 70, y: 0 }, { id: 'PE', x: 100, y: 0 }],
    init: () => ({ spd: 0, ang: 0, drive: 'off', dir: 0, jam: false }),
    evaluate: (c, api) => motorEval(c, api, 'U1', 'V1', 'W1'),
    tick: (c, api, dt) => motorTick(c, dt),
    onPart(c, p, ev) { if (p === 'jam' && ev === 'down') { c.state.jam = !c.state.jam; return true; } },
    draw(c) {
      const s = c.state, warn = (s.drive === 'run' && s.jam) || s.drive === 'single';
      return R(15, 0, 95, 20, '#5c6670', 3, '#333') +
        `<rect x="20" y="104" width="80" height="8" rx="2" fill="#3e464e"/>` +
        `<circle cx="60" cy="62" r="42" fill="url(#gMotor)" stroke="#2a3138" stroke-width="1.5"/>` +
        Array.from({ length: 16 }, (_, i) => { const a = i * 22.5 * Math.PI / 180; return `<line x1="${60 + 34 * Math.cos(a)}" y1="${62 + 34 * Math.sin(a)}" x2="${60 + 41 * Math.cos(a)}" y2="${62 + 41 * Math.sin(a)}" stroke="#2a3138" stroke-width="2"/>`; }).join('') +
        `<circle cx="60" cy="62" r="31" fill="#2a3138"/>` + fan(60, 62, 28, s.ang, s) +
        (warn ? `<circle cx="60" cy="62" r="44" fill="none" stroke="#ff4b3a" stroke-width="3" class="blink"/>` : '') +
        btn('jam', 92, 96, 28, 14, 'JAM', s.jam) +
        (s.drive === 'run' && !s.jam ? `<path d="M${s.dir > 0 ? '92 30 l8 -2 l-2 8' : '28 30 l-8 -2 l2 8'}" fill="none" stroke="#2fa84f" stroke-width="2"/>` : '');
    },
    status: c => motorStatus(c.state),
  });

  def('conveyor', {
    name: 'Conveyor (motor + 2 sensors)', cat: 'Equipment', view: 'plant', prefix: 'CV', w: 380, h: 170,
    info: 'Belt driven by a 3-phase motor (U1 V1 W1). Two PNP photo-eyes: B1 at the infeed, B2 at the discharge (BN +24 V, BU 0 V, BK output). Use +BOX / AUTO to feed boxes.',
    terms: [{ id: 'U1', x: 20, y: 0 }, { id: 'V1', x: 40, y: 0 }, { id: 'W1', x: 60, y: 0 }, { id: 'PE', x: 82, y: 0 },
      { id: 'S1BN', x: 140, y: 0, l: 'BN' }, { id: 'S1BK', x: 160, y: 0, l: 'BK' }, { id: 'S1BU', x: 180, y: 0, l: 'BU' },
      { id: 'S2BN', x: 290, y: 0, l: 'BN' }, { id: 'S2BK', x: 310, y: 0, l: 'BK' }, { id: 'S2BU', x: 330, y: 0, l: 'BU' }],
    init: () => ({ spd: 0, ang: 0, drive: 'off', dir: 0, jam: false, belt: 0, boxes: [], auto: false, ft: 0, count: 0, d1: false, d2: false, a1: false, a2: false }),
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
    evaluate(c, api) { return set(c, 'fill', coilOn(c, api, 'FV1', 'FV2')) | set(c, 'drain', coilOn(c, api, 'DV1', 'DV2')); },
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
  const V400 = { kind: 'AC', v: 400, label: '400VAC' }, V230 = { kind: 'AC', v: 230, label: '230VAC' };
  const V24 = { kind: 'DC', v: 24, label: '24VDC' }, V24R = { kind: 'DC', v: -24, label: '24VDC', rev: true };

  function build(circ, ctx) {
    const idx = new Map(); let n = 0;
    for (const c of circ.comps) { const d = DEFS[c.type]; if (!d) continue; for (const t of d.terms) idx.set(c.id + ':' + t.id, n++); }
    const par = new Int32Array(n);
    for (let i = 0; i < n; i++) par[i] = i;
    const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const uni = (a, b) => { if (a == null || b == null) return; a = find(a); b = find(b); if (a !== b) par[a] = b; };
    for (const w of circ.wires) uni(idx.get(w.a), idx.get(w.b));
    for (const c of circ.comps) {
      const d = DEFS[c.type];
      if (d && d.conduct) { const ps = d.conduct(c, ctx); if (ps) for (const [a, b] of ps) uni(idx.get(c.id + ':' + a), idx.get(c.id + ':' + b)); }
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
    if (dc && ac.length) return 'AC mains connected to a DC circuit';
    return null;
  }
  function shorts(net) {
    const res = new Map();
    for (const [r, s] of net.pots) if (s.size > 1) { const c = conflictOf(s); if (c) res.set(r, c); }
    return res;
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
        return d.breaker && d.closed(c) && d.terms.some(t => roots.has(net.find(net.idx.get(c.id + ':' + t.id))));
      }).sort((a, b) => DEFS[a.type].breaker - DEFS[b.type].breaker);
      if (!cands.length) break;
      let fixed = null;
      for (const c of cands) {
        c.state.tripped = true;
        const n2 = build(circ, ctx), s2 = shorts(n2);
        if (s2.size < sh.size) { fixed = c; net = n2; sh = s2; break; }
        c.state.tripped = false;
      }
      if (fixed) alerts.push({ msg: `${fixed.props.label} TRIPPED — ${reason}`, kind: 'danger' });
      else {
        cands.forEach(c => { c.state.tripped = true; });
        alerts.push({ msg: `${cands.map(c => c.props.label).join(', ')} TRIPPED — ${reason}`, kind: 'danger' });
        net = build(circ, ctx); sh = shorts(net);
      }
    }
    net.short = sh;
    for (const r of sh.keys()) net.pots.set(r, new Set());
    return net;
  }
  function makeApi(net, alerts) {
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
      net, over: new Set(),
      rootK,
      root: (c, t) => rootK(c.id + ':' + t),
      potsR: r => net.pots.get(r) || EMPTY,
      pots(c, t) { return this.potsR(this.root(c, t)); },
      v(c, a, b) { return voltR(this.root(c, a), this.root(c, b)); },
      vK(ka, kb) { return voltR(rootK(ka), rootK(kb)); },
      sameNet(ka, kb) { const a = rootK(ka); return a >= 0 && a === rootK(kb); },
      phase(c, t) { for (const p of this.pots(c, t)) if (isPh(p)) return p; return null; },
      alert(msg, kind) { alerts.push({ msg, kind }); },
    };
  }

  function solve(circ, dt, ctx) {
    const alerts = [];
    let api = null;
    for (let it = 0; it < 16; it++) {
      const net = solveNet(circ, ctx, alerts);
      api = makeApi(net, alerts);
      let ch = false;
      for (const c of circ.comps) { const d = DEFS[c.type]; if (d && d.evaluate && d.evaluate(c, api, ctx)) ch = true; }
      if (!ch) break;
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
    return { id, type, x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10, props: { label: d.prefix + n, ...JSON.parse(JSON.stringify(d.props)) }, state: d.init ? d.init() : {} };
  }
  function normalize(c) {
    const d = DEFS[c.type];
    c.props = { ...JSON.parse(JSON.stringify(d.props)), ...(c.props || {}) };
    c.state = { ...(d.init ? d.init() : {}), ...(c.state || {}) };
    return c;
  }
  function part(c, p, ev, ctx) { const d = DEFS[c.type]; return d && d.onPart ? !!d.onPart(c, p, ev, ctx) : false; }
  function drawTerms(d) {
    return d.terms.map(t => {
      const ly = t.y === 0 ? 13 : t.y - 7;
      return `<g class="term" data-term="${esc(t.id)}"><circle class="thit" cx="${t.x}" cy="${t.y}" r="9"/><circle cx="${t.x}" cy="${t.y}" r="4.6"/><line x1="${t.x - 2.6}" y1="${t.y - 2.6}" x2="${t.x + 2.6}" y2="${t.y + 2.6}"/><text class="tlbl" x="${t.x}" y="${ly}">${esc(t.l)}</text></g>`;
    }).join('');
  }
  function sig(c, ctx) {
    let s = JSON.stringify(c.state) + JSON.stringify(c.props);
    if (c.type === 'plc' && ctx) s += `|${ctx.plcId}|${ctx.plcInRaw}|${ctx.plcOut}|${ctx.mode}|${ctx.forces}`;
    return s;
  }
  function draw(c, ctx) { const d = DEFS[c.type]; return d ? d.draw(c, ctx) : ''; }
  function status(c, ctx) { const d = DEFS[c.type]; return d && d.status ? d.status(c, ctx) : ''; }
  function repair(c) {
    const d = DEFS[c.type];
    if ('burnt' in c.state) c.state.burnt = false;
    if ('tripped' in c.state && !d.breaker) c.state.tripped = false;
  }

  const POT_COLORS = { L1: '#8B4513', L2: '#1d1d1d', L3: '#8a8f96', N: '#2f6fd6', PE: '#58a83a', 'DC+': '#d33a2c', 'DC-': '#1f4fa8' };
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

  window.Circuit = { DEFS, ORDER, RATINGS, COLORS, POT_COLORS, solve, create, normalize, part, draw, drawTerms, sig, status, repair, potClass, potText };
})();
