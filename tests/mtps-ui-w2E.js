/* MT PLC Studio UI tests, Wave 2 (E): Logix Emulate (BPT / TPT and trace windows, emulated controller Properties,
   Chassis Monitor status bar and chassis Properties) and RSLinx Classic (the full menus, Module Statistics, Driver
   and CIP Diagnostics, Station Diagnostics, Data Monitor, Set Time). Mouse on the desktop, touch on the tablet and
   the phone. Called from mtps-ui.test.js. */
'use strict';
module.exports = async function w2E({ browser, page, URL, check }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const dlgTitle = (pg = page) => pg.$eval('#layer .dlg .dh b', b => b.textContent).catch(() => '');
  const errors = [];
  // a touch page of this size, with the example open
  async function touchPage(w, h, setup, arg) {
    const tp = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    tp.on('pageerror', e => errors.push(e.message));
    await tp.goto(URL); await tp.waitForTimeout(400); await tp.keyboard.press('Escape');
    await tp.evaluate(() => { document.querySelector('#layer').innerHTML = ''; MTPS.App.openProject(MTPS.App.example()); });
    if (setup) await tp.evaluate(setup, arg);
    await tp.waitForTimeout(300);
    return tp;
  }
  // the example with a TPT and a BPT rung, downloaded to the emulated controller in slot 0 and in Remote Run
  const traceProject = () => {
    const A = MTPS.App, p = A.example();
    p.tags.push({ name: 'AV', type: 'REAL', value: 3.5 }, { name: 'Go', type: 'BOOL' });
    p.tasks[0].programs[0].routines[0].rungs.push({ t: "XIC(Go)TPT('Analog trace:value = %f',AV);" }, { t: "XIC(Go)GRT(AV,3.02)BPT('Breakpoint:The input value is %f',AV);" });
    document.querySelector('#layer').innerHTML = '';
    A.openProject(p);
    const c = A.racks[0].controller(0); c.setKey('REM'); c.download(A.state.p); c.setMode('remrun');
    A.state.prefs.emuMin = false; A.render();
  };
  const C = () => ev(() => { const c = MTPS.App.racks[0].controller(0); return { bp: !!c.bp, n: c.traces.size, ts: c.tcfg.ts, mode: c.mode }; });

  console.log('Logix Emulate: BPT / TPT, the trace windows and the breakpoint prompt (LGEM5K-GR016M chapters 9 and 11)');
  {
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(150);
    await ev(traceProject); await wait(200);
    await page.click('[data-tab="Debug"]'); await wait(100);
    check('the instruction toolbar has the Debug tab with BPT and TPT (the Debug tab of the instruction palette)', (await page.$$eval('.gbtn[data-mn]', b => b.map(x => x.dataset.mn).join(','))) === 'BPT,TPT');
    await ev(() => MTPS.App.racks[0].controller(0).write('Go', 1)); await wait(400);
    check('a true TPT opens its trace window by itself, titled with the slot and the text before the colon', (await page.$eval('.trwin .iowh b', b => b.textContent).catch(() => '')) === 'Slot 0: Analog trace' && (await page.$eval('.trwin .trlist', l => l.textContent)).includes('value = 3.500000'));
    check('a true BPT stops the program and prompts; the title bar holds the slot', (await dlgTitle()) === 'Slot 0: Breakpoint' && (await page.$eval('#layer .dlg', d => d.textContent)).includes('The input value is 3.500000') && (await C()).bp);
    await page.click('#layer .df .btn.pri'); await wait(300);
    check('OK: the program runs on, and the breakpoint triggers again while its condition holds', (await dlgTitle()) === 'Slot 0: Breakpoint' && (await C()).mode === 'remrun');
    await ev(() => MTPS.App.racks[0].controller(0).write('AV', 1)); await page.click('#layer .df .btn.pri'); await wait(300);
    check('condition gone: no prompt, the controller runs', (await dlgTitle()) === '' && !(await C()).bp);
    const lines = () => page.$$eval('.trwin[data-trwin*="Analog"] .trlist > div', d => d.length);
    await page.click('.trwin [data-trf]'); await wait(50);
    const n1 = await lines(); await wait(300);
    check('Freeze Display: the trace window stops updating', (await page.$eval('.trwin [data-trf]', b => b.getAttribute('aria-pressed'))) === 'true' && (await lines()) === n1);
    await page.click('.trwin [data-trf]'); await wait(50);
    await page.click('.trwin [data-trc]'); await wait(20);
    check('Clear Display clears the window; Freeze Log is off while the trace is not logged to disk', (await lines()) <= 3 && (await page.$eval('.trwin [data-trg]', b => b.disabled)));
    await page.click('#iob [data-ccpu="0:0"] .mname', { button: 'right' }); await wait(80);
    await page.click('#layer .it:has-text("Configure Emulation")'); await wait(150);
    check('Configure Emulation lists the current traces with the trace settings', (await page.$$eval('#layer [data-tro]', r => r.length)) === 2 && (await page.$('#tr-ign')) !== null && (await page.$('#tr-ts')) !== null && (await page.$eval('#tr-show', i => i.checked)));
    await page.selectOption('#tr-ts', 'Absolute'); await wait(50);
    check('TimeStamp Absolute is set at once', (await C()).ts === 'Absolute');
    await page.click('#layer [data-trclose]'); await wait(80);
    check('Close All Traces closes the trace windows (the traces stay listed)', (await page.$$('.trwin')).length === 0 && (await page.$$eval('#layer [data-tro]', r => r.length)) === 2);
    await page.dblclick('#layer [data-tro^="T:"]'); await wait(100);
    check('double-click a trace in the list opens its window again', (await page.$$('.trwin')).length === 1);
    await ev(() => MTPS.App.racks[0].controller(0).write('Go', 0)); await wait(50);
    await page.click('#layer [data-trrem]'); await wait(80);
    check('Remove All Traces empties the list', (await C()).n === 0 && (await page.$$('.trwin')).length === 0);
    await page.keyboard.press('Escape'); await wait(80);
    await ev(() => { const c = MTPS.App.racks[0].controller(0); c.write('Go', 0); c.tcfg.ts = 'None'; });
    const tp = await touchPage(800, 1280, traceProject);
    await tp.evaluate(() => MTPS.App.racks[0].controller(0).write('Go', 1)); await tp.waitForTimeout(400);
    const big = await tp.$$eval('.trwin .trbtns .btn', b => b.length >= 3 && b.every(x => x.getBoundingClientRect().height >= 44));
    await tp.evaluate(() => MTPS.App.racks[0].controller(0).write('Go', 0));
    await tp.tap('#layer .df .btn.pri'); await tp.waitForTimeout(300);
    check('tablet (touch): the trace window buttons are 44 px+, a tap on OK acknowledges the breakpoint', big && (await dlgTitle(tp)) === '' && !(await tp.evaluate(() => MTPS.App.racks[0].controller(0).bp)), `${big} ${await dlgTitle(tp)}`);
    await tp.close();
  }

  check('Wave 2 (E): no JS errors in the touch pages', errors.length === 0, errors.join(' | '));
};
