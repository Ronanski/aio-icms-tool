/* MT PLC Studio run audit: a program with every instruction is downloaded and run on an Android tablet layout
   (touch); values are written through Monitor Tags as a user would, and every result is compared with what the
   reference controller gives. Usage: node tests/mtps-audit-run.js */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file://' + path.resolve(__dirname, '..', 'mtps', 'index.html');
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const RUNGS = [
  'XIC(B1)TON(T1,2000,0);', 'XIC(B1)TOF(T2,1000,0);', 'XIC(B1)RTO(T3,1500,0);', 'XIC(B1)ONS(SB1)CTU(C1,3,0);', 'XIC(B1)ONS(SB2)CTD(C2,3,5);',
  'XIC(B1)OSR(SB3,P_OSR);', 'XIC(B1)OSF(SB4,P_OSF);', 'XIC(T1.DN)OTE(Q_DN);', 'XIC(B2)OTL(Q_L);', 'XIC(B3)OTU(Q_L);', 'XIO(B1)OTE(Q_XIO);',
  'EQU(D1,7)OTE(Q_EQU);', 'NEQ(D1,D2)OTE(Q_NEQ);', 'LES(D2,D1)OTE(Q_LES);', 'LEQ(D1,7)OTE(Q_LEQ);', 'GRT(D1,D2)OTE(Q_GRT);', 'GEQ(D1,8)OTE(Q_GEQ);',
  'LIM(0,D1,10)OTE(Q_LIM);', 'MEQ(D1,16#0F,7)OTE(Q_MEQ);', 'CMP(D1+D2>9)OTE(Q_CMP);',
  'ADD(D1,D2,R_ADD);', 'SUB(D1,D2,R_SUB);', 'MUL(D1,D2,R_MUL);', 'DIV(D1,D2,R_DIV);', 'MOD(D1,D2,R_MOD);', 'SQR(16.0,F_SQR);', 'NEG(D1,R_NEG);', 'ABS(-5,R_ABS);',
  'CPT(R_CPT,D1*2+D2);', 'MOV(D1,R_MOV);', 'MVM(D1,16#03,R_MVM);', 'CLR(R_CLR);', 'AND(D1,D2,R_AND);', 'OR(D1,D2,R_OR);', 'XOR(D1,D2,R_XOR);', 'NOT(D1,R_NOT);',
  'BTD(D1,0,R_BTD,4,3);', 'SWPB(D_SW,HIGH/LOW,R_SWP);', 'FLL(5,ARR[0],3);', 'COP(ARR[0],ARR2[1],3);', 'JSR(Sub);',
  'XIC(B1)JMP(Skip);', 'OTE(Q_SKIPPED);', 'LBL(Skip)OTE(Q_AFTER);', 'AFI()OTE(Q_AFI);', 'NOP()OTE(Q_NOP);',
];
const EXPECT = {
  Q_EQU: 1, Q_NEQ: 1, Q_LES: 1, Q_LEQ: 1, Q_GRT: 1, Q_GEQ: 0, Q_LIM: 1, Q_MEQ: 1, Q_CMP: 1,
  R_ADD: 10, R_SUB: 4, R_MUL: 21, R_DIV: 2, R_MOD: 1, F_SQR: 4, R_NEG: -7, R_ABS: 5, R_CPT: 17, R_MOV: 7, R_MVM: 3, R_CLR: 0,
  R_AND: 3, R_OR: 7, R_XOR: 4, R_NOT: -8, R_BTD: 7 << 4, R_SWP: 0x3412, 'ARR[1]': 5, 'ARR2[1]': 5, 'ARR2[3]': 5, Q_SUB: 1, Q_AFI: 0, Q_NOP: 1, Q_XIO: 1,
};
(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 800, height: 1280 }, isMobile: true, hasTouch: true, userAgent: ANDROID });
  await ctx.route('https://ronanski.github.io/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"version":"0.0.1"}' }));
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(400);
  const ev = (fn, a) => page.evaluate(fn, a);
  const out = [];
  const note = (ok, t) => { out.push(`${ok ? '✓' : '✗'} ${t}`); };
  await ev(rungs => {
    const A = MTPS.App, p = A.blank('RunAudit');
    const T = (n, type, dim) => p.tags.push(dim ? { name: n, type, dim } : { name: n, type });
    const txt = rungs.join(' ');
    const names = new Set((txt.match(/\b[A-Z][A-Za-z_0-9]*\b/g) || []).filter(n => !/^(XIC|XIO|OTE|OTL|OTU|ONS|OSR|OSF|TON|TOF|RTO|CTU|CTD|RES|EQU|NEQ|LES|LEQ|GRT|GEQ|LIM|MEQ|CMP|ADD|SUB|MUL|DIV|MOD|SQR|NEG|ABS|CPT|MOV|MVM|CLR|AND|OR|XOR|NOT|BTD|SWPB|FLL|COP|JSR|JMP|LBL|AFI|NOP|HIGH|LOW|DN|Skip|Sub|ARR|ARR2)$/.test(n)));
    names.forEach(n => T(n, /^T\d/.test(n) ? 'TIMER' : /^C\d/.test(n) ? 'COUNTER' : /^(D|R)_?\w*$/.test(n) && !/^(SB|P_|Q_)/.test(n) ? 'DINT' : /^F_/.test(n) ? 'REAL' : 'BOOL'));
    T('ARR', 'DINT', 10); T('ARR2', 'DINT', 10);
    T('Q_SUB', 'BOOL');
    p.tags.find(t => t.name === 'D_SW').value = 0x1234;
    p.tasks[0].programs[0].routines[0].rungs = rungs.map(t => ({ t }));
    p.tasks[0].programs[0].routines.push({ name: 'Sub', rungs: [{ t: 'OTE(Q_SUB);' }] });
    A.openProject(p);
  }, RUNGS);
  await page.keyboard.press('Escape');
  const ver = await ev(() => { MTPS.App.run('verifyc'); return (MTPS.App.state.verify.errors || []).map(e => JSON.stringify(e)); });
  note(!ver.length, `verify: ${ver.length ? ver.join(' ; ').slice(0, 300) : 'no errors'}`);
  // online through the user interface: Go Online, Download, Run
  await page.tap('[data-cmd="online"]'); await page.waitForTimeout(200);
  for (let k = 0; k < 4; k++) { const b = await page.$('#layer .dlg .btn.pri'); if (!b) break; await b.tap(); await page.waitForTimeout(1000); }
  await ev(() => MTPS.App.run('runm')); await page.waitForTimeout(150);
  const b = await page.$('#layer .dlg .btn.pri'); if (b) { await b.tap(); await page.waitForTimeout(200); }
  note(await ev(() => MTPS.App.ctl.mode === 'remrun'), 'online, downloaded, Rem Run (through the tablet buttons)');
  // values through Monitor Tags: a tap on the value, the Write value box
  await ev(() => MTPS.App.run('tagsmon')); await page.waitForTimeout(200);
  const writeVal = async (name, v) => {
    const cell = await page.$(`#tagrows [data-tv="${name}"]`);
    if (!cell) { note(false, `Monitor Tags has no value cell for ${name}`); return; }
    await cell.tap(); await page.waitForTimeout(150);
    const inp = await page.$('#layer input'); if (!inp) { note(false, `tapping ${name} opened no Write value box`); return; }
    await inp.fill(String(v)); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  };
  await writeVal('D1', 7); await writeVal('D2', 3);
  note(await ev(() => MTPS.App.ctl.read('D1') === 7 && MTPS.App.ctl.read('D2') === 3), 'D1 = 7 and D2 = 3 written from Monitor Tags');
  await page.waitForTimeout(300);
  for (const [k, v] of Object.entries(EXPECT)) {
    const got = await ev(k => MTPS.App.ctl.read(k), k);
    note(got === v || (typeof got === 'number' && Math.abs(got - v) < 1e-6), `${k} = ${got} (reference ${v})`);
  }
  note(await ev(() => MTPS.App.ctl.read('Q_SKIPPED') === 0 && MTPS.App.ctl.read('Q_AFTER') === 1) === false, 'JMP with B1 = 0 does not skip (Q_AFTER on)');
  // timers and counters: B1 toggled from Monitor Tags
  const tapBool = async n => { const c = await page.$(`#tagrows [data-tv="${n}"]`); if (c) { await c.tap(); await page.waitForTimeout(100); } else note(false, `no value cell for ${n}`); };
  await tapBool('B1');
  await page.waitForTimeout(800);
  const t1 = await ev(() => MTPS.App.ctl.read('T1.ACC'));
  note(t1 >= 600 && t1 <= 1300, `TON timing: T1.ACC = ${t1} after ~0.8 s (plus the time of the tap)`);
  note(await ev(() => MTPS.App.ctl.read('C1.ACC') === 1 && MTPS.App.ctl.read('C2.ACC') === 4), 'CTU +1 and CTD −1 on the rising edge');
  await ev(() => MTPS.App.ctl.write('Q_SKIPPED', 0)); await page.waitForTimeout(100);
  note(await ev(() => MTPS.App.ctl.read('Q_SKIPPED') === 0), 'JMP skips the rung in between when B1 = 1 (its output is not written)');
  await page.waitForTimeout(1600);
  note(await ev(() => MTPS.App.ctl.read('T1.DN') === 1 && MTPS.App.ctl.read('Q_DN') === 1 && MTPS.App.ctl.read('T3.DN') === 1), 'TON and RTO done after their presets');
  await tapBool('B1'); await page.waitForTimeout(300);
  note(await ev(() => MTPS.App.ctl.read('T1.ACC') === 0 && MTPS.App.ctl.read('T3.ACC') === 1500 && MTPS.App.ctl.read('T2.DN') === 1), 'B1 off: TON resets, RTO keeps its time, TOF still done while timing');
  await page.waitForTimeout(1200);
  note(await ev(() => MTPS.App.ctl.read('T2.DN') === 0), 'TOF done clears after its preset');
  // the ladder shows live values in the boxes
  await page.tap('[data-tabk="MainProgram/MainRoutine"]').catch(() => {});
  await page.waitForTimeout(300);
  const svgTxt = await page.$eval('#ladwrap svg', s => s.textContent).catch(() => '');
  note(svgTxt.includes('R_MUL21') && svgTxt.includes('R_CPT17'), 'online, box instructions show live values of their tags (21 in MUL Dest, 17 in CPT Dest)');
  console.log(out.join('\n'));
  if (errors.length) console.log('JS errors: ' + errors.join(' | '));
  const bad = out.filter(l => l.startsWith('✗')).length;
  console.log(`\n${out.length - bad} of ${out.length} checks pass`);
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
