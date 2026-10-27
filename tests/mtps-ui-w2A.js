/* MT PLC Studio UI tests, Wave 2 (A): L5X export and import of the whole project, File > Import Component, Change
   Controller, Select All on an instruction, Replace options, Browse Logic, Tools > Options, Help > Contents, the
   keyboard shortcuts and bookmarks. Mouse on the desktop, touch on the tablet and the phone. Called from mtps-ui.test.js. */
'use strict';
module.exports = async function w2A({ browser, page, URL, check, only }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const want = k => !only || only === k;
  const dlgTitle = (pg = page) => pg.$eval('#layer .dlg .dh b', b => b.textContent).catch(() => '');
  const dlgText = (pg = page) => pg.$eval('#layer .dlg .db', b => b.textContent).catch(() => '');
  const clickBtn = async (label, pg = page, tap = false) => { await pg.evaluate(l => { document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick); const b = [...document.querySelectorAll('#layer .dlg .df .btn')].find(x => x.textContent === l); if (b) b.dataset.wapick = '1'; }, label); if (tap) await pg.tap('#layer [data-wapick]'); else await pg.click('#layer [data-wapick]'); await pg.waitForTimeout(150); };
  const items = (pg = page) => pg.$$eval('#layer .menu > *', r => r.filter(x => !x.hidden).map(x => (x.classList.contains('hd') ? ['#' + x.textContent] : x.tagName === 'HR' ? ['-'] : [x.querySelector('span:not(.k):not(.ck)') ? x.querySelector('span:not(.k):not(.ck)').textContent : x.textContent, x.classList.contains('dis'), (x.querySelector('.k') || {}).textContent || ''])));
  async function pick(label, pg = page, tap = false) {
    const ok = await pg.evaluate(l => { document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick); const it = [...document.querySelectorAll('#layer .menu .it')].find(x => !x.hidden && x.querySelector('span:not(.k):not(.ck)') && x.querySelector('span:not(.k):not(.ck)').textContent === l); if (it) it.dataset.wapick = '1'; return !!it; }, label);
    if (!ok) return false;
    if (tap) await pg.tap('#layer [data-wapick]'); else await pg.click('#layer [data-wapick]');
    await pg.waitForTimeout(150);
    return true;
  }
  async function menu(name, label, pg = page) { await pg.click(`.dmenu [data-menu="${name}"]`); await pg.waitForTimeout(120); return label ? pick(label, pg) : items(pg); }
  async function fresh(pg = page, w = 1440, h = 900) {
    if (pg === page) await pg.setViewportSize({ width: w, height: h });
    await pg.goto(URL); await pg.evaluate(() => localStorage.clear()); await pg.reload(); await pg.waitForTimeout(300);
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(80);
  }
  const fileOpen = async (name, pg = page, tap = false) => {
    await pg.waitForFunction(() => document.querySelector('#layer .fbi, #layer .fbl .empty'), null, { timeout: 3000 }).catch(() => {});
    await pg.evaluate(n => { document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick); const r = [...document.querySelectorAll('#layer .fbi')].find(x => x.textContent.includes(n)); if (r) r.dataset.wapick = '1'; }, name);
    if (tap) await pg.tap('#layer [data-wapick]'); else await pg.click('#layer [data-wapick]');
    await pg.waitForTimeout(80);
    await clickBtn('Open', pg, tap); await pg.waitForTimeout(250);
  };
  const fileSave = async (name, pg = page) => { await pg.waitForFunction(() => document.querySelector('#layer #fbn'), null, { timeout: 3000 }).catch(() => {}); await pg.fill('#fbn', name); await clickBtn('Save', pg); await pg.waitForTimeout(250); };
  // a project with every part an L5X export carries
  const bigProject = () => ev(() => {
    const A = MTPS.App, p = A.example();
    p.controller.desc = 'Line 1 <filler> & capper';
    p.controller.slot = 0;
    p.dataTypes = [{ name: 'Motor', desc: 'A motor', members: [{ name: 'Run', type: 'BOOL', desc: 'Running' }, { name: 'Fault', type: 'BOOL' }, { name: 'Speed', type: 'REAL' }, { name: 'Hist', type: 'DINT', dim: 4 }, { name: 'Tm', type: 'TIMER' }] },
      { name: 'Line', members: [{ name: 'M1', type: 'Motor' }, { name: 'Count', type: 'INT' }] }];
    p.rack.modules = [{ slot: 1, type: 'PLC-DI16-24V', name: 'DI_1', desc: 'Inputs', rpi: 50 }, { slot: 2, type: 'PLC-DO16-RLY', name: 'DO_1', inhibit: true }, { slot: 3, type: 'PLC-AI4', name: 'AI_1', majorOnFail: true }, { slot: 4, type: 'PLC-AO4', name: 'AO_1' }];
    p.tags.push({ name: 'Level', type: 'REAL', value: 12.5, desc: 'Tank level' }, { name: 'Recipe', type: 'DINT', dim: 5, value: [1, 2, 3, 0, 9], style: 'Hex' },
      { name: 'Grid', type: 'INT', dim: [2, 3], value: [1, 0, 0, 0, 0, 6] }, { name: 'Fill', type: 'Line', value: { M1: { Run: 1, Fault: 0, Speed: 3.25, Hist: [0, 7, 0, 0], Tm: { PRE: 3000, ACC: 0, EN: 0, TT: 0, DN: 0 } }, Count: 4 } },
      { name: 'Ro', type: 'DINT', value: 77, access: 'Read Only', constant: true });
    p.tags.find(t => t.name === 'Run_Timer').value = { PRE: 5000, ACC: 120, EN: 0, TT: 0, DN: 0 };
    const g = p.tasks[0].programs[0];
    g.desc = 'Main program'; g.fault = 'Faults'; g.tags.push({ name: 'Local_N', type: 'DINT', value: 3, desc: 'program tag' });
    g.routines.push({ name: 'Faults', desc: 'Fault routine', rungs: [{ t: 'NOP();', c: 'clears <faults>' }] });
    g.routines[0].desc = 'Motor logic';
    p.tasks[0].watchdog = 750; p.tasks[0].desc = 'The continuous task'; p.tasks[0].noOutputs = true;
    p.tasks[0].programs.push({ name: 'Second', main: 'MainRoutine', inhibit: true, tags: [], routines: [{ name: 'MainRoutine', rungs: [{ t: 'XIC(Motor_Run)OTE(Run_Lamp);' }] }] });
    A.openProject(p, true); A.render();
    return true;
  });

  if (want('l5x')) {
    console.log('L5X export / import of the whole project (help v37: Import/Export a full project, Decorated data)');
    await fresh(); await bigProject();
    const r = await ev(() => {
      const A = MTPS.App, p = A.state.p, x = A.toL5X(p), q = A.fromL5X(x);
      const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'format' || k === 'version' ? undefined : v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, n) => { a[n] = v[n]; return a; }, {}) : v)));
      return { x, same: JSON.stringify(strip(q)) === JSON.stringify(strip(p)), q: strip(q), p: strip(p), err: MTPS.verify(q).errors.length };
    });
    const has = s => r.x.includes(s);
    check('the controller: name, description and slot (Local port address)', has('<Controller Use="Target" Name="Motor_Demo"') && has('<Description><![CDATA[Line 1 <filler> & capper]]></Description>') && /<Module Name="Local"[^>]*><Ports><Port Id="1" Address="0"/.test(r.x));
    check('the user-defined types: BOOL members in a hidden SINT host, as Studio 5000 writes them', has('<DataType Name="Motor" Family="NoFamily" Class="User">') && /<Member Name="ZZZZZZZZZZMotor0" DataType="SINT" Dimension="0" Radix="Decimal" Hidden="true"/.test(r.x) && has('<Member Name="Fault" DataType="BIT" Dimension="0" Radix="Decimal" Hidden="false" Target="ZZZZZZZZZZMotor0" BitNumber="1"'));
    check('a type comes after the types it uses (Motor before Line)', r.x.indexOf('DataType Name="Motor"') < r.x.indexOf('DataType Name="Line"'));
    check('the modules: catalog, revision, keying, RPI, inhibit and major fault', has('CatalogNumber="1756-OW16I"') && /<Module Name="DI_1"[^>]*Major="3" Minor="1"[^>]*><Description><!\[CDATA\[Inputs\]\]><\/Description><EKey State="CompatibleModule"\/>/.test(r.x) && has('RPI="50000" Type="Input"') && /<Module Name="DO_1"[^>]*Inhibited="true"/.test(r.x) && /<Module Name="AI_1"[^>]*MajorFault="true"/.test(r.x));
    check('a tag carries its offline value as Decorated data (REAL, array, structure)', has('<DataValue DataType="REAL" Radix="Float" Value="12.5"/>') && has('<Array DataType="DINT" Dimensions="5" Radix="Hex"><Element Index="[0]" Value="1"/>') && has('<Element Index="[1,2]" Value="6"/>') && has('<DataValueMember Name="PRE" DataType="DINT" Radix="Decimal" Value="5000"/>') && has('<StructureMember Name="M1" DataType="Motor">'));
    check('the programs (main, fault routine, inhibit), routines and the task (watchdog, outputs) with descriptions', has('FaultRoutineName="Faults"') && /<Program Name="Second"[^>]*Disabled="true"/.test(r.x) && has('<Routine Name="Faults" Type="RLL"><Description><![CDATA[Fault routine]]></Description>') && has('Watchdog="750" DisableUpdateOutputs="true"'));
    check('import gives back the same project (every field)', r.same, r.same ? '' : (() => { const a = JSON.stringify(r.q), b = JSON.stringify(r.p); let i = 0; while (a[i] === b[i]) i++; return a.slice(i - 80, i + 80) + ' ≠ ' + b.slice(i - 80, i + 80); })());
    check('the imported project verifies without errors', r.err === 0);
    // as a user: File > Export L5X, then File > Open the .L5X
    await menu('File', 'Export L5X…'); await fileSave('W2A_Full');
    await ev(() => { MTPS.App.openProject(MTPS.App.blank('Other'), true); MTPS.App.render(); });
    await menu('File', 'Open… (.mtp, .L5X)'); await page.selectOption('#fbt', 'l5x').catch(() => {}); await wait(150); await fileOpen('W2A_Full.L5X');
    const o = await ev(() => { const p = MTPS.App.state.p; return { n: p.controller.name, dt: (p.dataTypes || []).map(d => d.name).join(','), lv: (p.tags.find(t => t.name === 'Level') || {}).value, fill: JSON.stringify((p.tags.find(t => t.name === 'Fill') || {}).value), rpi: (p.rack.modules.find(m => m.slot === 1) || {}).rpi, progs: p.tasks[0].programs.length }; });
    check('File > Open of the exported .L5X: types, values, modules and programs are back', o.n === 'Motor_Demo' && o.dt === 'Motor,Line' && o.lv === 12.5 && /"Speed":3.25/.test(o.fill) && o.rpi === 50 && o.progs === 2, JSON.stringify(o));
  }
  if (want('imp')) {
    console.log('File > Import Component (help v37 File menu; About Import/Export of Components; Import Configuration)');
    await fresh(); await bigProject();
    const f = await menu('File');
    const ix = f.findIndex(x => x[0] === '#Import Component');
    check('File: an Import Component group with the reference\'s kinds (Add-On Instructions, Data Type, Equipment Phase, Program, Routine, String Type, Trend)', ix > 0 && f.slice(ix + 1, ix + 8).map(x => x[0]).join('|') === 'Add-On Instructions…|Data Type…|Equipment Phase…|Program…|Routine…|String Type…|Trend…', f.map(x => x[0]).join('|'));
    check('Data Type, Program and Routine are on; the kinds this app lacks are off', f.slice(ix + 1, ix + 8).map(x => (x[1] ? 0 : 1)).join('') === '0101100');
    await page.keyboard.press('Escape'); await wait(80);
    // export the routine, the program Second and the type Line from the organizer's right-click menus
    const orgRight = async k => { await page.click(`.org [data-org="${k}"]`, { button: 'right' }); await wait(120); };
    await ev(() => { const s = MTPS.App.state; s.prefs.collapsed = []; MTPS.App.render(); });
    await orgRight('rt:MainProgram/MainRoutine');
    check('right-click a routine: Export Routine…', (await items()).some(x => x[0] === 'Export Routine…'));
    await pick('Export Routine…'); await fileSave('W2A_Rtn');
    const x = await ev(() => MTPS.FS.read('/MT PLC Studio Projects/W2A_Rtn.L5X'));
    check('the routine file: TargetType Routine, with the tags it uses as context', /TargetType="Routine" TargetSubType="RLL" ContainsContext="true"/.test(x) && /<Routine Use="Target" Name="MainRoutine"/.test(x) && /<Tag Name="Start_PB" TagType="Alias"/.test(x) && !/<Tag Name="Level"/.test(x));
    await orgRight('prog:Second'); await pick('Export Program…'); await fileSave('W2A_Prog');
    await orgRight('dt:u:Line'); await pick('Export Data Type…'); await fileSave('W2A_Line');
    const xd = await ev(() => MTPS.FS.read('/MT PLC Studio Projects/W2A_Line.L5X'));
    check('the data type file: Line as the target, Motor (which it uses) as context', /TargetType="DataType"/.test(xd) && /<DataType Use="Target" Name="Line"/.test(xd) && /<DataType Use="Context" Name="Motor"/.test(xd));
    // a new project: import the three
    await ev(() => { MTPS.App.openProject(MTPS.App.blank('Target'), true); MTPS.App.render(); });
    await menu('File', 'Routine…'); await fileOpen('W2A_Rtn.L5X');
    check('Import Routine: the Import Configuration dialog', (await dlgTitle()) === 'Import Configuration');
    const rows = await page.$$eval('#ic-t tr', r => r.slice(1).map(y => [...y.children].slice(0, 3).map(c => c.textContent).join(':')));
    check('it lists the routine (MainRoutine exists: Overwrite) and its tags (Create)', rows[0] === 'Routine:MainRoutine:Overwrite' && rows.some(r => r === 'Tag:Motor_Run:Create'), rows.join(' | '));
    await page.fill('#ic-n', 'Motor_Logic'); await wait(80);
    check('a new final name: Create', (await page.$eval('#ic-t tr:nth-child(2)', r => r.textContent)).includes('Create'));
    await clickBtn('OK'); await wait(200);
    const st = await ev(() => { const s = MTPS.App.state, g = s.p.tasks[0].programs[0]; return { r: g.routines.map(y => y.name).join(','), open: s.routine, tags: s.p.tags.map(t => t.name).join(','), err: MTPS.verify(s.p).errors.filter(e => e.routine === "Motor_Logic").length, rungs: (g.routines.find(y => y.name === 'Motor_Logic') || { rungs: [] }).rungs.length }; });
    check('OK: the routine is in the program and open, with its rungs; the tags it uses were created', st.r === 'MainRoutine,Motor_Logic' && st.open === 'Motor_Logic' && st.rungs === 5 && /Start_PB/.test(st.tags) && /Run_Timer/.test(st.tags) && st.err === 0, JSON.stringify(st));
    await menu('File', 'Data Type…'); await fileOpen('W2A_Line.L5X'); await clickBtn('OK'); await wait(150);
    check('Import Data Type: Line and the Motor type it uses are created', (await ev(() => MTPS.App.state.p.dataTypes.map(d => d.name).join(','))) === 'Motor,Line');
    await menu('File', 'Program…'); await fileOpen('W2A_Prog.L5X');
    check('Import Program into MainTask, as a new program', (await page.$eval('#ic-i', s => s.value)) === 'MainTask' && (await page.$eval('#ic-t tr:nth-child(2)', r => r.textContent)).includes('Create'));
    await clickBtn('OK'); await wait(150);
    check('the program is scheduled in the task', (await ev(() => MTPS.App.state.p.tasks[0].programs.map(g => g.name).join(','))) === 'MainProgram,Second');
    await menu('File', 'Program…'); await fileOpen('W2A_Prog.L5X');
    check('the same program again: Overwrite', (await page.$eval('#ic-t tr:nth-child(2)', r => r.textContent)).includes('Overwrite'));
    await clickBtn('OK'); await wait(150);
    check('overwritten in place, not added twice', (await ev(() => MTPS.App.state.p.tasks[0].programs.map(g => g.name).join(','))) === 'MainProgram,Second');
    await menu('File', 'Routine…'); await fileOpen('W2A_Line.L5X');
    check('a data type file picked for Import Routine: an error, nothing opens', (await dlgTitle()) !== 'Import Configuration' && /not a Routine/.test(await ev(() => MTPS.App.state.msg)));
    // tablet (touch): the folding File menu
    const tctx = await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true });
    const tp = await tctx.newPage();
    await tp.goto(URL); await tp.waitForTimeout(300); await tp.keyboard.press('Escape');
    await tp.evaluate(t => { MTPS.App.openProject(MTPS.App.blank('Tab')); return MTPS.FS.write('/MT PLC Studio Projects/W2A_Rtn.L5X', t); }, x); await tp.waitForTimeout(150);
    await tp.tap('[data-allmenu]'); await tp.waitForTimeout(150); await tp.tap('[data-fold="File"]'); await tp.waitForTimeout(150);
    await pick('Routine…', tp, true); await fileOpen('W2A_Rtn.L5X', tp, true);
    await clickBtn('OK', tp, true); await tp.waitForTimeout(150);
    check('tablet (touch): File > Routine… overwrites MainRoutine with the imported rungs', (await tp.evaluate(() => MTPS.App.state.p.tasks[0].programs[0].routines.length)) === 1 && (await tp.evaluate(() => MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs.length)) === 5);
    await tctx.close();
    // phone (touch): More > Import Component…
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const pp = await pctx.newPage();
    await pp.goto(URL); await pp.waitForTimeout(300); await pp.keyboard.press('Escape');
    await pp.evaluate(t => { MTPS.App.openProject(MTPS.App.blank('Ph')); return MTPS.FS.write('/MT PLC Studio Projects/W2A_Line.L5X', t); }, xd); await pp.waitForTimeout(150);
    await pp.tap('[data-go="more"]'); await pp.waitForTimeout(150);
    await pp.tap('.page [data-cmd="impcomp"]'); await pp.waitForTimeout(200);
    await pick('Data Type…', pp, true); await fileOpen('W2A_Line.L5X', pp, true); await clickBtn('OK', pp, true); await pp.waitForTimeout(150);
    check('phone (touch): More > Import Component… > Data Type…', (await pp.evaluate(() => MTPS.App.state.p.dataTypes.map(d => d.name).join(','))) === 'Motor,Line');
    await pctx.close();
  }
  if (want('cc')) {
    console.log('Change Controller (help v37: Controller Properties General tab, Change Controller; Confirm controller type change)');
    await fresh(); await ev(() => { MTPS.App.openProject(MTPS.App.example(), true); MTPS.App.render(); });
    const rungs0 = await ev(() => JSON.stringify(MTPS.App.state.p.tasks));
    await menu('Edit', 'Controller Properties…');
    check('General tab: Vendor, Type, Revision and a Change Controller… button', /VendorMT PLC Studio/.test(await dlgText()) && /TypePLC-CPU Emulated controller/.test(await dlgText()) && /Revision1\.0/.test(await dlgText()) && (await page.$('#cp-cc')) !== null);
    await page.click('#cp-cc'); await wait(150);
    check('Change Controller: From and To, with the type and the revision', (await dlgTitle()) === 'Change Controller' && /FromTo/.test(await dlgText()) && (await page.$$eval('#cc-t option', o => o.map(x => x.value))).includes('1756-L85E'));
    await page.selectOption('#cc-t', '1756-L85E'); await wait(60);
    check('the revisions follow the type (1756-L85E: 33 to 37)', (await page.$$eval('#cc-r option', o => o.map(x => x.value).join(','))) === '33,34,35,36,37');
    await page.selectOption('#cc-r', '36'); await clickBtn('OK'); await wait(150);
    check('OK asks to confirm the type change, with what it does (Yes / No)', (await dlgTitle()) === 'Confirm Controller Type Change' && /logic, the tags/.test(await dlgText()));
    await clickBtn('Yes'); await wait(150);
    const st = await ev(() => ({ c: MTPS.App.state.p.controller, t: document.title, tasks: JSON.stringify(MTPS.App.state.p.tasks), x: MTPS.App.toL5X(MTPS.App.state.p), dirty: MTPS.App.state.dirty }));
    check('Yes: the project is a 1756-L85E, revision 36; the logic is kept', st.c.type === '1756-L85E' && st.c.rev === '36' && st.tasks === rungs0 && st.dirty === true && /\[1756-L85E 36\]/.test(st.t), st.t);
    check('the L5X export says ProcessorType 1756-L85E, MajorRev 36', /ProcessorType="1756-L85E" MajorRev="36"/.test(st.x) && !/MT PLC Studio: PLC-CPU/.test(st.x));
    check('an L5X of a 1756-L85E opens as a 1756-L85E', await ev(x => { const q = MTPS.App.fromL5X(x, true); return q.controller.type === '1756-L85E' && q.controller.rev === '36'; }, st.x));
    check('an L5X of a PLC-CPU project opens as PLC-CPU', await ev(() => MTPS.App.fromL5X(MTPS.App.toL5X(MTPS.App.example()), true).controller.type === 'PLC-CPU'));
    await page.click('.dtb [data-cmd="download"]'); await wait(300);
    check('Download of a 1756-L85E project to the emulator: Failed to download, the type does not match', (await dlgTitle()) === 'Download' && /Failed to download/.test(await dlgText()) && /1756-L85E 36/.test(await dlgText()));
    await clickBtn('Controller Properties…'); await wait(200);
    await page.click('#cp-cc'); await wait(150);
    await page.selectOption('#cc-t', 'PLC-CPU'); await clickBtn('OK'); await wait(150); await clickBtn('Yes'); await wait(150);
    check('changed back to PLC-CPU 1.0', await ev(() => MTPS.App.state.p.controller.type === 'PLC-CPU' && MTPS.App.state.p.controller.rev === '1.0'));
    await page.click('.dtb [data-cmd="download"]'); await wait(300);
    check('then Download goes on as before', (await dlgTitle()) === 'Download' && /Download to the controller/.test(await dlgText()));
    await page.keyboard.press('Escape'); await wait(80);
    // phone (touch): Project > Controller > Change Controller…
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const pp = await pctx.newPage();
    await pp.goto(URL); await pp.waitForTimeout(300); await pp.keyboard.press('Escape');
    await pp.evaluate(() => MTPS.App.openProject(MTPS.App.example())); await pp.waitForTimeout(150);
    await pp.tap('[data-go="project"]'); await pp.waitForTimeout(150); await pp.tap('[data-org="ctl"]'); await pp.waitForTimeout(200);
    if ((await dlgTitle(pp)) !== 'Controller Properties - Motor_Demo') { await pp.tap('[data-org="ctl"]'); await pp.waitForTimeout(200); }
    await pp.tap('#cp-cc'); await pp.waitForTimeout(150);
    await pp.selectOption('#cc-t', '1756-L71'); await clickBtn('OK', pp, true); await pp.waitForTimeout(150); await clickBtn('Yes', pp, true);
    check('phone (touch): Change Controller to a 1756-L71', await pp.evaluate(() => MTPS.App.state.p.controller.type === '1756-L71' && MTPS.App.state.p.controller.rev === '33'));
    await pctx.close();
  }
  if (want('selall')) {
    console.log('Select All with the caret on an instruction (help v37, Ladder Editor: Select All command)');
    await fresh(); await ev(() => { MTPS.App.openProject(MTPS.App.example(), true); MTPS.App.render(); });
    const selIn = (ri, pg = page) => pg.$$eval(`#ladwrap g[data-rg="${ri}"] rect.sel`, r => r.length);
    await page.click('#ladwrap rect.tap[data-ri="4"][data-p="1"]:not([data-opi])'); await wait(80);
    check('one instruction selected (ONS on rung 4)', (await selIn(4)) === 1);
    await page.keyboard.press('Control+a'); await wait(120);
    check('Ctrl+A: all 3 instructions of rung 4 are selected, not the rungs', (await selIn(4)) === 3 && (await selIn(0)) === 0 && (await page.$$('#ladwrap rect.rsel')).length === 0);
    await page.keyboard.press('Control+c'); await wait(80);
    await page.click('#ladwrap rect.tap[data-rn][data-ri="1"]'); await wait(80);
    check('a click elsewhere ends it', (await selIn(4)) === 0);
    await page.keyboard.press('Control+v'); await wait(120);
    const r1 = await ev(() => MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs[1].t);
    check('Paste on a selected rung: the three instructions at the start of rung 1', r1 === 'XIC(Motor_Run)ONS(Start_ONS)CTU(Start_Count,9999,0)XIC(Motor_Run)OTE(Motor_Cmd);', r1);
    await page.click('#ladwrap rect.tap[data-ri="4"][data-p="0"]:not([data-opi])'); await wait(80);
    await menu('Edit', 'Select All'); await wait(100);
    check('Edit > Select All does the same', (await selIn(4)) === 3);
    await page.keyboard.press('Delete'); await wait(120);
    check('Delete: the rung stays, without instructions', await ev(() => { const r = MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs; return r.length === 5 && r[4].t === ''; }));
    await page.keyboard.press('Control+z'); await wait(120);
    await page.click('#ladwrap rect.tap[data-rn][data-ri="2"]'); await wait(80);
    await page.keyboard.press('Control+a'); await wait(120);
    check('the caret on a rung: Select All still selects all the rungs', (await page.$$('#ladwrap rect.rsel')).length === 5);
    await page.keyboard.press('Escape'); await wait(80);
    // tablet (touch): tap an instruction, then Edit > Select All in the folding menu
    const tctx = await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true });
    const tp = await tctx.newPage();
    await tp.goto(URL); await tp.waitForTimeout(300); await tp.keyboard.press('Escape');
    await tp.evaluate(() => MTPS.App.openProject(MTPS.App.example())); await tp.waitForTimeout(150);
    await tp.tap('#ladwrap rect.tap[data-ri="0"][data-p="1"]:not([data-opi])'); await tp.waitForTimeout(150);
    await tp.tap('[data-allmenu]'); await tp.waitForTimeout(150); await tp.tap('[data-fold="Edit"]'); await tp.waitForTimeout(150);
    await pick('Select All', tp, true); await tp.waitForTimeout(150);
    check('tablet (touch): Select All on an instruction selects the 5 instructions and the branch of rung 0', (await selIn(0, tp)) === 6, String(await selIn(0, tp)));
    await tctx.close();
  }
  if (want('rep')) {
    console.log('Replace: wildcards, Limit To, Find Where, history (help v37: Replace dialog box parameters, Limit To options)');
    await fresh(); await ev(() => { const A = MTPS.App, p = A.example(); const g = p.tasks[0].programs[0]; g.routines.push({ name: 'Aux', rungs: [{ t: 'XIC(Motor_Run)OTE(Run_Lamp);' }] }); p.tasks[0].programs.push({ name: 'P2', routines: [{ name: 'Main2', rungs: [{ t: 'XIC(Motor_Run)OTE(Motor_Cmd);' }] }], tags: [] }); A.openProject(p, true); A.render(); });
    const R = (g, r) => ev(([g, r]) => MTPS.App.state.p.tasks[0].programs[g].routines[r].rungs.map(x => x.t), [g, r]);
    const rmsg = () => page.$eval('#layer #rp-e', e => e.textContent).then(async t => t || page.$eval('#layer #rp-m', e => e.textContent));
    await menu('Search', 'Replace…');
    check('Limit To: Text Only first, with the reference choices', (await page.$$eval('#rp-l option', o => o.map(x => x.textContent))).join('|') === 'Text Only|References to Exact Tag and Its Members|References to Tag|Forces|Edit Zones|Shorted Branches');
    check('Find Where: Current Routine, All Routines in Current Program, in Current Task, All Routines', (await page.$$eval('#rp-wh option', o => o.map(x => x.textContent))).join('|') === 'Current Routine: MainRoutine|All Routines in Current Program|All Routines in Current Task|All Routines');
    await page.click('#rp-wild');
    check('Use Wildcards: Match Whole Word Only on, and greyed', await page.$eval('#rp-whole', c => c.checked && c.disabled));
    await page.fill('#rp-f', 'Motor_**'); await page.fill('#rp-w', 'Pump_*'); await clickBtn('Find Next');
    check('"**" in Find What: refused', /Consecutive wildcard/.test(await rmsg()), await rmsg());
    await page.fill('#rp-f', 'Motor_*'); await page.fill('#rp-w', 'Pump_*_*'); await clickBtn('Replace All');
    check('more wildcards in Replace With than in Find What: refused', /same number or fewer wildcard/.test(await rmsg()), await rmsg());
    await page.fill('#rp-w', 'Pump_*'); await page.selectOption('#rp-wh', 'prog'); await clickBtn('Replace All'); await wait(150);
    const m1 = await R(0, 0), a1 = await R(0, 1), p2 = await R(1, 0);
    check('Motor_* to Pump_* in All Routines in Current Program: Motor_Run is Pump_Run, Motor_Cmd is Pump_Cmd', !m1.some(t => /Motor_/.test(t)) && m1[1] === 'XIC(Pump_Run)OTE(Pump_Cmd);' && a1[0] === 'XIC(Pump_Run)OTE(Run_Lamp);', JSON.stringify(m1));
    check('the other program is left alone', p2[0] === 'XIC(Motor_Run)OTE(Motor_Cmd);');
    check('Search Results names the scope', await ev(() => MTPS.App.state.search.lines[0] === 'Replacing "Motor_*" with "Pump_*" in All Routines in Current Program...'));
    check('the history: Find What and Replace With pull-down lists', (await page.$$eval('#findHist option', o => o.map(x => x.value))).join() === 'Motor_*' && (await page.$$eval('#repHist option', o => o.map(x => x.value))).join() === 'Pump_*' && (await page.$eval('#rp-f', i => i.getAttribute('list'))) === 'findHist');
    await clickBtn('Close'); await page.keyboard.press('Control+z'); await wait(120);
    // References to Tag: a tag and its members, as references, not text
    await menu('Search', 'Replace…');
    check('the history is kept for the next Replace', (await page.$$eval('#findHist option', o => o.map(x => x.value)))[0] === 'Motor_*');
    await page.click('#rp-wild');
    await page.selectOption('#rp-l', 'ref'); await page.fill('#rp-f', 'Run_Timer'); await page.fill('#rp-w', 'Lamp_Tmr'); await page.selectOption('#rp-wh', ''); await clickBtn('Replace All'); await wait(150);
    const m2 = await R(0, 0);
    check('References to Tag: Run_Timer and Run_Timer.DN become Lamp_Tmr and Lamp_Tmr.DN', m2[2] === 'XIC(Motor_Run)TON(Lamp_Tmr,5000,0);' && m2[3] === 'XIC(Lamp_Tmr.DN)OTE(Run_Lamp);', JSON.stringify(m2));
    await page.selectOption('#rp-l', 'exact'); await page.fill('#rp-f', 'Run'); await clickBtn('Find Next');
    check('References to Exact Tag: "Run" is no reference of Motor_Run', /not found/.test(await rmsg()), await rmsg());
    await clickBtn('Close');
    // Edit Zones and Shorted Branches: Find What is off
    await ev(() => { const r = MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs; r[3].z = 'i'; r[1].t = '[XIC(Motor_Run),]OTE(Motor_Cmd);'; MTPS.App.render(); });
    await menu('Search', 'Replace…');
    check('Limit To is remembered (References to Exact Tag)', (await page.$eval('#rp-l', s => s.value)) === 'exact');
    await page.selectOption('#rp-l', 'zones');
    check('Edit Zones: Find What and Replace With are off', await page.$eval('#rp-f', i => i.disabled) && await page.$eval('#rp-w', i => i.disabled));
    await clickBtn('Find Next');
    check('Edit Zones: Find Next goes to the rung of the edit zone', await ev(() => MTPS.App.state.selRung === 3) && /Rung 3, edit zone i/.test(await rmsg()), await rmsg());
    await clickBtn('Replace');
    check('Replace with a no-text Limit To: refused', /Text Only or a tag reference/.test(await rmsg()));
    await page.selectOption('#rp-l', 'short'); await clickBtn('Find Next');
    check('Shorted Branches: Find Next selects the branch with an empty level', await ev(() => { const s = MTPS.App.state.sel; return s && s.ri === 1 && s.br === true; }) && /Rung 1, shorted branch/.test(await rmsg()), await rmsg());
    await page.selectOption('#rp-l', 'text'); await clickBtn('Close');
    // tablet (touch): Search > Replace… from the folding menu, a wildcard Find Next
    const tctx = await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true });
    const tp = await tctx.newPage();
    await tp.goto(URL); await tp.waitForTimeout(300); await tp.keyboard.press('Escape');
    await tp.evaluate(() => MTPS.App.openProject(MTPS.App.example())); await tp.waitForTimeout(150);
    await tp.tap('[data-allmenu]'); await tp.waitForTimeout(150); await tp.tap('[data-fold="Search"]'); await tp.waitForTimeout(150);
    await pick('Replace…', tp, true); await tp.waitForTimeout(150);
    await tp.tap('#rp-wild'); await tp.fill('#rp-f', 'Run_*'); await clickBtn('Find Next', tp, true);
    check('tablet (touch): Use Wildcards, Run_* finds Run_Timer', /Rung 2, TON, Operand 0/.test(await tp.$eval('#layer #rp-m', e => e.textContent)), await tp.$eval('#layer #rp-m', e => e.textContent));
    await tctx.close();
  }
  if (want('browse')) {
    console.log('Search > Browse Logic (help v37: Browse Logic dialog box)');
    await fresh(); await ev(() => { const A = MTPS.App, p = A.example(); p.tasks[0].programs[0].desc = 'The motor line'; p.tasks[0].programs[0].routines.push({ name: 'Aux', desc: 'Lamps', rungs: [{ t: 'XIC(Motor_Run)OTE(Run_Lamp);', c: 'Lamp test' }] }); p.tasks[0].programs.push({ name: 'P2', main: 'Main2', routines: [{ name: 'Main2', rungs: [{ t: 'NOP();' }] }], tags: [] }); A.openProject(p, true); A.render(); });
    const rows = (pg = page) => pg.$$eval('#bl-t .row', r => r.map(x => x.textContent.trim()));
    const st = () => ev(() => ({ g: MTPS.App.state.prog, r: MTPS.App.state.routine, ri: MTPS.App.state.selRung, open: !!document.querySelector('#layer .dlg') }));
    const sm = (await menu('Search')).map(x => x[0]);
    check('Search menu: Browse Logic… after Go To…', sm.indexOf('Browse Logic…') === sm.indexOf('Go To…') + 1, sm.join('|'));
    await pick('Browse Logic…');
    check('Browse Logic: Find, Logic, Description, Go To', (await dlgTitle()) === 'Browse Logic' && (await page.$$eval('#layer .db label', l => l.map(x => x.textContent).join('|'))) === 'Find:|Logic:|Description:' && (await page.$$eval('#layer .df .btn', b => b.map(x => x.textContent))).includes('Go To'));
    const r0 = await rows();
    check('the tree: the programs, the current routine open with its rungs', r0[0] === '−MainProgram' && r0.includes('−MainRoutine') && r0.includes('+Aux') && r0.includes('+P2') && r0.some(x => /^Rung 4 XIC\(Motor_Run\)ONS/.test(x)), r0.join('|'));
    check('Description: the selected routine', (await page.$eval('#bl-d', d => d.textContent)) === 'Main routine');
    await page.click('#bl-t [data-blx="r:MainProgram/Aux"]'); await wait(60);
    check('+ opens Aux and shows its rung', (await rows()).some(x => /^Rung 0 XIC\(Motor_Run\)OTE\(Run_Lamp\)/.test(x)) && (await page.$eval('#bl-d', d => d.textContent)) === 'Lamps');
    await page.click('#bl-t [data-bl="n:MainProgram/Aux/0"]'); await wait(60);
    check('a rung: its comment in Description', (await page.$eval('#bl-d', d => d.textContent)) === 'Lamp test');
    await page.click('#bl-t [data-bl="g:MainProgram"]'); await wait(60);
    check('a program: its description', (await page.$eval('#bl-d', d => d.textContent)) === 'The motor line');
    await page.fill('#bl-f', 'ton'); await wait(60);
    const r1 = await rows();
    check('Find "ton": only the rung with TON, with its program and routine', r1.length === 3 && /^Rung 2 XIC\(Motor_Run\)TON/.test(r1[2]), r1.join('|'));
    await page.fill('#bl-f', 'main2'); await wait(60);
    check('Find a routine name: P2 and Main2', (await rows()).join('|') === '+P2|+Main2', (await rows()).join('|'));
    await page.fill('#bl-f', ''); await wait(60);
    await page.dblclick('#bl-t [data-bl="n:MainProgram/MainRoutine/3"]'); await wait(200);
    const s1 = await st();
    check('double-click a rung: the dialog closes, the rung is selected in the editor', !s1.open && s1.r === 'MainRoutine' && s1.ri === 3, JSON.stringify(s1));
    await menu('Search', 'Browse Logic…');
    await page.click('#bl-t [data-blx="r:MainProgram/Aux"]'); await page.click('#bl-t [data-bl="n:MainProgram/Aux/0"]');
    await clickBtn('Go To'); await wait(200);
    const s2 = await st();
    check('Go To: opens Aux at rung 0', !s2.open && s2.r === 'Aux' && s2.ri === 0, JSON.stringify(s2));
    // phone (touch): More > Browse Logic…, tap a program, Go To
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const pp = await pctx.newPage();
    await pp.goto(URL); await pp.waitForTimeout(300); await pp.keyboard.press('Escape');
    await pp.evaluate(() => { const A = MTPS.App, p = A.example(); p.tasks[0].programs.push({ name: 'P2', main: 'Main2', routines: [{ name: 'Main2', rungs: [{ t: 'NOP();' }] }], tags: [] }); A.openProject(p); });
    await pp.waitForTimeout(150);
    await pp.tap('[data-go="more"]'); await pp.waitForTimeout(150); await pp.tap('.page [data-cmd="browse"]'); await pp.waitForTimeout(150);
    await pp.tap('#bl-t [data-bl="g:P2"]'); await pp.waitForTimeout(80);
    await clickBtn('Go To', pp, true); await pp.waitForTimeout(200);
    check('phone (touch): tap P2, Go To opens its main routine', await pp.evaluate(() => MTPS.App.state.prog === 'P2' && MTPS.App.state.routine === 'Main2' && MTPS.App.state.area === 'ladder'));
    await pctx.close();
  }
  if (want('opt')) {
    console.log('Tools > Options (help v37: Workstation Options; Ladder Editor > Display preferences)');
    await fresh(); await ev(() => { const A = MTPS.App, p = A.example(); p.tasks[0].programs[0].routines[0].desc = 'Motor start and stop'; A.openProject(p, true); A.render(); });
    const lad = () => ev(() => { const s = document.querySelector('#ladwrap svg'); const n = c => s.querySelectorAll('text.' + c).length; return { rn: n('rn'), cm: s.querySelectorAll('text.cm:not(.rdsc)').length, ds: n('ds'), al: n('al'), rd: [...s.querySelectorAll('text.rdsc')].map(t => t.textContent).join(' ') }; });
    const l0 = await lad();
    check('by default: rung numbers, comments, operand descriptions and alias lines; no routine description', l0.rn === 6 && l0.cm >= 3 && l0.ds > 0 && l0.al > 0 && !l0.rd, JSON.stringify(l0));
    await menu('Tools', 'Options…');
    check('Options: Categories (Application, Ladder Editor, Display, Appearance), opens on Application', (await page.$$eval('#ocats .row', r => r.map(x => x.textContent))).join('|') === 'Application|Ladder Editor|Display|Appearance' && (await page.$eval('#ocats .row.on', r => r.textContent)) === 'Application' && await page.$eval('#ofc', x => x.offsetParent !== null));
    check('buttons Cancel, Apply, OK and Reset Category', (await page.$$eval('#layer .df .btn', b => b.map(x => x.textContent))).join(',') === 'Cancel,Apply,OK' && (await page.$('#oreset')) !== null);
    await page.click('#layer [data-ocat="ladv"]');
    const lbl = await page.$$eval('[data-opg="ladv"] label, [data-opg="ladv"] .grp', l => l.map(x => x.textContent.trim()));
    check('Ladder Editor > Display: Show Routine Description; Rung Display; Instruction Display', ['Show Routine Description', 'Rung Display', 'Show Rung Numbers', 'Show Rung Comments', 'Maximum Lines', 'Instruction Display', 'Show Main Operand Description', 'Show Tag Alias Information'].every(x => lbl.includes(x)), lbl.join('|'));
    await page.click('#ornum'); await page.click('#orcm'); await page.click('#oodsc'); await page.click('#oali'); await page.click('#ordsc');
    check('a changed category: a * after its name', (await page.$eval('#ocats .row.on', r => r.textContent)) === 'Display*');
    await clickBtn('Apply'); await wait(150);
    const l1 = await lad();
    check('Apply: the dialog stays, the ladder has no rung numbers (only End), comments, descriptions or alias lines; the routine description on top', (await dlgTitle()) === 'Options' && l1.rn === 1 && l1.cm === 0 && l1.ds === 0 && l1.al === 0 && l1.rd === 'Motor start and stop' && (await page.$eval('#ocats .row.on', r => r.textContent)) === 'Display', JSON.stringify(l1));
    await page.click('#oreset'); await wait(60);
    check('Reset Category: the defaults of the page', await page.$eval('#ornum', c => c.checked) && await page.$eval('#orcm', c => c.checked) && !(await page.$eval('#ordsc', c => c.checked)));
    await page.click('#orcm'); await page.fill('#oodl', '1'); await clickBtn('OK'); await wait(150);
    const l2 = await lad(), pr = await ev(() => MTPS.App.state.prefs.lad);
    check('OK: numbers back, comments still off, 1 description line; saved', l2.rn === 6 && l2.cm === 0 && l2.ds > 0 && !l2.rd && JSON.stringify(pr) === '{"cm":false,"descLines":1}', JSON.stringify([l2, pr]));
    await menu('Tools', 'Options…'); await page.click('#layer [data-ocat="ladv"]');
    check('the next time: the saved values', !(await page.$eval('#orcm', c => c.checked)) && (await page.$eval('#oodl', i => i.value)) === '1');
    await page.click('#orcm'); await page.fill('#oodl', ''); await clickBtn('Cancel'); await wait(100);
    check('Cancel keeps what was saved', (await lad()).cm === 0);
    await ev(() => { MTPS.App.state.prefs.lad = {}; MTPS.App.render(); });
    // tablet (touch): Show Rung Comments off from the More menu's Options
    const tctx = await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true });
    const tp = await tctx.newPage();
    await tp.goto(URL); await tp.waitForTimeout(300); await tp.keyboard.press('Escape');
    await tp.evaluate(() => MTPS.App.openProject(MTPS.App.example())); await tp.waitForTimeout(150);
    await tp.tap('[data-allmenu]'); await tp.waitForTimeout(150); await tp.tap('[data-fold="Tools"]'); await tp.waitForTimeout(150);
    await pick('Options…', tp, true); await tp.waitForTimeout(150);
    await tp.tap('#layer [data-ocat="ladv"]'); await tp.tap('#orcm'); await clickBtn('OK', tp, true); await tp.waitForTimeout(200);
    check('tablet (touch): Show Rung Comments off hides the comments', await tp.evaluate(() => document.querySelectorAll('#ladwrap svg text.cm').length === 0 && MTPS.App.state.prefs.lad.cm === false));
    await tctx.close();
  }
};
