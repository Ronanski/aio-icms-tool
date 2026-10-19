/* Schematic: build a control circuit like a ladder — a supply rail on the left (L or +24 V), the return rail on the
   right (N or 0 V), and rungs of contacts and loads between them. Every symbol is a real device in the wiring
   (found by its tag, or created), and the rungs are wired for you, so the wiring simulator runs the circuit. */
(function () {
  'use strict';
  const esc = UI.esc;
  const { DEFS } = Circuit;
  const SC = {};

  /* symbol kinds: the device type and the two terminals the symbol uses (a = left/in, b = right/out).
     Relays have two changeover poles: a second contact on the same relay uses pole 2 (a2/b2). */
  const SK = {
    pbno: { n: 'Push button N.O.', g: 'Inputs', type: 'pb_no', a: '13', b: '14', sym: 'no', part: 'btn', mom: true, pre: 'S' },
    pbnc: { n: 'Push button N.C.', g: 'Inputs', type: 'pb_nc', a: '11', b: '12', sym: 'nc', part: 'btn', mom: true, pre: 'S' },
    sel: { n: 'Selector switch', g: 'Inputs', type: 'sel2', a: '13', b: '14', sym: 'no', part: 'knob', pre: 'S' },
    estop: { n: 'Emergency stop', g: 'Inputs', type: 'estop', a: '11', b: '12', sym: 'nc', part: 'btn', pre: 'S' },
    lsno: { n: 'Limit switch N.O.', g: 'Inputs', type: 'limit', a: '13', b: '14', sym: 'no', part: 'lever', pre: 'SQ' },
    lsnc: { n: 'Limit switch N.C.', g: 'Inputs', type: 'limit', a: '21', b: '22', sym: 'nc', part: 'lever', pre: 'SQ' },
    kmno: { n: 'Contactor aux N.O.', g: 'Contacts', type: 'contactor', a: '13', b: '14', sym: 'no', pre: 'KM' },
    kmnc: { n: 'Contactor aux N.C.', g: 'Contacts', type: 'contactor', a: '21', b: '22', sym: 'nc', pre: 'KM' },
    kano: { n: 'Relay contact N.O.', g: 'Contacts', type: 'relay', a: '11', b: '14', a2: '21', b2: '24', sym: 'no', pre: 'KA' },
    kanc: { n: 'Relay contact N.C.', g: 'Contacts', type: 'relay', a: '11', b: '12', a2: '21', b2: '22', sym: 'nc', pre: 'KA' },
    ktno: { n: 'Timer contact N.O.', g: 'Contacts', type: 'timer', a: '15', b: '18', sym: 'tno', pre: 'KT' },
    ktnc: { n: 'Timer contact N.C.', g: 'Contacts', type: 'timer', a: '15', b: '16', sym: 'tnc', pre: 'KT' },
    olnc: { n: 'Overload contact N.C.', g: 'Contacts', type: 'olr', a: '95', b: '96', sym: 'olnc', pre: 'F' },
    olno: { n: 'Overload contact N.O.', g: 'Contacts', type: 'olr', a: '97', b: '98', sym: 'olno', pre: 'F' },
    kmcoil: { n: 'Contactor coil', g: 'Loads', type: 'contactor', a: 'A1', b: 'A2', sym: 'coil', pre: 'KM', out: true },
    kacoil: { n: 'Relay coil', g: 'Loads', type: 'relay', a: 'A1', b: 'A2', sym: 'coil', pre: 'KA', out: true },
    ktcoil: { n: 'Timer coil (on-delay)', g: 'Loads', type: 'timer', a: 'A1', b: 'A2', sym: 'tcoil', pre: 'KT', out: true },
    lamp: { n: 'Pilot lamp', g: 'Loads', type: 'lamp', a: 'X1', b: 'X2', sym: 'lamp', pre: 'H', out: true },
    horn: { n: 'Buzzer', g: 'Loads', type: 'buzzer', a: 'X1', b: 'X2', sym: 'horn', pre: 'HA', out: true },
  };
  SC.KINDS = SK;
  /* power circuit (IEC view): 3-pole devices in a feeder, from the 3-phase supply down to the motor */
  const PK = {
    qf3: { n: 'Circuit breaker 3-pole', type: 'mccb3', ins: ['1', '3', '5'], outs: ['2', '4', '6'], part: 'h', pre: 'Q' },
    qm3: { n: 'Motor protection breaker 3-pole', type: 'mpcb', ins: ['1', '3', '5'], outs: ['2', '4', '6'], part: 'h', pre: 'QM' },
    km3: { n: 'Contactor main contacts', type: 'contactor', ins: ['1', '3', '5'], outs: ['2', '4', '6'], pre: 'KM' },
    ol3: { n: 'Overload relay (heaters)', type: 'olr', ins: ['1', '3', '5'], outs: ['2', '4', '6'], pre: 'F' },
    m3: { n: 'Motor 3~', type: 'motor', ins: ['U1', 'V1', 'W1'], outs: null, pre: 'M', part: 'jam' },
    // star-delta: the motor with its delta contactor (from the feeder to W2 U2 V2) and star contactor (joins W2 U2 V2)
    m6: { n: 'Motor star-delta (Y-Δ)', type: 'motor6', ins: ['U1', 'V1', 'W1'], outs: null, pre: 'M', part: 'jam', sd: true },
  };
  SC.PKINDS = PK;
  const PH3 = ['L1', 'L2', 'L3'];
  const TAG = /^[A-Za-z0-9_-]{1,20}$/;

  const sch = () => App.project.schematic;
  const circ = () => App.project.circuit;
  const devOf = tag => circ().comps.find(c => c.props.label === tag);
  // a load, or a branch made only of loads (a coil with a lamp across it)
  const isOut = e => (e.k === 'br' ? e.legs.length > 0 && e.legs.every(l => l.length && l.every(isOut)) : !!(SK[e.k] && SK[e.k].out));

  /* ---------- data: clean a saved/imported schematic ---------- */
  function cleanSeq(a, depth) {
    return (Array.isArray(a) ? a : []).map(e => {
      if (!e || typeof e !== 'object') return null;
      if (e.k === 'br' && depth < 4) { const legs = (Array.isArray(e.legs) ? e.legs : []).map(l => cleanSeq(l, depth + 1)); return legs.length ? { k: 'br', legs } : null; }
      if (!Object.prototype.hasOwnProperty.call(SK, e.k) || typeof e.tag !== 'string' || !TAG.test(e.tag)) return null;
      return { k: e.k, tag: e.tag };
    }).filter(Boolean);
  }
  function cleanPower(p) {
    const o = p && typeof p === 'object' ? p : {};
    const okTag = t => typeof t === 'string' && TAG.test(t);
    const seq = a => (Array.isArray(a) ? a : []).filter(e => e && typeof e === 'object' && Object.prototype.hasOwnProperty.call(PK, e.k) && okTag(e.tag) && (!PK[e.k].sd || (okTag(e.delta) && okTag(e.star))))
      .map(e => (PK[e.k].sd ? { k: e.k, tag: e.tag, delta: e.delta, star: e.star } : { k: e.k, tag: e.tag })).slice(0, 12);
    return { src: typeof o.src === 'string' && TAG.test(o.src) ? o.src : 'Q0', main: seq(o.main), feeders: (Array.isArray(o.feeders) ? o.feeders : []).filter(f => f && typeof f === 'object').slice(0, 20).map(f => ({ elems: seq(f.elems) })) };
  }
  SC.clean = function (s, termOk) {
    const o = s && typeof s === 'object' ? s : {};
    return {
      L: typeof o.L === 'string' && termOk(o.L) ? o.L : null,
      N: typeof o.N === 'string' && termOk(o.N) ? o.N : null,
      rungs: (Array.isArray(o.rungs) ? o.rungs : []).filter(r => r && typeof r === 'object').map(r => ({ elems: cleanSeq(r.elems, 0), comment: typeof r.comment === 'string' ? r.comment.slice(0, 200) : '' })),
      power: cleanPower(o.power),
      free: FreeDraw.clean(o.free),
    };
  };

  /* ---------- supply rails ---------- */
  function supplyChoices() {
    const out = [];
    for (const c of circ().comps) {
      const d = DEFS[c.type];
      if (d.junction) continue;
      for (const t of d.terms) out.push({ k: c.id + ':' + t.id, l: `${c.props.label}:${t.l}`, type: c.type, t: t.id });
    }
    return out;
  }
  /* a sensible default: the 24 V supply, else the 1-phase supply, else L1/N of the 3-phase supply */
  function autoRails() {
    const cs = circ().comps, f = t => cs.find(c => c.type === t);
    const g = f('psu24'), s1 = f('supply1'), s3 = f('supply3');
    if (g) return [g.id + ':P2', g.id + ':M2'];
    if (s1) return [s1.id + ':L', s1.id + ':N'];
    if (s3) return [s3.id + ':L1', s3.id + ':N'];
    return [null, null];
  }
  const railOk = k => { if (!k) return false; const [cid, tid] = k.split(':'); const c = circ().comps.find(x => x.id === cid); return !!c && DEFS[c.type].terms.some(t => t.id === tid); };
  function controlVoltage() {
    const k = sch().L; const c = k && circ().comps.find(x => x.id === k.split(':')[0]);
    return c && c.type === 'psu24' ? '24VDC' : '230VAC';
  }

  /* ---------- checks: one device per tag; a contact pole is used once ---------- */
  function check() {
    const errs = new Map(), use = new Map();   // element -> message ; tag -> {kinds}
    const walk = arr => arr.forEach(e => {
      if (e.k === 'br') { e.legs.forEach(walk); return; }
      const K = SK[e.k], dev = devOf(e.tag);
      if (dev && dev.type !== K.type) { errs.set(e, `${e.tag} is a ${DEFS[dev.type].name} in the Wiring, not a ${DEFS[K.type].name}`); return; }
      const u = use.get(e.tag) || { list: [] }; u.list.push(e); use.set(e.tag, u);
    });
    sch().rungs.forEach(r => walk(r.elems));
    for (const [tag, u] of use) {
      // which terminal pairs are used, and pole numbers for relays
      const seen = new Map(); let poles = 0;
      for (const e of u.list) {
        const K = SK[e.k];
        if (K.type === 'relay' && !K.out) { e.p = ++poles; if (poles > 2) { errs.set(e, `${tag} has only 2 contacts — add another relay`); } continue; }
        const key = K.a + '-' + K.b;
        const shared = (K.type === 'timer' && !K.out) || ['pb_no', 'pb_nc', 'sel2', 'estop'].includes(K.type);
        const sk = shared && !K.out ? 'contact' : key;
        if (seen.has(sk)) errs.set(e, K.type === 'contactor' ? `${tag}: this contact is already used in another place (a contactor has one N.O. and one N.C. aux contact — use a relay KA for more)` : `${tag}: this contact is already used in another place`);
        seen.set(sk, e);
      }
    }
    return errs;
  }

  /* ---------- create devices and wire the rungs ---------- */
  function freeSpot() {
    let x1 = 0, y0 = 40;
    for (const c of circ().comps) { const d = DEFS[c.type], s = c.props.size || 1; x1 = Math.max(x1, c.x + d.w * s); }
    const n = circ().comps.filter(c => c.schAuto).length;
    return { x: Math.round((x1 + 120) / 10) * 10 + (n % 6) * 110, y: y0 + Math.floor(n / 6) * 170 };
  }
  function ensureType(type, tag) {
    let c = devOf(tag);
    if (c) return c;
    const p = freeSpot();
    c = Circuit.create(type, p.x, p.y, circ());
    c.props.label = tag;
    if (DEFS[type].pdefs && DEFS[type].pdefs.some(f => f.k === 'coil')) c.props.coil = controlVoltage();
    if ('on' in c.state && DEFS[type].breaker) c.state.on = true;
    c.schAuto = true;
    circ().comps.push(c);
    App.log('system', `Electrical Diagram added ${DEFS[type].name} ${tag} to the wiring`);
    return c;
  }
  const ensureDevice = e => ensureType(SK[e.k].type, e.tag);
  const pw = () => { const s = sch(); if (!s.power) s.power = cleanPower(null); return s.power; };
  const hasPower = () => { const p = pw(); return p.main.length > 0 || p.feeders.some(f => f.elems.length); };
  /* power checks: right device type, main contacts used once, the motor ends its feeder */
  function checkPower() {
    const errs = new Map(), used = new Map(), P = pw();
    const one = (e, last) => {
      const K = PK[e.k], dev = devOf(e.tag);
      if (dev && dev.type !== K.type) { errs.set(e, `${e.tag} is a ${DEFS[dev.type].name} in the Wiring, not a ${DEFS[K.type].name}`); return; }
      if (used.has(e.tag)) { errs.set(e, `${e.tag}: its main contacts are already used in the power circuit`); return; }
      used.set(e.tag, e);
      if (PK[e.k].ins[0] === 'U1' && !last) errs.set(e, `${e.tag}: the motor must be the last device of its feeder`);
      if (K.sd) for (const t of [e.delta, e.star]) {
        const d = devOf(t);
        if (d && d.type !== 'contactor') errs.set(e, `${t} is a ${DEFS[d.type].name} in the Wiring, not a contactor`);
        else if (used.has(t) || t === e.tag || e.delta === e.star) errs.set(e, `${t}: its main contacts are already used in the power circuit`);
        else used.set(t, e);
      }
    };
    P.main.forEach(e => { if (PK[e.k].ins[0] === 'U1') errs.set(e, 'A motor cannot be in the main supply section'); else one(e, false); });
    P.feeders.forEach(f => f.elems.forEach((e, i) => one(e, i === f.elems.length - 1)));
    return errs;
  }
  function syncPower(wire) {
    if (!hasPower()) return;
    const P = pw(), src = ensureType('supply3', P.src), perrs = SC.perrs;
    let cur = PH3.map(t => src.id + ':' + t);
    const col = Circuit.POT_COLORS;
    const pole = (a, b, i) => wire(a, b, col[PH3[i]]);
    for (const e of P.main) {
      if (perrs.has(e)) break;
      const K = PK[e.k], c = ensureType(K.type, e.tag);
      K.ins.forEach((t, i) => pole(cur[i], c.id + ':' + t, i));
      cur = K.outs.map(t => c.id + ':' + t);
    }
    const bus = cur;
    for (const f of P.feeders) {
      let at = bus;
      for (const e of f.elems) {
        if (perrs.has(e)) break;
        const K = PK[e.k], c = ensureType(K.type, e.tag);
        K.ins.forEach((t, i) => pole(at[i], c.id + ':' + t, i));
        if (!K.outs) {
          wire(src.id + ':PE', c.id + ':PE', col.PE);
          if (K.sd) {
            // delta: feeder → KM(delta) 1-3-5 → 2-4-6 → W2 U2 V2 ; star: W2 U2 V2 → KM(star) 1-3-5, 2-4-6 bridged
            const d = ensureType('contactor', e.delta), y = ensureType('contactor', e.star), m2 = ['W2', 'U2', 'V2'];
            ['1', '3', '5'].forEach((t, i) => pole(at[i], d.id + ':' + t, i));
            ['2', '4', '6'].forEach((t, i) => pole(d.id + ':' + t, c.id + ':' + m2[i], i));
            ['1', '3', '5'].forEach((t, i) => pole(c.id + ':' + m2[i], y.id + ':' + t, i));
            wire(y.id + ':2', y.id + ':4', col.L2); wire(y.id + ':4', y.id + ':6', col.L2);
          }
          break;
        }
        at = K.outs.map(t => c.id + ':' + t);
      }
    }
  }
  function terms(e) {
    const K = SK[e.k], c = ensureDevice(e);
    const p2 = K.type === 'relay' && !K.out && e.p === 2;
    return [c.id + ':' + (p2 ? K.a2 : K.a), c.id + ':' + (p2 ? K.b2 : K.b)];
  }
  SC.sync = function () {
    if (!App.project || !sch()) return;
    const s = sch(), C = circ();
    C.wires = C.wires.filter(w => !w.sch);
    if (!railOk(s.L) || !railOk(s.N)) { [s.L, s.N] = autoRails(); }
    const errs = check();
    SC.errs = errs;
    SC.perrs = checkPower();
    const seen = new Set();
    const addWire = (a, b, color) => {
      if (!a || !b || a === b) return;
      const k = a < b ? a + '|' + b : b + '|' + a;
      if (seen.has(k)) return;
      seen.add(k);
      C.seq = (C.seq || 0) + 1;
      C.wires.push({ id: 'w' + C.seq, a, b, pts: [], color, sch: true });
    };
    syncPower(addWire);
    FreeDraw.sync(addWire, ensureType, controlVoltage() === '24VDC' ? '#d33a2c' : '#1d1d1d');
    if (!railOk(s.L) || !railOk(s.N)) { [s.L, s.N] = autoRails(); }
    if (railOk(s.L) && railOk(s.N)) {
      const color = controlVoltage() === '24VDC' ? '#d33a2c' : '#1d1d1d';   // control wiring: 24 V red, 230 V black
      const wire = (a, b) => addWire(a, b, color);
      const inKey = e => (e.k === 'br' ? (e.legs[0] && e.legs[0][0] ? inKey(e.legs[0][0]) : null) : terms(e)[0]);
      const seq = (arr, from, to) => {
        let cur = from;
        arr.forEach((e, i) => {
          if (e.k === 'br') {
            const next = i + 1 < arr.length ? inKey(arr[i + 1]) : to;
            // an empty leg is still being built: it stays open (it is not a bypass wire)
            e.legs.forEach(l => { if (l.length) seq(l, cur, next); });
            cur = next;
            return;
          }
          const [a, b] = terms(e);
          wire(cur, a);
          cur = b;
        });
        wire(cur, to);
      };
      const bad = arr => arr.some(e => (e.k === 'br' ? e.legs.some(bad) : errs.has(e)));
      s.rungs.forEach(r => { if (r.elems.length && !bad(r.elems)) seq(r.elems, s.L, s.N); });
    }
    App.circuitChanged();
  };

  /* ---------- layout and drawing (same idea as the ladder) ---------- */
  const CW = 96, RH = 84, WY = 44, BP = 14, EMPTYW = 60, LM = 16, RM = 16;
  /* w = length along the current path, h = width across it (branch legs side by side) */
  const DH = { A: CW, C: RH, E: EMPTYW, P: BP };
  function lay(arr, D = DH) {
    const items = arr.map(e => {
      if (e.k !== 'br') return { e, w: D.A, h: D.C };
      const legs = e.legs.map(l => (l.length ? lay(l, D) : { items: [], w: D.E, h: D.C, empty: true }));
      const lw = Math.max(D.E, ...legs.map(l => l.w));
      return { e, w: lw + D.P * 2, h: legs.reduce((s, l) => s + l.h, 0), legs, lw };
    });
    return { items, w: items.reduce((s, b) => s + b.w, 0), h: Math.max(D.C, ...items.map(b => b.h)) };
  }
  let SEL = { r: -1, e: null, leg: null }, mode = 'edit';
  const hw = (x1, x2, y, live) => `<line class="w${live ? ' on' : ''}" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`;
  function state(e) {
    // closed? energized? live at the input?
    const K = SK[e.k], c = devOf(e.tag), api = App.api;
    if (!c) return { missing: true };
    if (SC.errs && SC.errs.has(e)) return { c, closed: false, on: false, inLive: false, outLive: false };   // not wired
    const [a, b] = (() => { try { return terms(e); } catch (err) { return [null, null]; } })();
    const live = k => { if (!api || !k) return false; for (const p of api.potsR(api.rootK(k))) if (/^L[123]$/.test(p) || p.startsWith('DC+')) return true; return false; };
    let closed = false;
    if (!K.out) { const pr = DEFS[c.type].conduct ? DEFS[c.type].conduct(c, App.ctx) || [] : []; closed = pr.some(([x, y]) => (c.id + ':' + x === a && c.id + ':' + y === b) || (c.id + ':' + y === a && c.id + ':' + x === b)); }
    const s = c.state, on = K.out ? !!(s.pulled || s.on || s.pw) : closed;
    return { c, closed, on, inLive: live(a), outLive: live(b) };
  }
  function sym(e, x, y, st) {
    const K = SK[e.k], cx = x + CW / 2, o = [];
    const cls = `ssym${st.on ? ' on' : ''}${SC.errs && SC.errs.has(e) ? ' err' : ''}${st.missing ? ' miss' : ''}`;
    o.push(`<g class="${cls}">`);
    const contact = nc => `<path d="M${cx - 12} ${y - 12} V${y + 12} M${cx + 12} ${y - 12} V${y + 12}"/>` + (nc ? `<path d="M${cx - 14} ${y + 12} L${cx + 14} ${y - 12}"/>` : '');
    switch (K.sym) {
      case 'no': o.push(contact(false)); break;
      case 'nc': o.push(contact(true)); break;
      case 'tno': o.push(contact(false), `<path class="thin" d="M${cx - 6} ${y - 20} H${cx + 6} M${cx} ${y - 20} V${y - 12}"/>`); break;
      case 'tnc': o.push(contact(true), `<path class="thin" d="M${cx - 6} ${y - 20} H${cx + 6} M${cx} ${y - 20} V${y - 12}"/>`); break;
      case 'olnc': o.push(contact(true), `<path class="thin" d="M${cx - 8} ${y + 20} q4 -6 8 0 t8 0"/>`); break;
      case 'olno': o.push(contact(false), `<path class="thin" d="M${cx - 8} ${y + 20} q4 -6 8 0 t8 0"/>`); break;
      case 'coil': o.push(`<circle cx="${cx}" cy="${y}" r="13"/>`); break;
      case 'tcoil': o.push(`<rect x="${cx - 14}" y="${y - 12}" width="28" height="24" rx="2"/><path class="thin" d="M${cx - 8} ${y - 4} H${cx + 8} M${cx} ${y - 4} V${y + 6}"/>`); break;
      case 'lamp': o.push(`<circle cx="${cx}" cy="${y}" r="13"/><path class="thin" d="M${cx - 9} ${y - 9} L${cx + 9} ${y + 9} M${cx + 9} ${y - 9} L${cx - 9} ${y + 9}"/>`); break;
      case 'horn': o.push(`<path d="M${cx - 12} ${y - 8} H${cx - 4} L${cx + 10} ${y - 16} V${y + 16} L${cx - 4} ${y + 8} H${cx - 12} Z"/>`); break;
    }
    o.push('</g>');
    return o.join('');
  }
  /* draws a series of symbols; liveIn = power arrives from the left. Returns where it ends and whether power leaves it. */
  function renderSeq(L, x, y, o, liveIn) {
    let cx = x, live = liveIn;
    L.items.forEach(b => {
      if (b.e.k !== 'br') {
        const st = state(b.e), wy = y + WY;
        const sel = SEL.e === b.e ? ' sel' : '';
        o.push(`<g class="sel-el${sel}" data-path="${pathOf(b.e)}" data-kind="${esc(SK[b.e.k].sym)}"><rect class="hit" x="${cx + 2}" y="${y + 4}" width="${CW - 4}" height="${RH - 8}" rx="6"/>`);
        o.push(hw(cx, cx + CW / 2 - 14, wy, st.inLive), hw(cx + CW / 2 + 14, cx + CW, wy, st.outLive));
        o.push(`<text class="stag" x="${cx + CW / 2}" y="${wy - 22}">${esc(b.e.tag)}</text>`);
        o.push(`<text class="skind" x="${cx + CW / 2}" y="${wy + 32}">${esc(kindShort(b.e))}</text>`);
        o.push(sym(b.e, cx, wy, st), '</g>');
        live = !!st.outLive;
      } else {
        let ly = y, any = false; const ys = [];
        b.legs.forEach((L2, li) => {
          const wy = ly + WY; ys.push(wy);
          const lsel = SEL.leg === b.e && SEL.li === li ? ' sel' : '';
          let out = false;
          if (L2.empty) o.push(`<g class="sleg${lsel}" data-path="${pathOf(b.e)}" data-li="${li}"><rect class="hit" x="${cx + BP}" y="${wy - 16}" width="${b.lw}" height="32" rx="6"/>${hw(cx + BP, cx + BP + b.lw, wy, false)}</g>`);
          else { out = renderSeq(L2, cx + BP, ly, o, live).live; if (L2.w < b.lw) o.push(hw(cx + BP + L2.w, cx + BP + b.lw, wy, out)); }
          any = any || out;
          o.push(hw(cx + 4, cx + BP, wy, live), hw(cx + BP + b.lw, cx + b.w - 4, wy, out));
          ly += L2.h;
        });
        o.push(`<line class="w${live ? ' on' : ''}" x1="${cx + 4}" y1="${ys[0]}" x2="${cx + 4}" y2="${ys[ys.length - 1]}"/><line class="w${any ? ' on' : ''}" x1="${cx + b.w - 4}" y1="${ys[0]}" x2="${cx + b.w - 4}" y2="${ys[ys.length - 1]}"/>`);
        o.push(hw(cx, cx + 4, y + WY, live), hw(cx + b.w - 4, cx + b.w, y + WY, any));
        live = any;
      }
      cx += b.w;
    });
    return { x: cx, live };
  }
  /* ---------- IEC view: L on top, N at the bottom, one numbered column per current path, power circuit on the right ---------- */
  const VE = 92, VL = 104, VX = 60, VB = 14, VEMPTY = 60, RT = 52, FW = 112, PE_ = 92;
  const DV = { A: VE, C: VL, E: VEMPTY, P: VB };
  let style = 'iec';
  try { const v = localStorage.getItem('plc-trainer.schStyle'); style = v === 'nema' || v === 'free' ? v : 'iec'; } catch (e) { /* private mode */ }
  const vw = (x, y1, y2, live, cls = '') => (y2 > y1 ? `<line class="w${live ? ' on' : ''}${cls}" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>` : '');
  function termIds(e) { const K = SK[e.k], p2 = K.type === 'relay' && !K.out && e.p === 2; return [p2 ? K.a2 : K.a, p2 ? K.b2 : K.b]; }
  const MARK = { pbno: 'push', pbnc: 'push', sel: 'turn', estop: 'mush', lsno: 'roll', lsnc: 'roll', ktno: 'delay', ktnc: 'delay', olnc: 'therm', olno: 'therm' };
  /* IEC 60617-style symbols drawn upright, centred on (x, y); the path enters at y-14 and leaves at y+14 */
  function symV(e, x, y, st) {
    const K = SK[e.k], t = y - 14, b = y + 14, o = [];
    o.push(`<g class="ssym${st.on ? ' on' : ''}${SC.errs && SC.errs.has(e) ? ' err' : ''}${st.missing ? ' miss' : ''}">`);
    const nc = ['nc', 'tnc', 'olnc'].includes(K.sym);
    if (!K.out) {
      o.push(nc ? `<path d="M${x} ${t} H${x + 10} M${x} ${b} L${x + 13} ${t - 3}"/>` : `<path d="M${x} ${b} L${x - 11} ${t + 1}"/>`);
      const m = MARK[e.k];
      if (m) {
        const bx = nc ? x + 6 : x - 6, ax = x - 26;
        o.push(`<path class="thin dash" d="M${bx} ${y} H${ax}"/>`);
        o.push({
          push: `<path class="thin" d="M${ax} ${y - 6} V${y + 6} M${ax} ${y - 6} h-4 M${ax} ${y + 6} h-4"/>`,
          turn: `<path class="thin" d="M${ax - 4} ${y - 6} H${ax} V${y + 6} H${ax + 4}"/>`,
          mush: `<path class="thin" d="M${ax} ${y - 7} V${y + 7} M${ax} ${y - 7} a7 7 0 0 0 0 14"/>`,
          roll: `<path class="thin" d="M${ax} ${y} l-7 -5 v10 z"/>`,
          therm: `<path class="thin" d="M${ax} ${y - 6} h-5 v6 h5 v6"/>`,
          delay: `<path class="thin" d="M${ax} ${y - 7} a7 7 0 0 0 0 14"/>`,
        }[m]);
      }
    } else if (K.sym === 'coil' || K.sym === 'tcoil') {
      o.push(`<path d="M${x} ${t} V${y - 9} M${x} ${y + 9} V${b}"/><rect x="${x - 14}" y="${y - 9}" width="28" height="18"/>`);
      if (K.sym === 'tcoil') o.push(`<rect x="${x - 26}" y="${y - 9}" width="12" height="18"/><path class="thin" d="M${x - 26} ${y - 9} L${x - 14} ${y + 9} M${x - 14} ${y - 9} L${x - 26} ${y + 9}"/>`);
    } else if (K.sym === 'lamp') {
      o.push(`<path d="M${x} ${t} V${y - 11} M${x} ${y + 11} V${b}"/><circle cx="${x}" cy="${y}" r="11"/><path class="thin" d="M${x - 8} ${y - 8} L${x + 8} ${y + 8} M${x + 8} ${y - 8} L${x - 8} ${y + 8}"/>`);
    } else if (K.sym === 'horn') {
      o.push(`<path d="M${x} ${t} V${y - 4} M${x} ${y + 8} V${b}"/><path d="M${x - 12} ${y + 8} H${x + 12} M${x - 9} ${y + 8} a9 11 0 0 1 18 0"/>`);
    }
    o.push('</g>');
    return o.join('');
  }
  function renderSeqV(L, a, c, o, liveIn) {
    let ca = a, live = liveIn;
    const wx = c + VX;
    L.items.forEach(b => {
      if (b.e.k !== 'br') {
        const st = state(b.e), cy = ca + VE / 2, sel = SEL.e === b.e ? ' sel' : '', [ta, tb] = termIds(b.e);
        o.push(`<g class="sel-el${sel}" data-path="${pathOf(b.e)}" data-kind="${esc(SK[b.e.k].sym)}"><rect class="hit" x="${c + 2}" y="${ca + 2}" width="${VL - 4}" height="${VE - 4}" rx="6"/>`);
        o.push(vw(wx, ca, cy - 14, st.inLive), vw(wx, cy + 14, ca + VE, st.outLive));
        o.push(`<text class="stag iec" x="${wx - 32}" y="${cy - 10}">-${esc(b.e.tag)}</text>`);
        o.push(`<text class="sterm" x="${wx + 6}" y="${cy - 17}">${esc(ta)}</text><text class="sterm" x="${wx + 6}" y="${cy + 25}">${esc(tb)}</text>`);
        o.push(symV(b.e, wx, cy, st), '</g>');
        live = !!st.outLive;
      } else {
        let lc = c, any = false; const xs = [];
        b.legs.forEach((L2, li) => {
          const lx = lc + VX; xs.push(lx);
          const lsel = SEL.leg === b.e && SEL.li === li ? ' sel' : '';
          let out = false;
          if (L2.empty) o.push(`<g class="sleg${lsel}" data-path="${pathOf(b.e)}" data-li="${li}"><rect class="hit" x="${lx - 16}" y="${ca + VB}" width="32" height="${b.lw}" rx="6"/>${vw(lx, ca + VB, ca + VB + b.lw, false, ' open')}</g>`);
          else { out = renderSeqV(L2, ca + VB, lc, o, live).live; if (L2.w < b.lw) o.push(vw(lx, ca + VB + L2.w, ca + VB + b.lw, out)); }
          any = any || out;
          o.push(vw(lx, ca + 4, ca + VB, live), vw(lx, ca + VB + b.lw, ca + b.w - 4, out));
          lc += L2.h;
        });
        const x1 = xs[0], x2 = xs[xs.length - 1];
        o.push(hw(x1, x2, ca + 4, live), hw(x1, x2, ca + b.w - 4, any), `<circle class="jn" cx="${x1}" cy="${ca + 4}" r="2.6"/><circle class="jn" cx="${x1}" cy="${ca + b.w - 4}" r="2.6"/>`);
        o.push(vw(wx, ca, ca + 4, live), vw(wx, ca + b.w - 4, ca + b.w, any));
        live = any;
      }
      ca += b.w;
    });
    return { a: ca, live };
  }
  /* ---------- power circuit drawing ---------- */
  let SELP = null;   // {f: -1 main | feeder index, i: element index or null}
  const phaseLive = (k, ph) => { const api = App.api; if (!api || !k) return false; return api.potsR(api.rootK(k)).has(ph); };
  function powerKeys(e) {
    const K = PK[e.k], c = devOf(e.tag);
    if (!c || (SC.perrs && SC.perrs.has(e))) return null;
    return { c, ins: K.ins.map(t => c.id + ':' + t), outs: K.outs ? K.outs.map(t => c.id + ':' + t) : null };
  }
  function psym(e, lx, cy, o, path) {
    const K = PK[e.k], xs = [lx + 50, lx + 66, lx + 82], k = powerKeys(e), st = k ? k.c.state : {};
    const err = SC.perrs && SC.perrs.has(e), sel = SELP && SELP.path === path ? ' sel' : '';
    o.push(`<g class="sel-el pel${sel}" data-pp="${path}"><rect class="hit" x="${lx + 2}" y="${cy - PE_ / 2 + 2}" width="${FW - 4}" height="${PE_ - 4}" rx="6"/>`);
    o.push(`<text class="stag iec" x="${lx + 30}" y="${cy + 4}">-${esc(e.tag)}</text>`);
    const t = cy - 14, b = cy + 14, cls = `ssym${err ? ' err' : ''}${!k ? ' miss' : ''}`;
    xs.forEach((x, i) => {
      const ph = PH3[i];
      o.push(`<line class="pw p${i + 1}${k && phaseLive(k.ins[i], ph) ? ' on' : ''}" x1="${x}" y1="${cy - PE_ / 2}" x2="${x}" y2="${K.outs ? t : cy - 18}"/>`);
      if (K.outs) o.push(`<line class="pw p${i + 1}${k && phaseLive(k.outs[i], ph) ? ' on' : ''}" x1="${x}" y1="${b}" x2="${x}" y2="${cy + PE_ / 2}"/>`);
    });
    o.push(`<g class="${cls}">`);
    if (e.k === 'm3') {
      const run = st.drive === 'run';
      o.push(`<path d="M${xs[0]} ${cy - 18} L${xs[1] - 6} ${cy - 8} M${xs[2]} ${cy - 18} L${xs[1] + 6} ${cy - 8}"/><circle cx="${xs[1]}" cy="${cy + 6}" r="17" class="${run ? 'mon' : ''}"/>`);
      o.push(`<text class="mtxt" x="${xs[1]}" y="${cy + 3}">M</text><text class="mtxt sm" x="${xs[1]}" y="${cy + 16}">3~</text>`);
      o.push(`<path class="pe" d="M${xs[1] + 17} ${cy + 6} H${lx + FW - 6} V${cy + 22} M${lx + FW - 14} ${cy + 22} H${lx + FW + 2} M${lx + FW - 11} ${cy + 26} H${lx + FW - 1} M${lx + FW - 8} ${cy + 30} H${lx + FW - 4}"/><text class="sterm" x="${lx + FW - 22}" y="${cy + 38}">PE</text>`);
    } else if (e.k === 'ol3') {
      o.push(`<rect x="${xs[0] - 8}" y="${t + 4}" width="${xs[2] - xs[0] + 16}" height="20"/>`);
      xs.forEach(x => o.push(`<path d="M${x} ${t} V${t + 8} h-4 v8 h4 V${b}"/>`));
    } else {
      xs.forEach(x => {
        o.push(`<path d="M${x} ${b} L${x - 10} ${t + 2}"/>`);
        if (e.k === 'km3') o.push(`<path class="thin" d="M${x - 4} ${t} a4 4 0 0 0 8 0"/>`);
        else o.push(`<path class="thin" d="M${x - 3} ${t - 3} l6 6 M${x + 3} ${t - 3} l-6 6"/>`);
      });
      o.push(`<path class="thin dash" d="M${xs[0] - 5} ${cy} H${xs[2] - 5}"/>`);
      if (e.k === 'qm3') o.push(`<path class="thin" d="M${xs[0] - 5} ${cy} h-12 m0 -6 v12"/><path class="thin" d="M${xs[2] + 4} ${cy - 6} h6 v6 h-6 v6"/>`);
      if (e.k === 'qf3') o.push(`<path class="thin" d="M${xs[0] - 5} ${cy} h-12 m0 -6 v12"/>`);
    }
    o.push('</g></g>');
  }
  /* star-delta motor: two rows deep, two lanes wide — motor in the feeder lane, delta and star contactors beside it */
  const isSd = e => !!PK[e.k].sd;
  const feedW = f => (f.elems.some(isSd) ? 2 : 1) * FW;
  function psymSd(e, lx, y0, o, path) {
    const xs = [lx + 50, lx + 66, lx + 82], ds = [lx + FW + 30, lx + FW + 46, lx + FW + 62];
    const c = devOf(e.tag), d = devOf(e.delta), y = devOf(e.star), ok = c && d && y && !(SC.perrs && SC.perrs.has(e));
    const k = ok ? { ins: ['U1', 'V1', 'W1'].map(t => c.id + ':' + t), mid: ['W2', 'U2', 'V2'].map(t => c.id + ':' + t), dIn: ['1', '3', '5'].map(t => d.id + ':' + t) } : null;
    const lv = (key, i) => !!k && phaseLive(key, PH3[i]);
    const sel = SELP && SELP.path === path ? ' sel' : '', H = PE_ * 2, my = y0 + PE_ + 40;
    o.push(`<g class="sel-el pel${sel}" data-pp="${path}"><rect class="hit" x="${lx + 2}" y="${y0 + 2}" width="${FW * 2 - 4}" height="${H - 4}" rx="6"/>`);
    // taps from the feeder to the delta contactor
    xs.forEach((x, i) => {
      const ty = y0 + 10 + i * 7;
      o.push(`<line class="pw p${i + 1}${lv(k && k.ins[i], i) ? ' on' : ''}" x1="${x}" y1="${y0}" x2="${x}" y2="${my - 18}"/>`);
      o.push(`<line class="pw p${i + 1}${lv(k && k.dIn[i], i) ? ' on' : ''}" x1="${x}" y1="${ty}" x2="${ds[i]}" y2="${ty}"/><line class="pw p${i + 1}${lv(k && k.dIn[i], i) ? ' on' : ''}" x1="${ds[i]}" y1="${ty}" x2="${ds[i]}" y2="${y0 + PE_ / 2 - 14}"/><circle class="jn" cx="${x}" cy="${ty}" r="2.4"/>`);
      // delta contactor outputs carry W2 U2 V2: down to the star contactor, and across to the motor
      o.push(`<line class="pw p${i + 1}${lv(k && k.mid[i], i) ? ' on' : ''}" x1="${ds[i]}" y1="${y0 + PE_ / 2 + 14}" x2="${ds[i]}" y2="${my + 22}"/>`);
    });
    o.push(`<g class="ssym${SC.perrs && SC.perrs.has(e) ? ' err' : ''}${!ok ? ' miss' : ''}">`);
    const contacts = (cols, cy) => cols.map(x => `<path d="M${x} ${cy + 14} L${x - 10} ${cy - 12}"/><path class="thin" d="M${x - 4} ${cy - 14} a4 4 0 0 0 8 0"/>`).join('') + `<path class="thin dash" d="M${cols[0] - 5} ${cy} H${cols[2] - 5}"/>`;
    o.push(contacts(ds, y0 + PE_ / 2));
    o.push(`<path d="M${xs[0]} ${my - 18} L${xs[1] - 8} ${my - 10} M${xs[2]} ${my - 18} L${xs[1] + 8} ${my - 10}"/><circle cx="${xs[1]}" cy="${my + 4}" r="18" class="${c && c.state.drive === 'run' ? 'mon' : ''}"/>`);
    o.push(`<path class="thin" d="M${xs[1] + 18} ${my + 4} H${ds[0]}"/>`);
    o.push(`<path d="M${ds[0]} ${my + 22} V${my + 30} M${ds[1]} ${my + 22} V${my + 30} M${ds[2]} ${my + 22} V${my + 30} M${ds[0]} ${my + 30} H${ds[2]}"/>`);
    o.push(`<path class="pe" d="M${xs[1]} ${my + 22} V${my + 34} M${xs[1] - 8} ${my + 34} H${xs[1] + 8} M${xs[1] - 5} ${my + 38} H${xs[1] + 5} M${xs[1] - 2} ${my + 42} H${xs[1] + 2}"/>`);
    o.push('</g>');
    o.push(`<text class="mtxt" x="${xs[1]}" y="${my + 1}">M</text><text class="mtxt sm" x="${xs[1]}" y="${my + 14}">Y-Δ</text>`);
    o.push(`<text class="stag iec" x="${lx + 30}" y="${my + 4}">-${esc(e.tag)}</text><text class="stag iec" x="${ds[0] - 14}" y="${y0 + PE_ / 2 + 4}">-${esc(e.delta)}</text><text class="stag iec" x="${ds[0] - 14}" y="${my + 30}">-${esc(e.star)}</text>`);
    o.push(`<text class="sterm" x="${ds[2] + 6}" y="${my + 18}">W2 U2 V2</text></g>`);
    return H;
  }
  function renderPowerV(x0) {
    const P = pw(), o = [];
    if (!hasPower()) return { svg: '', w: 0, h: 0 };
    const src = devOf(P.src), srcLive = ph => !!(src && phaseLive(src.id + ':' + ph, ph));
    const xs = [x0 + 50, x0 + 66, x0 + 82];
    let y = RT - 36;
    o.push(`<g class="sleg${SELP && SELP.f === -1 && SELP.i == null ? ' sel' : ''}" data-pf="-1"><rect class="hit" x="${x0 + 4}" y="${y - 22}" width="${FW - 8}" height="26" rx="5"/><title>Supply: select it, then QF 3P adds a main switch</title>`);
    PH3.forEach((ph, i) => o.push(`<circle class="psrc p${i + 1}" cx="${xs[i]}" cy="${y - 10}" r="8"/><text class="sterm c" x="${xs[i]}" y="${y - 7}">${ph}</text>`));
    o.push(`<text class="stag iec" x="${x0 + 30}" y="${y - 6}">-${esc(P.src)}</text></g>`);
    y += 2;
    P.main.forEach((e, i) => { psym(e, x0, y + PE_ / 2, o, 'm.' + i); y += PE_; });
    if (!P.main.length) { xs.forEach((x, i) => o.push(`<line class="pw p${i + 1}${srcLive(PH3[i]) ? ' on' : ''}" x1="${x}" y1="${y}" x2="${x}" y2="${y + 20}"/>`)); y += 20; }
    const busY = y + 6, fxs = [];
    let acc = x0; P.feeders.forEach(f => { fxs.push(acc); acc += feedW(f); });
    const lastX = fxs.length ? fxs[fxs.length - 1] : x0;
    const lastK = (() => { const e = P.main[P.main.length - 1]; const k = e && powerKeys(e); return k ? k.outs : src ? PH3.map(t => src.id + ':' + t) : [null, null, null]; })();
    PH3.forEach((ph, i) => {
      const by = busY + i * 9, live = phaseLive(lastK[i], ph);
      o.push(`<line class="pw p${i + 1}${live ? ' on' : ''}" x1="${xs[i]}" y1="${y}" x2="${xs[i]}" y2="${by}"/>`);
      o.push(`<line class="pw p${i + 1}${live ? ' on' : ''}" x1="${xs[i]}" y1="${by}" x2="${lastX + 82}" y2="${by}"/>`);
    });
    let h = busY + 30;
    P.feeders.forEach((f, fi) => {
      const lx = fxs[fi], fsel = SELP && SELP.f === fi && SELP.i == null ? ' sel' : '';
      let fy = busY + 30;
      const fx = [lx + 50, lx + 66, lx + 82];
      o.push(`<g class="sleg pfeed${fsel}" data-pf="${fi}"><rect class="hit" x="${lx + 4}" y="${busY - 4}" width="${FW - 8}" height="26" rx="5"/><text class="sterm c" x="${lx + 66}" y="${busY - 8}">${fi + 1}</text></g>`);
      PH3.forEach((ph, i) => o.push(`<line class="pw p${i + 1}${phaseLive(lastK[i], ph) ? ' on' : ''}" x1="${fx[i]}" y1="${busY + i * 9}" x2="${fx[i]}" y2="${fy}"/><circle class="jn" cx="${fx[i]}" cy="${busY + i * 9}" r="2.6"/>`));
      f.elems.forEach((e, i) => { if (isSd(e)) fy += psymSd(e, lx, fy, o, 'f.' + fi + '.' + i); else { psym(e, lx, fy + PE_ / 2, o, 'f.' + fi + '.' + i); fy += PE_; } });
      if (!f.elems.length) o.push(`<text class="hint" x="${lx + 66}" y="${fy + 20}">empty feeder</text>`);
      h = Math.max(h, fy + 40);
    });
    return { svg: o.join(''), w: Math.max(FW, acc - x0) + 40, h };
  }
  function renderIEC() {
    const s = sch();
    const lays = s.rungs.map(r => { let k = r.elems.length; while (k > 0 && isOut(r.elems[k - 1])) k--; return { cond: lay(r.elems.slice(0, k), DV), outs: lay(r.elems.slice(k), DV) }; });
    const colW = L => Math.max(VL, L.cond.h, L.outs.h);
    let along = 300;
    lays.forEach(L => { along = Math.max(along, L.cond.w + 30 + L.outs.w + 20); });
    const RB = RT + along, xs = [];
    let x = 60;
    lays.forEach(L => { xs.push(x); x += colW(L) + 8; });
    const ctlW = Math.max(x + 30, 380), o = [];
    const sup = k => { if (!k) return '—'; const [cid, tid] = k.split(':'); const c = circ().comps.find(q => q.id === cid); const t = c && DEFS[c.type].terms.find(q => q.id === tid); return c ? `${c.props.label}:${t ? t.l : tid}` : '—'; };
    const rl = railLive();
    o.push(`<line class="rail" x1="40" y1="${RT}" x2="${ctlW - 10}" y2="${RT}"/><line class="rail" x1="40" y1="${RB}" x2="${ctlW - 10}" y2="${RB}"/>`);
    o.push(`<text class="railtxt" x="8" y="${RT + 4}">L</text><text class="railsrc" x="8" y="${RT - 10}">${esc(sup(s.L))}</text><text class="railtxt" x="8" y="${RB + 4}">N</text><text class="railsrc" x="8" y="${RB + 18}">${esc(sup(s.N))}</text>`);
    s.rungs.forEach((r, i) => {
      const L = lays[i], cx = xs[i], wx = cx + VX, cw = colW(L), any = r.elems.length > 0;
      o.push(`<g class="srung${SEL.r === i ? ' sel' : ''}" data-r="${i}"><rect class="colbg" x="${cx}" y="${RT - 34}" width="${cw}" height="${RB - RT + 48}" rx="8"/><text class="colnum" x="${wx}" y="${RT - 16}">${i + 1}</text>`);
      if (any) {
        o.push(`<circle class="jn" cx="${wx}" cy="${RT}" r="3"/>`, vw(wx, RT, RT + 10, rl));
        const c1 = renderSeqV(L.cond, RT + 10, cx, o, rl);
        const oa = RB - 10 - L.outs.w;
        o.push(vw(wx, c1.a, oa, c1.live));
        const c2 = renderSeqV(L.outs, oa, cx, o, c1.live);
        o.push(vw(wx, c2.a, RB, false), `<circle class="jn" cx="${wx}" cy="${RB}" r="3"/>`);
      } else o.push(`<text class="hint" x="${wx}" y="${(RT + RB) / 2}">empty</text>`);
      o.push('</g>');
    });
    const P = renderPowerV(ctlW + 30);
    const W = ctlW + 30 + P.w, H = Math.max(RB + 40, P.h);
    body.innerHTML = `<svg class="rung-svg sch-svg iec-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${o.join('')}${P.svg}</svg>
      <div class="sch-add"><button class="tbtn" data-sact2="rung">＋ Add a current path</button> <button class="tbtn" data-sact2="feeder">＋ Add a motor feeder</button></div>`;
  }
  const railLive = () => { const api = App.api, k = sch().L; if (!api || !k) return false; for (const p of api.potsR(api.rootK(k))) if (/^L[123]$/.test(p) || p.startsWith('DC+')) return true; return false; };
  const kindShort = e => ({ no: 'N.O.', nc: 'N.C.', tno: 'N.O. delay', tnc: 'N.C. delay', olnc: 'OL N.C.', olno: 'OL N.O.', coil: 'coil', tcoil: 'timer coil', lamp: 'lamp', horn: 'buzzer' })[SK[e.k].sym];
  /* elements are found again by their path inside the rung list: "r.i" or "r.i.leg.i…" */
  function pathOf(target) {
    let found = null;
    const walk = (arr, p) => arr.forEach((e, i) => { if (found) return; const q = p + '.' + i; if (e === target) found = q; else if (e.k === 'br') e.legs.forEach((l, li) => walk(l, q + '.' + li)); });
    sch().rungs.forEach((r, ri) => walk(r.elems, String(ri)));
    return found;
  }
  function byPath(p) {
    const n = p.split('.').map(Number); let arr = sch().rungs[n[0]].elems, e = null;
    for (let i = 1; i < n.length; i += 2) { e = arr[n[i]]; if (i + 1 < n.length) arr = e.legs[n[i + 1]]; }
    return { e, arr, ri: n[0] };
  }
  function locate(e) { const p = pathOf(e); if (!p) return null; const n = p.split('.').map(Number); const f = byPath(p); return { ...f, idx: n[n.length - 1] }; }

  /* ---------- view ---------- */
  let root, body, side, undo = [], redo = [];
  SC.init = function (el) {
    root = el;
    FreeDraw.init({ sch, circ, devOf, snap: () => snap(), changed: () => changed(), mode: () => mode, side: () => renderSide() });
    const groups = {};
    Object.entries(SK).forEach(([k, K]) => { (groups[K.g] = groups[K.g] || []).push(k); });
    el.innerHTML = `
      <div class="lad-toolbar sch-toolbar">
        <div class="tb-group keep"><div class="seg"><button data-smode="edit" class="on" title="Build the circuit: click to select">✎ Edit</button><button data-smode="run" title="Operate push buttons, selectors and switches by clicking their symbols">☝ Operate</button></div>
          <div class="seg"><button data-sstyle="iec" title="IEC: L on top, N at the bottom, one column per current path, with the power circuit">⇵ IEC</button><button data-sstyle="nema" title="Ladder style: L on the left, N on the right, one row per rung">⇄ Ladder</button><button data-sstyle="free" title="Free draw: place symbols anywhere, rotate them and wire terminal to terminal">✎ Free draw</button></div></div>
        <div class="tb-group free-group"><button class="tbtn" data-fdact="lib" title="Add a symbol">＋ Library ▾</button><button class="tbtn" data-fdact="rot" title="Rotate the selected symbol (R)">⟳ Rotate</button><button class="tbtn" data-fdact="type" title="Change the type of a switch (push, selector, key, limit…)">Type ⇄</button><button class="tbtn" data-fdact="copy" title="Copy the selected symbol (D)">⧉</button><button class="tbtn" data-fdact="del" title="Delete (Del)">🗑</button><button class="tbtn" data-sact="undo" title="Undo (Ctrl+Z)">↶</button><button class="tbtn" data-sact="redo" title="Redo (Ctrl+Y)">↷</button></div>
        <div class="tb-group"><span class="tb-lbl">Rung</span>
          <button class="tbtn mobile-only" data-sact="side" title="Supply and messages">⚙ Info</button>
          <button class="tbtn" data-sact="rung" title="New rung">＋ Rung</button>
          <button class="tbtn" data-sact="branch" title="Parallel branch around the selection, or one more leg">⑂ Branch</button>
          <button class="tbtn" data-sact="ml" title="Move left">◀</button><button class="tbtn" data-sact="mr" title="Move right">▶</button>
          <button class="tbtn" data-sact="del" title="Delete selection (Del)">🗑</button>
          <button class="tbtn" data-sact="undo" title="Undo (Ctrl+Z)">↶</button><button class="tbtn" data-sact="redo" title="Redo (Ctrl+Y)">↷</button>
        </div>
        ${Object.entries(groups).map(([g, ks]) => `<div class="tb-group"><span class="tb-lbl">${g}</span>${ks.map(k => `<button class="tbtn" data-skind="${k}" title="${esc(SK[k].n)}">${esc(btnLabel(k))}</button>`).join('')}</div>`).join('')}
        <div class="tb-group pw-group"><span class="tb-lbl">Power</span><button class="tbtn" data-sact="feeder" title="New motor feeder">＋ Feeder</button>${Object.keys(PK).map(k => `<button class="tbtn" data-pkind="${k}" title="${esc(PK[k].n)}">${esc({ qf3: 'QF 3P', qm3: 'QM 3P', km3: 'KM 3P', ol3: 'OL 3P', m3: 'M 3~', m6: 'M Y-Δ' }[k])}</button>`).join('')}</div>
      </div>
      <div class="lad-main"><div class="sch-body lad-rungs" tabindex="0"></div><aside class="lad-side sch-side"></aside></div>`;
    body = el.querySelector('.sch-body'); side = el.querySelector('.sch-side');
    setStyleUi();
    UI.drawer(el.querySelector('[data-sact="side"]'), side);
    el.querySelector('.sch-toolbar').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.smode) { mode = b.dataset.smode; el.querySelectorAll('[data-smode]').forEach(x => x.classList.toggle('on', x === b)); body.classList.toggle('operate', mode === 'run'); return; }
      if (b.dataset.sstyle) { style = b.dataset.sstyle; try { localStorage.setItem('plc-trainer.schStyle', style); } catch (err) { /* private mode */ } setStyleUi(); SC.render(); return; }
      if (b.dataset.fdact) { if (b.dataset.fdact === 'lib') { const r = b.getBoundingClientRect(); FreeDraw.library(r.left, r.bottom + 4); } else ({ rot: FreeDraw.rotate, type: FreeDraw.cycleType, copy: FreeDraw.copy, del: FreeDraw.del })[b.dataset.fdact](); return; }
      if (b.dataset.skind) return SC.insert(b.dataset.skind);
      if (b.dataset.pkind) return SC.insertPower(b.dataset.pkind);
      ({ feeder: () => SC.addFeeder(), rung: () => SC.addRung(), branch: SC.branch, ml: () => SC.move(-1), mr: () => SC.move(1), del: SC.del, undo: SC.undo, redo: SC.redo })[b.dataset.sact]?.();
    });
    let held = null;
    body.addEventListener('pointerdown', ev => {
      if (style === 'free') return;
      const pg = ev.target.closest('[data-pp]'), pf = ev.target.closest('[data-pf]');
      if (pg || pf) {
        SEL = { r: -1, e: null, leg: null };
        if (pf) { SELP = { f: Number(pf.dataset.pf), i: null, path: null }; SC.render(); return; }
        const { e, f, i } = pByPath(pg.dataset.pp), K = PK[e.k], c = devOf(e.tag);
        if (mode === 'run') {
          if (c && K.part) { ev.preventDefault(); held = App.operate(c, K.part); }
          else if (c && e.k === 'ol3') App.operate(c, c.state.tripped ? 'reset' : 'test')();
          return;
        }
        SELP = { f, i, path: pg.dataset.pp };
        SC.render();
        return;
      }
      SELP = null;
      const g = ev.target.closest('[data-path]'), rEl = ev.target.closest('.srung');
      if (!rEl) { SEL = { r: -1, e: null, leg: null }; SC.render(); return; }
      const ri = Number(rEl.dataset.r);
      if (g && !g.dataset.li) {
        const { e } = byPath(g.dataset.path);
        const K = SK[e.k], c = devOf(e.tag);
        if (mode === 'run') {
          if (c && K.part) { ev.preventDefault(); held = App.operate(c, K.part); }
          else if (c && (K.sym === 'olnc' || K.sym === 'olno')) { App.operate(c, c.state.tripped ? 'reset' : 'test')(); }
          return;
        }
        SEL = { r: ri, e, leg: null };
      } else if (g) SEL = { r: ri, e: null, leg: byPath(g.dataset.path).e, li: Number(g.dataset.li) };
      else SEL = { r: ri, e: null, leg: null };
      SC.render();
    });
    const up = () => { if (held) { held(); held = null; } };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    body.addEventListener('dblclick', ev => { if (style === 'free') return; const pg = ev.target.closest('[data-pp]'); if (pg && mode === 'edit') { SC.retagPower(pByPath(pg.dataset.pp).e); return; } const g = ev.target.closest('[data-path]'); if (g && !g.dataset.li && mode === 'edit') SC.retag(byPath(g.dataset.path).e); });
    UI.longPress(body);
    body.addEventListener('contextmenu', ev => {
      if (style === 'free') return;
      const g = ev.target.closest('[data-path]'); if (!g || g.dataset.li) return;
      ev.preventDefault();
      const { e } = byPath(g.dataset.path); SEL = { r: byPath(g.dataset.path).ri, e, leg: null }; SC.render();
      const c = devOf(e.tag);
      UI.menu(ev.clientX, ev.clientY, [{ head: `${e.tag} · ${SK[e.k].n}` }, { label: 'Change tag…', onClick: () => SC.retag(e) },
        { label: 'Branch around this', onClick: SC.branch }, { label: 'Show in Wiring', disabled: !c, onClick: () => { App.showView('wiring'); Workspace.selectComp(c.id); } },
        { label: 'Delete', danger: true, onClick: SC.del }]);
    });
  };
  function setStyleUi() {
    if (!root) return;
    root.querySelectorAll('[data-sstyle]').forEach(x => x.classList.toggle('on', x.dataset.sstyle === style));
    root.querySelector('.pw-group').hidden = style !== 'iec';
    root.classList.toggle('free-style', style === 'free');
  }
  /* power elements are found by "m.i" (main section) or "f.feeder.i" */
  function pByPath(p) {
    const n = p.split('.'), P = pw();
    if (n[0] === 'm') return { e: P.main[Number(n[1])], arr: P.main, f: -1, i: Number(n[1]) };
    const f = Number(n[1]), arr = P.feeders[f].elems;
    return { e: arr[Number(n[2])], arr, f, i: Number(n[2]) };
  }
  SC.addFeeder = function () {
    snap();
    pw().feeders.push({ elems: [] });
    SELP = { f: pw().feeders.length - 1, i: null, path: null };
    SEL = { r: -1, e: null, leg: null };
    if (style !== 'iec') { style = 'iec'; setStyleUi(); }
    changed();
  };
  function suggestPowerTag(k) {
    const K = PK[k], used = new Set(), P = pw();
    [...P.main, ...P.feeders.flatMap(f => f.elems)].forEach(e => used.add(e.tag));
    const same = circ().comps.filter(c => c.type === K.type).map(c => c.props.label);
    const free = same.find(t => !used.has(t));
    if (free) return { def: free, list: same };
    const all = new Set([...circ().comps.map(c => c.props.label), ...used]); let n = 1; while (all.has(K.pre + n)) n++;
    return { def: K.pre + n, list: same };
  }
  /* new power device: into the selected feeder (or the main section when it is selected), after the selection */
  SC.insertPower = function (k, tag, extra) {
    const P = pw(), K = PK[k];
    const go = (t, more) => {
      if (!TAG.test(t)) return 'Use letters, numbers, - or _ (up to 20)';
      snap();
      let arr, at;
      if (SELP && SELP.f === -1 && K.outs) { arr = P.main; at = SELP.i == null ? arr.length : SELP.i + 1; }
      else {
        if (!P.feeders.length || !SELP || SELP.f < 0 || !P.feeders[SELP.f]) { if (!P.feeders.length || !SELP) P.feeders.push({ elems: [] }); SELP = { f: SELP && P.feeders[SELP.f] ? SELP.f : P.feeders.length - 1, i: null }; }
        arr = P.feeders[SELP.f].elems;
        at = SELP.i == null ? arr.length : SELP.i + 1;
        // devices go in front of the motor, the motor at the end
        if (!K.outs) at = arr.length; else { const m = arr.findIndex(e => !PK[e.k].outs); if (m >= 0 && at > m) at = m; }
      }
      const e = { k, tag: t, ...(more || {}) };
      arr.splice(at, 0, e);
      const f = arr === P.main ? -1 : SELP.f;
      SELP = { f, i: at, path: f < 0 ? 'm.' + at : 'f.' + f + '.' + at };
      SEL = { r: -1, e: null, leg: null };
      if (style !== 'iec') { style = 'iec'; setStyleUi(); }
      changed();
    };
    if (tag) return go(tag, extra);
    const sg = suggestPowerTag(k);
    if (K.sd) {
      const taken = new Set([...P.main, ...P.feeders.flatMap(f => f.elems)].flatMap(e => [e.tag, e.delta, e.star]).concat(circ().comps.map(c => c.props.label)));
      const nextKM = skip => { let n = 1; while (taken.has('KM' + n) || skip.includes('KM' + n)) n++; return 'KM' + n; };
      const dk = nextKM([]), yk = nextKM([dk]);
      UI.form(K.n, [{ key: 't', label: 'Motor tag', value: sg.def }, { key: 'd', label: 'Delta contactor (Δ)', value: dk }, { key: 's', label: 'Star contactor (Y)', value: yk }], v => {
        const [t, d, y] = [v.t, v.d, v.s].map(x => String(x || '').trim());
        if (![t, d, y].every(x => TAG.test(x))) return 'Use letters, numbers, - or _ (up to 20)';
        if (d === y) return 'The delta and star contactors must be different';
        return go(t, { delta: d, star: y });
      }, '<p class="help">The motor goes last in the feeder. The delta contactor takes the feeder to W2 U2 V2; the star contactor joins W2 U2 V2. Put the main contactor (KM 3P) and the overload in front of it. The control circuit (star timer, interlocks) goes in the current paths.</p>');
      return;
    }
    UI.form(K.n, [{ key: 't', label: 'Device tag', value: sg.def, list: sg.list }], v => go(v.t.trim()),
      `<p class="help">Use the tag of a device in the Wiring, or a new tag: the device is added to the Wiring and wired L1-L2-L3 for you. Click a feeder number first to choose the feeder; select the top device of the supply section to add a main switch there.</p>`);
  };
  SC.addMain = function (k, tag) { SELP = { f: -1, i: pw().main.length - 1, path: null }; return SC.insertPower(k, tag); };
  SC.retagPower = function (e) {
    UI.form(`${PK[e.k].n} — tag`, [{ key: 't', label: 'Device tag', value: e.tag, list: suggestPowerTag(e.k).list }], v => {
      const t = v.t.trim(); if (!TAG.test(t)) return 'Use letters, numbers, - or _ (up to 20)';
      snap(); e.tag = t; changed();
    });
  };
  const btnLabel = k => ({ pbno: 'PB ⊣⊢', pbnc: 'PB ⊣/⊢', sel: 'SEL', estop: 'E-STOP', lsno: 'LS NO', lsnc: 'LS NC', kmno: 'KM NO', kmnc: 'KM NC', kano: 'KA NO', kanc: 'KA NC', ktno: 'KT NO', ktnc: 'KT NC', olnc: 'OL NC', olno: 'OL NO', kmcoil: 'KM ◯', kacoil: 'KA ◯', ktcoil: 'KT ▭', lamp: 'H ⊗', horn: 'HA' })[k];

  SC.render = function () { renderRungs(); renderSide(); };
  function renderRungs() {
    if (!body || !App.project || !sch()) return;
    if (!railOk(sch().L) || !railOk(sch().N)) { const [l, n] = autoRails(); sch().L = l; sch().N = n; }
    SC.errs = check();
    SC.perrs = checkPower();
    const sl = body.scrollLeft, stp = body.scrollTop;
    const s = sch();
    if (style === 'free') {
      FreeDraw.render(body);
      lastSig = liveSig();
      return;
    }
    if (style === 'iec') {
      renderIEC();
      body.querySelectorAll('[data-sact2]').forEach(b => { b.onclick = () => (b.dataset.sact2 === 'feeder' ? SC.addFeeder() : SC.addRung()); });
      body.scrollLeft = sl; body.scrollTop = stp;
      lastSig = liveSig();
      return;
    }
    const lays = s.rungs.map(r => { let k = r.elems.length; while (k > 0 && isOut(r.elems[k - 1])) k--; return { cond: lay(r.elems.slice(0, k)), outs: lay(r.elems.slice(k)) }; });
    let W = Math.max(640, body.clientWidth - 70);
    lays.forEach(L => { W = Math.max(W, LM + L.cond.w + 60 + L.outs.w + RM); });
    const sup = k => { if (!k) return '—'; const [cid, tid] = k.split(':'); const c = circ().comps.find(x => x.id === cid); const t = c && DEFS[c.type].terms.find(x => x.id === tid); return c ? `${c.props.label}:${t ? t.l : tid}` : '—'; };
    body.innerHTML = `<div class="sch-rails"><span>${esc(sup(s.L))}</span><span>${esc(sup(s.N))}</span></div>` + s.rungs.map((r, i) => {
      const L = lays[i], h = Math.max(L.cond.h, L.outs.h) + 4, o = [];
      o.push(`<line class="rail" x1="3" y1="0" x2="3" y2="${h}"/><line class="rail" x1="${W - 3}" y1="0" x2="${W - 3}" y2="${h}"/>`);
      const rl = railLive();
      o.push(hw(3, LM, WY, rl && r.elems.length > 0));
      const c1 = renderSeq(L.cond, LM, 0, o, rl);
      const ox = W - RM - L.outs.w;
      o.push(hw(c1.x, ox, WY, c1.live && r.elems.length > 0));
      const c2 = renderSeq(L.outs, ox, 0, o, c1.live);
      o.push(hw(c2.x, W - 3, WY, false));
      if (!r.elems.length) o.push(`<text class="hint" x="${W / 2}" y="${WY - 10}">Empty rung — add contacts, then a coil or lamp</text>`);
      return `<div class="srung rung${SEL.r === i ? ' sel' : ''}" data-r="${i}"><div class="rung-num">${String(i + 1).padStart(3, '0')}</div><div class="rung-body"><svg class="rung-svg sch-svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}">${o.join('')}</svg></div></div>`;
    }).join('') + `<div class="sch-add"><button class="tbtn" data-sact2="rung">＋ Add a rung</button></div>`;
    body.querySelector('[data-sact2]').onclick = () => SC.addRung();
    body.scrollLeft = sl; body.scrollTop = stp;
    lastSig = liveSig();
  }
  /* live state: redraw only when something changed */
  let lastSig = '';
  const liveSig = () => railLive() + powerSig() + sch().rungs.map(r => JSON.stringify(r.elems.map(function f(e) { if (e.k === 'br') return e.legs.map(l => l.map(f)); const s = state(e); return [s.on, s.inLive, s.outLive]; }))).join('|');
  function powerSig() {
    if (style !== 'iec' || !hasPower()) return '';
    const P = pw(), one = e => { const k = powerKeys(e); return k ? [k.ins.map((x, i) => phaseLive(x, PH3[i]) ? 1 : 0).join(''), k.outs ? k.outs.map((x, i) => phaseLive(x, PH3[i]) ? 1 : 0).join('') : k.c.state.drive].join('/') : '-'; };
    return '|P' + P.main.map(one).join(',') + ';' + P.feeders.map(f => f.elems.map(one).join(',')).join(';');
  }
  SC.update = function () {
    if (!body || !App.project || !sch()) return;
    if (style === 'free') { FreeDraw.update(); return; }
    if (liveSig() !== lastSig) renderRungs();
  };
  function renderSide() {
    if (!side || !App.project || !sch()) return;
    if (style === 'free') {
      side.innerHTML = `<div class="side-head"><h4>Electrical Diagram — free draw</h4></div><div class="props">${FreeDraw.side()}</div>`;
      FreeDraw.bindSide(side);
      return;
    }
    const s = sch(), ch = supplyChoices(), errs = [...(SC.errs ? SC.errs.values() : []), ...(SC.perrs ? SC.perrs.values() : [])];
    side.innerHTML = `<div class="side-head"><h4>Electrical Diagram</h4></div><div class="props">
      <label class="field"><span>Supply rail (L or +24 V)</span><select data-rail="L">${ch.map(o => `<option value="${esc(o.k)}" ${o.k === s.L ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>
      <label class="field"><span>Return rail (N or 0 V)</span><select data-rail="N">${ch.map(o => `<option value="${esc(o.k)}" ${o.k === s.N ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>
      ${!ch.length ? '<p class="help warn-txt">Add a supply in the Wiring first (1-phase supply or 24 VDC power supply).</p>' : ''}
      ${errs.length ? `<h5>Problems</h5><ul class="verify">${errs.map(m => `<li class="e">${esc(m)}</li>`).join('')}</ul><p class="help">A rung with a problem is not wired.</p>` : ''}
      <h5>How it works</h5><ul class="tips"><li>Each symbol is a real device in the Wiring, found by its tag (S1, KM1…) or created there.</li>
      <li>The rungs are wired for you between the two rails. Change a rung and its wires follow.</li>
      <li>☝ Operate: click push buttons, selectors, limit switches and overload contacts to work them.</li>
      <li>Double-click a symbol to change its tag. Contacts of KM1 follow coil KM1.</li>
      <li><b>⇵ IEC</b> view: each column is a current path from L (top) to N (bottom); the power circuit is on the right. <b>＋ Feeder</b> adds a motor feeder: breaker → contactor → overload → motor, wired L1-L2-L3 and PE for you.</li>
      <li>The diagram is drawn in one line colour, like the ladder; live paths light up. The wires it makes in the Wiring get the Philippine colours: L1 red, L2 yellow, L3 blue, N white, PE green.</li></ul></div>`;
    bindSide();
  }
  function bindSide() {
    side.querySelectorAll('[data-rail]').forEach(sel => { sel.onchange = () => { snap(); sch()[sel.dataset.rail] = sel.value; changed(); }; });
  }

  /* ---------- editing ---------- */
  const snap = () => { undo.push(JSON.stringify(sch())); if (undo.length > 80) undo.shift(); redo = []; };
  const restore = s => { const o = JSON.parse(s); App.project.schematic = o; SEL = { r: -1, e: null, leg: null }; changed(); };
  SC.undo = () => { if (!undo.length) return; redo.push(JSON.stringify(sch())); restore(undo.pop()); };
  SC.redo = () => { if (!redo.length) return; undo.push(JSON.stringify(sch())); restore(redo.pop()); };
  function changed() { SC.sync(); SC.render(); }
  SC.addRung = function () {
    snap();
    const at = SEL.r < 0 ? sch().rungs.length : SEL.r + 1;
    sch().rungs.splice(at, 0, { elems: [], comment: '' });
    SEL = { r: at, e: null, leg: null };
    changed();
  };
  function suggestTag(k) {
    const K = SK[k], same = circ().comps.filter(c => c.type === K.type || (DEFS[c.type].variant && Object.values(DEFS[c.type].variant.of).includes(K.type))).map(c => c.props.label);
    // a contact or coil of a relay family suggests the last device of that family; inputs and loads a new tag
    if (!K.out && ['contactor', 'relay', 'timer', 'olr'].includes(K.type) && same.length) return { def: same[same.length - 1], list: same };
    if (K.out && ['contactor', 'relay', 'timer'].includes(K.type)) { const used = new Set(); sch().rungs.forEach(r => JSON.stringify(r.elems).replace(/"k":"(\w+coil)","tag":"([^"]+)"/g, (_, a, t) => used.add(t))); const free = same.find(t => !used.has(t)); if (free) return { def: free, list: same }; }
    const used = new Set(circ().comps.map(c => c.props.label)); let n = 1; while (used.has(K.pre + n)) n++;
    return { def: K.pre + n, list: same };
  }
  SC.insert = function (k, tag) {
    const K = SK[k];
    const go = t => {
      if (!TAG.test(t)) return 'Use letters, numbers, - or _ (up to 20)';
      snap();
      if (!sch().rungs.length) sch().rungs.push({ elems: [], comment: '' });
      if (SEL.r < 0 || !sch().rungs[SEL.r]) SEL.r = sch().rungs.length - 1;
      const e = { k, tag: t };
      const f = SEL.e ? locate(SEL.e) : null;
      if (f) f.arr.splice(f.idx + 1, 0, e);
      else if (SEL.leg) SEL.leg.legs[SEL.li].push(e);
      else { const arr = sch().rungs[SEL.r].elems; if (K.out) arr.push(e); else { let i = arr.length; while (i > 0 && isOut(arr[i - 1])) i--; arr.splice(i, 0, e); } }
      SEL = { r: SEL.r, e, leg: null };
      changed();
    };
    if (tag) return go(tag);
    const sg = suggestTag(k);
    UI.form(`${K.n}`, [{ key: 't', label: 'Device tag', value: sg.def, list: sg.list }], v => go(v.t.trim()),
      `<p class="help">Use the tag of a device in the Wiring (e.g. ${esc(sg.def)}), or a new tag: the device is added to the Wiring for you.</p>`);
  };
  SC.retag = function (e) {
    UI.form(`${SK[e.k].n} — tag`, [{ key: 't', label: 'Device tag', value: e.tag, list: suggestTag(e.k).list }], v => {
      const t = v.t.trim(); if (!TAG.test(t)) return 'Use letters, numbers, - or _ (up to 20)';
      snap(); e.tag = t; changed();
    });
  };
  SC.branch = function () {
    if (SEL.leg) { snap(); SEL.leg.legs.push([]); SEL.li = SEL.leg.legs.length - 1; changed(); return; }
    const f = SEL.e && locate(SEL.e);
    if (!f) { UI.toast('Select a symbol first'); return; }
    snap();
    const b = { k: 'br', legs: [[f.e], []] };
    f.arr[f.idx] = b;
    SEL = { r: SEL.r, e: null, leg: b, li: 1 };
    changed();
  };
  SC.move = function (d) {
    const f = SEL.e && locate(SEL.e); if (!f) return;
    const j = f.idx + d; if (j < 0 || j >= f.arr.length) return;
    snap(); [f.arr[f.idx], f.arr[j]] = [f.arr[j], f.arr[f.idx]]; changed();
  };
  SC.del = function () {
    if (SELP) {
      const P = pw();
      if (SELP.path) { const f = pByPath(SELP.path); snap(); f.arr.splice(f.i, 1); }
      else if (SELP.f >= 0 && P.feeders[SELP.f]) { snap(); P.feeders.splice(SELP.f, 1); }
      SELP = null; changed(); return;
    }
    if (SEL.leg) {
      const f = locate(SEL.leg); if (!f) return;
      snap(); SEL.leg.legs.splice(SEL.li, 1);
      if (SEL.leg.legs.length <= 1) f.arr.splice(f.idx, 1, ...(SEL.leg.legs[0] || []));
      SEL = { r: SEL.r, e: null, leg: null }; changed(); return;
    }
    if (SEL.e) { const f = locate(SEL.e); if (!f) return; snap(); f.arr.splice(f.idx, 1); SEL = { r: SEL.r, e: null, leg: null }; changed(); return; }
    if (SEL.r >= 0 && sch().rungs[SEL.r]) { snap(); sch().rungs.splice(SEL.r, 1); SEL = { r: -1, e: null, leg: null }; changed(); }
  };
  SC.onKey = function (ev) {
    const c = ev.ctrlKey || ev.metaKey, k = ev.key;
    if (style === 'free' && !c) { FreeDraw.onKey(ev); return; }
    if (c && k.toLowerCase() === 'z') { ev.preventDefault(); SC.undo(); }
    else if (c && k.toLowerCase() === 'y') { ev.preventDefault(); SC.redo(); }
    else if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); SC.del(); }
    else if (k === 'Escape') { SEL = { r: -1, e: null, leg: null }; SELP = null; SC.render(); }
  };
  SC.resetSel = () => { FreeDraw.resetSel(); SEL = { r: -1, e: null, leg: null }; SELP = null; undo = []; redo = []; SC.errs = null; lastSig = ''; };
  SC.state = state;
  window.Schematic = SC;
})();
