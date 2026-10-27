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

console.log('Array (File)/Shift: LFL, LFU (1756-RM003 chapter 9)');
{
  const c = run({ tags: [T('St', 'DINT', { dim: 5 }), T('Ctl', 'CONTROL'), T('V', 'DINT'), T('Out', 'INT', { value: 99 }), ...bools('Ld', 'Ul')],
    rungs: ['XIC(Ld)LFL(V,St[0],Ctl,3,0);', 'XIC(Ul)LFU(St[0],Out,Ctl,3,0);'] });
  scans(c, 1);
  eq('LFL / LFU: .EM set at .POS = 0 after prescan and the first scan', [c.read('Ctl.EM'), c.read('Ctl.DN'), c.read('Ctl.EN'), c.read('Ctl.EU')], [1, 0, 0, 0]);
  const load = v => { c.write('V', v); c.write('Ld', 1); scans(c, 1); c.write('Ld', 0); scans(c, 1); };
  const unload = () => { c.write('Ul', 1); scans(c, 1); c.write('Ul', 0); scans(c, 1); return c.read('Out'); };
  load(10); load(20); load(30); load(40);
  eq('LFL loads at .POS until .LEN: .DN (full) set, the 4th load is ignored', [c.read('St[0]'), c.read('St[1]'), c.read('St[2]'), c.read('St[3]'), c.read('Ctl.POS'), c.read('Ctl.DN')], [10, 20, 30, 0, 3, 1]);
  eq('LFU unloads the last value in first (30, then 20) and stores 0 in its place', [unload(), c.read('St[2]'), c.read('Ctl.POS'), unload(), c.read('Ctl.POS')], [30, 0, 2, 20, 1]);
  eq('LFU of the last value: .EM set; then an empty LIFO puts 0 in Dest', [unload(), c.read('Ctl.EM'), unload(), c.read('Ctl.POS'), c.read('St[0]')], [10, 1, 0, 0, 0]);
  c.write('Ul', 1); scans(c, 1); c.write('V', 5); c.write('Ld', 1); scans(c, 1); scans(c, 1);
  eq('LFU / LFL are transitional: a held rung acts once', [c.read('Ctl.POS'), c.read('St[0]')], [1, 5]);
}
{
  const c = run({ tags: [T('St', 'SINT', { dim: 3, value: [-3, 0, 0] }), T('Ctl', 'CONTROL', { value: { POS: 7 } }), T('O', 'INT'), T('Ul', 'BOOL')], rungs: ['XIC(Ul)LFU(St[0],O,Ctl,2,7);'] });
  scans(c, 1); c.write('Ctl.POS', 7); c.write('Ul', 1); scans(c, 1);
  eq('LFU with .POS past .LEN: .POS is limited to .LEN first, then the element at .LEN - 1 is unloaded', [c.read('Ctl.POS'), c.read('O'), c.read('St[1]')], [1, 0, 0]);
  const d = run({ tags: [T('St', 'SINT', { dim: 3, value: [-3, 0, 0] }), T('Ctl', 'CONTROL'), T('O', 'INT'), T('Ul', 'BOOL')], rungs: ['XIC(Ul)LFU(St[0],O,Ctl,2,1);'] });
  scans(d, 1); d.write('Ul', 1); scans(d, 1);
  eq('LFU: a SINT LIFO into an INT Dest (RM003 example 3): -3 stays -3 (sign extension)', [d.read('O'), d.read('St[0]'), d.read('Ctl.EM')], [-3, 0, 1]);
  const e = run({ tags: [T('St', 'DINT', { dim: 3 }), T('Ctl', 'CONTROL'), T('O', 'DINT'), T('Ul', 'BOOL')], rungs: ['XIC(Ul)LFU(St[1],O,Ctl,3,2);'] });
  scans(e, 1); e.write('Ul', 1); scans(e, 1);
  check('LFU: .LEN past the end of the array: major fault, type 4 code 20', !!e.fault && e.fault.type === 4 && e.fault.code === 20, JSON.stringify(e.fault));
  const f = run({ tags: [T('St', 'COUNTER', { dim: 2 }), T('Src', 'COUNTER', { value: { ACC: 4 } }), T('Dst', 'COUNTER'), T('Ctl', 'CONTROL'), ...bools('Ld', 'Ul')], rungs: ['XIC(Ld)LFL(Src,St[0],Ctl,2,0);', 'XIC(Ul)LFU(St[0],Dst,Ctl,2,0);'] });
  scans(f, 1); f.write('Ld', 1); scans(f, 1); f.write('Ul', 1); scans(f, 1);
  eq('LFL / LFU with a structure LIFO (COUNTER[2]): the whole structure moves, its place is zeroed', [f.read('Dst.ACC'), f.read('St[0].ACC'), f.read('Ctl.POS')], [4, 0, 0]);
}

console.log('Sequencer: SQO, SQI, SQL (1756-RM003 chapter 10)');
{
  const steps = [0x11, 0x22, 0x33, 0x44, 0x55];
  const c = run({ tags: [T('Ar', 'DINT', { dim: 5, value: steps }), T('Dst', 'DINT', { value: 0x7F00 }), T('Ctl', 'CONTROL'), ...bools('Go', 'Rs')],
    rungs: ['XIC(Go)SQO(Ar[0],16#00FF,Dst,Ctl,4,0);', 'XIC(Rs)RES(Ctl);'] });
  c.write('Go', 1); scans(c, 1);
  eq('SQO first scan with a true rung: prescan set .EN, so no step; step 0 is output through the Mask', [c.read('Ctl.POS'), c.read('Dst'), c.read('Ctl.EN'), c.read('Ctl.DN')], [0, 0x7F11, 1, 0]);
  const step = () => { c.write('Go', 0); scans(c, 1); c.write('Go', 1); scans(c, 1); return [c.read('Ctl.POS'), c.read('Dst'), c.read('Ctl.DN')]; };
  eq('SQO: each false-to-true rung steps .POS by 1; Dest = (Dest AND NOT Mask) OR (Array[.POS] AND Mask)', step(), [1, 0x7F22, 0]);
  step(); step(); step();
  eq('SQO: .DN is set at .POS = .LEN', [c.read('Ctl.POS'), c.read('Dst'), c.read('Ctl.DN')], [4, 0x7F55, 1]);
  eq('SQO: after .LEN, .POS goes back to 1 (not 0)', step(), [1, 0x7F22, 0]);
  scans(c, 3);
  eq('SQO is transitional: a held rung does not step', c.read('Ctl.POS'), 1);
  c.write('Go', 0); c.write('Rs', 1); scans(c, 1); c.write('Rs', 0); c.write('Go', 1); scans(c, 1);
  eq('RES on the CONTROL sets .POS to 0 (RM003 SQO example with S:FS); the next rising rung goes to step 1', [c.read('Ctl.POS'), c.read('Dst')], [1, 0x7F22]);
}
{
  const c = run({ tags: [T('Ar', 'DINT', { dim: 3, value: [1, 2, 3] }), T('Dst', 'DINT'), T('C1', 'CONTROL'), T('C2', 'CONTROL'), T('C3', 'CONTROL'), T('Go', 'BOOL')],
    rungs: ['XIC(Go)SQO(Ar[0],-1,Dst,C1,0,0);', 'XIC(Go)SQO(Ar[0],-1,Dst,C2,2,5);', 'XIC(Go)SQO(Ar[1],-1,Dst,C3,4,1);'] });
  scans(c, 1); c.write('Go', 1); scans(c, 1);
  eq('SQO with .LEN = 0: .EN and .ER set, .POS not stepped', [c.read('C1.ER'), c.read('C1.EN'), c.read('C1.POS')], [1, 1, 0]);
  eq('SQO with .POS > .LEN: .POS goes back to 1 on the step', [c.read('C2.POS'), c.read('C2.ER')], [1, 0]);
  eq('SQO with .POS past the end of the array: .ER set, no fault', [c.read('C3.POS'), c.read('C3.ER'), !!c.fault], [2, 1, false]);
  c.write('C2.POS', 3); c.write('Go', 0); scans(c, 1);
  c.write('C2.POS', 3); scans(c, 1);
  check('SQO: .EN cleared on a false rung', c.read('C2.EN') === 0);
  c.write('Go', 1); scans(c, 1);
  eq('SQO stepping from .POS >= .LEN goes back to 1', c.read('C2.POS'), 1);
}
{
  // RM003 SQL example: Length 10, the load goes into the next position (array_dint[5] after .POS 4 → 5)
  const c = run({ tags: [T('Ar', 'DINT', { dim: 10 }), T('V', 'INT', { value: -2 }), T('Ctl', 'CONTROL'), T('Go', 'BOOL')], rungs: ['XIC(Go)SQL(Ar[0],V,Ctl,10,4);'] });
  scans(c, 1); c.write('Go', 1); scans(c, 1);
  eq('SQL example: .POS 4 → 5, Source into Ar[5] (an INT is sign extended)', [c.read('Ctl.POS'), c.read('Ar[5]'), c.read('Ctl.EN'), c.read('Ctl.DN')], [5, -2, 1, 0]);
  c.write('V', 7); scans(c, 1);
  eq('SQL: while the rung stays true, Source is loaded into the current step', [c.read('Ctl.POS'), c.read('Ar[5]')], [5, 7]);
  const d = run({ tags: [T('Ar', 'DINT', { dim: 3 }), T('Ctl', 'CONTROL'), T('Go', 'BOOL')], rungs: ['XIC(Go)SQL(Ar[0],1,Ctl,5,2);'] });
  scans(d, 1); d.write('Go', 1); scans(d, 1);
  check('SQL: .POS past the end of the array: major fault, type 4 code 20', !!d.fault && d.fault.type === 4 && d.fault.code === 20, JSON.stringify(d.fault));
}
{
  // RM003 "Using SQI without SQO": the ADD steps .POS when the step is complete, GRT / MOV wrap it to 1
  const c = run({ tags: [T('A1', 'DINT', { dim: 11, value: [0, 0x10F01, 0x2F02, 0xF03] }), T('V', 'DINT'), T('Ctl', 'CONTROL'), T('Q', 'BOOL')],
    rungs: ['SQI(A1[0],16#0000F0FF,V,Ctl,10,0)OTE(Q);', 'XIC(Q)ADD(Ctl.POS,1,Ctl.POS);', 'GRT(Ctl.POS,Ctl.LEN)MOV(1,Ctl.POS);'] });
  scans(c, 1);
  eq('SQI at step 0: Source 0 matches Array[0] through the Mask, the ADD steps to 1', [c.read('Ctl.POS'), c.read('Q')], [1, 1]);
  scans(c, 1);
  eq('SQI at step 1: no match (Array[1] AND Mask = 16#0F01), .POS stays', [c.read('Ctl.POS'), c.read('Q'), c.read('Ctl.ER')], [1, 0, 0]);
  c.write('V', 0x0E01); scans(c, 1);
  eq('SQI: bits outside the Mask are not compared (16#0E01 matches 16#10F01 through 16#F0FF)', [c.read('Ctl.POS'), c.read('Q')], [2, 1]);
  c.write('Ctl.POS', 11); scans(c, 1);
  eq('SQI with .POS > .LEN: .ER set and the rung-condition-out false', [c.read('Ctl.ER'), c.read('Q')], [1, 0]);
  const d = run({ tags: [T('A1', 'DINT', { dim: 2, value: [0x10FF, 0] }), T('M', 'INT', { value: -1 }), T('V', 'DINT', { value: 0xFF }), T('Ctl', 'CONTROL'), ...bools('Q', 'Q2')], rungs: ['SQI(A1[0],M,V,Ctl,1,0)OTE(Q);', 'SQI(A1[1],16#FF,V,Ctl,1,1)OTE(Q2);'] });
  scans(d, 1);
  check('SQI: an INT Mask of -1 is zero extended (16#FFFF): 16#10FF and 16#00FF do not match', d.read('Q') === 0);
  check('SQI: .POS past the end of the array sets .ER (no fault)', d.read('Q2') === 0 && d.read('Ctl.ER') === 1 && !d.fault);
  const v = MTPS.verify(proj({ tags: [T('Ar', 'INT', { dim: 3 }), T('Ad', 'DINT', { dim: 3 }), T('Ri', 'INT'), T('Ctl', 'CONTROL'), T('Rr', 'REAL')], rungs: ['SQO(Ar[0],1,Ad[0],Ctl,2,0);', 'SQO(Ad[0],1,Ri,Ctl,2,0);', 'SQI(Ad[0],Rr,1,Ctl,2,0);', 'SQL(Ad[0],2.5,Ctl,2,0);'] }));
  eq('sequencer operand types: Array a DINT array element, SQO Dest a DINT, Mask / Source an integer', v.errors.map(e => e.rung + ':' + e.op), ['0:0', '1:2', '2:1', '3:1']);
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

console.log('Trigonometric and advanced math: the examples of 1756-RM018A (chapters 14, 15)');
{
  const ex = [['SIN', 0.7853982, 0.70710677], ['COS', 1.0471976, 0.49999997], ['TAN', 2.0943952, -1.7320505], ['ASN', 0.2, 0.20135793], ['ACS', -0.6, 2.2142975], ['ATN', 0.86, 0.710271], ['LN', 5.0, 1.609438], ['LOG', 3.4, 0.53147894]];
  const c = run({ tags: ex.flatMap(([m, v]) => [T('S_' + m, 'REAL', { value: v }), T('D_' + m, 'REAL')]), rungs: ex.map(([m]) => `${m}(S_${m},D_${m});`) });
  scans(c, 1);
  ex.forEach(([m, v, want]) => near(`${m}(${v}) = ${want}`, c.read('D_' + m), want));
  const x = run({ tags: [T('X', 'REAL', { value: 33 }), T('Y', 'REAL', { value: 4 }), T('Res', 'REAL'), T('N', 'REAL')], rungs: ['XPY(X,Y,Res);', 'ACS(2.0,N);'] });
  scans(x, 1);
  check('XPY(33.0, 4.0) = 1185921.0', x.read('Res') === 1185921);
  check('ACS of a Source outside -1…1: Dest is NAN', Number.isNaN(x.read('N')));
  check('the math status flags follow the result: TAN(2.0943952) < 0 sets S:N', (() => { const t = run({ tags: [T('R', 'REAL')], rungs: ['TAN(2.0943952,R);'] }); scans(t, 1); return t.S.N === 1 && t.S.Z === 0; })());
}

console.log('Math conversions: the examples of 1756-RM018A (chapter 16)');
{
  const c = run({ tags: [T('Src', 'DINT', { value: 22 }), T('Bcd', 'DINT'), T('Va', 'DINT', { value: 34 }), T('Res1', 'DINT'), T('Big', 'DINT', { value: 0x1234567E }), T('Dec', 'DINT'),
    T('Deg_S', 'REAL', { value: 15 }), T('Deg_D', 'REAL'), T('Fv', 'REAL', { value: 789.55554 }), T('Ft', 'REAL'), T('Rad_D', 'REAL')], rungs: ['TOD(Src,Bcd);', 'FRD(Va,Res1);', 'FRD(Big,Dec);', 'DEG(Deg_S,Deg_D);', 'TRN(Fv,Ft);', 'RAD(0.0,Rad_D);'] });
  scans(c, 1);
  check('TOD: Source 22 gives 34 (16#22)', c.read('Bcd') === 34);
  check('FRD: Source 34 (16#22) gives 22', c.read('Res1') === 22);
  check('FRD: 16#1234_567E gives 12345684 (a digit over 9 is used as it is)', c.read('Dec') === 12345684);
  near('DEG: 15.0 gives 859.4367', c.read('Deg_D'), 859.4367);
  check('TRN: 789.55554 gives 789.0', c.read('Ft') === 789);
  check('RAD: 0.0 gives 0.0, S:Z set', c.read('Rad_D') === 0 && c.S.Z === 1);
}

console.log('FAL and FSC: the examples of 1756-RM018A (chapter 8)');
{
  const ten = k => Array.from({ length: 10 }, (_, i) => i * k + 1);
  const c = run({ tags: [T('array_1', 'DINT', { dim: 10 }), T('array_2', 'DINT', { dim: 10, value: ten(3) }), T('array_3', 'DINT', { dim: 10, value: ten(1) }), T('array_4', 'DINT', { dim: 10 }),
    T('value_1', 'DINT', { value: 5 }), T('value_2', 'DINT'), T('control_1', 'CONTROL'), T('control_2', 'CONTROL'), T('control_3', 'CONTROL'), T('control_4', 'CONTROL'), T('control_5', 'CONTROL'), T('En', 'BOOL')],
    rungs: ['FAL(control_1,10,0,ALL,array_1[control_1.POS],array_2[control_1.POS]);',
      'FAL(control_2,10,0,ALL,array_4[control_2.POS],array_2[control_2.POS]/array_3[control_2.POS]);',
      'XIC(En)FAL(control_3,10,0,INC,value_2,array_2[control_3.POS]+value_1);',
      'FAL(control_4,10,0,ALL,array_3[control_4.POS],value_1);',
      'FSC(control_5,10,0,ALL,array_1[control_5.POS]<>array_2[control_5.POS]);'] });
  scans(c, 1);
  eq('Example 1, array to array: each element of array_2 copied into the same position of array_1', c.read('array_1'), ten(3));
  eq('Example 4, array / array to array: array_2[i] / array_3[i] (integer divide truncates)', c.read('array_4'), ten(3).map((v, i) => Math.trunc(v / (i + 1))));
  eq('Example 2, element to array: value_1 into all 10 elements', c.read('array_3'), Array(10).fill(5));
  c.write('En', 1); scans(c, 1);
  check('Example 7, (element + array) to element, INC: only the current element each time it is enabled', c.read('value_2') === 6 && c.read('control_3.POS') === 1);
  c.write('En', 0); scans(c, 1); c.write('En', 1); scans(c, 1);
  check('Example 7: the next time, value_2 is overwritten with the next value', c.read('value_2') === 9 && c.read('control_3.POS') === 2);
  check('FSC Example 1: all equal (array_1 is a copy of array_2): no find, .DN set', c.read('control_5.DN') === 1 && c.read('control_5.FD') === 0);
  const s = run({ tags: [T('array_1', 'DINT', { dim: 10, value: [1, 2, 3, 9, 5, 6, 7, 8, 0, 10] }), T('array_2', 'DINT', { dim: 10, value: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }), T('control', 'CONTROL')],
    rungs: ['FSC(control,10,0,ALL,array_1[control.POS]<>array_2[control.POS]);'] });
  scans(s, 1);
  eq('FSC Example 1: the first element that is not equal sets FD and IN, POS holds its location', [s.read('control.FD'), s.read('control.IN'), s.read('control.POS')], [1, 1, 3]);
  s.write('control.IN', 0); scans(s, 1);
  check('FSC Example 1: clear the IN bit to search the rest of the array (the next one is element 8)', s.read('control.POS') === 8 && s.read('control.IN') === 1);
}

console.log('AVE, SRT, STD, SIZE and CPS: the examples of 1756-RM018A (chapter 8)');
{
  // DINT_array, which is DINT[4,5], holds 20 down to 1 (row 0: 20 19 18 17 16, …, row 3: 5 4 3 2 1)
  const grid = () => Array.from({ length: 20 }, (_, k) => 20 - k);
  const c = run({ tags: [T('DINT_array', 'DINT', { dim: [4, 5], value: grid() }), T('dint_ave', 'DINT'), T('dint_ave2', 'DINT'), T('real_std', 'REAL'), T('real_std2', 'REAL'),
    T('control', 'CONTROL'), T('control2', 'CONTROL'), T('control_1', 'CONTROL'), T('control_2', 'CONTROL'), T('array_a', 'DINT', { dim: 10 }), T('array_a_size', 'DINT')],
    rungs: ['AVE(DINT_array[0,1],0,dint_ave,control,4,0);', 'AVE(DINT_array[3,0],1,dint_ave2,control2,5,0);',
      'STD(DINT_array[0,4],0,real_std,control_1,4,0);', 'STD(DINT_array[0,0],1,real_std2,control_2,5,0);', 'SIZE(array_a,0,array_a_size);'] });
  scans(c, 1);
  check('AVE Example 1: dimension 0 from [0,1], Length 4: (19 + 14 + 9 + 4) / 4 = 11.5, dint_ave = 12', c.read('dint_ave') === 12 && c.read('control.DN') === 1);
  check('AVE Example 2: dimension 1 from [3,0], Length 5: (5 + 4 + 3 + 2 + 1) / 5 = 3', c.read('dint_ave2') === 3);
  near('STD Example 1: dimension 0 from [0,4], Length 4 (16, 11, 6, 1): 6.454972', c.read('real_std'), 6.454972);
  near('STD Example 2: dimension 1 from [0,0], Length 5 (20 … 16): sqrt(10 / 4) = 1.581139', c.read('real_std2'), 1.581139);
  check('SIZE Example 1: dimension 0 of array_a has 10 elements', c.read('array_a_size') === 10);
  const s = run({ tags: [T('DINT_array', 'DINT', { dim: [4, 5], value: grid() }), T('control_1', 'CONTROL'), T('sort1', 'BOOL')],
    rungs: ['XIC(sort1)SRT(DINT_array[0,2],0,control_1,4,0);'] });
  s.write('sort1', 1); scans(s, 1);
  eq('SRT Example 1: column 2 (18 13 8 3) sorted ascending: 3 8 13 18; .DN set, Position 3', [[0, 1, 2, 3].map(r => s.read(`DINT_array[${r},2]`)), s.read('control_1.DN'), s.read('control_1.POS')], [[3, 8, 13, 18], 1, 3]);
  check('SRT Example 1: the other columns are not changed', s.read('DINT_array[0,1]') === 19 && s.read('DINT_array[3,3]') === 2);
  const s2 = run({ tags: [T('DINT_array', 'DINT', { dim: [4, 5], value: grid() }), T('control_1', 'CONTROL')], rungs: ['SRT(DINT_array[2,0],1,control_1,5,0);'] });
  scans(s2, 1);
  eq('SRT Example 2: row 2 (10 9 8 7 6) sorted ascending: 6 7 8 9 10', [0, 1, 2, 3, 4].map(k => s2.read(`DINT_array[2,${k}]`)), [6, 7, 8, 9, 10]);
  const p = run({ tags: [T('project_data', 'DINT', { dim: 100, value: Array.from({ length: 100 }, (_, k) => k) }), T('produced_array', 'DINT', { dim: 100 })],
    rungs: ['CPS(project_data[0],produced_array[0],100);'] });
  scans(p, 1);
  check('CPS Example: project_data[0] … [99] copied into produced_array', p.read('produced_array[99]') === 99 && p.read('produced_array[1]') === 1);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
