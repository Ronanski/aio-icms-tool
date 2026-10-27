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
})(typeof window !== 'undefined' ? window : globalThis);
