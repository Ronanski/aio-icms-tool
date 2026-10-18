/* End-to-end regression tests. Runs the real app in headless Chromium.
   Usage: npm test   (needs the `playwright` package and a Chromium build) */
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let failed = 0, passed = 0;
function check(name, cond, info = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${info}`); }
}

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
  await page.goto(URL);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
  await page.reload();
  await page.waitForTimeout(400);

  const wait = ms => page.waitForTimeout(ms);
  const load = k => page.evaluate(k => { App.loadProject(Examples.EX[k].build()); }, k);
  const get = (label, prop) => page.evaluate(([l, p]) => p.split('.').reduce((o, k) => o[k], App.project.circuit.comps.find(c => c.props.label === l)), [label, prop]);
  const part = (label, p, ev) => page.evaluate(([l, p, ev]) => Circuit.part(App.project.circuit.comps.find(c => c.props.label === l), p, ev, App.ctx), [label, p, ev]);
  const press = async l => { await part(l, 'btn', 'down'); await wait(150); await part(l, 'btn', 'up'); };
  const setMode = m => page.evaluate(m => App.setMode(m), m);

  console.log('Views');
  for (const v of ['ladder', 'wiring', 'panel', 'hmi', 'learn']) {
    await page.click(`.tabs [data-view="${v}"]`);
    await wait(250);
    check(`${v} view renders`, await page.isVisible(`#view-${v}.active`));
  }

  console.log('New project');
  await page.click('[data-file]');
  await page.click('.ctx-menu button:has-text("New project")');
  await page.fill('#f_n', 'Test Project');
  await page.selectOption('#f_t', 'practice');
  await page.click('.modal .btn.primary');
  await wait(300);
  check('project created with name', (await page.evaluate(() => App.project.name)) === 'Test Project');
  check('template loaded', (await page.evaluate(() => App.project.circuit.comps.length)) > 5);
  await page.click('[data-file]');
  await page.click('.ctx-menu button:has-text("New project")');
  await page.fill('#f_n', '');
  await page.click('.modal .btn.primary');
  check('empty name rejected', (await page.textContent('.modal .form-err')).includes('name'));
  await page.keyboard.press('Escape');

  console.log('Ladder editing');
  await page.evaluate(() => App.showView('ladder'));
  await page.click('[data-act="rung"]');
  await page.click('[data-ins="XIC"]'); await page.fill('#f_a0', 'I:0/0'); await page.click('.modal .btn.primary');
  await page.click('[data-ins="OTE"]'); await page.fill('#f_a0', 'O:0/0'); await page.click('.modal .btn.primary');
  const txt = await page.evaluate(() => App.project.ladder.rungs.map(r => Ladder.serialize(r.elems)));
  check('toolbar builds XIC → OTE rung', txt.includes('XIC I:0/0 OTE O:0/0'), JSON.stringify(txt));
  await page.click('[data-ins="OTE"]'); await page.fill('#f_a0', 'X:9'); await page.click('.modal .btn.primary');
  check('invalid address rejected', (await page.textContent('.modal .form-err')).includes('bit address'));
  await page.keyboard.press('Escape');
  check('ASCII round-trip', await page.evaluate(() => {
    const t = 'BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 TON T4:0 1.0 5 0';
    return Ladder.serialize(Ladder.parseRung(t)) === t;
  }));

  console.log('PLC motor example');
  await load('plcmotor'); await setMode('RUN');
  await press('S1'); await wait(1200);
  check('start → KM1 pulls in', await get('KM1', 'state.pulled'));
  check('motor runs forward', (await get('M1', 'state.drive')) === 'run' && (await get('M1', 'state.dir')) === 1);
  check('start counter = 1', (await page.evaluate(() => App.plc.data.C5[0].ACC)) === 1);
  await part('M1', 'jam', 'down'); await wait(5200);
  check('jam → overload trips', await get('F1', 'state.tripped'));
  check('trip → motor stops', !(await get('KM1', 'state.pulled')));
  check('trip → HMI alarm bit', (await page.evaluate(() => App.plc.read('B3:0/15'))) === 1);

  console.log('Forcing');
  await page.evaluate(() => { App.force('O:0/1', 1); });
  await wait(200);
  check('force output on drives lamp', await get('H1', 'state.on'));
  await page.evaluate(() => { App.plc.forcesEnabled = false; App.forcesChanged(); });
  await wait(200);
  check('disabled forces have no effect', !(await get('H1', 'state.on')));

  console.log('Hardwired DOL');
  await load('dol');
  await press('S1'); await wait(600);
  check('seal-in holds KM1', await get('KM1', 'state.pulled'));
  await press('S0'); await wait(300);
  check('stop drops KM1', !(await get('KM1', 'state.pulled')));

  console.log('Conveyor');
  await load('conveyor'); await setMode('RUN');
  await press('S1'); await wait(12000);
  check('boxes counted', (await page.evaluate(() => App.plc.data.N7[0])) >= 2);

  console.log('Tank');
  await load('tank'); await setMode('RUN');
  await page.evaluate(() => { App.project.circuit.comps.find(c => c.props.label === 'TK1').state.lvl = 10; });
  await wait(800);
  check('low level → fill valve opens', await get('TK1', 'state.fill'));

  console.log('Electrical faults');
  await load('practice');
  await page.evaluate(() => {
    const c = App.project.circuit, qf = c.comps.find(x => x.props.label === 'QF1');
    c.wires.push({ id: 'wX', a: qf.id + ':2', b: qf.id + ':4', pts: [], color: '#000' });
  });
  await wait(300);
  check('short circuit trips breaker', await get('QF1', 'state.tripped'));
  check('PLC loses power', !(await page.evaluate(() => App.plc.powered)));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
