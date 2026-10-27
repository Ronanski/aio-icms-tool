/* MT PLC Studio UI tests, Wave 3 (C): Structured Text routines (1756-PM007L). As a user: New Routine with Type
   Structured Text (File > New Component on the desktop with the mouse and on the tablet by touch, the routine picker
   on the phone), the text typed in the ST editor (colours, line numbers), Verify with the error on its line, the
   Errors line that selects it, Undo of the typing, then online in Run with the values in the monitor.
   Called from mtps-ui.test.js. */
'use strict';
const fs = require('fs');
const SHOTS = '/tmp/claude-0/shots-w3/C';
module.exports = async function w3c({ browser, URL, check }) {
  try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) { /* ignore */ }
  const CODE = ['// count while Run is on', 'IF Run THEN', 'Count := Count + 1;', 'END_IF;', 'Tm.PRE := 500; Tm.TimerEnable := Run;', 'TONR(Tm);', 'Bad := 1;', 'CASE Count OF 1..3: Out := 1; ELSE Out := 0; END_CASE;'];
  const project = () => {
    const A = MTPS.App, p = A.blank('StDemo');
    p.tags.push({ name: 'Count', type: 'DINT' }, { name: 'Run', type: 'BOOL' }, { name: 'Out', type: 'BOOL' }, { name: 'Tm', type: 'FBD_TIMER' });
    p.tasks[0].programs[0].routines[0].rungs = [{ t: 'JSR(Calc,0);' }];
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
    const wait = ms => pg.waitForTimeout(ms);
    const pick = async label => {
      const ok = await pg.evaluate(l => { document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick); const it = [...document.querySelectorAll('#layer .menu .it')].find(x => !x.hidden && x.querySelector('span:not(.k):not(.ck)') && x.querySelector('span:not(.k):not(.ck)').textContent === l); if (it) it.dataset.wapick = '1'; return !!it; }, label);
      if (ok) { await tp('#layer [data-wapick]'); await wait(200); }
      return ok;
    };
    const R = () => pg.evaluate(() => { const r = MTPS.App.state.p.tasks[0].programs[0].routines.find(x => x.name === 'Calc'); return r ? { type: r.type, st: r.st } : null; });
    await pg.evaluate(project);
    await pg.keyboard.press('Escape'); await wait(150);
    // New Routine
    let opened;
    if (lay.n === 'desktop') { await pg.click('.dmenu [data-menu="File"]'); await wait(120); opened = await pick('New Routine…'); }
    else if (lay.n === 'tablet') { await tp('[data-allmenu]'); await wait(150); await tp('[data-fold="File"]'); await wait(150); opened = await pick('New Routine…'); }
    else { await tp('[data-routines]'); await wait(150); opened = await pick('New Routine…'); }
    check(`${lay.n}: New Routine opens from ${lay.n === 'phone' ? 'the routine picker' : 'File > New Component'}`, opened && !!(await pg.$('#layer #nr-t')));
    if (lay.n === 'desktop') await pg.screenshot({ path: `${SHOTS}/after-new-routine-desktop.png` }).catch(() => {});
    const opts = await pg.$$eval('#layer #nr-t option', o => o.map(x => x.textContent).join(','));
    check(`${lay.n}: its Type has Ladder Diagram and Structured Text`, opts === 'Ladder Diagram,Structured Text', opts);
    await pg.selectOption('#layer #nr-t', 'ST');
    await tp('#layer #p1'); await pg.fill('#layer #p1', 'Calc');
    await tp('#layer .dlg .btn.pri'); await wait(250);
    const r0 = await R();
    check(`${lay.n}: OK makes a Structured Text routine and opens it in the ST editor`, r0 && r0.type === 'ST' && r0.st === '' && !!(await pg.$('#stwrap #sttx')) && !(await pg.$('#ladwrap')));
    // the text, typed
    await tp('#sttx'); await wait(100);
    for (const l of CODE) { await pg.keyboard.type(l); await pg.keyboard.press('Enter'); }
    await wait(900);
    const r1 = await R();
    check(`${lay.n}: the typed text is the routine's text`, r1.st === CODE.join('\n') + '\n', JSON.stringify(r1.st));
    const hl = await pg.evaluate(() => ({ kw: [...document.querySelectorAll('.sthl .kw')].map(x => x.textContent).join(' '), cm: (document.querySelector('.sthl .cm') || {}).textContent, in: (document.querySelector('.sthl .in') || {}).textContent, nu: (document.querySelector('.sthl .nu') || {}).textContent, n: document.querySelectorAll('.stgut div').length }));
    check(`${lay.n}: keywords, comments, numbers and instructions in their colours; a line number for each line`, hl.kw === 'IF THEN END_IF CASE OF ELSE END_CASE' && hl.cm === '// count while Run is on' && hl.in === 'TONR' && hl.nu === '1' && hl.n === CODE.length + 1, JSON.stringify(hl));
    if (lay.n === 'desktop') {
      const dis = await pg.evaluate(() => ({ g: [...document.querySelectorAll('.gbtn[data-mn]')].every(b => b.disabled), r: document.querySelector('.rtb [data-cmd="rung"]').disabled }));
      check('desktop: the ladder instruction buttons and Add Rung are off in an ST routine', dis.g && dis.r);
    }
    // Verify
    if (lay.n === 'desktop') await pg.click('.dtb [data-cmd="verifyc"]');
    else if (lay.n === 'tablet') { await tp('[data-allmenu]'); await wait(150); await tp('[data-fold="Logic"]'); await wait(150); await pick('Verify Controller'); }
    else { await tp('[data-go="more"]'); await wait(150); await tp('.page [data-cmd="verifyc"]'); }
    await wait(300);
    const v1 = await pg.evaluate(() => MTPS.App.state.verify.errors.map(e => e.text));
    check(`${lay.n}: Verify gives the error on its line: Line 7, Column 1`, v1.length === 1 && v1[0] === "Error: Line 7, Column 1: Undefined tag 'Bad'.", v1.join(' | '));
    // the Errors line opens the routine with that line selected
    if (lay.n === 'tablet' && !(await pg.$('[data-stline="7"]'))) { await tp('[data-errh]'); await wait(200); }
    const ln = await pg.$('[data-stline="7"]');
    if (ln) { if (lay.touch) await ln.tap(); else await ln.click(); }
    await wait(300);
    const sel = await pg.evaluate(() => { const t = document.querySelector('#sttx'); return t ? t.value.slice(t.selectionStart, t.selectionEnd) : null; });
    const red = await pg.evaluate(() => { const d = document.querySelectorAll('.stgut div')[6]; return d ? d.className : ''; });
    check(`${lay.n}: the Errors line selects line 7 in the editor, its number in red`, !!ln && sel === 'Bad := 1;' && red === 'e', `${sel} ${red}`);
    if (lay.n === 'desktop') await pg.screenshot({ path: `${SHOTS}/after-st-verify-desktop.png` }).catch(() => {});
    await pg.keyboard.press('Backspace'); await pg.keyboard.press('Backspace'); await wait(900);
    const r2 = await R();
    check(`${lay.n}: the line is deleted`, !r2.st.includes('Bad'), JSON.stringify(r2.st));
    if (lay.n === 'desktop') {
      await pg.click('.dtb [data-cmd="undo"]'); await wait(200);
      const u = await pg.evaluate(() => [MTPS.App.state.p.tasks[0].programs[0].routines[1].st, document.querySelector('#sttx').value]);
      check('desktop: Undo brings the typed line back, in the project and in the editor', u[0].includes('Bad := 1;') && u[1] === u[0]);
      await pg.click('.dtb [data-cmd="redo"]'); await wait(200);
      check('desktop: Redo deletes it again', !(await R()).st.includes('Bad'));
      await pg.click('#sttx'); await pg.keyboard.press('Control+End'); await pg.keyboard.type('Nope := 2;');
      await pg.click('.dtb [data-cmd="verifyc"]'); await wait(200);
      const vq = await pg.evaluate(() => MTPS.App.state.verify.errors.map(e => e.msg));
      check('desktop: Verify at once after typing checks the text as typed', vq.length === 1 && vq[0] === "Undefined tag 'Nope'.", vq.join(' | '));
      await wait(900); await pg.click('.dtb [data-cmd="undo"]'); await wait(200);
      check('desktop: … and one Undo takes that typing back', !(await R()).st.includes('Nope') && !(await pg.$eval('#sttx', t => t.value)).includes('Nope'));
      await pg.click('.org [data-org="rt:MainProgram/Calc"]', { button: 'right' }); await wait(150);
      if (await pick('Properties…')) {
        const t = await pg.$eval('#layer .dlg', d => d.textContent).catch(() => '');
        check('desktop: Routine Properties: Type Structured Text and its number of lines', t.includes('Structured Text') && t.includes('Number of lines'), t.slice(0, 200));
        await pg.keyboard.press('Escape'); await wait(100);
      } else check('desktop: Routine Properties from the organizer', false);
    }
    // online, Run: the monitor
    await pg.evaluate(() => MTPS.App.run('online'));
    for (let k = 0; k < 8 && !(await pg.evaluate(() => MTPS.App.state.online && !document.querySelector('#layer .dlg'))); k++) {
      await wait(150);
      const b = await pg.$('#layer .dlg .btn.pri'); if (b && !(await pg.$('#layer .dlg .prog'))) await (lay.touch ? b.tap() : b.click()); else await wait(500);
    }
    await pg.evaluate(() => MTPS.App.run('runm')); await wait(150);
    { const b = await pg.$('#layer .dlg .btn.pri'); if (b) { await (lay.touch ? b.tap() : b.click()); await wait(200); } }
    if (lay.n === 'phone') { await tp('[data-go="ladder"]'); await wait(150); }
    await pg.evaluate(() => MTPS.App.ctl.write('Run', 1)); await wait(700);
    const m = await pg.evaluate(() => ({ mode: MTPS.App.ctl.mode, c: MTPS.App.ctl.read('Count'), acc: MTPS.App.ctl.read('Tm.ACC'), mon: !!document.querySelector('.sted.mon'), v: [...document.querySelectorAll('.sthl .stv')].map(x => x.textContent) }));
    check(`${lay.n}: online in Run the ST routine runs (Count counts, the TONR times)`, m.mode === 'remrun' && m.c > 3 && m.acc > 0, JSON.stringify(m));
    check(`${lay.n}: the monitor shows the live values after the tags`, m.mon && m.v[0] === '1' && +m.v[1] > 3 && m.v.includes('500'), JSON.stringify(m.v));
    await wait(300);
    const v2 = await pg.evaluate(() => +document.querySelectorAll('.sthl .stv')[1].textContent);
    check(`${lay.n}: … and they update as the controller runs`, v2 > +m.v[1], `${v2} ${m.v[1]}`);
    await pg.screenshot({ path: `${SHOTS}/after-st-monitor-${lay.n}.png` }).catch(() => {});
    await tp('[data-stm="edit"]'); await wait(150);
    check(`${lay.n}: Edit goes back to the text; Monitor to the values`, !(await pg.$('.sted.mon')) && (await pg.$eval('#sttx', t => getComputedStyle(t).display)) !== 'none');
    await tp('[data-stm="mon"]'); await wait(150);
    check(`${lay.n}: (back to the monitor)`, !!(await pg.$('.sted.mon')));
    check(`${lay.n}: no sideways page scroll with the ST editor`, await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    check(`${lay.n}: ST routines: no JS errors`, !errs.length, errs.join(' | '));
    await cx.close();
  }
};
