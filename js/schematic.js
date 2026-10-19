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
  const TAG = /^[A-Za-z0-9_-]{1,20}$/;

  const sch = () => App.project.schematic;
  const circ = () => App.project.circuit;
  const devOf = tag => circ().comps.find(c => c.props.label === tag);
  const isOut = e => e.k !== 'br' && !!(SK[e.k] && SK[e.k].out);

  /* ---------- data: clean a saved/imported schematic ---------- */
  function cleanSeq(a, depth) {
    return (Array.isArray(a) ? a : []).map(e => {
      if (!e || typeof e !== 'object') return null;
      if (e.k === 'br' && depth < 4) { const legs = (Array.isArray(e.legs) ? e.legs : []).map(l => cleanSeq(l, depth + 1)); return legs.length ? { k: 'br', legs } : null; }
      if (!Object.prototype.hasOwnProperty.call(SK, e.k) || !TAG.test(e.tag)) return null;
      return { k: e.k, tag: e.tag };
    }).filter(Boolean);
  }
  SC.clean = function (s, termOk) {
    const o = s && typeof s === 'object' ? s : {};
    return {
      L: typeof o.L === 'string' && termOk(o.L) ? o.L : null,
      N: typeof o.N === 'string' && termOk(o.N) ? o.N : null,
      rungs: (Array.isArray(o.rungs) ? o.rungs : []).filter(r => r && typeof r === 'object').map(r => ({ elems: cleanSeq(r.elems, 0), comment: typeof r.comment === 'string' ? r.comment.slice(0, 200) : '' })),
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
  function ensureDevice(e) {
    let c = devOf(e.tag);
    if (c) return c;
    const K = SK[e.k], p = freeSpot();
    c = Circuit.create(K.type, p.x, p.y, circ());
    c.props.label = e.tag;
    if (DEFS[K.type].pdefs && DEFS[K.type].pdefs.some(f => f.k === 'coil')) c.props.coil = controlVoltage();
    c.schAuto = true;
    circ().comps.push(c);
    App.log('system', `Schematic added ${DEFS[K.type].name} ${e.tag} to the wiring`);
    return c;
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
    if (railOk(s.L) && railOk(s.N)) {
      const color = controlVoltage() === '24VDC' ? '#1f4fa8' : '#d33a2c';
      const seen = new Set();
      const wire = (a, b) => {
        if (!a || !b || a === b) return;
        const k = a < b ? a + '|' + b : b + '|' + a;
        if (seen.has(k)) return;
        seen.add(k);
        C.seq = (C.seq || 0) + 1;
        C.wires.push({ id: 'w' + C.seq, a, b, pts: [], color, sch: true });
      };
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
  function lay(arr) {
    const items = arr.map(e => {
      if (e.k !== 'br') return { e, w: CW, h: RH };
      const legs = e.legs.map(l => (l.length ? lay(l) : { items: [], w: EMPTYW, h: RH, empty: true }));
      const lw = Math.max(EMPTYW, ...legs.map(l => l.w));
      return { e, w: lw + BP * 2, h: legs.reduce((s, l) => s + l.h, 0), legs, lw };
    });
    return { items, w: items.reduce((s, b) => s + b.w, 0), h: Math.max(RH, ...items.map(b => b.h)) };
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
        o.push(`<g class="sel-el${sel}" data-path="${pathOf(b.e)}"><rect class="hit" x="${cx + 2}" y="${y + 4}" width="${CW - 4}" height="${RH - 8}" rx="6"/>`);
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
    const groups = {};
    Object.entries(SK).forEach(([k, K]) => { (groups[K.g] = groups[K.g] || []).push(k); });
    el.innerHTML = `
      <div class="lad-toolbar sch-toolbar">
        <div class="tb-group"><div class="seg"><button data-smode="edit" class="on" title="Build the circuit: click to select">✎ Edit</button><button data-smode="run" title="Operate push buttons, selectors and switches by clicking their symbols">☝ Operate</button></div></div>
        <div class="tb-group"><span class="tb-lbl">Rung</span>
          <button class="tbtn mobile-only" data-sact="side" title="Supply and messages">⚙ Info</button>
          <button class="tbtn" data-sact="rung" title="New rung">＋ Rung</button>
          <button class="tbtn" data-sact="branch" title="Parallel branch around the selection, or one more leg">⑂ Branch</button>
          <button class="tbtn" data-sact="ml" title="Move left">◀</button><button class="tbtn" data-sact="mr" title="Move right">▶</button>
          <button class="tbtn" data-sact="del" title="Delete selection (Del)">🗑</button>
          <button class="tbtn" data-sact="undo" title="Undo (Ctrl+Z)">↶</button><button class="tbtn" data-sact="redo" title="Redo (Ctrl+Y)">↷</button>
        </div>
        ${Object.entries(groups).map(([g, ks]) => `<div class="tb-group"><span class="tb-lbl">${g}</span>${ks.map(k => `<button class="tbtn" data-skind="${k}" title="${esc(SK[k].n)}">${esc(btnLabel(k))}</button>`).join('')}</div>`).join('')}
      </div>
      <div class="lad-main"><div class="sch-body lad-rungs" tabindex="0"></div><aside class="lad-side sch-side"></aside></div>`;
    body = el.querySelector('.sch-body'); side = el.querySelector('.sch-side');
    UI.drawer(el.querySelector('[data-sact="side"]'), side);
    el.querySelector('.sch-toolbar').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.smode) { mode = b.dataset.smode; el.querySelectorAll('[data-smode]').forEach(x => x.classList.toggle('on', x === b)); body.classList.toggle('operate', mode === 'run'); return; }
      if (b.dataset.skind) return SC.insert(b.dataset.skind);
      ({ rung: () => SC.addRung(), branch: SC.branch, ml: () => SC.move(-1), mr: () => SC.move(1), del: SC.del, undo: SC.undo, redo: SC.redo })[b.dataset.sact]?.();
    });
    let held = null;
    body.addEventListener('pointerdown', ev => {
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
    body.addEventListener('dblclick', ev => { const g = ev.target.closest('[data-path]'); if (g && !g.dataset.li && mode === 'edit') SC.retag(byPath(g.dataset.path).e); });
    UI.longPress(body);
    body.addEventListener('contextmenu', ev => {
      const g = ev.target.closest('[data-path]'); if (!g || g.dataset.li) return;
      ev.preventDefault();
      const { e } = byPath(g.dataset.path); SEL = { r: byPath(g.dataset.path).ri, e, leg: null }; SC.render();
      const c = devOf(e.tag);
      UI.menu(ev.clientX, ev.clientY, [{ head: `${e.tag} · ${SK[e.k].n}` }, { label: 'Change tag…', onClick: () => SC.retag(e) },
        { label: 'Branch around this', onClick: SC.branch }, { label: 'Show in Wiring', disabled: !c, onClick: () => { App.showView('wiring'); Workspace.selectComp(c.id); } },
        { label: 'Delete', danger: true, onClick: SC.del }]);
    });
  };
  const btnLabel = k => ({ pbno: 'PB ⊣⊢', pbnc: 'PB ⊣/⊢', sel: 'SEL', estop: 'E-STOP', lsno: 'LS NO', lsnc: 'LS NC', kmno: 'KM NO', kmnc: 'KM NC', kano: 'KA NO', kanc: 'KA NC', ktno: 'KT NO', ktnc: 'KT NC', olnc: 'OL NC', olno: 'OL NO', kmcoil: 'KM ◯', kacoil: 'KA ◯', ktcoil: 'KT ▭', lamp: 'H ⊗', horn: 'HA' })[k];

  SC.render = function () { renderRungs(); renderSide(); };
  function renderRungs() {
    if (!body || !App.project || !sch()) return;
    if (!railOk(sch().L) || !railOk(sch().N)) { const [l, n] = autoRails(); sch().L = l; sch().N = n; }
    SC.errs = check();
    const sl = body.scrollLeft, stp = body.scrollTop;
    const s = sch();
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
  const liveSig = () => railLive() + sch().rungs.map(r => JSON.stringify(r.elems.map(function f(e) { if (e.k === 'br') return e.legs.map(l => l.map(f)); const s = state(e); return [s.on, s.inLive, s.outLive]; }))).join('|');
  SC.update = function () {
    if (!body || !App.project || !sch()) return;
    if (liveSig() !== lastSig) renderRungs();
  };
  function renderSide() {
    if (!side || !App.project || !sch()) return;
    const s = sch(), ch = supplyChoices(), errs = SC.errs ? [...SC.errs.values()] : [];
    side.innerHTML = `<div class="side-head"><h4>Schematic</h4></div><div class="props">
      <label class="field"><span>Supply rail (L or +24 V)</span><select data-rail="L">${ch.map(o => `<option value="${esc(o.k)}" ${o.k === s.L ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>
      <label class="field"><span>Return rail (N or 0 V)</span><select data-rail="N">${ch.map(o => `<option value="${esc(o.k)}" ${o.k === s.N ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>
      ${!ch.length ? '<p class="help warn-txt">Add a supply in the Wiring first (1-phase supply or 24 VDC power supply).</p>' : ''}
      ${errs.length ? `<h5>Problems</h5><ul class="verify">${errs.map(m => `<li class="e">${esc(m)}</li>`).join('')}</ul><p class="help">A rung with a problem is not wired.</p>` : ''}
      <h5>How it works</h5><ul class="tips"><li>Each symbol is a real device in the Wiring, found by its tag (S1, KM1…) or created there.</li>
      <li>The rungs are wired for you between the two rails. Change a rung and its wires follow.</li>
      <li>☝ Operate: click push buttons, selectors, limit switches and overload contacts to work them.</li>
      <li>Double-click a symbol to change its tag. Contacts of KM1 follow coil KM1.</li></ul></div>`;
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
    if (c && k.toLowerCase() === 'z') { ev.preventDefault(); SC.undo(); }
    else if (c && k.toLowerCase() === 'y') { ev.preventDefault(); SC.redo(); }
    else if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); SC.del(); }
    else if (k === 'Escape') { SEL = { r: -1, e: null, leg: null }; SC.render(); }
  };
  SC.resetSel = () => { SEL = { r: -1, e: null, leg: null }; undo = []; redo = []; SC.errs = null; lastSig = ''; };
  SC.state = state;
  window.Schematic = SC;
})();
