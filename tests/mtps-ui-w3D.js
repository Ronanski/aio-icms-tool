/* MT PLC Studio UI tests, Wave 3 (D): Function Block Diagram routines (1756-PM009J, instructions 1756-RM018A):
   New Routine of Type Function Block Diagram, sheets, IREF / OREF / ICON / OCON and blocks from the element toolbar,
   wires by mouse drag and by click-click, tap-tap on touch, moving a block, Properties (Vis, Value), Assume Data
   Available, Verify errors on the element, and online live values. Mouse on the desktop, touch on the tablet and
   the phone. Called from mtps-ui.test.js. */
'use strict';
module.exports = async function w3D({ browser, page, URL, check }) {
  const ev = (fn, arg, pg = page) => pg.evaluate(fn, arg);
  const wait = (ms, pg = page) => pg.waitForTimeout(ms);
  const dlgTitle = (pg = page) => pg.$eval('#layer .dlg .dh b', b => b.textContent).catch(() => '');
  const shot = (name, pg = page) => pg.screenshot({ path: `/tmp/claude-0/shots-w3/D/${name}.png` }).catch(() => {});
  const errors = [];
  const R = (pg = page) => ev(() => { const S = MTPS.App.state, g = S.p.tasks[0].programs[0], r = g.routines.find(x => x.name === S.routine); return { name: r.name, type: r.type, sheets: r.sheets, tags: g.tags.map(t => t.name + ':' + t.type) }; }, null, pg);
  const center = async (sel, pg = page) => { const b = await (await pg.$(sel)).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const pin = (id, key) => `#fbdwrap [data-pin="${id}|${key}"]`;
  const elSel = id => `#fbdwrap [data-fe="${id}"]`;
  async function online(pg = page) {
    await ev(() => MTPS.App.run('online'), null, pg);
    for (let k = 0; k < 8 && !(await ev(() => MTPS.App.state.online && !document.querySelector('#layer .dlg'), null, pg)); k++) {
      await wait(150, pg);
      const b = await pg.$('#layer .dlg .btn.pri'); if (b && !(await pg.$('#layer .dlg .prog'))) await b.click(); else await wait(500, pg);
    }
    return ev(() => MTPS.App.state.online, null, pg);
  }

  console.log('Function Block Diagram: New Routine, elements, wires, Properties, Verify (1756-PM009J)');
  {
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(150);
    await ev(() => { document.querySelector('#layer').innerHTML = ''; MTPS.App.openProject(MTPS.App.example()); }); await wait(150);
    await page.click('.nd[data-org="prog:MainProgram"]', { button: 'right' }); await wait(100);
    await page.click('#layer .it:has-text("New Routine")'); await wait(150);
    check('New Routine: the Type list has Ladder Diagram and Function Block Diagram', (await page.$$eval('#nr-t option', o => o.map(x => x.textContent).join(','))) === 'Ladder Diagram,Function Block Diagram');
    await page.fill('#p1', 'Lamp_FBD'); await page.selectOption('#nr-t', 'FBD'); await page.selectOption('#nr-a', 'main');
    await page.click('#layer .df .btn.pri'); await wait(200);
    let r = await R();
    check('OK makes an FBD routine with one sheet and opens it in the FBD editor', r.name === 'Lamp_FBD' && r.type === 'FBD' && r.sheets.length === 1 && !!(await page.$('#fbdwrap svg.fbd')) && !(await page.$('#ladwrap')));
    check('the organizer shows it with the FBD icon; the toolbar holds the FBD elements, not the ladder instructions', !!(await page.$('.nd[data-org="rt:MainProgram/Lamp_FBD"]')) && (await page.$$eval('.dinstr .gbtn[data-fbdadd]', b => b.map(x => x.dataset.fbdadd).slice(0, 4).join(','))) === 'IREF,OREF,ICON,OCON' && (await page.$$('.dinstr .gbtn[data-mn]')).length === 0);
    await page.click('.dinstr [data-fbdadd="IREF"]'); await wait(150);
    check('IREF: the operand dialog opens (tag or value)', (await dlgTitle()) === 'Input Reference');
    await page.fill('#fop', 'Motor_Run'); await page.click('#layer .df .btn.pri'); await wait(120);
    await page.click('.dinstr [data-fbdadd="TONR"]'); await wait(120);
    r = await R();
    check('TONR: a block with its backing tag TONR_01 : FBD_TIMER made in the program', r.sheets[0].els.some(e => e.k === 'BLK' && e.t === 'TONR' && e.tag === 'TONR_01') && r.tags.includes('TONR_01:FBD_TIMER'));
    // move the block to the right with the mouse
    const tid = r.sheets[0].els.find(e => e.t === 'TONR').id, x0 = r.sheets[0].els.find(e => e.t === 'TONR').x;
    let p = await center(elSel(tid));
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 120, p.y + 10, { steps: 6 }); await page.mouse.move(p.x + 250, p.y - 30, { steps: 6 }); await page.mouse.up(); await wait(120);
    r = await R();
    const tb = r.sheets[0].els.find(e => e.id === tid);
    check('a block is moved by dragging it (snapped to the grid)', tb.x >= x0 + 240 && tb.x % 10 === 0 && tb.y % 10 === 0, JSON.stringify(tb));
    await shot('fbd-desktop-moved');
    // wire by mouse drag: IREF Out → TONR TimerEnable
    const iid = r.sheets[0].els.find(e => e.k === 'IREF').id;
    const a = await center(pin(iid, 'o:Out')), b = await center(pin(tid, 'i:TimerEnable'));
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
    check('dragging from a pin draws the rubber-band wire', !!(await page.$('#fbdwrap .fw.rub')));
    await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up(); await wait(120);
    r = await R();
    check('let go on the input pin: the wire IREF.Out → TONR.TimerEnable', r.sheets[0].wires.some(w => w.a === iid && w.ap === 'Out' && w.b === tid && w.bp === 'TimerEnable'));
    // OREF, wired by click on the output pin then click on the input pin (PM009 Wire elements together)
    await page.click('.dinstr [data-fbdadd="OREF"]'); await wait(120);
    await page.fill('#fop', 'Run_Lamp'); await page.click('#layer .df .btn.pri'); await wait(120);
    r = await R();
    const oid = r.sheets[0].els.find(e => e.k === 'OREF').id;
    await ev(([o, t]) => { const S = MTPS.App.state, g = S.p.tasks[0].programs[0], rr = g.routines.find(x => x.name === S.routine), e = rr.sheets[0].els.find(x => x.id === o); e.x = rr.sheets[0].els.find(x => x.id === t).x + 260; MTPS.FBD.draw(); }, [oid, tid]);
    await page.click(pin(tid, 'o:DN')); await wait(80);
    check('click an output pin: it is armed and the bar asks for an input pin', (await page.$eval('#fbdsel', s => s.textContent)).startsWith('Wiring: tap an input pin') && !!(await page.$('#fbdwrap .fpd.arm')));
    await page.click(pin(oid, 'i:In')); await wait(120);
    r = await R();
    check('… then click the input pin: the wire TONR.DN → OREF', r.sheets[0].wires.some(w => w.a === tid && w.ap === 'DN' && w.b === oid && w.bp === 'In'));
    // Properties: Vis and Value (PRE)
    await page.click(`#fbdwrap [data-fprops="${tid}"]`); await wait(150);
    check('the block\'s Properties button opens Parameters with Vis and Value per pin', (await dlgTitle()) === 'Properties - TONR_01' && (await page.$$('#layer [data-vis]')).length >= 10 && !!(await page.$('#layer [data-val="PRE"]')));
    check('a wired pin cannot be hidden', await page.$eval('#layer [data-vis="TimerEnable"]', c => c.disabled && c.checked));
    await page.fill('#layer [data-val="PRE"]', '300'); await page.check('#layer [data-vis="EnableIn"]'); await page.click('#layer .df .btn.pri'); await wait(120);
    r = await R();
    check('Value goes into the tag (TONR_01.PRE 300); Vis shows the EnableIn pin', (await ev(() => MTPS.App.state.p.tasks[0].programs[0].tags.find(t => t.name === 'TONR_01').value.PRE)) === 300 && !!(await page.$(pin(tid, 'i:EnableIn'))));
    await page.click('#layer', { trial: true }).catch(() => {});
    // Verify
    await ev(() => MTPS.App.run('verifyc')); await wait(150);
    let v = await ev(() => MTPS.App.state.verify);
    check('Verify: the FBD routine has no errors', v.errors.length === 0, v.lines.join(' | '));
    // an OREF without a wire: an error that names the sheet, marked on the element
    await page.click('.dinstr [data-fbdadd="OREF"]'); await wait(120); await page.fill('#fop', 'Motor_Cmd'); await page.click('#layer .df .btn.pri'); await wait(150);
    v = await ev(() => MTPS.App.state.verify);
    const e2 = v.errors.find(x => /OREF has no input wire/.test(x.msg));
    check('an OREF with no wire is a Verify error "Sheet 1, OREF Motor_Cmd: The OREF has no input wire."', !!e2 && e2.text === 'Error: Sheet 1, OREF Motor_Cmd: The OREF has no input wire.', v.lines.join(' | '));
    check('… and the element is marked in the diagram; the error is in the Errors window', !!(await page.$('#fbdwrap .fe.err')) && (await page.$eval('.derr', d => d.textContent)).includes('The OREF has no input wire'));
    await shot('fbd-desktop-error');
    const bad = (await R()).sheets[0].els.find(e => e.k === 'OREF' && e.op === 'Motor_Cmd').id;
    await page.click(elSel(bad)); await wait(60); await page.keyboard.press('Delete'); await wait(120);
    check('Delete removes the selected element', !(await R()).sheets[0].els.some(e => e.id === bad) && (await ev(() => MTPS.App.state.verify.errors.length)) === 0);
    // a wire: select it, Assume Data Available from its menu, delete it with the Delete key, Undo
    const wsel = '#fbdwrap [data-fw="1"]';
    await page.click(wsel, { button: 'right' }); await wait(100);
    check('right-click a wire: Assume Data Available and Delete Wire', (await page.$$eval('#layer .it', i => i.map(x => x.textContent).join('|'))).includes('Assume Data Available') && (await page.$$eval('#layer .it', i => i.map(x => x.textContent).join('|'))).includes('Delete Wire'));
    await page.click('#layer .it:has-text("Assume Data Available")'); await wait(100);
    check('Assume Data Available marks the wire (arrow on the diagram)', (await R()).sheets[0].wires[1].ada === 1 && !!(await page.$('#fbdwrap .fada')));
    await page.click(wsel); await wait(60); await page.keyboard.press('Delete'); await wait(100);
    check('Delete removes the selected wire', (await R()).sheets[0].wires.length === 1);
    await page.keyboard.press('Control+z'); await wait(120);
    check('Undo brings it back', (await R()).sheets[0].wires.length === 2);
    await ev(() => { const S = MTPS.App.state, g = S.p.tasks[0].programs[0], rr = g.routines.find(x => x.name === S.routine); delete rr.sheets[0].wires[1].ada; MTPS.App.render(); });
    // sheets
    await page.click('[data-fbd="add"]'); await wait(120);
    check('New Sheet: sheet 2 of 2, empty', (await page.$eval('.fbdbar .fsh', s => s.textContent)).startsWith('Sheet 2 of 2') && (await page.$$('#fbdwrap g.fe')).length === 0);
    await page.click('[data-fbd="prev"]'); await wait(100);
    check('the sheet arrows go back to sheet 1 with its elements', (await page.$eval('.fbdbar .fsh', s => s.textContent)).startsWith('Sheet 1 of 2') && (await page.$$('#fbdwrap g.fe')).length === 3);
    // online: live values
    check('Go Online with the FBD routine as the main routine', await online());
    await ev(() => MTPS.App.run('runm')); await wait(150);
    await ev(() => MTPS.App.ctl.write('Motor_Run', 1)); await wait(200);
    check('online: the IREF shows its value and its BOOL wire is drawn as 1', (await page.$$eval('#fbdwrap .fv', t => t.map(x => x.textContent).join(','))).includes('1') && !!(await page.$('#fbdwrap .fw.t1')));
    await wait(450);
    const lv = await ev(() => ({ lamp: MTPS.App.ctl.read('Run_Lamp'), acc: MTPS.App.ctl.read('TONR_01.ACC', 'MainProgram') }));
    check('the FBD routine runs: TONR times to PRE 300 ms and the OREF writes Run_Lamp', lv.lamp === 1 && lv.acc === 300, JSON.stringify(lv));
    check('the block pins show live values (ACC 300)', (await page.$$eval('#fbdwrap .fv', t => t.map(x => x.textContent))).includes('300'));
    await shot('fbd-desktop-online');
    await ev(() => MTPS.App.ctl.write('Motor_Run', 0)); await wait(200);
    check('TimerEnable off: the lamp goes off, the wire is drawn as 0 (dashed)', (await ev(() => MTPS.App.ctl.read('Run_Lamp'))) === 0 && !!(await page.$('#fbdwrap .fw.t0')));
    await ev(() => MTPS.App.run('offline')); await wait(150);
    await ev(() => MTPS.App.openProject(MTPS.App.example())); await wait(100);
  }

  console.log('Function Block Diagram on touch: tablet (tap-tap wires, hold for the menu) and phone (+ Add Element)');
  {
    // a project with an FBD routine of one IREF and a BAND, open on a touch tablet
    const fbdProject = () => {
      const A = MTPS.App, p = A.example();
      p.tags.push({ name: 'B1', type: 'BOOL' }, { name: 'B2', type: 'BOOL' });
      p.tasks[0].programs[0].routines.push({ name: 'Logic', type: 'FBD', rungs: [], sheets: [{ desc: 'Lamp', els: [{ id: 1, k: 'IREF', op: 'B1', x: 40, y: 40 }], wires: [] }] });
      document.querySelector('#layer').innerHTML = '';
      A.openProject(p);
      A.state.prefs.emu = false; A.state.routine = 'Logic'; A.render();
    };
    for (const [w, h, n] of [[800, 1280, 'tablet'], [390, 844, 'phone']]) {
      const tp = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
      tp.on('pageerror', e => errors.push(e.message));
      await tp.goto(URL); await wait(400, tp); await tp.keyboard.press('Escape');
      await ev(fbdProject, null, tp); await wait(200, tp);
      check(`${n}: the FBD editor shows with its sheet toolbar ("Sheet 1 of 1 · Lamp")`, !!(await tp.$('#fbdwrap svg.fbd')) && (await tp.$eval('.fbdbar .fsh', s => s.textContent)) === 'Sheet 1 of 1 · Lamp');
      if (n === 'tablet') await tp.tap('.ibar [data-fbdadd="BAND"]');
      else { await tp.tap('.fab'); await wait(150, tp); check('phone: the + button opens Add FBD Element', (await dlgTitle(tp)) === 'Add FBD Element'); await tp.tap('#layer [data-fpk="BAND"]'); }
      await wait(150, tp);
      let r = await R(tp);
      const band = r.sheets[0].els.find(e => e.t === 'BAND');
      check(`${n}: BAND added with its tag BAND_01 (FBD_BOOLEAN_AND)`, !!band && r.tags.includes('BAND_01:FBD_BOOLEAN_AND'));
      // tap-tap: the output pin, then the input pin
      await ev(id => { const S = MTPS.App.state, rr = S.p.tasks[0].programs[0].routines.find(x => x.name === 'Logic'); const e = rr.sheets[0].els.find(x => x.id === id); e.x = 200; e.y = 40; MTPS.FBD.draw(); }, band.id, tp);
      await tp.tap(pin(1, 'o:Out')); await wait(80, tp);
      check(`${n}: tap an output pin arms it`, (await tp.$eval('#fbdsel', s => s.textContent)).startsWith('Wiring'));
      await tp.tap(pin(band.id, 'i:In1')); await wait(120, tp);
      r = await R(tp);
      check(`${n}: tap the input pin: the wire is made (tap-tap)`, r.sheets[0].wires.some(x => x.a === 1 && x.b === band.id && x.bp === 'In1'));
      // drag a block with the finger
      const cdp = await tp.context().newCDPSession(tp);
      const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      let c = await center(elSel(band.id), tp);
      await T('touchStart', c.x, c.y); for (let k = 1; k <= 6; k++) { await T('touchMove', c.x + k * 10, c.y + k * 12); await wait(16, tp); } await T('touchEnd'); await wait(150, tp);
      const nb = (await R(tp)).sheets[0].els.find(e => e.id === band.id);
      check(`${n}: a block is dragged with the finger`, nb.x >= 250 && nb.y >= 100, JSON.stringify(nb));
      // hold: the element's menu
      c = await center(elSel(band.id), tp);
      await T('touchStart', c.x, c.y); await wait(700, tp); await T('touchEnd'); await wait(150, tp);
      check(`${n}: hold a block: its menu (Properties, Assign Tag, Delete Element)`, (await tp.$$eval('#layer .it', i => i.map(x => x.textContent).join('|'))).includes('Properties…') && (await tp.$$eval('#layer .it', i => i.map(x => x.textContent).join('|'))).includes('Delete Element'));
      await tp.tap('#layer .it:has-text("Properties")'); await wait(150, tp);
      check(`${n}: Properties opens from the menu`, (await dlgTitle(tp)) === 'Properties - BAND_01');
      await shot(`fbd-${n}-props`, tp);
      await tp.keyboard.press('Escape'); await wait(100, tp);
      await shot(`fbd-${n}`, tp);
      // the sheet menu (tap "Sheet 1 of 1"): the sheets, New Sheet, Sheet Description, Delete Sheet
      await tp.tap('.fbdbar .fsh'); await wait(150, tp);
      check(`${n}: tap the sheet name: the sheet menu with New Sheet`, (await tp.$$eval('#layer .it', i => i.map(x => x.textContent).join('|'))).includes('New Sheet'));
      await tp.tap('#layer .it:has-text("New Sheet")'); await wait(150, tp);
      check(`${n}: New Sheet from the menu: sheet 2 of 2`, (await R(tp)).sheets.length === 2 && (await tp.$eval('.fbdbar .fsh', s => s.textContent)).startsWith('Sheet 2 of 2'));
      check(`${n}: the FBD toolbar fits on one row`, (await tp.$eval('.fbdbar', b => b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().height < 60)));
      check(`${n}: no sideways page scroll`, await ev(() => document.documentElement.scrollWidth <= innerWidth + 1, null, tp));
      await tp.close();
    }
  }
  check('FBD: no JS errors on the touch pages', errors.length === 0, errors.join(' | '));
};
