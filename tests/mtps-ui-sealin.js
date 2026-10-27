/* MT PLC Studio UI test: the owner's own way of making a program, on the tablet, by touch only (owner 2026-10-27:
   "maggawa ka ng kht simpleng motor seal in program"). New Project, two modules through the I/O Configuration,
   XIC / XIC / OTE from the tiles with New "tag" as aliases of the I/O points, a branch for the seal-in, Verify,
   Download, Run Mode, then START and STOP on the emulator's input module and the output lamp of the output module.
   Also: a "?" left on the rung is set by tapping the instruction again, and the I/O window of an output module shows
   only its outputs. Called from mtps-ui.test.js. */
'use strict';
const fs = require('fs');
module.exports = async function sealin({ browser, URL, check }) {
  const SHOTS = '/tmp/claude-0/shots-sealin';
  fs.mkdirSync(SHOTS, { recursive: true });
  console.log('Motor seal-in made by touch on the tablet, as the owner makes it (owner 2026-10-27)');
  const ctx = await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true });
  const pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  const wait = ms => pg.waitForTimeout(ms || 300);
  const vis = s => pg.locator(s).locator('visible=true').first();
  const tap = async s => { await vis(s).tap({ timeout: 4000 }); await wait(350); };
  const layer = () => pg.$eval('#layer', x => x.innerText).catch(() => '');
  const T = t => `button[title="${t}"], button[aria-label="${t}"]`;
  const hold = async s => {
    await vis(s).scrollIntoViewIfNeeded(); const b = await vis(s).boundingBox(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    const c = await ctx.newCDPSession(pg);
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await wait(800);
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(400);
  };
  const hit = async p => {
    const b = await pg.evaluate(p => { const t = document.querySelector(`#ladwrap [data-p="${p}"]:not([data-opi])`); if (!t) return null; t.scrollIntoView({ block: 'center' }); const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, p);
    if (b) { await pg.touchscreen.tap(b.x, b.y); await wait(); }
    return !!b;
  };
  const rung = () => pg.evaluate(() => MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs[0].t);
  const shot = n => pg.screenshot({ path: `${SHOTS}/tablet-${n}.png` }).catch(() => {});
  // a tile, then the name typed in the operand box, then New "name" as an alias of an I/O point picked in the browser
  const ins = async (tile, name, alias) => {
    await tap(T(tile));
    await pg.fill('#layer .dlg input >> nth=1', name); await wait(200);
    if (alias) {
      await tap(`#layer :text("New \\"${name}\\"")`);
      await pg.selectOption('#layer #tk', 'alias'); await wait(200);
      const x = alias.split('.Data.')[0];
      await tap(`#layer #asg [data-abx="${x}"]`); await tap(`#layer #asg [data-abb="${x}.Data"]`); await tap(`#layer #asg [data-abp="${alias}"]`);
      await tap('#layer .dlg .df .btn >> nth=-1');
    }
    if (/Rung \d+ ·/.test(await layer())) await tap('#layer .btn.pri');
  };

  await pg.goto(URL); await pg.evaluate(() => localStorage.clear()); await pg.reload(); await wait(800);
  // New Project
  await tap('button:has-text("New Project")');
  await pg.fill('#layer input >> nth=0', 'Line1'); await tap('#layer .btn.pri'); await wait(300);
  check('tablet: New Project Line1 opens its MainRoutine', await pg.evaluate(() => MTPS.App.state.p.controller.name === 'Line1'));
  // the modules, by a hold on the Backplane of the I/O Configuration
  await tap(T('Controller Organizer'));
  for (const cat of ['PLC-DI16-24V', 'PLC-DO16-24V']) {
    await hold('[data-org="bp"]');
    if (!/Select Module Type/.test(await layer())) await tap('#layer .it:has-text("New Module")');
    await tap(`#layer :text-is("${cat}")`); await tap('#layer button:has-text("Create")'); await tap('#layer .btn.pri');
  }
  check('tablet: the DI and DO modules show in the I/O Configuration', !!(await pg.$('[data-org="mod:1"]')) && !!(await pg.$('[data-org="mod:2"]')));
  await tap('[data-drawer="0"]');
  // the rung
  await ins('Examine If Closed', 'Start_PB', 'Local:1:I.Data.0');
  await ins('Examine If Closed', 'Stop_PB', 'Local:1:I.Data.1');
  await ins('Output Energize', 'Motor', 'Local:2:O.Data.0');
  check('tablet: XIC Start_PB, XIC Stop_PB, OTE Motor from the tiles, the tags made with New "tag" as aliases', (await rung()) === 'XIC(Start_PB)XIC(Stop_PB)OTE(Motor);' &&
    await pg.evaluate(() => MTPS.App.state.p.tasks[0].programs[0].tags.map(t => t.name + '>' + t.alias).join() === 'Start_PB>Local:1:I.Data.0,Stop_PB>Local:1:I.Data.1,Motor>Local:2:O.Data.0'));
  check('tablet: the ladder shows each tag with its alias under it', await pg.evaluate(() => { const t = [...document.querySelectorAll('#ladwrap svg text')].map(x => x.textContent); return ['Start_PB', '<Local:1:I.Data.0>', 'Motor', '<Local:2:O.Data.0>'].every(s => t.includes(s)); }));
  check('tablet: the * of a changed instruction does not cover the alias line', await pg.evaluate(() => {
    const al = [...document.querySelectorAll('#ladwrap svg text')].filter(t => /^</.test(t.textContent)).map(t => t.getBoundingClientRect());
    return [...document.querySelectorAll('#ladwrap svg .dty')].every(d => { const r = d.getBoundingClientRect(); return !al.some(a => r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top); });
  }));
  await hit('0'); await tap(T('Branch'));
  await hit('0.1'); await tap(T('Examine If Closed')); await tap('#layer :text-is("Motor")'); await tap('#layer .btn.pri');
  check('tablet: the seal-in branch: Motor in parallel with Start_PB', (await rung()) === '[XIC(Start_PB),XIC(Motor)]XIC(Stop_PB)OTE(Motor);', await rung());
  await tap('button:has-text("Verify")'); await wait(300);
  check('tablet: Verify: 0 errors', /Complete - 0 error\(s\)/.test(await pg.evaluate(() => document.body.innerText)));
  await shot('sealin-offline');
  // Download, Run
  await tap('button:has-text("Online")'); await tap('#layer button:has-text("Download")'); await tap('#layer .dlg .btn.pri');
  for (let k = 0; k < 30; k++) { await wait(400); const t = await layer(); if (!t.trim()) break; if (/Downloading|Verifying|%/.test(t)) continue; const b = await pg.$('#layer .dlg .btn.pri'); if (b) await b.tap(); }
  check('tablet: Online, Download: online with the project in the emulated controller', await pg.evaluate(() => MTPS.App.state.online && MTPS.App.ctl.name === 'Line1'));
  await tap('[data-box="mode"]'); await tap('#layer .it:has-text("Run Mode")');
  for (let k = 0; k < 3; k++) { const b = await pg.$('#layer .dlg .btn.pri'); if (!b) break; await b.tap(); await wait(400); }
  check('tablet: Run Mode from the mode box: Rem Run', await pg.evaluate(() => MTPS.App.ctl.mode === 'remrun'));
  // the field: STOP is wired N.C. (on while healthy), then START pressed and let go
  const motor = () => pg.evaluate(() => [MTPS.App.ctl.read('Motor', 'MainProgram'), MTPS.App.racks[0].outputs(2) & 1].join());
  await tap('[data-cio="0:1"]');
  check('tablet: the I/O button of the input module shows its 16 inputs only, as switches', await pg.$eval('.iowin', w => w.querySelectorAll('[data-iobit^="0:1:"]').length === 16 && !w.querySelector('.iob.out')));
  await tap('[data-iobit="0:1:1"]'); await tap('[data-iobit="0:1:0"]'); await wait(300);
  check('tablet: START on: Motor on, output 0 of the DO module on', (await motor()) === '1,1');
  await shot('start-on');
  await tap('[data-iobit="0:1:0"]'); await wait(300);
  check('tablet: START let go: Motor stays on (seal-in)', (await motor()) === '1,1');
  await tap('[data-cio="0:2"]');
  check('tablet: the I/O button of the output module shows only its 16 outputs, as lamps, output 0 lit, no switch', await pg.$eval('.iowin', w => w.querySelectorAll('.iob.out').length === 16 && !w.querySelector('[data-iobit]') && w.querySelector('.iob.out').classList.contains('on') && !/Inputs/.test(w.textContent)));
  await shot('do-io');
  await tap('[data-cio="0:1"]'); await tap('[data-iobit="0:1:1"]'); await wait(300);
  check('tablet: STOP pressed (N.C. opens): Motor off, output off', (await motor()) === '0,0');
  await tap('.iowin [data-iox]');
  // Force On by a hold on Start_PB (STOP is open): installed, then it acts only once I/O forces are enabled
  { const b = await pg.evaluate(() => { const t = document.querySelector('#ladwrap [data-ri="0"][data-p="0.0.0"]:not([data-opi])'); const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const c = await ctx.newCDPSession(pg);
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [b] }); await wait(800); await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(400); }
  check('tablet: a hold on XIC Start_PB: the instruction menu with Toggle Bit and Force On / Off', /Toggle Bit[\s\S]*Force On[\s\S]*Force Off/.test(await layer()));
  await tap('#layer .it:has-text("Force On")');
  for (let k = 0; k < 2; k++) { const b = await pg.$('#layer .dlg .btn.pri'); if (!b) break; await b.tap(); await wait(400); }
  await tap('[data-cio="0:1"]'); await tap('[data-iobit="0:1:1"]'); await tap('.iowin [data-iox]'); await wait(300);
  check('tablet: Force On installed, forces disabled: no effect yet (Motor off)', (await motor()) === '0,0');
  await tap('[data-box="forces"]'); await tap('#layer .it:has-text("Enable All I/O Forces")');
  for (let k = 0; k < 2; k++) { const b = await pg.$('#layer .dlg .btn.pri'); if (!b) break; await b.tap(); await wait(400); }
  await wait(300);
  check('tablet: Enable All I/O Forces: the forced START runs the motor', (await motor()) === '1,1');
  await tap('[data-box="forces"]'); await tap('#layer .it:has-text("Remove All I/O Forces")');
  for (let k = 0; k < 2; k++) { const b = await pg.$('#layer .dlg .btn.pri'); if (!b) break; await b.tap(); await wait(400); }
  await tap('[data-cio="0:1"]'); await tap('[data-iobit="0:1:1"]'); await tap('.iowin [data-iox]'); await wait(300);
  check('tablet: Remove All I/O Forces, STOP: the motor stops', (await motor()) === '0,0');
  await tap('[data-box="mode"]'); await tap('#layer .it:has-text("Go Offline")'); await wait(300);

  // a timer, a counter, latch and unlatch, made by touch on new rungs, then run
  const ins2 = async (tile, vals, mk) => {
    await tap(T(tile));
    for (let i = 0; i < vals.length; i++) { await pg.fill(`#layer .dlg input >> nth=${i + 1}`, String(vals[i])); await wait(120); }
    if (mk) { await pg.locator('#layer .dlg input >> nth=1').focus(); await wait(200); await tap(`#layer :text("New \\"${vals[0]}\\"")`); await tap('#layer .dlg .df .btn >> nth=-1'); }
    if (/Rung \d+ ·/.test(await layer())) await tap('#layer .btn.pri');
  };
  const rungs = () => pg.evaluate(() => MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs.map(r => r.t).join(' / '));
  await tap(T('Rung')); await ins('Examine If Closed', 'Start_PB'); await ins2('Timer On Delay', ['T1', '2000', '0'], true);
  await tap(T('Rung')); await ins('Examine If Closed', 'T1.DN'); await ins('Output Energize', 'Lamp', 'Local:2:O.Data.1');
  await tap(T('Rung')); await ins('Examine If Closed', 'Start_PB'); await ins2('Count Up', ['C1', '3', '0'], true);
  await tap(T('Rung')); await ins('Examine If Closed', 'C1.DN'); await ins('Output Latch', 'Latched', 'Local:2:O.Data.2');
  await tap(T('Rung')); await ins('Examine If Closed', 'Reset_PB', 'Local:1:I.Data.2'); await ins('Output Unlatch', 'Latched');
  await tap(T('Rung')); await ins('Examine If Closed', 'Reset_PB'); await ins2('Reset', ['C1']);
  check('tablet: TON, CTU, OTL, OTU and RES rungs made by touch (TIMER and COUNTER tags by New "tag")', (await rungs()).endsWith('XIC(Start_PB)TON(T1,2000,0); / XIC(T1.DN)OTE(Lamp); / XIC(Start_PB)CTU(C1,3,0); / XIC(C1.DN)OTL(Latched); / XIC(Reset_PB)OTU(Latched); / XIC(Reset_PB)RES(C1);') &&
    await pg.evaluate(() => { const g = MTPS.App.state.p.tasks[0].programs[0].tags; return (g.find(t => t.name === 'T1') || {}).type === 'TIMER' && (g.find(t => t.name === 'C1') || {}).type === 'COUNTER'; }), await rungs());
  await tap('button:has-text("Verify")'); await wait(300);
  check('tablet: Verify: 0 errors (timer, counter, latch)', /Complete - 0 error\(s\)/.test(await pg.evaluate(() => document.body.innerText)));
  await tap('[data-box="mode"]'); await tap('#layer .it:has-text("Download")'); await wait(300);
  await tap('#layer .dlg .btn.pri');
  for (let k = 0; k < 30; k++) { await wait(400); const t = await layer(); if (!t.trim()) break; if (/Downloading|Verifying|%/.test(t)) continue; const b = await pg.$('#layer .dlg .btn.pri'); if (b) await b.tap(); }
  // the download from Rem Run asks to put the controller back in Run; if it did not, Run Mode
  if (await pg.evaluate(() => MTPS.App.ctl.mode !== 'remrun')) { await tap('[data-box="mode"]'); await tap('#layer .it:has-text("Run Mode")'); for (let k = 0; k < 3; k++) { const b = await pg.$('#layer .dlg .btn.pri'); if (!b) break; await b.tap(); await wait(400); } }
  const rd = n => pg.evaluate(n => MTPS.App.ctl.read(n, 'MainProgram'), n), outs = () => pg.evaluate(() => MTPS.App.racks[0].outputs(2));
  check('tablet: downloaded again and in Rem Run', await pg.evaluate(() => MTPS.App.state.online && MTPS.App.ctl.mode === 'remrun'));
  await tap('[data-cio="0:1"]'); await tap('[data-iobit="0:1:0"]'); await wait(500);
  check('tablet: START held 0.5 s: T1 timing, not done, Lamp off', (await rd('T1.ACC')) > 0 && (await rd('T1.DN')) === 0 && ((await outs()) & 2) === 0);
  await wait(2000);
  check('tablet: after 2 s: T1.DN, the Lamp output (point 1) on', (await rd('T1.DN')) === 1 && (await rd('T1.ACC')) === 2000 && ((await outs()) & 2) === 2);
  await tap('[data-iobit="0:1:0"]'); await wait(300);
  check('tablet: START let go: TON resets (ACC 0, DN off), the counter counted 1', (await rd('T1.ACC')) === 0 && (await rd('T1.DN')) === 0 && (await rd('C1.ACC')) === 1);
  for (let k = 0; k < 2; k++) { await tap('[data-iobit="0:1:0"]'); await wait(200); await tap('[data-iobit="0:1:0"]'); await wait(200); }
  check('tablet: 3 presses: C1.DN, Latched on, output point 2 on', (await rd('C1.ACC')) === 3 && (await rd('C1.DN')) === 1 && (await rd('Latched')) === 1 && ((await outs()) & 4) === 4);
  await tap('[data-iobit="0:1:2"]'); await wait(300); await tap('[data-iobit="0:1:2"]'); await wait(300);
  check('tablet: RESET pressed: RES clears C1, OTU drops Latched, output point 2 off', (await rd('C1.ACC')) === 0 && (await rd('C1.DN')) === 0 && (await rd('Latched')) === 0 && ((await outs()) & 4) === 0);
  await tap('.iowin [data-iox]'); await shot('timer-counter-latch');
  await tap('[data-box="mode"]'); await tap('#layer .it:has-text("Go Offline")'); await wait(300);

  // a "?" left on the rung: a tap on the instruction, a tap again opens its editor with the tag list
  await tap(T('Rung')); await wait(200);
  await tap(T('Examine If Closed')); await tap('#layer button:has-text("Cancel")');
  const ri = await pg.evaluate(() => MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs.length - 1);
  const b = await pg.evaluate(ri => { const t = document.querySelector(`#ladwrap [data-ri="${ri}"][data-p="0"]:not([data-opi])`); t.scrollIntoView({ block: 'center' }); const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, ri);
  await pg.touchscreen.tap(b.x, b.y); await wait(450); await pg.touchscreen.tap(b.x, b.y); await wait(350);
  check('tablet: a "?" on the rung: tap, tap again opens the operand editor with the tag list', /TAGS FOR BIT/i.test(await layer()));
  await tap('#layer :text-is("Start_PB")'); await tap('#layer .btn.pri');
  check('tablet: … the tag picked there is set on the instruction', await pg.evaluate(ri => MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs[ri].t === 'XIC(Start_PB);', ri));
  // the alias browser says what the input tag of an output module holds
  await tap(T('Output Energize')); await pg.fill('#layer .dlg input >> nth=1', 'Horn'); await wait(200);
  await tap('#layer :text("New \\"Horn\\"")'); await pg.selectOption('#layer #tk', 'alias'); await wait(200);
  check('tablet: the tag browser marks Local:2:I of the output module as status and output echo, Local:2:O as the outputs', /Local:2:I[^\n]*status: Fault and output echo/.test(await layer()) && /Local:2:O[^\n]*outputs \(the program writes these\)/.test(await layer()));
  await shot('alias-browser');
  check('tablet: no JS errors (seal-in by touch)', !errs.length, errs.join(' | '));
  await ctx.close();
};
