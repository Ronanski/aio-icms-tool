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
  const clickBtn = async (label, pg = page) => { await pg.evaluate(l => { document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick); const b = [...document.querySelectorAll('#layer .dlg .df .btn')].find(x => x.textContent === l); if (b) b.dataset.wapick = '1'; }, label); await pg.click('#layer [data-wapick]'); await pg.waitForTimeout(150); };
  // the items of the open menu: [label, disabled]; a header row is ['#Header']
  const items = (pg = page) => pg.$$eval('#layer .menu > *', r => r.filter(x => !x.hidden).map(x => (x.classList.contains('hd') ? ['#' + x.textContent] : x.tagName === 'HR' ? ['-'] : [x.querySelector('span:not(.k):not(.ck)') ? x.querySelector('span:not(.k):not(.ck)').textContent : x.textContent, x.classList.contains('dis')])));
  // click (or tap) the item of the open menu with this label
  async function pick(label, pg = page, tap = false) {
    const ok = await pg.evaluate(l => { document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick); const it = [...document.querySelectorAll('#layer .menu .it')].find(x => !x.hidden && x.querySelector('span:not(.k):not(.ck)') && x.querySelector('span:not(.k):not(.ck)').textContent === l); if (it) it.dataset.wapick = '1'; return !!it; }, label);
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
  async function online(start = true) {
    if (start) await ev(() => MTPS.App.run('online'));
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
  check('Data Type, Routine, Tag and Module work; Program, Task and Trend are listed but off', ncs.filter(x => x[1]).map(x => x[0]).join('|') === 'New Program…|New Task…|New Trend…');
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

  console.log('Search > Replace (help v37: Replace dialog box parameters)');
  await fresh(); await example();
  const texts = () => ev(() => MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs.map(r => r.t));
  const rmsg = () => page.$eval('#layer #rp-e', e => e.textContent).then(async t => t || page.$eval('#layer #rp-m', e => e.textContent));
  await menu('Search', 'Replace…');
  check('Search > Replace… opens the Replace dialog', (await dlgTitle()) === 'Replace');
  const lbl = await page.$$eval('#layer .dlg .frow > label, #layer .dlg .frow > span, #layer .dlg .ockb', l => l.map(x => x.textContent.trim()));
  check('Find What, Replace With, Find Where, Wrap, Match Whole Word Only, Direction, Find Within (Instructions, Instruction Operands, Rung Comments)', ['Find What:', 'Replace With:', 'Find Where:', 'Wrap', 'Match Whole Word Only', 'Up', 'Down', 'Find Within:', 'Instructions', 'Instruction Operands', 'Rung Comments'].every(x => lbl.includes(x)), lbl.join('|'));
  check('buttons Find Next, Replace, Replace All, Close; Wrap on and Down by default', (await dlgBtns()).join(',') === 'Find Next,Replace,Replace All,Close' && await page.$eval('#rp-wrap', c => c.checked) && await page.$eval('#rp-down', c => c.checked));
  check('Find Where: the current routine or all routines', (await page.$$eval('#rp-wh option', o => o.map(x => x.textContent))).join('|') === 'Current Routine: MainRoutine|All Routines');
  await page.fill('#rp-f', 'Motor_Run'); await page.fill('#rp-w', 'Motor_On'); await page.click('#rp-whole');
  await clickBtn('Find Next');
  check('Find Next selects the first occurrence and says where', (await st()).sel && (await st()).sel.ri === 0 && /^Found: MainProgram - MainRoutine, Rung 0, XIC, Operand 0/.test(await rmsg()), await rmsg());
  await clickBtn('Replace');
  const rt1 = await texts();
  check('Replace replaces the selected occurrence and finds the next one', rt1[0].startsWith('[XIC(Start_PB),XIC(Motor_On)]') && /Motor_Run/.test(rt1[0]) && (await page.$('#layer .dlg')) !== null && /^Found:/.test(await rmsg()), rt1[0]);
  await clickBtn('Replace All'); await wait(150);
  const rt2 = await texts();
  check('Replace All replaces every other one', !rt2.some(t => /Motor_Run/.test(t)) && rt2.filter(t => /Motor_On/.test(t)).length >= 4, JSON.stringify(rt2));
  check('the results go to Search Results ("Complete - n occurrence(s) replaced.")', await ev(() => { const l = MTPS.App.state.search.lines; return /^Complete - \d+ occurrence\(s\) replaced\.$/.test(l[l.length - 1]) && l.some(x => x.startsWith('Replaced: MainProgram - MainRoutine, Rung')); }) && (await page.$('.derr .otab.on[data-otab="search"]')) !== null);
  await clickBtn('Close');
  await page.keyboard.press('Control+z'); await wait(120);
  check('Replace All is one Undo step (the single Replace stays)', (await texts()).join('').split('Motor_On').length - 1 === 1, JSON.stringify(await texts()));
  await page.keyboard.press('Control+h'); await wait(120);
  check('Ctrl+H opens Replace', (await dlgTitle()) === 'Replace');
  await page.fill('#rp-f', 'OTE'); await page.fill('#rp-w', 'BAD'); await page.click('#rp-ops'); await page.click('#rp-cm');
  await clickBtn('Find Next'); await clickBtn('Replace');
  check('an instruction replaced by a name that is no instruction: "Fail to replace element"', /^Fail to replace element/.test(await rmsg()), await rmsg());
  await page.fill('#rp-w', 'OTL'); await clickBtn('Replace');
  check('Instructions only: OTE becomes OTL, with its operand', (await texts()).some(t => /OTL\(Motor_(Run|Cmd)\)/.test(t)), JSON.stringify(await texts()));
  await page.fill('#rp-f', 'seal-in'); await page.fill('#rp-w', 'latch'); await page.click('#rp-ins'); await page.click('#rp-cm');
  await clickBtn('Replace All');
  check('Rung Comments only: the comment text is replaced', await ev(() => /latch/.test(MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs[0].c)));
  await page.fill('#rp-f', 'NoSuchThing'); await clickBtn('Find Next');
  check('nothing found: a message, the dialog stays', /not found/.test(await rmsg()));
  await clickBtn('Close');
  await example();
  check('online for the next step', await online());
  await menu('Search', 'Replace…');
  await page.fill('#rp-f', 'Start_PB'); await page.fill('#rp-w', 'X'); await clickBtn('Replace All');
  check('online: "Cannot replace logic, tags or comments while online."', (await rmsg()) === 'Cannot replace logic, tags or comments while online.');
  await clickBtn('Close');
  const p4 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const pq = await p4.newPage();
  await pq.goto(URL); await pq.waitForTimeout(300); await pq.keyboard.press('Escape');
  await pq.evaluate(() => MTPS.App.openProject(MTPS.App.example())); await pq.waitForTimeout(150);
  await pq.tap('[data-go="more"]'); await pq.waitForTimeout(150); await pq.tap('.page [data-cmd="replace"]'); await pq.waitForTimeout(150);
  check('phone (touch): More > Replace… opens the dialog', (await pq.$eval('#layer .dlg .dh b', b => b.textContent).catch(() => '')) === 'Replace');
  await pq.fill('#rp-f', 'Start_PB'); await pq.fill('#rp-w', 'Go_PB');
  await clickBtn('Replace All', pq);
  check('phone: Replace All works', await pq.evaluate(() => MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs[0].t.includes('Go_PB')));
  await p4.close();

  console.log('Communications > Select Recent Path (help v37: go online using a recent communications path)');
  await fresh(); await example();
  f = await menu('Communications');
  check('Communications: Who Active, then Select Recent Path… (off while no path was used)', f.findIndex(x => x[0] === 'Select Recent Path…') === f.findIndex(x => x[0] === 'Who Active') + 1 && f.find(x => x[0] === 'Select Recent Path…')[1] === true, f.map(x => x[0]).join('|'));
  await page.keyboard.press('Escape');
  await menu('Communications', 'Who Active');
  await page.waitForFunction(() => document.querySelector('#wa-rows [data-wa]'), null, { timeout: 4000 }).catch(() => {});
  const was = await page.$$eval('#wa-rows [data-wa]', r => r.map(x => x.dataset.wa));
  await page.click(`#wa-rows [data-wa="${was[was.length - 1].replace(/\\/g, '\\\\')}"]`); await wait(150);
  await clickBtn('Set Project Path'); await clickBtn('Close'); await wait(100);
  const p1 = await ev(() => MTPS.App.state.prefs.paths[0]);
  check('Set Project Path in Who Active remembers the path', p1 === was[was.length - 1], `${p1} ${was}`);
  await menu('Communications', 'Select Recent Path…');
  check('Select Recent Path lists the paths used, newest first', (await dlgTitle()) === 'Select Recent Path' && (await page.$$eval('#rpl [data-rpath]', r => r.map(x => x.dataset.rpath)))[0] === p1 && (await dlgBtns()).join(',') === 'Cancel,Set Project Path,Go Online');
  await clickBtn('Go Online');
  check('Go Online goes online at that path', await online(false));
  await ev(() => MTPS.App.run('offline')); await wait(100);
  const t4 = await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true });
  const ts = await t4.newPage();
  await ts.goto(URL); await ts.waitForTimeout(300); await ts.keyboard.press('Escape');
  await ts.evaluate(p => { MTPS.App.state.prefs.paths = [p, 'VBP-1\\3']; MTPS.App.openProject(MTPS.App.example()); }, p1); await ts.waitForTimeout(150);
  await ts.tap('[data-allmenu]'); await ts.waitForTimeout(150); await ts.tap('[data-fold="Communications"]'); await ts.waitForTimeout(150);
  await pick('Select Recent Path…', ts, true);
  await ts.tap('#rpl [data-rpath="VBP-1\\\\3"]'); await ts.waitForTimeout(100);
  await clickBtn('Set Project Path', ts);
  check('tablet (touch): pick a recent path and Set Project Path', (await ts.evaluate(() => document.querySelector('.tstat .pathbar .pv') ? document.querySelector('.tstat .pathbar .pv').textContent : '')) === 'VBP-1\\3');
  await t4.close();

  console.log('Communications > Go To Faults (help v37: the Major Faults tab of Controller Properties)');
  await fresh();
  // rung 2 times all the time, so a negative preset written online is a major fault (Type 4, Code 34)
  const faulty = () => { const p = MTPS.App.example(); p.tasks[0].programs[0].routines[0].rungs[2].t = 'TON(Run_Timer,5000,0);'; MTPS.App.openProject(p); };
  await ev(faulty); await wait(120);
  f = await menu('Communications');
  check('Go To Faults is listed after Clear Faults, off without a major fault', f.findIndex(x => x[0] === 'Go To Faults') === f.findIndex(x => x[0] === 'Clear Faults') + 1 && f.find(x => x[0] === 'Go To Faults')[1] === true);
  await page.keyboard.press('Escape');
  check('online for the next step', await online());
  await ev(() => { MTPS.App.run('runm'); MTPS.App.ctl.write('Run_Timer.PRE', -5); }); await wait(400);
  check('the controller faulted', await ev(() => !!MTPS.App.ctl.fault), await ev(() => JSON.stringify(MTPS.App.ctl.fault)));
  await menu('Communications', 'Go To Faults');
  check('Go To Faults opens Controller Properties on the Major Faults tab', (await dlgTitle()) === 'Controller Properties - Motor_Demo' && (await page.$eval('#layer [data-dt].on', t => t.textContent)).startsWith('Major Faults') && (await page.$eval('#layer [data-pane="maj"]', p => !p.hidden && p.textContent.includes('Code 34'))));
  await page.keyboard.press('Escape');
  const p5 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const pf = await p5.newPage();
  await pf.goto(URL); await pf.waitForTimeout(300); await pf.keyboard.press('Escape');
  await pf.evaluate(faulty); await pf.waitForTimeout(150);
  await pf.evaluate(() => MTPS.App.run('online')); await pf.waitForTimeout(150);
  for (let k = 0; k < 8 && !(await pf.evaluate(() => MTPS.App.state.online && !document.querySelector('#layer .dlg'))); k++) { await pf.waitForTimeout(150); const b = await pf.$('#layer .dlg .btn.pri'); if (b && !(await pf.$('#layer .dlg .prog'))) await b.tap(); else await pf.waitForTimeout(500); }
  await pf.evaluate(() => { MTPS.App.run('runm'); MTPS.App.ctl.write('Run_Timer.PRE', -5); }); await pf.waitForTimeout(400);
  await pf.tap('[data-go="controller"]'); await pf.waitForTimeout(150);
  await pf.tap('#ctlpage [data-cmd="gofaults"]'); await pf.waitForTimeout(150);
  check('phone (touch): Controller > Go To Faults', (await pf.$eval('#layer [data-dt].on', t => t.textContent).catch(() => '')).startsWith('Major Faults'));
  await p5.close();
};
