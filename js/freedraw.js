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
  const sens = (type, out, n, photo) => ({ type, pre: 'B', look: 'sens', label: out, photo, part: 'tgt', n, terms: [{ id: 'BN', x: 0, y: -30 }, { id: 'BU', x: 0, y: 30 }, { id: 'BK', x: 30, y: 0 }] });
  const row = (ids, y, gap = 20) => ids.map((t, i) => ({ id: t, x: (i - (ids.length - 1) / 2) * gap, y, src: true }));
  // a potential point (L1, N, +24 V…): a junction wired to that conductor of the supply in the Wiring
  const pot = (p, n) => ({ n, type: 'jct', pre: 'XP', look: 'pot', pot: p, jct: true, auto: true, terms: [{ id: 'J', x: 0, y: -30 }] });
  // wire pieces: junctions with several ends (all one point); a link arrow joins every arrow with the same tag
  const wire = (n, ends, extra) => ({ n, type: 'jct', pre: 'J', look: 'wire', jct: true, auto: true, terms: ends.map(([x, y], i) => ({ id: 'J' + i, x, y })), ...extra });
  const LIB = {
    Sources: {
      // supply terminals line up with the poles of the devices under them (L1 L2 L3 at -20 0 20)
      src3: { n: '3-phase supply', type: 'supply3', pre: 'Q', look: 'src', label: '3~ 400/230V', terms: ['L1', 'L2', 'L3', 'N', 'PE'].map((t, i) => ({ id: t, x: -20 + i * 20, y: 20, src: true })), part: 'sw' },
      src1: { n: '1-phase supply 230V', type: 'supply1', pre: 'Q', look: 'src', label: '1~ 230V', terms: ['L', 'N', 'PE'].map((t, i) => ({ id: t, x: -10 + i * 20, y: 20, src: true })), part: 'sw' },
      psu: { n: 'AC/DC converter 230V~ / 24V= (power supply)', type: 'psu24', pre: 'G', look: 'conv', terms: [...row(['L', 'N'], -30), ...row(['P1', 'M1'], 30)] },
      gen: { n: 'Generator 3~ (GS)', type: 'gen3', pre: 'G', look: 'gen', label: 'GS\n3~', terms: [...row(['L1', 'L2', 'L3', 'N'], 34), { id: 'PE', x: 44, y: 0, src: true }], part: 'run' },
      batt: { n: 'Battery 24 V', type: 'battery', pre: 'GB', look: 'batt', terms: [{ id: 'P', x: 0, y: -30, src: true }, { id: 'M', x: 0, y: 30, src: true }] },
      pL1: pot('L1', 'Point L1'), pL2: pot('L2', 'Point L2'), pL3: pot('L3', 'Point L3'), pN: pot('N', 'Point N'), pPE: pot('PE', 'Point PE'),
      pP: pot('+', 'Point +24 V'), pM: pot('-', 'Point 0 V'),
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
      pbcono: two('pb_co', '13', '14', 'no', 'S', { act: 'push', part: 'btn', mom: true, n: 'Push button NO+NC — N.O. 13-14' }),
      pbconc: two('pb_co', '21', '22', 'nc', 'S', { act: 'push', part: 'btn', mom: true, n: 'Push button NO+NC — N.C. 21-22' }),
      footno: two('foot', '13', '14', 'no', 'S', { act: 'foot', part: 'btn', mom: true, n: 'Foot switch N.O.' }),
      footnc: two('foot', '21', '22', 'nc', 'S', { act: 'foot', part: 'btn', mom: true, n: 'Foot switch N.C.' }),
      sel3h: two('sel3', '13', '14', 'no', 'S', { act: 'turn', part: 'l', n: 'Selector H-O-A — HAND 13-14' }),
      sel3a: two('sel3', '23', '24', 'no', 'S', { act: 'turn', part: 'r', n: 'Selector H-O-A — AUTO 23-24' }),
    },
    Sensors: {
      pswno: two('pswitch', '13', '14', 'no', 'SP', { act: 'press', part: 'pv', n: 'Pressure switch N.O.' }),
      pswnc: two('pswitch_nc', '11', '12', 'nc', 'SP', { act: 'press', part: 'pv', n: 'Pressure switch N.C.' }),
      fltno: two('float', '13', '14', 'no', 'SL', { act: 'float', part: 'pv', n: 'Float (level) switch N.O.' }),
      fltnc: two('float_nc', '11', '12', 'nc', 'SL', { act: 'float', part: 'pv', n: 'Float (level) switch N.C.' }),
      tswno: two('tswitch', '13', '14', 'no', 'ST', { act: 'temp', part: 'pv', n: 'Thermostat N.O.' }),
      tswnc: two('tswitch_nc', '11', '12', 'nc', 'ST', { act: 'temp', part: 'pv', n: 'Thermostat N.C.' }),
      fswno: two('flowsw', '13', '14', 'no', 'SF', { act: 'flow', part: 'pv', n: 'Flow switch N.O.' }),
      fswnc: two('flowsw_nc', '11', '12', 'nc', 'SF', { act: 'flow', part: 'pv', n: 'Flow switch N.C.' }),
      // 3-wire DC sensors: BN brown +24 V, BU blue 0 V, BK black output
      prox: sens('prox', 'PNP', 'Inductive proximity sensor PNP'),
      proxn: sens('prox_npn', 'NPN', 'Inductive proximity sensor NPN'),
      photo: sens('photo', 'PNP', 'Photoelectric sensor PNP', true),
      photon: sens('photo_npn', 'NPN', 'Photoelectric sensor NPN', true),
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
      ltno: two('latch', '11', '14', 'no', 'KA', { n: 'Latching relay contact N.O.' }),
      ltnc: two('latch', '11', '12', 'nc', 'KA', { n: 'Latching relay contact N.C.' }),
    },
    Coils: {
      kmcoil: two('contactor', 'A1', 'A2', 'coil', 'KM', { n: 'Contactor coil' }),
      kacoil: two('relay', 'A1', 'A2', 'coil', 'KA', { n: 'Relay coil' }),
      ktcoil: two('timer', 'A1', 'A2', 'tcoil', 'KT', { n: 'On-delay timer coil' }),
      kfcoil: two('timer_off', 'A1', 'A2', 'tcoiloff', 'KT', { n: 'Off-delay timer coil' }),
      km4coil: two('contactor4', 'A1', 'A2', 'coil', 'KM', { n: 'Contactor 4P coil' }),
      kicoil: two('impulse', 'A1', 'A2', 'icoil', 'KI', { n: 'Impulse relay coil' }),
      ltset: two('latch', 'A1', 'A2', 'coil', 'KA', { n: 'Latching relay SET coil', label: 'S' }),
      ltrst: two('latch', 'B1', 'B2', 'coil', 'KA', { n: 'Latching relay RESET coil', label: 'R' }),
    },
    Loads: {
      lamp: two('lamp', 'X1', 'X2', 'lamp', 'H', { n: 'Pilot lamp' }),
      horn: two('buzzer', 'X1', 'X2', 'horn', 'HA', { n: 'Buzzer / horn' }),
      valve: two('valve', 'A1', 'A2', 'coil', 'Y', { n: 'Solenoid valve' }),
      heater: two('heater', 'X1', 'X2', 'heat', 'EH', { n: 'Heater' }),
      hmeter: two('hourmeter', 'X1', 'X2', 'meter', 'P', { n: 'Hour meter', label: 'h' }),
      vmeter: two('vmeter', 'V1', 'V2', 'meter', 'PV', { n: 'Voltmeter', label: 'V' }),
      fan: { n: 'Fan 1~ 230V', type: 'fan', pre: 'M', look: 'motor', label: 'FAN\n1~', terms: [...row(['L', 'N'], -34), { id: 'PE', x: 40, y: 0 }] },
    },
    Contactors: {
      km3: poles('contactor', ['1', '3', '5'], ['2', '4', '6'], 'km', 'KM', { n: 'Contactor main contacts 3P' }),
      km2: poles('contactor', ['1', '3'], ['2', '4'], 'km', 'KM', { n: 'Contactor main contacts 2P' }),
      km4: poles('contactor4', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'km', 'KM', { n: 'Contactor main contacts 4P' }),
    },
    Protections: {
      fu1: poles('fuse', ['1'], ['2'], 'fuse', 'FU', { n: 'Fuse 1P', part: 'f' }),
      fu2: poles('fuse2', ['1', '3'], ['2', '4'], 'fuse', 'FU', { n: 'Fuse 2P', part: 'f' }),
      fu3: poles('fuse3', ['1', '3', '5'], ['2', '4', '6'], 'fuse', 'FU', { n: 'Fuse 3P', part: 'f' }),
      fu4: poles('fuse4', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'fuse', 'FU', { n: 'Fuse 4P', part: 'f' }),
      mcb1: poles('mcb1', ['1'], ['2'], 'brk', 'QF', { n: 'MCB 1P', part: 'h' }),
      mcb2: poles('mcb2', ['1', '3'], ['2', '4'], 'brk', 'QF', { n: 'MCB 2P', part: 'h' }),
      mcb3: poles('mcb3', ['1', '3', '5'], ['2', '4', '6'], 'brk', 'QF', { n: 'MCB 3P', part: 'h' }),
      mcb4: poles('mcb4', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'brk', 'QF', { n: 'MCB 4P', part: 'h' }),
      qf3: poles('mccb3', ['1', '3', '5'], ['2', '4', '6'], 'brk', 'Q', { n: 'MCCB 3P', part: 'h' }),
      qm3: poles('mpcb', ['1', '3', '5'], ['2', '4', '6'], 'qm', 'QM', { n: 'Motor protection breaker 3P', part: 'h' }),
      ol3: poles('olr', ['1', '3', '5'], ['2', '4', '6'], 'ol', 'F', { n: 'Overload relay (heaters)', part: 'ol' }),
      qs3: poles('isol3', ['1', '3', '5'], ['2', '4', '6'], 'isol', 'QS', { n: 'Disconnector 3P', part: 'h' }),
      qs4: poles('isol4', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'isol', 'QS', { n: 'Disconnector 4P', part: 'h' }),
      fsw3: poles('fsw3', ['1', '3', '5'], ['2', '4', '6'], 'fsw', 'QS', { n: 'Fuse disconnector 3P', part: 'h' }),
      rcd: poles('rcd', ['1', '3'], ['2', '4'], 'rcd', 'FI', { n: 'RCD 2P 30 mA', part: 'h' }),
      rcd4: poles('rcd4', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'rcd', 'FI', { n: 'RCD 4P 30 mA', part: 'h' }),
      rcbo: poles('rcbo', ['1', '3'], ['2', '4'], 'rcd', 'QF', { n: 'RCBO 2P (RCD + MCB)', part: 'h' }),
    },
    Others: {
      node: { n: 'Junction (wire branch)', type: 'jct', pre: 'J', look: 'node', jct: true, auto: true, terms: [{ id: 'J', x: 0, y: 0 }] },
      wline: wire('Wire (straight)', [[0, -30], [0, 30]]),
      wcorner: wire('Wire corner', [[0, -30], [30, 0]]),
      wtee: wire('Wire T (junction)', [[-30, 0], [30, 0], [0, 30]]),
      wcross: wire('Wire cross (junction)', [[-30, 0], [30, 0], [0, -30], [0, 30]]),
      wlink: wire('Link arrow (same tag = connected)', [[0, -30]], { pre: 'W', auto: false, arrow: true }),
      // protective earth: wired to the PE of the supply
      gnd: { n: 'Protective earth (PE)', type: 'jct', pre: 'PE', look: 'gnd', jct: true, auto: true, pot: 'PE', terms: [{ id: 'J', x: 0, y: -20 }] },
      // a note on the drawing, no device
      text: { n: 'Text', type: null, pre: 'TXT', look: 'text', terms: [] },
    },
    Motors: {
      m1: { n: 'Motor 1~ 230V', type: 'motor1', pre: 'M', look: 'motor', label: 'M\n1~', terms: [...row(['L', 'N'], -34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
      m3: { n: 'Motor 3~', type: 'motor', pre: 'M', look: 'motor', label: 'M\n3~', terms: [...row(['U1', 'V1', 'W1'], -34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
      m6: { n: 'Motor star-delta', type: 'motor6', pre: 'M', look: 'motor', label: 'M 3~\nY-Δ', terms: [...row(['U1', 'V1', 'W1'], -34), ...row(['W2', 'U2', 'V2'], 34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
      m2s: { n: 'Motor two speeds', type: 'motor2s', pre: 'M', look: 'motor', label: 'M 3~\n2 speeds', terms: [...row(['1U', '1V', '1W'], -34), ...row(['2U', '2V', '2W'], 34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
      mdc: { n: 'Motor DC 24 V', type: 'motordc', pre: 'M', look: 'motor', label: 'M\n=', terms: row(['A1', 'A2'], -34), part: 'jam' },
      mdh: { n: 'Motor Dahlander', type: 'dahlander', pre: 'M', look: 'motor', label: 'M 3~\nDahlander', terms: [...row(['1U', '1V', '1W'], -34), ...row(['2U', '2V', '2W'], 34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
    },
  };
  const K = {};
  Object.entries(LIB).forEach(([g, o]) => Object.entries(o).forEach(([k, v]) => { K[k] = { ...v, g, n: v.n || k }; }));
  FD.KINDS = K;
  /* TYPE: switch symbols of the same contact (N.O. or N.C.) can be swapped for another actuator */
  const TYPES = [['pbno', 'selno', 'keyno', 'lsno', 'pbcono', 'footno', 'pswno', 'fltno', 'tswno', 'fswno'], ['pbnc', 'selnc', 'estop', 'lsnc', 'pbconc', 'footnc', 'pswnc', 'fltnc', 'tswnc', 'fswnc'],
    ['prox', 'proxn', 'photo', 'photon']];

  /* ---------- data ---------- */
  const ID = /^d\d{1,6}$/;
  FD.clean = function (f) {
    const o = f && typeof f === 'object' ? f : {};
    const num = v => (Number.isFinite(v) ? Math.round(v / 10) * 10 : 0);
    const items = (Array.isArray(o.items) ? o.items : []).filter(i => i && typeof i === 'object' && ID.test(i.id) && Object.prototype.hasOwnProperty.call(K, i.k) && typeof i.tag === 'string' && TAG.test(i.tag))
      .slice(0, 400).map(i => ({ id: i.id, k: i.k, tag: i.tag, x: num(i.x), y: num(i.y), r: [0, 90, 180, 270].includes(i.r) ? i.r : 0, ...(i.k === 'text' ? { txt: typeof i.txt === 'string' ? i.txt.slice(0, 80) : '' } : {}) }));
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
  // the supply terminal a potential point is wired to: [device type, terminal] in order of preference
  const POT = {
    L1: [['supply3', 'L1'], ['supply1', 'L'], ['gen3', 'L1']], L2: [['supply3', 'L2'], ['gen3', 'L2']], L3: [['supply3', 'L3'], ['gen3', 'L3']],
    N: [['supply3', 'N'], ['supply1', 'N'], ['gen3', 'N']], PE: [['supply3', 'PE'], ['supply1', 'PE'], ['gen3', 'PE']],
    '+': [['psu24', 'P1'], ['mpsu', 'V24'], ['plc', 'V24'], ['battery', 'P']], '-': [['psu24', 'M1'], ['mpsu', 'C24'], ['plc', 'C24'], ['battery', 'M']],
  };
  const POTNAME = { '+': '+24 V', '-': '0 V' };
  function potKey(p) {
    for (const [t, term] of POT[p] || []) { const c = H.circ().comps.find(x => x.type === t); if (c) return c.id + ':' + term; }
    return null;
  }
  function check() {
    const errs = new Map(), used = new Map();
    for (const it of fr().items) {
      const S = K[it.k], dev = H.devOf(it.tag);
      if (!S.type) continue;
      if (S.pot && !potKey(S.pot)) { errs.set(it, `${POTNAME[S.pot] || S.pot}: no supply with this conductor in the Wiring (add one from Sources)`); continue; }
      if (S.jct) { if (dev && dev.type !== 'jct') errs.set(it, `${it.tag} is a ${DEFS[dev.type].name} in the Wiring, not a wire point`); continue; }
      if (dev && dev.type !== S.type) { errs.set(it, `${it.tag} is a ${DEFS[dev.type].name} in the Wiring, not a ${DEFS[S.type].name}`); continue; }
      // a terminal pair of a device is drawn once (one N.O. aux on a contactor, one coil, one set of main contacts…)
      const key = it.tag + '|' + S.terms.map(t => t.id).join(',');
      if (used.has(key) && !['src', 'conv', 'gen', 'batt'].includes(S.look)) errs.set(it, `${it.tag}: this part of the device is already drawn (${S.terms.map(t => t.id).join('-')})`);
      used.set(key, it);
    }
    return errs;
  }
  FD.sync = function (addWire, ensureType, ctlColor) {
    if (!H) return;
    const F = fr(), col = Circuit.POT_COLORS;
    // devices first (a supply drawn on this sheet must exist before a potential point looks for it), then the checks
    const e0 = check();
    for (const it of F.items) if (K[it.k].type && !K[it.k].pot && !e0.has(it)) ensureType(K[it.k].type, it.tag);
    const errs = check();
    FD.errs = errs;
    const key = e => {
      const [id, t] = e.split(':'), it = itemOf(id);
      if (!it || errs.has(it)) return null;
      const S = K[it.k], c = ensureType(S.type, it.tag);
      const tm = S.terms.find(q => q.id === t);
      // every end of a wire piece or potential point is the one terminal J of its junction
      const src = S.pot ? { '+': 'P1', '-': 'M1' }[S.pot] || S.pot : tm && tm.src ? t : null;
      return { k: c.id + ':' + (S.jct ? 'J' : t), pole: tm && tm.pole, src };
    };
    // a placed symbol is a device in the Wiring even before it is wired; a potential point (earth, L1, +24 V…) is wired to that supply conductor
    const ok = F.items.filter(it => !errs.has(it) && K[it.k].type);
    for (const it of ok) ensureType(K[it.k].type, it.tag);
    for (const it of ok) {
      const p = K[it.k].pot, sk = p && potKey(p);
      if (sk) addWire(ensureType('jct', it.tag).id + ':J', sk, col[{ '+': 'DC+', '-': 'DC-' }[p] || p]);
    }
    for (const w of F.wires) {
      const a = key(w.a), b = key(w.b);
      if (!a || !b) continue;
      // colour: the supply conductor it starts from, a pole of a 3-pole device (L1 L2 L3), else control wiring
      const s = a.src || b.src, p = a.pole != null && K[itemOf(w.a.split(':')[0]).k].np === 3 ? a.pole : b.pole != null && K[itemOf(w.b.split(':')[0]).k].np === 3 ? b.pole : null;
      const ph = s === 'L' ? 'L1' : s === 'P1' || s === 'P' ? 'DC+' : s === 'M1' || s === 'M' ? 'DC-' : s;
      addWire(a.k, b.k, (ph && col[ph]) || (p != null ? col[['L1', 'L2', 'L3'][p]] : ctlColor));
    }
  };

  /* ---------- view ---------- */
  let body = null, svg = null, gv = null, view = { x: 60, y: 60, k: 1 }, sel = null, wiring = null, drag = null, lastSig = '';
  FD.init = function (hooks) { H = hooks; window.addEventListener('pointerup', () => { if (held) { held(); held = null; } }); };
  const live = k => { const api = App.api; if (!api || !k) return false; for (const p of api.potsR(api.rootK(k))) if (/^L[123]$/.test(p) || p.startsWith('DC+')) return true; return false; };
  function devKey(it, t) { const d = H.devOf(it.tag); return d ? d.id + ':' + (K[it.k].jct ? 'J' : t) : null; }
  function stateOf(it) {
    const S = K[it.k];
    if (!S.type) return { on: false };
    const d = H.devOf(it.tag);
    if (!d || (FD.errs && FD.errs.has(it))) return { on: false, miss: !d };
    const st = d.state;
    if (['coil', 'tcoil', 'tcoiloff', 'icoil', 'lamp', 'horn', 'heat', 'meter'].includes(S.look)) return { on: !!(st.pulled || st.on || st.pw || st.v || (it.k === 'ltset' && st.set)) };
    if (S.jct) return { on: live(d.id + ':J') };
    if (S.look === 'motor') return { on: st.drive === 'run' || (S.type === 'fan' && !!st.on) };
    if (S.look === 'sens') return { on: !!st.act };
    if (['src', 'conv', 'gen', 'batt'].includes(S.look)) return { on: !!(st.on || st.ok || S.look === 'batt') };
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
      foot: `<path class="thin" d="M${ax} -6 V5 h-7 l-2 -4"/>`,
      press: `<rect class="thin" x="${ax - 10}" y="-5" width="10" height="10"/><path class="thin" d="M${ax - 7} 3 V-3 h3 a1.5 1.5 0 0 1 0 3 h-3"/>`,
      float: `<path class="thin" d="M${ax} 0 h-4"/><circle class="thin" cx="${ax - 8}" cy="0" r="4"/><path class="thin" d="M${ax - 14} 6 h12"/>`,
      temp: `<rect class="thin" x="${ax - 10}" y="-5" width="10" height="10"/><ellipse class="thin" cx="${ax - 5}" cy="0" rx="2.5" ry="3.5"/><path class="thin" d="M${ax - 7.5} 0 h5"/>`,
      flow: `<path class="thin" d="M${ax} -6 V6 M${ax} -6 l-8 3 l8 3"/>`,
    })[a] || '';
    if (S.look === 'no' || S.look === 'nc') {
      o.push(stub(0, -30, -14), stub(0, 14, 30));
      o.push(S.look === 'nc' ? `<path d="M0 -14 H10 M0 14 L13 -17"/>` : `<path d="M0 14 L-11 -13"/>`);
      if (S.act) o.push(`<path class="thin dash" d="M${S.look === 'nc' ? 6 : -6} 0 H-26"/>`, actMark(S.act, -26));
    } else if (S.look === 'node') {
      o.push(`<circle cx="0" cy="0" r="3.5" class="jdot"/>`);
    } else if (S.look === 'pot') {
      o.push(stub(0, -30, -11), `<circle cx="0" cy="0" r="11"/>`);
    } else if (S.look === 'wire') {
      o.push(...S.terms.map(t => `<path d="M0 0 L${t.x} ${t.y}"/>`));
      if (S.terms.length > 2) o.push(`<circle cx="0" cy="0" r="3.5" class="jdot"/>`);
      if (S.arrow) o.push(`<path d="M-8 0 L8 0 L0 14 Z" class="fill"/>`);
    } else if (S.look === 'conv') {
      o.push(stub(-10, -30, -18), stub(10, -30, -18), stub(-10, 18, 30), stub(10, 18, 30), `<rect x="-24" y="-18" width="48" height="36"/><path class="thin" d="M-24 18 L24 -18 M-18 -8 q3 -5 6 0 t6 0 M6 8 h12 M6 12 h12"/>`);
    } else if (S.look === 'batt') {
      o.push(stub(0, -30, -6), stub(0, 4, 30), `<path d="M-14 -6 H14"/><path d="M-7 4 H7" stroke-width="4"/><path class="thin" d="M10 -16 h6 M13 -19 v6"/>`);
    } else if (S.look === 'gen') {
      o.push(`<circle cx="0" cy="0" r="22"/>`, ...S.terms.filter(t => t.id !== 'PE').map(t => `<path d="M${t.x} ${t.y} L${t.x * 0.4} 20"/>`), `<path class="pe" d="M22 0 H44"/>`);
    } else if (S.look === 'gnd') {
      o.push(`<path class="pe" d="M0 -20 V0 M-10 0 H10 M-6 4 H6 M-2 8 H2"/>`);
    } else if (S.look === 'text') {
      // drawn by labels()
    } else if (S.look === 'heat') {
      o.push(stub(0, -30, -14), stub(0, 14, 30), `<rect x="-7" y="-14" width="14" height="28"/><path class="thin" d="M-7 -7 H7 M-7 0 H7 M-7 7 H7"/>`);
    } else if (S.look === 'meter') {
      o.push(stub(0, -30, -12), stub(0, 12, 30), `<circle cx="0" cy="0" r="12"/>`);
    } else if (S.look === 'sens') {
      // 3-wire sensor: a square body with the sensing symbol (diamond = proximity, arrows = light beam)
      o.push(stub(0, -30, -12), stub(0, 12, 30), `<path d="M12 0 H30"/><rect x="-12" y="-12" width="24" height="24"/>`);
      o.push(S.photo ? `<path class="thin" d="M-22 -10 l8 6 m-4 0 h4 v-3 M-22 2 l8 6 m-4 0 h4 v-3"/>` : `<path class="thin" d="M-7 0 L0 -7 L7 0 L0 7 Z"/>`);
      if (st.on) o.push(`<path class="thin" d="M3 9 L9 3"/>`);
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
      if (S.terms.some(t => t.id === 'PE')) o.push(`<path class="pe" d="M22 0 H40 M40 0 V8 M33 8 H47 M36 12 H44 M39 16 H41"/>`);
    } else {
      // multi-pole power device: one symbol per pole and a dashed link
      S.terms.filter(t => t.y < 0).forEach(t => {
        const x = t.x;
        if (S.look === 'fsw') o.push(stub(x, -30, -14), stub(x, 14, 30), `<path d="M${x} 14 L${x - 10} -12"/><rect class="thin" x="${x - 8}" y="-7" width="6" height="14" transform="rotate(21 ${x - 5} 0)"/>`);
        else if (S.look === 'fuse') o.push(stub(x, -30, -12), stub(x, 12, 30), `<rect x="${x - 5}" y="-12" width="10" height="24"/><path class="thin" d="M${x} -12 V12"/>`);
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
    if (S.look === 'node' || (S.look === 'wire' && !S.arrow)) return '';
    if (S.look === 'pot') return `<text class="mtxt sm" x="${it.x}" y="${it.y + 4}">${esc(POTNAME[S.pot] ? (S.pot === '+' ? '+' : '−') : S.pot)}</text>`;
    if (S.arrow) { const [x, y] = rot(14, 10, it.r); return `<text class="ftag start" x="${it.x + x}" y="${it.y + y}">${esc(it.tag)}</text>`; }
    if (S.look === 'text') return `<text class="ftext" x="${it.x}" y="${it.y + 4}">${esc(it.txt || '')}</text>`;
    // upright text at rotated positions
    const at = (x, y) => { const [a, b] = rot(x, y, it.r); return [it.x + a, it.y + b]; };
    const o = [];
    if (S.look === 'gnd') { const [x, y] = at(14, 10); return `<text class="sterm" x="${x}" y="${y}">PE</text>`; }
    const isPole = !['no', 'nc', 'coil', 'tcoil', 'tcoiloff', 'icoil', 'lamp', 'horn', 'heat', 'meter', 'sens'].includes(S.look);
    const [tx, ty] = S.look === 'src' ? at(0, -22) : S.look === 'motor' || S.look === 'gen' ? at(-30, -14) : S.look === 'conv' ? at(-28, -20) : at(isPole ? -((S.np || 1) * 10) - 22 : -30, -12);
    o.push(`<text class="ftag" x="${tx}" y="${ty}">-${esc(it.tag)}</text>`);
    if (S.look === 'motor' || S.look === 'gen') { const [mx, my] = at(0, 0); S.label.split('\n').forEach((l, i, a) => o.push(`<text class="mtxt" x="${mx}" y="${my + 4 + (i - (a.length - 1) / 2) * 12}">${esc(l)}</text>`)); }
    if (S.look === 'src') { const [mx, my] = at(0, 0); o.push(`<text class="mtxt sm" x="${mx}" y="${my + 4}">${esc(S.label)}</text>`); }
    // meter letter, S/R of a latching coil (in the symbol), PNP/NPN of a sensor (beside it)
    if (S.label && ['meter', 'coil', 'sens'].includes(S.look)) { const [mx, my] = S.look === 'sens' ? at(26, -16) : at(0, 0); o.push(`<text class="mtxt sm" x="${mx}" y="${my + 4}">${esc(S.label)}</text>`); }
    S.terms.forEach(t => {
      const lx = t.x + (t.id === 'PE' && (S.look === 'motor' || S.look === 'gen') ? 2 : 5), ly = t.y + (t.y < 0 ? -2 : t.y > 0 ? 10 : -6);
      const [x, y] = at(lx, ly);
      o.push(`<text class="sterm" x="${x}" y="${y}">${esc(t.id)}</text>`);
    });
    return o.join('');
  }
  /* ---------- library panel (icon grid by group) and zoom buttons around the drawing ---------- */
  const GROUPS = Object.keys(LIB);
  let libUi = { open: innerWidth > 760, grp: 'All' };
  try { const v = JSON.parse(localStorage.getItem('plc-trainer.fdLib') || 'null'); if (v && typeof v === 'object') libUi = { open: v.open !== false, grp: GROUPS.includes(v.grp) ? v.grp : 'All' }; } catch (e) { /* private mode */ }
  const saveLib = () => { try { localStorage.setItem('plc-trainer.fdLib', JSON.stringify(libUi)); } catch (e) { /* private mode */ } };
  const slug = g => g.toLowerCase();
  function icon(k) {
    const S = K[k], it = { id: 'i', k, tag: '', x: 0, y: 0, r: 0, txt: 'Text' };
    const xs = S.terms.map(t => t.x), ys = S.terms.map(t => t.y);
    const big = ['motor', 'gen'].includes(S.look) ? 48 : 30;
    const x1 = Math.min(-big, ...xs) - 10, x2 = Math.max(big, ...xs) + 10, y1 = Math.min(-30, ...ys) - 10, y2 = Math.max(30, ...ys) + 10;
    return `<button class="fd-ico g-${slug(S.g)}" data-fk="${k}" draggable="true" title="${esc(S.n)}"><svg class="sch-svg iec-svg" viewBox="${x1} ${y1} ${x2 - x1} ${y2 - y1}"><g class="ssym">${shape(it, { on: false })}</g>${labels(it, S)}</svg></button>`;
  }
  function libHtml() {
    const ks = Object.keys(K).filter(k => libUi.grp === 'All' || K[k].g === libUi.grp);
    return `<select class="fd-grp" aria-label="Symbol group"><option value="All">All</option>${GROUPS.map(g => `<option value="${g}" ${g === libUi.grp ? 'selected' : ''}>${g}</option>`).join('')}</select><div class="fd-grid">${ks.map(icon).join('')}</div>`;
  }
  function shell(el) {
    el.innerHTML = `<div class="fd-wrap${libUi.open ? '' : ' nolib'}"><aside class="fd-lib">${libHtml()}</aside><div class="fd-canvas"><div class="fd-host"></div>
      <div class="fd-zoom"><button class="tbtn" data-fz="out" title="Zoom out" aria-label="Zoom out">−</button><button class="tbtn" data-fz="fit" title="Fit the drawing">⤢</button><button class="tbtn" data-fz="in" title="Zoom in" aria-label="Zoom in">＋</button></div></div></div>`;
    const lib = el.querySelector('.fd-lib'), host = el.querySelector('.fd-host');
    lib.addEventListener('change', ev => { if (ev.target.matches('.fd-grp')) { libUi.grp = ev.target.value; saveLib(); lib.innerHTML = libHtml(); } });
    lib.addEventListener('click', ev => { const b = ev.target.closest('[data-fk]'); if (b && H.mode() === 'edit') FD.add(b.dataset.fk); });
    lib.addEventListener('dragstart', ev => { const b = ev.target.closest('[data-fk]'); if (b) { ev.dataTransfer.setData('text/fd-sym', b.dataset.fk); ev.dataTransfer.effectAllowed = 'copy'; } });
    host.addEventListener('dragover', ev => { if (ev.dataTransfer.types.includes('text/fd-sym')) ev.preventDefault(); });
    host.addEventListener('drop', ev => { const k = ev.dataTransfer.getData('text/fd-sym'); if (!K[k] || !svg) return; ev.preventDefault(); const p = world(ev); FD.add(k, undefined, snap10(p.x), snap10(p.y)); });
    el.querySelector('.fd-zoom').addEventListener('click', ev => { const b = ev.target.closest('[data-fz]'); if (b) FD.zoom(b.dataset.fz); });
  }
  FD.toggleLib = function () { libUi.open = !libUi.open; saveLib(); const w = body && body.querySelector('.fd-wrap'); if (w) w.classList.toggle('nolib', !libUi.open); return libUi.open; };
  FD.libOpen = () => libUi.open;
  FD.zoom = function (how) {
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    if (how === 'fit') {
      const its = fr().items;
      if (!its.length) { view = { x: 60, y: 60, k: 1 }; }
      else {
        const x1 = Math.min(...its.map(i => i.x)) - 70, x2 = Math.max(...its.map(i => i.x)) + 70, y1 = Math.min(...its.map(i => i.y)) - 70, y2 = Math.max(...its.map(i => i.y)) + 70;
        const k = Math.max(0.3, Math.min(2, Math.min(r.width / (x2 - x1), r.height / (y2 - y1))));
        view = { k, x: (r.width - (x2 - x1) * k) / 2 - x1 * k, y: (r.height - (y2 - y1) * k) / 2 - y1 * k };
      }
    } else {
      const k = Math.max(0.3, Math.min(3, view.k * (how === 'in' ? 1.2 : 1 / 1.2))), mx = r.width / 2, my = r.height / 2;
      view.x = mx - (mx - view.x) * k / view.k; view.y = my - (my - view.y) * k / view.k; view.k = k;
    }
    gv.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
  };
  /* Values: the voltage on a load, open/closed for a contact, the conductor on a wire point */
  FD.values = false;
  const vText = v => (!v ? '0 V' : v.kind === 'AC' ? `${v.v} V~` : `${v.rev ? '−' : ''}24 V=`);
  function valueOf(it) {
    const S = K[it.k], d = S.type && H.devOf(it.tag), api = App.api;
    if (!d || !api || (FD.errs && FD.errs.has(it))) return '';
    if (S.jct) { const set = api.potsR(api.rootK(d.id + ':J')); return set && set.size ? Circuit.potText(set) : '—'; }
    const st = stateOf(it);
    if (['no', 'nc', 'km', 'brk', 'qm', 'rcd', 'isol', 'fsw', 'fuse', 'ol'].includes(S.look)) return st.on ? 'closed' : 'open';
    if (['src', 'gen', 'conv', 'batt'].includes(S.look)) return st.on ? 'on' : 'off';
    const a = S.terms[0], b = S.terms.find(t => t !== a && t.id !== 'PE');
    return a && b ? vText(api.v(d, a.id, b.id)) : '';
  }
  FD.render = function (el) {
    body = el;
    if (!el.querySelector('.fd-host')) shell(el);
    const host = el.querySelector('.fd-host');
    const F = fr();
    FD.errs = check();
    const o = [];
    o.push(`<svg class="rung-svg sch-svg iec-svg free-svg" width="100%" height="100%"><defs><pattern id="fdGrid" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="0.5" cy="0.5" r="0.7" class="gridDot"/></pattern><pattern id="fdGrid2" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#fdGrid)"/><path d="M100 0 H0 V100" class="gridLine"/></pattern></defs><g class="fv" transform="translate(${view.x} ${view.y}) scale(${view.k})"><rect class="fbg" x="-5000" y="-5000" width="10000" height="10000" fill="url(#fdGrid2)"/>`);
    for (const w of F.wires) {
      const a = endPos(w.a), b = endPos(w.b); if (!a || !b) continue;
      const ia = itemOf(w.a.split(':')[0]), on = live(devKey(ia, w.a.split(':')[1]));
      const d = wirePath(a, b, w.pts);
      o.push(`<g class="fwire${sel && sel.w === w.id ? ' sel' : ''}" data-fw="${w.id}"><path class="fwh" d="${d}"/><path class="w${on ? ' on' : ''}" d="${d}"/></g>`);
      if (sel && sel.w === w.id) (w.pts || []).forEach(([x, y], i) => o.push(`<circle class="fbend" data-fb="${w.id}:${i}" cx="${x}" cy="${y}" r="5"><title>Drag to move · double-click to remove</title></circle>`));
    }
    for (const it of F.items) {
      const S = K[it.k], st = stateOf(it), err = FD.errs.has(it);
      const hit = S.look === 'node' ? `<rect class="hit" x="${it.x - 8}" y="${it.y - 8}" width="16" height="16" rx="8"/>`
        : S.look === 'text' ? `<rect class="hit" x="${it.x - 6}" y="${it.y - 12}" width="${(it.txt || '').length * 7.5 + 12}" height="22" rx="4"/>`
        : S.look === 'gnd' ? `<rect class="hit" x="${it.x - 14}" y="${it.y - 24}" width="28" height="36" rx="4"/>`
        : `<rect class="hit" x="${it.x - 34}" y="${it.y - 34}" width="68" height="68" rx="6"/>`;
      o.push(`<g class="fitem${sel && sel.i === it.id ? ' sel' : ''}" data-fi="${it.id}">${hit}`);
      o.push(`<g class="ssym${st.on ? ' on' : ''}${err ? ' err' : ''}${st.miss ? ' miss' : ''}" transform="translate(${it.x} ${it.y}) rotate(${it.r})">${shape(it, st)}</g>`);
      o.push(labels(it, S));
      if (FD.values) { const v = valueOf(it); if (v) o.push(`<text class="fval" x="${it.x + 26}" y="${it.y + 40}">${esc(v)}</text>`); }
      S.terms.forEach(t => { const p = termPos(it, t.id); o.push(`<circle class="fterm${wiring && wiring.from === it.id + ':' + t.id ? ' on' : ''}" data-ft="${it.id}:${t.id}" cx="${p.x}" cy="${p.y}" r="4"/>`); });
      o.push('</g>');
    }
    if (wiring && wiring.cur) { const a = endPos(wiring.from); if (a) o.push(`<path class="wtemp" d="${wirePath(a, wiring.cur)}"/>`); }
    if (!F.items.length) o.push(`<text class="hint" x="200" y="40">Empty drawing — click or drag symbols from the Library, then click a terminal and another to wire them</text>`);
    o.push('</g></svg>');
    host.innerHTML = o.join('');
    svg = host.querySelector('svg'); gv = svg.querySelector('.fv');
    bind();
    lastSig = sig();
  };
  const sig = () => { const F = fr(); return (FD.values ? F.items.map(valueOf).join(',') : '') + F.items.map(it => { const s = stateOf(it); return s.on ? 1 : 0; }).join('') + '|' + F.wires.map(w => { const ia = itemOf(w.a.split(':')[0]); return ia && live(devKey(ia, w.a.split(':')[1])) ? 1 : 0; }).join(''); };
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
    if (!['Sources', 'Switches', 'Sensors', 'Loads', 'Motors', 'Others'].includes(S.g) && same.length) return { def: same[same.length - 1], list: same };
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
  /* the nearest place to (cx, cy), on an 80 px grid around it, where no symbol is yet */
  function freeSpot(cx, cy) {
    const its = fr().items, ok = (x, y) => its.every(i => Math.abs(i.x - x) >= 70 || Math.abs(i.y - y) >= 70);
    for (let ring = 0; ring < 12; ring++) for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const x = cx + dx * 80, y = cy + dy * 80;
      if (ok(x, y)) return { x, y };
    }
    return { x: cx, y: cy };
  }
  FD.add = function (k, tag, x, y) {
    const go = t => {
      if (k === 'text') { if (!t) return 'Type some text'; } else if (!TAG.test(t)) return 'Use letters, numbers, - or _ (up to 20)';
      H.snap();
      const F = fr(); F.seq++;
      const r = svg ? svg.getBoundingClientRect() : { width: 600, height: 400 };
      const c = x != null ? { x, y } : freeSpot(snap10((r.width / 2 - view.x) / view.k), snap10((r.height / 2 - view.y) / view.k)), cx = c.x, cy = c.y;
      const it = k === 'text' ? { id: 'd' + F.seq, k, tag: 'TXT', x: snap10(cx), y: snap10(cy), r: 0, txt: t.slice(0, 80) } : { id: 'd' + F.seq, k, tag: t, x: snap10(cx), y: snap10(cy), r: 0 };
      F.items.push(it); sel = { i: it.id };
      H.changed();
      return undefined;
    };
    if (tag) return go(tag);
    // wire pieces, junctions and potential points need no tag of their own
    if (K[k].auto) return go(suggest(k).def);
    if (k === 'text') { UI.form('Text', [{ key: 't', label: 'Text', value: '' }], v => go(v.t.trim())); return undefined; }
    const sg = suggest(k);
    UI.form(K[k].n, [{ key: 't', label: 'Device tag', value: sg.def, list: sg.list }], v => go(v.t.trim()),
      '<p class="help">Use the tag of a device in the Wiring (its contacts and coil share the tag), or a new tag: the device is added to the Wiring for you.</p>');
  };
  FD.retag = function (it) {
    if (!it) return;
    if (it.k === 'text') {
      UI.form('Edit text', [{ key: 't', label: 'Text', value: it.txt || '' }], v => { const t = v.t.trim(); if (!t) return 'Type some text'; H.snap(); it.txt = t.slice(0, 80); H.changed(); return undefined; });
      return;
    }
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
    const list = TYPES.find(l => l.includes(it.k)); if (!list) { UI.toast('Only switch contacts and sensors have types'); return; }
    H.snap(); it.k = list[(list.indexOf(it.k) + 1) % list.length]; H.changed();
  };
  /* a copy of the selected symbol next to it, with a new tag (a text keeps its text) */
  FD.copy = function () {
    const it = sel && sel.i && itemOf(sel.i); if (!it) { UI.toast('Select a symbol first'); return; }
    const F = fr(), S = K[it.k];
    let tag = it.tag;
    if (S.type) { const used = new Set([...H.circ().comps.map(c => c.props.label), ...F.items.map(i => i.tag)]); let n = 1; while (used.has(S.pre + n)) n++; tag = S.pre + n; }
    H.snap(); F.seq++;
    const c = { ...it, id: 'd' + F.seq, tag, x: it.x + 40, y: it.y + 40 };
    F.items.push(c); sel = { i: c.id }; H.changed();
  };
  /* drawing order: to the front (drawn last) or to the back */
  FD.order = function (front) {
    const it = sel && sel.i && itemOf(sel.i); if (!it) return;
    const F = fr(); H.snap();
    F.items = F.items.filter(i => i !== it); if (front) F.items.push(it); else F.items.unshift(it);
    H.changed();
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
    else if (k === 'd' || k === 'D') { ev.preventDefault(); FD.copy(); }
    else if (k === 'Escape') { wiring = null; sel = null; if (body) FD.render(body); H.side(); }
  };
  FD.resetSel = () => { sel = null; wiring = null; drag = null; lastSig = ''; };
  FD.selected = () => (sel && sel.i ? itemOf(sel.i) : null);
  /* side panel for the free drawing */
  FD.side = function () {
    const it = FD.selected(), errs = FD.errs ? [...FD.errs.values()] : [];
    const d = it && H.devOf(it.tag);
    return `${it ? `<h5>${esc(K[it.k].n)} <code>-${esc(it.tag)}</code></h5>
      <div class="btn-row"><button class="btn" data-fd="retag">${it.k === 'text' ? 'Edit text…' : 'Tag…'}</button><button class="btn" data-fd="rot">⟳ Rotate (R)</button>${TYPES.some(l => l.includes(it.k)) ? '<button class="btn" data-fd="type">Type ⇄</button>' : ''}<button class="btn" data-fd="copy">⧉ Copy (D)</button><button class="btn" data-fd="front">To front</button><button class="btn" data-fd="back">To back</button><button class="btn danger" data-fd="del">Delete</button></div>
      <p class="help">${it.k === 'text' ? 'A note on the drawing.' : d ? esc(Circuit.status(d, App.ctx) || '') : 'Not in the Wiring yet.'}</p>` : '<p class="help">Select a symbol to rotate it, change its tag or its type.</p>'}
      ${errs.length ? `<h5>Problems</h5><ul class="verify">${errs.map(m => `<li class="e">${esc(m)}</li>`).join('')}</ul>` : ''}
      <ul class="tips"><li><b>▦ Library</b>: pick a group, then click a symbol or drag it onto the drawing. Drag to move, <b>R</b> to rotate, <b>Del</b> to delete.</li>
      <li>Click a terminal ● then another to draw a wire. Every drawn wire is wired in the Wiring for you.</li>
      <li>End a wire on another wire to branch it (a junction dot). Double-click a wire to add a bend, drag the bend, double-click it to remove it.</li>
      <li>Symbols with the same tag are the same device: draw its coil and its contacts anywhere.</li>
      <li><b>D</b> copies the selected symbol. Others › Text adds a note, Others › PE an earth symbol wired to the supply PE.</li>
      <li>Sources › Point L1, N, PE, +24 V… is wired to that conductor of the supply. Others › wire pieces (straight, corner, T, cross) join wires; link arrows with the same tag are connected.</li>
      <li>▶ Play: press buttons, switch breakers and trip overloads on the drawing. ✎ Values shows the voltage on each load and open/closed on each contact.</li></ul>`;
  };
  FD.bindSide = function (sideEl) {
    sideEl.querySelectorAll('[data-fd]').forEach(b => { b.onclick = () => ({ retag: () => FD.retag(FD.selected()), rot: FD.rotate, type: FD.cycleType, copy: FD.copy, front: () => FD.order(true), back: () => FD.order(false), del: FD.del })[b.dataset.fd](); });
  };
  window.FreeDraw = FD;
})();
