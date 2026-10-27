/* MT PLC Studio UI tests, Wave 3 (E): the ASCII string and ASCII conversion instructions (1756-RM018A chapters 17
   and 18), the MSG instruction with its Message Configuration dialog (1756-RM018A chapter 4, 1756-PM012, v37 help)
   and Add-On Instructions (1756-PM010). Mouse on the desktop, touch on the tablet and the phone. Called from
   mtps-ui.test.js. */
'use strict';
module.exports = async function w3E({ browser, page, URL, check }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const dlgTitle = (pg = page) => pg.$eval('#layer .dlg .dh b', b => b.textContent).catch(() => '');
  const errors = [];
  // a touch page of this size with the project made by setup
  async function touchPage(w, h, setup, arg) {
    const tp = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    tp.on('pageerror', e => errors.push(e.message));
    await tp.goto(URL); await tp.waitForTimeout(400); await tp.keyboard.press('Escape');
    await tp.evaluate(() => { document.querySelector('#layer').innerHTML = ''; });
    if (setup) await tp.evaluate(setup, arg);
    await tp.waitForTimeout(300);
    return tp;
  }
  // a new empty rung at the end of MainRoutine, selected; then Add Ladder Element (Insert) with this instruction and
  // its operands typed in the operand box, as a user does (the tile is tapped on a touch page)
  async function addInstr(pg, mn, ops, touch) {
    await pg.evaluate(() => { const S = MTPS.App.state, rr = S.p.tasks[0].programs[0].routines[0].rungs; if (rr[rr.length - 1].t) rr.push({ t: '' }); S.prog = 'MainProgram'; S.routine = 'MainRoutine'; S.view = 'ladder'; S.sel = null; S.selRung = rr.length - 1; MTPS.App.render(); });
    // the Insert command: Add Ladder Element on the desktop; the All… button (tablet) or the + button (phone) by touch
    if (touch) await pg.tap(await pg.$('.fab') ? '.fab' : '.gbtn.more[data-cmd="ins"]'); else await pg.evaluate(() => MTPS.App.run('ins'));
    await pg.waitForTimeout(150);
    await pg.fill('#layer #pq', mn); await pg.waitForTimeout(60);
    if (touch) await pg.tap(`#layer [data-pk="${mn}"]`); else await pg.click(`#layer [data-pk="${mn}"]`);
    await pg.waitForTimeout(200);
    for (let i = 0; i < ops.length; i++) { const f = `#layer [data-op="${i}"]`; if (touch) await pg.tap(f); else await pg.click(f); await pg.fill(f, ops[i]); }
    if (touch) await pg.tap('#layer .df .btn.pri'); else await pg.click('#layer .df .btn.pri');
    await pg.waitForTimeout(200);
    return pg.evaluate(() => { const rr = MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs; return rr[rr.length - 1].t; });
  }
  const strText = (pg, n) => pg.evaluate(n => { const o = MTPS.App.racks[0].controller(0).read(n); return o ? String.fromCharCode(...o.DATA.slice(0, o.LEN)) : null; }, n);
  // download the open project to the emulated controller in slot 0 and run it
  const dlRun = pg => pg.evaluate(() => { const A = MTPS.App, c = A.racks[0].controller(0); c.setKey('REM'); const r = c.download(A.state.p); c.setMode('remrun'); return r.ok; });

  console.log('ASCII string and ASCII conversion instructions (1756-RM018A chapters 17 and 18)');
  {
    const strProject = () => {
      const A = MTPS.App, p = A.example(), sv = t => ({ LEN: t.length, DATA: [...t].map(c => c.charCodeAt(0)) });
      p.tags.push({ name: 'Txt_A', type: 'STRING', value: sv('Hello') }, { name: 'Txt_B', type: 'STRING', value: sv(' World') }, { name: 'Txt_D', type: 'STRING' }, { name: 'Pos', type: 'DINT' }, { name: 'Num_S', type: 'STRING', value: sv('Wt=-250kg') }, { name: 'Wt', type: 'DINT' });
      document.querySelector('#layer').innerHTML = '';
      A.openProject(p);
    };
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(150);
    await ev(strProject); await wait(150);
    await page.click('[data-tab="ASCII String"]'); await wait(100);
    check('the instruction toolbar has the ASCII String tab: CONCAT DELETE FIND INSERT MID', (await page.$$eval('.gbtn[data-mn]', b => b.map(x => x.dataset.mn).join(','))) === 'CONCAT,DELETE,FIND,INSERT,MID');
    await page.click('[data-tab="ASCII Conversion"]'); await wait(100);
    check('… and the ASCII Conversion tab: STOD STOR DTOS RTOS UPPER LOWER', (await page.$$eval('.gbtn[data-mn]', b => b.map(x => x.dataset.mn).join(','))) === 'STOD,STOR,DTOS,RTOS,UPPER,LOWER');
    const t1 = await addInstr(page, 'CONCAT', ['Txt_A', 'Txt_B', 'Txt_D']);
    check('desktop: CONCAT from Add Ladder Element with its three operands (Source A, Source B, Dest)', t1 === 'CONCAT(Txt_A,Txt_B,Txt_D);', t1);
    const t2 = await addInstr(page, 'FIND', ['Txt_D', 'Txt_B', '1', 'Pos']);
    const t3 = await addInstr(page, 'STOD', ['Num_S', 'Wt']);
    check('FIND (Source, Search, Start, Result) and STOD (Source, Dest)', t2 === 'FIND(Txt_D,Txt_B,1,Pos);' && t3 === 'STOD(Num_S,Wt);', t2 + ' ' + t3);
    const box = await page.$$eval('#ladwrap text.nm.b', t => t.map(x => x.textContent));
    check('the ladder draws them as boxes', ['CONCAT', 'FIND', 'STOD'].every(m => box.includes(m)), box.join(','));
    await ev(() => MTPS.App.run('verifyc')); await wait(100);
    check('the controller verifies with no errors', (await ev(() => MTPS.App.state.verify.errors.length)) === 0, JSON.stringify(await ev(() => MTPS.App.state.verify.errors.map(e => e.text))));
    check('download and run', await dlRun(page)); await wait(300);
    check('in Run: CONCAT gives Hello World, FIND 6, STOD -250', (await strText(page, 'Txt_D')) === 'Hello World' && (await ev(() => MTPS.App.racks[0].controller(0).read('Pos'))) === 6 && (await ev(() => MTPS.App.racks[0].controller(0).read('Wt'))) === -250);
    // the operand box offers only string tags for a string operand
    await ev(() => { const S = MTPS.App.state; S.sel = null; MTPS.App.render(); MTPS.App.run('ins'); }); await wait(150);
    await page.fill('#layer #pq', 'UPPER'); await wait(60); await page.click('#layer [data-pk="UPPER"]'); await wait(200);
    await page.click('#layer [data-op="0"]'); await page.fill('#layer [data-op="0"]', ''); await wait(80);
    const offered = await page.$$eval('#layer #sg .row[data-pick]', x => x.map(y => y.dataset.pick));
    check('the operand box offers the string tags (and no DINT) for Source', offered.includes('Txt_A') && !offered.includes('Pos'), offered.join(','));
    await page.keyboard.press('Escape'); await wait(100);
    await ev(() => { const c = MTPS.App.racks[0].controller(0); c.setMode('remprog'); });
    // tablet (touch): the toolbar tab and Add Ladder Element by touch
    const tl = await touchPage(1180, 820, strProject);
    await tl.tap('[data-tab="ASCII Conversion"]'); await tl.waitForTimeout(100);
    const tb = await tl.$$eval('.gbtn[data-mn]', b => b.map(x => x.dataset.mn).join(','));
    await tl.close();
    const tp = await touchPage(800, 1280, strProject);
    const t4 = await addInstr(tp, 'UPPER', ['Txt_A', 'Txt_D'], true);
    check('tablet (touch): the ASCII Conversion tab in landscape; UPPER added by touch with All… in portrait', tb === 'STOD,STOR,DTOS,RTOS,UPPER,LOWER' && t4 === 'UPPER(Txt_A,Txt_D);', tb + ' ' + t4);
    await tp.close();
    const pp = await touchPage(390, 844, strProject);
    const t5 = await addInstr(pp, 'MID', ['Txt_A', '3', '2', 'Txt_D'], true);
    await pp.evaluate(() => { MTPS.App.racks[0].controller(0).setKey('REM'); });
    const ok = await dlRun(pp); await pp.waitForTimeout(300);
    check('phone (touch): MID added with Add Ladder Element, downloaded and run: "ell"', t5 === 'MID(Txt_A,3,2,Txt_D);' && ok && (await strText(pp, 'Txt_D')) === 'ell', t5);
    await pp.evaluate(() => MTPS.App.racks[0].controller(0).setMode('remprog'));
    await pp.close();
  }
  check('Wave 3 E: no JS errors on the touch pages', !errors.length, errors.join(' | '));
};
