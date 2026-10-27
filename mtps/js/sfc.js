/* MT PLC Studio: Sequential Function Chart routines (1756-PM006L, Sep 2024; v37 help: SFC Instructions, Step,
   Transition, Action and Boolean Action, Controller Properties - SFC Execution tab, Edit Step / Action properties).
   The first part has no DOM (the engine tests load it): the SFC_STEP / SFC_ACTION / SFC_STOP types, the chart model,
   verify and execution. The second part, in a browser only, is the SFC editor of the routine window. */
(function (root) {
  'use strict';
  const MTPS = root.MTPS || (root.MTPS = {});
  const U = s => String(s).toUpperCase();

  /* ---------- data types ---------- */
  /* the backing tags (1756-PM006, SFC_STEP / SFC_ACTION / SFC_STOP structure): the BOOLs are bits of Status (step:
     Reset 22, AlarmHigh 23, AlarmLow 24, AlarmEn 25, OV 26, DN 27, LS 28, SA 29, FS 30, X 31; action: Q 30, A 31;
     stop: Reset 22, X 31); the times are DINT milliseconds */
  const SB = { Reset: 22, AlarmHigh: 23, AlarmLow: 24, AlarmEn: 25, OV: 26, DN: 27, LS: 28, SA: 29, FS: 30, X: 31 };
  const AB = { Q: 30, A: 31 }, PB = { Reset: 22, X: 31 };
  const bits = o => Object.keys(o).sort((a, b) => o[b] - o[a]).map(name => ({ name, type: 'BOOL', of: 'Status', bit: o[name] }));
  const dints = s => s.split(' ').map(name => ({ name, type: 'DINT' }));
  if (MTPS.PREDEF) Object.assign(MTPS.PREDEF, {
    SFC_ACTION: [{ name: 'Status', type: 'DINT' }, ...bits(AB), ...dints('PRE T Count')],
    SFC_STEP: [{ name: 'Status', type: 'DINT' }, ...bits(SB), ...dints('PRE T TMax Count LimitHigh LimitLow')],
    SFC_STOP: [{ name: 'Status', type: 'DINT' }, ...bits(PB), ...dints('Count')],
  });
  const getb = (o, b) => (o.Status >>> b) & 1;
  const setb = (o, b, v) => { o.Status = v ? o.Status | (1 << b) : o.Status & ~(1 << b); };

  /* Controller Properties > SFC Execution (help v37). Execution Control: Execute current active steps only (default:
     "an SFC executes a step or group of simultaneous steps and then returns", PM006) or Execute until FALSE transition.
     Restart Position: Restart at most recently executed step / Restart at initial step. Last Scan of Active Steps:
     Automatic reset / Programmatic reset / Don't scan (the default, PM006). Saved in project.controller.sfc. */
  const CFG0 = { exec: 'current', restart: 'recent', last: 'dontscan' };
  const CFGV = { exec: ['current', 'untilFalse'], restart: ['recent', 'initial'], last: ['auto', 'programmatic', 'dontscan'] };
  const cfgOf = o => { const c = {}; for (const k in CFG0) c[k] = o && CFGV[k].includes(o[k]) ? o[k] : CFG0[k]; return c; };

  /* the qualifiers of an action (help v37, Edit Action properties; PM006 Choose a qualifier for an action) */
  const QUAL = { N: 'Non-Stored', R: 'Reset', S: 'Stored', L: 'Time Limited', D: 'Time Delayed', P: 'Pulse', P1: 'Pulse (Rising Edge)', P0: 'Pulse (Falling Edge)',
    SL: 'Stored and Time Limited', SD: 'Stored and Time Delayed', DS: 'Time Delayed and Stored' };
  const TIMED = ['L', 'SL', 'D', 'DS', 'SD'], STORED = ['S', 'SL', 'DS', 'SD'], PULSE = ['P', 'P1', 'P0'];

  /* ---------- the chart model ---------- */
  /* routine.sfc = { els: [...], ln: [[from, to], ...] }: a step { id, k: 'step', n, x, y, init, pre, lh, ll, al, acts },
     an action { n, q, pre, bool, b } (b: its structured text), a transition { id, k: 'tran', n, x, y, c } (c: its BOOL
     expression), a stop { id, k: 'stop', n, x, y }, a text box { id, k: 'text', x, y, t }. A link goes from a step to a
     transition or from a transition to a step or a stop: a step with two or more transitions after it is a selection
     branch (checked left to right, or in the order of pri[step id]), a transition with two or more steps after it a
     simultaneous branch, and a transition after two or more steps closes a simultaneous branch. x, y are the centre
     of the element in chart units (px at 100 %). */
  const outs = (ch, id) => ch.ln.filter(l => l[0] === id).map(l => l[1]);
  const ins = (ch, id) => ch.ln.filter(l => l[1] === id).map(l => l[0]);
  // a new SFC routine holds an initial step and a transition (PM006, Step guidelines)
  function blank() {
    return { els: [{ id: 1, k: 'step', n: 'Step_000', x: 160, y: 60, init: true, acts: [] }, { id: 2, k: 'tran', n: 'Tran_000', x: 160, y: 140, c: '' }], ln: [[1, 2]] };
  }
  // the tags of the chart's elements, which the editor creates in the program: [name, data type]
  function tagsOf(ch) {
    const out = [];
    for (const e of (ch && ch.els) || []) {
      if (e.k === 'step') { out.push([e.n, 'SFC_STEP']); for (const a of e.acts || []) if (a.q !== 'R') out.push([a.n, 'SFC_ACTION']); }
      else if (e.k === 'tran') out.push([e.n, 'BOOL']);
      else if (e.k === 'stop') out.push([e.n, 'SFC_STOP']);
    }
    return out;
  }

  /* ---------- structured text of transitions and actions ---------- */
  /* the part of structured text an SFC uses here: a BOOL expression in a transition; in an action, assignments
     (:= retentive, [:=] non-retentive: cleared on a postscan), IF ... THEN ... ELSIF ... ELSE ... END_IF and JSR(Routine).
     Operators by precedence (1756-PM007 order): ( ) and functions, -, NOT, **, * / MOD, + -, < <= > >=, = <>, AND &,
     XOR, OR. AND / OR / XOR / NOT on BOOLs are logical, on integers bitwise. */
  const FN = { ABS: Math.abs, SQRT: v => Math.sqrt(v), SQR: v => Math.sqrt(v), TRUNC: Math.trunc, SIN: Math.sin, COS: Math.cos, TAN: Math.tan, LN: Math.log, LOG: Math.log10 };
  const KW = ['MOD', 'AND', 'OR', 'XOR', 'NOT', 'IF', 'THEN', 'ELSIF', 'ELSE', 'END_IF', 'TRUE', 'FALSE'];
  function lex(src) {
    const s = String(src == null ? '' : src).replace(/\(\*[\s\S]*?\*\)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ' '), toks = [];
    for (let i = 0; i < s.length;) {
      const r = s.slice(i);
      let m;
      if (/^\s/.test(r)) { i++; continue; }
      if ((m = /^(?:(?:2|8|16)#[0-9A-Fa-f_]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(r))) toks.push({ k: 'num', s: m[0] });
      else if ((m = /^[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z0-9_]+)*(?:\.[A-Za-z0-9_]+|\[[^\]]*\])*/.exec(r))) { const u = U(m[0]); toks.push(KW.includes(u) ? { k: 'op', s: u } : { k: 'id', s: m[0] }); }
      else if ((m = /^(\[:=\]|:=|\*\*|<>|<=|>=|[-+*/()=<>,;&])/.exec(r))) toks.push({ k: 'op', s: m[1] === '&' ? 'AND' : m[1] });
      else throw `Unexpected '${r[0]}'`;
      i += m[0].length;
    }
    return toks;
  }
  const isB = n => n.type === 'BOOL', isR = n => n.type === 'REAL';
  /* text → { stmts } or { expr }: compiled against the program P of the model M; throws the error text */
  function compileST(M, P, src, mode) {
    const X = MTPS.core, toks = lex(src);
    let p = 0;
    const peek = (...o) => toks[p] && toks[p].k === 'op' && o.includes(toks[p].s);
    const want = o => { if (!peek(o)) throw toks[p] ? `'${o}' expected before '${toks[p].s}'` : `'${o}' expected at the end`; p++; };
    const node = (get, type) => ({ get, type });
    const tag = t => { const r = X.ref(M, P, t); if (typeof r === 'string') throw r; return r; };
    function prim() {
      const t = toks[p++];
      if (!t) throw 'The expression ends too early';
      if (t.k === 'num') { const c = X.parseNumber(t.s); if (!c) throw `Invalid number '${t.s}'`; return node(() => c.v, c.real ? 'REAL' : 'DINT'); }
      if (t.k === 'op' && (t.s === 'TRUE' || t.s === 'FALSE')) { const v = t.s === 'TRUE' ? 1 : 0; return node(() => v, 'BOOL'); }
      if (t.k === 'op' && t.s === '(') { const n = expr(0); want(')'); return n; }
      if (t.k === 'id') {
        const f = FN[U(t.s)];
        if (f && peek('(')) { p++; const a = expr(0), g = a.get; want(')'); return node(() => f(g()), U(t.s) === 'ABS' && !isR(a) ? 'DINT' : U(t.s) === 'TRUNC' ? 'DINT' : 'REAL'); }
        const r = tag(t.s);
        if (r.dim || !(r.type === 'BOOL' || /^(SINT|INT|DINT|LINT|REAL|LREAL)$/.test(r.type))) throw `'${t.s}' is not a BOOL or a number`;
        return node(() => r.get(), r.type === 'BOOL' ? 'BOOL' : /REAL/.test(r.type) ? 'REAL' : 'DINT');
      }
      throw `Unexpected '${t.s}'`;
    }
    function un() {
      if (peek('-')) { p++; const a = un(), g = a.get; return node(() => -g(), isR(a) ? 'REAL' : 'DINT'); }
      if (peek('NOT')) { p++; const a = un(), g = a.get; return isB(a) ? node(() => (g() ? 0 : 1), 'BOOL') : node(() => ~Math.trunc(g()), 'DINT'); }
      const a = prim();
      if (peek('**')) { p++; const b = un(), A = a.get, B = b.get; return node(() => Math.pow(A(), B()), 'REAL'); }
      return a;
    }
    const LV = [['OR'], ['XOR'], ['AND'], ['=', '<>'], ['<', '<=', '>', '>='], ['+', '-'], ['*', '/', 'MOD']];
    function bin(o, a, b) {
      const A = a.get, B = b.get, real = isR(a) || isR(b), lg = isB(a) && isB(b), t = real ? 'REAL' : 'DINT';
      switch (o) {
        case 'OR': return lg ? node(() => (A() || B() ? 1 : 0), 'BOOL') : node(() => Math.trunc(A()) | Math.trunc(B()), 'DINT');
        case 'XOR': return lg ? node(() => ((A() ? 1 : 0) ^ (B() ? 1 : 0)), 'BOOL') : node(() => Math.trunc(A()) ^ Math.trunc(B()), 'DINT');
        case 'AND': return lg ? node(() => (A() && B() ? 1 : 0), 'BOOL') : node(() => Math.trunc(A()) & Math.trunc(B()), 'DINT');
        case '=': return node(() => (A() === B() ? 1 : 0), 'BOOL');
        case '<>': return node(() => (A() !== B() ? 1 : 0), 'BOOL');
        case '<': return node(() => (A() < B() ? 1 : 0), 'BOOL');
        case '<=': return node(() => (A() <= B() ? 1 : 0), 'BOOL');
        case '>': return node(() => (A() > B() ? 1 : 0), 'BOOL');
        case '>=': return node(() => (A() >= B() ? 1 : 0), 'BOOL');
        case '+': return node(() => A() + B(), t);
        case '-': return node(() => A() - B(), t);
        case '*': return node(() => A() * B(), t);
        case '/': return node(() => { const y = B(); return y === 0 ? 0 : real ? A() / y : Math.trunc(A() / y); }, t);
        default: return node(() => { const y = B(); return y === 0 ? 0 : A() % y; }, t);
      }
    }
    function expr(lv) {
      if (lv === LV.length) return un();
      let a = expr(lv + 1);
      while (toks[p] && toks[p].k === 'op' && LV[lv].includes(toks[p].s)) { const o = toks[p++].s; a = bin(o, a, expr(lv + 1)); }
      return a;
    }
    if (mode === 'expr') {
      if (!toks.length) throw 'The transition has no condition';
      const n = expr(0);
      if (p < toks.length) throw `Unexpected '${toks[p].s}'`;
      return { expr: n };
    }
    const jsrs = [];
    function block(stop) {
      const out = [];
      while (p < toks.length && !peek(...stop)) {
        const t = toks[p];
        if (t.k === 'op' && t.s === ';') { p++; continue; }
        if (t.k === 'op' && t.s === 'IF') {
          p++;
          const arms = [];
          let c = expr(0); want('THEN');
          arms.push([c, block(['ELSIF', 'ELSE', 'END_IF'])]);
          while (peek('ELSIF')) { p++; c = expr(0); want('THEN'); arms.push([c, block(['ELSIF', 'ELSE', 'END_IF'])]); }
          let els = [];
          if (peek('ELSE')) { p++; els = block(['END_IF']); }
          want('END_IF'); if (peek(';')) p++;
          out.push({ k: 'if', arms, els });
          continue;
        }
        if (t.k === 'id' && U(t.s) === 'JSR' && toks[p + 1] && toks[p + 1].s === '(') {
          p += 2;
          const n = toks[p++];
          if (!n || n.k !== 'id') throw 'JSR needs a routine name';
          const R = P.routines.get(U(n.s));
          if (!R) throw `Undefined routine '${n.s}'`;
          while (peek(',')) { p++; expr(0); }
          want(')'); want(';');
          out.push({ k: 'jsr', R }); jsrs.push(R);
          continue;
        }
        if (t.k !== 'id') throw `Unexpected '${t.s}'`;
        p++;
        const d = tag(t.s);
        if (d.dim || !(d.type === 'BOOL' || /^(SINT|INT|DINT|LINT|REAL|LREAL)$/.test(d.type))) throw `'${t.s}' cannot be assigned here`;
        if (d.konst) throw `'${t.s}' is a constant tag`;
        if (!peek(':=', '[:=]')) throw `':=' expected after '${t.s}'`;
        const nr = toks[p++].s === '[:=]', v = expr(0);
        want(';');
        out.push({ k: 'set', d, v: v.get, nr, real: isR(v) });
      }
      return out;
    }
    const stmts = block([]);
    if (p < toks.length) throw `Unexpected '${toks[p].s}'`;
    return { stmts, jsrs };
  }
  /* run statements: post (a postscan) runs them as if every condition were false: a non-retentive assignment clears
     its tag, a called routine is postscanned (its rungs false), a nested SFC is reset (PM006, Use the automatic reset option) */
  function exec(c, list, post) {
    for (const s of list) {
      if (s.k === 'set') { if (!post) s.d.set(s.d.type === 'BOOL' ? (s.v() ? 1 : 0) : s.v()); else if (s.nr) s.d.set(0); }
      else if (s.k === 'if') {
        if (post) { s.arms.forEach(a => exec(c, a[1], true)); exec(c, s.els, true); continue; }
        const arm = s.arms.find(a => a[0].get());
        exec(c, arm ? arm[1] : s.els, false);
      } else if (s.k === 'jsr') {
        if (c.d >= 32) throw new MTPS.core.Fault(4, 31, 'JSR nesting too deep');
        c.d++; const p0 = c.post; if (post) c.post = (c.post || 0) + 1;
        try { c.routine(s.R); } finally { c.post = p0; c.d--; c.ret = false; }
      }
    }
  }

  /* ---------- verify (compile) ---------- */
  /* R.sfc (the routine's chart) → R.chart, the compiled chart: err(element, text) / warn(element, text) */
  function compile(M, P, R, err, warn) {
    const ch = R.sfc, X = MTPS.core;
    const els = Array.isArray(ch.els) ? ch.els : [], ln = Array.isArray(ch.ln) ? ch.ln.filter(l => Array.isArray(l)) : [];
    const C = { name: R.name, steps: [], trans: [], stops: [], byId: new Map(), acts: new Map(), init: null, sig: '' };
    R.chart = C;
    const names = new Map();
    const bk = (el, type) => {
      if (!X.validName(el.n)) { err(el.n || null, `Invalid name '${el.n || ''}'`); return null; }
      if (names.has(U(el.n))) { err(el.n, `The name '${el.n}' is used by more than one element of the chart`); return null; }
      names.set(U(el.n), el);
      const r = X.ref(M, P, el.n);
      if (typeof r === 'string') { err(el.n, `Undefined tag '${el.n}': the ${type === 'BOOL' ? 'transition' : type === 'SFC_STEP' ? 'step' : type === 'SFC_STOP' ? 'stop' : 'action'} needs a tag of type ${type}`); return null; }
      if (U(r.type) !== type || r.dim) { err(el.n, `Tag '${el.n}' must be of type ${type}`); return null; }
      return r;
    };
    for (const e of els) {
      if (!e || e.id == null || C.byId.has(e.id)) continue;
      if (e.k === 'step') {
        const r = bk(e, 'SFC_STEP'), s = { id: e.id, k: 'step', n: e.n, x: +e.x || 0, r, acts: [], outs: [], ins: [], src: e };
        if (e.init) { if (C.init) err(e.n, 'Only one initial step is allowed in a chart'); else C.init = s; }
        if (r) { const o = r.obj(); o.PRE = Math.max(0, Math.trunc(+e.pre || 0)); o.LimitHigh = Math.max(0, Math.trunc(+e.lh || 0)); o.LimitLow = Math.max(0, Math.trunc(+e.ll || 0)); setb(o, SB.AlarmEn, e.al); }
        C.steps.push(s); C.byId.set(e.id, s);
      } else if (e.k === 'tran') {
        const r = bk(e, 'BOOL'), t = { id: e.id, k: 'tran', n: e.n, x: +e.x || 0, r, outs: [], ins: [], cond: null, src: e };
        if (r) { try { const x = compileST(M, P, e.c, 'expr').expr; if (x.type !== 'BOOL') err(e.n, 'The condition must be a BOOL expression'); else t.cond = x.get; } catch (m) { if (typeof m !== 'string') throw m; err(e.n, m); } }
        C.trans.push(t); C.byId.set(e.id, t);
      } else if (e.k === 'stop') {
        const r = bk(e, 'SFC_STOP'), s = { id: e.id, k: 'stop', n: e.n, x: +e.x || 0, r, ins: [], outs: [] };
        C.stops.push(s); C.byId.set(e.id, s);
      }
    }
    if (!C.init && C.steps.length) err(C.steps[0].n, 'The chart has no initial step');
    if (!C.steps.length) err(null, 'The chart has no steps');
    for (const [a, b] of ln) {
      const A = C.byId.get(a), B = C.byId.get(b);
      if (!A || !B) continue;
      if (!((A.k === 'step' && B.k === 'tran') || (A.k === 'tran' && (B.k === 'step' || B.k === 'stop')))) { err(A.n, `A wire cannot go from '${A.n}' to '${B.n}'`); continue; }
      if (A.outs.includes(B)) continue;
      A.outs.push(B); B.ins.push(A);
    }
    // a selection branch is checked left to right, or in the order set with Set Sequence Priorities
    for (const s of C.steps) {
      const pr = ch.pri && Array.isArray(ch.pri[s.id]) ? ch.pri[s.id] : null;
      s.outs.sort((a, b) => (pr && pr.includes(a.id) && pr.includes(b.id) ? pr.indexOf(a.id) - pr.indexOf(b.id) : a.x - b.x));
      if (!s.outs.length) err(s.n, 'The step is not followed by a transition');
    }
    for (const t of C.trans) {
      if (!t.ins.length) err(t.n, 'The transition does not follow a step');
      if (!t.outs.length) err(t.n, 'The transition does not lead to a step or a stop');
      t.outs.sort((a, b) => a.x - b.x);
    }
    for (const s of C.stops) if (!s.ins.length) warn(s.n, 'The stop does not follow a transition');
    // the actions: one instance of a non-Boolean action per chart, except to reset a stored action (PM006)
    const resets = [];
    for (const s of C.steps) for (const a of s.src.acts || []) {
      const q = QUAL[a.q] ? a.q : 'N';
      if (q === 'R') { resets.push([s, a]); continue; }
      const r = bk(a, 'SFC_ACTION');
      const A = { n: a.n, q, bool: !!a.bool, pre: Math.max(0, Math.trunc(+a.pre || 0)), r, step: s, stmts: [] };
      if (r) r.obj().PRE = A.pre;
      if (!A.bool && r) { try { A.stmts = compileST(M, P, a.b, 'stmts').stmts; } catch (m) { if (typeof m !== 'string') throw m; err(a.n, m); } }
      s.acts.push(A); C.acts.set(U(a.n), A);
    }
    for (const [s, a] of resets) {
      const T = C.acts.get(U(a.n || ''));
      if (!T) { err(a.n || s.n, `Reset (R): there is no action '${a.n || ''}' in the chart`); continue; }
      if (!STORED.includes(T.q)) warn(a.n, `Reset (R): the action '${a.n}' is not a stored action (S, SL, DS or SD)`);
      s.acts.push({ n: a.n, q: 'R', target: T, step: s });
    }
    C.sig = JSON.stringify([els.filter(e => e && e.k !== 'text').map(e => [e.id, e.k, U(e.n || '')]), ln]);
    C.st = fresh();
  }
  const fresh = () => ({ on: false, act: new Set(), first: new Set(), leave: new Set(), next: [], ar: new Map(), paused: false });

  /* ---------- execution ---------- */
  const cfg = c => (c.M ? c.M.sfcC || (c.M.sfcC = cfgOf(c.M.sfcCfg)) : CFG0);
  const stepTag = s => (s.r ? s.r.obj() : null);
  function arOf(st, A) { let ar = st.ar.get(A); if (!ar) { ar = { A: false, t0: 0, sto: false, pend: false, q0: 0, pulsed: false, end: false }; st.ar.set(A, ar); } return ar; }
  // the chart back at its initial step: every step and stop off, every stored action stopped; full also clears
  // TMax and the counts (Restart at initial step, PM006 SFC_STEP: TMax, Count)
  function reset(c, C, full) {
    for (const s of C.steps) { const o = stepTag(s); if (!o) continue; [SB.X, SB.FS, SB.SA, SB.LS].forEach(b => setb(o, b, 0)); if (full) { o.TMax = 0; o.Count = 0; } }
    for (const s of C.stops) if (s.r) { const o = s.r.obj(); setb(o, PB.X, 0); if (full) o.Count = 0; }
    for (const A of C.acts.values()) if (A.r) { const o = A.r.obj(); setb(o, AB.A, 0); setb(o, AB.Q, 0); if (full) o.Count = 0; }
    C.st = fresh();
    C.st.on = true;
    if (C.init) C.st.next = [C.init];
  }
  function activate(c, C, e) {
    const st = C.st;
    if (!e.r) { st.act.add(e); return; }
    const o = e.r.obj();
    if (e.k === 'stop') { setb(o, PB.X, 1); o.Count = (o.Count + 1) | 0; st.act.add(e); return; }
    st.act.add(e); st.first.add(e); e.t0 = c.clock;
    setb(o, SB.X, 1); setb(o, SB.DN, 0); setb(o, SB.OV, 0); setb(o, SB.Reset, 0); o.T = 0; o.Count = (o.Count + 1) | 0;
  }
  /* one step's scan: its bits, its timer, then its actions; last: the step's last scan, after which it goes off */
  function runStep(c, C, s, first, last) {
    const o = stepTag(s), now = c.clock, L = cfg(c).last;
    if (o) {
      const t = now - s.t0; o.T = t | 0; if (t > 0x7FFFFFFF) setb(o, SB.OV, 1);
      setb(o, SB.X, 1); setb(o, SB.FS, first); setb(o, SB.LS, last); setb(o, SB.SA, !first && !last);
      if (o.T >= o.PRE) setb(o, SB.DN, 1);
      if (getb(o, SB.AlarmEn) && o.LimitHigh > 0 && o.T >= o.LimitHigh) setb(o, SB.AlarmHigh, 1);
    }
    actions(c, C, s, { act: true, first, last, ts: o ? o.T : now - s.t0 }, L);
    if (!o) return;
    // FS and LS are on only while the step's actions run (PM006, SFC_STEP structure, note 1)
    setb(o, SB.FS, 0); setb(o, SB.LS, 0);
    if (last) {
      setb(o, SB.X, 0); setb(o, SB.SA, 0);
      if (o.T > o.TMax) o.TMax = o.T;
      if (getb(o, SB.AlarmEn) && o.LimitLow > 0 && o.T < o.LimitLow) setb(o, SB.AlarmLow, 1);
    }
  }
  /* the actions of step s (sp: is the step active, its first / last scan, its time) by their qualifiers. An action that
     goes from active to inactive gets its last scan by the Last Scan of Active Steps setting: Don't scan: not executed
     (only P and P0 actions execute, by their logic); Programmatic reset: executed once more with Q off (a non-Boolean
     action); Automatic reset: executed in postscan. A Boolean action keeps Q on through its last scan. */
  function actions(c, C, s, sp, L) {
    const st = C.st, now = c.clock;
    for (const A of s.acts) {
      if (A.q === 'R') { if (sp.act) { const ar = arOf(st, A.target); ar.sto = false; ar.pend = false; } continue; }
      const ar = arOf(st, A), o = A.r ? A.r.obj() : null, pre = o ? o.PRE : A.pre;
      let want = false, pulse = false;
      const on = sp.act && !sp.last;
      switch (A.q) {
        case 'N': want = on; break;
        case 'L': want = on && sp.ts < pre; break;
        case 'D': want = on && sp.ts >= pre; break;
        case 'P1': pulse = sp.act && sp.first; break;
        case 'P0': pulse = sp.act && sp.last; break;
        case 'P': pulse = sp.act && (sp.first || sp.last); break;
        case 'S': if (sp.act && sp.first) ar.sto = true; want = ar.sto; break;
        case 'SL': if (sp.act && sp.first) { ar.sto = true; ar.q0 = now; } if (ar.sto && now - ar.q0 >= pre) ar.sto = false; want = ar.sto; break;
        case 'DS': if (on && sp.ts >= pre) ar.sto = true; want = ar.sto; break;
        case 'SD': if (sp.act && sp.first) { ar.pend = true; ar.q0 = now; } want = ar.pend && now - ar.q0 >= pre; break;
      }
      // the bits of an action that ended last time go off now (so other logic sees its last scan)
      if (ar.end && !want && !pulse) { ar.end = false; if (o) { setb(o, AB.A, 0); setb(o, AB.Q, 0); } }
      if (want || pulse) {
        if (!ar.A) { ar.A = true; ar.t0 = now; if (o) o.Count = (o.Count + 1) | 0; }
        ar.end = false;
        if (o) { setb(o, AB.A, 1); setb(o, AB.Q, 1); o.T = now - ar.t0; }
        if (!A.bool) exec(c, A.stmts, false);
        ar.pulsed = pulse && !want;
        continue;
      }
      if (!ar.A) continue;
      // the action's last scan
      if (o) { setb(o, AB.A, 1); setb(o, AB.Q, A.bool ? 1 : 0); o.T = now - ar.t0; }
      if (!A.bool) {
        if (ar.pulsed) { if (L === 'auto') exec(c, A.stmts, true); }
        else if (L === 'programmatic') exec(c, A.stmts, false);
        else if (L === 'auto') exec(c, A.stmts, true);
      }
      ar.A = false; ar.pulsed = false; ar.end = true;
      if (o && !A.bool) setb(o, AB.Q, 0);
    }
  }
  /* one pass over the chart: the steps whose transition was true have their last scan and the steps after them
     their first; the active steps run; then the transitions after the active steps are checked. A transition
     after two or more steps (the end of a simultaneous branch) is checked only when all of them are active; the
     transitions of a selection branch in priority order, the first true one wins. → true when one fired */
  function pass(c, C) {
    const st = C.st, L = cfg(c).last, left = new Set();
    if (st.next.length) {
      for (const s of C.steps) if (st.leave.has(s)) { runStep(c, C, s, false, true); st.act.delete(s); left.add(s); }
      st.leave.clear();
      const nx = st.next; st.next = [];
      for (const e of nx) if (!st.act.has(e) || e.k === 'stop') activate(c, C, e);
    }
    for (const s of C.steps) {
      if (st.act.has(s)) { runStep(c, C, s, st.first.has(s), false); st.first.delete(s); }
      else if (!left.has(s)) actions(c, C, s, { act: false, first: false, last: false, ts: 0 }, L);
    }
    let fired = false;
    for (const s of C.steps) {
      if (!st.act.has(s) || st.leave.has(s)) continue;
      for (const t of s.outs) {
        if (!t.ins.every(p => st.act.has(p) && !st.leave.has(p))) continue;
        if ((++c.wdN & 255) === 0) c.wdCheck();
        const v = t.cond ? (t.cond() ? 1 : 0) : 0;
        if (t.r) t.r.set(v);
        if (!v) continue;
        fired = true;
        t.ins.forEach(p => st.leave.add(p));
        st.next.push(...t.outs);
        break;
      }
    }
    return fired;
  }
  /* the routine is executed (as a main routine or by a JSR): Execute current active steps only returns after one pass,
     Execute until FALSE transition goes on while a transition is true (the task watchdog stops a chart that never
     reaches a false transition) */
  function run(c, R) {
    const C = R.chart;
    if (!C) return;
    if (c.post) { if (C.st.on) reset(c, C, false); return; }   // a nested SFC is reset by the postscan of its caller
    if (!C.st.on) reset(c, C, false);
    if (C.st.paused) return;
    const until = cfg(c).exec === 'untilFalse';
    let n = 0;
    while (pass(c, C) && until) { if ((++n & 63) === 0) c.wdCheck(); }
  }
  /* Program → Run and power-up (prescan): Restart at initial step starts every chart again at its initial step and
     clears TMax and the counts; Restart at most recently executed step keeps the active steps. After a major fault a
     chart always restarts at its initial step (PM006, Configure the execution of the SFC). */
  function prescan(c) {
    const init = cfg(c).restart === 'initial' || c.sfcInit;
    c.sfcInit = false;
    for (const P of c.M.programs) for (const R of P.routines.values()) if (R.chart && R.chart.st.on && init) reset(c, R.chart, true);
  }
  /* an online edit (Accept Edits): a chart whose steps, transitions and wires are the same keeps its active steps and
     stored actions; another starts at its initial step (PM006, Maintain active SFC step) */
  function carry(oldM, newM) {
    if (!oldM) return;
    for (const P of newM.programs) {
      const oP = oldM.programs.find(x => U(x.name) === U(P.name));
      if (!oP) continue;
      for (const R of P.routines.values()) {
        const o = oP.routines.get(U(R.name));
        if (!R.chart || !o || !o.chart || o.chart.sig !== R.chart.sig || !o.chart.st.on) continue;
        const os = o.chart.st, by = id => R.chart.byId.get(id), st = R.chart.st, map = e => by(e.id);
        st.on = true; st.paused = os.paused;
        os.act.forEach(e => { const n = map(e); if (n) { n.t0 = e.t0; st.act.add(n); } });
        os.first.forEach(e => { const n = map(e); if (n) st.first.add(n); });
        os.leave.forEach(e => { const n = map(e); if (n) st.leave.add(n); });
        st.next = os.next.map(map).filter(Boolean);
        os.ar.forEach((ar, A) => { const n = R.chart.acts.get(U(A.n)); if (n) st.ar.set(n, Object.assign({}, ar)); });
      }
    }
  }
  /* the chart's state for the online view: the active steps and stops, the stored actions that run */
  function liveOf(c, prog, routine) {
    if (!c || !c.M) return null;
    const P = c.M.programs.find(x => U(x.name) === U(prog)), R = P && P.routines.get(U(routine));
    if (!R || !R.chart) return null;
    const C = R.chart, act = new Set([...C.st.act].map(e => e.id)), acts = new Set();
    C.st.ar.forEach((ar, A) => { if (ar.A || ar.end) acts.add(U(A.n)); });
    const t = {};
    C.steps.forEach(s => { const o = stepTag(s); if (o) t[s.id] = o.T; });
    return { act, acts, t, on: C.st.on };
  }

  MTPS.SFC = { QUAL, TIMED, STORED, PULSE, CFG0, CFGV, cfgOf, blank, tagsOf, outs, ins, compile, run, prescan, carry, liveOf, compileST };
  if (typeof module !== 'undefined' && module.exports) module.exports = MTPS.SFC;
  if (typeof document === 'undefined') return;

  /* ====================================================================================================================
     The SFC editor (PM006 chapter 2, Program a sequential function chart; v37 help: Sequential Function Chart Editor,
     Language Element toolbar). The toolbar adds an element; with an element selected the new one is added after it
     and wired to it (Add and automatically connect elements). A wire: click the pin under an element, then the
     element (or its top pin) to go to; a green dot shows a valid connection point. Drag an element to move it.
     Double-click a transition or an action to type its structured text (Ctrl+Enter closes the text entry), a step for
     Step Properties. Right-click (touch: hold) for the element's menu. Online, the active steps are highlighted and
     their timers (.T) count. The app binds its helpers with bind().
     ==================================================================================================================== */
  let A = null;                       // the app's helpers: S, dialog, openMenu, toast, esc, ic, edit, render, run, curProg, curRoutine, ctl, confirmDlg
  const ui = { sel: [], wire: null, act: null, lastLive: 0, sig: '' };
  const G = { sw: 50, sh: 16, tw: 16, pw: 40, ph: 13, aw: 230, ah: 22, ax: 24, gap: 10 };
  const chart = () => { const r = A.curRoutine(); return r && r.type === 'SFC' ? r.sfc || (r.sfc = blank()) : null; };
  const on = () => !!A && !A.S.noProj && A.S.view === 'ladder' && !!chart();
  const z = () => A.S.prefs.sfcZoom || 1;
  const byId = (ch, id) => ch.els.find(e => e.id === id);
  const E = s => A.esc(s);
  const css = `
.sfced{display:flex;flex-direction:column;flex:1;min-height:0;background:var(--lad-bg)}
.sfctb{display:flex;flex-wrap:wrap;gap:2px;align-items:center;padding:3px 6px;border-bottom:1px solid var(--border);background:var(--surface)}
.sfctb .ib.on{background:var(--accent-soft);color:var(--accent-text)}
.sfctb .sfcl{font-size:11px;margin-left:2px}
.sfcwrap{flex:1;overflow:auto;position:relative;outline:none;touch-action:pan-x pan-y;overscroll-behavior:contain}
.sfcwrap svg{display:block;font-family:var(--ui);user-select:none;-webkit-user-select:none}
.sfcwrap .w{fill:none;stroke:var(--lad-wire);stroke-width:1.4}
.sfcwrap .w2{fill:none;stroke:var(--lad-wire);stroke-width:1.4}
.sfcwrap .hitw{fill:none;stroke:transparent;stroke-width:12;cursor:pointer}
.sfcwrap .bx{fill:var(--surface);stroke:var(--lad-wire);stroke-width:1.4}
.sfcwrap .nm{fill:var(--text);font-size:12px}
.sfcwrap .ct{fill:var(--lad-desc);font-size:11px;font-family:var(--mono)}
.sfcwrap .tb{fill:var(--lad-wire)}
.sfcwrap .hit{fill:transparent;cursor:pointer;touch-action:none}
.sfcwrap .sel .bx,.sfcwrap .sel .tb{stroke:var(--accent);stroke-width:2.4}
.sfcwrap .lsel{stroke:var(--accent);stroke-width:2.4}
.sfcwrap .on .bx{fill:var(--lad-on);stroke:var(--lad-on)}
.sfcwrap .on .nm,.sfcwrap .on .tm{fill:var(--on-ok)}
.sfcwrap .tm{fill:var(--lad-online);font-size:10px;font-family:var(--mono)}
.sfcwrap .tt .tb{fill:var(--lad-on)}
.sfcwrap .ar .bx{fill:var(--surface)}
.sfcwrap .ar.aon .bx{stroke:var(--lad-on);stroke-width:2.4}
.sfcwrap .ar .q{fill:var(--accent-text);font-size:11px;font-weight:600}
.sfcwrap .pin{fill:var(--surface);stroke:var(--accent);stroke-width:1.4;cursor:crosshair;touch-action:none}
.sfcwrap .ok{fill:var(--lad-on);stroke:var(--lad-on)}
.sfcwrap .txt .bx{fill:var(--surface-2);stroke-dasharray:3 2}
.sfcwrap .err .bx{stroke:var(--danger)}
.sfcbar{display:flex;align-items:center;gap:6px;padding:3px 8px;border-top:1px solid var(--border);background:var(--surface);min-height:34px}
.sfcbar .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfcst{width:100%;min-height:120px;font-family:var(--mono)}
.sfcpri{min-height:90px;width:100%}`;
  function addCss() { if (document.getElementById('sfc-css')) return; const s = document.createElement('style'); s.id = 'sfc-css'; s.textContent = css; document.head.appendChild(s); }

  /* ---------- geometry ---------- */
  const pinTop = e => (e.k === 'step' ? [e.x, e.y - G.sh] : e.k === 'tran' ? [e.x, e.y - 6] : [e.x, e.y - G.ph]);
  const pinBot = e => (e.k === 'step' ? [e.x, e.y + G.sh] : [e.x, e.y + 6]);
  const boxOf = e => (e.k === 'step' ? [e.x - G.sw, e.y - G.sh, G.sw * 2, G.sh * 2] : e.k === 'tran' ? [e.x - 22, e.y - 11, 44, 22] : e.k === 'stop' ? [e.x - G.pw, e.y - G.ph, G.pw * 2, G.ph * 2] : [e.x, e.y, 150, 14 * Math.max(1, String(e.t || '').split('\n').length) + 10]);
  const short = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  function draw(ch, live) {
    const k = z(), sel = new Set(ui.sel), errs = new Set(((A.S.verify && A.S.verify.errors) || []).filter(e => e.routine === A.curRoutine().name && e.program === A.curProg().name).map(e => U(e.el || '')));
    const els = ch.els, xs = els.map(e => e.x), minX = Math.min(60, ...xs), out = [], wires = [], bars = new Map();
    let W = 300, H = 200;
    for (const e of els) { const b = boxOf(e); W = Math.max(W, b[0] + b[2] + (e.k === 'step' && (e.acts || []).length ? G.ax + G.aw + 10 : 160)); H = Math.max(H, b[1] + b[3] + 20 + (e.k === 'step' ? (e.acts || []).length * G.ah : 0)); }
    const loopX = Math.max(8, minX - G.sw - 30);
    // the wires: a diverge gets a bar under its element, a converge a bar over its element (double for a simultaneous branch)
    ch.ln.forEach((l, i) => {
      const a = byId(ch, l[0]), b = byId(ch, l[1]);
      if (!a || !b) return;
      const no = outs(ch, a.id).length, ni = ins(ch, b.id).length, [x0, y0] = pinBot(a), [x1, y1] = pinTop(b);
      const yb = y0 + G.gap, yc = y1 - G.gap, pts = [[x0, y0]];
      if (no > 1) { pts.push([x0, yb]); const bk = 'd' + a.id; const bb = bars.get(bk) || { y: yb, x0: x0, x1: x0, sim: a.k === 'tran' }; bb.x0 = Math.min(bb.x0, x1); bb.x1 = Math.max(bb.x1, x1); bars.set(bk, bb); }
      if (y1 > y0 + 2 * G.gap - 1 || (y1 > y0 && no < 2 && ni < 2)) {
        const conv = ni > 1 && ins(ch, b.id).every(p => { const s = byId(ch, p); return s && pinBot(s)[1] < y1; });
        if (conv) { const bk = 'c' + b.id; const bb = bars.get(bk) || { y: yc, x0: x1, x1: x1, sim: b.k === 'tran' }; const sx = no > 1 ? x1 : x0; bb.x0 = Math.min(bb.x0, sx); bb.x1 = Math.max(bb.x1, sx); bars.set(bk, bb); pts.push([no > 1 ? x1 : x0, no > 1 ? yb : y0], [no > 1 ? x1 : x0, yc], [x1, yc], [x1, y1]); }
        else { const ym = no > 1 ? yb : Math.round((y0 + y1) / 2); pts.push([no > 1 ? x1 : x0, ym], [x1, ym], [x1, y1]); }
      } else {
        // a wire back up (a loop): out to the left of the chart and down into the step from above
        const ys = no > 1 ? yb : y0 + G.gap;
        pts.push([no > 1 ? x1 : x0, ys], [loopX, ys], [loopX, yc], [x1, yc], [x1, y1]);
      }
      const d = 'M' + pts.map(p => `${p[0] * k},${p[1] * k}`).join('L');
      wires.push(`<path class="w${ui.lsel === i ? ' lsel' : ''}" d="${d}"/>${y1 <= y0 ? `<path class="tb" d="M${x1 * k - 4},${(y1 - 7) * k}L${x1 * k + 4},${(y1 - 7) * k}L${x1 * k},${(y1 - 1) * k}z"/>` : ''}<path class="hitw" data-ln="${i}" d="${d}"/>`);
    });
    bars.forEach(b => { const y = b.y * k, a = b.x0 * k, c = b.x1 * k; wires.push(b.sim ? `<path class="w2" d="M${a - 6},${y - 2}H${c + 6}M${a - 6},${y + 2}H${c + 6}"/>` : `<path class="w2" d="M${a},${y}H${c}"/>`); });
    for (const e of els) {
      const b = boxOf(e), cls = (sel.has(e.id) ? ' sel' : '') + (errs.has(U(e.n || '')) ? ' err' : '');
      const X = v => v * k, act = live && live.act.has(e.id);
      if (e.k === 'step') {
        const t = live && live.t[e.id] != null ? live.t[e.id] : null;
        out.push(`<g class="el step${cls}${act ? ' on' : ''}" data-step="${e.id}"><rect class="bx" x="${X(b[0])}" y="${X(b[1])}" width="${X(b[2])}" height="${X(b[3])}"/>${e.init ? `<rect class="bx" x="${X(b[0] + 3)}" y="${X(b[1] + 3)}" width="${X(b[2] - 6)}" height="${X(b[3] - 6)}" style="fill:none"/>` : ''}
          <text class="nm" x="${X(e.x)}" y="${X(e.y + (live ? -2 : 4))}" text-anchor="middle" style="font-size:${12 * k}px">${E(e.n)}</text>${live ? `<text class="tm" x="${X(e.x)}" y="${X(e.y + 11)}" text-anchor="middle" style="font-size:${10 * k}px" data-tm="${e.id}">${t == null ? '' : 'T ' + t}</text>` : ''}
          <rect class="hit" data-el="${e.id}" x="${X(b[0])}" y="${X(b[1])}" width="${X(b[2])}" height="${X(b[3])}"/></g>`);
        (e.acts || []).forEach((a, i) => {
          const ax = e.x + G.sw + G.ax, ay = e.y - G.sh + i * G.ah, asel = ui.act && ui.act[0] === e.id && ui.act[1] === i, aon = live && live.acts.has(U(a.n || ''));
          out.push(`<g class="ar${asel ? ' sel' : ''}${aon ? ' aon' : ''}${errs.has(U(a.n || '')) ? ' err' : ''}">${i === 0 ? `<path class="w" d="M${X(e.x + G.sw)},${X(e.y)}H${X(ax)}"/>` : ''}<rect class="bx" x="${X(ax)}" y="${X(ay)}" width="${X(G.aw)}" height="${X(G.ah)}"/><path class="w" d="M${X(ax + 26)},${X(ay)}V${X(ay + G.ah)}"/>
            <text class="q" x="${X(ax + 13)}" y="${X(ay + 15)}" text-anchor="middle" style="font-size:${11 * k}px">${E(a.q || 'N')}</text><text class="nm" x="${X(ax + 31)}" y="${X(ay + 15)}" style="font-size:${11 * k}px">${E(a.n)}${a.bool ? ' (BOOL)' : ''}</text>
            <text class="ct" x="${X(ax + 128)}" y="${X(ay + 15)}" style="font-size:${10 * k}px">${E(short(a.q === 'R' ? '' : a.bool ? '' : a.b, 17))}</text><rect class="hit" data-act="${e.id}:${i}" x="${X(ax)}" y="${X(ay)}" width="${X(G.aw)}" height="${X(G.ah)}"/></g>`);
        });
      } else if (e.k === 'tran') {
        const tv = live && live.tt && live.tt[e.id];
        out.push(`<g class="el tran${cls}${tv ? ' tt' : ''}"><path class="w" d="M${X(e.x)},${X(e.y - 6)}V${X(e.y + 6)}"/><rect class="tb" x="${X(e.x - G.tw)}" y="${X(e.y - 1.5)}" width="${X(G.tw * 2)}" height="${Math.max(2, X(3))}"/>
          <text class="nm" x="${X(e.x + G.tw + 6)}" y="${X(e.y - 1)}" style="font-size:${11 * k}px">${E(e.n)}</text><text class="ct" x="${X(e.x + G.tw + 6)}" y="${X(e.y + 11)}" style="font-size:${10 * k}px">${E(short(e.c || '', 34)) || '?'}</text>
          <rect class="hit" data-el="${e.id}" x="${X(b[0])}" y="${X(b[1])}" width="${X(b[2] + 110)}" height="${X(b[3])}"/></g>`);
      } else if (e.k === 'stop') {
        out.push(`<g class="el stop${cls}${act ? ' on' : ''}"><rect class="bx" x="${X(b[0])}" y="${X(b[1])}" width="${X(b[2])}" height="${X(b[3])}" rx="${X(6)}"/><text class="nm" x="${X(e.x)}" y="${X(e.y + 4)}" text-anchor="middle" style="font-size:${11 * k}px">${E(e.n)}</text>
          <rect class="hit" data-el="${e.id}" x="${X(b[0])}" y="${X(b[1])}" width="${X(b[2])}" height="${X(b[3])}"/></g>`);
      } else if (e.k === 'text') {
        out.push(`<g class="el txt${cls}"><rect class="bx" x="${X(b[0])}" y="${X(b[1])}" width="${X(b[2])}" height="${X(b[3])}"/>${String(e.t || 'Text').split('\n').map((l, i) => `<text class="ct" x="${X(b[0] + 5)}" y="${X(b[1] + 16 + i * 14)}" style="font-size:${10 * k}px">${E(short(l, 26))}</text>`).join('')}
          <rect class="hit" data-el="${e.id}" x="${X(b[0])}" y="${X(b[1])}" width="${X(b[2])}" height="${X(b[3])}"/></g>`);
      }
    }
    // pins: the bottom pin of the selected element starts a wire; in wire mode the valid ends show a green dot
    const pins = [];
    if (ui.wire) {
      const f = byId(ch, ui.wire.from);
      for (const e of els) if (f && okWire(ch, f, e)) { const [px, py] = pinTop(e); pins.push(`<circle class="pin ok" data-pin="${e.id}:t" cx="${px * k}" cy="${py * k}" r="${Math.max(5, 6 * k)}"/>`); }
    } else for (const id of ui.sel) { const e = byId(ch, id); if (e && (e.k === 'step' || e.k === 'tran')) { const [px, py] = pinBot(e); pins.push(`<circle class="pin" data-pin="${e.id}:b" cx="${px * k}" cy="${py * k}" r="${Math.max(5, 6 * k)}"/>`); } }
    return `<svg width="${Math.ceil(W * k)}" height="${Math.ceil(H * k)}" data-k="${k}">${wires.join('')}${out.join('')}${pins.join('')}</svg>`;
  }
  const okWire = (ch, f, e) => f.id !== e.id && !ch.ln.some(l => l[0] === f.id && l[1] === e.id) && ((f.k === 'step' && e.k === 'tran') || (f.k === 'tran' && (e.k === 'step' || e.k === 'stop')));

  /* ---------- the routine window ---------- */
  const TB = [['steptran', 'Step and Transition', 'M7 3h10v6H7zM12 9v5M8 16h8'], ['step', 'Step', 'M6 7h12v10H6z'], ['tran', 'Transition', 'M12 4v16M7 12h10'],
    ['act', 'Add Action', 'M4 8h7v8H4zM11 12h3M14 8h6v8h-6z'], ['sel', 'Selection Branch', 'M12 3v5M5 8h14M5 8v6M19 8v6M3 14h4M17 14h4'], ['sim', 'Simultaneous Branch', 'M12 3v4M4 7h16M4 10h16M6 10v8M18 10v8'],
    ['conv', 'Converge (the selected path ends)', 'M6 4v8M18 4v8M5 12h14M12 12v8'], ['stop', 'Stop', 'M6 8h12v8H6zM9 12h6'], ['text', 'Text Box', 'M5 5h14v14H5zM8 9h8M8 13h6'], ['wire', 'Wire: tap the element to wire from, then the element to go to', 'M4 18c6 0 4-12 16-12M18 4l2 2-2 2']];
  const tbI = d => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
  // the bar under the chart: the selected element and its Edit / More buttons (touch has no double-click or right-click)
  function barHTML() {
    const ed = A.editable(), one = ui.sel.length === 1 ? byId(chart(), ui.sel[0]) : null, a = ui.act ? actOf(ui.act) : null;
    const info = a ? `<b>${E(a.n)}</b> <span class="muted">${E(a.q || 'N')} ${E(QUAL[a.q || 'N'])}</span> <span class="mono">${E(short(a.bool ? '(Boolean action)' : a.b, 50))}</span>`
      : one ? `<b>${E(one.n || 'Text Box')}</b> <span class="muted">${one.k === 'step' ? (one.init ? 'Initial step' : 'Step') : one.k === 'tran' ? 'Transition' : one.k === 'stop' ? 'Stop' : ''}</span> <span class="mono">${E(short(one.k === 'tran' ? one.c : one.k === 'text' ? one.t : '', 50))}</span>`
        : ui.wire ? '<span class="muted">Wire: tap the element to go to (green dot), or Esc</span>' : ui.lsel != null ? '<span class="muted">Wire selected: Delete removes it</span>'
          : `<span class="muted">${ui.sel.length > 1 ? ui.sel.length + ' elements selected' : 'Tap an element to select it'}</span>`;
    return `<span class="grow">${info}</span><button class="ib" data-sfc="edit" title="Edit"${(one || a) && ed ? '' : ' disabled'}>${A.ic('edit')}</button><button class="ib" data-sfc="more" title="More">${A.ic('moreh')}</button>`;
  }
  // another chart: its own selection and scroll
  function sync() {
    const key = A.curProg().name + '/' + A.curRoutine().name;
    if (ui.key !== key) { ui.key = key; ui.sel = []; ui.act = null; ui.lsel = null; ui.wire = null; ui.scroll = null; ui.tap = null; }
  }
  function html() {
    sync();
    const ed = A.editable(), w = A.S.layout !== 'desktop';
    const b = ([id, t, d]) => `<button class="ib${id === 'wire' && ui.wire ? ' on' : ''}" data-sfc="${id}" title="${E(t)}" aria-label="${E(t)}"${ed ? '' : ' disabled'}>${tbI(d)}</button>`;
    return `<div class="sfced" id="sfced"><div class="sfctb">${TB.map(b).join('')}<span class="vsep"></span><button class="ib" data-sfc="del" title="Delete (Del)"${ed ? '' : ' disabled'}>${A.ic('trash')}</button><button class="ib" data-sfc="props" title="Properties">${A.ic('gear')}</button><button class="ib" data-sfc="verify" title="Verify Routine">${A.ic('check')}</button>${w ? '' : '<span class="vsep"></span>'}<button class="ib" data-sfc="zout" title="Zoom out">${A.ic('zout')}</button><button class="ib" data-sfc="zin" title="Zoom in">${A.ic('zin')}</button></div>
      <div class="sfcwrap" id="sfcwrap" tabindex="0"></div>
      <div class="sfcbar" id="sfcbar">${barHTML()}</div></div>`;
  }
  // a new selection: the chart and the bar only (the rest of the window stays as it is)
  function refresh() {
    paint();
    const b = document.getElementById('sfcbar'); if (b) b.innerHTML = barHTML();
    const wb = document.querySelector('.sfctb [data-sfc="wire"]'); if (wb) wb.classList.toggle('on', !!ui.wire);
  }
  let live0 = null;
  function liveState() {
    const S = A.S, c = A.ctl();
    if (!S.online || !c || !c.M) return null;
    const l = MTPS.SFC.liveOf(c, A.curProg().name, A.curRoutine().name);
    if (!l) return null;
    l.tt = {};
    for (const e of chart().els) if (e.k === 'tran') { try { l.tt[e.id] = c.read(e.n, A.curProg().name) || c.read(e.n); } catch (x) { /* ignore */ } }
    return l;
  }
  function paint() { const w = document.getElementById('sfcwrap'); if (!w) return; live0 = liveState(); w.innerHTML = draw(chart(), live0); ui.sig = sigOf(live0); }
  const sigOf = l => (l ? [...l.act].join(',') + '|' + [...l.acts].join(',') + '|' + Object.values(l.tt).join('') : '');
  /* online: the active steps, the stored actions and the timers, at most 10 times a second; nothing while offline */
  function liveUpd() {
    if (!on() || !A.S.online) return;
    const now = performance.now();
    if (now - ui.lastLive < 100 || ui.drag) return;
    ui.lastLive = now;
    const l = liveState();
    if (!l) return;
    if (sigOf(l) !== ui.sig || !live0) { paint(); return; }
    const w = document.getElementById('sfcwrap');
    for (const id in l.t) { const t = w && w.querySelector(`[data-tm="${id}"]`); if (t && l.act.has(+id)) { const s = 'T ' + l.t[id]; if (t.textContent !== s) t.textContent = s; } }
  }
  function mount() {
    addCss();
    const w = document.getElementById('sfcwrap'), ed = document.getElementById('sfced');
    if (!w) return;
    sync();
    ui.sel = ui.sel.filter(id => byId(chart(), id));
    if (ui.act && !actOf(ui.act)) ui.act = null;
    paint();
    if (ui.scroll) { w.scrollLeft = ui.scroll[0]; w.scrollTop = ui.scroll[1]; }
    w.addEventListener('scroll', () => { ui.scroll = [w.scrollLeft, w.scrollTop]; }, { passive: true });
    ed.addEventListener('click', ev => { const b = ev.target.closest('[data-sfc]'); if (b && !b.disabled) cmd(b.dataset.sfc, b); });
    w.addEventListener('pointerdown', down);
    w.addEventListener('contextmenu', ev => { ev.preventDefault(); if (ui.hold) return; const t = target(document.elementFromPoint(ev.clientX, ev.clientY) || ev.target); if (t) pick(t, false); menu(t, { x: ev.clientX, y: ev.clientY }); });
  }
  // what a pointer is on: { el } an element, { act: [step id, index] } an action, { ln } a wire, { pin } a pin
  function target(n) {
    if (!n || !n.closest) return null;
    const p = n.closest('[data-pin]'); if (p) { const [id, s] = p.dataset.pin.split(':'); return { pin: +id, side: s }; }
    const a = n.closest('[data-act]'); if (a) { const [s, i] = a.dataset.act.split(':'); return { act: [+s, +i] }; }
    const e = n.closest('[data-el]'); if (e) return { el: +e.dataset.el };
    const l = n.closest('[data-ln]'); if (l) return { ln: +l.dataset.ln };
    return null;
  }
  const actOf = ([s, i]) => { const e = byId(chart(), s); return e && e.acts && e.acts[i]; };
  function pick(t, add) {
    ui.lsel = null;
    if (!t) { ui.sel = []; ui.act = null; return; }
    if (t.act) { ui.act = t.act; ui.sel = []; return; }
    ui.act = null;
    if (t.ln != null) { ui.sel = []; ui.lsel = t.ln; return; }
    const id = t.el != null ? t.el : t.pin;
    if (add) ui.sel = ui.sel.includes(id) ? ui.sel.filter(x => x !== id) : ui.sel.concat(id); else if (!ui.sel.includes(id) || ui.sel.length < 2) ui.sel = [id];
  }
  function down(ev) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    const t = target(ev.target), w = ev.currentTarget, k = z();
    if (ui.wire) {
      const ch = chart(), id = t ? (t.el != null ? t.el : t.pin) : null, f = byId(ch, ui.wire.from), e = id != null ? byId(ch, id) : null;
      if (e && f && okWire(ch, f, e)) { ui.wire = null; A.edit(() => { ch.ln.push([f.id, e.id]); }); ui.sel = [e.id]; return; }
      if (!t || (e && e.id !== f.id)) { ui.wire = null; A.toast(e ? `A wire cannot go from ${f.n} to ${e.n || 'a text box'}.` : 'Wire cancelled.'); refresh(); }
      return;
    }
    if (t && t.pin != null && t.side === 'b' && A.editable()) { ev.preventDefault(); ui.wire = { from: t.pin }; refresh(); return; }
    if (!t) { if (ui.sel.length || ui.act || ui.lsel != null) { pick(null); refresh(); } return; }
    const before = JSON.stringify([ui.sel, ui.act, ui.lsel]);
    pick(t, ev.shiftKey || ev.ctrlKey);
    const same = before === JSON.stringify([ui.sel, ui.act, ui.lsel]);
    const ch = chart(), ids = t.el != null ? ui.sel.slice() : [], from = ids.map(id => { const e = byId(ch, id); return e ? [e.x, e.y] : null; });
    const d = { x: ev.clientX, y: ev.clientY, moved: false, id: ev.pointerId, touch: ev.pointerType !== 'mouse' };
    ui.drag = d;
    try { w.setPointerCapture(ev.pointerId); } catch (x) { /* ignore */ }
    if (!same) refresh();
    if (d.touch) d.timer = setTimeout(() => { if (ui.drag === d && !d.moved) { ui.hold = true; ui.drag = null; if (navigator.vibrate) navigator.vibrate(12); menu(t, { x: d.x, y: d.y }); setTimeout(() => { ui.hold = false; }, 600); } }, 450);
    const mv = e2 => {
      if (e2.pointerId !== d.id || ui.drag !== d) return;
      const dx = (e2.clientX - d.x) / k, dy = (e2.clientY - d.y) / k;
      if (!d.moved && Math.hypot(dx * k, dy * k) < 6) return;
      if (!A.editable() || !ids.length) return;
      d.moved = true; clearTimeout(d.timer);
      ids.forEach((id, i) => { const e = byId(ch, id); if (e && from[i]) { e.x = Math.max(20, Math.round((from[i][0] + dx) / 10) * 10); e.y = Math.max(20, Math.round((from[i][1] + dy) / 10) * 10); } });
      w.innerHTML = draw(ch, live0);
    };
    const up = e2 => {
      if (e2.pointerId !== d.id) return;
      w.removeEventListener('pointermove', mv); w.removeEventListener('pointerup', up); w.removeEventListener('pointercancel', up);
      clearTimeout(d.timer);
      if (ui.drag !== d) return;
      ui.drag = null;
      if (d.moved) {
        // the move is one edit (undo puts the elements back)
        const to = ids.map(id => { const e = byId(ch, id); return [e.x, e.y]; });
        ids.forEach((id, i) => { const e = byId(ch, id); [e.x, e.y] = from[i]; });
        A.edit(() => { const c2 = chart(); ids.forEach((id, i) => { const e = byId(c2, id); [e.x, e.y] = to[i]; }); });
        return;
      }
      // a second click or tap on the same element soon after opens it (double-click, double tap)
      const nt = performance.now(), key = JSON.stringify(t);
      if (ui.tap && ui.tap.k === key && nt - ui.tap.t < 450 && !e2.shiftKey && !e2.ctrlKey) { ui.tap = null; open(t); return; }
      ui.tap = { k: key, t: nt };
    };
    w.addEventListener('pointermove', mv); w.addEventListener('pointerup', up); w.addEventListener('pointercancel', up);
  }

  /* ---------- editing ---------- */
  const tagList = () => A.curProg().tags;
  const hasTag = n => tagList().some(t => U(t.name) === U(n)) || A.S.p.tags.some(t => U(t.name) === U(n));
  // the next free name Prefix_NNN (Step_000, Tran_000, Action_000, Stop_000 as the reference names them)
  function nextName(pre, ch) {
    const used = new Set(tagList().map(t => U(t.name)).concat(A.S.p.tags.map(t => U(t.name))));
    for (const g of [A.curProg()]) for (const r of g.routines) if (r.sfc) for (const e of r.sfc.els) { if (e.n) used.add(U(e.n)); (e.acts || []).forEach(a => used.add(U(a.n))); }
    (ch.els || []).forEach(e => { if (e.n) used.add(U(e.n)); (e.acts || []).forEach(a => used.add(U(a.n))); });
    for (let i = 0; ; i++) { const n = pre + '_' + String(i).padStart(3, '0'); if (!used.has(U(n))) return n; }
  }
  // the element's tag in the program (the reference creates it with the element)
  const mkTag = (n, type) => { if (!hasTag(n)) tagList().push({ name: n, type }); };
  const TYPE = { step: 'SFC_STEP', tran: 'BOOL', stop: 'SFC_STOP' };
  const nextId = ch => Math.max(0, ...ch.els.map(e => e.id)) + 1;
  // a free place below (x, y): an element already there moves the new one to the right
  function spot(ch, x, y) { while (ch.els.some(e => Math.abs(e.x - x) < 90 && Math.abs(e.y - y) < 30)) x += 140; return [x, y]; }
  function addEl(ch, k, x, y, more) {
    const pre = { step: 'Step', tran: 'Tran', stop: 'Stop' }[k], e = Object.assign({ id: nextId(ch), k, x, y }, more || {});
    if (pre) { e.n = nextName(pre, ch); mkTag(e.n, TYPE[k]); }
    if (k === 'step') e.acts = e.acts || [];
    if (k === 'tran') e.c = e.c || '';
    ch.els.push(e);
    return e;
  }
  const lowest = ch => ch.els.reduce((m, e) => Math.max(m, e.y + (e.k === 'step' ? (e.acts || []).length * G.ah : 0)), 0);
  function add(kind) {
    const ch0 = chart(), s0 = ui.sel.length === 1 ? byId(ch0, ui.sel[0]) : null, sid = s0 ? s0.id : null;
    let made = [];
    A.edit(() => {
      const ch = chart(), s = sid != null ? byId(ch, sid) : null, below = e => spot(ch, e.x, e.y + 70), free = () => spot(ch, s ? s.x + 160 : 160, lowest(ch) + 70);
      const link = (a, b) => { if (a && b) ch.ln.push([a.id, b.id]); };
      if (kind === 'text') { const [x, y] = free(); made = [addEl(ch, 'text', x - 70, y, { t: 'Text' })]; return; }
      if (kind === 'steptran' || kind === 'step' || kind === 'tran' || kind === 'stop') {
        const seq = kind === 'steptran' ? (s && s.k === 'step' ? ['tran', 'step'] : ['step', 'tran']) : [kind];
        let prev = s && ((s.k === 'step' && seq[0] === 'tran') || (s.k === 'tran' && seq[0] !== 'tran')) ? s : null, at = prev ? below(prev) : free();
        for (const k of seq) { const e = addEl(ch, k, at[0], at[1]); link(prev, e); made.push(e); prev = e; at = below(e); }
        return;
      }
      if (kind === 'sel' || kind === 'sim') {
        // a selection branch after a step (two or more transitions), a simultaneous branch after a transition (two or
        // more steps); on a branch already there it adds a path on the right (Extend Branch)
        const want = kind === 'sel' ? 'step' : 'tran', nk = kind === 'sel' ? 'tran' : 'step';
        if (!s || s.k !== want) { A.toast(kind === 'sel' ? 'Select the step the selection branch starts from.' : 'Select the transition the simultaneous branch starts from.'); return false; }
        const o = outs(ch, s.id).map(id => byId(ch, id)).filter(Boolean), y = o.length ? o[0].y : s.y + 70;
        const n = o.length ? 1 : 2, x0 = o.length ? Math.max(...o.map(e => e.x)) + 150 : s.x;
        for (let i = 0; i < n; i++) { const e = addEl(ch, nk, x0 + i * 150, y); link(s, e); made.push(e); }
        return;
      }
      if (kind === 'conv') {
        // the selected last transitions of a selection branch go to one new step; the selected last steps of a
        // simultaneous branch to one new transition (Converge SFC Elements)
        const list = ui.sel.map(id => byId(ch, id)).filter(Boolean), k0 = list[0] && list[0].k;
        if (list.length < 2 || !list.every(e => e.k === k0) || !(k0 === 'tran' || k0 === 'step')) { A.toast('Select the last transitions (selection branch) or the last steps (simultaneous branch) of two or more paths, then Converge.'); return false; }
        const x = Math.round(list.reduce((m, e) => m + e.x, 0) / list.length / 10) * 10, y = Math.max(...list.map(e => e.y)) + 70;
        const e = addEl(ch, k0 === 'tran' ? 'step' : 'tran', x, y);
        list.forEach(p => link(p, e)); made = [e];
      }
    });
    if (made.length) { ui.sel = [made[made.length - 1].id]; ui.act = null; A.render(); }
  }
  function addAction(stepId) {
    let ok = false;
    A.edit(() => { const ch = chart(), s = byId(ch, stepId); if (!s || s.k !== 'step') return false; const n = nextName('Action', ch); mkTag(n, 'SFC_ACTION'); s.acts = s.acts || []; s.acts.push({ n, q: 'N', b: '' }); ui.act = [s.id, s.acts.length - 1]; ui.sel = []; ok = true; });
    return ok;
  }
  // delete the selection with the tags of its elements (Delete SFC Element(s) but not Tag keeps them)
  function del(keepTags) {
    const ch0 = chart();
    if (ui.lsel != null) { const i = ui.lsel; ui.lsel = null; A.edit(() => { chart().ln.splice(i, 1); }); return; }
    if (ui.act) { const [s, i] = ui.act; ui.act = null; A.edit(() => { const e = byId(chart(), s); const a = e.acts.splice(i, 1)[0]; if (!keepTags && a && a.q !== 'R') dropTag(a.n); }); return; }
    if (!ui.sel.length) return;
    if (ui.sel.some(id => { const e = byId(ch0, id); return e && e.init; }) && ch0.els.filter(e => e.k === 'step').length > 1 && !ui.sel.every(id => byId(ch0, id) && byId(ch0, id).k === 'step')) { /* deleting the initial step is allowed; Verify then asks for another */ }
    const ids = new Set(ui.sel); ui.sel = [];
    A.edit(() => {
      const ch = chart();
      ch.els.filter(e => ids.has(e.id)).forEach(e => { if (!keepTags && e.n) dropTag(e.n); if (!keepTags) (e.acts || []).forEach(a => { if (a.q !== 'R') dropTag(a.n); }); });
      ch.els = ch.els.filter(e => !ids.has(e.id)); ch.ln = ch.ln.filter(l => !ids.has(l[0]) && !ids.has(l[1]));
    });
  }
  const dropTag = n => { const g = A.curProg(), i = g.tags.findIndex(t => U(t.name) === U(n) && /^(SFC_STEP|SFC_STOP|SFC_ACTION|BOOL)$/.test(U(t.type || 'BOOL'))); if (i >= 0) g.tags.splice(i, 1); };
  function rename(ch, e, v) {
    const old = e.n, t = tagList().find(x => U(x.name) === U(old));
    if (t) t.name = v; else mkTag(v, TYPE[e.k] || 'SFC_ACTION');
    e.n = v;
    // a Reset action names the stored action it resets
    if (!e.k) ch.els.forEach(s => (s.acts || []).forEach(a => { if (a.q === 'R' && U(a.n) === U(old)) a.n = v; }));
  }
  const nameErr = (ch, e, v) => (!MTPS.validName(v) ? 'Name must be a valid IEC-1131 identifier (letters, digits and _, up to 40).' : U(v) !== U(e.n) && (hasTag(v) || ch.els.some(x => U(x.n || '') === U(v))) ? `A tag named ${v} exists.` : '');

  /* ---------- dialogs ---------- */
  // structured text entry (Ctrl+Enter accepts, as the text entry window of the reference)
  function stText(title, label, val, fn, check) {
    const el = A.dialog({ title, size: 'md', focus: true, noEnter: () => true,
      body: `<div class="frow"><label>${E(label)}</label><textarea class="inp sfcst" id="sfc-st" spellcheck="false" autocapitalize="off" autocomplete="off">${E(val || '')}</textarea></div><p class="help">Ctrl+Enter: OK. Structured text: := assigns, [:=] assigns and clears in the postscan, IF … THEN … END_IF; JSR(Routine); comments // or (* *).</p><div class="errtx" id="sfc-ste"></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el2 => { const v = el2.querySelector('#sfc-st').value, m = check ? check(v) : ''; if (m) { el2.querySelector('#sfc-ste').textContent = m; return false; } fn(v); } }] });
    const ta = el.querySelector('#sfc-st');
    ta.addEventListener('keydown', ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); el.querySelector('.df .btn.pri').click(); } });
  }
  const stCheck = v => (!String(v).trim() ? 'Type the BOOL expression of the transition.' : '');
  function open(t) {
    const ch = chart();
    if (t.act) return actionProps(t.act, true);
    const e = byId(ch, t.el != null ? t.el : t.pin);
    if (!e) return;
    if (!A.editable() && e.k !== 'step') return;
    if (e.k === 'tran') stText(`Transition ${e.n}`, 'BOOL expression', e.c, v => A.edit(() => { byId(chart(), e.id).c = v.trim(); }), stCheck);
    else if (e.k === 'step') stepProps(e.id);
    else if (e.k === 'stop') stopProps(e.id);
    else if (e.k === 'text') stText('Text Box', 'Text', e.t, v => A.edit(() => { byId(chart(), e.id).t = v; }));
  }
  const tagVal = (n, m) => { const c = A.ctl(); if (!A.S.online || !c || !c.M) return null; try { const v = c.read(n + '.' + m, A.curProg().name); return v === undefined ? c.read(n + '.' + m) : v; } catch (x) { return null; } };
  /* Step Properties (help v37, Edit Step properties): Type (Normal / Initial), Preset, Timer, Timer Max, Count, Alarm
     Enable, Limit High, Limit Low. Use Expression is not offered (the times are numbers here). */
  function stepProps(id) {
    const ch = chart(), e = byId(ch, id), ro = !A.editable(), dis = ro ? ' disabled' : '', on = A.S.online;
    const num = (k2, l, v) => `<div class="frow"><label>${l}</label><input class="inp" id="sp-${k2}" type="number" min="0" step="1" value="${+v || 0}"${dis}></div>`;
    const rv = (l, m) => `<div class="frow"><label>${l}</label><input class="inp" value="${on ? E(tagVal(e.n, m)) : ''}" disabled></div>`;
    A.dialog({ title: `Step Properties - ${e.n}`, size: 'md', focus: true,
      body: `<div class="frow"><label>Name</label><input class="inp" id="sp-n" value="${E(e.n)}" autocomplete="off" spellcheck="false" autocapitalize="off"${dis}></div>
        <div class="frow"><label>Type</label><select class="inp" id="sp-t"${dis}><option value="0">Normal</option><option value="1"${e.init ? ' selected' : ''}>Initial</option></select></div>
        ${num('pre', 'Preset (ms)', e.pre)}${rv('Timer (ms)', 'T')}${rv('Timer Max (ms)', 'TMax')}${rv('Count', 'Count')}
        <div class="frow"><label>Alarming</label><label class="ockb"><input type="checkbox" id="sp-al"${e.al ? ' checked' : ''}${dis}> AlarmEnable</label></div>${num('lh', 'Limit High (ms)', e.lh)}${num('ll', 'Limit Low (ms)', e.ll)}
        <p class="help">The step's tag (SFC_STEP) holds X, FS, SA, LS, DN, T, TMax, Count and the alarms. Changing a step to Initial makes the other initial step Normal.</p><div class="errtx" id="sp-e"></div>`,
      buttons: ro ? [{ l: 'Close', pri: true }] : [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        const v = el.querySelector('#sp-n').value.trim(), m = nameErr(ch, e, v);
        if (m) { el.querySelector('#sp-e').textContent = m; return false; }
        const g = k2 => Math.max(0, Math.trunc(+el.querySelector('#sp-' + k2).value || 0)), init = el.querySelector('#sp-t').value === '1', al = el.querySelector('#sp-al').checked;
        A.edit(() => {
          const c2 = chart(), s = byId(c2, id);
          if (v !== s.n) rename(c2, s, v);
          if (init) c2.els.forEach(x => { if (x.k === 'step' && x.id !== id) delete x.init; });
          if (init) s.init = true; else delete s.init;
          ['pre', 'lh', 'll'].forEach(k2 => { if (g(k2)) s[k2] = g(k2); else delete s[k2]; });
          if (al) s.al = true; else delete s.al;
        });
      } }] });
  }
  function stopProps(id) {
    const ch = chart(), e = byId(ch, id);
    A.prompt1('Stop Properties', 'Name', e.n, v => { const m = nameErr(ch, e, v); if (m) return m; A.edit(() => { const c2 = chart(); rename(c2, byId(c2, id), v); }); });
  }
  /* Action Properties (help v37, Edit Action properties): the qualifier (N, R, S, L, D, P, P1, P0, SL, SD, DS),
     Boolean, Preset for a timed qualifier; text: the action's structured text */
  function actionProps(ix, text) {
    const ch = chart(), s = byId(ch, ix[0]), a = s && s.acts[ix[1]];
    if (!a) return;
    const ro = !A.editable(), dis = ro ? ' disabled' : '';
    if (text && !ro && !a.bool && a.q !== 'R') { stText(`Action ${a.n}`, 'Structured text', a.b, v => A.edit(() => { byId(chart(), ix[0]).acts[ix[1]].b = v; })); return; }
    const opts = Object.keys(QUAL).map(q => `<option value="${q}"${(a.q || 'N') === q ? ' selected' : ''}>${q} - ${E(QUAL[q])}</option>`).join('');
    const el = A.dialog({ title: `Action Properties - ${a.n}`, size: 'md', focus: true, noEnter: ev => ev.target.tagName === 'TEXTAREA',
      body: `<div class="frow"><label>Name</label><input class="inp" id="ap-n" value="${E(a.n)}" autocomplete="off" spellcheck="false" autocapitalize="off"${dis}></div>
        <div class="frow"><label>Qualifier</label><select class="inp" id="ap-q"${dis}>${opts}</select></div>
        <div class="frow"><label>Preset (ms)</label><input class="inp" id="ap-p" type="number" min="0" step="1" value="${+a.pre || 0}"${dis}></div>
        <div class="frow"><label></label><label class="ockb"><input type="checkbox" id="ap-b"${a.bool ? ' checked' : ''}${dis}> Boolean</label></div>
        <div class="frow"><label>Structured text</label><textarea class="inp sfcst" id="ap-st" spellcheck="false" autocapitalize="off"${dis}>${E(a.b || '')}</textarea></div>
        <p class="help">Reset (R) names the stored action it turns off (S, SL, DS, SD). A Boolean action has no logic: it only sets its Q and A bits for other logic. Preset is the time of L, SL, D, DS and SD.</p><div class="errtx" id="ap-e"></div>`,
      buttons: ro ? [{ l: 'Close', pri: true }] : [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el2 => {
        const v = el2.querySelector('#ap-n').value.trim(), q = el2.querySelector('#ap-q').value, er = t => { el2.querySelector('#ap-e').textContent = t; return false; };
        if (!MTPS.validName(v)) return er('Name must be a valid IEC-1131 identifier.');
        const pre = Math.max(0, Math.trunc(+el2.querySelector('#ap-p').value || 0)), bool = el2.querySelector('#ap-b').checked, b = el2.querySelector('#ap-st').value;
        A.edit(() => {
          const c2 = chart(), x = byId(c2, ix[0]).acts[ix[1]], was = x.q === 'R';
          if (q === 'R') { if (!was) dropTag(x.n); x.n = v; }
          else if (v !== x.n || was) { const t = tagList().find(y => U(y.name) === U(x.n)); if (t && !was) t.name = v; else mkTag(v, 'SFC_ACTION'); c2.els.forEach(st2 => (st2.acts || []).forEach(y => { if (y !== x && y.q === 'R' && U(y.n) === U(x.n)) y.n = v; })); x.n = v; }
          x.q = q; if (TIMED.includes(q) && pre) x.pre = pre; else delete x.pre;
          if (bool) x.bool = true; else delete x.bool;
          x.b = b;
        });
      } }] });
    const sync = () => { const q = el.querySelector('#ap-q').value; el.querySelector('#ap-p').disabled = ro || !TIMED.includes(q); el.querySelector('#ap-st').disabled = ro || q === 'R' || el.querySelector('#ap-b').checked; };
    el.querySelector('#ap-q').addEventListener('change', sync); el.querySelector('#ap-b').addEventListener('change', sync); sync();
  }
  // Set JSR: the action calls a routine of the program (help v37, Set JSR command)
  function setJsr(ix) {
    const g = A.curProg(), rs = g.routines.filter(r => r.name !== A.curRoutine().name);
    if (!rs.length) { A.toast('The program has no other routine to call.'); return; }
    A.dialog({ title: 'Set JSR', size: 'sm', focus: true, body: `<div class="frow"><label>Routine</label><select class="inp" id="sj-r">${rs.map(r => `<option>${E(r.name)}</option>`).join('')}</select></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => { const n = el.querySelector('#sj-r').value; A.edit(() => { const x = byId(chart(), ix[0]).acts[ix[1]]; x.b = `JSR(${n});`; delete x.bool; }); } }] });
  }
  /* Set Sequence Priorities (PM006, Set the priorities of a selection branch): Use default priorities (left to right),
     or the order set with Move Up / Move Down */
  function priorities(id) {
    const ch = chart(), s = byId(ch, id), o = outs(ch, id).map(x => byId(ch, x)).filter(Boolean);
    const pr = ch.pri && ch.pri[id], list = pr ? pr.map(x => o.find(e => e.id === x)).filter(Boolean).concat(o.filter(e => !pr.includes(e.id))) : o.slice().sort((a, b) => a.x - b.x);
    const el = A.dialog({ title: 'Set Sequence Priorities', size: 'sm', focus: true,
      body: `<div class="frow"><label></label><label class="ockb"><input type="checkbox" id="pr-d"${pr ? '' : ' checked'}> Use default priorities</label></div>
        <div class="frow"><label>Transitions</label><select class="inp sfcpri" id="pr-l" size="${Math.min(8, list.length + 1)}">${list.map((e, i) => `<option value="${e.id}"${i ? '' : ' selected'}>${i + 1}  ${E(e.n)}</option>`).join('')}</select></div>
        <div class="brow"><button class="btn" id="pr-u">Move Up</button><button class="btn" id="pr-w">Move Down</button></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el2 => {
        const d = el2.querySelector('#pr-d').checked, ord = [...el2.querySelector('#pr-l').options].map(x => +x.value);
        A.edit(() => { const c2 = chart(); if (d) { if (c2.pri) delete c2.pri[id]; } else { c2.pri = c2.pri || {}; c2.pri[id] = ord; } });
      } }] });
    const l = el.querySelector('#pr-l'), d = el.querySelector('#pr-d');
    const sync = () => { l.disabled = d.checked; el.querySelector('#pr-u').disabled = el.querySelector('#pr-w').disabled = d.checked; [...l.options].forEach((x, i) => { x.textContent = `${d.checked ? '' : i + 1 + '  '}${byId(ch, +x.value).n}`; }); };
    const mvo = k2 => { const i = l.selectedIndex; if (i < 0) return; const j = i + k2; if (j < 0 || j >= l.options.length) return; const x = l.options[i]; l.removeChild(x); l.insertBefore(x, l.options[j] || null); l.selectedIndex = j; sync(); };
    d.addEventListener('change', sync); el.querySelector('#pr-u').addEventListener('click', () => mvo(-1)); el.querySelector('#pr-w').addEventListener('click', () => mvo(1)); sync();
    void s;
  }
  function moveAct(ix, d) { A.edit(() => { const s = byId(chart(), ix[0]), j = ix[1] + d; if (j < 0 || j >= s.acts.length) return false; const [a] = s.acts.splice(ix[1], 1); s.acts.splice(j, 0, a); ui.act = [ix[0], j]; }); }
  function menu(t, at) {
    const ch = chart(), ed = A.editable(), items = [];
    if (t && t.act) {
      const ix = t.act;
      items.push({ l: 'Edit Structured Text', run: () => actionProps(ix, true), dis: !ed }, { l: 'Action Properties…', run: () => actionProps(ix, false) }, { l: 'Set JSR…', run: () => setJsr(ix), dis: !ed },
        '-', { l: 'Move Up', run: () => moveAct(ix, -1), dis: !ed || ix[1] === 0 }, { l: 'Move Down', run: () => moveAct(ix, 1), dis: !ed }, '-', { l: 'Delete', k: 'Del', run: () => { ui.act = ix; del(); }, dis: !ed });
    } else if (t && t.ln != null) items.push({ l: 'Delete Wire', k: 'Del', run: () => { ui.lsel = t.ln; del(); }, dis: !ed });
    else if (t) {
      const e = byId(ch, t.el != null ? t.el : t.pin);
      if (!e) return;
      if (e.k === 'step') items.push({ l: 'Add Action', run: () => { if (addAction(e.id)) actionProps(ui.act, true); }, dis: !ed }, { l: 'Step Properties…', run: () => stepProps(e.id) }, { l: 'Initial Step', ck: !!e.init, run: () => A.edit(() => { chart().els.forEach(x => { if (x.k === 'step') { if (x.id === e.id) x.init = true; else delete x.init; } }); }), dis: !ed },
        { l: 'Set Sequence Priorities…', run: () => priorities(e.id), dis: !ed || outs(ch, e.id).length < 2 });
      if (e.k === 'tran') items.push({ l: 'Edit BOOL Expression', run: () => open({ el: e.id }), dis: !ed });
      if (e.k === 'stop' || e.k === 'text') items.push({ l: e.k === 'stop' ? 'Stop Properties…' : 'Edit Text', run: () => open({ el: e.id }), dis: !ed });
      if (e.k === 'step' || e.k === 'tran') items.push({ l: 'Wire From Here', run: () => { ui.wire = { from: e.id }; refresh(); }, dis: !ed });
      items.push('-', { l: 'Delete', k: 'Del', run: () => del(), dis: !ed });
      if (e.n) items.push({ l: 'Delete SFC Element(s) but not Tag', run: () => del(true), dis: !ed });
    } else items.push({ l: 'Step and Transition', run: () => add('steptran'), dis: !ed }, { l: 'Text Box', run: () => add('text'), dis: !ed }, { l: 'Verify Routine', run: () => A.run('verifyr') });
    A.openMenu(items, at);
  }
  function cmd(id, btn) {
    const ch = chart();
    if (id === 'zin' || id === 'zout') { A.S.prefs.sfcZoom = Math.max(0.5, Math.min(2.5, Math.round(z() * (id === 'zin' ? 1.2 : 1 / 1.2) * 100) / 100)); A.savePrefs(); A.render(); return; }
    if (id === 'verify') { A.run('verifyr'); return; }
    if (id === 'del') { del(); return; }
    if (id === 'wire') { const s = ui.sel.length === 1 ? byId(ch, ui.sel[0]) : null; if (ui.wire) ui.wire = null; else if (s && (s.k === 'step' || s.k === 'tran')) ui.wire = { from: s.id }; else { A.toast('Select the step or transition to wire from, then Wire.'); return; } refresh(); return; }
    if (id === 'act') { const s = ui.sel.length === 1 ? byId(ch, ui.sel[0]) : ui.act ? byId(ch, ui.act[0]) : null; if (!s || s.k !== 'step') { A.toast('Select the step to add the action to.'); return; } if (addAction(s.id)) actionProps(ui.act, true); return; }
    if (id === 'props') { if (ui.act) actionProps(ui.act, false); else if (ui.sel.length === 1) { const e = byId(ch, ui.sel[0]); if (e.k === 'step') stepProps(e.id); else open({ el: e.id }); } else A.run('props'); return; }
    if (id === 'edit') { if (ui.act) open({ act: ui.act }); else if (ui.sel.length === 1) open({ el: ui.sel[0] }); return; }
    if (id === 'more') { const r = btn.getBoundingClientRect(); menu(ui.act ? { act: ui.act } : ui.lsel != null ? { ln: ui.lsel } : ui.sel.length === 1 ? { el: ui.sel[0] } : null, { x: r.left, y: r.top - 8 }); return; }
    add(id);
  }
  // keys in the SFC window: Delete, Escape, Enter (open), arrows move the selection by 10
  function key(ev) {
    if (!on()) return false;
    const k = ev.key, ctrl = ev.ctrlKey || ev.metaKey;
    if (k === 'Delete' && A.editable()) { del(); return true; }
    if (k === 'Escape') { ui.wire = null; pick(null); refresh(); return true; }
    if (k === 'Enter' && !ctrl) { if (ui.act) open({ act: ui.act }); else if (ui.sel.length === 1) open({ el: ui.sel[0] }); return true; }
    if (/^Arrow/.test(k) && ui.sel.length && A.editable()) { const d = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[k], ids = ui.sel.slice(); A.edit(() => { const c2 = chart(); ids.forEach(id => { const e = byId(c2, id); e.x = Math.max(20, e.x + d[0]); e.y = Math.max(20, e.y + d[1]); }); }); return true; }
    // the ladder's rung commands do not apply to a chart
    if ((ctrl && /^[rcxvd]$/i.test(k)) || k === 'Insert' || k === 'F2') return true;
    return false;
  }
  /* a new SFC routine for program g: the initial step and its transition, with their tags (New Routine, Type
     Sequential Function Chart); the controller's SFC Execution settings are stored with their defaults */
  function newChart(g, p) {
    const used = new Set(g.tags.map(t => U(t.name)).concat(p.tags.map(t => U(t.name))));
    g.routines.forEach(r => { if (r.sfc) r.sfc.els.forEach(e => e.n && used.add(U(e.n))); });
    const nm = pre => { for (let i = 0; ; i++) { const n = pre + '_' + String(i).padStart(3, '0'); if (!used.has(U(n))) { used.add(U(n)); return n; } } };
    const ch = blank(); ch.els[0].n = nm('Step'); ch.els[1].n = nm('Tran');
    g.tags.push({ name: ch.els[0].n, type: 'SFC_STEP' }, { name: ch.els[1].n, type: 'BOOL' });
    if (!p.controller.sfc) p.controller.sfc = Object.assign({}, CFG0);
    return ch;
  }
  MTPS.SFC.ui = { bind: o => { A = o; }, on, html, mount, live: liveUpd, key, newChart, state: ui, cmd };
})(typeof window !== 'undefined' ? window : globalThis);
