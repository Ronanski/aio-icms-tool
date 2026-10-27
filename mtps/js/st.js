/* MT PLC Studio: Structured Text routines (Logix 5000 Controllers Structured Text, 1756-PM007L-EN-P Sep 2024; the
   instructions of 1756-RM018A-EN-P). The language part has no DOM: engine.js compiles an ST routine with
   MTPS.ST.compile and runs it every scan. The editor part (below) is used by app.js when a page is there. */
(function (root) {
  'use strict';
  const E = root.MTPS;
  if (!E || !E._k) return;
  const K = E._k, U = s => String(s).toUpperCase();

  /* ---------- the language ---------- */
  // reserved words (PM007: not case sensitive; GOTO is reserved and not available)
  const KW = ['IF', 'THEN', 'ELSIF', 'ELSE', 'END_IF', 'CASE', 'OF', 'END_CASE', 'FOR', 'TO', 'BY', 'DO', 'END_FOR', 'WHILE', 'END_WHILE',
    'REPEAT', 'UNTIL', 'END_REPEAT', 'EXIT', 'AND', 'OR', 'XOR', 'NOT', 'MOD', 'GOTO'];
  const KWS = new Set(KW);
  /* the functions of an expression (PM007, Use arithmetic operators and functions): [f, 1 = always REAL / 0 = the
     type of the operand]; SQRT of a negative number takes its absolute value, as SQR does in ladder */
  const FN = { ABS: [Math.abs, 0], ACOS: [Math.acos, 1], ASIN: [Math.asin, 1], ATAN: [Math.atan, 1], COS: [Math.cos, 1], DEG: [v => v * 180 / Math.PI, 1],
    LN: [Math.log, 1], LOG: [Math.log10, 1], RAD: [v => v * Math.PI / 180, 1], SIN: [Math.sin, 1], SQRT: [v => Math.sqrt(Math.abs(v)), 1], TAN: [Math.tan, 1], TRUNC: [Math.trunc, 0] };
  /* the instructions of the app that structured text has (RM018A, Available Languages): the FBD timers and counter,
     and the ladder instructions that also exist in ST, with the same operands */
  const FBD = K.FBDT;
  const STI = new Set(['JSR', 'RET', 'SBR', 'TND', 'COP', 'CPS', 'GSV', 'SSV', 'PID', 'SIZE', 'SWPB']);
  // what to use in ST for a ladder-only instruction (RM018A: "This instruction is not available in structured text")
  const HINT = { ADD: "the + operator", SUB: "the - operator", MUL: "the * operator", DIV: "the / operator", MOD: "the MOD operator", NEG: "the - operator",
    AND: "the AND operator", OR: "the OR operator", XOR: "the XOR operator", NOT: "the NOT operator", MOV: "an assignment (:=)", CPT: "an assignment (:=)", CLR: "an assignment (:= 0)",
    EQU: "the = operator", NEQ: "the <> operator", LES: "the < operator", LEQ: "the <= operator", GRT: "the > operator", GEQ: "the >= operator", CMP: "an IF with an expression",
    SQR: "the SQRT function", ABS: "the ABS function", TON: "TONR", TOF: "TOFR", RTO: "RTOR", CTU: "CTUD", CTD: "CTUD", RES: "the Reset input of TONR, TOFR, RTOR or CTUD",
    SIN: 'the SIN function', COS: 'the COS function', TAN: 'the TAN function', ASN: 'the ASIN function', ACS: 'the ACOS function', ATN: 'the ATAN function', LN: 'the LN function', LOG: 'the LOG function',
    DEG: 'the DEG function', RAD: 'the RAD function', TRN: 'the TRUNC function', XPY: 'the ** operator', XIC: 'an IF', XIO: 'an IF NOT', OTE: 'an assignment (:=)', OTL: 'an assignment (:= 1)', OTU: 'an assignment (:= 0)' };

  /* text → tokens { k: id | num | str | op, s, u, ln, col, a, b } and comments { ln, col, a, b }; errors { ln, col, msg } */
  const RX = { id: /[A-Za-z_][A-Za-z0-9_]*(?::(?!=)[A-Za-z0-9_]+)*/y, num: /(?:2|8|16)#[0-9A-Fa-f_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?/y,
    nr: /\[[ \t]*:=[ \t]*\]/y, op: /\*\*|<>|<=|>=|\.\.|:=|[-+*/()[\],;:=<>&.]/y };
  function lex(src) {
    const s = String(src == null ? '' : src), toks = [], cms = [], errs = [];
    let i = 0, ln = 1, ls = 0;
    const at = (re) => { re.lastIndex = i; const m = re.exec(s); return m && m.index === i ? m[0] : null; };
    while (i < s.length) {
      const c = s[i];
      if (c === '\n') { i++; ln++; ls = i; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }
      const col = i - ls + 1, a = i, line = ln;
      if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; cms.push({ ln: line, col, a, b: i }); continue; }
      if ((c === '(' || c === '/') && s[i + 1] === '*') {
        const end = c === '(' ? '*)' : '*/', j = s.indexOf(end, i + 2), stop = j < 0 ? s.length : j + 2;
        for (let k = i; k < stop; k++) if (s[k] === '\n') { ln++; ls = k + 1; }
        cms.push({ ln: line, col, a, b: stop });
        if (j < 0) errs.push({ ln: line, col, msg: `The comment is not closed: ${end} is missing` });
        i = stop; continue;
      }
      if (c === "'") {
        // a string literal: $$ $' $L $N $P $R $T and $hh (PM007, Character string literals)
        let j = i + 1, v = [], ok = false;
        while (j < s.length && s[j] !== '\n') {
          if (s[j] === "'") { ok = true; j++; break; }
          if (s[j] === '$' && j + 1 < s.length) {
            const d = s[j + 1], e = { L: 10, l: 10, N: 10, n: 10, P: 12, p: 12, R: 13, r: 13, T: 9, t: 9, $: 36, "'": 39 }[d];
            if (e != null) { v.push(e); j += 2; continue; }
            if (/^[0-9A-Fa-f]{2}$/.test(s.substr(j + 1, 2))) { v.push(parseInt(s.substr(j + 1, 2), 16)); j += 3; continue; }
          }
          v.push(s.charCodeAt(j) & 255); j++;
        }
        if (!ok) errs.push({ ln: line, col, msg: "The string is not closed: ' is missing" });
        toks.push({ k: 'str', s: s.slice(i, j), u: '', v, ln: line, col, a, b: j });
        i = j; continue;
      }
      let m, k;
      if (/[A-Za-z_]/.test(c)) { m = at(RX.id); k = 'id'; }
      else if (/\d/.test(c)) { m = at(RX.num); k = 'num'; }
      else if (c === '[' && (m = at(RX.nr))) k = 'op';
      else { m = at(RX.op); k = 'op'; }
      if (!m) { errs.push({ ln: line, col, msg: `Unexpected character '${c}'` }); i++; continue; }
      toks.push({ k, s: k === 'op' && m[0] === '[' && m.length > 1 ? '[:=]' : m, u: U(m), ln: line, col, a, b: i + m.length });
      i += m.length;
    }
    return { toks, cms, errs, lines: ln };
  }

  class Syn { constructor(tok, msg) { this.tok = tok; this.msg = msg; } }
  const X = { g: () => 0, t: 'x' };   // the node of an expression with an error (already reported)
  let DZ = false;                      // a division by zero while an expression was evaluated
  const i32 = v => Math.trunc(v) | 0;
  const isStrType = (M, type) => { const d = M.types.get(U(type)); return !!d && d.kind === 'string'; };
  const tcode = (M, r) => (r.dim ? 'a' : r.type === 'BOOL' ? 'b' : K.isInt(r.type) ? 'i' : K.isReal(r.type) ? 'r' : isStrType(M, r.type) ? 's' : 'o');
  const strOf = o => { const n = Math.max(0, Math.min(o.LEN | 0, o.DATA.length)), v = new Array(n); for (let k = 0; k < n; k++) v[k] = o.DATA[k] & 255; return v; };
  const cmpStr = (a, b) => { const n = Math.min(a.length, b.length); for (let k = 0; k < n; k++) if (a[k] !== b[k]) return a[k] - b[k]; return a.length - b.length; };

  /* compile the routine R (R.st, the text) of program P in the model M; say(kind, line, column, msg) reports.
     → { run(c), pre(c) } */
  function compile(M, P, R, say) {
    const L = lex(R.st), T = L.toks, nr = [], pre = [];
    let p = 0, loops = 0;
    const err = (t, msg) => { say('Error', t ? t.ln : L.lines, t ? t.col : 0, msg); };
    L.errs.forEach(e => say('Error', e.ln, e.col, e.msg));
    const end = { k: 'eof', s: 'the end of the routine', u: '', ln: T.length ? T[T.length - 1].ln : 1, col: T.length ? T[T.length - 1].col : 1 };
    const peek = (n = 0) => T[p + n] || end;
    const next = () => T[p++] || end;
    const isOp = (s, n = 0) => { const t = peek(n); return t.k === 'op' && t.s === s; };
    const isKw = (u, n = 0) => { const t = peek(n); return t.k === 'id' && t.u === u; };
    const want = (s, what) => { const t = next(); if (!(t.k === 'op' && t.s === s) && !(t.k === 'id' && t.u === s)) throw new Syn(t, `'${s}' expected${what ? ' ' + what : ''}, not '${t.s}'`); return t; };
    // a missing ';' is reported just after the token before it, and the next statement is read from where it stands
    const semi = after => {
      if (isOp(';')) return next();
      const b = T[p - 1] || end, e = new Syn({ ln: b.ln, col: b.col + String(b.s).length }, `';' expected${after ? ' after ' + after : ''}`);
      e.soft = true; throw e;
    };

    /* ---------- expressions (PM007, Determine the order of execution) ---------- */
    const node = (g, t, c) => ({ g, t, c });
    const numT = n => n.t === 'b' || n.t === 'i' || n.t === 'r';
    function path() {
      // a tag, with members, bits and subscripts: Tank[i + 1].Level, Local:1:I.Data.3
      const t0 = next();
      let text = t0.s;
      const subs = [];
      for (;;) {
        if (isOp('.')) {
          const d = peek(1);
          if ((d.k === 'id' && !KWS.has(d.u)) || (d.k === 'num' && /^\d+$/.test(d.s))) { p += 2; text += '.' + d.s; continue; }
          throw new Syn(d, `A member name or a bit number is expected after '.'`);
        }
        if (isOp('[')) {
          const tb = next(), grp = [];
          do grp.push({ e: expr() }); while (isOp(',') && next());
          want(']', 'to close the subscript');
          text += '[' + grp.map(x => (x.e.c != null && x.e.t === 'i' ? String(x.e.c) : '0')).join(',') + ']';
          subs.push({ grp, t: tb });
          continue;
        }
        break;
      }
      const r = K.ref(M, P, text);
      if (typeof r === 'string') { err(t0, r.split(`'${text}'`).join(`'${String(R.st).slice(t0.a, T[p - 1].b)}'`)); return null; }
      // the subscripts that are not constants: patched into the array steps (the last ones, in order)
      if (subs.some(sb => sb.grp.some(x => x.e.c == null || x.e.t !== 'i'))) {
        const arr = r.steps.filter(st => st.len), base = arr.length - subs.length;
        subs.forEach((sb, j) => sb.grp.forEach((x, n) => {
          if (x.e.c != null && x.e.t === 'i') return;
          if (x.e.t !== 'i' && x.e.t !== 'x') { err(sb.t, 'Array subscript must be an integer expression'); return; }
          const st = arr[base + j], g = x.e.g, ix = { get: () => i32(g()) };
          if (!st) return;
          if (st.ixs) st.ixs[n] = ix; else st.ix = ix;
        }));
        r.norm = null;
      }
      r.tok = t0;
      return r;
    }
    function primary() {
      const t = peek();
      if (t.k === 'num') {
        next();
        const c = K.parseNumber(/#/.test(t.s) ? t.s : t.s.replace(/_/g, ''));
        if (!c) { err(t, `Invalid number '${t.s}'`); return X; }
        const v = c.v;
        return node(() => v, c.real ? 'r' : 'i', v);
      }
      if (t.k === 'str') { next(); const v = t.v; return { g: () => 0, gs: () => v, t: 's' }; }
      if (isOp('(')) { next(); const n = expr(); want(')'); return n; }
      if (t.k === 'id' && !KWS.has(t.u)) {
        if (isOp('(', 1)) {
          next(); next();
          const f = FN[t.u], args = [];
          if (!f) {
            // not a function: its operands are skipped
            for (let dep = 1; peek().k !== 'eof'; p++) { if (isOp('(')) dep++; else if (isOp(')') && --dep === 0) break; }
            want(')', `to close ${t.s}(`);
            err(t, K.INSTR[t.u] || FBD[t.u] ? `${t.s} is an instruction: an instruction is a statement of its own, it cannot be used in an expression` : `Undefined function '${t.s}'`); return X;
          }
          if (!isOp(')')) do args.push(expr()); while (isOp(',') && next());
          want(')', `to close ${t.s}(`);
          if (args.length !== 1) { err(t, `${t.u} takes one operand`); return X; }
          const a = args[0];
          if (a.t === 'x') return X;
          if (!numT(a)) { err(t, `${t.u}: the operand must be a number`); return X; }
          const fn = f[0], g = a.g;
          return node(() => fn(g()), f[1] || a.t === 'r' ? 'r' : 'i');
        }
        const r = path();
        if (!r) return X;
        const tc = tcode(M, r);
        if (tc === 'a' || tc === 'o') { err(t, `'${t.s}' is ${tc === 'a' ? 'an array: give a subscript' : 'a structure: give a member'}`); return X; }
        if (tc === 's') return { g: () => 0, gs: () => strOf(r.obj()), t: 's' };
        return node(() => r.get(), tc);
      }
      throw new Syn(t, t.k === 'eof' ? 'The expression ends too early' : `Unexpected '${t.s}' in the expression`);
    }
    function power() {
      let a = primary();
      while (isOp('**')) {
        const t = next(), m = isOp('-') && next(), b0 = primary(), b = m && b0.t !== 'x' ? node((g => () => -g())(b0.g), b0.t) : b0;
        if (a.t === 'x' || b.t === 'x') { a = X; continue; }
        if (!numT(a) || !numT(b)) { err(t, "Invalid data type for '**': numbers are expected"); a = X; continue; }
        const A = a.g, B = b.g, real = a.t === 'r' || b.t === 'r';
        a = node(real ? () => Math.pow(A(), B()) : () => Math.trunc(Math.pow(A(), B())), real ? 'r' : 'i');
      }
      return a;
    }
    function neg() {
      if (isOp('-')) {
        const t = next(), a = neg();
        if (a.t === 'x') return X;
        if (!numT(a)) { err(t, "Invalid data type for '-': a number is expected"); return X; }
        const A = a.g;
        return node(() => -A(), a.t === 'r' ? 'r' : 'i', a.c != null ? -a.c : undefined);
      }
      if (isOp('+')) { next(); return neg(); }
      return power();
    }
    function not() {
      if (!isKw('NOT')) return neg();
      const t = next(), a = not();
      if (a.t === 'x') return X;
      const A = a.g;
      if (a.t === 'b') return node(() => (A() ? 0 : 1), 'b');
      if (a.t === 'i') return node(() => ~i32(A()), 'i');
      err(t, 'NOT needs a BOOL or an integer operand'); return X;
    }
    function bin(t, op, a, b) {
      if (a.t === 'x' || b.t === 'x') return X;
      const A = a.g, B = b.g;
      if (op === '=' || op === '<>' || op === '<' || op === '<=' || op === '>' || op === '>=') {
        if (a.t === 's' && b.t === 's') {
          const S1 = a.gs, S2 = b.gs, f = { '=': d => d === 0, '<>': d => d !== 0, '<': d => d < 0, '<=': d => d <= 0, '>': d => d > 0, '>=': d => d >= 0 }[op];
          return node(() => (f(cmpStr(S1(), S2())) ? 1 : 0), 'b');
        }
        if (!numT(a) || !numT(b)) { err(t, `Invalid data type for '${op}': two numbers or two strings are compared`); return X; }
        const f = { '=': (x, y) => x === y, '<>': (x, y) => x !== y, '<': (x, y) => x < y, '<=': (x, y) => x <= y, '>': (x, y) => x > y, '>=': (x, y) => x >= y }[op];
        return node(() => (f(A(), B()) ? 1 : 0), 'b');
      }
      if (op === 'AND' || op === 'OR' || op === 'XOR') {
        if (a.t === 'b' && b.t === 'b') return node(op === 'AND' ? () => (A() && B() ? 1 : 0) : op === 'OR' ? () => (A() || B() ? 1 : 0) : () => ((A() ? 1 : 0) ^ (B() ? 1 : 0)), 'b');
        if ((a.t === 'b' || a.t === 'i') && (b.t === 'b' || b.t === 'i')) return node(op === 'AND' ? () => i32(A()) & i32(B()) : op === 'OR' ? () => i32(A()) | i32(B()) : () => i32(A()) ^ i32(B()), 'i');
        err(t, `Invalid data type for '${op}': BOOL (logical) or integer (bitwise) operands are expected`); return X;
      }
      if (!numT(a) || !numT(b)) { err(t, `Invalid data type for '${op}': numbers are expected`); return X; }
      const real = a.t === 'r' || b.t === 'r', ty = real ? 'r' : 'i';
      switch (op) {
        case '+': return node(() => A() + B(), ty, a.c != null && b.c != null ? a.c + b.c : undefined);
        case '-': return node(() => A() - B(), ty, a.c != null && b.c != null ? a.c - b.c : undefined);
        case '*': return node(() => A() * B(), ty, a.c != null && b.c != null ? a.c * b.c : undefined);
        // integers: / truncates and MOD keeps the sign of the dividend, as in the controller; / 0 gives 0 and S:V
        case '/': return real ? node(() => { const y = B(); if (y === 0) DZ = true; return A() / y; }, ty) : node(() => { const y = B(); if (y === 0) { DZ = true; return 0; } return Math.trunc(A() / y); }, ty);
        default: return node(() => { const x = A(), y = B(); if (y === 0) { DZ = true; return 0; } return real ? x - y * Math.trunc(x / y) : x % y; }, ty);
      }
    }
    // the binary levels, lowest first: OR, XOR, & / AND, = <>, < <= > >=, + -, * / MOD (then NOT, negate, **, functions)
    const LV = [['OR'], ['XOR'], ['&', 'AND'], ['=', '<>'], ['<', '<=', '>', '>='], ['+', '-'], ['*', '/', 'MOD']];
    function level(n) {
      if (n === LV.length) return not();
      let a = level(n + 1);
      for (;;) {
        const t = peek(), o = t.k === 'op' ? t.s : t.k === 'id' ? t.u : '';
        if (!LV[n].includes(o)) return a;
        next();
        a = bin(t, o === '&' ? 'AND' : o, a, level(n + 1));
      }
    }
    const expr = () => level(0);
    // a condition: a BOOL expression (PM007: IF, WHILE, UNTIL)
    function cond(stop) {
      const t = peek();
      try {
        const n = expr();
        if (n.t !== 'b' && n.t !== 'x') err(t, 'A BOOL expression is expected (a BOOL tag, a comparison or a logical operation)');
        const g = n.g;
        return () => g() !== 0;
      } catch (e) {
        if (!(e instanceof Syn)) throw e;
        err(e.tok, e.msg);
        while (peek().k !== 'eof' && !isKw(stop) && !isOp(';')) p++;
        return () => false;
      }
    }

    /* ---------- statements ---------- */
    function block(stops, caseSel) {
      const list = [];
      for (;;) {
        const t = peek();
        if (t.k === 'eof' || (t.k === 'id' && stops.includes(t.u)) || (caseSel && isSel())) return list;
        const p0 = p;
        try { const f = stmt(); if (f) list.push(f); } catch (e) {
          if (!(e instanceof Syn)) throw e;
          err(e.tok, e.msg);
          if (e.soft && p > p0) continue;
          if (p === p0) p++;
          while (peek().k !== 'eof' && !isOp(';') && !(peek().k === 'id' && stops.includes(peek().u))) p++;
          if (isOp(';')) p++;
        }
      }
    }
    // each statement: a fault in it goes to the fault routine; when that clears it, the next statement runs (PM014)
    const wrap = f => c => {
      try { const r = f(c); return r || (c.ret || c.tnd ? 2 : 0); } catch (e) {
        if (e instanceof K.Fault && c.recover && c.recover(e)) return c.ret || c.tnd ? 2 : 0;
        throw e;
      }
    };
    // 0: go on, 1: EXIT, 2: leave the routine (RET, TND)
    const runList = (c, list) => { for (let k = 0; k < list.length; k++) { const r = list[k](c); if (r) return r; } return 0; };
    /* a loop that runs too long: the task watchdog (major fault 6/1, PM007 FOR_DO / WHILE_DO / REPEAT_UNTIL) */
    const guard = (c, t0) => { if (c.wdCheck) c.wdCheck(); if (Date.now() - t0 > 5000) { const f = new K.Fault(6, 1, `Task watchdog expired: a loop of routine '${R.name}' ran too long`); f.tried = true; throw f; } };
    function isSel() {
      // a CASE selector: value, value1..valueN, a list of them, then ':'
      let k = 0;
      for (;;) {
        if (isOp('-', k)) k++;
        if (peek(k).k !== 'num') return false;
        k++;
        if (isOp('..', k)) { k++; if (isOp('-', k)) k++; if (peek(k).k !== 'num') return false; k++; }
        if (isOp(':', k)) return true;
        if (!isOp(',', k)) return false;
        k++;
      }
    }
    function selVal() {
      const m = isOp('-') && next(), t = next(), c = K.parseNumber(t.s);
      if (!c) { err(t, `Invalid selector '${t.s}'`); return 0; }
      return m ? -c.v : c.v;
    }
    function stmt() {
      const t = peek();
      if (isOp(';')) { next(); return null; }
      if (t.k !== 'id') throw new Syn(t, `Unexpected '${t.s}': a statement starts with a tag, an instruction or a construct`);
      switch (t.u) {
        case 'IF': {
          next();
          const cs = [cond('THEN')]; want('THEN', 'after the IF condition');
          const bs = [block(['ELSIF', 'ELSE', 'END_IF'])];
          let els = null;
          while (isKw('ELSIF')) { next(); cs.push(cond('THEN')); want('THEN', 'after the ELSIF condition'); bs.push(block(['ELSIF', 'ELSE', 'END_IF'])); }
          if (isKw('ELSE')) { next(); els = block(['END_IF']); }
          if (!isKw('END_IF')) throw new Syn(t, 'END_IF is missing for this IF');
          next(); semi('END_IF');
          return wrap(c => { for (let k = 0; k < cs.length; k++) if (cs[k]()) return runList(c, bs[k]); return els ? runList(c, els) : 0; });
        }
        case 'CASE': {
          next();
          const t1 = peek();
          let sel = X;
          try { sel = expr(); } catch (e) { if (!(e instanceof Syn)) throw e; err(e.tok, e.msg); while (peek().k !== 'eof' && !isKw('OF')) p++; }
          if (sel.t !== 'x' && sel.t !== 'i' && sel.t !== 'r') err(t1, 'CASE needs a numeric expression (SINT, INT, DINT or REAL)');
          want('OF', 'after the CASE expression');
          const arms = [];
          let els = null;
          while (isSel()) {
            const vs = [];
            do { const lo = selVal(); let hi = lo; if (isOp('..')) { next(); hi = selVal(); } vs.push([Math.min(lo, hi), Math.max(lo, hi)]); } while (isOp(',') && next());
            want(':');
            arms.push({ vs, body: block(['ELSE', 'END_CASE'], true) });
          }
          if (isKw('ELSE')) { next(); els = block(['END_CASE']); }
          if (!isKw('END_CASE')) throw new Syn(peek(), peek().k === 'eof' ? 'END_CASE is missing for this CASE' : `A selector (value: or value1..value2:), ELSE or END_CASE is expected, not '${peek().s}'`);
          next(); semi('END_CASE');
          const g = sel.g;
          // the statements of the first selector that matches, then END_CASE (PM007, CASE_OF)
          return wrap(c => { const v = g(); for (const a of arms) if (a.vs.some(([lo, hi]) => v >= lo && v <= hi)) return runList(c, a.body); return els ? runList(c, els) : 0; });
        }
        case 'FOR': {
          next();
          const tv = peek();
          if (tv.k !== 'id' || KWS.has(tv.u)) throw new Syn(tv, 'FOR needs a count tag: FOR count := initial TO final BY increment DO');
          const cnt = path();
          if (cnt && (!K.isInt(cnt.type) || cnt.dim || cnt.bit >= 0)) err(tv, 'The FOR count must be a SINT, INT or DINT tag');
          if (cnt && (cnt.ro || cnt.konst)) err(tv, cnt.ro ? 'Tag is read-only' : `Tag '${cnt.konst}' is a constant: logic cannot write to it`);
          want(':=', 'after the FOR count');
          const num = what => { const t2 = peek(), n = expr(); if (n.t !== 'x' && n.t !== 'i' && n.t !== 'b') err(t2, `The ${what} value of FOR must be an integer`); return n.g; };
          const ini = num('initial'); want('TO');
          const fin = num('final');
          const by = isKw('BY') && next() ? num('increment') : null;
          want('DO', 'after FOR … TO …');
          loops++; const body = block(['END_FOR']); loops--;
          if (!isKw('END_FOR')) throw new Syn(t, 'END_FOR is missing for this FOR');
          next(); semi('END_FOR');
          if (!cnt) return null;
          // the count starts at initial; while it has not passed final the statements run, then count := count + increment
          return wrap(c => {
            const t0 = Date.now();
            cnt.set(ini());
            for (let n = 1; ; n++) {
              const f = fin(), st = by ? by() : 1, v = cnt.get();
              if (st >= 0 ? v > f : v < f) return 0;
              const r = runList(c, body);
              if (r === 1) return 0;
              if (r === 2) return 2;
              cnt.set(cnt.get() + st);
              if ((n & 255) === 0) guard(c, t0);
            }
          });
        }
        case 'WHILE': {
          next();
          const cd = cond('DO'); want('DO', 'after the WHILE condition');
          loops++; const body = block(['END_WHILE']); loops--;
          if (!isKw('END_WHILE')) throw new Syn(t, 'END_WHILE is missing for this WHILE');
          next(); semi('END_WHILE');
          return wrap(c => { const t0 = Date.now(); for (let n = 1; cd(); n++) { const r = runList(c, body); if (r === 1) return 0; if (r === 2) return 2; if ((n & 255) === 0) guard(c, t0); } return 0; });
        }
        case 'REPEAT': {
          next();
          loops++; const body = block(['UNTIL', 'END_REPEAT']); loops--;
          if (!isKw('UNTIL')) throw new Syn(t, 'UNTIL is missing for this REPEAT');
          next();
          const cd = cond('END_REPEAT');
          if (!isKw('END_REPEAT')) throw new Syn(peek(), `END_REPEAT is expected after the UNTIL condition, not '${peek().s}'`);
          next(); semi('END_REPEAT');
          // the statements run at least once, then again while the condition is false
          return wrap(c => { const t0 = Date.now(); for (let n = 1; ; n++) { const r = runList(c, body); if (r === 1) return 0; if (r === 2) return 2; if (cd()) return 0; if ((n & 255) === 0) guard(c, t0); } });
        }
        case 'EXIT': next(); if (!loops) err(t, 'EXIT can be used only in a FOR, WHILE or REPEAT loop'); semi('EXIT'); return () => 1;
        case 'GOTO': throw new Syn(t, 'GOTO is a reserved word: it is not available in structured text');
      }
      if (KWS.has(t.u)) throw new Syn(t, `Unexpected '${t.s}'`);
      if (isOp('(', 1)) return call();
      return assign();
    }
    function assign() {
      const t0 = peek(), d = path(), op = next();
      if (!(op.k === 'op' && (op.s === ':=' || op.s === '[:=]'))) throw new Syn(op, op.k === 'op' && op.s === '=' ? "Use := to assign a value ('=' compares)" : `':=' expected after '${t0.s}', not '${op.s}'`);
      const te = peek(), e = expr();
      semi();
      if (!d || e.t === 'x') return null;
      const tc = tcode(M, d);
      if (tc === 'a' || tc === 'o') { err(t0, `'${t0.s}' is ${tc === 'a' ? 'an array' : 'a structure'}: assign a BOOL, SINT, INT, DINT, REAL or string tag (or a member or element)`); return null; }
      if (d.ro) { err(t0, 'Tag is read-only'); return null; }
      if (d.konst) { err(t0, `Tag '${d.konst}' is a constant: logic cannot write to it`); return null; }
      if ((tc === 's') !== (e.t === 's')) { err(te, tc === 's' ? 'A string tag takes a string expression (a string tag or a literal)' : 'A string cannot be assigned to a number'); return null; }
      if (op.s === '[:=]') nr.push(d);
      if (tc === 's') {
        const S = e.gs;
        return wrap(() => { const v = S(), o = d.obj(), n = Math.min(v.length, o.DATA.length); for (let k = 0; k < o.DATA.length; k++) o.DATA[k] = k < n ? (v[k] > 127 ? v[k] - 256 : v[k]) : 0; o.LEN = n; });
      }
      const g = e.g;
      if (tc === 'b') return wrap(() => { d.set(g() ? 1 : 0); });
      // a number: stored in the type of the tag (integers wrap, REAL to an integer rounds); the math status flags follow
      return wrap(c => { DZ = false; const v = g(); if (c.put) c.put(d, v, DZ || !isFinite(v)); else d.set(v); });
    }
    function call() {
      const t = next(); next();
      const args = [];
      if (!isOp(')')) for (;;) {
        const a0 = p;
        let dep = 0;
        while (peek().k !== 'eof' && !(dep === 0 && (isOp(',') || isOp(')')))) { if (isOp('(') || isOp('[')) dep++; else if (isOp(')') || isOp(']')) dep--; p++; }
        args.push({ t: T[a0] || peek(), text: T.slice(a0, p).map(x => x.s).join('') });
        if (isOp(',')) { next(); continue; }
        break;
      }
      want(')', `to close ${t.s}(`); semi(`${t.s}(…)`);
      const u = t.u;
      if (FN[u]) { err(t, `${u} is a function: use it in an expression, e.g. Result := ${u}(Value);`); return null; }
      if (args.some(a => !a.text)) { err(t, 'Missing operand'); return null; }
      if (FBD[u]) {
        if (args.length !== 1) { err(t, `${u} takes one operand: ${u}(${u}_tag);`); return null; }
        const r = K.ref(M, P, args[0].text);
        if (typeof r === 'string') { err(args[0].t, r); return null; }
        if (r.type !== FBD[u] || r.dim) { err(args[0].t, `${u} needs a ${FBD[u]} tag`); return null; }
        if (r.ro || r.konst) { err(args[0].t, `Tag '${r.konst || args[0].text}' is a constant: logic cannot write to it`); return null; }
        const fi = K.FBDI[u];
        pre.push(() => K.fbdPrescan(u, r.obj()));
        return wrap(c => { fi(c, r.obj()); });
      }
      if (STI.has(u)) {
        // JSR(RoutineName, InputCount, …), SBR(…), RET(…): this app has no input / return parameters
        if (u === 'JSR' && args.length > 2) { err(args[2].t, 'Input and return parameters are not available: use JSR(Routine) or JSR(Routine, 0)'); return null; }
        if ((u === 'SBR' || u === 'RET') && args.length) { err(args[0].t, `Parameters are not available: use ${u}();`); return null; }
        const e = { t: u, a: args.map(a => a.text) };
        let bad = false;
        const x = K.compileElem(M, P, { labels: new Map(), name: R.name }, e, t.ln, false, (msg, mn, op) => { bad = true; err(op != null && args[op] ? args[op].t : t, `${u}${op != null ? ', Operand ' + op : ''}: ${msg}`); }, (msg, mn, op) => say('Warning', t.ln, t.col, `${u}: ${msg}`), []);
        if (!x || bad) return null;
        if (K.XPRE[u]) pre.push(c => K.XPRE[u].call(c, x.x, x));
        return wrap(c => { c.el(x, true); });
      }
      if (K.INSTR[u]) { err(t, `${u} is not available in structured text${HINT[u] ? ': use ' + HINT[u] : ''}`); return null; }
      err(t, `Undefined instruction '${t.s}'`);
      return null;
    }

    const body = block([]);
    const run = c => { runList(c, body); };
    return {
      run,
      // prescan (Program → Run): the tags of the non-retentive assignments [:=] are cleared, the instructions prescanned
      pre: c => {
        for (const d of nr) try { const tc = tcode(M, d); if (tc === 's') { const o = d.obj(); o.LEN = 0; o.DATA.fill(0); } else d.set(0); } catch (e) { if (!(e instanceof K.Fault)) throw e; }
        for (const f of pre) try { f(c); } catch (e) { if (!(e instanceof K.Fault)) throw e; }
      },
    };
  }

  /* the tags in the text (for the monitor): { a, b, ln, text } from a tag name to its last member / subscript */
  function paths(src) {
    const { toks } = lex(src), out = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.k !== 'id' || KWS.has(t.u) || (toks[i + 1] && toks[i + 1].s === '(')) continue;
      if (i > 0 && toks[i - 1].s === '.') continue;
      let j = i + 1, text = t.s;
      for (;;) {
        const d = toks[j];
        if (d && d.s === '.' && toks[j + 1] && (toks[j + 1].k === 'id' || toks[j + 1].k === 'num')) { text += '.' + toks[j + 1].s; j += 2; continue; }
        if (d && d.s === '[') {
          let dep = 0, k = j;
          for (; k < toks.length; k++) { if (toks[k].s === '[') dep++; else if (toks[k].s === ']' && --dep === 0) break; }
          if (k >= toks.length) break;
          text += toks.slice(j, k + 1).map(x => x.s).join('');
          j = k + 1; continue;
        }
        break;
      }
      out.push({ a: t.a, b: toks[j - 1].b, ln: t.ln, text });
      i = j - 1;
    }
    return out;
  }

  const ST = E.ST = { compile, lex, paths, KW, FN: Object.keys(FN), INSTR: Object.keys(FBD).concat([...STI]) };
  void ST;
})(typeof window !== 'undefined' ? window : globalThis);
