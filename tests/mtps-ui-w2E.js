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

  console.log('Logix Emulate: Properties of an emulated controller, General / System / Emulator / Debug');
  {
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(150);
    await ev(() => { document.querySelector('#layer').innerHTML = ''; document.querySelectorAll('.trwin').forEach(w => w.remove()); MTPS.App.openProject(MTPS.App.example()); MTPS.App.state.prefs.emuMin = false; MTPS.App.render(); });
    await wait(200);
    await page.click('#iob [data-ccpu="0:0"] .mname', { button: 'right' }); await wait(80);
    await page.click('#layer .it:has-text("Properties")'); await wait(150);
    const tabs = await page.$$eval('#layer .dtabs [data-dt]', t => t.map(x => x.textContent).join(','));
    check('right-click the controller > Properties: Module Properties with General, System, Emulator and Debug', (await dlgTitle()).startsWith('Module Properties - [0] PLC-CPU') && tabs === 'General,System,Emulator,Debug', tabs);
    check('General: Version, Startup Mode (Remote Program / Last Controller State), Memory Size, Periodic Save, Use RSLinx Classic', (await page.$$eval('#ep-st option', o => o.map(x => x.textContent).join('|'))) === 'Remote Program|Last Controller State' && (await page.$('#ep-v')) !== null && (await page.$('#ep-ps')) !== null && (await page.$eval('#ep-lx', i => i.checked)) && !(await page.$eval('#ep-pson', i => i.checked)));
    await page.selectOption('#ep-st', 'remprog');
    await page.click('#layer [data-dt="sys"]'); await wait(50);
    check('System: Continuous Task Dwell Time (default 10 ms), CPU Affinity, Channel 0 Serial Port', (await page.$eval('#ep-dw', i => i.value)) === '10' && (await page.$('#ep-cpu')) !== null && (await page.$('#ep-com')) !== null && await page.$eval('#ep-dw', i => i.offsetParent !== null));
    await page.fill('#ep-dw', '200'); await page.click('#layer .df .btn.pri'); await wait(100);
    check('a dwell time over 100 ms is refused, the dialog stays', (await dlgTitle()).startsWith('Module Properties') && (await ev(() => MTPS.App.racks[0].controller(0).emu.dwell)) === 10);
    await page.fill('#ep-dw', '20');
    await page.click('#layer [data-dt="emu"]'); await wait(50);
    check('Emulator: Speed of Time with Configure Emulation, Single Scan, IP address, power', (await page.$('#layer [data-pane="emu"] [data-ecfg]')) !== null && (await page.$('#ep-ss')) !== null && (await page.$('#ep-ip')) !== null && (await page.$eval('#ep-on', i => i.checked)));
    await page.click('#layer [data-dt="dbg"]'); await wait(50);
    check('Debug: the trace settings (Ignore If No Value Changed, TimeStamp, Display all new traces, Log new traces to disk)', await page.$eval('#tr-ts', i => i.offsetParent !== null) && (await page.$('#tr-ign')) !== null && (await page.$('#tr-log')) !== null);
    await page.click('#layer .df .btn.pri'); await wait(150);
    const e = await ev(() => { const c = MTPS.App.racks[0].controller(0); return [c.emu.startup, c.emu.dwell, c.period]; });
    check('OK keeps the settings: Startup Mode Remote Program, dwell 20 ms (the scan period)', JSON.stringify(e) === '["remprog",20,20]' && (await dlgTitle()) === '', JSON.stringify(e));
    await ev(() => { MTPS.App.racks[0].controller(0).setEmu({ startup: 'last', dwell: 10 }); });
    const tp = await touchPage(800, 1280, () => { MTPS.App.state.prefs.emuMin = false; MTPS.App.render(); });
    await tp.tap('#iob [data-ccpu="0:0"] .mname'); await tp.waitForTimeout(150);
    await tp.tap('#dock [data-emb="dock:Slot"]'); await tp.waitForTimeout(150);
    const pr = await tp.evaluate(() => { const it = [...document.querySelectorAll('#layer .it')].find(x => x.textContent.includes('Properties')); if (it) it.dataset.wapick = '1'; return !!it && !it.classList.contains('dis'); });
    if (pr) await tp.tap('#layer [data-wapick]'); await tp.waitForTimeout(200);
    await tp.tap('#layer [data-dt="sys"]'); await tp.waitForTimeout(80);
    check('tablet (touch): tap the controller, Slot > Properties…, the System tab', pr && (await dlgTitle(tp)).startsWith('Module Properties') && await tp.$eval('#ep-dw', i => i.offsetParent !== null));
    await tp.close();
  }

  console.log('Logix Emulate: the Chassis Monitor status bar, Computer box and chassis Properties');
  {
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(150);
    await ev(() => { document.querySelector('#layer').innerHTML = ''; MTPS.App.openProject(MTPS.App.example()); MTPS.App.state.prefs.emuMin = false; MTPS.App.state.prefs.emuCompact = false; MTPS.App.render(); });
    await wait(200);
    const st = (s = '#emst-dock') => page.$eval(s, b => b.textContent).catch(() => '');
    check('the emulator panel has a status bar: Ready, the chassis, the slots used, the controllers running', /^Ready/.test(await st()) && /of 8 slots used/.test(await st()) && /controller.* running/.test(await st()) , await st());
    await page.click('#iob [data-ccpu="0:0"] .mname'); await wait(150);
    check('a click on a module shows it on the left of the status bar', /^Slot 0: PLC-CPU/.test(await st()), await st());
    await ev(() => MTPS.App.run('chassis')); await wait(200);
    check('the Emulator window: the Computer box under the menu bar, and the status bar', (await page.$eval('#layer .emcomp', b => b.textContent)).startsWith('Computer: ') && (await st('#layer .emu .emst')).includes('slots used'));
    await page.click('#layer [data-emb="win:View"]'); await wait(80); await page.click('#layer .it:has-text("Compact")'); await wait(200);
    check('View > Compact hides the Computer box (the status bar stays)', await page.$eval('#layer .emcomp', b => getComputedStyle(b).display === 'none') && await page.$eval('#layer .emu .emst', b => b.offsetParent !== null));
    await page.click('#layer [data-emb="win:View"]'); await wait(80); await page.click('#layer .it:has-text("Compact")'); await wait(200);
    await page.click('#layer [data-emb="win:File"]'); await wait(80);
    await page.click('#layer .it:has-text("Chassis Properties")'); await wait(150);
    check('File > Chassis Properties…: General (name, description, slots, computer, Virtual Backplane) and Slots', (await dlgTitle()) === 'Chassis Properties - Chassis' && (await page.$$eval('#layer .dtabs [data-dt]', t => t.map(x => x.textContent).join(','))) === 'General,Slots' && (await page.$eval("#layer .dlg", d => d.textContent)).includes("Virtual Backplane"));
    await page.click('#layer [data-dt="slots"]'); await wait(50);
    check('Slots: every slot with its module, name and status', (await page.$$eval('#cp-slots tbody tr', r => r.length)) === 8 && (await page.$eval('#cp-slots tbody', b => b.textContent)).includes('PLC-CPU'));
    await page.click('#layer [data-dt="gen"]'); await page.fill('#cp-n', 'Line_A'); await page.click('#layer .df .btn.pri'); await wait(200);
    check('OK renames the chassis', (await ev(() => MTPS.App.racks[0].name)) === 'Line_A');
    await ev(() => { document.querySelector('#layer').innerHTML = ''; MTPS.App.render(); }); await wait(150);
    await page.click('#iob .rkps', { button: 'right' }); await wait(80);
    await page.click('#layer .it:has-text("Properties")'); await wait(150);
    check('right-click the power supply: Properties… opens the chassis Properties', (await dlgTitle()) === 'Chassis Properties - Line_A');
    await page.fill('#cp-n', 'Chassis'); await page.click('#layer .df .btn.pri'); await wait(150);
    const tp = await touchPage(390, 844, () => { MTPS.App.state.prefs.emuMin = false; MTPS.App.render(); });
    await tp.tap('[data-ptab="1"]'); await tp.waitForTimeout(200);
    const ph = await tp.evaluate(() => { const b = document.querySelector('#emst-dock'); return !!b && b.offsetParent !== null && document.documentElement.scrollWidth <= innerWidth + 1 && /running/.test(b.textContent); });
    await tp.tap('#dock [data-emb="dock:File"]'); await tp.waitForTimeout(150);
    const fi = await tp.$$eval('#layer .it', t => t.map(x => x.textContent.trim()));
    check('phone (touch): the status bar shows without sideways scrolling; File holds Chassis Properties…', ph && fi[0] === 'Chassis Properties…', JSON.stringify(fi));
    await tp.close();
  }

  check('Wave 2 (E): no JS errors in the touch pages', errors.length === 0, errors.join(' | '));
};
