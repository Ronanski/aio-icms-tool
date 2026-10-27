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
    check('the emulator panel has a status bar: Ready (or the module picked), the chassis, the slots used, the controllers running', /^(Ready|Slot \d+: )/.test(await st()) && /of 8 slots used/.test(await st()) && /controller.* running/.test(await st()) , await st());
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

  console.log('RSLinx Classic: Driver Diagnostics and CIP Diagnostics (RSLinx Classic help, Communications menu)');
  {
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(150);
    await ev(() => { document.querySelector('#layer').innerHTML = ''; const A = MTPS.App; A.openProject(A.example()); const c = A.racks[0].controller(0); c.setKey('REM'); c.download(A.state.p); A.run('online'); });
    await wait(300);
    check('the project is online (a CIP connection to the controller)', await ev(() => MTPS.App.state.online));
    await ev(() => MTPS.App.run('rswho')); await wait(300);
    const menu = async (m, item) => { await page.click(`#layer [data-rlm="${m}"]`); await wait(60); await page.evaluate(t => [...document.querySelectorAll('#layer .rlpop .it')].find(x => x.textContent === t).click(), item); await wait(120); };
    const bh = () => page.$eval('#layer .rldg .bh', b => b.textContent).catch(() => '');
    const cnt = () => page.$$eval('#layer [data-rldg] .rldtab tbody tr', r => Object.fromEntries(r.map(x => [x.children[0].textContent, +x.children[1].textContent.replace(/,/g, '')])));
    await menu('Communications', 'Driver Diagnostics');
    check('Communications > Driver Diagnostics: the configured drivers to pick from', (await bh()) === 'Driver Diagnostics' && (await page.$eval('#rldl tbody', b => b.textContent)).includes('EMULATE-1'));
    await page.dblclick('#rldl [data-rldp="EMULATE-1"]'); await wait(150);
    const tabs = await page.$$eval('#layer .rldg [data-rltab]', t => t.map(x => x.textContent).join(','));
    check('a double-click opens its counters: General, Performance, Connection Event Log, Active Connections (an Ethernet driver)', (await bh()) === 'Driver Diagnostics - EMULATE-1' && tabs === 'General,Performance,Connection Event Log,Active Connections', tabs);
    let k = await cnt();
    check('General: Commands Sent and Replies Received count the browse and the online packets; one connection open', k['Commands Sent'] > 0 && k['Replies Received'] > 0 && k['Connections open'] === 1 && k['Total connections initiated'] >= 1 && 'Unsol. Received' in k && 'Commands timed out' in k, JSON.stringify(k));
    await wait(1100);
    const k2 = await cnt();
    check('the counters are live: they go up while the window is open', k2['Commands Sent'] > k['Commands Sent'], k['Commands Sent'] + ' -> ' + k2['Commands Sent']);
    await page.click('#layer [data-rltab="perf"]'); await wait(1100);
    k = await cnt();
    check('Performance: packets sent and received per second', k['Packets Sent/second'] >= 4 && k['Packets received/second'] >= 4, JSON.stringify(k));
    await page.click('#layer [data-rltab="act"]'); await wait(150);
    check('Active Connections: the open connection with its host name and bytes', /127\.0\.0\.1/.test(await page.$eval('[data-rldg] tbody', b => b.textContent)) && (await page.$$eval('[data-rldg] tbody tr td', t => +t[3].textContent.replace(/,/g, ''))) > 0);
    await ev(() => MTPS.App.racks[0].controller(0).power(false)); await wait(600);
    await page.click('#layer [data-rltab="log"]'); await wait(150);
    check('the controller turned off: the connection times out and the Connection Event Log has it (time, node, error)', (await page.$eval('[data-rldg] tbody', b => b.textContent)).includes('Connection timed out') && (await page.$$eval('[data-rldg] thead th', t => t.map(x => x.textContent).join(','))) === 'Time,Node,Error Description');
    await ev(() => MTPS.App.racks[0].controller(0).power(true)); await wait(100);
    await page.click('#layer .rldg [data-rlpx="cancel"]'); await wait(100);
    check('Close closes it', (await page.$('#layer .rldg')) === null);
    await menu('Communications', 'CIP Diagnostics');
    const ct = await page.$$eval('#layer .rldg [data-rltab]', t => t.map(x => x.textContent).join(','));
    check('Communications > CIP Diagnostics: CIP Dispatching, Messaging, Connections', (await bh()) === 'CIP Diagnostics' && ct === 'CIP Dispatching,Messaging,Connections', ct);
    k = await cnt();
    check('CIP Dispatching: the PCCC counters (none: the emulated controllers talk CIP)', '"Fast" PCCC requests via Messaging' in k && k['Connections dropped'] === 0);
    await page.click('#layer [data-rltab="msg"]'); await wait(100);
    k = await cnt();
    check('Messaging: the unconnected requests sent and completed', k['Unconnected requests sent'] > 0 && k['Unconnected requests completed'] > 0 && 'Fragmentation NAKs received' in k);
    await page.click('#layer [data-rltab="conn"]'); await wait(100);
    k = await cnt();
    check('Connections: open attempts, established, timed out receiving, packets sent and received', k['Connection open attempts'] >= 1 && k['Connections established'] >= 1 && k['Connections timed out receiving'] >= 1 && k['Packets sent'] > 0 && k['Packets received'] > 0, JSON.stringify(k));
    await page.keyboard.press('Escape'); await wait(80);
    const dn = await page.evaluate(() => { const n = [...document.querySelectorAll('#rltree [data-rln]')].find(x => x.textContent.startsWith('EMULATE-1')); const r = n.getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2 }; });
    await page.mouse.click(dn.x, dn.y, { button: 'right' }); await wait(100);
    await page.click('#layer .rlctx [data-rlci="drvdiag"]'); await wait(150);
    check('right-click a driver in RSWho: Driver Diagnostics of that driver', (await bh()) === 'Driver Diagnostics - EMULATE-1');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await wait(80);
    await ev(() => MTPS.App.run('offline'));
    const tp = await touchPage(390, 844, () => MTPS.App.run('rswho'));
    await tp.tap('#layer [data-rlm="Communications"]'); await tp.waitForTimeout(100);
    await tp.evaluate(() => { [...document.querySelectorAll('#layer .rlpop .it')].find(x => x.textContent === 'CIP Diagnostics').dataset.wapick = '1'; });
    await tp.tap('#layer [data-wapick]'); await tp.waitForTimeout(150);
    await tp.tap('#layer [data-rltab="conn"]'); await tp.waitForTimeout(100);
    check('phone (touch): CIP Diagnostics, the Connections tab, no sideways scrolling', await tp.$eval('#layer [data-rltab="conn"]', t => t.classList.contains('on')) && await tp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('.rldg').getBoundingClientRect().right <= innerWidth + 1));
    await tp.close();
  }

  console.log('RSLinx Classic: Module Statistics (RSWho right-click) and the diagnostics of Device Properties');
  {
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(150);
    await ev(() => { document.querySelector('#layer').innerHTML = ''; const A = MTPS.App; A.openProject(A.example()); const c = A.racks[0].controller(0); c.setKey('REM'); c.download(A.state.p); A.run('online'); A.run('rswho'); });
    await wait(300);
    const node = async (pg, s) => pg.evaluate(s => { const n = [...document.querySelectorAll('#rltree [data-rln]')].find(x => x.textContent.startsWith(s)); const r = n.getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2 }; }, s);
    const bh = () => page.$eval('#layer .rldg .bh', b => b.textContent).catch(() => '');
    const kvs = () => page.$$eval('#layer [data-rldg] .kv', r => Object.fromEntries(r.map(x => [x.children[0].textContent, x.children[1].textContent])));
    const cnt = () => page.$$eval('#layer [data-rldg] .rldtab tbody tr', r => Object.fromEntries(r.map(x => [x.children[0].textContent, +x.children[1].textContent.replace(/,/g, '')])));
    let p = await node(page, '00, PLC-CPU');
    await page.mouse.click(p.x, p.y, { button: 'right' }); await wait(100);
    await page.click('#layer .rlctx [data-rlci="mstat"]'); await wait(150);
    const tabs = await page.$$eval('#layer .rldg [data-rltab]', t => t.map(x => x.textContent).join(','));
    check('right-click the controller > Module Statistics: General, Connection Manager, Backplane', (await bh()).startsWith('Module Statistics - 00, PLC-CPU') && tabs === 'General,Connection Manager,Backplane', tabs);
    let k = await kvs();
    check('General: device name, vendor, product type and code, revision, serial number, faults', k['Device name'] === 'PLC-CPU Emulator' && k.Vendor === 'MT PLC Studio' && k['Product type'].startsWith('Programmable Logic Controller') && /^[0-9A-F]{8}$/.test(k['Serial number']) && k.Faults === 'None', JSON.stringify(k));
    await page.click('#layer [data-rltab="cm"]'); await wait(100);
    k = await cnt();
    check('Connection Manager: the connection of Go Online (requests received, accepted, one open)', k['Connection requests received'] >= 1 && k['Connections accepted'] >= 1 && k['Connections open'] === 1 && k['Unconnected requests received'] > 0, JSON.stringify(k));
    await wait(1200);
    const k2 = await cnt();
    check('the module is polled once a second: Unconnected requests received goes up', k2['Unconnected requests received'] > k['Unconnected requests received'], JSON.stringify([k, k2]));
    await page.click('#layer [data-rldx="lock"]'); await wait(100);
    const l1 = await cnt(); await wait(1200); const l2 = await cnt();
    check('Lock Counters holds the values shown', l1['Unconnected requests received'] === l2['Unconnected requests received'] && await page.$eval('#layer [data-rldx="lock"]', b => b.getAttribute('aria-pressed') === 'true'));
    await page.click('#layer [data-rldx="lock"]'); await page.click('#layer [data-rldx="reset"]'); await wait(100);
    k = await cnt();
    check('Reset Counters sets them back to 0', k['Connection requests received'] === 0 && k['Unconnected requests received'] <= 1, JSON.stringify(k));
    await page.click('#layer [data-rltab="bp"]'); await wait(100);
    k = await kvs(); const b = await cnt();
    check('Backplane: ControlBus Status, Slot Address, Rack Size, serial number, revision, the CRC and bus timeout counters', k['ControlBus Status'] === 'OK' && k['Slot Address'] === '0' && k['Rack Size'] === '8 slots' && b['Received Bad CRC'] === 0 && 'Transmit Retry Limit' in b, JSON.stringify(k));
    await page.keyboard.press('Escape'); await wait(80);
    await ev(() => MTPS.App.racks[0].controller(0).majorFault(4, 20, 'Test fault')); await wait(100);
    p = await node(page, '00, PLC-CPU');
    await page.mouse.click(p.x, p.y, { button: 'right' }); await wait(100);
    await page.click('#layer .rlctx [data-rlci="props"]'); await wait(100);
    const f = await page.$$eval('#layer .rlov2 .kv', r => r.map(x => x.textContent).join('|'));
    check('Device Properties shows the fault information (Major fault, type and code)', f.includes('FaultsMajor fault: Type 4, Code 20'), f);
    await page.click('#layer .rlov2 [data-rldx="mstat"]'); await wait(150);
    check('…and its Module Statistics… button opens Module Statistics', (await bh()).startsWith('Module Statistics'));
    await ev(() => MTPS.App.racks[0].controller(0).clearFault());
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await wait(80);
    await ev(() => MTPS.App.run('offline'));
    const tp = await touchPage(800, 1280, () => MTPS.App.run('rswho'));
    p = await node(tp, '01, PLC-DI16-24V');
    const cdp = await tp.context().newCDPSession(tp);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] }); await tp.waitForTimeout(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await tp.waitForTimeout(150);
    await tp.tap('#layer .rlctx [data-rlci="mstat"]'); await tp.waitForTimeout(150);
    await tp.tap('#layer [data-rltab="bp"]'); await tp.waitForTimeout(100);
    check('tablet (touch): long-press an I/O card > Module Statistics > Backplane', (await tp.$eval('#layer .rldg .bh', b => b.textContent)).startsWith('Module Statistics - 01, PLC-DI16-24V') && (await tp.$eval('#layer [data-rldg]', b => b.textContent)).includes('ControlBus Status'));
    await tp.close();
  }

  console.log('RSLinx Classic: Station Diagnostics, Data Monitor and Set Time (RSWho right-click, Station menu)');
  {
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(150);
    const dmProject = () => { const A = MTPS.App, p = A.example(); p.tags.push({ name: 'Counts', type: 'DINT', dim: 4 }, { name: 'Level', type: 'INT', value: 65 }); document.querySelector('#layer').innerHTML = ''; A.openProject(p); const c = A.racks[0].controller(0); c.setKey('REM'); c.download(A.state.p); c.setMode('remrun'); A.run('rswho'); };
    await ev(dmProject); await wait(300);
    const node = async (pg, s) => pg.evaluate(s => { const n = [...document.querySelectorAll('#rltree [data-rln]')].find(x => x.textContent.startsWith(s)); const r = n.getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2 }; }, s);
    const bh = (pg = page) => pg.$eval('#layer .rlov2 .bh', b => b.textContent).catch(() => '');
    const cnt = () => page.$$eval('#layer [data-rldg] .rldtab tbody tr', r => Object.fromEntries(r.map(x => [x.children[0].textContent, +x.children[1].textContent.replace(/,/g, '')])));
    const station = () => page.$$eval('#layer .rlpop .it', i => i.map(x => (x.classList.contains('dis') ? '-' : '+') + x.textContent).join('|'));
    let p = await node(page, '00, PLC-CPU');
    await page.mouse.click(p.x, p.y, { button: 'right' }); await wait(100);
    const its = await page.$$eval('#layer .rlctx .it', t => t.map(x => (x.classList.contains('dis') ? '-' : '+') + x.textContent).join('|'));
    check('right-click a controller: Station Diagnostics, Data Monitor and Set Time… are on', its.includes('+Station Diagnostics') && its.includes('+Data Monitor') && its.includes('+Set Time…'), its);
    await page.click('#layer .rlctx [data-rlci="stdiag"]'); await wait(150);
    check('Station Diagnostics: the counters of the station\'s driver', (await bh()) === 'Station Diagnostics - 00, PLC-CPU Emulator' && (await cnt())['Commands Sent'] > 0);
    await page.click('#layer [data-rlm="Station"]'); await wait(60);
    check('Station: Freeze and Reset Diagnostic Counters are on in a station diagnostic window, Unfreeze greyed', (await station()).startsWith('+Diagnostics|+Freeze|-Unfreeze|+Reset Diagnostic Counters'), await station());
    await page.click('#layer .rlpop [data-rlmi="frz"]'); await wait(100);
    const f1 = await cnt(); await wait(1100); const f2 = await cnt();
    check('Station > Freeze holds the counters (Frozen shows)', f1['Commands Sent'] === f2['Commands Sent'] && (await page.$eval('#layer .rldg .bf', b => b.textContent)).includes('Frozen'));
    await page.click('#layer [data-rlm="Station"]'); await wait(60); await page.click('#layer .rlpop [data-rlmi="unfrz"]'); await wait(1100);
    check('Station > Unfreeze: they count again', (await cnt())['Commands Sent'] > f2['Commands Sent']);
    await page.click('#layer [data-rlm="Station"]'); await wait(60); await page.click('#layer .rlpop [data-rlmi="rst"]'); await wait(80);
    const r = await cnt();
    check('Station > Reset Diagnostic Counters: back to 0, except the last four connection counters', r['Commands Sent'] <= 2 && r['Replies Received'] <= 2 && 'Total connections accepted' in r, JSON.stringify(r));
    await page.click('#layer .rldg [data-rlpx="cancel"]'); await wait(80);
    await page.click('#layer [data-rlm="Station"]'); await wait(60);
    check('without a station diagnostic window, Freeze / Unfreeze / Reset are greyed', (await station()).includes('-Freeze|-Unfreeze|-Reset Diagnostic Counters'));
    await page.click('#layer .rlpop [data-rlmi="dmon"]'); await wait(200);
    check('Station > Data Monitor: the data file list, File, Type, Elements, Length (bytes)', (await bh()) === 'Data Monitor - PLC-CPU Emulator' && (await page.$$eval('#rldmf thead th', t => t.map(x => x.textContent.replace(/ [▲▼]$/, '')).join(','))) === 'File,Type,Elements,Length (bytes)');
    const rows = () => page.$$eval('#rldmf tbody tr', r => r.map(x => [...x.children].map(c => c.textContent)));
    let rr = await rows();
    const cr = rr.find(x => x[0] === 'Counts');
    check('Counts is a DINT[4] file: 4 elements, 16 bytes; the list is complete', !!cr && cr[1] === 'DINT[4]' && cr[2] === '4' && cr[3] === '16' && (await page.$eval('#layer .rldms', s => s.textContent)).includes('Complete'), JSON.stringify(rr));
    await page.click('#rldmf th[data-rlsort="Length (bytes)"]'); await page.click('#rldmf th[data-rlsort="Length (bytes)"]'); await wait(100);
    rr = await rows();
    check('a click on a column heading sorts by it (twice: the other way)', rr[0][0] === 'Counts', JSON.stringify(rr.map(x => x[0])));
    await page.dblclick('#rldmf [data-rldf="Level"]'); await wait(200);
    check('a double-click opens the data table: Address, Value, Radix, Type, Access Rights', (await bh()) === 'Data Monitor - PLC-CPU Emulator - Level' && (await page.$$eval('#rldmt thead th', t => t.map(x => x.textContent).join(','))) === 'Address,Value,Radix,Type,Access Rights' && (await page.$$eval('#rldmt tbody td', t => t[1].textContent)) === '65');
    await page.selectOption('#rldmt [data-rlrx="0"]', 'Hex'); await wait(100);
    const hx = await page.$$eval('#rldmt tbody td', t => t[1].textContent);
    await page.selectOption('#rldmt [data-rlrx="0"]', 'ASCII'); await wait(100);
    const as = await page.$$eval('#rldmt tbody td', t => t[1].textContent);
    check('Radix: Hex 0041, ASCII \'.A\' (65)', hx === '0041' && as === "'.A'", hx + ' ' + as);
    await ev(() => MTPS.App.racks[0].controller(0).write('Level', 66)); await wait(1200);
    check('the value is polled while active (66 = \'.B\'); Status: active', (await page.$$eval('#rldmt tbody td', t => t[1].textContent)) === "'.B'" && (await page.$eval('#layer .rldms', s => s.textContent)).includes('Status: active'));
    await page.click('#rldmt tbody td', { button: 'right' }); await wait(100);
    const gm = await page.$$eval('#layer .rlctx .it', t => t.map(x => (x.classList.contains('dis') ? '-' : '+') + x.textContent).join('|'));
    check('right-click the grid: Properties…, Refresh, Activate (greyed while active), Deactivate', gm === '+Properties…|+Refresh|-Activate|+Deactivate', gm);
    await page.click('#layer .rlctx [data-rldx="dmoff"]'); await wait(80);
    await ev(() => MTPS.App.racks[0].controller(0).write('Level', 67)); await wait(1200);
    check('Deactivate: the values stay, Status: inactive', (await page.$$eval('#rldmt tbody td', t => t[1].textContent)) === "'.B'" && (await page.$eval('#layer .rldms', s => s.textContent)).includes('Status: inactive'));
    await page.click('#layer [data-rldx="dmref"]'); await wait(100);
    check('Refresh reads them once', (await page.$$eval('#rldmt tbody td', t => t[1].textContent)) === "'.C'");
    await page.click('#layer [data-rldx="dmprop"]'); await wait(80);
    await page.fill('#rldmr', '100'); await page.click('#layer [data-rldx="ppok"]'); await wait(80);
    check('Properties: a poll rate under 250 ms is refused', (await page.$eval('#rlerr', e => e.textContent)).includes('250 to 34560000'));
    await page.fill('#rldmr', '5000'); await page.click('#layer [data-rldx="ppok"]'); await wait(80);
    check('…5000 ms is kept (polled at 1000 ms)', (await page.$eval('#layer .rldms', s => s.textContent)).includes('Poll rate: 5000 ms'));
    await page.click('#layer .rldg [data-rlpx="cancel"]'); await wait(80);
    check('Close goes back to the data file list', !!(await page.$('#rldmf')));
    await page.click('#layer .rldg [data-rlpx="cancel"]'); await wait(80);
    p = await node(page, '00, PLC-CPU');
    await page.mouse.click(p.x, p.y, { button: 'right' }); await wait(100);
    await page.click('#layer .rlctx [data-rlci="settime"]'); await wait(150);
    check('right-click > Set Time…: the controller and workstation times, the new time', (await bh()) === 'Set Time - 00, PLC-CPU Emulator' && (await page.$eval('#layer [data-rldg]', b => b.textContent)).includes('Workstation time') && !!(await page.$('#rlstv')));
    await page.fill('#rlstv', '2030-01-02T03:04:05'); await page.click('#layer [data-rldx="stok"]'); await wait(100);
    const y = await ev(() => new Date(Date.now() + (MTPS.App.racks[0].controller(0).wallOff || 0)).getFullYear());
    check('OK sets the controller\'s clock', y === 2030 && (await page.$('#layer .rlov2')) === null);
    await page.click('#layer [data-rlm="Station"]'); await wait(60); await page.click('#layer .rlpop [data-rlmi="settime"]'); await wait(100);
    await page.click('#layer [data-rldx="stnow"]'); await page.click('#layer [data-rldx="stok"]'); await wait(100);
    check('Set to Workstation Time sets it back', Math.abs(await ev(() => MTPS.App.racks[0].controller(0).wallOff || 0)) < 5000);
    await page.keyboard.press('Escape'); await wait(80);
    const tp = await touchPage(390, 844, dmProject);
    p = await node(tp, '00, PLC-CPU');
    await tp.tap(`#rltree [data-rln]:has-text("00, PLC-CPU")`); await tp.waitForTimeout(100);
    await tp.tap('#layer [data-rlm="Station"]'); await tp.waitForTimeout(100);
    await tp.tap('#layer .rlpop [data-rlmi="dmon"]'); await tp.waitForTimeout(200);
    await tp.tap('#rldmf [data-rldf="Counts"]'); await tp.waitForTimeout(80);
    await tp.tap('#rldmf [data-rldf="Counts"]'); await tp.waitForTimeout(200);
    check('phone (touch): Station > Data Monitor, tap a file then tap it again: its data table, 4 rows, no sideways page scroll', (await tp.$$eval('#rldmt tbody tr', r => r.length)) === 4 && await tp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await tp.close();
  }

  console.log('RSLinx Classic: every menu item of the RSLinx Classic help, a note for what emulation cannot do');
  {
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(150);
    await ev(() => { document.querySelector('#layer').innerHTML = ''; MTPS.App.openProject(MTPS.App.example()); MTPS.App.run('rswho'); });
    await wait(300);
    const items = async m => { await page.click(`#layer [data-rlm="${m}"]`); await wait(60); const r = await page.$$eval('#layer .rlpop .it', i => i.map(x => x.textContent)); await page.click(`#layer [data-rlm="${m}"]`); await wait(40); return r.join('|'); };
    const want = {
      File: 'Open Project…|Select Default Project…|Compact Harmony…|Exit', Edit: 'Copy DDE/OPC Link to the Clipboard', View: 'RSWho|Event Log…|Options…',
      Communications: 'RSWho|Configure Drivers…|Configure Shortcuts…|Configure Client Application(s)…|Configure CIP Options…|Driver Diagnostics|CIP Diagnostics',
      'DDE/OPC': 'Topic Configuration…|Alias Topic Configuration…|Active Topics/Items…|Communication Events…|Optimized Packets…|Server Diagnostics…|DDE Client Diagnostics…|OPC Group Diagnostics…|Update ControlLogix Tag Info|Options…',
      Security: 'Set Security User…|Show Security Access…', Help: 'RSLinx Classic Help|Release Notes|Quick Start|About RSLinx Classic…' };
    const got = {}; for (const m of Object.keys(want)) got[m] = await items(m);
    const bad = Object.keys(want).filter(m => got[m] !== want[m]);
    check('the File, Edit, View, Communications, DDE/OPC, Security and Help menus hold the items of the RSLinx Classic help', bad.length === 0, bad.map(m => m + ': ' + got[m]).join(' / '));
    const w = await items('Window');
    check('Window: Cascade, Tile, Arrange Icons, Close All, then the open windows (RSWho - 1 ticked)', w === 'Cascade|Tile|Arrange Icons|Close All|✓1 RSWho - 1', w);
    // every item that cannot work in emulation opens a note that says so
    const na = [];
    for (const m of ['File', 'Edit', 'Communications', 'DDE/OPC', 'Security', 'Help']) {
      await page.click(`#layer [data-rlm="${m}"]`); await wait(50);
      const n = await page.$$eval('#layer .rlpop [data-rlmi^="na:"]', i => i.length);
      await page.click(`#layer [data-rlm="${m}"]`); await wait(30);
      for (let i = 0; i < n; i++) {
        await page.click(`#layer [data-rlm="${m}"]`); await wait(50);
        const l = await page.$$eval('#layer .rlpop [data-rlmi^="na:"]', (x, i) => x[i].textContent, i);
        await page.click(`#layer .rlpop [data-rlmi^="na:"] >> nth=${i}`); await wait(50);
        const t = await page.$eval('#layer .rlov2', b => b.textContent).catch(() => '');
        if (!(t.includes('not available in emulation') && t.includes(l.replace(/…$/, '')))) na.push(m + ' > ' + l);
        await page.click('#layer .rlov2 [data-rlpx]'); await wait(40);
      }
    }
    check('each item emulation cannot do (DDE/OPC, security, projects, the help files) opens its note: "… is not available in emulation"', na.length === 0, na.join(', '));
    await page.click('#layer [data-rlm="Help"]'); await wait(50); await page.click('#layer .rlpop [data-rlmi="about"]'); await wait(80);
    check('Help > About RSLinx Classic…', (await page.$eval('#layer .rlov2 .bh', b => b.textContent)) === 'About RSLinx Classic' && (await page.$eval('#layer .rlov2 .bb', b => b.textContent)).includes('RSLinx Classic'));
    await page.click('#layer .rlov2 [data-rlpx]'); await wait(50);
    await page.click('#layer [data-rlm="View"]'); await wait(50); await page.click('#layer .rlpop [data-rlmi="evlog"]'); await wait(80);
    check('View > Event Log…: the Open Event Viewer dialog with the events of the session', (await page.$eval('#layer .rlov2 .bh', b => b.textContent)) === 'Open Event Viewer' && (await page.$$eval('#layer .rlov2 thead th', t => t.map(x => x.textContent).join(','))) === 'Time,Driver,Event');
    await page.click('#layer .rlov2 [data-rlpx]'); await wait(50);
    await page.click('#layer [data-rlm="View"]'); await wait(50); await page.click('#layer .rlpop [data-rlmi="opts"]'); await wait(80);
    check('View > Options…: General and DDE/OPC tabs', (await page.$$eval('#layer .rlov2 [data-rltab]', t => t.map(x => x.textContent).join(','))) === 'General,DDE/OPC');
    await page.click('#layer .rlov2 [data-rlpx="cancel"]'); await wait(50);
    // the Window menu lists the diagnostic windows and brings one to the front
    await page.click('#layer [data-rlm="Communications"]'); await wait(50); await page.click('#layer .rlpop [data-rlmi="cipdiag"]'); await wait(100);
    let ww = await items('Window');
    check('a diagnostic window opens: the Window menu lists it, ticked', ww.endsWith('1 RSWho - 1|✓2 CIP Diagnostics'), ww);
    await page.click('#layer [data-rlm="Window"]'); await wait(50); await page.click('#layer .rlpop [data-rlmi="wsel:rw"]'); await wait(80);
    ww = await items('Window');
    check('Window > 1 RSWho - 1 brings RSWho to the front; CIP Diagnostics stays in the list', (await page.$('#layer .rldg')) === null && ww.endsWith('✓1 RSWho - 1|2 CIP Diagnostics'), ww);
    await page.click('#layer [data-rlm="Window"]'); await wait(50); await page.click('#layer .rlpop [data-rlmi="wsel:0"]'); await wait(80);
    check('Window > 2 CIP Diagnostics brings it back', (await page.$eval('#layer .rldg .bh', b => b.textContent).catch(() => '')) === 'CIP Diagnostics');
    await page.click('#layer [data-rlm="Window"]'); await wait(50); await page.click('#layer .rlpop [data-rlmi="wclose"]'); await wait(80);
    check('Window > Close All closes every child window, RSWho too', (await page.$('#layer .rldg')) === null && await page.$eval('#layer .rlchild', c => c.hidden) && (await items('Window')) === 'Cascade|Tile|Arrange Icons|Close All');
    await page.click('#layer [data-rlm="Communications"]'); await wait(50); await page.click('#layer .rlpop [data-rlmi="rswho"]'); await wait(100);
    check('Communications > RSWho opens it again', !(await page.$eval('#layer .rlchild', c => c.hidden)));
    // Remove a node that does not answer (a red X): the Virtual Backplane shows the controller turned off
    await page.click('#layer .rltb [data-rlv="drivers"]'); await wait(80);
    if (!(await ev(() => [...document.querySelectorAll('#layer [data-rlrow]')].some(r => r.textContent.includes('Virtual Chassis'))))) {
      await page.selectOption('#rldt', 'vbp'); await wait(50); await page.click('#layer [data-rladd]'); await wait(80); await page.click('#layer .rlov2 [data-rlpx="ok"]'); await wait(100);
    }
    await page.click('#layer [data-rlclose]'); await wait(80);
    await ev(() => MTPS.App.racks[0].controller(0).power(false)); await wait(1200);
    const off = await page.evaluate(() => { const n = [...document.querySelectorAll('#rltree [data-rln]')].find(x => x.textContent.startsWith('00, PLC-CPU') && x.textContent.includes('off')); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2, k: n.dataset.rln }; });
    check('Virtual Backplane: the controller turned off shows as not answering', !!off);
    if (off) {
      await page.mouse.click(off.x, off.y, { button: 'right' }); await wait(100);
      check('right-click it: Remove is on', await page.$eval('#layer .rlctx [data-rlci="remove"]', x => !x.classList.contains('dis')).catch(() => false));
      await page.click('#layer .rlctx [data-rlci="remove"]'); await wait(80);
      check('Remove asks: Are you sure you want to remove this node?', (await page.$eval('#layer .rlov2 .bb', b => b.textContent)).includes('Are you sure you want to remove this node?'));
      await page.click('#layer [data-rldx="rmok"]'); await wait(100);
      check('Yes: the node is gone from RSWho', !(await page.$(`#rltree [data-rln="${off.k}"]`)));
      await page.click('#layer [data-rlref]'); await wait(150);
      check('the next browse (Refresh) finds it again', !!(await page.$(`#rltree [data-rln="${off.k}"]`)));
    }
    await ev(() => MTPS.App.racks[0].controller(0).power(true)); await wait(1200);
    const io = await page.evaluate(() => { const n = [...document.querySelectorAll('#rltree [data-rln]')].find(x => x.textContent.startsWith('01, PLC-DI16')); const r = n.getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2 }; });
    await page.mouse.click(io.x, io.y, { button: 'right' }); await wait(100);
    check('a device that answers: Remove greyed', await page.$eval('#layer .rlctx', m => [...m.querySelectorAll('.it')].find(x => x.textContent === 'Remove').classList.contains('dis')));
    await page.click('#layer .rlctx [data-rlci="na:eds"]'); await wait(80);
    check('Upload EDS file from device: a note (the emulated modules are known already)', (await page.$eval('#layer .rlov2 .bb', b => b.textContent)).includes('nothing to upload'));
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await wait(80);
    const tp = await touchPage(390, 844, () => MTPS.App.run('rswho'));
    await tp.tap('#layer [data-rlm="DDE/OPC"]'); await tp.waitForTimeout(100);
    await tp.tap('#layer .rlpop [data-rlmi^="na:dde"] >> nth=0'); await tp.waitForTimeout(100);
    check('phone (touch): DDE/OPC > Topic Configuration… opens its note, inside the screen', (await tp.$eval('#layer .rlov2 .bb', b => b.textContent)).includes('not available in emulation') && await tp.evaluate(() => document.querySelector('#layer .rlov2 .rlbox').getBoundingClientRect().right <= innerWidth + 1));
    await tp.close();
  }

  check('Wave 2 (E): no JS errors in the touch pages', errors.length === 0, errors.join(' | '));
};
