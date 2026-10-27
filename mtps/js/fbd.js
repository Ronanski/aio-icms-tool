/* MT PLC Studio Function Block Diagram routines (Logix 5000 FBD, 1756-PM009J; instructions 1756-RM018A).
   A routine of Type 'FBD' holds sheets: { desc, els, wires }. Sheets only organise the drawing: every sheet runs.
   Elements: IREF (input reference: a tag or a constant), OREF (output reference: a tag), ICON / OCON (wire
   connectors, by name, across sheets) and BLK (a function block with its backing tag, e.g. TONR_01 : FBD_TIMER).
   A wire goes from an output pin to an input pin: { a, ap, b, bp, ada } (ada: Assume Data Available).
   Execution each scan (PM009 Summary): 1. the IREF values are latched, 2. the blocks run in the order of the data
   flow (an input needs its data first; a feedback wire marked Assume Data Available uses last scan's value),
   3. the OREFs are written. A wired input pin is copied into the block's tag before the block runs; an input pin
   without a wire uses the value in the tag (Properties > Parameters > Value).
   This file has the engine part (types, compile, execute) and the editor (sheets, elements, wires, live values). */
(function (root) {
  'use strict';
  const MTPS = root.MTPS;
  const U = s => String(s == null ? '' : s).toUpperCase();
  const mem = s => s.split(' ').map(x => { const k = x.indexOf(':'); return { name: x.slice(0, k), type: x.slice(k + 1) }; });
  const IN8 = [1, 2, 3, 4, 5, 6, 7, 8].map(k => `In${k}:BOOL`).join(' ');

  /* ---------- the FBD data types (RM018A, the "<NAME> Structure" tables) ---------- */
  const TYPES = {
    FBD_MATH: 'EnableIn:BOOL SourceA:REAL SourceB:REAL EnableOut:BOOL Dest:REAL',
    FBD_MATH_ADVANCED: 'EnableIn:BOOL Source:REAL EnableOut:BOOL Dest:REAL',
    FBD_COMPARE: 'EnableIn:BOOL SourceA:REAL SourceB:REAL EnableOut:BOOL Dest:BOOL',
    FBD_LIMIT: 'EnableIn:BOOL LowLimit:REAL Test:REAL HighLimit:REAL EnableOut:BOOL Dest:BOOL',
    FBD_MASK_EQUAL: 'EnableIn:BOOL Source:DINT Mask:DINT Compare:DINT EnableOut:BOOL Dest:BOOL',
    FBD_LOGICAL: 'EnableIn:BOOL SourceA:DINT SourceB:DINT EnableOut:BOOL Dest:DINT',
    FBD_CONVERT: 'EnableIn:BOOL Source:DINT EnableOut:BOOL Dest:DINT',
    FBD_TRUNCATE: 'EnableIn:BOOL Source:REAL EnableOut:BOOL Dest:DINT',
    FBD_BOOLEAN_AND: `EnableIn:BOOL ${IN8} EnableOut:BOOL Out:BOOL`,
    FBD_BOOLEAN_OR: `EnableIn:BOOL ${IN8} EnableOut:BOOL Out:BOOL`,
    FBD_BOOLEAN_XOR: 'EnableIn:BOOL In1:BOOL In2:BOOL EnableOut:BOOL Out:BOOL',
    FBD_BOOLEAN_NOT: 'EnableIn:BOOL In:BOOL EnableOut:BOOL Out:BOOL',
    FBD_MASKED_MOVE: 'EnableIn:BOOL Source:DINT Mask:DINT Target:DINT EnableOut:BOOL Dest:DINT',
    FBD_ONESHOT: 'EnableIn:BOOL InputBit:BOOL EnableOut:BOOL OutputBit:BOOL',
    FBD_TIMER: 'EnableIn:BOOL TimerEnable:BOOL PRE:DINT Reset:BOOL EnableOut:BOOL ACC:DINT EN:BOOL TT:BOOL DN:BOOL Status:DINT',
    FBD_COUNTER: 'EnableIn:BOOL CUEnable:BOOL CDEnable:BOOL PRE:DINT Reset:BOOL EnableOut:BOOL ACC:DINT CU:BOOL CD:BOOL DN:BOOL OV:BOOL UN:BOOL',
  };
  for (const n in TYPES) {
    if (MTPS.PREDEF[n]) continue;   // FBD_TIMER, FBD_COUNTER: from the engine
    const m = mem(TYPES[n]);
    // EnableIn: "Default is set"; the In1..In8 of BAND: "Set to 1 on first download" (RM018A)
    m.forEach(x => { if (x.name === 'EnableIn' || (n === 'FBD_BOOLEAN_AND' && /^In\d$/.test(x.name))) x.init = 1; });
    MTPS.PREDEF[n] = m;
  }

  /* ---------- the blocks: mnemonic → { type, grp, name, ins, outs, run } ----------
     Pins are the members of the type; '-' before a name: hidden by default (shown with Properties > Vis).
     EnableIn / EnableOut are hidden pins of every block. run(s, st, c): s the block's tag, st its own state. */
  const BLK = {};
  const pinList = s => (s ? s.split(' ') : []).map(x => ({ n: x.replace(/^-/, ''), hide: x[0] === '-' }));
  const def = (t, type, grp, name, ins, outs, run) => { BLK[t] = { t, type, grp, name, ins: [{ n: 'EnableIn', hide: true }, ...pinList(ins)], outs: [{ n: 'EnableOut', hide: true }, ...pinList(outs)], run }; };
  const R32 = Math.fround;
  // an overflow or a divide by zero: S:V and a minor fault (type 4, code 4), as an instruction in the ladder
  const ovf = c => { const S = c.S; if (!S.V) { S.V = 1; S.MINOR = 1; c.minorFault(4, 4, 'Arithmetic overflow (or divide by zero) in a function block: S:V is set'); } };
  const real = (c, s, v) => { const f = R32(v); if (!isFinite(f)) ovf(c); s.Dest = f; };
  const dint = v => MTPS.X.store('DINT', v);
  const math = (t, name, f) => def(t, 'FBD_MATH', 'Compute/Math', name, 'SourceA SourceB', 'Dest', (s, st, c) => real(c, s, f(s.SourceA, s.SourceB)));
  const adv = (t, grp, name, f) => def(t, 'FBD_MATH_ADVANCED', grp, name, 'Source', 'Dest', (s, st, c) => real(c, s, f(s.Source)));
  const cmp = (t, name, f) => def(t, 'FBD_COMPARE', 'Compare', name, 'SourceA SourceB', 'Dest', s => { s.Dest = f(s.SourceA, s.SourceB) ? 1 : 0; });
  const lgc = (t, name, f) => def(t, 'FBD_LOGICAL', 'Move/Logical', name, 'SourceA SourceB', 'Dest', s => { s.Dest = f(s.SourceA | 0, s.SourceB | 0) | 0; });
  math('ADD', 'Add', (a, b) => a + b);
  math('SUB', 'Subtract', (a, b) => a - b);
  math('MUL', 'Multiply', (a, b) => a * b);
  // SourceB zero: 1.#INF for a floating-point divide (RM018A DIV, note 1)
  math('DIV', 'Divide', (a, b) => a / b);
  math('MOD', 'Modulo', (a, b) => (b === 0 ? a / b : a - b * Math.trunc(a / b)));
  adv('SQR', 'Compute/Math', 'Square Root', v => Math.sqrt(Math.abs(v)));
  adv('NEG', 'Compute/Math', 'Negate', v => -v);
  adv('ABS', 'Compute/Math', 'Absolute Value', Math.abs);
  math('XPY', 'X to the Power of Y', Math.pow); BLK.XPY.grp = 'Advanced Math';
  adv('LN', 'Advanced Math', 'Natural Log', Math.log);
  adv('LOG', 'Advanced Math', 'Log Base 10', Math.log10);
  adv('SIN', 'Trigonometry', 'Sine', Math.sin);
  adv('COS', 'Trigonometry', 'Cosine', Math.cos);
  adv('TAN', 'Trigonometry', 'Tangent', Math.tan);
  adv('ASN', 'Trigonometry', 'Arc Sine', Math.asin);
  adv('ACS', 'Trigonometry', 'Arc Cosine', Math.acos);
  adv('ATN', 'Trigonometry', 'Arc Tangent', Math.atan);
  adv('DEG', 'Math Conversions', 'Radians to Degrees', v => v * 180 / Math.PI);
  adv('RAD', 'Math Conversions', 'Degrees to Radians', v => v * Math.PI / 180);
  def('TRN', 'FBD_TRUNCATE', 'Math Conversions', 'Truncate', 'Source', 'Dest', s => { s.Dest = dint(Math.trunc(s.Source)); });
  cmp('EQU', 'Equal To', (a, b) => a === b);
  cmp('NEQ', 'Not Equal To', (a, b) => a !== b);
  cmp('LES', 'Less Than', (a, b) => a < b);
  cmp('LEQ', 'Less Than or Equal To', (a, b) => a <= b);
  cmp('GRT', 'Greater Than', (a, b) => a > b);
  cmp('GEQ', 'Greater Than or Equal To', (a, b) => a >= b);
  // Low > High: true outside the band (as the ladder LIM)
  def('LIM', 'FBD_LIMIT', 'Compare', 'Limit', 'LowLimit Test HighLimit', 'Dest', s => { const l = s.LowLimit, h = s.HighLimit, v = s.Test; s.Dest = (l <= h ? v >= l && v <= h : v >= l || v <= h) ? 1 : 0; });
  def('MEQ', 'FBD_MASK_EQUAL', 'Compare', 'Mask Equal To', 'Source Mask Compare', 'Dest', s => { s.Dest = (s.Source & s.Mask) === (s.Compare & s.Mask) ? 1 : 0; });
  lgc('AND', 'Bitwise And', (a, b) => a & b);
  lgc('OR', 'Bitwise Inclusive Or', (a, b) => a | b);
  lgc('XOR', 'Bitwise Exclusive Or', (a, b) => a ^ b);
  def('NOT', 'FBD_CONVERT', 'Move/Logical', 'Bitwise Not', 'Source', 'Dest', s => { s.Dest = ~s.Source; });
  const IN = n => [1, 2, 3, 4, 5, 6, 7, 8].map(k => (k > n ? '-' : '') + 'In' + k).join(' ');
  def('BAND', 'FBD_BOOLEAN_AND', 'Move/Logical', 'Boolean AND', IN(2), 'Out', s => { s.Out = s.In1 && s.In2 && s.In3 && s.In4 && s.In5 && s.In6 && s.In7 && s.In8 ? 1 : 0; });
  def('BOR', 'FBD_BOOLEAN_OR', 'Move/Logical', 'Boolean OR', IN(2), 'Out', s => { s.Out = s.In1 || s.In2 || s.In3 || s.In4 || s.In5 || s.In6 || s.In7 || s.In8 ? 1 : 0; });
  def('BXOR', 'FBD_BOOLEAN_XOR', 'Move/Logical', 'Boolean Exclusive OR', 'In1 In2', 'Out', s => { s.Out = !!s.In1 !== !!s.In2 ? 1 : 0; });
  def('BNOT', 'FBD_BOOLEAN_NOT', 'Move/Logical', 'Boolean NOT', 'In', 'Out', s => { s.Out = s.In ? 0 : 1; });
  def('MVMT', 'FBD_MASKED_MOVE', 'Move/Logical', 'Masked Move with Target', 'Source Mask Target', 'Dest', s => { s.Dest = (s.Target & ~s.Mask) | (s.Source & s.Mask); });
  // OSRI / OSFI: "Instruction first scan: previous InputBit history is set to require a False to True transition"
  def('OSRI', 'FBD_ONESHOT', 'Bit', 'One Shot Rising with Input', 'InputBit', 'OutputBit', (s, st) => { const i = s.InputBit ? 1 : 0; s.OutputBit = i && st.prev === 0 ? 1 : 0; st.prev = i; });
  def('OSFI', 'FBD_ONESHOT', 'Bit', 'One Shot Falling with Input', 'InputBit', 'OutputBit', (s, st) => { const i = s.InputBit ? 1 : 0; s.OutputBit = !i && st.prev === 1 ? 1 : 0; st.prev = i; });

  /* the FBD timers and counter (RM018A chapter 3): TONR, TOFR, RTOR, CTUD run as in ST, by the engine (MTPS.FBDI);
     the first scan after a prescan starts them as the reference prescan does (MTPS.fbdPrescan) */
  for (const t of ['TONR', 'TOFR', 'RTOR', 'CTUD'])
    def(t, MTPS.FBDT[t], 'Timer/Counter', MTPS.FBDN[t], t === 'CTUD' ? 'CUEnable CDEnable PRE Reset' : 'TimerEnable PRE Reset', t === 'CTUD' ? 'ACC CU CD DN -OV -UN' : 'ACC EN TT DN -InstructFault -PresetInv',
      (s, st, c) => { if (st.first) { st.first = false; MTPS.fbdPrescan(t, s); } MTPS.FBDI[t](c, s); });
  const GROUPS = ['Compute/Math', 'Compare', 'Move/Logical', 'Bit', 'Timer/Counter', 'Advanced Math', 'Math Conversions', 'Trigonometry'];
  const typeOfPin = (b, pin) => { const m = MTPS.PREDEF[b.type].find(x => x.name === pin); return m ? m.type : null; };

  /* ---------- compile (Verify, Download) ----------
     err / warn (sheet, id, what, msg). The order of execution comes from the wires (PM009, Order of execution):
     a block runs after the blocks that feed its inputs; blocks not wired together run in sheet order. A loop needs
     one wire marked Assume Data Available; a loop where every wire is marked, or two blocks joined by wires with
     different marks, cannot be resolved. */
  const isNum = s => MTPS.parseNumber(String(s || '').trim());
  function compile(M, P, R, err, warn) {
    const X = MTPS.X, src = R.fbd, sheets = Array.isArray(src.sheets) ? src.sheets : [];
    const els = new Map(), ocons = new Map(), what = e => (e.k === 'BLK' ? `${e.t} ${e.tag || '?'}` : `${e.k} ${(e.k === 'IREF' || e.k === 'OREF' ? e.op : e.name) || '?'}`);
    sheets.forEach((sh, si) => (sh.els || []).forEach((e, n) => {
      if (els.has(e.id)) { err(si, e.id, what(e), 'Element id used twice'); return; }
      els.set(e.id, { e, si, n, ins: new Map() });
    }));
    const E = id => els.get(id);
    // the wires: output pin → input pin of the same sheet, one wire per input pin
    sheets.forEach((sh, si) => (sh.wires || []).forEach(w => {
      const a = E(w.a), b = E(w.b);
      if (!a || !b || a.si !== si || b.si !== si) { err(si, null, '', 'A wire is not connected at both ends'); return; }
      if (!outPins(a.e).includes(w.ap) || !inPins(b.e).includes(w.bp)) { err(si, b.e.id, what(b.e), `Wire to a pin that does not exist (${w.ap} → ${w.bp})`); return; }
      if (b.ins.has(w.bp)) { err(si, b.e.id, what(b.e), `Input pin ${w.bp} has more than one wire`); return; }
      b.ins.set(w.bp, w);
    }));
    for (const x of els.values()) if (x.e.k === 'OCON') {
      const n = U(x.e.name);
      if (!MTPS.validName(x.e.name)) err(x.si, x.e.id, what(x.e), 'Invalid connector name');
      else if (ocons.has(n)) err(x.si, x.e.id, what(x.e), `The OCON name '${x.e.name}' is used more than once: each OCON needs a unique name`);
      else ocons.set(n, x);
    }
    const icons = new Set([...els.values()].filter(x => x.e.k === 'ICON').map(x => U(x.e.name)));
    const blocks = [], irefs = [], orefs = [];
    for (const x of els.values()) {
      const e = x.e, er = m => err(x.si, e.id, what(e), m);
      if (e.k === 'IREF') {
        const c = isNum(e.op);
        if (!String(e.op || '').trim() || e.op === '?') { er('Missing operand: an IREF needs a tag or a value'); continue; }
        if (c) { x.ref = new X.Const(c.v, c.real); x.ty = c.real ? 'REAL' : 'DINT'; }
        else {
          const r = X.ref(M, P, String(e.op).trim());
          if (typeof r === 'string') { er(r); continue; }
          if (r.dim || !MTPS.ATOMIC.includes(r.type)) { er(`'${e.op}' is a ${r.type}${r.dim ? ' array' : ''}: an IREF needs a BOOL, SINT, INT, DINT, LINT, REAL or LREAL value`); continue; }
          x.ref = r; x.ty = r.type;
        }
        x.li = irefs.length; irefs.push(x);
        if (!(sheets[x.si].wires || []).some(w => w.a === e.id)) warn(x.si, e.id, what(e), 'The IREF is not wired to any input');
      } else if (e.k === 'OREF') {
        if (!String(e.op || '').trim() || e.op === '?') { er('Missing operand: an OREF needs a tag'); continue; }
        if (isNum(e.op)) { er('An OREF needs a tag, not a constant'); continue; }
        const r = X.ref(M, P, String(e.op).trim());
        if (typeof r === 'string') { er(r); continue; }
        if (r.dim || !MTPS.ATOMIC.includes(r.type)) { er(`'${e.op}' is a ${r.type}${r.dim ? ' array' : ''}: an OREF needs a BOOL, SINT, INT, DINT, LINT, REAL or LREAL tag`); continue; }
        if (r.ro || r.konst) { er(r.konst ? `'${e.op}' is a constant tag: logic cannot write to it` : `'${e.op}' cannot be written`); continue; }
        if (!x.ins.has('In')) { er('The OREF has no input wire'); continue; }
        x.ref = r; x.ty = r.type; orefs.push(x);
      } else if (e.k === 'OCON') {
        if (!x.ins.has('In')) er('The OCON has no input wire');
        if (!icons.has(U(e.name))) er(`No ICON reads the OCON '${e.name}': each OCON needs at least one ICON with the same name`);
      } else if (e.k === 'ICON') {
        if (!ocons.has(U(e.name))) er(`No OCON named '${e.name || '?'}' in this routine`);
      } else if (e.k === 'BLK') {
        const b = BLK[e.t];
        if (!b) { er(`Unknown function block '${e.t}'`); continue; }
        if (!String(e.tag || '').trim()) { er(`Missing backing tag: ${e.t} needs a tag of type ${b.type}`); continue; }
        const r = X.ref(M, P, String(e.tag).trim());
        if (typeof r === 'string') { er(r); continue; }
        if (r.type !== b.type || r.dim) { er(`Tag '${e.tag}' is a ${r.type}${r.dim ? ' array' : ''}: ${e.t} needs a ${b.type}`); continue; }
        if (r.konst) { er(`'${e.tag}' is a constant tag: the block cannot write to it`); continue; }
        x.ref = r; x.def = b; x.bi = blocks.length; blocks.push(x);
      }
    }
    // where the value on a wire comes from: a block's output pin, a latched IREF, or (through ICON → OCON) further back
    const producer = (w, depth = 0) => {
      const a = E(w.a);
      if (!a || depth > 64) return null;
      if (a.e.k === 'ICON') { const oc = ocons.get(U(a.e.name)), iw = oc && oc.ins.get('In'); return iw ? producer(iw, depth + 1) : null; }
      return { x: a, pin: w.ap, ada: !!w.ada };
    };
    const getter = (w, ty) => {
      const p = producer(w);
      if (!p || !p.x.ref && p.x.e.k !== 'IREF') return () => 0;
      if (p.x.e.k === 'IREF') { const k = p.x.li; return () => F.latched[k]; }
      const r = p.x.ref, pin = p.pin;
      return () => r.obj()[pin];
    };
    const F = { latched: [], blocks: [], orefs: [], st: new Map(), els };
    // the data flow between blocks
    const edges = [];
    for (const x of blocks) for (const [pin, w] of x.ins) {
      const p = producer(w);
      if (p && p.x.def && p.x !== x) edges.push({ a: p.x.bi, b: x.bi, ada: p.ada || !!w.ada, pin });
    }
    const pair = new Map();
    for (const g of edges) { const k = g.a + '>' + g.b, v = pair.get(k); if (v === undefined) pair.set(k, g.ada); else if (v !== g.ada) { pair.set(k, 'mixed'); } }
    for (const [k, v] of pair) if (v === 'mixed') { const [a, b] = k.split('>').map(Number), x = blocks[b]; err(x.si, x.e.id, what(x.e), `The wires from ${blocks[a].e.tag} to ${x.e.tag} must all use the same data flow indicator (Assume Data Available on all or none)`); }
    const scc = list => {
      // Tarjan: the strongly connected groups of blocks
      const adj = blocks.map(() => []); list.forEach(g => adj[g.a].push(g.b));
      let ix = 0; const idx = [], low = [], on = [], stack = [], out = [];
      const sc = v => {
        idx[v] = low[v] = ix++; stack.push(v); on[v] = true;
        for (const w of adj[v]) { if (idx[w] === undefined) { sc(w); low[v] = Math.min(low[v], low[w]); } else if (on[w]) low[v] = Math.min(low[v], idx[w]); }
        if (low[v] === idx[v]) { const c = []; let w; do { w = stack.pop(); on[w] = false; c.push(w); } while (w !== v); out.push(c); }
      };
      blocks.forEach((b, v) => { if (idx[v] === undefined) sc(v); });
      return out;
    };
    let loops = false;
    for (const c of scc(edges.filter(g => !g.ada))) if (c.length > 1) {
      loops = true;
      for (const v of c) { const x = blocks[v]; err(x.si, x.e.id, what(x.e), 'Unresolved loop: the controller cannot tell which block runs first. Mark the feedback wire with Assume Data Available'); }
    }
    for (const c of scc(edges)) if (c.length > 1) {
      const set = new Set(c), inner = edges.filter(g => set.has(g.a) && set.has(g.b));
      if (inner.length && inner.every(g => g.ada)) { const x = blocks[c[0]]; err(x.si, x.e.id, what(x.e), 'The loop cannot be resolved: all of its wires use Assume Data Available (mark only the feedback wire)'); }
    }
    if (loops) return;
    // the order: a block is ready when the blocks feeding it (without the marker) have run; ties in sheet order
    const need = blocks.map(() => 0), next = blocks.map(() => []);
    edges.filter(g => !g.ada).forEach(g => { need[g.b]++; next[g.a].push(g.b); });
    const done = new Set(), order = [];
    while (order.length < blocks.length) {
      let v = -1;
      for (let k = 0; k < blocks.length; k++) if (!done.has(k) && need[k] === 0) { v = k; break; }
      if (v < 0) break;
      done.add(v); order.push(v); next[v].forEach(w => need[w]--);
    }
    F.blocks = order.map(v => {
      const x = blocks[v];
      return { x, ref: x.ref, def: x.def, ins: [...x.ins].map(([pin, w]) => [pin, getter(w), typeOfPin(x.def, pin)]) };
    });
    F.order = order.map(v => blocks[v].e.id);
    F.irefs = irefs.map(x => x.ref);
    F.orefs = orefs.map(x => ({ ref: x.ref, get: getter(x.ins.get('In')) }));
    // live values of the connectors (the value on their wire)
    F.conn = new Map([...els.values()].filter(x => x.e.k === 'OCON' || x.e.k === 'ICON').map(x => {
      const w = x.e.k === 'OCON' ? x.ins.get('In') : (() => { const oc = ocons.get(U(x.e.name)); return oc && oc.ins.get('In'); })();
      return [x.e.id, w ? getter(w) : () => 0];
    }));
    F.oget = new Map(orefs.map((x, k) => [x.e.id, F.orefs[k].get]));
    R.fx = F;
  }
  const conv = (ty, v) => (ty === 'BOOL' ? (v ? 1 : 0) : ty ? MTPS.X.store(ty, Number(v) || 0) : v);
  /* one execution of the routine (each scan, or each JSR) */
  function exec(c, R) {
    const F = R.fx;
    for (let k = 0; k < F.irefs.length; k++) F.latched[k] = F.irefs[k].get();
    for (const b of F.blocks) {
      const s = b.ref.obj();
      for (const [pin, get, ty] of b.ins) s[pin] = conv(ty, get());
      if (!s.EnableIn) { s.EnableOut = 0; continue; }
      s.EnableOut = 1;
      let st = F.st.get(b.x.e.id);
      if (!st) { st = { first: true, prev: 1 }; F.st.set(b.x.e.id, st); }
      b.def.run(s, st, c);
    }
    for (const o of F.orefs) o.ref.set(o.get());
  }
  /* Prescan (Program → Run): EnableOut cleared; the one-shots, counters and timers start as on a first scan */
  function prescan(c, R) {
    const F = R.fx;
    F.st.clear();
    for (const b of F.blocks) { try { b.ref.obj().EnableOut = 0; } catch (e) { /* ignore */ } }
  }
  /* the live values for the editor: { id: { pin: value } } from the controller's copy of the routine */
  function liveOf(c, prog, routine) {
    if (!c || !c.M) return null;
    const P = c.M.programs.find(p => U(p.name) === U(prog)), R = P && P.routines.get(U(routine));
    const F = R && R.fx;
    if (!F) return null;
    const out = {};
    const safe = f => { try { return f(); } catch (e) { return undefined; } };
    for (const [id, x] of F.els) {
      const e = x.e;
      if (e.k === 'IREF' && x.li != null) out[id] = { Out: F.latched[x.li] !== undefined ? F.latched[x.li] : safe(() => x.ref.get()), ty: x.ty };
      else if (e.k === 'OREF' && F.oget.has(id)) out[id] = { In: safe(F.oget.get(id)), ty: x.ty };
      else if ((e.k === 'ICON' || e.k === 'OCON') && F.conn.has(id)) { const v = safe(F.conn.get(id)); out[id] = { In: v, Out: v }; }
      else if (e.k === 'BLK' && x.ref) { const s = safe(() => x.ref.obj()); if (s) out[id] = s; }
    }
    return out;
  }
  const inPins = e => (e.k === 'BLK' ? (BLK[e.t] ? BLK[e.t].ins.map(p => p.n) : []) : e.k === 'OREF' || e.k === 'OCON' ? ['In'] : []);
  const outPins = e => (e.k === 'BLK' ? (BLK[e.t] ? BLK[e.t].outs.map(p => p.n) : []) : e.k === 'IREF' || e.k === 'ICON' ? ['Out'] : []);

  const FBD = MTPS.FBD = { TYPES, BLK, GROUPS, compile, exec, prescan, liveOf, inPins, outPins, typeOfPin };
  if (typeof document === 'undefined') { if (typeof module !== 'undefined' && module.exports) module.exports = FBD; return; }

  /* ================= the editor ================= */
  let A = null;                 // the app's helpers (FBD.init)
  const UI = { sel: null, arm: null, drag: null, sheet: {}, scroll: {}, live: '', liveAt: 0 };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rt = () => (A ? A.curRoutine() : null);
  const on = () => !!A && !A.S.noProj && A.S.view === 'ladder' && !!rt() && rt().type === 'FBD';
  const rkey = () => A.S.prog + '/' + A.S.routine;
  const sheetIx = () => { const r = rt(), n = (r.sheets || []).length; let k = UI.sheet[rkey()] || 0; if (k >= n) k = Math.max(0, n - 1); return k; };
  const sheet = () => rt().sheets[sheetIx()];
  const elOf = id => { for (const sh of rt().sheets) for (const e of sh.els) if (e.id === id) return e; return null; };
  const nextId = r => 1 + Math.max(0, ...r.sheets.flatMap(sh => sh.els.map(e => e.id)));
  /* a new FBD routine: one sheet */
  const blank = () => ({ type: 'FBD', rungs: [], sheets: [{ desc: '', els: [], wires: [] }] });

  /* ---------- geometry ---------- */
  const ROW = 18, HEAD = 32, CW = 6.6, STUB = 12;
  // the pins shown: the default ones, those ticked in Properties (vis), and every wired one
  function shownPins(e, sh) {
    const b = BLK[e.t];
    if (!b) return { ins: [], outs: [] };
    const wired = new Set((sh || sheet()).wires.flatMap(w => [w.a === e.id ? 'o:' + w.ap : '', w.b === e.id ? 'i:' + w.bp : '']));
    const vis = e.vis ? new Set(e.vis) : null;
    const pick = (list, io) => list.filter(p => wired.has(io + p.n) || (vis ? vis.has(p.n) : !p.hide)).map(p => p.n);
    return { ins: pick(b.ins, 'i:'), outs: pick(b.outs, 'o:') };
  }
  function geo(e, sh) {
    if (e.k === 'BLK') {
      const p = shownPins(e, sh), n = Math.max(p.ins.length, p.outs.length, 1);
      const li = Math.max(0, ...p.ins.map(s => s.length)), lo = Math.max(0, ...p.outs.map(s => s.length));
      const w = Math.max(110, Math.ceil(((li + lo) * CW + 34) / 10) * 10, Math.ceil(((e.tag || '').length * CW + 10) / 10) * 10);
      const h = HEAD + n * ROW + 6, pins = {};
      p.ins.forEach((s, i) => { pins['i:' + s] = { x: -STUB, y: HEAD + i * ROW + ROW / 2, out: false, n: s }; });
      p.outs.forEach((s, i) => { pins['o:' + s] = { x: w + STUB, y: HEAD + i * ROW + ROW / 2, out: true, n: s }; });
      return { w, h, pins };
    }
    const txt = e.k === 'IREF' || e.k === 'OREF' ? e.op || '?' : e.name || '?';
    const w = Math.max(e.k === 'ICON' || e.k === 'OCON' ? 70 : 90, Math.ceil((txt.length * CW + 20) / 10) * 10), h = 22;
    const out = e.k === 'IREF' || e.k === 'ICON';
    return { w, h, pins: out ? { 'o:Out': { x: w + STUB, y: h / 2, out: true, n: 'Out' } } : { 'i:In': { x: -STUB, y: h / 2, out: false, n: 'In' } } };
  }
  const posOf = e => (UI.drag && UI.drag.moved && UI.drag.id === e.id ? { x: UI.drag.nx, y: UI.drag.ny } : { x: e.x, y: e.y });
  const pinAt = (e, key, sh) => { const g = geo(e, sh), p = g.pins[key], o = posOf(e); return p ? { x: o.x + p.x, y: o.y + p.y } : null; };
  function wirePath(p, q) {
    if (q.x >= p.x + 16) { const m = Math.round((p.x + q.x) / 2); return `M${p.x} ${p.y}H${m}V${q.y}H${q.x}`; }
    const d = Math.max(p.y, q.y) + 28;
    return `M${p.x} ${p.y}H${p.x + 8}V${d}H${q.x - 8}V${q.y}H${q.x}`;
  }
  const fmt = (v, ty) => (v === undefined ? '' : ty === 'REAL' || ty === 'LREAL' || (typeof v === 'number' && !Number.isInteger(v)) ? (Number.isFinite(v) ? String(+v.toPrecision(7)) : v > 0 ? '1.#INF' : v < 0 ? '-1.#INF' : '1.#QNAN') : String(v));

  /* ---------- drawing ---------- */
  function draw() {
    const w = document.getElementById('fbdwrap');
    if (!w || !on()) return;
    const r = rt(), si = sheetIx(), sh = r.sheets[si], z = A.S.prefs.zoom || 1;
    const live = A.S.online ? liveOf(A.ctl(), A.S.prog, A.S.routine) : null;
    const errs = new Map();
    for (const x of (A.S.verify && A.S.verify.errors) || []) if (x.program === A.S.prog && x.routine === A.S.routine && x.el != null) errs.set(x.el, x.msg);
    const sel = UI.sel, arm = UI.arm;
    let maxX = 600, maxY = 400, wires = '', els = '';
    const tyOut = (e, pin) => (e.k === 'BLK' ? typeOfPin(BLK[e.t] || { type: '' }, pin) : live && live[e.id] ? live[e.id].ty : null);
    sh.wires.forEach((wr, k) => {
      const a = sh.els.find(x => x.id === wr.a), b = sh.els.find(x => x.id === wr.b);
      if (!a || !b) return;
      const p = pinAt(a, 'o:' + wr.ap, sh), q = pinAt(b, 'i:' + wr.bp, sh);
      if (!p || !q) return;
      const d = wirePath(p, q), ty = tyOut(a, wr.ap), lv = live && live[a.id] ? live[a.id][wr.ap] : undefined;
      const bool = ty === 'BOOL' && lv !== undefined, s = sel && sel.w === k;
      wires += `<path class="fw${bool ? (lv ? ' t1' : ' t0') : ''}${s ? ' sel' : ''}" d="${d}"/>`;
      if (wr.ada) wires += `<path class="fada" d="M${q.x - 22} ${q.y - 5}l8 5-8 5z"/>`;
      if (live && lv !== undefined && !bool && b.k === 'BLK') wires += `<text class="fv" x="${q.x - 3}" y="${q.y - 4}" text-anchor="end">${esc(fmt(lv, ty))}</text>`;
      wires += `<path class="fwh" data-fw="${k}" d="${d}"/>`;
    });
    for (const e of sh.els) {
      const g = geo(e, sh), o = posOf(e), cls = (sel && sel.id === e.id ? ' sel' : '') + (errs.has(e.id) ? ' err' : '');
      maxX = Math.max(maxX, o.x + g.w + 80); maxY = Math.max(maxY, o.y + g.h + 80);
      let s = `<g class="fe${cls}" transform="translate(${o.x},${o.y})">`;
      const lv = live && live[e.id];
      if (e.k === 'BLK') {
        const b = BLK[e.t] || { name: '?' };
        s += `<text class="ftag" x="${g.w / 2}" y="-5" text-anchor="middle">${esc(e.tag || '?')}</text>`;
        s += `<rect class="fbx" width="${g.w}" height="${g.h}" data-fe="${e.id}"/>`;
        s += `<text class="fmn" x="${g.w / 2}" y="13" text-anchor="middle">${esc(e.t)}</text><text class="fds" x="${g.w / 2}" y="25" text-anchor="middle">${esc(b.name.length > g.w / 5.6 ? b.name.slice(0, Math.floor(g.w / 5.6) - 1) + '…' : b.name)}</text>`;
        s += `<g data-fprops="${e.id}"><rect class="fpb" x="${g.w - 17}" y="3" width="14" height="11" rx="2"/><text class="fpt" x="${g.w - 10}" y="12" text-anchor="middle">…</text></g>`;
        for (const k in g.pins) {
          const p = g.pins[k], x0 = p.out ? g.w : 0;
          s += `<path class="fst" d="M${x0} ${p.y}H${p.x}"/><text class="fpn" x="${p.out ? g.w - 4 : 4}" y="${p.y + 4}"${p.out ? ' text-anchor="end"' : ''}>${esc(p.n)}</text>`;
          if (lv && p.out && lv[p.n] !== undefined) s += `<text class="fv" x="${p.x + 3}" y="${p.y - 4}">${esc(fmt(lv[p.n], typeOfPin(BLK[e.t], p.n)))}</text>`;
          if (lv && !p.out && lv[p.n] !== undefined && !sh.wires.some(w => w.b === e.id && w.bp === p.n)) s += `<text class="fv" x="${p.x - 2}" y="${p.y - 4}" text-anchor="end">${esc(fmt(lv[p.n], typeOfPin(BLK[e.t], p.n)))}</text>`;
        }
      } else {
        const txt = e.k === 'IREF' || e.k === 'OREF' ? e.op || '?' : e.name || '?', out = e.k === 'IREF' || e.k === 'ICON';
        const shape = e.k === 'ICON' ? `M0 0H${g.w}V${g.h}H0L8 ${g.h / 2}z` : e.k === 'OCON' ? `M0 0H${g.w - 8}L${g.w} ${g.h / 2}L${g.w - 8} ${g.h}H0z` : `M0 0H${g.w}V${g.h}H0z`;
        s += `<path class="fbx ${e.k.toLowerCase()}" d="${shape}" data-fe="${e.id}"/><text class="fop" x="${g.w / 2}" y="15" text-anchor="middle" data-fe="${e.id}">${esc(txt)}</text>`;
        const p = g.pins[out ? 'o:Out' : 'i:In'];
        s += `<path class="fst" d="M${out ? g.w : 0} ${p.y}H${p.x}"/>`;
        if (lv) { const v = out ? lv.Out : lv.In; if (v !== undefined) s += `<text class="fv" x="${g.w / 2}" y="-4" text-anchor="middle">${esc(fmt(v, lv.ty))}</text>`; }
        s += `<text class="fkd" x="${out ? 2 : g.w - 2}" y="${g.h + 10}"${out ? '' : ' text-anchor="end"'}>${e.k}</text>`;
      }
      for (const k in g.pins) {
        const p = g.pins[k], am = arm && arm.id === e.id && arm.key === k;
        s += `<circle class="fpd${am ? ' arm' : ''}" cx="${p.x}" cy="${p.y}" r="3"/><rect class="fph" data-pin="${e.id}|${k}" x="${p.x - 9}" y="${p.y - 9}" width="18" height="18"/>`;
      }
      els += s + '</g>';
    }
    let rubber = '';
    if (arm && arm.at) { const e = elOf(arm.id), p = e && pinAt(e, arm.key, sh); if (p) rubber = `<path class="fw rub" d="M${p.x} ${p.y}L${arm.at.x} ${arm.at.y}"/>`; }
    const W = Math.max(maxX, Math.round(w.clientWidth / z)), H = Math.max(maxY, Math.round(w.clientHeight / z));
    w.innerHTML = `<svg class="fbd${A.S.online ? ' online' : ''}" width="${Math.round(W * z)}" height="${Math.round(H * z)}" viewBox="0 0 ${W} ${H}"><defs><pattern id="fgrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" class="fgl"/></pattern></defs><rect class="fbg" data-fbg="1" width="${W}" height="${H}" fill="url(#fgrid)"/>${wires}${els}${rubber}</svg>`;
    const k = rkey(); if (UI.scroll[k]) { w.scrollLeft = UI.scroll[k][0]; w.scrollTop = UI.scroll[k][1]; }
    const sb = document.getElementById('fbdsel'); if (sb) sb.innerHTML = selText();
  }
  function selText() {
    const s = UI.sel;
    if (UI.arm) return 'Wiring: tap an ' + (UI.arm.out ? 'input' : 'output') + ' pin (Esc cancels)';
    if (!s) return A.S.layout === 'desktop' ? 'Click an element to select it; click an output pin, then an input pin, to wire them' : 'Tap an element; tap a pin, then another pin, to wire';
    if (s.w != null) { const wr = sheet().wires[s.w]; return wr ? `Wire ${wr.ap} → ${wr.bp}${wr.ada ? ' (Assume Data Available)' : ''}` : ''; }
    const e = elOf(s.id); if (!e) return '';
    return e.k === 'BLK' ? `${e.t} ${e.tag || ''}` : `${e.k} ${e.k === 'IREF' || e.k === 'OREF' ? e.op || '?' : e.name || '?'}`;
  }

  /* ---------- the editor's HTML: the sheet toolbar and the drawing ---------- */
  const ELEMS = [['IREF', 'Input Reference'], ['OREF', 'Output Reference'], ['ICON', 'Input Wire Connector'], ['OCON', 'Output Wire Connector']];
  const FAV = ['ADD', 'GRT', 'BAND', 'BOR', 'TONR', 'CTUD'];
  // the element buttons: the shape of the element; a block is a box with its mnemonic
  const glyph = m => (BLK[m] ? `<svg class="i" viewBox="0 0 26 16" aria-hidden="true"><path d="M3 1.5h20v13H3zM0 5h3M0 11h3M23 8h3" fill="none" stroke="currentColor" stroke-width="1.2"/><text class="fgt" x="13" y="10.6" text-anchor="middle" font-size="${m.length > 3 ? 6.2 : 7.4}">${m}</text></svg>`
    : `<svg class="i" viewBox="0 0 26 16" aria-hidden="true"><path d="${m === 'IREF' ? 'M2 3h16v10H2zM18 8h7' : m === 'OREF' ? 'M8 3h16v10H8zM1 8h7' : m === 'ICON' ? 'M3 3h16v10H3l3-5zM19 8h6' : m === 'OCON' ? 'M1 8h5M6 3h13l3 5-3 5H6z' : 'M5 1.5h16v13H5zM1 5h4M1 11h4M21 8h4'}" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`);
  // the Language Element toolbar of an FBD routine (in place of the ladder instructions)
  const glyphs = () => [...ELEMS.map(([m, n]) => [m, n]), ...FAV.map(m => [m, BLK[m].name])].map(([m, n]) => `<button class="gbtn" data-fbdadd="${m}" title="${esc(n)}"${A.editable() ? '' : ' disabled'}>${glyph(m)}<span>${m}</span></button>`).join('') + (A.S.layout === 'desktop' ? `<button class="gbtn more" data-fbdpick="1" title="All function blocks">${glyph('')}<span>Blocks…</span></button>` : '');
  function html() {
    const r = rt(), si = sheetIx(), n = r.sheets.length, d = r.sheets[si].desc || '';
    const b = (a, i, t, dis) => `<button class="ib" data-fbd="${a}" title="${esc(t)}"${dis ? ' disabled' : ''}>${A.ic(i)}</button>`;
    return `<div class="fbdbar">${b('prev', 'left', 'Previous sheet', si === 0)}<span class="fsh" data-fbd="sheets" title="Sheets">Sheet ${si + 1} of ${n}${d ? ' · ' + esc(d) : ''}</span>${b('next', 'right', 'Next sheet', si >= n - 1)}${b('add', 'plus', 'New Sheet', !A.editable())}${b('desc', 'edit', 'Sheet description', !A.editable())}${b('delsheet', 'trash', 'Delete Sheet', n < 2 || !A.editable())}
      <span class="vsep"></span><button class="btn fpick" data-fbdpick="1"${A.editable() ? '' : ' disabled'}>${A.ic('plus')}Add Element…</button><span class="fsel ell grow" id="fbdsel"></span>${b('ada', 'goto', 'Assume Data Available (selected wire)', !(UI.sel && UI.sel.w != null))}${b('props', 'gear', 'Properties (selected block)', !(UI.sel && UI.sel.id != null))}${b('del', 'close', 'Delete the selection', !UI.sel)}</div>
      <div class="fbdwrap" id="fbdwrap" tabindex="0"></div>`;
  }
  const selbar = () => '';

  /* ---------- edits ---------- */
  const ed = fn => A.edit(() => { const r = fn(rt()); if (r === false) return false; });
  function freeSpot(sh, w, h) {
    const wr = document.getElementById('fbdwrap'), z = A.S.prefs.zoom || 1;
    let x = wr ? Math.round((wr.scrollLeft / z + 40) / 10) * 10 : 40, y = wr ? Math.round((wr.scrollTop / z + 30) / 10) * 10 : 30;
    const hit = (x0, y0) => sh.els.some(e => { const g = geo(e, sh); return x0 < e.x + g.w + 40 && x0 + w + 40 > e.x && y0 < e.y + g.h + 30 && y0 + h + 30 > e.y; });
    for (let k = 0; k < 60 && hit(x, y); k++) { y += 40; if (k % 12 === 11) { x += 200; y -= 480; } }
    return { x, y };
  }
  // a backing tag for a new block, in the program: TONR_01, TONR_02, … (RM018A examples), EnableIn set
  function newTagFor(t) {
    const g = A.curProg(), all = new Set([...A.S.p.tags, ...g.tags].map(x => U(x.name)));
    let k = 1, n;
    do n = `${t}_${String(k++).padStart(2, '0')}`; while (all.has(U(n)));
    g.tags.push({ name: n, type: BLK[t].type });
    return n;
  }
  function add(kind) {
    if (!A.editable()) return;
    let id = 0;
    ed(r => {
      const sh = r.sheets[sheetIx()], e = { id: nextId(r), k: BLK[kind] ? 'BLK' : kind, x: 0, y: 0 };
      if (BLK[kind]) { e.t = kind; e.tag = newTagFor(kind); }
      else if (kind === 'IREF' || kind === 'OREF') e.op = '?';
      else if (kind === 'OCON') { let k = 1; const has = n => r.sheets.some(s => s.els.some(x => x.k === 'OCON' && U(x.name) === U(n))); while (has('Connector_' + k)) k++; e.name = 'Connector_' + k; }
      else if (kind === 'ICON') { const oc = r.sheets.flatMap(s => s.els).find(x => x.k === 'OCON'); e.name = oc ? oc.name : 'Connector_1'; }
      else return false;
      const g = geo(e, sh), p = freeSpot(sh, g.w, g.h); e.x = p.x; e.y = p.y;
      sh.els.push(e); id = e.id;
    });
    if (id) { UI.sel = { id }; draw(); if (kind === 'IREF' || kind === 'OREF') setTimeout(() => editOperand(id), 0); }
  }
  function delSel() {
    const s = UI.sel; if (!s || !A.editable()) return;
    ed(r => {
      const sh = r.sheets[sheetIx()];
      if (s.w != null) { if (!sh.wires[s.w]) return false; sh.wires.splice(s.w, 1); return; }
      const i = sh.els.findIndex(e => e.id === s.id); if (i < 0) return false;
      sh.els.splice(i, 1); sh.wires = sh.wires.filter(w => w.a !== s.id && w.b !== s.id);
    });
    UI.sel = null; draw();
  }
  function connect(a, b) {
    // a: the output end, b: the input end ({ id, key }); a new wire to a wired input replaces the old one
    const ap = a.key.slice(2), bp = b.key.slice(2);
    ed(r => {
      const sh = r.sheets[sheetIx()];
      sh.wires = sh.wires.filter(w => !(w.b === b.id && w.bp === bp));
      sh.wires.push({ a: a.id, ap, b: b.id, bp });
    });
    UI.sel = { w: sheet().wires.length - 1 };
  }
  function toggleAda() {
    const s = UI.sel; if (!s || s.w == null || !A.editable()) return;
    ed(r => { const w = r.sheets[sheetIx()].wires[s.w]; if (!w) return false; if (w.ada) delete w.ada; else w.ada = 1; });
    draw();
  }
  /* the operand of an IREF / OREF (a tag, or a value for an IREF; PM009 Use an IREF), or a connector's name */
  function editOperand(id) {
    const e = elOf(id); if (!e || !A.editable()) return;
    if (e.k === 'BLK') return assignTag(id);
    const ref = e.k === 'IREF' || e.k === 'OREF', cur = ref ? e.op : e.name;
    const list = ref ? A.candidates().filter(c => MTPS.ATOMIC.includes(c.type) && !c.dim).map(c => c.name)
      : [...new Set(rt().sheets.flatMap(s => s.els).filter(x => x.k === 'OCON').map(x => x.name))];
    A.dialog({ title: ref ? (e.k === 'IREF' ? 'Input Reference' : 'Output Reference') : e.k === 'ICON' ? 'Input Wire Connector' : 'Output Wire Connector', size: 'md', focus: true,
      body: `<div class="frow"><label>${ref ? (e.k === 'IREF' ? 'Tag or value' : 'Tag') : 'Name'}</label><input class="inp mono" id="fop" list="fopl" value="${esc(cur === '?' ? '' : cur)}" autocomplete="off" spellcheck="false" autocapitalize="off"><datalist id="fopl">${list.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
        <p class="help">${e.k === 'IREF' ? 'The value of the tag is latched at the start of each execution of the routine. A number (for example 5000) is an immediate value.' : e.k === 'OREF' ? 'The value is written to the tag after the blocks of the routine have run.' : e.k === 'ICON' ? 'Pick the OCON that supplies the value.' : 'Each OCON needs a unique name and at least one ICON with the same name.'}</p><div class="errtx" id="fope"></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        const v = el.querySelector('#fop').value.trim(), er = t => { el.querySelector('#fope').textContent = t; return false; };
        if (!v) return er(ref ? 'Type a tag name' + (e.k === 'IREF' ? ' or a value.' : '.') : 'Type a name.');
        if (!ref && !MTPS.validName(v)) return er('Use letters, digits and _ (up to 40).');
        ed(() => { const x = elOf(id); if (ref) x.op = v; else x.name = v; });
        draw();
      } }] });
  }
  /* assign another tag to a block (PM009: use the tag the application made, rename it, or assign a different tag) */
  function assignTag(id) {
    const e = elOf(id), b = e && BLK[e.t]; if (!b || !A.editable()) return;
    const list = A.candidates().filter(c => U(c.type) === b.type && !c.dim).map(c => c.name);
    A.dialog({ title: `${e.t} Tag`, size: 'md', focus: true,
      body: `<div class="frow"><label>Tag</label><input class="inp mono" id="fop" list="fopl" value="${esc(e.tag || '')}" autocomplete="off" spellcheck="false" autocapitalize="off"><datalist id="fopl">${list.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div><p class="help">A tag of type ${b.type}. A new name creates the tag in program ${esc(A.curProg().name)}.</p><div class="errtx" id="fope"></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        const v = el.querySelector('#fop').value.trim(), er = t => { el.querySelector('#fope').textContent = t; return false; };
        if (!MTPS.validName(v)) return er('Use letters, digits and _ (up to 40).');
        const g = A.curProg(), has = [...A.S.p.tags, ...g.tags].find(x => U(x.name) === U(v));
        if (has && U(has.type) !== b.type) return er(`Tag '${has.name}' is a ${has.type}: ${e.t} needs a ${b.type}.`);
        ed(() => { if (!has) g.tags.push({ name: v, type: b.type }); elOf(id).tag = v; });
        draw();
      } }] });
  }
  /* Properties > Parameters (PM009 Show or hide a pin, Enter a value in the tag of a block): Vis and Value per pin */
  function props(id) {
    const e = elOf(id), b = e && BLK[e.t]; if (!b) return;
    const g = A.curProg(), tg = [...g.tags, ...A.S.p.tags].find(x => U(x.name) === U(e.tag)), sp = shownPins(e);
    const lv = A.S.online ? (liveOf(A.ctl(), A.S.prog, A.S.routine) || {})[id] : null;
    const val = n => { const v = lv ? lv[n] : tg && tg.value ? tg.value[n] : undefined; return v != null ? v : (MTPS.PREDEF[b.type].find(m => m.name === n) || {}).init || 0; };
    const wired = n => sheet().wires.some(w => (w.b === id && w.bp === n) || (w.a === id && w.ap === n));
    const row = (p, io) => { const ty = typeOfPin(b, p.n), shown = io === 'i' ? sp.ins.includes(p.n) : sp.outs.includes(p.n);
      return `<tr><td><input type="checkbox" data-vis="${p.n}"${shown ? ' checked' : ''}${wired(p.n) ? ' disabled' : ''}></td><td class="mono">${p.n}</td><td>${io === 'i' ? 'Input' : 'Output'}</td><td>${ty}</td><td>${io === 'i' && !wired(p.n) ? `<input class="inp mono" data-val="${p.n}" data-ty="${ty}" value="${esc(val(p.n))}" style="width:96px">` : `<span class="mono">${esc(fmt(val(p.n), ty))}</span>`}</td></tr>`; };
    A.dialog({ title: `Properties - ${e.tag}`, size: 'lg',
      body: `<p class="help">Parameters of ${e.t} (${esc(b.name)}), tag ${esc(e.tag)} : ${b.type}. Vis shows the pin on the block; Value is the value of an input pin that has no wire.</p>
        <div class="fptw"><table class="fptbl"><thead><tr><th>Vis</th><th>Name</th><th>Usage</th><th>Data Type</th><th>Value</th></tr></thead><tbody>${b.ins.map(p => row(p, 'i')).join('')}${b.outs.map(p => row(p, 'o')).join('')}</tbody></table></div><div class="errtx" id="fpe"></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        const vis = [...el.querySelectorAll('[data-vis]')].filter(c => c.checked).map(c => c.dataset.vis), vals = {};
        for (const i of el.querySelectorAll('[data-val]')) {
          const n = MTPS.parseNumber(i.value.trim()); if (!n) { el.querySelector('#fpe').textContent = `${i.dataset.val}: not a number.`; return false; }
          vals[i.dataset.val] = i.dataset.ty === 'BOOL' ? (n.v ? 1 : 0) : n.v;
        }
        const dflt = [...b.ins, ...b.outs].filter(p => !p.hide).map(p => p.n);
        ed(() => {
          const x = elOf(id); if (vis.length === dflt.length && vis.every(n => dflt.includes(n))) delete x.vis; else x.vis = vis;
          const t = [...A.curProg().tags, ...A.S.p.tags].find(q => U(q.name) === U(x.tag));
          if (t && !A.S.online) t.value = Object.assign({}, t.value || {}, vals);
        });
        // online, a value goes to the controller's tag at once (as a value typed in the dialog of a running block)
        if (A.S.online) for (const n in vals) A.ctl().write(`${e.tag}.${n}`, vals[n], A.S.prog);
        draw();
      } }] });
  }
  /* Add Element: the elements and every function block by group (the Language Element toolbar categories, PM009) */
  function picker() {
    if (!A.editable()) return;
    const groups = GROUPS.map(g => `<div class="fpg"><div class="fpgh">${esc(g)}</div>${Object.values(BLK).filter(b => b.grp === g).map(b => `<div class="row" data-fpk="${b.t}"><b class="mono">${b.t}</b><span class="grow muted">${esc(b.name)}</span></div>`).join('')}</div>`).join('');
    A.dialog({ title: 'Add FBD Element', size: 'md', body: `<div class="fpk"><div class="fpg"><div class="fpgh">Elements</div>${ELEMS.map(([m, n]) => `<div class="row" data-fpk="${m}"><b class="mono">${m}</b><span class="grow muted">${n}</span></div>`).join('')}</div>${groups}</div>`,
      buttons: [{ l: 'Close' }], mount: el => el.addEventListener('click', ev => { const r = ev.target.closest('[data-fpk]'); if (!r) return; A.closeLayer(); add(r.dataset.fpk); }) });
  }
  function sheetCmd(a) {
    const r = rt(), k = rkey(), si = sheetIx();
    if (a === 'prev' || a === 'next') { UI.sheet[k] = Math.max(0, Math.min(r.sheets.length - 1, si + (a === 'next' ? 1 : -1))); UI.sel = null; UI.arm = null; A.render(); return; }
    if (!A.editable()) return;
    if (a === 'add') { ed(x => { x.sheets.splice(si + 1, 0, { desc: '', els: [], wires: [] }); }); UI.sheet[k] = si + 1; UI.sel = null; A.render(); return; }
    if (a === 'delsheet') {
      if (r.sheets.length < 2) return;
      A.confirm('Delete Sheet', `Delete sheet ${si + 1} and its ${r.sheets[si].els.length} element(s)?`, 'Delete', () => { ed(x => { x.sheets.splice(si, 1); }); UI.sheet[k] = Math.max(0, si - 1); UI.sel = null; A.render(); }, true);
      return;
    }
    if (a === 'desc') A.prompt1('Sheet Description', 'Description', r.sheets[si].desc || '', v => { if (v.length > 50) return 'At most 50 characters.'; ed(x => { x.sheets[si].desc = v; }); A.render(); }, 'Follow the IEC-1131 naming standard; at most 50 characters (PM009 Add a sheet).');
  }
  function menu(t, x, y) {
    const it = [];
    if (t.w != null) {
      const wr = sheet().wires[t.w];
      it.push({ l: 'Assume Data Available', ck: !!(wr && wr.ada), run: toggleAda, dis: !A.editable() }, '-', { l: 'Delete Wire', i: 'trash', run: delSel, dis: !A.editable() });
    } else if (t.id != null) {
      const e = elOf(t.id); if (!e) return;
      if (e.k === 'BLK') it.push({ l: 'Properties…', i: 'gear', run: () => props(e.id) }, { l: `Assign Tag (${e.tag || '?'})…`, i: 'tag', run: () => assignTag(e.id), dis: !A.editable() });
      else it.push({ l: e.k === 'IREF' || e.k === 'OREF' ? 'Edit Operand…' : 'Rename Element…', i: 'edit', run: () => editOperand(e.id), dis: !A.editable() });
      it.push('-', { l: 'Delete Element', i: 'trash', run: delSel, dis: !A.editable() });
    } else it.push({ l: 'Add Element…', i: 'plus', run: picker, dis: !A.editable() }, { l: 'New Sheet', run: () => sheetCmd('add'), dis: !A.editable() });
    A.openMenu(it, { x, y });
  }

  /* ---------- pointer: tap selects, drag moves, pin → pin wires (drag with the mouse, or tap then tap), hold or
     right-click opens the menu, a drag on the background scrolls ---------- */
  const hitOf = el => {
    if (!el || !el.closest) return {};
    const p = el.closest('[data-pin]'); if (p) { const [id, key] = p.dataset.pin.split('|'); return { pin: { id: +id, key, out: key[0] === 'o' } }; }
    const pr = el.closest('[data-fprops]'); if (pr) return { props: +pr.dataset.fprops };
    const w = el.closest('[data-fw]'); if (w) return { w: +w.dataset.fw };
    const e = el.closest('[data-fe]'); if (e) return { id: +e.dataset.fe };
    return {};
  };
  const svgPt = (ev) => { const s = document.querySelector('#fbdwrap svg'); if (!s) return { x: 0, y: 0 }; const r = s.getBoundingClientRect(), z = A.S.prefs.zoom || 1; return { x: (ev.clientX - r.left) / z, y: (ev.clientY - r.top) / z }; };
  function pinPick(p) {
    // the second pin of a wire: an output and an input, on the same sheet
    const a = UI.arm; UI.arm = null;
    if (!a || a.out === p.out) { if (a && a.id === p.id && a.key === p.key) { draw(); return; } UI.arm = { ...p }; draw(); return; }
    connect(a.out ? a : p, a.out ? p : a); draw();
  }
  let pd = null, lastTap = { t: 0, id: null };
  function bind() {
    document.addEventListener('pointerdown', ev => {
      const w = ev.target.closest && ev.target.closest('#fbdwrap'); if (!w || !on()) return;
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      try { w.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      const h = hitOf(ev.target), pt = svgPt(ev);
      pd = { h, x: ev.clientX, y: ev.clientY, pt, mouse: ev.pointerType === 'mouse', sl: w.scrollLeft, st: w.scrollTop, moved: false, long: false };
      if (h.id != null && A.editable()) { const e = elOf(h.id); if (e) UI.drag = { id: e.id, ox: pt.x - e.x, oy: pt.y - e.y, nx: e.x, ny: e.y, moved: false }; }
      if (!pd.mouse) pd.timer = setTimeout(() => { if (pd && !pd.moved) { pd.long = true; select(pd.h); menu(pd.h, pd.x, pd.y); } }, 550);
    });
    document.addEventListener('pointermove', ev => {
      if (!pd) return;
      const dx = ev.clientX - pd.x, dy = ev.clientY - pd.y, far = Math.hypot(dx, dy) > (pd.mouse ? 4 : 10);
      if (!pd.moved && !far) return;
      if (!pd.moved) { pd.moved = true; clearTimeout(pd.timer); if (pd.h.pin && pd.mouse) UI.arm = { ...pd.h.pin }; }
      const w = document.getElementById('fbdwrap'); if (!w) return;
      if (UI.arm && pd.h.pin) { UI.arm.at = svgPt(ev); draw(); return; }
      if (UI.drag && pd.h.id != null) { const p = svgPt(ev); UI.drag.moved = true; UI.drag.nx = Math.max(0, Math.round((p.x - UI.drag.ox) / 10) * 10); UI.drag.ny = Math.max(10, Math.round((p.y - UI.drag.oy) / 10) * 10); draw(); return; }
      w.scrollLeft = pd.sl - dx; w.scrollTop = pd.st - dy; UI.scroll[rkey()] = [w.scrollLeft, w.scrollTop];
    });
    const up = ev => {
      if (!pd) return;
      const p = pd; pd = null; clearTimeout(p.timer);
      const dg = UI.drag; UI.drag = null;
      if (p.long || ev.type === 'pointercancel') { if (UI.arm && UI.arm.at) { UI.arm = null; draw(); } return; }
      if (p.moved) {
        if (dg && dg.moved) { ed(() => { const e = elOf(dg.id); e.x = dg.nx; e.y = dg.ny; }); UI.sel = { id: dg.id }; draw(); return; }
        if (UI.arm && UI.arm.at) {
          // a wire dragged from a pin: let go on another pin
          const t = hitOf(document.elementFromPoint(ev.clientX, ev.clientY));
          const a = UI.arm; delete a.at;
          if (t.pin && A.editable()) { UI.arm = a; pinPick(t.pin); } else { UI.arm = null; draw(); }
        }
        return;
      }
      tap(p.h, ev.clientX, ev.clientY, !p.mouse);
    };
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    document.addEventListener('dblclick', ev => {
      if (!on() || !ev.target.closest || !ev.target.closest('#fbdwrap')) return;
      const h = hitOf(ev.target); if (h.id != null) editOperand(h.id);
    });
    document.addEventListener('contextmenu', ev => {
      if (!on() || !ev.target.closest || !ev.target.closest('#fbdwrap')) return;
      ev.preventDefault();
      if (pd && !pd.mouse) return;
      const h = hitOf(ev.target); select(h); menu(h, ev.clientX, ev.clientY);
    });
    document.addEventListener('scroll', ev => { if (ev.target && ev.target.id === 'fbdwrap' && on()) UI.scroll[rkey()] = [ev.target.scrollLeft, ev.target.scrollTop]; }, { capture: true, passive: true });
    document.addEventListener('click', ev => {
      if (!on()) return;
      const b = ev.target.closest && ev.target.closest('[data-fbd],[data-fbdadd],[data-fbdpick]');
      if (!b || b.disabled) return;
      if (b.dataset.fbdadd) add(b.dataset.fbdadd);
      else if (b.dataset.fbdpick) picker();
      else { const a = b.dataset.fbd; if (a === 'del') delSel(); else if (a === 'ada') toggleAda(); else if (a === 'props') { if (UI.sel && UI.sel.id != null) { const e = elOf(UI.sel.id); if (e && e.k === 'BLK') props(e.id); else editOperand(UI.sel.id); } } else if (a === 'sheets') sheetsMenu(b); else sheetCmd(a); }
    });
  }
  function sheetsMenu(at) {
    const r = rt();
    const ed0 = !A.editable();
    A.openMenu(r.sheets.map((s, k) => ({ l: `Sheet ${k + 1}${s.desc ? ' · ' + s.desc : ''}`, ck: k === sheetIx(), run: () => { UI.sheet[rkey()] = k; UI.sel = null; A.render(); } }))
      .concat(['-', { l: 'New Sheet', i: 'plus', run: () => sheetCmd('add'), dis: ed0 }, { l: 'Sheet Description…', i: 'edit', run: () => sheetCmd('desc'), dis: ed0 }, { l: 'Delete Sheet', i: 'trash', run: () => sheetCmd('delsheet'), dis: ed0 || r.sheets.length < 2 }]), at);
  }
  const select = h => { UI.sel = h.w != null ? { w: h.w } : h.id != null ? { id: h.id } : null; draw(); };
  function tap(h, x, y, touch) {
    if (h.props != null) { UI.sel = { id: h.props }; props(h.props); return; }
    if (h.pin) { if (A.editable()) pinPick(h.pin); return; }
    if (UI.arm) { UI.arm = null; }
    // tap again on the selected element (or a double tap on touch) edits its operand
    const again = h.id != null && UI.sel && UI.sel.id === h.id && (touch || performance.now() - lastTap.t < 400);
    lastTap = { t: performance.now(), id: h.id };
    if (again && touch) { editOperand(h.id); return; }
    select(h);
    refreshBar();
  }
  function refreshBar() {
    const bar = document.querySelector('.fbdbar'); if (!bar) return;
    const set = (a, dis) => { const b = bar.querySelector(`[data-fbd="${a}"]`); if (b) b.disabled = dis; };
    set('ada', !(UI.sel && UI.sel.w != null) || !A.editable()); set('props', !(UI.sel && UI.sel.id != null)); set('del', !UI.sel || !A.editable());
  }
  /* the keys of the editor: Delete, Escape, Insert (Add Element), Alt+Enter on a block (Properties) */
  function key(ev) {
    if (!on()) return false;
    const k = ev.key, ctrl = ev.ctrlKey || ev.metaKey;
    if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); delSel(); return true; }
    if (k === 'Escape') { UI.sel = null; UI.arm = null; draw(); refreshBar(); return true; }
    if (k === 'Insert') { ev.preventDefault(); picker(); return true; }
    if (k === 'Enter' && !ctrl && UI.sel && UI.sel.id != null) { ev.preventDefault(); editOperand(UI.sel.id); return true; }
    if (ctrl && /^[rdt]$/i.test(k)) { ev.preventDefault(); return true; }
    if (/^(Arrow|Home|End|F2)/.test(k)) { ev.preventDefault(); return true; }
    return false;
  }
  /* the app's commands while an FBD routine is open: those of the ladder that make no sense here are answered here */
  function cmd(id) {
    if (!on()) return false;
    if (id === 'ins') { picker(); return true; }
    if (id === 'zin' || id === 'zout') { setTimeout(draw, 40); return false; }
    if (id === 'del') { delSel(); return true; }
    if (id === 'edit') { if (UI.sel && UI.sel.id != null) editOperand(UI.sel.id); return true; }
    if (['rung', 'rtext', 'comment', 'cut', 'copy', 'paste', 'toggle', 'bmtog', 'bmprev', 'bmnext', 'bmall', 'rstart', 'raccept', 'rcancel', 'selall', 'insmode', 'desc'].includes(id)) { A.toast('Not in a Function Block Diagram routine: use the sheet toolbar (Add Element, Delete, Properties).'); return true; }
    return false;
  }
  /* after each render of the app: the drawing, and the bar's state */
  function mount() { if (!on()) return; draw(); refreshBar(); }
  /* online: redraw when a value shown changed, at most 10 times a second */
  function live(force) {
    if (!on() || !A.S.online || pd) return;
    const now = performance.now();
    if (!force && now - UI.liveAt < 100) return;
    const lv = liveOf(A.ctl(), A.S.prog, A.S.routine), s = lv ? JSON.stringify(lv) : '';
    if (!force && s === UI.live) return;
    UI.live = s; UI.liveAt = now; draw();
  }
  function init(api) {
    A = api;
    if (api.IC && !api.IC.fbd) api.IC.fbd = 'M3 5h7v6H3zM14 13h7v6h-7zM10 8h2v8h2';
    bind();
  }
  Object.assign(FBD, { init, on, html, glyphs, selbar, mount, live, key, cmd, blank, add, draw, state: UI, picker, props });
})(typeof window !== 'undefined' ? window : globalThis);
