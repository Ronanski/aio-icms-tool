/* PLC core: file-based data table (I, O, B3, T4, C5, N7, S), addressing,
   instruction set and scan engine. */
(function () {
  'use strict';

  // I/O files: one word per slot (0 = compact controller / CPU, 1–7 = rack cards), then 4 analog channel words per slot
  // (I:s.c / O:s.c = word 8 + 4·s + c); R6 = control structures (sequencers)
  const SIZES = { I: 40, O: 40, S: 16, B3: 32, N7: 32, T4: 32, C5: 32, R6: 32 };
  const ANA = (s, c) => 8 + s * 4 + c;
  const RBITS = ['EN', 'DN', 'ER'], RWORDS = ['LEN', 'POS'];
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
    OSR: { k: 'box', out: true, name: 'One Shot Rising', grp: 'Bit', args: [A('Storage Bit', 'bit', 'B3:1/0'), A('Output Bit', 'bit', 'B3:1/1')], help: 'Output Bit is ON for one scan when the rung goes false-to-true.' },
    OSF: { k: 'box', out: true, name: 'One Shot Falling', grp: 'Bit', args: [A('Storage Bit', 'bit', 'B3:1/2'), A('Output Bit', 'bit', 'B3:1/3')], help: 'Output Bit is ON for one scan when the rung goes true-to-false.' },
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
    COP: { k: 'box', out: true, name: 'Copy File', grp: 'File/Seq', args: [A('Source', 'file', '#N7:0'), A('Dest', 'file', '#N7:10'), A('Length', 'len', '4')], help: 'Copies Length words from the Source file to the Dest file while the rung is true.' },
    FLL: { k: 'box', out: true, name: 'Fill File', grp: 'File/Seq', args: [A('Source', 'src', '0'), A('Dest', 'file', '#N7:10'), A('Length', 'len', '4')], help: 'Writes Source into Length words of the Dest file while the rung is true.' },
    SQO: { k: 'box', out: true, name: 'Sequencer Output', grp: 'File/Seq', bits: ['EN', 'DN'], args: [A('File', 'file', '#N7:20'), A('Mask', 'src', '-1'), A('Dest', 'dest', 'O:0'), A('Control', 'ctl', 'R6:0'), A('Length', 'len', '4'), A('Position', 'int', '0')], help: 'On each false-to-true rung: POS steps to the next word of the File (back to 1 after LEN) and writes it through the Mask into Dest. Step 0 is the reset state.' },
    MSG: { k: 'box', out: true, name: 'Message', grp: 'File/Seq', bits: ['EN', 'DN', 'ER'], args: [A('Read/Write', 'mtype', 'READ'), A('Local file', 'file', '#N7:0'), A('Remote node', 'int', '2'), A('Remote file', 'file', '#N7:0'), A('Length', 'len', '4'), A('Control', 'ctl', 'R6:1')], help: 'On a false-to-true rung, reads Length words from the remote PLC (node, file) into the local file, or writes them there, over the simulated network (Network…). DN when done, ER if the node does not answer.' },
    MCR: { k: 'coil', out: true, lbl: 'MCR', name: 'Master Control Reset', grp: 'Program', args: [], help: 'Put MCR rungs around a zone: when the first MCR rung is false, every rung in the zone is false (non-retentive outputs off). The closing MCR rung has no conditions.' },
    JSR: { k: 'box', out: true, name: 'Jump to Subroutine', grp: 'Program', args: [A('SBR file number', 'prog', 'U:3')], help: 'Runs program file LAD n (a subroutine) while the rung is true, then comes back.' },
    SBR: { k: 'box', name: 'Subroutine', grp: 'Program', args: [], help: 'Marks the start of a subroutine (first instruction of its first rung; optional).' },
    RET: { k: 'coil', out: true, lbl: 'RET', name: 'Return', grp: 'Program', args: [], help: 'Ends the subroutine early and goes back to the JSR when the rung is true.' },
  };

  /* ---------- Addressing ---------- */
  /* controller tags (v2.0): a name stands for a data-table address. BOOL, INT, TIMER and COUNTER tags get their own
     address (B3, N7, T4, C5 from the top down), an ALIAS tag points at any address (I:1/0, O:2/0 …).
     Members: TIMER .EN .TT .DN .PRE .ACC, COUNTER .CU .CD .DN .OV .UN .PRE .ACC */
  let TAGS = new Map();
  const TAGRE = /^[A-Z_][A-Z0-9_]{0,39}$/;
  function setTags(list) { TAGS = new Map((list || []).map(t => [t.name.toUpperCase(), t])); cache.clear(); }
  const tagOf = name => TAGS.get(String(name || '').toUpperCase());
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
    if ((m = s.match(/^([IO]):(\d+)$/))) return +m[2] < 8 ? wordA(m[1], +m[2]) : null;
    if ((m = s.match(/^([IO]):([1-7])\.([0-3])$/))) return { kind: 'word', file: m[1], word: ANA(+m[2], +m[3]), ana: true, norm: `${m[1]}:${m[2]}.${m[3]}` };
    if ((m = s.match(/^#(N7|B3):(\d+)$/))) return +m[2] < SIZES[m[1]] ? { kind: 'file', file: m[1], word: +m[2], norm: `#${m[1]}:${+m[2]}` } : null;
    if ((m = s.match(/^U:([3-9])$/))) return { kind: 'prog', n: +m[1], norm: `U:${m[1]}` };
    if ((m = s.match(/^([A-Z_][A-Z0-9_]*)(?:\.([A-Z]+))?$/)) && TAGS.has(m[1])) {
      const t = TAGS.get(m[1]), struct = t.type === 'TIMER' || t.type === 'COUNTER';
      if (m[2] && !struct) return null;
      const a = parse0(m[2] ? t.addr + (['ACC', 'PRE'].includes(m[2]) ? '.' : '/') + m[2] : t.addr);
      return a ? { ...a, norm: s, tag: m[1], addr: a.norm } : null;
    }
    if ((m = s.match(/^R6:(\d+)$/))) return +m[1] < SIZES.R6 ? { kind: 'struct', file: 'R6', word: +m[1], norm: `R6:${+m[1]}` } : null;
    if ((m = s.match(/^R6:(\d+)[./]([A-Z]+)$/))) {
      const w = +m[1], sub = m[2];
      if (w >= SIZES.R6) return null;
      if (RBITS.includes(sub)) return { kind: 'bit', file: 'R6', word: w, sub, norm: `R6:${w}/${sub}` };
      if (RWORDS.includes(sub)) return { kind: 'word', file: 'R6', word: w, sub, norm: `R6:${w}.${sub}` };
      return null;
    }
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
      case 'src':
        if (p && p.kind === 'const' && !(Number.isInteger(p.value) && p.value >= -32768 && p.value <= 32767)) return 'Constants must be whole numbers from -32768 to 32767';
        return p && (p.kind === 'const' || p.kind === 'word') ? null : 'Expected a constant or word address (N7:0, T4:0.ACC, C5:1.PRE)';
      case 'dest': return p && p.kind === 'word' ? null : 'Expected a word address, e.g. N7:0';
      case 'file': return p && p.kind === 'file' ? null : 'Expected a file address, e.g. #N7:0';
      case 'len': return p && p.kind === 'const' && Number.isInteger(p.value) && p.value >= 1 && p.value <= 32 ? null : 'Length is 1 to 32';
      case 'ctl': return p && p.kind === 'struct' && p.file === 'R6' ? null : 'Expected a control, e.g. R6:0';
      case 'prog': return p && p.kind === 'prog' ? null : 'Expected a program file U:3 … U:9';
      case 'mtype': return /^(READ|WRITE)$/i.test(String(str || '').trim()) ? null : 'READ or WRITE';
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
      R6: Array.from({ length: SIZES.R6 }, () => ({ EN: 0, DN: 0, ER: 0, LEN: 0, POS: 0 })),
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
      this.physIn = 0;           // word from field wiring (slot 0)
      this.physOut = 0;          // word to output terminals (slot 0)
      this.physInX = new Array(SIZES.I).fill(0);   // rack cards: input word per slot (index 1–7)
      this.physOutX = new Array(SIZES.O).fill(0);  // rack cards: output word per slot
      this.powered = true;
      this.first = true;
      this.pw = Object.create(null);   // power-flow per segment key
      this.hl = Object.create(null);   // instruction highlight per id
      this.scanMs = 0;
      this.scans = 0;
      this._fm = { I: {}, O: {} };  // force masks per word: [mask, values]
    }
    resetData() { this.data = makeData(); }

    getBit(a) {
      const d = this.data;
      if (!a) return 0;
      if (a.file === 'T4' || a.file === 'C5' || a.file === 'R6') return d[a.file][a.word][a.sub] ? 1 : 0;
      return (d[a.file][a.word] >> a.bit) & 1;
    }
    setBit(a, v) {
      if (!a) return;
      const d = this.data;
      if (a.file === 'T4' || a.file === 'C5' || a.file === 'R6') { d[a.file][a.word][a.sub] = v ? 1 : 0; return; }
      const x = d[a.file][a.word];
      d[a.file][a.word] = asI16(v ? (x | (1 << a.bit)) : (x & ~(1 << a.bit)));
    }
    getWord(a) {
      if (!a) return 0;
      if (a.kind === 'const') return a.value;
      const d = this.data;
      if (a.file === 'T4' || a.file === 'C5' || a.file === 'R6') return d[a.file][a.word][a.sub];
      return d[a.file][a.word];
    }
    setWord(a, v) {
      if (!a || a.kind !== 'word') return;
      const d = this.data;
      if (a.file === 'T4' || a.file === 'C5' || a.file === 'R6') { d[a.file][a.word][a.sub] = i16(v); return; }
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
        this.data.O.fill(0);
      } else {
        this.data.O.fill(0);
        for (const k in this.pw) this.pw[k] = false;
      }
    }

    isForceable(a) { return a && a.kind === 'bit' && (a.file === 'I' || a.file === 'O'); }
    setForce(norm, val) {
      if (val === null || val === undefined) delete this.forces[norm];
      else {
        // only physical I/O bits (I:s/b, O:s/b) can be forced
        const a = parse(norm);
        if (!this.isForceable(a)) return;
        this.forces[norm] = val ? 1 : 0;
      }
      this._fm = { I: {}, O: {} };
      for (const k in this.forces) {
        const a = parse(k);
        if (!a) continue;
        const fm = this._fm[a.file][a.word] || (this._fm[a.file][a.word] = [0, 0]);
        fm[0] |= 1 << a.bit;
        if (this.forces[k]) fm[1] |= 1 << a.bit;
      }
    }
    forceCount() { return Object.keys(this.forces).length; }
    applyForce(file, w, word = 0) {
      const fm = this._fm[file][word];
      if (!this.forcesEnabled || !fm) return w;
      const [m, v] = fm;
      return (w & ~m) | (v & m);
    }

    /* rungs = LAD 2 (main), subs = { 3: rungs, … } subroutine files called by JSR */
    setProgram(rungs, subs = {}, periodic = {}) {
      this.rungs = rungs; this.subs = subs; this.periodic = periodic; this.pt = {};
      this.pw = Object.create(null); this.hl = Object.create(null);
      const prep = arr => arr.forEach(e => {
        if (e.t === 'BST') e.legs.forEach(prep);
        else e._p = (e.a || []).map(parse);
      });
      const prepR = r => { prep(r.elems); r._mcr = r.elems.some(e => e.t === 'MCR'); };
      rungs.forEach(prepR);
      for (const n in subs) subs[n].forEach(prepR);
    }
    allRungs() { return [this.rungs, ...Object.values(this.subs || {})].flat(); }
    /* run a list of rungs: an MCR zone makes its rungs false; a true RET ends a subroutine */
    runRungs(rungs, depth) {
      let off = false, inZone = false;
      this._ret = false;
      for (const r of rungs) {
        this.pw['r' + r.id] = !off || r._mcr;
        const p = this.seq(r.elems, !off || r._mcr);
        if (r._mcr) { if (!inZone) { inZone = true; off = !p; } else { inZone = false; off = false; } }
        if (this._ret) { this._ret = false; if (depth > 0) return; }
      }
    }
    /* write presets/time base (and optionally accum) of an instruction into the data table */
    applyInstr(e, withAcc) {
      const d = INSTR[e.t]; if (!d) return;
      if (e.t === 'SQO') {
        const c = parse(e.a[3]); if (!c || c.kind !== 'struct' || c.file !== 'R6') return;
        const s = this.data.R6[c.word]; s.LEN = Math.max(1, Math.min(32, Number(e.a[4]) || 1));
        if (withAcc) s.POS = Math.max(0, Math.min(s.LEN, Number(e.a[5]) || 0));
        return;
      }
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
      for (const n in this.subs || {}) this.subs[n].forEach(r => walk(r.elems));
      this.rungs.forEach(r => walk(r.elems));
    }

    scan(dt) {
      const t0 = performance.now();
      const d = this.data;
      // no power: the first scan after power returns sets S:1/15 again
      if (!this.powered) { this.physOut = 0; this.physOutX.fill(0); this.first = true; for (const k in this.pw) this.pw[k] = false; return; }
      d.I[0] = asI16(this.applyForce('I', this.physIn & 0xFFFF));
      for (let k = 1; k < SIZES.I; k++) d.I[k] = asI16(this.applyForce('I', (this.physInX[k] || 0) & 0xFFFF, k));
      this.dt = dt;
      if (this.mode === 'RUN') {
        d.S[1] = asI16(this.first ? d.S[1] | (1 << 15) : d.S[1] & ~(1 << 15));
        this.runRungs(this.rungs, 0);
        // messages in flight: done after their delay, through the network hook (App sets this.net)
        if (this.msgs && this.msgs.length) this.msgs = this.msgs.filter(m => {
          m.t -= dt; if (m.t > 0) return true;
          const f = this.data[m.local.file], ok = this.net && this.net.has(m.node);
          if (!ok) { m.c.ER = 1; return false; }
          if (m.write) this.net.write(m.node, m.roff, f.slice(m.local.word, m.local.word + m.n));
          else this.net.read(m.node, m.roff, m.n).forEach((v, k) => { if (m.local.word + k < f.length) f[m.local.word + k] = i16(v); });
          m.c.DN = 1; return false;
        });
        // periodic tasks: a program file that runs every period ms on its own (not through JSR)
        for (const n in this.periodic || {}) {
          const per = this.periodic[n], sub = this.subs[n]; if (!per || !sub) continue;
          this.pt[n] = (this.pt[n] || 0) + dt * 1000;
          while (this.pt[n] >= per) { this.pt[n] -= per; this.runRungs(sub, 1); }
        }
        this.first = false;
        this.scans++;
      } else {
        for (const r of this.allRungs()) { this.pw['r' + r.id] = false; this.preview(r.elems); }
      }
      const outW = this.mode === 'RUN' ? (d.O[0] & 0xFFFF) : 0;
      this.physOut = this.applyForce('O', outW) & 0xFFFF;
      for (let k = 1; k < SIZES.O; k++) this.physOutX[k] = this.applyForce('O', this.mode === 'RUN' ? d.O[k] & 0xFFFF : 0, k) & 0xFFFF;
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
          if (p && A[0] && A[0].kind === 'struct' && A[0].file === 'R6') { const s = this.data.R6[A[0].word]; s.POS = 0; s.EN = 0; s.DN = 0; s.ER = 0; }
          else if (p && A[0] && A[0].kind === 'struct') {
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
        case 'MOV': if (p) { const v = this.getWord(A[0]); this.setWord(A[1], v); this.mathFlags(v, false); } hl[e.id] = p; return p;
        case 'ADD': case 'SUB': case 'MUL': case 'DIV': {
          if (p) {
            const a = this.getWord(A[0]), b = this.getWord(A[1]);
            const u = x => x & 0xFFFF;
            let r, carry = false;
            if (e.t === 'ADD') { r = a + b; carry = u(a) + u(b) > 0xFFFF; }
            else if (e.t === 'SUB') { r = a - b; carry = u(a) < u(b); }
            else if (e.t === 'MUL') r = a * b;
            // divide by zero: overflow, result 32767; a half rounds away from zero (-2.5 → -3), as the controller does
            else r = b === 0 ? Infinity : Math.sign(a / b) * Math.round(Math.abs(a / b));
            this.setWord(A[2], Number.isFinite(r) ? r : 32767);
            this.mathFlags(r, carry);
          }
          hl[e.id] = p; return p;
        }
        case 'CLR': if (p) { this.setWord(A[0], 0); this.mathFlags(0, false); } hl[e.id] = p; return p;
        case 'OSR': case 'OSF': {
          const st = !!this.getBit(A[0]), edge = e.t === 'OSR' ? p && !st : !p && st;
          this.setBit(A[1], edge); this.setBit(A[0], p); hl[e.id] = edge; return p;
        }
        case 'MCR': hl[e.id] = p; return p;
        case 'SBR': hl[e.id] = p; return p;
        case 'RET': hl[e.id] = p; if (p) this._ret = true; return p;
        case 'JSR': {
          hl[e.id] = p;
          const sub = A[0] && this.subs && this.subs[A[0].n];
          if (p && sub) {
            this.depth = (this.depth || 0) + 1;
            // nesting deeper than 8 levels is a major fault on the real controller; here it just stops
            if (this.depth <= 8) this.runRungs(sub, this.depth); else this.data.S[5] = asI16(this.data.S[5] | 4);
            this.depth--; this._ret = false;
          }
          return p;
        }
        case 'COP': {
          if (p && A[0] && A[1]) { const n = Number(e.a[2]) || 1, src = this.data[A[0].file], dst = this.data[A[1].file], tmp = []; for (let k = 0; k < n; k++) tmp.push(src[A[0].word + k] || 0); tmp.forEach((v, k) => { if (A[1].word + k < dst.length) dst[A[1].word + k] = v; }); }
          hl[e.id] = p; return p;
        }
        case 'FLL': {
          if (p && A[1]) { const n = Number(e.a[2]) || 1, v = i16(this.getWord(A[0])), dst = this.data[A[1].file]; for (let k = 0; k < n && A[1].word + k < dst.length; k++) dst[A[1].word + k] = v; }
          hl[e.id] = p; return p;
        }
        case 'MSG': {
          // the network answers after a short delay (scan() moves pending messages on)
          const c = A[5] && A[5].file === 'R6' ? this.data.R6[A[5].word] : null;
          if (c && A[1] && A[3]) {
            if (p && !c.EN) { c.EN = 1; c.DN = 0; c.ER = 0; (this.msgs || (this.msgs = [])).push({ c, t: 0.1, write: /^WRITE$/i.test(e.a[0]), local: A[1], node: Number(e.a[2]) || 0, roff: A[3].word, n: Number(e.a[4]) || 1 }); }
            if (!p && (c.DN || c.ER)) c.EN = 0;
          }
          hl[e.id] = p; return p;
        }
        case 'SQO': {
          const c = A[3] && A[3].file === 'R6' ? this.data.R6[A[3].word] : null;
          if (c && A[0] && A[2]) {
            if (p && !c.EN) {
              c.POS = c.POS >= c.LEN ? 1 : c.POS + 1;
              const v = this.data[A[0].file][A[0].word + c.POS] || 0, m = this.getWord(A[1]);
              this.setWord(A[2], asI16((this.getWord(A[2]) & ~m) | (v & m)));
            }
            c.EN = p ? 1 : 0; c.DN = c.POS >= c.LEN ? 1 : 0;
          }
          hl[e.id] = p; return p;
        }
      }
      return p;
    }

    /* arithmetic status S:0/0 carry, /1 overflow, /2 zero, /3 sign; an overflow also sets the minor fault bit S:5/0
       (the program clears it; this trainer does not stop the PLC on it) */
    mathFlags(r, carry) {
      const d = this.data, over = !Number.isFinite(r) || r > 32767 || r < -32768, v = over ? (r < 0 ? -32768 : 32767) : r;
      d.S[0] = asI16((d.S[0] & ~0xF) | (carry ? 1 : 0) | (over ? 2 : 0) | (v === 0 ? 4 : 0) | (v < 0 ? 8 : 0));
      if (over) d.S[5] = asI16(d.S[5] | 1);
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
      const otes = {}, structs = {};
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
            // I/O addresses must exist in the hardware (compact PLC or the rack's I/O configuration)
            const p = !err && this.ioCheck && parse(e.a[k]);
            const io = p && (p.file === 'I' || p.file === 'O') && this.ioCheck(p);
            if (io) (io.warn ? warns : errs).push({ ri, id: e.id, msg: io.msg });
          });
          if (e.t === 'JSR') { const p = parse(e.a[0]); if (p && p.kind === 'prog' && !(this.subs && this.subs[p.n])) errs.push({ ri, id: e.id, msg: `JSR ${p.norm}: there is no program file LAD ${p.n}` }); }
          if (e.t === 'OTE') {
            const p = parse(e.a[0]);
            if (p) (otes[p.norm] = otes[p.norm] || []).push(ri);
          }
          // file instructions must stay inside their file (N7 and B3 have 32 words; SQO uses words 0…LEN of its file)
          const inFile = (k, n, extra, what) => {
            const p = parse(e.a[k]);
            if (p && p.kind === 'file' && n > 0 && p.word + n + extra > SIZES[p.file]) errs.push({ ri, id: e.id, msg: `${e.t} ${what} ${p.norm} with length ${n} runs past the end of ${p.file} (${SIZES[p.file]} words)` });
          };
          const len = k => Math.floor(Number(e.a[k])) || 0;
          if (e.t === 'COP') { inFile(0, len(2), 0, 'source'); inFile(1, len(2), 0, 'dest'); }
          if (e.t === 'FLL') inFile(1, len(2), 0, 'dest');
          if (e.t === 'SQO') inFile(0, len(4), 1, 'file');
          if (e.t === 'MSG') {
            inFile(1, len(4), 0, 'local file');
            const p = parse(e.a[3]);
            if (p && p.kind === 'file' && p.word + len(4) > 32) errs.push({ ri, id: e.id, msg: `MSG remote file ${p.norm} with length ${len(4)} runs past the end of the remote PLC's 32 words` });
          }
          // a timer's preset and accum are 0…32767 (a negative preset faults a real controller)
          if (['TON', 'TOF', 'RTO'].includes(e.t)) {
            [[2, 'Preset'], [3, 'Accum']].forEach(([k, n]) => { if (Number(e.a[k]) < 0) errs.push({ ri, id: e.id, msg: `${e.t} ${n} must be 0 or more (got ${e.a[k]})` }); });
          }
          if (['TON', 'TOF', 'RTO', 'CTU', 'CTD'].includes(e.t)) {
            const p = parse(e.a[0]);
            if (p && p.kind === 'struct') (structs[p.norm] = structs[p.norm] || []).push({ ri, t: e.t, pre: e.a[p.file === 'T4' ? 2 : 1] });
          }
          if (e.t === 'OTE' || e.t === 'OTL' || e.t === 'OTU') {
            const p = parse(e.a[0]);
            if (p && p.file === 'I') warns.push({ ri, id: e.id, msg: `Writing to input ${p.norm} — the input scan overwrites it` });
          }
        });
        walk(r.elems);
        const hasOut = JSON.stringify(r.elems).match(/"t":"(OTE|OTL|OTU|TON|TOF|RTO|CTU|CTD|RES|MOV|ADD|SUB|MUL|DIV|CLR|OSR|OSF|COP|FLL|SQO|MCR|JSR|RET|MSG)"/);
        if (r.elems.length && !hasOut) warns.push({ ri, msg: 'Rung has no output instruction' });
      });
      // one timer used by two timer instructions shares one ACC; a CTU/CTD pair must agree on the preset
      for (const k in structs) {
        const L = structs[k], rr = L.map(x => String(x.ri).padStart(4, '0')).join(', ');
        if (k.startsWith('T4') && L.length > 1) warns.push({ ri: L[1].ri, msg: `${k} is used by ${L.length} timer instructions (rungs ${rr}) — they share one accumulator` });
        else if (new Set(L.map(x => String(x.pre))).size > 1) warns.push({ ri: L[1].ri, msg: `${k} has different presets in rungs ${rr} — the last one scanned wins` });
      }
      if (rungs.filter(r => r.elems.some(e => e.t === 'MCR')).length % 2) warns.push({ ri: rungs.length - 1, msg: 'MCR zones come in pairs: an MCR rung with conditions starts a zone, an MCR rung alone ends it' });
      for (const k in otes) if (otes[k].length > 1) warns.push({ ri: otes[k][1], msg: `Duplicate OTE ${k} in rungs ${otes[k].map(n => String(n).padStart(4, '0')).join(', ')} — only the last one wins` });
      return { errs, warns };
    }
  }

  /* a free address for a new tag of this type: from the top of its file down, not used by another tag */
  function allocTag(type, list) {
    const used = new Set((list || []).filter(t => t.type !== 'ALIAS').map(t => t.addr));
    if (type === 'BOOL') { for (let w = 31; w >= 16; w--) for (let b = 15; b >= 0; b--) if (!used.has(`B3:${w}/${b}`)) return `B3:${w}/${b}`; }
    const f = { INT: 'N7', TIMER: 'T4', COUNTER: 'C5' }[type];
    if (f) for (let w = 31; w >= 16; w--) if (!used.has(`${f}:${w}`)) return `${f}:${w}`;
    return null;
  }
  /* a name that cannot be read as an address or an instruction */
  const tagNameOk = n => { const s = String(n || '').toUpperCase(); return TAGRE.test(s) && !/^[A-Z]\d*$/.test(s) && !/^(B3|N7|T4|C5|R6|S2|BST|NXB|BND|SOR|EOR)$/.test(s) && !INSTR[s]; };
  window.PLCcore = { INSTR, SIZES, NUM_IN, NUM_OUT, ANA, parse, validArg, Engine, i16, setTags, tagOf, allocTag, tagNameOk };
})();
