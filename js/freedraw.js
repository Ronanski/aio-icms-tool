/* Free-draw Electrical Diagram: place IEC symbols anywhere on a grid, rotate them and wire terminal to terminal.
   Every symbol stands for a real device in the Wiring (found by its tag, or added there), and every drawn wire
   becomes a wire between the device terminals, so the electrical simulator runs the drawing. */
(function () {
  'use strict';
  const esc = UI.esc;
  const { DEFS } = Circuit;
  const FD = {};
  const TAG = /^[A-Za-z0-9_-]{1,20}$/;

  /* ---------- symbol library: device type, terminals (local, symbol upright) and how it is drawn ---------- */
  const two = (type, a, b, look, pre, extra) => ({ type, pre, look, terms: [{ id: a, x: 0, y: -30 }, { id: b, x: 0, y: 30 }], ...extra });
  const poles = (type, ins, outs, look, pre, extra) => ({
    type, pre, look, np: ins.length,
    terms: [...ins.map((t, i) => ({ id: t, x: (i - (ins.length - 1) / 2) * 20, y: -30, pole: i })), ...outs.map((t, i) => ({ id: t, x: (i - (outs.length - 1) / 2) * 20, y: 30, pole: i }))],
    ...extra,
  });
  const row = (ids, y, gap = 20) => ids.map((t, i) => ({ id: t, x: (i - (ids.length - 1) / 2) * gap, y, src: true }));
  const LIB = {
    Sources: {
      // supply terminals line up with the poles of the devices under them (L1 L2 L3 at -20 0 20)
      src3: { n: '3-phase supply', type: 'supply3', pre: 'Q', look: 'src', label: '3~ 400/230V', terms: ['L1', 'L2', 'L3', 'N', 'PE'].map((t, i) => ({ id: t, x: -20 + i * 20, y: 20, src: true })), part: 'sw' },
      src1: { n: '1-phase supply 230V', type: 'supply1', pre: 'Q', look: 'src', label: '1~ 230V', terms: ['L', 'N', 'PE'].map((t, i) => ({ id: t, x: -10 + i * 20, y: 20, src: true })), part: 'sw' },
      psu: { n: '24 V DC power supply', type: 'psu24', pre: 'G', look: 'src', label: '230V~ / 24V=', terms: [...row(['L', 'N'], -20), ...row(['P1', 'M1'], 20)] },
    },
    Switches: {
      pbno: two('pb_no', '13', '14', 'no', 'S', { act: 'push', part: 'btn', mom: true, n: 'Push button N.O.' }),
      pbnc: two('pb_nc', '11', '12', 'nc', 'S', { act: 'push', part: 'btn', mom: true, n: 'Push button N.C.' }),
      selno: two('sel2', '13', '14', 'no', 'S', { act: 'turn', part: 'knob', n: 'Selector N.O.' }),
      selnc: two('sel2_nc', '11', '12', 'nc', 'S', { act: 'turn', part: 'knob', n: 'Selector N.C.' }),
      keyno: two('selkey', '13', '14', 'no', 'S', { act: 'key', part: 'key', n: 'Key switch N.O.' }),
      estop: two('estop', '11', '12', 'nc', 'S', { act: 'mush', part: 'btn', n: 'Emergency stop' }),
      lsno: two('limit', '13', '14', 'no', 'SQ', { act: 'roll', part: 'lever', n: 'Limit switch N.O.' }),
      lsnc: two('limit', '21', '22', 'nc', 'SQ', { act: 'roll', part: 'lever', n: 'Limit switch N.C.' }),
    },
    Auxiliaries: {
      kmno: two('contactor', '13', '14', 'no', 'KM', { n: 'Contactor aux N.O.' }),
      kmnc: two('contactor', '21', '22', 'nc', 'KM', { n: 'Contactor aux N.C.' }),
      ka1no: two('relay', '11', '14', 'no', 'KA', { n: 'Relay contact 1 N.O.' }),
      ka1nc: two('relay', '11', '12', 'nc', 'KA', { n: 'Relay contact 1 N.C.' }),
      ka2no: two('relay', '21', '24', 'no', 'KA', { n: 'Relay contact 2 N.O.' }),
      ka2nc: two('relay', '21', '22', 'nc', 'KA', { n: 'Relay contact 2 N.C.' }),
      ktno: two('timer', '15', '18', 'no', 'KT', { act: 'delay', n: 'On-delay contact N.O.' }),
      ktnc: two('timer', '15', '16', 'nc', 'KT', { act: 'delay', n: 'On-delay contact N.C.' }),
      kfno: two('timer_off', '15', '18', 'no', 'KT', { act: 'delayoff', n: 'Off-delay contact N.O.' }),
      kfnc: two('timer_off', '15', '16', 'nc', 'KT', { act: 'delayoff', n: 'Off-delay contact N.C.' }),
      olnc: two('olr', '95', '96', 'nc', 'F', { act: 'therm', n: 'Overload contact N.C.', part: 'ol' }),
      olno: two('olr', '97', '98', 'no', 'F', { act: 'therm', n: 'Overload contact N.O.', part: 'ol' }),
      qmaux: two('mpcb', '13', '14', 'no', 'QM', { n: 'Motor breaker aux N.O.' }),
      km4no: two('contactor4', '13', '14', 'no', 'KM', { n: 'Contactor 4P aux N.O.' }),
      kino: two('impulse', '1', '2', 'no', 'KI', { n: 'Impulse relay contact N.O.', part: 'lever' }),
      kinc: two('impulse', '3', '4', 'nc', 'KI', { n: 'Impulse relay contact N.C.', part: 'lever' }),
    },
    Coils: {
      kmcoil: two('contactor', 'A1', 'A2', 'coil', 'KM', { n: 'Contactor coil' }),
      kacoil: two('relay', 'A1', 'A2', 'coil', 'KA', { n: 'Relay coil' }),
      ktcoil: two('timer', 'A1', 'A2', 'tcoil', 'KT', { n: 'On-delay timer coil' }),
      kfcoil: two('timer_off', 'A1', 'A2', 'tcoiloff', 'KT', { n: 'Off-delay timer coil' }),
      km4coil: two('contactor4', 'A1', 'A2', 'coil', 'KM', { n: 'Contactor 4P coil' }),
      kicoil: two('impulse', 'A1', 'A2', 'icoil', 'KI', { n: 'Impulse relay coil' }),
    },
    Loads: {
      lamp: two('lamp', 'X1', 'X2', 'lamp', 'H', { n: 'Pilot lamp' }),
      horn: two('buzzer', 'X1', 'X2', 'horn', 'HA', { n: 'Buzzer / horn' }),
      valve: two('valve', 'A1', 'A2', 'coil', 'Y', { n: 'Solenoid valve' }),
    },
    Contactors: {
      km3: poles('contactor', ['1', '3', '5'], ['2', '4', '6'], 'km', 'KM', { n: 'Contactor main contacts 3P' }),
      km4: poles('contactor4', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'km', 'KM', { n: 'Contactor main contacts 4P' }),
    },
    Protections: {
      fu1: poles('fuse', ['1'], ['2'], 'fuse', 'FU', { n: 'Fuse 1P', part: 'f' }),
      fu3: poles('fuse3', ['1', '3', '5'], ['2', '4', '6'], 'fuse', 'FU', { n: 'Fuse 3P', part: 'f' }),
      mcb1: poles('mcb1', ['1'], ['2'], 'brk', 'QF', { n: 'MCB 1P', part: 'h' }),
      mcb2: poles('mcb2', ['1', '3'], ['2', '4'], 'brk', 'QF', { n: 'MCB 2P', part: 'h' }),
      mcb3: poles('mcb3', ['1', '3', '5'], ['2', '4', '6'], 'brk', 'QF', { n: 'MCB 3P', part: 'h' }),
      qf3: poles('mccb3', ['1', '3', '5'], ['2', '4', '6'], 'brk', 'Q', { n: 'MCCB 3P', part: 'h' }),
      qm3: poles('mpcb', ['1', '3', '5'], ['2', '4', '6'], 'qm', 'QM', { n: 'Motor protection breaker 3P', part: 'h' }),
      ol3: poles('olr', ['1', '3', '5'], ['2', '4', '6'], 'ol', 'F', { n: 'Overload relay (heaters)', part: 'ol' }),
      qs3: poles('isol3', ['1', '3', '5'], ['2', '4', '6'], 'isol', 'QS', { n: 'Disconnector 3P', part: 'h' }),
      rcd: poles('rcd', ['1', '3'], ['2', '4'], 'rcd', 'FI', { n: 'RCD 2P 30 mA', part: 'h' }),
    },
    Others: {
      node: { n: 'Junction (wire branch)', type: 'jct', pre: 'J', look: 'node', terms: [{ id: 'J', x: 0, y: 0 }] },
    },
    Motors: {
      m1: { n: 'Motor 1~ 230V', type: 'motor1', pre: 'M', look: 'motor', label: 'M\n1~', terms: [...row(['L', 'N'], -34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
      m3: { n: 'Motor 3~', type: 'motor', pre: 'M', look: 'motor', label: 'M\n3~', terms: [...row(['U1', 'V1', 'W1'], -34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
      m6: { n: 'Motor star-delta', type: 'motor6', pre: 'M', look: 'motor', label: 'M 3~\nY-Δ', terms: [...row(['U1', 'V1', 'W1'], -34), ...row(['W2', 'U2', 'V2'], 34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
      m2s: { n: 'Motor two speeds', type: 'motor2s', pre: 'M', look: 'motor', label: 'M 3~\n2 speeds', terms: [...row(['1U', '1V', '1W'], -34), ...row(['2U', '2V', '2W'], 34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
      mdh: { n: 'Motor Dahlander', type: 'dahlander', pre: 'M', look: 'motor', label: 'M 3~\nDahlander', terms: [...row(['1U', '1V', '1W'], -34), ...row(['2U', '2V', '2W'], 34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
    },
  };
  const K = {};
  Object.entries(LIB).forEach(([g, o]) => Object.entries(o).forEach(([k, v]) => { K[k] = { ...v, g, n: v.n || k }; }));
  FD.KINDS = K;
  /* TYPE: switch symbols of the same contact (N.O. or N.C.) can be swapped for another actuator */
  const TYPES = [['pbno', 'selno', 'keyno', 'lsno'], ['pbnc', 'selnc', 'estop', 'lsnc']];

  /* ---------- data ---------- */
  const ID = /^d\d{1,6}$/;
  FD.clean = function (f) {
    const o = f && typeof f === 'object' ? f : {};
    const num = v => (Number.isFinite(v) ? Math.round(v / 10) * 10 : 0);
    const items = (Array.isArray(o.items) ? o.items : []).filter(i => i && typeof i === 'object' && ID.test(i.id) && Object.prototype.hasOwnProperty.call(K, i.k) && typeof i.tag === 'string' && TAG.test(i.tag))
      .slice(0, 400).map(i => ({ id: i.id, k: i.k, tag: i.tag, x: num(i.x), y: num(i.y), r: [0, 90, 180, 270].includes(i.r) ? i.r : 0 }));
    const end = e => { if (typeof e !== 'string') return false; const [id, t] = e.split(':'); const it = items.find(i => i.id === id); return !!it && K[it.k].terms.some(x => x.id === t); };
    const wires = (Array.isArray(o.wires) ? o.wires : []).filter(w => w && typeof w === 'object' && /^fw\d{1,6}$/.test(w.id) && end(w.a) && end(w.b) && w.a !== w.b).slice(0, 2000).map(w => {
      const pts = (Array.isArray(w.pts) ? w.pts : []).filter(q => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)).slice(0, 20).map(q => [num(q[0]), num(q[1])]);
      return pts.length ? { id: w.id, a: w.a, b: w.b, pts } : { id: w.id, a: w.a, b: w.b };
    });
    const n = s => Number(String(s).replace(/\D/g, '')) || 0;
    const seq = Math.max(Number.isFinite(o.seq) ? o.seq : 0, ...items.map(i => n(i.id)), ...wires.map(w => n(w.id)), 0);
    return { items, wires, seq };
  };

  let H = null;   // hooks from the Schematic view: sch(), circ(), devOf(), snap(), changed(), mode()
  const fr = () => { const s = H.sch(); if (!s.free) s.free = FD.clean(null); return s.free; };
  FD.has = () => !!(H && H.sch() && H.sch().free && H.sch().free.items.length);

  /* ---------- geometry ---------- */
  const rot = (x, y, r) => (r === 90 ? [-y, x] : r === 180 ? [-x, -y] : r === 270 ? [y, -x] : [x, y]);
  function termPos(it, tid) {
    const t = K[it.k].terms.find(q => q.id === tid); if (!t) return null;
    const [x, y] = rot(t.x, t.y, it.r);
    return { x: it.x + x, y: it.y + y };
  }
  const itemOf = id => fr().items.find(i => i.id === id);
  const endPos = e => { const [id, t] = e.split(':'); const it = itemOf(id); return it ? termPos(it, t) : null; };
  /* square wire route: straight if lined up, else down-across-down; with bends, an L between each pair of points */
  function wirePath(a, b, pts) {
    if (pts && pts.length) {
      const P = [a, ...pts.map(([x, y]) => ({ x, y })), b];
      let d = `M${a.x} ${a.y}`;
      for (let i = 1; i < P.length; i++) d += ` L${P[i - 1].x} ${P[i].y} L${P[i].x} ${P[i].y}`;
      return d;
    }
    const my = Math.round((a.y + b.y) / 20) * 10;
    return a.x === b.x || a.y === b.y ? `M${a.x} ${a.y} L${b.x} ${b.y}` : `M${a.x} ${a.y} L${a.x} ${my} L${b.x} ${my} L${b.x} ${b.y}`;
  }
  const routeLen = (a, pts, b) => { const P = [a, ...pts.map(([x, y]) => ({ x, y })), b]; let n = 0; for (let i = 1; i < P.length; i++) n += Math.abs(P[i].x - P[i - 1].x) + Math.abs(P[i].y - P[i - 1].y); return n; };

  /* ---------- checks and wiring into the circuit ---------- */
  function check() {
    const errs = new Map(), used = new Map();
    for (const it of fr().items) {
      const S = K[it.k], dev = H.devOf(it.tag);
      if (dev && dev.type !== S.type) { errs.set(it, `${it.tag} is a ${DEFS[dev.type].name} in the Wiring, not a ${DEFS[S.type].name}`); continue; }
      // a terminal pair of a device is drawn once (one N.O. aux on a contactor, one coil, one set of main contacts…)
      const key = it.tag + '|' + S.terms.map(t => t.id).join(',');
      if (used.has(key) && S.look !== 'src') errs.set(it, `${it.tag}: this part of the device is already drawn (${S.terms.map(t => t.id).join('-')})`);
      used.set(key, it);
    }
    return errs;
  }
  FD.sync = function (addWire, ensureType, ctlColor) {
    if (!H) return;
    const F = fr(), errs = check(), col = Circuit.POT_COLORS;
    FD.errs = errs;
    const key = e => {
      const [id, t] = e.split(':'), it = itemOf(id);
      if (!it || errs.has(it)) return null;
      const c = ensureType(K[it.k].type, it.tag);
      const tm = K[it.k].terms.find(q => q.id === t);
      return { k: c.id + ':' + t, pole: tm && tm.pole, src: tm && tm.src ? t : null };
    };
    // a placed symbol is a device in the Wiring even before it is wired
    for (const it of F.items) if (!errs.has(it)) ensureType(K[it.k].type, it.tag);
    for (const w of F.wires) {
      const a = key(w.a), b = key(w.b);
      if (!a || !b) continue;
      // colour: the supply conductor it starts from, a pole of a 3-pole device (L1 L2 L3), else control wiring
      const s = a.src || b.src, p = a.pole != null && K[itemOf(w.a.split(':')[0]).k].np === 3 ? a.pole : b.pole != null && K[itemOf(w.b.split(':')[0]).k].np === 3 ? b.pole : null;
      const ph = s === 'L' ? 'L1' : s === 'P1' ? 'DC+' : s === 'M1' ? 'DC-' : s;
      addWire(a.k, b.k, (ph && col[ph]) || (p != null ? col[['L1', 'L2', 'L3'][p]] : ctlColor));
    }
  };

  /* ---------- view ---------- */
  let body = null, svg = null, gv = null, view = { x: 60, y: 60, k: 1 }, sel = null, wiring = null, drag = null, lastSig = '';
  FD.init = function (hooks) { H = hooks; window.addEventListener('pointerup', () => { if (held) { held(); held = null; } }); };
  const live = k => { const api = App.api; if (!api || !k) return false; for (const p of api.potsR(api.rootK(k))) if (/^L[123]$/.test(p) || p.startsWith('DC+')) return true; return false; };
  function devKey(it, t) { const d = H.devOf(it.tag); return d ? d.id + ':' + t : null; }
  function stateOf(it) {
    const S = K[it.k], d = H.devOf(it.tag);
    if (!d || (FD.errs && FD.errs.has(it))) return { on: false, miss: !d };
    const st = d.state;
    if (['coil', 'tcoil', 'tcoiloff', 'icoil', 'lamp', 'horn'].includes(S.look)) return { on: !!(st.pulled || st.on || st.pw) };
    if (S.look === 'node') return { on: live(d.id + ':J') };
    if (S.look === 'motor') return { on: st.drive === 'run' };
    if (S.look === 'src') return { on: !!(st.on || st.ok) };
    const pr = DEFS[d.type].conduct ? DEFS[d.type].conduct(d, App.ctx) || [] : [];
    const ins = S.terms.filter(t => t.y < 0).map(t => t.id), outs = S.terms.filter(t => t.y > 0).map(t => t.id);
    return { on: ins.some((a, i) => pr.some(([x, y]) => (x === a && y === outs[i]) || (y === a && x === outs[i]))) };
  }
  /* IEC drawing of one symbol, upright, centred on 0,0 */
  function shape(it, st) {
    const S = K[it.k], o = [];
    const stub = (x, y1, y2) => `<path d="M${x} ${y1} V${y2}"/>`;
    const actMark = (a, ax) => ({
      push: `<path class="thin" d="M${ax} -6 V6 M${ax} -6 h-4 M${ax} 6 h-4"/>`,
      turn: `<path class="thin" d="M${ax - 4} -6 H${ax} V6 H${ax + 4}"/>`,
      key: `<circle class="thin" cx="${ax - 4}" cy="0" r="4"/><path class="thin" d="M${ax} 0 h4"/>`,
      mush: `<path class="thin" d="M${ax} -7 V7 M${ax} -7 a7 7 0 0 0 0 14"/>`,
      roll: `<path class="thin" d="M${ax} 0 l-7 -5 v10 z"/>`,
      therm: `<path class="thin" d="M${ax} -6 h-5 v6 h5 v6"/>`,
      delay: `<path class="thin" d="M${ax} -7 a7 7 0 0 0 0 14"/>`,
      delayoff: `<path class="thin" d="M${ax - 7} -7 a7 7 0 0 1 0 14"/>`,
    })[a] || '';
    if (S.look === 'no' || S.look === 'nc') {
      o.push(stub(0, -30, -14), stub(0, 14, 30));
      o.push(S.look === 'nc' ? `<path d="M0 -14 H10 M0 14 L13 -17"/>` : `<path d="M0 14 L-11 -13"/>`);
      if (S.act) o.push(`<path class="thin dash" d="M${S.look === 'nc' ? 6 : -6} 0 H-26"/>`, actMark(S.act, -26));
    } else if (S.look === 'node') {
      o.push(`<circle cx="0" cy="0" r="3.5" class="jdot"/>`);
    } else if (['coil', 'tcoil', 'tcoiloff', 'icoil'].includes(S.look)) {
      o.push(stub(0, -30, -9), stub(0, 9, 30), `<rect x="-14" y="-9" width="28" height="18"/>`);
      if (S.look === 'icoil') o.push(`<path class="thin" d="M-8 5 V-5 H0 V5 H8 V-5"/>`);
      if (S.look !== 'coil') o.push(`<rect x="-26" y="-9" width="12" height="18"${S.look === 'tcoiloff' ? ' class="fill"' : ''}/><path class="thin" d="M-26 -9 L-14 9 M-14 -9 L-26 9"/>`);
    } else if (S.look === 'lamp') {
      o.push(stub(0, -30, -11), stub(0, 11, 30), `<circle cx="0" cy="0" r="11"/><path class="thin" d="M-8 -8 L8 8 M8 -8 L-8 8"/>`);
    } else if (S.look === 'horn') {
      o.push(stub(0, -30, -4), stub(0, 8, 30), `<path d="M-12 8 H12 M-9 8 a9 11 0 0 1 18 0"/>`);
    } else if (S.look === 'src') {
      const xs = S.terms.map(t => t.x), x1 = Math.min(...xs) - 14, x2 = Math.max(...xs) + 14;
      o.push(`<rect x="${x1}" y="-12" width="${x2 - x1}" height="24" rx="4"/>`, ...S.terms.map(t => stub(t.x, t.y < 0 ? -20 : 12, t.y < 0 ? -12 : 20)));
    } else if (S.look === 'motor') {
      o.push(`<circle cx="0" cy="0" r="22" class="${st.on ? 'mon' : ''}"/>`, ...S.terms.filter(t => t.id !== 'PE').map(t => `<path d="M${t.x} ${t.y} L${t.x * 0.4} ${t.y < 0 ? -20 : 20}"/>`));
      o.push(`<path class="pe" d="M22 0 H40 M40 0 V8 M33 8 H47 M36 12 H44 M39 16 H41"/>`);
    } else {
      // multi-pole power device: one symbol per pole and a dashed link
      S.terms.filter(t => t.y < 0).forEach(t => {
        const x = t.x;
        if (S.look === 'fuse') o.push(stub(x, -30, -12), stub(x, 12, 30), `<rect x="${x - 5}" y="-12" width="10" height="24"/><path class="thin" d="M${x} -12 V12"/>`);
        else if (S.look === 'ol') o.push(stub(x, -30, -10), stub(x, 10, 30), `<path d="M${x} -10 h-4 v8 h8 v8 h-4 V10"/>`);
        else {
          o.push(stub(x, -30, -14), stub(x, 14, 30), `<path d="M${x} 14 L${x - 10} -12"/>`);
          if (S.look === 'km') o.push(`<path class="thin" d="M${x - 4} -14 a4 4 0 0 0 8 0"/>`);
          if (S.look === 'brk' || S.look === 'qm' || S.look === 'rcd') o.push(`<path class="thin" d="M${x - 3} -17 l6 6 M${x + 3} -17 l-6 6"/>`);
        }
      });
      const ps = S.terms.filter(t => t.y < 0).map(t => t.x), x1 = Math.min(...ps), x2 = Math.max(...ps);
      if (S.look === 'ol') o.push(`<rect x="${x1 - 9}" y="-14" width="${x2 - x1 + 18}" height="28" class="thin"/>`);
      else if (S.look !== 'fuse') o.push(`<path class="thin dash" d="M${x1 - 5} 0 H${x2 + 2}"/>`, `<path class="thin" d="M${x1 - 5} 0 h-10 m0 -6 v12"/>`);
      if (S.look === 'qm') o.push(`<path class="thin" d="M${x2 + 6} -6 h6 v6 h-6 v6"/>`);
      if (S.look === 'rcd') o.push(`<ellipse class="thin" cx="${(x1 + x2) / 2}" cy="20" rx="${(x2 - x1) / 2 + 12}" ry="5"/>`);
    }
    return o.join('');
  }
  function labels(it, S) {
    if (S.look === 'node') return '';
    // upright text at rotated positions
    const at = (x, y) => { const [a, b] = rot(x, y, it.r); return [it.x + a, it.y + b]; };
    const o = [];
    const isPole = !['no', 'nc', 'coil', 'tcoil', 'tcoiloff', 'icoil', 'lamp', 'horn'].includes(S.look);
    const [tx, ty] = S.look === 'src' ? at(0, -22) : S.look === 'motor' ? at(-30, -14) : at(isPole ? -((S.np || 1) * 10) - 22 : -30, -12);
    o.push(`<text class="ftag" x="${tx}" y="${ty}">-${esc(it.tag)}</text>`);
    if (S.look === 'motor') { const [mx, my] = at(0, 0); S.label.split('\n').forEach((l, i, a) => o.push(`<text class="mtxt" x="${mx}" y="${my + 4 + (i - (a.length - 1) / 2) * 12}">${esc(l)}</text>`)); }
    if (S.look === 'src') { const [mx, my] = at(0, 0); o.push(`<text class="mtxt sm" x="${mx}" y="${my + 4}">${esc(S.label)}</text>`); }
    S.terms.forEach(t => {
      const lx = t.x + (t.id === 'PE' && S.look === 'motor' ? 2 : 5), ly = t.y + (t.y < 0 ? -2 : t.y > 0 ? 10 : -6);
      const [x, y] = at(lx, ly);
      o.push(`<text class="sterm" x="${x}" y="${y}">${esc(t.id)}</text>`);
    });
    return o.join('');
  }
  FD.render = function (el) {
    body = el;
    const F = fr();
    FD.errs = check();
    const o = [];
    o.push(`<svg class="rung-svg sch-svg iec-svg free-svg" width="100%" height="100%"><defs><pattern id="fdGrid" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="0.5" cy="0.5" r="0.7" class="gridDot"/></pattern></defs><g class="fv" transform="translate(${view.x} ${view.y}) scale(${view.k})"><rect class="fbg" x="-5000" y="-5000" width="10000" height="10000" fill="url(#fdGrid)"/>`);
    for (const w of F.wires) {
      const a = endPos(w.a), b = endPos(w.b); if (!a || !b) continue;
      const ia = itemOf(w.a.split(':')[0]), on = live(devKey(ia, w.a.split(':')[1]));
      const d = wirePath(a, b, w.pts);
      o.push(`<g class="fwire${sel && sel.w === w.id ? ' sel' : ''}" data-fw="${w.id}"><path class="fwh" d="${d}"/><path class="w${on ? ' on' : ''}" d="${d}"/></g>`);
      if (sel && sel.w === w.id) (w.pts || []).forEach(([x, y], i) => o.push(`<circle class="fbend" data-fb="${w.id}:${i}" cx="${x}" cy="${y}" r="5"><title>Drag to move · double-click to remove</title></circle>`));
    }
    for (const it of F.items) {
      const S = K[it.k], st = stateOf(it), err = FD.errs.has(it);
      o.push(`<g class="fitem${sel && sel.i === it.id ? ' sel' : ''}" data-fi="${it.id}">${S.look === 'node' ? `<rect class="hit" x="${it.x - 8}" y="${it.y - 8}" width="16" height="16" rx="8"/>` : `<rect class="hit" x="${it.x - 34}" y="${it.y - 34}" width="68" height="68" rx="6"/>`}`);
      o.push(`<g class="ssym${st.on ? ' on' : ''}${err ? ' err' : ''}${st.miss ? ' miss' : ''}" transform="translate(${it.x} ${it.y}) rotate(${it.r})">${shape(it, st)}</g>`);
      o.push(labels(it, S));
      S.terms.forEach(t => { const p = termPos(it, t.id); o.push(`<circle class="fterm${wiring && wiring.from === it.id + ':' + t.id ? ' on' : ''}" data-ft="${it.id}:${t.id}" cx="${p.x}" cy="${p.y}" r="4"/>`); });
      o.push('</g>');
    }
    if (wiring && wiring.cur) { const a = endPos(wiring.from); if (a) o.push(`<path class="wtemp" d="${wirePath(a, wiring.cur)}"/>`); }
    if (!F.items.length) o.push(`<text class="hint" x="200" y="40">Empty drawing — add symbols with ＋ Library, then click a terminal and another to wire them</text>`);
    o.push('</g></svg>');
    el.innerHTML = o.join('');
    svg = el.querySelector('svg'); gv = svg.querySelector('.fv');
    bind();
    lastSig = sig();
  };
  const sig = () => { const F = fr(); return F.items.map(it => { const s = stateOf(it); return s.on ? 1 : 0; }).join('') + '|' + F.wires.map(w => { const ia = itemOf(w.a.split(':')[0]); return ia && live(devKey(ia, w.a.split(':')[1])) ? 1 : 0; }).join(''); };
  FD.update = function () { if (body && sig() !== lastSig) FD.render(body); };
  const world = ev => { const r = svg.getBoundingClientRect(); return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k }; };
  const snap10 = v => Math.round(v / 10) * 10;
  let held = null, lastTap = { k: '', t: 0 };
  function bind() {
    svg.addEventListener('pointerdown', ev => {
      const p = world(ev), term = ev.target.closest('[data-ft]'), itEl = ev.target.closest('[data-fi]'), wEl = ev.target.closest('[data-fw]'), bEl = ev.target.closest('[data-fb]');
      // double click / double tap (the drawing is redrawn between the two clicks, so the browser's dblclick is not used)
      const tapKey = bEl ? 'b' + bEl.dataset.fb : wEl ? 'w' + wEl.dataset.fw : itEl ? 'i' + itEl.dataset.fi : '';
      const dbl = tapKey && lastTap.k === tapKey && Date.now() - lastTap.t < 400;
      lastTap = { k: tapKey, t: Date.now() };
      if (dbl && H.mode() === 'edit' && !wiring) {
        lastTap = { k: '', t: 0 };
        if (bEl) { const [wid, i] = bEl.dataset.fb.split(':'), w = fr().wires.find(x => x.id === wid); if (w) { H.snap(); w.pts.splice(Number(i), 1); if (!w.pts.length) delete w.pts; H.changed(); } return; }
        if (wEl) { const w = fr().wires.find(x => x.id === wEl.dataset.fw); if (w) { sel = { w: w.id }; addBend(w, [snap10(p.x), snap10(p.y)]); } return; }
        if (itEl && K[itemOf(itEl.dataset.fi).k].look !== 'node') { drag = null; FD.retag(itemOf(itEl.dataset.fi)); return; }
      }
      if (bEl && H.mode() === 'edit') {
        const [wid, i] = bEl.dataset.fb.split(':'), w = fr().wires.find(x => x.id === wid);
        if (w) { drag = { bend: w, i: Number(i), moved: false, snapped: false }; svg.setPointerCapture(ev.pointerId); }
        return;
      }
      if (H.mode() === 'run') {
        if (itEl) {
          const it = itemOf(itEl.dataset.fi), S = K[it.k], d = H.devOf(it.tag);
          if (d && S.part === 'ol') App.operate(d, d.state.tripped ? 'reset' : 'test')();
          else if (d && S.part) { ev.preventDefault(); held = App.operate(d, S.part); }
          return;
        }
        drag = { pan: true, sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y }; svg.setPointerCapture(ev.pointerId); return;
      }
      if (term) {
        const key = term.dataset.ft;
        if (!wiring) { wiring = { from: key, cur: null }; sel = null; FD.render(body); return; }
        if (key !== wiring.from && !fr().wires.some(w => (w.a === wiring.from && w.b === key) || (w.b === wiring.from && w.a === key))) {
          H.snap(); const F = fr(); F.seq++; F.wires.push({ id: 'fw' + F.seq, a: wiring.from, b: key });
          wiring = null; H.changed(); return;
        }
        wiring = null; FD.render(body); return;
      }
      if (wiring && wEl) {
        // ending a wire on another wire: a junction dot there, and both wires meet on it
        const w = fr().wires.find(x => x.id === wEl.dataset.fw);
        if (w && w.a !== wiring.from && w.b !== wiring.from) {
          H.snap();
          const j = splitWire(w, { x: snap10(p.x), y: snap10(p.y) }), F = fr();
          F.seq++; F.wires.push({ id: 'fw' + F.seq, a: wiring.from, b: j });
          wiring = null; H.changed(); return;
        }
      }
      if (wiring) { wiring = null; FD.render(body); return; }
      if (itEl) {
        const it = itemOf(itEl.dataset.fi);
        sel = { i: it.id }; drag = { item: it, ox: p.x - it.x, oy: p.y - it.y, moved: false, snapped: false };
        svg.setPointerCapture(ev.pointerId); FD.render(body); H.side(); return;
      }
      if (wEl) { sel = { w: wEl.dataset.fw }; FD.render(body); H.side(); return; }
      sel = null; H.side();
      drag = { pan: true, sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y }; svg.setPointerCapture(ev.pointerId);
      FD.render(body);
    });
    svg.addEventListener('pointermove', ev => {
      if (wiring) { const p = world(ev); wiring.cur = { x: snap10(p.x), y: snap10(p.y) }; const t = svg.querySelector('.wtemp'); const a = endPos(wiring.from); if (t && a) t.setAttribute('d', wirePath(a, wiring.cur)); else if (a) FD.render(body); }
      if (!drag) return;
      if (drag.bend) {
        const q = world(ev), pt = [snap10(q.x), snap10(q.y)], cur = drag.bend.pts[drag.i];
        if (cur && (cur[0] !== pt[0] || cur[1] !== pt[1])) { if (!drag.snapped) { H.snap(); drag.snapped = true; } drag.bend.pts[drag.i] = pt; drag.moved = true; FD.render(body); }
        return;
      }
      if (drag.pan) { view.x = drag.vx + ev.clientX - drag.sx; view.y = drag.vy + ev.clientY - drag.sy; gv.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`); return; }
      const p = world(ev), nx = snap10(p.x - drag.ox), ny = snap10(p.y - drag.oy);
      if (nx !== drag.item.x || ny !== drag.item.y) { if (!drag.snapped) { H.snap(); drag.snapped = true; } drag.item.x = nx; drag.item.y = ny; drag.moved = true; FD.render(body); }
    });
    const up = () => { if (held) { held(); held = null; } if (drag && drag.moved) { drag = null; H.changed(); return; } drag = null; };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', ev => {
      ev.preventDefault();
      const r = svg.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, k = Math.max(0.3, Math.min(3, view.k * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
      view.x = mx - (mx - view.x) * k / view.k; view.y = my - (my - view.y) * k / view.k; view.k = k;
      gv.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
    }, { passive: false });
  }

  /* ---------- editing ---------- */
  function suggest(k) {
    const S = K[k], used = new Set([...H.circ().comps.map(c => c.props.label), ...fr().items.map(i => i.tag)]);
    const same = H.circ().comps.filter(c => c.type === S.type).map(c => c.props.label);
    // contacts and coils of an existing device suggest that device
    if (!['Sources', 'Switches', 'Loads', 'Motors'].includes(S.g) && same.length) return { def: same[same.length - 1], list: same };
    let n = 1; while (used.has(S.pre + n)) n++;
    return { def: S.pre + n, list: same };
  }
  /* a bend goes where it makes the route shortest */
  function addBend(w, pt) {
    const a = endPos(w.a), b = endPos(w.b), pts = w.pts || [];
    let best = 0, bl = Infinity;
    for (let i = 0; i <= pts.length; i++) { const t = [...pts.slice(0, i), pt, ...pts.slice(i)], l = routeLen(a, t, b); if (l < bl) { bl = l; best = i; } }
    H.snap(); w.pts = [...pts.slice(0, best), pt, ...pts.slice(best)]; H.changed();
  }
  function splitWire(w, pt) {
    const F = fr(), used = new Set([...H.circ().comps.map(c => c.props.label), ...F.items.map(i => i.tag)]);
    let n = 1; while (used.has('J' + n)) n++;
    F.seq++;
    const node = { id: 'd' + F.seq, k: 'node', tag: 'J' + n, x: pt.x, y: pt.y, r: 0 }, j = node.id + ':J';
    F.items.push(node);
    F.seq++;
    F.wires.push({ id: 'fw' + F.seq, a: j, b: w.b });
    w.b = j; delete w.pts;
    return j;
  }
  FD.add = function (k, tag, x, y) {
    const go = t => {
      if (!TAG.test(t)) return 'Use letters, numbers, - or _ (up to 20)';
      H.snap();
      const F = fr(); F.seq++;
      const r = svg ? svg.getBoundingClientRect() : { width: 600, height: 400 };
      const cx = x != null ? x : snap10((r.width / 2 - view.x) / view.k) + (F.items.length % 5) * 20, cy = y != null ? y : snap10((r.height / 2 - view.y) / view.k);
      const it = { id: 'd' + F.seq, k, tag: t, x: snap10(cx), y: snap10(cy), r: 0 };
      F.items.push(it); sel = { i: it.id };
      H.changed();
      return undefined;
    };
    if (tag) return go(tag);
    const sg = suggest(k);
    UI.form(K[k].n, [{ key: 't', label: 'Device tag', value: sg.def, list: sg.list }], v => go(v.t.trim()),
      '<p class="help">Use the tag of a device in the Wiring (its contacts and coil share the tag), or a new tag: the device is added to the Wiring for you.</p>');
  };
  FD.retag = function (it) {
    if (!it) return;
    UI.form(`${K[it.k].n} — tag`, [{ key: 't', label: 'Device tag', value: it.tag, list: suggest(it.k).list }], v => {
      const t = v.t.trim(); if (!TAG.test(t)) return 'Use letters, numbers, - or _ (up to 20)';
      H.snap(); it.tag = t; H.changed();
    });
  };
  FD.rotate = function () {
    const it = sel && sel.i && itemOf(sel.i); if (!it) { UI.toast('Select a symbol first'); return; }
    H.snap(); it.r = (it.r + 90) % 360; H.changed();
  };
  FD.cycleType = function () {
    const it = sel && sel.i && itemOf(sel.i); if (!it) return;
    const list = TYPES.find(l => l.includes(it.k)); if (!list) { UI.toast('Only switch contacts have types'); return; }
    H.snap(); it.k = list[(list.indexOf(it.k) + 1) % list.length]; H.changed();
  };
  FD.del = function () {
    const F = fr();
    if (sel && sel.i) { H.snap(); F.items = F.items.filter(i => i.id !== sel.i); F.wires = F.wires.filter(w => !w.a.startsWith(sel.i + ':') && !w.b.startsWith(sel.i + ':')); sel = null; H.changed(); return true; }
    if (sel && sel.w) { H.snap(); F.wires = F.wires.filter(w => w.id !== sel.w); sel = null; H.changed(); return true; }
    return false;
  };
  FD.onKey = function (ev) {
    const k = ev.key;
    if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); FD.del(); }
    else if (k === 'r' || k === 'R') { ev.preventDefault(); FD.rotate(); }
    else if (k === 'Escape') { wiring = null; sel = null; if (body) FD.render(body); H.side(); }
  };
  /* the library: pick a group, then a symbol (one long list would not fit a phone screen) */
  FD.library = function (x, y) {
    UI.menu(x, y, [{ head: 'Library' }, ...Object.entries(LIB).map(([g, o]) => ({ label: `${g} (${Object.keys(o).length}) ›`, onClick: () => setTimeout(() => UI.menu(x, y, [{ head: g }, ...Object.keys(o).map(k => ({ label: K[k].n, onClick: () => FD.add(k) }))]), 0) }))]);
  };
  FD.resetSel = () => { sel = null; wiring = null; drag = null; lastSig = ''; };
  FD.selected = () => (sel && sel.i ? itemOf(sel.i) : null);
  /* side panel for the free drawing */
  FD.side = function () {
    const it = FD.selected(), errs = FD.errs ? [...FD.errs.values()] : [];
    const d = it && H.devOf(it.tag);
    return `${it ? `<h5>${esc(K[it.k].n)} <code>-${esc(it.tag)}</code></h5>
      <div class="btn-row"><button class="btn" data-fd="retag">Tag…</button><button class="btn" data-fd="rot">⟳ Rotate (R)</button>${TYPES.some(l => l.includes(it.k)) ? '<button class="btn" data-fd="type">Type ⇄</button>' : ''}<button class="btn danger" data-fd="del">Delete</button></div>
      <p class="help">${d ? esc(Circuit.status(d, App.ctx) || '') : 'Not in the Wiring yet.'}</p>` : '<p class="help">Select a symbol to rotate it, change its tag or its type.</p>'}
      ${errs.length ? `<h5>Problems</h5><ul class="verify">${errs.map(m => `<li class="e">${esc(m)}</li>`).join('')}</ul>` : ''}
      <ul class="tips"><li><b>＋ Library</b> adds a symbol. Drag to move, <b>R</b> to rotate, <b>Del</b> to delete.</li>
      <li>Click a terminal ● then another to draw a wire. Every drawn wire is wired in the Wiring for you.</li>
      <li>End a wire on another wire to branch it (a junction dot). Double-click a wire to add a bend, drag the bend, double-click it to remove it.</li>
      <li>Symbols with the same tag are the same device: draw its coil and its contacts anywhere.</li>
      <li>☝ Operate: press buttons, switch breakers and trip overloads on the drawing.</li></ul>`;
  };
  FD.bindSide = function (sideEl) {
    sideEl.querySelectorAll('[data-fd]').forEach(b => { b.onclick = () => ({ retag: () => FD.retag(FD.selected()), rot: FD.rotate, type: FD.cycleType, del: FD.del })[b.dataset.fd](); });
  };
  window.FreeDraw = FD;
})();
