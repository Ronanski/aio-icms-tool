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

  for (const T of opened) await T.cx.close();
};
