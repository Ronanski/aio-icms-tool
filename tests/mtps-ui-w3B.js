/* MT PLC Studio UI tests, Wave 3 B: tasks and programs (1756-PM005; v37 help: Tasks, programs, and routines). New
   Program and Unscheduled Programs, the Program Schedule of Task Properties. Mouse on the desktop, touch on the tablet
   and the phone. Called from mtps-ui.test.js. */
'use strict';
module.exports = async function w3B({ browser, page, URL, check }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const dlgTitle = (pg = page) => pg.$eval('#layer .dlg .dh b', b => b.textContent).catch(() => '');
  const dlgText = (pg = page) => pg.$eval('#layer .dlg .db', b => b.textContent).catch(() => '');
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
  const shot = (name, pg = page) => pg.screenshot({ path: `/tmp/claude-0/shots-w3/B/${name}.png` }).catch(() => {});
  const treeKeys = (pg = page) => pg.$$eval('.tree .nd', n => n.map(x => x.dataset.org));
  const tasksOf = (pg = page) => pg.evaluate(() => MTPS.App.state.p.tasks.map(t => `${t.type}:${t.name}=${t.programs.map(g => g.name).join(',')}`).join(' | '));
  // tap or click a row / button inside the dialog
  const hit = (sel, pg = page, tap = false) => (tap ? pg.tap(sel) : pg.click(sel)).then(() => pg.waitForTimeout(80));

  console.log('Wave 3 B: New Program and Unscheduled Programs (v37 help: New program dialog box settings)');
  {
    await fresh(); await open(page, () => MTPS.App.openProject(MTPS.App.example()));
    check('the organizer has Unscheduled Programs inside Tasks, after the tasks', (await treeKeys()).join(',').includes('task:MainTask,prog:MainProgram,ptags:MainProgram,rt:MainProgram/MainRoutine,unsch'));
    await page.click('.nd[data-org="task:MainTask"]', { button: 'right' }); await wait(120);
    check('right-click MainTask: New Program… (on), Properties…', (await items()).some(([l, d]) => l === 'New Program…' && !d) && (await items()).some(([l]) => l === 'Properties…'));
    await pick('New Program…');
    check('New Program: Name, Description, Parent <none>, Use as Folder, Schedule In = MainTask, Inhibit Program', (await dlgTitle()) === 'New Program' && (await page.$eval('#np-s', s => s.value)) === 'MainTask' && (await page.$eval('#np-par', s => !s.disabled && s.value === '' && s.options[0].textContent === '<none>')) && !!(await page.$('#np-fold')) && !!(await page.$('#np-i')) && !!(await page.$('#np-d')));
    check('Schedule In lists <none>, the tasks and the two handlers', (await page.$$eval('#np-s option', o => o.map(x => x.textContent).join('|'))) === '<none>|MainTask|Controller Fault Handler|Power-Up Handler');
    await shot('after-new-program');
    await page.fill('#np-n', 'MainProgram'); await clickBtn('OK');
    check('a name that is taken is refused', /already exists/.test(await page.$eval('#np-e', e => e.textContent)));
    await page.fill('#np-n', 'Mixer'); await page.selectOption('#np-s', ''); await clickBtn('OK');
    check('Schedule In <none>: the program goes to Unscheduled Programs', (await tasksOf()).includes('unscheduled:Unscheduled Programs=Mixer') && (await treeKeys()).includes('prog:Mixer'));
    check('it has no routine yet; the open routine is still MainProgram / MainRoutine', await ev(() => { const s = MTPS.App.state, g = s.p.tasks.flatMap(t => t.programs).find(x => x.name === 'Mixer'); return g.routines.length === 0 && s.prog === 'MainProgram' && s.routine === 'MainRoutine'; }));
    await page.click('.nd[data-org="prog:Mixer"]', { button: 'right' }); await pick('New Routine…');
    await page.fill('#layer #p1', 'MixMain'); await clickBtn('OK');
    check('New Routine in the unscheduled program: Main by default', await ev(() => MTPS.App.state.p.tasks.flatMap(t => t.programs).find(x => x.name === 'Mixer').main === 'MixMain'));
    await page.click('.dmenu [data-menu="File"]'); await wait(120);
    check('File > New Component > New Program… is on', (await items()).some(([l, d]) => l === 'New Program…' && !d));
    await pick('New Program…');
    await page.fill('#np-n', 'Spare'); await clickBtn('OK');
    await page.click('.nd[data-org="unsch"]', { button: 'right' }); await wait(120);
    check('right-click Unscheduled Programs: New Program…', (await items()).some(([l, d]) => l === 'New Program…' && !d));
    await page.keyboard.press('Escape'); await wait(80);
    await shot('after-unscheduled-folder');
    // verify, download and run: the unscheduled program does not run
    await ev(() => { const p = MTPS.App.state.p; p.tags.push({ name: 'MixCnt', type: 'DINT' }); p.tasks.flatMap(t => t.programs).find(x => x.name === 'Mixer').routines[0].rungs = [{ t: 'ADD(MixCnt,1,MixCnt);' }]; MTPS.App.render(); });
    check('Verify Controller: 0 errors with the unscheduled programs', await ev(() => MTPS.verify(MTPS.App.state.p).errors.length === 0));

    console.log('Wave 3 B: Task Properties > Program Schedule (help: Schedule / Unschedule a program, Change the order)');
    await page.dblclick('.nd[data-org="task:MainTask"]'); await wait(200);
    await page.click('#layer [data-dt="sch"]'); await wait(80);
    check('Program Schedule: Unscheduled (Mixer, Spare), Scheduled (MainProgram), Add -> / <- Remove, arrows', (await page.$$eval('#tp-ul [data-tps]', r => r.map(x => x.textContent).join(','))) === 'Mixer,Spare' && (await page.$$eval('#tp-sl [data-tps]', r => r.map(x => x.textContent).join(','))) === 'MainProgram' && !!(await page.$('#tp-add')) && !!(await page.$('#tp-rem')) && !!(await page.$('#tp-up')));
    await hit('#tp-ul [data-tps="u:Mixer"]'); await hit('#tp-add');
    check('Add ->: Mixer moves to Scheduled, last', (await page.$$eval('#tp-sl [data-tps]', r => r.map(x => x.textContent).join(','))) === 'MainProgram,Mixer');
    await hit('#tp-up');
    check('the up arrow puts Mixer first (it runs first)', (await page.$$eval('#tp-sl [data-tps]', r => r.map(x => x.textContent).join(','))) === 'Mixer,MainProgram');
    await shot('after-program-schedule');
    check('Cancel keeps the schedule as it was', await (async () => { await clickBtn('Cancel'); return (await tasksOf()).includes('continuous:MainTask=MainProgram |'); })());
    await page.dblclick('.nd[data-org="task:MainTask"]'); await wait(200);
    await page.click('#layer [data-dt="sch"]'); await wait(80);
    await hit('#tp-ul [data-tps="u:Mixer"]'); await hit('#tp-add'); await hit('#tp-up'); await clickBtn('OK');
    check('OK: MainTask schedules Mixer then MainProgram; Spare stays unscheduled', (await tasksOf()).includes('continuous:MainTask=Mixer,MainProgram') && (await tasksOf()).includes('unscheduled:Unscheduled Programs=Spare'));
    check('the organizer shows Mixer under MainTask', (await treeKeys()).join(',').includes('task:MainTask,prog:Mixer'));
    await page.dblclick('.nd[data-org="task:MainTask"]'); await wait(200);
    await page.click('#layer [data-dt="sch"]'); await wait(80);
    await hit('#tp-sl [data-tps="s:Mixer"]'); await hit('#tp-rem'); await clickBtn('OK');
    check('<- Remove, OK: Mixer is unscheduled again', (await tasksOf()).includes('continuous:MainTask=MainProgram') && (await tasksOf()).includes('Unscheduled Programs=Spare,Mixer'));
    // Delete a program (help: offline, Yes / No)
    await page.click('.nd[data-org="prog:Spare"]', { button: 'right' }); await pick('Delete');
    check('Delete Program asks Yes / No', (await dlgTitle()) === 'Delete Program' && /Spare/.test(await dlgText()));
    await clickBtn('Yes');
    check('the program is deleted', !(await tasksOf()).includes('Spare') && !(await treeKeys()).includes('prog:Spare'));
    // the project saves and opens again with programs that have no routine
    const back = await ev(() => { const j = JSON.stringify(MTPS.App.state.p), p = JSON.parse(j); p.tasks.find(t => t.type === 'unscheduled').programs.push({ name: 'Empty', tags: [], routines: [] }); MTPS.App.openProject(p); return MTPS.App.state.p.tasks.find(t => t.type === 'unscheduled').programs.map(g => g.name).join(','); });
    check('a project with an empty unscheduled program opens', back === 'Mixer,Empty');
  }
  {
    console.log('Wave 3 B: New Task, periodic and event tasks (1756-PM005, Create a Task)');
    await fresh(); await open(page, () => MTPS.App.openProject(MTPS.App.example()));
    const vis = id => page.$eval(id, e => !!e.closest('.tpf') ? e.closest('.tpf').style.display !== 'none' : true).catch(() => false);
    const toastTx = () => page.$eval('.toast', t => t.textContent).catch(() => '');
    await page.click('.nd[data-org="tasks"]', { button: 'right' }); await wait(120);
    check('right-click Tasks: New Task… (on)', (await items()).some(([l, d]) => l === 'New Task…' && !d));
    await shot('after-org-tasks-menu');
    await pick('New Task…');
    check('New Task: Name Task1, Description, Type Periodic by default (PM005: Periodic is the default)', (await dlgTitle()) === 'New Task' && (await page.$eval('#nt-n', e => e.value)) === 'Task1' && (await page.$eval('#nt-t', e => e.value)) === 'periodic' && !!(await page.$('#nt-d')));
    check('Type lists Continuous, Periodic, Event; Continuous is off while MainTask is continuous', (await page.$$eval('#nt-t option', o => o.map(x => x.textContent + (x.disabled ? '-off' : '')).join('|'))) === 'Continuous-off|Periodic|Event');
    check('Periodic shows Period, Priority, Watchdog, Disable automatic output processing, Inhibit task; not the trigger', (await vis('#nt-p')) && (await vis('#nt-pr')) && !(await vis('#nt-tr')) && !!(await page.$('#nt-w')) && !!(await page.$('#nt-o')) && !!(await page.$('#nt-i')));
    check('the defaults: Period 10 ms, Priority 10, Watchdog 500 ms', (await page.$eval('#nt-p', e => e.value)) === '10' && (await page.$eval('#nt-pr', e => e.value)) === '10' && (await page.$eval('#nt-w', e => e.value)) === '500');
    await page.selectOption('#nt-t', 'event'); await wait(60);
    check('Event shows Trigger, Tag, Execute Task If No Event Occurs Within, Priority; not the period', (await vis('#nt-tr')) && (await vis('#nt-tg')) && (await vis('#nt-to')) && (await vis('#nt-pr')) && !(await vis('#nt-p')));
    check('Trigger: EVENT Instruction Only and Module Input Data State Change are on; motion and consumed are off', (await page.$$eval('#nt-tr option:not([disabled])', o => o.map(x => x.textContent).join('|'))) === 'EVENT Instruction Only|Module Input Data State Change' && (await page.$$eval('#nt-tr option', o => o.length)) === 7);
    check('the Tag is off for EVENT Instruction Only', await page.$eval('#nt-tg', e => e.disabled));
    await page.selectOption('#nt-tr', 'input'); await wait(60);
    check('Module Input Data State Change: the Tag lists the input modules (Local:1:I)', !(await page.$eval('#nt-tg', e => e.disabled)) && (await page.$$eval('#nt-tg option', o => o.map(x => x.textContent))).includes('Local:1:I'));
    await shot('after-new-task-event');
    await page.selectOption('#nt-t', 'periodic'); await page.fill('#nt-n', 'Fast'); await page.fill('#nt-p', '5'); await page.fill('#nt-pr', '0'); await clickBtn('OK');
    check('Priority 0 is refused (1 to 15)', /Priority/.test(await page.$eval('#nt-e', e => e.textContent)));
    await page.fill('#nt-pr', '5'); await page.fill('#nt-n', 'MainTask'); await clickBtn('OK');
    check('a task name that is taken is refused', /already exists/.test(await page.$eval('#nt-e', e => e.textContent)));
    await page.fill('#nt-n', 'Fast'); await clickBtn('OK');
    check('OK: the periodic task Fast (5 ms, priority 5) is in the project and the organizer, after MainTask', (await tasksOf()).startsWith('continuous:MainTask=MainProgram | periodic:Fast=') && await ev(() => { const t = MTPS.App.state.p.tasks.find(x => x.name === 'Fast'); return t.period === 5 && t.priority === 5 && t.watchdog === 500; }) && (await treeKeys()).includes('task:Fast'));
    await page.click('.nd[data-org="task:Fast"]'); await wait(120);
    check('Quick View of Fast: Periodic task, Period 5 ms, Priority 5', /Periodic task/.test(await page.$eval('body', b => b.textContent)) && /5 ms/.test(await page.$eval('body', b => b.textContent)));
    // a program in it, with logic: verify and run it in the engine
    await page.click('.nd[data-org="task:Fast"]', { button: 'right' }); await pick('New Program…');
    check('New Program from Fast: Schedule In = Fast', (await page.$eval('#np-s', s => s.value)) === 'Fast');
    await page.fill('#np-n', 'FastProg'); await clickBtn('OK');
    await page.click('.nd[data-org="prog:FastProg"]', { button: 'right' }); await pick('New Routine…');
    await page.fill('#layer #p1', 'FastMain'); await clickBtn('OK');
    const ran = await ev(() => {
      const p = MTPS.App.state.p;
      p.tags.push({ name: 'FastCnt', type: 'DINT' });
      p.tasks.find(t => t.name === 'Fast').programs[0].routines[0].rungs = [{ t: 'ADD(FastCnt,1,FastCnt);' }];
      MTPS.App.render();
      const c = new MTPS.Controller(), r = c.download(JSON.parse(JSON.stringify(p))); if (!r.ok) return r.lines.join(' | ');
      c.setMode('remrun'); for (let k = 0; k < 10; k++) c.scan(10);
      return c.read('FastCnt');
    });
    check('the 5 ms task runs 20 times in 100 ms of the engine', ran === 20, String(ran));
    // Delete Task: refused while it schedules a program
    await page.click('.nd[data-org="task:Fast"]', { button: 'right' }); await wait(120);
    check('right-click a task that schedules a program: Delete is off (1756-PM005, Manually Check for Overlaps picture)', (await items()).some(([l, d]) => l === 'Delete' && d));
    await page.keyboard.press('Escape'); await wait(60);
    await ev(() => MTPS.App.tasks.deleteTask('Fast'));
    check('Delete a task that schedules a program: Failed to delete task', /Failed to delete task Fast/.test(await toastTx()) && (await tasksOf()).includes('periodic:Fast='));
    await page.click('.dmenu [data-menu="File"]'); await wait(120);
    check('File > New Component > New Task… is on', (await items()).some(([l, d]) => l === 'New Task…' && !d));
    await pick('New Task…');
    await page.fill('#nt-n', 'Spare_Task'); await page.selectOption('#nt-t', 'event'); await page.check('#nt-to'); await page.fill('#nt-tv', '50'); await clickBtn('OK');
    check('an event task with a timeout of 50 ms', await ev(() => { const t = MTPS.App.state.p.tasks.find(x => x.name === 'Spare_Task'); return t && t.type === 'event' && t.trigger === 'event' && t.timeoutOn === true && t.timeout === 50 && !('period' in t); }));
    await page.click('.nd[data-org="task:Spare_Task"]', { button: 'right' }); await pick('Delete');
    check('Delete an empty task asks Yes / No', (await dlgTitle()) === 'Delete Task');
    await clickBtn('Yes');
    check('the empty task is deleted', !(await tasksOf()).includes('Spare_Task') && !(await treeKeys()).includes('task:Spare_Task'));
    const verr = await ev(() => MTPS.verify(MTPS.App.state.p).errors.map(e => e.text).join(' | '));
    check('Verify Controller: 0 errors with a periodic task', verr === '', verr);
    console.log('Wave 3 B: Task Properties, Configuration and Monitor (1756-PM005, Create a Periodic Task; Manually Check for Overlaps)');
    await page.dblclick('.nd[data-org="task:Fast"]'); await wait(200);
    check('Task Properties tabs: General, Configuration, Program / Phase Schedule, Monitor', (await page.$$eval('#layer [data-dt]', t => t.map(x => x.textContent).join('|'))) === 'General|Configuration|Program / Phase Schedule|Monitor');
    await page.click('#layer [data-dt="cfg"]'); await wait(80);
    check('Configuration of Fast: Periodic, Period 5, Priority 5, Watchdog 500; Continuous is off', (await page.$eval('#tp-t', e => e.value)) === 'periodic' && (await page.$eval('#tp-p', e => e.value)) === '5' && (await page.$eval('#tp-pr', e => e.value)) === '5' && (await page.$eval('#tp-w', e => e.value)) === '500' && (await page.$eval('#tp-t option[value="continuous"]', o => o.disabled)));
    check('Priority shows (Lower Number Yields Higher Priority)', /Lower Number Yields Higher Priority/.test(await dlgText()));
    await shot('after-taskprops-cfg-periodic');
    await page.fill('#tp-p', '20'); await page.fill('#tp-pr', '16'); await clickBtn('OK');
    check('Priority 16 is refused', (await dlgTitle()) === 'Task Properties - Fast');
    await page.fill('#tp-pr', '3'); await page.check('#tp-o'); await clickBtn('OK');
    check('OK: Period 20 ms, Priority 3, Disable Automatic Output Processing saved', await ev(() => { const t = MTPS.App.state.p.tasks.find(x => x.name === 'Fast'); return t.period === 20 && t.priority === 3 && t.noOutputs === true; }));
    // MainTask: the Type can become Event; then Continuous is free for another task
    await page.dblclick('.nd[data-org="task:MainTask"]'); await wait(200);
    await page.click('#layer [data-dt="cfg"]'); await wait(80);
    check('MainTask: Type Continuous, no Period or Priority shown', (await page.$eval('#tp-t', e => e.value)) === 'continuous' && !(await page.$eval('#tp-p', e => e.closest('.tpf').style.display !== 'none')));
    await page.selectOption('#tp-t', 'event'); await wait(60);
    check('changing the type to Event shows Trigger and Priority', await page.$eval('#tp-tr', e => e.closest('.tpf').style.display !== 'none'));
    await clickBtn('Cancel');
    // Monitor online: scan times, intervals, overlap count, Reset
    await ev(() => MTPS.App.run('online'));
    for (let k = 0; k < 10 && !(await ev(() => MTPS.App.state.online && !document.querySelector('#layer .dlg'))); k++) { await wait(150); const b = await page.$('#layer .dlg .btn.pri'); if (b && !(await page.$('#layer .dlg .prog'))) await b.click(); else await wait(400); }
    await ev(() => MTPS.App.run('runm')); await wait(600);
    await page.dblclick('.nd[data-org="task:Fast"]'); await wait(200);
    await page.click('#layer [data-dt="mon"]'); await wait(80);
    const monv = await page.$$eval('#tp-mx, #tp-ls, #tp-ix, #tp-in, #tp-ov', e => e.map(x => x.value));
    check('online in Run, Monitor: Scan Times Max / Last, Interval Times Max / Min about 20 ms, Task Overlap Count', monv.length === 5 && monv.every(v => v !== '') && Math.abs(+monv[2] - 20) < 0.5 && Math.abs(+monv[3] - 20) < 0.5, monv.join(','));
    check('online: the type and the period are off (offline only), the watchdog is on', (await page.$eval('#tp-t', e => e.disabled)) && (await page.$eval('#tp-p', e => e.disabled)) && !(await page.$eval('#tp-w', e => e.disabled)));
    await shot('after-taskprops-monitor-online');
    await hit('#tp-r');
    check('Reset: the interval times and the overlap count start again', (await page.$eval('#tp-ov', e => e.value)) === '0' && (await page.$eval('#tp-ix', e => e.value)) === '');
    await clickBtn('Cancel');
    await page.click('.nd[data-org="task:Fast"]'); await wait(100);
    check('Quick View of Fast: Periodic task, Period 20 ms, Priority 3', await page.$eval('body', b => /Periodic task/.test(b.textContent) && /20 ms/.test(b.textContent)));
    await ev(() => MTPS.App.run('offline')); await wait(150);
    await shot('after-new-task-tree');
  }
  {
    // tablet portrait (the organizer is a drawer) and phone (Project tab), touch: hold MainTask, New Program
    for (const [n, vp] of [['tablet', { width: 800, height: 1280 }], ['phone', { width: 390, height: 844 }]]) {
      const tp = await browser.newPage({ viewport: vp, hasTouch: true, isMobile: true });
      await fresh(tp, vp); await open(tp, () => MTPS.App.openProject(MTPS.App.example()));
      const org = async () => { if (await tp.$('.nd[data-org="task:MainTask"]')) return; if (n === 'tablet') await tp.tap('[data-drawer="1"]'); else await tp.tap('.pnav [data-go="project"]'); await tp.waitForTimeout(300); };
      await org();
      await hold(tp, '.nd[data-org="task:MainTask"]');
      check(`${n} (touch): hold MainTask, New Program…`, await pick('New Program…', tp, true) && (await dlgTitle(tp)) === 'New Program');
      await tp.fill('#np-n', 'Touch_Prog'); await tp.selectOption('#np-s', ''); await clickBtn('OK', tp, true);
      await org();
      check(`${n} (touch): the program is in Unscheduled Programs`, (await treeKeys(tp)).includes('prog:Touch_Prog') && (await tasksOf(tp)).includes('Unscheduled Programs=Touch_Prog'));
      await hold(tp, '.nd[data-org="task:MainTask"]'); await pick('Properties…', tp, true);
      await hit('#layer [data-dt="sch"]', tp, true);
      await hit('#tp-ul [data-tps="u:Touch_Prog"]', tp, true); await hit('#tp-add', tp, true);
      if (n === 'phone') await shot('after-program-schedule-phone', tp);
      await clickBtn('OK', tp, true);
      check(`${n} (touch): Program Schedule, Add ->: MainTask schedules Touch_Prog`, (await tasksOf(tp)).includes('continuous:MainTask=MainProgram,Touch_Prog'));
      // New Task with touch: hold the Tasks folder
      await org();
      await hold(tp, '.nd[data-org="tasks"]');
      check(`${n} (touch): hold Tasks, New Task…`, await pick('New Task…', tp, true) && (await dlgTitle(tp)) === 'New Task');
      await tp.fill('#nt-n', 'Touch_Task'); await tp.selectOption('#nt-t', 'event'); await tp.selectOption('#nt-tr', 'input');
      if (n === 'phone') await shot('after-new-task-phone', tp);
      const fits = await tp.$eval('#layer .dlg', d => d.getBoundingClientRect().right <= window.innerWidth + 1 && d.scrollWidth <= d.clientWidth + 1);
      await clickBtn('OK', tp, true);
      check(`${n} (touch): the event task on a change of Local:1:I is added; the dialog fits the screen`, fits && await tp.evaluate(() => { const t = MTPS.App.state.p.tasks.find(x => x.name === 'Touch_Task'); return t && t.type === 'event' && t.trigger === 'input' && t.tag === 'Local:1:I'; }));
      await tp.close();
    }
  }
  {
    console.log('Wave 3 B: Program Properties > Parameters (help v37: Edit program parameter and connection properties; 1756-PM021)');
    await fresh(); await open(page, () => MTPS.App.openProject(MTPS.App.example()));
    // a second program in MainTask, with a routine
    await page.click('.nd[data-org="task:MainTask"]', { button: 'right' }); await pick('New Program…');
    await page.fill('#np-n', 'Consumer'); await clickBtn('OK');
    await page.click('.nd[data-org="prog:Consumer"]', { button: 'right' }); await pick('New Routine…');
    await page.fill('#layer #p1', 'CMain'); await clickBtn('OK');
    await page.click('.nd[data-org="prog:Consumer"]', { button: 'right' }); await pick('Properties…');
    check('Program Properties tabs: General, Configuration, Parameters, Monitor', (await page.$$eval('#layer [data-dt]', t => t.map(x => x.textContent).join('|'))) === 'General|Configuration|Parameters|Monitor');
    await page.click('#layer [data-dt="par"]'); await wait(80);
    check('Parameters: an empty grid with a create row (Name, Usage, Data Type)', /No parameters/.test(await dlgText()) && !!(await page.$('#pa-n')) && (await page.$$eval('#pa-u option', o => o.map(x => x.textContent).join('|'))) === 'Input|Output|InOut|Public');
    await page.fill('#pa-n', 'In'); await page.selectOption('#pa-u', 'Input'); await hit('#pa-add');
    check('Add: the Input parameter In (DINT) is in the grid and selected', (await page.$$eval('#pp-par [data-par]', r => r.map(x => x.textContent).join(','))).startsWith('InInput') && (await page.$eval('#pp-par [data-par="In"]', r => r.classList.contains('on'))));
    await clickBtn('OK');
    check('OK: Consumer has the parameter In with usage Input', await ev(() => { const g = MTPS.App.state.p.tasks[0].programs.find(x => x.name === 'Consumer'); return g.tags.some(t => t.name === 'In' && t.usage === 'Input' && t.type === 'DINT'); }));
    // MainProgram: an Output connected to \Consumer.In
    await page.click('.nd[data-org="prog:MainProgram"]', { button: 'right' }); await pick('Properties…');
    await page.click('#layer [data-dt="par"]'); await wait(80);
    await page.fill('#pa-n', 'Count'); await page.selectOption('#pa-u', 'Output'); await hit('#pa-add');
    await page.fill('#pa-cn', 'Consumer In'); await hit('#pa-cadd');
    check('a connection that is neither a tag nor \\Program.Parameter is refused', /Connection:/.test(await page.$eval('#pa-e', e => e.textContent)) && /No connections/.test(await dlgText()));
    await page.fill('#pa-cn', '\\Consumer.In'); await hit('#pa-cadd');
    check('Connections grid of Count: \\Consumer.In, Usage Input, DINT', /\\Consumer\.InInputDINT/.test(await page.$eval('#pp-par', e => e.textContent)));
    await shot('after-progprops-parameters');
    await clickBtn('OK');
    check('OK: Count is an Output with the connection', await ev(() => { const t = MTPS.App.state.p.tasks[0].programs[0].tags.find(x => x.name === 'Count'); return t && t.usage === 'Output' && t.conn.join() === '\\Consumer.In'; }));
    await page.click('.nd[data-org="prog:Consumer"]', { button: 'right' }); await pick('Properties…');
    await page.click('#layer [data-dt="par"]'); await wait(80);
    await hit('#pp-par [data-par="In"] td');
    check('the Input shows the connection that MainProgram.Count makes to it (read-only)', /\\MainProgram\.Count/.test(await page.$eval('#pp-par', e => e.textContent)) && /from that parameter/.test(await page.$eval('#pp-par', e => e.textContent)));
    await page.fill('#pa-cn', 'Other'); await hit('#pa-cadd');
    check('an Input takes one source: a second connection is refused', /one source/.test(await page.$eval('#pa-e', e => e.textContent)));
    await clickBtn('Cancel');
    // run it in the engine: Consumer sees Count of the same scan
    const got = await ev(() => {
      const p = MTPS.App.state.p, g0 = p.tasks[0].programs[0], g1 = p.tasks[0].programs.find(x => x.name === 'Consumer');
      g1.tags.push({ name: 'Seen', type: 'DINT' });
      g0.routines[0].rungs.push({ t: 'ADD(Count,1,Count);' }); g1.routines[0].rungs = [{ t: 'MOV(In,Seen);' }];
      const v = MTPS.verify(p); if (v.errors.length) return v.errors.map(e => e.text).join(' | ');
      const c = new MTPS.Controller(); c.download(JSON.parse(JSON.stringify(p))); c.setMode('remrun'); for (let k = 0; k < 4; k++) c.scan(10);
      return c.read('Seen', 'Consumer');
    });
    check('verify passes and Consumer.In follows MainProgram.Count each scan', got === 4, String(got));
  }
  {
    // touch: tablet and phone, Program Properties > Parameters, add a Public parameter
    for (const [n, vp] of [['tablet', { width: 800, height: 1280 }], ['phone', { width: 390, height: 844 }]]) {
      const tp = await browser.newPage({ viewport: vp, hasTouch: true, isMobile: true });
      await fresh(tp, vp); await open(tp, () => MTPS.App.openProject(MTPS.App.example()));
      if (n === 'tablet') await tp.tap('[data-drawer="1"]'); else await tp.tap('.pnav [data-go="project"]');
      await tp.waitForTimeout(300);
      await hold(tp, '.nd[data-org="prog:MainProgram"]'); await pick('Properties…', tp, true);
      await hit('#layer [data-dt="par"]', tp, true);
      await tp.fill('#pa-n', 'Shared'); await tp.selectOption('#pa-u', 'Public'); await hit('#pa-add', tp, true);
      if (n === 'phone') await shot('after-progprops-parameters-phone', tp);
      const fits = await tp.$eval('#layer .dlg', d => d.getBoundingClientRect().right <= window.innerWidth + 1);
      await clickBtn('OK', tp, true);
      check(`${n} (touch): Parameters, Add: a Public parameter; the dialog fits`, fits && await tp.evaluate(() => MTPS.App.state.p.tasks[0].programs[0].tags.some(t => t.name === 'Shared' && t.usage === 'Public')));
      await tp.close();
    }
  }
  {
    console.log('Wave 3 B: UID, UIE, EVENT, IOT in the editor (1756-RM018A chapters 11 and 4)');
    const ADD = [['Program Control', 'UID', []], ['Program Control', 'EVENT', ['Alarm_Task']], ['Program Control', 'UIE', []], ['Input/Output', 'IOT', ['Local:2:O']]];
    const LAYS = [{ n: 'desktop', vp: { width: 1440, height: 900 } }, { n: 'tablet', vp: { width: 800, height: 1280 }, touch: true }, { n: 'phone', vp: { width: 390, height: 844 }, touch: true }];
    for (const lay of LAYS) {
      const pg = lay.touch ? await browser.newPage({ viewport: lay.vp, hasTouch: true, isMobile: true }) : page;
      await fresh(pg, lay.vp);
      const tp = sel => (lay.touch ? pg.tap(sel) : pg.click(sel));
      await pg.evaluate(() => { const A = MTPS.App, p = A.blank('Events'); p.tasks.push({ name: 'Alarm_Task', type: 'event', trigger: 'event', priority: 5, programs: [] }); A.openProject(p); });
      await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
      const bad = [];
      for (const [tab, mn, ops] of ADD) {
        await pg.evaluate(() => { const S = MTPS.App.state, rr = S.p.tasks[0].programs[0].routines[0].rungs; if (rr[rr.length - 1].t) rr.push({ t: '' }); S.sel = null; S.selRung = rr.length - 1; MTPS.App.render(); });
        const ri = await pg.evaluate(() => MTPS.App.state.selRung);
        if (lay.n === 'desktop') { await tp(`[data-tab="${tab}"]`); await pg.waitForTimeout(100); await tp(`.gbtn[data-mn="${mn}"]`); }
        else {
          // touch: the Add Ladder Element box, the group, then the instruction (a second tap adds it)
          if (await pg.$('.fab')) await tp('.fab'); else await pg.evaluate(() => MTPS.App.run('ins'));
          await pg.waitForTimeout(150);
          if (!(await pg.$(`#layer [data-pk="${mn}"]`))) await tp(`#layer [data-pgrp="${tab}"]`).catch(() => {});
          await pg.waitForTimeout(80); await tp(`#layer [data-pk="${mn}"]`); await pg.waitForTimeout(80); await tp(`#layer [data-pk="${mn}"]`).catch(() => {});
        }
        await pg.waitForTimeout(250);
        if (ops.length) {
          if (!(await pg.$('#layer [data-op="0"]'))) { bad.push(`${mn}: the operand box did not open`); await pg.keyboard.press('Escape'); continue; }
          await tp('#layer [data-op="0"]'); await pg.waitForTimeout(120);
          if (mn === 'EVENT' && lay.n === 'desktop') {
            const sug = await pg.$$eval('#sg [data-pick]', x => x.map(y => y.textContent).join('|')).catch(() => '');
            if (!/Alarm_Task/.test(sug)) bad.push(`EVENT: the Task list does not offer Alarm_Task (${sug.slice(0, 80)})`);
          }
          await pg.fill('#layer [data-op="0"]', ops[0]);
          await tp('#layer .df .btn.pri'); await pg.waitForTimeout(200);
          if (await pg.$('#layer .dlg')) { bad.push(`${mn}: the operand box stayed open`); await pg.keyboard.press('Escape'); await pg.waitForTimeout(80); }
        } else if (await pg.$('#layer .dlg')) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(80); }
        const t = await pg.evaluate(i => MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs[i].t, ri);
        if (t !== `${mn}(${ops.join(',')});`) bad.push(`${mn}: rung "${t}"`);
      }
      check(`${lay.n}${lay.touch ? ' (touch)' : ''}: UID, EVENT, UIE and IOT added with their operands`, !bad.length, bad.join(' | '));
      const ver = await pg.evaluate(() => MTPS.verify(MTPS.App.state.p).errors.map(e => e.text));
      check(`${lay.n}: the rungs verify`, !ver.length, ver.join(' | '));
      if (lay.n === 'desktop') {
        await pg.click('[data-tab="Input/Output"]'); await pg.waitForTimeout(80);
        const io = await pg.$$eval('.gbtn[data-mn]', b => b.map(x => x.dataset.mn).join(','));
        await pg.click('[data-tab="Program Control"]'); await pg.waitForTimeout(80);
        const pc = await pg.$$eval('.gbtn[data-mn]', b => b.map(x => x.dataset.mn).join(','));
        check('the Program Control tab ends with UID, UIE, EVENT; Input/Output has IOT', pc.endsWith('TND,UID,UIE,EVENT') && io.includes('IOT'), pc + ' / ' + io);
        await shot('after-program-control-tab', pg);
        await pg.evaluate(() => MTPS.App.select({ ri: 1, path: [0] })); await pg.keyboard.press('F1'); await pg.waitForTimeout(150);
        const ih = await pg.$eval('.ihc', p => p.textContent).catch(() => '');
        check('Instruction Help for EVENT: Trigger Event Task, Program Control Instructions, the TASK operand, the overlap rule', ih.includes('Trigger Event Task (EVENT)') && ih.includes('Program Control Instructions') && ih.includes('TASK') && /overlap/.test(ih), ih.slice(0, 120));
        await shot('after-help-event', pg);
        await pg.keyboard.press('Escape');
      }
      if (lay.touch) await pg.close();
    }
  }
  {
    console.log('Wave 3 B: Controller Properties > SFC Execution (help v37: Controller Properties dialog box - SFC Execution tab)');
    await fresh(); await open(page, () => MTPS.App.openProject(MTPS.App.example()));
    await page.dblclick('.nd[data-org="ctl"]'); await wait(200);
    check('the SFC Execution tab comes after Advanced', (await page.$$eval('#layer [data-dt]', t => t.map(x => x.textContent.trim()).join('|'))).includes('Advanced|SFC Execution|Project'));
    await page.click('#layer [data-dt="sfc"]'); await wait(80);
    const txt = await dlgText();
    check('Execution Control, Restart Position, Last Scan of Active Steps, each with its options', ['Execution Control', 'Execute current active steps only', 'Execute until FALSE transition', 'Restart Position', 'Restart at most recently executed step', 'Restart at initial step', 'Last Scan of Active Steps', 'Automatic reset', 'Programmatic reset', 'Don’t scan'].every(x => txt.includes(x)));
    check('the defaults: current active steps only, most recently executed step, Don’t scan', (await page.$$eval('#layer [data-sfc]:checked', r => r.map(x => x.value).join(','))) === 'current,recent,dontscan');
    await page.check('#layer [data-sfc="exec"][value="untilFalse"]'); await page.check('#layer [data-sfc="restart"][value="initial"]'); await page.check('#layer [data-sfc="last"][value="programmatic"]');
    await shot('after-ctlprops-sfc');
    await clickBtn('OK');
    check('OK: the settings are kept in the project', await ev(() => JSON.stringify(MTPS.App.state.p.controller.sfc) === JSON.stringify({ exec: 'untilFalse', restart: 'initial', last: 'programmatic' })));
    await page.dblclick('.nd[data-org="ctl"]'); await wait(200); await page.click('#layer [data-dt="sfc"]'); await wait(80);
    check('they show again when the dialog opens', (await page.$$eval('#layer [data-sfc]:checked', r => r.map(x => x.value).join(','))) === 'untilFalse,initial,programmatic');
    await clickBtn('Cancel');
    // phone, touch
    const tp = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await fresh(tp, { width: 390, height: 844 }); await open(tp, () => MTPS.App.openProject(MTPS.App.example()));
    await tp.evaluate(() => MTPS.App.run('ctlprops')); await tp.waitForTimeout(200);
    await hit('#layer [data-dt="sfc"]', tp, true);
    await hit('#layer [data-sfc="last"][value="auto"]', tp, true);
    await shot('after-ctlprops-sfc-phone', tp);
    await clickBtn('OK', tp, true);
    check('phone (touch): Last Scan of Active Steps, Automatic reset, OK', await tp.evaluate(() => (MTPS.App.state.p.controller.sfc || {}).last === 'auto'));
    await tp.close();
  }
};
