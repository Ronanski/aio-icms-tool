/* MT PLC Studio Function Block Diagram routines (Logix 5000 FBD, 1756-PM009J; instructions 1756-RM018A).
   A routine of Type 'FBD' holds sheets: { desc, els, wires }. Sheets only organise the drawing: every sheet runs.
   Elements: IREF (input reference: a tag or a constant), OREF (output reference: a tag), ICON / OCON (wire
   connectors, by name, across sheets) and BLK (a function block with its backing tag, e.g. TONR_01 : FBD_TIMER).
   A wire goes from an output pin to an input pin: { a, ap, b, bp, ada } (ada: Assume Data Available).
   Execution each scan (PM009 Summary): 1. the IREF values are latched, 2. the blocks run in the order of the data
   flow (an input needs its data first; a feedback wire marked Assume Data Available uses last scan's value),
   3. the OREFs are written. A wired input pin is copied into the block's tag before the block runs; an input pin
   without a wire uses the value in the tag (Properties > Parameters > Value).
   This file has the engine part (types, compile, execute). */
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
    const m = mem(TYPES[n]);
    // EnableIn: "Default is set"; the In1..In8 of BAND: "Set to 1 on first download" (RM018A)
    m.forEach(x => { if (x.name === 'EnableIn' || (n === 'FBD_BOOLEAN_AND' && /^In\d$/.test(x.name))) x.init = 1; });
    // Status.0 InstructFault, Status.1 PresetInv (FBD_TIMER)
    if (n === 'FBD_TIMER') m.push({ name: 'InstructFault', type: 'BOOL', of: 'Status', bit: 0 }, { name: 'PresetInv', type: 'BOOL', of: 'Status', bit: 1 });
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

  /* the FBD timers (RM018A chapter 3): time base 1 ms, ACC = ACC + the time since the last scan. A PRE below 0 sets
     Status.InstructFault and .PresetInv and the timer does not run. Reset: TONR / RTOR clear EN TT DN and set ACC 0,
     TOFR clears EN TT DN and sets ACC = PRE. */
  const preBad = s => { if (s.PRE < 0) { s.Status = 3; return true; } s.Status = 0; return false; };
  function timer(t, s, st, c) {
    const dt = c.dt;
    if (st.first) { st.first = false; s.EN = s.TT = s.DN = 0; if (t === 'TONR') s.ACC = 0; }
    if (s.Reset) { s.EN = s.TT = s.DN = 0; s.ACC = t === 'TOFR' ? s.PRE : 0; st.run = false; return; }
    if (preBad(s)) return;
    const on = !!s.TimerEnable;
    if (t === 'TOFR') {
      // timing starts when TimerEnable goes false, while DN is still set
      if (on) { s.EN = 1; s.DN = 1; s.TT = 0; s.ACC = 0; st.run = false; return; }
      s.EN = 0;
      if (s.DN) { if (st.run) s.ACC = Math.min(s.PRE, s.ACC + dt); st.run = true; if (s.ACC >= s.PRE) { s.DN = 0; st.run = false; } }
      s.TT = s.DN;
      return;
    }
    if (!on) {
      s.EN = 0; s.TT = 0; st.run = false;
      if (t === 'TONR') { s.DN = 0; s.ACC = 0; } else s.DN = s.ACC >= s.PRE ? 1 : 0;
      return;
    }
    s.EN = 1;
    if (st.run && s.ACC < s.PRE) s.ACC = Math.min(s.PRE, s.ACC + dt);
    st.run = true;
    s.DN = s.ACC >= s.PRE ? 1 : 0;
    s.TT = s.DN ? 0 : 1;
  }
  for (const [t, n] of [['TONR', 'Timer On Delay with Reset'], ['TOFR', 'Timer Off Delay with Reset'], ['RTOR', 'Retentive Timer On with Reset']])
    def(t, 'FBD_TIMER', 'Timer/Counter', n, 'TimerEnable PRE Reset', 'ACC EN TT DN -InstructFault -PresetInv', (s, st, c) => timer(t, s, st, c));
  /* CTUD (RM018A): counts up on a false-to-true CUEnable, then down on a false-to-true CDEnable (both in one scan:
     up first). Past 2,147,483,647 it rolls to -2,147,483,648 with OV; below, the other way with UN. Reset clears
     CUEnable(n-1), CDEnable(n-1), CU, CD, DN, OV, UN and sets ACC 0. First scan: needs a 0 → 1 transition. */
  def('CTUD', 'FBD_COUNTER', 'Timer/Counter', 'Count Up/Down', 'CUEnable CDEnable PRE Reset', 'ACC CU CD DN -OV -UN', (s, st) => {
    const u = s.CUEnable ? 1 : 0, d = s.CDEnable ? 1 : 0;
    if (st.first) { st.first = false; st.cu = u; st.cd = d; }
    if (s.Reset) { st.cu = st.cd = 0; s.CU = s.CD = s.DN = s.OV = s.UN = 0; s.ACC = 0; return; }
    if (u && !st.cu) { if (s.ACC >= 2147483647) { s.ACC = -2147483648; if (s.UN) s.UN = 0; else s.OV = 1; } else s.ACC++; }
    if (d && !st.cd) { if (s.ACC <= -2147483648) { s.ACC = 2147483647; if (s.OV) s.OV = 0; else s.UN = 1; } else s.ACC--; }
    st.cu = u; st.cd = d; s.CU = u; s.CD = d;
    s.DN = s.ACC >= s.PRE ? 1 : 0;
  });
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
  if (typeof module !== 'undefined' && module.exports) module.exports = FBD;
})(typeof window !== 'undefined' ? window : globalThis);
