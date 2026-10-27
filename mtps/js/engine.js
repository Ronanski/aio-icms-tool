/* MT PLC Studio engine: data types, tags, rung text, verify, scan and the instruction set of a tag-based
   controller (docs/PLC_APP_SPEC.md). No DOM, so the tests (node) and the app use it as is. */
(function (root) {
  'use strict';

  /* ---------- Data types ---------- */
  const ATOMIC = { BOOL: 1, SINT: 8, INT: 16, DINT: 32, REAL: 32 };
  const HALF = { SINT: 128, INT: 32768, DINT: 2147483648 };
  const isInt = t => t === 'SINT' || t === 'INT' || t === 'DINT';
  const isNum = t => isInt(t) || t === 'REAL';
  const U = s => String(s).toUpperCase();
  const members = s => s.split(' ').map(x => { const k = x.indexOf(':'); return { name: x.slice(0, k), type: x.slice(k + 1) }; });
  const CH4 = t => [0, 1, 2, 3].map(k => `Ch${k}Data:${t}`).join(' ');
  const PREDEF = {
    TIMER: members('PRE:DINT ACC:DINT EN:BOOL TT:BOOL DN:BOOL'),
    COUNTER: members('PRE:DINT ACC:DINT CU:BOOL CD:BOOL DN:BOOL OV:BOOL UN:BOOL'),
    CONTROL: members('LEN:DINT POS:DINT EN:BOOL EU:BOOL DN:BOOL EM:BOOL ER:BOOL UL:BOOL IN:BOOL FD:BOOL'),
  };
  /* the module-defined data types, named as Studio 5000 names them (help: 1756 discrete / analog module-defined data
     types): the digital cards are 1756-IB16 / -IA16 (AB:1756_DI) and 1756-OB16E / -OW16I (AB:1756_DO); the analog input
     card is a 1756-IF8 in differential float mode (4 channels: AB:1756_IF4_Float), the analog output card a 1756-OF4
     (AB:1756_OF4_Float). Status tags (Local:<slot>:S) are made for a module type that has an S type; these 1756 modules
     have none. */
  const MODTYPES = {
    'AB:1756_DI:I:0': members('Fault:DINT Data:DINT'),
    // the output card echoes the outputs it applies in its input tag (Data)
    'AB:1756_DO:I:0': members('Fault:DINT Data:DINT'), 'AB:1756_DO:O:0': members('Data:DINT'),
    'AB:1756_IF4_Float:I:0': members('Fault:DINT ' + CH4('REAL')),
    'AB:1756_OF4_Float:I:0': members('Fault:DINT'), 'AB:1756_OF4_Float:O:0': members(CH4('REAL')),
    // the configuration tags (Local:<slot>:C), as in the module profiles: AB:1756_DI:C:0 (help 1756-IB16: the filter
    // times of four groups of 8 points, as the type is shared with the 32-point modules, and change of state),
    // AB:1756_DO:C:0 (help 1756-OB16I / -OW16I), and the floating point analog ones (1756-UM009, Floating Point
    // Configuration Tags): RealTimeSample or ProgToFaultEn, then one Ch<n>Config structure per channel
    'AB:1756_DI:C:0': members(['OffOn', 'OnOff'].map(d => ['0_7', '8_15', '16_23', '24_31'].map(g => `Filter${d}_${g}:SINT`).join(' ')).join(' ') + ' COSOnOffEn:DINT COSOffOnEn:DINT'),
    'AB:1756_DO:C:0': members('ProgToFaultEn:BOOL FaultMode:DINT FaultValue:DINT ProgMode:DINT ProgValue:DINT'),
    'AB:1756_NII_Struct:C:0': members('AlarmDisable:BOOL ProcessAlarmLatch:BOOL RateAlarmLatch:BOOL DigitalFilter:INT RateAlarmLimit:INT LowSignal:REAL HighSignal:REAL LowEngineering:REAL HighEngineering:REAL LAlarmLimit:REAL HAlarmLimit:REAL LLAlarmLimit:REAL HHAlarmLimit:REAL AlarmDeadband:REAL CalBias:REAL'),
    'AB:1756_NIO_Struct:C:0': members('AlarmDisable:BOOL HoldForInit:BOOL RampAlarmLatch:BOOL LimitAlarmLatch:BOOL FaultMode:BOOL ProgMode:BOOL RampToRun:BOOL RampToProg:BOOL RampToFault:BOOL MaxRampRate:INT FaultValue:REAL ProgValue:REAL LowLimit:REAL HighLimit:REAL LowSignal:REAL HighSignal:REAL LowEngineering:REAL HighEngineering:REAL'),
    'AB:1756_IF4_Float:C:0': members('RealTimeSample:INT ' + [0, 1, 2, 3].map(k => `Ch${k}Config:AB:1756_NII_Struct:C:0`).join(' ')),
    'AB:1756_OF4_Float:C:0': members('ProgToFaultEn:BOOL ' + [0, 1, 2, 3].map(k => `Ch${k}Config:AB:1756_NIO_Struct:C:0`).join(' ')),
  };
  // the names of 0.4.0 and older (PLC:DI16:I …): a project that uses one still reads
  const OLDTYPES = { 'PLC:DI16:I': 'AB:1756_DI:I:0', 'PLC:DI16:C': 'AB:1756_DI:C:0', 'PLC:DO16:I': 'AB:1756_DO:I:0', 'PLC:DO16:O': 'AB:1756_DO:O:0', 'PLC:DO16:C': 'AB:1756_DO:C:0',
    'PLC:AI4:I': 'AB:1756_IF4_Float:I:0', 'PLC:AI4:C': 'AB:1756_IF4_Float:C:0', 'PLC:AO4:I': 'AB:1756_OF4_Float:I:0', 'PLC:AO4:O': 'AB:1756_OF4_Float:O:0', 'PLC:AO4:C': 'AB:1756_OF4_Float:C:0' };
  const DO = { kind: 'do', I: 'AB:1756_DO:I:0', O: 'AB:1756_DO:O:0', C: 'AB:1756_DO:C:0' };
  const DI = { kind: 'di', I: 'AB:1756_DI:I:0', C: 'AB:1756_DI:C:0' };
  const MODULES = {
    'PLC-DI16-24V': DI, 'PLC-DI16-120V': DI,
    'PLC-DO16-24V': DO, 'PLC-DO16-RLY': DO,
    'PLC-AI4': { kind: 'ai', I: 'AB:1756_IF4_Float:I:0', C: 'AB:1756_IF4_Float:C:0' }, 'PLC-AO4': { kind: 'ao', I: 'AB:1756_OF4_Float:I:0', O: 'AB:1756_OF4_Float:O:0', C: 'AB:1756_OF4_Float:C:0' },
    'PLC-ENET': { kind: 'enet' },
  };
  const IODIRS = ['I', 'O', 'C', 'S'];
  const RACKS = [4, 8];            // chassis sizes offered: 4 or 8 slots, drawn as one row (as the Logix Emulate Chassis Monitor)
  const OLDRACKS = [7, 10, 12];    // sizes of 0.4.0-beta.3 and older: still read, so no module of an old project is lost
  /* the size an old chassis or project gets: 4 and 8 stay; 7, 10 and 12 become 8 when every used slot (0 to 7) fits,
     otherwise they keep their size so no module is lost */
  const fitRack = (size, slots) => {
    size = Math.floor(+size) || 8;
    if (RACKS.includes(size)) return size;
    const top = Math.max(-1, ...(slots || []).filter(n => Number.isInteger(n)));
    if (top < 8) return 8;
    return OLDRACKS.includes(size) && size > top ? size : OLDRACKS.find(n => n > top) || 12;
  };
  const SFLAGS = ['FS', 'N', 'Z', 'V', 'C', 'MINOR'];
  // the reference's name rules: letters, digits and _, starting with a letter or _, up to 40, no __ and no _ at the end
  const validName = n => { const s = String(n == null ? '' : n); return /^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(s) && !/__/.test(s) && !/_$/.test(s); };
  const dot = m => (/[.!?]$/.test(m) ? m : m + '.');
  /* array dimensions of a tag, as written in its data type: DINT[10] → 10, DINT[4,5] → [4, 5], DINT[2,3,4] → [2, 3, 4]
     (1, 2 or 3 dimensions; the last one varies fastest, 1756-PM004). dimsOf gives the list, or null when it is not
     valid; dimN the number of elements; dimText '4,5' */
  const dimsOf = d => {
    if (d == null || d === 0 || d === '') return [];
    const a = Array.isArray(d) ? d : [d];
    return a.length <= 3 && a.every(n => Number.isInteger(+n) && +n > 0) ? a.map(Number) : null;
  };
  const dimN = d => { const a = dimsOf(d); return a && a.length ? a.reduce((x, y) => x * y, 1) : 0; };
  const dimText = d => (dimsOf(d) || []).join(',');
  const clone = v => (typeof v === 'object' && v !== null ? JSON.parse(JSON.stringify(v)) : v);
  const i32 = v => Math.trunc(v) | 0;

  /* every non-atomic data type of a project by upper-case name: { name, kind, members, map } */
  function typeTable(project, err) {
    const t = new Map(), e = err || (() => {});
    const add = (name, mem, kind) => t.set(U(name), { name, kind, members: mem.map(m => ({ ...m })), map: new Map() });
    for (const n in PREDEF) add(n, PREDEF[n], 'predefined');
    for (const n in MODTYPES) add(n, MODTYPES[n], 'module');
    for (const d of (project && project.dataTypes) || []) {
      if (!validName(d.name)) { e(`Invalid data type name '${d.name}'`); continue; }
      if (t.has(U(d.name)) || ATOMIC[U(d.name)]) { e(`Data type '${d.name}' is defined more than once`); continue; }
      add(d.name, d.members || [], 'user');
    }
    for (const d of t.values()) {
      d.members = d.members.filter(m => {
        const c = canon(t, m.type);
        if (!c) { e(`Data type '${d.name}': undefined data type '${m.type}' of member '${m.name}'`); return false; }
        if (!validName(m.name) || d.map.has(U(m.name))) { e(`Data type '${d.name}': invalid or repeated member name '${m.name}'`); return false; }
        m.type = c; m.dim = m.dim > 0 ? Math.floor(m.dim) : 0;
        d.map.set(U(m.name), m);
        return true;
      });
    }
    // a user type that leads back to itself could never be built
    for (const d of t.values()) {
      if (d.kind !== 'user') continue;
      const seen = new Set(), todo = [d];
      let loop = false;
      while (todo.length) for (const m of todo.pop().members) {
        const s = t.get(U(m.type));
        if (s === d) loop = true; else if (s && !seen.has(s)) { seen.add(s); todo.push(s); }
      }
      if (loop) { e(`Data type '${d.name}' contains itself`); d.members = []; d.map = new Map(); }
    }
    return t;
  }
  function canon(types, name) {
    const u = U(OLDTYPES[name] || OLDTYPES[U(name || '')] || name || '');
    if (ATOMIC[u]) return u;
    const d = types.get(u);
    return d ? d.name : null;
  }
  function make(types, type, dim) {
    if (dim > 0) { const a = new Array(dim); for (let k = 0; k < dim; k++) a[k] = make(types, type, 0); return a; }
    if (ATOMIC[type]) return 0;
    const o = {};
    for (const m of types.get(U(type)).members) o[m.name] = make(types, m.type, m.dim);
    return o;
  }
  /* a saved or written value in the shape of a type; missing parts are 0 */
  function conform(types, type, dim, src) {
    if (dim > 0) { const a = new Array(dim); for (let k = 0; k < dim; k++) a[k] = conform(types, type, 0, Array.isArray(src) ? src[k] : undefined); return a; }
    if (ATOMIC[type]) return store(type, Number(src) || 0);
    const o = {}, s = src && typeof src === 'object' ? src : {};
    for (const m of types.get(U(type)).members) o[m.name] = conform(types, m.type, m.dim, s[m.name]);
    return o;
  }

  /* a number into a type: integers wrap (OV is set), REAL is 32-bit, a REAL into an integer rounds half to even */
  let OV = false, DIV0 = false;
  function roundEven(v) { const f = Math.floor(v), d = v - f; return d > 0.5 || (d === 0.5 && f % 2 !== 0) ? f + 1 : f; }
  function store(type, v) {
    OV = false;
    if (type === 'REAL') { const f = Math.fround(v); if (!isFinite(f) && isFinite(v)) OV = true; return f; }
    if (type === 'BOOL') return v ? 1 : 0;
    const h = HALF[type];
    if (typeof v !== 'number' || v !== v) { OV = true; return 0; }
    if (!isFinite(v)) { OV = true; return v > 0 ? h - 1 : -h; }
    let n = Number.isInteger(v) ? v : roundEven(v);
    if (n >= h || n < -h) { const m = h * 2; n = ((n % m) + m) % m; if (n >= h) n -= m; OV = true; }
    return n === 0 ? 0 : n;
  }

  /* ---------- Rung text ---------- */
  /* [XIC(a),XIC(b)]OTE(c); → [{ t: 'BR', legs: [[XIC a], [XIC b]] }, { t: 'OTE', a: ['c'] }] */
  function parseRung(text) {
    const s = String(text == null ? '' : text);
    let i = 0;
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const fail = m => { const e = new Error(m); e.pos = i; throw e; };
    function seq(inBranch) {
      const out = [];
      for (;;) {
        ws();
        const c = s[i];
        if (c === undefined || c === ';') { if (inBranch) fail('A branch is not closed: ] is missing'); return out; }
        if (c === ',' || c === ']') { if (!inBranch) fail(`Unexpected '${c}'`); return out; }
        if (c === '[') {
          i++;
          const legs = [seq(true)];
          while (s[i] === ',') { i++; legs.push(seq(true)); }
          if (s[i] !== ']') fail('A branch is not closed: ] is missing');
          i++;
          out.push({ t: 'BR', legs });
          continue;
        }
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
        if (!m) fail(`Unexpected '${c}'`);
        i += m[0].length; ws();
        if (s[i] !== '(') fail(`${m[0]} needs ( ) after it`);
        i++;
        // operands split at commas outside ( ) and [ ] (CPT expressions, array subscripts)
        const a = [];
        let cur = '', depth = 0;
        for (;;) {
          const ch = s[i];
          if (ch === undefined) fail(`${m[0]}: ) is missing`);
          if (depth === 0 && (ch === ',' || ch === ')')) { a.push(cur.trim()); cur = ''; i++; if (ch === ')') break; continue; }
          if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--;
          cur += ch; i++;
        }
        out.push({ t: m[0].toUpperCase(), a: a.length === 1 && a[0] === '' ? [] : a });
      }
    }
    try {
      const elems = seq(false);
      if (s[i] === ';') i++;
      ws();
      if (i < s.length) fail('Text after the end of the rung (;)');
      return { elems, err: null };
    } catch (e) { return { elems: null, err: e.message, pos: e.pos }; }
  }
  const ser = elems => elems.map(e => (e.t === 'BR' ? '[' + e.legs.map(ser).join(',') + ']' : `${e.t}(${e.a.join(',')})`)).join('');
  const serializeRung = elems => ser(elems) + ';';

  /* 5, -3, 2.5, 1e3, 16#FF, 2#1010, 8#17 → { v, real } (a based number is a 32-bit pattern: 16#FFFFFFFF = -1) */
  function parseNumber(str) {
    const s = String(str == null ? '' : str).trim();
    let m;
    if ((m = /^([+-]?)(2|8|16)#([0-9A-Fa-f_]+)$/.exec(s))) {
      const d = m[3].replace(/_/g, ''), ok = { 2: /^[01]+$/, 8: /^[0-7]+$/, 16: /^[0-9A-Fa-f]+$/ }[m[2]];
      if (!d || !ok.test(d)) return null;
      let v = parseInt(d, +m[2]);
      if (v > 0x7FFFFFFF && v <= 0xFFFFFFFF) v -= 0x100000000;
      return { v: m[1] === '-' ? -v : v, real: false };
    }
    if (/^[+-]?\d+$/.test(s)) return { v: +s, real: false };
    if (/^[+-]?(\d+\.\d*|\.\d+|\d+)(e[+-]?\d+)?$/i.test(s)) return { v: +s, real: true };
    return null;
  }

  /* ---------- Tag references ---------- */
  /* Tank[2].Level → { base: 'Tank', segs: [{ i: '2' }, { m: 'Level' }] }; a number after a dot is a bit (MyDint.5) */
  function parsePath(str) {
    const s = String(str).trim();
    const m = /^[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z0-9_]+)*/.exec(s);
    if (!m) return null;
    const segs = [];
    let i = m[0].length;
    while (i < s.length) {
      if (s[i] === '.') {
        const x = /^[A-Za-z0-9_]+/.exec(s.slice(i + 1));
        if (!x) return null;
        segs.push(/^\d+$/.test(x[0]) ? { b: +x[0] } : { m: x[0] });
        i += 1 + x[0].length;
      } else if (s[i] === '[') {
        const j = s.indexOf(']', i);
        if (j < 0) return null;
        segs.push({ i: s.slice(i + 1, j).trim() });
        i = j + 1;
      } else return null;
    }
    return { base: m[0], segs, rest: s.slice(m[0].length) };
  }

  class Fault extends Error { constructor(type, code, text) { super(text); this.type = type; this.code = code; } }

  /* the operand names of each instruction (the ladder boxes and the error lines) */
  const OPN = {
    XIC: ['Bit'], XIO: ['Bit'], OTE: ['Bit'], OTL: ['Bit'], OTU: ['Bit'], ONS: ['Storage Bit'], OSR: ['Storage Bit', 'Output Bit'], OSF: ['Storage Bit', 'Output Bit'],
    RES: ['Structure'], JMP: ['Label Name'], LBL: ['Label Name'], JSR: ['Routine Name', 'Input Par'],
    TON: ['Timer', 'Preset', 'Accum'], TOF: ['Timer', 'Preset', 'Accum'], RTO: ['Timer', 'Preset', 'Accum'],
    CTU: ['Counter', 'Preset', 'Accum'], CTD: ['Counter', 'Preset', 'Accum'],
    EQU: ['Source A', 'Source B'], NEQ: ['Source A', 'Source B'], LES: ['Source A', 'Source B'], LEQ: ['Source A', 'Source B'],
    GRT: ['Source A', 'Source B'], GEQ: ['Source A', 'Source B'], LIM: ['Low Limit', 'Test', 'High Limit'],
    MEQ: ['Source', 'Mask', 'Compare'], CMP: ['Expression'],
    ADD: ['Source A', 'Source B', 'Dest'], SUB: ['Source A', 'Source B', 'Dest'], MUL: ['Source A', 'Source B', 'Dest'],
    DIV: ['Source A', 'Source B', 'Dest'], MOD: ['Source A', 'Source B', 'Dest'], SQR: ['Source', 'Dest'], NEG: ['Source', 'Dest'],
    ABS: ['Source', 'Dest'], CPT: ['Dest', 'Expression'], MOV: ['Source', 'Dest'], MVM: ['Source', 'Mask', 'Dest'], CLR: ['Dest'],
    AND: ['Source A', 'Source B', 'Dest'], OR: ['Source A', 'Source B', 'Dest'], XOR: ['Source A', 'Source B', 'Dest'], NOT: ['Source', 'Dest'],
    BTD: ['Source', 'Source Bit', 'Dest', 'Dest Bit', 'Length'], SWPB: ['Source', 'Order Mode', 'Dest'],
    COP: ['Source', 'Dest', 'Length'], FLL: ['Source', 'Dest', 'Length'], JSR: ['Routine Name', 'Input Par'],
    OSR: ['Storage Bit', 'Output Bit'], OSF: ['Storage Bit', 'Output Bit'],
    BSL: ['Array', 'Control', 'Source Bit', 'Length'], BSR: ['Array', 'Control', 'Source Bit', 'Length'],
    FFL: ['Source', 'FIFO', 'Control', 'Length', 'Position'], FFU: ['FIFO', 'Dest', 'Control', 'Length', 'Position'],
    LFL: ['Source', 'LIFO', 'Control', 'Length', 'Position'], LFU: ['LIFO', 'Dest', 'Control', 'Length', 'Position'],
    SQI: ['Array', 'Mask', 'Source', 'Control', 'Length', 'Position'], SQO: ['Array', 'Mask', 'Dest', 'Control', 'Length', 'Position'],
    SQL: ['Array', 'Source', 'Control', 'Length', 'Position'],
  };
  /* a compiled operand: walks from the tag's value to the member, element or bit on every access */
  let PP = null, PK = null;
  class Ref {
    constructor(o) { Object.assign(this, o); }
    at() {
      let p = this.root, k = this.key;
      for (const s of this.steps) {
        p = p[k];
        if (s.lens) {
          // Tag[i,j,k]: each subscript is checked against its own dimension, then the element is found row by row
          let i = 0;
          for (let n = 0; n < s.lens.length; n++) {
            const x = typeof s.ixs[n] === 'number' ? s.ixs[n] : s.ixs[n].get();
            if (!(x >= 0 && x < s.lens[n])) throw new Fault(4, 20, 'Array subscript too large, or less than 0');
            i = i * s.lens[n] + x;
          }
          k = i;
        } else if (s.len) {
          const i = typeof s.ix === 'number' ? s.ix : s.ix.get();
          if (!(i >= 0 && i < s.len)) throw new Fault(4, 20, 'Array subscript too large, or less than 0');
          k = i;
        } else k = s.m;
      }
      PP = p; PK = k;
    }
    get() { this.at(); const v = PP[PK]; return this.bit < 0 ? v : (v >> this.bit) & 1; }
    set(v) {
      this.at();
      if (this.bit < 0) { PP[PK] = store(this.type, v); return; }
      const x = PP[PK];
      PP[PK] = store(this.ptype, v ? x | (1 << this.bit) : x & ~(1 << this.bit));
      OV = false;
    }
    obj() { this.at(); return PP[PK]; }
  }
  /* an array element or a single tag seen as a "file": element k from the operand on */
  function file(r) {
    r.at(); const a = PP, k0 = PK;
    return Array.isArray(a) ? { n: a.length - k0, g: k => a[k0 + k], s: (k, v) => { a[k0 + k] = v; } } : { n: 1, g: () => a[k0], s: (k, v) => { a[k0] = v; } };
  }
  const BYTES = { SINT: 1, INT: 2, DINT: 4, REAL: 4 };
  const putBytes = (dv, o, t, v) => { if (t === 'SINT') dv.setInt8(o, v); else if (t === 'INT') dv.setInt16(o, v, true); else if (t === 'DINT') dv.setInt32(o, v, true); else dv.setFloat32(o, v, true); };
  const getBytes = (dv, o, t) => (t === 'SINT' ? dv.getInt8(o) : t === 'INT' ? dv.getInt16(o, true) : t === 'DINT' ? dv.getInt32(o, true) : dv.getFloat32(o, true));
  // an operand that names one element of an array (Bits[0], Fifo[Ix]): the instructions that walk an array need it
  const arrEl = r => r.bit < 0 && !r.dim && r.steps.length > 0 && !!r.steps[r.steps.length - 1].len;
  // a value as a FIFO / LIFO moves it: a number, or a copy of a structure; zero keeps the shape (a structure of 0s)
  const take = r => (ATOMIC[r.type] || r instanceof Const ? r.get() : clone(r.obj()));
  const zero = v => (Array.isArray(v) ? v.map(zero) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).map(k => [k, zero(v[k])])) : 0);
  class Const { constructor(v, real) { this.c = v; this.type = real ? 'REAL' : 'DINT'; this.bit = -1; } get() { return this.c; } }

  /* text → Ref, or the reason it is not one (program tags hide controller tags; aliases are followed) */
  function ref(M, prog, text, depth = 0) {
    const p = parsePath(text);
    if (!p) return `Undefined tag '${text}'`;
    const bu = U(p.base);
    if (bu.startsWith('S:')) {
      const f = bu.slice(2);
      if (!SFLAGS.includes(f) || p.segs.length) return `Undefined tag '${text}'`;
      return new Ref({ root: M.S, key: f, steps: [], type: 'BOOL', dim: 0, bit: -1, ro: f !== 'V' && f !== 'MINOR', norm: 'S:' + f });
    }
    let scope = prog, rec = prog && prog.tags.get(bu);
    if (!rec) { scope = null; rec = M.tags.get(bu); }
    if (!rec) return `Undefined tag '${text}'`;
    if (rec.alias) {
      if (depth > 8) return `Alias '${rec.name}' points back to itself`;
      // the status flags are keywords, not tags: no alias can point at one (reference help, Monitor Status Flags)
      if (/^S:/i.test(rec.alias)) return `'${rec.alias}' is a status flag keyword, not a tag: an alias cannot point to it`;
      return ref(M, scope, rec.alias + p.rest, depth + 1);
    }
    let type = rec.type, dim = rec.dim, dims = rec.dims || (rec.dim ? [rec.dim] : []), bit = -1, ptype = null, norm = (scope ? scope.name + '/' : '') + rec.name;
    const steps = [];
    for (const s of p.segs) {
      if (bit >= 0) return `Undefined tag '${text}'`;
      if (s.i !== undefined) {
        if (!dim) return `Tag '${rec.name}' is not an array here: '${text}'`;
        // one subscript for each dimension of the array: [5], [2,8], [3,2,7] (1756-PM004)
        const parts = s.i.split(',').map(x => x.trim());
        if (parts.length !== dims.length) return `Wrong number of subscripts in '${text}': '${rec.name}' has ${dims.length} dimension${dims.length > 1 ? 's' : ''} (e.g. ${rec.name}[${dims.map(() => 0).join(',')}])`;
        const ixs = [];
        for (let n = 0; n < parts.length; n++) {
          const c = parseNumber(parts[n]);
          if (c) {
            if (c.real || c.v < 0 || c.v >= dims[n]) return `Array subscript out of range in '${text}' (0 to ${dims[n] - 1})`;
            ixs.push(c.v);
          } else {
            const r = ref(M, prog, parts[n], depth);
            if (typeof r === 'string') return r;
            if (!isInt(r.type) || r.dim) return `Array subscript must be an integer: '${parts[n]}'`;
            ixs.push(r); norm = null;
          }
        }
        if (norm) norm += `[${ixs.join(',')}]`;
        steps.push(dims.length === 1 ? { ix: ixs[0], len: dim } : { ixs, lens: dims, len: dim });
        dim = 0; dims = [];
        continue;
      }
      if (dim) return `Tag '${rec.name}' is an array: give a subscript, e.g. ${rec.name}[${dims.map(() => 0).join(',')}]`;
      if (s.b !== undefined) {
        if (!isInt(type) || s.b >= ATOMIC[type]) return `Undefined tag '${text}'`;
        bit = s.b; ptype = type; type = 'BOOL';
        if (norm) norm += '.' + s.b;
        continue;
      }
      const d = M.types.get(U(type)), mm = d && d.map.get(U(s.m));
      if (!mm) return `Undefined tag '${text}'`;
      steps.push({ m: mm.name });
      type = mm.type; dim = mm.dim || 0; dims = dim ? [dim] : [];
      if (norm) norm += '.' + mm.name;
    }
    const io = rec.io || null;
    const force = io && steps.length === 1 && steps[0].m === 'Data' && bit >= 0 ? `${io.slot}:${io.dir}:${bit}` : null;
    // a constant tag (and its members, elements, bits and aliases) cannot be written by logic (help: Constant)
    return new Ref({ root: scope ? scope.vals : M.vals, key: rec.name, steps, type, dim, dims, bit, ptype, ro: false, konst: rec.constant ? rec.name : null,
      input: !!(io && io.dir === 'I'), io, force, norm: norm && U(norm) });
  }

  /* ---------- CPT / CMP expressions ---------- */
  /* + - * / MOD ** AND OR XOR NOT, = <> < <= > >=, ( ), SQR ABS NEG SIN COS LN LOG → { get(), type } or an error text.
     Integers only: / and MOD truncate as in the controller; any REAL operand or a float function gives a REAL. */
  const FUNCS = { SQR: v => Math.sqrt(Math.abs(v)), ABS: Math.abs, NEG: v => -v, SIN: Math.sin, COS: Math.cos, LN: Math.log, LOG: Math.log10 };
  const REALF = ['SQR', 'SIN', 'COS', 'LN', 'LOG'];
  const LEVELS = [['OR'], ['XOR'], ['AND'], ['=', '<>', '<', '<=', '>', '>='], ['+', '-'], ['*', '/', 'MOD']];
  function compileExpr(M, prog, src) {
    const s = String(src), toks = [];
    for (let i = 0; i < s.length;) {
      const rest = s.slice(i);
      let m;
      if (/^\s/.test(rest)) { i++; continue; }
      if ((m = /^(?:(?:2|8|16)#[0-9A-Fa-f_]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+)/.exec(rest))) toks.push({ k: 'num', s: m[0] });
      else if ((m = /^[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z0-9_]+)*(?:\.[A-Za-z0-9_]+|\[[^\]]*\])*/.exec(rest))) {
        const u = U(m[0]);
        toks.push(['MOD', 'AND', 'OR', 'XOR', 'NOT'].includes(u) ? { k: 'op', s: u } : { k: 'name', s: m[0] });
      } else if ((m = /^(\*\*|<>|<=|>=|[-+*/()=<>])/.exec(rest))) toks.push({ k: 'op', s: m[1] });
      else return `Invalid expression: unexpected '${rest[0]}'`;
      i += m[0].length;
    }
    let p = 0;
    const is = (t, ...ops) => t && t.k === 'op' && ops.includes(t.s);
    const node = (get, real) => ({ get, type: real ? 'REAL' : 'DINT' });
    const close = () => { if (!is(toks[p++], ')')) throw 'Invalid expression: ) is missing'; };
    function primary() {
      const t = toks[p++];
      if (!t) throw 'Invalid expression: it ends too early';
      if (t.k === 'num') { const c = parseNumber(t.s); if (!c) throw `Invalid number '${t.s}'`; const v = c.v; return node(() => v, c.real); }
      if (is(t, '(')) { const n = expr(0); close(); return n; }
      if (t.k === 'name') {
        const u = U(t.s);
        if (FUNCS[u] && is(toks[p], '(')) {
          p++;
          const a = expr(0), f = FUNCS[u], g = a.get;
          close();
          return node(() => f(g()), REALF.includes(u) || a.type === 'REAL');
        }
        const r = ref(M, prog, t.s);
        if (typeof r === 'string') throw r;
        if ((!isNum(r.type) && r.type !== 'BOOL') || r.dim) throw `'${t.s}' is not a number`;
        return node(() => r.get(), r.type === 'REAL');
      }
      throw `Invalid expression near '${t.s}'`;
    }
    function power() {
      const a = primary();
      if (!is(toks[p], '**')) return a;
      p++;
      const b = unary(), A = a.get, B = b.get;
      return node(() => Math.pow(A(), B()), a.type === 'REAL' || b.type === 'REAL');
    }
    function unary() {
      if (is(toks[p], '-')) { p++; const a = unary(), A = a.get; return node(() => -A(), a.type === 'REAL'); }
      if (is(toks[p], '+')) { p++; return unary(); }
      if (is(toks[p], 'NOT')) { p++; const a = unary(), A = a.get; return node(() => ~i32(A()), false); }
      return power();
    }
    function bin(op, a, b) {
      const real = a.type === 'REAL' || b.type === 'REAL', A = a.get, B = b.get;
      switch (op) {
        case '+': return node(() => A() + B(), real);
        case '-': return node(() => A() - B(), real);
        case '*': return node(() => A() * B(), real);
        case '/': return real ? node(() => { const y = B(); if (y === 0) DIV0 = true; return A() / y; }, true)
          : node(() => { const y = B(); if (y === 0) { DIV0 = true; return 0; } return Math.trunc(A() / y); }, false);
        case 'MOD': return node(() => { const x = A(), y = B(); if (y === 0) { DIV0 = true; return 0; } return real ? x - y * Math.trunc(x / y) : x % y; }, real);
        case 'AND': return node(() => i32(A()) & i32(B()), false);
        case 'OR': return node(() => i32(A()) | i32(B()), false);
        case 'XOR': return node(() => i32(A()) ^ i32(B()), false);
        case '=': return node(() => (A() === B() ? 1 : 0), false);
        case '<>': return node(() => (A() !== B() ? 1 : 0), false);
        case '<': return node(() => (A() < B() ? 1 : 0), false);
        case '<=': return node(() => (A() <= B() ? 1 : 0), false);
        case '>': return node(() => (A() > B() ? 1 : 0), false);
        default: return node(() => (A() >= B() ? 1 : 0), false);
      }
    }
    function expr(lv) {
      if (lv === LEVELS.length) return unary();
      let a = expr(lv + 1);
      while (toks[p] && toks[p].k === 'op' && LEVELS[lv].includes(toks[p].s)) { const op = toks[p++].s; a = bin(op, a, expr(lv + 1)); }
      return a;
    }
    try {
      if (!toks.length) return 'Missing operand';
      const n = expr(0);
      if (p < toks.length) return `Invalid expression near '${toks[p].s}'`;
      return n;
    } catch (e) { if (typeof e === 'string') return e; throw e; }
  }

  /* ---------- Instruction set ---------- */
  /* operand kinds: bit / bitw (BOOL to read / to write), timer, counter, struct (any of the three), imm (a number),
     num / int (a number or a tag), dest / idest (a tag to write), expr, elem / elemw (an array element), routine,
     label, order (SWPB), control (a CONTROL tag), darr (an element of a DINT array, to write), fsrc / farr / fdst
     (the Source, the array element and the Dest of a FIFO or LIFO: SINT, INT, DINT, REAL or a structure), ddest (a
     DINT tag to write); a ? at the end makes the operand optional. ctl is the index of the CONTROL operand; live maps the Length / Position operands to the
     .LEN / .POS they show (written into the tag on download, as the reference does) */
  const I = (k, grp, name, args, more) => ({ k, grp, name, args: args ? args.split(' ') : [], ...more });
  const INSTR = {
    XIC: I('contact', 'Bit', 'Examine If Closed', 'bit'),
    XIO: I('contact', 'Bit', 'Examine If Open', 'bit'),
    OTE: I('coil', 'Bit', 'Output Energize', 'bitw', { out: true }),
    OTL: I('coil', 'Bit', 'Output Latch', 'bitw', { out: true, lbl: 'L' }),
    OTU: I('coil', 'Bit', 'Output Unlatch', 'bitw', { out: true, lbl: 'U' }),
    ONS: I('contact', 'Bit', 'One Shot', 'bitw'),
    OSR: I('box', 'Bit', 'One Shot Rising', 'bitw bitw', { out: true }),
    OSF: I('box', 'Bit', 'One Shot Falling', 'bitw bitw', { out: true }),
    TON: I('box', 'Timer/Counter', 'Timer On Delay', 'timer imm imm', { out: true, bits: ['EN', 'DN'] }),
    TOF: I('box', 'Timer/Counter', 'Timer Off Delay', 'timer imm imm', { out: true, bits: ['EN', 'DN'] }),
    RTO: I('box', 'Timer/Counter', 'Retentive Timer On', 'timer imm imm', { out: true, bits: ['EN', 'DN'] }),
    CTU: I('box', 'Timer/Counter', 'Count Up', 'counter imm imm', { out: true, bits: ['CU', 'DN'] }),
    CTD: I('box', 'Timer/Counter', 'Count Down', 'counter imm imm', { out: true, bits: ['CD', 'DN'] }),
    RES: I('coil', 'Timer/Counter', 'Reset', 'struct', { out: true, lbl: 'RES' }),
    EQU: I('box', 'Compare', 'Equal', 'num num'),
    NEQ: I('box', 'Compare', 'Not Equal', 'num num'),
    LES: I('box', 'Compare', 'Less Than (A<B)', 'num num'),
    LEQ: I('box', 'Compare', 'Less Than or Equal (A<=B)', 'num num'),
    GRT: I('box', 'Compare', 'Greater Than (A>B)', 'num num'),
    GEQ: I('box', 'Compare', 'Greater Than or Equal (A>=B)', 'num num'),
    LIM: I('box', 'Compare', 'Limit Test', 'num num num'),
    MEQ: I('box', 'Compare', 'Mask Equal', 'int int int'),
    CMP: I('box', 'Compare', 'Compare', 'expr'),
    ADD: I('box', 'Compute/Math', 'Add', 'num num dest', { out: true }),
    SUB: I('box', 'Compute/Math', 'Subtract', 'num num dest', { out: true }),
    MUL: I('box', 'Compute/Math', 'Multiply', 'num num dest', { out: true }),
    DIV: I('box', 'Compute/Math', 'Divide', 'num num dest', { out: true }),
    MOD: I('box', 'Compute/Math', 'Modulo', 'num num dest', { out: true }),
    SQR: I('box', 'Compute/Math', 'Square Root', 'num dest', { out: true }),
    NEG: I('box', 'Compute/Math', 'Negate', 'num dest', { out: true }),
    ABS: I('box', 'Compute/Math', 'Absolute Value', 'num dest', { out: true }),
    CPT: I('box', 'Compute/Math', 'Compute', 'dest expr', { out: true }),
    MOV: I('box', 'Move/Logical', 'Move', 'num dest', { out: true }),
    MVM: I('box', 'Move/Logical', 'Masked Move', 'int int idest', { out: true }),
    CLR: I('box', 'Move/Logical', 'Clear', 'dest', { out: true }),
    AND: I('box', 'Move/Logical', 'Bitwise And', 'int int idest', { out: true }),
    OR: I('box', 'Move/Logical', 'Bitwise Inclusive Or', 'int int idest', { out: true }),
    XOR: I('box', 'Move/Logical', 'Bitwise Exclusive Or', 'int int idest', { out: true }),
    NOT: I('box', 'Move/Logical', 'Bitwise Not', 'int idest', { out: true }),
    BTD: I('box', 'Move/Logical', 'Bit Field Distribute', 'int imm idest imm imm', { out: true }),
    SWPB: I('box', 'Move/Logical', 'Swap Byte', 'int order idest', { out: true }),
    COP: I('box', 'File/Misc', 'Copy File', 'elem elemw imm', { out: true }),
    FLL: I('box', 'File/Misc', 'File Fill', 'num elemw imm', { out: true }),
    // Array (File)/Shift (1756-RM003 chapter 9): transitional, they act on a false-to-true rung
    BSL: I('box', 'File/Shift', 'Bit Shift Left', 'darr control bit imm', { out: true, bits: ['EN', 'DN'], ctl: 1, live: { 3: 'LEN' } }),
    BSR: I('box', 'File/Shift', 'Bit Shift Right', 'darr control bit imm', { out: true, bits: ['EN', 'DN'], ctl: 1, live: { 3: 'LEN' } }),
    FFL: I('box', 'File/Shift', 'FIFO Load', 'fsrc farr control imm imm', { out: true, bits: ['EN', 'DN', 'EM'], ctl: 2, live: { 3: 'LEN', 4: 'POS' } }),
    FFU: I('box', 'File/Shift', 'FIFO Unload', 'farr fdst control imm imm', { out: true, bits: ['EU', 'DN', 'EM'], ctl: 2, live: { 3: 'LEN', 4: 'POS' } }),
    LFL: I('box', 'File/Shift', 'LIFO Load', 'fsrc farr control imm imm', { out: true, bits: ['EN', 'DN', 'EM'], ctl: 2, live: { 3: 'LEN', 4: 'POS' } }),
    LFU: I('box', 'File/Shift', 'LIFO Unload', 'farr fdst control imm imm', { out: true, bits: ['EU', 'DN', 'EM'], ctl: 2, live: { 3: 'LEN', 4: 'POS' } }),
    // Sequencer (1756-RM003 chapter 10): normally one CONTROL for the SQO, SQI and SQL of a sequence
    SQI: I('box', 'Sequencer', 'Sequencer Input', 'darr int int control imm imm', { ctl: 3, live: { 4: 'LEN', 5: 'POS' } }),
    SQO: I('box', 'Sequencer', 'Sequencer Output', 'darr int ddest control imm imm', { out: true, bits: ['EN', 'DN'], ctl: 3, live: { 4: 'LEN', 5: 'POS' } }),
    SQL: I('box', 'Sequencer', 'Sequencer Load', 'darr int control imm imm', { out: true, bits: ['EN', 'DN'], ctl: 2, live: { 3: 'LEN', 4: 'POS' } }),
    JSR: I('box', 'Program Control', 'Jump to Subroutine', 'routine imm?', { out: true }),
    RET: I('box', 'Program Control', 'Return from Subroutine', '', { out: true }),
    SBR: I('box', 'Program Control', 'Subroutine', ''),
    JMP: I('coil', 'Program Control', 'Jump to Label', 'label', { out: true, lbl: 'JMP' }),
    LBL: I('contact', 'Program Control', 'Label', 'label'),
    MCR: I('coil', 'Program Control', 'Master Control Reset', '', { out: true, lbl: 'MCR' }),
    AFI: I('contact', 'Program Control', 'Always False', ''),
    NOP: I('box', 'Program Control', 'No Operation', ''),
    TND: I('box', 'Program Control', 'Temporary End', '', { out: true }),
  };
  const BAD_TYPE = 'Invalid data type. Argument must match parameter data type';
  const BITS = t => (t === 'REAL' ? 0 : ATOMIC[t] || 32);

  function operand(M, P, kind, text) {
    const s = String(text == null ? '' : text).trim();
    if (s === '' || s === '?') return 'Missing operand';
    switch (kind) {
      case 'imm': { const c = parseNumber(s); return c ? new Const(c.v, c.real) : 'Immediate value expected'; }
      case 'label': return validName(s) ? { label: U(s) } : `Invalid label name '${s}'`;
      case 'routine': return P.routines.get(U(s)) || `Undefined routine '${s}'`;
      case 'order': return ['REVERSE', 'WORD', 'HIGH/LOW'].includes(U(s)) ? { order: U(s) } : 'Order mode must be REVERSE, WORD or HIGH/LOW';
      case 'expr': return compileExpr(M, P, s);
    }
    const c = parseNumber(s);
    if (c) {
      if (kind === 'num' || kind === 'fsrc' || (kind === 'int' && !c.real)) return new Const(c.v, c.real);
      return kind === 'int' ? BAD_TYPE : 'Immediate value not allowed';
    }
    const r = ref(M, P, s);
    if (typeof r === 'string') return r;
    const one = !r.dim;
    // "If a logic routine tries to write to a constant tag, the routine does not verify" (help: Tag Editor columns)
    const writable = () => (r.ro ? 'Tag is read-only' : r.konst ? `Tag '${r.konst}' is a constant: logic cannot write to it` : r);
    switch (kind) {
      case 'bit': return r.type === 'BOOL' && one ? r : BAD_TYPE;
      case 'bitw': return r.type === 'BOOL' && one ? writable() : BAD_TYPE;
      case 'timer': return r.type === 'TIMER' && one ? r : BAD_TYPE;
      case 'counter': return r.type === 'COUNTER' && one ? r : BAD_TYPE;
      case 'struct': return ['TIMER', 'COUNTER', 'CONTROL'].includes(r.type) && one ? r : BAD_TYPE;
      case 'control': return r.type === 'CONTROL' && one ? writable() : BAD_TYPE;
      case 'darr': if (!arrEl(r)) return 'Operand must be an array element, e.g. Bits[0]'; return r.type === 'DINT' ? writable() : BAD_TYPE;
      case 'farr': if (!arrEl(r)) return 'Operand must be an array element, e.g. Fifo[0]'; return r.type !== 'BOOL' ? writable() : BAD_TYPE;
      case 'fsrc': return one && r.bit < 0 && r.type !== 'BOOL' ? r : BAD_TYPE;
      case 'fdst': return one && r.bit < 0 && r.type !== 'BOOL' ? writable() : BAD_TYPE;
      case 'ddest': return r.type === 'DINT' && one ? writable() : BAD_TYPE;
      case 'num': return isNum(r.type) && one ? r : BAD_TYPE;
      case 'int': return isInt(r.type) && one ? r : BAD_TYPE;
      case 'dest': return isNum(r.type) && one ? writable() : BAD_TYPE;
      case 'idest': return isInt(r.type) && one ? writable() : BAD_TYPE;
      case 'elem': case 'elemw': {
        const last = r.steps[r.steps.length - 1];
        if (!one || r.bit >= 0) return 'Operand must be a tag or an array element, e.g. Tank[0]';
        return kind === 'elemw' ? writable() : r;
      }
    }
    return r;
  }

  /* checks one instruction and compiles its operands; E / W report an error / warning on it */
  function compileElem(M, P, R, e, n, first, E, W, jumps) {
    const d = INSTR[e.t];
    if (!d) { E(`Unknown instruction '${e.t}'`); return null; }
    const need = d.args.filter(a => !a.endsWith('?')).length;
    if (e.a.length < need || e.a.length > d.args.length) { E(`Wrong number of operands (${need} expected)`, e.t); return null; }
    const x = [];
    let ok = true;
    d.args.forEach((kind, k) => {
      if (k >= e.a.length) return;
      const r = operand(M, P, kind.replace('?', ''), e.a[k]);
      if (typeof r === 'string') { E(r, e.t, k); ok = false; } else x[k] = r;
    });
    if (!ok) return null;
    const bad = (msg, k) => { E(msg, e.t, k); ok = false; };
    switch (e.t) {
      case 'TON': case 'TOF': case 'RTO':
        if (x[1].c < 0 || x[1].type === 'REAL') bad('Preset must be a whole number, 0 or more', 1);
        if (x[2].c < 0 || x[2].type === 'REAL') bad('Accum must be a whole number, 0 or more', 2);
        break;
      case 'CTU': case 'CTD':
        if (x[1].type === 'REAL' || x[2].type === 'REAL') bad('Preset and Accum are whole numbers', x[1].type === 'REAL' ? 1 : 2);
        break;
      // COP copies bytes: the same type, or two of SINT, INT, DINT and REAL
      case 'COP': if (x[0].type !== x[1].type && !(isNum(x[0].type) && isNum(x[1].type))) bad(BAD_TYPE, 1); break;
      case 'FLL': if (!isNum(x[1].type)) bad(BAD_TYPE, 1); break;
      case 'BTD': {
        const len = x[4].c;
        if (len < 1) bad('Length must be 1 or more', 4);
        if (len > 32) bad('Length must be 32 or less', 4);
        if (x[1].c < 0 || x[1].c >= BITS(x[0].type)) bad('Source bit must be a bit of the source', 1);
        if (x[3].c < 0 || x[3].c >= BITS(x[2].type)) bad('Dest bit must be a bit of the dest', 3);
        break;
      }
      case 'SWPB': if (x[0].type === 'SINT' || x[2].type === 'SINT') bad(BAD_TYPE, x[0].type === 'SINT' ? 0 : 2); break;
      // a number Source / Dest is converted to the type of the array; a structure must be the array's own type
      case 'FFL': case 'FFU': case 'LFL': case 'LFU': {
        const ld = e.t.endsWith('L'), arr = ld ? x[1] : x[0], o = ld ? x[0] : x[1];
        if (isNum(arr.type) ? !isNum(o.type) : o.type !== arr.type) bad(BAD_TYPE, ld ? 0 : 1);
        break;
      }
      case 'LBL':
        if (!first) bad('LBL must be the first instruction of the rung', 0);
        if (R.labels.has(x[0].label)) bad(`Label '${e.a[0]}' is defined more than once`, 0); else R.labels.set(x[0].label, n);
        break;
      case 'JMP': jumps.push({ label: x[0].label, text: e.a[0], n }); break;
    }
    if ((e.t === 'TON' || e.t === 'TOF' || e.t === 'RTO' || e.t === 'CTU' || e.t === 'CTD') && ok) {
      // the preset and accum of the rung text are written into the tag
      try { const s = x[0].obj(); s.PRE = x[1].c; s.ACC = x[2].c; } catch (err) { if (!(err instanceof Fault)) throw err; }
    }
    if (d.live && ok) {
      // Length / Position are the .LEN / .POS of the CONTROL: whole numbers, written into the tag (as a timer's preset)
      for (const k in d.live) if (x[k] && x[k].type === 'REAL') bad(`${OPN[e.t][k]} must be a whole number`, +k);
      if (ok) try { const s = x[d.ctl].obj(); for (const k in d.live) s[d.live[k]] = x[k].c; } catch (err) { if (!(err instanceof Fault)) throw err; }
    }
    if ((e.t === 'OTE' || e.t === 'OTL' || e.t === 'OTU') && x[0].input) W('Writing to an input image: the next input update overwrites it', e.t, 0);
    if (e.t === 'OTE' && x[0].norm) {
      const prev = M.otes.get(x[0].norm);
      if (prev) W(`Duplicate destructive bit reference to '${e.a[0]}' (also in rung ${prev.n} of routine '${prev.routine}')`, 'OTE', 0);
      else M.otes.set(x[0].norm, { n, routine: R.name });
    }
    return ok ? { t: e.t, a: e.a, x, v: false } : null;
  }

  /* ---------- Build (verify and compile) ---------- */
  /* the whole project → { errors, warnings, lines, model }; filter { program, routine } verifies one routine */
  function build(project, filter) {
    const pj = project || {}, out = { errors: [], warnings: [], lines: [] };
    const ctlErr = msg => {
      if (filter) return;
      const text = 'Error: ' + dot(msg);
      out.errors.push({ msg: dot(msg), text });
      out.lines.push(text);
    };
    const ctl = pj.controller || {};
    if (!validName(ctl.name)) ctlErr(`Invalid controller name '${ctl.name || ''}'`);
    const types = typeTable(pj, ctlErr);
    const M = { name: ctl.name || '', types, tags: new Map(), vals: {}, S: { FS: 0, N: 0, Z: 0, V: 0, C: 0, MINOR: 0 }, mods: new Map(), programs: [], otes: new Map() };

    const rack = pj.rack || {};
    const okSize = n => RACKS.includes(n) || OLDRACKS.includes(n);
    const size = okSize(rack.size) ? rack.size : 8;
    if (rack.size != null && !okSize(rack.size)) ctlErr(`Rack size ${rack.size} does not exist (4 or 8 slots)`);
    const cslot = Number.isInteger(ctl.slot) ? ctl.slot : 0;
    if (!(cslot >= 0 && cslot < size)) ctlErr(`The controller's slot ${cslot} is not in the ${size}-slot rack`);
    M.slot = cslot;
    for (const m of rack.modules || []) {
      const d = MODULES[m.type];
      if (!d) { ctlErr(`Module in slot ${m.slot}: unknown module type '${m.type}'`); continue; }
      if (!(Number.isInteger(m.slot) && m.slot >= 0 && m.slot < size)) { ctlErr(`Module '${m.name}': slot ${m.slot} is not in the ${size}-slot rack (slots 0 to ${size - 1})`); continue; }
      if (m.slot === cslot) { ctlErr(`Module '${m.name}': slot ${m.slot} holds the controller`); continue; }
      if (M.mods.has(m.slot)) { ctlErr(`Slot ${m.slot} has more than one module`); continue; }
      if (m.name != null && m.name !== '' && !validName(m.name)) ctlErr(`Invalid module name '${m.name}'`);
      const mod = { slot: m.slot, type: m.type, name: m.name || '', kind: d.kind, inhibit: !!m.inhibit, majorOnFail: !!m.majorOnFail, rpi: m.rpi > 0 ? +m.rpi : 20 };
      for (const dir of IODIRS) {
        if (!d[dir]) continue;
        const name = `Local:${m.slot}:${dir}`;
        mod[dir] = name;
        M.tags.set(U(name), { name, type: d[dir], dim: 0, io: { slot: m.slot, dir } });
        M.vals[name] = make(types, d[dir], 0);
      }
      M.mods.set(m.slot, mod);
    }

    const addTags = (list, P) => {
      const map = P ? P.tags : M.tags, vals = P ? P.vals : M.vals, where = P ? ` in program '${P.name}'` : '';
      for (const t of list || []) {
        if (!validName(t.name)) { ctlErr(`Invalid tag name '${t.name}'${where}`); continue; }
        if (map.has(U(t.name))) { ctlErr(`Tag '${t.name}' is defined more than once${where}`); continue; }
        if (t.alias != null && t.alias !== '') { map.set(U(t.name), { name: t.name, alias: String(t.alias).trim(), desc: t.desc || '' }); continue; }
        const type = canon(types, t.type);
        if (!type) { ctlErr(`Tag '${t.name}': Undefined data type '${t.type}'`); continue; }
        const dims = dimsOf(Array.isArray(t.dim) ? t.dim : t.dim > 0 ? Math.floor(t.dim) : 0);
        if (!dims) { ctlErr(`Tag '${t.name}': invalid array dimensions [${String(t.dim)}] (1 to 3 dimensions, each 1 or more)`); continue; }
        const dim = dims.reduce((x, y) => x * y, dims.length ? 1 : 0);
        map.set(U(t.name), { name: t.name, type, dim, dims, constant: !!t.constant, desc: t.desc || '' });
        vals[t.name] = conform(types, type, dim, t.value);
      }
    };
    addTags(pj.tags, null);

    const progNames = new Set();
    for (const task of pj.tasks || []) for (const pg of task.programs || []) {
      if (!validName(pg.name) || progNames.has(U(pg.name))) { ctlErr(`Invalid or repeated program name '${pg.name}'`); continue; }
      progNames.add(U(pg.name));
      const P = { name: pg.name, tags: new Map(), vals: {}, routines: new Map(), main: null, inhibit: !!(pg.inhibit || task.inhibit) };
      addTags(pg.tags, P);
      for (const r of pg.routines || []) {
        if (!validName(r.name) || P.routines.has(U(r.name))) { ctlErr(`Invalid or repeated routine name '${r.name}' in program '${pg.name}'`); continue; }
        P.routines.set(U(r.name), { name: r.name, src: r.rungs || [], rungs: [], labels: new Map() });
      }
      P.main = P.routines.get(U(pg.main || '')) || null;
      if (pg.main && !P.main) ctlErr(`Program '${pg.name}': the main routine '${pg.main}' does not exist`);
      M.programs.push(P);
    }

    // aliases point at a tag, a member or a bit that exists; they take its data type
    const aliases = (map, P) => {
      for (const rec of map.values()) {
        if (!rec.alias) continue;
        const r = ref(M, P, rec.name);
        if (typeof r === 'string') { ctlErr(`Tag '${rec.name}': Alias for '${rec.alias}' is not a valid tag (${r})`); continue; }
        if (r.steps.some(s => (s.lens ? s.ixs.some(x => typeof x !== 'number') : s.len && typeof s.ix !== 'number'))) { ctlErr(`Tag '${rec.name}': an alias cannot use a tag as a subscript`); continue; }
        rec.type = r.type; rec.dim = r.dim; rec.dims = r.dims;
      }
    };
    aliases(M.tags, null);
    M.programs.forEach(P => aliases(P.tags, P));

    for (const P of M.programs) for (const R of P.routines.values()) {
      const want = !filter || ((!filter.program || U(filter.program) === U(P.name)) && (!filter.routine || U(filter.routine) === U(R.name)));
      if (want) out.lines.push(`Verifying routine '${R.name}' of program '${P.name}'...`);
      const report = (list, kind) => (n, msg, mnem, op) => {
        if (!want) return;
        const text = `${kind}: Rung ${n}${mnem ? ', ' + mnem : ''}${op != null ? ', Operand ' + op : ''}: ${dot(msg)}`;
        list.push({ program: P.name, routine: R.name, rung: n, mnem, op, msg: dot(msg), text });
        out.lines.push(text);
      };
      const err = report(out.errors, 'Error'), warn = report(out.warnings, 'Warning'), jumps = [];
      R.src.forEach((src, n) => {
        const text = String(src && (src.t != null ? src.t : src.text) || '');
        const rung = { n, text, c: (src && src.c) || '', elems: [] };
        R.rungs.push(rung);
        // an online edit zone that does not run in the new logic (r/R: the original of an edited rung, D: a deleted
        // rung) is shown but not verified or executed (Studio 5000: "the replace zones and delete zones are not executed")
        if (src && /^[rRD]$/.test(src.z || '')) { rung.zone = src.z; return; }
        const pr = parseRung(text);
        if (pr.err) { err(n, pr.err); return; }
        if (!pr.elems.length) { err(n, 'Rung has no instructions'); return; }
        const walk = (arr, top) => arr.map((e, k) => {
          if (e.t === 'BR') return { t: 'BR', legs: e.legs.map(l => walk(l, false)) };
          if (e.t === 'MCR' && !(top && k === arr.length - 1)) err(n, 'MCR must be the last instruction of the rung', 'MCR');
          return compileElem(M, P, R, e, n, top && k === 0, (m, mn, op) => err(n, m, mn, op), (m, mn, op) => warn(n, m, mn, op), jumps);
        });
        rung.elems = walk(pr.elems, true);
      });
      for (const j of jumps) if (!R.labels.has(j.label)) err(j.n, `Undefined label '${j.text}'`, 'JMP', 0);
    }
    out.lines.push(`Complete - ${out.errors.length} error(s), ${out.warnings.length} warning(s)`);
    out.model = M;
    return out;
  }
  function verify(project, filter) { const r = build(project, filter); delete r.model; return r; }
  function dataTypes(project) {
    const t = typeTable(project), of = k => [...t.values()].filter(d => d.kind === k).map(d => d.name);
    return { atomic: Object.keys(ATOMIC), predefined: of('predefined'), moduleDefined: of('module'), userDefined: of('user') };
  }

  /* the project without tag values and name: values that differ (a running controller, Upload Tag Values) are not edits;
     nor is a tag's Style, which only sets how a value is shown */
  // the project name is the file's name: an upload saved under another name still holds the same logic
  const logicKey = p => JSON.stringify(p, (k, v) => (k === 'value' || k === 'desc' || k === 'comments' || k === 'c' || k === 'dx' || k === 'style' ? undefined : k === 'controller' && v && typeof v === 'object' ? { type: v.type, rev: v.rev } : v));

  /* the .EM / .DN of a FIFO or LIFO from its .POS and .LEN (RM003 flow charts, Prescan and false): .LEN <= 0 or
     .POS < 0 set both; else .EM while .POS = 0 and .DN while .POS >= .LEN */
  function fstat(c) {
    if (c.LEN <= 0 || c.POS < 0) { c.EM = c.DN = 1; return; }
    c.EM = c.POS === 0 ? 1 : 0; c.DN = c.POS >= c.LEN ? 1 : 0;
  }

  // a sequencer Mask: a SINT or INT is zero extended to a DINT (RM003, SQI Mask)
  const maskOf = r => { const v = i32(r.get()); return r.type === 'SINT' ? v & 0xFF : r.type === 'INT' ? v & 0xFFFF : v; };

  /* ---------- Controller ---------- */
  // modes where the logic executes; Remote Test executes it with the outputs held off
  const RUN = m => m === 'run' || m === 'remrun' || m === 'remtest';
  class Controller {
    constructor() {
      this.key = 'REM';            // PROG | REM | RUN
      this.mode = 'remprog';       // prog | run | remprog | remrun | remtest
      this.M = null; this.S = { FS: 0, N: 0, Z: 0, V: 0, C: 0, MINOR: 0 };
      this.name = ''; this.copy = null; this.fault = null;
      this.phys = {};              // inputs from the field per slot (bits of a discrete card, channels of an analog card)
      this.forces = new Map();     // 'slot:dir:bit' → 0 / 1
      this.fm = {};                // 'slot:dir' → { mask, value }
      this.forcesOn = false;
      this.period = 10; this.acc = 0; this.dt = 10; this.scans = 0; this.first = true;
      this.d = 0; this.ret = false; this.jmp = null; this.tnd = false; this.mcr = false;
      this.ls = []; this.refs = new Map();
      this.pulled = new Set();     // slots whose card is taken out (a simulated module fault)
      this.codes = new Map();      // slot → fault code given by the chassis (no card, wrong card)
      this.majors = []; this.minors = [];   // fault logs for Controller Properties
      this.powered = true;         // power: an emulated controller that is off keeps its project but does not run or answer
      this.sot = 100;              // Logix Emulate speed of time, % of real time (0 stops execution; timers and the scan follow it)
      this.single = false; this.held = false;   // Logix Emulate Single Scan mode; held: the one scan is done, waiting
    }
    on(type, fn) { const l = [type, fn]; this.ls.push(l); return () => { this.ls = this.ls.filter(x => x !== l); }; }
    emit(what) { for (const [t, f] of this.ls) if (t === 'change') f({ what, controller: this }); }
    get running() { return RUN(this.mode) && !this.fault && !!this.M; }

    /* ---------- modes ---------- */
    go(m) {
      if (m === this.mode) return;
      const was = RUN(this.mode);
      this.mode = m;
      if (!was && RUN(m) && this.M) this.prescan();
      this.emit('mode');
    }
    /* Single Scan (Logix Emulate only, not on a physical controller): in Run the logic runs through once, then waits
       until it is asked to scan again or to run continuously */
    singleScan(on) { this.single = !!on; this.held = false; this.emit('mode'); }
    scanAgain() { if (!this.single) return false; this.held = false; this.emit('mode'); return true; }
    runContinuous() { this.single = false; this.held = false; this.emit('mode'); }
    setMode(m) {
      if (this.key !== 'REM' || !['remprog', 'remrun', 'remtest'].includes(m) || (m !== 'remprog' && !this.M)) return false;
      this.go(m);
      return true;
    }
    setKey(k) {
      if (!['PROG', 'REM', 'RUN'].includes(k) || k === this.key) return;
      this.key = k;
      if (k === 'PROG') this.go('prog');
      else if (k === 'RUN') this.go('run');
      else this.go(this.mode === 'run' ? 'remrun' : 'remprog');
      this.emit('key');
    }
    majorFault(type, code, text) {
      this.fault = { type, code, text, at: Date.now() };
      this.majors.unshift(this.fault);
      this.majors.length = Math.min(this.majors.length, 10);
      this.emit('fault');
    }
    minorFault(type, code, text) {
      const last = this.minors[0];
      if (last && last.type === type && last.code === code && last.text === text) { last.count++; last.at = Date.now(); return; }
      this.minors.unshift({ type, code, text, at: Date.now(), count: 1 });
      this.minors.length = Math.min(this.minors.length, 10);
    }
    clearMinors() { this.minors = []; this.emit('fault'); }
    clearFault() {
      if (!this.fault) return;
      this.fault = null;
      const to = this.key === 'REM' ? 'remprog' : this.key === 'PROG' ? 'prog' : 'run';
      this.mode = to;
      if (RUN(to)) this.prescan();
      this.emit('fault');
      this.emit('mode');
    }
    /* Program → Run: OTE bits off, TON reset, one-shot storage set so a true input does not fire at start */
    prescan() {
      this.first = true; this.held = false;
      const walk = arr => {
        for (const e of arr) {
          if (!e) continue;
          if (e.t === 'BR') { e.legs.forEach(walk); continue; }
          const x = e.x;
          try {
            switch (e.t) {
              case 'OTE': x[0].set(0); break;
              case 'ONS': x[0].set(1); break;
              case 'OSR': x[0].set(1); x[1].set(0); break;
              case 'OSF': x[0].set(0); x[1].set(0); break;
              case 'TON': { const s = x[0].obj(); s.EN = s.TT = s.DN = 0; s.ACC = 0; break; }
              case 'TOF': { const s = x[0].obj(); s.EN = s.TT = s.DN = 0; s.ACC = s.PRE; break; }
              case 'RTO': { const s = x[0].obj(); s.EN = s.TT = 0; break; }
              case 'CTU': x[0].obj().CU = 1; break;
              case 'CTD': x[0].obj().CD = 1; break;
              case 'BSL': case 'BSR': { const c = x[1].obj(); c.EN = c.DN = c.ER = 0; c.POS = 0; break; }
              // .EN (load) / .EU (unload) set, so a true rung does not load or unload on the first scan
              case 'FFL': case 'LFL': { const c = x[2].obj(); c.EN = 1; fstat(c); break; }
              case 'FFU': case 'LFU': { const c = x[2].obj(); c.EU = 1; fstat(c); break; }
              // .EN set: a rung that is true at the change to Run does not step on the first scan (it stays at .POS)
              case 'SQO': x[3].obj().EN = 1; break;
              case 'SQL': x[2].obj().EN = 1; break;
            }
          } catch (err) { if (!(err instanceof Fault)) throw err; }
        }
      };
      for (const P of this.M.programs) for (const R of P.routines.values()) for (const r of R.rungs) walk(r.elems);
    }

    /* ---------- project ---------- */
    download(project) {
      if (this.key === 'RUN') return { ok: false, errors: [], warnings: [], lines: ['The key switch is in RUN: turn it to REM or PROG to download.'] };
      const r = build(project);
      const res = { ok: !r.errors.length, errors: r.errors, warnings: r.warnings, lines: r.lines };
      if (!res.ok) return res;
      this.M = r.model; this.S = this.M.S; this.name = this.M.name;
      this.copy = JSON.stringify(project); this.dlAt = Date.now();
      this.fault = null; this.forces.clear(); this.fm = {}; this.forcesOn = false; this.refs.clear();
      this.mode = this.key === 'PROG' ? 'prog' : 'remprog';
      this.first = true; this.acc = 0;
      this.emit('download');
      this.emit('mode');
      return res;
    }
    /* a download clears the controller memory before the project goes in (v37 help, Download dialog box): a download
       cancelled after that leaves the controller empty (no name, no project) */
    clearMemory() {
      this.M = null; this.copy = null; this.name = ''; this.dlAt = null;
      this.S = { FS: 0, N: 0, Z: 0, V: 0, C: 0, MINOR: 0 };
      this.fault = null; this.forces.clear(); this.fm = {}; this.forcesOn = false; this.refs.clear();
      this.mode = this.key === 'PROG' ? 'prog' : this.key === 'RUN' ? 'run' : 'remprog';
      this.emit('download'); this.emit('mode');
    }
    /* power: off keeps the project; on starts again like a real controller (RUN key: Run, PROG: Program,
       REM: the mode it had), with the current fault cleared and a prescan before Run */
    power(on) {
      on = !!on;
      if (on === this.powered) return;
      if (!on) { this.wasRun = RUN(this.mode) && !this.fault; this.powered = false; this.emit('power'); return; }
      this.powered = true; this.fault = null; this.acc = 0; this.first = true;
      const to = this.key === 'RUN' ? 'run' : this.key === 'PROG' ? 'prog' : this.wasRun && this.M ? 'remrun' : 'remprog';
      this.mode = to;
      if (RUN(to) && this.M) this.prescan();
      this.emit('power'); this.emit('mode');
    }
    /* online edit (Accept Edits): the new logic replaces the old without a Download. The mode, the forces and the
       values of the tags that keep their name and type stay; new tags start from their start value. */
    edit(project) {
      if (!this.M) return { ok: false, errors: [], warnings: [], lines: ['The controller is empty: Download first.'] };
      const p = JSON.parse(JSON.stringify(project)), kept = [];
      const keep = (list, prog) => (list || []).forEach(t => {
        if (t.alias) return;
        const r = this.refOf(t.name, prog);
        if (typeof r === 'string' || U(r.type) !== U(t.type || 'BOOL') || dimText(r.dims) !== dimText(t.dim)) return;
        const v = this.read(t.name, prog);
        if (v !== undefined) { t.value = v; if (r.type === 'TIMER' || r.type === 'COUNTER' || (r.type === 'CONTROL' && !r.dim)) kept.push([t.name, prog, v, r.type === 'CONTROL' ? 'LEN' : 'PRE']); }
      });
      keep(p.tags, null);
      (p.tasks || []).forEach(k => (k.programs || []).forEach(g => keep(g.tags, g.name)));
      const r = build(p);
      const res = { ok: !r.errors.length, errors: r.errors, warnings: r.warnings, lines: r.lines };
      if (!res.ok) return res;
      Object.assign(r.model.S, this.S);
      // a program that was inhibited and is not any more gets S:FS on its next scan
      r.model.programs.forEach(P => { const o = this.M.programs.find(x => U(x.name) === U(P.name)); if (o && o.inhibit && !P.inhibit) P.fs = true; });
      this.M = r.model; this.S = this.M.S; this.name = this.M.name;
      this.copy = JSON.stringify(project);
      this.refs.clear();
      // a timer or a counter keeps its accum and bits, a CONTROL its position and bits: only the preset (.LEN) comes
      // from the (maybe edited) rung
      kept.forEach(([name, prog, v, k]) => { const r = this.refOf(name, prog); if (typeof r !== 'string') { const o = r.obj(); Object.assign(o, v, { [k]: o[k] }); } });
      this.emit('download');
      return res;
    }
    /* the controller keeps its own copy: a project changed offline must be downloaded again */
    holds(project) {
      if (this.copy === null) return false;
      if (this.copyKeyOf !== this.copy) { this.copyKeyOf = this.copy; this.copyKey = logicKey(JSON.parse(this.copy)); }
      return this.copyKey === logicKey(project);
    }

    /* ---------- scan ---------- */
    /* one scan: inputs in, the programs (in Run), outputs are read through ioImage */
    scan(dt = this.period) {
      if (!this.M) return;
      this.dt = Math.round(dt);
      this.inputs();
      if (!this.running) return;
      this.S.FS = this.first ? 1 : 0;
      this.S.MINOR = 0;
      this.tnd = false; this.ret = false; this.jmp = null; this.d = 0; this.mcr = false;
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      try {
        // S:FS: the first scan after Run, or the first scan of a program after it is uninhibited (P.fs)
      for (const P of this.M.programs) if (P.main && !P.inhibit) { this.S.FS = this.first || P.fs ? 1 : 0; P.fs = false; this.routine(P.main); }
      } catch (e) {
        if (!(e instanceof Fault)) throw e;
        this.majorFault(e.type, e.code, e.message);
      }
      this.S.FS = 0;
      this.first = false;
      this.scans++;
      // scan times in microseconds (Task Properties, Monitor)
      const us = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) * 1000);
      this.scanUs = us; this.maxScanUs = Math.max(this.maxScanUs || 0, us);
    }
    /* speed of time (LGEM5K-GR016: 0-100 %, takes effect at once; 60 % makes 1 s take about 1.67 s) */
    setSpeed(p) { p = Math.round(Number(p)); if (!(p >= 0 && p <= 100)) return false; this.sot = p; this.emit('speed'); return true; }
    /* the controller's own clock: fixed scans of `period` ms, catching up after a slow frame (at most 1 s) */
    advance(ms) {
      if (!this.powered) return 0;
      ms *= this.sot / 100;
      this.acc = Math.min(this.acc + ms, 1000);
      let n = 0;
      while (this.acc >= this.period) {
        if (this.single && this.held) { this.acc = 0; break; }
        this.acc -= this.period; this.scan(this.period); n++;
        if (this.single && this.running) { this.held = true; this.acc = 0; this.emit('single'); }
      }
      return n;
    }
    inputs() {
      const V = this.M.vals;
      for (const m of this.M.mods.values()) {
        const ph = this.phys[m.slot];
        if (m.inhibit) continue;
        if (this.pulled.has(m.slot)) {
          // no connection: Fault is set, the input data holds and can be overwritten (as on an emulated controller)
          if (V[m.I] && 'Fault' in V[m.I]) V[m.I].Fault = -1;
          if (m.majorOnFail && this.running) this.majorFault(3, 16, `Connection to the I/O module in slot ${m.slot} (${m.name || m.type}) failed`);
          continue;
        }
        if (V[m.I] && 'Fault' in V[m.I]) V[m.I].Fault = 0;
        if (m.kind === 'di') V[m.I].Data = store('INT', this.applyForce(m.slot, 'I', (ph | 0) & 0xFFFF));
        else if (m.kind === 'do') V[m.I].Data = this.ioImage(m.slot).out;
        else if (m.kind === 'ai') for (let k = 0; k < 4; k++) V[m.I][`Ch${k}Data`] = store('REAL', ph ? Number(ph[k]) || 0 : 0);
      }
    }
    /* a routine: rungs in order; JMP goes to its LBL rung, RET and TND end the routine. The MCR override (every rung
       false) is toggled by an MCR with rung-condition-in false, and is reset when the routine ends. */
    routine(R) {
      const rungs = R.rungs, mcr0 = this.mcr;
      let jumps = 0;
      this.mcr = false;
      for (let i = 0; i < rungs.length;) {
        this.seq(rungs[i].elems, !this.mcr);
        if (this.tnd || this.ret) { this.tnd = this.ret = false; break; }
        if (this.jmp !== null) {
          const to = R.labels.get(this.jmp);
          this.jmp = null;
          if (++jumps > 100000) throw new Fault(6, 1, 'Watchdog timeout: the task did not finish in time');
          i = to;
          continue;
        }
        i++;
      }
      this.mcr = mcr0;
    }
    // a true JMP, RET or TND leaves the rung at once: the rest of it is not scanned
    get leave() { return this.jmp !== null || this.ret || this.tnd; }
    seq(arr, p) {
      for (let k = 0; k < arr.length; k++) { p = this.el(arr[k], p); if (this.leave) break; }
      return p;
    }
    el(e, p) {
      if (e.t === 'BR') {
        let out = false;
        for (const leg of e.legs) { if (this.seq(leg, p)) out = true; if (this.leave) break; }
        return out;
      }
      const x = e.x;
      switch (e.t) {
        case 'XIC': e.v = x[0].get() === 1; return p && e.v;
        case 'XIO': e.v = x[0].get() === 0; return p && e.v;
        case 'OTE': x[0].set(p ? 1 : 0); e.v = p; return p;
        case 'OTL': if (p) x[0].set(1); e.v = x[0].get() === 1; return p;
        case 'OTU': if (p) x[0].set(0); e.v = x[0].get() === 1; return p;
        case 'ONS': { const o = p && !x[0].get(); x[0].set(p ? 1 : 0); e.v = o; return o; }
        case 'OSR': case 'OSF': {
          const st = x[0].get(), o = e.t === 'OSR' ? p && !st : !p && !!st;
          x[1].set(o ? 1 : 0); x[0].set(p ? 1 : 0); e.v = o;
          return p;
        }
        case 'TON': case 'TOF': case 'RTO': this.timer(e.t, x[0].obj(), p); e.v = p; return p;
        case 'CTU': case 'CTD': this.counter(e.t, x[0].obj(), p); e.v = p; return p;
        case 'RES': {
          if (p) {
            const s = x[0].obj();
            s.DN = 0;
            if (x[0].type === 'TIMER') { s.ACC = 0; s.EN = s.TT = 0; }
            else if (x[0].type === 'COUNTER') { s.ACC = 0; s.CU = s.CD = s.OV = s.UN = 0; }
            else { s.POS = 0; s.EN = s.EU = s.EM = s.ER = s.UL = s.IN = s.FD = 0; }
          }
          e.v = p; return p;
        }
        case 'EQU': case 'NEQ': case 'LES': case 'LEQ': case 'GRT': case 'GEQ': {
          if (!p) { e.v = false; return false; }
          const a = x[0].get(), b = x[1].get();
          e.v = e.t === 'EQU' ? a === b : e.t === 'NEQ' ? a !== b : e.t === 'LES' ? a < b : e.t === 'LEQ' ? a <= b : e.t === 'GRT' ? a > b : a >= b;
          return e.v;
        }
        case 'LIM': {
          if (!p) { e.v = false; return false; }
          const lo = x[0].get(), t = x[1].get(), hi = x[2].get();
          e.v = lo <= hi ? t >= lo && t <= hi : t >= lo || t <= hi;
          return e.v;
        }
        case 'MEQ': { if (!p) { e.v = false; return false; } const m = i32(x[1].get()); e.v = (i32(x[0].get()) & m) === (i32(x[2].get()) & m); return e.v; }
        case 'CMP': { if (!p) { e.v = false; return false; } DIV0 = false; e.v = x[0].get() !== 0; return e.v; }
        case 'ADD': case 'SUB': case 'MUL': case 'DIV': case 'MOD': if (p) this.arith(e.t, x[0], x[1], x[2]); e.v = p; return p;
        case 'SQR': case 'NEG': case 'ABS': {
          if (p) {
            const a = x[0].get(), real = x[0].type === 'REAL' || x[1].type === 'REAL';
            const r = e.t === 'NEG' ? -a : e.t === 'ABS' ? Math.abs(a) : Math.sqrt(Math.abs(a));
            this.put(x[1], real ? r : Math.trunc(r));
          }
          e.v = p; return p;
        }
        case 'CPT': if (p) { DIV0 = false; const v = x[1].get(); this.put(x[0], v, DIV0); } e.v = p; return p;
        case 'MOV': if (p) this.put(x[1], x[0].get()); e.v = p; return p;
        // MVM does not affect the math status flags on a 5580 controller (reference manual 1756-RM003)
        case 'MVM': if (p) { const m = i32(x[1].get()); x[2].set((i32(x[2].get()) & ~m) | (i32(x[0].get()) & m)); } e.v = p; return p;
        case 'CLR': if (p) this.put(x[0], 0); e.v = p; return p;
        case 'AND': if (p) this.put(x[2], i32(x[0].get()) & i32(x[1].get())); e.v = p; return p;
        case 'OR': if (p) this.put(x[2], i32(x[0].get()) | i32(x[1].get())); e.v = p; return p;
        case 'XOR': if (p) this.put(x[2], i32(x[0].get()) ^ i32(x[1].get())); e.v = p; return p;
        case 'NOT': if (p) this.put(x[1], ~i32(x[0].get())); e.v = p; return p;
        case 'BTD': {
          if (p) {
            const s = i32(x[0].get()), sb = x[1].c, db = x[3].c, n = x[4].c;
            let d = i32(x[2].get());
            const sbits = BITS(x[0].type), dbits = BITS(x[2].type);
            for (let k = 0; k < n && sb + k < sbits && db + k < dbits; k++) { const m = 1 << (db + k); d = (s >> (sb + k)) & 1 ? d | m : d & ~m; }
            x[2].set(d);
          }
          e.v = p; return p;
        }
        case 'SWPB': {
          if (p) {
            const v = i32(x[0].get());
            let r;
            if (x[0].type === 'INT') r = ((v & 0xFF) << 8) | ((v >> 8) & 0xFF);
            else {
              const b = [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
              const o = x[1].order === 'REVERSE' ? [b[3], b[2], b[1], b[0]] : x[1].order === 'WORD' ? [b[2], b[3], b[0], b[1]] : [b[1], b[0], b[3], b[2]];
              r = o[0] | (o[1] << 8) | (o[2] << 16) | (o[3] << 24);
            }
            x[2].set(r);
          }
          e.v = p; return p;
        }
        case 'COP': {
          // Length counts Dest elements; the copy stops at the end of either array. Between different types the
          // bytes are copied (low byte first), as the reference controller does
          if (p) {
            const S = file(x[0]), D = file(x[1]), len = Math.min(x[2].c, D.n);
            if (x[0].type === x[1].type) {
              const n = Math.min(len, S.n), tmp = [];
              for (let k = 0; k < n; k++) tmp.push(clone(S.g(k)));
              for (let k = 0; k < n; k++) D.s(k, tmp[k]);
            } else {
              const ss = BYTES[x[0].type], ds = BYTES[x[1].type], nb = Math.min(len * ds, S.n * ss);
              const dv = new DataView(new ArrayBuffer(Math.ceil(nb / ss) * ss + 8));
              for (let k = 0; k * ss < nb; k++) putBytes(dv, k * ss, x[0].type, S.g(k));
              for (let k = 0; (k + 1) * ds <= nb; k++) D.s(k, getBytes(dv, k * ds, x[1].type));
            }
          }
          e.v = p; return p;
        }
        case 'FLL': {
          if (p) {
            const v = store(x[1].type, x[0].get()), D = file(x[1]), n = Math.min(x[2].c, D.n);
            for (let k = 0; k < n; k++) D.s(k, v);
          }
          e.v = p; return p;
        }
        case 'BSL': case 'BSR': this.bitShift(e.t, x, p); e.v = p; return p;
        case 'FFL': case 'LFL': this.load(e.t, x, p); e.v = p; return p;
        case 'FFU': case 'LFU': this.unload(e.t, x, p); e.v = p; return p;
        case 'SQO': case 'SQL': this.sequencer(e.t, x, p); e.v = p; return p;
        case 'SQI': { if (!p) { e.v = false; return false; } e.v = this.seqIn(x); return e.v; }
        case 'JSR': {
          if (p) {
            if (this.d >= 32) throw new Fault(4, 31, 'JSR nesting too deep');
            this.d++;
            this.routine(x[0]);
            this.d--;
            this.ret = false;
          }
          e.v = p; return p;
        }
        case 'RET': if (p) this.ret = true; e.v = p; return p;
        case 'JMP': if (p) this.jmp = x[0].label; e.v = p; return p;
        case 'TND': if (p) this.tnd = true; e.v = p; return p;
        case 'MCR': if (!p) this.mcr = !this.mcr; e.v = p; return p;
        case 'AFI': e.v = false; return false;
        default: e.v = p; return p;   // LBL, SBR, NOP
      }
    }
    /* math status from the stored value: S:V overflow (or divide by zero, also a minor fault: S:MINOR), S:Z zero,
       S:N negative; S:C carry only from ADD and SUB */
    put(dest, v, ov, carry) {
      dest.set(v);
      const r = dest.get(), S = this.S, was = S.V;
      S.V = OV || ov ? 1 : 0; S.Z = r === 0 ? 1 : 0; S.N = r < 0 ? 1 : 0;
      if (carry !== undefined) S.C = carry ? 1 : 0;
      // each time S:V goes from cleared to set it makes a minor fault (type 4, code 4)
      if (S.V && !was) { S.MINOR = 1; this.minorFault(4, 4, 'Arithmetic overflow (or divide by zero): the result did not fit, S:V is set'); }
    }
    arith(op, A, B, D) {
      const a = A.get(), b = B.get(), real = A.type === 'REAL' || B.type === 'REAL' || D.type === 'REAL';
      let r, ov = false, c;
      switch (op) {
        case 'ADD': r = a + b; c = !real && (a >>> 0) + (b >>> 0) > 0xFFFFFFFF; break;
        case 'SUB': r = a - b; c = !real && (a >>> 0) < (b >>> 0); break;
        case 'MUL': r = a * b; if (!real && !Number.isSafeInteger(r)) { r = Math.imul(a, b); ov = true; } break;
        // divide by zero (reference help): a minor fault; the result is Source A for integers, infinite for REAL
        case 'DIV': if (b === 0) { r = real ? a / b : a; ov = true; } else r = real ? a / b : Math.trunc(a / b); break;
        default: if (b === 0) { r = real ? NaN : a; ov = true; } else r = real ? a - b * Math.trunc(a / b) : a % b;
      }
      this.put(D, r, ov, c);
    }
    /* BSL / BSR (1756-RM003, Bit Shift Left / Right): on a false-to-true rung .EN is set and the other bits cleared,
       then .LEN bits from Array bit 0 shift one place (left: the top bit goes to .UL and Source Bit into bit 0; right:
       bit 0 goes to .UL and Source Bit into the top bit), .DN set and .POS = .LEN. .LEN = 0: .DN set and .UL = Source
       Bit; .LEN < 0: .ER set; .LEN past the end of the array: major fault 4/20. A false rung clears .EN .DN .ER .POS */
    bitShift(t, x, p) {
      const c = x[1].obj();
      if (!p) { c.EN = c.DN = c.ER = 0; c.POS = 0; return; }
      if (c.EN) return;
      c.EN = 1; c.EU = c.DN = c.EM = c.ER = c.UL = c.IN = c.FD = 0;
      const len = c.LEN, src = x[2].get() ? 1 : 0;
      if (len === 0) { c.DN = 1; c.POS = 0; c.UL = src; return; }
      if (len < 0) { c.ER = 1; return; }
      const A = file(x[0]);
      if (len > A.n * 32) throw new Fault(4, 20, `Array subscript too large, or less than 0 (${t}: .LEN ${len} is past the end of the array)`);
      const get = i => (A.g(i >> 5) >>> (i & 31)) & 1;
      const put = (i, v) => { const w = A.g(i >> 5), m = 1 << (i & 31); A.s(i >> 5, v ? (w | m) | 0 : (w & ~m) | 0); };
      if (t === 'BSL') { c.UL = get(len - 1); for (let i = len - 1; i > 0; i--) put(i, get(i - 1)); put(0, src); }
      else { c.UL = get(0); for (let i = 0; i < len - 1; i++) put(i, get(i + 1)); put(len - 1, src); }
      c.DN = 1; c.POS = len;
    }
    /* FFL and LFL (1756-RM003, FIFO / LIFO Load flow charts: the same steps): on a false-to-true rung .EN is set and .POS + 1; while .POS <= .LEN the
       Source goes into the element .POS - 1 (the next free one), converted to the array's type; past .LEN the FIFO is
       full and .POS goes back. A false rung clears .EN. .EM and .DN follow .POS and .LEN on every scan (fstat). */
    load(t, x, p) {
      const c = x[2].obj();
      if (!p) { c.EN = 0; fstat(c); return; }
      if (c.LEN <= 0 || c.POS < 0) { c.EM = c.DN = 1; return; }
      c.EM = c.DN = 0;
      if (c.EN) { fstat(c); return; }
      c.EN = 1; c.POS++;
      if (c.POS >= c.LEN) c.DN = 1;
      if (c.POS > c.LEN) { c.POS--; return; }
      const F = file(x[1]);
      if (c.POS > F.n) throw new Fault(4, 20, `Array subscript too large, or less than 0 (${t}: .POS is past the end of the array)`);
      const v = take(x[0]);
      F.s(c.POS - 1, ATOMIC[x[1].type] ? store(x[1].type, v) : v);
      OV = false;
    }
    /* FFU (FIFO Unload flow charts): on a false-to-true rung .EU is set; with data (.POS >= 1) element 0 goes to Dest,
       the others move down one place and .POS - 1; an empty FIFO puts 0 in Dest. LFU (LIFO Unload): the last loaded
       element (.POS - 1, .POS limited to .LEN) goes to Dest and 0 is stored in its place. .LEN past the end of the
       array is a major fault 4/20. A false rung clears .EU. */
    unload(t, x, p) {
      const c = x[2].obj();
      if (!p) { c.EU = 0; fstat(c); return; }
      if (c.LEN <= 0 || c.POS < 0) { c.EM = c.DN = 1; return; }
      c.EM = c.DN = 0;
      if (c.EU) { fstat(c); return; }
      c.EU = 1;
      const F = file(x[0]), D = x[1], lifo = t === 'LFU', past = () => new Fault(4, 20, `Array subscript too large, or less than 0 (${t}: .LEN is past the end of the array)`);
      if (!lifo && c.LEN > F.n) throw past();
      if (c.POS <= 1) c.EM = 1;
      const put = v => { if (ATOMIC[D.type]) D.set(v); else { D.at(); PP[PK] = clone(v); } OV = false; };
      if (c.POS < 1) { put(ATOMIC[D.type] ? 0 : zero(D.obj())); return; }
      if (lifo) {
        if (c.POS > c.LEN) c.POS = c.LEN;
        c.POS--;
        if (c.LEN > F.n) throw past();
        const v = F.g(c.POS);
        put(v); F.s(c.POS, zero(v));
        return;
      }
      c.POS--;
      put(F.g(0));
      for (let i = 1; i < c.LEN; i++) F.s(i - 1, clone(F.g(i)));
    }
    /* SQO / SQL (1756-RM003, Sequencer Output / Load flow charts): on a false-to-true rung .EN is set, .ER and .DN
       cleared and .POS steps (+1, or back to 1 at .LEN); .DN is set at .POS = .LEN, .ER past .LEN. While the rung is
       true, SQO writes Dest = (Dest AND NOT Mask) OR (Array[.POS] AND Mask) and SQL writes Array[.POS] = Source.
       .LEN <= 0 or .POS < 0: .ER set. .POS past the end of the array: SQO sets .ER, SQL is a major fault 4/20. */
    sequencer(t, x, p) {
      const c = x[t === 'SQL' ? 2 : 3].obj();
      if (!p) { c.EN = 0; return; }
      if (!(c.LEN > 0 && c.POS >= 0)) { c.EN = 1; c.ER = 1; c.DN = c.POS === c.LEN ? 1 : 0; return; }
      if (!c.EN) { c.EN = 1; c.ER = 0; c.DN = 0; c.POS = c.POS < c.LEN ? c.POS + 1 : 1; } else c.DN = 0;
      if (c.POS === c.LEN) c.DN = 1;
      else if (c.POS > c.LEN) { c.ER = 1; return; }
      const A = file(x[0]);
      if (c.POS >= A.n) {
        if (t === 'SQL') throw new Fault(4, 20, 'Array subscript too large, or less than 0 (SQL: .POS is past the end of the array)');
        c.ER = 1; return;
      }
      if (t === 'SQL') A.s(c.POS, store('DINT', x[1].get()));
      else { const m = maskOf(x[1]); x[2].set((i32(x[2].get()) & ~m) | (A.g(c.POS) & m)); }
      OV = false;
    }
    /* SQI (Sequencer Input flow chart): .ER cleared; with .LEN > 0 and 0 <= .POS <= .LEN the rung-condition-out is
       (Source AND Mask) = (Array[.POS] AND Mask); otherwise, or past the end of the array, .ER is set and it is false */
    seqIn(x) {
      const c = x[3].obj();
      c.ER = 0;
      if (!(c.LEN > 0 && c.POS >= 0 && c.POS <= c.LEN)) { c.ER = 1; return false; }
      const A = file(x[0]);
      if (c.POS >= A.n) { c.ER = 1; return false; }
      const m = maskOf(x[1]);
      return (i32(x[2].get()) & m) === (A.g(c.POS) & m);
    }
    /* ACC = ACC + (now - last scan), from the scan after the timer is enabled. Setting DN pauses a TON / RTO, clearing
       it pauses a TOF (reference help). */
    timer(t, s, p) {
      const dt = this.dt;
      if (p && (s.PRE < 0 || s.ACC < 0)) throw new Fault(4, 34, `Timer ${t}: a negative .PRE or .ACC`);
      if (t === 'TOF') {
        if (p) { s.EN = 1; s.DN = 1; s.TT = 0; s.ACC = 0; return; }
        if (s.EN) { s.EN = 0; s.TT = s.DN; return; }
        if (s.DN && s.ACC < s.PRE) s.ACC = Math.min(s.PRE, s.ACC + dt);
        if (s.ACC >= s.PRE) s.DN = 0;
        s.TT = s.DN;
        return;
      }
      if (!p) {
        s.EN = 0; s.TT = 0;
        if (t === 'TON') { s.DN = 0; s.ACC = 0; }
        return;
      }
      if (!s.EN) s.EN = 1; else if (!s.DN && s.ACC < s.PRE) s.ACC = Math.min(s.PRE, s.ACC + dt);
      if (s.ACC >= s.PRE) s.DN = 1;
      s.TT = s.DN ? 0 : 1;
    }
    counter(t, s, p) {
      if (t === 'CTU') {
        if (p && !s.CU) { if (s.ACC >= 2147483647) { s.ACC = -2147483648; if (s.UN) s.UN = 0; else s.OV = 1; } else s.ACC++; }
        s.CU = p ? 1 : 0;
      } else {
        if (p && !s.CD) { if (s.ACC <= -2147483648) { s.ACC = 2147483647; if (s.OV) s.OV = 0; else s.UN = 1; } else s.ACC--; }
        s.CD = p ? 1 : 0;
      }
      s.DN = s.ACC >= s.PRE ? 1 : 0;
    }

    /* ---------- tags: read / write for the HMI, Monitor Tags and Toggle Bit ---------- */
    refOf(path, program) {
      if (!this.M) return 'No project';
      const k = (program || '') + '|' + U(path);
      let r = this.refs.get(k);
      if (r === undefined) {
        const P = program ? this.M.programs.find(p => U(p.name) === U(program)) : null;
        r = ref(this.M, P, String(path));
        this.refs.set(k, r);
      }
      return r;
    }
    read(path, program) {
      const r = this.refOf(path, program);
      if (typeof r === 'string') return undefined;
      try { return r.dim || !ATOMIC[r.type] ? clone(r.obj()) : r.get(); } catch (e) { if (e instanceof Fault) return undefined; throw e; }
    }
    /* an input image that its card updates (connected, not inhibited); the others can be written */
    inputLive(r) { const m = r.io && this.M.mods.get(r.io.slot); return !!m && !m.inhibit && !this.pulled.has(m.slot); }
    /* writing an input image of a working card is refused: the next input update would overwrite it */
    /* monitor: written from Monitor Tags (the Data Monitor), which may change a constant tag; other editors may not */
    write(path, v, program, monitor) {
      const r = this.refOf(path, program);
      if (typeof r === 'string' || (r.input && this.inputLive(r)) || r.ro || (r.konst && !monitor)) return false;
      try {
        if (r.dim || !ATOMIC[r.type]) { r.at(); PP[PK] = conform(this.M.types, r.type, r.dim, v); } else r.set(Number(v));
        return true;
      } catch (e) { if (e instanceof Fault) return false; throw e; }
    }
    toggle(path, program, monitor) {
      const r = this.refOf(path, program);
      if (typeof r === 'string' || r.type !== 'BOOL' || r.dim || r.ro || (r.konst && !monitor)) return false;
      try { r.set(r.get() ? 0 : 1); return true; } catch (e) { if (e instanceof Fault) return false; throw e; }
    }

    /* ---------- I/O ---------- */
    setInputs(slot, bits) {
      const m = this.M && this.M.mods.get(slot);
      if (m && m.kind === 'ai') this.phys[slot] = Array.from(bits || [], Number);
      else this.phys[slot] = Array.isArray(bits) ? bits.reduce((w, b, k) => (b ? w | (1 << k) : w), 0) : Number(bits) | 0;
    }
    /* { in, out } of a card: bits of a discrete card, channel values of an analog card; outputs are off outside Run */
    ioImage(slot) {
      const m = this.M && this.M.mods.get(slot);
      if (!m) return null;
      // Remote Test: the logic runs, the outputs stay off
      const V = this.M.vals, on = this.running && this.mode !== 'remtest' && !m.inhibit && !this.pulled.has(slot), ch = o => [0, 1, 2, 3].map(k => o[`Ch${k}Data`]);
      switch (m.kind) {
        case 'di': return { in: V[m.I].Data & 0xFFFF, out: null };
        case 'do': return { in: null, out: on ? this.applyForce(slot, 'O', V[m.O].Data & 0xFFFF) & 0xFFFF : 0 };
        case 'ai': return { in: ch(V[m.I]), out: null };
        case 'ao': return { in: null, out: on ? ch(V[m.O]) : [0, 0, 0, 0] };
      }
      return { in: null, out: null };
    }

    /* a simulated module fault: the card is taken out of the rack (on = true) or put back */
    setModuleFault(slot, on) {
      if (on) this.pulled.add(slot); else this.pulled.delete(slot);
      this.emit('io');
    }
    /* the chassis reports what is really in a slot: null (the right card, working) or a fault code */
    linkFault(slot, code) {
      if (code) { if (this.codes.get(slot) !== code) { this.pulled.add(slot); this.codes.set(slot, code); this.emit('io'); } }
      else if (this.codes.has(slot)) { this.codes.delete(slot); this.pulled.delete(slot); this.emit('io'); }
    }
    /* the state of a card, as Module Properties shows it */
    moduleStatus(slot) {
      const m = this.M && this.M.mods.get(slot);
      if (!m) return { state: 'Not in the controller', code: null, text: 'The project in the controller has no module in this slot. Download first.' };
      if (m.inhibit) return { state: 'Inhibited', code: null, text: 'The module is inhibited: no connection, its inputs hold and its outputs are off.' };
      if (this.pulled.has(slot)) {
        const code = this.codes.get(slot);
        if (code === '16#0116') return { state: 'Faulted', code, text: 'Electronic keying mismatch: the card in this slot is not the module of the I/O configuration.' };
        return { state: 'Faulted', code: '16#0204', text: 'Connection request error: the module does not answer (connection timed out).' };
      }
      return { state: 'Running', code: null, text: '' };
    }
    /* I/O LED: OK, or Not Responding when a card that is not inhibited has faulted */
    ioOk() { return !this.M || ![...this.M.mods.values()].some(m => !m.inhibit && this.pulled.has(m.slot)); }
    /* Upload: the controller's copy of the project, with the tag values it has now */
    upload() {
      if (!this.copy) return null;
      const p = JSON.parse(this.copy);
      const take = (list, prog) => (list || []).forEach(t => { if (t.alias) return; const v = this.read(t.name, prog); if (v !== undefined) t.value = v; });
      take(p.tags, null);
      (p.tasks || []).forEach(k => (k.programs || []).forEach(g => take(g.tags, g.name)));
      return p;
    }

    /* ---------- forces (I/O bits only) ---------- */
    applyForce(slot, dir, w) {
      const f = this.forcesOn && this.fm[slot + ':' + dir];
      return f ? (w & ~f.mask) | (f.value & f.mask) : w;
    }
    force(path, v, program) {
      const r = this.refOf(path, program);
      if (typeof r === 'string' || !r.force) return false;
      if (v === null || v === undefined) this.forces.delete(r.force); else this.forces.set(r.force, v ? 1 : 0);
      this.fm = {};
      for (const [k, val] of this.forces) {
        const [slot, dir, bit] = k.split(':'), key = slot + ':' + dir, f = this.fm[key] || (this.fm[key] = { mask: 0, value: 0 });
        f.mask |= 1 << bit;
        if (val) f.value |= 1 << bit;
      }
      this.emit('forces');
      return true;
    }
    forced(path, program) {
      const r = this.refOf(path, program);
      return typeof r !== 'string' && r.force && this.forces.has(r.force) ? this.forces.get(r.force) : null;
    }
    forceMask(path, program) {
      const r = this.refOf(path, program);
      const f = typeof r !== 'string' && r.io && r.bit < 0 && r.steps.length === 1 && r.steps[0].m === 'Data' && this.fm[r.io.slot + ':' + r.io.dir];
      return f ? { mask: f.mask, value: f.value } : { mask: 0, value: 0 };
    }
    enableForces(on) { this.forcesOn = !!on; this.emit('forces'); }
    removeForces() { this.forces.clear(); this.fm = {}; this.emit('forces'); }
    forceState() { return !this.forces.size ? 'none' : this.forcesOn ? 'enabled' : 'disabled'; }
  }

  /* ---------- Chassis: the emulated rack (spec section 15) ----------
     A controller is one card in a slot, next to I/O cards; the programming software reaches it through a path
     (Virtual\Backplane\<slot>). Each controller takes the inputs of the cards its project configures and gets a
     module fault when the slot is empty (16#0204) or holds another module (16#0116). An output card follows the
     controller that owns it: the first one, by slot, whose project configures it. */
  const CPU = 'PLC-CPU';
  class Chassis {
    constructor(size = 8, name = 'Chassis') { this.size = size; this.name = name; this.desc = ''; this.mods = new Map(); this.ls = []; this.kept = new Map(); }
    on(type, fn) { const l = [type, fn]; this.ls.push(l); return () => { this.ls = this.ls.filter(x => x !== l); }; }
    emit(what) { for (const [t, f] of this.ls) if (t === 'change') f({ what, chassis: this }); }
    static types() { return [CPU].concat(Object.keys(MODULES).filter(t => MODULES[t].kind !== 'enet')); }
    insert(slot, type, name) {
      slot = Math.floor(slot);
      if (!(slot >= 0 && slot < this.size)) return { ok: false, msg: `Slot ${slot} is not in a ${this.size}-slot chassis.` };
      if (this.mods.has(slot)) return { ok: false, msg: `Slot ${slot} already holds a module.` };
      if (type !== CPU && !MODULES[type]) return { ok: false, msg: `Unknown module type '${type}'.` };
      const kind = type === CPU ? 'cpu' : MODULES[type].kind;
      const m = { slot, type, kind, name: name || '', fault: false, field: kind === 'di' ? 0 : kind === 'ai' ? [0, 0, 0, 0] : null };
      if (kind === 'cpu') { m.ctl = new Controller(); m.ctl.slot = slot; m.ip = ''; m.desc = ''; m.mem = 3072; }
      this.mods.set(slot, m);
      this.emit('insert');
      return { ok: true, module: m };
    }
    /* Remove Module (cannot be undone). A controller's configuration stays in place unless it is cleared (Clear module
       configuration): a controller created later in that slot can use it, and load the saved controller image. */
    remove(slot, keep) {
      const m = this.mods.get(slot);
      if (m && m.ctl) { if (keep) this.kept.set(slot, { name: m.name, desc: m.desc, ip: m.ip, mem: m.mem, sot: m.ctl.sot, project: m.ctl.copy ? m.ctl.upload() : null, at: m.ctl.dlAt || null }); else this.kept.delete(slot); }
      const ok = this.mods.delete(slot); if (ok) this.emit('remove'); return ok;
    }
    /* a controller created in a slot whose configuration was kept: use it (else defaults, the name stays), and load
       the saved controller image when asked */
    useKept(slot, useConfig, loadImage) {
      const k = this.kept.get(slot), m = this.mods.get(slot);
      if (!k || !m || !m.ctl) return false;
      this.kept.delete(slot);
      m.name = k.name;
      if (useConfig) this.setController(slot, { desc: k.desc || '', ip: k.ip || '', mem: k.mem, sot: k.sot });
      if (loadImage && k.project) { const key = m.ctl.key; m.ctl.key = 'REM'; m.ctl.download(k.project); if (k.at) m.ctl.dlAt = k.at; m.ctl.key = key; if (key === 'PROG') m.ctl.go('prog'); }
      this.emit('controller');
      return true;
    }
    /* another chassis size (4 or 8 slots); refused while a module sits in a slot that would go */
    resize(n) {
      n = Math.floor(n);
      if (!RACKS.includes(n)) return { ok: false, msg: 'A chassis has 4 or 8 slots.' };
      const out = [...this.mods.keys()].filter(s => s >= n);
      if (out.length) return { ok: false, msg: `Take out the module in slot ${out.join(', ')} first.` };
      this.size = n; this.emit('insert');
      return { ok: true };
    }
    module(slot) { return this.mods.get(slot) || null; }
    controller(slot) { const m = this.mods.get(slot); return m && m.ctl ? m.ctl : null; }
    controllers() { return [...this.mods.values()].filter(m => m.ctl).sort((a, b) => a.slot - b.slot); }
    setBit(slot, bit, on) { const m = this.mods.get(slot); if (!m || m.kind !== 'di') return false; m.field = on ? m.field | (1 << bit) : m.field & ~(1 << bit); this.emit('field'); return true; }
    setChannel(slot, ch, v) { const m = this.mods.get(slot); if (!m || m.kind !== 'ai') return false; m.field[ch] = Number(v) || 0; this.emit('field'); return true; }
    /* controller settings of the emulator: IP address (empty: none), description, power */
    setController(slot, o) {
      const m = this.mods.get(slot); if (!m || !m.ctl) return false;
      if (o.name != null) m.name = String(o.name);
      if (o.desc != null) m.desc = String(o.desc);
      if (o.ip != null) m.ip = String(o.ip);
      if (o.mem != null && +o.mem > 0) m.mem = Math.floor(+o.mem);
      if (o.sot != null) m.ctl.setSpeed(o.sot);
      if (o.on != null) m.ctl.power(o.on);
      this.emit('controller');
      return true;
    }
    setFault(slot, on) { const m = this.mods.get(slot); if (!m || m.kind === 'cpu') return false; m.fault = !!on; this.emit('fault'); return true; }
    /* the code a controller gets for a slot of its I/O configuration */
    codeFor(slot, type) { const m = this.mods.get(slot); return !m || m.fault ? '16#0204' : m.type !== type ? '16#0116' : null; }
    exchange(c) {
      for (const m of c.M.mods.values()) {
        const code = this.codeFor(m.slot, m.type);
        c.linkFault(m.slot, code);
        if (!code && (m.kind === 'di' || m.kind === 'ai')) c.setInputs(m.slot, this.mods.get(m.slot).field);
      }
    }
    /* time goes by: inputs into every controller, then its scans */
    advance(ms) {
      for (const m of this.controllers()) { const c = m.ctl; if (!c.powered) continue; if (c.M) this.exchange(c); c.advance(ms); }
    }
    owner(slot) {
      const m = this.mods.get(slot);
      if (!m) return null;
      const o = this.controllers().find(x => { const pm = x.ctl.powered && x.ctl.M && x.ctl.M.mods.get(slot); return pm && !this.codeFor(slot, pm.type); });
      return o ? o.ctl : null;
    }
    /* what an output card drives: bits of a discrete card, channel values of an analog card (off without an owner) */
    outputs(slot) {
      const m = this.mods.get(slot);
      if (!m || (m.kind !== 'do' && m.kind !== 'ao')) return null;
      const o = this.owner(slot), img = o && !m.fault ? o.ioImage(slot) : null;
      return img && img.out != null ? img.out : m.kind === 'ao' ? [0, 0, 0, 0] : 0;
    }
    /* kept across restarts: the cards, their field devices, and what each controller holds (with its values) */
    toJSON() {
      return { name: this.name, desc: this.desc || undefined, size: this.size, mods: [...this.mods.values()].map(m => ({ slot: m.slot, type: m.type, name: m.name, fault: m.fault || undefined, field: m.field,
        ip: m.ctl ? m.ip : undefined, mem: m.ctl && m.mem !== 3072 ? m.mem : undefined, desc: m.desc || undefined, on: m.ctl ? m.ctl.powered : undefined, sot: m.ctl && m.ctl.sot !== 100 ? m.ctl.sot : undefined,
        project: m.ctl && m.ctl.copy ? m.ctl.upload() : undefined, key: m.ctl ? m.ctl.key : undefined, mode: m.ctl ? m.ctl.mode : undefined })),
        kept: this.kept.size ? [...this.kept].map(([slot, k]) => Object.assign({ slot }, k)) : undefined };
    }
    static from(o) {
      // an old chassis (7, 10 or 12 slots) becomes 8 slots when its modules fit, else it keeps its size
      const ch = new Chassis(o && o.size > 0 ? fitRack(Math.min(12, Math.max(4, Math.floor(o.size))), ((o && o.mods) || []).map(x => x.slot)) : 8, (o && o.name) || 'Chassis');
      ch.desc = (o && o.desc) || '';
      ((o && o.kept) || []).forEach(k => { if (k && k.slot >= 0) { const { slot, ...rest } = k; ch.kept.set(slot, rest); } });
      ((o && o.mods) || []).forEach(x => {
        const r = ch.insert(x.slot, x.type, x.name);
        if (!r.ok) return;
        const m = r.module;
        if (x.fault && m.kind !== 'cpu') m.fault = true;
        if (m.kind === 'di') m.field = Number(x.field) | 0;
        if (m.kind === 'ai' && Array.isArray(x.field)) m.field = [0, 1, 2, 3].map(k => Number(x.field[k]) || 0);
        if (m.ctl) {
          m.ip = typeof x.ip === 'string' ? x.ip : ''; m.desc = x.desc || ''; if (+x.mem > 0) m.mem = Math.floor(+x.mem);
          if (x.sot != null) m.ctl.setSpeed(x.sot);
          if (['PROG', 'REM', 'RUN'].includes(x.key)) m.ctl.key = x.key;
          const key = m.ctl.key;
          if (x.project && key !== 'RUN') { m.ctl.download(x.project); if (x.mode === 'remrun' || x.mode === 'run') m.ctl.go(key === 'PROG' ? 'prog' : 'remrun'); }
          else if (x.project) { m.ctl.key = 'REM'; m.ctl.download(x.project); m.ctl.key = 'RUN'; m.ctl.go('run'); }
          if (key === 'PROG') m.ctl.go('prog');
          if (x.on === false) m.ctl.power(false);
        }
      });
      return ch;
    }
  }

  const MTPS = root.MTPS || (root.MTPS = {});
  Object.assign(MTPS, { ATOMIC: Object.keys(ATOMIC), PREDEF, MODTYPES, OLDTYPES, IODIRS, MODULES, dimsOf, dimN, dimText, RACKS, fitRack, INSTR,
    parseRung, serializeRung, parseNumber, validName, verify, dataTypes, Controller, Chassis, OPN });
  MTPS.controller = new Controller();
  if (typeof module !== 'undefined' && module.exports) module.exports = MTPS;
})(typeof window !== 'undefined' ? window : globalThis);
