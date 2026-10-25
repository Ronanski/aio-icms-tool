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

console.log('Generic module and SIM card (as the reference emulator is set up)');
{
  const P = o => ({ format: 'mt-plc-studio', version: 1, controller: { name: 'Motor_SealIn', type: 'PLC-CPU', rev: '1.0', slot: 2 },
    rack: { size: 10, modules: [Object.assign({ slot: 3, type: 'PLC-GENERIC', name: 'IO1', format: 'Data - DINT', inInst: 1, inSize: 2, outInst: 2, outSize: 1, cfgInst: 3, cfgSize: 0 }, o)] },
    dataTypes: [], tags: [T('STOP_PB', '', { alias: 'Local:3:I.Data[1].0' }), T('START_PB', '', { alias: 'Local:3:I.Data[1].1' }), T('MOTOR', '', { alias: 'Local:3:O.Data[0].0' })],
    tasks: [{ name: 'MainTask', type: 'continuous', programs: [{ name: 'MainProgram', main: 'MainRoutine', tags: [], routines: [{ name: 'MainRoutine', rungs: [{ t: 'XIO(STOP_PB)[XIC(START_PB),XIC(MOTOR)]OTE(MOTOR);' }] }] }] }] });
  const ch = new MTPS.Chassis(10, 'Virtual');
  ch.insert(2, 'PLC-CPU', 'Emulator'); ch.insert(3, 'PLC-SIM16', 'SIM');
  const c = ch.controller(2);
  const r = c.download(P({}));
  check('a project with its controller in slot 2 and a generic module in slot 3 downloads', r.ok, r.lines.join(' | '));
  c.setMode('remrun'); ch.advance(20);
  check('the generic module connects to the SIM card (Running)', c.moduleStatus(3).state === 'Running', JSON.stringify(c.moduleStatus(3)));
  eq('its tags: Local:3:I.Data is DINT[2], Local:3:O.Data is DINT[1]', [c.read('Local:3:I.Data').length, c.read('Local:3:O.Data').length], [2, 1]);
  ch.setBit(3, 1, true); ch.advance(20);
  check('input 1 of the SIM card is Local:3:I.Data[1].1 (START_PB): the motor starts', c.read('START_PB') === 1 && c.read('MOTOR') === 1);
  check('output 0 of the SIM card lights (Local:3:O.Data[0].0)', (ch.outputs(3) & 1) === 1);
  ch.setBit(3, 1, false); ch.advance(20);
  check('seal-in: the motor keeps running when START is released', c.read('MOTOR') === 1);
  ch.setBit(3, 0, true); ch.advance(20);
  check('STOP (input 0) stops it; the output goes off', c.read('MOTOR') === 0 && (ch.outputs(3) & 1) === 0);
  const c2 = new MTPS.Chassis(10, 'V2'); c2.insert(2, 'PLC-CPU', 'E'); c2.insert(3, 'PLC-SIM16', 'S');
  const k = c2.controller(2); k.download(P({ inSize: 4 })); k.setMode('remrun'); c2.advance(20);
  check('a wrong input size: module fault 16#0109 (invalid connection size)', k.moduleStatus(3).code === '16#0109');
  const c3 = new MTPS.Chassis(10, 'V3'); c3.insert(2, 'PLC-CPU', 'E'); c3.insert(3, 'PLC-DI16-24V', 'D');
  const k3 = c3.controller(2); k3.download(P({})); k3.setMode('remrun'); c3.advance(20);
  check('another card in that slot: 16#0116; an empty slot: 16#0204', k3.moduleStatus(3).code === '16#0116');
  const bad = MTPS.verify(Object.assign(P({ slot: 2 })));
  check('a module in the controller\'s slot is an error', bad.errors.length > 0 || bad.lines.some(l => /holds the controller/.test(l)));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
