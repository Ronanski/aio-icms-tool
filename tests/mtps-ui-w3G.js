/* MT PLC Studio UI tests, Wave 3 G: Sequential Function Chart routines (1756-PM006; v37 help: Sequential Function
   Chart Editor, Edit Step / Action properties, Set Sequence Priorities). New Routine of type Sequential Function
   Chart, the SFC toolbar (add and automatically connect), wires, branches, actions, drag to move, verify, and online
   the active step highlight and the step timers. Mouse on the desktop, touch on the tablet and the phone. Called from
   mtps-ui.test.js. */
'use strict';
module.exports = async function w3G({ browser, page, URL, check }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const dlgTitle = (pg = page) => pg.$eval('#layer .dlg .dh b', b => b.textContent).catch(() => '');
  const clickBtn = async (label, pg = page, tap = false) => { await pg.evaluate(l => { document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick); const b = [...document.querySelectorAll('#layer .dlg .df .btn')].find(x => x.textContent === l); if (b) b.dataset.wapick = '1'; }, label); if (tap) await pg.tap('#layer [data-wapick]'); else await pg.click('#layer [data-wapick]'); await pg.waitForTimeout(150); };
  const items = (pg = page) => pg.$$eval('#layer .menu .it', r => r.map(x => [(x.querySelector('span:not(.k):not(.ck)') || x).textContent, x.classList.contains('dis')]));
  async function pick(label, pg = page, tap = false) {
    const ok = await pg.evaluate(l => { document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick); const it = [...document.querySelectorAll('#layer .menu .it')].find(x => x.querySelector('span:not(.k):not(.ck)') && x.querySelector('span:not(.k):not(.ck)').textContent === l); if (it) it.dataset.wapick = '1'; return !!it; }, label);
    if (!ok) return false;
    if (tap) await pg.tap('#layer [data-wapick]'); else await pg.click('#layer [data-wapick]');
    await pg.waitForTimeout(150);
    return true;
  }
  const shot = (name, pg = page) => pg.screenshot({ path: `/tmp/claude-0/shots-w3/G/${name}.png` }).catch(() => {});
  const chart = (pg = page) => pg.evaluate(() => { const A = MTPS.App, g = A.state.p.tasks[0].programs[0], r = g.routines.find(x => x.type === 'SFC'); return r ? JSON.parse(JSON.stringify(r.sfc)) : null; });
  const named = (ch, n) => ch.els.find(e => e.n === n);
  // the screen point of an element of the chart: its hit area (data-el) or a pin
  const at = (sel, pg = page) => pg.$eval(sel, e => { const b = e.getBoundingClientRect(); return { x: b.left + Math.min(b.width / 2, 30), y: b.top + b.height / 2 }; });
  const elSel = async (n, pg = page) => `#sfcwrap [data-el="${(named(await chart(pg), n) || {}).id}"]`;
  const errors = [];

  console.log('Wave 3 G: New Routine, Type Sequential Function Chart (1756-PM006: a new SFC holds an initial step and a transition)');
  {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await wait(300); await page.keyboard.press('Escape');
    await ev(() => { document.querySelector('#layer').innerHTML = ''; MTPS.App.openProject(MTPS.App.example()); });
    await wait(150);
    await shot('before-new-routine');
    await page.click('.org [data-org="prog:MainProgram"]', { button: 'right' }); await wait(150);
    await pick('New Routine…');
    const types = await page.$$eval('#nr-t option', o => o.map(x => x.textContent));
    check('New Routine: Type offers Ladder Diagram and Sequential Function Chart', (await dlgTitle()) === 'New Routine' && types.join('|') === 'Ladder Diagram|Sequential Function Chart', types.join('|'));
    await page.fill('#p1', 'Fill'); await page.selectOption('#nr-t', 'SFC'); await page.selectOption('#nr-a', 'main');
    await shot('new-routine-sfc');
    await clickBtn('OK'); await wait(150);
    const ch = await chart();
    const tags = await ev(() => MTPS.App.state.p.tasks[0].programs[0].tags.map(t => t.name + ':' + t.type).join(','));
    check('the SFC routine opens in the SFC editor with an initial step and a transition, wired', !!(await page.$('#sfced #sfcwrap svg')) && ch.els.length === 2 && named(ch, 'Step_000').init && !!named(ch, 'Tran_000') && ch.ln.length === 1);
    check('the elements get their tags in the program: Step_000 (SFC_STEP), Tran_000 (BOOL)', tags === 'Step_000:SFC_STEP,Tran_000:BOOL', tags);
    check('the SFC Execution settings are stored in the project with their defaults', JSON.stringify(await ev(() => MTPS.App.state.p.controller.sfc)) === JSON.stringify({ exec: 'current', restart: 'recent', last: 'dontscan' }));
    check('the organizer and Quick View show the routine type', await ev(() => { MTPS.App.state.orgSel = 'rt:MainProgram/Fill'; MTPS.App.render(); return document.querySelector('.org').textContent.includes('Sequential Function Chart routine'); }));
    check('the SFC toolbar has its elements: Step and Transition, Step, Transition, Action, branches, Converge, Stop, Text Box, Wire', (await page.$$eval('.sfctb [data-sfc]', b => b.map(x => x.dataset.sfc).join(','))).startsWith('steptran,step,tran,act,sel,sim,conv,stop,text,wire'));
    await shot('sfc-new');
  }

  console.log('SFC editor with the mouse: add and connect, BOOL expression, wire back, action, drag, branch, delete, verify');
  {
    await page.click(await elSel('Tran_000')); await wait(80);
    await page.click('.sfctb [data-sfc="steptran"]'); await wait(150);
    let ch = await chart();
    const s1 = named(ch, 'Step_001'), t1 = named(ch, 'Tran_001'), t0 = named(ch, 'Tran_000');
    check('Step and Transition after the selected transition: Step_001 and Tran_001, wired in sequence below it', !!s1 && !!t1 && ch.ln.some(l => l[0] === t0.id && l[1] === s1.id) && ch.ln.some(l => l[0] === s1.id && l[1] === t1.id) && s1.y > t0.y && t1.y > s1.y);
    await page.dblclick(await elSel('Tran_000')); await wait(150);
    check('double-click a transition: its text entry window', (await dlgTitle()) === 'Transition Tran_000' && !!(await page.$('#sfc-st')));
    await page.fill('#sfc-st', 'Motor_Run'); await page.keyboard.press('Control+Enter'); await wait(150);
    check('Ctrl+Enter closes the text entry: the transition holds the BOOL expression and shows it', named(await chart(), 'Tran_000').c === 'Motor_Run' && (await page.$eval('#sfcwrap svg', s => s.textContent)).includes('Motor_Run') && (await dlgTitle()) === '');
    await page.dblclick(await elSel('Tran_001')); await wait(120); await page.fill('#sfc-st', 'NOT Motor_Run'); await page.keyboard.press('Control+Enter'); await wait(120);
    // wire: the pin under Tran_001, then Step_000 (green dot)
    await page.click(await elSel('Tran_001')); await wait(80);
    const pin = await at(`#sfcwrap [data-pin="${t1.id}:b"]`); await page.mouse.click(pin.x, pin.y); await wait(100);
    check('click the bottom pin of an element: wire mode, the valid ends show a green dot', (await page.$$('#sfcwrap .pin.ok')).length >= 1 && !!(await page.$(`#sfcwrap [data-pin="${named(ch, 'Step_000').id}:t"]`)));
    await shot('sfc-wire');
    const dot = await at(`#sfcwrap [data-pin="${named(ch, 'Step_000').id}:t"]`); await page.mouse.click(dot.x, dot.y); await wait(150);
    ch = await chart();
    check('… then the step to go to: a wire from Tran_001 back up to Step_000 (a loop)', ch.ln.some(l => l[0] === t1.id && l[1] === named(ch, 'Step_000').id));
    // an action on Step_000
    await page.click(await elSel('Step_000'), { button: 'right' }); await wait(120);
    const its = (await items()).map(x => x[0]);
    check('right-click a step: Add Action, Step Properties, Initial Step, Set Sequence Priorities, Delete', ['Add Action', 'Step Properties…', 'Initial Step', 'Set Sequence Priorities…', 'Delete'].every(x => its.includes(x)), its.join('|'));
    await pick('Add Action'); await wait(100);
    check('Add Action opens the structured text of the new action', (await dlgTitle()) === 'Action Action_000');
    await page.fill('#sfc-st', 'Run_Lamp := 1;'); await page.keyboard.press('Control+Enter'); await wait(150);
    ch = await chart();
    check('the action is under the step with qualifier N (Non-Stored) and its SFC_ACTION tag', named(ch, 'Step_000').acts.length === 1 && named(ch, 'Step_000').acts[0].q === 'N' && named(ch, 'Step_000').acts[0].b === 'Run_Lamp := 1;' && await ev(() => MTPS.App.state.p.tasks[0].programs[0].tags.some(t => t.name === 'Action_000' && t.type === 'SFC_ACTION')));
    await page.click(`#sfcwrap [data-act="${named(ch, 'Step_000').id}:0"]`, { button: 'right' }); await wait(120);
    await pick('Action Properties…'); await wait(120);
    const qs = await page.$$eval('#ap-q option', o => o.map(x => x.value).join(','));
    check('Action Properties: the qualifiers N, R, S, L, D, P, P1, P0, SL, SD, DS; Preset only for a timed one', qs === 'N,R,S,L,D,P,P1,P0,SL,SD,DS' && await page.$eval('#ap-p', i => i.disabled), qs);
    await page.selectOption('#ap-q', 'L');
    check('… L (Time Limited) turns Preset on', !(await page.$eval('#ap-p', i => i.disabled)));
    await page.fill('#ap-p', '3000'); await shot('sfc-action-props'); await page.selectOption('#ap-q', 'N'); await clickBtn('OK');
    // drag Step_001 down by 40 px, then undo
    const y0 = named(await chart(), 'Step_001').y, p0 = await at(await elSel('Step_001'));
    await page.mouse.move(p0.x, p0.y); await page.mouse.down(); await page.mouse.move(p0.x + 5, p0.y + 20, { steps: 3 }); await page.mouse.move(p0.x + 5, p0.y + 40, { steps: 3 }); await page.mouse.up(); await wait(150);
    const y1 = named(await chart(), 'Step_001').y;
    check('drag a step with the mouse: it moves (on a 10 px grid)', y1 === y0 + 40, `${y0} → ${y1}`);
    await page.keyboard.press('Control+z'); await wait(150);
    check('Undo puts it back', named(await chart(), 'Step_001').y === y0);
    // a selection branch after Step_001, then delete the new path
    await page.click(await elSel('Step_001')); await wait(60);
    await page.click('.sfctb [data-sfc="sel"]'); await wait(150);
    ch = await chart();
    const o1 = ch.ln.filter(l => l[0] === named(ch, 'Step_001').id).length;
    check('Selection Branch on a step with a transition: one more path (a transition to the right)', o1 === 2 && !!named(ch, 'Tran_002') && named(ch, 'Tran_002').x > named(ch, 'Tran_001').x);
    await shot('sfc-selection');
    await page.keyboard.press('Delete'); await wait(150);
    ch = await chart();
    check('Delete removes the selected transition, its wires and its tag', !named(ch, 'Tran_002') && ch.ln.filter(l => l[0] === named(ch, 'Step_001').id).length === 1 && !(await ev(() => MTPS.App.state.p.tasks[0].programs[0].tags.some(t => t.name === 'Tran_002'))));
    await page.click('.sfctb [data-sfc="verify"]'); await wait(200);
    const log = await page.$eval('.derr', d => d.textContent).catch(() => '');
    check('Verify Routine: the chart verifies (0 errors)', /Verifying routine 'Fill' of program 'MainProgram'/.test(log) && /Complete - 0 error\(s\)/.test(log), log.slice(0, 200));
    // an error in a transition shows in the Errors pane and on the element
    await page.dblclick(await elSel('Tran_001')); await wait(120); await page.fill('#sfc-st', 'Motor_Run AND'); await page.keyboard.press('Control+Enter'); await wait(150);
    check('an incomplete expression: the Errors pane names the transition, which is drawn in red', (await ev(() => MTPS.App.state.verify.errors.map(e => e.text).join())).includes('Tran_001: The expression ends too early') && !!(await page.$('#sfcwrap .tran.err')));
    await page.keyboard.press('Control+z'); await wait(150);
    await shot('sfc-chart');
  }

  console.log('SFC editor on a tablet with touch: tap to select, the toolbar adds and connects, hold for the menu, double tap to edit');
  {
    const setup = () => { const A = MTPS.App, p = A.example(), g = p.tasks[0].programs[0]; document.querySelector('#layer').innerHTML = ''; A.openProject(p); const ch = MTPS.SFC.ui.newChart(g, A.state.p); A.state.p.tasks[0].programs[0].routines.push({ name: 'Chart', type: 'SFC', rungs: [], sfc: ch }); A.state.routine = 'Chart'; A.state.view = 'ladder'; A.render(); };
    for (const [w, h, nm] of [[800, 1280, 'tablet'], [390, 844, 'phone']]) {
      const tctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
      const tp = await tctx.newPage(); tp.on('pageerror', e => errors.push(e.message));
      await tp.goto(URL); await tp.waitForTimeout(400); await tp.keyboard.press('Escape');
      await tp.evaluate(setup); await tp.waitForTimeout(200);
      if (nm === 'phone') { const pt = await tp.$('[data-go="ladder"]'); if (pt) await pt.tap(); await tp.waitForTimeout(150); }
      const vis = await tp.$$eval('.sfctb [data-sfc], .sfcbar [data-sfc]', b => b.every(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.top >= 0; }));
      check(`${nm}: the SFC editor, its toolbar and its Edit / More buttons are all on the screen`, !!(await tp.$('#sfcwrap svg')) && vis);
      await tp.tap(await elSel('Tran_000', tp)); await tp.waitForTimeout(120);
      await tp.tap('.sfctb [data-sfc="steptran"]'); await tp.waitForTimeout(200);
      const ch = await chart(tp);
      check(`${nm}: tap the transition, then Step and Transition: Step_001 and Tran_001 are added and wired`, !!named(ch, 'Step_001') && !!named(ch, 'Tran_001') && ch.ln.length === 3);
      // hold a step: its menu
      const p0 = await at(await elSel('Step_000', tp), tp);
      const cdp = await tctx.newCDPSession(tp);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      await touch('touchStart', p0.x, p0.y); await tp.waitForTimeout(600); await touch('touchEnd', p0.x, p0.y); await tp.waitForTimeout(200);
      const its = (await items(tp)).map(x => x[0]);
      check(`${nm}: hold a step: its menu (Add Action, Step Properties…)`, its.includes('Add Action') && its.includes('Step Properties…'), its.join('|'));
      await pick('Step Properties…', tp, true); await tp.waitForTimeout(150);
      check(`${nm}: Step Properties: Type, Preset, Timer, Timer Max, Count, AlarmEnable, Limit High, Limit Low`, (await dlgTitle(tp)) === 'Step Properties - Step_000' && !!(await tp.$('#sp-t')) && !!(await tp.$('#sp-pre')) && !!(await tp.$('#sp-al')) && !!(await tp.$('#sp-lh')) && !!(await tp.$('#sp-ll')));
      await tp.fill('#sp-pre', '2500'); await clickBtn('OK', tp, true);
      check(`${nm}: the preset is kept`, named(await chart(tp), 'Step_000').pre === 2500);
      // drag with touch
      const s1 = await at(await elSel('Step_001', tp), tp), x0 = named(await chart(tp), 'Step_001').x;
      await touch('touchStart', s1.x, s1.y); for (let k = 1; k <= 5; k++) { await touch('touchMove', s1.x + k * 12, s1.y); await tp.waitForTimeout(20); } await touch('touchEnd', s1.x + 60, s1.y); await tp.waitForTimeout(200);
      const x1 = named(await chart(tp), 'Step_001').x;
      check(`${nm}: drag a step with a finger: it moves`, x1 > x0, `${x0} → ${x1}`);
      // double tap a transition: its text entry
      const tr = await at(await elSel('Tran_001', tp), tp);
      await tp.touchscreen.tap(tr.x, tr.y); await tp.waitForTimeout(80); await tp.touchscreen.tap(tr.x, tr.y); await tp.waitForTimeout(200);
      check(`${nm}: double tap a transition: its BOOL expression`, (await dlgTitle(tp)) === 'Transition Tran_001');
      await tp.fill('#sfc-st', 'Start_PB'); await clickBtn('OK', tp, true);
      // the bar's Edit button on the selected step
      await tp.tap(await elSel('Step_001', tp)); await tp.waitForTimeout(120); await shot(`sfc-${nm}`, tp);
      await tp.tap('.sfcbar [data-sfc="edit"]'); await tp.waitForTimeout(150);
      check(`${nm}: the bar's Edit button opens the selected step`, (await dlgTitle(tp)) === 'Step Properties - Step_001');
      await tctx.close();
    }
  }
  check('SFC: no JS errors on the touch pages', errors.length === 0, errors.join(' | '));
};
