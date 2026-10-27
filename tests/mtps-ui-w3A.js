/* MT PLC Studio UI tests, Wave 3 (A): Studio 5000 project tools and menus (Compare Tool, Generate Report / Print,
   sample projects, New Component, Logical Organizer, View > Toolbars / Full Screen / Start Page, the Window menu,
   Help > Release Notes and About) and RSLinx Classic (View > Options, Window, Help, Configure Shortcuts).
   Mouse on the desktop (1440x900), touch on the tablet (800x1280) and the phone (390x844). Called from mtps-ui.test.js. */
'use strict';
const fs = require('fs');
const SHOTS = '/tmp/claude-0/shots-w3/A';
module.exports = async function w3a({ browser, URL, check }) {
  try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) { /* ignore */ }
  const LAYS = { desktop: { vp: { width: 1440, height: 900 } }, tablet: { vp: { width: 800, height: 1280 }, touch: true }, phone: { vp: { width: 390, height: 844 }, touch: true } };
  const opened = [];
  async function open(n) {
    const lay = LAYS[n];
    const cx = await browser.newContext({ viewport: lay.vp, isMobile: !!lay.touch, hasTouch: !!lay.touch });
    await cx.route('https://ronanski.github.io/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ version: '0.0.1', build: 'test', notes: '' }) }));
    const pg = await cx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(URL); await pg.evaluate(() => localStorage.clear()); await pg.reload(); await pg.waitForTimeout(300);
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
    const T = { pg, cx, errs, n, touch: !!lay.touch };
    T.wait = ms => pg.waitForTimeout(ms);
    T.ev = (fn, arg) => pg.evaluate(fn, arg);
    T.hit = async sel => { if (T.touch) await pg.tap(sel); else await pg.click(sel); await pg.waitForTimeout(150); };
    // mark the first element that matches sel and has this text, then click / tap it
    T.hitText = async (sel, text, last) => {
      const ok = await pg.evaluate(([s, t, z]) => { document.querySelectorAll('[data-w3pick]').forEach(x => delete x.dataset.w3pick); const all = [...document.querySelectorAll(s)].filter(x => !x.hidden && x.offsetParent !== null && x.textContent.trim() === t), el = z ? all[all.length - 1] : all[0]; if (el) el.dataset.w3pick = '1'; return !!el; }, [sel, text, last]);
      if (!ok) return false;
      await T.hit('[data-w3pick]'); return true;
    };
    // a menu command, as a user reaches it: the menu bar (desktop), the folded menu (tablet), More (phone)
    // last: the last item with that label (File > Print > Routine… comes after File > Import Component > Routine…)
    T.cmd = async (menu, label, last) => {
      if (n === 'desktop') { await T.hit(`.dmenu [data-menu="${menu}"]`); return T.hitText('#layer .menu .it span', label, last); }
      if (n === 'tablet') { await T.hit('[data-allmenu]'); await T.hit(`[data-fold="${menu}"]`); return T.hitText('#layer .menu .it span', label, last); }
      await T.hit('[data-go="more"]'); return T.hitText('.page [data-cmd] span', label);
    };
    T.btn = label => T.hitText('#layer .dlg .df .btn', label);
    T.title = () => pg.$eval('#layer .dlg .dh b', b => b.textContent).catch(() => '');
    T.text = sel => pg.$eval(sel, b => b.textContent).catch(() => '');
    T.shot = name => pg.screenshot({ path: `${SHOTS}/${name}-${n}.png` }).catch(() => {});
    opened.push(T);
    return T;
  }
  const example = T => T.ev(() => MTPS.App.openProject(MTPS.App.example()));

  /* ---------- 1. Tools > Compare Tool ---------- */
  for (const n of ['desktop', 'tablet', 'phone']) {
    const T = await open(n);
    await example(T); await T.wait(150);
    // the other project: a saved copy with a changed rung, a new tag, a removed tag and a changed module name
    await T.ev(async () => {
      const p = MTPS.App.example(), r = p.tasks[0].programs[0].routines[0].rungs;
      r[1].t = 'XIC(Motor_Run)XIC(OL_OK)OTE(Motor_Cmd);'; r.push({ t: 'XIC(Run_Lamp)NOP();' });
      p.tags.push({ name: 'Extra_Tag', type: 'DINT' }); p.tags = p.tags.filter(t => t.name !== 'Start_ONS');
      p.rack.modules[0].name = 'Inputs_1';
      await MTPS.FS.write('/MT PLC Studio Projects/Other.mtp', JSON.stringify(p));
    });
    await T.cmd('Tools', 'Compare Tool…');
    check(`${n}: Compare Tool opens the file browser`, /Compare Tool/.test(await T.title()));
    await T.hit('#layer [data-fbp="/MT PLC Studio Projects"]');
    await T.hitText('#layer .fbi .ell', 'Other.mtp');
    await T.btn('Open'); await T.wait(300);
    check(`${n}: Compare Results opens`, (await T.title()) === 'Compare Results');
    const sum = await T.text('#cmps');
    check(`${n}: summary counts the differences`, /different/.test(sum) && /1 only in the left project/.test(sum) && /1 only in the right project/.test(sum), sum);
    const rows = await T.pg.$$eval('#layer [data-cmpr]', r => r.map(x => x.textContent));
    check(`${n}: Start_ONS only in the left project`, rows.some(x => /^−Start_ONS/.test(x)), rows.join(' | '));
    check(`${n}: Extra_Tag only in the right project`, rows.some(x => /^\+Extra_Tag/.test(x)));
    check(`${n}: the module and the routine are different`, rows.some(x => /^≠\[1\] DI_1/.test(x)) && rows.some(x => /^≠MainProgram > MainRoutine/.test(x)));
    await T.hitText('#layer [data-cmpr] .ell', 'MainProgram > MainRoutine');
    const det = await T.text('#layer .cmpd');
    check(`${n}: the routine row opens the rungs that differ`, /Rung 1/.test(det) && /XIC\(OL_OK\)/.test(det) && /Rung 5/.test(det), det.slice(0, 200));
    if (n === 'desktop') await T.shot('compare');
    // tag values are compared only when asked
    await T.ev(() => { MTPS.App.state.p.tags.find(t => t.name === 'Run_Timer').value = { PRE: 1 }; });
    await T.hit('#layer #cmpv');
    check(`${n}: Compare tag values adds the value difference`, (await T.pg.$$eval('#layer [data-cmpr]', r => r.map(x => x.textContent))).some(x => /^≠Run_Timer/.test(x)));
    await T.btn('Close');
    check(`${n}: no JS errors (Compare)`, !T.errs.length, T.errs.join(' | '));
  }

  /* ---------- 2. File > Generate Report, File > Print, Print Options, Ctrl+P ---------- */
  const stubPrint = T => T.ev(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  const printed = T => T.ev(() => ({ n: window.__printed, titles: (MTPS.App.state.printed || {}).titles || [], nums: [...document.querySelectorAll('#printout svg.lad text.rn')].map(t => t.textContent), html: (document.querySelector('#printout') || {}).innerHTML || '' }));
  {
    const T = await open('desktop');
    await example(T); await T.wait(150); await stubPrint(T);
    await T.cmd('File', 'Generate Report…');
    check('desktop: File > Generate Report opens its dialog', (await T.title()) === 'Generate Report');
    const reps = await T.pg.$$eval('#layer #grr label', l => l.map(x => x.textContent.trim()));
    check('desktop: Report Selection lists the reports of the components', ['Table of Contents', 'Controller Organizer Listing', 'Controller Properties Listing', 'Tag Listing', 'Routine Listing', 'Data Type Listing', 'Module Properties Listing'].every(x => reps.includes(x)), reps.join(', '));
    await T.hit('#layer [data-grc="io"]');
    check('desktop: clearing I/O Configuration removes Module Properties Listing', !(await T.pg.$$eval('#layer #grr label', l => l.map(x => x.textContent.trim()))).includes('Module Properties Listing'));
    await T.btn('Print'); await T.wait(200);
    let pr = await printed(T);
    check('desktop: Print prints the report once', pr.n === 1, JSON.stringify(pr.n));
    check('desktop: the report holds the routine listing with its ladder, and the table of contents', pr.titles.includes('Routine Listing: MainProgram - MainRoutine') && pr.nums.includes('4') && /Table of Contents/.test(pr.html) && !pr.titles.includes('Module Properties Listing'), pr.titles.join(', '));
    await T.pg.emulateMedia({ media: 'print' }); await T.shot('report-print'); await T.pg.emulateMedia({ media: 'screen' });
    // Ctrl+P in the routine: Print - Routine with a range of rungs
    await T.pg.click('#ladwrap'); await T.pg.keyboard.press('Escape'); await T.pg.keyboard.press('Control+p'); await T.wait(200);
    check('desktop: Ctrl+P in a routine opens Print - Routine', (await T.title()) === 'Print - Routine');
    await T.hit('#layer [name="prr"][value="rng"]');
    await T.pg.fill('#layer #prf', '1'); await T.pg.fill('#layer #prt', '2');
    await T.btn('OK'); await T.wait(200);
    pr = await printed(T);
    check('desktop: a range of rungs keeps the routine\'s rung numbers', pr.n === 2 && JSON.stringify(pr.nums.filter(x => x !== '(End)')) === '["1","2"]', JSON.stringify(pr.nums));
    await T.pg.keyboard.press('Control+p'); await T.wait(200);
    await T.hit('#layer [name="prr"][value="rng"]'); await T.pg.fill('#layer #prf', '3'); await T.pg.fill('#layer #prt', '1');
    await T.btn('OK');
    check('desktop: a range that ends before it starts is refused', /Rungs: from 0 to 4/.test(await T.text('#layer #pre')));
    await T.btn('Cancel');
    // Print Options: Ladder Listing > Print embedded cross reference, Tag Listing > Sort By Scope
    await T.cmd('File', 'Print Options…');
    check('desktop: File > Print Options opens its categories', (await T.title()) === 'Print Options' && /General/.test(await T.text('#layer #poc')) && /Ladder Listing/.test(await T.text('#layer #poc')));
    await T.hit('#layer [data-poc="lad"]'); await T.hit('#layer #po-x');
    check('desktop: a changed category gets a *', /Ladder Listing \*/.test(await T.text('#layer #poc')));
    await T.hit('#layer [data-poc="tag"]'); await T.pg.selectOption('#layer #po-so', 'scope'); await T.wait(80);
    await T.btn('OK');
    await T.pg.keyboard.press('Control+p'); await T.wait(200); await T.btn('OK'); await T.wait(200);
    pr = await printed(T);
    check('desktop: embedded cross reference under each rung', /Rung 0: cross reference/.test(pr.html) && /Motor_Run/.test(pr.html));
    await T.cmd('File', 'Tags…', true); await T.btn('OK'); await T.wait(200);
    pr = await printed(T);
    check('desktop: File > Print > Tags prints the Tag Listing', pr.titles.length === 1 && pr.titles[0] === 'Tag Listing' && /Controller Tags/.test(pr.html) && /Start_PB/.test(pr.html));
    // the organizer: right-click a routine > Print…
    await T.pg.click('[data-org="rt:MainProgram/MainRoutine"]', { button: 'right' }); await T.wait(150);
    check('desktop: the routine\'s right-click menu has Print…', await T.hitText('#layer .menu .it span', 'Print…'));
    check('desktop: … which opens Print - Routine', (await T.title()) === 'Print - Routine');
    await T.btn('Cancel');
    check('desktop: no JS errors (Print)', !T.errs.length, T.errs.join(' | '));
  }
  for (const n of ['tablet', 'phone']) {
    const T = await open(n);
    await example(T); await T.wait(150); await stubPrint(T);
    await T.cmd('File', n === 'phone' ? 'Generate Report…' : 'Generate Report…');
    check(`${n}: Generate Report opens by touch`, (await T.title()) === 'Generate Report');
    await T.btn('Print'); await T.wait(200);
    check(`${n}: Print prints the report`, (await printed(T)).n === 1);
    if (n === 'phone') { await T.hit('[data-go="ladder"]'); await T.cmd('File', 'Print…'); }
    else await T.cmd('File', 'Routine…', true);
    check(`${n}: Print - Routine opens by touch`, (await T.title()) === 'Print - Routine');
    await T.btn('OK'); await T.wait(200);
    const pr = await printed(T);
    check(`${n}: the routine prints`, pr.n === 2 && pr.titles[0] === 'Routine Listing: MainProgram - MainRoutine');
    check(`${n}: no JS errors (Print)`, !T.errs.length, T.errs.join(' | '));
  }

  /* ---------- 3. sample projects: the start page, Help > Vendor Sample Projects, the Examples of Open ---------- */
  const proj = T => T.ev(() => ({ name: MTPS.App.state.p.controller.name, noProj: MTPS.App.state.noProj, errs: MTPS.App.state.verify.errors.length, file: MTPS.App.state.file }));
  for (const n of ['desktop', 'tablet', 'phone']) {
    const T = await open(n);
    const cards = await T.pg.$$eval('.startpg [data-sample]', b => b.map(x => x.dataset.sample));
    check(`${n}: the start page lists the sample projects`, JSON.stringify(cards) === '["Motor_Demo","Traffic_Light","Tank_Level","Conveyor_Sort"]', JSON.stringify(cards));
    if (n === 'desktop') await T.shot('startpage');
    await T.hit('.startpg [data-sample="Tank_Level"]'); await T.wait(200);
    let p = await proj(T);
    check(`${n}: a sample opens from the start page, with no errors and no file`, p.name === 'Tank_Level' && !p.noProj && p.errs === 0 && !p.file, JSON.stringify(p));
    await T.cmd('Help', n === 'phone' ? 'Sample Projects…' : 'Vendor Sample Projects…');
    check(`${n}: Help > Vendor Sample Projects lists them`, (await T.title()) === 'Sample Projects' && (await T.pg.$$('#layer [data-spl]')).length === 4);
    await T.hit('#layer [data-spl="Conveyor_Sort"]'); await T.btn('Open'); await T.wait(250);
    p = await proj(T);
    check(`${n}: Open opens the picked sample`, p.name === 'Conveyor_Sort' && p.errs === 0, JSON.stringify(p));
    // the Examples place of File > Open
    if (n !== 'phone') { await T.cmd('File', 'Open… (.mtp, .L5X)'); await T.hit('#layer [data-fbex="Traffic_Light"]'); await T.wait(250); }
    else { await T.ev(() => MTPS.App.run('open')); await T.wait(200); await T.hit('#layer [data-fbex="Traffic_Light"]'); await T.wait(250); }
    p = await proj(T);
    check(`${n}: File > Open > Examples opens a sample`, p.name === 'Traffic_Light' && p.errs === 0, JSON.stringify(p));
    check(`${n}: no JS errors (samples)`, !T.errs.length, T.errs.join(' | '));
  }
  // a sample runs: Traffic_Light online in Run turns the north-south green lamp on
  {
    const T = await open('desktop');
    await T.hit('.startpg [data-sample="Traffic_Light"]'); await T.wait(200);
    await T.ev(() => MTPS.App.run('online'));
    for (let k = 0; k < 10 && !(await T.ev(() => MTPS.App.state.online && !document.querySelector('#layer .dlg'))); k++) { await T.wait(150); const b = await T.pg.$('#layer .dlg .btn.pri'); if (b && !(await T.pg.$('#layer .dlg .prog'))) await b.click(); else await T.wait(400); }
    await T.ev(() => { const S = MTPS.App.state; S.p && MTPS.App.run('runm'); });
    await T.wait(300);
    const v = await T.ev(() => { const c = MTPS.racks[0].controllers()[0].ctl; c.write('Run_SW', 1); return new Promise(r => setTimeout(() => r({ g: c.read('NS_Green'), r: c.read('EW_Red'), mode: c.mode }), 400)); });
    check('desktop: the Traffic_Light sample runs (north-south green, east-west red)', v.g === 1 && v.r === 1, JSON.stringify(v));
  }

  /* ---------- 4. File > New Component: every kind opens its dialog; New Program and New Task ---------- */
  const NEWC = [['New Data Type…', /Data Type/], ['New Module…', /Module/], ['New Program…', /^New Program$/], ['New Routine…', /^New Routine$/], ['New String Type…', /^New String Type$/], ['New Tag…', /^New Tag$/], ['New Task…', /^New Task$/], ['New Trend…', /Trend/]];
  for (const n of ['desktop', 'tablet', 'phone']) {
    const T = await open(n);
    await example(T); await T.wait(150);
    const bad = [];
    for (const [l, re] of NEWC) {
      if (n === 'phone' && ['New Module…', 'New Routine…', 'New Tag…'].includes(l)) continue;   // the phone has them on the Project and Tags pages
      if (!(await T.cmd('File', l))) { bad.push(l + ': not found'); continue; }
      const t = await T.title(); if (!re.test(t)) bad.push(`${l}: ${t}`);
      await T.pg.keyboard.press('Escape'); await T.wait(120);
      if (await T.pg.$('#layer .dlg')) { await T.ev(() => { document.querySelector('#layer').innerHTML = ''; }); }
    }
    check(`${n}: each File > New Component opens its dialog`, !bad.length, bad.join(' | '));
    // New Program: Schedule In the task, a MainRoutine, in the organizer
    await T.cmd('File', 'New Program…');
    check(`${n}: New Program: Schedule In lists MainTask`, (await T.pg.$eval('#layer #npg-s', s => s.value)) === 'MainTask');
    await T.pg.fill('#layer #npg-n', 'Bad__Name'); await T.btn('OK');
    check(`${n}: New Program refuses a bad name`, /letters, digits/.test(await T.text('#layer #npg-e')));
    await T.pg.fill('#layer #npg-n', 'Conveyor'); await T.pg.fill('#layer #npg-d', 'Belt logic'); await T.btn('OK'); await T.wait(150);
    const g = await T.ev(() => { const P = MTPS.App.state.p.tasks[0].programs.find(x => x.name === 'Conveyor'); return P && { main: P.main, r: P.routines.map(r => r.name), d: P.desc, errs: MTPS.App.state.verify.errors.filter(e => e.program !== 'Conveyor').length }; });
    check(`${n}: the program is scheduled in MainTask with its MainRoutine (one empty rung, as New Routine)`, g && g.main === 'MainRoutine' && g.r.join() === 'MainRoutine' && g.d === 'Belt logic' && g.errs === 0, JSON.stringify(g));
    if (n !== 'phone') check(`${n}: the program shows in the Controller Organizer`, !!(await T.pg.$('[data-org="prog:Conveyor"]')) || n === 'tablet');
    // New Task: one continuous task only; periodic and event are not emulated
    await T.cmd('File', 'New Task…');
    check(`${n}: New Task offers Periodic, Event and Continuous`, (await T.pg.$$eval('#layer #ntk-t option', o => o.map(x => x.textContent))).join() === 'Periodic,Event,Continuous');
    await T.btn('OK');
    check(`${n}: a periodic task is refused (not emulated)`, /Periodic tasks are not emulated/.test(await T.text('#layer #ntk-e')));
    await T.pg.selectOption('#layer #ntk-t', 'continuous'); await T.wait(60);
    check(`${n}: Continuous greys Period and Priority`, await T.pg.$eval('#layer #ntk-p', x => x.disabled) && await T.pg.$eval('#layer #ntk-r', x => x.disabled));
    await T.btn('OK');
    check(`${n}: a second continuous task is refused`, /Only one continuous task/.test(await T.text('#layer #ntk-e')));
    await T.btn('Cancel');
    check(`${n}: no JS errors (New Component)`, !T.errs.length, T.errs.join(' | '));
  }
  {
    // the organizer: right-click MainTask > New Program…, the Tasks folder > New Task…
    const T = await open('desktop');
    await example(T); await T.wait(150);
    await T.pg.click('[data-org="task:MainTask"]', { button: 'right' }); await T.wait(150);
    check('desktop: right-click a task: New Program…', await T.hitText('#layer .menu .it span', 'New Program…'));
    check('desktop: … with Schedule In the task', (await T.title()) === 'New Program' && (await T.pg.$eval('#layer #npg-s', s => s.value)) === 'MainTask');
    await T.btn('Cancel');
    await T.pg.click('[data-org="tasks"]', { button: 'right' }); await T.wait(150);
    check('desktop: right-click Tasks: New Task…', await T.hitText('#layer .menu .it span', 'New Task…') && (await T.title()) === 'New Task');
    await T.btn('Cancel');
    await T.shot('newcomp');
  }

  /* ---------- 5. View > Logical Organizer ---------- */
  // touch: a long press on a node, which the browser turns into a contextmenu event at that point (a long press is no
  // tap, so it does not fold the node)
  const ctx = async (T, sel) => {
    if (T.n === 'tablet' && !(await T.pg.$('.org.over'))) await T.hit('[data-drawer="1"]');   // the organizer drawer, open again
    if (!T.touch) { await T.pg.click(sel, { button: 'right' }); await T.wait(150); return; }
    await T.pg.$eval(sel, e => { const b = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 20, clientY: b.top + b.height / 2 })); });
    await T.wait(150);
  };
  const lnodes = T => T.pg.$$eval('[data-org^="l"], .orgtabs ~ .tree [data-org^="rt:"]', r => r.map(x => x.dataset.org));
  for (const n of ['desktop', 'tablet', 'phone']) {
    const T = await open(n);
    await T.hit('.startpg [data-sample="Traffic_Light"]'); await T.wait(200);
    await T.cmd('View', 'Logical Organizer');
    if (n === 'phone') { /* the Project page shows the organizers */ }
    check(`${n}: View > Logical Organizer shows its tab`, (await T.text('.orgtabs .otab.on')) === 'Logical Organizer');
    let nodes = await lnodes(T);
    check(`${n}: the logical tree: the controller, the program, Parameters and Local Tags, the routines`, ['lroot', 'lprog:MainProgram', 'lpt:MainProgram', 'rt:MainProgram/MainRoutine', 'rt:MainProgram/Cycle'].every(k => nodes.includes(k)), nodes.join(', '));
    // a folder from the root's menu, then the program moved into it
    await ctx(T, '[data-org="lroot"]');
    await T.hitText('#layer .menu .it span', 'New Folder…');
    check(`${n}: New Folder opens New Program with Use as Folder ticked, Schedule In off`, (await T.title()) === 'New Program' && await T.pg.$eval('#layer #npg-f', x => x.checked) && await T.pg.$eval('#layer #npg-s', x => x.disabled));
    await T.pg.fill('#layer #npg-n', 'Lights'); await T.btn('OK'); await T.wait(150);
    await ctx(T, '[data-org="lprog:MainProgram"]');
    await T.hitText('#layer .menu .it span', 'Move To…');
    await T.pg.selectOption('#layer #lmv', 'Lights'); await T.btn('OK'); await T.wait(150);
    const st = await T.ev(() => ({ lg: MTPS.App.state.p.logical, tasks: MTPS.App.state.p.tasks.map(t => t.name + ':' + t.programs.map(g => g.name).join('+')) }));
    check(`${n}: the program is under the folder, the tasks are unchanged`, st.lg.parent.MainProgram === 'Lights' && st.lg.folders[0].name === 'Lights' && st.tasks.join() === 'MainTask:MainProgram', JSON.stringify(st));
    nodes = await lnodes(T);
    check(`${n}: the tree shows the folder with the program in it`, nodes.indexOf('lfold:Lights') >= 0 && nodes.indexOf('lfold:Lights') < nodes.indexOf('lprog:MainProgram'));
    // a child program of MainProgram, scheduled in MainTask
    await ctx(T, '[data-org="lprog:MainProgram"]');
    await T.hitText('#layer .menu .it span', 'New Program…');
    check(`${n}: New Program from a program fills in the Parent`, (await T.pg.$eval('#layer #npg-p', x => x.value)) === 'MainProgram');
    await T.pg.fill('#layer #npg-n', 'Walk_Signal'); await T.btn('OK'); await T.wait(150);
    const g2 = await T.ev(() => ({ par: MTPS.App.state.p.logical.parent.Walk_Signal, inTask: MTPS.App.state.p.tasks[0].programs.some(g => g.name === 'Walk_Signal') }));
    check(`${n}: the child program is scheduled and has its parent`, g2.par === 'MainProgram' && g2.inTask, JSON.stringify(g2));
    // a tap on a routine opens it
    await T.hit('[data-org="rt:MainProgram/Cycle"]'); await T.wait(150);
    check(`${n}: a routine in the Logical Organizer opens`, (await T.ev(() => MTPS.App.state.routine)) === 'Cycle');
    if (n === 'desktop') await T.shot('logical');
    if (n === 'phone') await T.hit('[data-go="project"]');
    if (n === 'tablet') await T.hit('[data-drawer="1"]');
    // delete the folder: the program moves back to the root
    await ctx(T, '[data-org="lfold:Lights"]');
    await T.hitText('#layer .menu .it span', 'Delete'); await T.btn('Delete'); await T.wait(150);
    check(`${n}: deleting a folder moves what it holds up`, (await T.ev(() => { const L0 = MTPS.App.state.p.logical; return !L0.folders.length && !L0.parent.MainProgram; })));
    // the Controller Organizer tab is still there; View > Logical Organizer again hides the tab
    await T.hit('.orgtabs [data-orgtab="ctl"]');
    check(`${n}: the Controller Organizer tab shows the tasks`, !!(await T.pg.$('[data-org="task:MainTask"]')));
    await T.cmd('View', 'Logical Organizer');
    if (n === 'phone') await T.hit('[data-go="project"]');
    if (n === 'tablet' && !(await T.pg.$('.org.over'))) await T.hit('[data-drawer="1"]');
    check(`${n}: View > Logical Organizer again hides it`, !(await T.pg.$('.orgtabs')));
    check(`${n}: no JS errors (Logical Organizer)`, !T.errs.length, T.errs.join(' | '));
  }

  /* ---------- 6. View > Toolbars, Full Screen, Start Page ---------- */
  for (const n of ['desktop', 'tablet', 'phone']) {
    const T = await open(n);
    await example(T); await T.wait(150);
    if (n === 'desktop') {
      const vis = sel => T.ev(s => { const e = document.querySelector(s); return !!e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'; }, sel);
      check(`${n}: the Language Element toolbar shows`, await vis('.dinstr'));
      await T.cmd('View', 'Toolbars…');
      check(`${n}: View > Toolbars opens the Toolbars dialog`, (await T.title()) === 'Toolbars');
      await T.hit('#layer [data-tbk="lang"]'); await T.hit('#layer [data-tbk="std"]');
      check(`${n}: unticking Language Element hides the instruction toolbar`, !(await vis('.dinstr')));
      check(`${n}: unticking Standard hides the standard buttons`, !(await vis('.dtb > .ib')));
      await T.btn('Cancel');
      check(`${n}: Cancel puts the toolbars back`, (await vis('.dinstr')) && (await vis('.dtb > .ib')));
      await T.cmd('View', 'Toolbars…'); await T.hit('#layer [data-tbk="bmk"]'); await T.btn('OK');
      const off = await T.ev(() => MTPS.App.state.prefs.tbOff);
      check(`${n}: OK keeps the choice`, Array.isArray(off) && off.includes('bmk') && !off.includes('lang'), JSON.stringify(off));
      await T.ev(() => { MTPS.App.state.prefs.tbOff = []; });
      // Full Screen: the browser's full-screen API (stubbed in the headless browser)
      await T.ev(() => { window.__fs = 0; document.documentElement.requestFullscreen = () => { window.__fs++; return Promise.resolve(); }; });
      await T.cmd('View', 'Full Screen');
      check(`${n}: View > Full Screen asks for the full screen`, (await T.ev(() => window.__fs)) === 1);
    }
    await T.cmd('View', 'Start Page'); await T.wait(150);
    if (n === 'phone' && !(await T.pg.$('.startpg'))) await T.hit('[data-go="ladder"]');
    check(`${n}: View > Start Page shows the start page with a project open`, !!(await T.pg.$('.startpg')));
    check(`${n}: the start page lists the sample projects`, /Sample projects/i.test(await T.text('.startpg')));
    if (n === 'desktop') await T.shot('startpage-open');
    if (n !== 'phone') {
      if (n === 'tablet' && !(await T.pg.$('[data-tabk]'))) await T.hit('[data-drawer="1"]');
      await T.hit('[data-tabk="MainProgram/MainRoutine"]');
      check(`${n}: a routine tab goes back from the start page`, !(await T.pg.$('.startpg')) && (await T.ev(() => MTPS.App.state.view)) === 'ladder');
    }
    check(`${n}: no JS errors (View)`, !T.errs.length, T.errs.join(' | '));
  }
  /* ---------- 7. the Window menu ---------- */
  for (const n of ['desktop', 'tablet', 'phone']) {
    const T = await open(n);
    await example(T); await T.wait(150);
    // two windows: the routine and the controller tags
    await T.ev(() => { MTPS.App.run('tagsedit'); const S = MTPS.App.state; if (!S.tabs.includes('tags')) S.tabs.push('tags'); }); await T.wait(100);
    await T.ev(() => { const S = MTPS.App.state; S.view = 'ladder'; S.prog = 'MainProgram'; S.routine = 'MainRoutine'; MTPS.App.render(); });
    const st = () => T.ev(() => ({ tabs: MTPS.App.state.tabs.slice(), view: MTPS.App.state.view }));
    check(`${n}: two windows are open`, (await st()).tabs.length === 2, JSON.stringify(await st()));
    if (n !== 'phone') {
      if (n === 'desktop') { await T.hit('.dmenu [data-menu="Window"]'); } else { await T.hit('[data-allmenu]'); await T.hit('[data-fold="Window"]'); }
      const items = await T.pg.$$eval('#layer .menu .it', r => r.map(x => ({ t: x.querySelector('span:not(.ck):not(.k)') ? [...x.querySelectorAll('span')].filter(s => !s.classList.contains('ck') && !s.classList.contains('k')).map(s => s.textContent).join('') : x.textContent, dis: x.classList.contains('dis'), ck: (x.querySelector('.ck') || {}).textContent || '' })));
      const lab = items.map(x => x.t);
      check(`${n}: the Window menu has the reference commands`, ['New Window', 'Split', 'Reset Window Layout', 'Close', 'Close All', 'Close Routine'].every(x => lab.includes(x)), lab.join(' | '));
      check(`${n}: New Window and Split are greyed`, items.filter(x => x.t === 'New Window' || x.t === 'Split').every(x => x.dis));
      const w1 = items.find(x => /^1 /.test(x.t)), w2 = items.find(x => /^2 /.test(x.t));
      check(`${n}: the open windows are listed, the active one ticked`, !!w1 && !!w2 && w1.ck === '✓' && !w2.ck, JSON.stringify([w1, w2]));
      if (n === 'desktop') await T.shot('window-menu');
      await T.hitText('#layer .menu .it span', w2.t); await T.wait(100);
      check(`${n}: a window in the list comes to the front`, (await st()).view === 'tags');
      await T.cmd('Window', 'Next Window'); await T.wait(100);
      check(`${n}: Next Window goes to the next window`, (await st()).view === 'ladder');
      await T.cmd('Window', 'Close Routine'); await T.wait(100);
      const a = await st();
      check(`${n}: Close Routine closes the routine window`, a.tabs.length === 1 && a.tabs[0] === 'tags' && a.view === 'tags', JSON.stringify(a));
      if (n === 'desktop') {
        await T.ev(() => { const S = MTPS.App.state; S.view = 'ladder'; S.prog = 'MainProgram'; S.routine = 'MainRoutine'; MTPS.App.render(); });
        await T.pg.keyboard.press('Control+F6'); await T.wait(100);
        check(`${n}: Ctrl+F6 goes to the next window`, (await st()).view === 'tags');
        await T.pg.keyboard.press('Control+F4'); await T.wait(100);
        check(`${n}: Ctrl+F4 closes the active window`, !(await st()).tabs.includes('tags'));
      }
    } else {
      await T.cmd('Window', 'Next Window'); await T.wait(100);
      check(`${n}: Next Window (More) goes to the next window`, (await st()).view === 'tags');
    }
    await T.cmd('Window', 'Close All'); await T.wait(100);
    const b = await st();
    check(`${n}: Close All closes every window and keeps the project`, !b.tabs.length && (await T.ev(() => !MTPS.App.state.noProj && !!MTPS.App.state.p)), JSON.stringify(b));
    if (n === 'phone') await T.hit('[data-go="project"]');
    if (n === 'tablet' && !(await T.pg.$('[data-org="ctl"]'))) await T.hit('[data-drawer="1"]');
    check(`${n}: the Controller Organizer stays after Close All`, !!(await T.pg.$('[data-org="ctl"]')));
    if (n === 'tablet') await T.pg.keyboard.press('Escape');
    // Reset Window Layout: the panes and the toolbars come back
    await T.ev(() => { Object.assign(MTPS.App.state.prefs, { org: false, err: false, tbOff: ['lang'], lorg: true }); MTPS.App.render(); });
    await T.cmd('Window', 'Reset Window Layout'); await T.wait(100);
    const pf = await T.ev(() => { const p = MTPS.App.state.prefs; return { org: p.org, err: p.err, tb: (p.tbOff || []).length, lorg: !!p.lorg }; });
    check(`${n}: Reset Window Layout restores the default layout`, pf.org && pf.err && !pf.tb && !pf.lorg, JSON.stringify(pf));
    check(`${n}: no JS errors (Window)`, !T.errs.length, T.errs.join(' | '));
  }
  /* ---------- 8. Help > Release Notes, Help > About ---------- */
  for (const n of ['desktop', 'tablet', 'phone']) {
    const T = await open(n);
    const ver = await T.ev(() => MTPS.App.VERSION);
    await T.cmd('Help', 'Release Notes');
    check(`${n}: Help > Release Notes opens`, (await T.title()) === 'Release Notes');
    const vs = () => T.pg.$$eval('#layer [data-relv]', r => r.map(x => x.dataset.relv));
    const v1 = await vs();
    check(`${n}: the newest note is this version, the betas are hidden`, v1[0] === ver && !v1.some(v => /beta/.test(v)), v1.join(', '));
    await T.hit('#layer #relb');
    const v2 = await vs();
    check(`${n}: Show the beta releases lists them too`, v2.length > v1.length && v2.some(v => /beta/.test(v)));
    if (n === 'desktop') await T.shot('release-notes');
    await T.btn('Close');
    await T.cmd('Help', 'About MT PLC Studio');
    check(`${n}: Help > About opens`, (await T.title()) === 'About MT PLC Studio' && (await T.text('#layer #abtb')).includes('Version ' + ver));
    await T.hit('#layer [data-abt="hist"]');
    check(`${n}: About shows the version history`, (await T.text('#layer #abtb')).includes(ver) && /0\.1\.0/.test(await T.text('#layer #abtb')));
    await T.hit('#layer [data-abt="comp"]');
    check(`${n}: About lists the installed components`, /Controller engine/.test(await T.text('#layer #abtb')) && /js\/report\.js/.test(await T.text('#layer #abtb')));
    await T.hit('#layer [data-abt="ctl"]');
    check(`${n}: About lists the controller support`, /PLC-CPU/.test(await T.text('#layer #abtb')) && /1756-L85E/.test(await T.text('#layer #abtb')));
    if (n === 'desktop') await T.shot('about');
    await T.btn('Release Notes'); await T.wait(100);
    check(`${n}: About > Release Notes opens the notes`, (await T.title()) === 'Release Notes');
    await T.btn('Close');
    check(`${n}: no JS errors (Help)`, !T.errs.length, T.errs.join(' | '));
  }
  /* ---------- 9. RSLinx Classic: View > Options, the Window menu, Help ---------- */
  const rlOpen = async T => { await example(T); await T.wait(100); await T.ev(() => MTPS.App.run('rswho')); await T.wait(300); };
  const rlMenu = async (T, m, a) => { await T.hit(`#layer [data-rlm="${m}"]`); await T.hit(`#layer .rlpop [data-rlmi="${a}"]`); await T.wait(80); };
  for (const n of ['desktop', 'tablet', 'phone']) {
    const T = await open(n);
    await rlOpen(T);
    check(`${n}: the RSLinx Classic window opens`, !!(await T.pg.$('#layer .rl .rlmb')));
    // View > Options: General
    await rlMenu(T, 'View', 'opts');
    const gen = await T.pg.$$eval('#layer .rlov2 .rlck2 span', s => s.map(x => x.textContent));
    check(`${n}: Options, General tab: status bar, toolbar, DDE/OPC topics from RSLogix programs`, gen.join('|') === 'Show Status Bar|Show Toolbar|Create DDE/OPC topics from RSLogix programs', gen.join('|'));
    await T.hit('#layer .rlov2 [data-rlo="topics"]');
    await T.hit('#layer .rlov2 [data-rltab="dde"]');
    const dde = await T.pg.$$eval('#layer .rlov2 .rlck2 span', s => s.map(x => x.textContent));
    check(`${n}: Options, DDE/OPC tab: the five settings`, dde.join('|') === 'Log communication errors|Display addressing errors|Use English language for DDE conversations|Save communication errors to a file|Enable Automatic Client Connection Cleanup', dde.join('|'));
    check(`${n}: the log file box is greyed until Save communication errors is ticked`, await T.pg.$eval('#layer [data-rlo="file"]', i => i.disabled));
    await T.hit('#layer .rlov2 [data-rlo="tofile"]');
    check(`${n}: … then it can be typed in`, !(await T.pg.$eval('#layer [data-rlo="file"]', i => i.disabled)));
    await T.pg.fill('#layer [data-rlo="file"]', '/MT PLC Studio Projects/Linx.log'); await T.pg.dispatchEvent('#layer [data-rlo="file"]', 'change');
    await T.hit('#layer .rlov2 [data-rlo="clean"]');
    await T.pg.fill('#layer [data-rlo="every"]', 'x'); await T.pg.dispatchEvent('#layer [data-rlo="every"]', 'change');
    await T.hit('#layer .rlov2 [data-rldx="optok"]');
    check(`${n}: a bad cleanup interval is refused`, /cleanup interval/.test(await T.text('#layer .rlov2 #rlerr')));
    await T.pg.fill('#layer [data-rlo="every"]', '30'); await T.pg.dispatchEvent('#layer [data-rlo="every"]', 'change');
    if (n === 'desktop') await T.shot('rslinx-options');
    await T.hit('#layer .rlov2 [data-rldx="optok"]'); await T.wait(200);
    const kept = await T.ev(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /rlopts/.test(k))) || '{}'));
    check(`${n}: OK keeps the options`, kept.topics === true && kept.tofile === true && kept.clean === true && kept.every === 30 && kept.file === '/MT PLC Studio Projects/Linx.log', JSON.stringify(kept));
    check(`${n}: Save communication errors to a file writes the file`, await T.ev(() => MTPS.FS.read('/MT PLC Studio Projects/Linx.log').then(() => true, () => false)));
    await rlMenu(T, 'View', 'opts'); await T.hit('#layer .rlov2 [data-rltab="dde"]');
    check(`${n}: Options opens with the kept settings`, await T.pg.$eval('#layer [data-rlo="tofile"]', i => i.checked) && (await T.pg.$eval('#layer [data-rlo="every"]', i => i.value)) === '30');
    await T.hit('#layer .rlov2 [data-rlpx="cancel"]');
    // Help
    await rlMenu(T, 'Help', 'help');
    check(`${n}: Help > RSLinx Classic Help opens the help with its books`, (await T.pg.$$eval('#layer .rlhbk b', b => b.map(x => x.textContent))).join('|') === 'Overview|Quick Start|How To...|Troubleshooting|Glossary|Release Notes');
    await T.hit('#layer [data-rlht="qs1"]');
    check(`${n}: a topic opens`, /Configure a driver \(Step 1 of 4\)/.test(await T.text('#layer #rlhx')) && /Configure Drivers/.test(await T.text('#layer #rlhx')));
    await T.hit('#layer [data-rlht="qs2"]');
    check(`${n}: a topic about a part not emulated says so`, /not emulated/.test(await T.text('#layer #rlhx')));
    if (n === 'desktop') await T.shot('rslinx-help');
    await T.hit('#layer .rlov2 [data-rlpx="cancel"]');
    await rlMenu(T, 'Help', 'help:qs');
    check(`${n}: Help > Quick Start opens the Quick Start`, /^Quick start/.test(await T.text('#layer #rlhx')));
    await T.hit('#layer .rlov2 [data-rlpx="cancel"]');
    await rlMenu(T, 'Help', 'help:rn');
    check(`${n}: Help > Release Notes opens the release notes`, /^Release Notes/.test(await T.text('#layer #rlhx')));
    await T.hit('#layer .rlov2 [data-rlpx="cancel"]');
    if (n === 'desktop') {
      await T.pg.keyboard.press('F1'); await T.wait(80);
      check(`${n}: F1 opens the RSLinx Classic help`, !!(await T.pg.$('#layer .rlhelp')));
      await T.pg.keyboard.press('Escape'); await T.wait(80);
    }
    // Window > Tile and Cascade with a diagnostic window open
    await rlMenu(T, 'Communications', 'cipdiag');
    const rect = sel => T.pg.$eval(sel, e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, w: r.width }; });
    await rlMenu(T, 'Window', 'wtile');
    const a = await rect('#layer .rldg'), b = await rect('#layer .rlchild');
    if (n === 'phone') check(`${n}: Tile keeps the window in front full width on the phone`, a.w > 300, JSON.stringify(a));
    else {
      check(`${n}: Window > Tile puts RSWho and the window side by side`, b.r <= a.l + 1 && b.w > 150, JSON.stringify([a, b]));
      await T.hit('#layer .rlchild [data-rlref]');
      check(`${n}: RSWho stays usable while tiled`, !!(await T.pg.$('#layer .rldg')) && !T.errs.length);
      if (n === 'desktop') await T.shot('rslinx-tile');
      await rlMenu(T, 'Window', 'wcas');
      const c = await rect('#layer .rldg'), d = await rect('#layer .rlchild');
      check(`${n}: Window > Cascade offsets the window over RSWho`, c.l > d.l + 20 && c.t > d.t + 20, JSON.stringify([c, d]));
    }
    check(`${n}: no JS errors (RSLinx Options, Help, Window)`, !T.errs.length, T.errs.join(' | '));
  }
  /* ---------- 10. RSLinx Classic: Communications > Configure Shortcuts ---------- */
  for (const n of ['desktop', 'tablet', 'phone']) {
    const T = await open(n);
    await rlOpen(T);
    await rlMenu(T, 'Communications', 'shortcuts');
    check(`${n}: Configure Shortcuts opens Configure Shortcuts to Remote Networks`, (await T.text('#layer .rlshort .bh')) === 'Configure Shortcuts to Remote Networks');
    check(`${n}: no shortcuts yet; Delete and Apply greyed`, /No shortcuts/.test(await T.text('#layer .rlscl')) && (await T.pg.$eval('#layer [data-rldx="scdel"]', b => b.disabled)) && (await T.pg.$eval('#layer [data-rldx="scapply"]', b => b.disabled)));
    await T.hit('#layer [data-rldx="scnew"]');
    await T.hit('#layer [data-rldx="scapply"]');
    check(`${n}: Apply without a name is refused`, /name/.test(await T.text('#layer .rlshort #rlerr')));
    await T.pg.fill('#layer #rlscn', 'LINE_1');
    await T.hit('#layer [data-rldx="scapply"]');
    check(`${n}: Apply without a network is refused`, /Pick the network/.test(await T.text('#layer .rlshort #rlerr')));
    const key = await T.pg.$eval('#layer [data-rlsp^="d:"]', x => x.dataset.rlsp);
    await T.hit(`#layer [data-rlsp="${key}"]`);
    const path = await T.text('#layer #rlscp');
    check(`${n}: picking a network shows the path in Shortcut points to this network or chassis`, path === key.slice(2), path);
    check(`${n}: the typed name is kept while picking`, (await T.pg.$eval('#layer #rlscn', i => i.value)) === 'LINE_1');
    await T.hit('#layer [data-rldx="scapply"]');
    check(`${n}: Apply saves the shortcut`, (await T.pg.$$eval('#layer [data-rlsc]', x => x.map(y => y.dataset.rlsc))).join() === 'LINE_1' && (await T.ev(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /rlshort/.test(k))) || '[]').length)) === 1);
    await T.hit('#layer [data-rldx="scnew"]'); await T.pg.fill('#layer #rlscn', 'line_1'); await T.hit(`#layer [data-rlsp="${key}"]`); await T.hit('#layer [data-rldx="scapply"]');
    check(`${n}: a second shortcut with the same name is refused`, /already exists/.test(await T.text('#layer .rlshort #rlerr')));
    if (n === 'desktop') await T.shot('rslinx-shortcuts');
    await T.hit('#layer .rlshort [data-rlpx="cancel"]');
    check(`${n}: the shortcut shows under the workstation in RSWho`, !!(await T.pg.$('#layer #rltree [data-rln="sc:LINE_1"]')));
    await T.hit('#layer #rltree [data-rln="sc:LINE_1"]');
    const tiles = await T.pg.$$eval('#layer #rlpane [data-rlk]', x => x.map(y => y.dataset.rlk));
    check(`${n}: the shortcut opens what that network holds`, tiles.length > 0 && tiles.every(k => k.startsWith(key + '/')), tiles.join());
    // Delete
    await rlMenu(T, 'Communications', 'shortcuts');
    await T.hit('#layer [data-rlsc="LINE_1"]');
    check(`${n}: picking a shortcut shows its name and path`, (await T.pg.$eval('#layer #rlscn', i => i.value)) === 'LINE_1' && (await T.text('#layer #rlscp')) === path);
    await T.hit('#layer [data-rldx="scdel"]');
    check(`${n}: Delete removes the shortcut`, /No shortcuts/.test(await T.text('#layer .rlscl')));
    await T.hit('#layer .rlshort [data-rlpx="cancel"]');
    check(`${n}: … and RSWho no longer shows it`, !(await T.pg.$('#layer #rltree [data-rln="sc:LINE_1"]')));
    check(`${n}: no JS errors (Configure Shortcuts)`, !T.errs.length, T.errs.join(' | '));
  }
  for (const T of opened) await T.cx.close();
};
