/* End-to-end regression tests. Runs the real app in headless Chromium.
   Usage: npm test   (needs the `playwright` package and a Chromium build) */
'use strict';
const path = require('path');
const fs = require('fs');
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
  const load = k => page.evaluate(k => { App.openNew(Examples.EX[k].build()); }, k);
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

  console.log('Layouts');
  await load('plcmotor'); await setMode('RUN');
  await page.evaluate(() => App.setLayout('bench'));
  await wait(400);
  const shown = () => page.evaluate(() => [...document.querySelectorAll('.view.active')].map(v => v.id.replace('view-', '')).join(','));
  check('Workbench shows ladder, wiring and panel together', (await shown()) === 'ladder,wiring,panel');
  const pb = await (await page.$('#view-panel .pcard svg [data-part="btn"]')).boundingBox();
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await page.mouse.down(); await wait(150); await page.mouse.up();
  await wait(800);
  check('panel press runs the motor while all panes are live', await get('KM1', 'state.pulled'));
  check('ladder pane shows power flow', (await page.$$eval('#view-ladder .w.on', els => els.length)) > 0);
  check('wiring pane shows live wires', (await page.$$eval('#view-wiring .wl.live', els => els.length)) > 0);
  await page.evaluate(() => App.setLayout('lw'));
  await wait(300);
  check('two-pane layout', (await shown()) === 'ladder,wiring');
  await page.evaluate(() => App.showView('hmi'));
  await wait(300);
  check('opening a view outside the layout shows it alone', (await shown()) === 'hmi');
  await page.evaluate(() => App.setLayout('single'));

  console.log('Projects');
  await page.evaluate(() => { App.openNew(Examples.EX.dol.build()); });
  check('examples open as separate projects', (await page.evaluate(() => Store.list().length)) >= 3);
  const firstId = await page.evaluate(() => Store.list().find(p => p.name === 'Test Project').id);
  await page.evaluate(id => App.openSaved(id), firstId);
  await page.waitForTimeout(200);
  check('reopen a saved project', (await page.evaluate(() => App.project.name)) === 'Test Project');

  console.log('Lesson check');
  check('lesson solutions pass, empty program fails', await page.evaluate(() => Examples.LESSONS.filter(l => l.test).every(l => {
    const good = Examples.gradeLesson(l, l.solution), bad = Examples.gradeLesson(l, []);
    return !good.error && good.every(r => r.ok) && !bad.every(r => r.ok);
  })));

  check('no page errors', errors.length === 0, errors.join(' | '));

  console.log('Phone (touch)');
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const perr = [];
  phone.on('pageerror', e => perr.push(e.message));
  await phone.goto(URL);
  await phone.waitForTimeout(500);
  check('no horizontal page scroll', (await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
  await phone.evaluate(() => App.showView('ladder'));
  await phone.tap('[data-act="data"]');
  await phone.waitForTimeout(300);
  check('Data drawer opens', await phone.evaluate(() => document.querySelector('.lad-side').classList.contains('open')));
  await phone.touchscreen.tap(15, 700);
  await phone.waitForTimeout(300);
  check('tap outside closes drawer', !(await phone.evaluate(() => document.querySelector('.lad-side').classList.contains('open'))));
  const cdp = await phone.context().newCDPSession(phone);
  const box = await (await phone.$('.rung .el[data-uid]')).boundingBox();
  const tp = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp });
  await phone.waitForTimeout(800);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check('long-press opens instruction menu', await phone.isVisible('#ctxMenu'));
  await phone.evaluate(() => { UI.closeMenu(); App.showView('wiring'); });
  await phone.waitForTimeout(400);
  const k0 = await phone.evaluate(() => document.querySelector('.ws-svg .vp').getAttribute('transform'));
  const s = await (await phone.$('.ws-svg')).boundingBox();
  const cx = s.x + s.width / 2, cy = s.y + s.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }] });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 30 - i * 15, y: cy, id: 1 }, { x: cx + 30 + i * 15, y: cy, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const scale = t => Number(/scale\(([\d.]+)\)/.exec(t)[1]);
  const k1 = await phone.evaluate(() => document.querySelector('.ws-svg .vp').getAttribute('transform'));
  check('pinch zooms the wiring canvas', scale(k1) > scale(k0) * 1.5, `${scale(k0)} → ${scale(k1)}`);
  check('no page errors on phone', perr.length === 0, perr.join(' | '));

  console.log('Installable app (PWA)');
  const root = path.resolve(__dirname, '..');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
  const server = require('http').createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const ctx = await browser.newContext();
  const web = await ctx.newPage();
  await web.goto(base);
  const swOk = await web.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  check('service worker active', swOk);
  const man = await web.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  check('manifest has name, start_url and 192/512 icons', man.name && man.start_url && ['192x192', '512x512'].every(sz => man.icons.some(i => i.sizes === sz)));
  const iconsOk = await web.evaluate(async icons => (await Promise.all(icons.map(i => fetch(i.src)))).every(r => r.ok), man.icons);
  check('manifest icons load', iconsOk);
  await web.reload();
  await web.waitForTimeout(400);
  await ctx.setOffline(true);
  await web.reload();
  await web.waitForTimeout(600);
  check('app loads offline from cache', await web.evaluate(() => !!(window.App && App.project && document.querySelector('.rung'))));
  await ctx.setOffline(false);
  server.close();
  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
