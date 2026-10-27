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
