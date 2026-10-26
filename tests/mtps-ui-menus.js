/* MT PLC Studio UI tests: the Studio 5000 File, Edit, Search and Communications menus (Close, the save-changes
   prompt, recent projects, New Component, Select All, Properties, Find Previous / Next Result, Replace, Select Recent
   Path, Go To Faults). Mouse on the desktop, touch on the tablet and the phone. Called from mtps-ui.test.js. */
'use strict';
module.exports = async function menus({ browser, page, URL, check }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const dlgTitle = () => page.$eval('#layer .dlg .dh b', b => b.textContent).catch(() => '');
  const dlgText = () => page.$eval('#layer .dlg .db', b => b.textContent).catch(() => '');
  const dlgBtns = () => page.$$eval('#layer .dlg .df .btn', b => b.map(x => x.textContent)).catch(() => []);
  const clickBtn = async (label, pg = page) => { await pg.evaluate(l => { const b = [...document.querySelectorAll('#layer .dlg .df .btn')].find(x => x.textContent === l); if (b) b.dataset.wapick = '1'; }, label); await pg.click('#layer [data-wapick]'); await pg.waitForTimeout(150); };
  // the items of the open menu: [label, disabled]; a header row is ['#Header']
  const items = (pg = page) => pg.$$eval('#layer .menu > *', r => r.filter(x => !x.hidden).map(x => (x.classList.contains('hd') ? ['#' + x.textContent] : x.tagName === 'HR' ? ['-'] : [x.querySelector('span:not(.k):not(.ck)') ? x.querySelector('span:not(.k):not(.ck)').textContent : x.textContent, x.classList.contains('dis')])));
  // click (or tap) the item of the open menu with this label
  async function pick(label, pg = page, tap = false) {
    const ok = await pg.evaluate(l => { const it = [...document.querySelectorAll('#layer .menu .it')].find(x => !x.hidden && x.querySelector('span:not(.k):not(.ck)') && x.querySelector('span:not(.k):not(.ck)').textContent === l); if (it) it.dataset.wapick = '1'; return !!it; }, label);
    if (!ok) return false;
    if (tap) await pg.tap('#layer [data-wapick]'); else await pg.click('#layer [data-wapick]');
    await pg.waitForTimeout(150);
    return true;
  }
  async function menu(name, label) { await page.click(`.dmenu [data-menu="${name}"]`); await wait(120); return label ? pick(label) : items(); }
  const st = () => ev(() => { const s = MTPS.App.state; return { noProj: s.noProj, dirty: s.dirty, name: s.p.controller.name, file: s.file && s.file.name, sel: s.sel, selRung: s.selRung, view: s.view, routine: s.routine }; });
  async function fresh() {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(URL); await ev(() => localStorage.clear()); await page.reload(); await wait(300);
    await page.keyboard.press('Escape'); await wait(80);
  }
  async function example() { await ev(() => MTPS.App.openProject(MTPS.App.example())); await wait(120); }
  // Go Online through its dialogs (Connected To Go Online > Download > Download), as a user answers them
  async function online() {
    await ev(() => MTPS.App.run('online'));
    for (let k = 0; k < 8 && !(await ev(() => MTPS.App.state.online && !document.querySelector('#layer .dlg'))); k++) {
      await wait(150);
      const b = await page.$('#layer .dlg .btn.pri'); if (b && !(await page.$('#layer .dlg .prog'))) await b.click(); else await wait(500);
    }
    return ev(() => MTPS.App.state.online);
  }
  async function dirty() { await page.click('#ladwrap rect.tap[data-rn][data-ri="0"]'); await wait(60); await page.keyboard.press('Control+r'); await wait(120); }

  console.log('Studio 5000 menus: save-changes prompt (Logix Designer help v37: Close / Exit command)');
  await fresh(); await example(); await dirty();
  check('a change marks the project changed', (await st()).dirty === true);
  await menu('File', 'New Project…');
  check('New Project with changes: "Save changes to Motor_Demo?" with Yes, No, Cancel', (await dlgTitle()) === 'MT PLC Studio' && (await dlgText()).trim() === 'Save changes to Motor_Demo?' && (await dlgBtns()).join(',') === 'Yes,No,Cancel', `${await dlgText()} ${await dlgBtns()}`);
  await clickBtn('Cancel');
  check('Cancel stays in the project, with its changes', (await page.$('#layer .dlg')) === null && (await st()).dirty === true && (await st()).name === 'Motor_Demo');
  await menu('File', 'Open… (.mtp, .L5X)');
  check('Open with changes asks too', (await dlgText()).trim() === 'Save changes to Motor_Demo?');
  await clickBtn('No');
  await page.waitForFunction(() => document.querySelector('#layer .fbi, #layer .fbl .empty'), null, { timeout: 3000 }).catch(() => {});
  check('No goes on without saving: the Open Project file browser', (await dlgTitle()) === 'Open Project' && (await st()).dirty === true);
  await page.keyboard.press('Escape'); await wait(80);
  await menu('File', 'New Project…');
  await clickBtn('Yes');
  await page.waitForFunction(() => document.querySelector('#layer #fbn'), null, { timeout: 3000 }).catch(() => {});
  check('Yes on a project without a file: Save As first', (await dlgTitle()) === 'Save As');
  await page.fill('#fbn', 'WA_Saved'); await clickBtn('Save'); await wait(250);
  check('then the project is saved and New Project opens', (await dlgTitle()) === 'New Project' && (await st()).dirty === false && /WA_Saved\.mtp$/.test(await ev(() => MTPS.App.state.file.path)));
  await page.keyboard.press('Escape'); await wait(80);
  await dirty();
  await menu('File', 'New Project…'); await clickBtn('Yes'); await wait(250);
  check('Yes on a project with a file saves it in place and goes on', (await dlgTitle()) === 'New Project' && (await st()).dirty === false);
  await page.keyboard.press('Escape'); await wait(80);
  await menu('File', 'New Project…');
  check('no changes: no prompt', (await dlgTitle()) === 'New Project');
  await page.keyboard.press('Escape'); await wait(80);

  console.log('File > Close (help v37: Close command): back to the Start Page');
  await fresh(); await example();
  let f = await menu('File');
  check('File: New, Setup, Open, Close, Save, Save As in the reference order', f.map(x => x[0]).slice(0, 7).join('|') === 'New Project…|Setup Wizard…|-|Open… (.mtp, .L5X)|Close|Save|Save As… (.mtp file)', f.map(x => x[0]).join('|'));
  await pick('Close');
  check('Close without changes: the Start Page, no project open', (await st()).noProj === true && (await page.$('.startpg [data-cmd="new"]')) !== null && (await ev(() => document.title)) === 'MT PLC Studio');
  f = await menu('File');
  check('with no project open, Close is off', f.find(x => x[0] === 'Close')[1] === true);
  await page.keyboard.press('Escape'); await wait(80);
  await example();
  check('online for the next step', await online());
  await dirty();
  await menu('File', 'Close');
  check('Close with changes asks to save first', (await dlgText()).trim() === 'Save changes to Motor_Demo?');
  await clickBtn('No'); await wait(150);
  check('No: closed without saving, offline, the Start Page', (await st()).noProj === true && (await ev(() => MTPS.App.state.online)) === false && (await page.$('.startpg')) !== null);
  // tablet (touch): the folding menu
  const tctx = await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true });
  const tp = await tctx.newPage();
  await tp.goto(URL); await tp.waitForTimeout(300); await tp.keyboard.press('Escape');
  await tp.evaluate(() => MTPS.App.openProject(MTPS.App.example())); await tp.waitForTimeout(150);
  await tp.tap('[data-allmenu]'); await tp.waitForTimeout(150); await tp.tap('[data-fold="File"]'); await tp.waitForTimeout(150);
  await pick('Close', tp, true);
  check('tablet (touch): Close in the folding File menu goes to the Start Page', (await tp.evaluate(() => MTPS.App.state.noProj)) === true && (await tp.$('.startpg')) !== null);
  await tctx.close();
  // phone (touch): More > Close Project
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const pp = await pctx.newPage();
  await pp.goto(URL); await pp.waitForTimeout(300); await pp.keyboard.press('Escape');
  await pp.evaluate(() => MTPS.App.openProject(MTPS.App.example())); await pp.waitForTimeout(150);
  await pp.tap('[data-go="more"]'); await pp.waitForTimeout(150);
  await pp.tap('.page [data-cmd="close"]'); await pp.waitForTimeout(200);
  check('phone (touch): More > Close Project shows the Start Page on the Ladder tab', (await pp.evaluate(() => MTPS.App.state.noProj && MTPS.App.state.area === 'ladder')) && (await pp.$('.startpg')) !== null);
  await pctx.close();

  console.log('File > Recent Projects (help v37: up to eight most recently accessed projects)');
  await fresh(); await example();
  f = await menu('File');
  check('no project saved or opened yet: no Recent Projects rows', !f.some(x => x[0] === '#Recent Projects'));
  await page.keyboard.press('Escape');
  for (const n of ['WA_R1', 'WA_R2']) {
    await ev(() => MTPS.App.run('saveas')); await page.waitForFunction(() => document.querySelector('#layer #fbn'), null, { timeout: 3000 }).catch(() => {});
    await page.fill('#fbn', n); await clickBtn('Save'); await wait(250);
  }
  f = await menu('File');
  const ri = f.findIndex(x => x[0] === '#Recent Projects');
  check('File lists Recent Projects near the bottom, the newest first', ri > 0 && f[ri + 1][0] === '1 WA_R2.mtp' && f[ri + 2][0] === '2 WA_R1.mtp' && ri > f.findIndex(x => x[0] === 'Export L5X…'), f.map(x => x[0]).join('|'));
  await page.keyboard.press('Escape');
  await ev(() => { const s = MTPS.App.state; s.prefs.files = Array.from({ length: 8 }, (_, i) => '/x/P' + i + '.mtp').concat(s.prefs.files); });
  f = await menu('File');
  check('at most eight of them', f.filter(x => /^\d /.test(x[0])).length === 8);
  await page.keyboard.press('Escape');
  await ev(() => { const s = MTPS.App.state; s.prefs.files = s.prefs.files.filter(x => !x.startsWith('/x/')); });
  await dirty();
  await menu('File', '2 WA_R1.mtp');
  check('a recent project with changes in this one: the save-changes prompt first', (await dlgText()).trim() === 'Save changes to WA_R2.mtp?');
  await clickBtn('No'); await wait(300);
  check('No: the recent project opens', (await st()).file === 'WA_R1.mtp' && (await st()).dirty === false);
  const t2 = await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true });
  const tq = await t2.newPage();
  await tq.goto(URL); await tq.waitForTimeout(300); await tq.keyboard.press('Escape');
  await tq.evaluate(() => { const s = MTPS.App.state; s.prefs.files = ['/x/Tab_Proj.mtp']; MTPS.App.openProject(MTPS.App.example()); }); await tq.waitForTimeout(150);
  await tq.tap('[data-allmenu]'); await tq.waitForTimeout(150); await tq.tap('[data-fold="File"]'); await tq.waitForTimeout(150);
  check('tablet (touch): the folding File menu lists the recent project', (await items(tq)).some(x => x[0] === '1 Tab_Proj.mtp'));
  await t2.close();

  console.log('File > New Component (help v37: Routine opens New Routine for the program picked in the organizer)');
  await fresh(); await example();
  f = await menu('File');
  const nc = f.findIndex(x => x[0] === '#New Component'), ncs = f.slice(nc + 1, nc + 8);
  check('New Component: Data Type, Module, Program, Routine, Tag, Task, Trend in the reference order', ncs.map(x => x[0]).join('|') === 'New Data Type…|New Module…|New Program…|New Routine…|New Tag…|New Task…|New Trend…', ncs.map(x => x[0]).join('|'));
  check('Routine, Tag and Module work; Program, Task, Data Type and Trend are listed but off', ncs.filter(x => x[1]).map(x => x[0]).join('|') === 'New Data Type…|New Program…|New Task…|New Trend…');
  await page.keyboard.press('Escape');
  await page.click('.org [data-org="prog:MainProgram"]'); await wait(450);
  await menu('File', 'New Routine…');
  check('New Routine… opens the New Routine dialog', (await dlgTitle()) === 'New Routine');
  await page.fill('#layer #p1', 'WA_Sub'); await clickBtn('OK'); await wait(150);
  check('OK: the routine is made in that program and opens', (await st()).routine === 'WA_Sub' && (await ev(() => MTPS.App.state.p.tasks[0].programs[0].routines.some(r => r.name === 'WA_Sub'))));

  console.log('Edit > Select All (help v37: all the rungs of the routine; in the Tag Editor all rows)');
  await fresh(); await example();
  const nR = () => ev(() => MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs.length);
  const selNums = () => page.$$eval('#ladwrap text.rn.on', t => t.length);
  const msg = () => page.$eval('#stmsg', e => e.textContent).catch(() => '');
  f = await menu('Edit');
  check('Edit lists Select All (Ctrl+A)', !!f.find(x => x[0] === 'Select All') && (await page.$eval('#layer .menu', m => [...m.querySelectorAll('.it')].some(x => /Select All/.test(x.textContent) && /Ctrl\+A/.test(x.textContent)))));
  await page.keyboard.press('Escape');
  await page.click('#ladwrap rect.tap[data-rn][data-ri="2"]'); await wait(60);
  await page.keyboard.press('Control+a'); await wait(100);
  check('Ctrl+A in the ladder selects every rung of the routine', (await selNums()) === 5);
  await page.keyboard.press('Control+c'); await wait(80);
  check('Copy copies all of them', (await msg()) === 'Copied 5 rung(s)');
  await page.click('#ladwrap rect.tap[data-rn][data-ri="4"]'); await wait(60);
  check('a click on one rung ends Select All', (await selNums()) === 1);
  await page.keyboard.press('Control+v'); await wait(120);
  check('Paste puts the 5 rungs after the selected rung', (await nR()) === 10);
  await page.keyboard.press('Control+z'); await wait(120);
  await menu('Edit', 'Select All'); await wait(80);
  check('Edit > Select All (mouse) does the same', (await selNums()) === 5);
  await page.keyboard.press('Delete'); await wait(120);
  check('Delete deletes all the selected rungs', (await nR()) === 0);
  await page.keyboard.press('Control+z'); await wait(120);
  check('Undo brings them back', (await nR()) === 5);
  await ev(() => MTPS.App.run('tagsedit')); await wait(150);
  await menu('Edit', 'Select All'); await wait(80);
  const nTags = await page.$$eval('#tagrows tr[data-tag]:not(.mem)', r => r.length);
  check('in the Tag Editor: Select All selects all rows of the grid', nTags > 0 && (await page.$$eval('#tagrows tr.all', r => r.length)) === nTags);
  await page.keyboard.press('Control+c'); await wait(80);
  check('Copy copies the rows', (await msg()) === `Copied ${nTags} tag row(s)` || /^Copied \d+ tag row/.test(await msg()), await msg());
  await page.keyboard.press('Escape'); await wait(80);
  check('Esc ends it', (await page.$$eval('#tagrows tr.all', r => r.length)) === 0);
  const t3 = await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true });
  const tr = await t3.newPage();
  await tr.goto(URL); await tr.waitForTimeout(300); await tr.keyboard.press('Escape');
  await tr.evaluate(() => MTPS.App.openProject(MTPS.App.example())); await tr.waitForTimeout(150);
  await tr.tap('[data-allmenu]'); await tr.waitForTimeout(150); await tr.tap('[data-fold="Edit"]'); await tr.waitForTimeout(150);
  await pick('Select All', tr, true);
  check('tablet (touch): Edit > Select All in the folding menu selects all rungs', (await tr.$$eval('#ladwrap text.rn.on', t => t.length)) === 5);
  await t3.close();

  console.log('Edit > Properties (help v37: the properties of the current component)');
  await fresh(); await example();
  const propsOf = async sel => { if (sel) { await page.click(sel); await wait(450); if (await page.$('#layer .dlg')) { await page.keyboard.press('Escape'); await wait(80); } } await menu('Edit', 'Properties'); await wait(80); const t = await dlgTitle(); await page.keyboard.press('Escape'); await wait(80); return t; };
  check('Edit lists Properties above Controller Properties', (await menu('Edit')).map(x => x[0]).join('|').includes('Properties|Controller Properties…'));
  await page.keyboard.press('Escape');
  check('organizer: a routine', (await propsOf('.org [data-org="rt:MainProgram/MainRoutine"]')) === 'Routine Properties - MainRoutine');
  check('organizer: a program', (await propsOf('.org [data-org="prog:MainProgram"]')) === 'Program Properties - MainProgram');
  check('organizer: a task', (await propsOf('.org [data-org="task:MainTask"]')) === 'Task Properties - MainTask');
  check('organizer: the controller', (await propsOf('.org [data-org="ctl"]')) === 'Controller Properties - Motor_Demo');
  check('organizer: a module', (await propsOf('.org [data-org="mod:1"]')).startsWith('Module Properties - [1]'));
  await page.click('#ladwrap rect.tap[data-ri="0"][data-p="0.0.0"]:not([data-opi])'); await wait(80);
  check('ladder: the tag of the selected instruction', (await propsOf()) === 'Tag Properties - Start_PB', JSON.stringify((await st()).sel));
  await page.click('#ladwrap rect.tap[data-rn][data-ri="1"]'); await wait(80);
  check('ladder: a rung selected gives the routine', (await propsOf()) === 'Routine Properties - MainRoutine');
  await ev(() => MTPS.App.run('tagsedit')); await wait(150);
  check('Tag Editor: the tag of the row', (await propsOf('#tagrows tr[data-tag="Motor_Run"] td.nm')) === 'Tag Properties - Motor_Run');

  console.log('Search > Find Previous (Shift+F3), Next Result / Previous Result (help v37)');
  await fresh(); await example();
  f = await menu('Search');
  check('Search: Find, Go To, Cross Reference, then Find Next, Find Previous, Next Result, Previous Result', ['Find…', 'Go To…', 'Cross Reference', '-', 'Find Next', 'Find Previous', 'Next Result', 'Previous Result'].every(x => f.some(y => y[0] === x)) && f.findIndex(x => x[0] === 'Find Previous') === f.findIndex(x => x[0] === 'Find Next') + 1, f.map(x => x[0]).join('|'));
  await pick('Find…'); await page.fill('#layer #p1', 'Motor_Run'); await clickBtn('OK'); await wait(100);
  const at = async () => { const x = (await st()).sel; return x ? x.ri + ':' + x.path.join('.') : '-'; };
  const a0 = await at();
  await page.keyboard.press('F3'); await wait(80); const a1 = await at();
  await page.keyboard.press('Shift+F3'); await wait(80);
  check('Shift+F3 finds the previous occurrence (back where F3 came from)', a0 !== a1 && (await at()) === a0, `${a0} ${a1} ${await at()}`);
  await page.keyboard.press('Shift+F3'); await wait(80);
  check('Find Previous wraps from the first to the last occurrence', (await at()).startsWith('4:'), await at());
  await menu('Search', 'Find Previous'); await wait(80);
  check('Search > Find Previous (mouse)', (await at()).startsWith('3:') || (await at()).startsWith('2:'), await at());
  await page.click('#ladwrap rect.tap[data-ri="1"][data-p="0"][data-opi="0"]', { button: 'right' }); await wait(120);
  await pick('Find All "Motor_Run"'); await wait(150);
  const found = await ev(() => MTPS.App.state.search.found.map(x => x.rung));
  check('Find All writes the Found lines to Search Results', found.length >= 4 && (await page.$('.derr .otab.on[data-otab="search"]')) !== null, JSON.stringify(found));
  await menu('Search', 'Next Result'); await wait(100);
  check('Next Result goes to the first Found line and marks it', (await st()).selRung === found[0] || ((await st()).sel && (await st()).sel.ri === found[0])) && (await page.$$eval('.derr .ln.cur', l => l.length)) === 1;
  await page.keyboard.press('F4'); await wait(100);
  const r2 = (await st()).sel ? (await st()).sel.ri : (await st()).selRung;
  check('F4: the next result', r2 === found[1], `${r2}`);
  await menu('Search', 'Previous Result'); await wait(100);
  const r3 = (await st()).sel ? (await st()).sel.ri : (await st()).selRung;
  check('Previous Result goes back one', r3 === found[0] && (await page.$eval('.derr .ln.cur', l => l.textContent)).includes(`Rung ${found[0]}`), `${r3}`);
};
