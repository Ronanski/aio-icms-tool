/* MT PLC Studio engine tests (node, no browser): types, tags, rung text, verify, modes, scan, instructions,
   forces and the I/O interface of mtps/js/engine.js.
   Usage: node tests/mtps.test.js */
'use strict';
const MTPS = require('../mtps/js/engine.js');

let failed = 0, passed = 0;
function check(name, cond, info = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${info}`); }
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* a project in the file format of the spec (section 8); rungs are rung text or { t, c } */
function proj(o = {}) {
  const rungs = r => (r || []).map(t => (typeof t === 'string' ? { t } : t));
  return {
    format: 'mt-plc-studio', version: 1,
    controller: { name: 'Test', type: 'PLC-CPU', rev: '1.0' },
    rack: { size: 10, modules: o.modules || [{ slot: 1, type: 'PLC-DI16-24V', name: 'DI_1' }, { slot: 2, type: 'PLC-DO16-24V', name: 'DO_1' }, { slot: 3, type: 'PLC-AI4', name: 'AI_1' }] },
    dataTypes: o.dataTypes || [],
    tags: o.tags || [],
    tasks: [{ name: 'MainTask', type: 'continuous', programs: [{
      name: 'MainProgram', main: 'MainRoutine', tags: o.ptags || [],
      routines: [{ name: 'MainRoutine', rungs: rungs(o.rungs) }, ...(o.routines || []).map(r => ({ name: r.name, rungs: rungs(r.rungs) }))] }] }],
  };
}
const T = (name, type, extra) => ({ name, type, ...extra });
/* a controller with the project downloaded and in Rem Run */
function run(o) {
  const c = new MTPS.Controller();
  const r = c.download(proj(o));
  if (!r.ok) throw new Error('download failed: ' + r.lines.join(' | '));
  c.setMode('remrun');
  return c;
}
const scans = (c, n, dt = 10) => { for (let k = 0; k < n; k++) c.scan(dt); };

console.log('Rung text');
{
  const seal = '[XIC(Start_PB),XIC(Motor_Run)]XIC(Stop_PB)XIC(OL_OK)OTE(Motor_Run);';
  const r = MTPS.parseRung(seal);
  check('seal-in rung parses', !r.err && r.elems.length === 4);
  check('branch has two legs', r.elems[0].t === 'BR' && r.elems[0].legs.length === 2);
  eq('instruction and operand', r.elems[3], { t: 'OTE', a: ['Motor_Run'] });
  eq('serialize gives the same text', MTPS.serializeRung(r.elems), seal);
  const nest = 'XIC(a)[XIC(b)[XIC(c),XIO(d)],XIC(e)]OTE(f);';
  eq('nested branches round-trip', MTPS.serializeRung(MTPS.parseRung(nest).elems), nest);
  eq('operands of a box', MTPS.parseRung('TON(Run_Timer,5000,0);').elems[0].a, ['Run_Timer', '5000', '0']);
  eq('CPT expression keeps its commas and parens', MTPS.parseRung('CPT(Dest,(A+B)*2);').elems[0].a, ['Dest', '(A+B)*2']);
  eq('array subscript inside an operand', MTPS.parseRung('MOV(Tank[2].Level,X);').elems[0].a, ['Tank[2].Level', 'X']);
  eq('? is an empty operand', MTPS.parseRung('XIC(?)OTE(?);').elems.map(e => e.a[0]), ['?', '?']);
  eq('instruction without operands', MTPS.parseRung('NOP();').elems[0], { t: 'NOP', a: [] });
  eq('spaces between instructions are ignored', MTPS.serializeRung(MTPS.parseRung(' XIC( a ) OTE(b) ;').elems), 'XIC(a)OTE(b);');
  eq('empty leg in a branch', MTPS.serializeRung(MTPS.parseRung('[,XIC(a)]OTE(b);').elems), '[,XIC(a)]OTE(b);');
  check('empty rung parses to no instructions', MTPS.parseRung(';').elems.length === 0 && MTPS.parseRung('').elems.length === 0);
  check('missing ] is an error', !!MTPS.parseRung('[XIC(a),XIC(b)OTE(c);').err);
  check('missing ) is an error', !!MTPS.parseRung('XIC(a;').err);
  check('stray ] is an error', !!MTPS.parseRung('XIC(a)]OTE(b);').err);
  check('text after ; is an error', !!MTPS.parseRung('XIC(a);OTE(b);').err);
  check('mnemonic without ( ) is an error', !!MTPS.parseRung('XIC OTE(b);').err);
}

console.log('Numbers');
{
  const n = s => { const r = MTPS.parseNumber(s); return r && r.v; };
  eq('decimal', n('5'), 5);
  eq('negative', n('-3'), -3);
  eq('real', n('2.5'), 2.5);
  eq('hex 16#FF', n('16#FF'), 255);
  eq('binary 2#1010', n('2#1010'), 10);
  eq('octal 8#17', n('8#17'), 15);
  eq('underscores in a based number', n('2#1111_0000'), 240);
  eq('16#FFFFFFFF is -1 as a DINT', n('16#FFFFFFFF'), -1);
  check('2.5 is REAL and 5 is not', MTPS.parseNumber('2.5').real && !MTPS.parseNumber('5').real);
  check('a bad digit is not a number', MTPS.parseNumber('2#102') === null && MTPS.parseNumber('abc') === null);
}

console.log('Tags and types');
{
  const c = run({
    dataTypes: [{ name: 'Pump', members: [{ name: 'Running', type: 'BOOL' }, { name: 'Speed', type: 'REAL' }, { name: 'Hours', type: 'DINT' }] }],
    tags: [T('Count', 'DINT', { value: 7 }), T('Small', 'SINT'), T('Word', 'INT'), T('Level', 'REAL'), T('Flag', 'BOOL'),
      T('P1', 'Pump'), T('Tank', 'DINT', { dim: 5 }), T('Pumps', 'Pump', { dim: 3 }), T('Run_Timer', 'TIMER'),
      { name: 'Start_PB', alias: 'Local:1:I.Data.0', desc: 'S1 START PB' }, { name: 'Motor_Cmd', alias: 'Local:2:O.Data.0' },
      { name: 'Bit3', alias: 'Count.3' }, T('Shared', 'DINT', { value: 1 })],
    ptags: [T('Local_Val', 'DINT'), T('Shared', 'DINT', { value: 2 })],
  });
  eq('saved value is loaded', c.read('Count'), 7);
  eq('names are not case sensitive', c.read('count'), 7);
  check('write a DINT', c.write('Count', 42) && c.read('Count') === 42);
  eq('bit of a DINT (42 = 101010b)', [c.read('Count.1'), c.read('Count.2'), c.read('Count.3')], [1, 0, 1]);
  eq('alias to a bit of a DINT', c.read('Bit3'), 1);
  c.write('Count.0', 1);
  eq('write a bit of a DINT', c.read('Count'), 43);
  c.write('Word', 40000);
  eq('INT wraps at 16 bits', c.read('Word'), 40000 - 65536);
  c.write('Small', 130);
  eq('SINT wraps at 8 bits', c.read('Small'), 130 - 256);
  c.write('Level', 0.1);
  eq('REAL is 32-bit', c.read('Level'), Math.fround(0.1));
  c.write('Count', 2.5);
  eq('REAL to DINT rounds half to even (2.5 → 2)', c.read('Count'), 2);
  c.write('Count', 3.5);
  eq('REAL to DINT rounds half to even (3.5 → 4)', c.read('Count'), 4);
  c.write('Flag', 5);
  eq('BOOL is 0 or 1', c.read('Flag'), 1);
  c.write('P1.Speed', 12.5);
  eq('member of a user-defined type', c.read('P1.Speed'), 12.5);
  c.write('Tank[3]', 9);
  eq('array element', c.read('Tank[3]'), 9);
  c.write('Pumps[1].Running', 1);
  eq('member of an array element', c.read('Pumps[1].Running'), 1);
  eq('whole structure reads as a copy', c.read('P1'), { Running: 0, Speed: 12.5, Hours: 0 });
  eq('TIMER members', c.read('Run_Timer'), { PRE: 0, ACC: 0, EN: 0, TT: 0, DN: 0 });
  eq('module input tag', c.read('Local:1:I'), { Fault: 0, Data: 0 });
  eq('analog channel is REAL', c.read('Local:3:I.Ch0Data'), 0);
  eq('a digital input module has its configuration tag Local:1:C (AB:1756_DI:C:0: filters of 4 groups, change of state)', Object.keys(c.read('Local:1:C')), ['FilterOffOn_0_7', 'FilterOffOn_8_15', 'FilterOffOn_16_23', 'FilterOffOn_24_31', 'FilterOnOff_0_7', 'FilterOnOff_8_15', 'FilterOnOff_16_23', 'FilterOnOff_24_31', 'COSOnOffEn', 'COSOffOnEn']);
  check('the analog input card Local:3:C: RealTimeSample and Ch0Config … Ch3Config (AB:1756_NII_Struct:C:0) with the scaling members', Object.keys(c.read('Local:3:C')).join() === 'RealTimeSample,Ch0Config,Ch1Config,Ch2Config,Ch3Config' && c.read('Local:3:C.Ch2Config.LowEngineering') === 0 && c.write('Local:3:C.Ch2Config.HighEngineering', 100) && c.read('Local:3:C.Ch2Config.HighEngineering') === 100);
  {
    const a = run({ modules: [{ slot: 4, type: 'PLC-AO4', name: 'AO_1' }] });
    check('the analog output card Local:4:C: ProgToFaultEn and Ch<n>Config (AB:1756_NIO_Struct:C:0) with FaultValue, ProgValue, limits', Object.keys(a.read('Local:4:C')).join() === 'ProgToFaultEn,Ch0Config,Ch1Config,Ch2Config,Ch3Config' && a.read('Local:4:C.Ch3Config.FaultValue') === 0 && a.read('Local:4:C.Ch0Config.HighLimit') === 0);
  }
  check('a digital output module has Local:2:C with its fault and program mode states', c.read('Local:2:C.ProgToFaultEn') === 0 && c.read('Local:2:C.FaultValue') === 0);
  check('the configuration tag can be written (it is not an input image)', c.write('Local:2:C.FaultValue', 5) === true && c.read('Local:2:C.FaultValue') === 5);
  eq('program tag', c.read('Local_Val', 'MainProgram'), 0);
  eq('a program tag hides the controller tag of the same name', c.read('Shared', 'MainProgram'), 2);
  eq('the controller tag is still there', c.read('Shared'), 1);
  check('unknown tag reads undefined', c.read('Nope') === undefined);
  check('member that does not exist', c.read('P1.Nope') === undefined);
  check('subscript out of range', c.read('Tank[5]') === undefined);
  check('writing an input image is refused', c.write('Local:1:I.Data.0', 1) === false && c.write('Start_PB', 1) === false && c.read('Start_PB') === 0);
  check('writing an output image is allowed', c.write('Motor_Cmd', 1) === true && c.read('Local:2:O.Data.0') === 1);
  check('S:FS is read-only, S:V can be set (as with OTE / OTL in the reference)', c.write('S:FS', 1) === false && c.write('S:V', 1) === true && c.read('S:V') === 1);
  // module-defined data types as Studio 5000 names them (help: 1756 discrete / analog module-defined data types)
  eq('module tag types: AB:1756_DI / AB:1756_DO / AB:1756_IF4_Float', [MTPS.MODULES['PLC-DI16-24V'].I, MTPS.MODULES['PLC-DI16-24V'].C, MTPS.MODULES['PLC-DO16-24V'].I, MTPS.MODULES['PLC-DO16-24V'].O, MTPS.MODULES['PLC-DO16-24V'].C, MTPS.MODULES['PLC-AI4'].I, MTPS.MODULES['PLC-AO4'].O],
    ['AB:1756_DI:I:0', 'AB:1756_DI:C:0', 'AB:1756_DO:I:0', 'AB:1756_DO:O:0', 'AB:1756_DO:C:0', 'AB:1756_IF4_Float:I:0', 'AB:1756_OF4_Float:O:0']);
  check('the 1756 discrete and analog modules have no status tag Local:<slot>:S (none in their module profile)', c.read('Local:1:S') === undefined && c.read('Local:2:S') === undefined);
  check('a tag of an old module type name (PLC:DI16:I, 0.4.0) still verifies', MTPS.verify(proj({ tags: [T('Old_In', 'PLC:DI16:I')], rungs: ['XIC(Old_In.Data.0)NOP();'] })).errors.length === 0);
  {
    const d = run({ tags: [T('Q', 'BOOL', { alias: 'Local:2:O.Data.3' })], rungs: ['OTE(Q);'] });
    scans(d, 2);
    check('a digital output module echoes its applied outputs in Local:2:I.Data (AB:1756_DO:I:0)', d.read('Local:2:I.Data') === 8 && d.read('Local:2:I.Fault') === 0);
  }
  const dt = MTPS.dataTypes(proj({ dataTypes: [{ name: 'Pump', members: [{ name: 'Running', type: 'BOOL' }] }] }));
  check('data types list: predefined, module-defined, user-defined', dt.predefined.includes('TIMER') && dt.moduleDefined.includes('AB:1756_DI:I:0') && dt.userDefined.includes('Pump'));
  check('tag name rule', MTPS.validName('Motor_1') && MTPS.validName('_x') && !MTPS.validName('1abc') && !MTPS.validName('a-b') && !MTPS.validName('a'.repeat(41)));
}

console.log('Verify');
{
  const v = o => MTPS.verify(proj(o));
  const r = v({ tags: [T('A', 'BOOL')], rungs: ['XIC(A)OTE(A);', 'XIC(A)OTE(Alarm_Horn);'] });
  check('undefined tag is an error', r.errors.length === 1);
  eq('error line as in the reference', r.errors[0].text, "Error: Rung 1, OTE, Operand 0: Undefined tag 'Alarm_Horn'.");
  check('error points at rung, instruction and operand', r.errors[0].rung === 1 && r.errors[0].mnem === 'OTE' && r.errors[0].op === 0 && r.errors[0].routine === 'MainRoutine');
  eq('Complete line', r.lines[r.lines.length - 1], 'Complete - 1 error(s), 0 warning(s)');
  check('lines start with the routine being verified', r.lines.some(l => l === "Verifying routine 'MainRoutine' of program 'MainProgram'..."));
  eq('missing operand', v({ rungs: ['XIC(?)NOP();'] }).errors[0].text, 'Error: Rung 0, XIC, Operand 0: Missing operand.');
  eq('wrong data type', v({ tags: [T('A', 'BOOL')], rungs: ['XIC(A)TON(A,100,0);'] }).errors[0].text, 'Error: Rung 0, TON, Operand 0: Invalid data type. Argument must match parameter data type.');
  eq('immediate where a tag is needed', v({ rungs: ['XIC(1)NOP();'] }).errors[0].text, 'Error: Rung 0, XIC, Operand 0: Immediate value not allowed.');
  eq('tag where an immediate is needed', v({ tags: [T('T1', 'TIMER'), T('P', 'DINT')], rungs: ['TON(T1,P,0);'] }).errors[0].text, 'Error: Rung 0, TON, Operand 1: Immediate value expected.');
  eq('unknown instruction', v({ rungs: ['XYZ(a);'] }).errors[0].text, "Error: Rung 0: Unknown instruction 'XYZ'.");
  eq('wrong number of operands', v({ tags: [T('A', 'BOOL')], rungs: ['XIC(A,A)NOP();'] }).errors[0].text, 'Error: Rung 0, XIC: Wrong number of operands (1 expected).');
  eq('empty rung', v({ rungs: [';'] }).errors[0].text, 'Error: Rung 0: Rung has no instructions.');
  check('rung text that does not parse', /^Error: Rung 0: /.test(v({ rungs: ['XIC(a'] }).errors[0].text));
  check('undefined member', /Undefined tag 'P\.Nope'/.test(v({ tags: [T('P', 'TIMER')], rungs: ['XIC(P.Nope)NOP();'] }).errors[0].text));
  check('JSR to a routine that does not exist', /Undefined routine 'Sub9'/.test(v({ rungs: ['JSR(Sub9,0);'] }).errors[0].text));
  check('MCR must be the last instruction of the rung', /MCR must be the last instruction/.test(v({ tags: [T('A', 'BOOL')], rungs: ['MCR()OTE(A);', 'MCR();'] }).errors[0].text));
  check('JMP to a label that does not exist',/Undefined label 'L9'/.test(v({ rungs: ['JMP(L9);'] }).errors[0].text));
  check('LBL that is not the first instruction', /LBL must be the first instruction/.test(v({ tags: [T('A', 'BOOL')], rungs: ['XIC(A)LBL(L1)NOP();', 'JMP(L1);'] }).errors[0].text));
  check('label used twice', /Label 'L1' is defined more than once/.test(v({ rungs: ['LBL(L1)NOP();', 'LBL(L1)NOP();'] }).errors.map(e => e.text).join()));
  {
    // Constant (help: New Parameter or Tag dialog box, Tag Editor columns): logic that writes it does not verify;
    // the Data Monitor (Monitor Tags) can still write it
    const K = [T('Limit', 'DINT', { constant: true, value: 7 }), T('Arr', 'DINT', { dim: 3, constant: true }), T('K_Alias', 'BOOL', { alias: 'Limit.2' }), T('D', 'DINT')];
    const ke = (r) => v({ tags: K, rungs: [r] }).errors.map(e => e.text).join(' | ');
    check('Constant: MOV into a constant tag does not verify', /Tag 'Limit' is a constant: logic cannot write to it/.test(ke('MOV(1,Limit);')));
    check('Constant: an element of a constant array, a bit, and an alias of a constant are refused too', /constant/.test(ke('MOV(1,Arr[1]);')) && /constant/.test(ke('OTE(Limit.0);')) && /constant/.test(ke('OTL(K_Alias);')));
    check('Constant: reading it is fine (source operand, XIC)', ke('XIC(Limit.1)MOV(Limit,D);') === '');
    const kc = run({ tags: K, rungs: ['MOV(Limit,D);'] });
    kc.scan(10);
    check('Constant: the logic reads its value', kc.read('D') === 7);
    check('Constant: Toggle Bit / a write from the ladder is refused, Monitor Tags may write it', kc.write('Limit', 9) === false && kc.toggle('Limit.0') === false && kc.write('Limit', 9, undefined, true) === true && kc.read('Limit') === 9);
    const kp = proj({ tags: K, rungs: ['MOV(Limit,D);'] }); kp.tasks[0].programs[0].routines[0].rungs = [{ t: 'MOV(D,Limit);' }];
    check('Constant: an online edit that writes a constant is not accepted', kc.edit(kp).ok === false);
    const sp = proj({ tags: K, rungs: ['MOV(Limit,D);'] });
    const sc = new MTPS.Controller(); sc.download(sp); sp.tags[3].style = 'Hex';
    check('a changed Style is not a logic change (no new download needed); a changed External Access is', sc.holds(sp) && (() => { sp.tags[3].access = 'Read Only'; return !sc.holds(sp); })());
  }
  {
    // arrays of 2 and 3 dimensions (1756-PM004: Data_type[x,y,z], one subscript per dimension, the rightmost varies fastest)
    const G = [T('Grid', 'DINT', { dim: [3, 4] }), T('Cube', 'INT', { dim: [2, 3, 4] }), T('I', 'DINT', { value: 2 }), T('J', 'DINT', { value: 3 }), T('D', 'DINT'),
      T('North_Tank', 'DINT', { alias: 'Grid[0,1]' })];
    const ge = r => v({ tags: G, rungs: [r] }).errors.map(e => e.text).join(' | ');
    check('Grid[2,3] and Cube[1,2,3] verify', ge('MOV(5,Grid[2,3])MOV(6,Cube[1,2,3]);') === '');
    check('a subscript past its own dimension is an error (Grid[3,0], Grid[0,4])', /out of range.*0 to 2/.test(ge('MOV(1,Grid[3,0]);')) && /out of range.*0 to 3/.test(ge('MOV(1,Grid[0,4]);')));
    check('the wrong number of subscripts is an error (Grid[1], Cube[1,2])', /Wrong number of subscripts.*2 dimensions/.test(ge('MOV(1,Grid[1]);')) && /3 dimensions/.test(ge('MOV(1,Cube[1,2]);')));
    check('a member or bit of a 2-dimension array needs its subscripts first, e.g. Grid[0,0]', /Grid\[0,0\]/.test(ge('XIC(Grid.0)NOP();')));
    const gc = run({ tags: G, rungs: ['MOV(7,Grid[I,J])MOV(9,Cube[1,2,3])MOV(4,North_Tank);', 'MOV(Grid[2,3],D);'] });
    gc.scan(10);
    check('indirect subscripts Grid[I,J]; the element is stored row by row (Grid[2,3] is element 11)', gc.read('Grid[2,3]') === 7 && gc.read('D') === 7 && gc.read('Grid')[11] === 7);
    check('Cube[1,2,3] is element 23 of 24; an alias of Grid[0,1] (as "north_tank" of 1756-PM004) shares its value', gc.read('Cube')[23] === 9 && gc.read('Cube').length === 24 && gc.read('Grid[0,1]') === 4 && gc.read('North_Tank') === 4);
    check('Monitor Tags can write Grid[1,2]', gc.write('Grid[1,2]', 3) && gc.read('Grid')[6] === 3);
    const gf = run({ tags: G.concat([T('Ix', 'DINT', { value: 5 })]), rungs: ['MOV(1,Grid[Ix,0]);'] });
    gf.scan(10);
    check('an indirect subscript out of range at run time is major fault 4/20', gf.fault && gf.fault.type === 4 && gf.fault.code === 20);
    const gp = proj({ tags: G, rungs: ['MOV(7,Grid[I,J]);'] }), gx = new MTPS.Controller(); gx.download(gp); gx.setMode('remrun'); gx.scan(10);
    gp.tasks[0].programs[0].routines[0].rungs.push({ t: 'NOP();' });
    check('an online edit keeps the values of a 2-dimension array', gx.edit(gp).ok && gx.read('Grid[2,3]') === 7);
    check('COP across rows of a 2-dimension array (the elements are contiguous)', (() => { const c = run({ tags: G, rungs: ['FLL(8,Grid[0,2],4);'] }); c.scan(10); return c.read('Grid').slice(0, 7).join() === '0,0,8,8,8,8,0'; })());
    check('more than 3 dimensions, or a dimension of 0, is refused', /invalid array dimensions/.test(MTPS.verify(proj({ tags: [T('Q', 'DINT', { dim: [2, 2, 2, 2] })] })).errors.map(e => e.text).join()) && /invalid array dimensions/.test(MTPS.verify(proj({ tags: [T('Q', 'DINT', { dim: [2, 0] })] })).errors.map(e => e.text).join()));
    eq('dimText / dimN', [MTPS.dimText([2, 3, 4]), MTPS.dimN([2, 3, 4]), MTPS.dimText(10), MTPS.dimN(0)], ['2,3,4', 24, '10', 0]);
  }
  check('constant subscript out of range', /out of range/.test(v({ tags: [T('A', 'DINT', { dim: 3 })], rungs: ['MOV(1,A[3]);'] }).errors[0].text));
  check('writing a REAL to an AND dest is a type error', /Invalid data type/.test(v({ tags: [T('R', 'REAL')], rungs: ['AND(1,2,R);'] }).errors[0].text));
  check('a negative timer preset is an error', /Preset/.test(v({ tags: [T('T1', 'TIMER')], rungs: ['TON(T1,-5,0);'] }).errors[0].text));
  const w = v({ tags: [T('A', 'BOOL'), T('B', 'BOOL')], rungs: ['XIC(A)OTE(B);', 'XIC(A)OTE(B);'] });
  check('duplicate OTE is a warning, not an error', w.errors.length === 0 && w.warnings.length === 1 && /^Warning: Rung 1, OTE, Operand 0: /.test(w.warnings[0].text));
  check('OTE on an input is a warning', v({ rungs: ['XIC(Local:1:I.Data.1)OTE(Local:1:I.Data.0);'] }).warnings.length === 1);
  check('a good project has no errors', v({ tags: [T('A', 'BOOL')], rungs: ['XIC(A)OTE(A);'] }).errors.length === 0);
  check('alias to something that is not a tag', /Alias/.test(v({ tags: [{ name: 'X', alias: 'Nothing.0' }] }).errors[0].text));
  check('two tags with one name', /more than once/.test(v({ tags: [T('A', 'BOOL'), T('a', 'DINT')] }).errors[0].text));
  check('bad tag name', /Invalid tag name/.test(v({ tags: [T('1A', 'BOOL')] }).errors[0].text));
  check('unknown data type', /Undefined data type 'Thing'/.test(v({ tags: [T('A', 'Thing')] }).errors[0].text));
  check('module in a slot the rack does not have', v({ modules: [{ slot: 10, type: 'PLC-DI16-24V', name: 'DI' }] }).errors.length === 1);
  check('two modules in one slot', v({ modules: [{ slot: 1, type: 'PLC-DI16-24V', name: 'A' }, { slot: 1, type: 'PLC-AI4', name: 'B' }] }).errors.length === 1);
  check('a user type that contains itself', /contains itself/.test(v({ dataTypes: [{ name: 'Loop', members: [{ name: 'Me', type: 'Loop' }] }] }).errors[0].text));
  const one = MTPS.verify(proj({ rungs: ['XIC(?)NOP();'], routines: [{ name: 'Other', rungs: ['XIC(?)NOP();'] }] }), { routine: 'Other' });
  check('Verify Routine checks only that routine', one.errors.length === 1 && one.errors[0].routine === 'Other');
  const bad = new MTPS.Controller().download(proj({ rungs: ['XIC(Missing)NOP();'] }));
  check('a project with errors does not download', !bad.ok && bad.errors.length === 1);
}

console.log('Modes and key switch');
{
  const c = new MTPS.Controller();
  check('empty controller is in Rem Prog with the key in REM', c.mode === 'remprog' && c.key === 'REM');
  check('no Run without a project', c.setMode('remrun') === false && c.mode === 'remprog');
  c.download(proj({ tags: [T('A', 'BOOL')], rungs: ['XIO(A)OTE(A);'] }));
  let events = [];
  c.on('change', e => events.push(e.what));
  check('REM: the software can go to Rem Run', c.setMode('remrun') && c.mode === 'remrun');
  check('mode change is an event', events.includes('mode'));
  c.setKey('RUN');
  check('key to RUN: Run, and the software cannot change it', c.mode === 'run' && c.setMode('remprog') === false && c.mode === 'run');
  c.setKey('REM');
  check('key RUN → REM: Rem Run', c.mode === 'remrun');
  c.setKey('PROG');
  check('key to PROG: Program', c.mode === 'prog' && c.setMode('remrun') === false);
  c.setKey('REM');
  check('key PROG → REM: Rem Prog', c.mode === 'remprog');
  c.setKey('RUN');
  check('download is refused with the key in RUN', c.download(proj()).ok === false);
}

console.log('Scan and I/O');
{
  const c = run({
    tags: [{ name: 'Start_PB', alias: 'Local:1:I.Data.0' }, { name: 'Stop_PB', alias: 'Local:1:I.Data.1' }, { name: 'OL_OK', alias: 'Local:1:I.Data.2' },
      T('Motor_Run', 'BOOL'), { name: 'Motor_Cmd', alias: 'Local:2:O.Data.0' }],
    rungs: ['[XIC(Start_PB),XIC(Motor_Run)]XIC(Stop_PB)XIC(OL_OK)OTE(Motor_Run);', 'XIC(Motor_Run)OTE(Motor_Cmd);'],
  });
  c.setInputs(1, 0b110);          // stop and overload healthy (N.C.)
  c.scan(10);
  check('motor off before start', c.read('Motor_Run') === 0 && c.ioImage(2).out === 0);
  c.setInputs(1, 0b111); c.scan(10);
  check('start: motor runs and the output card is on', c.read('Motor_Run') === 1 && c.ioImage(2).out === 1);
  c.setInputs(1, 0b110); scans(c, 3);
  check('seal-in holds after start is released', c.read('Motor_Run') === 1);
  eq('input image of the card', c.ioImage(1).in, 0b110);
  c.setInputs(1, [0, 0, 1]); c.scan(10);
  check('stop drops the seal-in (inputs as an array of points)', c.read('Motor_Run') === 0 && c.ioImage(2).out === 0);
  c.setInputs(1, 0b111); c.scan(10);
  c.setMode('remprog'); c.scan(10);
  check('Program: outputs off but the tag keeps its value', c.ioImage(2).out === 0 && c.read('Motor_Cmd') === 1);
  c.setInputs(1, 0); c.scan(10);
  check('Program: input values are still live', c.read('Start_PB') === 0 && c.read('Motor_Run') === 1);
  c.setMode('remrun'); c.scan(10);
  check('prescan: OTE bits cleared on Program → Run', c.read('Motor_Run') === 0);
  const r = run({ tags: [T('A', 'BOOL'), T('B', 'BOOL'), T('C', 'BOOL'), T('X', 'DINT')], rungs: ['XIC(A)OTE(B)MOV(5,X)OTE(C);', 'XIO(A)OTE(C);'] });
  r.write('A', 1); r.scan(10);
  check('an output in the middle of a rung passes power on', r.read('B') === 1 && r.read('X') === 5);
  check('rungs run in order (the last OTE wins)', r.read('C') === 0);
  const a = run({ tags: [T('V', 'REAL')], rungs: ['MOV(Local:3:I.Ch1Data,V);'] });
  a.setInputs(3, [0, 4.25, 0, 0]); a.scan(10);
  eq('analog input channel', a.read('V'), 4.25);
  eq('ioImage of an analog card', a.ioImage(3).in, [0, 4.25, 0, 0]);
  const fs = run({ tags: [T('First', 'DINT')], rungs: ['XIC(S:FS)ADD(First,1,First);'] });
  scans(fs, 5);
  eq('S:FS is set on the first scan only', fs.read('First'), 1);
  const ck = run({ tags: [T('N', 'DINT')], rungs: ['ADD(N,1,N);'] });
  eq('advance runs fixed 10 ms scans', ck.advance(35), 3);
  eq('the rest is kept for the next call', ck.advance(5), 1);
  check('catch-up after a long pause is capped', ck.advance(60000) <= 100);
}

console.log('Bits and one-shots');
{
  const c = run({ tags: ['A', 'L', 'S1', 'S2', 'S3', 'O2', 'O3', 'P1', 'N'].map(n => T(n, n === 'N' ? 'DINT' : 'BOOL')),
    rungs: ['XIC(A)OTL(L);', 'XIO(A)XIC(L)NOP();', 'XIC(A)ONS(S1)ADD(N,1,N);', 'XIC(A)OSR(S2,O2);', 'XIC(A)OSF(S3,O3);'] });
  c.scan(10);
  eq('ONS storage follows the rung', c.read('S1'), 0);
  c.write('A', 1); c.scan(10);
  check('ONS fires once on false → true', c.read('N') === 1);
  check('OSR output on for one scan', c.read('O2') === 1);
  check('OTL latches', c.read('L') === 1);
  c.scan(10);
  check('ONS does not fire again while true', c.read('N') === 1 && c.read('O2') === 0);
  c.write('A', 0); c.scan(10);
  check('OTL stays on when the rung goes false', c.read('L') === 1);
  check('OSF output on for one scan on true → false', c.read('O3') === 1);
  c.scan(10);
  check('OSF output off again', c.read('O3') === 0);
  c.write('A', 1); c.scan(10);
  check('ONS fires on the next rising edge', c.read('N') === 2);
  const u = run({ tags: [T('L', 'BOOL', { value: 1 }), T('U', 'BOOL', { value: 1 })], rungs: ['XIC(U)OTU(L);'] });
  u.scan(10);
  eq('OTU unlatches', u.read('L'), 0);
  const p = run({ tags: [T('A', 'BOOL', { value: 1 }), T('L', 'BOOL')], rungs: ['XIC(A)OTL(L);'] });
  p.scan(10); p.setMode('remprog'); p.setMode('remrun');
  eq('prescan keeps OTL bits', p.read('L'), 1);
  const o = run({ tags: [T('A', 'BOOL', { value: 1 }), T('S', 'BOOL'), T('N', 'DINT')], rungs: ['XIC(A)ONS(S)ADD(N,1,N);'] });
  o.scan(10);
  eq('true at start: ONS does not fire on the first scan', o.read('N'), 0);
}

console.log('Timers');
{
  const c = run({ tags: [T('En', 'BOOL'), T('T1', 'TIMER'), T('T2', 'TIMER'), T('T3', 'TIMER'), T('R', 'BOOL')],
    rungs: ['XIC(En)TON(T1,5000,0);', 'XIC(En)TOF(T2,100,0);', 'XIC(En)RTO(T3,100,0);', 'XIC(R)RES(T3);'] });
  eq('preset from the rung text', c.read('T1.PRE'), 5000);
  c.write('En', 1); c.scan(10);
  check('TON: EN on, timing starts on the next scan', c.read('T1.EN') === 1 && c.read('T1.ACC') === 0 && c.read('T1.TT') === 1);
  scans(c, 499);
  check('TON: not done at 4990 ms', c.read('T1.DN') === 0 && c.read('T1.ACC') === 4990);
  c.scan(10);
  check('TON: done at 5000 ms, TT off', c.read('T1.DN') === 1 && c.read('T1.TT') === 0 && c.read('T1.ACC') === 5000);
  c.scan(10);
  eq('TON: ACC stops at PRE', c.read('T1.ACC'), 5000);
  check('TOF: DN on while the rung is true', c.read('T2.DN') === 1 && c.read('T2.ACC') === 0);
  check('RTO: done at 100 ms', c.read('T3.DN') === 1);
  c.write('En', 0); c.scan(10);
  check('TON: reset when the rung goes false', c.read('T1.DN') === 0 && c.read('T1.ACC') === 0 && c.read('T1.EN') === 0);
  check('TOF: still DN, timing', c.read('T2.DN') === 1 && c.read('T2.TT') === 1);
  check('RTO: keeps ACC and DN when false', c.read('T3.ACC') === 100 && c.read('T3.DN') === 1);
  scans(c, 10);
  check('TOF: DN off after the preset', c.read('T2.DN') === 0 && c.read('T2.TT') === 0 && c.read('T2.ACC') === 100);
  c.write('R', 1); c.scan(10);
  check('RES clears the RTO', c.read('T3.ACC') === 0 && c.read('T3.DN') === 0);
  const h = run({ tags: [T('En', 'BOOL'), T('T3', 'TIMER')], rungs: ['XIC(En)RTO(T3,1000,0);'] });
  h.write('En', 1); scans(h, 31);
  h.write('En', 0); scans(h, 5);
  h.write('En', 1); scans(h, 21);
  eq('RTO adds up the time it was enabled', h.read('T3.ACC'), 500);
  const ps = run({ tags: [T('En', 'BOOL', { value: 1 }), T('T1', 'TIMER')], rungs: ['XIC(En)TON(T1,1000,0);'] });
  scans(ps, 11); ps.write('T1.DN', 1); scans(ps, 10);
  check('setting DN pauses a TON (help: "timing can be paused by setting the .DN bit")', ps.read('T1.ACC') === 100 && ps.read('T1.TT') === 0);
  ps.write('T1.DN', 0); scans(ps, 10);
  eq('clearing DN resumes it', ps.read('T1.ACC'), 200);
  const big = run({ tags: [T('En', 'BOOL', { value: 1 }), T('T1', 'TIMER')], rungs: ['XIC(En)TON(T1,100,0);'] });
  big.scan(10); big.scan(250);
  eq('a long scan is timed from the real elapsed time', big.read('T1.ACC'), 100);
  const pre = run({ tags: [T('En', 'BOOL', { value: 1 }), T('T1', 'TIMER')], rungs: ['XIC(En)TON(T1,1000,0);'] });
  scans(pre, 20); pre.setMode('remprog'); pre.setMode('remrun');
  eq('prescan resets TON', pre.read('T1.ACC'), 0);
}

console.log('Counters');
{
  const c = run({ tags: [T('In', 'BOOL'), T('Dn', 'BOOL'), T('C1', 'COUNTER'), T('R', 'BOOL')],
    rungs: ['XIC(In)CTU(C1,3,0);', 'XIC(Dn)CTD(C1,3,0);', 'XIC(R)RES(C1);'] });
  c.scan(10);
  const pulse = tag => { c.write(tag, 1); c.scan(10); c.write(tag, 0); c.scan(10); };
  pulse('In'); pulse('In');
  check('CTU counts rising edges', c.read('C1.ACC') === 2 && c.read('C1.DN') === 0);
  pulse('In');
  check('DN when ACC ≥ PRE', c.read('C1.ACC') === 3 && c.read('C1.DN') === 1);
  c.write('In', 1); scans(c, 5);
  eq('holding the input counts once', c.read('C1.ACC'), 4);
  c.write('In', 0); c.scan(10);
  pulse('Dn');
  check('CTD counts down', c.read('C1.ACC') === 3);
  pulse('R');
  check('RES clears the counter', c.read('C1.ACC') === 0 && c.read('C1.DN') === 0);
  c.write('C1.ACC', 2147483647);
  pulse('In');
  check('CTU overflow wraps and sets OV', c.read('C1.ACC') === -2147483648 && c.read('C1.OV') === 1);
  c.write('C1.ACC', -2147483648); c.write('C1.OV', 0);
  pulse('Dn');
  check('CTD underflow wraps and sets UN', c.read('C1.ACC') === 2147483647 && c.read('C1.UN') === 1);
  const p = run({ tags: [T('In', 'BOOL', { value: 1 }), T('C1', 'COUNTER')], rungs: ['XIC(In)CTU(C1,10,0);'] });
  p.scan(10);
  eq('prescan: an input that is true at start does not count', p.read('C1.ACC'), 0);
}

console.log('Compare');
{
  const tags = [T('A', 'DINT'), T('B', 'DINT'), T('R', 'REAL'), ...['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'lim', 'limw', 'meq', 'cmp'].map(n => T(n, 'BOOL'))];
  const c = run({ tags, rungs: ['EQU(A,B)OTE(eq);', 'NEQ(A,B)OTE(ne);', 'LES(A,B)OTE(lt);', 'LEQ(A,B)OTE(le);', 'GRT(A,B)OTE(gt);', 'GEQ(A,B)OTE(ge);',
    'LIM(0,A,10)OTE(lim);', 'LIM(10,A,0)OTE(limw);', 'MEQ(A,16#0F,B)OTE(meq);', 'CMP(A*2+1>B AND R<1.5)OTE(cmp);'] });
  const flags = () => ['eq', 'ne', 'lt', 'le', 'gt', 'ge'].map(n => c.read(n)).join('');
  c.write('A', 3); c.write('B', 5); c.scan(10);
  eq('3 vs 5: EQU NEQ LES LEQ GRT GEQ', flags(), '011100');
  c.write('A', 5); c.scan(10);
  eq('5 vs 5', flags(), '100101');
  check('LIM low ≤ test ≤ high', c.read('lim') === 1);
  check('LIM with low > high is true outside the band', c.read('limw') === 0);
  c.write('A', 12); c.scan(10);
  check('LIM out of the band', c.read('lim') === 0 && c.read('limw') === 1);
  c.write('A', 0x35); c.write('B', 0x75); c.scan(10);
  check('MEQ compares through the mask', c.read('meq') === 1);
  c.write('A', 3); c.write('B', 6); c.write('R', 1); c.scan(10);
  check('CMP with an expression', c.read('cmp') === 1);
  c.write('R', 2); c.scan(10);
  check('CMP false', c.read('cmp') === 0);
  const r = run({ tags: [T('X', 'REAL'), T('t', 'BOOL')], rungs: ['GRT(X,2)OTE(t);'] });
  r.write('X', 2.25); r.scan(10);
  check('compare a REAL with an integer', r.read('t') === 1);
}

console.log('Math');
{
  const c = run({ tags: [T('A', 'DINT'), T('B', 'DINT'), T('D', 'DINT'), T('I', 'INT'), T('R', 'REAL'), T('Q', 'REAL'), T('En', 'BOOL')],
    rungs: ['XIC(En)ADD(A,B,D);'] });
  const one = (rung, set) => {
    const m = run({ tags: [T('A', 'DINT'), T('B', 'DINT'), T('D', 'DINT'), T('I', 'INT'), T('R', 'REAL'), T('Q', 'REAL'), T('F', 'BOOL')], rungs: [rung] });
    for (const k in set) m.write(k, set[k]);
    m.scan(10);
    return m;
  };
  c.write('A', 2); c.write('B', 3); c.scan(10);
  eq('math runs only when the rung is true', c.read('D'), 0);
  c.write('En', 1); c.scan(10);
  eq('ADD', c.read('D'), 5);
  eq('SUB', one('SUB(A,B,D);', { A: 2, B: 7 }).read('D'), -5);
  eq('MUL', one('MUL(A,B,D);', { A: 6, B: 7 }).read('D'), 42);
  eq('DIV of integers truncates (7 / 2 = 3)', one('DIV(A,B,D);', { A: 7, B: 2 }).read('D'), 3);
  eq('DIV of integers truncates toward 0 (-7 / 2 = -3)', one('DIV(A,B,D);', { A: -7, B: 2 }).read('D'), -3);
  eq('DIV with a REAL source rounds into an integer Dest (7.0 / 2 = 3.5 → 4)', one('DIV(R,2,D);', { R: 7 }).read('D'), 4);
  eq('DIV into a REAL Dest keeps the fraction', one('DIV(A,B,R);', { A: 7, B: 2 }).read('R'), 3.5);
  const z = one('DIV(A,B,D);', { A: 7, B: 0 });
  check('divide by zero sets S:V', z.read('S:V') === 1);
  eq('MOD', one('MOD(A,B,D);', { A: 17, B: 5 }).read('D'), 2);
  eq('MOD of a negative', one('MOD(A,B,D);', { A: -17, B: 5 }).read('D'), -2);
  eq('SQR', one('SQR(A,R);', { A: 16 }).read('R'), 4);
  eq('NEG', one('NEG(A,D);', { A: 5 }).read('D'), -5);
  eq('ABS', one('ABS(A,D);', { A: -5 }).read('D'), 5);
  const ov = one('ADD(A,B,D);', { A: 2147483647, B: 1 });
  check('DINT overflow wraps and sets S:V', ov.read('D') === -2147483648 && ov.read('S:V') === 1);
  const iv = one('ADD(A,B,I);', { A: 32767, B: 1 });
  check('INT Dest wraps and sets S:V', iv.read('I') === -32768 && iv.read('S:V') === 1);
  const mo = one('MUL(A,B,D);', { A: 100000, B: 100000 });
  check('a big product wraps to 32 bits', mo.read('D') === Math.imul(100000, 100000) && mo.read('S:V') === 1);
  const mi = run({ tags: [T('A', 'DINT', { value: 2147483647 }), T('D', 'DINT'), T('Go', 'BOOL', { value: 1 }), T('M', 'BOOL')], rungs: ['XIC(Go)ADD(A,1,D);', 'XIC(S:MINOR)OTE(M);'] });
  mi.scan(10);
  check('an overflow is a minor fault: S:MINOR is set', mi.read('S:MINOR') === 1 && mi.read('M') === 1);
  mi.write('Go', 0); mi.scan(10);
  check('S:MINOR clears at the start of the next scan', mi.read('M') === 0);
  const cy = run({ tags: [T('A', 'DINT', { value: -1 }), T('D', 'DINT')], rungs: ['ADD(A,1,D);', 'MOV(5,D);'] });
  cy.scan(10);
  check('S:C is set by ADD and left alone by MOV', cy.read('S:C') === 1);
  const zr = one('SUB(A,B,D);', { A: 4, B: 4 });
  check('S:Z on a zero result', zr.read('S:Z') === 1 && zr.read('S:N') === 0 && zr.read('S:V') === 0);
  check('S:N on a negative result', one('SUB(A,B,D);', { A: 1, B: 4 }).read('S:N') === 1);
  // 1756-RM003 / Studio 5000 help (Math Status Flags, Monitor Status Flags)
  const sv = run({ tags: [T('A', 'DINT', { value: 2147483647 }), T('D', 'DINT')], rungs: ['ADD(A,1,D);'] });
  scans(sv, 3);
  check('S:V that stays set makes one minor fault, not one per scan (only "from cleared to set")', sv.minors.length === 1 && sv.minors[0].count === 1 && sv.read('S:V') === 1);
  const mv = run({ tags: [T('A', 'DINT', { value: -5 }), T('D', 'DINT'), T('Z', 'DINT')], rungs: ['SUB(A,A,Z);', 'MVM(A,16#FF,D);'] });
  mv.scan(10);
  check('MVM does not change the math status flags (5580): S:Z of the SUB before it stays', mv.read('S:Z') === 1 && mv.read('S:N') === 0 && mv.read('D') === 251);
  const sa = MTPS.verify(proj({ tags: [T('First', 'BOOL', { alias: 'S:FS' })], rungs: ['XIC(First)NOP();'] }));
  check('an alias to a status flag is refused: S:FS is a keyword, not a tag', sa.errors.some(e => /status flag keyword/.test(e.text)));
  {
    const pj = proj({ tags: [T('N', 'DINT')], rungs: ['NOP();'] });
    pj.tasks[0].programs.push({ name: 'P2', main: 'R', inhibit: true, tags: [], routines: [{ name: 'R', rungs: [{ t: 'XIC(S:FS)ADD(N,1,N);' }] }] });
    const c = new MTPS.Controller(); c.download(pj); c.setMode('remrun'); scans(c, 3);
    check('an inhibited program does not run', c.read('N') === 0);
    pj.tasks[0].programs[1].inhibit = false; c.edit(pj); scans(c, 3);
    check('S:FS is set on the first scan of a program after it is uninhibited (once)', c.read('N') === 1);
  }
  eq('CPT with precedence', one('CPT(D,A+B*2);', { A: 1, B: 3 }).read('D'), 7);
  eq('CPT with ( )', one('CPT(D,(A+B)*2);', { A: 1, B: 3 }).read('D'), 8);
  eq('CPT: / is the divide, integers truncate', one('CPT(D,A/B);', { A: 7, B: 2 }).read('D'), 3);
  eq('CPT: ** MOD and functions', one('CPT(R,2**3+A MOD 4+SQR(16)+ABS(-1)+NEG(2));', { A: 7 }).read('R'), 8 + 3 + 4 + 1 - 2);
  eq('CPT with a REAL', one('CPT(R,R*2+0.5);', { R: 1.25 }).read('R'), 3);
  eq('CPT: unary minus', one('CPT(D,-A+10);', { A: 3 }).read('D'), 7);
  eq('CPT: AND OR XOR NOT on integers', one('CPT(D,(A AND 12) OR 1 XOR 3);', { A: 13 }).read('D'), ((13 & 12) | (1 ^ 3)));
  eq('CPT: SIN COS LN LOG', Math.round(one('CPT(R,SIN(0)+COS(0)+LN(1)+LOG(100));', {}).read('R')), 3);
  eq('CPT: hex constant', one('CPT(D,16#10+1);', {}).read('D'), 17);
  check('CPT expression errors are verify errors', MTPS.verify(proj({ tags: [T('D', 'DINT')], rungs: ['CPT(D,(1+2);'] })).errors.length === 1);
  check('an unknown tag in an expression', /Undefined tag 'Nope'/.test(MTPS.verify(proj({ tags: [T('D', 'DINT')], rungs: ['CPT(D,Nope+1);'] })).errors[0].text));
}

console.log('Move and logical');
{
  const one = (rung, set, tags) => {
    const m = run({ tags: tags || [T('A', 'DINT'), T('B', 'DINT'), T('D', 'DINT'), T('I', 'INT'), T('R', 'REAL')], rungs: [rung] });
    for (const k in set) m.write(k, set[k]);
    m.scan(10);
    return m;
  };
  eq('MOV', one('MOV(A,D);', { A: 9 }).read('D'), 9);
  eq('MOV a REAL into a DINT rounds half to even (2.5 → 2)', one('MOV(R,D);', { R: 2.5 }).read('D'), 2);
  eq('MOV 3.5 → 4', one('MOV(R,D);', { R: 3.5 }).read('D'), 4);
  eq('MOV -2.5 → -2', one('MOV(R,D);', { R: -2.5 }).read('D'), -2);
  eq('MOV an immediate', one('MOV(16#FF,D);', {}).read('D'), 255);
  eq('MVM', one('MVM(A,16#0F,D);', { A: 0x35, D: 0xF0 }).read('D'), 0xF5);
  eq('CLR', one('CLR(D);', { D: 9 }).read('D'), 0);
  eq('AND', one('AND(A,B,D);', { A: 12, B: 10 }).read('D'), 8);
  eq('OR', one('OR(A,B,D);', { A: 12, B: 10 }).read('D'), 14);
  eq('XOR', one('XOR(A,B,D);', { A: 12, B: 10 }).read('D'), 6);
  eq('NOT', one('NOT(A,D);', { A: 0 }).read('D'), -1);
  eq('NOT into an INT', one('NOT(A,I);', { A: 0 }).read('I'), -1);
  eq('BTD moves a bit field', one('BTD(A,4,D,0,4);', { A: 0xA0, D: 0x100 }).read('D'), 0x10A);
  eq('SWPB of an INT', one('SWPB(I,HIGH/LOW,I);', { I: 0x1234 }).read('I'), 0x3412);
  eq('SWPB REVERSE of a DINT', one('SWPB(A,REVERSE,D);', { A: 0x11223344 }).read('D'), 0x44332211);
  eq('SWPB WORD of a DINT', one('SWPB(A,WORD,D);', { A: 0x11223344 }).read('D'), 0x33441122);
  eq('SWPB HIGH/LOW of a DINT', one('SWPB(A,HIGH/LOW,D);', { A: 0x11223344 }).read('D'), 0x22114433);
  const arr = [T('S', 'DINT', { dim: 5, value: [1, 2, 3, 4, 5] }), T('D', 'DINT', { dim: 5 }), T('P', 'TIMER', { dim: 2 }), T('Q', 'TIMER', { dim: 2 })];
  eq('COP copies elements', one('COP(S[1],D[0],3);', {}, arr).read('D'), [2, 3, 4, 0, 0]);
  eq('COP stops at the end of the array', one('COP(S[0],D[3],5);', {}, arr).read('D'), [0, 0, 0, 1, 2]);
  eq('FLL fills', one('FLL(7,D[1],3);', {}, arr).read('D'), [0, 7, 7, 7, 0]);
  const st = one('COP(P[0],Q[0],2);', { 'P[1].PRE': 50 }, arr);
  eq('COP of structures', st.read('Q[1].PRE'), 50);
  check('COP between number types is allowed (it copies bytes, as in the reference)', MTPS.verify(proj({ tags: [T('S', 'DINT', { dim: 2 }), T('R', 'REAL', { dim: 2 })], rungs: ['COP(S[0],R[0],2);'] })).errors.length === 0);
  check('COP of a TIMER into a DINT is an error', MTPS.verify(proj({ tags: [T('S', 'TIMER', { dim: 2 }), T('R', 'DINT', { dim: 2 })], rungs: ['COP(S[0],R[0],2);'] })).errors.length === 1);
  const ix = one('MOV(5,Tank[Idx]);', { Idx: 2 }, [T('Tank', 'DINT', { dim: 4 }), T('Idx', 'DINT')]);
  eq('subscript from a tag', ix.read('Tank[2]'), 5);
}

console.log('Program control');
{
  const c = run({ tags: [T('A', 'BOOL'), T('N', 'DINT'), T('M', 'DINT'), T('K', 'DINT'), T('Z', 'BOOL'), T('Y', 'BOOL')],
    rungs: ['XIC(A)JSR(Sub,0);', 'ADD(M,1,M);'],
    routines: [{ name: 'Sub', rungs: ['SBR();', 'ADD(N,1,N);', 'RET();', 'ADD(K,1,K);'] }] });
  c.scan(10);
  check('JSR false: the subroutine does not run', c.read('N') === 0 && c.read('M') === 1);
  c.write('A', 1); c.scan(10);
  check('JSR true: runs the subroutine and comes back', c.read('N') === 1 && c.read('M') === 2);
  eq('RET ends the subroutine', c.read('K'), 0);
  const j = run({ tags: [T('A', 'BOOL'), T('N', 'DINT'), T('M', 'DINT')], rungs: ['XIC(A)JMP(Skip);', 'ADD(N,1,N);', 'LBL(Skip)ADD(M,1,M);'] });
  j.scan(10);
  j.write('A', 1); j.scan(10);
  check('JMP skips to its label', j.read('N') === 1 && j.read('M') === 2);
  const jm = run({ tags: [T('A', 'BOOL', { value: 1 }), T('After', 'BOOL')], rungs: ['XIC(A)JMP(L1)OTE(After);', 'LBL(L1)NOP();'] });
  jm.scan(10);
  eq('JMP jumps at once: the rest of its rung is not scanned', jm.read('After'), 0);
  const m = run({ tags: [T('Z', 'BOOL'), T('In', 'BOOL', { value: 1 }), T('O', 'BOOL'), T('L', 'BOOL'), T('After', 'BOOL')],
    rungs: ['XIC(Z)MCR();', 'XIC(In)OTE(O);', 'XIC(In)OTL(L);', 'MCR();', 'XIC(In)OTE(After);'] });
  m.scan(10);
  check('MCR zone off: OTE off, OTL not set', m.read('O') === 0 && m.read('L') === 0);
  check('after the zone: rungs run normally', m.read('After') === 1);
  m.write('Z', 1); m.scan(10);
  check('MCR zone on: rungs run', m.read('O') === 1 && m.read('L') === 1);
  m.write('Z', 0); m.scan(10);
  check('zone off again: OTE off, OTL stays', m.read('O') === 0 && m.read('L') === 1);
  const a = run({ tags: [T('O', 'BOOL'), T('N', 'BOOL')], rungs: ['AFI()OTE(O);', 'NOP()OTE(N);'] });
  a.scan(10);
  check('AFI is always false, NOP passes', a.read('O') === 0 && a.read('N') === 1);
  const t = run({ tags: [T('A', 'BOOL'), T('N', 'DINT')], rungs: ['XIC(A)TND();', 'ADD(N,1,N);'] });
  t.scan(10); t.write('A', 1); t.scan(10);
  eq('TND ends the routine', t.read('N'), 1);
  const ts = run({ tags: [T('N', 'DINT'), T('M', 'DINT')], rungs: ['JSR(Sub,0);', 'ADD(M,1,M);'], routines: [{ name: 'Sub', rungs: ['TND();', 'ADD(N,1,N);'] }] });
  ts.scan(10);
  check('TND in a subroutine returns to the calling routine', ts.read('N') === 0 && ts.read('M') === 1);
  const w = run({ tags: [T('N', 'DINT')], rungs: ['LBL(Top)ADD(N,1,N);', 'JMP(Top);'] });
  let fault = null;
  w.on('change', e => { if (e.what === 'fault') fault = w.fault; });
  w.scan(10);
  check('an endless jump faults the controller (watchdog)', !!w.fault && w.fault.type === 6 && fault === w.fault);
  const n0 = w.read('N'); w.scan(10);
  check('a faulted controller does not scan', w.read('N') === n0);
  w.clearFault();
  check('Clear Faults goes to Rem Prog', !w.fault && w.mode === 'remprog');
  const o = run({ tags: [T('Tank', 'DINT', { dim: 4 }), T('Idx', 'DINT', { value: 9 }), T('Q', 'BOOL', { value: 1 }), { name: 'Out', alias: 'Local:2:O.Data.0' }],
    rungs: ['XIC(Q)OTE(Out);', 'MOV(1,Tank[Idx]);'] });
  o.scan(10);
  check('subscript out of range at run time: major fault type 4 code 20', o.fault && o.fault.type === 4 && o.fault.code === 20);
  eq('outputs go off on a major fault', o.ioImage(2).out, 0);
}

console.log('Toggle and forces');
{
  const c = run({ tags: [{ name: 'Start_PB', alias: 'Local:1:I.Data.0' }, { name: 'Lamp', alias: 'Local:2:O.Data.3' }, T('M', 'BOOL'), T('D', 'DINT')],
    rungs: ['XIC(Start_PB)OTE(M);'] });
  let ev = [];
  c.on('change', e => ev.push(e.what));
  check('Toggle Bit on a BOOL', c.toggle('M') && c.read('M') === 1);
  check('Toggle Bit refuses a DINT', c.toggle('D') === false);
  check('Toggle Bit on an input bit works once', c.toggle('Start_PB') && c.read('Start_PB') === 1);
  c.scan(10);
  check('the next input update overwrites it', c.read('Start_PB') === 0);
  eq('no forces yet', c.forceState(), 'none');
  check('force an input through its alias', c.force('Start_PB', 1));
  eq('forces installed but not enabled', c.forceState(), 'disabled');
  c.scan(10);
  check('a disabled force is not applied', c.read('Start_PB') === 0);
  c.enableForces(true);
  eq('forces enabled', c.forceState(), 'enabled');
  c.scan(10);
  check('forced input is on although the field is off', c.read('Start_PB') === 1 && c.read('M') === 1);
  eq('forced() for the force marker', [c.forced('Start_PB'), c.forced('Local:1:I.Data.0'), c.forced('M')], [1, 1, null]);
  eq('force mask in Monitor Tags', c.forceMask('Local:1:I.Data'), { mask: 1, value: 1 });
  check('force an output', c.force('Lamp', 1));
  c.scan(10);
  eq('forced output reaches the card', c.ioImage(2).out, 8);
  check('only I/O bits can be forced', c.force('M', 1) === false && c.force('D', 1) === false);
  c.enableForces(false); c.scan(10);
  check('Disable keeps the forces but stops them', c.forceState() === 'disabled' && c.read('Start_PB') === 0 && c.ioImage(2).out === 0);
  c.force('Start_PB', null);
  eq('Remove Force on one bit', c.forced('Start_PB'), null);
  c.removeForces();
  eq('Remove All', c.forceState(), 'none');
  check('force changes are events', ev.filter(x => x === 'forces').length >= 5);
}

console.log('Modules: inhibit, fault, Upload, fault logs');
{
  const mods = [{ slot: 1, type: 'PLC-DI16-24V', name: 'DI_1' }, { slot: 2, type: 'PLC-DO16-24V', name: 'DO_1', majorOnFail: true }, { slot: 3, type: 'PLC-DI16-24V', name: 'DI_3', inhibit: true }];
  const c = run({ modules: mods, tags: [{ name: 'In', alias: 'Local:1:I.Data.0' }, { name: 'Out', alias: 'Local:2:O.Data.0' }, { name: 'In3', alias: 'Local:3:I.Data.0' }], rungs: ['XIC(In)OTE(Out);'] });
  c.setInputs(1, 1); c.setInputs(3, 1); c.scan(10);
  check('a running card passes its inputs and outputs', c.read('In') === 1 && c.ioImage(2).out === 1 && c.moduleStatus(1).state === 'Running');
  check('an inhibited card keeps its inputs and has no connection', c.read('In3') === 0 && c.moduleStatus(3).state === 'Inhibited' && c.ioOk());
  c.setModuleFault(1, true); c.scan(10);
  check('a card taken out: Fault = 16#FFFFFFFF, inputs hold, code 16#0204', c.read('Local:1:I.Fault') === -1 && c.read('In') === 1 && c.moduleStatus(1).code === '16#0204');
  check('the input of a faulted card can be overwritten (as on an emulated controller)', c.write('In', 0) && c.read('In') === 0);
  check('the I/O LED is not OK, the controller keeps running (no major fault set for slot 1)', !c.ioOk() && !c.fault);
  c.setModuleFault(1, false); c.scan(10);
  check('put back: Fault = 0 and the inputs come back', c.read('Local:1:I.Fault') === 0 && c.read('In') === 1 && c.ioOk());
  c.setModuleFault(2, true); c.scan(10);
  check('"Major fault on controller if the connection fails": type 3 code 16', c.fault && c.fault.type === 3 && c.fault.code === 16);
  check('outputs of a faulted card are off', c.ioImage(2).out === 0);
  check('the major fault is logged', c.majors.length === 1 && c.majors[0].code === 16);
  // MOV clears S:V again, so each scan S:V goes from cleared to set: one minor fault per scan
  const m = run({ tags: [T('A', 'DINT', { value: 2147483647 }), T('D', 'DINT'), T('E', 'DINT')], rungs: ['ADD(A,1,D);', 'MOV(0,E);'] });
  scans(m, 3);
  check('an overflow is logged as a minor fault, repeats counted', m.minors.length === 1 && m.minors[0].type === 4 && m.minors[0].count === 3);
  m.clearMinors();
  check('Clear Minors empties the log', m.minors.length === 0);
  const u = run({ tags: [T('N', 'DINT')], rungs: ['ADD(N,1,N);'] });
  scans(u, 4);
  const up = u.upload();
  check('Upload gives the controller\'s project with the current tag values', up && up.tags.find(t => t.name === 'N').value === 4 && up.controller.name === 'Test');
  check('nothing to upload from an empty controller', new MTPS.Controller().upload() === null);
}

console.log('Online edits (Accept Edits)');
{
  const o = { tags: [T('A', 'BOOL'), T('N', 'DINT'), T('Tm', 'TIMER'), T('Cn', 'COUNTER')], rungs: ['XIC(A)TON(Tm,5000,0);', 'ADD(N,1,N);', 'XIC(A)CTU(Cn,10,0);'] };
  const c = run(o);
  scans(c, 1); c.write('A', 1); scans(c, 49);
  const cn = c.read('Cn').ACC;
  const p = proj(o);
  p.tags.push(T('B', 'BOOL'));
  p.tasks[0].programs[0].routines[0].rungs.push({ t: 'XIC(A)OTE(B);' });
  p.tasks[0].programs[0].routines[0].rungs[0].t = 'XIC(A)TON(Tm,8000,0);';
  const r = c.edit(p);
  check('Accept Edits builds the new logic without a Download', r.ok && c.holds(p));
  check('the mode stays Rem Run', c.mode === 'remrun' && c.running);
  check('tag values stay (DINT and BOOL)', c.read('N') === 50 && c.read('A') === 1);
  check('a running timer keeps its accum, the edited preset is used', c.read('Tm').ACC === 480 && c.read('Tm').PRE === 8000 && c.read('Tm').TT === 1);
  check('a counter keeps its accum', cn === 1 && c.read('Cn').ACC === 1);
  scans(c, 1);
  check('the new rung runs on the next scan', c.read('B') === 1 && c.read('N') === 51);
  const bad = proj(o);
  bad.tasks[0].programs[0].routines[0].rungs.push({ t: 'OTE(?);' });
  check('edits with errors are refused and the old logic keeps running', !c.edit(bad).ok && c.holds(p));
  check('an empty controller cannot take online edits', !new MTPS.Controller().edit(p).ok);
}

console.log('Chassis: controller and I/O cards in slots');
{
  const ch = new MTPS.Chassis(10);
  check('a controller and I/O cards go into slots', ch.insert(0, 'PLC-CPU', 'Emu').ok && ch.insert(1, 'PLC-DI16-24V', 'In').ok && ch.insert(2, 'PLC-DO16-24V', 'Out').ok);
  check('a slot holds one card; a slot outside the chassis is refused', !ch.insert(1, 'PLC-DO16-24V').ok && !ch.insert(10, 'PLC-DI16-24V').ok && !ch.insert(3, 'NOPE').ok);
  const c = ch.controller(0);
  check('the controller card holds a controller of its own', c instanceof MTPS.Controller && ch.controller(1) === null);
  const p = proj({ modules: [{ slot: 1, type: 'PLC-DI16-24V', name: 'DI_1' }, { slot: 2, type: 'PLC-DO16-24V', name: 'DO_1' }], tags: [{ name: 'S1', alias: 'Local:1:I.Data.0' }, { name: 'K1', alias: 'Local:2:O.Data.3' }], rungs: ['XIC(S1)OTE(K1);'] });
  check('download through the chassis controller', c.download(p).ok && c.setMode('remrun'));
  ch.setBit(1, 0, true); ch.advance(30);
  check('a switch on the input card reaches the controller, its output lights the output card', c.read('S1') === 1 && ch.outputs(2) === 8);
  ch.setBit(1, 0, false); ch.advance(30);
  check('switch off: output off', ch.outputs(2) === 0);
  ch.setFault(1, true); ch.advance(20);
  check('a faulted card: the controller sees 16#0204', c.moduleStatus(1).state === 'Faulted' && c.moduleStatus(1).code === '16#0204' && !c.ioOk());
  ch.setFault(1, false); ch.advance(20);
  check('the card works again', c.moduleStatus(1).state === 'Running' && c.ioOk());
  ch.remove(1); ch.advance(20);
  check('an empty slot: 16#0204', c.moduleStatus(1).code === '16#0204');
  ch.insert(1, 'PLC-DO16-24V', 'Wrong'); ch.advance(20);
  check('another module in the slot: keying mismatch 16#0116', c.moduleStatus(1).code === '16#0116');
  ch.remove(1); ch.insert(1, 'PLC-DI16-24V', 'In'); ch.setBit(1, 0, true); ch.advance(30);
  check('the right card back: running, inputs again', c.moduleStatus(1).state === 'Running' && ch.outputs(2) === 8);
  ch.insert(5, 'PLC-CPU', 'Emu2');
  check('two controllers in one chassis; the first one that configures a card owns its outputs', ch.controllers().length === 2 && ch.owner(2) === c);
  const back = MTPS.Chassis.from(JSON.parse(JSON.stringify(ch)));
  back.advance(30);
  const c2 = back.controller(0);
  check('the chassis is kept: cards, field switches, the project and the mode of each controller', back.mods.size === 4 && back.module(1).field === 1 && c2.name === 'Test' && c2.mode === 'remrun' && back.outputs(2) === 8);
  check('a controller that was empty stays empty', back.controller(5).M === null);
}

console.log('Emulator: power, IP address, chassis name');
{
  const ch = new MTPS.Chassis(10, 'LineA');
  ch.insert(0, 'PLC-CPU', 'Emu'); ch.insert(1, 'PLC-DI16-24V', 'In'); ch.insert(2, 'PLC-DO16-24V', 'Out');
  const c = ch.controller(0);
  const p = proj({ modules: [{ slot: 1, type: 'PLC-DI16-24V', name: 'DI_1' }, { slot: 2, type: 'PLC-DO16-24V', name: 'DO_1' }], tags: [T('N', 'DINT'), { name: 'S1', alias: 'Local:1:I.Data.0' }], rungs: ['ADD(N,1,N);'] });
  c.download(p); c.setMode('remrun'); ch.advance(50);
  check('a working input card: its input tag cannot be written', !c.write('S1', 1));
  ch.setController(0, { ip: '127.0.0.1', desc: 'Line A' });
  check('controller IP address and description', ch.module(0).ip === '127.0.0.1' && ch.module(0).desc === 'Line A');
  const n = c.read('N');
  ch.setController(0, { on: false }); ch.advance(50);
  check('power off: the controller stops and keeps its project', c.read('N') === n && !c.powered && c.name === 'Test');
  ch.setController(0, { on: true });
  check('power on with the key in REM: back to Rem Run, faults cleared', c.powered && c.mode === 'remrun' && !c.fault);
  ch.advance(50);
  check('it runs again', c.read('N') > n);
  c.setKey('PROG'); ch.setController(0, { on: false }); ch.setController(0, { on: true });
  check('power on with the key in PROG: Program', c.mode === 'prog');
  c.setKey('REM'); c.setMode('remrun'); ch.setController(0, { on: false });
  const back = MTPS.Chassis.from(JSON.parse(JSON.stringify(ch)));
  check('kept: chassis name, IP, description, and the power off', back.name === 'LineA' && back.module(0).ip === '127.0.0.1' && back.module(0).desc === 'Line A' && back.controller(0).powered === false);
}

console.log('Remote Test, logic comparison');
{
  const o = { modules: [{ slot: 1, type: 'PLC-DI16-24V', name: 'DI_1' }, { slot: 2, type: 'PLC-DO16-24V', name: 'DO_1' }], tags: [T('N', 'DINT'), { name: 'K1', alias: 'Local:2:O.Data.0' }], rungs: ['ADD(N,1,N);', 'OTE(K1);'] };
  const c = new MTPS.Controller(); c.download(proj(o));
  check('Remote Test from Rem Prog', c.setMode('remtest') && c.mode === 'remtest' && c.running);
  scans(c, 5);
  check('in Remote Test the logic runs, the outputs stay off', c.read('N') === 5 && c.read('K1') === 1 && c.ioImage(2).out === 0);
  c.setMode('remrun'); scans(c, 1);
  check('Remote Run: the outputs come on', c.ioImage(2).out === 1);
  c.setKey('RUN'); c.setKey('REM');
  check('key RUN then REM: Remote Run, not Remote Test', c.mode === 'remrun');
  const p = proj(o); p.tags[0].value = 42; p.controller.name = 'Other_Name';
  check('another tag value or project name is the same logic (not an edit)', c.holds(p));
  p.tasks[0].programs[0].routines[0].rungs[0].t = 'ADD(N,2,N);';
  check('a changed rung is not', !c.holds(p));
}

console.log('Project copy in the controller');
{
  const p = proj({ tags: [T('A', 'BOOL')], rungs: ['XIC(A)OTE(A);'] });
  const c = new MTPS.Controller();
  c.download(p);
  check('the controller holds the project it was given', c.holds(p));
  const q = JSON.parse(JSON.stringify(p));
  q.tasks[0].programs[0].routines[0].rungs[0].t = 'XIO(A)OTE(A);';
  check('a project changed offline is not the same as the controller copy', !c.holds(q));
  check('the controller name is known after download', c.name === 'Test');
  check('MTPS.controller is the built-in controller', MTPS.controller instanceof MTPS.Controller);
}

console.log('Online edit zones (Studio 5000: replace and delete zones are not executed) and dirty marks');
{
  // the original (r/R) of an edited rung and a deleted rung (D) are shown but neither verified nor executed
  const p = proj({ tags: [T('A', 'BOOL'), T('B', 'BOOL'), T('C', 'BOOL')], rungs: [{ t: 'XIC(A)OTE(B);', z: 'I' }, { t: 'XIC(A)OTE(B);', z: 'R' }, { t: 'LBL(L1)XIC(A)OTE(C);', z: 'D' }, { t: 'LBL(L1)NOP();' }] });
  const v = MTPS.verify(p);
  check('verify skips R and D zones (a repeated label in a D rung is no error)', v.errors.length === 0, JSON.stringify(v.errors));
  const q = proj({ tags: [T('A', 'BOOL')], rungs: [{ t: 'XIC(', z: 'r' }, { t: 'XIC(A)OTE(A);', z: 'i' }] });
  check('a pending r original is not verified; its i copy is', MTPS.verify(q).errors.length === 0);
  const e = proj({ tags: [T('A', 'BOOL')], rungs: [{ t: '', z: 'i' }] });
  check('an empty i rung is an error (the e mark)', MTPS.verify(e).errors.some(x => x.rung === 0));
  const c = new MTPS.Controller();
  c.download(proj({ tags: [T('A', 'BOOL', { value: 1 }), T('B', 'BOOL'), T('C', 'BOOL')], rungs: [{ t: 'XIC(A)OTE(B);' }, { t: 'XIC(A)OTE(C);', z: 'D' }] }));
  c.go('remrun'); c.scan(10); c.scan(10);
  check('a downloaded D zone is not executed', c.read('B') === 1 && c.read('C') === 0);
  const d = proj({ tags: [T('A', 'BOOL')], rungs: ['XIC(A)OTE(A);'] });
  const c2 = new MTPS.Controller(); c2.download(d);
  const d2 = JSON.parse(JSON.stringify(d)); d2.tasks[0].programs[0].routines[0].rungs[0].dx = ['XIC(A)#0'];
  check('a dirty mark (dx) is not a logic change', c2.holds(d2));
}

console.log('File/Shift and Sequencer instructions');
{
  const INS = MTPS.INSTR;
  check('BSL and BSR are in the File/Shift group, with EN and DN on the box', ['BSL', 'BSR'].every(m => INS[m].grp === 'File/Shift' && INS[m].bits.join() === 'EN,DN' && INS[m].out));
  eq('BSL operand names (as the reference box)', MTPS.OPN.BSL, ['Array', 'Control', 'Source Bit', 'Length']);
  const p = proj({ tags: [T('Ad', 'DINT', { dim: 2 }), T('Ctl', 'CONTROL'), T('In', 'BOOL'), T('G', 'BOOL')], rungs: ['XIC(G)BSL(Ad[0],Ctl,In,10);'] });
  const c = run({ tags: p.tags, rungs: ['XIC(G)BSL(Ad[0],Ctl,In,10);'] });
  c.write('In', 1); c.scan(10); c.write('G', 1); c.scan(10);
  const p2 = JSON.parse(JSON.stringify(p)); p2.tasks[0].programs[0].routines[0].rungs[0].t = 'XIC(G)BSL(Ad[0],Ctl,In,12);';
  const r = c.edit(p2);
  check('online edit of a BSL: accepted', r.ok, r.lines.join(' | '));
  eq('online edit keeps the CONTROL bits and .POS; .LEN comes from the edited rung', [c.read('Ctl.EN'), c.read('Ctl.DN'), c.read('Ctl.POS'), c.read('Ctl.LEN'), c.read('Ad[0]')], [1, 1, 10, 12, 1]);
  check('BSL Length must be a whole number', MTPS.verify(proj({ tags: p.tags, rungs: ['BSL(Ad[0],Ctl,In,1.5);'] })).errors.some(e => e.op === 3));
  check('BSL Array must be an array element, not a whole DINT', /array element/.test((MTPS.verify(proj({ tags: [...p.tags, T('D', 'DINT')], rungs: ['BSL(D,Ctl,In,8);'] })).errors[0] || {}).msg || ''));
  const ix = run({ tags: [...p.tags, T('K', 'DINT', { value: 1 })], rungs: ['XIC(G)BSL(Ad[K],Ctl,In,4);'] });
  ix.write('In', 1); ix.write('G', 1); ix.scan(10);
  eq('BSL with an indirect Array element (Ad[K])', [ix.read('Ad[0]'), ix.read('Ad[1]')], [0, 1]);
}
{
  const INS = MTPS.INSTR;
  check('FFL shows EN, DN, EM and FFU EU, DN, EM on the box', INS.FFL.bits.join() === 'EN,DN,EM' && INS.FFU.bits.join() === 'EU,DN,EM' && INS.FFL.grp === 'File/Shift');
  eq('FFL / FFU operand names', [MTPS.OPN.FFL, MTPS.OPN.FFU], [['Source', 'FIFO', 'Control', 'Length', 'Position'], ['FIFO', 'Dest', 'Control', 'Length', 'Position']]);
  const tags = [T('Q', 'DINT', { dim: 5 }), T('Ctl', 'CONTROL'), T('Ld', 'BOOL'), T('V', 'DINT', { value: 9 })];
  const p = proj({ tags, rungs: ['XIC(Ld)FFL(V,Q[0],Ctl,5,0);'] });
  const c = run({ tags, rungs: ['XIC(Ld)FFL(V,Q[0],Ctl,5,0);'] });
  c.scan(10); c.write('Ld', 1); c.scan(10); c.write('Ld', 0); c.scan(10); c.write('Ld', 1); c.scan(10);
  const p2 = JSON.parse(JSON.stringify(p)); p2.tasks[0].programs[0].routines[0].rungs[0].t = 'XIC(Ld)FFL(V,Q[0],Ctl,4,0);';
  c.edit(p2);
  eq('online edit of an FFL keeps the queue and .POS (not the Position of the rung), .LEN from the rung', [c.read('Ctl.POS'), c.read('Ctl.LEN'), c.read('Q[1]'), c.read('Ctl.EN')], [2, 4, 9, 1]);
  check('FFL accepts an immediate Source', MTPS.verify(proj({ tags, rungs: ['FFL(16#7F,Q[0],Ctl,5,0);'] })).errors.length === 0);
  check('LFL / LFU: File/Shift, EN DN EM / EU DN EM, LIFO operand names', INS.LFL.bits.join() === 'EN,DN,EM' && INS.LFU.bits.join() === 'EU,DN,EM' && INS.LFU.grp === 'File/Shift' && MTPS.OPN.LFU.join() === 'LIFO,Dest,Control,Length,Position');
  const l = run({ tags: [...tags, T('O', 'DINT')], rungs: ['XIC(Ld)LFL(V,Q[0],Ctl,5,0);', 'XIC(Ld)LFU(Q[0],O,Ctl,5,0);'] });
  l.scan(10); l.write('Ld', 1); l.scan(10);
  eq('LFL then LFU on the same rising edge (one CONTROL): the value goes in and comes back out', [l.read('O'), l.read('Q[0]'), l.read('Ctl.POS'), l.read('Ctl.EM')], [9, 0, 0, 1]);
}
{
  const INS = MTPS.INSTR;
  check('SQI, SQO, SQL are in the Sequencer group; SQI is an input (no output bits), SQO / SQL show EN and DN', ['SQI', 'SQO', 'SQL'].every(m => INS[m].grp === 'Sequencer') && !INS.SQI.out && !INS.SQI.bits && INS.SQO.bits.join() === 'EN,DN' && INS.SQL.bits.join() === 'EN,DN');
  eq('sequencer operand names', [MTPS.OPN.SQI.length, MTPS.OPN.SQO[2], MTPS.OPN.SQL[1]], [6, 'Dest', 'Source']);
  // SQI and SQO on one CONTROL: the sequence waits at a step until its inputs match, then the SQO rung rises and steps
  const c = run({ tags: [T('Out', 'DINT', { dim: 3, value: [0, 1, 2] }), T('Inp', 'DINT', { dim: 3, value: [0, 1, 2] }), T('In', 'DINT', { value: 5 }), T('Do', 'DINT'), T('Ctl', 'CONTROL')],
    rungs: ['SQI(Inp[0],16#FF,In,Ctl,2,0)SQO(Out[0],16#FF,Do,Ctl,2,0);'] });
  c.scan(10);
  eq('SQI / SQO pair: step 0 waits while the input does not match', [c.read('Ctl.POS'), c.read('Ctl.EN')], [0, 0]);
  c.write('In', 0); c.scan(10); c.scan(10);
  eq('SQI / SQO pair: the input of step 0 matches, the SQO steps to 1 and outputs it', [c.read('Ctl.POS'), c.read('Do')], [1, 1]);
  c.write('In', 1); c.scan(10); c.scan(10);
  eq('SQI / SQO pair: step 1 mismatched (rung false), then input 1 matches: the sequence steps to 2 (.DN at .LEN)', [c.read('Ctl.POS'), c.read('Do'), c.read('Ctl.DN')], [2, 2, 1]);
}

console.log('Logix Emulate: speed of time (LGEM5K-GR016, Configure Emulation)');
{
  const p = proj({ tags: [T('En', 'BOOL', { value: 1 }), T('T1', 'TIMER')], rungs: ['XIC(En)TON(T1,5000,0);'] });
  const c = new MTPS.Controller(); c.download(p); c.setMode('remrun');
  const run = ms => { for (let k = 0; k < ms / 20; k++) c.advance(20); };
  run(1000);
  check('speed of time 100 %: a timer counts in real time', c.read('T1.ACC') >= 980 && c.read('T1.ACC') <= 1010, c.read('T1.ACC'));
  check('speed of time: 0-100 %, other values refused', c.setSpeed(50) && !c.setSpeed(101) && !c.setSpeed(-1) && c.sot === 50);
  const a0 = c.read('T1.ACC'), s0 = c.scans; run(1000);
  check('speed of time 50 %: 1 s of real time is 0.5 s for the timer and half the scans', Math.abs(c.read('T1.ACC') - a0 - 500) <= 20 && Math.abs(c.scans - s0 - 50) <= 2, c.read('T1.ACC') - a0);
  c.setSpeed(0); const a1 = c.read('T1.ACC'), s1 = c.scans; run(1000);
  check('speed of time 0 % stops execution: no scan, the timer holds', c.read('T1.ACC') === a1 && c.scans === s1);
  const ch = new MTPS.Chassis(8); ch.insert(0, 'PLC-CPU', 'Emu'); ch.setController(0, { sot: 60 });
  const back = MTPS.Chassis.from(JSON.parse(JSON.stringify(ch)));
  check('the speed of time is kept with the chassis', back.controller(0).sot === 60 && MTPS.Chassis.from(JSON.parse(JSON.stringify(new MTPS.Chassis(4)))).size === 4);
}

console.log('Logix Emulate: Single Scan mode (LGEM5K-GR016, chapter 5)');
{
  const p = proj({ tags: [T('N', 'DINT')], rungs: ['ADD(N,1,N);'] });
  const c = new MTPS.Controller(); c.download(p);
  c.singleScan(true); c.setMode('remrun');
  for (let k = 0; k < 20; k++) c.advance(20);
  check('Single Scan: placed in Run, the logic runs through exactly once, then waits', c.read('N') === 1 && c.scans === 1 && c.held && c.running);
  check('Single Scan again: one more scan per request', c.scanAgain() && (c.advance(50), c.advance(50), c.read('N') === 2) && c.held);
  c.setMode('remprog'); c.setMode('remrun'); c.advance(100);
  check('Program then Run again: a new single scan', c.read('N') === 3 && c.held);
  c.runContinuous(); for (let k = 0; k < 5; k++) c.advance(20);
  check('Run continuously: back to normal scans', !c.single && !c.held && c.read('N') === 13, c.read('N'));
  check('Single Scan again does nothing outside Single Scan mode', !c.scanAgain());
}

console.log('Logix Emulate: Remove Module keeps or clears a controller configuration (LGEM5K-GR016, chapter 4)');
{
  const p = proj({ tags: [T('N', 'DINT', { value: 7 })], rungs: ['NOP();'] });
  const ch = new MTPS.Chassis(8); ch.insert(2, 'PLC-CPU', 'Line1'); ch.setController(2, { ip: '127.0.0.2', mem: 2048, sot: 40, desc: 'd' });
  ch.controller(2).download(p);
  check('remove, keeping the configuration: the slot is empty, its configuration stays', ch.remove(2, true) && !ch.module(2) && ch.kept.get(2).name === 'Line1' && ch.kept.get(2).project.tags[0].value === 7 && ch.kept.get(2).at > 0);
  const back = MTPS.Chassis.from(JSON.parse(JSON.stringify(ch)));
  check('the kept configuration is saved with the chassis', back.kept.get(2) && back.kept.get(2).sot === 40);
  ch.insert(2, 'PLC-CPU', 'Other');
  check('a new controller there uses the previous configuration and loads the saved image', ch.useKept(2, true, true) && ch.module(2).name === 'Line1' && ch.module(2).ip === '127.0.0.2' && ch.module(2).mem === 2048 && ch.controller(2).sot === 40 && ch.controller(2).name === 'Test' && ch.controller(2).read('N') === 7 && !ch.kept.has(2));
  ch.remove(2, true); ch.insert(2, 'PLC-CPU', 'Other');
  check('reset to default values: the name stays, the rest is default and the controller is empty', ch.useKept(2, false, false) && ch.module(2).name === 'Line1' && ch.module(2).ip === '' && ch.controller(2).sot === 100 && !ch.controller(2).copy);
  ch.remove(2, false);
  check('remove with Clear module configuration: nothing is kept', !ch.kept.has(2) && !ch.module(2));
}

console.log('Download clears the controller memory first (v37 help, Download dialog box)');
{
  const p = proj({ tags: [T('N', 'DINT', { value: 3 })], rungs: ['NOP();'] });
  const c = new MTPS.Controller(); c.download(p); c.setMode('remrun');
  c.clearMemory();
  check('cleared memory: no name, no project, Remote Program, nothing to upload', !c.M && c.copy === null && c.name === '' && c.mode === 'remprog' && c.upload() === null && !c.holds(p));
  check('a download after it works as usual', c.download(p).ok && c.holds(p) && c.read('N') === 3);
}

console.log('Wave 2 (C): trigonometric and advanced math (1756-RM003 / -RM018A chapters 14, 15)');
{
  const INS = MTPS.INSTR;
  check('SIN COS TAN ASN ACS ATN in Trig Functions, LN LOG XPY in Advanced Math, all outputs with Source / Dest', ['SIN', 'COS', 'TAN', 'ASN', 'ACS', 'ATN'].every(m => INS[m].grp === 'Trig Functions' && INS[m].out && MTPS.OPN[m].join() === 'Source,Dest') && ['LN', 'LOG', 'XPY'].every(m => INS[m].grp === 'Advanced Math') && MTPS.OPN.XPY.join() === 'Source X,Source Y,Dest');
  const tags = [T('En', 'BOOL'), T('A', 'REAL', { value: 0.5 }), T('R', 'REAL'), T('D', 'DINT'), T('B', 'BOOL'), T('Tm', 'TIMER')];
  check('verify: a BOOL or a TIMER is not a math operand', MTPS.verify(proj({ tags, rungs: ['SIN(B,R);'] })).errors.length === 1 && MTPS.verify(proj({ tags, rungs: ['COS(A,Tm);'] })).errors.length === 1);
  check('verify: an immediate Dest is refused', MTPS.verify(proj({ tags, rungs: ['TAN(A,5);'] })).errors.length === 1);
  const c = run({ tags, rungs: ['XIC(En)SIN(A,R);', 'XIC(En)ATN(1,D);'] });
  c.scan(10);
  check('a false rung leaves Dest alone', c.read('R') === 0 && c.read('D') === 0);
  c.write('En', 1); c.scan(10);
  check('a true rung: Dest = SIN(Source); an integer Dest gets the REAL result rounded (ATN(1) = 0.785 -> 1)', Math.abs(c.read('R') - Math.sin(0.5)) < 1e-6 && c.read('D') === 1);
  const l = run({ tags: [...tags, T('Z', 'REAL', { value: 0 })], rungs: ['LN(Z,R);'] });
  l.scan(10);
  check('LN of 0: a minor fault (type 4, code 4) and S:V set', l.S.V === 1 && l.minors.length === 1 && l.minors[0].type === 4 && l.minors[0].code === 4);
  const x = run({ tags, rungs: ['XPY(-8.0,0.5,R);', 'XPY(-2,3,D);'] });
  x.scan(10);
  check('XPY: a negative X with a fractional Y is a minor fault; a whole Y works (-2 ** 3 = -8)', x.minors.some(m => m.code === 4) && x.read('D') === -8);
  const e = run({ tags, rungs: ['CPT(R,TAN(A)+ASN(0.5)+ACS(0.5)+ATN(1));'] });
  e.scan(10);
  check('CPT knows TAN ASN ACS ATN', Math.abs(e.read('R') - (Math.tan(0.5) + Math.PI / 2 + Math.PI / 4)) < 1e-5, e.read('R'));
}

console.log('Wave 2 (C): math conversions DEG RAD TOD FRD TRN (1756-RM003 / -RM018A chapter 16)');
{
  const INS = MTPS.INSTR;
  check('DEG RAD TOD FRD TRN are in Math Conversions, outputs with Source / Dest', ['DEG', 'RAD', 'TOD', 'FRD', 'TRN'].every(m => INS[m].grp === 'Math Conversions' && INS[m].out && MTPS.OPN[m].join() === 'Source,Dest'));
  const tags = [T('R', 'REAL', { value: 2.5 }), T('D', 'DINT'), T('I', 'INT'), T('S', 'SINT'), T('Rd', 'REAL')];
  check('verify: TOD and FRD take integers only (a REAL Source or Dest is refused)', MTPS.verify(proj({ tags, rungs: ['TOD(R,D);'] })).errors.length === 1 && MTPS.verify(proj({ tags, rungs: ['FRD(D,Rd);'] })).errors.length === 1);
  check('verify: TRN takes a REAL Source (a DINT tag is refused, an immediate is fine)', MTPS.verify(proj({ tags, rungs: ['TRN(D,I);'] })).errors.length === 1 && MTPS.verify(proj({ tags, rungs: ['TRN(3.7,D);'] })).errors.length === 0);
  const c = run({ tags, rungs: ['TOD(-5,D);'] });
  c.scan(10);
  check('TOD of a negative Source: 0, S:V and a minor fault (4/4)', c.read('D') === 0 && c.S.V === 1 && c.minors.some(m => m.type === 4 && m.code === 4));
  const o = run({ tags, rungs: ['TOD(100000000,D);', 'TOD(10000,I);', 'TOD(100,S);'] });
  o.scan(10);
  eq('TOD too large for Dest: all 9s (16#9999_9999 DINT, 16#9999 INT, 16#99 SINT)', [o.read('D') >>> 0, o.read('I') & 0xFFFF, o.read('S') & 0xFF], [0x99999999, 0x9999, 0x99]);
  const t = run({ tags, rungs: ['TRN(-2.7,D);', 'TRN(R,I);', 'RAD(180,Rd);'] });
  t.scan(10);
  eq('TRN does not round (-2.7 -> -2, 2.5 -> 2); RAD(180) = pi', [t.read('D'), t.read('I'), +t.read('Rd').toFixed(5)], [-2, 2, 3.14159]);
  const e = run({ tags, rungs: ['CPT(D,FRD(16#22)+TOD(12)+TRN(R));'] });
  e.scan(10);
  check('CPT knows FRD, TOD and TRN', e.read('D') === 22 + 0x12 + 2, e.read('D'));
}

console.log('Wave 2 (C): FAL and FSC (1756-RM003 / -RM018A chapter 8)');
{
  const INS = MTPS.INSTR;
  check('FAL and FSC: File/Misc, CONTROL first, Length / Position show .LEN / .POS, EN DN ER', INS.FAL.grp === 'File/Misc' && INS.FSC.grp === 'File/Misc' && INS.FAL.bits.join() === 'EN,DN,ER' && INS.FAL.ctl === 0 && INS.FAL.live[1] === 'LEN' && INS.FSC.live[2] === 'POS' && MTPS.OPN.FAL.join() === 'Control,Length,Position,Mode,Dest,Expression' && MTPS.OPN.FSC.join() === 'Control,Length,Position,Mode,Expression');
  const tags = [T('En', 'BOOL'), T('A', 'DINT', { dim: 6, value: [1, 2, 3, 4, 5, 6] }), T('B', 'DINT', { dim: 6 }), T('Ctl', 'CONTROL'), T('Sm', 'SINT', { dim: 6 }), T('W', 'DINT', { value: 4 })];
  check('verify: Mode is ALL, INC or a number of elements per scan', MTPS.verify(proj({ tags, rungs: ['FAL(Ctl,6,0,ALL,B[Ctl.POS],A[Ctl.POS]);', 'FAL(Ctl,6,0,inc,B[Ctl.POS],A[Ctl.POS]);', 'FAL(Ctl,6,0,2,B[Ctl.POS],A[Ctl.POS]);'] })).errors.length === 0 &&
    MTPS.verify(proj({ tags, rungs: ['FAL(Ctl,6,0,SOME,B[Ctl.POS],A[Ctl.POS]);'] })).errors.length === 1 && MTPS.verify(proj({ tags, rungs: ['FSC(Ctl,6,0,0,A[Ctl.POS]=W);'] })).errors.length === 1);
  check('the Length and Position of the rung are written into the CONTROL at download', (() => { const c = run({ tags, rungs: ['XIC(En)FAL(Ctl,6,2,ALL,B[Ctl.POS],A[Ctl.POS]);'] }); return c.read('Ctl.LEN') === 6 && c.read('Ctl.POS') === 2; })());
  // ALL
  const a = run({ tags, rungs: ['XIC(En)FAL(Ctl,6,0,ALL,B[Ctl.POS],A[Ctl.POS]*10);'] });
  a.write('En', 1); a.scan(10);
  eq('ALL: every element in one scan, .DN and .EN set, .POS = .LEN', [a.read('B'), a.read('Ctl.DN'), a.read('Ctl.EN'), a.read('Ctl.POS')], [[10, 20, 30, 40, 50, 60], 1, 1, 6]);
  a.write('A[0]', 7); a.scan(10);
  check('ALL: a rung that stays true does not run it again', a.read('B[0]') === 10);
  a.write('En', 0); a.scan(10);
  eq('ALL: a false rung clears .EN .DN and .POS', [a.read('Ctl.EN'), a.read('Ctl.DN'), a.read('Ctl.POS')], [0, 0, 0]);
  a.write('En', 1); a.scan(10);
  check('ALL: the next false-to-true rung runs it again', a.read('B[0]') === 70);
  // INC
  const i = run({ tags, rungs: ['XIC(En)FAL(Ctl,3,0,INC,B[Ctl.POS],A[Ctl.POS]);'] });
  const pulse = () => { i.write('En', 1); i.scan(10); i.scan(10); i.write('En', 0); i.scan(10); };
  pulse();
  eq('INC: one element per false-to-true rung (a rung held true does not step), a false rung clears .EN', [i.read('B'), i.read('Ctl.POS'), i.read('Ctl.EN')], [[1, 0, 0, 0, 0, 0], 1, 0]);
  i.write('En', 1); i.scan(10); i.write('En', 0); i.scan(10); i.write('En', 1); i.scan(10);
  eq('INC: after the last element .DN is set (.POS = .LEN)', [i.read('B'), i.read('Ctl.POS'), i.read('Ctl.DN')], [[1, 2, 3, 0, 0, 0], 3, 1]);
  i.write('En', 0); i.scan(10);
  check('INC: the false rung after .DN clears .DN and .POS', i.read('Ctl.DN') === 0 && i.read('Ctl.POS') === 0);
  // numerical
  const n = run({ tags, rungs: ['XIC(En)FAL(Ctl,6,0,2,B[Ctl.POS],A[Ctl.POS]+100);'] });
  n.write('En', 1); n.scan(10);
  eq('numerical mode 2: two elements in the first scan', [n.read('B').slice(0, 3), n.read('Ctl.POS'), n.read('Ctl.DN')], [[101, 102, 0], 2, 0]);
  n.write('En', 0); n.scan(10); n.scan(10);
  eq('numerical mode: it goes on while the rung is false, then .DN set and .EN cleared', [n.read('B'), n.read('Ctl.DN'), n.read('Ctl.EN')], [[101, 102, 103, 104, 105, 106], 1, 0]);
  // overflow
  const o = run({ tags, rungs: ['FAL(Ctl,6,0,ALL,Sm[Ctl.POS],A[Ctl.POS]*40);'] });
  o.scan(10);
  eq('an overflow sets .ER and stops at that element (S:V, minor fault)', [o.read('Sm').slice(0, 5), o.read('Ctl.ER'), o.read('Ctl.POS'), o.read('Ctl.DN'), o.S.V], [[40, 80, 120, -96, 0], 1, 3, 0, 1]);
  o.scan(10);
  check('.ER set: the instruction does nothing more', o.read('Sm[4]') === 0 && o.read('Ctl.POS') === 3);
  o.write('Ctl.ER', 0); o.write('A[3]', 1); o.scan(10);
  check('.ER cleared by the program: it goes on from that element', o.read('Sm[3]') === 40 && o.read('Ctl.ER') === 1 && o.read('Ctl.POS') === 4);
  const f = run({ tags, rungs: ['FAL(Ctl,-1,0,ALL,B[Ctl.POS],A[Ctl.POS]);'] });
  f.scan(10);
  check('.LEN < 0: major fault type 4, code 21', f.fault && f.fault.type === 4 && f.fault.code === 21);
  // FSC
  const s = run({ tags: [...tags, T('Fd', 'BOOL')], rungs: ['XIC(En)FSC(Ctl,6,0,ALL,A[Ctl.POS]>=W);', 'XIC(Ctl.FD)OTE(Fd);'] });
  s.write('En', 1); s.scan(10);
  eq('FSC: the first true comparison sets .FD and .IN, .POS is its element', [s.read('Ctl.FD'), s.read('Ctl.IN'), s.read('Ctl.POS'), s.read('Ctl.DN'), s.read('Fd')], [1, 1, 3, 0, 1]);
  s.scan(10);
  check('FSC: .IN set, the search waits', s.read('Ctl.POS') === 3);
  s.write('Ctl.IN', 0); s.scan(10);
  eq('FSC: .IN cleared, the search goes on from the next element', [s.read('Ctl.POS'), s.read('Ctl.FD'), s.read('Ctl.IN')], [4, 1, 1]);
  s.write('Ctl.IN', 0); s.write('W', 100); s.scan(10);
  eq('FSC: nothing more found: .DN set, .FD cleared, .POS = .LEN', [s.read('Ctl.DN'), s.read('Ctl.FD'), s.read('Ctl.POS')], [1, 0, 6]);
}

console.log('Wave 2 (C): AVE SRT STD SIZE CPS (1756-RM003 / -RM018A chapter 8)');
{
  const near = (name, got, want) => check(name, Math.abs(got - want) < 1e-4, `got ${got}, want ${want}`);
  const INS = MTPS.INSTR;
  check('AVE STD SRT SIZE CPS are in File/Misc with the reference operands', ['AVE', 'STD', 'SRT', 'SIZE', 'CPS'].every(m => INS[m].grp === 'File/Misc') &&
    MTPS.OPN.AVE.join() === 'Array,Dim. To Vary,Dest,Control,Length,Position' && MTPS.OPN.SRT.join() === 'Array,Dim. To Vary,Control,Length,Position' && MTPS.OPN.SIZE.join() === 'Source,Dim. To Vary,Size' &&
    INS.AVE.live[4] === 'LEN' && INS.SRT.live[4] === 'POS' && INS.SRT.bits.join() === 'EN,DN');
  const tags = [T('En', 'BOOL'), T('A', 'DINT', { dim: 6, value: [6, 2, 5, 1, 4, 3] }), T('R', 'REAL', { dim: 4, value: [1.5, 2.5, 3.5, 4.5] }), T('M', 'INT', { dim: [2, 3, 4] }),
    T('Ctl', 'CONTROL'), T('Ctl2', 'CONTROL'), T('Ctl3', 'CONTROL'), T('D', 'DINT'), T('Rd', 'REAL'), T('Sm', 'SINT'), T('Tm', 'TIMER', { dim: 3 })];
  const V = r => MTPS.verify(proj({ tags, rungs: [r] })).errors.length;
  check('verify: Dim. To Vary is 0, 1 or 2; Array is an element of a number array; STD Dest is REAL', V('AVE(A[0],0,D,Ctl,6,0);') === 0 && V('AVE(A[0],3,D,Ctl,6,0);') === 1 && V('AVE(A,0,D,Ctl,6,0);') === 1 &&
    V('AVE(D,0,D,Ctl,6,0);') === 1 && V('STD(A[0],0,D,Ctl,6,0);') === 1 && V('STD(A[0],0,Rd,Ctl,6,0);') === 0 && V('SRT(Tm[0],0,Ctl,3,0);') === 1);
  check('verify: SIZE takes a whole array or an element of any type; CPS checks the types as COP', V('SIZE(Tm,0,D);') === 0 && V('SIZE(M[0,0,0],2,Rd);') === 0 && V('SIZE(D,0,D);') === 1 && V('CPS(A[0],Tm[0],1);') === 1 && V('CPS(A[0],R[0],2);') === 0);
  // AVE
  const a = run({ tags, rungs: ['XIC(En)AVE(A[0],0,D,Ctl,6,0);'] });
  a.write('En', 1); a.scan(10);
  eq('AVE: the mean of all .LEN elements in one scan (21 / 6 = 3.5 rounds to 4), .EN .DN set', [a.read('D'), a.read('Ctl.EN'), a.read('Ctl.DN'), a.read('Ctl.POS')], [4, 1, 1, 6]);
  a.write('A[0]', 60); a.scan(10);
  check('AVE: with .DN set it does not calculate again', a.read('D') === 4);
  a.write('En', 0); a.scan(10);
  eq('AVE: rung false with .DN set: .EN .DN .POS cleared', [a.read('Ctl.EN'), a.read('Ctl.DN'), a.read('Ctl.POS')], [0, 0, 0]);
  a.write('En', 1); a.scan(10);
  check('AVE: the next true rung calculates again (75 / 6 = 12.5 rounds to even: 12)', a.read('D') === 12, a.read('D'));
  const ar = run({ tags, rungs: ['AVE(R[1],0,Rd,Ctl,3,0);'] });
  ar.scan(10);
  near('AVE of a REAL array into a REAL (2.5 + 3.5 + 4.5) / 3', ar.read('Rd'), 3.5);
  const pe = run({ tags, rungs: ['AVE(A[4],0,D,Ctl,3,0);'] });
  pe.scan(10);
  eq('AVE: reading past the end of the array sets .ER and stops, .POS at that element', [pe.read('Ctl.ER'), pe.read('Ctl.DN'), pe.read('Ctl.POS'), pe.read('D')], [1, 0, 2, 0]);
  const ao = run({ tags: [...tags, T('Big', 'DINT', { dim: 2, value: [1000, 1000] })], rungs: ['AVE(Big[0],0,Sm,Ctl,2,0);'] });
  ao.scan(10);
  check('AVE: a result too large for Dest sets .ER and S:V (minor fault 4/4)', ao.read('Ctl.ER') === 1 && ao.S.V === 1 && ao.minors.some(m => m.type === 4 && m.code === 4));
  const md = run({ tags: [...tags, T('G', 'DINT', { dim: [2, 3, 4], value: Array.from({ length: 24 }, (_, k) => k) })], rungs: ['AVE(G[0,1,0],2,D,Ctl,4,0);', 'AVE(G[0,0,2],1,Sm,Ctl2,3,0);', 'AVE(G[0,2,3],0,Rd,Ctl3,2,0);'] });
  // G[0,1,k] = 4..7 (mean 5.5 -> 6); G[0,j,2] = 2, 6, 10 (mean 6); G[i,2,3] = 11, 23 (mean 17)
  md.scan(10);
  eq('AVE along each dimension of a DINT[2,3,4]', [md.read('D'), md.read('Sm'), md.read('Rd')], [6, 6, 17]);
  const f = run({ tags, rungs: ['AVE(A[0],1,D,Ctl,6,0);'] });
  f.scan(10);
  check('AVE: Dim. To Vary more than the dimensions of the array: major fault 4/20', f.fault && f.fault.type === 4 && f.fault.code === 20);
  const f2 = run({ tags, rungs: ['AVE(A[0],0,D,Ctl,-2,0);'] });
  f2.scan(10);
  check('AVE: .LEN < 0: major fault 4/21', f2.fault && f2.fault.type === 4 && f2.fault.code === 21);
  // STD
  const d = run({ tags, rungs: ['XIC(En)STD(A[0],0,Rd,Ctl,6,0);'] });
  d.write('En', 1); d.scan(10);
  near('STD: the sample standard deviation (N - 1) of 6 2 5 1 4 3', d.read('Rd'), Math.sqrt(17.5 / 5));
  d.write('En', 0); d.scan(10);
  eq('STD: rung false clears .EN .ER .DN .POS', [d.read('Ctl.EN'), d.read('Ctl.DN'), d.read('Ctl.POS')], [0, 0, 0]);
  // SRT
  const s = run({ tags, rungs: ['XIC(En)SRT(A[1],0,Ctl,4,0);', 'XIC(En)SRT(R[0],0,Ctl2,4,0);'] });
  s.write('A[0]', 6); s.write('En', 1); s.scan(10);
  eq('SRT: Length elements from the one given into ascending order (A[0] and A[5] not changed)', s.read('A'), [6, 1, 2, 4, 5, 3]);
  s.write('A[1]', 9); s.scan(10);
  check('SRT is transitional: a rung that stays true does not sort again', s.read('A[1]') === 9);
  s.write('En', 0); s.scan(10);
  check('SRT: rung false clears .EN and .DN', s.read('Ctl.EN') === 0 && s.read('Ctl.DN') === 0);
  s.write('En', 1); s.scan(10);
  eq('SRT: the next false-to-true rung sorts again', s.read('A').slice(1, 5), [2, 4, 5, 9]);
  const sl = run({ tags, rungs: ['SRT(A[3],0,Ctl,4,0);'] });
  sl.scan(10);
  check('SRT: a Length past the end of the array: major fault 4/20', sl.fault && sl.fault.type === 4 && sl.fault.code === 20);
  const sn = run({ tags, rungs: ['SRT(A[0],0,Ctl,-1,0);'] });
  sn.scan(10);
  check('SRT: .LEN < 0: .ER set and major fault 4/21', sn.fault && sn.fault.code === 21 && sn.read('Ctl.ER') === 1);
  // SIZE, CPS
  const z = run({ tags: [...tags, T('Z0', 'DINT'), T('Z1', 'INT'), T('Z2', 'REAL'), T('Zt', 'DINT')], rungs: ['SIZE(M,0,Z0);', 'SIZE(M[1,2,3],1,Z1);', 'SIZE(M[0,0,0],2,Z2);', 'SIZE(Tm[1],0,Zt);'] });
  z.scan(10);
  eq('SIZE: each dimension of an INT[2,3,4] (whole array or any element), and an array of TIMERs', [z.read('Z0'), z.read('Z1'), z.read('Z2'), z.read('Zt')], [2, 3, 4, 3]);
  const zf = run({ tags: [...tags, T('Z0', 'DINT')], rungs: ['SIZE(A,1,Z0);'] });
  zf.scan(10);
  check('SIZE: Dim. To Vary more than the dimensions: major fault 4/20', zf.fault && zf.fault.code === 20);
  const cp = run({ tags, rungs: ['XIC(En)CPS(A[0],R[0],2);'] });
  cp.scan(10);
  check('CPS: nothing while the rung is false', cp.read('R[0]') === 1.5);
  cp.write('En', 1); cp.scan(10);
  check('CPS: the bytes of A[0] A[1] into R[0] R[1], like COP', cp.read('R[2]') === 3.5 && cp.read('R[0]') !== 1.5);
}

console.log('Wave 2 (C): GSV and SSV (1756-RM003 / -RM018A chapter 4, GSV/SSV Objects)');
{
  const INS = MTPS.INSTR, G = MTPS.GSVOBJ;
  check('GSV and SSV are in Input/Output with Class Name, Instance Name, Attribute Name, Dest / Source', INS.GSV.grp === 'Input/Output' && INS.SSV.grp === 'Input/Output' && MTPS.OPN.GSV.join() === 'Class Name,Instance Name,Attribute Name,Dest' && MTPS.OPN.SSV[3] === 'Source');
  check('the objects: WallClockTime, Controller, Task, Program, Module, FaultLog', Object.keys(G).join() === 'WallClockTime,Controller,Task,Program,Module,FaultLog' && G.Program.attrs.MajorFaultRecord[0] === 'DINT' && G.Program.attrs.MajorFaultRecord[1] === 11 && G.WallClockTime.attrs.LocalDateTime[1] === 7);
  const tags = [T('En', 'BOOL'), T('D', 'DINT'), T('I', 'INT'), T('Sm', 'SINT'), T('R', 'REAL'), T('Dt', 'DINT', { dim: 7 }), T('Cv', 'DINT', { dim: 2 }), T('Rec', 'DINT', { dim: 11 }), T('Short', 'DINT', { dim: 6 }), T('Bits', 'BOOL')];
  const V = r => MTPS.verify(proj({ tags, rungs: [r] })).errors.map(x => x.msg);
  check('verify: names are not case sensitive; an object with no instance takes an empty Instance Name', !V('GSV(wallclocktime,,localdatetime,Dt[0]);').length && !V('GSV(Program,THIS,LastScanTime,D);').length && !V('GSV(Task,MainTask,Watchdog,D);').length && !V('GSV(Module,DI_1,EntryStatus,I);').length);
  check('verify: an unknown class, an attribute of another object, a Program or Module that does not exist', V('GSV(Clock,,X,D);').length === 1 && V('GSV(Program,THIS,TimeSlice,D);').length === 1 && V('GSV(Program,Nope,LastScanTime,D);').length === 1 && V('GSV(Module,,EntryStatus,I);').length === 1);
  check('verify: SSV only of the attributes that can be set; a BOOL Dest is refused', V('SSV(Module,DI_1,EntryStatus,I);').length === 1 && V('SSV(Module,DI_1,Mode,I);').length === 0 && V('GSV(Program,THIS,LastScanTime,Bits);').length === 1);
  check('verify: Module LEDStatus needs no instance', !V('GSV(Module,,LEDStatus,I);').length);
  // WallClockTime
  const w = run({ tags, rungs: ['GSV(WallClockTime,,DateTime,Dt[0]);', 'GSV(WallClockTime,,CurrentValue,Cv[0]);'] });
  w.scan(10);
  const now = new Date();
  check('GSV WallClockTime DateTime: DINT[7] year, month, day, hour, minute, second, µs (UTC)', w.read('Dt[0]') === now.getUTCFullYear() && w.read('Dt[1]') === now.getUTCMonth() + 1 && w.read('Dt[6]') >= 0 && w.read('Dt[6]') < 1000000);
  check('GSV WallClockTime CurrentValue: µs since 1970 in DINT[2] (low, high)', Math.abs(((w.read('Cv[1]') * 4294967296 + (w.read('Cv[0]') >>> 0)) / 1000) - Date.now()) < 5000);
  const ws = run({ tags: [...tags, T('Set', 'DINT', { dim: 7, value: [2030, 6, 15, 12, 30, 0, 0] }), T('Go', 'BOOL')], rungs: ['XIC(Go)SSV(WallClockTime,,DateTime,Set[0]);', 'GSV(WallClockTime,,DateTime,Dt[0]);'] });
  ws.write('Go', 1); ws.scan(10); ws.write('Go', 0); ws.scan(10);
  eq('SSV WallClockTime DateTime sets the clock (GSV reads it back)', [ws.read('Dt[0]'), ws.read('Dt[1]'), ws.read('Dt[2]'), ws.read('Dt[3]'), ws.read('Dt[4]')], [2030, 6, 15, 12, 30]);
  // Program and Task
  const pg = run({ tags, rungs: ['GSV(Program,THIS,LastScanTime,D);', 'GSV(Task,THIS,Watchdog,R);', 'GSV(Controller,,TimeSlice,I);', 'GSV(Task,MainTask,Instance,Sm);'] });
  pg.scan(10); pg.scan(10);
  check('GSV Program LastScanTime (µs), Task Watchdog (500 ms = 500000 µs, the bytes into a REAL), Controller TimeSlice 20 %', pg.read('D') >= 0 && new Float32Array(new Int32Array([500000]).buffer)[0] === pg.read('R') && pg.read('I') === 20 && pg.read('Sm') === 0);
  const dp = proj({ tags: [...tags, T('One', 'SINT', { value: 1 }), T('Cnt', 'DINT')], rungs: ['XIC(En)SSV(Program,Other,DisableFlag,One);'] });
  dp.tasks[0].programs.push({ name: 'Other', main: 'Main', tags: [], routines: [{ name: 'Main', rungs: [{ t: 'ADD(Cnt,1,Cnt);' }] }] });
  const dis = new MTPS.Controller(); dis.download(dp); dis.setMode('remrun');
  dis.scan(10);
  dis.write('En', 1); dis.scan(10); dis.scan(10);
  check('SSV Program DisableFlag 1 stops the other program', dis.read('Cnt') === 1);
  // the fault records and the fault log
  const f = run({ tags: [...tags, T('Big', 'DINT', { value: 2147483647 }), T('MinE', 'INT'), T('Bits2', 'DINT')], rungs: ['ADD(Big,1,D);', 'GSV(Program,THIS,MinorFaultRecord,Rec[0]);', 'GSV(FaultLog,,MinorEvents,MinE);', 'GSV(FaultLog,,MinorFaultBits,Bits2);'] });
  f.scan(10);
  eq('GSV Program MinorFaultRecord: the overflow of this scan (type 4 code 4 in DINT[2]); FaultLog MinorEvents, MinorFaultBits bit 4', [f.read('Rec[2]') & 0xFFFF, f.read('Rec[2]') >> 16, f.read('MinE'), f.read('Bits2')], [4, 4, 1, 16]);
  check('the record has a timestamp (µs since 1970)', Math.abs(((f.read('Rec[1]') * 4294967296 + (f.read('Rec[0]') >>> 0)) / 1000) - Date.now()) < 5000);
  // sizes
  const s = run({ tags, rungs: ['GSV(Program,THIS,MajorFaultRecord,Short[0]);', 'GSV(WallClockTime,,ApplyDST,D);'] });
  s.write('D', -1); s.scan(10);
  check('GSV into a Dest too small (DINT[6] for DINT[11]): minor fault 4/7, Dest unchanged', s.minors.some(m => m.type === 4 && m.code === 7) && s.read('Short').every(v => v === 0));
  check('only the attribute\'s size is copied: a SINT attribute (ApplyDST 0) into a DINT changes its low 8 bits', s.read('D') === -256);
  const ss = run({ tags, rungs: ['SSV(WallClockTime,,CurrentValue,D);'] });
  ss.scan(10);
  check('SSV from a Source too small: minor fault 4/6 (not enough information supplied)', ss.minors.some(m => m.type === 4 && m.code === 6));
  // Module
  const m = run({ tags: [...tags, T('Led', 'INT')], rungs: ['GSV(Module,DI_1,EntryStatus,I);', 'GSV(Module,DI_1,FaultCode,D);', 'GSV(Module,,LEDStatus,Led);', 'GSV(Module,,LEDStatus,Sm);'] });
  m.scan(10);
  check('GSV Module EntryStatus 16#4000 Running, LEDStatus 3 (all running); an INT attribute into a SINT is too small (4/7)', m.read('I') === 0x4000 && m.read('D') === 0 && m.read('Led') === 3 && m.read('Sm') === 0 && m.minors.some(x => x.code === 7));
  m.setModuleFault(1, true); m.scan(10);
  check('a faulted module: EntryStatus 16#1000, FaultCode 16#0204, LEDStatus 2', m.read('I') === 0x1000 && m.read('D') === 0x0204 && m.read('Led') === 2);
  const mi = run({ tags: [...tags, T('Four', 'INT', { value: 4 })], rungs: ['XIC(En)SSV(Module,DI_1,Mode,Four);', 'GSV(Module,DI_1,EntryStatus,I);'] });
  mi.write('En', 1); mi.scan(10); mi.scan(10);
  check('SSV Module Mode bit 2 inhibits the module: EntryStatus 16#6000', mi.read('I') === 0x6000 && mi.moduleStatus(1).state === 'Inhibited');
  check('GSV / SSV do nothing on a false rung', (() => { const c = run({ tags, rungs: ['XIC(En)GSV(Controller,,TimeSlice,I);'] }); c.scan(10); return c.read('I') === 0; })());
}

console.log('Wave 2 (C): PID (1756-RM003 / -RM018A chapter 13)');
{
  const near = (name, got, want, tol = 1e-3) => check(name, Math.abs(got - want) < tol, `got ${got}, want ${want}`);
  const INS = MTPS.INSTR;
  check('PID: Special, the seven operands of the reference', INS.PID.grp === 'Special' && MTPS.OPN.PID.join() === 'PID,Process Variable,Tieback,Control Variable,PID Master Loop,Inhold Bit,Inhold Value');
  const mem = MTPS.PREDEF.PID.map(m => m.name);
  check('the PID structure: .CTL, its bits .EN (31) … .PVHA (7), the REAL members and .DATA[17]', mem[0] === 'CTL' && ['EN', 'CT', 'CL', 'PVT', 'DOE', 'SWM', 'CA', 'MO', 'PE', 'NDF', 'NOBC', 'NOZC', 'INI', 'SPOR', 'OLL', 'OLH', 'EWD', 'DVNA', 'DVPA', 'PVLA', 'PVHA'].every(b => mem.includes(b)) &&
    ['SP', 'KP', 'KI', 'KD', 'BIAS', 'MAXS', 'MINS', 'DB', 'SO', 'MAXO', 'MINO', 'UPD', 'PV', 'ERR', 'OUT', 'PVH', 'PVL', 'DVP', 'DVN', 'PVDB', 'DVDB', 'MAXI', 'MINI', 'TIE', 'MAXCV', 'MINCV', 'MINTIE', 'MAXTIE'].every(b => mem.includes(b)) && MTPS.PREDEF.PID.find(m => m.name === 'DATA').dim === 17);
  const tags = [T('En', 'BOOL'), T('Loop', 'PID'), T('Mst', 'PID'), T('Pv', 'REAL'), T('Cv', 'REAL'), T('Ci', 'DINT'), T('Tie', 'REAL'), T('Hold', 'BOOL'), T('Hv', 'REAL'), T('Bad', 'DINT')];
  const V = r => MTPS.verify(proj({ tags, rungs: [r] })).errors.length;
  check('verify: a PID tag first; Tieback, Master, Inhold bit and value take 0 when not used', !V('PID(Loop,Pv,0,Cv,0,0,0);') && !V('PID(Loop,Pv,Tie,Cv,Mst,Hold,Hv);') && V('PID(Bad,Pv,0,Cv,0,0,0);') === 1 && V('PID(Loop,Pv,0,Cv,Bad,0,0);') === 1 && V('PID(Loop,Pv,0,Cv,0,Pv,0);') === 1);
  const c = run({ tags, rungs: ['XIC(En)PID(Loop,Pv,0,Cv,0,0,0);', 'XIC(Loop.EN)OTE(Bad.0);'] });
  check('.EN, .PE … are the bits of .CTL (.EN is bit 31)', (() => { c.write('Loop.CTL', 1 << 23); return c.read('Loop.PE') === 1 && c.read('Loop.EN') === 0; })());
  c.write('Loop.CTL', 0);
  // independent, proportional only: span 0..100, SP 60, PV 50, KP 2: CV = 2 × 10 = 20
  ['UPD:1', 'MAXS:100', 'MINS:0', 'SP:60', 'KP:2'].forEach(k => { const [m, v] = k.split(':'); c.write('Loop.' + m, +v); });
  c.write('Pv', 50); c.write('En', 1); c.scan(10);
  eq('P only, independent gains: E = SP - PV = 10 %, CV = KP × E = 20; .EN set, .INI set, .ERR, .PV', [c.read('Cv'), c.read('Loop.EN'), c.read('Loop.INI'), c.read('Loop.ERR'), c.read('Loop.PV'), c.read('Bad.0')], [20, 1, 1, 10, 50, 1]);
  c.write('Loop.CA', 1); c.scan(10);
  check('.CA = 1 (E = PV - SP): the output goes to 0 (limited at .MINO, .OLL)', c.read('Cv') === 0 && c.read('Loop.OLL') === 1);
  c.write('Loop.CA', 0);
  // integral: KI 0.5 /s, UPD 1 s: each execution adds 0.5 × 10 = 5
  c.write('Loop.KP', 0); c.write('Loop.KI', 0.5); c.scan(10); c.scan(10);
  near('integral, independent: KI × E × UPD each execution (5 then 10)', c.read('Cv'), 10);
  c.write('En', 0); c.scan(10);
  check('rung false: .EN cleared, the output held', c.read('Loop.EN') === 0 && Math.abs(c.read('Cv') - 10) < 1e-3);
  // dependent: Kc 2, Ti 1 min: KI = Kc / (60 Ti) per second
  const d = run({ tags, rungs: ['PID(Loop,Pv,0,Cv,0,0,0);'] });
  ['UPD:1', 'MAXS:100', 'SP:60', 'KP:2', 'KI:1', 'PE:1', 'NDF:1'].forEach(k => { const [m, v] = k.split(':'); d.write('Loop.' + m, +v); });
  d.write('Pv', 50); d.scan(10); d.scan(10);
  near('dependent gains (ISA): Kc·(E + 1/(60·Ti)·∫E dt): 2 × (10 + 20 / 60) after two updates', d.read('Cv'), 2 * (10 + 20 / 60));
  // derivative of PV, no kick on a setpoint change
  const k = run({ tags, rungs: ['PID(Loop,Pv,0,Cv,0,0,0);'] });
  ['UPD:0.5', 'MAXS:100', 'SP:50', 'KD:1', 'NDF:1'].forEach(q => { const [m, v] = q.split(':'); k.write('Loop.' + m, +v); });
  k.write('Pv', 40); k.scan(10); k.write('Loop.SP', 70); k.scan(10);
  check('derivative of PV (.DOE = 0): a setpoint change gives no derivative kick', Math.abs(k.read('Cv')) < 1e-6);
  k.write('Pv', 41); k.scan(10);
  near('derivative of PV: -KD × dPV/dt = -1 × 1 / 0.5 = -2 % (limited at 0 by .MINO)', k.read('Loop.OUT'), 0);
  k.write('Loop.DOE', 1); k.write('Loop.MINO', -100); k.write('Loop.MAXO', 100); k.write('Loop.SP', 80); k.scan(10);
  near('derivative of error (.DOE = 1): KD × dE/dt = 1 × (39 - 29) / 0.5 = 20 %', k.read('Cv'), 20);
  // limits and anti-reset windup
  const w = run({ tags, rungs: ['XIC(En)PID(Loop,Pv,0,Cv,0,0,0);'] });
  ['UPD:1', 'MAXS:100', 'SP:100', 'KI:10', 'MAXO:80', 'MINO:5'].forEach(q => { const [m, v] = q.split(':'); w.write('Loop.' + m, +v); });
  w.write('En', 1); for (let n = 0; n < 5; n++) w.scan(10);
  eq('CV high limit .MAXO: the output stays at 80, .OLH set', [w.read('Cv'), w.read('Loop.OLH')], [80, 1]);
  near('anti-reset windup: the integral stops at the value that gives the limit (80), not 5 × 1000', w.read('Loop.DATA[0]'), 80, 1e-3);
  w.write('Pv', 100); w.scan(10);
  check('… so the output leaves the limit as soon as the error changes sign', w.read('Cv') <= 80 && w.read('Loop.OLH') === 0);
  const z = run({ tags, rungs: ['PID(Loop,Pv,0,Cv,0,0,0);'] });
  z.write('Loop.UPD', 1); z.scan(10);
  check('.MAXO = .MINO: reset to 100 and 0', z.read('Loop.MAXO') === 100 && z.read('Loop.MINO') === 0);
  // manual modes, bumpless transfer
  const m = run({ tags, rungs: ['PID(Loop,Pv,Tie,Cv,0,0,0);'] });
  ['UPD:1', 'MAXS:100', 'SP:50', 'KP:1', 'KI:0.1', 'SO:35', 'SWM:1'].forEach(q => { const [n, v] = q.split(':'); m.write('Loop.' + n, +v); });
  m.write('Pv', 50); m.scan(10);
  check('software manual (.SWM): CV = .SO', Math.abs(m.read('Cv') - 35) < 1e-4);
  m.write('Tie', 62); m.write('Loop.MO', 1); m.scan(10);
  check('manual (.MO) overrides .SWM: CV = the tieback (.TIE)', Math.abs(m.read('Cv') - 62) < 1e-4 && m.read('Loop.TIE') === 62);
  m.write('Loop.MO', 0); m.write('Loop.SWM', 0); m.scan(10);
  check('back to auto: bumpless (the back-calculated integral keeps the output at 62; E = 0)', Math.abs(m.read('Cv') - 62) < 1e-4);
  const nb = run({ tags, rungs: ['PID(Loop,Pv,0,Cv,0,0,0);'] });
  ['UPD:1', 'MAXS:100', 'SP:50', 'KP:1', 'SO:40', 'SWM:1'].forEach(q => { const [n, v] = q.split(':'); nb.write('Loop.' + n, +v); });
  nb.write('Pv', 50); nb.scan(10);
  check('KI = 0: the .BIAS is back-calculated in manual (bumpless without integral)', Math.abs(nb.read('Loop.BIAS') - 40) < 1e-4);
  nb.write('Loop.SWM', 0); nb.write('Loop.NOBC', 1); nb.write('Loop.BIAS', 0); nb.write('Loop.SWM', 1); nb.scan(10);
  check('.NOBC: no bias calculation', nb.read('Loop.BIAS') === 0);
  // scaling
  const s = run({ tags: [...tags, T('Raw', 'DINT')], rungs: ['PID(Loop,Raw,0,Ci,0,0,0);'] });
  ['UPD:1', 'MAXI:4095', 'MINI:0', 'MAXS:200', 'MINS:0', 'SP:100', 'KP:1', 'MAXCV:4095', 'MINCV:0', 'BIAS:50'].forEach(q => { const [n, v] = q.split(':'); s.write('Loop.' + n, +v); });
  s.write('Raw', 1023.75); s.scan(10);
  // PV = 1024 × 200 / 4095 = 50.01 EU; E = 49.99 EU = 24.99 %; OUT = 74.99 %; CV = 0.7499 × 4095
  near('scaling: PV from .MINI/.MAXI to .MINS/.MAXS, error in % of span, CV from % to .MINCV/.MAXCV', s.read('Loop.PV'), 1024 * 200 / 4095, 1e-3);
  check('… an integer CV is rounded', s.read('Ci') === Math.round((50 + (100 - 1024 * 200 / 4095) / 2) * 4095 / 100));
  // setpoint out of range, UPD
  const r = run({ tags, rungs: ['PID(Loop,Pv,0,Cv,0,0,0);'] });
  r.write('Loop.UPD', 1); r.write('Loop.MAXS', 100); r.write('Loop.SP', 20); r.write('Loop.KP', 1); r.scan(10);
  r.write('Loop.SP', 150); r.scan(10);
  check('setpoint out of range: .SPOR, minor fault 4/36, the last valid setpoint is used', r.read('Loop.SPOR') === 1 && r.minors.some(q => q.type === 4 && q.code === 36) && Math.abs(r.read('Cv') - 20) < 1e-4);
  const u = run({ tags, rungs: ['PID(Loop,Pv,0,Cv,0,0,0);'] });
  u.scan(10);
  check('.UPD 0 or less: minor fault 4/35, the loop does not run', u.minors.some(q => q.type === 4 && q.code === 35) && u.read('Loop.INI') === 0);
  // deadband
  const db = run({ tags, rungs: ['PID(Loop,Pv,0,Cv,0,0,0);'] });
  ['UPD:1', 'MAXS:100', 'SP:50', 'KP:1', 'DB:2', 'MINO:-100', 'MAXO:100', 'NOZC:1'].forEach(q => { const [n, v] = q.split(':'); db.write('Loop.' + n, +v); });
  db.write('Pv', 49); db.scan(10);
  check('deadband (.NOZC): an error within .DB is 0, .EWD set', db.read('Cv') === 0 && db.read('Loop.EWD') === 1);
  db.write('Loop.NOZC', 0); db.write('Loop.EWD', 0); db.write('Pv', 48.5); db.scan(10);
  check('zero crossing: entering the deadband from one side, the error is used until it crosses zero', Math.abs(db.read('Cv') - 1.5) < 1e-4 && db.read('Loop.EWD') === 0);
  db.write('Pv', 50.5); db.scan(10);
  check('… once it has crossed zero, the error within .DB is 0 (.EWD)', db.read('Cv') === 0 && db.read('Loop.EWD') === 1);
  // alarms
  const al = run({ tags, rungs: ['PID(Loop,Pv,0,Cv,0,0,0);'] });
  ['UPD:1', 'MAXS:100', 'SP:50', 'PVH:80', 'PVL:20', 'PVDB:5', 'DVP:10', 'DVN:-10', 'DVDB:2'].forEach(q => { const [n, v] = q.split(':'); al.write('Loop.' + n, +v); });
  const pv = v => { al.write('Pv', v); al.scan(10); };
  pv(85); const hi = al.read('Loop.PVHA'), dvn = al.read('Loop.DVNA');
  pv(77); const held = al.read('Loop.PVHA');
  pv(74); const clr = al.read('Loop.PVHA');
  pv(15);
  eq('alarms: .PVHA above .PVH, held within .PVDB, cleared below .PVH - .PVDB; .PVLA; deviation .DVNA (E = SP - PV < .DVN) / .DVPA', [hi, dvn, held, clr, al.read('Loop.PVLA'), al.read('Loop.DVPA')], [1, 1, 1, 0, 1, 1]);
  // cascade and inhold
  const cc = run({ tags: [...tags, T('Pv2', 'REAL'), T('Cv2', 'REAL')], rungs: ['PID(Mst,Pv2,0,Cv2,0,0,0);', 'PID(Loop,Pv,0,Cv,Mst,0,0);'] });
  ['UPD:1', 'MAXS:100', 'SP:50', 'KP:2'].forEach(q => { const [n, v] = q.split(':'); cc.write('Mst.' + n, +v); });
  ['UPD:1', 'MAXS:200', 'MINS:100', 'CL:1'].forEach(q => { const [n, v] = q.split(':'); cc.write('Loop.' + n, +v); });
  cc.write('Pv2', 40); cc.write('Pv', 150); cc.scan(10);
  near('cascade (.CL, slave .CT = 0): the slave setpoint is the master output (20 %) in the slave units (120)', cc.read('Loop.SP'), 120);
  const ih = run({ tags, rungs: ['PID(Loop,Pv,0,Cv,0,Hold,Hv);'] });
  ['UPD:1', 'MAXS:100', 'SP:50', 'KP:1', 'KI:0.1'].forEach(q => { const [n, v] = q.split(':'); ih.write('Loop.' + n, +v); });
  ih.write('Hold', 1); ih.write('Hv', 33); ih.write('Pv', 50); ih.scan(10);
  check('Inhold bit set: CV = Inhold value', ih.read('Cv') === 33);
  ih.write('Hold', 0); ih.scan(10);
  check('… then a bumpless restart from that value', Math.abs(ih.read('Cv') - 33) < 1e-4);
  // prescan
  const pr = run({ tags, rungs: ['PID(Loop,Pv,0,Cv,0,0,0);'] });
  pr.write('Loop.UPD', 1); pr.scan(10); pr.setMode('remprog'); pr.setMode('remrun');
  check('prescan: .EN cleared and the PID structure initialized (.INI cleared)', pr.read('Loop.EN') === 0 && pr.read('Loop.INI') === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
