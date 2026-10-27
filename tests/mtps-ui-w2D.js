/* MT PLC Studio UI tests, Wave 2 D: fault handling (Controller Fault Handler, Power-Up Handler, fault routine, task
   watchdog), the Connected To Go Online dialog, the Controller Properties Project tab, the Select Module Type catalog,
   electronic keying and RPI, and the L5X module and rung attributes. Mouse on the desktop, touch on the tablet and
   the phone. Called from mtps-ui.test.js. */
'use strict';
module.exports = async function w2D({ browser, page, URL, check }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const dlgTitle = (pg = page) => pg.$eval('#layer .dlg .dh b', b => b.textContent).catch(() => '');
  const dlgText = (pg = page) => pg.$eval('#layer .dlg .db', b => b.textContent).catch(() => '');
  const dlgBtns = (pg = page) => pg.$$eval('#layer .dlg .df .btn', b => b.map(x => x.textContent)).catch(() => []);
  const clickBtn = async (label, pg = page, tap = false) => { await pg.evaluate(l => { document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick); const b = [...document.querySelectorAll('#layer .dlg .df .btn')].find(x => x.textContent === l); if (b) b.dataset.wapick = '1'; }, label); if (tap) await pg.tap('#layer [data-wapick]'); else await pg.click('#layer [data-wapick]'); await pg.waitForTimeout(150); };
  const items = (pg = page) => pg.$$eval('#layer .menu .it', r => r.filter(x => !x.hidden).map(x => [(x.querySelector('span:not(.k):not(.ck)') || x).textContent, x.classList.contains('dis')]));
  async function pick(label, pg = page, tap = false) {
    const ok = await pg.evaluate(l => { document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick); const it = [...document.querySelectorAll('#layer .menu .it')].find(x => !x.hidden && x.querySelector('span:not(.k):not(.ck)') && x.querySelector('span:not(.k):not(.ck)').textContent === l); if (it) it.dataset.wapick = '1'; return !!it; }, label);
    if (!ok) return false;
    if (tap) await pg.tap('#layer [data-wapick]'); else await pg.click('#layer [data-wapick]');
    await pg.waitForTimeout(150);
    return true;
  }
  // touch: a long press on an organizer node, which the browser turns into a contextmenu event at that point
  async function hold(pg, sel) {
    await pg.tap(sel); await pg.waitForTimeout(450);
    await pg.$eval(sel, e => { const b = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 20, clientY: b.top + b.height / 2 })); });
    await pg.waitForTimeout(150);
  }
  async function fresh(pg = page, vp = { width: 1440, height: 900 }) {
    await pg.setViewportSize(vp);
    await pg.goto(URL); await pg.evaluate(() => localStorage.clear()); await pg.reload(); await pg.waitForTimeout(300);
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(80);
  }
  const open = (pg, fn) => pg.evaluate(fn).then(() => pg.waitForTimeout(150));
  // Go Online through its dialogs (Connected To Go Online > Download > Download), as a user answers them
  async function online(pg = page) {
    await pg.evaluate(() => MTPS.App.run('online'));
    for (let k = 0; k < 8 && !(await pg.evaluate(() => MTPS.App.state.online && !document.querySelector('#layer .dlg'))); k++) {
      await pg.waitForTimeout(150);
      const b = await pg.$('#layer .dlg .btn.pri'); if (b && !(await pg.$('#layer .dlg .prog'))) await b.click(); else await pg.waitForTimeout(500);
    }
    return pg.evaluate(() => MTPS.App.state.online);
  }
  const shot = (name, pg = page) => pg.screenshot({ path: `/tmp/claude-0/shots-w2/D/${name}.png` }).catch(() => {});
  const treeKeys = (pg = page) => pg.$$eval('.tree .nd', n => n.map(x => x.dataset.org));

  console.log('Wave 2 D: Controller Fault Handler (1756-PM014; v37 help, Configure a Controller Fault Handler program)');
  {
    await fresh(); await open(page, () => MTPS.App.openProject(MTPS.App.example()));
    let keys = await treeKeys();
    check('the Controller folder holds Controller Tags, Controller Fault Handler and Power-Up Handler', keys.slice(0, 4).join() === 'ctl,ctags,cfh,puh', keys.slice(0, 5).join());
    await page.click('.nd[data-org="cfh"]', { button: 'right' }); await wait(150);
    check('right-click Controller Fault Handler: New Program…', (await items()).some(([l, d]) => l === 'New Program…' && !d));
    await pick('New Program…');
    check('New Program: Name, Description, Schedule in = Controller Fault Handler', (await dlgTitle()) === 'New Program' && (await page.$eval('#np2-s', s => s.value)) === 'Controller Fault Handler' && !!(await page.$('#np2-d')));
    await shot('cfh-new-program');
    await page.fill('#np2-n', 'FaultProg'); await clickBtn('OK');
    keys = await treeKeys();
    check('the program is in the Controller Fault Handler folder, not in a task', keys.indexOf('prog:FaultProg') === keys.indexOf('cfh') + 1 && keys.indexOf('prog:FaultProg') < keys.indexOf('puh') && (await page.$('.nd[data-org^="task:Controller"]')) === null, keys.join());
    await page.click('.nd[data-org="cfh"]', { button: 'right' }); await wait(150);
    check('the handler holds one program: New Program… is off now', (await items()).some(([l, d]) => l === 'New Program…' && d));
    await page.keyboard.press('Escape'); await wait(80);
    await page.click('.nd[data-org="prog:FaultProg"]', { button: 'right' }); await wait(150);
    await pick('New Routine…'); await page.fill('#p1', 'Handler'); await clickBtn('OK');
    check('its first routine is its main routine (Assignment Main) and opens', await ev(() => { const s = MTPS.App.state, g = s.p.tasks.find(t => t.type === 'fault').programs[0]; return g.main === 'Handler' && s.prog === 'FaultProg' && s.routine === 'Handler'; }));
    await page.dblclick('.nd[data-org="ctl"]'); await wait(200);
    await page.click('#layer [data-dt="adv"]'); await wait(80);
    check('Controller Properties, Advanced: Controller Fault Handler FaultProg, Power-Up Handler <none>', /Controller Fault HandlerFaultProg/.test(await dlgText()) && /Power-Up Handler<none>/.test(await dlgText()), await dlgText());
    await shot('cfh-advanced-tab');
    await page.keyboard.press('Escape'); await wait(80);
    // the handler runs on an instruction fault: rung text set up as a user would after typing it
    await ev(() => { const p = MTPS.App.state.p; p.tags.push({ name: 'Idx', type: 'DINT', value: 9 }, { name: 'Arr', type: 'DINT', dim: 3 }, { name: 'Seen', type: 'BOOL' });
      p.tasks[0].programs[0].routines[0].rungs.push({ t: 'MOV(1,Arr[Idx]);' }); p.tasks.find(t => t.type === 'fault').programs[0].routines[0].rungs = [{ t: 'OTL(Seen);' }]; MTPS.App.render(); });
    check('Go Online with a Download', await online());
    await ev(() => MTPS.App.run('runm')); await wait(400);
    check('online in Run: the handler ran (Seen = 1) and, not cleared, the controller faulted (type 4 code 20)', await ev(() => { const c = MTPS.App.ctl; return !!c.fault && c.fault.type === 4 && c.fault.code === 20 && c.read('Seen') === 1; }));
    await page.click('.nd[data-org="cfh"]', { button: 'right' }); await wait(150);
    check('online: a second handler program is refused (New Program… off)', (await items()).some(([l, d]) => l === 'New Program…' && d));
    await page.keyboard.press('Escape'); await wait(80);
    await ev(() => { MTPS.App.ctl.clearFault(); MTPS.App.run('offline'); }); await wait(100);
  }
  console.log('Wave 2 D: Power-Up Handler (1756-PM014; v37 help, Configure a Power-Up Handler program)');
  {
    await fresh(); await open(page, () => MTPS.App.openProject(MTPS.App.example()));
    await page.click('.nd[data-org="puh"]', { button: 'right' }); await wait(150);
    await pick('New Program…'); await clickBtn('OK');
    await page.click('.nd[data-org="prog:PowerUp"]', { button: 'right' }); await wait(150);
    await pick('New Routine…'); await clickBtn('OK');
    check('Power-Up Handler program PowerUp with its main routine Routine1', await ev(() => { const g = MTPS.App.state.p.tasks.find(t => t.type === 'powerup').programs[0]; return g.name === 'PowerUp' && g.main === 'Routine1' && g.routines[0].rungs.length === 1; }));
    // a handler that does not clear the fault (a NOP rung, as typed by the user)
    await ev(() => { MTPS.App.state.p.tasks.find(t => t.type === 'powerup').programs[0].routines[0].rungs = [{ t: 'NOP();' }]; MTPS.App.render(); });
    const on = await online(); await ev(() => MTPS.App.run('runm')); await wait(300);
    check('Go Online with a Download, Run', on && await ev(() => MTPS.App.ctl.running));
    await ev(() => MTPS.App.run('chassis')); await wait(150);
    const pow = async on => { await page.evaluate(v => { const b = [...document.querySelectorAll(`[data-epow="0:0:${v}"]`)].find(x => x.offsetParent); if (b) b.dataset.wapick = '1'; }, on); await page.click('[data-wapick]'); await page.evaluate(() => document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick)); await wait(200); };
    await pow(0);
    check('the emulated controller is turned off in Run', await ev(() => !MTPS.App.racks[0].controller(0).powered));
    await pow(1);
    check('back on: the empty Power-Up Handler leaves major fault type 1 code 1 (power up in Run mode)', await ev(() => { const c = MTPS.App.ctl; return c.powered && !!c.fault && c.fault.type === 1 && c.fault.code === 1; }));
    await page.keyboard.press('Escape'); await wait(100);
    check('Go Online again: the same project, online at once', await online());
    await ev(() => MTPS.App.run('gofaults')); await wait(200);
    check('Go To Faults: Controller Properties, Major Faults shows Type 1, Code 1', (await dlgTitle()).startsWith('Controller Properties') && /Type 1, Code 1/.test(await dlgText()));
    await shot('puh-major-fault');
    await page.keyboard.press('Escape'); await wait(80);
    await ev(() => { MTPS.App.ctl.clearFault(); MTPS.App.run('offline'); }); await wait(100);
  }
  console.log('Wave 2 D: fault routine of a program (1756-PM014; v37 help, Configure a fault routine)');
  {
    await fresh(); await open(page, () => MTPS.App.openProject(MTPS.App.example()));
    await page.click('.nd[data-org="prog:MainProgram"]', { button: 'right' }); await wait(150);
    await pick('New Routine…');
    check('New Routine: Name, Description, Type, In Program, Assignment (<none> / Main / Fault)', (await dlgTitle()) === 'New Routine' && (await page.$$eval('#nr-a option', o => o.map(x => x.textContent).join('|'))) === '<none>|Main|Fault' && (await page.$eval('#nr-a', s => s.value)) === '');
    await page.fill('#p1', 'Fault_Routine'); await page.selectOption('#nr-a', 'fault');
    await shot('fault-routine-new-routine');
    await clickBtn('OK');
    check('Assignment Fault: the routine is the program\'s fault routine', await ev(() => MTPS.App.state.p.tasks[0].programs[0].fault === 'Fault_Routine'));
    await page.dblclick('.nd[data-org="prog:MainProgram"]'); await wait(200);
    await page.click('#layer [data-dt="cfg"]'); await wait(80);
    check('Program Properties > Configuration: Fault = Fault_Routine', (await page.$eval('#pp-f', s => s.value)) === 'Fault_Routine');
    await page.keyboard.press('Escape'); await wait(80);
    await ev(() => { const p = MTPS.App.state.p; p.tags.push({ name: 'Idx', type: 'DINT', value: 9 }, { name: 'Arr', type: 'DINT', dim: 3 }, { name: 'FR', type: 'DINT' });
      const g = p.tasks[0].programs[0]; g.routines[0].rungs.push({ t: 'MOV(1,Arr[Idx]);' }); g.routines.find(r => r.name === 'Fault_Routine').rungs = [{ t: 'ADD(FR,1,FR);' }]; MTPS.App.render(); });
    const on = await online(); await ev(() => MTPS.App.run('runm')); await wait(300);
    check('online in Run: the array fault runs the fault routine (FR = 1), not cleared: faulted type 4 code 20', on && await ev(() => { const c = MTPS.App.ctl; return c.read('FR') === 1 && !!c.fault && c.fault.type === 4 && c.fault.code === 20; }));
    await ev(() => { MTPS.App.ctl.clearFault(); MTPS.App.run('offline'); }); await wait(100);
    // phone, touch: the Project tab, hold the program, New Routine with Assignment Fault
    const tp = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await fresh(tp, { width: 390, height: 844 }); await open(tp, () => MTPS.App.openProject(MTPS.App.example()));
    await tp.tap('.pnav [data-go="project"]'); await tp.waitForTimeout(300);
    await hold(tp, '.nd[data-org="prog:MainProgram"]');
    await pick('New Routine…', tp, true);
    await tp.fill('#p1', 'FR2'); await tp.selectOption('#nr-a', 'fault'); await clickBtn('OK', tp, true);
    check('phone (touch): New Routine with Assignment Fault', await tp.evaluate(() => MTPS.App.state.p.tasks[0].programs[0].fault === 'FR2'));
    await tp.close();
  }
  console.log('Wave 2 D: task watchdog (1756-PM005: 1 to 2,000,000 ms, default 500; major fault type 6 code 1)');
  {
    await fresh(); await open(page, () => MTPS.App.openProject(MTPS.App.example()));
    await page.dblclick('.nd[data-org="task:MainTask"]'); await wait(200);
    await page.click('#layer [data-dt="cfg"]'); await wait(80);
    check('Task Properties > Configuration: Watchdog 500 ms by default, 1 to 2,000,000', (await page.$eval('#tp-w', i => [i.value, i.min, i.max].join())) === '500,1,2000000');
    await page.fill('#tp-w', '40'); await clickBtn('OK');
    check('the watchdog is saved with the task', await ev(() => MTPS.App.state.p.tasks[0].watchdog === 40));
    await ev(() => { const p = MTPS.App.state.p; p.tags.push({ name: 'N', type: 'DINT' }); p.tasks[0].programs[0].routines[0].rungs.push({ t: 'LBL(Again)ADD(N,1,N);' }, { t: 'JMP(Again);' }); MTPS.App.render(); });
    const on = await online(); await ev(() => MTPS.App.run('runm')); await wait(400);
    check('online in Run, an endless loop: after 40 ms the watchdog faults the controller (type 6 code 1)', on && await ev(() => { const c = MTPS.App.ctl; return !!c.fault && c.fault.type === 6 && c.fault.code === 1 && /40 ms/.test(c.fault.text); }));
    await ev(() => MTPS.App.run('gofaults')); await wait(200);
    check('Major Faults: Type 6, Code 1, Task watchdog expired', /Type 6, Code 1/.test(await dlgText()) && /Task watchdog expired/.test(await dlgText()));
    await shot('watchdog-major-fault');
    await page.keyboard.press('Escape'); await wait(80);
    await ev(() => { MTPS.App.ctl.clearFault(); MTPS.App.run('offline'); }); await wait(100);
    // tablet, touch: the drawer, hold MainTask, Properties
    const tp = await browser.newPage({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true });
    await fresh(tp, { width: 800, height: 1280 }); await open(tp, () => MTPS.App.openProject(MTPS.App.example()));
    await tp.tap('[data-drawer="1"]'); await tp.waitForTimeout(300);
    await hold(tp, '.nd[data-org="task:MainTask"]'); await pick('Properties…', tp, true);
    await tp.tap('#layer [data-dt="cfg"]'); await tp.waitForTimeout(80);
    await tp.fill('#tp-w', '250'); await clickBtn('OK', tp, true);
    check('tablet (touch): Task Properties sets the watchdog', await tp.evaluate(() => MTPS.App.state.p.tasks[0].watchdog === 250));
    await tp.close();
  }
  console.log('Wave 2 D: Connected To Go Online (v37 help: Options tab; Correlate a project with a controller)');
  {
    await fresh(); await open(page, () => MTPS.App.openProject(MTPS.App.example()));
    const goOnline = async () => { await ev(() => MTPS.App.run('online')); await page.waitForFunction(() => { const b = document.querySelector('#layer .dlg .dh b'); return MTPS.App.state.online || (b && b.textContent === 'Connected To Go Online'); }, null, { timeout: 4000 }).catch(() => {}); await wait(100); };
    const cond = () => page.$eval('#layer .corr-cond', e => e.textContent).catch(() => '');
    const through = async (pg = page, tap = false) => { for (let k = 0; k < 6 && !(await pg.evaluate(() => MTPS.App.state.online)); k++) { const b2 = await pg.$('#layer .dlg .btn.pri'); if (b2) { if (tap) await b2.tap(); else await b2.click(); } await pg.waitForTimeout(300); } };
    await goOnline();
    check('an empty controller: "There is no project loaded in the controller.", Controller Name <no name>, no Upload', (await cond()) === 'There is no project loaded in the controller.' && /Controller Name<no name>/.test(await dlgText()) && !(await dlgBtns()).includes('Upload…'));
    const t0 = await dlgText();
    check('Connected Controller (Name, Type, Comm Path, Serial Number, Security) and Offline Project (Name, Type, File, Revision)', ['Connected Controller', 'Controller TypePLC-CPU', 'Comm Path', 'Serial Number', 'SecurityNo Protection', 'Offline Project', 'File', 'Revision1.0'].every(x => t0.includes(x)), t0);
    await shot('correlate-empty');
    await clickBtn('Download…'); await through();
    check('Download: online', await ev(() => MTPS.App.state.online));
    await ev(() => MTPS.App.run('offline')); await wait(100);
    await ev(() => MTPS.App.run('rung')); await wait(100);
    await goOnline();
    check('offline changes: "Offline changes have been made to the open project."', (await cond()) === 'Offline changes have been made to the open project.' && (await dlgBtns()).join('|') === 'Cancel|Select File…|Upload…|Download…', await cond());
    await shot('correlate-offline-changes');
    await page.keyboard.press('Escape'); await wait(100);
    await ev(() => { MTPS.App.state.dirty = false; });
    await goOnline();
    check('another copy of the project (no unsaved changes): "You need to upload or download in order to go online using the open project."', (await cond()) === 'You need to upload or download in order to go online using the open project.', await cond());
    await clickBtn('Upload…'); await wait(150); await through();
    check("Upload: the controller's project opens here and goes online", await ev(() => MTPS.App.state.online && MTPS.App.state.p.controller.name === 'Motor_Demo'));
    await page.keyboard.press('Escape'); await wait(100);
    await ev(() => MTPS.App.run('offline')); await wait(100);
    await open(page, () => MTPS.App.openProject(MTPS.App.blank('Other_Line')));
    await goOnline();
    check('another project: "The open project doesn\'t match the project in the controller."', (await cond()) === "The open project doesn't match the project in the controller." && /Controller NameMotor_Demo/.test(await dlgText()) && /Controller NameOther_Line/.test(await dlgText()), await cond());
    await page.keyboard.press('Escape'); await wait(100);
    // phone, touch: the dialog fits and Download is tapped
    const tp = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await fresh(tp, { width: 390, height: 844 }); await open(tp, () => MTPS.App.openProject(MTPS.App.example()));
    await tp.evaluate(() => MTPS.App.run('online')); await tp.waitForFunction(() => document.querySelector('#layer .corr-cond'), null, { timeout: 4000 }).catch(() => {});
    check('phone (touch): Connected To Go Online shows the condition, no sideways scroll', (await tp.$eval('#layer .corr-cond', e => e.textContent).catch(() => '')) === 'There is no project loaded in the controller.' && await tp.evaluate(() => document.querySelector('#layer .dlg').scrollWidth <= innerWidth + 1));
    await shot('correlate-phone', tp);
    await clickBtn('Download…', tp, true); await through(tp, true);
    check('phone (touch): Download goes online', await tp.evaluate(() => MTPS.App.state.online));
    await tp.close();
  }
  console.log('Wave 2 D: Controller Properties > Project tab (v37 help: Name, Path, Created, Edited, Download Project Documentation)');
  {
    await fresh(); await open(page, () => MTPS.App.openProject(MTPS.App.example()));
    const projTab = async () => { await page.dblclick('.nd[data-org="ctl"]'); await wait(200); await page.click('#layer [data-dt="proj"]'); await wait(80); return page.$eval('#layer [data-pane="proj"]', e => e.textContent); };
    check('the tabs: General, Major Faults, Minor Faults, Date/Time, Advanced, Project, Memory', (await (async () => { await page.dblclick('.nd[data-org="ctl"]'); await wait(200); return page.$$eval('#layer [data-dt]', t => t.map(x => x.textContent.trim()).join('|')); })()) === 'General|Major Faults|Minor Faults|Date/Time|Advanced|Project|Memory');
    await page.keyboard.press('Escape'); await wait(80);
    let t = await projTab();
    check('not saved yet: Name (not saved yet), Created set, Edited -', /Name\(not saved yet\)/.test(t) && /Created\d/.test(t) && /Edited-/.test(t), t);
    check('Download Project Documentation and Extended Properties: checked by default', await page.$eval('#cp-docs', c => c.checked && !c.disabled));
    await page.keyboard.press('Escape'); await wait(80);
    await ev(() => MTPS.App.run('saveas')); await page.waitForFunction(() => document.querySelector('#layer #fbn'), null, { timeout: 3000 }).catch(() => {});
    await page.fill('#fbn', 'WA_Proj'); await clickBtn('Save'); await wait(300);
    t = await projTab();
    check('after Save As: Name WA_Proj.mtp, its folder as Path, Edited = the save time', /NameWA_Proj\.mtp/.test(t) && /Path\//.test(t) && /Edited\d/.test(t), t);
    await shot('project-tab');
    await page.click('#cp-docs'); await clickBtn('OK');
    check('cleared and OK: the project keeps the setting', await ev(() => MTPS.App.state.p.noDocs === true));
    check('Go Online with a Download', await online());
    check('the controller holds no documentation: an upload has no rung comments or tag descriptions', await ev(() => { const u = MTPS.App.ctl.upload(); return !u.tasks[0].programs[0].routines[0].rungs.some(r => r.c) && !u.tags.some(x => x.desc); }));
    check('documentation alone does not stop going online (still correlated)', await ev(() => MTPS.App.ctl.holds(MTPS.App.state.p)));
    t = await projTab();
    check('online: the check box shows the controller\'s setting and is off', await page.$eval('#cp-docs', c => !c.checked && c.disabled));
    await page.keyboard.press('Escape'); await wait(80);
    await ev(() => MTPS.App.run('offline')); await wait(100);
    // tablet, touch
    const tp = await browser.newPage({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true });
    await fresh(tp, { width: 800, height: 1280 }); await open(tp, () => MTPS.App.openProject(MTPS.App.example()));
    await tp.evaluate(() => MTPS.App.run('ctlprops')); await tp.waitForTimeout(200);
    await tp.tap('#layer [data-dt="proj"]'); await tp.waitForTimeout(100);
    check('tablet (touch): the Project tab opens', (await tp.$eval('#layer [data-pane="proj"]', e => !e.hidden && /Created/.test(e.textContent)).catch(() => false)));
    await tp.close();
  }
  console.log('Wave 2 D: Select Module Type (v37 help: Catalog tab, Search, Filters, Close on Create; Create opens New Module)');
  {
    await fresh(); await open(page, () => { const p = MTPS.App.blank('Mods'); p.rack.modules = []; MTPS.App.openProject(p); });
    await shot('select-module-type-before');
    await page.click('.nd[data-org="io"]', { button: 'right' }).catch(() => {}); await wait(100);
    await pick('New Module…'); await wait(150);
    check('I/O Configuration > New Module… opens Select Module Type', (await dlgTitle()) === 'Select Module Type', await dlgTitle());
    const rows = () => page.$$eval('#layer tr[data-smt]', r => r.map(x => x.dataset.smt));
    const found = () => page.$eval('#smt-n', e => e.textContent);
    check('Catalog Results: Catalog Number, Description, Vendor, Category', (await page.$$eval('#layer [data-smtsort]', t => t.map(x => x.textContent.replace(/ [▲▼]$/, '')).join('|'))) === 'Catalog Number|Description|Vendor|Category');
    check('all 7 module types (6 cards and the PLC-CPU controller), "7 of 7 Module Types Found"', (await rows()).length === 7 && (await found()) === '7 of 7 Module Types Found', await found());
    await shot('select-module-type');
    await page.click('#smt-q'); await page.keyboard.type('outp');
    check('incremental search "outp": the 3 output modules', (await rows()).join() === 'PLC-AO4,PLC-DO16-24V,PLC-DO16-RLY' && (await found()) === '3 of 7 Module Types Found', (await rows()).join());
    await page.fill('#smt-q', ''); await page.keyboard.type('16*dc');
    check('wildcard "16*dc": 16 DC inputs and outputs', (await rows()).join() === 'PLC-DI16-24V,PLC-DO16-24V', (await rows()).join());
    check('the search leaves out the Category column ("digital" finds nothing)', await (async () => { await page.fill('#smt-q', 'digital'); await page.dispatchEvent('#smt-q', 'input'); return (await rows()).length === 0; })());
    await page.fill('#smt-q', 'analog'); await page.dispatchEvent('#smt-q', 'input');
    check('search "analog": the Digital category is grayed out', await page.$eval('#layer [data-smtcat="Digital"]', c => c.closest('label').classList.contains('muted')) && !(await page.$eval('#layer [data-smtcat="Analog"]', c => c.closest('label').classList.contains('muted'))));
    await page.click('#smt-clr'); await wait(50);
    check('Clear Filter: the search and the filters are back to the start', (await page.$eval('#smt-q', e => e.value)) === '' && (await rows()).length === 7);
    await page.click('#layer [data-smtcat="Digital"]'); await wait(50);
    check('Category filter: Digital cleared leaves the 2 analog modules and the controller', (await rows()).join() === 'PLC-AI4,PLC-AO4,PLC-CPU' && (await found()) === '3 of 7 Module Types Found');
    check('All is cleared when one category is cleared', !(await page.$eval('#layer [data-smtall="cat"]', c => c.checked)));
    await page.click('#layer [data-smtall="cat"]'); await wait(50);
    check('All checked: every module type again', (await rows()).length === 7);
    await page.click('#layer [data-smtall="cat"]'); await wait(50);
    check('All cleared: the list is empty', (await rows()).length === 0 && (await found()) === '0 of 7 Module Types Found');
    await page.click('#layer [data-smtall="cat"]'); await wait(50);
    await page.click('#layer [data-smtvend="MT PLC Studio"]'); await wait(50);
    check('Vendor filter cleared: none', (await rows()).length === 0);
    await page.click('#layer [data-smtvend="MT PLC Studio"]'); await wait(50);
    await page.click('#layer [data-smtsort="0"]'); await wait(50);
    check('a click on Catalog Number sorts it descending (▼), again ascending', (await rows())[0] === 'PLC-DO16-RLY' && /▼/.test(await page.$eval('#layer [data-smtsort="0"]', e => e.textContent)) && await (async () => { await page.click('#layer [data-smtsort="0"]'); await wait(50); return (await rows())[0] === 'PLC-AI4'; })());
    await page.click('#smt-sh'); await wait(50);
    check('Hide Filters hides both filter lists; Show Filters brings them back', await page.$eval('#layer .smt-f', e => e.hidden) && (await page.$eval('#smt-sh', e => e.textContent)).startsWith('Show Filters') && await (async () => { await page.click('#smt-sh'); await wait(50); return page.$eval('#layer .smt-f', e => !e.hidden); })());
    await page.click('#layer tr[data-smt="PLC-DI16-24V"]'); await page.click('#smt-fav'); await wait(50);
    await page.click('#layer [data-smttab="fav"]'); await wait(50);
    check('Add to Favorites: the Favorites tab lists PLC-DI16-24V', (await rows()).join() === 'PLC-DI16-24V');
    await page.click('#layer [data-smttab="cat"]'); await wait(50);
    // Close on Create cleared: Select Module Type stays (comes back after New Module)
    await page.click('#smt-close');
    await page.dblclick('#layer tr[data-smt="PLC-DO16-24V"]'); await wait(150);
    check('double-click a module type: New Module with Type, Vendor, Parent, Name, Description, Slot', (await dlgTitle()) === 'New Module' && await (async () => { const t = await dlgText(); return ['TypePLC-DO16-24V', 'VendorMT PLC Studio', 'ParentLocal', 'Name', 'Description', 'Slot', 'Open Module Properties'].every(x => t.includes(x)); })(), await dlgText());
    await shot('new-module');
    await page.fill('#mn2', 'Valve_Out'); await page.fill('#nm-d', 'valves'); await page.selectOption('#ms', '3'); await clickBtn('OK'); await wait(150);
    check('OK: module added (slot 3, description kept)', await ev(() => { const m = MTPS.App.state.p.rack.modules.find(x => x.slot === 3); return m && m.name === 'Valve_Out' && m.type === 'PLC-DO16-24V' && m.desc === 'valves'; }));
    check('Close on Create cleared: Select Module Type is back', (await dlgTitle()) === 'Select Module Type');
    await page.click('#smt-close'); await page.click('#layer tr[data-smt="PLC-AI4"]'); await clickBtn('Create'); await wait(150);
    await page.fill('#mn2', 'Valve_Out'); await clickBtn('OK'); await wait(80);
    check('a name already used is refused', /exists/.test(await page.$eval('#me', e => e.textContent)));
    await page.fill('#mn2', 'Temps'); await page.click('#nm-op'); await clickBtn('OK'); await wait(200);
    check('Close on Create checked and Open Module Properties: Module Properties opens, not Select Module Type', /^Module Properties - \[\d\] PLC-AI4/.test(await dlgTitle()), await dlgTitle());
    await page.keyboard.press('Escape'); await wait(80);
    // phone, touch
    const tp = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await fresh(tp, { width: 390, height: 844 }); await open(tp, () => { const p = MTPS.App.blank('Mods'); p.rack.modules = []; MTPS.App.openProject(p); });
    await tp.evaluate(() => MTPS.App.run('newmod')); await tp.waitForTimeout(200);
    await tp.tap('#smt-q'); await tp.keyboard.type('relay'); await tp.waitForTimeout(80);
    check('phone (touch): search "relay" finds PLC-DO16-RLY, no sideways page scroll', (await tp.$$eval('#layer tr[data-smt]', r => r.map(x => x.dataset.smt).join())) === 'PLC-DO16-RLY' && await tp.evaluate(() => document.querySelector('#layer .dlg').scrollWidth <= innerWidth + 1));
    await shot('select-module-type-phone', tp);
    await tp.tap('#layer tr[data-smt="PLC-DO16-RLY"]'); await clickBtn('Create', tp, true); await tp.waitForTimeout(150);
    await clickBtn('OK', tp, true); await tp.waitForTimeout(150);
    check('phone (touch): Create, OK adds the relay module', await tp.evaluate(() => MTPS.App.state.p.rack.modules.some(m => m.type === 'PLC-DO16-RLY')));
    await tp.close();
  }
  console.log('Wave 2 D: Electronic Keying, Revision and RPI (help: Module Properties - General for 1756, Connection tab; Module Faults)');
  {
    await fresh(); await open(page, () => MTPS.App.openProject(MTPS.App.example()));
    const slot = await ev(() => MTPS.App.state.p.rack.modules.find(m => m.type === 'PLC-DI16-24V').slot);
    await page.click(`.nd[data-org="mod:${slot}"]`); await wait(200);
    const t = await dlgTitle() + ' ' + await dlgText();
    check('Module Properties General: Revision 1 . 1 and Electronic Keying Compatible Module (Exact Match, Compatible Module, Disable Keying)', (await page.$eval('#mk-M', e => e.value)) === '1' && (await page.$eval('#mk-m', e => e.value)) === '1' && (await page.$eval('#mk-k', e => e.value)) === 'compat' && (await page.$$eval('#mk-k option', o => o.map(x => x.textContent).join('|'))) === 'Exact Match|Compatible Module|Disable Keying', t.slice(0, 300));
    await page.selectOption('#mk-k', 'off'); await wait(50);
    check('Disable Keying shows the ATTENTION text', await page.$eval('#mk-h', e => !e.hidden && /extremely cautious/.test(e.textContent)));
    await shot('keying-general');
    await page.selectOption('#mk-k', 'exact'); await page.fill('#mk-m', '2');
    await page.click('#layer [data-dt="con"]'); await wait(60);
    check('Connection tab: RPI with its limits "(0.2 - 750.0 ms)"', /\(0\.2 - 750\.0 ms\)/.test(await page.$eval('#layer [data-pane="con"]', e => e.textContent)));
    await shot('rpi-connection');
    await page.fill('#mp-r', '0.1'); await clickBtn('OK');
    check('RPI 0.1 ms refused, the dialog stays', (await dlgTitle()).startsWith('Module Properties'));
    await page.fill('#mp-r', '0.5'); await clickBtn('OK'); await wait(100);
    check('OK: Exact Match, revision 1.2, RPI 0.5 ms saved', await ev(s => { const m = MTPS.App.state.p.rack.modules.find(x => x.slot === s); return m.key === 'exact' && m.rev === '1.2' && m.rpi === 0.5; }, slot));
    check('Go Online with a Download', await online());
    await ev(() => MTPS.App.run('runm')); await wait(150); { const b = await page.$('#layer .dlg .btn.pri'); if (b) { await b.click(); await wait(150); } }
    await wait(200);
    check('the card is 1.1, the module wants Exact Match 1.2: 16#0116 Major and/or Minor revision invalid', await ev(s => MTPS.App.ctl.moduleStatus(s).code === '16#0116', slot));
    await page.click(`.nd[data-org="mod:${slot}"]`); await wait(200);
    check('Module Properties online: the Connection tab shows the fault code and text', /16#0116.*Electronic Keying Mismatch: Major and\/or Minor revision/.test(await page.$eval('#layer [data-pane="con"]', e => e.textContent)));
    await shot('keying-fault');
    await page.keyboard.press('Escape'); await wait(80);
    // the emulator card: Revision 1.2 makes it match
    await ev(() => MTPS.App.run('chassis')); await wait(200);
    await page.click(`#emubody [data-esel="m:0:${slot}"] .mname`); await wait(150);
    check('the emulator I/O card: Revision 1.1 (on), 1.2, 2.1', (await page.$$eval(`#emubody [data-erev^="0:${slot}:"]`, x => x.map(e => e.textContent + (e.classList.contains('on') ? '*' : '')).join('|'))) === '1.1*|1.2|2.1');
    await page.click(`#emubody [data-erev="0:${slot}:1.2"]`); await wait(200);
    await shot('emulator-card-revision');
    await page.keyboard.press('Escape'); await wait(80);
    check('the card revision set to 1.2 in the emulator: Running', await ev(s => MTPS.App.ctl.moduleStatus(s).state === 'Running', slot));
    await ev(() => MTPS.App.run('offline')); await wait(100);
    // tablet, touch: New Module with Disable Keying
    const tp = await browser.newPage({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true });
    await fresh(tp, { width: 800, height: 1280 }); await open(tp, () => { const p = MTPS.App.blank('Keys'); p.rack.modules = []; MTPS.App.openProject(p); });
    await tp.evaluate(() => MTPS.App.run('newmod')); await tp.waitForTimeout(200);
    await tp.tap('#layer tr[data-smt="PLC-AI4"]'); await clickBtn('Create', tp, true); await tp.waitForTimeout(150);
    check('tablet (touch): New Module has Revision and Electronic Keying', !!(await tp.$('#mk-M')) && !!(await tp.$('#mk-k')));
    await tp.selectOption('#mk-k', 'off'); await tp.fill('#mk-m', '3'); await clickBtn('OK', tp, true); await tp.waitForTimeout(150);
    check('tablet (touch): the module keeps Disable Keying and revision 1.3', await tp.evaluate(() => { const m = MTPS.App.state.p.rack.modules.find(x => x.type === 'PLC-AI4'); return m && m.key === 'off' && m.rev === '1.3'; }));
    await tp.close();
  }
  console.log('Wave 2 D: L5X module, connection, handler and rung zone attributes (1756-RM014D)');
  {
    await fresh(); await open(page, () => MTPS.App.openProject(MTPS.App.example()));
    const r = await ev(() => {
      const A = MTPS.App, p = JSON.parse(JSON.stringify(A.state.p));
      const m = p.rack.modules.find(x => x.type === 'PLC-DI16-24V'); Object.assign(m, { key: 'exact', rev: '1.4', rpi: 0.5, inhibit: true, majorOnFail: true, desc: 'Inputs' });
      p.tasks[0].watchdog = 250;
      const g = p.tasks[0].programs[0]; g.routines.push({ name: 'Fault', rungs: [{ t: 'NOP();' }] }); g.fault = 'Fault';
      p.tasks.push({ name: 'Controller Fault Handler', type: 'fault', programs: [{ name: 'FH', tags: [], routines: [{ name: 'Main', rungs: [{ t: 'NOP();' }] }], main: 'Main' }] });
      p.tasks.push({ name: 'Power-Up Handler', type: 'powerup', programs: [{ name: 'PU', tags: [], routines: [{ name: 'Main', rungs: [{ t: 'NOP();' }] }], main: 'Main' }] });
      const rs = g.routines[0].rungs; rs.splice(0, 0, { t: 'NOP();', z: 'i' }, { t: 'NOP();', z: 'r' }, { t: 'NOP();', z: 'i' }, { t: 'NOP();', z: 'I' }, { t: 'NOP();', z: 'R' }, { t: 'NOP();', z: 'I' }, { t: 'NOP();', z: 'D' });
      const x = A.toL5X(p), q = A.fromL5X(x);
      return { x, q, types: [...x.matchAll(/<Rung Number="\d+" Type="([^"]+)"/g)].slice(0, 8).map(y => y[1]).join(' '), slot: m.slot };
    });
    const mod = (r.x.match(new RegExp(`<Module Name="DI_1"[^]*?</Module>`)) || [''])[0];
    check('Module: CatalogNumber, Vendor, ProductType 7, ProductCode, Major 1, Minor 4, ParentModule, ParentModPortId, Inhibited, MajorFault', /CatalogNumber="1756-IB16" Vendor="1" ProductType="7" ProductCode="\d+" Major="1" Minor="4" ParentModule="Local" ParentModPortId="1" Inhibited="true" MajorFault="true"/.test(mod), mod.slice(0, 300));
    check('Module: Description, <EKey State="ExactMatch"/>, Port Id 1 Address = slot Type ICP Upstream', mod.includes('<Description><![CDATA[Inputs]]></Description><EKey State="ExactMatch"/>') && mod.includes(`<Port Id="1" Address="${r.slot}" Type="ICP" Upstream="true"/>`));
    check('Connection: RPI in microseconds (500), Type Input', /<Communications><Connections><Connection Name="Input" RPI="500" Type="Input" EventID="0"\/><\/Connections><\/Communications>/.test(mod));
    check('an output module: a Connection of Type Output, RPI 20000', /<Module Name="DO_1"[^]*?<Connection Name="Output" RPI="20000" Type="Output"/.test(r.x));
    check('the controller (Local): ProductType 14, EKey', /<Module Name="Local" CatalogNumber="1756-L85E" Vendor="1" ProductType="14"[^>]*><EKey State="CompatibleModule"\/>/.test(r.x));
    check('Controller MajorFaultProgram="FH" PowerLossProgram="PU"', /<Controller [^>]*MajorFaultProgram="FH" PowerLossProgram="PU">/.test(r.x));
    check('Program FaultRoutineName="Fault"; Task Watchdog="250"; the handler programs are not scheduled in a task', /<Program Name="MainProgram"[^>]* MainRoutineName="MainRoutine" FaultRoutineName="Fault"[^>]*>/.test(r.x) && /<Task Name="MainTask" Type="CONTINUOUS" Watchdog="250"[^>]*>/.test(r.x) && !/<ScheduledProgram Name="(FH|PU)"/.test(r.x) && /<Program Name="FH"/.test(r.x));
    check('Rung Type: er rN e IR R I D N (pending replace, pending insert, accepted replace and insert, delete, normal)', r.types === 'er rN e IR R I D N', r.types);
    const qm = r.q.rack.modules.find(m => m.slot === r.slot);
    check('import: keying, revision, RPI, inhibit, major fault and description come back', qm && qm.type === 'PLC-DI16-24V' && qm.key === 'exact' && qm.rev === '1.4' && qm.rpi === 0.5 && qm.inhibit && qm.majorOnFail && qm.desc === 'Inputs', JSON.stringify(qm));
    check('import: the exact catalog numbers map back (1756-OW16I is the relay card)', await ev(() => { const p = MTPS.App.blank('X'); p.rack.modules = [{ slot: 1, type: 'PLC-DO16-RLY', name: 'R1' }, { slot: 3, type: 'PLC-DI16-120V', name: 'A1' }]; const q = MTPS.App.fromL5X(MTPS.App.toL5X(p)); return q.rack.modules.map(m => m.type).join() === 'PLC-DO16-RLY,PLC-DI16-120V'; }));
    check('import: the handler programs go to the Controller Fault Handler and Power-Up Handler, the fault routine and watchdog back', r.q.tasks.length === 3 && r.q.tasks[0].programs.length === 1 && r.q.tasks[0].watchdog === 250 && r.q.tasks[0].programs[0].fault === 'Fault' && r.q.tasks[1].type === 'fault' && r.q.tasks[1].programs[0].name === 'FH' && r.q.tasks[2].type === 'powerup' && r.q.tasks[2].programs[0].name === 'PU', JSON.stringify(r.q.tasks.map(t => [t.name, t.type, t.programs.map(g => g.name)])));
    check('import: the rung zones come back (i r i I R I D)', r.q.tasks[0].programs[0].routines[0].rungs.slice(0, 7).map(u => u.z || '').join(' ') === 'i r i I R I D');
    check('import of Studio 5000 zone types: d is D, rI and rR are r', await ev(() => { const x = MTPS.App.toL5X(MTPS.App.example()).replace(/(<Rung Number="0" Type=")N/, '$1d').replace(/(<Rung Number="1" Type=")N/, '$1rI').replace(/(<Rung Number="2" Type=")N/, '$1rR'); return MTPS.App.fromL5X(x).tasks[0].programs[0].routines[0].rungs.slice(0, 3).map(u => u.z).join() === 'D,r,r'; }));
    // the imported project opens: the handlers show in the organizer (phone, touch)
    const tp = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await fresh(tp, { width: 390, height: 844 });
    await tp.evaluate(x => MTPS.App.openProject(MTPS.App.fromL5X(x)), r.x); await tp.waitForTimeout(300);
    check('phone: the imported L5X opens with FH and PU in their handler folders, 0 Verify errors', await tp.evaluate(() => { const A = MTPS.App, t = A.state.p.tasks; return t.some(k => k.type === 'fault' && k.programs[0].name === 'FH') && t.some(k => k.type === 'powerup' && k.programs[0].name === 'PU') && MTPS.verify(A.state.p).errors.length === 0; }));
    await tp.close();
  }
  {
    // tablet portrait (the organizer is a drawer) and phone (Project tab), touch: hold the folder, New Program
    for (const [n, vp] of [['tablet', { width: 800, height: 1280 }], ['phone', { width: 390, height: 844 }]]) {
      const tp = await browser.newPage({ viewport: vp, hasTouch: true, isMobile: true });
      await fresh(tp, vp); await open(tp, () => MTPS.App.openProject(MTPS.App.example()));
      if (n === 'tablet') await tp.tap('[data-drawer="1"]'); else await tp.tap('.pnav [data-go="project"]');
      await tp.waitForTimeout(300);
      await hold(tp, '.nd[data-org="puh"]');
      check(`${n} (touch): hold Power-Up Handler, New Program…`, await pick('New Program…', tp, true) && (await dlgTitle(tp)) === 'New Program' && (await tp.$eval('#np2-s', s => s.value)) === 'Power-Up Handler');
      if (n === 'phone') await shot('puh-new-program-phone', tp);
      await clickBtn('OK', tp, true);
      if (n === 'tablet' && !(await tp.$('.nd[data-org="puh"]'))) { await tp.tap('[data-drawer="1"]'); await tp.waitForTimeout(300); }
      check(`${n} (touch): the program is in the Power-Up Handler`, (await treeKeys(tp)).includes('prog:PowerUp') && await tp.evaluate(() => MTPS.App.state.p.tasks.find(t => t.type === 'powerup').programs[0].name === 'PowerUp'));
      await tp.close();
    }
  }
};
