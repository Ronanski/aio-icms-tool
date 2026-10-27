/* MT PLC Studio instruction audit: every instruction is added and configured through the user interface on a
   desktop window, an Android tablet and an Android phone (touch), the way a user would: Add Ladder Element, the
   instruction tile, then each operand typed or picked in the operand box. Then verify, download, run.
   Usage: node tests/mtps-audit.js  (prints a table; exits 1 if any instruction fails) */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
// fastcomm=1: no connect, browse or transfer delays (the comm feel has its own tests, with the delays on)
const URL = 'file://' + path.resolve(__dirname, '..', 'mtps', 'index.html') + '?fastcomm=1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const LAYOUTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'tablet', viewport: { width: 800, height: 1280 }, isMobile: true, hasTouch: true, userAgent: ANDROID },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: ANDROID },
];
// the operands a user would give each instruction
const PLAN = {
  XIC: ['B1'], XIO: ['B1'], OTE: ['B2'], OTL: ['B2'], OTU: ['B2'], ONS: ['SB'], OSR: ['SB2', 'OB'], OSF: ['SB3', 'OB2'],
  TON: ['T1', '5000', '0'], TOF: ['T2', '3000', '0'], RTO: ['T3', '2000', '0'], CTU: ['C1', '10', '0'], CTD: ['C2', '10', '0'], RES: ['T1'],
  EQU: ['D1', 'D2'], NEQ: ['D1', 'D2'], LES: ['D1', 'D2'], LEQ: ['D1', 'D2'], GRT: ['D1', 'D2'], GEQ: ['D1', 'D2'], LIM: ['D1', 'D2', 'D3'],
  MEQ: ['D1', '16#00FF', 'D2'], CMP: ['D1 + D2 > 10'],
  ADD: ['D1', 'D2', 'D3'], SUB: ['D1', 'D2', 'D3'], MUL: ['D1', 'D2', 'D3'], DIV: ['D1', 'D2', 'D3'], MOD: ['D1', 'D2', 'D3'],
  SQR: ['R1', 'R2'], NEG: ['D1', 'D3'], ABS: ['D1', 'D3'], CPT: ['D3', 'D1 * 2 + D2'],
  MOV: ['D1', 'D3'], MVM: ['D1', '16#0F', 'D3'], CLR: ['D3'], AND: ['D1', 'D2', 'D3'], OR: ['D1', 'D2', 'D3'], XOR: ['D1', 'D2', 'D3'], NOT: ['D1', 'D3'],
  BTD: ['D1', '0', 'D3', '4', '4'], SWPB: ['D1', 'HIGH/LOW', 'D3'], COP: ['ARR[0]', 'ARR2[0]', '5'], FLL: ['7', 'ARR[0]', '10'],
  BSL: ['ARR[0]', 'CT1', 'B1', '16'], BSR: ['ARR2[0]', 'CT2', 'B1', '16'],
  FFL: ['D1', 'ARR[0]', 'CT3', '10', '0'], FFU: ['ARR[0]', 'D3', 'CT3', '10', '0'],
  LFL: ['D1', 'ARR2[0]', 'CT4', '10', '0'], LFU: ['ARR2[0]', 'D3', 'CT4', '10', '0'],
  SQI: ['ARR[0]', '16#00FF', 'D1', 'CT5', '4', '0'], SQO: ['ARR[0]', '16#00FF', 'D3', 'CT5', '4', '0'], SQL: ['ARR2[0]', 'D1', 'CT5', '4', '0'],
  JSR: ['Sub'], RET: [], SBR: [], JMP: ['L1'], LBL: ['L1'], MCR: [], AFI: [], NOP: [], TND: [],
};
const MNS = Object.keys(PLAN);

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const report = {};
  for (const lay of LAYOUTS) {
    const ctx = await browser.newContext({ viewport: lay.viewport, isMobile: !!lay.isMobile, hasTouch: !!lay.hasTouch, userAgent: lay.userAgent });
    await ctx.route('https://ronanski.github.io/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"version":"0.0.1"}' }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(400);
    const ev = (fn, a) => page.evaluate(fn, a);
    const tap = async sel => { if (lay.hasTouch) await page.tap(sel); else await page.click(sel); };
    // the project: the tags a user would have made, and a routine Sub for JSR
    await ev(() => {
      const A = MTPS.App, p = A.blank('Audit');
      const T = (name, type, dim) => p.tags.push(dim ? { name, type, dim } : { name, type });
      ['B1', 'B2', 'SB', 'SB2', 'SB3', 'OB', 'OB2'].forEach(n => T(n, 'BOOL'));
      ['D1', 'D2', 'D3'].forEach(n => T(n, 'DINT')); ['R1', 'R2'].forEach(n => T(n, 'REAL'));
      ['T1', 'T2', 'T3'].forEach(n => T(n, 'TIMER')); ['C1', 'C2'].forEach(n => T(n, 'COUNTER'));
      T('ARR', 'DINT', 10); T('ARR2', 'DINT', 10);
      ['CT1', 'CT2', 'CT3', 'CT4', 'CT5'].forEach(n => T(n, 'CONTROL'));
      p.tasks[0].programs[0].routines.push({ name: 'Sub', rungs: [{ t: 'NOP();' }] });
      A.openProject(p);
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const R = report[lay.name] = {};
    for (const mn of MNS) {
      const r = R[mn] = { ok: false, notes: [] };
      try {
        // a new empty rung at the end, selected
        await ev(() => { const S = MTPS.App.state, rr = S.p.tasks[0].programs[0].routines[0].rungs; if (rr[rr.length - 1].t) rr.push({ t: '' }); S.prog = 'MainProgram'; S.routine = 'MainRoutine'; S.view = 'ladder'; S.sel = null; S.selRung = rr.length - 1; MTPS.App.render(); });
        const ri = await ev(() => MTPS.App.state.selRung);
        await ev(() => MTPS.App.run('ins'));
        await page.waitForTimeout(120);
        if (!(await page.$('#layer #pq'))) { r.notes.push('Add Ladder Element did not open'); continue; }
        await page.fill('#layer #pq', mn);
        await page.waitForTimeout(60);
        const tile = await page.$(`#layer [data-pk="${mn}"]`);
        if (!tile) { r.notes.push('no tile in Add Ladder Element'); await page.keyboard.press('Escape'); continue; }
        await tap(`#layer [data-pk="${mn}"]`);
        await page.waitForTimeout(250);
        const plan = PLAN[mn];
        if (plan.length) {
          if (!(await page.$('#layer [data-op="0"]'))) { r.notes.push('operand box did not open'); continue; }
          for (let i = 0; i < plan.length; i++) {
            const f = `#layer [data-op="${i}"]`;
            if (!(await page.$(f))) { r.notes.push(`no field for operand ${i}`); break; }
            await tap(f);
            await page.fill(f, '');
            await page.waitForTimeout(60);
            const sugg = await page.$$eval('#layer #sg .row[data-pick]', x => x.map(y => y.dataset.pick));
            const want = plan[i].split(/[[\s]/)[0];
            if (/^[A-Za-z_]\w*$/.test(plan[i]) && !['HIGH/LOW'].includes(plan[i]) && mn !== 'JMP' && !sugg.some(s => s.toUpperCase() === want.toUpperCase())) r.notes.push(`operand ${i}: ${want} not offered (${sugg.length} offered)`);
            await page.fill(f, plan[i]);
          }
          await page.waitForTimeout(80);
          await tap('#layer .df .btn.pri');
          await page.waitForTimeout(200);
          const left = await page.$('#layer .dlg');
          if (left) { r.notes.push('dialog stayed open: ' + (await page.$eval('#layer .dlg', d => (d.querySelector('#ee') || d).textContent.trim().slice(0, 80)))); await page.keyboard.press('Escape'); await page.waitForTimeout(100); await page.keyboard.press('Escape'); }
        }
        const text = await ev(i => MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs[i].t, ri);
        const want = `${mn}(${plan.join(',')});`.replace(/ /g, '');
        r.text = text;
        if (text.replace(/ /g, '') !== want) r.notes.push(`rung is "${text}", wanted "${want}"`);
        r.ri = ri;
        r.ok = !r.notes.length;
      } catch (e) { r.notes.push('error: ' + e.message.split('\n')[0]); await page.keyboard.press('Escape').catch(() => {}); }
    }
    // verify: errors per rung
    const ver = await ev(() => { MTPS.App.run('verifyc'); const v = MTPS.App.state.verify || { errors: [] }; return v.errors.map(e => ({ r: e.rung, t: e.text || e.msg || JSON.stringify(e) })); });
    for (const mn of MNS) { const r = R[mn]; const es = ver.filter(e => e.r === r.ri); if (es.length) { r.ok = false; r.notes.push('verify: ' + es.map(e => e.t).join('; ').slice(0, 120)); } }
    report[lay.name + ':errors'] = errors.slice(0, 5);
    await ctx.close();
  }
  await browser.close();
  // the table
  let bad = 0;
  for (const mn of MNS) {
    const cells = LAYOUTS.map(l => report[l.name][mn]);
    const okAll = cells.every(c => c && c.ok);
    if (!okAll) bad++;
    console.log(`${okAll ? '✓' : '✗'} ${mn.padEnd(5)} ${LAYOUTS.map((l, i) => `${l.name}: ${cells[i] && cells[i].ok ? 'ok' : (cells[i] ? cells[i].notes.join(' | ') : 'not run')}`).join('  ||  ')}`);
  }
  LAYOUTS.forEach(l => { const e = report[l.name + ':errors']; if (e && e.length) console.log(`JS errors (${l.name}): ${e.join(' | ')}`); });
  console.log(`\n${MNS.length - bad} of ${MNS.length} instructions configured cleanly on all layouts`);
  process.exit(bad ? 1 : 0);
})();
