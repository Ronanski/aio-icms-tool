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
    check('New Program: Name, Description, Parent <none>, Use as Folder, Schedule In = MainTask, Inhibit Program', (await dlgTitle()) === 'New Program' && (await page.$eval('#np-s', s => s.value)) === 'MainTask' && (await page.$eval('#np-par', s => s.disabled && s.value === '<none>')) && !!(await page.$('#np-fold')) && !!(await page.$('#np-i')) && !!(await page.$('#np-d')));
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
      await tp.close();
    }
  }
};
