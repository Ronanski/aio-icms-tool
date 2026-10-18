/* PLC core: Allen-Bradley SLC 500 / MicroLogix style data table, addressing,
   instruction set and scan engine. */
(function () {
  'use strict';

  const SIZES = { I: 2, O: 2, S: 4, B3: 32, N7: 32, T4: 32, C5: 32 };
  const TBITS = ['EN', 'TT', 'DN'], TWORDS = ['PRE', 'ACC'];
  const CBITS = ['CU', 'CD', 'DN', 'OV', 'UN'], CWORDS = ['PRE', 'ACC'];
  const NUM_IN = 12, NUM_OUT = 8;

  /* ---------- Instruction set ---------- */
  const A = (n, ty, d) => ({ n, ty, d });
  const INSTR = {
    XIC: { k: 'contact', name: 'Examine If Closed', grp: 'Bit', args: [A('Address', 'bit', 'I:0/0')], help: 'True when the bit is 1 (ON).' },
    XIO: { k: 'contact', name: 'Examine If Open', grp: 'Bit', args: [A('Address', 'bit', 'I:0/0')], help: 'True when the bit is 0 (OFF).' },
    ONS: { k: 'contact', name: 'One Shot', grp: 'Bit', args: [A('Storage Bit', 'bit', 'B3:1/0')], help: 'Passes power for one scan on a false-to-true transition.' },
    OTE: { k: 'coil', out: true, name: 'Output Energize', grp: 'Bit', args: [A('Address', 'bit', 'O:0/0')], help: 'Bit follows rung condition.' },
    OTL: { k: 'coil', out: true, lbl: 'L', name: 'Output Latch', grp: 'Bit', args: [A('Address', 'bit', 'O:0/0')], help: 'Sets the bit when rung is true. Stays set.' },
    OTU: { k: 'coil', out: true, lbl: 'U', name: 'Output Unlatch', grp: 'Bit', args: [A('Address', 'bit', 'O:0/0')], help: 'Clears the bit when rung is true.' },
    TON: { k: 'box', out: true, name: 'Timer On Delay', grp: 'Timer/Counter', bits: ['EN', 'DN'], args: [A('Timer', 'timer', 'T4:0'), A('Time Base', 'base', '1.0'), A('Preset', 'int', '5'), A('Accum', 'int', '0')], help: 'Times while rung is true. DN after preset. Resets when rung goes false.' },
    TOF: { k: 'box', out: true, name: 'Timer Off Delay', grp: 'Timer/Counter', bits: ['EN', 'DN'], args: [A('Timer', 'timer', 'T4:0'), A('Time Base', 'base', '1.0'), A('Preset', 'int', '5'), A('Accum', 'int', '0')], help: 'DN is ON while rung true and stays ON for preset after rung goes false.' },
    RTO: { k: 'box', out: true, name: 'Retentive Timer On', grp: 'Timer/Counter', bits: ['EN', 'DN'], args: [A('Timer', 'timer', 'T4:0'), A('Time Base', 'base', '1.0'), A('Preset', 'int', '5'), A('Accum', 'int', '0')], help: 'Like TON but keeps its accumulated value. Use RES to reset.' },
    CTU: { k: 'box', out: true, name: 'Count Up', grp: 'Timer/Counter', bits: ['CU', 'DN'], args: [A('Counter', 'counter', 'C5:0'), A('Preset', 'int', '10'), A('Accum', 'int', '0')], help: 'Adds 1 on every false-to-true transition. DN when ACC ≥ PRE.' },
    CTD: { k: 'box', out: true, name: 'Count Down', grp: 'Timer/Counter', bits: ['CD', 'DN'], args: [A('Counter', 'counter', 'C5:0'), A('Preset', 'int', '10'), A('Accum', 'int', '0')], help: 'Subtracts 1 on every false-to-true transition.' },
    RES: { k: 'coil', out: true, lbl: 'RES', name: 'Reset', grp: 'Timer/Counter', args: [A('Structure', 'struct', 'T4:0')], help: 'Resets a timer or counter (ACC=0, status bits cleared).' },
    EQU: { k: 'box', name: 'Equal', grp: 'Compare', args: [A('Source A', 'src', 'N7:0'), A('Source B', 'src', '0')], help: 'True when A = B.' },
    NEQ: { k: 'box', name: 'Not Equal', grp: 'Compare', args: [A('Source A', 'src', 'N7:0'), A('Source B', 'src', '0')], help: 'True when A ≠ B.' },
    LES: { k: 'box', name: 'Less Than (A<B)', grp: 'Compare', args: [A('Source A', 'src', 'N7:0'), A('Source B', 'src', '0')], help: 'True when A < B.' },
    LEQ: { k: 'box', name: 'Less Than or Eql (A<=B)', grp: 'Compare', args: [A('Source A', 'src', 'N7:0'), A('Source B', 'src', '0')], help: 'True when A ≤ B.' },
    GRT: { k: 'box', name: 'Greater Than (A>B)', grp: 'Compare', args: [A('Source A', 'src', 'N7:0'), A('Source B', 'src', '0')], help: 'True when A > B.' },
    GEQ: { k: 'box', name: 'Grtr Than or Eql (A>=B)', grp: 'Compare', args: [A('Source A', 'src', 'N7:0'), A('Source B', 'src', '0')], help: 'True when A ≥ B.' },
    LIM: { k: 'box', name: 'Limit Test', grp: 'Compare', args: [A('Low Lim', 'src', '0'), A('Test', 'src', 'N7:0'), A('High Lim', 'src', '100')], help: 'True when Low ≤ Test ≤ High.' },
    MOV: { k: 'box', out: true, name: 'Move', grp: 'Math/Move', args: [A('Source', 'src', '0'), A('Dest', 'dest', 'N7:0')], help: 'Copies Source into Dest when rung is true.' },
    ADD: { k: 'box', out: true, name: 'Add', grp: 'Math/Move', args: [A('Source A', 'src', 'N7:0'), A('Source B', 'src', '1'), A('Dest', 'dest', 'N7:0')], help: 'Dest = A + B' },
    SUB: { k: 'box', out: true, name: 'Subtract', grp: 'Math/Move', args: [A('Source A', 'src', 'N7:0'), A('Source B', 'src', '1'), A('Dest', 'dest', 'N7:0')], help: 'Dest = A − B' },
    MUL: { k: 'box', out: true, name: 'Multiply', grp: 'Math/Move', args: [A('Source A', 'src', 'N7:0'), A('Source B', 'src', '2'), A('Dest', 'dest', 'N7:1')], help: 'Dest = A × B' },
    DIV: { k: 'box', out: true, name: 'Divide', grp: 'Math/Move', args: [A('Source A', 'src', 'N7:0'), A('Source B', 'src', '2'), A('Dest', 'dest', 'N7:1')], help: 'Dest = A ÷ B (rounded)' },
    CLR: { k: 'box', out: true, name: 'Clear', grp: 'Math/Move', args: [A('Dest', 'dest', 'N7:0')], help: 'Dest = 0' },
  };

  /* ---------- Addressing ---------- */
  const cache = new Map();
  function parse(raw) {
    if (raw == null) return null;
    const s = String(raw).trim().toUpperCase();
    if (!s) return null;
    if (cache.has(s)) return cache.get(s);
    const r = parse0(s);
    cache.set(s, r);
    return r;
  }
  function bitA(f, w, b) {
    if (w >= SIZES[f] || b > 15) return null;
    return { kind: 'bit', file: f, word: w, bit: b, norm: `${f === 'S' ? 'S' : f}:${w}/${b}` };
  }
  function wordA(f, w) {
    if (w >= SIZES[f]) return null;
    return { kind: 'word', file: f, word: w, norm: `${f}:${w}` };
  }
  function parse0(s) {
    let m;
    if (/^[-+]?\d+(\.\d+)?$/.test(s)) { const v = Number(s); return { kind: 'const', value: v, norm: String(v) }; }
    if ((m = s.match(/^([IO]):(\d+)\/(\d+)$/))) return bitA(m[1], +m[2], +m[3]);
    if ((m = s.match(/^([IO]):(\d+)$/))) return wordA(m[1], +m[2]);
    if ((m = s.match(/^B3?\/(\d+)$/))) { const n = +m[1]; return bitA('B3', Math.floor(n / 16), n % 16); }
    if ((m = s.match(/^(B3|N7):(\d+)\/(\d+)$/))) return bitA(m[1], +m[2], +m[3]);
    if ((m = s.match(/^(B3|N7):(\d+)$/))) return wordA(m[1], +m[2]);
    if ((m = s.match(/^S2?:(\d+)\/(\d+)$/))) return bitA('S', +m[1], +m[2]);
    if ((m = s.match(/^S2?:(\d+)$/))) return wordA('S', +m[1]);
    if ((m = s.match(/^(T4|C5):(\d+)[./]([A-Z]+)$/))) {
      const f = m[1], w = +m[2], sub = m[3];
      if (w >= SIZES[f]) return null;
      const bits = f === 'T4' ? TBITS : CBITS, words = f === 'T4' ? TWORDS : CWORDS;
      if (bits.includes(sub)) return { kind: 'bit', file: f, word: w, sub, norm: `${f}:${w}/${sub}` };
      if (words.includes(sub)) return { kind: 'word', file: f, word: w, sub, norm: `${f}:${w}.${sub}` };
      return null;
    }
    if ((m = s.match(/^(T4|C5):(\d+)$/))) {
      const w = +m[2];
      if (w >= SIZES[m[1]]) return null;
      return { kind: 'struct', file: m[1], word: w, norm: `${m[1]}:${w}` };
    }
    return null;
  }

  function validArg(ty, str) {
    const p = parse(str);
    switch (ty) {
      case 'bit': return p && p.kind === 'bit' ? null : 'Expected a bit address, e.g. I:0/0, O:0/1, B3:0/2, T4:0/DN';
      case 'timer': return p && p.kind === 'struct' && p.file === 'T4' ? null : 'Expected a timer, e.g. T4:0';
      case 'counter': return p && p.kind === 'struct' && p.file === 'C5' ? null : 'Expected a counter, e.g. C5:0';
      case 'struct': return p && p.kind === 'struct' ? null : 'Expected a timer or counter, e.g. T4:0 or C5:0';
      case 'base': return p && p.kind === 'const' && [1, 0.01, 0.001].includes(p.value) ? null : 'Time base must be 1.0, 0.01 or 0.001';
      case 'int': return p && p.kind === 'const' && Number.isInteger(p.value) && p.value >= -32768 && p.value <= 32767 ? null : 'Expected an integer (-32768…32767)';
      case 'src': return p && (p.kind === 'const' || p.kind === 'word') ? null : 'Expected a constant or word address (N7:0, T4:0.ACC, C5:1.PRE)';
      case 'dest': return p && p.kind === 'word' ? null : 'Expected a word address, e.g. N7:0';
    }
    return null;
  }

  const i16 = v => { v = Math.trunc(v); if (!isFinite(v)) return 0; return v > 32767 ? 32767 : v < -32768 ? -32768 : v; };
  const asI16 = x => (x << 16) >> 16;

  function makeData() {
    return {
      I: new Array(SIZES.I).fill(0), O: new Array(SIZES.O).fill(0), S: new Array(SIZES.S).fill(0),
      B3: new Array(SIZES.B3).fill(0), N7: new Array(SIZES.N7).fill(0),
      T4: Array.from({ length: SIZES.T4 }, () => ({ EN: 0, TT: 0, DN: 0, PRE: 0, ACC: 0, base: 1, _f: 0 })),
      C5: Array.from({ length: SIZES.C5 }, () => ({ CU: 0, CD: 0, DN: 0, OV: 0, UN: 0, PRE: 0, ACC: 0 })),
    };
  }

  /* ---------- Engine ---------- */
  class Engine {
    constructor() {
      this.data = makeData();
      this.mode = 'PROG';
      this.forces = {};          // norm -> 0/1
      this.forcesEnabled = true;
      this.rungs = [];
      this.physIn = 0;           // word from field wiring
      this.physOut = 0;          // word to output terminals
      this.powered = true;
      this.first = true;
      this.pw = Object.create(null);   // power-flow per segment key
      this.hl = Object.create(null);   // instruction highlight per id
      this.scanMs = 0;
      this.scans = 0;
      this._fm = { I: [0, 0], O: [0, 0] };  // force masks: [mask, values]
    }
    resetData() { this.data = makeData(); }

    getBit(a) {
      const d = this.data;
      if (!a) return 0;
      if (a.file === 'T4' || a.file === 'C5') return d[a.file][a.word][a.sub] ? 1 : 0;
      return (d[a.file][a.word] >> a.bit) & 1;
    }
    setBit(a, v) {
      if (!a) return;
      const d = this.data;
      if (a.file === 'T4' || a.file === 'C5') { d[a.file][a.word][a.sub] = v ? 1 : 0; return; }
      const x = d[a.file][a.word];
      d[a.file][a.word] = asI16(v ? (x | (1 << a.bit)) : (x & ~(1 << a.bit)));
    }
    getWord(a) {
      if (!a) return 0;
      if (a.kind === 'const') return a.value;
      const d = this.data;
      if (a.file === 'T4' || a.file === 'C5') return d[a.file][a.word][a.sub];
      return d[a.file][a.word];
    }
    setWord(a, v) {
      if (!a || a.kind !== 'word') return;
      const d = this.data;
      if (a.file === 'T4' || a.file === 'C5') { d[a.file][a.word][a.sub] = i16(v); return; }
      d[a.file][a.word] = i16(v);
    }
    /* string helpers used by HMI and data table */
    read(str) { const a = parse(str); if (!a) return 0; return a.kind === 'bit' ? this.getBit(a) : this.getWord(a); }
    write(str, v) {
      const a = parse(str); if (!a) return;
      if (a.kind === 'bit') this.setBit(a, v); else if (a.kind === 'word') this.setWord(a, v);
    }

    setMode(m) {
      if (m === this.mode) return;
      this.mode = m;
      if (m === 'RUN') {
        this.first = true;
        // non-retentive outputs are cleared on entering RUN
        this.data.O[0] = 0;
      } else {
        this.data.O[0] = 0;
        for (const k in this.pw) this.pw[k] = false;
      }
    }

    isForceable(a) { return a && a.kind === 'bit' && (a.file === 'I' || a.file === 'O'); }
    setForce(norm, val) {
      if (val === null || val === undefined) delete this.forces[norm]; else this.forces[norm] = val ? 1 : 0;
      this._fm = { I: [0, 0], O: [0, 0] };
      for (const k in this.forces) {
        const a = parse(k);
        if (!a || a.word !== 0) continue;
        const fm = this._fm[a.file];
        fm[0] |= 1 << a.bit;
        if (this.forces[k]) fm[1] |= 1 << a.bit;
      }
    }
    forceCount() { return Object.keys(this.forces).length; }
    applyForce(file, w) {
      if (!this.forcesEnabled) return w;
      const [m, v] = this._fm[file];
      return (w & ~m) | (v & m);
    }

    setProgram(rungs) {
      this.rungs = rungs;
      const prep = arr => arr.forEach(e => {
        if (e.t === 'BST') e.legs.forEach(prep);
        else e._p = (e.a || []).map(parse);
      });
      rungs.forEach(r => prep(r.elems));
    }
    /* write presets/time base (and optionally accum) of an instruction into the data table */
    applyInstr(e, withAcc) {
      const d = INSTR[e.t]; if (!d) return;
      const p0 = parse(e.a[0]);
      if (!p0 || p0.kind !== 'struct') return;
      const s = this.data[p0.file][p0.word];
      if (p0.file === 'T4' && ['TON', 'TOF', 'RTO'].includes(e.t)) {
        s.base = Number(e.a[1]) || 1; s.PRE = i16(Number(e.a[2]) || 0);
        if (withAcc) s.ACC = i16(Number(e.a[3]) || 0);
      } else if (p0.file === 'C5' && ['CTU', 'CTD'].includes(e.t)) {
        s.PRE = i16(Number(e.a[1]) || 0);
        if (withAcc) s.ACC = i16(Number(e.a[2]) || 0);
      }
    }
    applyAll(withAcc) {
      const walk = arr => arr.forEach(e => { if (e.t === 'BST') e.legs.forEach(walk); else this.applyInstr(e, withAcc); });
      this.rungs.forEach(r => walk(r.elems));
    }

    scan(dt) {
      const t0 = performance.now();
      const d = this.data;
      if (!this.powered) { this.physOut = 0; for (const k in this.pw) this.pw[k] = false; return; }
      d.I[0] = asI16(this.applyForce('I', this.physIn & 0xFFFF));
      this.dt = dt;
      if (this.mode === 'RUN') {
        if (this.first) d.S[1] |= 1 << 15; else d.S[1] &= ~(1 << 15);
        for (const r of this.rungs) { this.pw['r' + r.id] = true; this.seq(r.elems, true); }
        this.first = false;
        this.scans++;
      } else {
        for (const r of this.rungs) { this.pw['r' + r.id] = false; this.preview(r.elems); }
      }
      const outW = this.mode === 'RUN' ? (d.O[0] & 0xFFFF) : 0;
      this.physOut = this.applyForce('O', outW) & 0xFFFF;
      this.scanMs = performance.now() - t0;
    }

    preview(arr) {
      for (const e of arr) {
        this.pw['i' + e.id] = false; this.pw['o' + e.id] = false;
        if (e.t === 'BST') { e.legs.forEach(l => this.preview(l)); continue; }
        const a = e._p && e._p[0];
        if (!a || a.kind !== 'bit') { this.hl[e.id] = false; continue; }
        const v = this.getBit(a);
        this.hl[e.id] = e.t === 'XIO' ? !v : !!v;
      }
    }

    seq(arr, p) {
      for (const e of arr) {
        this.pw['i' + e.id] = p;
        p = this.el(e, p);
        this.pw['o' + e.id] = p;
      }
      return p;
    }

    el(e, p) {
      if (e.t === 'BST') {
        let out = false;
        for (const leg of e.legs) { if (this.seq(leg, p)) out = true; }
        return out;
      }
      const A = e._p || [];
      const hl = this.hl;
      switch (e.t) {
        case 'XIC': { const v = !!this.getBit(A[0]); hl[e.id] = v; return p && v; }
        case 'XIO': { const v = !this.getBit(A[0]); hl[e.id] = v; return p && v; }
        case 'ONS': { const st = this.getBit(A[0]); const out = p && !st; this.setBit(A[0], p); hl[e.id] = out; return out; }
        case 'OTE': this.setBit(A[0], p); hl[e.id] = p; return p;
        case 'OTL': if (p) this.setBit(A[0], 1); hl[e.id] = !!this.getBit(A[0]); return p;
        case 'OTU': if (p) this.setBit(A[0], 0); hl[e.id] = !!this.getBit(A[0]); return p;
        case 'TON': case 'TOF': case 'RTO': { this.timer(e.t, A[0], p); hl[e.id] = p; return p; }
        case 'CTU': case 'CTD': { this.counter(e.t, A[0], p); hl[e.id] = p; return p; }
        case 'RES': {
          hl[e.id] = p;
          if (p && A[0] && A[0].kind === 'struct') {
            const s = this.data[A[0].file][A[0].word];
            s.ACC = 0; s.DN = 0;
            if (A[0].file === 'T4') { s.EN = 0; s.TT = 0; s._f = 0; } else { s.CU = 0; s.CD = 0; s.OV = 0; s.UN = 0; }
          }
          return p;
        }
        case 'EQU': case 'NEQ': case 'LES': case 'LEQ': case 'GRT': case 'GEQ': {
          const a = this.getWord(A[0]), b = this.getWord(A[1]);
          const c = e.t === 'EQU' ? a === b : e.t === 'NEQ' ? a !== b : e.t === 'LES' ? a < b : e.t === 'LEQ' ? a <= b : e.t === 'GRT' ? a > b : a >= b;
          hl[e.id] = p && c; return p && c;
        }
        case 'LIM': {
          const lo = this.getWord(A[0]), t = this.getWord(A[1]), hi = this.getWord(A[2]);
          const c = lo <= hi ? (t >= lo && t <= hi) : (t >= lo || t <= hi);
          hl[e.id] = p && c; return p && c;
        }
        case 'MOV': if (p) this.setWord(A[1], this.getWord(A[0])); hl[e.id] = p; return p;
        case 'ADD': case 'SUB': case 'MUL': case 'DIV': {
          if (p) {
            const a = this.getWord(A[0]), b = this.getWord(A[1]);
            let r = e.t === 'ADD' ? a + b : e.t === 'SUB' ? a - b : e.t === 'MUL' ? a * b : (b === 0 ? 32767 : Math.round(a / b));
            this.setWord(A[2], r);
          }
          hl[e.id] = p; return p;
        }
        case 'CLR': if (p) this.setWord(A[0], 0); hl[e.id] = p; return p;
      }
      return p;
    }

    timer(t, a, p) {
      if (!a || a.kind !== 'struct' || a.file !== 'T4') return;
      const s = this.data.T4[a.word];
      const acc = () => {
        if (s.ACC >= s.PRE) return;
        s._f += this.dt / (s.base || 1);
        const inc = Math.floor(s._f);
        if (inc > 0) { s._f -= inc; s.ACC = Math.min(s.PRE, s.ACC + inc); }
      };
      if (t === 'TON') {
        if (p) { s.EN = 1; acc(); s.DN = s.ACC >= s.PRE ? 1 : 0; s.TT = s.DN ? 0 : 1; }
        else { s.EN = 0; s.TT = 0; s.DN = 0; s.ACC = 0; s._f = 0; }
      } else if (t === 'TOF') {
        if (p) { s.EN = 1; s.DN = 1; s.TT = 0; s.ACC = 0; s._f = 0; }
        else {
          s.EN = 0;
          if (s.DN) { acc(); if (s.ACC >= s.PRE) { s.DN = 0; s.TT = 0; } else s.TT = 1; }
          else s.TT = 0;
        }
      } else { // RTO
        if (p) { s.EN = 1; acc(); s.DN = s.ACC >= s.PRE ? 1 : 0; s.TT = s.DN ? 0 : 1; }
        else { s.EN = 0; s.TT = 0; if (s.ACC >= s.PRE) s.DN = 1; }
      }
    }

    counter(t, a, p) {
      if (!a || a.kind !== 'struct' || a.file !== 'C5') return;
      const c = this.data.C5[a.word];
      if (t === 'CTU') {
        if (p && !c.CU) { c.ACC++; if (c.ACC > 32767) { c.ACC = -32768; c.OV = 1; } }
        c.CU = p ? 1 : 0;
      } else {
        if (p && !c.CD) { c.ACC--; if (c.ACC < -32768) { c.ACC = 32767; c.UN = 1; } }
        c.CD = p ? 1 : 0;
      }
      c.DN = c.ACC >= c.PRE ? 1 : 0;
    }

    /* Static program checks: invalid operands and duplicate OTE addresses. */
    verify(rungs) {
      const errs = [], warns = [];
      const otes = {};
      rungs.forEach((r, ri) => {
        const walk = arr => arr.forEach(e => {
          if (e.t === 'BST') {
            if (!e.legs.length) errs.push({ ri, id: e.id, msg: 'Branch with no legs' });
            e.legs.forEach(walk); return;
          }
          const d = INSTR[e.t];
          if (!d) { errs.push({ ri, id: e.id, msg: `Unknown instruction ${e.t}` }); return; }
          d.args.forEach((spec, k) => {
            const err = validArg(spec.ty, e.a[k]);
            if (err) errs.push({ ri, id: e.id, msg: `${e.t} operand "${spec.n}" = "${e.a[k] ?? ''}": ${err}` });
          });
          if (e.t === 'OTE') {
            const p = parse(e.a[0]);
            if (p) (otes[p.norm] = otes[p.norm] || []).push(ri);
          }
          if (e.t === 'OTE' || e.t === 'OTL' || e.t === 'OTU') {
            const p = parse(e.a[0]);
            if (p && p.file === 'I') warns.push({ ri, id: e.id, msg: `Writing to input ${p.norm} — the input scan overwrites it` });
          }
        });
        walk(r.elems);
        const hasOut = JSON.stringify(r.elems).match(/"t":"(OTE|OTL|OTU|TON|TOF|RTO|CTU|CTD|RES|MOV|ADD|SUB|MUL|DIV|CLR)"/);
        if (r.elems.length && !hasOut) warns.push({ ri, msg: 'Rung has no output instruction' });
      });
      for (const k in otes) if (otes[k].length > 1) warns.push({ ri: otes[k][1], msg: `Duplicate OTE ${k} in rungs ${otes[k].map(n => String(n).padStart(4, '0')).join(', ')} — only the last one wins` });
      return { errs, warns };
    }
  }

  window.PLCcore = { INSTR, SIZES, NUM_IN, NUM_OUT, parse, validArg, Engine, i16 };
})();
