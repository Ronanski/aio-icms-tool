/* MT PLC Studio instruction reference tests (node, no browser): every instruction of the ladder engine against the
   behaviour in the reference controller's instruction help (prescan, rung-condition-in false / true, status flags,
   faults, conversions, edge cases). Usage: node tests/mtps-ref.test.js */
'use strict';
const MTPS = require('../mtps/js/engine.js');

let failed = 0, passed = 0;
function check(name, cond, info = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${info}`); }
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const near = (name, got, want) => check(name, Math.abs(got - want) < 1e-4, `got ${got}, want ${want}`);
function proj(o = {}) {
  const rungs = r => (r || []).map(t => (typeof t === 'string' ? { t } : t));
  return {
    format: 'mt-plc-studio', version: 1, controller: { name: 'Ref', type: 'PLC-CPU', rev: '1.0' },
    rack: { size: 10, modules: [] }, dataTypes: [], tags: o.tags || [],
    tasks: [{ name: 'MainTask', type: 'continuous', programs: [{ name: 'MainProgram', main: 'MainRoutine', tags: [],
      routines: [{ name: 'MainRoutine', rungs: rungs(o.rungs) }, ...(o.routines || []).map(r => ({ name: r.name, rungs: rungs(r.rungs) }))] }] }],
  };
}
const T = (name, type, extra) => ({ name, type, ...extra });
function run(o) {
  const c = new MTPS.Controller();
  const r = c.download(proj(o));
  if (!r.ok) throw new Error('download failed: ' + r.lines.join(' | '));
  c.setMode('remrun');
  return c;
}
const scans = (c, n, dt = 10) => { for (let k = 0; k < n; k++) c.scan(dt); };
const bools = (...n) => n.map(x => T(x, 'BOOL'));
const dints = (...n) => n.map(x => T(x, 'DINT'));

console.log('Bit instructions');
{
  const c = run({ tags: [T('W', 'DINT', { value: 32 }), T('Q', 'DINT'), ...bools('A', 'B')], rungs: ['XIC(W.5)OTE(A);', 'XIO(W.4)OTE(B);', 'XIC(A)OTE(Q.3);'] });
  scans(c, 1);
  check('XIC on a DINT bit (W.5) is true when the bit is 1', c.read('A') === 1);
  check('XIO on a DINT bit (W.4) is true when the bit is 0', c.read('B') === 1);
  check('OTE writes one bit of a DINT (Q.3)', c.read('Q') === 8);
}
{
  const c = run({ tags: bools('In', 'L', 'O'), rungs: ['XIC(In)OTL(L);', 'XIC(In)OTE(O);'] });
  c.write('In', 1); scans(c, 1); c.write('In', 0); scans(c, 1);
  check('OTL stays set when the rung goes false', c.read('L') === 1);
  c.write('In', 1); scans(c, 1);
  c.setMode('remprog'); c.setMode('remrun');
  check('prescan: OTE cleared, OTL kept', c.read('O') === 0 && c.read('L') === 1);
}
{
  const c = run({ tags: bools('In', 'SB', 'P', 'SR', 'OR', 'SF', 'OF'), rungs: ['XIC(In)ONS(SB)OTE(P);', 'XIC(In)OSR(SR,OR);', 'XIC(In)OSF(SF,OF);'] });
  scans(c, 1); c.write('In', 1); scans(c, 1);
  check('ONS: true for the first scan', c.read('P') === 1);
  check('OSR: output bit set for one scan', c.read('OR') === 1);
  scans(c, 1);
  check('ONS and OSR: false on the next scan', c.read('P') === 0 && c.read('OR') === 0);
  c.write('In', 0); scans(c, 1);
  check('OSF: output bit set for one scan on the falling edge', c.read('OF') === 1);
  scans(c, 1);
  check('OSF: cleared on the next scan', c.read('OF') === 0);
}
{
  const c = new MTPS.Controller();
  c.download(proj({ tags: [T('In', 'BOOL', { value: 1 }), ...bools('SB', 'P'), T('K', 'COUNTER')], rungs: ['XIC(In)ONS(SB)OTE(P);', 'XIC(In)CTU(K,10,0);'] }));
  c.setMode('remrun'); scans(c, 1);
  check('prescan: ONS does not fire on the first scan when the rung is already true', c.read('P') === 0);
  check('prescan: CTU does not count on the first scan when the rung is already true', c.read('K.ACC') === 0);
}

console.log('Timers');
{
  const c = run({ tags: [T('In', 'BOOL'), T('Tm', 'TIMER')], rungs: ['XIC(In)TON(Tm,100,0);'] });
  c.write('In', 1); scans(c, 1);
  check('TON: .EN and .TT on, .DN off while timing', c.read('Tm.EN') === 1 && c.read('Tm.TT') === 1 && c.read('Tm.DN') === 0);
  scans(c, 12);
  check('TON: .DN at .PRE, .ACC stops at .PRE, .TT off', c.read('Tm.DN') === 1 && c.read('Tm.ACC') === 100 && c.read('Tm.TT') === 0);
  c.write('In', 0); scans(c, 1);
  check('TON: a false rung resets .ACC, .EN, .TT, .DN', c.read('Tm.ACC') === 0 && c.read('Tm.EN') === 0 && c.read('Tm.DN') === 0);
}
{
  const c = run({ tags: [T('In', 'BOOL'), T('Tm', 'TIMER')], rungs: ['XIC(In)TOF(Tm,50,0);'] });
  c.write('In', 1); scans(c, 1);
  check('TOF: a true rung sets .EN and .DN, .ACC = 0', c.read('Tm.EN') === 1 && c.read('Tm.DN') === 1 && c.read('Tm.ACC') === 0);
  c.write('In', 0); scans(c, 2);
  check('TOF: after the rung goes false .TT on, .DN still on', c.read('Tm.TT') === 1 && c.read('Tm.DN') === 1 && c.read('Tm.EN') === 0);
  scans(c, 6);
  check('TOF: .DN and .TT off when .ACC reaches .PRE', c.read('Tm.DN') === 0 && c.read('Tm.TT') === 0 && c.read('Tm.ACC') === 50);
}
{
  const c = run({ tags: [T('In', 'BOOL'), T('R', 'BOOL'), T('Tm', 'TIMER')], rungs: ['XIC(In)RTO(Tm,100,0);', 'XIC(R)RES(Tm);'] });
  c.write('In', 1); scans(c, 6); c.write('In', 0); scans(c, 3);
  const a = c.read('Tm.ACC');
  check('RTO: keeps .ACC when the rung goes false', a > 0 && a < 100);
  c.write('In', 1); scans(c, 10);
  check('RTO: goes on from where it stopped to .DN', c.read('Tm.DN') === 1 && c.read('Tm.ACC') === 100);
  c.write('In', 0); c.write('R', 1); scans(c, 1);
  check('RES: clears .ACC and .DN of the RTO', c.read('Tm.ACC') === 0 && c.read('Tm.DN') === 0);
}
{
  const c = new MTPS.Controller();
  c.download(proj({ tags: [T('In', 'BOOL', { value: 1 }), T('Tm', 'TIMER')], rungs: ['XIC(In)TON(Tm,5,0);'] }));
  c.setMode('remrun'); c.write('Tm.PRE', -5); scans(c, 2);
  check('TON with a negative .PRE (written at run time): major fault, type 4 code 34', !!c.fault && c.fault.type === 4 && c.fault.code === 34, JSON.stringify(c.fault));
}

console.log('Counters');
{
  const c = run({ tags: [...bools('U', 'D', 'R'), T('K', 'COUNTER')], rungs: ['XIC(U)CTU(K,3,0);', 'XIC(D)CTD(K,3,0);', 'XIC(R)RES(K);'] });
  scans(c, 1);
  for (let k = 0; k < 3; k++) { c.write('U', 1); scans(c, 1); c.write('U', 0); scans(c, 1); }
  check('CTU: one count per false → true transition; .DN at .PRE', c.read('K.ACC') === 3 && c.read('K.DN') === 1);
  c.write('D', 1); scans(c, 1); c.write('D', 0); scans(c, 1);
  check('CTD on the same counter counts down; .DN off below .PRE', c.read('K.ACC') === 2 && c.read('K.DN') === 0);
  c.write('R', 1); scans(c, 1);
  check('RES clears the counter', c.read('K.ACC') === 0);
}
{
  const c = run({ tags: [T('U', 'BOOL'), T('D', 'BOOL'), T('K', 'COUNTER', { value: { PRE: 0, ACC: 2147483647 } }), T('K2', 'COUNTER', { value: { PRE: 0, ACC: -2147483648 } })], rungs: ['XIC(U)CTU(K,0,2147483647);', 'XIC(D)CTD(K2,0,-2147483648);'] });
  scans(c, 1); c.write('K.ACC', 2147483647); c.write('K2.ACC', -2147483648);
  c.write('U', 1); c.write('D', 1); scans(c, 1);
  check('CTU past 2147483647: wraps to -2147483648 and sets .OV', c.read('K.ACC') === -2147483648 && c.read('K.OV') === 1);
  check('CTD past -2147483648: wraps to 2147483647 and sets .UN', c.read('K2.ACC') === 2147483647 && c.read('K2.UN') === 1);
}

console.log('Compare');
{
  const c = run({ tags: [T('R', 'REAL', { value: 1 }), T('D', 'DINT', { value: 15 }), T('M', 'DINT', { value: 0x1237 }), ...bools('Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6')],
    rungs: ['EQU(R,1)OTE(Q1);', 'LIM(10,D,5)OTE(Q2);', 'LIM(5,D,10)OTE(Q3);', 'MEQ(M,16#000F,7)OTE(Q4);', 'CMP(2+3*4=14)OTE(Q5);', 'CMP(ABS(-3)>2 AND D<>0)OTE(Q6);'] });
  scans(c, 1);
  check('EQU compares a REAL with a DINT', c.read('Q1') === 1);
  check('LIM with Low > High: true outside the band (15 ≥ 10)', c.read('Q2') === 1);
  check('LIM with Low ≤ High: false outside the band', c.read('Q3') === 0);
  check('MEQ compares only the mask bits', c.read('Q4') === 1);
  check('CMP: * before + (2 + 3 * 4 = 14)', c.read('Q5') === 1);
  check('CMP: functions and AND (ABS(-3) > 2 AND D <> 0)', c.read('Q6') === 1);
}

console.log('Compute / math');
{
  const c = run({ tags: [T('Big', 'DINT', { value: 2147483647 }), ...dints('S', 'I1', 'I2', 'I3', 'I4', 'Z'), T('Rr', 'REAL'), T('Rq', 'REAL')],
    rungs: ['ADD(Big,1,S);', 'DIV(7,2,I1);', 'DIV(7.0,2,I2);', 'MOD(7,3,I3);', 'SQR(-16,Rr);', 'DIV(5,0,I4);', 'CPT(Rq,SQR(16)+ABS(-2)+10 MOD 4);'] });
  scans(c, 1);
  check('ADD overflow: wraps and sets S:V', c.read('S') === -2147483648);
  check('ADD overflow: a minor fault (type 4 code 4)', c.minors.some(m => m.type === 4 && m.code === 4));
  check('DIV with integer operands truncates (7 / 2 = 3)', c.read('I1') === 3);
  check('DIV with a REAL operand into a DINT rounds (7.0 / 2 = 3.5 → 4)', c.read('I2') === 4);
  check('MOD: 7 MOD 3 = 1', c.read('I3') === 1);
  near('SQR of a negative value uses its absolute value (√16 = 4)', c.read('Rr'), 4);
  check('DIV by zero: integer Dest gets Source A', c.read('I4') === 5);
  near('CPT: SQR(16) + ABS(-2) + 10 MOD 4 = 8', c.read('Rq'), 8);
}
{
  const c = run({ tags: [T('A', 'DINT', { value: -7 }), ...dints('N', 'Ab')], rungs: ['NEG(A,N);', 'ABS(A,Ab);'] });
  scans(c, 1);
  check('NEG and ABS', c.read('N') === 7 && c.read('Ab') === 7);
}

console.log('Move / logical');
{
  const c = run({ tags: [...dints('D1', 'D2', 'D3', 'D4'), T('Sn', 'SINT'), T('In', 'INT')], rungs: ['MOV(2.5,D1);', 'MOV(3.5,D2);', 'MOV(-2.5,D3);', 'MOV(2.6,D4);', 'MOV(300,Sn);', 'MOV(70000,In);'] });
  scans(c, 1);
  check('MOV REAL → DINT rounds half to even (2.5 → 2, 3.5 → 4, -2.5 → -2)', c.read('D1') === 2 && c.read('D2') === 4 && c.read('D3') === -2);
  check('MOV 2.6 → 3', c.read('D4') === 3);
  check('MOV 300 → SINT keeps the low byte (44) and sets S:V', c.read('Sn') === 44);
  check('MOV 70000 → INT keeps the low 16 bits (4464)', c.read('In') === 4464);
}
{
  const c = run({ tags: [T('Src', 'DINT', { value: 0x55 }), T('Dst', 'DINT', { value: 0xF0 }), ...dints('C1', 'A1', 'O1', 'X1', 'N1'), T('M1', 'DINT', { value: 0xFF00 })],
    rungs: ['MVM(Src,16#0F,Dst);', 'CLR(M1);', 'AND(16#0C,16#0A,A1);', 'OR(16#0C,16#0A,O1);', 'XOR(16#0C,16#0A,X1);', 'NOT(0,N1);'] });
  scans(c, 1);
  check('MVM: only the mask bits change ((0xF0 & ~0x0F) | (0x55 & 0x0F) = 0xF5)', c.read('Dst') === 0xF5);
  check('CLR', c.read('M1') === 0);
  check('AND, OR, XOR, NOT', c.read('A1') === 8 && c.read('O1') === 14 && c.read('X1') === 6 && c.read('N1') === -1);
}
{
  const c = run({ tags: [T('S', 'DINT', { value: 0xF }), ...dints('D1', 'D2'), T('I', 'INT', { value: 0x1234 }), T('Dw', 'DINT', { value: 0x11223344 }), T('Ii', 'INT'), ...dints('R1', 'R2', 'R3')],
    rungs: ['BTD(S,0,D1,4,4);', 'BTD(S,0,D2,30,4);', 'SWPB(I,HIGH/LOW,Ii);', 'SWPB(Dw,REVERSE,R1);', 'SWPB(Dw,WORD,R2);', 'SWPB(Dw,HIGH/LOW,R3);'] });
  scans(c, 1);
  check('BTD: four bits moved up by 4 (0xF0)', c.read('D1') === 0xF0);
  check('BTD: bits past bit 31 are left out', c.read('D2') === (0xC0000000 | 0));
  check('SWPB on an INT swaps its bytes (0x1234 → 0x3412)', c.read('Ii') === 0x3412);
  check('SWPB REVERSE / WORD / HIGH/LOW on a DINT', c.read('R1') === 0x44332211 && c.read('R2') === 0x33441122 && c.read('R3') === 0x22114433);
}

console.log('File / misc');
{
  const c = run({ tags: [T('A', 'DINT', { dim: 5, value: [1, 2, 3, 4, 5] }), T('B', 'DINT', { dim: 3 }), T('F', 'DINT', { dim: 4 }), T('Src', 'DINT', { value: 0x00020001 }), T('Iv', 'INT', { dim: 2 })],
    rungs: ['COP(A[0],B[0],5);', 'FLL(1.7,F[1],10);', 'COP(Src,Iv[0],2);'] });
  scans(c, 1);
  eq('COP: Length is limited to the end of the destination array', [c.read('B[0]'), c.read('B[1]'), c.read('B[2]')], [1, 2, 3]);
  eq('FLL: REAL into DINT rounds; Length limited to the end of the array', [c.read('F[0]'), c.read('F[1]'), c.read('F[2]'), c.read('F[3]')], [0, 2, 2, 2]);
  eq('COP copies bytes between types (DINT 16#00020001 → INT[0] = 1, INT[1] = 2)', [c.read('Iv[0]'), c.read('Iv[1]')], [1, 2]);
}
{
  const c = run({ tags: [T('Arr', 'DINT', { dim: 5 }), T('Ix', 'DINT', { value: 3 })], rungs: ['MOV(9,Arr[Ix]);'] });
  scans(c, 1);
  check('indirect address: MOV into Arr[Ix] with Ix = 3', c.read('Arr[3]') === 9);
  c.write('Ix', 7); scans(c, 1);
  check('indirect address out of range: major fault, type 4 code 20', !!c.fault && c.fault.type === 4 && c.fault.code === 20, JSON.stringify(c.fault));
}

console.log('Array (File)/Shift: BSL, BSR (1756-RM003 chapter 9)');
{
  // RM003 BSL example 1: Length 10 from array_dint[0]: bit 9 goes to .UL, input_1 into bit 0, bits 10-31 are left alone
  const c = run({ tags: [T('Ad', 'DINT', { dim: 2, value: [(0xFFFFFC00 | 0x200 | 0x5) | 0, 0] }), T('Ctl', 'CONTROL'), ...bools('In', 'G')], rungs: ['XIC(G)BSL(Ad[0],Ctl,In,10);'] });
  scans(c, 1);
  eq('BSL: the Length operand is the .LEN of the CONTROL (written on download)', c.read('Ctl.LEN'), 10);
  c.write('In', 1); c.write('G', 1); scans(c, 1);
  eq('BSL example 1: bit 9 to .UL, bits 0-8 up one, Source Bit into bit 0, bits 10-31 kept', [c.read('Ad[0]') >>> 0, c.read('Ctl.UL'), c.read('Ctl.DN'), c.read('Ctl.EN'), c.read('Ctl.POS')], [(0xFFFFFC00 | 0xB) >>> 0, 1, 1, 1, 10]);
  scans(c, 3);
  eq('BSL is transitional: no shift while the rung stays true', c.read('Ad[0]') >>> 0, (0xFFFFFC00 | 0xB) >>> 0);
  c.write('G', 0); scans(c, 1);
  eq('BSL rung false: .EN .DN .ER cleared, .POS = 0, .UL kept', [c.read('Ctl.EN'), c.read('Ctl.DN'), c.read('Ctl.ER'), c.read('Ctl.POS'), c.read('Ctl.UL')], [0, 0, 0, 0, 1]);
}
{
  // RM003 BSL example 2: Length 58 runs across the elements: [0].31 goes to [1].0, [1].25 goes to .UL
  const c = run({ tags: [T('Ad', 'DINT', { dim: 2, value: [-2147483648, 1 << 25] }), T('Ctl', 'CONTROL'), ...bools('In', 'G')], rungs: ['XIC(G)BSL(Ad[0],Ctl,In,58);'] });
  scans(c, 1); c.write('G', 1); scans(c, 1);
  eq('BSL example 2: [0].31 to [1].0, [1].25 to .UL, [1].26-31 kept', [c.read('Ad[0]'), c.read('Ad[1]'), c.read('Ctl.UL')], [0, 1, 1]);
}
{
  // RM003 BSR example 2: Length 58: [0].0 goes to .UL, [1].0 shifts into [0].31, Source Bit into [1].25
  const c = run({ tags: [T('Ad', 'DINT', { dim: 2, value: [1, 1] }), T('Ctl', 'CONTROL'), ...bools('In', 'G')], rungs: ['XIC(G)BSR(Ad[0],Ctl,In,58);'] });
  c.write('In', 1); scans(c, 1); c.write('G', 1); scans(c, 1);
  eq('BSR example 2: [0].0 to .UL, [1].0 into [0].31, Source Bit into [1].25', [c.read('Ad[0]') >>> 0, c.read('Ad[1]') >>> 0, c.read('Ctl.UL'), c.read('Ctl.DN')], [0x80000000, 1 << 25, 1, 1]);
}
{
  const c = run({ tags: [T('Ad', 'DINT', { dim: 2 }), T('C0', 'CONTROL'), T('Cn', 'CONTROL'), ...bools('In', 'G')], rungs: ['XIC(G)BSL(Ad[0],C0,In,0);', 'XIC(G)BSR(Ad[0],Cn,In,-1);'] });
  c.write('In', 1); scans(c, 1); c.write('G', 1); scans(c, 1);
  eq('BSL .LEN = 0: .DN set, .POS = 0, .UL = Source Bit, nothing shifted', [c.read('C0.DN'), c.read('C0.POS'), c.read('C0.UL'), c.read('Ad[0]')], [1, 0, 1, 0]);
  eq('BSR .LEN < 0: .ER set, .DN clear', [c.read('Cn.ER'), c.read('Cn.DN'), c.read('Cn.EN')], [1, 0, 1]);
}
{
  const c = run({ tags: [T('Ad', 'DINT', { dim: 2 }), T('Ctl', 'CONTROL'), ...bools('In')], rungs: ['BSL(Ad[1],Ctl,In,33);'] });
  scans(c, 1);
  check('BSL with .LEN past the end of the array: major fault, type 4 code 20', !!c.fault && c.fault.type === 4 && c.fault.code === 20, JSON.stringify(c.fault));
}
{
  // prescan clears .EN: a rung that is true when the controller goes to Run shifts once on the first scan
  const c = run({ tags: [T('Ad', 'DINT', { dim: 1 }), T('Ctl', 'CONTROL'), ...bools('In')], rungs: ['BSL(Ad[0],Ctl,In,8);'] });
  c.write('In', 1); scans(c, 1);
  c.setMode('remprog'); c.setMode('remrun'); scans(c, 2);
  eq('BSL: prescan clears .EN, so a true rung shifts once after going to Run', c.read('Ad[0]'), 3);
  const v = MTPS.verify(proj({ tags: [T('Ad', 'INT', { dim: 2 }), T('D', 'DINT'), T('Ctl', 'CONTROL'), T('Tm', 'TIMER'), ...bools('In')], rungs: ['BSL(Ad[0],Ctl,In,8);', 'BSL(D,Ctl,In,8);', 'BSR(Ad[0],Tm,In,8);'] }));
  eq('BSL / BSR operands: Array is a DINT array element, Control a CONTROL', v.errors.map(e => e.rung + ':' + e.op), ['0:0', '1:0', '2:0', '2:1']);
}

console.log('Array (File)/Shift: FFL, FFU (1756-RM003 chapter 9)');
{
  // RM003 FFL example 1: Length 10, Position 5: value_1 goes into array_dint[5], the next free place
  const c = run({ tags: [T('Ad', 'DINT', { dim: 10, value: [0, 11111, 22222, 33333, 44444] }), T('Ctl', 'CONTROL'), T('V', 'DINT', { value: 55555 }), T('Out', 'DINT'), ...bools('Ld', 'Ul')],
    rungs: ['XIC(Ld)FFL(V,Ad[0],Ctl,10,5);', 'XIC(Ul)FFU(Ad[0],Out,Ctl,10,5);'] });
  scans(c, 1);
  eq('FFL / FFU: Length and Position are the .LEN / .POS of the CONTROL; .EM and .DN follow them', [c.read('Ctl.LEN'), c.read('Ctl.POS'), c.read('Ctl.EM'), c.read('Ctl.DN')], [10, 5, 0, 0]);
  c.write('Ld', 1); scans(c, 1);
  eq('FFL example 1: Source into Ad[5], .POS 5 → 6, .EN set', [c.read('Ad[5]'), c.read('Ctl.POS'), c.read('Ctl.EN')], [55555, 6, 1]);
  scans(c, 3);
  eq('FFL is transitional: one value per false-to-true rung', c.read('Ctl.POS'), 6);
  c.write('Ul', 1); scans(c, 1);
  eq('FFU example 1: element 0 to Dest, the rest move down one place, .POS - 1', [c.read('Out'), c.read('Ad[0]'), c.read('Ad[4]'), c.read('Ctl.POS'), c.read('Ctl.EU')], [0, 11111, 55555, 5, 1]);
  c.write('Ld', 0); c.write('Ul', 0); scans(c, 1);
  eq('FFL / FFU false: .EN and .EU cleared', [c.read('Ctl.EN'), c.read('Ctl.EU')], [0, 0]);
  for (let k = 0; k < 7; k++) { c.write('Ld', 1); scans(c, 1); c.write('Ld', 0); scans(c, 1); }
  eq('FFL fills up to .LEN: .DN (full) set at .POS = .LEN; a load on a full FIFO is ignored', [c.read('Ctl.POS'), c.read('Ctl.DN'), c.read('Ad[9]')], [10, 1, 55555]);
  for (let k = 0; k < 11; k++) { c.write('Ul', 1); scans(c, 1); c.write('Ul', 0); scans(c, 1); }
  eq('FFU empties to .POS = 0 with .EM set; an empty FIFO puts 0 in Dest', [c.read('Ctl.POS'), c.read('Ctl.EM'), c.read('Ctl.DN'), c.read('Out')], [0, 1, 0, 0]);
}
{
  // prescan sets .EN / .EU: a rung that is true when the controller goes to Run does not load or unload
  const c = run({ tags: [T('Ad', 'DINT', { dim: 4 }), T('Ctl', 'CONTROL'), T('V', 'REAL', { value: 2.5 }), T('O', 'SINT'), T('Go', 'BOOL')], rungs: ['FFL(V,Ad[0],Ctl,4,0);', 'XIC(Go)FFU(Ad[0],O,Ctl,4,0);'] });
  scans(c, 2);
  eq('FFL: no load on the first scan of a rung that is already true (prescan sets .EN)', [c.read('Ctl.POS'), c.read('Ctl.EM')], [0, 1]);
  c.setMode('remprog'); c.write('Ctl.EN', 0); c.setMode('remrun'); scans(c, 1);
  eq('FFL: prescan sets .EN again on the next change to Run', [c.read('Ctl.POS'), c.read('Ctl.EN')], [0, 1]);
  c.write('Ctl.EN', 0); scans(c, 1);
  eq('FFL converts the Source to the FIFO type (REAL 2.5 → DINT 2, rounded to even)', [c.read('Ad[0]'), c.read('Ctl.POS')], [2, 1]);
  c.write('Go', 1); scans(c, 1);
  eq('FFU converts the value to the Dest type (DINT 2 → SINT)', [c.read('O'), c.read('Ctl.POS'), c.read('Ctl.EM')], [2, 0, 1]);
}
{
  // a FIFO of structures: the whole TIMER moves
  const c = run({ tags: [T('Q', 'TIMER', { dim: 3 }), T('Src', 'TIMER', { value: { PRE: 700 } }), T('Dst', 'TIMER'), T('Ctl', 'CONTROL'), ...bools('Ld', 'Ul')], rungs: ['XIC(Ld)FFL(Src,Q[0],Ctl,3,0);', 'XIC(Ul)FFU(Q[0],Dst,Ctl,3,0);'] });
  scans(c, 1); c.write('Ld', 1); scans(c, 1); c.write('Ul', 1); scans(c, 1);
  eq('FFL / FFU with a structure FIFO (TIMER[3]): the whole structure is loaded and unloaded', [c.read('Q[0].PRE'), c.read('Dst.PRE'), c.read('Ctl.POS')], [0, 700, 0]);
  const v = MTPS.verify(proj({ tags: [T('Q', 'TIMER', { dim: 3 }), T('Ad', 'DINT', { dim: 3 }), T('B', 'BOOL', { dim: 32 }), T('D', 'DINT'), T('Ctl', 'CONTROL')], rungs: ['FFL(5,Q[0],Ctl,3,0);', 'FFU(Ad[0],Ctl,Ctl,3,0);', 'FFL(D,B[0],Ctl,3,0);', 'FFL(D,Ad[0],Ctl,2.5,0);'] }));
  eq('FFL / FFU operand types: a number into a structure FIFO, a structure Dest from a DINT FIFO, a BOOL array and a REAL Length are errors', v.errors.map(e => e.rung + ':' + e.op), ['0:0', '1:1', '2:1', '3:3']);
}
{
  const c = run({ tags: [T('Ad', 'DINT', { dim: 4 }), T('Ctl', 'CONTROL'), T('C2', 'CONTROL'), T('O', 'DINT'), ...bools('Ld')], rungs: ['XIC(Ld)FFL(1,Ad[2],Ctl,5,2);'] });
  scans(c, 1); c.write('Ld', 1); scans(c, 1);
  check('FFL: the start element + .POS past the end of the array: major fault, type 4 code 20', !!c.fault && c.fault.type === 4 && c.fault.code === 20, JSON.stringify(c.fault));
  const d = run({ tags: [T('Ad', 'DINT', { dim: 4 }), T('Ctl', 'CONTROL'), T('O', 'DINT'), ...bools('Ul')], rungs: ['XIC(Ul)FFU(Ad[1],O,Ctl,4,2);'] });
  scans(d, 1); d.write('Ul', 1); scans(d, 1);
  check('FFU: .LEN past the end of the array: major fault, type 4 code 20', !!d.fault && d.fault.type === 4 && d.fault.code === 20, JSON.stringify(d.fault));
  const e = run({ tags: [T('Ad', 'DINT', { dim: 4 }), T('Ctl', 'CONTROL'), ...bools('Ld')], rungs: ['XIC(Ld)FFL(1,Ad[0],Ctl,0,0);'] });
  scans(e, 1); e.write('Ld', 1); scans(e, 1);
  eq('FFL with .LEN = 0: .EM and .DN set, nothing loaded', [e.read('Ctl.EM'), e.read('Ctl.DN'), e.read('Ad[0]'), e.read('Ctl.POS')], [1, 1, 0, 0]);
}

console.log('Program control');
{
  const c = run({ tags: [...bools('Q', 'R', 'Go'), T('N', 'DINT')], rungs: ['XIC(Go)JSR(Sub);', 'OTE(R);'], routines: [{ name: 'Sub', rungs: ['ADD(N,1,N);', 'RET();', 'OTE(Q);'] }] });
  c.write('Go', 1); scans(c, 3);
  check('JSR runs the subroutine each scan; RET ends it early', c.read('N') === 3 && c.read('Q') === 0 && c.read('R') === 1);
  c.write('Go', 0); scans(c, 2);
  check('JSR on a false rung does not run the subroutine', c.read('N') === 3);
}
{
  const c = run({ tags: [...dints('I'), ...bools('Q')], rungs: ['CLR(I);', 'LBL(Top)ADD(I,1,I);', 'LES(I,10)JMP(Top);', 'OTE(Q);'] });
  scans(c, 1);
  check('JMP back to a LBL repeats rungs within one scan (loop to 10)', c.read('I') === 10 && c.read('Q') === 1);
}
{
  const c = new MTPS.Controller();
  c.download(proj({ tags: [], rungs: ['LBL(Top)NOP();', 'JMP(Top);'] }));
  c.setMode('remrun');
  let threw = false; try { scans(c, 1); } catch (e) { threw = true; }
  check('an endless JMP loop: the watchdog faults the controller (type 6 code 1) instead of hanging', !threw && !!c.fault && c.fault.type === 6 && c.fault.code === 1, JSON.stringify(c.fault));
}
{
  const c = run({ tags: [...bools('Z', 'O', 'L', 'In'), T('Tm', 'TIMER')], rungs: ['XIC(Z)MCR();', 'XIC(In)OTE(O);', 'XIC(In)OTL(L);', 'XIC(In)TON(Tm,1000,0);', 'MCR();'] });
  c.write('Z', 1); c.write('In', 1); scans(c, 3);
  check('MCR zone true: the rungs run', c.read('O') === 1 && c.read('L') === 1 && c.read('Tm.ACC') > 0);
  c.write('Z', 0); scans(c, 1);
  check('MCR zone false: OTE off, OTL kept, TON reset', c.read('O') === 0 && c.read('L') === 1 && c.read('Tm.ACC') === 0);
}
{
  const c = run({ tags: bools('A', 'B', 'C'), rungs: ['OTE(A);', 'AFI()OTE(B);', 'TND();', 'OTE(C);'] });
  scans(c, 1);
  check('AFI is always false; TND ends the scan (later rungs not scanned)', c.read('A') === 1 && c.read('B') === 0 && c.read('C') === 0);
}
{
  const c = run({ tags: bools('F', 'G'), rungs: ['XIC(S:FS)OTL(F);', 'XIC(S:FS)OTE(G);'] });
  scans(c, 1);
  const first = c.read('F'); scans(c, 1);
  check('S:FS is on for the first scan only', first === 1 && c.read('G') === 0);
}
{
  const c = run({ tags: bools('In', 'O1', 'O2'), rungs: ['XIC(In)[OTE(O1),OTE(O2)];'] });
  c.write('In', 1); scans(c, 1);
  check('an output branch drives both coils', c.read('O1') === 1 && c.read('O2') === 1);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
