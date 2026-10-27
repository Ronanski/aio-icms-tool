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
    T.hitText = async (sel, text) => {
      const ok = await pg.evaluate(([s, t]) => { document.querySelectorAll('[data-w3pick]').forEach(x => delete x.dataset.w3pick); const el = [...document.querySelectorAll(s)].find(x => !x.hidden && x.offsetParent !== null && x.textContent.trim() === t); if (el) el.dataset.w3pick = '1'; return !!el; }, [sel, text]);
      if (!ok) return false;
      await T.hit('[data-w3pick]'); return true;
    };
    // a menu command, as a user reaches it: the menu bar (desktop), the folded menu (tablet), More (phone)
    T.cmd = async (menu, label) => {
      if (n === 'desktop') { await T.hit(`.dmenu [data-menu="${menu}"]`); return T.hitText('#layer .menu .it span', label); }
      if (n === 'tablet') { await T.hit('[data-allmenu]'); await T.hit(`[data-fold="${menu}"]`); return T.hitText('#layer .menu .it span', label); }
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

  for (const T of opened) await T.cx.close();
};
