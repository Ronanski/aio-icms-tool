/* MT PLC Studio UI tests, Wave 3 (E): the ASCII string and ASCII conversion instructions (1756-RM018A chapters 17
   and 18), the MSG instruction with its Message Configuration dialog (1756-RM018A chapter 4, 1756-PM012, v37 help)
   and Add-On Instructions (1756-PM010). Mouse on the desktop, touch on the tablet and the phone. Called from
   mtps-ui.test.js. */
'use strict';
module.exports = async function w3E({ browser, page, URL, check }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const eq = (name, got, want, more = "") => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)} ${more}`);
  const dlgTitle = (pg = page) => pg.$eval('#layer .dlg .dh b', b => b.textContent).catch(() => '');
  const errors = [];
  // a touch page of this size with the project made by setup
  async function touchPage(w, h, setup, arg) {
    const tp = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    tp.on('pageerror', e => errors.push(e.message));
    await tp.goto(URL); await tp.waitForTimeout(400); await tp.keyboard.press('Escape');
    await tp.evaluate(() => { document.querySelector('#layer').innerHTML = ''; });
    if (setup) await tp.evaluate(setup, arg);
    await tp.waitForTimeout(300);
    return tp;
  }
  // a new empty rung at the end of MainRoutine, selected; then Add Ladder Element (Insert) with this instruction and
  // its operands typed in the operand box, as a user does (the tile is tapped on a touch page)
  async function addInstr(pg, mn, ops, touch) {
    await pg.evaluate(() => { const S = MTPS.App.state, rr = S.p.tasks[0].programs[0].routines[0].rungs; if (rr[rr.length - 1].t) rr.push({ t: '' }); S.prog = 'MainProgram'; S.routine = 'MainRoutine'; S.view = 'ladder'; S.sel = null; S.selRung = rr.length - 1; MTPS.App.render(); });
    // the Insert command: Add Ladder Element on the desktop; the All… button (tablet) or the + button (phone) by touch
    if (touch) await pg.tap(await pg.$('.fab') ? '.fab' : '.gbtn.more[data-cmd="ins"]'); else await pg.evaluate(() => MTPS.App.run('ins'));
    await pg.waitForTimeout(150);
    await pg.fill('#layer #pq', mn); await pg.waitForTimeout(60);
    if (touch) await pg.tap(`#layer [data-pk="${mn}"]`); else await pg.click(`#layer [data-pk="${mn}"]`);
    await pg.waitForTimeout(200);
    if (await pg.$('#inl')) { await pg.keyboard.press('Escape'); await pg.evaluate(() => MTPS.App.run('edit')); await pg.waitForTimeout(150); } 
    for (let i = 0; i < ops.length; i++) { const f = `#layer [data-op="${i}"]`; if (touch) await pg.tap(f); else await pg.click(f); await pg.fill(f, ops[i]); }
    if (touch) await pg.tap('#layer .df .btn.pri'); else await pg.click('#layer .df .btn.pri');
    await pg.waitForTimeout(200);
    return pg.evaluate(() => { const rr = MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs; return rr[rr.length - 1].t; });
  }
  const strText = (pg, n) => pg.evaluate(n => { const o = MTPS.App.racks[0].controller(0).read(n); return o ? String.fromCharCode(...o.DATA.slice(0, o.LEN)) : null; }, n);
  // download the open project to the emulated controller in slot 0 and run it
  const dlRun = pg => pg.evaluate(() => { const A = MTPS.App, c = A.racks[0].controller(0); c.setKey('REM'); const r = c.download(A.state.p); c.setMode('remrun'); return r.ok; });

  console.log('ASCII string and ASCII conversion instructions (1756-RM018A chapters 17 and 18)');
  {
    const strProject = () => {
      const A = MTPS.App, p = A.example(), sv = t => ({ LEN: t.length, DATA: [...t].map(c => c.charCodeAt(0)) });
      p.tags.push({ name: 'Txt_A', type: 'STRING', value: sv('Hello') }, { name: 'Txt_B', type: 'STRING', value: sv(' World') }, { name: 'Txt_D', type: 'STRING' }, { name: 'Pos', type: 'DINT' }, { name: 'Num_S', type: 'STRING', value: sv('Wt=-250kg') }, { name: 'Wt', type: 'DINT' });
      document.querySelector('#layer').innerHTML = '';
      A.openProject(p);
    };
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(150);
    await ev(strProject); await wait(150);
    await page.click('[data-tab="ASCII String"]'); await wait(100);
    check('the instruction toolbar has the ASCII String tab: CONCAT DELETE FIND INSERT MID', (await page.$$eval('.gbtn[data-mn]', b => b.map(x => x.dataset.mn).join(','))) === 'CONCAT,DELETE,FIND,INSERT,MID');
    await page.click('[data-tab="ASCII Conversion"]'); await wait(100);
    check('… and the ASCII Conversion tab: STOD STOR DTOS RTOS UPPER LOWER', (await page.$$eval('.gbtn[data-mn]', b => b.map(x => x.dataset.mn).join(','))) === 'STOD,STOR,DTOS,RTOS,UPPER,LOWER');
    const t1 = await addInstr(page, 'CONCAT', ['Txt_A', 'Txt_B', 'Txt_D']);
    check('desktop: CONCAT from Add Ladder Element with its three operands (Source A, Source B, Dest)', t1 === 'CONCAT(Txt_A,Txt_B,Txt_D);', t1);
    const t2 = await addInstr(page, 'FIND', ['Txt_D', 'Txt_B', '1', 'Pos']);
    const t3 = await addInstr(page, 'STOD', ['Num_S', 'Wt']);
    check('FIND (Source, Search, Start, Result) and STOD (Source, Dest)', t2 === 'FIND(Txt_D,Txt_B,1,Pos);' && t3 === 'STOD(Num_S,Wt);', t2 + ' ' + t3);
    const box = await page.$$eval('#ladwrap text.nm.b', t => t.map(x => x.textContent));
    check('the ladder draws them as boxes', ['CONCAT', 'FIND', 'STOD'].every(m => box.includes(m)), box.join(','));
    await ev(() => MTPS.App.run('verifyc')); await wait(100);
    check('the controller verifies with no errors', (await ev(() => MTPS.App.state.verify.errors.length)) === 0, JSON.stringify(await ev(() => MTPS.App.state.verify.errors.map(e => e.text))));
    check('download and run', await dlRun(page)); await wait(300);
    check('in Run: CONCAT gives Hello World, FIND 6, STOD -250', (await strText(page, 'Txt_D')) === 'Hello World' && (await ev(() => MTPS.App.racks[0].controller(0).read('Pos'))) === 6 && (await ev(() => MTPS.App.racks[0].controller(0).read('Wt'))) === -250);
    // the operand box offers only string tags for a string operand
    await ev(() => { const S = MTPS.App.state; S.sel = null; MTPS.App.render(); MTPS.App.run('ins'); }); await wait(150);
    await page.fill('#layer #pq', 'UPPER'); await wait(60); await page.click('#layer [data-pk="UPPER"]'); await wait(200); if (await page.$('#inl')) { await page.keyboard.press('Escape'); await page.evaluate(() => MTPS.App.run('edit')); await page.waitForTimeout(150); } 
    await page.click('#layer [data-op="0"]'); await page.fill('#layer [data-op="0"]', ''); await wait(80);
    const offered = await page.$$eval('#layer #sg .row[data-pick]', x => x.map(y => y.dataset.pick));
    check('the operand box offers the string tags (and no DINT) for Source', offered.includes('Txt_A') && !offered.includes('Pos'), offered.join(','));
    await page.keyboard.press('Escape'); await wait(100);
    await ev(() => { const c = MTPS.App.racks[0].controller(0); c.setMode('remprog'); });
    // tablet (touch): the toolbar tab and Add Ladder Element by touch
    const tl = await touchPage(1180, 820, strProject);
    await tl.tap('[data-tab="ASCII Conversion"]'); await tl.waitForTimeout(100);
    const tb = await tl.$$eval('.gbtn[data-mn]', b => b.map(x => x.dataset.mn).join(','));
    await tl.close();
    const tp = await touchPage(800, 1280, strProject);
    const t4 = await addInstr(tp, 'UPPER', ['Txt_A', 'Txt_D'], true);
    check('tablet (touch): the ASCII Conversion tab in landscape; UPPER added by touch with All… in portrait', tb === 'STOD,STOR,DTOS,RTOS,UPPER,LOWER' && t4 === 'UPPER(Txt_A,Txt_D);', tb + ' ' + t4);
    await tp.close();
    const pp = await touchPage(390, 844, strProject);
    const t5 = await addInstr(pp, 'MID', ['Txt_A', '3', '2', 'Txt_D'], true);
    await pp.evaluate(() => { MTPS.App.racks[0].controller(0).setKey('REM'); });
    const ok = await dlRun(pp); await pp.waitForTimeout(300);
    check('phone (touch): MID added with Add Ladder Element, downloaded and run: "ell"', t5 === 'MID(Txt_A,3,2,Txt_D);' && ok && (await strText(pp, 'Txt_D')) === 'ell', t5);
    await pp.evaluate(() => MTPS.App.racks[0].controller(0).setMode('remprog'));
    await pp.close();
  }
  console.log('MSG and the Message Configuration dialog (1756-RM018A chapter 4, 1756-PM012, v37 help)');
  {
    const msgProject = () => {
      const A = MTPS.App, p = A.example();
      p.tags.push({ name: 'Msg_A', type: 'MESSAGE' }, { name: 'Msg_B', type: 'MESSAGE' }, { name: 'Src_A', type: 'DINT', dim: 3, value: [7, 8, 9] }, { name: 'Dst_A', type: 'DINT', dim: 3 }, { name: 'Dst_B', type: 'DINT' }, { name: 'Go', type: 'BOOL' });
      p.tasks[0].programs[0].routines[0].rungs.push({ t: 'XIC(Go)MSG(Msg_B);' });
      document.querySelector('#layer').innerHTML = '';
      A.openProject(p);
      // a second emulated controller in slot 3 of the chassis, holding Tx = 42
      const ch = A.chassis;
      if (!ch.module(3)) ch.insert(3, 'PLC-CPU', 'Ctl_B');
      const q = JSON.parse(JSON.stringify(A.blank('Ctl_B'))); q.controller.slot = 3; q.rack.modules = []; q.tasks[0].programs[0].routines[0].rungs = [{ t: 'NOP();' }]; q.tags = [{ name: 'Tx', type: 'DINT', value: 42 }];
      const c = ch.controller(3); c.setKey('REM'); c.download(q); c.setMode('remrun');
    };
    const rungsOf = pg => pg.evaluate(() => MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs.map(r => r.t));
    const pickMenu = async (pg, label, tap) => {
      const ok = await pg.evaluate(l => { document.querySelectorAll('[data-w3pick]').forEach(x => delete x.dataset.w3pick); const it = [...document.querySelectorAll('#layer .menu .it')].find(x => [...x.querySelectorAll('span')].some(s => s.textContent === l)); if (it) it.dataset.w3pick = '1'; return !!it; }, label);
      if (!ok) return false;
      if (tap) await pg.tap('#layer [data-w3pick]'); else await pg.click('#layer [data-w3pick]');
      await pg.waitForTimeout(200);
      return true;
    };
    const tabTo = async (pg, name, tap) => { const s = `#layer .dtabs [data-dt="${name}"]`; if (tap) await pg.tap(s); else await pg.click(s); await pg.waitForTimeout(80); };
    const stat = pg => pg.evaluate(() => ({ on: [...document.querySelectorAll('#layer [data-mb]')].filter(x => x.classList.contains('on')).map(x => x.dataset.mb).join(' '), err: document.querySelector('#layer [data-mv="ERR"]').textContent, ext: document.querySelector('#layer [data-mv="EXERR"]').textContent, text: document.querySelector('#layer [data-mv="TEXT"]').textContent, len: document.querySelector('#layer [data-mv="DN_LEN"]').textContent }));
    const msgOf = (pg, n) => pg.evaluate(n => (MTPS.App.state.p.tags.find(t => t.name === n) || {}).msg || null, n);
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(150);
    await ev(msgProject); await wait(200);
    await page.click('[data-tab="Input/Output"]'); await wait(100);
    check('the Input/Output tab starts with MSG: MSG GSV SSV IOT', (await page.$$eval('.gbtn[data-mn]', b => b.map(x => x.dataset.mn).join(','))) === 'MSG,GSV,SSV,IOT');
    const t1 = await addInstr(page, 'MSG', ['Msg_A']);
    check('desktop: MSG from Add Ladder Element with its Message Control', t1 === 'MSG(Msg_A);', t1);
    const ri = String((await rungsOf(page)).length - 1);
    check('the ladder draws the MSG box with EN, DN and ER on its right', await page.evaluate(() => { const t = [...document.querySelectorAll('#ladwrap text')].map(x => x.textContent); return t.includes('MSG') && t.includes('Message Control') && ['EN', 'DN', 'ER'].every(b => t.includes(b)); }));
    // right-click the box: Message Configuration…
    await page.click(`#ladwrap rect.tap[data-ri="${ri}"][data-p="0"]:not([data-opi])`, { button: 'right', position: { x: 16, y: 8 } }); await wait(150);
    check('right-click on the MSG instruction: the menu has Message Configuration…', await pickMenu(page, 'Message Configuration…'));
    check('… which opens Message Configuration - Msg_A with the Configuration, Communication and Tag tabs', (await dlgTitle()) === 'Message Configuration - Msg_A' && (await page.$$eval('#layer .dtabs [data-dt]', t => t.map(x => x.textContent).join(','))) === 'Configuration,Communication,Tag');
    check('Message Type: CIP Data Table Read and CIP Data Table Write', (await page.$$eval('#layer #mc-ty option', o => o.map(x => x.textContent).join(','))) === 'CIP Data Table Read,CIP Data Table Write');
    await page.click('#layer #mc-src'); await page.fill('#layer #mc-src', 'Src_A[0]');
    await page.click('#layer #mc-n'); await page.fill('#layer #mc-n', '3');
    await page.click('#layer #mc-dst'); await page.fill('#layer #mc-dst', 'Nope');
    await page.click('#layer .df .btn.pri'); await wait(120);
    check('OK with a Destination Element that is not a tag: refused, with the reason', (await dlgTitle()) === 'Message Configuration - Msg_A' && /Destination Element: Nope is not a tag/.test(await page.$eval('#layer #mc-e', e => e.textContent)));
    await page.fill('#layer #mc-dst', 'Dst_A[0]');
    await page.click('#layer .df .btn.pri'); await wait(120);
    check('… and with no Path: refused (Path: 1,<slot> or THIS)', /^Path:/.test(await page.$eval('#layer #mc-e', e => e.textContent)));
    await tabTo(page, 'comm');
    check('Communication tab: Path, Browse…, the Communication Method (not available: greyed), Connected, Cache Connections, Large Connection', await page.evaluate(() => { const q = s => document.querySelector('#layer ' + s); return !!q('#mc-path') && !!q('#mc-br') && [...document.querySelectorAll('#layer [name="mc-cm"]')].every(r => r.disabled) && q('#mc-con').disabled && !q('#mc-cc').disabled && q('#mc-cc').checked && q('#mc-lc').disabled; }));
    await page.click('#layer #mc-br'); await wait(100);
    const rows = await page.$$eval('#layer [data-mcp]', r => r.map(x => x.dataset.mcp));
    check('Browse… lists THIS and the other controller of the chassis (1,3)', rows.join(' ') === 'THIS 1,3', rows.join(' '));
    await page.click('#layer [data-mcp="THIS"]'); await wait(80);
    check('picking THIS fills the Path and the display under it', (await page.$eval('#layer #mc-path', i => i.value)) === 'THIS' && /this controller/.test(await page.$eval('#layer #mc-pd', e => e.textContent)));
    await tabTo(page, 'tag');
    check('Tag tab: Name, Description, Type Base, Data Type MESSAGE, Scope, External Access', await page.evaluate(() => { const t = document.querySelector('#layer [data-pane="tag"]').textContent; return !!document.querySelector('#layer #mc-tn') && !!document.querySelector('#layer #mc-td') && /Base/.test(t) && /MESSAGE/.test(t) && /Scope/.test(t) && !!document.querySelector('#layer #mc-ea'); }));
    await page.click('#layer #mc-td'); await page.fill('#layer #mc-td', 'Read my own data');
    await page.click('#layer .df .btn.pri'); await wait(150);
    eq('OK saves the configuration with the tag (and its description)', [await msgOf(page, 'Msg_A'), await ev(() => MTPS.App.state.p.tags.find(t => t.name === 'Msg_A').desc)], [{ type: 'read', src: 'Src_A[0]', n: 3, dst: 'Dst_A[0]', path: 'THIS', cache: true }, 'Read my own data']);
    check('… and closes the dialog', (await page.$('#layer .dlg')) === null);
    // Msg_B: a read from the controller in slot 3, picked with Browse
    await page.click(`#ladwrap rect.tap[data-ri="${+ri - 1}"][data-p="1"]:not([data-opi])`, { button: 'right', position: { x: 16, y: 8 } }); await wait(150);
    await pickMenu(page, 'Message Configuration…');
    await page.fill('#layer #mc-src', 'Tx'); await page.fill('#layer #mc-dst', 'Dst_B');
    await tabTo(page, 'comm'); await page.click('#layer #mc-br'); await wait(80); await page.click('#layer [data-mcp="1,3"]'); await wait(80);
    check('Browse to slot 3: Path 1,3, shown as the controller Ctl_B', (await page.$eval('#layer #mc-path', i => i.value)) === '1,3' && /slot 3: Ctl_B \(controller\)/.test(await page.$eval('#layer #mc-pd', e => e.textContent)));
    await page.click('#layer .df .btn.pri'); await wait(150);
    // online: Go Online (Download), Remote Run
    await ev(() => MTPS.App.run('online'));
    for (let k = 0; k < 10 && !(await ev(() => MTPS.App.state.online && !document.querySelector('#layer .dlg'))); k++) {
      await wait(150);
      const b = await page.$('#layer .dlg .btn.pri'); if (b && !(await page.$('#layer .dlg .prog'))) await b.click(); else await wait(400);
    }
    check('Go Online and download the project', await ev(() => MTPS.App.state.online));
    await ev(() => MTPS.App.ctl.setMode('remrun')); await wait(400);
    eq('in Run: MSG(Msg_A) read Src_A[0..2] into Dst_A (THIS)', await ev(() => MTPS.App.ctl.read('Dst_A')), [7, 8, 9]);
    await ev(() => MTPS.App.ctl.write('Go', 1)); await wait(300);
    eq('… and XIC(Go) MSG(Msg_B) read Tx = 42 from the controller in slot 3', await ev(() => MTPS.App.ctl.read('Dst_B')), 42, JSON.stringify(await ev(() => { const c = MTPS.App.ctl, b = MTPS.App.chassis.controller(3); return [c.read('Msg_B'), c.slot, !!b, b && b.read('Tx'), b && b.powered, MTPS.App.state.p.tags.find(t => t.name === 'Msg_B').msg]; })));
    await ev(() => MTPS.App.render()); await wait(150);
    check('online, the MSG box shows its DN output energized', await page.evaluate(() => { const dn = [...document.querySelectorAll('#ladwrap text.bt')].filter(t => t.textContent === 'DN'), bars = [...document.querySelectorAll('#ladwrap rect.bar')].map(b => b.getBoundingClientRect()); return dn.some(t => { const r = t.getBoundingClientRect(); return bars.some(b => Math.abs(b.top - r.bottom) < 8 && b.left < r.right && b.right > r.left); }); }));
    await page.click(`#ladwrap rect.tap[data-ri="${ri}"][data-p="0"]:not([data-opi])`, { button: 'right', position: { x: 16, y: 8 } }); await wait(150);
    await pickMenu(page, 'Message Configuration…'); await wait(350);
    const s1 = await stat(page);
    check('online, the Status section shows Enable and Done, Done Length 3', s1.on === 'EN DN' && s1.len === '3', JSON.stringify(s1));
    await page.click('#layer .df .btn:not(.pri)'); await wait(120);
    // a bad path, changed online: the message errors with the code of the path
    await page.click(`#ladwrap rect.tap[data-ri="${+ri - 1}"][data-p="1"]:not([data-opi])`, { button: 'right', position: { x: 16, y: 8 } }); await wait(150);
    await pickMenu(page, 'Message Configuration…');
    await tabTo(page, 'comm'); await page.fill('#layer #mc-path', '1,5'); await page.dispatchEvent('#layer #mc-path', 'input'); await wait(60);
    check('the display under Path says the slot is empty', /slot 5: no module/.test(await page.$eval('#layer #mc-pd', e => e.textContent)));
    const btns = await page.$$('#layer .df .btn');
    await btns[1].click(); await wait(100);   // Apply
    await ev(() => MTPS.App.ctl.write('Go', 0)); await wait(150); await ev(() => MTPS.App.ctl.write('Go', 1)); await wait(450);
    const s2 = await stat(page);
    check('Apply online: the new path takes effect at once; an empty slot gives Error, 16#0001 / 16#0312 (link address not available)', s2.on.includes('ER') && s2.err === '16#0001' && s2.ext === '16#0312' && /link address not available/.test(s2.text), JSON.stringify(s2));
    check('… and the controller still holds the project (no download needed)', await ev(() => MTPS.App.ctl.holds(MTPS.App.state.p)));
    await page.click('#layer .df .btn.pri'); await wait(120);
    await ev(() => MTPS.App.run('offline')); await wait(200);
    if (await page.$('#layer .dlg')) { await page.keyboard.press('Escape'); await wait(100); }
    await page.screenshot({ path: '/tmp/claude-0/shots-w3/E/after-msg-online-1440.png' }).catch(() => {});
    // New Tag: Open Configuration, for a MESSAGE tag (v37 help, New Tag dialog)
    await ev(() => MTPS.App.ui.newTag({})); await wait(150);
    await page.fill('#layer #tn', 'Msg_N'); await page.fill('#layer #tt', 'MESSAGE'); await page.dispatchEvent('#layer #tt', 'input'); await wait(60);
    const ocfOn = await page.$eval('#layer #tocf', c => !c.disabled);
    await page.click('#layer #tocf'); await page.click('#layer .df .btn.pri'); await wait(250);
    check('New Tag of type MESSAGE: Open Configuration is offered, and Create opens its Message Configuration', ocfOn && (await dlgTitle()) === 'Message Configuration - Msg_N');
    await page.keyboard.press('Escape'); await wait(100);
    // tablet (touch): a long press on the MSG instruction, then Message Configuration…
    const hold = async (tp, sel) => {
      const cdp = await tp.context().newCDPSession(tp), b = await tp.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      await T('touchStart', b.x, b.y); await tp.waitForTimeout(650); await T('touchEnd'); await tp.waitForTimeout(250);
    };
    const tb = await touchPage(800, 1280, msgProject);
    await tb.evaluate(() => { const r = MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs; document.querySelector('#ladwrap').scrollTop = 99999; return r.length; }); await tb.waitForTimeout(200);
    const tri = String((await rungsOf(tb)).length - 1);
    await hold(tb, `#ladwrap rect.tap[data-ri="${tri}"][data-p="1"]:not([data-opi])`);
    const okT = await pickMenu(tb, 'Message Configuration…', true);
    await tabTo(tb, 'comm', true);
    await tb.tap('#layer #mc-br'); await tb.waitForTimeout(100); await tb.tap('#layer [data-mcp="1,3"]'); await tb.waitForTimeout(80);
    await tabTo(tb, 'conf', true);
    await tb.tap('#layer #mc-src'); await tb.fill('#layer #mc-src', 'Tx'); await tb.tap('#layer #mc-dst'); await tb.fill('#layer #mc-dst', 'Dst_B');
    await tb.tap('#layer .df .btn.pri'); await tb.waitForTimeout(150);
    eq('tablet (touch): hold the MSG, Message Configuration…, Browse and OK by touch', [okT, await msgOf(tb, 'Msg_B')], [true, { type: 'read', src: 'Tx', n: 1, dst: 'Dst_B', path: '1,3', cache: true }]);
    await tb.close();
    // phone (touch): the dialog full screen, the Tag tab, nothing wider than the screen
    const ph = await touchPage(390, 844, msgProject);
    await ph.evaluate(() => { document.querySelector('#ladwrap').scrollTop = 99999; }); await ph.waitForTimeout(200);
    const pri = String((await rungsOf(ph)).length - 1);
    await hold(ph, `#ladwrap rect.tap[data-ri="${pri}"][data-p="1"]:not([data-opi])`);
    const okP = await pickMenu(ph, 'Message Configuration…', true);
    await tabTo(ph, 'tag', true);
    const fit = await ph.evaluate(() => { const d = document.querySelector('#layer .dlg'), r = d.getBoundingClientRect(); return r.width <= innerWidth + 1 && d.scrollWidth <= d.clientWidth + 1 && /MESSAGE/.test(d.textContent); });
    await ph.screenshot({ path: '/tmp/claude-0/shots-w3/E/after-msg-tag-390.png' }).catch(() => {});
    await ph.tap('#layer .df .btn:not(.pri)'); await ph.waitForTimeout(120);
    check('phone (touch): hold, Message Configuration…, the Tag tab fits the screen; Cancel closes it', okP && fit && !(await ph.$('#layer .dlg')));
    await ph.close();
  }
  console.log('Add-On Instructions (1756-PM010; v37 help: Creating add-on instructions)');
  {
    const aoiProject = () => {
      const A = MTPS.App, p = A.example();
      p.tags.push({ name: 'Pb', type: 'BOOL' }, { name: 'Sb', type: 'BOOL', value: 1 }, { name: 'Lamp', type: 'BOOL' }, { name: 'Arr', type: 'DINT', dim: 2 });
      document.querySelector('#layer').innerHTML = '';
      A.openProject(p);
    };
    const pick = async (pg, label, tap) => {
      const ok = await pg.evaluate(l => { document.querySelectorAll('[data-w3pick]').forEach(x => delete x.dataset.w3pick); const it = [...document.querySelectorAll('#layer .menu .it')].find(x => [...x.querySelectorAll('span')].some(s => s.textContent === l)); if (it) it.dataset.w3pick = '1'; return !!it; }, label);
      if (!ok) return false;
      if (tap) await pg.tap('#layer [data-w3pick]'); else await pg.click('#layer [data-w3pick]');
      await pg.waitForTimeout(200);
      return true;
    };
    const aoiOf = (pg, n = 0) => pg.evaluate(n => JSON.parse(JSON.stringify((MTPS.App.state.p.aois || [])[n] || null)), n);
    // fill the last parameter (or local tag) row of the Definition editor
    const row = async (pg, sel, vals, tap) => {
      for (const [f, v] of Object.entries(vals)) {
        const s = `#layer ${sel}:last-child [data-f="${f}"]`;
        if (typeof v === 'boolean') { const c = await pg.$eval(s, x => x.checked); if (c !== v) { if (tap) await pg.tap(s); else await pg.click(s); } }
        else if (f === 'usage') await pg.selectOption(s, v);
        else { if (tap) await pg.tap(s); else await pg.click(s); await pg.fill(s, v); }
      }
    };
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(150);
    await ev(aoiProject); await wait(200);
    check('the organizer has Assets with Add-On Instructions, Data Types and Trends in it', await ev(() => { const n = [...document.querySelectorAll('.org [data-org]')].map(x => x.dataset.org), i = n.indexOf('assets'); return i >= 0 && n.indexOf('aois') === i + 1 && n.indexOf('dts') > i && n.indexOf('trends') > n.indexOf('dts'); }));
    await page.click('.org [data-org="aois"]', { button: 'right' }); await wait(150);
    check('right-click Add-On Instructions: New Add-On Instruction…', await pick(page, 'New Add-On Instruction…'));
    check('… opens the New Add-On Instruction dialog: Name, Description, Type, Revision, Revision Note, Vendor', (await dlgTitle()) === 'New Add-On Instruction' && (await page.$$('#layer #na-n, #layer #na-d, #layer #na-t, #layer #na-r, #layer #na-rn, #layer #na-v')).length === 6);
    await page.fill('#layer #na-n', 'TON'); await page.click('#layer .df .btn.pri'); await wait(100);
    check('a name of a built-in instruction is refused', /built-in instruction/.test(await page.$eval('#layer #na-e', e => e.textContent)));
    await page.fill('#layer #na-n', 'Motor_Ctl'); await page.fill('#layer #na-d', 'Start / stop with seal-in'); await page.fill('#layer #na-v', 'MT');
    await page.click('#layer .df .btn.pri'); await wait(250);
    check('OK creates it and opens the Add-On Instruction Definition (General, Parameters, Local Tags)', (await dlgTitle()) === 'Add-On Instruction Definition - Motor_Ctl v1.0' && (await page.$$eval('#layer .dtabs [data-dt]', t => t.map(x => x.textContent).join(','))) === 'General,Parameters,Local Tags');
    check('the Parameters tab shows EnableIn and EnableOut', /EnableIn[\s\S]*EnableOut/.test(await page.$eval('#layer [data-pane="par"]', e => e.textContent)));
    for (const [n, us, ty, req, vis] of [['Start', 'Input', 'BOOL', true], ['Stop', 'Input', 'BOOL', true], ['Run', 'Output', 'BOOL', true], ['Fault', 'Output', 'BOOL', false, true], ['Cfg', 'InOut', 'DINT[2]']]) {
      await page.click('#layer #ad-np'); await wait(60);
      await row(page, '[data-ap]', Object.assign({ name: n, usage: us, type: ty }, req !== undefined ? { req } : {}, vis !== undefined ? { vis } : {}));
    }
    check('an InOut parameter is always required and visible (greyed), with no Default', await page.$eval('#layer [data-ap]:last-child', r => r.querySelector('[data-f="req"]').checked && r.querySelector('[data-f="req"]').disabled && r.querySelector('[data-f="vis"]').checked && r.querySelector('[data-f="def"]').disabled));
    await page.click('#layer [data-dt="loc"]'); await wait(60);
    await page.click('#layer #ad-nl'); await wait(60); await row(page, '[data-al]', { name: 'Tmr', type: 'MESSAGE' });
    await page.click('#layer .df .btn.pri'); await wait(100);
    check('a MESSAGE local tag is refused (use an InOut parameter)', /MESSAGE cannot be a local tag/.test(await page.$eval('#layer #ad-e', e => e.textContent)));
    await row(page, '[data-al]', { type: 'TIMER' });
    await page.click('#layer .df .btn.pri'); await wait(200);
    const a1 = await aoiOf(page);
    eq('OK keeps the parameters in order (Req makes Vis; InOut required) and the local tag', a1 && [a1.params.map(x => [x.name, x.usage, x.type, !!x.req, !!x.vis]), a1.locals.map(x => x.name + ':' + x.type), a1.desc, a1.vendor],
      [[['Start', 'Input', 'BOOL', true, true], ['Stop', 'Input', 'BOOL', true, true], ['Run', 'Output', 'BOOL', true, true], ['Fault', 'Output', 'BOOL', false, true], ['Cfg', 'InOut', 'DINT', true, true]], ['Tmr:TIMER'], 'Start / stop with seal-in', 'MT']);
    check('the organizer: Motor_Ctl with Parameters and Local Tags, and Logic', await ev(() => ['aoi:Motor_Ctl', 'aoip:Motor_Ctl', 'rt:aoi:Motor_Ctl/Logic'].every(k => document.querySelector(`.org [data-org="${k}"]`))));
    if (!(await page.$('.org [data-org="dt:aod"]'))) { await page.click('.org [data-org="dts"] [data-tw]'); await wait(100); }
    if (!(await page.$('.org [data-org="dt:a:Motor_Ctl"]'))) { await page.click('.org [data-org="dt:aod"] [data-tw]'); await wait(100); }
    check('Data Types > Add-On-Defined holds the data type Motor_Ctl', !!(await page.$('.org [data-org="dt:a:Motor_Ctl"]')));
    // the Logic routine: a ladder routine in the editor
    await page.click('.org [data-org="rt:aoi:Motor_Ctl/Logic"]'); await wait(200);
    check('a tap on Logic opens it in the editor (tab Motor_Ctl - Logic)', (await ev(() => MTPS.App.state.prog)) === 'aoi:Motor_Ctl' && (await ev(() => document.body.textContent.includes('Motor_Ctl - Logic'))));
    const logic = ['[XIC(Start),XIC(Run)]XIC(Stop)OTE(Run);', 'XIC(Run)TON(Tmr,50,0);', 'XIC(Tmr.DN)OTE(Fault);', 'MOV(1,Cfg[1]);'];
    for (let i = 0; i < logic.length; i++) {
      if (i) await ev(() => { const S = MTPS.App.state, rr = S.p.aois[0].routines[0].rungs; rr.push({ t: '' }); S.selRung = rr.length - 1; MTPS.App.render(); });
      await page.click(`#ladwrap rect.tap[data-rn][data-ri="${i}"]`, { button: 'right' }); await wait(120);
      await pick(page, 'Edit Rung'); await page.fill('#desctx', logic[i]); await page.keyboard.press('Control+Enter'); await wait(120);
    }
    eq('the logic typed with Edit Rung', await ev(() => MTPS.App.state.p.aois[0].routines[0].rungs.map(r => r.t)), logic);
    await ev(() => MTPS.App.run('verifyc')); await wait(100);
    check('the logic uses only the parameters and local tags: it verifies', (await ev(() => MTPS.App.state.verify.errors.length)) === 0, JSON.stringify(await ev(() => MTPS.App.state.verify.errors.map(e => e.text))));
    // a tag of the Add-On Instruction's data type, and the instruction in MainRoutine
    await page.click('.org [data-org="rt:MainProgram/MainRoutine"]'); await wait(150);
    await ev(() => MTPS.App.ui.newTag({})); await wait(150);
    await page.fill('#layer #tn', 'M1'); await page.fill('#layer #tt', 'Motor_Ctl'); await page.dispatchEvent('#layer #tt', 'input'); await page.selectOption('#layer #ts', ''); await wait(60);
    const nte = await page.$eval('#layer #te', e => e.textContent).catch(() => '');
    await page.click('#layer .df .btn.pri'); await wait(150);
    check('New Tag of the data type Motor_Ctl', (await ev(() => (MTPS.App.state.p.tags.find(t => t.name === 'M1') || {}).type)) === 'Motor_Ctl', nte);
    await page.click('[data-tab="Add-On"]'); await wait(100);
    check('the instruction toolbar has the Add-On tab with Motor_Ctl', (await page.$$eval('.gbtn[data-mn]', b => b.map(x => x.dataset.mn).join(','))) === 'MOTOR_CTL');
    const ta = await addInstr(page, 'MOTOR_CTL', ['M1', 'Pb', 'Sb', 'Lamp', 'Arr']);
    check('Add Ladder Element: the Add-On Instruction with its tag and required parameters', ta === 'MOTOR_CTL(M1,Pb,Sb,Lamp,Arr);', ta);
    const tx = await page.$$eval('#ladwrap text', t => t.map(x => x.textContent));
    check('the box: Motor_Ctl, its operands (Start, Stop, Run, Cfg) and Fault as a flag on the right', ['Motor_Ctl', 'Start', 'Stop', 'Run', 'Cfg', 'Fault'].every(x => tx.includes(x)), tx.join(','));
    await ev(() => MTPS.App.run('verifyc')); await wait(100);
    check('the controller verifies', (await ev(() => MTPS.App.state.verify.errors.length)) === 0, JSON.stringify(await ev(() => MTPS.App.state.verify.errors.map(e => e.text))));
    check('download and run', await dlRun(page)); await wait(150);
    await ev(() => MTPS.App.racks[0].controller(0).write('Pb', 1)); await wait(150); await ev(() => MTPS.App.racks[0].controller(0).write('Pb', 0)); await wait(200);
    eq('in Run: Start seals in Run (Lamp), the InOut writes Arr[1]', await ev(() => { const c = MTPS.App.racks[0].controller(0); return [c.read('Lamp'), c.read('M1.Run'), c.read('Arr[1]')]; }), [1, 1, 1]);
    await wait(300);
    check('… and the TON in the logic sets the Fault output', (await ev(() => MTPS.App.racks[0].controller(0).read('M1.Fault'))) === 1);
    await ev(() => MTPS.App.racks[0].controller(0).setMode('remprog'));
    await page.screenshot({ path: '/tmp/claude-0/shots-w3/E/after-aoi-call-1440.png' }).catch(() => {});
    await ev(() => MTPS.App.aoiDefinition('Motor_Ctl', 'par')); await wait(150);
    await page.screenshot({ path: '/tmp/claude-0/shots-w3/E/after-aoi-def-1440.png' }).catch(() => {});
    await page.keyboard.press('Escape'); await wait(100);
    // tablet (touch): File > New Component > New Add-On Instruction…, then a parameter, by touch
    const tb = await touchPage(800, 1280, aoiProject);
    await tb.evaluate(() => MTPS.App.run('newaoi')); await tb.waitForTimeout(150);
    await tb.tap('#layer #na-n'); await tb.fill('#layer #na-n', 'Valve'); await tb.tap('#layer .df .btn.pri'); await tb.waitForTimeout(250);
    await tb.tap('#layer #ad-np'); await tb.waitForTimeout(80);
    await row(tb, '[data-ap]', { name: 'Open', usage: 'Input', type: 'BOOL', req: true }, true);
    await tb.tap('#layer .df .btn.pri'); await tb.waitForTimeout(200);
    const av = await aoiOf(tb);
    eq('tablet (touch): New Add-On Instruction and a required Input made by touch', av && [av.name, av.params.map(x => [x.name, x.usage, !!x.req])], ['Valve', [['Open', 'Input', true]]]);
    await tb.close();
    // phone (touch): the Definition editor fits the screen
    const ph = await touchPage(390, 844, aoiProject);
    await ph.evaluate(() => MTPS.App.run('newaoi')); await ph.waitForTimeout(150);
    await ph.tap('#layer #na-n'); await ph.fill('#layer #na-n', 'Pump'); await ph.tap('#layer .df .btn.pri'); await ph.waitForTimeout(250);
    await ph.tap('#layer #ad-np'); await ph.waitForTimeout(80);
    await row(ph, '[data-ap]', { name: 'Speed', usage: 'Input', type: 'REAL', def: '1.5' }, true);
    const fit = await ph.evaluate(() => { const d = document.querySelector('#layer .dlg'); return d.getBoundingClientRect().width <= innerWidth + 1 && d.scrollWidth <= d.clientWidth + 1 && [...d.querySelectorAll('.aprow')].every(r => r.getBoundingClientRect().right <= innerWidth + 1); });
    await ph.screenshot({ path: '/tmp/claude-0/shots-w3/E/after-aoi-def-390.png' }).catch(() => {});
    await ph.tap('#layer .df .btn.pri'); await ph.waitForTimeout(200);
    const ap = await aoiOf(ph);
    check('phone (touch): the Definition editor fits the screen; a REAL Input with Default 1.5', fit && ap && ap.params[0].def === 1.5 && ap.params[0].type === 'REAL', JSON.stringify(ap));
    await ph.close();
  }
  check('Wave 3 E: no JS errors on the touch pages', !errors.length, errors.join(' | '));
};
