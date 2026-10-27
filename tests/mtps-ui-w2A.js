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
};
