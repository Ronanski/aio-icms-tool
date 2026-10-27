/* MT PLC Studio UI tests, Wave 2 (C): the trigonometric, advanced math, math conversion, file/misc, GSV/SSV and PID
   instructions of 1756-RM003 (now 1756-RM018A) added as a user adds them (the toolbar tab and its button on the
   desktop with the mouse and on the tablet by touch, the + / Add Ladder Element box on the phone), with their operands
   typed in the operand box; then verify, go online, run and the values; and their Instruction Help page.
   Called from mtps-ui.test.js. */
'use strict';
const fs = require('fs');
const SHOTS = '/tmp/claude-0/shots-w2/C';
module.exports = async function w2c({ browser, URL, check }) {
  try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) { /* ignore */ }
  // [toolbar tab, mnemonic, operands]
  const ADD = [
    ['Trig Functions', 'SIN', ['Ang', 'R1']], ['Trig Functions', 'COS', ['Ang', 'R2']], ['Trig Functions', 'TAN', ['Ang', 'R3']],
    ['Trig Functions', 'ASN', ['Half', 'R4']], ['Trig Functions', 'ACS', ['Half', 'R5']], ['Trig Functions', 'ATN', ['One', 'R6']],
    ['Advanced Math', 'LN', ['Five', 'R7']], ['Advanced Math', 'LOG', ['Hund', 'R8']], ['Advanced Math', 'XPY', ['Two', '10', 'D1']],
  ];
  // the values in Run (the manual's own examples where it gives one)
  const WANT = { R1: Math.sin(0.5), R2: Math.cos(0.5), R3: Math.tan(0.5), R4: Math.asin(0.5), R5: Math.acos(0.5), R6: Math.atan(1), R7: 1.609438, R8: 2, D1: 1024 };
  const project = () => {
    const A = MTPS.App, p = A.blank('Wave2C'), T = (name, type, value, dim) => p.tags.push(Object.assign({ name, type }, value != null ? { value } : {}, dim ? { dim } : {}));
    T('Ang', 'REAL', 0.5); T('Half', 'REAL', 0.5); T('One', 'REAL', 1); T('Five', 'REAL', 5); T('Hund', 'REAL', 100); T('Two', 'DINT', 2);
    for (let k = 1; k <= 8; k++) T('R' + k, 'REAL');
    T('D1', 'DINT');
    A.openProject(p);
  };
  const LAYS = [{ n: 'desktop', vp: { width: 1440, height: 900 } }, { n: 'tablet', vp: { width: 800, height: 1280 }, touch: true }, { n: 'phone', vp: { width: 390, height: 844 }, touch: true }];
  for (const lay of LAYS) {
    const cx = await browser.newContext({ viewport: lay.vp, isMobile: !!lay.touch, hasTouch: !!lay.touch });
    await cx.route('https://ronanski.github.io/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ version: '0.0.1', build: 'test', notes: '' }) }));
    const pg = await cx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(URL); await pg.evaluate(() => localStorage.clear()); await pg.reload(); await pg.waitForTimeout(300);
    const tp = sel => (lay.touch ? pg.tap(sel) : pg.click(sel));
    await pg.evaluate(project);
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
    const bad = [];
    for (const [tab, mn, ops] of ADD) {
      await pg.evaluate(() => { const S = MTPS.App.state, rr = S.p.tasks[0].programs[0].routines[0].rungs; if (rr[rr.length - 1].t) rr.push({ t: '' }); S.sel = null; S.selRung = rr.length - 1; MTPS.App.render(); });
      const ri = await pg.evaluate(() => MTPS.App.state.selRung);
      if (lay.n === 'desktop') {
        if (!(await pg.$(`[data-tab="${tab}"]`))) { bad.push(`no toolbar tab ${tab}`); continue; }
        await tp(`[data-tab="${tab}"]`); await pg.waitForTimeout(100);
        await tp(`.gbtn[data-mn="${mn}"]`);
      } else {
        // the phone's + button, or the tablet's All… button (portrait shows the Favorites row only): Add Ladder
        // Element, the group folder, then the instruction (a second tap adds it)
        await tp(lay.n === 'phone' ? '.fab' : '.gbtn.more'); await pg.waitForTimeout(150);
        if (!(await pg.$(`#layer [data-pk="${mn}"]`))) await tp(`#layer [data-pgrp="${tab}"]`);
        await pg.waitForTimeout(80); await tp(`#layer [data-pk="${mn}"]`); await pg.waitForTimeout(80); await tp(`#layer [data-pk="${mn}"]`);
      }
      await pg.waitForTimeout(250);
      if (!(await pg.$('#layer [data-op="0"]'))) { bad.push(`${mn}: the operand box did not open`); await pg.keyboard.press('Escape'); continue; }
      const labels = await pg.$$eval('#layer .frow label', l => l.map(x => x.textContent));
      const want = await pg.evaluate(m => MTPS.OPN[m], mn);
      if (!want.every(w => labels.some(l => l.startsWith(w)))) bad.push(`${mn}: operand prompts ${labels.join('/')}`);
      for (let i = 0; i < ops.length; i++) { await tp(`#layer [data-op="${i}"]`); await pg.fill(`#layer [data-op="${i}"]`, ops[i]); }
      await tp('#layer .df .btn.pri'); await pg.waitForTimeout(200);
      if (await pg.$('#layer .dlg')) { bad.push(`${mn}: the operand box stayed open`); await pg.keyboard.press('Escape'); await pg.waitForTimeout(80); }
      const t = await pg.evaluate(i => MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs[i].t, ri);
      if (t !== `${mn}(${ops.join(',')});`) bad.push(`${mn}: rung "${t}"`);
    }
    check(`${lay.n}: ${ADD.map(a => a[1]).join(' ')} added from the ${lay.n === 'desktop' ? 'toolbar tabs' : 'Add Ladder Element box (' + (lay.n === 'phone' ? '+' : 'All…') + ')'} with their operand prompts`, !bad.length, bad.join(' | '));
    const ver = await pg.evaluate(() => { MTPS.App.run('verifyc'); return MTPS.App.state.verify.errors.map(e => e.text); });
    check(`${lay.n}: the rungs verify without errors`, !ver.length, ver.join(' | '));
    // online through the dialogs, then Run from the mode menu
    await pg.evaluate(() => MTPS.App.run('online'));
    for (let k = 0; k < 8 && !(await pg.evaluate(() => MTPS.App.state.online && !document.querySelector('#layer .dlg'))); k++) {
      await pg.waitForTimeout(150);
      const b = await pg.$('#layer .dlg .btn.pri'); if (b && !(await pg.$('#layer .dlg .prog'))) await (lay.touch ? b.tap() : b.click()); else await pg.waitForTimeout(500);
    }
    await pg.evaluate(() => MTPS.App.run('runm')); await pg.waitForTimeout(150);
    { const b = await pg.$('#layer .dlg .btn.pri'); if (b) { await (lay.touch ? b.tap() : b.click()); await pg.waitForTimeout(200); } }
    await pg.waitForTimeout(300);
    const got = await pg.evaluate(ks => ks.map(k => MTPS.App.ctl.read(k)), Object.keys(WANT));
    const off = Object.keys(WANT).filter((k, i) => !(Math.abs(got[i] - WANT[k]) < 1e-5));
    check(`${lay.n}: online in Run, the results are the reference values`, !off.length && (await pg.evaluate(() => MTPS.App.ctl.mode)) === 'remrun', off.map(k => `${k}=${got[Object.keys(WANT).indexOf(k)]}`).join(' '));
    if (lay.n === 'desktop') {
      await pg.screenshot({ path: `${SHOTS}/after-ladder-desktop.png` }).catch(() => {});
      const svg = await pg.$eval('#ladwrap svg', s => s.textContent).catch(() => '');
      check('desktop: the SIN box shows its live Dest value online', svg.includes('SIN') && svg.includes('0.479426'), svg.slice(0, 200));
      const tabs = await pg.$$eval('.itabs [data-tab]', x => x.map(y => y.dataset.tab).join(','));
      check('desktop: the toolbar has the Trig Functions and Advanced Math tabs', /Trig Functions,Advanced Math/.test(tabs), tabs);
      await pg.evaluate(() => MTPS.App.select({ ri: 0, path: [0] })); await pg.keyboard.press('F1'); await pg.waitForTimeout(150);
      const ih = await pg.$eval('.ihc', p => p.textContent).catch(() => '');
      check('Instruction Help for SIN: Trigonometric Instructions, radians, the manual example and the status flags', ih.includes('Sine (SIN)') && ih.includes('Trigonometric Instructions') && ih.includes('radians') && ih.includes('0.70710677') && ih.includes('S:Z'), ih.slice(0, 300));
      await pg.click('#layer [data-ih="XPY"]'); await pg.waitForTimeout(80);
      const xp = await pg.$eval('.ihc', p => p.textContent).catch(() => '');
      check('Instruction Help for XPY: Advanced Math Instructions, Source X / Source Y, EXPT in v36', xp.includes('X To The Power Of Y (XPY)') && xp.includes('Advanced Math Instructions') && xp.includes('Source X') && xp.includes('EXPT'));
      await pg.screenshot({ path: `${SHOTS}/after-help-desktop.png` }).catch(() => {});
      await pg.keyboard.press('Escape');
    } else await pg.screenshot({ path: `${SHOTS}/after-ladder-${lay.n}.png` }).catch(() => {});
    check(`${lay.n}: no JS errors (Wave 2 C)`, !errs.length, errs.join(' | '));
    await cx.close();
  }
};
