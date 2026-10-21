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
  // the update check asks GitHub for releases: tests answer with a fixed list instead of the network
  let releases = [];
  // the hosted app (GitHub Pages) is served from this repository, and its version.json files from pagesInfo
  const NOUP = { version: '0.0.0', build: 'dev', notes: '' };   // the same build as the repository copy: no update
  const pagesInfo = { stable: NOUP, beta: NOUP }, pagesReq = [];
  const ROOT = path.resolve(__dirname, '..');
  const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const mockGitHub = async target => {
    await target.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(releases) }));
    await target.route('https://ronanski.github.io/aio-icms-tool/**', r => {
      const u = new globalThis.URL(r.request().url());
      let p = decodeURIComponent(u.pathname.replace('/aio-icms-tool/', ''));
      const beta = p.startsWith('beta/'); if (beta) p = p.slice(5);
      if (p === 'version.json') { pagesReq.push(u.pathname); const v = pagesInfo[beta ? 'beta' : 'stable']; return r.fulfill(v ? { status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(v) } : { status: 404, body: '' }); }
      const f = path.resolve(ROOT, p || 'index.html');
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
      return r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
    });
  };
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  // the classic IEC / ladder-style views stay testable behind the developer switch (the app offers free draw only)
  const classicOn = () => { try { localStorage.setItem('plc-trainer.classicViews', '1'); } catch (e) { /* ignore */ } };
  await page.addInitScript(classicOn);
  await mockGitHub(page);
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
  check('4 workspaces: Ladder, Electrical Diagram, Wiring, HMI', await page.$$eval('.tabs [data-view]', b => b.map(x => x.textContent.replace(/^\W+/, '').trim()).join('|')) === 'Ladder|Electrical Diagram|Wiring|HMI');
  for (const v of ['ladder', 'schematic', 'wiring', 'hmi']) {
    await page.click(`.tabs [data-view="${v}"]`);
    await wait(250);
    check(`${v} view renders`, await page.isVisible(`#view-${v}.active`));
  }
  await page.click('[data-help]'); await page.click('.ctx-menu button:has-text("Lessons")'); await wait(250);
  check('Help → Lessons opens Learn', await page.isVisible('#view-learn.active'));
  await page.click('[data-help]'); await page.click('.ctx-menu button:has-text("Keyboard shortcuts")'); await wait(150);
  check('Help → Keyboard shortcuts lists Ctrl+S', (await page.textContent('.modal-body')).includes('Ctrl+S'));
  await page.keyboard.press('Escape');

  console.log('New project');
  await page.click('[data-file]');
  await page.click('.ctx-menu button:has-text("New project")');
  await page.fill('#f_n', 'Test Project');
  await page.selectOption('#f_t', 'practice');
  await page.click('.modal .btn.primary');
  await wait(200);
  // page 2: the controller and its chassis
  await page.click('.modal-wrap:last-child .btn.primary');
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
  check('Workbench shows ladder, wiring and HMI together', (await shown()) === 'ladder,wiring,hmi');
  await page.evaluate(() => Workspace.fit()); await wait(200);
  const benchS1 = await page.evaluate(() => App.project.circuit.comps.find(c => c.props.label === 'S1').id);
  const pb = await (await page.$(`#view-wiring .comp[data-cid="${benchS1}"] [data-part="btn"]`)).boundingBox();
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2); await page.mouse.down(); await wait(150); await page.mouse.up();
  await wait(800);
  check('pressing START in the wiring runs the motor while all panes are live', await get('KM1', 'state.pulled'));
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

  console.log('Momentary buttons (quick taps)');
  await load('plcmotor'); await setMode('RUN');
  await page.evaluate(() => App.showView('hmi'));
  await wait(300);
  const hb = await (await page.$('.hmi-screen .t-pb')).boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.up();
  await wait(500);
  check('a quick click on an HMI button is seen by the PLC', await get('KM1', 'state.pulled'));
  check('HMI button bit is released afterwards', (await page.evaluate(() => App.plc.read('B3:0/0'))) === 0);
  await load('dol');
  await page.evaluate(() => App.showView('wiring'));
  await wait(400);
  const s1 = await page.evaluate(() => App.project.circuit.comps.find(c => c.props.label === 'S1').id);
  const wb = await (await page.$(`.comp[data-cid="${s1}"] [data-part="btn"]`)).boundingBox();
  await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2); await page.mouse.down(); await page.mouse.up();
  await wait(500);
  check('a quick click on a wiring push button is seen by the circuit', await get('KM1', 'state.pulled'));
  check('the push button releases and is saved released', !(await get('S1', 'state.pressed')));

  console.log('Overload relays');
  await page.evaluate(() => {
    const circ = { comps: [], wires: [], seq: 0 };
    const add = (t, x, y, props = {}, state = {}) => { const c = Circuit.create(t, x, y, circ); Object.assign(c.props, props); Object.assign(c.state, state); circ.comps.push(c); return c.id; };
    const w = (a, ta, b, tb) => { circ.seq++; circ.wires.push({ id: 'w' + circ.seq, a: a + ':' + ta, b: b + ':' + tb, pts: [], color: '#8B4513' }); };
    const q0 = add('supply3', 0, 0, { label: 'Q0' }), qf = add('mccb3', 0, 120, { label: 'QF1' }, { on: true });
    ['L1', 'L2', 'L3'].forEach((p, i) => w(q0, p, qf, String(1 + i * 2)));
    [1, 2].forEach(n => {
      const f = add('olr', n * 200, 300, { label: 'F' + n, trip: 1 }), m = add('motor', n * 200, 480, { label: 'M' + n });
      ['1', '3', '5'].forEach((t, i) => { w(qf, String(2 + i * 2), f, t); w(f, String(2 + i * 2), m, ['U1', 'V1', 'W1'][i]); });
    });
    App.openNew({ name: 'Two motors', circuit: circ });
    App.project.circuit.comps.find(c => c.props.label === 'M1').state.jam = true;
  });
  await wait(1800);
  check('jammed motor trips its own overload relay', await get('F1', 'state.tripped'));
  check('the other motor\'s overload relay stays ready', !(await get('F2', 'state.tripped')));
  check('the healthy motor keeps running', (await get('M2', 'state.drive')) === 'run');

  console.log('PLC engine');
  check('S:1/15 is set again after a power cycle', await page.evaluate(() => {
    const e = new PLCcore.Engine();
    e.setProgram([Ladder.newRung(Ladder.parseRung('XIC S:1/15 OTL B3:0/0'))]);
    e.setMode('RUN'); e.scan(0.02); e.scan(0.02);
    e.powered = false; e.scan(0.02); e.write('B3:0/0', 0);
    e.powered = true; e.scan(0.02);
    return e.read('B3:0/0') === 1 && e.read('S:1') < 0x8000;
  }));
  check('non-I/O addresses cannot be forced', await page.evaluate(() => {
    const e = new PLCcore.Engine();
    e.setForce('B3:0/0', 1); e.setForce('O:0/1', 1);
    return e.forceCount() === 1;
  }));
  await page.evaluate(() => App.openNew({ name: 'Presets', ladder: { rungs: [{ text: 'XIC I:0/0 TON T4:5 1.0 10 0' }] } }));
  await page.evaluate(() => { App.showView('ladder'); Ladder.addRung(false); App.plc.data.T4[5].PRE = 0; Ladder.undo(); });
  check('undo writes the timer preset again', (await page.evaluate(() => App.plc.data.T4[5].PRE)) === 10);
  await page.click('.rung[data-r="0"] .rung-num', { button: 'right' });
  await page.click('.ctx-menu button:has-text("Copy rung")');
  await page.evaluate(() => { App.openNew(Examples.EX.blank.build()); App.showView('ladder'); Ladder.addRung(false); });
  await wait(200);
  await page.click('.rung[data-r="0"] .rung-num', { button: 'right' });
  await page.click('.ctx-menu button:has-text("Paste rung below")');
  check('a pasted rung brings its timer preset', (await page.evaluate(() => App.plc.data.T4[5].PRE)) === 10);
  await load('practice');
  await page.evaluate(() => { App.plc.setMode('PROG'); App.force('O:0/0', 1); });
  await wait(600);
  check('PROG mode tells that forced outputs stay active', (await page.textContent('[data-msg]')).includes('forced outputs stay active'));
  await page.evaluate(() => App.force('O:0/0', null));

  console.log('Import safety');
  const before = await page.evaluate(() => ({ id: App.currentId, name: App.project.name }));
  const bad = await page.evaluate(() => [null, 5, '[]'].map(d => { try { App.openNew(d); return 'opened'; } catch (e) { return 'refused'; } }));
  const after = await page.evaluate(() => ({ id: App.currentId, name: App.project.name }));
  check('a file that is not a project is refused', bad.every(r => r === 'refused'), bad.join());
  check('a refused file leaves the open project as it was', before.id === after.id && before.name === after.name);
  await page.evaluate(() => App.openNew({ name: 'Broken wires', circuit: { comps: [], wires: [{ a: 5 }, null, { id: 'w1', a: 'x:1', b: 'y:2' }] }, ladder: { rungs: [null, { text: 5 }] } }));
  check('malformed parts of a file are dropped instead of failing', (await page.evaluate(() => App.project.name)) === 'Broken wires');
  await page.evaluate(() => {
    const evil = '"><img src=x onerror="window.__x=1">';
    const circ = { comps: [], wires: [], seq: 0 };
    const m = Circuit.create('motor', 0, 0, circ), q = Circuit.create('supply3', 0, 200, circ), v = Circuit.create('conveyor', 300, 0, circ);
    m.state.ang = evil; v.state.boxes = [{ x: evil }]; q.props.label = evil;
    circ.comps.push(m, q, v);
    circ.wires.push({ id: 'w9', a: q.id + ':L1', b: m.id + ':U1', pts: [], color: evil });
    App.openNew({ name: 'Evil', circuit: circ, hmi: { objects: [
      { id: 'h1', type: 'pb', x: 10, y: 10, w: 100, h: 60, label: 'X', tag: 'B3:0/0', mode: 'momentary', color: evil },
      { id: 'h2' + evil, type: 'pb', x: 10, y: 10, w: 100, h: 60 },
      { id: 'h3', type: 'script', x: 10, y: 10 },
    ] } });
  });
  for (const v of ['wiring', 'hmi', 'schematic']) { await page.evaluate(v => App.showView(v), v); await wait(250); }
  check('scripts hidden in an imported file do not run', await page.evaluate(() => window.__x === undefined && !document.querySelector('img[src="x"]')));
  check('unsafe HMI objects are dropped or cleaned', await page.evaluate(() => App.project.hmi.objects.length === 1 && App.project.hmi.objects[0].color === '#2fa84f'));
  check('unsafe wire colors are replaced', await page.evaluate(() => App.project.circuit.wires[0].color === '#1d1d1d'));
  check('saved momentary and bad states are reset on load', await page.evaluate(() => {
    const a = Circuit.normalize({ type: 'pb_nc', state: { pressed: true }, props: {} });
    const b = Circuit.normalize({ type: 'lamp', props: { coil: '120VAC', color: 'red' } });
    return a.state.pressed === false && b.props.coil === '24VDC' && b.props.color === 'red';
  }));

  console.log('Storage full');
  await page.evaluate(() => {
    window.__setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k.startsWith('plc-trainer.proj.')) throw new Error('QuotaExceededError'); return window.__setItem.call(this, k, v); };
    App.openNew({ name: 'Too big' });
  });
  await wait(200);
  check('a project that could not be stored is not listed', !(await page.evaluate(() => Store.list().some(p => p.name === 'Too big'))));
  check('the user is told that saving failed', (await page.textContent('#toast-root')).includes('Could not save'));
  await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; App.save(); App.flushSave(); });
  check('saving works again once there is room', await page.evaluate(() => Store.list().some(p => p.name === 'Too big')));

  console.log('Dark mode and naming');
  await load('dol');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; App.showView('wiring'); });
  await wait(300);
  check('wires have a light outline in dark mode', await page.evaluate(() => {
    const c = getComputedStyle(document.querySelector('.wire .wo')).stroke.match(/[\d.]+/g).map(Number);
    return c[0] > 200 && c[1] > 200 && c[2] > 200;
  }));
  await page.evaluate(() => { delete document.documentElement.dataset.theme; });
  for (const v of ['ladder', 'schematic', 'hmi', 'learn']) { await page.evaluate(v => App.showView(v), v); await wait(150); }
  const BRANDS = /Simurelay|Allen.?Bradley|Rockwell|RSLogix|RSLinx|Studio ?5000|\bLogix|ControlLogix|CompactLogix|MicroLogix|PanelView|SLC.?500|FactoryTalk/i;
  check('no brand names in the app', await page.evaluate(re => !new RegExp(re, 'i').test(document.documentElement.outerHTML), BRANDS.source));
  {
    // every string the app can show, including dialogs that are not open while this runs; comments may name the references
    const src = dir => fs.readdirSync(dir).filter(f => /\.js$/.test(f)).map(f => fs.readFileSync(path.join(dir, f), 'utf8'));
    const bare = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
    const hits = [...src(path.resolve(__dirname, '..', 'js')).map(bare),
      fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')]
      .flatMap(s => s.split('\n')).filter(l => BRANDS.test(l));
    check('no brand names in the source strings', !hits.length, hits.slice(0, 3).join(' | '));
  }

  console.log('Dialogs: keys go to the top dialog only');
  await page.evaluate(() => { UI.modal({ title: 'Lower' }); UI.modal({ title: 'Upper' }); });
  await page.keyboard.press('Escape');
  check('Escape on stacked dialogs closes only the top one', await page.evaluate(() => [...document.querySelectorAll('#modal-root .modal-wrap h3')].map(h => h.textContent).join() === 'Lower'));
  await page.keyboard.press('Escape');
  await page.evaluate(() => { UI.modal({ title: 'Removed' }); document.querySelector('#modal-root .modal-wrap').remove(); window.__esc = 0; document.addEventListener('keydown', e => { if (e.key === 'Escape') window.__esc++; }); });
  await page.keyboard.press('Escape');
  check('a dialog removed without close() does not keep eating Escape', await page.evaluate(() => window.__esc === 1));
  check('a damaged project index reads as an empty list', await page.evaluate(() => {
    const k = 'plc-trainer.projects.v2', keep = localStorage.getItem(k);
    try {
      localStorage.setItem(k, '{}'); const a = Store.list().length === 0;
      localStorage.setItem(k, '[null,{"id":"x","updated":1}]'); const b = Store.list().length === 1;
      return a && b;
    } finally { localStorage.setItem(k, keep); }
  }));

  console.log('Ladder: change, drag, zoom');
  await page.evaluate(() => { App.openNew({ name: 'Edit test', ladder: { rungs: [{ text: 'XIC I:0/0 XIC I:0/1 TON T4:0 1.0 5 0' }, { text: 'OTE O:0/1' }] } }); App.showView('ladder'); });
  await wait(300);
  const lad = () => page.evaluate(() => App.project.ladder.rungs.map(r => Ladder.serialize(r.elems)));
  await page.click('.rung[data-r="0"] .el[data-uid] .ins', { button: 'right' });
  await page.click('.ctx-menu button:has-text("XIO — ")');
  check('right-click → Change to swaps XIC for XIO and keeps the address', (await lad())[0].startsWith('XIO I:0/0 XIC I:0/1'), (await lad())[0]);
  const tonId = await page.evaluate(() => App.project.ladder.rungs[0].elems[2].id);
  await page.click(`.el[data-uid="${tonId}"] .ins`, { button: 'right' });
  await page.click('.ctx-menu button:has-text("TOF — ")');
  check('TON → TOF keeps timer, base and preset', (await lad())[0].endsWith('TOF T4:0 1.0 5 0'), (await lad())[0]);
  const drag = async (fromSel, toX, toY) => {
    const b = await (await page.$(fromSel)).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2, { steps: 3 });
    await page.mouse.move(toX, toY, { steps: 6 }); await page.mouse.up();
    await wait(200);
  };
  const ids = await page.evaluate(() => App.project.ladder.rungs[0].elems.map(e => e.id));
  const second = await (await page.$(`.el[data-uid="${ids[1]}"] .hit`)).boundingBox();
  await drag(`.el[data-uid="${ids[0]}"] .ins`, second.x + second.width * 0.8, second.y + second.height / 2);
  check('drag an instruction after its neighbour', (await lad())[0].startsWith('XIC I:0/1 XIO I:0/0'), (await lad())[0]);
  const r1 = await (await page.$('.rung[data-r="1"] .rung-svg')).boundingBox();
  await drag(`.el[data-uid="${ids[0]}"] .ins`, r1.x + 60, r1.y + 20);
  const moved = await lad();
  check('drag an instruction onto another rung', moved[0] === 'XIC I:0/1 TOF T4:0 1.0 5 0' && moved[1] === 'XIO I:0/0 OTE O:0/1', JSON.stringify(moved));
  await page.evaluate(() => Ladder.undo());
  check('a drag can be undone', (await lad())[0].startsWith('XIC I:0/1 XIO I:0/0'));
  await page.click('[data-act="zin"]');
  check('ladder zoom buttons show the zoom level', (await page.textContent('[data-lz]')) === '115%');
  await page.click('[data-act="zreset"]');
  check('ladder zoom resets to 100%', (await page.textContent('[data-lz]')) === '100%');

  console.log('Wiring: contact type, palette groups');
  await load('practice');
  await page.evaluate(() => App.showView('wiring'));
  await wait(300);
  const s1w = () => page.evaluate(() => { const c = App.project.circuit.comps.find(x => x.props.label === 'S1'); return { type: c.type, terms: App.project.circuit.wires.filter(w => w.a.startsWith(c.id + ':') || w.b.startsWith(c.id + ':')).map(w => (w.a.startsWith(c.id + ':') ? w.a : w.b).split(':')[1]).sort().join() }; });
  const s1before = await s1w();
  const s1id = await page.evaluate(() => App.project.circuit.comps.find(x => x.props.label === 'S1').id);
  await page.click(`.comp[data-cid="${s1id}"] .frame`, { position: { x: 4, y: 4 } });
  await page.selectOption('[data-variant]', 'pb_nc');
  const s1after = await s1w();
  check('a push button can be changed from N.O. to N.C.', s1before.type === 'pb_no' && s1after.type === 'pb_nc', JSON.stringify([s1before, s1after]));
  check('its wires move to the N.C. terminals', s1before.terms === '13,13,14' && s1after.terms === '11,11,12', JSON.stringify([s1before, s1after]));
  check('the device keeps its label and color', await page.evaluate(() => { const c = App.project.circuit.comps.find(x => x.props.label === 'S1'); return c.props.color === 'green' && c.props.text === 'START'; }));
  await page.click('[data-pal="close"]');
  check('palette groups collapse', await page.evaluate(() => [...document.querySelectorAll('.pal-cat')].every(d => !d.open)));
  await page.click('[data-pal="open"]');
  await page.click('.pal-cat[data-cat="Power"] > summary');
  check('one palette group can be folded', await page.evaluate(() => !document.querySelector('.pal-cat[data-cat="Power"]').open && document.querySelector('.pal-cat[data-cat="Sensors"]').open));
  await page.click('.pal-cat[data-cat="Power"] > summary');

  console.log('HMI zoom');
  await page.evaluate(() => App.showView('hmi'));
  await wait(200);
  const hk = () => page.evaluate(() => Number(getComputedStyle(document.querySelector('.hmi-bezel')).getPropertyValue('--k')));
  const k0h = await hk();
  await page.click('[data-hz="1"]'); await page.click('[data-hz="1"]');
  check('HMI zooms in', (await hk()) > k0h * 1.2, `${k0h} → ${await hk()}`);
  await page.click('[data-hz="fit"]');
  check('HMI fits the window again', Math.abs((await hk()) - k0h) < 0.01 && (await page.textContent('[data-hzv]')).startsWith('Fit'));

  console.log('Event log');
  await load('plcmotor'); await setMode('RUN');
  await press('S1'); await wait(600);
  await page.evaluate(() => App.force('O:0/1', 1)); await page.evaluate(() => App.force('O:0/1', null));
  await part('M1', 'jam', 'down'); await wait(5200);
  const ev = await page.evaluate(() => App.events().map(e => e.kind + ': ' + e.msg));
  check('mode changes are logged', ev.some(e => e === 'mode: Controller mode changed to RUN'), ev.join(' | '));
  check('forces are logged', ev.some(e => e.startsWith('force: Force ON installed on O:0/1')) && ev.some(e => e.startsWith('force: Force removed from O:0/1')));
  check('trips are logged as alarms', ev.some(e => e.startsWith('alarm:') && e.includes('TRIPPED')));
  check('the Events button shows unseen alarms', await page.isVisible('[data-evbadge]'));
  await page.click('[data-events]');
  check('the event log lists the events', (await page.$$eval('.ev-list tr', r => r.length)) > 4);
  await page.selectOption('[data-evf]', 'alarm');
  check('the event log filters by type', await page.$$eval('.ev-list tr .evk', r => r.length > 0 && r.every(x => x.textContent === 'Alarm')));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-evx]')]);
  check('the event log exports to CSV', dl.suggestedFilename().endsWith('-events.csv'));
  await page.keyboard.press('Escape');
  await page.evaluate(() => { App.setLayout('single'); App.showView('wiring'); Workspace.fit(); }); await wait(300);
  const opb = await (await page.$('#view-wiring .comp [data-part="btn"]')).boundingBox();
  await page.mouse.move(opb.x + opb.width / 2, opb.y + opb.height / 2); await page.mouse.down(); await wait(100); await page.mouse.up();
  check('operating a device is logged', await page.evaluate(() => App.events().some(e => e.kind === 'operator' && e.msg.includes('button operated'))));

  console.log('Save, Save as, Open');
  await page.evaluate(() => { App.showView('ladder'); document.activeElement.blur(); });
  await page.keyboard.press('Control+s');
  await wait(100);
  const toasts = await page.textContent('#toast-root');
  await wait(700);
  const saved = await page.textContent('[data-saved]');
  check('Ctrl+S saves and says so', toasts.includes('Saved “PLC motor control”') && saved === 'Saved', JSON.stringify([toasts.slice(-120), saved]));
  const n0 = await page.evaluate(() => Store.list().length);
  await page.keyboard.press('Control+Shift+S');
  await page.fill('#f_n', 'Motor copy');
  await page.click('.modal .btn.primary');
  await wait(200);
  check('Save as makes a copy with the new name', (await page.evaluate(() => App.project.name)) === 'Motor copy' && (await page.evaluate(() => Store.list().length)) === n0 + 1);
  check('the copy has the same program', (await page.evaluate(() => App.project.ladder.rungs.length)) > 3);
  await page.keyboard.press('Control+o');
  check('Ctrl+O opens the project list', (await page.textContent('.modal-head h3')) === 'Open project');
  await page.keyboard.press('Escape');

  console.log('Updates');
  check('versions compare like semver (beta < release)', await page.evaluate(() => {
    const c = Updater.compare;
    return c('1.2.0', '1.1.0') > 0 && c('1.3.0-beta.1', '1.2.0') > 0 && c('1.3.0-beta.1', '1.3.0') < 0 && c('1.3.0-beta.2', '1.3.0-beta.10') < 0 && c('v1.2.0', '1.2.0') === 0;
  }));
  pagesInfo.stable = { version: '9.9.0', build: 'v9.9.0', notes: '### Added\n- **Stable** thing <script>' };
  pagesInfo.beta = { version: '9.9.1', build: 'beta.abc1234', notes: '- beta' };
  await page.evaluate(() => { localStorage.setItem('plc-trainer.channel', 'stable'); localStorage.removeItem('plc-trainer.updateSkip'); });
  let st = await page.evaluate(() => Updater.check(true).then(s => s.info && s.info.version));
  check('stable channel reads the Stable copy (site root version.json)', st === '9.9.0' && pagesReq[pagesReq.length - 1] === '/aio-icms-tool/version.json', st + ' ' + pagesReq.join());
  check('the update bar offers an in-app restart, not a download', (await page.textContent('.update-bar')).includes('v9.9.0') && (await page.textContent('.update-bar')).includes('Restart to update') && !/download/i.test(await page.textContent('.update-bar')));
  await page.click('.update-bar [data-u="notes"]');
  check('release notes show as text, never as HTML', await page.evaluate(() => !!document.querySelector('.rel-notes li') && !document.querySelector('.rel-notes script')));
  await page.keyboard.press('Escape');
  await page.evaluate(() => localStorage.setItem('plc-trainer.channel', 'beta'));
  st = await page.evaluate(() => Updater.check(true).then(s => s.info && s.info.build));
  check('beta channel reads the Beta copy (/beta/version.json, every merge)', st === 'beta.abc1234' && pagesReq[pagesReq.length - 1] === '/aio-icms-tool/beta/version.json', st);
  check('the bar marks it as BETA', (await page.textContent('.update-bar')).includes('BETA'));
  await page.click('.update-bar [data-u="later"]');
  check('Later hides the bar', !(await page.$('.update-bar')));
  await page.evaluate(() => Updater.check(false).catch(() => null));
  check('a skipped version does not come back on automatic checks', !(await page.$('.update-bar')));
  pagesInfo.beta = { version: '1.0.0', build: 'dev', notes: '' };
  st = await page.evaluate(() => Updater.check(true).then(s => s.status));
  check('no update when this is the build the channel serves', st === 'current', st);
  {
    // the Android / Windows app runs a built-in copy: the same version on the channel is not an update
    const ver = await page.evaluate(() => App.VERSION);
    pagesInfo.beta = { version: ver, build: 'v' + ver, notes: '' };
    st = await page.evaluate(async () => { const b = App.BUILD; App.BUILD = 'v' + App.VERSION + '-apk'; try { return (await Updater.check(true)).status; } finally { App.BUILD = b; } });
    check('a built-in copy (Android / Windows app) is not told "v2.3.0 is ready, you have v2.3.0"', st === 'current' && !(await page.$('.update-bar')), st);
    pagesInfo.beta = { version: '99.0.0', build: 'v99.0.0', notes: '' };
    st = await page.evaluate(async () => { const b = App.BUILD; App.BUILD = 'v' + App.VERSION + '-apk'; try { return (await Updater.check(true)).status; } finally { App.BUILD = b; } });
    check('a built-in copy is offered a newer version', st === 'available', st);
    await page.evaluate(() => { const b = document.querySelector('.update-bar'); if (b) b.remove(); });
    pagesInfo.beta = { version: '1.0.0', build: 'dev', notes: '' };
  }
  await page.context().setOffline(true);
  st = await page.evaluate(() => Updater.check(true).then(s => s.status));
  check('offline: no check, no error, app keeps working', st === 'offline' && !!(await page.evaluate(() => App.project && document.querySelector('.rung'))), st);
  await page.context().setOffline(false);
  await page.evaluate(() => { localStorage.setItem('plc-trainer.channel', 'stable'); Updater.dialog(); });
  check('File → Updates shows the channel choice', await page.isChecked('[name="uch"][value="stable"]'));
  await page.keyboard.press('Escape');

  console.log('v1.2.1 fixes');
  await page.evaluate(() => { App.setLayout('single'); App.openNew({ name: 'Drag safety', ladder: { rungs: [{ text: 'BST XIC I:0/0 NXB XIC I:0/3 BND OTE O:0/0' }, { text: 'XIC I:0/1 OTE O:0/1' }] } }); App.showView('ladder'); });
  await wait(300);
  const lad2 = () => page.evaluate(() => App.project.ladder.rungs.map(r => Ladder.serialize(r.elems)).join(' | '));
  const prog0 = await lad2();
  const firstXic = await page.evaluate(() => App.project.ladder.rungs[0].elems[0].legs[0][0].id);
  const fx = await (await page.$(`.el[data-uid="${firstXic}"] .ins`)).boundingBox();
  await page.mouse.move(fx.x + fx.width / 2, fx.y + fx.height / 2); await page.mouse.down();
  await page.mouse.move(5, 5); await page.mouse.up();
  const r1b = await (await page.$('.rung[data-r="1"] .rung-svg')).boundingBox();
  await page.mouse.move(r1b.x + r1b.width / 2, r1b.y + 15, { steps: 4 });
  await page.mouse.click(r1b.x + r1b.width / 2, r1b.y + 15);
  await wait(200);
  check('a release outside the rungs never leaves a drag armed (a later click moves nothing)', (await lad2()) === prog0, await lad2());
  check('no drag ghost is left on screen', !(await page.$('.lad-ghost')));
  check('a drop that changes nothing keeps undo and redo', await page.evaluate(() => {
    Ladder.addRung(false); Ladder.undo();
    const id = App.project.ladder.rungs[1].elems[0].id;
    const bad = Ladder.moveTo(id, { id: 999999 }), same = Ladder.moveTo(id, { id: App.project.ladder.rungs[1].elems[1].id, after: false });
    const n = App.project.ladder.rungs.length; Ladder.redo();
    return !bad && !same && App.project.ladder.rungs.length === n + 1;
  }));
  await page.evaluate(() => Ladder.undo());
  check('dropping on a branch rail places the instruction next to the branch', await page.evaluate(() => {
    const r0 = App.project.ladder.rungs[0], br = r0.elems[0], x = App.project.ladder.rungs[1].elems[0];
    Ladder.moveTo(x.id, { id: br.id, after: true });
    return Ladder.serialize(App.project.ladder.rungs[0].elems).startsWith('BST XIC I:0/0 NXB XIC I:0/3 BND XIC I:0/1');
  }));

  await load('plcmotor');
  await page.evaluate(() => App.setLayout('bench'));
  await wait(400);
  check('Workbench: every ladder toolbar button is visible inside its pane', await page.evaluate(() => {
    const pane = document.getElementById('view-ladder').getBoundingClientRect();
    const btns = [...document.querySelectorAll('#view-ladder .lad-toolbar button')].filter(b => b.offsetParent);
    return btns.length > 30 && btns.every(b => { const r = b.getBoundingClientRect(); return r.right <= pane.right + 1 && r.left >= pane.left - 1 && r.width > 0; });
  }));
  check('Workbench: the wiring zoom is visible', await page.evaluate(() => {
    const pane = document.getElementById('view-wiring').getBoundingClientRect(), z = document.querySelector('#view-wiring [data-z]').getBoundingClientRect();
    return z.right <= pane.right + 1 && z.width > 0;
  }));
  await page.evaluate(() => App.setLayout('single'));

  pagesInfo.stable = { version: '99.0.0', build: 'v99.0.0', notes: '> note' };
  await page.evaluate(() => { localStorage.setItem('plc-trainer.channel', 'stable'); return Updater.check(true); });
  check('the update bar sits under the status bar and covers nothing', await page.evaluate(() => {
    const bar = document.querySelector('.update-bar'), pb = document.querySelector('.plcbar').getBoundingClientRect(), r = bar.getBoundingClientRect();
    return bar.nextElementSibling.id === 'main' && r.top >= pb.bottom - 1;
  }));
  await page.click('.update-bar [data-u="later"]');
  pagesInfo.stable = NOUP; pagesInfo.beta = NOUP;
  check('a failed update check is not retried at once', await page.evaluate(async () => {
    const f = window.fetch; window.fetch = () => Promise.reject(new Error('down'));
    const a = await Updater.check(true); let calls = 0; window.fetch = () => { calls++; return f.apply(window, arguments); };
    await Updater.check(false); window.fetch = f;
    return a.status === 'error' && calls === 0;
  }));

  await setMode('RUN');
  await page.evaluate(() => { App.showView('wiring'); });
  await wait(200);
  const s1c = await page.evaluate(() => App.project.circuit.comps.find(c => c.props.label === 'S1').id);
  await page.click(`.comp[data-cid="${s1c}"] .frame`, { position: { x: 4, y: 4 }, force: true });
  await page.focus('.ws-props input[data-pk="label"]');
  await page.keyboard.press('Control+s');
  await wait(150);
  check('Ctrl+S saves even while typing in a field', (await page.textContent('#toast-root')).includes('Saved “PLC motor control”'));
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Control+Shift+S');
  await page.fill('#f_n', 'Running copy');
  await page.click('.modal .btn.primary');
  await wait(200);
  check('Save as keeps the PLC running and the plant as it is', await page.evaluate(() => App.plc.mode === 'RUN' && App.project.name === 'Running copy' && Store.list().some(p => p.name === 'Running copy')));
  await page.evaluate(() => { const p = App.project.circuit.comps.find(c => c.props.label === 'S1'); p.props.label = '=HYPERLINK("x")'; App.operate(p, 'btn')(); });
  await page.click('[data-events]');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-evx]')]);
  const csv = fs.readFileSync(await dl2.path(), 'utf8');
  check('CSV export neutralises formulas', csv.includes('"\'=HYPERLINK') && !/(^|,)"=/m.test(csv));
  await page.keyboard.press('Escape');
  await page.click('[data-file]');
  await page.click('.ctx-menu button:has-text("Reset PLC data table")');
  check('Reset data table asks first', (await page.textContent('.modal-head h3')) === 'Reset PLC data table');
  await page.keyboard.press('Escape');

  check('math sets S:0 flags and S:5/0 on overflow', await page.evaluate(() => {
    const run = t => { const e = new PLCcore.Engine(); e.setProgram([Ladder.newRung(Ladder.parseRung(t))]); e.setMode('RUN'); e.scan(0.02); return e; };
    const add = run('ADD 32767 1 N7:0'), zero = run('SUB 5 5 N7:0'), neg = run('MOV -5 N7:0'), div = run('DIV 7 0 N7:0'), ok = run('ADD 2 3 N7:0');
    return add.read('S:0/1') === 1 && add.read('S:5/0') === 1 && add.read('N7:0') === 32767 &&
      zero.read('S:0/2') === 1 && neg.read('S:0/3') === 1 && div.read('S:0/1') === 1 && div.read('N7:0') === 32767 &&
      ok.read('S:0/1') === 0 && ok.read('S:5/0') === 0 && ok.read('N7:0') === 5;
  }));

  const mk = async build => page.evaluate(build);
  await mk(() => {
    const circ = { comps: [], wires: [], seq: 0 };
    const add = (t, props = {}, state = {}) => { const c = Circuit.create(t, 0, 0, circ); Object.assign(c.props, props); Object.assign(c.state, state); circ.comps.push(c); return c.id; };
    const w = (a, ta, b, tb) => { circ.seq++; circ.wires.push({ id: 'w' + circ.seq, a: a + ':' + ta, b: b + ':' + tb, pts: [], color: '#8B4513' }); };
    const q = add('supply1', { label: 'Q0' }), plc = add('plc', { label: 'PLC' });
    w(q, 'L', plc, 'L1'); w(q, 'N', plc, 'N'); w(q, 'L', plc, 'I0'); w(q, 'N', plc, 'COM');
    App.openNew({ name: 'Mains on input', circuit: circ });
  });
  await wait(300);
  check('230 VAC on a 24 VDC PLC input destroys that input and raises an alarm', await page.evaluate(() => {
    const c = App.project.circuit.comps.find(x => x.type === 'plc');
    return (c.state.badIn & 1) === 1 && (App.plc.physIn & 1) === 0 && App.events().some(e => e.kind === 'alarm' && e.msg.includes('I:0/0 destroyed'));
  }));
  await mk(() => {
    const circ = { comps: [], wires: [], seq: 0 };
    const add = (t, props = {}, state = {}) => { const c = Circuit.create(t, 0, 0, circ); Object.assign(c.props, props); Object.assign(c.state, state); circ.comps.push(c); return c.id; };
    const w = (a, ta, b, tb) => { circ.seq++; circ.wires.push({ id: 'w' + circ.seq, a: a + ':' + ta, b: b + ':' + tb, pts: [], color: '#8B4513' }); };
    const q = add('supply1', { label: 'Q0' }), up = add('mcb1', { label: 'QF1' }, { on: true }), down = add('mcb1', { label: 'QF2' }, { on: true }), lamp = add('lamp', { label: 'H1', coil: '230VAC' });
    w(q, 'L', up, '1'); w(up, '2', down, '1'); w(up, '2', lamp, 'X1'); w(lamp, 'X2', q, 'N'); w(down, '2', q, 'N');
    App.openNew({ name: 'Selectivity', circuit: circ });
  });
  await wait(300);
  check('a short trips the breaker nearest the fault, the upstream one stays on', (await get('QF2', 'state.tripped')) && !(await get('QF1', 'state.tripped')) && (await get('H1', 'state.on')));
  await mk(() => {
    const circ = { comps: [], wires: [], seq: 0 };
    const add = (t, props = {}, state = {}) => { const c = Circuit.create(t, 0, 0, circ); Object.assign(c.props, props); Object.assign(c.state, state); circ.comps.push(c); return c.id; };
    const w = (a, ta, b, tb) => { circ.seq++; circ.wires.push({ id: 'w' + circ.seq, a: a + ':' + ta, b: b + ':' + tb, pts: [], color: '#8B4513' }); };
    const q = add('supply1', { label: 'Q0' }), g = add('psu24', { label: 'G1' }), k = add('relay', { label: 'K1', coil: '24VDC' });
    w(q, 'L', g, 'L'); w(q, 'N', g, 'N'); w(g, 'P1', k, '11'); w(k, '12', k, 'A1'); w(k, 'A2', g, 'M1');
    App.openNew({ name: 'Buzzer', circuit: circ });
  });
  await wait(500);
  check('a circuit that never settles raises a warning', await page.evaluate(() => App.events().some(e => e.msg.includes('does not settle'))));

  check('Verify rejects a negative timer preset and out-of-range or fractional constants', await page.evaluate(() => {
    const e = new PLCcore.Engine();
    const v = t => e.verify([Ladder.newRung(Ladder.parseRung(t))]);
    return v('XIC I:0/0 TON T4:0 1.0 -5 0').errs.length === 1 && v('XIC I:0/0 MOV 2.5 N7:0').errs.length === 1 &&
      v('EQU N7:0 99999 OTE O:0/0').errs.length === 1 && v('XIC I:0/0 CTU C5:0 -3 0').errs.length === 0 && v('XIC I:0/0 TON T4:0 1.0 5 0').errs.length === 0;
  }));
  check('Verify warns about shared timers and counters with different presets', await page.evaluate(() => {
    const e = new PLCcore.Engine(), R = t => Ladder.newRung(Ladder.parseRung(t));
    const t2 = e.verify([R('XIC I:0/0 TON T4:0 1.0 5 0'), R('XIC I:0/1 TOF T4:0 1.0 5 0')]).warns.some(w => w.msg.includes('share one accumulator'));
    const c2 = e.verify([R('XIC I:0/0 CTU C5:0 10 0'), R('XIC I:0/1 CTD C5:0 5 0')]).warns.some(w => w.msg.includes('different presets'));
    const ok = !e.verify([R('XIC I:0/0 CTU C5:0 10 0'), R('XIC I:0/1 CTD C5:0 10 0')]).warns.some(w => w.msg.includes('presets'));
    return t2 && c2 && ok;
  }));
  await mk(() => {
    const circ = { comps: [], wires: [], seq: 0 };
    const add = (t, props = {}, state = {}) => { const c = Circuit.create(t, 0, 0, circ); Object.assign(c.props, props); Object.assign(c.state, state); circ.comps.push(c); return c.id; };
    const w = (a, ta, b, tb) => { circ.seq++; circ.wires.push({ id: 'w' + circ.seq, a: a + ':' + ta, b: b + ':' + tb, pts: [], color: '#8B4513' }); };
    const q = add('supply1', { label: 'Q0' }), g = add('psu24', { label: 'G1' });
    w(q, 'L', g, 'L'); w(q, 'N', g, 'N'); w(g, 'P1', g, 'M1');
    App.openNew({ name: 'PSU short', circuit: circ });
  });
  await wait(300);
  check('a shorted 24 V output turns DC OK off and raises an alarm', (await get('G1', 'state.dcFault')) === true && await page.evaluate(() => App.events().some(e => e.msg.includes('24 V output short circuit'))));
  await page.evaluate(() => {
    const circ = { comps: [], wires: [], seq: 0 };
    const add = (t, props = {}, state = {}) => { const c = Circuit.create(t, 0, 0, circ); Object.assign(c.props, props); Object.assign(c.state, state); circ.comps.push(c); return c.id; };
    const w = (a, ta, b, tb) => { circ.seq++; circ.wires.push({ id: 'w' + circ.seq, a: a + ':' + ta, b: b + ':' + tb, pts: [], color: '#8B4513' }); };
    const q = add('supply3', { label: 'Q0' }), f = add('olr', { label: 'F1', trip: 0 }), m = add('motor', { label: 'M1' }, { jam: true });
    ['L1', 'L2', 'L3'].forEach((p, i) => { w(q, p, f, String(1 + i * 2)); w(f, String(2 + i * 2), m, ['U1', 'V1', 'W1'][i]); });
    App.openNew({ name: 'Instant trip', circuit: circ });
    App.project.circuit.comps.find(c => c.props.label === 'M1').state.jam = true;
  });
  await wait(400);
  check('an overload relay set to 0 s trips at once (not after 4 s)', await get('F1', 'state.tripped'));
  const elCtx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Electron/33.2.1 Chrome/130', serviceWorkers: 'block' });
  await mockGitHub(elCtx);
  const el = await elCtx.newPage();
  await el.goto(URL + '?local=1'); await el.waitForTimeout(300);
  check('the Windows app with ?local=1 stays on its built-in copy', el.url().startsWith('file:'));
  await el.evaluate(() => { App.openNew({ name: 'From the old app' }); App.saveNow(); localStorage.setItem('plc-trainer.handoverTest', 'not a project'); localStorage.setItem('plc-trainer.channel', 'stable'); });
  await el.goto(URL); await el.waitForTimeout(1200);
  check('the Windows app moves to the hosted app (in-app updates)', el.url() === 'https://ronanski.github.io/aio-icms-tool/', el.url());
  check('projects and the channel of the old app are brought along, other keys are not', await el.evaluate(() => Store.list().some(p => p.name === 'From the old app') && localStorage.getItem('plc-trainer.channel') === 'stable' && localStorage.getItem('plc-trainer.handoverTest') === null && !location.hash && !!window.App && !!App.project));
  await el.evaluate(() => { localStorage.setItem('plc-trainer.channel', 'beta'); location.reload(); });
  await el.waitForTimeout(1200);
  check('the Beta channel opens the Beta copy (/beta/)', el.url() === 'https://ronanski.github.io/aio-icms-tool/beta/', el.url());
  await el.evaluate(() => { localStorage.setItem('plc-trainer.handoverTest', 'changed in the hosted app'); });
  await elCtx.close();

  await page.evaluate(() => App.showView('hmi'));
  check('HMI modes are named Machine / Studio (not Run)', (await page.textContent('.hmi-toolbar .seg')).includes('Machine') && (await page.textContent('.hmi-toolbar .seg')).includes('Studio') && !(await page.textContent('.hmi-toolbar .seg')).includes('Run'));

  console.log('v1.3 wiring and windows');
  await load('practice');
  await page.evaluate(() => { App.setLayout('single'); App.showView('ladder'); });
  await page.click('[data-layout]');
  await page.click('.ctx-menu button:has-text("☐ HMI")');
  await wait(300);
  check('View menu: ticking HMI shows Ladder and HMI side by side', (await shown()) === 'ladder,hmi');
  for (const n of ['Wiring', 'Electrical Diagram']) { await page.click('[data-layout]'); await page.click(`.ctx-menu button:has-text("☐ ${n}")`); await wait(200); }
  check('View menu: no more than 3 windows at once', (await shown()).split(',').length === 3 && (await page.textContent('#toast-root')).includes('Up to 3 windows'));
  await page.click('[data-layout]'); await page.click('.ctx-menu button:has-text("☑ HMI")'); await wait(200);
  check('View menu: unticking hides a window', (await shown()) === 'ladder,wiring');
  await page.evaluate(() => { App.setLayout('single'); App.showView('wiring'); Workspace.fit(); });
  await wait(400);
  const termPt = (label, t) => page.evaluate(([l, t]) => {
    const c = App.project.circuit.comps.find(x => x.props.label === l);
    const r = document.querySelector(`.comp[data-cid="${c.id}"] .term[data-term="${t}"] .thit`).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, [label, t]);
  const wirePt = (a, b) => page.evaluate(([a, b]) => {
    const w = App.project.circuit.wires.find(x => (x.a.endsWith(a) && x.b.endsWith(b)) || (x.a.endsWith(b) && x.b.endsWith(a)));
    const path = document.querySelector(`.wire[data-wid="${w.id}"] .wb`);
    // a point of this wire alone (not where another wire crosses it)
    const L = path.getTotalLength(), m = path.getScreenCTM(), at = f => { const q = path.getPointAtLength(L * f); return { x: q.x * m.a + q.y * m.c + m.e, y: q.x * m.b + q.y * m.d + m.f, id: w.id }; };
    for (const f of [0.6, 0.5, 0.4, 0.7, 0.3, 0.8, 0.2]) { const p = at(f), e = document.elementFromPoint(p.x, p.y), g = e && e.closest('.wire'); if (g && g.dataset.wid === w.id) return p; }
    return at(0.6);
  }, [a, b]);
  const plcId = await page.evaluate(() => App.project.circuit.comps.find(c => c.type === 'plc').id);
  const s1Id = await page.evaluate(() => App.project.circuit.comps.find(c => c.props.label === 'S1').id);
  await setMode('RUN');
  const i9 = await termPt('PLC', 'I9');
  await page.mouse.click(i9.x, i9.y);
  const wp = await wirePt(plcId + ':V24', s1Id + ':13');
  await page.mouse.click(wp.x, wp.y);
  await wait(300);
  check('clicking an existing wire while wiring ends the new wire on a junction dot', await page.evaluate(() => {
    const c = App.project.circuit, j = c.comps.find(x => x.type === 'jct');
    return !!j && c.wires.filter(w => w.a === j.id + ':J' || w.b === j.id + ':J').length === 3 && !!document.querySelector('.comp.jct .jdot');
  }));
  check('the junction really connects: +24 V reaches input I:0/9', await page.evaluate(() => (App.plc.physIn >> 9) & 1) === 1, JSON.stringify(await page.evaluate(() => { const c = App.project.circuit, j = c.comps.find(x => x.type === 'jct'); const lab = k => { const [id, t] = k.split(':'); const d = c.comps.find(x => x.id === id); return (d ? d.props.label || d.type : id) + ':' + t; }; return c.wires.filter(w => w.a.startsWith(j.id) || w.b.startsWith(j.id)).map(w => lab(w.a) + '>' + lab(w.b)); })));
  check('the split wires keep their route (no new bends at the junction)', await page.evaluate(() => {
    const c = App.project.circuit, j = c.comps.find(x => x.type === 'jct');
    return c.wires.filter(w => w.a === j.id + ':J' || w.b === j.id + ':J').every(w => w.pts.length <= 4);
  }));
  const bw = await page.evaluate(() => App.project.circuit.wires.find(w => (w.pts || []).length).id);
  await page.evaluate(id => { document.querySelector(`.wire[data-wid="${id}"] .wh`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 })); }, bw);
  await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  await wait(150);
  const bh = await page.$('.bend');
  check('a selected wire shows handles on its bends', !!bh);
  const p0 = await page.evaluate(id => JSON.stringify(App.project.circuit.wires.find(w => w.id === id).pts[0]), bw);
  const bb = await bh.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down();
  await page.mouse.move(bb.x + 40, bb.y + 30, { steps: 5 }); await page.mouse.up();
  await wait(150);
  const p1 = await page.evaluate(id => App.project.circuit.wires.find(w => w.id === id).pts[0], bw);
  check('dragging a bend moves it (snapped to the grid)', JSON.stringify(p1) !== p0 && p1[0] % 10 === 0 && p1[1] % 10 === 0, `${p0} → ${JSON.stringify(p1)}`);
  await page.evaluate(() => { App.openNew(Examples.EX.practice.build()); App.showView('wiring'); Workspace.fit(); });
  await wait(400);
  const k = await page.evaluate(() => Number(/scale\(([\d.]+)\)/.exec(document.querySelector('.ws-svg .vp').getAttribute('transform'))[1]));
  const fr = await (await page.$(`.comp[data-cid="${await page.evaluate(() => App.project.circuit.comps.find(c => c.props.label === 'S1').id)}"] .frame`)).boundingBox();
  await page.mouse.move(fr.x + 4, fr.y + 4); await page.mouse.down();
  await page.mouse.move(fr.x + 4 - 82 * k, fr.y + 4, { steps: 8 });
  check('a guide line shows while a terminal lines up', !!(await page.$('.guide')));
  await page.mouse.up();
  check('smart alignment: S1:13 snaps straight under PLC +24 V', (await get('S1', 'x')) === 135, String(await get('S1', 'x')));
  check('no guide line is left after the drop', !(await page.$('.guide')));
  await page.evaluate(() => { App.log('system', 'remember me'); App.saveNow(); App.openSaved(App.currentId); });
  check('the event log is saved with the project', await page.evaluate(() => App.events().some(e => e.msg === 'remember me')));

  console.log('v1.3 part 2: components, size, floating windows');
  const build = (fn) => page.evaluate(fn);
  const kit = `const circ = { comps: [], wires: [], seq: 0 };
    const add = (t, props = {}, state = {}) => { const c = Circuit.create(t, 0, 0, circ); Object.assign(c.props, props); Object.assign(c.state, state); circ.comps.push(c); return c.id; };
    const w = (a, ta, b, tb) => { circ.seq++; circ.wires.push({ id: 'w' + circ.seq, a: a + ':' + ta, b: b + ':' + tb, pts: [], color: '#8B4513' }); };`;
  check('new parts are in the parts list', await page.evaluate(() => ['fuse', 'buzzer', 'selkey', 'valve', 'fan', 'prox_npn', 'pswitch', 'pswitch_nc', 'float', 'float_nc'].every(t => Circuit.DEFS[t] && !Circuit.DEFS[t].hidden) && !!document.querySelector('.pal-item[data-type="valve"]')));
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }), f = add('fuse', { label: 'FU1' }), m = add('mcb1', { label: 'QF1' }, { on: true });
    w(q, 'L', f, '1'); w(f, '2', m, '1'); w(m, '2', q, 'N');
    App.openNew({ name: 'Fuse', circuit: circ });`));
  await wait(300);
  check('a fuse blows before the breaker behind it', (await get('FU1', 'state.tripped')) && !(await get('QF1', 'state.tripped')));
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }), g = add('psu24', { label: 'G1' }), hz = add('buzzer', { label: 'HA1' }), y = add('valve', { label: 'Y1' }), fn = add('fan', { label: 'M1' });
    w(q, 'L', g, 'L'); w(q, 'N', g, 'N'); w(g, 'P1', hz, 'X1'); w(hz, 'X2', g, 'M1'); w(g, 'P2', y, 'A1'); w(y, 'A2', g, 'M2'); w(q, 'L', fn, 'L'); w(q, 'N', fn, 'N');
    App.openNew({ name: 'Loads', circuit: circ });`));
  await wait(600);
  check('buzzer sounds, solenoid valve opens and the 230 V fan runs', (await get('HA1', 'state.on')) && (await get('Y1', 'state.open')) && (await get('M1', 'state.spd')) > 0.3);
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }), g = add('psu24', { label: 'G1' }), b = add('prox_npn', { label: 'B1' }, { tgt: true }), s = add('pswitch', { label: 'SP1' });
    w(q, 'L', g, 'L'); w(q, 'N', g, 'N'); w(g, 'P1', b, 'BN'); w(b, 'BU', g, 'M1'); w(g, 'P2', s, '13');
    App.openNew({ name: 'Sensors', circuit: circ });`));
  await wait(300);
  check('an NPN sensor switches 0 V to its output', await page.evaluate(() => { const c = App.project.circuit.comps.find(x => x.props.label === 'B1'); return App.api.sameNet(c.id + ':BK', c.id + ':BU'); }));
  check('a pressure switch can be changed N.O. → N.C. and its wire follows', await page.evaluate(() => {
    const c = App.project.circuit.comps.find(x => x.props.label === 'SP1');
    Circuit.retype(c, 'pswitch_nc', App.project.circuit);
    return c.type === 'pswitch_nc' && App.project.circuit.wires.some(w => w.b === c.id + ':11');
  }));
  await page.evaluate(() => { App.openNew(Examples.EX.practice.build()); App.setLayout('single'); App.showView('wiring'); Workspace.fit(); });
  await wait(400);
  const s1sel = await page.evaluate(() => App.project.circuit.comps.find(c => c.props.label === 'S1').id);
  await page.click(`.comp[data-cid="${s1sel}"] .frame`, { position: { x: 4, y: 4 }, force: true });
  const fw0 = (await (await page.$(`.comp[data-cid="${s1sel}"] .frame`)).boundingBox()).width;
  await page.selectOption('.ws-props [data-pk="size"]', '1.5');
  await wait(200);
  const fw1 = (await (await page.$(`.comp[data-cid="${s1sel}"] .frame`)).boundingBox()).width;
  check('a device can be made bigger (Size)', fw1 > fw0 * 1.4, `${fw0} → ${fw1}`);
  check('wires follow the bigger device', await page.evaluate(id => { const w = App.project.circuit.wires.find(x => x.b === id + ':14' || x.a === id + ':14'); const p = document.querySelector(`.wire[data-wid="${w.id}"] .wb`).getAttribute('d'); const c = App.project.circuit.comps.find(x => x.id === id); return p.includes(String(c.x + 45 * 1.5)); }, s1sel));
  await page.click('.ws-props [data-same]');
  check('Same size for all gives every device that size', await page.evaluate(() => App.project.circuit.comps.every(c => c.props.size === 1.5)));
  await page.evaluate(() => { App.setLayout('single'); App.showView('ladder'); App.floatView('wiring'); });
  await wait(400);
  check('Float: the wiring window pops out and the ladder stays in the main area', await page.evaluate(() => {
    const fw = document.querySelector('.float-win[data-fv="wiring"]');
    return !!fw && fw.contains(document.getElementById('view-wiring')) && document.getElementById('view-ladder').classList.contains('active') && document.querySelectorAll('#view-wiring .comp').length > 5;
  }));
  const fh = await (await page.$('.float-win .fw-head')).boundingBox();
  const pos0 = await page.evaluate(() => document.querySelector('.float-win').getBoundingClientRect().left);
  await page.mouse.move(fh.x + 60, fh.y + fh.height / 2); await page.mouse.down(); await page.mouse.move(fh.x + 160, fh.y + 40, { steps: 5 }); await page.mouse.up();
  check('a floating window can be moved by its title bar', Math.abs((await page.evaluate(() => document.querySelector('.float-win').getBoundingClientRect().left)) - pos0 - 100) < 3);
  await setMode('RUN');
  await wait(300);
  check('a floating window stays live (wires show voltage)', (await page.$$eval('.float-win .wl.live', els => els.length)) > 0);
  await page.click('.float-win [data-dock]');
  await wait(300);
  check('Dock puts the window back in the main area', await page.evaluate(() => !document.querySelector('.float-win') && document.getElementById('main').contains(document.getElementById('view-wiring')) && document.getElementById('view-wiring').classList.contains('active')));
  await page.evaluate(() => App.setLayout('single'));

  console.log('v1.3 part 3: schematic');
  await page.evaluate(new Function(kit + `
    add('supply1', { label: 'Q0' });
    App.openNew({ name: 'Schematic DOL', circuit: circ });
    App.setLayout('single'); App.showView('schematic');`));
  await wait(300);
  check('Schematic view renders and picks the supply rails', await page.evaluate(() => !!document.querySelector('#view-schematic .sch-toolbar') && !!App.project.schematic.L && App.project.schematic.L.endsWith(':L') && App.project.schematic.N.endsWith(':N')));
  const addSym = async (k, tag) => { await page.click(`#view-schematic [data-skind="${k}"]`); await page.fill('#f_t', tag); await page.click('.modal .btn.primary'); await wait(120); };
  await addSym('pbnc', 'S0'); await addSym('pbno', 'S1'); await addSym('kmcoil', 'KM1');
  const pathS1 = await page.evaluate(() => [...document.querySelectorAll('#view-schematic [data-path]')].find(g => g.textContent.includes('S1')).dataset.path);
  await page.click(`#view-schematic [data-path="${pathS1}"] .hit`);
  await page.click('#view-schematic [data-sact="branch"]');
  await addSym('kmno', 'KM1');
  await page.click('#view-schematic [data-sact="rung"]');
  await addSym('kmno', 'KM1');
  check('a second N.O. contact of KM1 is refused (the contactor has one)', await page.evaluate(() => Schematic.errs && [...Schematic.errs.values()].some(m => m.includes('already used'))));
  await page.click('#view-schematic [data-sact="del"]');
  await addSym('kmnc', 'KM1'); await addSym('lamp', 'H1');
  await wait(300);
  const sch = await page.evaluate(() => ({ text: JSON.stringify(App.project.schematic.rungs), comps: App.project.circuit.comps.map(c => c.type + ':' + c.props.label + ':' + (c.props.coil || '')).sort(), wires: App.project.circuit.wires.filter(w => w.sch).length }));
  check('symbols became real devices in the Wiring (with the 230 VAC coil)', ['pb_nc:S0:', 'pb_no:S1:', 'contactor:KM1:230VAC', 'lamp:H1:230VAC'].every(x => sch.comps.includes(x)), sch.comps.join(' '));
  check('the rungs were wired for you', sch.wires >= 8, String(sch.wires));
  check('rung 2 lamp is on through the KM1 N.C. contact', await get('H1', 'state.on'), await page.evaluate(() => { const C = App.project.circuit, lab = k => { const [id, t] = k.split(':'); return C.comps.find(x => x.id === id).props.label + ':' + t; }; return JSON.stringify([App.project.schematic.rungs, C.wires.filter(w => w.sch).map(w => lab(w.a) + '>' + lab(w.b)), C.comps.find(x => x.props.label === 'H1').state, C.comps.find(x => x.props.label === 'KM1').state]); }));
  await page.evaluate(() => document.querySelector('#view-schematic [data-smode="run"]').click()); await wait(250);
  const s1el = await page.evaluateHandle(() => [...document.querySelectorAll('#view-schematic .sel-el')].find(g => g.querySelector('.stag').textContent.replace(/^-/, '') === 'S1'));
  const sb = await s1el.boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.mouse.down(); await wait(200); await page.mouse.up();
  await wait(400);
  check('pressing S1 in the schematic starts KM1 and the seal-in holds it', (await get('KM1', 'state.pulled')) && !(await get('S1', 'state.pressed')));
  check('the KM1 N.C. contact opens and the lamp goes off', !(await get('H1', 'state.on')));
  check('the schematic shows power flow on the energized coil', await page.evaluate(() => [...document.querySelectorAll('#view-schematic .sel-el')].some(g => g.querySelector('.stag').textContent.replace(/^-/, '') === 'KM1' && g.querySelector('.ssym.on .ssym, .ssym.on') && g.dataset.kind === 'coil')));
  const s0el = await page.evaluateHandle(() => [...document.querySelectorAll('#view-schematic .sel-el')].find(g => g.querySelector('.stag').textContent.replace(/^-/, '') === 'S0'));
  const s0b = await s0el.boundingBox();
  await page.mouse.move(s0b.x + s0b.width / 2, s0b.y + s0b.height / 2); await page.mouse.down(); await wait(200); await page.mouse.up();
  await wait(400);
  check('pressing S0 stops KM1', !(await get('KM1', 'state.pulled')) && (await get('H1', 'state.on')));
  check('the schematic is saved with the project and comes back', await page.evaluate(() => { App.saveNow(); const id = App.currentId; App.openSaved(id); return App.project.schematic.rungs.length === 2 && JSON.stringify(App.project.schematic.rungs).includes('"tag":"KM1"') && App.project.circuit.wires.some(w => w.sch); }));
  await page.evaluate(() => document.querySelector('#view-schematic [data-smode="edit"]').click()); await wait(250);

  console.log('v1.4 part 1: wiring look, DIN rail, terminal block, motor protection');
  await build(new Function(kit + `
    const q = add('supply3', { label: 'Q0' }), f = add('mccb3', { label: 'QF1' }, { on: true }), m = add('mpcb', { label: 'QM1' }, { on: true });
    w(q, 'L1', f, '1'); w(q, 'L2', f, '3'); w(q, 'L3', f, '5'); w(f, '2', m, '1'); w(f, '4', m, '3'); w(f, '6', m, '5'); w(m, '2', m, '4');
    App.openNew({ name: 'MPCB short', circuit: circ });`));
  await wait(300);
  check('a short behind the motor protection breaker trips it, not the MCCB in front', (await get('QM1', 'state.tripped')) && !(await get('QF1', 'state.tripped')));
  await build(new Function(kit + `
    const q = add('supply3', { label: 'Q0' }), m = add('mpcb', { label: 'QM1', trip: 0 }, { on: true }), mo = add('motor', { label: 'M1' }, { jam: true });
    w(q, 'L1', m, '1'); w(q, 'L2', m, '3'); w(q, 'L3', m, '5'); w(m, '2', mo, 'U1'); w(m, '4', mo, 'V1'); w(m, '6', mo, 'W1');
    App.openNew({ name: 'MPCB overload', circuit: circ });`));
  await wait(800);
  check('a jammed motor trips its motor protection breaker', (await get('QM1', 'state.tripped')) && (await get('M1', 'state.drive')) === 'off');
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }, { on: true }), x = add('tb5', { label: 'X1' }), h = add('lamp', { label: 'H1', coil: '230VAC' });
    w(q, 'L', x, 'L1'); w(q, 'N', x, 'N'); w(x, 'L1b', h, 'X1'); w(h, 'X2', x, 'Nb');
    circ.wires.push({ id: 'w90', a: x + ':PE', b: q + ':PE', pts: [], color: '#58A83A', tag: '  PE-1  ' }, { id: 'w91', a: x + ':PEb', b: q + ':PE', pts: [], color: '#58A83A', tag: 'X'.repeat(40) }, { id: 'w92', a: x + ':L2', b: x + ':L3', pts: [], color: '#1d1d1d', tag: 5 });
    App.openNew({ name: 'Terminal block', circuit: circ });`));
  await page.evaluate(() => { App.setLayout('single'); App.showView('wiring'); Workspace.fit(); });
  await wait(400);
  check('a terminal block passes L1 and N through to a 230 V lamp', await get('H1', 'state.on'));
  check('wire labels are trimmed to 12 characters and must be text', await page.evaluate(() => { const W = App.project.circuit.wires; return W.find(w => w.id === 'w90').tag === 'PE-1' && W.find(w => w.id === 'w91').tag.length === 12 && !('tag' in W.find(w => w.id === 'w92')); }));
  check('a live wire carries a marker with its conductor (L1)', await page.evaluate(() => [...document.querySelectorAll('.wire .ferr text')].some(t => t.textContent === 'L1' && t.parentNode.style.display !== 'none')));
  check('a dead black wire gets no guessed marker', await page.evaluate(() => { const f = document.querySelector('.wire[data-wid="w92"] .ferr'); return !!f && f.style.display === 'none'; }));
  await page.uncheck('[data-tags]');
  check('wire labels can be switched off', !(await page.$('.wire .ferr')));
  await page.check('[data-tags]');
  const railY = await page.evaluate(() => { const c = App.project.circuit, h = c.comps.find(x => x.props.label === 'H1'); const r = Circuit.create('din', h.x - 50, h.y + 40 - 18 + 15, c); c.comps.push(r); App.circuitChanged(); return r.y; });
  await wait(200);
  const railK = await page.evaluate(() => Number(/scale\(([\d.]+)\)/.exec(document.querySelector('.ws-svg .vp').getAttribute('transform'))[1]));
  const hid = await page.evaluate(() => App.project.circuit.comps.find(c => c.props.label === 'H1').id);
  const hf = await (await page.$(`.comp[data-cid="${hid}"] .frame`)).boundingBox();
  await page.mouse.move(hf.x + 4, hf.y + 4); await page.mouse.down();
  await page.mouse.move(hf.x + 4 + 20 * railK, hf.y + 4, { steps: 5 }); await page.mouse.up();
  check('a device dropped near a DIN rail clips onto its centre line', (await get('H1', 'y')) + 40 === railY + 18, `${await get('H1', 'y')} vs rail ${railY}`);
  check('a DIN rail is drawn behind the devices', await page.evaluate(() => !!document.querySelector('.ws-svg .rails .comp') && !document.querySelector('.ws-svg .comps .comp .clabel')?.textContent.startsWith('RAIL')));
  console.log('v1.4 part 3: star-delta, forward/reverse, timer dial');
  const tap = async l => { await part(l, 'btn', 'down'); await wait(200); await part(l, 'btn', 'up'); await wait(500); };
  await page.evaluate(() => { App.openNew(Examples.EX.stardelta.build()); App.project.circuit.comps.find(c => c.props.label === 'KT1').props.t = 1; });
  await wait(300);
  check('the star-delta diagram is wired with no errors', await page.evaluate(() => App.project.circuit.wires.some(w => w.sch) && Schematic.errs.size === 0));
  await tap('S1');
  check('START: KM1 + KM3 pull in, the motor runs in STAR', (await get('KM1', 'state.pulled')) && (await get('KM3', 'state.pulled')) && !(await get('KM2', 'state.pulled')) && (await get('M1', 'state.conn')) === 'star');
  await wait(1300);
  check('after the star time: KM3 drops, KM2 pulls in, the motor runs in DELTA', !(await get('KM3', 'state.pulled')) && (await get('KM2', 'state.pulled')) && (await get('M1', 'state.conn')) === 'delta' && !(await get('QM1', 'state.tripped')));
  await tap('S0');
  check('STOP drops every contactor', !(await get('KM1', 'state.pulled')) && !(await get('KM2', 'state.pulled')) && !(await get('KA2', 'state.pulled')));
  await build(new Function(kit + `
    const q = add('supply3', { label: 'Q0' }), m = add('motor6', { label: 'M6' });
    w(q, 'L1', m, 'U1'); w(q, 'L2', m, 'V1'); w(q, 'L3', m, 'W1');
    App.openNew({ name: 'Open windings', circuit: circ });`));
  await wait(300);
  check('a 6-terminal motor with open windings does not run and says why', (await get('M6', 'state.drive')) !== 'run' && (await page.evaluate(() => Circuit.status(App.project.circuit.comps.find(c => c.props.label === 'M6'), App.ctx))).includes('not connected'));
  await build(new Function(kit + `
    const q = add('supply3', { label: 'Q0' }), b = add('mpcb', { label: 'QM1' }, { on: true }), m = add('motor6', { label: 'M6' });
    w(q, 'L1', b, '1'); w(q, 'L2', b, '3'); w(q, 'L3', b, '5');
    w(b, '2', m, 'U1'); w(b, '4', m, 'V1'); w(b, '6', m, 'W1'); w(b, '2', m, 'W2'); w(b, '4', m, 'U2'); w(b, '6', m, 'V2');
    w(m, 'U2', m, 'V2'); w(m, 'V2', m, 'W2');
    App.openNew({ name: 'Star and delta', circuit: circ });`));
  await wait(300);
  check('star and delta at the same time short the phases and QM1 trips', await get('QM1', 'state.tripped'));
  await page.evaluate(() => { const p = Examples.EX.stardeltaplc.build(); p.ladder.rungs[1].text = 'XIC O:0/0 TON T4:0 1.0 1 0'; App.openNew(p); App.setMode('RUN'); });
  await wait(300);
  await tap('S1');
  check('PLC star-delta: star first', (await get('KM3', 'state.pulled')) && !(await get('KM2', 'state.pulled')) && (await get('M1', 'state.conn')) === 'star');
  await wait(1300);
  check('PLC star-delta: then delta', !(await get('KM3', 'state.pulled')) && (await get('KM2', 'state.pulled')) && (await get('M1', 'state.conn')) === 'delta');
  await page.evaluate(() => { App.openNew(Examples.EX.fwdrev.build()); App.setMode('RUN'); });
  await wait(300);
  await tap('S1');
  check('FWD runs the motor forward', (await get('KM1', 'state.pulled')) && (await get('M1', 'state.dir')) === 1);
  await tap('S2');
  check('REV while running forward is refused (interlock)', (await get('KM1', 'state.pulled')) && !(await get('KM2', 'state.pulled')));
  await tap('S0'); await tap('S2');
  check('after STOP, REV runs the motor in reverse', (await get('KM2', 'state.pulled')) && (await get('M1', 'state.dir')) === -1 && !(await get('QM1', 'state.tripped')));
  check('the timer dial sets the delay with − / +', await page.evaluate(() => {
    const c = Circuit.create('timer', 0, 0, { comps: [], wires: [], seq: 0 });
    Circuit.part(c, 'up', 'down'); const a = c.props.t; Circuit.part(c, 'dn', 'down'); Circuit.part(c, 'dn', 'down');
    return a === 6 && c.props.t === 4;
  }));

  console.log('v1.4 part 4: IEC Electrical Diagram, power circuit, PH wire colours');
  check('wire colours follow Philippine practice (L1 red, L2 yellow, L3 blue, N white, PE green)', await page.evaluate(() => { const P = Circuit.POT_COLORS; return P.L1 === '#b3261e' && P.L2 === '#f2c230' && P.L3 === '#2b6fe0' && P.N === '#f4f4f0' && P.PE === '#58a83a'; }));
  await page.evaluate(() => { App.openNew(Examples.EX.threemotors.build()); App.setLayout('single'); App.showView('schematic'); });
  await wait(400);
  check('the IEC view is the default: L on top, N at the bottom, columns run downwards', await page.evaluate(() => {
    const els = [...document.querySelectorAll('#view-schematic .iec-svg .srung[data-r="0"] .sel-el')].map(g => ({ t: g.querySelector('.stag').textContent, y: g.getBoundingClientRect().y }));
    const y = t => els.find(e => e.t === t).y;
    return !!document.querySelector('#view-schematic .iec-svg') && y('-F1') < y('-S1') && y('-S1') < y('-KM1');
  }));
  check('contacts show their terminal numbers (95/96, 13/14, A1/A2)', await page.evaluate(() => { const t = [...document.querySelectorAll('#view-schematic .srung[data-r="0"] .sterm')].map(x => x.textContent).join(' '); return ['95', '96', '13', '14', 'A1', 'A2'].every(n => t.split(' ').includes(n)); }));
  check('three motor feeders are drawn and wired with no problems', await page.evaluate(() => document.querySelectorAll('#view-schematic [data-pf]').length === 4 && Schematic.errs.size === 0 && Schematic.perrs.size === 0 && App.project.circuit.comps.filter(c => c.type === 'motor').length === 3));
  check('power wires carry the phase colours', await page.evaluate(() => { const C = App.project.circuit, q = C.comps.find(c => c.props.label === 'Q0'); const w = C.wires.find(w => w.sch && w.a === q.id + ':L2'); return !!w && w.color === Circuit.POT_COLORS.L2; }));
  await tap('S5');
  check('START S5 runs M1 through Q4 → Q1 → KM1 → F1, with the run lamp', (await get('KM1', 'state.pulled')) && (await get('M1', 'state.drive')) === 'run' && (await get('H1', 'state.on')) && !(await get('M2', 'state.drive') === 'run'));
  await wait(200);
  check('the live power path is highlighted in the diagram', await page.evaluate(() => document.querySelectorAll('#view-schematic .pw.on').length > 6));
  await tap('S1');
  check('STOP S1 stops M1', !(await get('KM1', 'state.pulled')));
  await page.click('#view-schematic [data-sstyle="nema"]'); await wait(150);
  check('the ladder-style view is still there as an option', await page.evaluate(() => !document.querySelector('#view-schematic .iec-svg') && document.querySelectorAll('#view-schematic .srung').length === 7));
  await page.click('#view-schematic [data-sstyle="iec"]'); await wait(150);
  await page.evaluate(new Function(kit + `add('supply3', { label: 'Q0' }); App.openNew({ name: 'Feeder', circuit: circ }); App.showView('schematic');`));
  await wait(200);
  await page.click('#view-schematic [data-sact="feeder"]');
  const addPow = async (k, tag) => { await page.click(`#view-schematic [data-pkind="${k}"]`); await page.fill('#f_t', tag); await page.click('.modal .btn.primary'); await wait(120); };
  await addPow('qm3', 'QM1'); await addPow('km3', 'KM1'); await addPow('m3', 'M1'); await addPow('ol3', 'F1');
  check('a feeder built from the toolbar keeps the motor last and is wired L1-L2-L3 + PE', await page.evaluate(() => {
    const f = App.project.schematic.power.feeders[0].elems.map(e => e.k).join(','), C = App.project.circuit, lab = k => { const [id, t] = k.split(':'); return C.comps.find(x => x.id === id).props.label + ':' + t; };
    const ws = C.wires.filter(w => w.sch).map(w => lab(w.a) + '>' + lab(w.b));
    return f === 'qm3,km3,ol3,m3' && ['Q0:L1>QM1:1', 'QM1:2>KM1:1', 'KM1:6>F1:5', 'F1:6>M1:W1', 'Q0:PE>M1:PE'].every(x => ws.includes(x));
  }));
  check('the power circuit is saved with the project and comes back', await page.evaluate(() => { App.saveNow(); App.openSaved(App.currentId); const f = App.project.schematic.power.feeders; return f.length === 1 && f[0].elems.length === 4 && App.project.schematic.power.src === 'Q0'; }));
  await page.evaluate(() => App.showView('schematic'));
  check('the motor protection breaker is ON when the diagram adds it', await get('QM1', 'state.on'));
  await page.evaluate(() => { App.project.schematic.power.feeders[0].elems.push({ k: 'qf3', tag: 'Q9' }); Schematic.sync(); Schematic.render(); });
  check('a device after the motor is reported', await page.evaluate(() => [...Schematic.perrs.values()].some(m => m.includes('last device'))));
  await page.evaluate(() => document.querySelector('#view-schematic [data-smode="edit"]').click()).catch(() => {});

  console.log('v1.5 part 1: more components');
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }), f = add('mcb1', { label: 'QF1' }, { on: true }), r = add('rcd', { label: 'FI1' }, { on: true });
    w(q, 'L', f, '1'); w(f, '2', r, '1'); w(q, 'N', r, '3'); w(r, '2', q, 'PE');
    App.openNew({ name: 'RCD earth fault', circuit: circ });`));
  await wait(300);
  check('an earth fault trips the RCD, not the MCB in front of it', (await get('FI1', 'state.tripped')) && !(await get('QF1', 'state.tripped')));
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }), f = add('mcb1', { label: 'QF1' }, { on: true }), r = add('rcd', { label: 'FI1' }, { on: true });
    w(q, 'L', f, '1'); w(f, '2', r, '1'); w(q, 'N', r, '3'); w(r, '2', r, '4');
    App.openNew({ name: 'RCD L-N short', circuit: circ });`));
  await wait(300);
  check('a line-to-neutral short trips the MCB, not the RCD', (await get('QF1', 'state.tripped')) && !(await get('FI1', 'state.tripped')));
  await build(new Function(kit + `
    const q = add('supply3', { label: 'Q0' }), f = add('fuse3', { label: 'FU1' }), m = add('mcb3', { label: 'QF1' }, { on: true }), s = add('isol3', { label: 'QS1' }, { on: true });
    w(q, 'L1', s, '1'); w(q, 'L2', s, '3'); w(q, 'L3', s, '5'); w(s, '2', m, '1'); w(s, '4', m, '3'); w(s, '6', m, '5');
    w(m, '2', f, '1'); w(m, '4', f, '3'); w(m, '6', f, '5'); w(f, '2', f, '4');
    App.openNew({ name: 'Fuse 3P', circuit: circ });`));
  await wait(300);
  check('a 3-pole fuse blows before the 3-pole MCB; the disconnector passes power when ON', (await get('FU1', 'state.tripped')) && !(await get('QF1', 'state.tripped')) && (await get('QS1', 'state.on')));
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }), s = add('pb_no', { label: 'S1' }), t = add('timer_off', { label: 'KT1', t: 1 }), h = add('lamp', { label: 'H1', coil: '230VAC' }), m = add('motor1', { label: 'M1' });
    w(q, 'L', s, '13'); w(s, '14', t, 'A1'); w(t, 'A2', q, 'N'); w(q, 'L', t, '15'); w(t, '18', h, 'X1'); w(h, 'X2', q, 'N'); w(q, 'L', m, 'L'); w(q, 'N', m, 'N');
    App.openNew({ name: 'Off-delay', circuit: circ });`));
  await wait(200);
  await part('S1', 'btn', 'down'); await wait(300);
  check('off-delay timer: 15-18 closes at once with the coil', await get('H1', 'state.on'));
  await part('S1', 'btn', 'up'); await wait(400);
  check('off-delay timer: 15-18 stays closed during the delay after the coil drops', await get('H1', 'state.on'));
  await wait(900);
  check('off-delay timer: 15-18 opens when the delay is over', !(await get('H1', 'state.on')));
  check('a single-phase motor runs on 230 V', (await get('M1', 'state.drive')) === 'run');
  await build(new Function(kit + `
    const q = add('supply3', { label: 'Q0' }), m = add('dahlander', { label: 'M1' });
    w(q, 'L1', m, '1U'); w(q, 'L2', m, '1V'); w(q, 'L3', m, '1W');
    App.openNew({ name: 'Dahlander slow', circuit: circ });`));
  await wait(300);
  check('Dahlander: supply on 1U 1V 1W runs SLOW', (await get('M1', 'state.sp')) === 'slow' && (await get('M1', 'state.drive')) === 'run');
  await build(new Function(kit + `
    const q = add('supply3', { label: 'Q0' }), m = add('dahlander', { label: 'M1' });
    w(q, 'L1', m, '2U'); w(q, 'L2', m, '2V'); w(q, 'L3', m, '2W'); w(m, '1U', m, '1V'); w(m, '1V', m, '1W');
    App.openNew({ name: 'Dahlander fast', circuit: circ });`));
  await wait(300);
  check('Dahlander: supply on 2U 2V 2W with 1U 1V 1W joined runs FAST', (await get('M1', 'state.sp')) === 'fast');
  await build(new Function(kit + `
    const q = add('supply3', { label: 'Q0' }), m = add('motor2s', { label: 'M1' });
    w(q, 'L1', m, '2U'); w(q, 'L2', m, '2V'); w(q, 'L3', m, '2W');
    App.openNew({ name: 'Two-speed', circuit: circ });`));
  await wait(300);
  check('two-speed motor: supply on 2U 2V 2W runs FAST', (await get('M1', 'state.sp')) === 'fast');

  console.log('v1.5 part 1: free-draw Electrical Diagram');
  await page.evaluate(() => {
    const it = (id, k, tag, x, y) => ({ id, k, tag, x, y, r: 0 });
    const items = [it('d1', 'src1', 'Q0', 100, 0), it('d2', 'mcb2', 'QF1', 100, 120), it('d3', 'pbnc', 'S0', 90, 240), it('d4', 'pbno', 'S1', 90, 340), it('d5', 'kmno', 'KM1', 190, 340), it('d6', 'kmcoil', 'KM1', 90, 460), it('d7', 'lamp', 'H1', 230, 460),
      it('d8', 'src3', 'Q1', 500, 0), it('d9', 'qm3', 'QM1', 500, 120), it('d10', 'km3', 'KM1', 500, 240), it('d11', 'm3', 'M1', 500, 380)];
    const w = [['d1:L', 'd2:1'], ['d1:N', 'd2:3'], ['d2:2', 'd3:11'], ['d3:12', 'd4:13'], ['d3:12', 'd5:13'], ['d4:14', 'd6:A1'], ['d5:14', 'd6:A1'], ['d6:A2', 'd2:4'], ['d4:14', 'd7:X1'], ['d7:X2', 'd2:4'],
      ['d8:L1', 'd9:1'], ['d8:L2', 'd9:3'], ['d8:L3', 'd9:5'], ['d9:2', 'd10:1'], ['d9:4', 'd10:3'], ['d9:6', 'd10:5'], ['d10:2', 'd11:U1'], ['d10:4', 'd11:V1'], ['d10:6', 'd11:W1'], ['d8:PE', 'd11:PE'], ['d99:X', 'd1:L']];
    App.openNew({ name: 'Free DOL', schematic: { free: { items, wires: w.map((x, i) => ({ id: 'fw' + (i + 1), a: x[0], b: x[1] })), seq: 40 } } });
    App.setLayout('single'); App.showView('schematic');
  });
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(300);
  check('free draw: its toolbar shows and the rung tools hide', await page.isVisible('#view-schematic [data-fdact="lib"]') && !(await page.isVisible('#view-schematic [data-sact="rung"]')));
  check('free draw: symbols and wires are drawn, a broken wire is dropped on load', await page.evaluate(() => document.querySelectorAll('#view-schematic .fitem').length === 11 && App.project.schematic.free.wires.length === 20));
  check('free draw: every symbol became a device and every drawn wire is wired', await page.evaluate(() => ['Q0:supply1', 'QF1:mcb2', 'S1:pb_no', 'KM1:contactor', 'H1:lamp', 'Q1:supply3', 'QM1:mpcb', 'M1:motor'].every(x => App.project.circuit.comps.some(c => c.props.label + ':' + c.type === x)) && App.project.circuit.wires.filter(w => w.sch).length === 20 && FreeDraw.errs.size === 0));
  await page.evaluate(() => document.querySelector('#view-schematic [data-smode="run"]').click()); await wait(250);
  // as in Simurelay, Play starts with the breakers off: switch QF1 and QM1 on on the drawing first
  { const tb = await (await page.$('#view-schematic [data-fi="d2"] .hit')).boundingBox(); await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2); await wait(300); } { const tb = await (await page.$('#view-schematic [data-fi="d9"] .hit')).boundingBox(); await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2); await wait(300); }
  const fS1 = await (await page.$('#view-schematic [data-fi="d4"] .hit')).boundingBox();
  await page.mouse.move(fS1.x + fS1.width / 2, fS1.y + fS1.height / 2); await page.mouse.down(); await wait(200); await page.mouse.up(); await wait(500);
  check('free draw: pressing S1 on the drawing starts KM1, its seal-in holds it, the motor runs', (await get('KM1', 'state.pulled')) && (await get('H1', 'state.on')) && (await get('M1', 'state.drive')) === 'run');
  check('free draw: the live paths light up', await page.evaluate(() => document.querySelectorAll('#view-schematic .fwire .w.on').length > 8));
  await page.evaluate(() => document.querySelector('#view-schematic [data-smode="edit"]').click()); await wait(250);
  // with 'Ask for a tag when placing a symbol' on, the Library asks for the tag (off: the next tag is given, tested in the tagging section)
  await page.evaluate(() => FreeDraw.setLabels({ ask: true }));
  await page.selectOption('#view-schematic .fd-grp', 'Loads'); await wait(100); await page.click('#view-schematic .fd-ico[data-fk="lamp"]'); await page.fill('#f_t', 'H9'); await page.click('.modal .btn.primary'); await wait(200); await page.evaluate(() => FreeDraw.setLabels({ ask: false }));
  const h9 = await page.evaluate(() => App.project.schematic.free.items.find(i => i.tag === 'H9').id);
  check('free draw: the Library adds a symbol and its device', !!h9 && await page.evaluate(() => App.project.circuit.comps.some(c => c.props.label === 'H9')));
  const tA = await (await page.$(`#view-schematic [data-ft="${h9}:X1"]`)).boundingBox(), tB = await (await page.$('#view-schematic [data-ft="d2:2"]')).boundingBox();
  await page.mouse.click(tA.x + tA.width / 2, tA.y + tA.height / 2); await wait(100); await page.mouse.click(tB.x + tB.width / 2, tB.y + tB.height / 2); await wait(200);
  check('free draw: clicking two terminals draws a wire, and it is wired in the Wiring', await page.evaluate(id => { const C = App.project.circuit, h = C.comps.find(c => c.props.label === 'H9'), q = C.comps.find(c => c.props.label === 'QF1'); return App.project.schematic.free.wires.some(w => (w.a === id + ':X1' && w.b === 'd2:2') || (w.b === id + ':X1' && w.a === 'd2:2')) && C.wires.some(w => w.sch && [w.a, w.b].includes(h.id + ':X1') && [w.a, w.b].includes(q.id + ':2')); }, h9));
  const h9b = await (await page.$(`#view-schematic [data-fi="${h9}"] .hit`)).boundingBox();
  await page.mouse.click(h9b.x + 8, h9b.y + 8); await wait(100);
  await page.keyboard.press('r'); await wait(150);
  check('free draw: R rotates the selected symbol', await page.evaluate(id => App.project.schematic.free.items.find(i => i.id === id).r === 90, h9));
  await page.evaluate(() => { App.saveNow(); App.openSaved(App.currentId); App.showView('schematic'); });
  check('free draw: the drawing is saved with the project', await page.evaluate(() => App.project.schematic.free.items.length === 12 && App.project.schematic.free.wires.length === 21));
  check('free draw: Type changes a push button into a selector (and reports the device type clash)', await page.evaluate(() => {
    const it = App.project.schematic.free.items.find(i => i.id === 'd4'); it.k = 'selno'; Schematic.sync(); Schematic.render();
    return [...FreeDraw.errs.values()].some(m => m.includes('S1'));
  }));
  // junction: end a new wire on an existing wire
  await page.evaluate(() => { const F = App.project.schematic.free; F.items.push({ id: 'd90', k: 'lamp', tag: 'H8', x: 330, y: 460, r: 0 }); Schematic.sync(); Schematic.render(); }); await wait(200);
  const jStart = await (await page.$('#view-schematic [data-ft="d90:X1"]')).boundingBox();
  await page.mouse.click(jStart.x + jStart.width / 2, jStart.y + jStart.height / 2); await wait(100);
  const wSeg = await page.evaluate(() => { const w = App.project.schematic.free.wires.find(x => x.a === 'd2:2' && x.b === 'd3:11') || App.project.schematic.free.wires.find(x => x.b === 'd2:2' && x.a === 'd3:11'); const el = document.querySelector(`#view-schematic [data-fw="${w.id}"] .fwh`); const r = el.getBoundingClientRect(); return { id: w.id, x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(wSeg.x, wSeg.y); await wait(200);
  check('free draw: ending a wire on a wire makes a junction, and the new lamp gets power through it', await page.evaluate(() => { const F = App.project.schematic.free; return F.items.some(i => i.k === 'node') && F.wires.filter(w => w.a.endsWith(':J') || w.b.endsWith(':J')).length === 3; }) && await page.evaluate(() => { const C = App.project.circuit, h = C.comps.find(c => c.props.label === 'H8'), q = C.comps.find(c => c.props.label === 'QF1'); return App.api.sameNet(h.id + ':X1', q.id + ':2'); }));
  const bendW = await page.evaluate(() => { const w = App.project.schematic.free.wires.find(x => x.a === 'd8:PE' || x.b === 'd8:PE'); const el = document.querySelector(`#view-schematic [data-fw="${w.id}"] .w`), q = el.getPointAtLength(el.getTotalLength() / 2).matrixTransform(el.getScreenCTM()); return { id: w.id, x: q.x, y: q.y }; });
  await page.mouse.dblclick(bendW.x, bendW.y); await wait(200);
  check('free draw: double-clicking a wire adds a bend you can drag', await page.evaluate(id => { const w = App.project.schematic.free.wires.find(x => x.id === id); return !!w.pts && w.pts.length === 1 && !!document.querySelector('#view-schematic .fbend'); }, bendW.id));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); });
  await page.click('#view-schematic [data-sstyle="iec"]');

  console.log('v1.5 part 2: impulse relay, 4-pole contactor');
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }), s1 = add('pb_no', { label: 'S1' }), s2 = add('pb_no', { label: 'S2' }), ki = add('impulse', { label: 'KI1' }), h = add('lamp', { label: 'H1', coil: '230VAC' }), k4 = add('contactor4', { label: 'KM4' });
    w(q, 'L', s1, '13'); w(q, 'L', s2, '13'); w(s1, '14', ki, 'A1'); w(s2, '14', ki, 'A1'); w(ki, 'A2', q, 'N'); w(q, 'L', ki, '1'); w(ki, '2', h, 'X1'); w(h, 'X2', q, 'N');
    w(ki, '2', k4, 'A1'); w(k4, 'A2', q, 'N'); w(q, 'L', k4, '7');
    App.openNew({ name: 'Impulse', circuit: circ });`));
  await wait(200);
  await tap('S1');
  check('impulse relay: a pulse from S1 switches the lamp on and it stays on', await get('H1', 'state.on'));
  check('4-pole contactor pulls in and closes pole 7-8', (await get('KM4', 'state.pulled')) && await page.evaluate(() => { const c = App.project.circuit.comps.find(x => x.props.label === 'KM4'); return App.api.sameNet(c.id + ':7', c.id + ':8'); }));
  await tap('S2');
  check('impulse relay: a pulse from S2 switches it off again', !(await get('H1', 'state.on')));

  console.log('v1.5 part 3: full IEC component library');
  check('the new parts are in the parts list', await page.evaluate(() => ['tswitch', 'tswitch_nc', 'flowsw', 'flowsw_nc', 'photo', 'photo_npn', 'pb_co', 'foot', 'fuse2', 'fuse4', 'mcb4', 'isol4', 'fsw3', 'rcd4', 'rcbo', 'latch', 'heater', 'hourmeter', 'vmeter'].every(t => Circuit.DEFS[t] && !Circuit.DEFS[t].hidden)));
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }), f = add('mcb1', { label: 'QF1' }, { on: true }), r = add('rcbo', { label: 'QF2' }, { on: true });
    w(q, 'L', f, '1'); w(f, '2', r, '1'); w(q, 'N', r, '3'); w(r, '2', q, 'PE');
    App.openNew({ name: 'RCBO earth fault', circuit: circ });`));
  await wait(300);
  check('an earth fault trips the RCBO, not the MCB in front of it', (await get('QF2', 'state.tripped')) && !(await get('QF1', 'state.tripped')));
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }), f = add('mcb1', { label: 'QF1' }, { on: true }), r = add('rcbo', { label: 'QF2' }, { on: true });
    w(q, 'L', f, '1'); w(f, '2', r, '1'); w(q, 'N', r, '3'); w(r, '2', r, '4');
    App.openNew({ name: 'RCBO short', circuit: circ });`));
  await wait(300);
  check('a short circuit after the RCBO trips the RCBO, not the MCB in front of it', (await get('QF2', 'state.tripped')) && !(await get('QF1', 'state.tripped')));
  await build(new Function(kit + `
    const q = add('supply3', { label: 'Q0' }), f = add('fuse4', { label: 'FU1' }), m = add('mcb4', { label: 'QF1' }, { on: true }), s = add('isol4', { label: 'QS1' }, { on: true });
    w(q, 'L1', s, '1'); w(q, 'L2', s, '3'); w(q, 'L3', s, '5'); w(q, 'N', s, '7'); ['2', '4', '6', '8'].forEach((t, i) => w(s, t, m, ['1', '3', '5', '7'][i])); ['2', '4', '6', '8'].forEach((t, i) => w(m, t, f, ['1', '3', '5', '7'][i])); w(f, '6', f, '8');
    App.openNew({ name: 'Fuse 4P', circuit: circ });`));
  await wait(300);
  check('a 4-pole fuse blows on an L3-N short before the 4-pole MCB; the 4-pole disconnector passes power', (await get('FU1', 'state.tripped')) && !(await get('QF1', 'state.tripped')) && (await get('QS1', 'state.on')));
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }), s1 = add('pb_no', { label: 'S1' }), s2 = add('pb_no', { label: 'S2' }), k = add('latch', { label: 'KA1', coil: '230VAC' }), h = add('lamp', { label: 'H1', coil: '230VAC' }), v = add('vmeter', { label: 'PV1' }), p = add('hourmeter', { label: 'P1' });
    w(q, 'L', s1, '13'); w(q, 'L', s2, '13'); w(s1, '14', k, 'A1'); w(k, 'A2', q, 'N'); w(s2, '14', k, 'B1'); w(k, 'B2', q, 'N');
    w(q, 'L', k, '11'); w(k, '14', h, 'X1'); w(h, 'X2', q, 'N'); w(k, '14', p, 'X1'); w(p, 'X2', q, 'N'); w(q, 'L', v, 'V1'); w(q, 'N', v, 'V2');
    App.openNew({ name: 'Latch', circuit: circ });`));
  await wait(300);
  check('a voltmeter reads 230 V between L and N', (await get('PV1', 'state.v')) === 230, String(await get('PV1', 'state.v')));
  await tap('S1');
  check('latching relay: a pulse on SET closes 11-14 and it stays', (await get('KA1', 'state.set')) && (await get('H1', 'state.on')));
  await wait(1200);
  check('an hour meter counts while it is powered', (await get('P1', 'state.t')) > 0.5, String(await get('P1', 'state.t')));
  await tap('S2');
  check('latching relay: a pulse on RESET opens it again', !(await get('KA1', 'state.set')) && !(await get('H1', 'state.on')));
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }), t = add('tswitch', { label: 'ST1' }), e = add('heater', { label: 'EH1' }), b = add('pb_co', { label: 'S1' }), h1 = add('lamp', { label: 'H1', coil: '230VAC' }), h2 = add('lamp', { label: 'H2', coil: '230VAC' }), fs = add('foot', { label: 'S2' }), h3 = add('lamp', { label: 'H3', coil: '230VAC' });
    w(q, 'L', t, '13'); w(t, '14', e, 'X1'); w(e, 'X2', q, 'N'); w(q, 'L', b, '13'); w(b, '14', h1, 'X1'); w(h1, 'X2', q, 'N'); w(q, 'L', b, '21'); w(b, '22', h2, 'X1'); w(h2, 'X2', q, 'N');
    w(q, 'L', fs, '13'); w(fs, '14', h3, 'X1'); w(h3, 'X2', q, 'N');
    App.openNew({ name: 'Sensors', circuit: circ });`));
  await wait(300);
  check('heater is off while the thermostat contact is open, push button NO+NC: N.C. lamp on', !(await get('EH1', 'state.on')) && !(await get('H1', 'state.on')) && (await get('H2', 'state.on')));
  await part('ST1', 'pv', 'down'); await wait(400);
  check('the thermostat closes 13-14 at its setpoint and the heater heats', await get('EH1', 'state.on'));
  await part('S1', 'btn', 'down'); await part('S2', 'btn', 'down'); await wait(400);
  check('pressing the NO+NC button swaps the lamps, the foot switch lights its lamp', (await get('H1', 'state.on')) && !(await get('H2', 'state.on')) && (await get('H3', 'state.on')));
  await part('S1', 'btn', 'up'); await part('S2', 'btn', 'up'); await wait(400);
  check('releasing them springs back', !(await get('H1', 'state.on')) && (await get('H2', 'state.on')) && !(await get('H3', 'state.on')));
  // free draw: the new symbols, a text note, PE earth and copy
  await page.evaluate(() => {
    const it = (id, k, tag, x, y) => ({ id, k, tag, x, y, r: 0 });
    const items = [it('d1', 'src1', 'Q0', 100, 0), it('d2', 'rcbo', 'QF1', 100, 120), it('d3', 'tswno', 'ST1', 90, 240), it('d4', 'heater', 'EH1', 90, 340), it('d5', 'gnd', 'PE1', 300, 340), it('d6', 'prox', 'B1', 400, 200),
      it('d7', 'ltset', 'KA1', 500, 200), it('d8', 'ltno', 'KA1', 600, 200), it('d9', 'fsw3', 'QS1', 700, 200), { ...it('d10', 'text', 'TXT', 100, 500), txt: 'Tank heater' }];
    const w = [['d1:L', 'd2:1'], ['d1:N', 'd2:3'], ['d2:2', 'd3:13'], ['d3:14', 'd4:X1'], ['d4:X2', 'd2:4']];
    App.openNew({ name: 'Free lib', schematic: { free: { items, wires: w.map((x, i) => ({ id: 'fw' + (i + 1), a: x[0], b: x[1] })), seq: 20 } } });
    App.setLayout('single'); App.showView('schematic');
  });
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(300);
  check('free draw: the new symbols become devices (text is only a note)', await page.evaluate(() => ['QF1:rcbo', 'ST1:tswitch', 'EH1:heater', 'PE1:jct', 'B1:prox', 'KA1:latch', 'QS1:fsw3'].every(x => App.project.circuit.comps.some(c => c.props.label + ':' + c.type === x)) && !App.project.circuit.comps.some(c => c.props.label === 'TXT') && FreeDraw.errs.size === 0 && document.querySelector('#view-schematic .ftext').textContent === 'Tank heater'));
  check('free draw: the PE earth symbol is wired to the supply PE', await page.evaluate(() => { const C = App.project.circuit, pe = C.comps.find(c => c.props.label === 'PE1'), q = C.comps.find(c => c.props.label === 'Q0'); return App.api.sameNet(pe.id + ':J', q.id + ':PE'); }));
  check('free draw: the text survives save and load', await page.evaluate(() => { App.saveNow(); App.openSaved(App.currentId); return App.project.schematic.free.items.find(i => i.id === 'd10').txt === 'Tank heater'; }));
  await page.evaluate(() => App.showView('schematic'));
  const fp = await (await page.$('#view-schematic [data-fi="d6"] .hit')).boundingBox();
  await page.mouse.click(fp.x + 6, fp.y + 6); await wait(100);
  await page.keyboard.press('d'); await wait(200);
  check('free draw: D copies the selected symbol with a new tag', await page.evaluate(() => { const F = App.project.schematic.free; const c = F.items[F.items.length - 1]; return F.items.length === 11 && c.k === 'prox' && c.tag === 'B2' && App.project.circuit.comps.some(x => x.props.label === 'B2' && x.type === 'prox'); }));
  await page.evaluate(() => document.querySelector('#view-schematic [data-fd="type"]').click()); await wait(150);
  check('free draw: Type ⇄ turns an inductive sensor into an NPN one', await page.evaluate(() => { const F = App.project.schematic.free; return F.items[F.items.length - 1].k === 'proxn'; }));
  await page.evaluate(() => document.querySelector('#view-schematic [data-fd="back"]').click()); await wait(150);
  check('free draw: To back draws the symbol first', await page.evaluate(() => App.project.schematic.free.items[0].k === 'proxn'));
  await page.evaluate(() => document.querySelector('#view-schematic [data-smode="run"]').click()); await wait(250);
  { const tb = await (await page.$('#view-schematic [data-fi="d2"] .hit')).boundingBox(); await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2); await wait(300); }
  const fT = await (await page.$('#view-schematic [data-fi="d3"] .hit')).boundingBox();
  await page.mouse.click(fT.x + fT.width / 2, fT.y + fT.height / 2); await wait(500);
  check('free draw: clicking the thermostat on the drawing switches the heater on', await get('EH1', 'state.on'));
  await page.evaluate(() => document.querySelector('#view-schematic [data-smode="edit"]').click()); await wait(250);
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); });
  await page.click('#view-schematic [data-sstyle="iec"]');

  console.log('v1.6 part 1: modular PLC rack');
  check('the rack modules are in the parts list under PLC Rack', await page.evaluate(() => ['mpsu', 'mcpu', 'mdi8', 'mdi8ac', 'mdo8', 'mdo8t'].every(t => Circuit.DEFS[t] && Circuit.DEFS[t].cat === 'PLC Rack')));
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }), ps = add('mpsu', { label: 'PS1' }), cpu = add('mcpu', { label: 'CPU1' });
    const di = add('mdi8', { label: 'DI1' }), dac = add('mdi8ac', { label: 'DI2' }), dq = add('mdo8', { label: 'DO1' }), dt = add('mdo8t', { label: 'DO2' });
    const s1 = add('pb_no', { label: 'S1' }), s2 = add('pb_no', { label: 'S2' }), h1 = add('lamp', { label: 'H1', coil: '230VAC' }), h2 = add('lamp', { label: 'H2', coil: '24VDC' });
    w(q, 'L', ps, 'L1'); w(q, 'N', ps, 'N'); w(q, 'PE', ps, 'PE');
    w(ps, 'V24', s1, '13'); w(s1, '14', di, 'I0'); w(ps, 'C24', di, 'COM');
    w(q, 'L', s2, '13'); w(s2, '14', dac, 'I3'); w(q, 'N', dac, 'COM');
    w(q, 'L', dq, 'VAC0'); w(dq, 'O0', h1, 'X1'); w(h1, 'X2', q, 'N');
    w(ps, 'V24', dt, 'VP'); w(ps, 'C24', dt, 'COM'); w(dt, 'O5', h2, 'X1'); w(h2, 'X2', ps, 'C24');
    App.openNew({ name: 'Rack', circuit: circ, io: { slots: { 1: 'mdi8', 2: 'mdi8ac', 3: 'mdo8', 4: 'mdo8t' } }, ladder: { rungs: [{ text: 'XIC I:1/0 OTE O:3/0' }, { text: 'XIC I:2/3 OTE O:4/5' }] } });`));
  await wait(300);
  check('new cards take the next free slot (1, 2, 3, 4)', await page.evaluate(() => ['DI1', 'DI2', 'DO1', 'DO2'].map(l => App.project.circuit.comps.find(c => c.props.label === l).props.slot).join() === '1,2,3,4'));
  check('the CPU module is the controller and is powered by the rack power supply', await page.evaluate(() => App.ctx.plcId === App.project.circuit.comps.find(c => c.type === 'mcpu').id && App.plc.powered));
  await setMode('RUN'); await wait(200);
  await part('S1', 'btn', 'down'); await wait(300);
  check('24 VDC card in slot 1: S1 sets I:1/0; the ladder sets O:3/0 and the relay card lights H1', (await page.evaluate(() => App.plc.read('I:1/0') === 1)) && await get('H1', 'state.on'));
  await part('S1', 'btn', 'up'); await wait(300);
  check('releasing S1 turns H1 off', !(await get('H1', 'state.on')));
  await part('S2', 'btn', 'down'); await wait(300);
  check('230 VAC card in slot 2: S2 sets I:2/3; the transistor card in slot 4 lights the 24 V lamp on O:4/5', (await page.evaluate(() => App.plc.read('I:2/3') === 1)) && await get('H2', 'state.on'));
  await part('S2', 'btn', 'up'); await wait(200);
  await page.evaluate(() => App.force('I:1/0', 1)); await wait(300);
  check('a rack input (I:1/0) can be forced', await get('H1', 'state.on'));
  await page.evaluate(() => App.force('I:1/0', null)); await wait(200);
  await page.evaluate(() => { App.showView('ladder'); document.querySelector('[data-file="I"]').click(); });
  await wait(200);
  check('the data table lists the input cards by slot', await page.evaluate(() => !!document.querySelector('[data-io="I:1/0"]') && !!document.querySelector('[data-io="I:2/7"]') && !document.querySelector('[data-io="I:0/0"]')));
  check('the status bar shows one I/O group per card', await page.evaluate(() => [...document.querySelectorAll('[data-io] .iol')].map(e => e.textContent).join() === 'I:1,I:2,O:3,O:4'));
  await page.evaluate(() => { const c = App.project.circuit.comps.find(c => c.props.label === 'DO1'); c.props.slot = '2'; App.circuitChanged(); });
  await wait(300);
  check('two cards in one slot: the second is inactive and says so', await page.evaluate(() => { const c = App.project.circuit.comps.find(c => c.props.label === 'DO1'); return Circuit.status(c, App.ctx).includes('already taken'); }));
  await page.evaluate(() => { App.project.circuit.comps.find(c => c.props.label === 'DO1').props.slot = '3'; App.circuitChanged(); });
  await page.evaluate(() => { App.setLayout('single'); App.showView('wiring'); });
  const nRack = await page.evaluate(() => App.project.circuit.comps.length);
  await page.evaluate(() => document.querySelector('.pal-item[data-type="plc"]').click());
  await wait(200);
  check('a compact PLC cannot be added next to a CPU module', await page.evaluate(n => App.project.circuit.comps.length === n, nRack));
  await setMode('PROG');

  await page.evaluate(() => App.openNew(Examples.EX.rack.build())); await wait(300);
  await setMode('RUN'); await wait(200);
  check('rack example: STOP is closed, the STOPPED lamp is on', (await get('H2', 'state.on')) && !(await get('H1', 'state.on')));
  await press('S1'); await wait(400);
  check('rack example: START runs and seals in (RUN lamp on O:2/0)', (await get('H1', 'state.on')) && !(await get('H2', 'state.on')));
  await press('S2'); await wait(400);
  check('rack example: STOP stops it', !(await get('H1', 'state.on')) && await get('H2', 'state.on'));
  await setMode('PROG');

  console.log('v1.6 part 2: I/O Configuration');
  await page.evaluate(() => { const p = Examples.EX.rack.build(); delete p.io; App.openNew(p); }); await wait(300);
  await setMode('RUN'); await wait(200);
  check('with no I/O configuration the CPU refuses RUN, shows FLT and says why', await page.evaluate(() => {
    const cpu = App.project.circuit.comps.find(c => c.type === 'mcpu');
    return App.plc.mode === 'PROG' && App.events().some(e => e.msg.includes('Go to RUN refused') && e.msg.includes('installed but not configured')) && Circuit.status(cpu, App.ctx).includes('mismatch') && App.ctx.rack.bad.length === 2;
  }));
  check('an unconfigured card stays inactive', await page.evaluate(() => Circuit.status(App.project.circuit.comps.find(c => c.props.label === 'DI1'), App.ctx).includes('not in the I/O configuration')));
  await page.evaluate(() => App.ioConfig()); await wait(200);
  check('the I/O Configuration dialog lists slots 0–7 and marks mismatches', await page.evaluate(() => document.querySelectorAll('.io-cfg [data-slot]').length === 7 && document.querySelectorAll('.io-cfg .io-st.bad').length === 2));
  await page.click('.modal-foot button:has-text("Read I/O Config")'); await wait(100);
  check('Read I/O Config copies the installed cards', await page.evaluate(() => document.querySelector('[data-slot="1"]').value === 'mdi8' && document.querySelector('[data-slot="2"]').value === 'mdo8' && !document.querySelector('.io-cfg .io-st.bad')));
  await page.click('.modal-foot button:has-text("Apply")'); await wait(200);
  check('Apply saves the configuration in the project', await page.evaluate(() => JSON.stringify(App.serialize().io) === JSON.stringify({ slots: { 1: 'mdi8', 2: 'mdo8' } })));
  await setMode('RUN'); await wait(200);
  check('a matching configuration goes to RUN and the cards work', await page.evaluate(() => App.plc.mode === 'RUN') && await get('H2', 'state.on'));
  await page.evaluate(() => { const c = App.project.circuit; const d = c.comps.find(x => x.props.label === 'DO1'); c.comps = c.comps.filter(x => x !== d); c.wires = c.wires.filter(w => !w.a.startsWith(d.id + ':') && !w.b.startsWith(d.id + ':')); App.circuitChanged(); });
  await wait(300);
  check('removing a configured card while running faults the CPU into PROG', await page.evaluate(() => App.plc.mode === 'PROG' && App.events().some(e => e.kind === 'alarm' && e.msg.includes('CPU fault') && e.msg.includes('configured but missing'))));
  await page.evaluate(() => { const p = Examples.EX.rack.build(); p.ladder.rungs.push({ text: 'XIC I:5/0 OTE O:2/9', comment: '' }); App.openNew(p); }); await wait(200);
  check('Verify: an address in an unconfigured slot or past the card\'s 8 points is an error', await page.evaluate(() => {
    const { errs } = App.plc.verify(App.project.ladder.rungs);
    return errs.some(e => e.msg.includes('I:5/0') && e.msg.includes('not configured')) && errs.some(e => e.msg.includes('O:2/9') && e.msg.includes('8 points'));
  }));
  check('Verify: a compact PLC flags an input it does not have as a warning only', await page.evaluate(() => {
    App.openNew({ name: 'Compact', circuit: Examples.EX.practice.build().circuit, ladder: { rungs: [{ text: 'XIC I:1/0 OTE O:0/0' }] } });
    const { errs, warns } = App.plc.verify(App.project.ladder.rungs);
    return !errs.length && warns.some(w => w.msg.includes('not on the compact PLC'));
  }));
  check('a saved I/O configuration is cleaned on load', await page.evaluate(() => JSON.stringify(App.buildProject({ name: 'x', io: { slots: { 1: 'mdo8', 9: 'mdi8', 2: 'lamp', 3: 5 } } }).io) === JSON.stringify({ slots: { 1: 'mdo8' } })));

  console.log('v1.6 part 3: address styles');
  await page.evaluate(() => { App.openNew(Examples.EX.rack.build()); App.setLayout('single'); App.showView('ladder'); }); await wait(300);
  const addrs = () => page.evaluate(() => [...document.querySelectorAll('#view-ladder .addr')].map(t => t.textContent).join());
  check('file-based is the default style', (await addrs()).startsWith('I:1/0') && await page.evaluate(() => App.project.addr === 'file'));
  await page.selectOption('#view-ladder [data-addr]', 'bitbyte'); await wait(200);
  check('bit/byte style: I:1/0 → I0.0, O:2/0 → Q0.0 in the ladder', await page.evaluate(() => { const t = [...document.querySelectorAll('#view-ladder .addr')].map(x => x.textContent); return t.includes('I0.0') && t.includes('I0.1') && t.includes('Q0.0') && t.includes('Q0.1'); }));
  check('the program is still stored file-based', await page.evaluate(() => App.serialize().ladder.rungs[0].text.includes('I:1/0') && App.serialize().addr === 'bitbyte'));
  check('the wiring card shows its range in the chosen style', await page.evaluate(() => Circuit.draw(App.project.circuit.comps.find(c => c.props.label === 'DI1'), App.ctx).includes('I0.0 – I0.7')));
  check('the data table shows the chosen style', await page.evaluate(() => { document.querySelector('[data-file="I"]').click(); return document.querySelector('[data-io="I:1/0"] code').textContent === 'I0.0'; }));
  await page.selectOption('#view-ladder [data-addr]', 'basic'); await wait(200);
  check('basic style: I1, I2, Q1, Q2', await page.evaluate(() => { const t = [...document.querySelectorAll('#view-ladder .addr')].map(x => x.textContent); return ['I1', 'I2', 'Q1', 'Q2'].every(a => t.includes(a)); }));
  check('an address typed in any style is read as file-based', await page.evaluate(() => App.addrIn('I0.1') === 'I:1/1' && App.addrIn('q2') === 'O:2/1' && App.addrIn('%IX0.0') === 'I:1/0' && App.addrIn('B3:0/1') === 'B3:0/1' && App.addrIn('I9') === 'I9'));
  await page.evaluate(() => Ladder.edit(App.project.ladder.rungs[1].elems[0].id)); await wait(150);
  check('the edit dialog shows the address in the chosen style', await page.evaluate(() => document.querySelector('#f_a0').value === 'Q1'));
  await page.fill('#f_a0', 'I2'); await page.click('.modal-foot button:has-text("OK")'); await wait(150);
  check('typing I2 in basic style stores I:1/1', await page.evaluate(() => App.serialize().ladder.rungs[1].text.startsWith('XIO I:1/1')));
  check('the address style is cleaned on load', await page.evaluate(() => App.buildProject({ name: 'x', addr: 'evil' }).addr === 'file' && App.buildProject({ name: 'x', addr: 'basic' }).addr === 'basic'));
  check('compact PLC in bit/byte style: I:0/9 is I1.1', await page.evaluate(() => { App.openNew({ ...Examples.EX.practice.build(), addr: 'bitbyte' }); return App.fmt('I:0/9') === 'I1.1' && App.fmt('O:0/7') === 'Q0.7' && App.fmt('B3:0/1') === 'B3:0/1'; }));
  await page.evaluate(() => App.setAddrStyle('file'));

  console.log('v1.6.1: address styles everywhere');
  await page.evaluate(() => { const p = Examples.EX.rack.build(); p.addr = 'bitbyte'; p.ladder.rungs.push({ text: 'XIC I:5/0 OTE O:2/9', comment: '' }); App.openNew(p); App.setLayout('single'); App.showView('ladder'); }); await wait(200);
  check('Verify messages show the address style, with the file address in brackets', await page.evaluate(() => App.fmtText('Writing to input I:1/0') === 'Writing to input I0.0 (I:1/0)' && App.fmtText('N7:0 and I:5/0') === 'N7:0 and I:5/0'));
  await page.evaluate(() => { App.project.hmi.objects = [{ id: 'h1', type: 'lamp', x: 10, y: 10, w: 80, h: 90, label: 'RUN', tag: 'O:2/0', onColor: '#2fa84f', offColor: '#3a3833' }]; App.showView('hmi'); }); await wait(200);
  await page.click('#view-hmi [data-mode="edit"]'); await wait(100);
  await page.evaluate(() => { const el = document.querySelector('#view-hmi .hobj[data-id="h1"]'); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + 5, clientY: r.y + 5, button: 0, pointerId: 1 })); document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); }); await wait(200);
  check('the HMI tag field shows the address style', await page.evaluate(() => document.querySelector('#view-hmi [data-k="tag"]').value === 'Q0.0'));
  await page.fill('#view-hmi [data-k="tag"]', 'Q0.1'); await page.dispatchEvent('#view-hmi [data-k="tag"]', 'change'); await wait(150);
  check('an HMI tag typed in the address style is stored file-based', await page.evaluate(() => App.project.hmi.objects[0].tag === 'O:2/1'));
  await page.click('#view-hmi [data-mode="run"]');
  await page.evaluate(() => App.showView('ladder'));

  console.log('v1.6 part 4: 2D cabinet');
  check('the cabinet parts are in the parts list under Cabinet', await page.evaluate(() => ['encl', 'door', 'duct', 'hmiterm'].every(t => Circuit.DEFS[t] && Circuit.DEFS[t].cat === 'Cabinet') && !!document.querySelector('.pal-item[data-type="encl"]')));
  await page.evaluate(() => { App.openNew(Examples.EX.cabinet.build()); App.setLayout('single'); App.showView('wiring'); Workspace.fit(); }); await wait(400);
  check('cabinet and door are drawn behind the devices, the ducts with the rails', await page.evaluate(() => document.querySelectorAll('.ws-svg .backs .comp').length === 2 && document.querySelectorAll('.ws-svg .rails .comp').length === 5));
  check('a plate takes its size from its properties', await page.evaluate(() => { const c = App.project.circuit.comps.find(x => x.type === 'encl'); const d = Circuit.dims(c); return d.w === 1200 && d.h === 800; }));
  check('the HMI terminal on the door is powered from the 24 V supply', await get('HMI1', 'state.pw'));
  await setMode('RUN'); await wait(200);
  await tap('S1');
  check('cabinet example: START on the door runs the motor through the rack', (await get('KM1', 'state.pulled')) && await get('H1', 'state.on'));
  check('the HMI terminal shows the live HMI screen', await page.evaluate(() => { const c = App.project.circuit.comps.find(x => x.props.label === 'HMI1'); const s = Circuit.draw(c, App.ctx); return s.includes('RUNNING') && s.includes('data-part="h:'); }));
  const stopId = await page.evaluate(() => App.project.hmi.objects.find(o => o.label === 'STOP').id);
  await page.evaluate(id => { const c = App.project.circuit.comps.find(x => x.props.label === 'HMI1'); const up = App.operate(c, 'h:' + id); setTimeout(up, 150); }, stopId);
  await wait(600);
  check('pressing STOP on the HMI terminal in the Wiring stops the motor', !(await get('KM1', 'state.pulled')) && await page.evaluate(() => App.plc.read('B3:0/1') === 0));
  await setMode('PROG');
  const cabBefore = await page.evaluate(() => { const g = n => App.project.circuit.comps.find(x => x.props.label === n); return { cab: [g('+CP1').x, g('+CP1').y], qf: [g('QF1').x, g('QF1').y], door: [g('+CD1').x, g('+CD1').y], s1: [g('S1').x, g('S1').y] }; });
  const scr = await page.evaluate(() => { const m = document.querySelector('.ws-svg .vp').getScreenCTM(); const pt = (x, y) => ({ x: x * m.a + m.e, y: y * m.d + m.f }); return { a: pt(1120, 300), b: pt(1160, 340) }; });
  await page.mouse.move(scr.a.x, scr.a.y); await page.mouse.down(); await page.mouse.move(scr.b.x, scr.b.y, { steps: 5 }); await page.mouse.up(); await wait(200);
  check('moving the cabinet moves the devices mounted on it, not the door', await page.evaluate(b => {
    const g = n => App.project.circuit.comps.find(x => x.props.label === n);
    const dx = g('+CP1').x - b.cab[0], dy = g('+CP1').y - b.cab[1];
    return dx !== 0 && dy !== 0 && g('QF1').x === b.qf[0] + dx && g('QF1').y === b.qf[1] + dy && g('+CD1').x === b.door[0] && g('S1').x === b.s1[0];
  }, cabBefore));
  check('without 24 V the HMI terminal is dark', await page.evaluate(() => { const c = Circuit.create('hmiterm', 0, 0, { comps: [], seq: 0 }); return Circuit.draw(c, App.ctx).includes('NO POWER'); }));

  console.log('v1.6: free draw library panel, points, wire pieces, values');
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'free'); localStorage.removeItem('plc-trainer.fdLib'); App.openNew({ name: 'Free v2', circuit: { comps: [], wires: [], seq: 0 } }); App.setLayout('single'); App.showView('schematic'); });
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(300);
  await page.selectOption('#view-schematic .fd-grp', 'All'); await wait(100);
  check('free draw: the library is an icon grid beside the drawing, with every symbol under All', await page.evaluate(() => !!document.querySelector('#view-schematic .fd-lib .fd-grp') && document.querySelectorAll('#view-schematic .fd-ico').length === Object.values(FreeDraw.KINDS).filter(S => !S.hide).length &&document.querySelectorAll('#view-schematic .fd-ico svg .ssym').length > 50));
  await page.selectOption('#view-schematic .fd-grp', 'Motors'); await wait(100);
  check('free draw: the group list shows one group (Motors, with the DC motor)', await page.evaluate(() => { const k = [...document.querySelectorAll('#view-schematic .fd-ico')].map(b => b.dataset.fk); return k.length === 6 && k.includes('mdc') && document.querySelector('#view-schematic .fd-ico').classList.contains('g-motors'); }));
  check('free draw: the new sources and wire pieces are in the library', await page.evaluate(() => ['pL1', 'pL2', 'pL3', 'pN', 'pPE', 'pP', 'pM', 'batt', 'gen', 'psu', 'wline', 'wcorner', 'wtee', 'wcross', 'wlink', 'mdc'].every(k => FreeDraw.KINDS[k])));
  await page.selectOption('#view-schematic .fd-grp', 'Others'); await wait(100);
  for (let i = 0; i < 4; i++) { await page.click('#view-schematic .fd-ico[data-fk="wcorner"]'); await wait(80); }
  check('free draw: as in Simurelay, a symbol from the library lands in the middle of the view, selected', await page.evaluate(() => { const its = App.project.schematic.free.items; return its.length === 4 && its.every(a => a.x === its[0].x && a.y === its[0].y) && FreeDraw.selected() === its[3]; }));
  check('free draw: wire pieces need no tag dialog', await page.evaluate(() => !document.querySelector('.modal')));
  await page.dragAndDrop('#view-schematic .fd-ico[data-fk="wcross"]', '#view-schematic .fd-host', { targetPosition: { x: 60, y: 60 } }); await wait(200);
  check('free draw: a symbol dragged from the library lands where it is dropped', await page.evaluate(() => App.project.schematic.free.items.some(i => i.k === 'wcross')));
  await page.click('#view-schematic [data-fdact="lib"]'); await wait(100);
  check('free draw: the Library button hides and shows the panel', await page.evaluate(() => !document.querySelector('#view-schematic .fd-lib').offsetParent));
  await page.click('#view-schematic [data-fdact="lib"]'); await wait(100);
  // potential points wired to the supply: L1 → S1 → H1 → N, and a link arrow pair
  await page.evaluate(() => {
    const items = [{ id: 'd1', k: 'src1', tag: 'Q1', x: 0, y: -100, r: 0 }, { id: 'd2', k: 'pL1', tag: 'XP1', x: 0, y: 0, r: 0 }, { id: 'd3', k: 'pbno', tag: 'S1', x: 0, y: 80, r: 0 },
      { id: 'd4', k: 'wlink', tag: 'A', x: 0, y: 160, r: 0 }, { id: 'd5', k: 'wlink', tag: 'A', x: 200, y: 0, r: 180 }, { id: 'd6', k: 'lamp', tag: 'H1', x: 200, y: 80, r: 0 }, { id: 'd7', k: 'pN', tag: 'XP2', x: 200, y: 180, r: 180 },
      { id: 'd8', k: 'pP', tag: 'XP3', x: 400, y: 0, r: 0 }];
    const w = [['d2:J', 'd3:13'], ['d3:14', 'd4:J0'], ['d5:J0', 'd6:X1'], ['d6:X2', 'd7:J']];
    App.openNew({ name: 'Points', circuit: { comps: [], wires: [], seq: 0 }, schematic: { free: { items, wires: w.map((x, i) => ({ id: 'fw' + (i + 1), a: x[0], b: x[1] })), seq: 20 } } });
    App.showView('schematic');
  });
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(300);
  check('free draw: Point L1 and Point N are wired to the supply L and N', await page.evaluate(() => { const C = App.project.circuit, q = C.comps.find(c => c.props.label === 'Q1'), j1 = C.comps.find(c => c.props.label === 'XP1'), j2 = C.comps.find(c => c.props.label === 'XP2'); return App.api.sameNet(j1.id + ':J', q.id + ':L') && App.api.sameNet(j2.id + ':J', q.id + ':N'); }));
  check('free draw: a +24 V point with no 24 V supply brings a 24 V battery into the Wiring (no error)', await page.evaluate(() => ![...FreeDraw.errs.values()].some(m => m.includes('+24 V')) && App.project.circuit.comps.some(c => c.type === 'battery')));
  await page.evaluate(() => document.querySelector('#view-schematic [data-fdact="play"]').click()); await wait(250); await wait(100);
  check('free draw: Play switches to operate', await page.evaluate(() => document.querySelector('#view-schematic [data-smode="run"]').classList.contains('on') && document.querySelector('#view-schematic [data-fdact="play"]').textContent.includes('Stop')));
  await page.evaluate(() => document.querySelector('#view-schematic [data-fdact="values"]').click()); await wait(200);
  const pS1 = await (await page.$('#view-schematic [data-fi="d3"] .hit')).boundingBox();
  await page.mouse.move(pS1.x + pS1.width / 2, pS1.y + pS1.height / 2); await page.mouse.down(); await wait(400);
  check('free draw: through the link arrows (same tag) S1 lights H1', await get('H1', 'state.on'));
  const vals = await page.evaluate(() => [...document.querySelectorAll('#view-schematic .fval')].map(x => x.textContent));
  check('free draw: Values shows 230 V on the lamp, closed on S1, L1 on the point', vals.includes('230 V~') && vals.includes('closed') && vals.includes('L1'), vals.join(','));
  await page.mouse.up(); await wait(200);
  await page.evaluate(() => document.querySelector('#view-schematic [data-fdact="values"]').click()); await page.evaluate(() => document.querySelector('#view-schematic [data-fdact="play"]').click()); await wait(250);
  await page.click('#view-schematic [data-fz="in"]'); await wait(100);
  check('free draw: zoom buttons at the bottom right zoom the drawing', await page.evaluate(() => /scale\(1\.2/.test(document.querySelector('#view-schematic .fv').getAttribute('transform'))));
  await page.click('#view-schematic [data-fz="fit"]'); await wait(100);
  check('free draw: the grid has major lines every 100 px', await page.evaluate(() => !!document.querySelector('#view-schematic #fdGrid2 .gridLine')));
  check('DC motor runs on 24 V DC and reverses with the polarity', await page.evaluate(() => {
    const circ = { comps: [], wires: [], seq: 0 }, b = Circuit.create('battery', 0, 0, circ), m = Circuit.create('motordc', 0, 0, circ);
    circ.comps.push(b, m); circ.wires.push({ id: 'w1', a: b.id + ':P', b: m.id + ':A1' }, { id: 'w2', a: b.id + ':M', b: m.id + ':A2' });
    Circuit.solve(circ, 0.02, {}); const fwd = m.state.drive === 'run' && m.state.dir === 1;
    circ.wires = [{ id: 'w1', a: b.id + ':P', b: m.id + ':A2' }, { id: 'w2', a: b.id + ':M', b: m.id + ':A1' }];
    Circuit.solve(circ, 0.02, {}); return fwd && m.state.dir === -1;
  }));
  check('the generator supplies only while it runs', await page.evaluate(() => {
    const circ = { comps: [], wires: [], seq: 0 }, g = Circuit.create('gen3', 0, 0, circ), h = Circuit.create('lamp', 0, 0, circ);
    h.props.coil = '230VAC'; circ.comps.push(g, h); circ.wires.push({ id: 'w1', a: g.id + ':L1', b: h.id + ':X1' }, { id: 'w2', a: g.id + ':N', b: h.id + ':X2' });
    Circuit.solve(circ, 0.02, {}); const off = !h.state.on; Circuit.part(g, 'run', 'down', {}); Circuit.solve(circ, 0.02, {}); return off && h.state.on;
  }));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); });
  await page.click('#view-schematic [data-sstyle="iec"]');

  console.log('v1.7: HMI Studio / Machine, screens, terminal types, new objects, log-in');
  await page.evaluate(() => {
    App.openNew({ name: 'HMI v1.7', hmi: { res: 't10', pin: '4321', screens: [{ id: 's1', name: 'Main' }, { id: 's2', name: 'Alarms' }], objects: [
      { id: 'h1', type: 'nav', scr: 's1', x: 10, y: 10, w: 150, h: 56, label: 'ALARMS', target: 's2', color: '#2f6fd6' },
      { id: 'h2', type: 'pb', scr: 's1', x: 200, y: 10, w: 130, h: 64, label: 'RESET', tag: 'B3:0/3', mode: 'momentary', color: '#2fa84f', sec: 'yes' },
      { id: 'h3', type: 'login', scr: 's1', x: 400, y: 10, w: 150, h: 56, label: 'LOGIN' },
      { id: 'h4', type: 'rect', scr: 's1', x: 10, y: 200, w: 100, h: 60, tag: 'B3:0/4', onColor: '#2fa84f', offColor: '#3d4a57', vis: 'B3:0/5' },
      { id: 'h5', type: 'trend', scr: 's1', x: 300, y: 200, w: 320, h: 160, label: 'N7', tag: 'N7:0', min: 0, max: 100, span: 30, color: '#f2c230' },
      { id: 'h6', type: 'nav', scr: 's2', x: 10, y: 10, w: 150, h: 56, label: 'BACK', target: 's9', color: '#2f6fd6' },
      { id: 'h7', type: 'image', scr: 's2', x: 10, y: 100, w: 100, h: 100, src: 'javascript:alert(1)' },
    ] } });
    App.setLayout('single'); App.showView('hmi');
  });
  await wait(300);
  check('HMI: the terminal type sets the screen size (10" = 1024×600)', await page.evaluate(() => { const s = document.querySelector('#view-hmi .hmi-screen'); return s.style.width === '1024px' && s.style.height === '600px' && document.querySelector('#view-hmi .hmi-brand').textContent.includes('1024×600'); }));
  check('HMI: saved screens, PIN and objects are cleaned (bad link target → Main, bad picture dropped)', await page.evaluate(() => { const h = App.project.hmi; return h.screens.length === 2 && h.pin === '4321' && h.objects.find(o => o.id === 'h6').target === 's1' && h.objects.find(o => o.id === 'h7').src === ''; }));
  check('HMI: only the objects of the screen on display are drawn', await page.evaluate(() => !!document.querySelector('#view-hmi .hobj[data-id="h1"]') && !document.querySelector('#view-hmi .hobj[data-id="h6"]')));
  const hClick = id => page.evaluate(id => { const el = document.querySelector(`#view-hmi .hobj[data-id="${id}"]`); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, button: 0, pointerId: 1 })); window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); }, id);
  await page.evaluate(() => App.setMode('RUN'));
  await page.evaluate(() => { const el = document.querySelector('#view-hmi .hobj[data-id="h2"]'); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + 5, clientY: r.y + 5, button: 0, pointerId: 1 })); }); await wait(120);
  check('HMI security: a button that needs log-in does nothing before logging in', await page.evaluate(() => App.plc.read('B3:0/3') === 0 && App.events().some(e => e.msg.includes('not logged in'))));
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })));
  await hClick('h3'); await wait(100);
  await page.fill('#f_p', '0000'); await page.click('.modal .btn.primary'); await wait(100);
  check('HMI security: a wrong PIN is refused', await page.evaluate(() => !!document.querySelector('.modal .form-err') && document.querySelector('.modal .form-err').textContent.includes('Wrong')));
  await page.fill('#f_p', '4321'); await page.click('.modal .btn.primary'); await wait(150);
  await page.evaluate(() => { const el = document.querySelector('#view-hmi .hobj[data-id="h2"]'); const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + 5, clientY: r.y + 5, button: 0, pointerId: 1 })); }); await wait(120);
  check('HMI security: after log-in with the PIN the button works', await page.evaluate(() => App.plc.read('B3:0/3') === 1));
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }))); await wait(150);
  check('HMI animation: a shape is hidden while its visibility tag is 0', await page.evaluate(() => document.querySelector('#view-hmi .hobj[data-id="h4"]').style.visibility === 'hidden'));
  await page.evaluate(() => { App.plc.write('B3:0/5', 1); App.plc.write('B3:0/4', 1); }); await wait(150);
  check('HMI animation: it shows when the tag is 1 and takes its ON colour', await page.evaluate(() => { const el = document.querySelector('#view-hmi .hobj[data-id="h4"]'); return el.style.visibility === '' && el.querySelector('[data-s]').style.background.includes('47, 168, 79'); }));
  await page.evaluate(() => App.plc.write('N7:0', 60)); await wait(700);
  check('HMI trend: draws the history of its tag', await page.evaluate(() => (document.querySelector('#view-hmi .hobj[data-id="h5"] [data-p]').getAttribute('d') || '').split('L').length > 2));
  await hClick('h1'); await wait(150);
  check('HMI: a Go to Screen button changes the screen', await page.evaluate(() => HMI.screen() === 's2' && !!document.querySelector('#view-hmi .hobj[data-id="h6"]') && !document.querySelector('#view-hmi .hobj[data-id="h1"]')));
  await hClick('h6'); await wait(150);
  await page.click('#view-hmi [data-mode="edit"]'); await wait(150);
  check('HMI Studio: with nothing selected, the side panel has terminal type, screens and PIN', await page.evaluate(() => !!document.querySelector('#view-hmi [data-res]') && document.querySelectorAll('#view-hmi [data-go]').length === 2 && document.querySelector('#view-hmi [data-pin]').value === '4321'));
  await page.selectOption('#view-hmi [data-res]', 't4'); await wait(150);
  check('HMI Studio: changing the terminal type resizes the screen (4.3" = 480×272)', await page.evaluate(() => App.project.hmi.res === 't4' && document.querySelector('#view-hmi .hmi-screen').style.width === '480px'));
  check('HMI Studio: the add list has the new objects', await page.evaluate(() => ['rect', 'ellipse', 'line', 'trend', 'image', 'nav', 'login'].every(t => !!document.querySelector(`#view-hmi [data-add="${t}"]`))));
  check('HMI terminal in the Wiring follows the screen size', await page.evaluate(() => { const m = HMI.mini(); return m.w === 480 && m.h === 272; }));
  await page.click('#view-hmi [data-mode="run"]'); await page.evaluate(() => { App.setMode('PROG'); App.openNew(Examples.EX.plcmotor.build()); });

  console.log('v1.8: OSR/OSF, MCR, JSR/SBR/RET, COP/FLL, SQO');
  const eng = (main, subs) => page.evaluate(([main, subs]) => {
    const E = new PLCcore.Engine(), R = list => list.map(t => Ladder.newRung(Ladder.parseRung(t)));
    const S = {}; for (const n in subs) S[n] = R(subs[n]);
    E.setProgram(R(main), S); E.applyAll(true); E.setMode('RUN'); window._E = E; return true;
  }, [main, subs || {}]);
  const scan = (n = 1) => page.evaluate(n => { for (let i = 0; i < n; i++) window._E.scan(0.02); }, n);
  const rd = a => page.evaluate(a => window._E.read(a), a);
  const wr = (a, v) => page.evaluate(([a, v]) => window._E.write(a, v), [a, v]);
  await eng(['XIC B3:0/0 OSR B3:1/0 B3:1/1', 'XIC B3:0/0 OSF B3:1/2 B3:1/3']);
  await wr('B3:0/0', 1); await scan();
  const osr1 = await rd('B3:1/1'); await scan(); const osr2 = await rd('B3:1/1');
  await wr('B3:0/0', 0); await scan(); const osf1 = await rd('B3:1/3'); await scan(); const osf2 = await rd('B3:1/3');
  check('OSR is ON for one scan on false-to-true, OSF for one scan on true-to-false', osr1 === 1 && osr2 === 0 && osf1 === 1 && osf2 === 0);
  await eng(['XIC B3:0/0 MCR', 'OTE O:0/0', 'MCR', 'OTE O:0/1']);
  await scan(); const mcrOff = (await rd('O:0/0')) === 0 && (await rd('O:0/1')) === 1;
  await wr('B3:0/0', 1); await scan();
  check('MCR: a false zone switches its outputs off, a true zone lets them run; rungs after the zone are not affected', mcrOff && (await rd('O:0/0')) === 1);
  await eng(['XIC B3:0/0 JSR U:3', 'OTE O:0/2'], { 3: ['SBR OTE O:0/0', 'XIC B3:0/1 RET', 'OTE O:0/1'] });
  await scan(); const noCall = (await rd('O:0/0')) === 0;
  await wr('B3:0/0', 1); await scan(); const called = (await rd('O:0/0')) === 1 && (await rd('O:0/1')) === 1;
  await wr('B3:0/1', 1); await wr('O:0/1', 0); await scan();
  check('JSR runs subroutine LAD 3 only while true; RET ends it early', noCall && called && (await rd('O:0/1')) === 0 && (await rd('O:0/2')) === 1);
  await eng(['XIC B3:0/0 COP #N7:0 #N7:10 3', 'XIC B3:0/1 FLL 7 #N7:20 4']);
  await page.evaluate(() => { [11, 22, 33].forEach((v, i) => window._E.write('N7:' + i, v)); });
  await wr('B3:0/0', 1); await wr('B3:0/1', 1); await scan();
  check('COP copies a block of words, FLL fills a block', [await rd('N7:10'), await rd('N7:11'), await rd('N7:12'), await rd('N7:20'), await rd('N7:23'), await rd('N7:24')].join() === '11,22,33,7,7,0');
  await eng(['XIC B3:0/0 SQO #N7:0 15 O:0 R6:0 3 0']);
  await page.evaluate(() => { [0, 1, 2, 4].forEach((v, i) => window._E.write('N7:' + i, v)); });
  const step = async () => { await wr('B3:0/0', 1); await scan(); const v = await rd('O:0') & 15; await wr('B3:0/0', 0); await scan(); return v; };
  const seqv = [await step(), await step(), await step(), await step()];
  check('SQO steps through the file into the outputs (masked) and wraps after LEN', seqv.join() === '1,2,4,1' && (await rd('R6:0.LEN')) === 3);
  check('Verify: JSR to a missing file is an error', await page.evaluate(() => { const E = new PLCcore.Engine(); const r = [Ladder.newRung(Ladder.parseRung('JSR U:5'))]; E.setProgram(r, {}); return E.verify(r).errs.some(e => e.msg.includes('LAD 5')); }));
  await page.evaluate(() => { App.openNew({ name: 'Files', ladder: { rungs: [{ text: 'XIC I:0/0 JSR U:3' }], files: [{ n: 3, name: 'pump', rungs: [{ text: 'OTE O:0/0' }] }, { n: 3, name: 'dup', rungs: [] }, { n: 12, name: 'bad', rungs: [] }] } }); App.setLayout('single'); App.showView('ladder'); }); await wait(200);
  check('program files are cleaned on load (duplicates and LAD > 9 dropped) and saved', await page.evaluate(() => { const f = App.serialize().ladder.files; return f.length === 1 && f[0].n === 3 && f[0].name === 'PUMP' && f[0].rungs[0].text === 'OTE O:0/0'; }));
  await page.selectOption('#view-ladder [data-lfile]', '3'); await wait(150);
  check('the File list opens subroutine LAD 3 in the editor', await page.evaluate(() => Ladder.file() === 3 && [...document.querySelectorAll('#view-ladder .addr')].some(t => t.textContent === 'O:0/0')));
  await page.evaluate(() => App.setMode('RUN')); await page.evaluate(() => App.plc.write('I:0/0', 0)); await wait(100);
  check('the main program calls the subroutine in the app too', await page.evaluate(() => { App.force('I:0/0', 1); return true; }) && await page.waitForFunction(() => App.plc.read('O:0/0') === 1, null, { timeout: 2000 }).then(() => true, () => false));
  await page.evaluate(() => { App.force('I:0/0', null); App.setMode('PROG'); Ladder.openFile(2); });
  check('the instruction bar has the new instructions', await page.evaluate(() => ['OSR', 'OSF', 'COP', 'FLL', 'SQO', 'JSR', 'SBR', 'RET', 'MCR'].every(t => !!document.querySelector(`#view-ladder [data-ins="${t}"]`))));
  await page.evaluate(() => App.openNew(Examples.EX.plcmotor.build()));

  console.log('v1.8: analog I/O, level transmitter, VFD');
  await page.evaluate(() => { App.openNew(Examples.EX.analog.build()); App.setLayout('single'); App.showView('wiring'); }); await wait(300);
  check('the analog parts are in the parts list', await page.evaluate(() => ['mai4', 'mao2', 'ltx', 'vfd'].every(t => Circuit.DEFS[t] && !Circuit.DEFS[t].hidden)));
  check('analog example: the I/O configuration matches and it verifies', await page.evaluate(() => App.ctx.rack.bad.length === 0 && Ladder.verify(true)));
  await setMode('RUN'); await wait(400);
  check('the level transmitter sends 4–20 mA for the tank level and the card reads it into I:3.0', await page.evaluate(() => { const lt = App.project.circuit.comps.find(c => c.props.label === 'LT1'), tk = App.project.circuit.comps.find(c => c.props.label === 'TK1'); const want = Math.round((tk.state.lvl / 100) * 32767); return Math.abs(lt.state.mA - (4 + 16 * tk.state.lvl / 100)) < 0.3 && Math.abs(App.plc.read('I:3.0') - want) < 1000; }));
  const noFill = !(await get('TK1', 'state.fill'));
  await page.evaluate(() => { App.project.circuit.comps.find(c => c.props.label === 'TK1').state.lvl = 20; }); await wait(400);
  check('the fill valve stays shut at 40 %, opens below 30 % (analog compare)', noFill && await get('TK1', 'state.fill'));
  await part('S1', 'knob', 'down'); await wait(1500);
  check('S1 starts the VFD forward; its speed follows the analog output (MOV I:3.0 O:4.0)', await page.evaluate(() => { const v = App.project.circuit.comps.find(c => c.props.label === 'VFD1'), ao = App.project.circuit.comps.find(c => c.props.label === 'AO1'); return v.state.dir === 1 && v.state.hz > 5 && Math.abs(v.state.ref - ao.state.v[0] * 6) < 0.2 && Math.abs(ao.state.v[0] - App.plc.read('O:4.0') / 32767 * 10) < 0.05; }));
  check('the motor on the VFD runs at the VFD frequency', await page.evaluate(() => { const v = App.project.circuit.comps.find(c => c.props.label === 'VFD1'), m = App.project.circuit.comps.find(c => c.props.label === 'M1'); return m.state.drive === 'run' && Math.abs(m.state.k - v.state.hz / 60) < 0.05; }));
  check('the data table shows the analog words', await page.evaluate(() => { App.showView('ladder'); document.querySelector('[data-file="I"]').click(); return !!document.querySelector('#view-ladder .io-row.ana [data-word="I:3.0"]'); }));
  check('Verify: an analog address on a digital card is an error', await page.evaluate(() => { const r = Circuit.ioCheck(PLCcore.parse('I:1.0'), App.project.circuit, App.project.io); return !!r && r.msg.includes('analog'); }));
  await part('S1', 'knob', 'down'); await setMode('PROG');
  await page.evaluate(() => App.openNew(Examples.EX.plcmotor.build()));

  console.log('v1.8: Tagalog / English');
  await page.click('[data-lang-btn]'); await wait(200);
  check('the language button switches the menus to Tagalog', await page.evaluate(() => I18N.lang === 'tl' && document.querySelector('[data-examples]').textContent === 'Mga Halimbawa ▾' && document.querySelector('[data-lang-btn]').textContent === 'TL'));
  await page.evaluate(() => App.showView('wiring')); await wait(150);
  check('views drawn later are translated too (Wiring search box, buttons)', await page.evaluate(() => document.querySelector('#view-wiring .ws-search').placeholder === 'Maghanap ng piyesa…' && [...document.querySelectorAll('#view-wiring button')].some(b => b.textContent.trim() === '⊟ Isara lahat')));
  await page.click('[data-lang-btn]'); await wait(200);
  check('switching back restores English', await page.evaluate(() => I18N.lang === 'en' && document.querySelector('[data-examples]').textContent === 'Examples ▾' && document.querySelector('#view-wiring .ws-search').placeholder === 'Search components…'));

  console.log('v2.0 part A: controller tags, organizer, periodic task');
  await page.evaluate(() => {
    App.openNew({ name: 'Tags', target: 'tag', tags: [{ name: 'start_pb', type: 'ALIAS', addr: 'I:0/0' }, { name: 'MOTOR', type: 'ALIAS', addr: 'O:0/0', desc: 'Main motor' }, { name: 'RUN_T', type: 'TIMER', addr: 'T4:31' }, { name: 'PARTS', type: 'COUNTER' }, { name: 'B3', type: 'BOOL' }, { name: 'BAD', type: 'ALIAS', addr: 'X:9' }, { name: 'SEEN', type: 'BOOL' }],
      ladder: { rungs: [{ text: 'XIC START_PB TON RUN_T 1.0 1 0' }, { text: 'XIC RUN_T.DN OTE MOTOR' }, { text: 'XIC START_PB OTE SEEN' }],
        files: [{ n: 3, name: 'tick', period: 100, rungs: [{ text: 'ADD N7:0 1 N7:0' }] }] } });
    App.setLayout('single'); App.showView('ladder');
  }); await wait(200);
  check('tags are cleaned on load: names upper case, bad names and aliases dropped, base tags get an address', await page.evaluate(() => { const t = App.project.tags; return t.map(x => x.name).join() === 'START_PB,MOTOR,RUN_T,PARTS,SEEN' && t.find(x => x.name === 'PARTS').addr === 'C5:31' && t.find(x => x.name === 'SEEN').addr === 'B3:31/15'; }));
  check('the ladder shows tag names and the tag description', await page.evaluate(() => { const t = [...document.querySelectorAll('#view-ladder .addr')].map(x => x.textContent); return t.includes('START_PB') && t.includes('MOTOR') && t.includes('RUN_T.DN') && [...document.querySelectorAll('#view-ladder .desc')].some(x => x.textContent === 'Main motor'); }));
  check('a program written with tags verifies', await page.evaluate(() => Ladder.verify(true)));
  await page.evaluate(() => { App.plc.write('N7:0', 0); App.setMode('RUN'); App.force('I:0/0', 1); window._t0 = performance.now(); }); await wait(1500);
  check('tags run like their addresses: alias input, timer members, alias output', await page.evaluate(() => App.plc.read('O:0/0') === 1 && App.plc.read('RUN_T.DN') === 1 && App.plc.read('SEEN') === 1 && App.plc.read('B3:31/15') === 1));
  check('a periodic task (LAD 3 every 100 ms) runs on its own, about 10 times a second', await page.evaluate(() => { const n = App.plc.read('N7:0'), want = (performance.now() - window._t0) / 100; return n >= want * 0.6 && n <= want * 1.4; }));
  await page.evaluate(() => { App.force('I:0/0', null); App.setMode('PROG'); });
  await page.click('#view-ladder [data-act="tags"]'); await wait(200);
  check('Controller Tags lists every tag with its address', await page.evaluate(() => document.querySelectorAll('.tag-tbl [data-tedit]').length === 5));
  await page.click('.modal-foot button:has-text("New tag")'); await wait(100);
  await page.fill('#f_name', 'level_sp'); await page.selectOption('#f_type', 'INT'); await page.click('.modal-wrap:last-child .btn.primary'); await wait(200);
  check('a new INT tag gets a free N7 word from the top', await page.evaluate(() => { const t = App.project.tags.find(x => x.name === 'LEVEL_SP'); return !!t && t.addr === 'N7:31'; }));
  await page.evaluate(() => document.querySelectorAll('.modal-wrap').forEach(m => m.remove()));
  await page.evaluate(() => { const t = App.project.tags.find(x => x.name === 'MOTOR'); App.tagsDialog(); }); await wait(100);
  await page.click('.tag-tbl [data-tedit="1"]'); await wait(100);
  await page.fill('#f_name', 'PUMP'); await page.click('.modal-wrap:last-child .btn.primary'); await wait(200);
  check('renaming a tag renames it in the program', await page.evaluate(() => App.serialize().ladder.rungs[1].text === 'XIC RUN_T.DN OTE PUMP'));
  await page.evaluate(() => document.querySelectorAll('.modal-wrap').forEach(m => m.remove()));
  await page.click('#view-ladder [data-act="org"]'); await wait(150);
  check('the Controller Organizer shows MainTask, MainProgram, MainRoutine and the periodic task', await page.evaluate(() => { const t = document.querySelector('.org').textContent; return t.includes('MainTask') && t.includes('MainProgram') && t.includes('MainRoutine') && t.includes('PeriodicTask 3') && t.includes('every 100 ms'); }));
  await page.selectOption('[data-per="3"]', '0'); await wait(150);
  check('a routine can be switched from periodic to called by JSR', await page.evaluate(() => App.project.ladder.files[0].period === 0 && !App.plc.periodic[3]));
  await page.evaluate(() => { document.querySelector('#view-ladder [data-lorg]').hidden = true; document.querySelectorAll('.modal-wrap').forEach(m => m.remove()); App.openNew(Examples.EX.plcmotor.build()); });

  console.log('v2.0 part B: Go Online, Download / Upload, Compare, online edits');
  await page.evaluate(() => { App.openNew({ name: 'Comms', ladder: { rungs: [{ text: 'XIC B3:0/0 OTE B3:0/1' }] } }); App.setLayout('single'); App.showView('ladder'); }); await wait(150);
  check('Simple connection by default: no online chip, no edit banner on screen', await page.evaluate(() => document.querySelector('[data-conn]').hidden && document.querySelector('#view-ladder .lad-comm-real').hidden && getComputedStyle(document.querySelector('#view-ladder [data-lbanner]')).display === 'none'));
  await page.selectOption('#view-ladder [data-cmode]', 'real'); await wait(150);
  check('Realistic: starts OFFLINE with the project as the controller program', await page.evaluate(() => document.querySelector('[data-conn]').textContent === 'OFFLINE' && !document.querySelector('#view-ladder .lad-comm-real').hidden));
  const addRung = t => page.evaluate(t => { App.project.ladder.rungs.push(Ladder.newRung(Ladder.parseRung(t))); App.programChanged(); Ladder.render(); }, t);
  await addRung('XIC B3:0/0 OTE B3:0/2');
  await page.evaluate(() => { App.setMode('RUN'); App.plc.write('B3:0/0', 1); }); await wait(200);
  check('offline, an edit changes the project only: the controller still runs its program', await page.evaluate(() => App.plc.read('B3:0/1') === 1 && App.plc.read('B3:0/2') === 0 && document.querySelector('[data-conn]').textContent.includes('project ≠ controller')));
  await page.click('#view-ladder [data-act="online"]'); await wait(150);
  check('Go Online with a different program asks: Download / Compare (no Upload in the trainer)', await page.evaluate(() => [...document.querySelectorAll('.modal-foot button')].map(b => b.textContent).join() === 'Compare…,Cancel,Download'));
  await page.click('.modal-foot button:has-text("Compare")'); await wait(150);
  check('Compare lists the rung that differs', await page.evaluate(() => [...document.querySelectorAll('.modal .io-cfg td')].some(td => td.textContent === 'LAD 2 rung 0001') && [...document.querySelectorAll('.modal code')].some(c => c.textContent === 'XIC B3:0/0 OTE B3:0/2')));
  await page.evaluate(() => document.querySelectorAll('.modal-wrap')[1].remove());
  await page.click('.modal-foot button:has-text("Download")'); await wait(150);
  check('Download in RUN warns that the mode will be changed to Remote Program prior to download', await page.evaluate(() => /Remote Run mode\. The mode will be changed to Remote Program prior to download/.test([...document.querySelectorAll('.modal-wrap')].pop().textContent)));
  await page.click('.modal-wrap:last-child .modal-foot button:has-text("Download")'); await wait(200);
  check('the download changed the controller to PROG by itself and went online', await page.evaluate(() => App.plc.mode === 'PROG' && App.conn.online));
  await page.evaluate(() => { App.setMode('RUN'); App.plc.write('B3:0/0', 1); }); await wait(200);
  check('after the download the controller runs the new program and is ONLINE', await page.evaluate(() => App.plc.read('B3:0/2') === 1 && document.querySelector('[data-conn]').textContent === 'ONLINE' && App.conn.online));
  await addRung('XIC B3:0/0 OTE B3:0/3'); await wait(150);
  check('online in RUN an edit is pending (banner), the controller does not run it yet', await page.evaluate(() => !document.querySelector('#view-ladder [data-lbanner]').hidden && App.plc.read('B3:0/3') === 0 && document.querySelector('[data-conn]').textContent.includes('edits pending')));
  await page.click('#view-ladder [data-lbanner] [data-act="test"]'); await wait(200);
  check('Test edits runs the edited program', await page.evaluate(() => App.plc.read('B3:0/3') === 1 && document.querySelector('[data-conn]').textContent.includes('testing')));
  await page.click('#view-ladder [data-lbanner] [data-act="assemble"]'); await wait(150);
  check('Assemble keeps the edits in the controller', await page.evaluate(() => App.conn.same && document.querySelector('#view-ladder [data-lbanner]').hidden && document.querySelector('[data-conn]').textContent === 'ONLINE'));
  await addRung('XIC B3:0/0 OTE B3:0/4'); await wait(100);
  await page.click('#view-ladder [data-lbanner] [data-act="cancel"]'); await wait(150);
  check('Cancel edits puts the project back to the controller program', await page.evaluate(() => App.project.ladder.rungs.length === 3 && App.conn.same));
  await page.evaluate(() => { App.setMode('PROG'); App.goOnline(); }); await wait(100);
  await addRung('XIC B3:0/0 OTE B3:0/5');
  check('offline again, Upload only says it is not available in the trainer (the project keeps its edit)', await page.evaluate(() => { App.upload(); const ok = /not available in the trainer/.test(document.querySelector('.modal-body').textContent) && App.project.ladder.rungs.length === 4 && !App.conn.online; document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); return ok; }));
  check('the connection mode and the controller program are saved with the project', await page.evaluate(() => { const s = App.serialize(); const b = App.buildProject(s); return s.conn.mode === 'real' && JSON.parse(b.conn.ctl).main.length === 3; }));
  await page.evaluate(() => { App.setMode('PROG'); App.openNew(Examples.EX.plcmotor.build()); });

  console.log('v2.0 part C: simulated network, MSG, produced / consumed');
  await page.evaluate(() => {
    App.openNew({ name: 'Net', net: { remotes: [{ node: 2, name: 'filler', data: [5, 6, 7, 8] }, { node: 2, name: 'dup' }, { node: 12, name: 'bad' }], links: [{ dir: 'consume', node: 2, remote: 0, local: 20, n: 2 }, { dir: 'produce', node: 2, remote: 10, local: 0, n: 1 }, { dir: 'consume', node: 5, remote: 0, local: 0, n: 1 }] },
      ladder: { rungs: [{ text: 'XIC B3:0/0 MSG READ #N7:10 2 #N7:0 4 R6:1' }, { text: 'XIC B3:0/1 MSG WRITE #N7:4 2 #N7:20 2 R6:2' }, { text: 'XIC B3:0/2 MSG READ #N7:12 7 #N7:0 1 R6:3' }] } });
    App.setLayout('single'); App.showView('ladder');
  }); await wait(150);
  check('the network is cleaned on load (one node 2, links to missing nodes dropped)', await page.evaluate(() => { const n = App.project.net; return n.remotes.length === 1 && n.remotes[0].name === 'FILLER' && n.links.length === 2; }));
  check('MSG verifies (READ / WRITE, files, node, control)', await page.evaluate(() => Ladder.verify(true)));
  await page.evaluate(() => { App.setMode('RUN'); App.plc.write('N7:0', 99); App.plc.write('N7:4', 41); App.plc.write('N7:5', 42); App.plc.write('B3:0/0', 1); App.plc.write('B3:0/1', 1); App.plc.write('B3:0/2', 1); }); await wait(400);
  check('MSG READ copies remote words into the local file and sets DN', await page.evaluate(() => [10, 11, 12, 13].map(i => App.plc.read('N7:' + i)).join() === '5,6,7,8' && App.plc.read('R6:1/DN') === 1));
  check('MSG WRITE puts local words into the remote PLC', await page.evaluate(() => { const d = App.project.net.remotes[0].data; return d[20] === 41 && d[21] === 42 && App.plc.read('R6:2/DN') === 1; }));
  check('MSG to a node that is not there sets ER', await page.evaluate(() => App.plc.read('R6:3/ER') === 1 && App.plc.read('R6:3/DN') === 0));
  check('consumed words are copied in every scan, produced words go out', await page.evaluate(() => App.plc.read('N7:20') === 5 && App.plc.read('N7:21') === 6 && App.project.net.remotes[0].data[10] === 99));
  await page.click('#view-ladder [data-act="network"]'); await wait(150);
  check('Network shows Who Active with this computer, the controller and the remote PLC', await page.evaluate(() => { const t = document.querySelector('.modal .io-cfg').textContent; return t.includes('This computer') && t.includes('192.168.1.11') && t.includes('Remote PLC FILLER') && t.includes('192.168.1.12'); }));
  await page.fill('.modal [data-rw="2:3"]', '77'); await page.dispatchEvent('.modal [data-rw="2:3"]', 'change'); await wait(100);
  check('a remote word can be edited in the Network window', await page.evaluate(() => App.project.net.remotes[0].data[3] === 77));
  await page.click('.modal [data-radd]'); await wait(100); await page.click('.modal-wrap:last-child .btn.primary'); await wait(150);
  check('a remote PLC can be added (next free node)', await page.evaluate(() => App.project.net.remotes.some(r => r.node === 3)));
  await page.evaluate(() => { document.querySelectorAll('.modal-wrap').forEach(m => m.remove()); App.setMode('PROG'); App.openNew(Examples.EX.plcmotor.build()); });

  console.log('v1.4 part 2: four workspaces');
  check('the Operator Panel is gone', !(await page.$('#view-panel')) && !(await page.$('.tabs [data-view="panel"]')) && !(await page.evaluate(() => 'PanelView' in window)));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.view', 'panel'); localStorage.setItem('plc-trainer.layout', 'wp'); localStorage.setItem('plc-trainer.floats', '[["panel",{"x":10,"y":10,"w":300,"h":200}]]'); });
  await page.reload(); await wait(800);
  check('a saved Panel view opens the Wiring, an old Wiring + Panel layout becomes Wiring + HMI', await page.evaluate(() => App.view === 'wiring' && App.layout === 'wh' && !document.querySelector('.float-win')));
  await page.evaluate(() => { App.setLayout('single'); App.showView('wiring'); });
  check('terminals are drawn as screw heads', await page.evaluate(() => document.querySelector('.ws-svg .comps .term').querySelectorAll('line').length === 2));

  console.log('v2.0.1: accuracy fixes');
  check('DIV rounds a half away from zero (-5 / 2 = -3, 5 / 2 = 3, 7 / 2 = 4)', await page.evaluate(() => {
    const run = t => { const e = new PLCcore.Engine(); e.setProgram([Ladder.newRung(Ladder.parseRung(t))]); e.setMode('RUN'); e.scan(0.02); return e.read('N7:0'); };
    return run('DIV -5 2 N7:0') === -3 && run('DIV 5 2 N7:0') === 3 && run('DIV 7 2 N7:0') === 4 && run('DIV -7 3 N7:0') === -2;
  }));
  check('Verify rejects file instructions that run past the end of their file', await page.evaluate(() => {
    const e = new PLCcore.Engine(), v = t => e.verify([Ladder.newRung(Ladder.parseRung(t))]).errs.filter(x => x.msg.includes('runs past the end')).length;
    return v('XIC I:0/0 COP #N7:30 #N7:0 4') === 1 && v('XIC I:0/0 COP #N7:0 #N7:28 4') === 0 && v('XIC I:0/0 FLL 0 #N7:29 4') === 1 &&
      v('XIC I:0/0 SQO #N7:28 -1 O:0 R6:0 4 0') === 1 && v('XIC I:0/0 SQO #N7:27 -1 O:0 R6:0 4 0') === 0;
  }));
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }), f = add('mcb1', { label: 'QF1' }, { on: true }), r = add('rcd', { label: 'FI1' }, { on: true }), h = add('lamp', { label: 'H1', coil: '230VAC' });
    w(q, 'L', f, '1'); w(f, '2', r, '1'); w(q, 'N', r, '3'); w(r, '2', h, 'X1'); w(h, 'X2', q, 'PE');
    App.openNew({ name: 'Earth leakage', circuit: circ });`));
  await wait(400);
  check('a lamp fed from L to PE leaks to earth: the RCD in front of it trips, the MCB stays on', (await get('FI1', 'state.tripped')) && !(await get('QF1', 'state.tripped')) && !(await get('H1', 'state.on')) && await page.evaluate(() => App.events().some(e => e.msg.includes('earth leakage through H1'))));
  await build(new Function(kit + `
    const q = add('supply1', { label: 'Q0' }), f = add('mcb1', { label: 'QF1' }, { on: true }), h = add('lamp', { label: 'H1', coil: '230VAC' });
    w(q, 'L', f, '1'); w(f, '2', h, 'X1'); w(h, 'X2', q, 'PE');
    App.openNew({ name: 'Earth leakage, no RCD', circuit: circ });`));
  await wait(400);
  check('without an RCD the leaking lamp stays on and a warning says so', (await get('H1', 'state.on')) && !(await get('QF1', 'state.tripped')) && await page.evaluate(() => App.events().some(e => e.msg.includes('no RCD protects it'))));

  console.log('v2.1: lessons with live checklists');
  check('lessons 13-16 exist and lessons 8-16 have a live checklist', await page.evaluate(() => ['l13', 'l14', 'l15', 'l16'].every(id => Examples.LESSONS.some(l => l.id === id)) &&
    ['l8', 'l9', 'l10', 'l11', 'l12', 'l13', 'l14', 'l15', 'l16'].every(id => Examples.LESSONS.find(l => l.id === id).goals.length >= 3)));
  await page.evaluate(() => App.showView('learn'));
  await page.click('#view-learn [data-lesson="l8"]');
  await page.click('#view-learn [data-load="dol"]'); await wait(300);
  check('lesson 8: the checklist starts at step 1', await page.evaluate(() => App.lessonGoals().id === 'l8' && App.lessonGoals().done === 0));
  await tap('S1'); await wait(400);
  check('lesson 8: pressing START ticks off the seal-in step live', await page.evaluate(() => App.lessonGoals().done === 1 && App.events().some(e => e.msg.includes('✓ Press START'))));
  await page.evaluate(() => App.showView('learn'));
  check('the Learn view shows the checklist with the done step', await page.evaluate(() => { const li = document.querySelectorAll('#view-learn [data-goals] li'); return li.length === 4 && li[0].classList.contains('ok') && li[1].classList.contains('next'); }));
  check('lesson 12: the forward/reverse example is interlocked in the wiring and in the ladder', await page.evaluate(() => {
    App.openNew(Examples.EX.fwdrev.build());
    const g = Examples.LESSONS.find(l => l.id === 'l12').goals, G = App.goalApi();
    return g[3].ok(G) && g[4].ok(G);
  }));
  check('lesson 12: without the N.C. 21-22 wires the interlock check fails', await page.evaluate(() => {
    const C = App.project.circuit, km = C.comps.filter(c => c.type === 'contactor').map(c => c.id);
    C.wires = C.wires.filter(w => !km.some(id => [w.a, w.b].some(k => k === id + ':21' || k === id + ':22')));
    return !Examples.LESSONS.find(l => l.id === 'l12').goals[3].ok(App.goalApi());
  }));
  check('lesson 13: a card in slot 3 that is not configured is a CPU fault step', await page.evaluate(() => {
    App.openNew(Examples.EX.rack.build());
    const g = Examples.LESSONS.find(l => l.id === 'l13').goals, before = g[1].ok(App.goalApi());
    const c = Circuit.create('mdo8', 0, 0, App.project.circuit); c.props.slot = '3'; App.project.circuit.comps.push(c);
    return !before && g[1].ok(App.goalApi());
  }));

  console.log('v2.1.1: full audit fixes');
  // PLC engine
  check('periodic task timers count with the task period, not the scan time', await page.evaluate(() => { const R = s => Ladder.newRung(Ladder.parseRung(s)); const mk = per => { const e = new PLCcore.Engine(); e.setProgram([R('XIC I:0/0 OTE O:0/0')], { 3: [R('TON T4:1 0.01 10000 0')] }, { 3: per }); e.data.T4[1].base = 0.01; e.data.T4[1].PRE = 10000; e.setMode('RUN'); for (let i = 0; i < 10; i++) e.scan(0.1); return e.data.T4[1].ACC; }; return mk(10) === 100 && mk(1000) === 100; }));
  check('verify finds duplicate OTE and shared timer through tags', await page.evaluate(() => { PLCcore.setTags([{ name: 'MOTOR', type: 'ALIAS', addr: 'O:0/0' }, { name: 'TMR', type: 'TIMER', addr: 'T4:31' }]); const R = s => Ladder.newRung(Ladder.parseRung(s)); const w = new PLCcore.Engine().verify([R('XIC I:0/0 OTE O:0/0'), R('XIC I:0/1 OTE MOTOR'), R('XIC I:0/2 TON TMR 1.0 5 0'), R('XIC I:0/3 TON T4:31 1.0 5 0')]).warns.map(x => x.msg); PLCcore.setTags(App.project.tags); return w.some(m => /Duplicate OTE O:0\/0/.test(m)) && w.some(m => /T4:31 is used by 2 timer/.test(m)); }));
  check('forcing an alias tag stores one force at the address', await page.evaluate(() => { PLCcore.setTags([{ name: 'MOTOR', type: 'ALIAS', addr: 'O:0/0' }]); const e = new PLCcore.Engine(); e.setForce('MOTOR', 1); const a = JSON.stringify(e.forces) === '{"O:0/0":1}'; e.setForce('O:0/0', 0); const b = e.forceCount() === 1 && e.forces['O:0/0'] === 0; e.setForce('MOTOR', null); const c = e.forceCount() === 0; PLCcore.setTags(App.project.tags); return a && b && c; }));
  check('read/write of non-data addresses is 0 / no-op and does not throw', await page.evaluate(() => { const e = new PLCcore.Engine(); try { e.write('U:3', 1); e.write('T4:0', 1); e.write('#N7:0', 1); return e.read('U:3') === 0 && e.read('T4:0') === 0 && e.read('#N7:0') === 0 && e.read('5') === 5; } catch (x) { return false; } }));
  check('verify checks JSR targets against the given program files', await page.evaluate(() => { const R = s => Ladder.newRung(Ladder.parseRung(s)); const e = new PLCcore.Engine(); e.setProgram([]); const r = [R('XIC I:0/0 JSR U:3')]; return e.verify(r, [3]).errs.length === 0 && e.verify(r, []).errs.length === 1; }));
  check('CTD back across overflow clears OV; CTU back across underflow clears UN', await page.evaluate(() => { const R = s => Ladder.newRung(Ladder.parseRung(s)); const e = new PLCcore.Engine(); e.setProgram([R('XIC I:0/0 CTU C5:0 10 0'), R('XIC I:0/1 CTD C5:0 10 0')]); e.setMode('RUN'); const c = e.data.C5[0]; const pulse = bit => { e.physIn = 1 << bit; e.scan(0.02); e.physIn = 0; e.scan(0.02); }; c.ACC = 32767; pulse(0); const ov = c.ACC === -32768 && c.OV === 1; pulse(1); const back = c.ACC === 32767 && c.OV === 0 && c.UN === 0; c.ACC = -32768; pulse(1); const un = c.UN === 1; pulse(0); return ov && back && un && c.UN === 0 && c.OV === 0; }));
  // circuit
  const solveKit = `const circ = { comps: [], wires: [], seq: 0 };
    const add = (t, props = {}, state = {}) => { const c = Circuit.create(t, 0, 0, circ); Object.assign(c.props, props); Object.assign(c.state, state); circ.comps.push(c); return c; };
    const w = (a, ta, b, tb) => { circ.seq++; circ.wires.push({ id: 'w' + circ.seq, a: a.id + ':' + ta, b: b.id + ':' + tb, pts: [] }); };
    const ctx = { plcId: null, rack: Circuit.rack(circ, { slots: {} }), plcOut: 0, plcOutX: new Array(64).fill(0), plcInX: new Array(64).fill(0) };
    const run = (n = 6) => { const all = []; for (let i = 0; i < n; i++) all.push(...Circuit.solve(circ, 0.1, ctx).alerts.map(a => a.msg)); return all; };`;
  check('a short before any breaker trips nothing downstream and says so', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), f = add('mcb1', {}, { on: true }), h = add('lamp', { coil: '230VAC' });
    w(q, 'L', q, 'N'); w(q, 'L', f, '1'); w(f, '2', h, 'X1'); w(h, 'X2', q, 'N');
    const a = run(); return !f.state.tripped && a.some(m => m.includes('before any breaker'));`)));
  check('a VFD output keeps its rotation whatever the input phase order, and needs all three phases', await page.evaluate(new Function(solveKit + `
    const t = swap => { circ.comps.length = 0; circ.wires.length = 0; const q = add('supply3'), g = add('psu24'), v = add('vfd', { hz: 50 }), m = add('motor');
      w(q, swap ? 'L2' : 'L1', v, 'L1'); w(q, swap ? 'L1' : 'L2', v, 'L2'); w(q, 'L3', v, 'L3'); w(q, 'L1', g, 'L'); w(q, 'N', g, 'N'); w(g, 'P1', v, 'FWD'); w(g, 'M1', v, 'DCOM');
      ['U', 'V', 'W'].forEach((o, i) => w(v, o, m, ['U1', 'V1', 'W1'][i])); for (let i = 0; i < 40; i++) Circuit.solve(circ, 0.1, ctx); return m.state; };
    const a = t(false), b = t(true); return a.drive === 'run' && b.drive === 'run' && a.dir === b.dir;`)));
  check('a 24 V supply fed L to PE behind an RCD trips the RCD (earth leakage)', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), r = add('rcd', {}, { on: true }), g = add('psu24');
    w(q, 'L', r, '1'); w(q, 'N', r, '3'); w(r, '2', g, 'L'); w(g, 'N', q, 'PE'); run(); return r.state.tripped;`)));
  check('a borrowed neutral (load returns to N around the RCD) trips the RCD', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), r = add('rcd', {}, { on: true }), h = add('lamp', { coil: '230VAC' });
    w(q, 'L', r, '1'); w(q, 'N', r, '3'); w(r, '2', h, 'X1'); w(h, 'X2', q, 'N'); run(); return r.state.tripped;`)));
  check('0 V tied to N is not a short', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), f = add('mcb2', {}, { on: true }), g = add('psu24');
    w(q, 'L', f, '1'); w(q, 'N', f, '3'); w(f, '2', g, 'L'); w(f, '4', g, 'N'); w(g, 'M1', q, 'N'); run(); return !f.state.tripped && g.state.ok;`)));
  check('a jammed DC motor trips its motor protection breaker', await page.evaluate(new Function(solveKit + `
    const b = add('battery'), qm = add('mpcb', { trip: 0.2 }, { on: true }), m = add('motordc', {}, { jam: true });
    w(b, 'P', qm, '1'); w(qm, '2', m, 'A1'); w(m, 'A2', b, 'M'); for (let i = 0; i < 40; i++) Circuit.solve(circ, 0.1, ctx); return qm.state.tripped;`)));
  check('one overloaded motor among 200 feeders keeps the solver fast', await page.evaluate(new Function(solveKit + `
    const q = add('supply3');
    for (let i = 0; i < 200; i++) { const o = add('olr'), m = add('motor'); w(q, 'L1', o, '1'); w(q, 'L2', o, '3'); if (i) w(q, 'L3', o, '5'); w(o, '2', m, 'U1'); w(o, '4', m, 'V1'); w(o, '6', m, 'W1'); }
    run(2); const t0 = performance.now(); run(5); return (performance.now() - t0) / 5 < 40;`)));
  // app
  check('a controller snapshot with bad tags and markup is cleaned on load', await page.evaluate(() => {
    const p = App.buildProject({ name: 'x', conn: { mode: 'real', ctl: JSON.stringify({ main: [], files: [{ n: '3"><img src=x>', name: 'X', period: '<img>', r: [] }], tags: [{ name: 5 }, { name: 'T1', type: '<img>', addr: 'B3:0/0' }] }) } });
    const o = JSON.parse(p.conn.ctl); return o.files.length === 0 && o.tags.length === 0;
  }));
  check('ids and counters from a file stay exact (no 1e21 ids, no duplicates)', await page.evaluate(() => {
    const p = App.buildProject({ name: 'x', circuit: { seq: 1e21, comps: [{ id: 'c1', type: 'lamp' }, { id: 'c1', type: 'lamp' }, { id: 'c' + '9'.repeat(30), type: 'lamp' }], wires: [] }, events: [{ t: 1, kind: 'constructor', msg: 'x' }] });
    return p.circuit.comps.length === 1 && p.circuit.seq === 1 && p.events.length === 0;
  }));

  // diagram, HMI, wiring
  await page.evaluate(() => App.showView('schematic'));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'free'); }); await page.click('#view-schematic [data-sstyle="free"]');
  await page.evaluate(() => { App.openNew({ name: 'T1' }); App.showView('schematic'); const C = App.project.circuit; C.comps.push(Circuit.create('supply1', 0, 0, C)); FreeDraw.add('pL1', 'XP1', 0, -100); FreeDraw.add('pbnc', 'S1', 0, 0); FreeDraw.add('lamp', 'H1', 0, 100); FreeDraw.add('pN', 'XP2', 0, 200); const F = App.project.schematic.free, [pl, pb, la, pn] = F.items; F.wires.push({ id: 'fw90', a: pl.id + ':J', b: pb.id + ':11' }, { id: 'fw91', a: pb.id + ':12', b: la.id + ':X1' }, { id: 'fw92', a: la.id + ':X2', b: pn.id + ':J' }); Schematic.sync(); Schematic.render(); }); await wait(200);
  await (await page.$('#view-schematic [data-fi="d2"] .hit')).click(); await wait(100);
  check('free draw: Type ⇄ retypes the device the diagram made for this symbol, and its wires follow (11-12 → 21-22)', await page.evaluate(() => { FreeDraw.cycleType(); FreeDraw.cycleType(); FreeDraw.cycleType(); const F = App.project.schematic.free, C = App.project.circuit, it = F.items.find(i => i.id === 'd2'), d = C.comps.find(c => c.props.label === 'S1'); const p = App.buildProject(JSON.parse(JSON.stringify(App.project))); return it.k === 'lsnc' && d.type === 'limit' && FreeDraw.errs.size === 0 && F.wires.some(w => w.b === 'd2:21') && F.wires.some(w => w.a === 'd2:22') && C.wires.filter(w => w.sch).length === 5 && p.schematic.free.wires.length === 3; }));
  check('free draw: Type ⇄ on a device other symbols use gives this symbol a new tag', await page.evaluate(() => { const F = App.project.schematic.free; F.items.push({ id: 'd50', k: 'lsnc', tag: 'S1', x: 300, y: 0, r: 0 }); Schematic.sync(); FreeDraw.cycleType(); const it = F.items.find(i => i.id === 'd2'); return it.k === 'pbconc' && it.tag !== 'S1' && App.project.circuit.comps.find(c => c.props.label === 'S1').type === 'limit' && FreeDraw.errs.size === 0; }));
  check('a device terminal used by both the current paths and the free drawing is reported in the free drawing and not wired twice', await page.evaluate(() => { App.openNew(Examples.EX.stardelta.build()); const s = App.project.schematic; s.free.items.push({ id: 'd1', k: 'kmno', tag: 'KM1', x: 0, y: 0, r: 0 }, { id: 'd2', k: 'lamp', tag: 'H9', x: 0, y: 100, r: 0 }); s.free.wires.push({ id: 'fw1', a: 'd1:14', b: 'd2:X1' }); Schematic.sync(); const C = App.project.circuit, h9 = C.comps.find(c => c.props.label === 'H9'); return [...FreeDraw.errs.values()].some(m => m.includes('KM1') && m.includes('current paths')) && Schematic.errs.size === 0 && !C.wires.some(w => [w.a, w.b].includes(h9.id + ':X1')); }));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); }); await page.click('#view-schematic [data-sstyle="iec"]'); await wait(200);
  check('in the IEC view the same clash is reported on the current path instead', await page.evaluate(() => { Schematic.sync(); return [...Schematic.errs.values()].some(m => m.includes('KM1') && m.includes('free drawing')) && FreeDraw.errs.size === 0; }));
  await page.evaluate(() => { App.openNew(Examples.EX.stardelta.build()); App.showView('schematic'); }); await wait(300);
  await (await page.$('#view-schematic [data-pp="f.0.0"] .hit')).click(); await page.evaluate(() => Schematic.insert('lamp', 'H5')); await page.keyboard.press('Delete'); await wait(150);
  check('Delete after adding a control symbol deletes that symbol, not the power device selected before', await page.evaluate(() => App.project.schematic.power.feeders[0].elems.length === 3 && !JSON.stringify(App.project.schematic.rungs).includes('"H5"')));
  check('Undo clears the power selection: Delete after Undo does not throw', await page.evaluate(() => { App.openNew(Examples.EX.stardelta.build()); App.showView('schematic'); Schematic.addFeeder(); Schematic.insertPower('km3', 'KM7'); Schematic.undo(); Schematic.undo(); try { Schematic.del(); return App.project.schematic.power.feeders.length === 1; } catch (e) { return false; } }));
  check('a diagram wire keeps its id, bends, marker and user colour when the diagram changes', await page.evaluate(() => { App.openNew(Examples.EX.stardelta.build()); const C = App.project.circuit, w = C.wires.find(x => x.sch); w.pts = [[10, 10]]; w.color = '#f39c1e'; w.tag = '101'; const w0 = C.wires.filter(x => x.sch && x !== w)[3], c0 = w0.color; Schematic.addRung(); const w2 = App.project.circuit.wires.find(x => x.id === w.id), w3 = App.project.circuit.wires.find(x => x.id === w0.id); return !!w2 && w2.sch && w2.pts.length === 1 && w2.color === '#f39c1e' && w2.tag === '101' && !!w3 && w3.color === c0; }));
  await page.evaluate(() => { App.openNew(Examples.EX.stardelta.build()); App.showView('wiring'); }); await wait(600);
  const swPt = await page.evaluate(() => { for (const w of App.project.circuit.wires.filter(w => w.sch)) { const g = document.querySelector(`.wire[data-wid="${w.id}"] .wh`); if (!g) continue; const q = g.getPointAtLength(g.getTotalLength() / 2), m = g.getScreenCTM(), x = q.x * m.a + q.y * m.c + m.e, y = q.x * m.b + q.y * m.d + m.f; const h = document.elementFromPoint(x, y); if (h && h.closest('.wire') && h.closest('.wire').dataset.wid === w.id) return { x, y }; } });
  const swN = await page.evaluate(() => [App.project.circuit.comps.length, App.project.circuit.wires.length]);
  await page.mouse.click(swPt.x, swPt.y, { button: 'right' }); await wait(150); await page.click('text=Start a new wire from here'); await wait(150);
  check('a wire made by the Electrical Diagram is not split in the Wiring', await page.evaluate(n => App.project.circuit.comps.length === n[0] && App.project.circuit.wires.length === n[1] && document.body.textContent.includes('comes from the Electrical Diagram'), swN));
  await page.keyboard.press('Escape');
  check('one tag used for two kinds is reported on the first sync, and no wire goes to a terminal the device lacks', await page.evaluate(() => { App.openNew({ name: 'T7' }); const C = App.project.circuit; C.comps.push(Circuit.create('psu24', 0, 0, C)); App.project.schematic.rungs = [{ elems: [{ k: 'pbno', tag: 'X1' }, { k: 'kmcoil', tag: 'X1' }], comment: '' }]; Schematic.sync(); const D = Circuit.DEFS, P = App.project.circuit; return !P.wires.some(w => [w.a, w.b].some(k => { const [id, t] = k.split(':'); const c = P.comps.find(c => c.id === id); return !c || !D[c.type].terms.some(x => x.id === t); })) && [...Schematic.errs.values()].some(m => m.includes('X1')); }));
  check('a power supply tag that is not a 3-phase supply is reported and the power circuit is not wired', await page.evaluate(() => { App.openNew({ name: 'T8' }); const C = App.project.circuit, q = Circuit.create('mccb3', 0, 0, C); q.props.label = 'Q0'; C.comps.push(q); Schematic.insertPower('km3', 'KM1'); return [...Schematic.perrs.values()].some(m => m.includes('Q0') && m.includes('3-Phase Supply')) && !App.project.circuit.wires.some(w => w.sch); }));
  await page.evaluate(() => { App.openNew(Examples.EX.stardelta.build()); App.showView('wiring'); Workspace.selectComp(App.project.circuit.comps.find(c => c.props.label === 'KM1').id); }); await wait(300);
  await page.fill('[data-pk="label"]', 'KM2'); await page.dispatchEvent('[data-pk="label"]', 'change'); await wait(100);
  check('a device tag already used by another device is refused', await page.evaluate(() => App.project.circuit.comps.filter(c => c.props.label === 'KM2').length === 1 && App.project.circuit.comps.some(c => c.props.label === 'KM1')));
  await page.fill('[data-pk="label"]', ''); await page.dispatchEvent('[data-pk="label"]', 'change'); await wait(100);
  check('an empty device tag is refused', await page.evaluate(() => App.project.circuit.comps.some(c => c.props.label === 'KM1')));
  const nComps = await page.evaluate(() => App.project.circuit.comps.length);
  await page.fill('[data-pk="label"]', 'KM9'); await page.dispatchEvent('[data-pk="label"]', 'change'); await wait(200);
  check('renaming a device the diagram uses renames its symbols too (no new device, wires kept)', await page.evaluate(n => { const s = JSON.stringify(App.project.schematic), km = App.project.circuit.comps.find(c => c.props.label === 'KM9'); return !s.includes('"KM1"') && s.includes('"KM9"') && App.project.circuit.comps.length === n && App.project.circuit.wires.some(w => w.sch && w.a.startsWith(km.id + ':')) && Schematic.errs.size === 0; }, nComps));
  await page.evaluate(() => { App.openNew({ name: 'HMI sec', hmi: { pin: '4321', objects: [{ id: 'h2', type: 'pb', scr: 's1', x: 200, y: 10, w: 130, h: 64, label: 'RESET', tag: 'B3:0/3', mode: 'momentary', color: '#2fa84f', sec: 'yes' }] } }); App.showView('hmi'); }); await wait(200);
  await page.click('#view-hmi [data-mode="edit"]'); await wait(150);
  check('HMI: with a button that needs log-in, Studio asks for the PIN first', await page.evaluate(() => !!document.querySelector('.modal #f_p') && !document.querySelector('#view-hmi .hmi').classList.contains('editing')));
  await page.fill('#f_p', '4321'); await page.click('.modal .btn.primary'); await wait(150);
  check('HMI: the right PIN opens Studio, and the PIN field is masked', await page.evaluate(() => document.querySelector('#view-hmi .hmi').classList.contains('editing') && document.querySelector('#view-hmi [data-pin]').type === 'password'));
  await page.click('#view-hmi [data-mode="run"]'); await wait(100);
  check('HMI: back on the Machine you are logged out', await page.evaluate(() => document.querySelector('#view-hmi .hmi-props').textContent.includes('Not logged in')));
  check('retagging a symbol removes the device the diagram added for it', await page.evaluate(() => { App.openNew({ name: 'T11' }); const C = App.project.circuit; C.comps.push(Circuit.create('psu24', 0, 0, C)); App.project.schematic.rungs = [{ elems: [{ k: 'pbno', tag: 'S1' }, { k: 'lamp', tag: 'H1' }], comment: '' }]; Schematic.sync(); const had = App.project.circuit.comps.some(c => c.props.label === 'S1'); App.project.schematic.rungs[0].elems[0].tag = 'S2'; Schematic.sync(); const L = App.project.circuit.comps.map(c => c.props.label); return had && !L.includes('S1') && L.includes('S2') && L.includes('H1'); }));
  check('free draw: deleting a potential point removes its junction device from the Wiring', await page.evaluate(() => { App.openNew({ name: 'J' }); const C = App.project.circuit; C.comps.push(Circuit.create('supply1', 0, 0, C)); App.project.schematic.free.items.push({ id: 'd1', k: 'pL1', tag: 'XP1', x: 0, y: 0, r: 0 }); Schematic.sync(); const had = App.project.circuit.comps.some(c => c.props.label === 'XP1' && c.type === 'jct'); App.project.schematic.free.items = []; Schematic.sync(); return had && !App.project.circuit.comps.some(c => c.props.label === 'XP1'); }));
  check('HMI: ＋ Screen stops at 30 screens', await page.evaluate(() => { App.openNew({ name: 'S30', hmi: { screens: Array.from({ length: 30 }, (_, i) => ({ id: 's' + (i + 1), name: 'S' + (i + 1) })) } }); App.showView('hmi'); document.querySelector('#view-hmi [data-mode="edit"]').click(); document.querySelector('#view-hmi [data-sadd]').click(); const r = !document.querySelector('.modal #f_n') && App.project.hmi.screens.length === 30; document.querySelector('#view-hmi [data-mode="run"]').click(); return r; }));
  check('free draw: no more than 400 symbols can be added', await page.evaluate(() => { App.openNew({ name: 'F400', schematic: { free: { items: Array.from({ length: 400 }, (_, i) => ({ id: 'd' + (i + 1), k: 'text', tag: 'TXT', x: i * 10, y: 0, r: 0, txt: 'x' })), wires: [] } } }); FreeDraw.add('lamp', 'H1', 0, 0); return App.project.schematic.free.items.length === 400; }));
  check('HMI.mini is keyed on a version counter, and an edit changes its key', await page.evaluate(() => { App.openNew({ name: 'M', hmi: { objects: [{ id: 'h1', type: 'lamp', scr: 's1', x: 10, y: 10, w: 80, h: 90, label: 'RUN', tag: 'O:0/0' }] } }); const k1 = HMI.mini().key; HMI.render(); const k2 = HMI.mini().key; return k1 !== k2 && !k2.includes('"label"'); }));
  check('HMI.sample records trend history while the HMI view is hidden', await page.evaluate(() => { App.openNew({ name: 'TR', hmi: { objects: [{ id: 'h5', type: 'trend', scr: 's1', x: 0, y: 0, w: 320, h: 160, label: 'N7', tag: 'N7:0', min: 0, max: 100, span: 30 }] } }); App.showView('ladder'); const t = performance.now(); HMI.sample(t); HMI.sample(t + 300); HMI.sample(t + 600); App.showView('hmi'); return (document.querySelector('#view-hmi .hobj[data-id="h5"] [data-p]').getAttribute('d') || '').split('L').length > 2; }));

  console.log('Integration baseline: HMI → PLC → Wiring → Electrical Diagram, through the real tick loop');
  // these drive the running app (20 ms ticks): HMI writes PLC data, the scan drives the PLC output contacts, the solver moves the devices
  const until = (fn, arg, ms = 3000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }).then(() => true, () => false);
  const hmiTap = l => page.evaluate(async l => { const o = App.project.hmi.objects.find(x => x.label === l); HMI.pressId(o.id, 'down'); await new Promise(r => setTimeout(r, 30)); HMI.pressId(o.id, 'up'); }, l);
  const op = async (l, p = 'btn') => { await page.evaluate(([l, p]) => { const up = App.operate(App.project.circuit.comps.find(c => c.props.label === l), p); if (typeof up === 'function') setTimeout(up, 40); }, [l, p]); await wait(100); };
  const ST = 'const d = l => App.project.circuit.comps.find(c => c.props.label === l).state, r = a => App.plc.read(a);';
  const is = body => new Function(ST + 'return ' + body + ';');
  // every opened example is stored as a new project: drop the older ones so a full storage cannot block opening the next
  await page.evaluate(() => Store.list().forEach(p => { if (p.id !== App.currentId) Store.remove(p.id); }));
  await load('plcmotor'); await setMode('RUN');
  check('integration: in RUN, STOP (N.C.) and overload OK read 1 and the motor is off', await until(is("r('I:0/1') === 1 && r('I:0/2') === 1 && r('O:0/0') === 0 && d('M1').drive === 'off'")));
  await hmiTap('START');
  check('integration: a 30 ms HMI START tap sets O:0/0, pulls in KM1 through the PLC output contact, runs M1 and lights H1', await until(is("r('O:0/0') === 1 && d('KM1').pulled && d('M1').drive === 'run' && d('H1').on")));
  check('integration: the HMI START bit is released after the tap and the rung holds O:0/0', await until(is("r('B3:0/0') === 0 && r('O:0/0') === 1")));
  await hmiTap('STOP');
  check('integration: HMI STOP drops O:0/0, KM1 and the motor', await until(is("r('O:0/0') === 0 && !d('KM1').pulled && d('M1').drive === 'off'")));
  await op('S1');
  check('integration: the Wiring push button S1 starts the same motor through I:0/0', await until(is("r('O:0/0') === 1 && d('KM1').pulled && d('M1').drive === 'run'")));
  const ev0 = await page.evaluate(() => App.events().length);
  await op('M1', 'jam');
  check('integration: a jammed motor trips F1; 95-96 opens I:0/2, the rung drops O:0/0 and KM1, O:0/2 lights H2 and sets the HMI alarm bit B3:0/15', await until(is("d('F1').tripped && r('I:0/2') === 0 && r('O:0/0') === 0 && !d('KM1').pulled && r('O:0/2') === 1 && d('H2').on && r('B3:0/15') === 1"), null, 10000));
  check('integration: the overload trip is logged as an alarm', await page.evaluate(n => App.events().slice(n).some(e => e.kind === 'alarm' && e.msg.includes('F1')), ev0));
  await op('M1', 'jam'); await op('F1', 'reset');
  check('integration: after unjam and F1 reset the alarm clears and the motor stays off', await until(is("!d('F1').tripped && r('I:0/2') === 1 && r('B3:0/15') === 0 && r('O:0/2') === 0 && r('O:0/0') === 0")));
  await hmiTap('START');
  check('integration: the motor restarts from the HMI after the reset', await until(is("r('O:0/0') === 1 && d('M1').drive === 'run'")));
  await setMode('PROG');
  check('integration: PROG turns the PLC outputs off and KM1 drops', await until(is("r('O:0/0') === 0 && !d('KM1').pulled")));
  await setMode('RUN'); await op('QF1', 'h');
  await hmiTap('START');
  const qf1Off = await until(is("!d('QF1').on && r('O:0/0') === 1 && d('KM1').pulled"));
  await wait(600);
  check('integration (current behaviour): with QF1 off, O:0/0 = 1 and KM1 pull in but M1 stays off — this example has no running feedback, so its HMI motor follows the command', qf1Off && await page.evaluate(is("r('O:0/0') === 1 && d('M1').drive === 'off' && d('M1').spd === 0")));
  await hmiTap('STOP'); await op('QF1', 'h'); await setMode('PROG');

  // hardwired: no PLC at all, the PLC stays in PROG
  await load('dol'); await setMode('PROG');
  await op('S1');
  const sealed = await until(is("d('KM1').pulled && d('M1').drive === 'run' && d('H1').on"));
  await wait(500);
  check('hardwired: in PROG, S1 pulls in KM1 and KM1 13-14 holds it after the button is released', sealed && await page.evaluate(is("d('KM1').pulled && !d('S1').pressed")));
  await op('S0');
  check('hardwired: S0 drops KM1 and the motor', await until(is("!d('KM1').pulled && d('M1').drive === 'off'")));
  await op('S1'); await until(is("d('KM1').pulled")); await op('M1', 'jam');
  check('hardwired: a jammed motor trips F1; its 95-96 drops the coil and its 97-98 lights H2', await until(is("d('F1').tripped && !d('KM1').pulled && d('H2').on"), null, 10000));
  await op('M1', 'jam'); await op('F1', 'reset');
  const reset = await until(is("!d('F1').tripped && !d('H2').on"));
  await wait(300);
  check('hardwired: after the reset the starter stays off until START', reset && await page.evaluate(is("!d('KM1').pulled")));

  // a circuit drawn only in the Electrical Diagram (free draw): the diagram makes the devices and wires, the same solver runs them
  const sealIn = { name: 'Free draw seal-in', schematic: { free: { seq: 20, items: [
    { id: 'd1', k: 'src1', tag: 'Q1', x: 0, y: 0, r: 0 }, { id: 'd2', k: 'pbnc', tag: 'S0', x: 0, y: 100, r: 0 }, { id: 'd3', k: 'pbno', tag: 'S1', x: 0, y: 200, r: 0 },
    { id: 'd4', k: 'kmno', tag: 'KM1', x: 100, y: 200, r: 0 }, { id: 'd5', k: 'kmcoil', tag: 'KM1', x: 0, y: 300, r: 0 }, { id: 'd6', k: 'lamp', tag: 'H1', x: 100, y: 300, r: 0 }],
  wires: [{ id: 'fw1', a: 'd1:L', b: 'd2:11' }, { id: 'fw2', a: 'd2:12', b: 'd3:13' }, { id: 'fw3', a: 'd3:13', b: 'd4:13' }, { id: 'fw4', a: 'd3:14', b: 'd4:14' },
    { id: 'fw5', a: 'd3:14', b: 'd5:A1' }, { id: 'fw6', a: 'd5:A2', b: 'd1:N' }, { id: 'fw7', a: 'd4:14', b: 'd6:X1' }, { id: 'fw8', a: 'd6:X2', b: 'd1:N' }] } } };
  await page.evaluate(p => { localStorage.setItem('plc-trainer.schStyle', 'free'); App.openNew(JSON.parse(JSON.stringify(p))); App.showView('schematic'); }, sealIn);
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(300);
  check('free draw: a seal-in drawn only in the diagram creates its devices and 8 wires in the Wiring on load', await page.evaluate(() => {
    const C = App.project.circuit, t = l => (C.comps.find(c => c.props.label === l) || {}).type;
    return t('Q1') === 'supply1' && t('S0') === 'pb_nc' && t('S1') === 'pb_no' && t('KM1') === 'contactor' && t('H1') === 'lamp' && C.comps.length === 5 && C.wires.filter(w => w.sch).length === 8 && FreeDraw.errs.size === 0;
  }));
  const LIVE = '#view-schematic .fd-host svg .w.on';
  const live0 = await page.evaluate(s => document.querySelectorAll(s).length, LIVE);
  await op('S1');
  check('free draw: the drawn START pulls in the coil and the drawn KM1 N.O. contact holds it', await until(is("d('KM1').pulled && d('H1').on && !d('S1').pressed")));
  check('free draw: the diagram shows more live wires while the circuit is sealed in', live0 > 0 && await until(([s, n]) => document.querySelectorAll(s).length > n, [LIVE, live0]));
  await op('S0');
  check('free draw: the drawn STOP drops the coil and the live wires go back', await until(([s, n]) => !App.project.circuit.comps.find(c => c.props.label === 'KM1').state.pulled && document.querySelectorAll(s).length === n, [LIVE, live0]));
  check('free draw: Undo removes an added symbol and the device the diagram made for it; Redo brings both back', await page.evaluate(() => {
    const dev = () => App.project.circuit.comps.some(c => c.props.label === 'H7'), sym = () => App.project.schematic.free.items.some(i => i.tag === 'H7');
    FreeDraw.add('lamp', 'H7', 300, 0); const a = dev() && sym();
    Schematic.undo(); const b = !dev() && !sym();
    Schematic.redo(); return a && b && dev() && sym();
  }));
  await (await page.$('#view-schematic [data-fi="d3"] .hit')).click(); await wait(100);
  check('free draw: Delete removes a symbol and its wires from the diagram and the Wiring; Undo restores all of them', await page.evaluate(() => {
    const F = () => App.project.schematic.free, sw = () => App.project.circuit.wires.filter(w => w.sch).length, n0 = [F().items.length, F().wires.length, sw()];
    if (!FreeDraw.selected() || FreeDraw.selected().id !== 'd3') return false;
    FreeDraw.del(); const gone = F().items.length === n0[0] - 1 && F().wires.length < n0[1] && sw() < n0[2];
    Schematic.undo(); return gone && F().items.length === n0[0] && F().wires.length === n0[1] && sw() === n0[2];
  }));
  check('free draw (current behaviour): after Undo removes the selected symbol, Delete does not throw and removes nothing', await page.evaluate(() => {
    FreeDraw.add('lamp', 'H8', 300, 100); Schematic.undo(); const before = JSON.stringify(App.project.schematic.free);
    try { FreeDraw.del(); } catch (e) { return false; }
    return FreeDraw.selected() === null && JSON.stringify(App.project.schematic.free) === before;
  }));
  check('save/load: the drawn circuit, its devices and diagram wires survive a save and reload', await page.evaluate(() => {
    const p = App.buildProject(JSON.parse(JSON.stringify(App.serialize())));
    return JSON.stringify(p.schematic.free) === JSON.stringify(App.project.schematic.free) && p.circuit.comps.length === App.project.circuit.comps.length && p.circuit.wires.filter(w => w.sch).length === App.project.circuit.wires.filter(w => w.sch).length;
  }));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); }); await page.click('#view-schematic [data-sstyle="iec"]'); await wait(150);

  // save / load
  // compare the saved form (loading rebuilds rungs from their text with new runtime ids) with sorted keys: a wire the diagram
  // re-made lists its fields in another order. The event log grows on every open. openNew refuses to leave a project that
  // cannot be saved, so the projects made here are removed again to keep storage free.
  const unstable = await page.evaluate(() => Object.keys(Examples.EX).filter(k => {
    const canon = v => JSON.stringify(v, (q, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, z) => { o[z] = x[z]; return o; }, {}) : x));
    const save = () => { const s = JSON.parse(JSON.stringify(App.serialize())); delete s.events; return canon(s); };
    const open = data => { const prev = App.currentId, ok = App.openNew(data); if (ok && prev) Store.remove(prev); return ok; };
    if (!open(Examples.EX[k].build())) return true;
    const a = save();
    return !open(JSON.parse(JSON.stringify(App.serialize()))) || save() !== a;
  }));
  check('save/load: every example saves the same after a reload (the saved project is stable)', unstable.length === 0, unstable.join(', '));
  check('save/load: device state is kept (a tripped overload stays tripped), a momentary press is not', await page.evaluate(() => {
    App.openNew(Examples.EX.dol.build()); const d = l => App.project.circuit.comps.find(c => c.props.label === l);
    d('F1').state.tripped = true; d('S1').state.pressed = true;
    const p = App.buildProject(JSON.parse(JSON.stringify(App.serialize()))), e = l => p.circuit.comps.find(c => c.props.label === l);
    return e('F1').state.tripped === true && e('S1').state.pressed === false;
  }));
  await page.evaluate(() => { App.openNew(Examples.EX.plcmotor.build()); App.openNew(JSON.parse(JSON.stringify(App.serialize()))); App.setMode('RUN'); });
  await hmiTap('START');
  check('save/load: a reloaded PLC motor project still runs the motor from the HMI', await until(is("r('O:0/0') === 1 && d('KM1').pulled && d('M1').drive === 'run'")));
  await hmiTap('STOP'); await setMode('PROG');
  await page.evaluate(() => App.showView('ladder'));

  console.log('Project compatibility: parts, symbols and wires a newer version made');
  await page.evaluate(() => Store.list().forEach(p => { if (p.id !== App.currentId) Store.remove(p.id); }));
  // a project saved by a newer version: format 3, a part type, a rail/rung symbol, a free-draw symbol and wires this version does not know
  const future = { name: 'From a newer version', format: 3,
    circuit: { seq: 60, comps: [
      { id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } },
      { id: 'c2', type: 'lamp', x: 100, y: 0, props: { label: 'H1', coil: '230VAC' } },
      { id: 'c50', type: 'quantumRelay', x: 200, y: 0, props: { label: 'K9', future: { a: 1 } }, state: { x: 2 }, extra: 'kept as it is' }],
    wires: [{ id: 'w1', a: 'c1:L', b: 'c2:X1', color: '#d32f2f', pts: [] }, { id: 'w2', a: 'c2:X2', b: 'c1:N', color: '#1d1d1d', pts: [] },
      { id: 'w3', a: 'c1:L', b: 'c50:A1', color: '#d32f2f', pts: [[10, 10]], future: true },
      { id: 'w4', a: 'c2:Z9', b: 'c1:N', color: '#123456', pts: [] }] },
    schematic: { rungs: [{ elems: [{ k: 'pbno', tag: 'S1' }, { k: 'lamp', tag: 'H3' }], comment: 'known' }, { elems: [{ k: 'pbno', tag: 'S2' }, { k: 'hyperCoil', tag: 'K9' }], comment: 'future' }],
      free: { seq: 10, items: [{ id: 'd1', k: 'lamp', tag: 'H5', x: 0, y: 0, r: 0 }, { id: 'd7', k: 'warpDrive', tag: 'W1', x: 100, y: 0, r: 0, extra: { n: 1 } }],
        wires: [{ id: 'fw3', a: 'd1:X1', b: 'd7:P' }] } } };
  const canonJs = 'const canon = v => JSON.stringify(v, (q, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, z) => { o[z] = x[z]; return o; }, {}) : x));';
  check('compat: a project from a newer version opens; its known parts are in the Wiring, the unknown ones are kept aside', await page.evaluate(f => {
    if (!App.openNew(JSON.parse(JSON.stringify(f)))) return false;
    const C = App.project.circuit, k = App.project.keep;
    return C.comps.some(c => c.id === 'c2') && !C.comps.some(c => c.id === 'c50') && C.wires.some(w => w.id === 'w1') && !C.wires.some(w => w.id === 'w3' || w.id === 'w4')
      && k.comps.length === 1 && k.wires.length === 2 && k.rungs.length === 1 && k.free.items.length === 1 && k.free.wires.length === 1 && App.project.schematic.free.items.length === 1;
  }, future));
  check('compat: the known circuit still simulates (H1 lights)', await until(() => App.project.circuit.comps.find(c => c.props.label === 'H1').state.on));
  check('compat: a current path holding an unknown symbol is kept whole — its other symbols are not joined or wired', await page.evaluate(() => App.project.schematic.rungs.length === 1 && !App.project.circuit.comps.some(c => c.props.label === 'S2')));
  check('compat: saving writes every unknown part, symbol and wire back unchanged and in place, and keeps the newer format', await page.evaluate(new Function('f', canonJs + `
    const s = JSON.parse(JSON.stringify(App.serialize())), byId = (l, id) => l.find(x => x.id === id);
    return s.format === 3 && canon(byId(s.circuit.comps, 'c50')) === canon(f.circuit.comps[2]) && canon(byId(s.circuit.wires, 'w3')) === canon(f.circuit.wires[2])
      && canon(byId(s.circuit.wires, 'w4')) === canon(f.circuit.wires[3]) && canon(s.schematic.rungs[1]) === canon(f.schematic.rungs[1])
      && canon(byId(s.schematic.free.items, 'd7')) === canon(f.schematic.free.items[1]) && canon(byId(s.schematic.free.wires, 'fw3')) === canon(f.schematic.free.wires[0]);`), future));
  check('compat: save → reload → save gives the same project (two round trips)', await page.evaluate(new Function(canonJs + `
    const save = () => { const s = JSON.parse(JSON.stringify(App.serialize())); delete s.events; return canon(s); };
    const a = save(); if (!App.openNew(JSON.parse(a))) return false; const b = save(); if (!App.openNew(JSON.parse(b))) return false;
    return a === b && b === save() && App.project.keep.comps.length === 1 && App.project.keep.free.items.length === 1;`)));
  check('compat: new parts and diagram symbols never reuse the id of a kept one', await page.evaluate(() => {
    const n = id => Number(String(id).replace(/\D/g, '')), c = Circuit.create('lamp', 0, 0, App.project.circuit);
    return n(c.id) > 50 && App.project.schematic.free.seq >= 7;
  }));
  check('compat: a warning names the newer format and the unknown kinds, in a toast and in the event log', await page.evaluate(() => {
    const m = App.compat().join(' '), t = document.getElementById('toast-root').textContent;
    return /newer PLC Trainer \(project format 3/.test(m) && m.includes('quantumRelay') && m.includes('warpDrive') && m.includes('current path')
      && t.includes('not known to this version') && App.events().some(e => e.msg.includes('not known to this version'));
  }));
  check('compat: deleting a known part leaves out the kept wires that ended on it (no broken references saved)', await page.evaluate(() => {
    const C = App.project.circuit, h = C.comps.find(c => c.props.label === 'H1');
    C.comps = C.comps.filter(c => c !== h); C.wires = C.wires.filter(w => ![w.a, w.b].some(e => e.startsWith(h.id + ':')));
    const s = App.serialize(); return !s.circuit.wires.some(w => w.id === 'w4') && s.circuit.wires.some(w => w.id === 'w3') && s.circuit.comps.some(c => c.id === 'c50');
  }));
  check('compat: every example and a v2.0.0 project open with no compatibility warning; saved projects carry format 2', await page.evaluate(() => {
    const quiet = Object.keys(Examples.EX).every(k => { const prev = App.currentId, ok = App.openNew(Examples.EX[k].build()); if (ok && prev) Store.remove(prev); return ok && App.compat().length === 0; });
    const old = { version: 1, name: 'v2.0.0 file', circuit: { comps: [{ id: 'c1', type: 'lamp', x: 0, y: 0, props: { label: 'H1' }, state: {} }], wires: [], seq: 1 } };
    const prev = App.currentId, ok = App.openNew(old); if (ok && prev) Store.remove(prev);
    return quiet && ok && App.compat().length === 0 && App.project.format === 1 && App.serialize().format === 2;
  }));
  // damaged data: wrong types, missing or duplicate ids, oversized entries, wires to nothing — none of it may crash or spoil the rest
  const damagedR = await page.evaluate(() => {
    const bad = { name: 'Damaged', circuit: { comps: [null, 5, 'x', { type: 'lamp' }, { id: 'c1', type: 'lamp', props: { label: 'H1' } }, { id: 'c1', type: 'lamp' }, { id: 'c2' }, { id: 'c3', type: {} },
      { id: 'c4', type: 'bigThing', blob: 'x'.repeat(30000) }, { id: 'c' + '9'.repeat(30), type: 'zz' }, { id: 'c5', type: 'futureThing', props: { label: 'U1' } }],
    wires: [{ id: 'w1', a: 'c1:X1', b: 'c99:A' }, { id: 'w2' }, 'w', { id: 'w3', a: 5, b: null }, { id: 'w4', a: 'c5:A', b: 'c1:X2' }] },
    schematic: { L: 'c5:L', rungs: [null, { elems: 'nope' }, { elems: [{ k: 'br', legs: 'x' }, { k: 'mystery' }] }], power: { main: [{ k: 'futureMain', tag: 'Q0' }], feeders: [null, { elems: [{ k: 'futureFeeder', tag: 'M1' }] }] },
      free: { items: [null, { id: 'd1' }, { id: 'd2', k: 'lamp', tag: 'bad tag!' }, { id: 'd3', k: {} }, { id: 'd4', k: 'futureSym', tag: 'X' }], wires: [{ id: 'fw1', a: 'd4:A', b: 'd9:B' }, { id: 'bad' }, null] } } };
    let ok;
    try { ok = App.openNew(bad); } catch (e) { return 'threw: ' + e.message; }
    const P = App.project, k = P.keep, m = App.compat().join(' ');
    const s = JSON.parse(JSON.stringify(App.serialize()));
    const again = App.openNew(JSON.parse(JSON.stringify(s)));
    return ok && again && P.circuit.comps.length === 1 && k.comps.map(c => c.id).join() === 'c5' && k.wires.map(w => w.id).join() === 'w4'
      && k.rungs.length === 1 && !!k.main && k.feeders.length === 1 && k.free.items.map(i => i.id).join() === 'd4' && k.L === 'c5:L'
      && k.dropped >= 15 && /damaged entries/.test(m) && s.schematic.L === 'c5:L' && s.schematic.power.main[0].k === 'futureMain'
      && App.compat().every(x => !/damaged/.test(x)) && App.project.keep.comps.length === 1;
  });
  check('compat: damaged data loads without errors; damaged entries are left out and reported, readable unknown ones kept', damagedR === true, String(damagedR));
  // tags of kept parts and symbols are reserved; a tag the known part of the file also uses is not
  const reserveP = { name: 'Reserved tags', format: 3,
    circuit: { seq: 10, comps: [
      { id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } },
      { id: 'c2', type: 'contactor', x: 0, y: 0, props: { label: 'KM2' } },
      { id: 'c5', type: 'quantumRelay', x: 0, y: 0, props: { label: 'KA1' } },
      { id: 'c6', type: 'mysteryBox', x: 0, y: 0 }], wires: [] },
    schematic: { L: 'c5:L',
      rungs: [{ elems: [{ k: 'pbno', tag: 'S3' }], comment: 'A' }, { elems: [{ k: 'pbno', tag: 'S1' }, { k: 'hyperCoil', tag: 'KM1' }, { k: 'kmcoil', tag: 'KM2' }], comment: 'kept' }, { elems: [{ k: 'pbno', tag: 'S4' }], comment: 'B' }],
      power: { main: [{ k: 'futureMain', tag: 'QS1' }], feeders: [{ elems: [{ k: 'km3', tag: 'KM5' }] }, { elems: [{ k: 'futureVfd', tag: 'U1' }] }, { elems: [{ k: 'km3', tag: 'KM6' }] }] },
      free: { seq: 5, items: [{ id: 'd1', k: 'warpLamp', tag: 'H1', x: 0, y: 0, r: 0 }], wires: [] } } };
  check('compat: tags of kept parts, symbols, paths and feeders are reserved; one of a device this version knows is not',await page.evaluate(p => {
    const prev = App.currentId; if (!App.openNew(JSON.parse(JSON.stringify(p)))) return false; if (prev) Store.remove(prev);
    const R = App.project.circuit.reserved;
    return ['KA1', 'H1', 'S1', 'KM1', 'U1', 'QS1'].every(t => R.has(t)) && !['KM2', 'S3', 'S4', 'Q1'].some(t => R.has(t)) && App.project.keep.untagged === 1
      && Object.keys(App.project.circuit).indexOf('reserved') < 0 && !('reserved' in App.serialize().circuit);
  }, reserveP));
  check('compat: a kept part with no readable tag is reported (its tag could not be reserved)', await page.evaluate(() => App.compat().some(m => /1 of them has no tag this version can read/.test(m))));
  check('compat: new devices skip reserved tags (relay KA2, lamp H2, push button S2, contactor KM3)', await page.evaluate(() => {
    const C = App.project.circuit, lab = t => Circuit.create(t, 0, 0, C).props.label;
    return lab('relay') === 'KA2' && lab('lamp') === 'H2' && lab('pb_no') === 'S2' && lab('contactor') === 'KM3';
  }));
  await page.evaluate(() => { App.showView('wiring'); Workspace.selectComp(App.project.circuit.comps.find(c => c.props.label === 'KM2').id); }); await wait(300);
  await page.fill('[data-pk="label"]', 'KA1'); await page.dispatchEvent('[data-pk="label"]', 'change'); await wait(100);
  check('compat: renaming a device to a reserved tag is refused', await page.evaluate(() => App.project.circuit.comps.some(c => c.props.label === 'KM2') && !App.project.circuit.comps.some(c => c.props.label === 'KA1')));
  check('compat: a diagram symbol given a reserved tag by hand is reported and makes no device (free draw and current paths)', await page.evaluate(() => {
    App.showView('schematic'); FreeDraw.add('lamp', 'H1', 300, 300);
    const it = App.project.schematic.free.items.find(i => i.tag === 'H1' && i.k === 'lamp');
    App.project.schematic.rungs.push({ elems: [{ k: 'pbno', tag: 'S1' }], comment: '' }); Schematic.sync();
    const C = App.project.circuit.comps, msgF = FreeDraw.errs.get(it) || '', msgR = [...Schematic.errs.values()].join(' ');
    return !!it && /H1 is the tag of a part this version does not know/.test(msgF) && /S1 is the tag of a part/.test(msgR) && !C.some(c => c.props.label === 'H1' || c.props.label === 'S1');
  }));
  check('compat: the kept main power circuit cannot be replaced here and is saved as it was', await page.evaluate(() => {
    const r = Schematic.addMain('qf3', 'Q9');
    return typeof r === 'string' && /main power circuit holds parts/.test(r) && App.project.schematic.power.main.length === 0 && App.serialize().schematic.power.main[0].k === 'futureMain';
  }));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); App.showView('schematic'); Schematic.resetSel(); Schematic.render(); }); await wait(200);
  // checks that can explain a failure return a string; only `true` passes
  const railR = await page.evaluate(() => {
    const sel = document.querySelector('#view-schematic [data-rail="L"]'); if (!sel) return 'no rail selector';
    const opt = [...sel.options].find(o => o.value && o.value !== App.project.schematic.L); const before = App.project.schematic.L;
    if (!opt) return 'no other rail to choose';
    sel.value = opt.value; sel.dispatchEvent(new Event('change'));
    return App.project.schematic.L === before && App.serialize().schematic.L === 'c5:L' && document.getElementById('toast-root').textContent.includes('rail is on a part this version does not know');
  });
  check('compat: a kept rail cannot be changed here, and is saved as it was', railR === true, String(railR));
  check('compat: kept paths and feeders stay right after the ones they followed when others are inserted or deleted', await page.evaluate(() => {
    const S = App.project.schematic, P = S.power;
    S.rungs = S.rungs.filter(r => r.comment !== 'B' && r.comment !== ''); S.rungs.unshift({ elems: [], comment: 'X' });
    P.feeders.unshift({ elems: [] });
    const s = App.serialize();
    return s.schematic.rungs.map(r => r.comment).join() === 'X,A,kept' && s.schematic.power.feeders.map(f => (f.elems[0] ? f.elems[0].tag : '-')).join() === '-,KM5,U1,KM6';
  }));
  check('compat: save → reload keeps the kept content and its reserved tags (a symbol refused for a reserved tag does not free it)',await page.evaluate(new Function('p', canonJs + `
    const s = JSON.parse(JSON.stringify(App.serialize())), prev = App.currentId; if (!App.openNew(s)) return false; if (prev) Store.remove(prev);
    const t = JSON.parse(JSON.stringify(App.serialize())), byId = (l, id) => l.find(x => x.id === id), R = App.project.circuit.reserved;
    return canon(byId(t.circuit.comps, 'c5')) === canon(p.circuit.comps[2]) && canon(byId(t.circuit.comps, 'c6')) === canon(p.circuit.comps[3])
      && canon(t.schematic.rungs.find(r => r.comment === 'kept')) === canon(p.schematic.rungs[1]) && t.schematic.power.main[0].k === 'futureMain' && t.schematic.L === 'c5:L'
      && canon(byId(t.schematic.free.items, 'd1')) === canon(p.schematic.free.items[0]) && ['KA1', 'H1', 'S1', 'KM1', 'U1', 'QS1'].every(x => R.has(x));`), reserveP));
  // a supply rail on a part this version does not know: no other supply takes its place (Cases A, B, C). The projects hold
  // S1 and H1 already, as a newer version saves them, so S1 can be pressed and H1 watched. Opening syncs the diagram;
  // render and sync run again here so every place that picks rails is passed through.
  const railCase = (name, extra, L, N) => ({ name, format: 3, circuit: { seq: 30, comps: [{ id: 'c5', type: 'futureUps', x: 0, y: 0, props: { label: 'G9' } }, ...extra,
    { id: 'c21', type: 'pb_no', x: 0, y: 0, props: { label: 'S1' } }, { id: 'c23', type: 'lamp', x: 0, y: 0, props: { label: 'H1', coil: '230VAC' } }], wires: [] },
  schematic: { L, N, rungs: [{ elems: [{ k: 'pbno', tag: 'S1' }, { k: 'lamp', tag: 'H1' }], comment: 'lamp' }] } });
  const Q1 = { id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }, G1 = { id: 'c2', type: 'psu24', x: 0, y: 0, props: { label: 'G1' } };
  const railRun = d => page.evaluate(async d => {
    const prev = App.currentId; if (!App.openNew(JSON.parse(JSON.stringify(d)))) return null; if (prev) Store.remove(prev);
    App.showView('schematic'); Schematic.render(); Schematic.sync();
    const C = App.project.circuit, S = App.project.schematic, dev = l => C.comps.find(c => c.props.label === l);
    const up = App.operate(dev('S1'), 'btn'); await new Promise(r => setTimeout(r, 400));
    const lit = dev('H1').state.on; if (typeof up === 'function') up(); await new Promise(r => setTimeout(r, 150));
    const s = JSON.parse(JSON.stringify(App.serialize()));
    return { L: S.L, N: S.N, lit, sch: C.wires.filter(w => w.sch).length, savedL: s.schematic.L, savedN: s.schematic.N, savedSch: s.circuit.wires.filter(w => w.sch).length,
      coil: dev('H1').props.coil, labels: C.comps.map(c => c.props.label).sort().join(), msg: App.compat().join(' ') };
  }, d);
  const rA = await railRun(railCase('Rail case A', [Q1], 'c5:L', 'c5:N'));
  check('kept rail, case A: no substitute rail; pressing S1 does not light H1 from Q1; no diagram wires to Q1; L/N saved unchanged', !!rA && rA.L === null && rA.N === null && rA.lit === false
    && rA.sch === 0 && rA.savedSch === 0 && rA.savedL === 'c5:L' && rA.savedN === 'c5:N' && rA.labels === 'H1,Q1,S1', JSON.stringify(rA));
  check('kept rail: the warning says the current paths on that rail are not powered or simulated here', !!rA && rA.msg.includes('supply rail of the current paths is on a part this version does not know') && rA.msg.includes('not powered or simulated here'));
  const rB = await railRun(railCase('Rail case B', [Q1, G1], 'c5:P', 'c1:N'));
  check('kept rail, case B: N stays c1:N; no diagram wires to the 24 V PSU; H1 keeps its 230 VAC coil and no device is added', !!rB && rB.L === null && rB.N === 'c1:N' && rB.lit === false
    && rB.sch === 0 && rB.savedSch === 0 && rB.savedL === 'c5:P' && rB.savedN === 'c1:N' && rB.coil === '230VAC' && rB.labels === 'G1,H1,Q1,S1', JSON.stringify(rB));
  const rC = await railRun(railCase('Rail case C', [], 'c5:L', 'c5:N'));
  check('kept rail, case C: with no other supply nothing is powered, nothing is wired, and L/N are saved unchanged', !!rC && rC.L === null && rC.N === null && rC.lit === false
    && rC.sch === 0 && rC.savedL === 'c5:L' && rC.savedN === 'c5:N' && rC.labels === 'H1,S1', JSON.stringify(rC));
  // save → reload → save: the saved form is compared with sorted keys and without the event log (the log grows on every
  // open; key order can differ for re-made objects); rails, devices, wires and the kept part are also checked against the file
  const railTrip = await page.evaluate(new Function('cases', canonJs + `
    const out = [];
    for (const d of cases) {
      const save = () => { const s = JSON.parse(JSON.stringify(App.serialize())); delete s.events; return s; };
      const open = x => { const prev = App.currentId, ok = App.openNew(JSON.parse(JSON.stringify(x))); if (ok && prev) Store.remove(prev); return ok; };
      if (!open(d)) { out.push(d.name + ': not opened'); continue; }
      const a = save(); if (!open(a)) { out.push(d.name + ': reload refused'); continue; }
      const b = save(), dev = (s, id) => s.circuit.comps.find(c => c.id === id);
      const ok = canon(a) === canon(b) && b.schematic.L === d.schematic.L && b.schematic.N === d.schematic.N && !b.circuit.wires.length
        && canon(dev(b, 'c5')) === canon(d.circuit.comps[0]) && b.circuit.comps.length === d.circuit.comps.length && dev(b, 'c23').props.coil === '230VAC'
        && d.circuit.comps.every(c => dev(b, c.id) && (dev(b, c.id).props || {}).label === (c.props || {}).label);
      if (!ok) out.push(d.name + ': differs');
    }
    return out.length ? out.join('; ') : true;`), [railCase('Rail case A', [Q1], 'c5:L', 'c5:N'), railCase('Rail case B', [Q1, G1], 'c5:P', 'c1:N'), railCase('Rail case C', [], 'c5:L', 'c5:N')]);
  check('kept rail: save → reload → save keeps rails, devices, wires and the kept part the same (cases A, B, C)', railTrip === true, String(railTrip));
  // without a kept rail the diagram still picks the rails itself: a 24 V PSU fed from the 1-phase supply comes first
  const rAuto = await page.evaluate(async () => {
    const prev = App.currentId, ok = App.openNew({ name: 'Auto rails', circuit: { seq: 5, comps: [
      { id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }, { id: 'c2', type: 'psu24', x: 0, y: 0, props: { label: 'G1' } }],
    wires: [{ id: 'w1', a: 'c1:L', b: 'c2:L', pts: [] }, { id: 'w2', a: 'c1:N', b: 'c2:N', pts: [] }] },
    schematic: { rungs: [{ elems: [{ k: 'pbno', tag: 'S1' }, { k: 'lamp', tag: 'H1' }], comment: '' }] } });
    if (!ok) return null; if (prev) Store.remove(prev);
    const C = App.project.circuit, S = App.project.schematic, dev = l => C.comps.find(c => c.props.label === l);
    await new Promise(r => setTimeout(r, 200));
    const up = App.operate(dev('S1'), 'btn'); await new Promise(r => setTimeout(r, 400));
    const lit = dev('H1').state.on; if (typeof up === 'function') up();
    return { L: S.L, N: S.N, coil: dev('H1').props.coil, sch: C.wires.filter(w => w.sch).length, lit, msgs: App.compat().length };
  });
  check('no kept rail: the diagram still picks the rails itself (24 V PSU first), wires the path, and S1 lights H1', !!rAuto && rAuto.L === 'c2:P2' && rAuto.N === 'c2:M2' && rAuto.coil === '24VDC'
    && rAuto.sch > 0 && rAuto.lit === true && rAuto.msgs === 0, JSON.stringify(rAuto));
  check('compat: a file that is not a project is still refused and the open project stays', await page.evaluate(() => { const id = App.currentId; try { App.openNew(5); return false; } catch (e) { return App.currentId === id && /not a PLC Trainer project/.test(e.message); } }));
  await page.evaluate(() => { const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); });

  console.log('Electrical Diagram: PLC I/O symbols on the real controller and I/O cards');
  // a circuit drawn only in free draw: PLC power from L1/N points, S1 from +24 V into input 0, output 0 switching lamp H1 from L1
  const fi = (id, k, tag, x, y) => ({ id, k, tag, x, y, r: 0 }), fw = (id, a, b) => ({ id, a, b });
  const plcDrawn = { name: 'PLC drawn', circuit: { seq: 5, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }, { id: 'c2', type: 'plc', x: 0, y: 300, props: { label: 'PLC' } }], wires: [] },
    ladder: { rungs: [{ text: 'XIC I:0/0 OTE O:0/0', comment: '' }] },
    schematic: { free: { seq: 40, items: [fi('d1', 'pL1', 'XP1', 0, 0), fi('d3', 'plcpw', 'PLC', 0, 100), fi('d2', 'pN', 'XP2', 0, 200),
      fi('d4', 'pP', 'XP3', 200, 0), fi('d5', 'pbno', 'S1', 200, 100), fi('d6', 'plci0', 'PLC', 200, 200), fi('d7', 'pM', 'XP4', 200, 300),
      fi('d8', 'pL1', 'XP5', 400, 0), fi('d9', 'plcq0', 'PLC', 400, 100), fi('d10', 'lamp', 'H1', 400, 200), fi('d11', 'pN', 'XP6', 400, 300)],
    wires: [fw('fw1', 'd1:J', 'd3:L1'), fw('fw2', 'd3:N', 'd2:J'), fw('fw3', 'd4:J', 'd5:13'), fw('fw4', 'd5:14', 'd6:I0'), fw('fw5', 'd6:COM', 'd7:J'),
      fw('fw6', 'd8:J', 'd9:VAC0'), fw('fw7', 'd9:O0', 'd10:X1'), fw('fw8', 'd10:X2', 'd11:J')] } } };
  // wires the diagram made, as tag:terminal pairs
  const schPairs = () => page.evaluate(() => { const C = App.project.circuit, lab = k => { const [id, t] = k.split(':'); const c = C.comps.find(x => x.id === id); return (c ? c.props.label : id) + ':' + t; }; return C.wires.filter(w => w.sch).map(w => lab(w.a) + '-' + lab(w.b)); });
  const ssym = id => page.evaluate(id => { const g = document.querySelector(`#view-schematic [data-fi="${id}"] .ssym`); return g ? g.classList.contains('on') : null; }, id);
  const fdAddrs = () => page.evaluate(() => [...document.querySelectorAll('#view-schematic .fd-host .faddr')].map(x => x.textContent).sort().join());
  await page.evaluate(p => { Store.list().forEach(x => { if (x.id !== App.currentId) Store.remove(x.id); }); localStorage.setItem('plc-trainer.schStyle', 'free'); localStorage.removeItem('plc-trainer.fdLib'); App.openNew(JSON.parse(JSON.stringify(p))); App.showView('schematic'); }, plcDrawn);
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(300);
  await page.selectOption('#view-schematic .fd-grp', 'PLC'); await wait(100);
  check('PLC symbols: the library shows one PLC power, relay output, transistor output and input symbol (other points are picked in the form)', await page.evaluate(() => {
    const ks = [...document.querySelectorAll('#view-schematic .fd-lib [data-fk^="plc"]')].map(b => b.dataset.fk).sort().join();
    return ks === 'plci0,plcpw,plcq0,plct0' && Object.keys(FreeDraw.KINDS).filter(k => /^plc[qti]\d+$/.test(k)).length === 48;
  }));
  const pairs = await schPairs();
  check('PLC symbols: a circuit drawn only in the diagram is wired to the real PLC terminals, and no second PLC is added', await page.evaluate(() => App.project.circuit.comps.filter(c => c.type === 'plc').length === 1 && FreeDraw.errs.size === 0)
    && ['XP1:J-PLC:L1', 'PLC:N-XP2:J', 'S1:14-PLC:I0', 'PLC:COM-XP4:J', 'XP4:J-PLC:C24', 'XP5:J-PLC:VAC0', 'PLC:O0-H1:X1'].every(x => pairs.includes(x)), pairs.join(' '));
  check('PLC symbols: the drawn PLC power symbol powers the PLC', await until(() => App.project.circuit.comps.find(c => c.type === 'plc').state.pw === true));
  await setMode('RUN'); await wait(200);
  const idle = [await ssym('d6'), await ssym('d9')];
  await page.evaluate(() => { window.__up = App.operate(App.project.circuit.comps.find(c => c.props.label === 'S1'), 'btn'); });
  const ran = await until(is("r('I:0/0') === 1 && r('O:0/0') === 1 && d('H1').on"));
  await wait(150);
  check('PLC symbols: pressing the drawn S1 sets I:0/0, the rung sets O:0/0, the drawn output contact closes and H1 lights', ran);
  check('PLC symbols: the input and output symbols show the live state of their points', idle[0] === false && idle[1] === false && (await ssym('d6')) === true && (await ssym('d9')) === true);
  const a0 = await fdAddrs();
  check('PLC symbols: each I/O symbol shows its address (I:0/0, O:0/0)', a0 === 'I:0/0,O:0/0', a0);
  await page.evaluate(() => { if (typeof window.__up === 'function') window.__up(); });
  check('PLC symbols: releasing S1 drops I:0/0, O:0/0 and the lamp', await until(is("r('I:0/0') === 0 && r('O:0/0') === 0 && !d('H1').on")));
  await page.evaluate(() => { App.setAddrStyle('bitbyte'); Schematic.render(); }); await wait(100);
  check('PLC symbols: the address follows the project address style', await page.evaluate(() => { const t = [...document.querySelectorAll('#view-schematic .fd-host .faddr')].map(x => x.textContent); return t.length === 2 && !t.includes('I:0/0') && t.every(x => x === App.fmt('I:0/0') || x === App.fmt('O:0/0')); }));
  await page.evaluate(() => { App.setAddrStyle('file'); Schematic.render(); });
  // another point through the form: output 0 → output 5 (common VAC1); the drawn wires follow the terminals
  await page.evaluate(() => FreeDraw.retag(App.project.schematic.free.items.find(i => i.id === 'd9'))); await wait(150);
  await page.selectOption('.modal #f_p', '5'); await page.click('.modal .btn.primary'); await wait(250);
  const p5 = await schPairs();
  check('PLC symbols: Tag / point… moves the symbol to O5; its wires follow to VAC1 and O5', await page.evaluate(() => { const F = App.project.schematic.free, it = F.items.find(i => i.id === 'd9'); return it.k === 'plcq5' && F.wires.some(w => w.id === 'fw6' && w.b === 'd9:VAC1') && F.wires.some(w => w.id === 'fw7' && w.a === 'd9:O5'); })
    && p5.includes('XP5:J-PLC:VAC1') && p5.includes('PLC:O5-H1:X1') && !p5.some(x => x.includes('PLC:O0')), p5.join(' '));
  await page.evaluate(() => { window.__up = App.operate(App.project.circuit.comps.find(c => c.props.label === 'S1'), 'btn'); });
  await until(is("r('O:0/0') === 1")); await wait(300);
  check('PLC symbols: now O:0/0 no longer lights H1 (it hangs on O5, which the ladder does not set)', await page.evaluate(is("r('O:0/0') === 1 && !d('H1').on")));
  await page.evaluate(() => { if (typeof window.__up === 'function') window.__up(); });
  check('PLC symbols: a drawn PLC circuit survives save and reload (symbols, points, diagram wires)', await page.evaluate(() => {
    const s = JSON.parse(JSON.stringify(App.serialize())), n = App.project.circuit.wires.filter(w => w.sch).length, prev = App.currentId;
    if (!App.openNew(s)) return false; if (prev) Store.remove(prev);
    const F = App.project.schematic.free; Schematic.sync();
    return F.items.find(i => i.id === 'd9').k === 'plcq5' && F.items.find(i => i.id === 'd6').k === 'plci0' && App.project.circuit.wires.filter(w => w.sch).length === n && FreeDraw.errs.size === 0 && App.compat().length === 0;
  }));
  await setMode('PROG');
  check('PLC symbols: no controller, the wrong device, or a point the card lacks is reported and nothing is wired or added', await page.evaluate(() => {
    const prev = App.currentId;
    App.openNew({ name: 'PLC errors', circuit: { seq: 5, comps: [{ id: 'c1', type: 'lamp', x: 0, y: 0, props: { label: 'H9' } }, { id: 'c2', type: 'mdi8', x: 0, y: 0, props: { label: 'DI1', slot: '1' } }], wires: [] } });
    if (prev) Store.remove(prev);
    FreeDraw.add('plcq0', 'PLC9', 0, 0); FreeDraw.add('plci0', 'H9', 100, 0); FreeDraw.add('plci9', 'DI1', 200, 0); FreeDraw.add('plci3', 'DI1', 300, 0);
    const F = App.project.schematic.free, e = id => FreeDraw.errs.get(F.items.find(i => i.k === id)) || '';
    return /PLC9: there is no PLC or I\/O card with this tag/.test(e('plcq0')) && /H9 is a Pilot Lamp, not a/.test(e('plci0')) && /has no terminal I9/.test(e('plci9')) && e('plci3') === ''
      && !App.project.circuit.comps.some(c => c.props.label === 'PLC9') && App.project.circuit.comps.length === 2;
  }));
  // the modular rack: input card DI1 (slot 1), relay card DO1 (slot 2), transistor card DT1 (slot 3), all drawn in the diagram
  const rack = { name: 'Rack drawn', io: { slots: { '1': 'mdi8', '2': 'mdo8', '3': 'mdo8t' } },
    circuit: { seq: 10, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }, { id: 'c2', type: 'mpsu', x: 0, y: 0, props: { label: 'PS1' } },
      { id: 'c3', type: 'mcpu', x: 0, y: 0, props: { label: 'CPU' } }, { id: 'c4', type: 'mdi8', x: 0, y: 0, props: { label: 'DI1', slot: '1' } },
      { id: 'c5', type: 'mdo8', x: 0, y: 0, props: { label: 'DO1', slot: '2' } }, { id: 'c6', type: 'mdo8t', x: 0, y: 0, props: { label: 'DT1', slot: '3' } },
      { id: 'c7', type: 'lamp', x: 0, y: 0, props: { label: 'H2', coil: '24VDC' } }], wires: [] },
    ladder: { rungs: [{ text: 'XIC I:1/0 BST OTE O:2/0 NXB OTE O:3/0 BND', comment: '' }] },
    schematic: { free: { seq: 60, items: [fi('d1', 'pL1', 'XP1', 0, 0), fi('d2', 'plcpw', 'PS1', 0, 100), fi('d3', 'pN', 'XP2', 0, 200),
      fi('d4', 'pP', 'XP3', 200, 0), fi('d5', 'pbno', 'S1', 200, 100), fi('d6', 'plci0', 'DI1', 200, 200), fi('d7', 'pM', 'XP4', 200, 300),
      fi('d8', 'pL1', 'XP5', 400, 0), fi('d9', 'plcq0', 'DO1', 400, 100), fi('d10', 'lamp', 'H1', 400, 200), fi('d11', 'pN', 'XP6', 400, 300),
      fi('d12', 'pP', 'XP7', 600, 0), fi('d13', 'plct0', 'DT1', 600, 100), fi('d14', 'lamp', 'H2', 600, 200), fi('d15', 'pM', 'XP8', 600, 300)],
    wires: [fw('fw1', 'd1:J', 'd2:L1'), fw('fw2', 'd2:N', 'd3:J'), fw('fw3', 'd4:J', 'd5:13'), fw('fw4', 'd5:14', 'd6:I0'), fw('fw5', 'd6:COM', 'd7:J'),
      fw('fw6', 'd8:J', 'd9:VAC0'), fw('fw7', 'd9:O0', 'd10:X1'), fw('fw8', 'd10:X2', 'd11:J'), fw('fw9', 'd12:J', 'd13:VP'), fw('fw10', 'd13:O0', 'd14:X1'), fw('fw11', 'd14:X2', 'd15:J')] } } };
  await page.evaluate(p => { const prev = App.currentId; App.openNew(JSON.parse(JSON.stringify(p))); if (prev) Store.remove(prev); App.showView('schematic'); }, rack); await wait(300);
  const rp = await schPairs();
  check('PLC symbols: on a rack the symbols wire the rack power supply, the input card, the relay card and the transistor card', await page.evaluate(() => FreeDraw.errs.size === 0)
    && ['XP1:J-PS1:L1', 'S1:14-DI1:I0', 'DI1:COM-XP4:J', 'XP5:J-DO1:VAC0', 'DO1:O0-H1:X1', 'XP7:J-DT1:VP', 'DT1:O0-H2:X1'].every(x => rp.includes(x)), rp.join(' '));
  await setMode('RUN'); await wait(200);
  await page.evaluate(() => { window.__up = App.operate(App.project.circuit.comps.find(c => c.props.label === 'S1'), 'btn'); });
  check('PLC symbols: on the rack, S1 sets I:1/0 and the rung drives O:2/0 (H1 on the relay card) and O:3/0 (H2 on the transistor card)', await until(is("r('I:1/0') === 1 && r('O:2/0') === 1 && r('O:3/0') === 1 && d('H1').on && d('H2').on")));
  await wait(150);
  const ra = await fdAddrs();
  check('PLC symbols: the rack symbols show their slot addresses and live state', ra === 'I:1/0,O:2/0,O:3/0' && (await ssym('d6')) === true && (await ssym('d9')) === true && (await ssym('d13')) === true, ra);
  await page.evaluate(() => { if (typeof window.__up === 'function') window.__up(); });
  await setMode('PROG');
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); App.showView('ladder'); });

  console.log('Electrical Diagram: properties and editing');
  const editP = { name: 'Editing', circuit: { seq: 5, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }], wires: [] },
    schematic: { free: { seq: 30, items: [fi('d1', 'pL1', 'XP1', 0, 0), fi('d2', 'ktcoil', 'KT1', 0, 120), fi('d3', 'ktno', 'KT1', 160, 120), fi('d4', 'lamp', 'H1', 160, 240), fi('d5', 'pN', 'XP2', 0, 240)],
      wires: [fw('fw1', 'd1:J', 'd2:A1'), fw('fw2', 'd2:A2', 'd5:J'), fw('fw3', 'd2:A1', 'd3:15'), fw('fw4', 'd3:18', 'd4:X1'), fw('fw5', 'd4:X2', 'd5:J')] } } };
  await page.evaluate(p => { const prev = App.currentId; localStorage.setItem('plc-trainer.schStyle', 'free'); App.openNew(JSON.parse(JSON.stringify(p))); if (prev) Store.remove(prev); App.showView('schematic'); }, editP);
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(250);
  // a selector click (retried): the drawing is redrawn whenever its live state changes. Two clicks on one symbol within
  // 400 ms are a double click (the tag form), so each click waits that long
  const clickSym = async id => { await page.click(`#view-schematic [data-fi="${id}"] .hit`); await wait(450); };
  await clickSym('d2');
  check('properties: one selected symbol shows its tag, a comment and its device settings (coil voltage, delay) in the side panel', await page.evaluate(() => ['[data-fp="tag"]', '[data-fp="c"]', '[data-fpd="coil"]', '[data-fpd="t"]'].every(s => document.querySelector('#view-schematic ' + s))));
  await page.evaluate(() => { const i = document.querySelector('#view-schematic [data-fpd="t"]'); i.value = '3'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(150);
  check('properties: a delay set in the diagram is the device setting (the Wiring shows the same value)', await page.evaluate(() => { const d = App.project.circuit.comps.find(c => c.props.label === 'KT1'); App.showView('wiring'); Workspace.selectComp(d.id); const v = document.querySelector('[data-pk="t"]').value; App.showView('schematic'); return d.props.t === 3 && v === '3'; }));
  await page.evaluate(() => { App.showView('wiring'); }); await wait(100);
  await page.selectOption('[data-pk="coil"]', '24VDC'); await wait(100);
  await page.evaluate(() => App.showView('schematic')); await wait(150); await clickSym('d2');
  check('properties: a coil voltage changed in the Wiring shows in the diagram properties', await page.evaluate(() => document.querySelector('#view-schematic [data-fpd="coil"]').value === '24VDC'));
  await page.evaluate(() => { const i = document.querySelector('#view-schematic [data-fp="c"]'); i.value = 'Star-delta changeover'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(150);
  check('properties: a comment is saved on the symbol and drawn under its tag', await page.evaluate(() => App.project.schematic.free.items.find(i => i.id === 'd2').c === 'Star-delta changeover' && [...document.querySelectorAll('#view-schematic .fcmt')].some(t => t.textContent === 'Star-delta changeover')));
  check('properties: the comment survives save and reload', await page.evaluate(() => App.buildProject(JSON.parse(JSON.stringify(App.serialize()))).schematic.free.items.find(i => i.id === 'd2').c === 'Star-delta changeover'));
  await clickSym('d4');
  await page.evaluate(() => { const i = document.querySelector('#view-schematic [data-fp="tag"]'); i.value = 'KT1'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(150);
  check('properties: a tag of another kind of device is reported (one tag, one device) and nothing is rewired', await page.evaluate(() => { const it = App.project.schematic.free.items.find(i => i.id === 'd4'); return it.tag === 'KT1' && /KT1 is a .* not a Pilot Lamp/.test(FreeDraw.errs.get(it) || ''); }));
  await page.evaluate(() => Schematic.undo()); await wait(100);
  check('properties: Undo takes the tag back', await page.evaluate(() => App.project.schematic.free.items.find(i => i.id === 'd4').tag === 'H1' && FreeDraw.errs.size === 0));
  // selection: all, nudge, Shift+click, box
  check('editing: Ctrl+A selects every symbol and an arrow key moves them all one grid step; Undo moves them back', await page.evaluate(() => {
    FreeDraw.selectAll(); const all = FreeDraw.selection().length, x0 = App.project.schematic.free.items.map(i => i.x);
    FreeDraw.nudge(10, 0); const moved = App.project.schematic.free.items.every((i, n) => i.x === x0[n] + 10);
    Schematic.undo(); return all === 5 && moved && App.project.schematic.free.items.every((i, n) => i.x === x0[n]);
  }));
  await page.evaluate(() => FreeDraw.resetSel());
  await clickSym('d2'); await page.keyboard.press('ArrowDown'); await wait(120);
  check('editing: the arrow keys move the selected symbol on the drawing', await page.evaluate(() => App.project.schematic.free.items.find(i => i.id === 'd2').y === 130));
  await page.evaluate(() => Schematic.undo()); await wait(100);
  await clickSym('d2'); await page.keyboard.down('Shift'); await clickSym('d3'); await page.keyboard.up('Shift');
  check('editing: Shift+click adds a symbol to the selection', await page.evaluate(() => FreeDraw.selection().sort().join() === 'd2,d3' && document.querySelectorAll('#view-schematic .fitem.sel').length === 2));
  const bx = await page.evaluate(() => { const r = id => document.querySelector(`#view-schematic [data-fi="${id}"] .hit`).getBoundingClientRect(); const a = r('d3'), b = r('d4'); return { x1: Math.min(a.left, b.left) - 15, y1: Math.min(a.top, b.top) - 15, x2: Math.max(a.right, b.right) + 15, y2: Math.max(a.bottom, b.bottom) + 15 }; });
  await page.evaluate(() => FreeDraw.resetSel());
  await page.keyboard.down('Shift'); await page.mouse.move(bx.x2, bx.y1); await page.mouse.down(); await page.mouse.move((bx.x1 + bx.x2) / 2, (bx.y1 + bx.y2) / 2, { steps: 3 }); await page.mouse.move(bx.x1 + 5, bx.y2, { steps: 3 }); await page.mouse.up(); await page.keyboard.up('Shift'); await wait(150);
  check('editing: Shift+drag on the drawing selects the symbols inside the box', await page.evaluate(() => FreeDraw.selection().sort().join() === 'd3,d4'), await page.evaluate(() => FreeDraw.selection().join()));
  check('editing: Delete removes the whole selection with its wires; Undo brings it all back', await page.evaluate(() => {
    const F = () => App.project.schematic.free; FreeDraw.del(); const gone = !F().items.some(i => i.id === 'd3' || i.id === 'd4') && !F().wires.some(w => /d[34]:/.test(w.a + w.b));
    Schematic.undo(); return gone && F().items.length === 5 && F().wires.length === 5;
  }));
  // clipboard
  await page.evaluate(() => FreeDraw.resetSel()); await clickSym('d2'); await page.keyboard.down('Shift'); await clickSym('d3'); await page.keyboard.up('Shift');
  await page.keyboard.press('Control+C'); await page.keyboard.press('Control+V'); await wait(200);
  check('editing: Ctrl+C / Ctrl+V pastes the coil and its contact as one new device, with the wire between them', await page.evaluate(() => {
    const F = App.project.schematic.free, nw = F.items.filter(i => !['d1', 'd2', 'd3', 'd4', 'd5'].includes(i.id)), tags = [...new Set(nw.map(i => i.tag))];
    const d = App.project.circuit.comps.find(c => c.props.label === tags[0]);
    return nw.length === 2 && tags.length === 1 && tags[0] !== 'KT1' && !!d && d.type === 'timer' && F.wires.some(w => nw.some(i => w.a.startsWith(i.id + ':')) && nw.some(i => w.b.startsWith(i.id + ':'))) && FreeDraw.selection().length === 2 && FreeDraw.errs.size === 0;
  }));
  await page.evaluate(() => Schematic.undo()); await wait(100);
  check('editing: D duplicates one symbol with the next free tag, as before', await page.evaluate(() => { FreeDraw.resetSel(); return true; }) && await (async () => { await clickSym('d4'); await page.keyboard.press('d'); await wait(150); return page.evaluate(() => App.project.schematic.free.items.some(i => i.k === 'lamp' && i.tag === 'H2')); })());
  await page.evaluate(() => Schematic.undo());
  // library search and grid
  await page.fill('#view-schematic .fd-search', 'timer coil'); await wait(100);
  check('library: the search finds symbols by name in every group', await page.evaluate(() => { const k = [...document.querySelectorAll('#view-schematic .fd-ico')].map(b => b.dataset.fk); return k.length >= 2 && k.includes('ktcoil') && k.includes('kfcoil') && k.every(x => /timer coil/i.test(FreeDraw.KINDS[x].n)); }));
  await page.fill('#view-schematic .fd-search', 'zzzz'); await wait(100);
  check('library: a search with no match says so', await page.evaluate(() => !document.querySelector('#view-schematic .fd-ico') && document.querySelector('#view-schematic .fd-grid').textContent.includes('No symbol matches')));
  await page.fill('#view-schematic .fd-search', ''); await wait(100);
  check('grid: lines, dots or no grid, remembered in this browser', await page.evaluate(() => {
    const fill = () => document.querySelector('#view-schematic .fbg').getAttribute('fill');
    FreeDraw.setGrid('none'); const a = fill() === 'transparent' && localStorage.getItem('plc-trainer.fdGrid') === 'none';
    FreeDraw.setGrid('dots'); const b = fill() === 'url(#fdGrid)'; FreeDraw.setGrid('lines'); return a && b && fill() === 'url(#fdGrid2)';
  }));
  // picture of the drawing
  check('image: the drawing as an SVG has its symbols, tags and colours but no grid or terminal handles', await page.evaluate(() => {
    FreeDraw.resetSel(); Schematic.render(); const s = FreeDraw.imageSvg(), doc = new DOMParser().parseFromString(s, 'image/svg+xml');
    return !doc.querySelector('parsererror') && doc.documentElement.nodeName === 'svg' && s.includes('-KT1') && s.includes('-H1') && !/data-ft|class=|url\(#fdGrid/.test(s) && doc.querySelectorAll('path').length > 5;
  }));
  await page.evaluate(() => { FreeDraw.resetSel(); Schematic.render(); }); await wait(100);
  const dlSvg = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.evaluate(() => document.querySelector('#view-schematic [data-fd="svg"]').click()); const svgFile = await dlSvg;
  const dlPng = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.evaluate(() => document.querySelector('#view-schematic [data-fd="png"]').click()); const pngFile = await dlPng;
  check('image: Save as SVG and Save as PNG download the drawing', !!svgFile && /\.svg$/.test(svgFile.suggestedFilename()) && !!pngFile && /\.png$/.test(pngFile.suggestedFilename()), `${svgFile && svgFile.suggestedFilename()} ${pngFile && pngFile.suggestedFilename()}`);
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); App.showView('ladder'); });

  console.log('Electrical Diagram: more parts (changeover, crossover, NO+NC selector, 1-2 pole protection, RCBO 4P, bell, siren)');
  check('parts: the new devices are in the Wiring parts list and the new symbols in the diagram library', await page.evaluate(() => {
    const devs = ['pb_cx', 'sel_cx', 'sel_co', 'pb_x', 'sel_x', 'rcbo4', 'isol1', 'isol2', 'bell', 'siren'];
    const syms = ['esno', 'pbcx', 'selcx', 'selcono', 'selconc', 'pbx', 'selx', 'ka1co', 'ka2co', 'ktco', 'kfco', 'ltco', 'bell', 'siren', 'km1', 'rcbo4', 'qs1', 'qs2', 'ol1', 'ol2', 'qm1', 'qm2', 'fsw1', 'fsw2'];
    return devs.every(t => Circuit.DEFS[t] && !Circuit.DEFS[t].hidden) && syms.every(k => FreeDraw.KINDS[k] && Circuit.DEFS[FreeDraw.KINDS[k].type].terms && FreeDraw.KINDS[k].terms.every(t => Circuit.DEFS[FreeDraw.KINDS[k].type].terms.some(x => x.id === t.id)));
  }));
  check('parts: a changeover push button joins 11-12 at rest and 11-14 while pressed', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), s = add('pb_cx'), a = add('lamp', { coil: '230VAC' }), b = add('lamp', { coil: '230VAC' });
    w(q, 'L', s, '11'); w(s, '12', a, 'X1'); w(s, '14', b, 'X1'); w(a, 'X2', q, 'N'); w(b, 'X2', q, 'N');
    run(); const rest = a.state.on && !b.state.on; s.state.pressed = true; run(); return rest && !a.state.on && b.state.on;`)));
  check('parts: a NO+NC selector closes 13-14 and opens 21-22 in position I, and stays there', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), s = add('sel_co'), a = add('lamp', { coil: '230VAC' }), b = add('lamp', { coil: '230VAC' });
    w(q, 'L', s, '13'); w(q, 'L', s, '21'); w(s, '14', a, 'X1'); w(s, '22', b, 'X1'); w(a, 'X2', q, 'N'); w(b, 'X2', q, 'N');
    run(); const p0 = !a.state.on && b.state.on; Circuit.part(s, 'knob', 'down'); run(); const p1 = a.state.on && !b.state.on; Circuit.part(s, 'knob', 'up'); run(); return p0 && p1 && a.state.on;`)));
  check('parts: a crossover switch reverses a DC motor (1-4 / 3-2 at rest, 1-2 / 3-4 operated)', await page.evaluate(new Function(solveKit + `
    const t = type => { circ.comps.length = 0; circ.wires.length = 0; const b = add('battery'), s = add(type), m = add('motordc');
      w(b, 'P', s, '1'); w(b, 'M', s, '3'); w(s, '2', m, 'A1'); w(s, '4', m, 'A2'); for (let i = 0; i < 30; i++) Circuit.solve(circ, 0.1, ctx); const d0 = m.state.dir;
      if (type === 'pb_x') s.state.pressed = true; else s.state.pos = 1; for (let i = 0; i < 30; i++) Circuit.solve(circ, 0.1, ctx); return [d0, m.state.dir]; };
    const a = t('pb_x'), b = t('sel_x'); return !!a[0] && a[0] === -a[1] && !!b[0] && b[0] === -b[1];`)));
  check('parts: 1- and 2-pole disconnectors switch their poles; an RCBO 4P trips on a short behind it', await page.evaluate(new Function(solveKit + `
    const q = add('supply3'), i1 = add('isol1'), h = add('lamp', { coil: '230VAC' }); w(q, 'L1', i1, '1'); w(i1, '2', h, 'X1'); w(h, 'X2', q, 'N');
    run(); const off = !h.state.on; i1.state.on = true; run(); const on = h.state.on;
    const i2 = add('isol2', {}, { on: true }), h2 = add('lamp', { coil: '230VAC' }); w(q, 'L2', i2, '1'); w(q, 'N', i2, '3'); w(i2, '2', h2, 'X1'); w(i2, '4', h2, 'X2'); run();
    const r = add('rcbo4', {}, { on: true }); w(q, 'L1', r, '1'); w(q, 'L2', r, '3'); w(q, 'L3', r, '5'); w(q, 'N', r, '7'); w(r, '2', r, '8'); run();
    return off && on && h2.state.on && r.state.tripped;`)));
  check('parts: a bell and a siren sound at their rated voltage', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), b = add('bell', { coil: '230VAC' }), s = add('siren', { coil: '230VAC' });
    w(q, 'L', b, 'X1'); w(b, 'X2', q, 'N'); w(q, 'L', s, 'X1'); w(s, 'X2', q, 'N'); run(); return b.state.on && s.state.on && !b.state.burnt;`)));
  // a relay changeover contact drawn in the diagram: KA1 pulled moves 11 from 12 (H1) to 14 (H2); the symbol shows it
  const coP = { name: 'Changeover', circuit: { seq: 5, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }], wires: [] },
    schematic: { free: { seq: 40, items: [fi('d1', 'pL1', 'XP1', 0, 0), fi('d2', 'pbno', 'S1', 0, 100), fi('d3', 'kacoil', 'KA1', 0, 220), fi('d4', 'pN', 'XP2', 0, 340),
      fi('d5', 'pL1', 'XP3', 200, 0), fi('d6', 'ka1co', 'KA1', 200, 100), fi('d7', 'lamp', 'H1', 160, 220), fi('d8', 'lamp', 'H2', 240, 220), fi('d9', 'pN', 'XP4', 200, 340), fi('d10', 'esno', 'S9', 400, 100), fi('d11', 'lamp', 'H3', 400, 220)],
    wires: [fw('fw1', 'd1:J', 'd2:13'), fw('fw2', 'd2:14', 'd3:A1'), fw('fw3', 'd3:A2', 'd4:J'), fw('fw4', 'd5:J', 'd6:11'), fw('fw5', 'd6:12', 'd7:X1'), fw('fw6', 'd6:14', 'd8:X1'),
      fw('fw7', 'd7:X2', 'd9:J'), fw('fw8', 'd8:X2', 'd9:J'), fw('fw9', 'd5:J', 'd10:13'), fw('fw10', 'd10:14', 'd11:X1'), fw('fw11', 'd11:X2', 'd9:J')] } } };
  await page.evaluate(p => { const prev = App.currentId; localStorage.setItem('plc-trainer.schStyle', 'free'); App.openNew(JSON.parse(JSON.stringify(p))); if (prev) Store.remove(prev); App.showView('schematic'); }, coP);
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(250);
  check('parts: a drawn relay changeover contact feeds H1 at rest and no error is reported', await until(is("d('H1').on && !d('H2').on")) && await page.evaluate(() => FreeDraw.errs.size === 0 && App.project.circuit.comps.find(c => c.props.label === 'KA1').type === 'relay'));
  await page.evaluate(() => { window.__up = App.operate(App.project.circuit.comps.find(c => c.props.label === 'S1'), 'btn'); });
  check('parts: with KA1 pulled in it switches to H2, and the changeover symbol shows it operated', await until(is("d('KA1').pulled && !d('H1').on && d('H2').on")) && await (async () => { await wait(150); return page.evaluate(() => document.querySelector('#view-schematic [data-fi="d6"] .ssym').classList.contains('on')); })());
  await page.evaluate(() => { if (typeof window.__up === 'function') window.__up(); });
  await page.evaluate(() => App.operate(App.project.circuit.comps.find(c => c.props.label === 'S9'), 'btn'));
  check('parts: the E-stop N.O. 13-14 symbol closes when the E-stop is pushed (H3 on)', await until(is("d('S9').latched && d('H3').on")));
  check('parts: a drawing with the new symbols survives save and reload', await page.evaluate(() => { const p = App.buildProject(JSON.parse(JSON.stringify(App.serialize()))); return ['ka1co', 'esno'].every(k => p.schematic.free.items.some(i => i.k === k)) && p.schematic.free.items.length === 11 && !(p.keep && p.keep.free.items.length); }));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); App.showView('ladder'); });

  console.log('Electrical Diagram: timing and monitoring (flasher, on/off delay, flashing lamp, phase failure relay, countdown, conductor colours)');
  check('timing: the new devices are in the Wiring parts list and the new symbols fit their terminals', await page.evaluate(() => {
    const devs = ['timer_onoff', 'flasher', 'phasemon', 'lamp_fl'];
    const syms = ['kdno', 'kdnc', 'kdco', 'flno', 'flnc', 'flco', 'kpno', 'kpnc', 'kpco', 'kdcoil', 'flcoil', 'kpmon', 'lampfl'];
    return devs.every(t => Circuit.DEFS[t] && !Circuit.DEFS[t].hidden) && syms.every(k => FreeDraw.KINDS[k] && FreeDraw.KINDS[k].terms.every(t => Circuit.DEFS[FreeDraw.KINDS[k].type].terms.some(x => x.id === t.id)));
  }));
  check('timing: a flasher relay switches 15-18 on and off while its coil is on, and rests on 15-16 when it drops', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), s = add('isol1'), k = add('flasher', { t: 0.5, t2: 0.3 }), a = add('lamp', { coil: '230VAC' }), b = add('lamp', { coil: '230VAC' });
    w(q, 'L', s, '1'); w(s, '2', k, 'A1'); w(k, 'A2', q, 'N'); w(q, 'L', k, '15'); w(k, '18', a, 'X1'); w(k, '16', b, 'X1'); w(a, 'X2', q, 'N'); w(b, 'X2', q, 'N');
    run(2); const rest = !a.state.on && b.state.on; s.state.on = true; const seq = [];
    for (let i = 0; i < 24; i++) { Circuit.solve(circ, 0.1, ctx); seq.push(a.state.on ? 1 : 0); }
    const flips = seq.slice(1).filter((x, i) => x !== seq[i]).length, ons = seq.filter(Boolean).length;
    s.state.on = false; run(2);
    return rest && seq[0] === 1 && flips >= 4 && ons > seq.length / 2 && !a.state.on && b.state.on;`)));
  check('timing: an on/off-delay relay closes after the on delay and opens after the off delay', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), s = add('isol1'), k = add('timer_onoff', { t: 1, t2: 2 }), h = add('lamp', { coil: '230VAC' });
    w(q, 'L', s, '1'); w(s, '2', k, 'A1'); w(k, 'A2', q, 'N'); w(q, 'L', k, '15'); w(k, '18', h, 'X1'); w(h, 'X2', q, 'N');
    run(2); s.state.on = true; run(5); const early = !h.state.on; run(7); const on = h.state.on;
    s.state.on = false; run(10); const held = h.state.on; run(12); return early && on && held && !h.state.on;`)));
  check('timing: a flashing lamp flashes at its rated voltage and is dark without power', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), s = add('isol1'), h = add('lamp_fl', { coil: '230VAC', hz: '1' });
    w(q, 'L', s, '1'); w(s, '2', h, 'X1'); w(h, 'X2', q, 'N'); run(2); const dark = !h.state.lit;
    s.state.on = true; const seq = []; for (let i = 0; i < 25; i++) { Circuit.solve(circ, 0.1, ctx); seq.push(h.state.lit ? 1 : 0); }
    s.state.on = false; run(2); return dark && seq.includes(1) && seq.includes(0) && seq.slice(1).filter((x, i) => x !== seq[i]).length >= 3 && !h.state.lit && !h.state.burnt;`)));
  check('timing: a phase failure relay closes 11-14 on a healthy supply and drops on a lost phase or a wrong sequence', await page.evaluate(new Function(solveKit + `
    const t = (order, cut, seq) => { circ.comps.length = 0; circ.wires.length = 0; const q = add('supply3'), k = add('phasemon', { seq }), h = add('lamp', { coil: '230VAC' });
      ['L1', 'L2', 'L3'].forEach((p, i) => { if (p !== cut) w(q, order[i], k, p); }); w(q, 'L1', k, '11'); w(k, '14', h, 'X1'); w(h, 'X2', q, 'N'); run(3); return [k.state.ok, h.state.on, k.state.fault]; };
    const ok = t(['L1', 'L2', 'L3'], '', 'on'), loss = t(['L1', 'L2', 'L3'], 'L3', 'on'), rev = t(['L2', 'L1', 'L3'], '', 'on'), revOff = t(['L2', 'L1', 'L3'], '', 'off');
    return ok[0] && ok[1] && !loss[0] && !loss[1] && loss[2] === 'phase loss' && !rev[1] && rev[2] === 'sequence' && revOff[1];`)));
  // drawn: S1 → on-delay timer KT1 (1 s); a flashing lamp H1 straight on L1-N; a phase failure relay KF1 on the 3-phase supply with its contact feeding H2
  const tmP = { name: 'Timing', circuit: { seq: 5, comps: [{ id: 'c1', type: 'supply3', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } },
    { id: 'c2', type: 'timer', x: 0, y: 200, props: { label: 'KT1', coil: '230VAC', t: 1 }, state: {} }, { id: 'c3', type: 'lamp_fl', x: 0, y: 300, props: { label: 'H1', coil: '230VAC', hz: '2' }, state: {} },
    { id: 'c4', type: 'lamp', x: 0, y: 400, props: { label: 'H2', coil: '230VAC', color: 'green' }, state: {} }], wires: [] },
    schematic: { free: { seq: 40, items: [fi('d1', 'pL1', 'XP1', 0, 0), fi('d2', 'pbno', 'S1', 0, 100), fi('d3', 'ktcoil', 'KT1', 0, 220), fi('d4', 'pN', 'XP2', 0, 340),
      fi('d5', 'pL1', 'XP3', 200, 0), fi('d6', 'lampfl', 'H1', 200, 160), fi('d7', 'pN', 'XP4', 200, 340),
      fi('d8', 'pL1', 'XP5', 380, 0), fi('d9', 'pL2', 'XP6', 420, 0), fi('d10', 'pL3', 'XP7', 460, 0), fi('d11', 'kpmon', 'KF1', 420, 100), fi('d12', 'kpno', 'KF1', 560, 120), fi('d13', 'lamp', 'H2', 560, 230), fi('d14', 'pN', 'XP8', 560, 340), fi('d15', 'pL1', 'XP9', 560, 0)],
    wires: [fw('fw1', 'd1:J', 'd2:13'), fw('fw2', 'd2:14', 'd3:A1'), fw('fw3', 'd3:A2', 'd4:J'), fw('fw4', 'd5:J', 'd6:X1'), fw('fw5', 'd6:X2', 'd7:J'),
      fw('fw6', 'd8:J', 'd11:L1'), fw('fw7', 'd9:J', 'd11:L2'), fw('fw8', 'd10:J', 'd11:L3'), fw('fw9', 'd15:J', 'd12:11'), fw('fw10', 'd12:14', 'd13:X1'), fw('fw11', 'd13:X2', 'd14:J')] } } };
  await page.evaluate(p => { const prev = App.currentId; localStorage.setItem('plc-trainer.schStyle', 'free'); App.openNew(JSON.parse(JSON.stringify(p))); if (prev) Store.remove(prev); App.showView('schematic'); FreeDraw.setColors(false); }, tmP);
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(250);
  check('timing: the drawn phase failure relay sees the healthy supply and its N.O. contact lights H2; no error is reported', await until(is("d('KF1').ok && d('H2').on")) && await page.evaluate(() => FreeDraw.errs.size === 0 && App.project.circuit.comps.find(c => c.props.label === 'KF1').type === 'phasemon'));
  check('timing: the drawn flashing lamp flashes on the drawing', await page.evaluate(() => new Promise(res => { const seen = new Set(); let n = 0;
    const t = setInterval(() => { const g = document.querySelector('#view-schematic [data-fi="d6"] .ssym'); if (g) seen.add(g.classList.contains('on')); if (++n > 40 || seen.size === 2) { clearInterval(t); res(seen.size === 2 && App.project.circuit.comps.find(c => c.props.label === 'H1').state.on); } }, 50); })));
  await page.evaluate(() => { window.__up = App.operate(App.project.circuit.comps.find(c => c.props.label === 'S1'), 'btn'); });
  check('timing: while KT1 times, its coil shows the time left counting down', await page.evaluate(() => new Promise(res => { const vals = []; let n = 0;
    const t = setInterval(() => { const e = document.querySelector('#view-schematic [data-fi="d3"] .fcount'); if (e) vals.push(parseFloat(e.textContent)); if (++n > 16) { clearInterval(t); res(vals.length >= 2 && vals[0] <= 1 && vals[vals.length - 1] < vals[0] && /^\d\.\d s$/.test(e ? e.textContent : '0.0 s')); } }, 50); })));
  check('timing: when KT1 has timed out the countdown is gone', await until(is("d('KT1').done")) && await (async () => { await wait(150); return page.evaluate(() => !document.querySelector('#view-schematic [data-fi="d3"] .fcount')); })());
  await page.evaluate(() => { if (typeof window.__up === 'function') window.__up(); });
  await page.evaluate(() => { const b = document.querySelector('#view-schematic [data-fdact="colors"]'); if (b) b.click(); });
  await wait(150);
  check('timing: 🎨 Colours colours each drawn wire by its conductor (L1, L2, L3, N) and is remembered', await page.evaluate(() => { const q = s => document.querySelectorAll('#view-schematic .fwire .w.' + s).length;
    return FreeDraw.colors && q('pc-L1') >= 3 && q('pc-L2') === 1 && q('pc-L3') === 1 && q('pc-N') >= 2 && localStorage.getItem('plc-trainer.fdColors') === '1'; }));
  await page.evaluate(() => { document.querySelector('#view-schematic [data-fdact="colors"]').click(); });
  await wait(100);
  check('timing: with 🎨 Colours off the wires are drawn in the one line colour again', await page.evaluate(() => !FreeDraw.colors && !document.querySelector('#view-schematic .fwire .w[class*="pc-"]')));
  // audit fixes: a finger lifted off the redrawn drawing, editing keys in ▶ Play, a stale multi-selection
  check('audit: a touch lifted outside the redrawn drawing does not block the next tap (no false pinch)', await page.evaluate(async () => {
    const pe = (el, type, id, it) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); };
    const sym = id => document.querySelector(`#view-schematic [data-fi="${id}"] .hit`);
    pe(sym('d13'), 'pointerdown', 41); await new Promise(r => setTimeout(r, 50));
    document.body.dispatchEvent(new PointerEvent('pointerup', { pointerId: 41, pointerType: 'touch', bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    pe(sym('d11'), 'pointerdown', 42); await new Promise(r => setTimeout(r, 30)); pe(sym('d11'), 'pointerup', 42); await new Promise(r => setTimeout(r, 100));
    const it = FreeDraw.selected(); return !!it && it.id === 'd11';
  }));
  check('audit: in ▶ Play, Delete and Ctrl+A do not edit the drawing', await page.evaluate(async () => {
    const n = App.project.schematic.free.items.length; document.querySelector('#view-schematic [data-smode="run"]').click(); await new Promise(r => setTimeout(r, 100));
    FreeDraw.onKey(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true })); FreeDraw.onKey(new KeyboardEvent('keydown', { key: 'Delete' }));
    const same = App.project.schematic.free.items.length === n; document.querySelector('#view-schematic [data-smode="edit"]').click(); await new Promise(r => setTimeout(r, 100)); return same;
  }));
  check('audit: after Ctrl+A, a newly added symbol is the only one selected, so Delete removes just it', await page.evaluate(() => {
    const n = App.project.schematic.free.items.length; FreeDraw.selectAll(); FreeDraw.add('lamp', 'H77', 800, 400); const added = App.project.schematic.free.items.length === n + 1;
    FreeDraw.del(); const F = App.project.schematic.free; return added && F.items.length === n && !F.items.some(i => i.tag === 'H77');
  }));
  check('timing: a drawing with the new symbols survives save and reload', await page.evaluate(() => { const p = App.buildProject(JSON.parse(JSON.stringify(App.serialize())));
    return ['kpmon', 'kpno', 'lampfl'].every(k => p.schematic.free.items.some(i => i.k === k)) && p.schematic.free.items.length === 15 && ['phasemon', 'lamp_fl'].every(t => p.circuit.comps.some(c => c.type === t)) && !(p.keep && p.keep.free.items.length); }));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); localStorage.removeItem('plc-trainer.fdColors'); const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); App.showView('ladder'); });

  console.log('Running feedback example: HMI → PLC → Wiring and back, with a discrepancy alarm');
  await page.evaluate(() => { const prev = App.currentId; if (App.openNew(Examples.EX.plcfeedback.build()) && prev) Store.remove(prev); App.showView('hmi'); });
  await setMode('RUN');
  // the HMI as the operator sees it: the text of an indicator, and whether an alarm banner shows
  const hmiInd = l => page.evaluate(l => { const e = [...document.querySelectorAll('#view-hmi .h-ind')].find(x => x.querySelector('small').textContent === l); return e ? e.querySelector('[data-t]').textContent : null; }, l);
  const hmiAlarm = t => page.evaluate(t => [...document.querySelectorAll('#view-hmi .t-alarm.on .h-alarm')].some(x => x.textContent.includes(t)), t);
  check('feedback: the example loads quietly; F1 95-96 is in the coil circuit, the coil is fed after QF1 and KM1 13-14 goes to I:0/3', await page.evaluate(() => {
    const C = App.project.circuit, id = l => C.comps.find(c => c.props.label === l).id, has = (a, b) => C.wires.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a));
    return App.compat().length === 0 && has(id('F1') + ':96', id('KM1') + ':A1') && has(id('PLC') + ':O0', id('F1') + ':95') && has(id('QF1') + ':2', id('PLC') + ':VAC0') && has(id('KM1') + ':14', id('PLC') + ':I3');
  }));
  check('feedback: the HMI reads PLC data only, and its motor and RUNNING indicator follow the feedback input I:0/3, not the command', await page.evaluate(() => {
    const H = App.project.hmi.objects, addr = /^(I|O|B3|T4|C5|N7):/;
    return H.every(o => !o.tag || addr.test(o.tag)) && H.find(o => o.type === 'motor').tag === 'I:0/3' && H.find(o => o.label === 'MOTOR').tag === 'I:0/3';
  }));
  await hmiTap('START');
  check('feedback: HMI START → O:0/0 → KM1 pulls in, its 13-14 sets I:0/3, M1 runs, H1 lights and the HMI shows RUNNING', await until(is("r('O:0/0') === 1 && d('KM1').pulled && r('I:0/3') === 1 && d('M1').drive === 'run' && d('H1').on")) && await (async () => { await wait(150); return (await hmiInd('MOTOR')) === 'RUNNING'; })());
  await hmiTap('STOP');
  check('feedback: HMI STOP drops the command and the feedback; the HMI shows NOT RUNNING', await until(is("r('O:0/0') === 0 && r('I:0/3') === 0 && !d('KM1').pulled")) && await (async () => { await wait(150); return (await hmiInd('MOTOR')) === 'NOT RUNNING'; })());
  await op('QF1', 'h');
  await hmiTap('START');
  check('feedback: with QF1 off, START sets the command but KM1 cannot pull in: the HMI shows COMMAND ON and NOT RUNNING', await until(is("!d('QF1').on && r('O:0/0') === 1 && r('I:0/3') === 0 && !d('KM1').pulled && d('M1').drive === 'off'"), null, 1500) && await (async () => { await wait(150); return (await hmiInd('COMMAND')) === 'ON' && (await hmiInd('MOTOR')) === 'NOT RUNNING'; })());
  check('feedback: after 2 s the discrepancy alarm latches, drops the command, lights H2 and shows on the HMI', await until(is("r('B3:0/14') === 1 && r('O:0/0') === 0 && d('H2').on"), null, 4000) && await (async () => { await wait(150); return hmiAlarm('DISCREPANCY'); })());
  await op('QF1', 'h'); await hmiTap('START'); await wait(300);
  check('feedback: START does nothing while the alarm is latched', await page.evaluate(is("r('B3:0/14') === 1 && r('O:0/0') === 0 && !d('KM1').pulled")));
  await hmiTap('RESET');
  check('feedback: HMI RESET clears the alarm and the banner', await until(is("r('B3:0/14') === 0 && !d('H2').on")) && await (async () => { await wait(150); return !(await hmiAlarm('DISCREPANCY')); })());
  await hmiTap('START');
  check('feedback: with QF1 back on, START runs the motor again with RUNNING feedback', await until(is("r('O:0/0') === 1 && r('I:0/3') === 1 && d('M1').drive === 'run'")));
  await op('M1', 'jam');
  check('feedback: a jammed motor trips F1; its 95-96 drops KM1 and its 97-98 sets I:0/2, the rung drops the command and the overload alarm shows', await until(is("d('F1').tripped && !d('KM1').pulled && r('I:0/2') === 1 && r('O:0/0') === 0 && r('B3:0/15') === 1"), null, 10000) && await (async () => { await wait(150); return hmiAlarm('OVERLOAD'); })());
  await wait(2500);
  check('feedback: an overload trip is not a discrepancy (command and feedback dropped together)', await page.evaluate(is("r('B3:0/14') === 0")));
  await op('M1', 'jam'); await op('F1', 'reset');
  check('feedback: lesson 17 uses this example and checks its three steps live', await page.evaluate(() => { const l = Examples.LESSONS.find(x => x.id === 'l17'); return !!l && l.ex === 'plcfeedback' && l.goals.length === 3; }));
  check('feedback: the example saves and reloads with its wiring, ladder and HMI', await page.evaluate(() => { const s = App.serialize(), p = App.buildProject(JSON.parse(JSON.stringify(s)));
    return p.circuit.wires.length === s.circuit.wires.length && p.ladder.rungs.length === 8 && p.hmi.objects.length === 10 && !(p.keep && p.keep.comps && p.keep.comps.length); }));
  await setMode('PROG');
  await page.evaluate(() => { const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); App.showView('ladder'); });
  console.log('Simurelay parity: N.C. main poles, delay blocks, N.C.+N.O., changeovers, 1/2/4-pole protections, generator auto, PLC paste');
  check('parity: the new devices are in the parts list and every new symbol fits its device', await page.evaluate(() => {
    const devs = ['contactor_nc', 'contactor_ton', 'contactor_tof', 'estop_co', 'limit_co', 'fsw1', 'fsw2', 'fsw1n', 'fsw3n', 'fsw4', 'mpcb1', 'mpcb2', 'mpcb4', 'olr1', 'olr2'];
    const syms = ['pbnonc', 'selnonc', 'esnonc', 'esco', 'lsnonc', 'lsco', 'kmnonc', 'kanonc', 'olco', 'kbonnc', 'kbonno', 'kbonco', 'kbonnonc', 'kbofnc', 'kbofno', 'kbofco', 'kbofnonc', 'kmn1', 'kmn2', 'kmn3', 'kmn4', 'ol1', 'ol2', 'qm1', 'qm2', 'qm4', 'fsw1', 'fsw2', 'fsw1n', 'fsw3n', 'fsw4', 'gen'];
    return devs.every(t => Circuit.DEFS[t] && !Circuit.DEFS[t].hidden) && syms.every(k => FreeDraw.KINDS[k] && FreeDraw.KINDS[k].terms.every(t => Circuit.DEFS[FreeDraw.KINDS[k].type].terms.some(x => x.id === t.id)));
  }));
  check('parity: a contactor with N.C. main poles feeds its load at rest and cuts it when the coil pulls in (aux 13-14 / 21-22 too)', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), s = add('isol1'), k = add('contactor_nc', { coil: '230VAC' }), h = add('lamp', { coil: '230VAC' }), a = add('lamp', { coil: '230VAC' });
    w(q, 'L', s, '1'); w(s, '2', k, 'A1'); w(k, 'A2', q, 'N'); w(q, 'L', k, '7'); w(k, '8', h, 'X1'); w(h, 'X2', q, 'N'); w(q, 'L', k, '13'); w(k, '14', a, 'X1'); w(a, 'X2', q, 'N');
    run(); const rest = h.state.on && !a.state.on; s.state.on = true; run(); return rest && !h.state.on && a.state.on;`)));
  check('parity: an on-delay contact block switches 55-56 / 55-58 / 67-68 after its delay and back at once', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), s = add('isol1'), k = add('contactor_ton', { coil: '230VAC', t: 1 }), n = add('lamp', { coil: '230VAC' }), o = add('lamp', { coil: '230VAC' }), p = add('lamp', { coil: '230VAC' });
    w(q, 'L', s, '1'); w(s, '2', k, 'A1'); w(k, 'A2', q, 'N'); w(q, 'L', k, '55'); w(k, '56', n, 'X1'); w(k, '58', o, 'X1'); w(q, 'L', k, '67'); w(k, '68', p, 'X1'); [n, o, p].forEach(x => w(x, 'X2', q, 'N'));
    run(2); const r0 = n.state.on && !o.state.on && !p.state.on; s.state.on = true; run(5); const r1 = k.state.pulled && n.state.on && !p.state.on; run(7);
    const r2 = !n.state.on && o.state.on && p.state.on; s.state.on = false; run(1); return r0 && r1 && r2 && n.state.on && !p.state.on;`)));
  check('parity: an off-delay contact block switches at once and goes back its delay after the coil drops', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), s = add('isol1'), k = add('contactor_tof', { coil: '230VAC', t: 1 }), p = add('lamp', { coil: '230VAC' });
    w(q, 'L', s, '1'); w(s, '2', k, 'A1'); w(k, 'A2', q, 'N'); w(q, 'L', k, '67'); w(k, '68', p, 'X1'); w(p, 'X2', q, 'N');
    run(2); const r0 = !p.state.on; s.state.on = true; run(1); const r1 = p.state.on; s.state.on = false; run(5); const r2 = p.state.on && !k.state.pulled; run(7); return r0 && r1 && r2 && !p.state.on;`)));
  check('parity: E-stop and limit switch changeovers join 11-12 at rest and 11-14 when operated', await page.evaluate(new Function(solveKit + `
    const r = t => { circ.comps.length = 0; circ.wires.length = 0; const q = add('supply1'), d = add(t), a = add('lamp', { coil: '230VAC' }), b = add('lamp', { coil: '230VAC' });
      w(q, 'L', d, '11'); w(d, '12', a, 'X1'); w(d, '14', b, 'X1'); w(a, 'X2', q, 'N'); w(b, 'X2', q, 'N'); run(); const rest = a.state.on && !b.state.on;
      Circuit.part(d, t === 'estop_co' ? 'btn' : 'lever', 'down'); run(); return rest && !a.state.on && b.state.on; };
    return r('estop_co') && r('limit_co');`)));
  check('parity: the selector changeover joins 11-12 in position 0 and 11-14 in I; the N.C. selector opens 11-12 in I', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), s = add('sel_cx'), n = add('sel2_nc'), a = add('lamp', { coil: '230VAC' }), b = add('lamp', { coil: '230VAC' }), c = add('lamp', { coil: '230VAC' });
    w(q, 'L', s, '11'); w(s, '12', a, 'X1'); w(s, '14', b, 'X1'); w(q, 'L', n, '11'); w(n, '12', c, 'X1'); [a, b, c].forEach(x => w(x, 'X2', q, 'N')); run(); const p0 = a.state.on && !b.state.on && c.state.on;
    Circuit.part(s, 'knob', 'down'); Circuit.part(n, 'knob', 'down'); run(); return p0 && !a.state.on && b.state.on && !c.state.on;`)));
  check('parity: fuse switches 1P, 2P, 4P switch their poles; on a short the 1P+N and 3P+N fuses blow and the neutral pole stays closed', await page.evaluate(new Function(solveKit + `
    const q = add('supply3'), ok = [];
    for (const [t, n] of [['fsw1', 1], ['fsw2', 2], ['fsw4', 4]]) { const d = add(t, {}, { on: true }); ok.push(Circuit.DEFS[t].conduct(d).length === n); d.state.on = false; ok.push(!Circuit.DEFS[t].conduct(d)); }
    for (const [t, ph, nn] of [['fsw1n', ['1'], ['3', '4']], ['fsw3n', ['1', '3', '5'], ['7', '8']]]) {
      const d = add(t, {}, { on: true }); ['L1', 'L2', 'L3'].slice(0, ph.length).forEach((p, i) => w(q, p, d, ph[i])); w(q, 'N', d, nn[0]); w(d, '2', d, nn[1]); run();
      const c = Circuit.DEFS[t].conduct(d); ok.push(d.state.tripped && c.length === 1 && c[0][0] === nn[0] && c[0][1] === nn[1]);
    }
    return ok.every(Boolean);`)));
  check('parity: 1-, 2- and 4-pole motor protection breakers switch every pole and trip on a jammed motor', await page.evaluate(new Function(solveKit + `
    const ok = [];
    for (const [t, n] of [['mpcb1', 1], ['mpcb2', 2], ['mpcb4', 4]]) { const d = add(t, {}, { on: true }); ok.push(Circuit.DEFS[t].conduct(d).length === n + 1); }
    circ.comps.length = 0; circ.wires.length = 0;
    const q = add('supply1'), d = add('mpcb1', { trip: 1 }, { on: true }), m = add('motor1'); w(q, 'L', d, '1'); w(d, '2', m, 'L'); w(m, 'N', q, 'N'); run(10);
    const ran = m.state.drive === 'run'; m.state.jam = true; run(30); return ok.every(Boolean) && ran && d.state.tripped;`)));
  check('parity: 1- and 2-pole overload relays trip on a jammed motor; set as a changeover, 95-96 opens and 95-98 closes', await page.evaluate(new Function(solveKit + `
    const t = (type, aux) => { circ.comps.length = 0; circ.wires.length = 0; const q = add('supply1'), f = add(type, { trip: 1, aux }), m = add('motor1'), a = add('lamp', { coil: '230VAC' }), b = add('lamp', { coil: '230VAC' });
      w(q, 'L', f, '1'); w(f, '2', m, 'L'); w(m, 'N', q, 'N'); w(q, 'L', f, '95'); w(f, '96', a, 'X1'); w(f, aux.includes('changeover') ? '98' : '97', b, 'X1'); if (!aux.includes('changeover')) w(q, 'L', f, '98');
      w(a, 'X2', q, 'N'); w(b, 'X2', q, 'N'); run(10); const rest = a.state.on && !b.state.on && m.state.drive === 'run'; m.state.jam = true; run(30); return rest && f.state.tripped && !a.state.on && b.state.on; };
    return t('olr1', '95-96 + 97-98') && t('olr2', '95-96 + 97-98') && t('olr1', '95-96-98 changeover') && t('olr', '95-96-98 changeover');`)));
  check('parity: a generator in AUTO runs while a contact joins C1-C2 and stops when it opens; in MANUAL C1-C2 do nothing', await page.evaluate(new Function(solveKit + `
    const g = add('gen3', { mode: 'auto (C1-C2)' }), s = add('isol1'), h = add('lamp', { coil: '230VAC' });
    w(g, 'C1', s, '1'); w(s, '2', g, 'C2'); w(g, 'L1', h, 'X1'); w(h, 'X2', g, 'N'); run(3); const off = !g.state.on && !h.state.on;
    s.state.on = true; run(3); const on = g.state.on && h.state.on; s.state.on = false; run(3); const stop = !g.state.on;
    g.props.mode = 'manual'; s.state.on = true; run(3); return off && on && stop && !g.state.on;`)));
  // drawn: changeover overload contact, an on-delay block on KM1, N.C. main poles, a N.C.+N.O. push button, an old 1-pole overload drawing on a 3-pole device
  const pyP = { name: 'Parity', circuit: { seq: 5, comps: [{ id: 'c1', type: 'supply3', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } },
    { id: 'c2', type: 'olr', x: 0, y: 200, props: { label: 'F9' }, state: {} }, { id: 'c3', type: 'contactor_ton', x: 0, y: 300, props: { label: 'KM1', coil: '230VAC', t: 1 }, state: {} }], wires: [] },
    schematic: { free: { seq: 60, items: [
      fi('d1', 'pL1', 'XP1', 0, 0), fi('d2', 'olco', 'F1', 0, 100), fi('d3', 'lamp', 'H1', -40, 220), fi('d4', 'lamp', 'H2', 40, 220), fi('d5', 'pN', 'XP2', 0, 340),
      fi('d6', 'pL1', 'XP3', 200, 0), fi('d7', 'pbnonc', 'S1', 200, 100), fi('d8', 'kmcoil', 'KM1', 180, 220), fi('d9', 'pN', 'XP4', 200, 340),
      fi('d10', 'pL1', 'XP5', 320, 0), fi('d11', 'kbonno', 'KM1', 320, 100), fi('d12', 'lamp', 'H3', 320, 220), fi('d13', 'pN', 'XP6', 320, 340),
      fi('d14', 'pL1', 'XP7', 440, 0), fi('d15', 'kmn1', 'KM2', 440, 100), fi('d16', 'lamp', 'H4', 440, 220), fi('d17', 'pN', 'XP8', 440, 340),
      fi('d18', 'ol1', 'F9', 560, 100), fi('d19', 'olnc', 'F9', 640, 100), fi('d20', 'kmcoil', 'KM2', 560, 260), fi('d21', 'kmn2', 'KM3', 700, 100)],
    wires: [fw('fw1', 'd1:J', 'd2:95'), fw('fw2', 'd2:96', 'd3:X1'), fw('fw3', 'd2:98', 'd4:X1'), fw('fw4', 'd3:X2', 'd5:J'), fw('fw5', 'd4:X2', 'd5:J'),
      fw('fw6', 'd6:J', 'd7:13'), fw('fw7', 'd7:14', 'd8:A1'), fw('fw8', 'd8:A2', 'd9:J'), fw('fw9', 'd10:J', 'd11:67'), fw('fw10', 'd11:68', 'd12:X1'), fw('fw11', 'd12:X2', 'd13:J'),
      fw('fw12', 'd14:J', 'd15:1'), fw('fw13', 'd15:2', 'd16:X1'), fw('fw14', 'd16:X2', 'd17:J')] } } };
  await page.evaluate(p => { const prev = App.currentId; localStorage.setItem('plc-trainer.schStyle', 'free'); App.openNew(JSON.parse(JSON.stringify(p))); if (prev) Store.remove(prev); App.showView('schematic'); }, pyP);
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(300);
  check('parity: the drawing makes F1 an overload relay set as a 95-96-98 changeover and KM2 a N.C.-pole contactor and KM1 the on-delay-block contactor; no problem is reported',
    await until(is("d('H1').on && !d('H2').on && d('H4').on")) && await page.evaluate(() => { const C = App.project.circuit, t = l => C.comps.find(c => c.props.label === l);
      return t('F1').type === 'olr' && t('F1').props.aux === '95-96-98 changeover' && t('KM2').type === 'contactor_nc' && t('KM1').type === 'contactor_ton' && FreeDraw.errs.size === 0; }));
  check('parity: an older drawing (1-pole overload symbol on a 3-pole relay) and the generic overload contact still fit F9', await page.evaluate(() => { const it = App.project.schematic.free.items; return ['d18', 'd19'].every(id => !FreeDraw.errs.has(it.find(i => i.id === id))) && App.project.circuit.comps.find(c => c.props.label === 'F9').type === 'olr'; }));
  await page.evaluate(() => App.operate(App.project.circuit.comps.find(c => c.props.label === 'F1'), 'test'));
  check('parity: tripping F1 moves the drawn changeover 95-96-98 from H1 to H2', await until(is("d('F1').tripped && !d('H1').on && d('H2').on")));
  await page.evaluate(() => { window.__up = App.operate(App.project.circuit.comps.find(c => c.props.label === 'S1'), 'btn'); });
  check('parity: holding S1 (drawn N.C.+N.O.) pulls in KM1; the symbol shows operated and the on-delay block lights H3 only after 1 s', await until(is("d('KM1').pulled && !d('H3').on")) &&
    await page.evaluate(() => document.querySelector('#view-schematic [data-fi="d7"] .ssym').classList.contains('on')) && await until(is("d('KM1').td && d('H3').on"), null, 3000));
  await page.evaluate(() => { if (typeof window.__up === 'function') window.__up(); });
  check('parity: releasing S1 drops KM1 and its block at once', await until(is("!d('KM1').pulled && !d('H3').on"), null, 1000));
  check('parity: a main-pole symbol of a normal contactor does not fit a N.C.-pole contactor (KM2 with km3 is reported)', await page.evaluate(() => {
    App.project.schematic.free.items.push({ id: 'd40', k: 'km3', tag: 'KM2', x: 800, y: 100, r: 0 }); const m = FreeDraw.check().get(App.project.schematic.free.items.find(i => i.id === 'd40'));
    App.project.schematic.free.items.pop(); return !!m && /own symbols/.test(m);
  }));
  check('parity: the new symbols survive save and reload, with the overload setting', await page.evaluate(() => { const p = App.buildProject(JSON.parse(JSON.stringify(App.serialize())));
    return ['olco', 'pbnonc', 'kbonno', 'kmn1', 'kmn2'].every(k => p.schematic.free.items.some(i => i.k === k)) && p.circuit.comps.find(c => c.props.label === 'F1').props.aux === '95-96-98 changeover' && p.circuit.comps.find(c => c.props.label === 'KM1').type === 'contactor_ton' && !(p.keep && p.keep.free.items.length); }));
  // PLC I/O copies take the next free point of the same controller
  const plP = { name: 'PLC paste', circuit: { seq: 5, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }, { id: 'c2', type: 'plc', x: 0, y: 200, props: { label: 'PLC' }, state: {} }], wires: [] },
    schematic: { free: { seq: 10, items: [fi('d1', 'plci0', 'PLC', 0, 100), fi('d2', 'plcq0', 'PLC', 200, 100)], wires: [] } } };
  await page.evaluate(p => { const prev = App.currentId; App.openNew(JSON.parse(JSON.stringify(p))); if (prev) Store.remove(prev); App.showView('schematic'); }, plP);
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(300);
  check('PLC paste: Ctrl+C / Ctrl+V of input I0 and output O0 gives I1 and O1 of the same PLC, with no problem reported', await page.evaluate(() => {
    FreeDraw.selectAll(); FreeDraw.copySel(); FreeDraw.paste(); const F = App.project.schematic.free;
    return F.items.length === 4 && F.items.some(i => i.k === 'plci1' && i.tag === 'PLC') && F.items.some(i => i.k === 'plcq1' && i.tag === 'PLC') && FreeDraw.check().size === 0;
  }));
  // select one symbol the way the user does (a click on it), then D duplicates it
  const clickFi = id => page.evaluate(async id => { const h = document.querySelector('#view-schematic [data-fi="' + id + '"] .hit'), r = h.getBoundingClientRect(),
    o = { bubbles: true, pointerId: 7, pointerType: 'mouse', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    h.dispatchEvent(new PointerEvent('pointerdown', o)); await new Promise(q => setTimeout(q, 30)); h.dispatchEvent(new PointerEvent('pointerup', o)); await new Promise(q => setTimeout(q, 500)); }, id);
  await clickFi(await page.evaluate(() => App.project.schematic.free.items.find(i => i.k === 'plci1').id));
  check('PLC paste: D on input I1 gives I2 (the next point not drawn yet)', await page.evaluate(() => { FreeDraw.copy(); const F = App.project.schematic.free; return F.items.some(i => i.k === 'plci2' && i.tag === 'PLC') && FreeDraw.check().size === 0; }));
  await page.evaluate(() => { const F = App.project.schematic.free; for (let n = 3; n < 12; n++) F.items.push({ id: 'd' + (++F.seq), k: 'plci' + n, tag: 'PLC', x: 100 + n * 60, y: 400, r: 0 }); App.showView('wiring'); App.showView('schematic'); });
  await wait(300);
  await clickFi('d1');
  check('PLC paste: with all 12 inputs drawn, a copy stays as it is, is reported and the user is told why', await page.evaluate(() => {
    const F = App.project.schematic.free, n = F.items.length; FreeDraw.copy(); const added = F.items[F.items.length - 1];
    const toast = [...document.querySelectorAll('#toast-root *')].some(e => /drawn already/.test(e.textContent));
    return F.items.length === n + 1 && added.k === 'plci0' && FreeDraw.check().has(added) && toast; }));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); App.showView('ladder'); });

  // every symbol the Simurelay comparison (docs/SIMURELAY_PARITY.md) maps to: one drawing, a tag each; each makes its device, fits it, and survives save and reload
  const PARITY_KINDS = ['wlink', 'batt', 'mcb1', 'mcb2', 'mcb3', 'mcb4', 'pbcx', 'pbx', 'pbnc', 'pbno', 'pbnonc', 'horn', 'kmcoil', 'kacoil', 'kfcoil', 'ktcoil', 'kdcoil', 'flcoil', 'kicoil', 'valve',
    'ka1co', 'ktco', 'kfco', 'kdco', 'flco', 'ltco', 'olco', 'kbonco', 'kbofco', 'kmnc', 'ka1nc', 'ktnc', 'kfnc', 'olnc', 'kbonnc', 'kbofnc', 'kmno', 'ka1no', 'ktno', 'kfno', 'olno', 'kbonno', 'kbofno',
    'kmnonc', 'kanonc', 'kbonnonc', 'kbofnonc', 'km1', 'km2', 'km3', 'km4', 'kmn1', 'kmn2', 'kmn3', 'kmn4', 'esco', 'estop', 'esno', 'esnonc', 'fu1', 'fu2', 'fu3', 'fu4', 'fsw1', 'fsw1n', 'fsw2', 'fsw3', 'fsw3n', 'fsw4',
    'gen', 'qs1', 'qs2', 'qs3', 'qs4', 'wline', 'wcorner', 'wtee', 'wcross', 'gnd', 'lamp', 'lampfl', 'm1', 'm3', 'qm1', 'qm2', 'qm3', 'qm4', 'mdc', 'mdh', 'm6', 'm2s', 'ol1', 'ol2', 'ol3', 'kpmon', 'psu',
    'rcbo', 'rcbo4', 'rcd', 'rcd4', 'bell', 'lsco', 'lsnc', 'lsno', 'lsnonc', 'siren', 'pM', 'pL1', 'pL2', 'pL3', 'pN', 'pP', 'pPE', 'src3', 'sel3h', 'sel3a', 'selcx', 'selx', 'selnc', 'selno', 'selnonc', 'text', 'qf3', 'sel3i', 'sel3o', 'wsrc', 'wdst', 'p3', 'p3n'];
  await page.evaluate(ks => { const prev = App.currentId; localStorage.setItem('plc-trainer.schStyle', 'free');
    const items = ks.map((k, i) => ({ id: 'd' + (i + 1), k, tag: k === 'text' ? 'TXT' : (FreeDraw.KINDS[k].pre || 'X') + (100 + i), x: (i % 12) * 120, y: Math.floor(i / 12) * 160, r: 0, ...(k === 'text' ? { txt: 'note' } : {}) }));
    App.openNew({ name: 'All parity symbols', schematic: { free: { seq: items.length + 1, items, wires: [] } } }); if (prev) Store.remove(prev); App.showView('schematic'); }, PARITY_KINDS);
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(400);
  check('parity: every mapped symbol is in the library, makes a device of its own type with every terminal it uses, and no problem is reported', await page.evaluate(ks => {
    const K = FreeDraw.KINDS, C = App.project.circuit, F = App.project.schematic.free;
    const bad = F.items.filter(it => { const S = K[it.k]; if (!S || S.hide) return true; if (!S.type || S.jct) return false; const d = C.comps.find(c => c.props.label === it.tag);
      return !d || !Circuit.sameKind(d.type, S.type) || !S.terms.every(t => Circuit.DEFS[d.type].terms.some(x => x.id === t.id)); });
    return ks.every(k => K[k]) && F.items.length === ks.length && bad.length === 0 && FreeDraw.errs.size === 0;
  }, PARITY_KINDS), await page.evaluate(() => [...FreeDraw.errs.values()].slice(0, 3).join(' | ')));
  check('parity: the drawing with every mapped symbol survives save and reload (same symbols, devices and settings)', await page.evaluate(() => {
    const s = App.serialize(), p = App.buildProject(JSON.parse(JSON.stringify(s))), key = c => c.props.label + ':' + c.type + ':' + JSON.stringify(c.props);
    return JSON.stringify(p.schematic.free.items.map(i => i.k)) === JSON.stringify(s.schematic.free.items.map(i => i.k)) && JSON.stringify(p.circuit.comps.map(key).sort()) === JSON.stringify(s.circuit.comps.map(key).sort()) && !(p.keep && p.keep.free.items.length);
  }));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); App.showView('ladder'); });

  console.log('Parity v2.2: thermal-magnetic MCB, 3-position selectors, directional link arrows, L1L2L3(N) points');
  check('v2.2: the 3-position selectors are in the parts list and the new symbols fit their devices', await page.evaluate(() =>
    ['sel3p', 'sel3p0'].every(t => Circuit.DEFS[t] && !Circuit.DEFS[t].hidden) && ['sel3i', 'sel3o'].every(k => FreeDraw.KINDS[k].terms.every(t => Circuit.DEFS[FreeDraw.KINDS[k].type].terms.some(x => x.id === t.id))) && ['wsrc', 'wdst', 'p3', 'p3n'].every(k => FreeDraw.KINDS[k])));
  check('v2.2: the I-II-III selector joins 1-2, 1-3, 1-4 in turn; the I-0-II selector 1-2, nothing, 1-3', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), s = add('sel3p'), z = add('sel3p0'), L = ['2', '3', '4'].map(() => add('lamp', { coil: '230VAC' })), M = ['2', '3'].map(() => add('lamp', { coil: '230VAC' }));
    w(q, 'L', s, '1'); ['2', '3', '4'].forEach((t, i) => w(s, t, L[i], 'X1')); w(q, 'L', z, '1'); ['2', '3'].forEach((t, i) => w(z, t, M[i], 'X1')); [...L, ...M].forEach(h => w(h, 'X2', q, 'N'));
    const seen = []; for (let i = 0; i < 3; i++) { run(); seen.push(L.map(h => h.state.on ? 1 : 0).join('') + '|' + M.map(h => h.state.on ? 1 : 0).join('')); Circuit.part(s, 'knob', 'down'); Circuit.part(z, 'knob', 'down'); }
    run(); return seen.join(' ') === '100|10 010|00 001|01' && L[0].state.on;`)));
  check('v2.2: an MCB trips (thermal) when the motor it feeds stays jammed; a faster overload relay in the same feeder trips first', await page.evaluate(new Function(solveKit + `
    const q = add('supply1'), b = add('mcb1', { trip: 1 }, { on: true }), m = add('motor1'); w(q, 'L', b, '1'); w(b, '2', m, 'L'); w(m, 'N', q, 'N'); run(10);
    const ran = m.state.drive === 'run' && !b.state.tripped; m.state.jam = true; const al = run(30); const alone = b.state.tripped && al.some(a => /thermal/.test(a));
    circ.comps.length = 0; circ.wires.length = 0;
    const q2 = add('supply1'), b2 = add('mcb1', {}, { on: true }), f = add('olr1', { trip: 1 }), m2 = add('motor1');
    w(q2, 'L', b2, '1'); w(b2, '2', f, '1'); w(f, '2', m2, 'L'); w(m2, 'N', q2, 'N'); run(10); m2.state.jam = true; run(30);
    return ran && alone && f.state.tripped && !b2.state.tripped;`)));
  // drawn: L1 L2 L3 points feed a motor; L1 L2 L3 N points: L1 → source arrow W1 … destination arrow W1 → lamp → N; a rotary selector
  const v22 = { name: 'v2.2', circuit: { seq: 3, comps: [{ id: 'c1', type: 'supply3', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }], wires: [] },
    schematic: { free: { seq: 30, items: [fi('d1', 'p3', 'XP1', 0, 0), fi('d2', 'm3', 'M1', 0, 120), fi('d3', 'p3n', 'XP2', 200, 0), fi('d4', 'wsrc', 'W1', 180, 100), fi('d5', 'wdst', 'W1', 300, 100),
      fi('d6', 'lamp', 'H1', 300, 200), fi('d7', 'sel3i', 'S1', 450, 100), fi('d8', 'lamp', 'H2', 410, 220), fi('d9', 'lamp', 'H3', 450, 220), fi('d10', 'lamp', 'H4', 490, 220)],
    wires: [fw('fw1', 'd1:L1', 'd2:U1'), fw('fw2', 'd1:L2', 'd2:V1'), fw('fw3', 'd1:L3', 'd2:W1'), fw('fw4', 'd3:L1', 'd4:J0'), fw('fw5', 'd5:J0', 'd6:X1'), fw('fw6', 'd6:X2', 'd3:N'),
      fw('fw7', 'd3:L2', 'd7:1'), fw('fw8', 'd7:2', 'd8:X1'), fw('fw9', 'd7:3', 'd9:X1'), fw('fw10', 'd7:4', 'd10:X1'), fw('fw11', 'd8:X2', 'd3:N'), fw('fw12', 'd9:X2', 'd3:N'), fw('fw13', 'd10:X2', 'd3:N')] } } };
  await page.evaluate(p => { const prev = App.currentId; localStorage.setItem('plc-trainer.schStyle', 'free'); App.openNew(JSON.parse(JSON.stringify(p))); if (prev) Store.remove(prev); App.showView('schematic');
    p.circuit && App.project.circuit.comps.filter(c => c.type === 'lamp').forEach(c => { c.props.coil = '230VAC'; }); }, v22);
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(300);
  await page.evaluate(() => { App.project.circuit.comps.filter(c => c.type === 'lamp').forEach(c => { c.props.coil = '230VAC'; c.state.burnt = false; }); });
  check('v2.2: the L1 L2 L3 points run the motor, the source and destination arrows with one tag carry L1 to H1, no problem reported', await until(is("d('M1').drive === 'run' && d('H1').on")) && await page.evaluate(() => FreeDraw.errs.size === 0));
  check('v2.2: the drawn I-II-III selector lights H2, then H3, then H4, and its symbol follows', await (async () => {
    const sym = () => page.evaluate(() => { const g = document.querySelector('#view-schematic [data-fi="d7"] .ssym'); return g ? g.innerHTML : ''; });
    const a = await until(is("d('H2').on && !d('H3').on")); const s1 = await sym(); await page.evaluate(() => App.operate(App.project.circuit.comps.find(c => c.props.label === 'S1'), 'knob'));
    const b = await until(is("d('H3').on && !d('H2').on")); await wait(150); const s2 = await sym(); await page.evaluate(() => App.operate(App.project.circuit.comps.find(c => c.props.label === 'S1'), 'knob'));
    const c = await until(is("d('H4').on && !d('H3').on")); return a && b && c && s1 !== s2; })());
  check('v2.2: the drawing with the new symbols survives save and reload', await page.evaluate(() => { const p = App.buildProject(JSON.parse(JSON.stringify(App.serialize())));
    return ['p3', 'p3n', 'wsrc', 'wdst', 'sel3i'].every(k => p.schematic.free.items.some(i => i.k === k)) && p.schematic.free.wires.length === 13 && !(p.keep && p.keep.free.items.length); }));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); App.showView('ladder'); });

  console.log('Tagging like Simurelay: automatic tags, rename from the diagram, tag and terminal visibility, tag colour, library order');
  await page.evaluate(() => { const prev = App.currentId; localStorage.setItem('plc-trainer.schStyle', 'free'); App.openNew({ name: 'Tagging', circuit: { seq: 2, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }], wires: [] } }); if (prev) Store.remove(prev); App.showView('schematic'); FreeDraw.setLabels({ ask: false, tags: true, terms: true, color: 'auto' }); });
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(250);
  check('tagging: the library groups follow Simurelay (Sources, Switches, Auxiliaries, Coils, Loads, Contactors, Protections, Motors, Others), then Sensors and PLC', await page.evaluate(() =>
    JSON.stringify([...document.querySelectorAll('#view-schematic .fd-grp option')].map(o => o.value)) === JSON.stringify(['All', 'Sources', 'Switches', 'Auxiliaries', 'Coils', 'Loads', 'Contactors', 'Protections', 'Motors', 'Others', 'Sensors', 'PLC'])));
  check('tagging: every library tile shows a short name (device, contact, timing, terminals) and keeps the full name as its tooltip', await page.evaluate(() => { const g = document.querySelector('#view-schematic .fd-grp'); g.value = 'All'; g.dispatchEvent(new Event('change', { bubbles: true }));
    const tile = k => document.querySelector('#view-schematic .fd-ico[data-fk="' + k + '"]'), txt = k => tile(k).querySelector('.fd-nm').textContent;
    return [...document.querySelectorAll('#view-schematic .fd-ico')].every(b => b.querySelector('.fd-nm').textContent.trim()) && txt('ka1no') === 'K N.O.11‑14' && txt('ktnc') === 'KT N.C.T-on 15‑16' && txt('olco') === 'F C/O95‑96/98' && tile('ka1no').title === FreeDraw.KINDS.ka1no.n; }));
  check('tagging: a placed symbol gets the next tag of its kind at once, no form (KM1, KM2), and a contact the contactor it belongs to', await page.evaluate(async () => {
    FreeDraw.add('kmcoil'); FreeDraw.add('kmcoil'); FreeDraw.add('kmno'); await new Promise(r => setTimeout(r, 100));
    const F = App.project.schematic.free.items; return !document.querySelector('#modal-root .modal') && F.map(i => i.k + ':' + i.tag).join(' ') === 'kmcoil:KM1 kmcoil:KM2 kmno:KM2' && App.project.circuit.comps.filter(c => c.type === 'contactor').length === 2;
  }));
  // rename KM2 from the diagram: its coil and its contact (and the Wiring device) follow; KM1 stays
  await page.evaluate(() => { const it = App.project.schematic.free.items.find(i => i.k === 'kmno'); FreeDraw.renameDevice(it); });
  await wait(150); await page.fill('#f_t', 'KM7'); await page.click('.modal .btn.primary'); await wait(250);
  check('tagging: Rename device from the diagram renames every symbol of it and the device in the Wiring', await page.evaluate(() => { const F = App.project.schematic.free.items, C = App.project.circuit.comps;
    return F.map(i => i.tag).join(' ') === 'KM1 KM7 KM7' && C.some(c => c.props.label === 'KM7' && c.type === 'contactor') && !C.some(c => c.props.label === 'KM2') && FreeDraw.errs.size === 0; }));
  await page.evaluate(() => FreeDraw.renameDevice(App.project.schematic.free.items.find(i => i.tag === 'KM7')));
  await wait(150); await page.fill('#f_t', 'KM1'); await page.click('.modal .btn.primary'); await wait(200);
  check('tagging: renaming to the tag of another device is refused and nothing changes', await page.evaluate(() => { const m = document.querySelector('#modal-root .modal'); const msg = m ? m.textContent : ''; const x = document.querySelector('#modal-root [data-x]'); if (x) x.click();
    return /already the tag of another device/.test(msg) && App.project.schematic.free.items.map(i => i.tag).join(' ') === 'KM1 KM7 KM7'; }));
  await page.evaluate(() => { document.querySelector('#modal-root').innerHTML = ''; });
  await page.evaluate(() => { FreeDraw.openBar(App.project.schematic.free.items[0]); FreeDraw.closeBar(); }); await wait(450);
  await page.keyboard.press('F2'); await wait(150);
  check('tagging: F2 on a selected symbol opens Rename device', await page.evaluate(() => { const m = document.querySelector('#modal-root .modal'); const ok = !!m && /Rename -KM1/.test(m.textContent); const x = document.querySelector('#modal-root [data-x]'); if (x) x.click(); return ok; }));
  check('tagging: the Properties of a symbol have Rename device…', await page.evaluate(() => !!document.querySelector('#view-schematic .sch-side [data-fd="rename"]')));
  check('tagging: tags and terminal numbers can be hidden and shown again; the choice is remembered', await page.evaluate(async () => {
    const n = s => document.querySelectorAll('#view-schematic .free-svg ' + s).length; const t0 = n('.ftag'), s0 = n('.sterm');
    FreeDraw.setLabels({ tags: false }); await new Promise(r => setTimeout(r, 50)); const t1 = n('.ftag'), s1 = n('.sterm');
    FreeDraw.setLabels({ terms: false }); await new Promise(r => setTimeout(r, 50)); const s2 = n('.sterm'); const stored = JSON.parse(localStorage.getItem('plc-trainer.fdLabels'));
    FreeDraw.setLabels({ tags: true, terms: true }); await new Promise(r => setTimeout(r, 50));
    return t0 >= 3 && s0 >= 6 && t1 === 0 && s1 === s0 && s2 === 0 && stored.tags === false && stored.terms === false && n('.ftag') === t0 && n('.sterm') === s0; }));
  check('tagging: the tag colour can be set (red) and back to the drawing colour', await page.evaluate(async () => {
    FreeDraw.setLabels({ color: 'red' }); await new Promise(r => setTimeout(r, 50)); const f = getComputedStyle(document.querySelector('#view-schematic .free-svg .fitem:not(.sel) .ftag')).fill;
    FreeDraw.setLabels({ color: 'auto' }); await new Promise(r => setTimeout(r, 50)); const g = getComputedStyle(document.querySelector('#view-schematic .free-svg .fitem:not(.sel) .ftag')).fill;
    return f === 'rgb(198, 40, 40)' && g !== f && !document.querySelector('#view-schematic .free-svg.tagc-red'); }));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); App.showView('ladder'); });

  console.log('Owner case on the PLC motor example: a 24 V seal-in drawn from the library, moving contacts, coil voltage warning');
  const ownerCase = await page.evaluate(async () => {
    const prev = App.currentId; App.openNew(Examples.EX.plcmotor.build()); if (prev) Store.remove(prev); localStorage.setItem('plc-trainer.schStyle', 'free'); App.showView('schematic');
    document.querySelector('#view-schematic [data-sstyle="free"]').click(); FreeDraw.setLabels({ ask: false }); await new Promise(q => setTimeout(q, 300));
    const add = (k, x, y) => { FreeDraw.add(k, undefined, x, y); const F = App.project.schematic.free.items; return F[F.length - 1]; };
    const a = add('pP', 0, 0), stop = add('pbnc', 0, 120), start = add('pbno', 0, 240), seal = add('kmno', 120, 240), coil = add('kmcoil', 0, 360), m = add('pM', 0, 480);
    const F = App.project.schematic.free; let n = F.seq; const w = (x, y) => F.wires.push({ id: 'fw' + (++n), a: x, b: y }); F.seq = n + 10;
    w(a.id + ':J', stop.id + ':11'); w(stop.id + ':12', start.id + ':13'); w(start.id + ':13', seal.id + ':13'); w(start.id + ':14', seal.id + ':14'); w(start.id + ':14', coil.id + ':A1'); w(coil.id + ':A2', m.id + ':J');
    Schematic.sync(); App.circuitChanged(); document.querySelector('#view-schematic [data-smode="run"]').click(); await new Promise(q => setTimeout(q, 300));
    return { start: start.tag, stop: stop.tag, seal: seal.tag, coil: coil.tag, sealId: seal.id, stopId: stop.id };
  });
  check('owner case: on the PLC motor example the drawn seal-in gets its own contactor (KM2, not the motor contactor KM1), with a 24 V DC coil', ownerCase.coil === 'KM2' && ownerCase.seal === 'KM2' && await page.evaluate(() => App.project.circuit.comps.find(c => c.props.label === 'KM2').props.coil === '24VDC'), JSON.stringify(ownerCase));
  const symHtml = id => page.evaluate(id => document.querySelector(`#view-schematic [data-fi="${id}"] .ssym`).innerHTML, id);
  const seal0 = await symHtml(ownerCase.sealId);
  await page.evaluate(t => { window.__up = App.operate(App.project.circuit.comps.find(c => c.props.label === t), 'btn'); }, ownerCase.start);
  check('owner case: pressing START pulls KM2 in', await until(is(`d('KM2').pulled`)));
  await page.evaluate(() => { if (typeof window.__up === 'function') window.__up(); });
  check('owner case: released, KM2 holds through its own 13-14 (seal-in)', await (async () => { await wait(400); return page.evaluate(is(`d('KM2').pulled && !d('${ownerCase.start}').pressed`)); })());
  check('moving contacts: the drawn KM2 13-14 is drawn closed now (it was drawn open)', await (async () => { await wait(150); const s1 = await symHtml(ownerCase.sealId); return s1 !== seal0 && /M0 14 L2 -16/.test(s1) && /M0 14 L-11 -13/.test(seal0); })());
  const stop0 = await symHtml(ownerCase.stopId);
  await page.evaluate(t => { window.__up = App.operate(App.project.circuit.comps.find(c => c.props.label === t), 'btn'); }, ownerCase.stop);
  check('moving contacts: pressing STOP draws its N.C. contact open and drops KM2', await until(is(`!d('KM2').pulled`)) && await (async () => { await wait(150); const s1 = await symHtml(ownerCase.stopId); return s1 !== stop0 && /M0 14 L-11 -13/.test(s1); })());
  await page.evaluate(() => { if (typeof window.__up === 'function') window.__up(); });
  check('coil voltage: a 230 V AC coil on 24 V DC is reported (event, status, dashed warning on the drawing) instead of staying silently off', await page.evaluate(async () => {
    const k = App.project.circuit.comps.find(c => c.props.label === 'KM2'); k.props.coil = '230VAC'; App.circuitChanged();
    const s = App.project.circuit.comps.find(c => c.props.label === App.project.schematic.free.items.find(i => i.k === 'pbno').tag); const up = App.operate(s, 'btn'); await new Promise(q => setTimeout(q, 500));
    const coilIt = App.project.schematic.free.items.find(i => i.k === 'kmcoil');
    return App.events().some(e => /KM2: its coil is 230VAC but gets 24VDC/.test(e.msg)) && /gets only 24VDC/.test(Circuit.status(k, App.ctx)) && !!document.querySelector(`#view-schematic [data-fi="${coilIt.id}"] .ssym.lowv`) && (up(), true); }));
  await page.evaluate(() => { document.querySelector('#view-schematic [data-smode="edit"]').click(); localStorage.setItem('plc-trainer.schStyle', 'iec'); const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); App.showView('ladder'); });
  console.log('Engineer use: a run lamp on a second contact of KM1, the aux block, no-coil warning, live wires, routes');
  const engr = await page.evaluate(async () => {
    const prev = App.currentId; App.openNew({ name: 'Start stop', circuit: { seq: 3, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }, { id: 'c2', type: 'psu24', x: 0, y: 200, props: { label: 'G1' }, state: {} }],
      wires: [{ id: 'w1', a: 'c1:L', b: 'c2:L', pts: [] }, { id: 'w2', a: 'c1:N', b: 'c2:N', pts: [] }] } }); if (prev) Store.remove(prev);
    localStorage.setItem('plc-trainer.schStyle', 'free'); App.showView('schematic'); document.querySelector('#view-schematic [data-sstyle="free"]').click(); FreeDraw.setLabels({ ask: false }); await new Promise(q => setTimeout(q, 200));
    const add = (k, x, y) => { FreeDraw.add(k, undefined, x, y); const F = App.project.schematic.free.items; return F[F.length - 1]; };
    const a = add('pP', 0, 0), stop = add('pbnc', 0, 120), start = add('pbno', 0, 240), seal = add('kmno', 110, 240), coil = add('kmcoil', 0, 360), run = add('kmno', 220, 120), h = add('lamp', 220, 240), m = add('pM', 0, 480);
    const F = App.project.schematic.free; let n = F.seq; const w = (x, y) => F.wires.push({ id: 'fw' + (++n), a: x, b: y }); F.seq = n + 10;
    w(a.id + ':J', stop.id + ':11'); w(stop.id + ':12', start.id + ':13'); w(start.id + ':13', seal.id + ':13'); w(start.id + ':14', seal.id + ':14'); w(start.id + ':14', coil.id + ':A1'); w(coil.id + ':A2', m.id + ':J');
    w(a.id + ':J', run.id + ':53'); w(run.id + ':54', h.id + ':X1'); w(h.id + ':X2', m.id + ':J');
    Schematic.sync(); App.circuitChanged();
    const km = App.project.circuit.comps.find(c => c.props.label === 'KM1'), lamp = App.project.circuit.comps.find(c => c.props.label === h.tag); lamp.props.coil = '24VDC';
    return { runK: run.k, runTag: run.tag, coilTag: coil.tag, kmType: km && km.type, errs: FreeDraw.check().size, startTag: start.tag, hTag: h.tag, runId: run.id };
  });
  check('engineer: a second N.O. of a contactor drawn from the library is the same KM1 on its aux block 53-54 (not a coil-less KM2)', engr.runK === 'kxno1' && engr.runTag === 'KM1' && engr.coilTag === 'KM1' && engr.kmType === 'contactor_aux' && engr.errs === 0, JSON.stringify(engr));
  await page.evaluate(t => { document.querySelector('#view-schematic [data-smode="run"]').click(); window.__up = App.operate(App.project.circuit.comps.find(c => c.props.label === t), 'btn'); }, engr.startTag);
  check('engineer: START pulls KM1 in and the run lamp lights through KM1 53-54', await until(is(`d('KM1').pulled && d('${engr.hTag}').on`)));
  await page.evaluate(() => { if (typeof window.__up === 'function') window.__up(); });
  check('engineer: a live wire shows current flowing, a lit lamp glows and the energized coil is filled', await (async () => { await wait(200); return page.evaluate(() => document.querySelectorAll('#view-schematic .fwire .wflow').length >= 4 && !!document.querySelector('#view-schematic .ssym.on[data-look="lamp"]') && !!document.querySelector('#view-schematic .ssym.on[data-look="coil"]')); })());
  check('engineer: where one circuit branches the drawing shows a junction dot, and the automatic routes do not overlap another circuit', await page.evaluate(() => {
    if (!document.querySelector('#view-schematic .fjdot')) return false;
    const segs = [...document.querySelectorAll('#view-schematic .fwire')].map(g => { const P = g.querySelector('.w').getAttribute('d').replace('M', '').split(' L').map(t => t.trim().split(' ').map(Number)); return { id: g.dataset.fw, P }; });
    const F = App.project.schematic.free, net = new Map(); const find = k => { while (net.has(k) && net.get(k) !== k) k = net.get(k); return k; }; F.wires.forEach(w => { const a = find(w.a), b = find(w.b); if (a !== b) net.set(a, b); });
    const n = id => { const w = F.wires.find(x => x.id === id); return find(w.a); };
    const units = new Map();
    for (const { id, P } of segs) for (let i = 1; i < P.length; i++) { const [x1, y1] = P[i - 1], [x2, y2] = P[i]; if (x1 !== x2 && y1 !== y2) continue; const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1), len = Math.abs(x2 - x1 + y2 - y1); for (let s = 0; s < len; s += 10) { const k = (x1 + dx * s + dx * 5) + ',' + (y1 + dy * s + dy * 5); const o = units.get(k); if (o && o !== n(id)) return false; units.set(k, n(id)); } }
    return true;
  }));
  check('engineer: an automatic wire route never passes over a terminal it does not connect', await page.evaluate(() => {
    const ts = [...document.querySelectorAll('#view-schematic .fterm')].map(t => ({ k: t.dataset.ft, x: +t.dataset.x, y: +t.dataset.y }));
    const F = App.project.schematic.free;
    return F.wires.every(w => {
      const d = document.querySelector(`#view-schematic [data-fw="${w.id}"] .w`).getAttribute('d'), P = d.replace('M', '').split(' L').map(p => p.split(' ').map(Number));
      return ts.filter(t => t.k !== w.a && t.k !== w.b).every(t => P.slice(1).every((q, i) => { const p = P[i], x1 = Math.min(p[0], q[0]), x2 = Math.max(p[0], q[0]), y1 = Math.min(p[1], q[1]), y2 = Math.max(p[1], q[1]); return !(t.x >= x1 - 2 && t.x <= x2 + 2 && t.y >= y1 - 2 && t.y <= y2 + 2); }));
    });
  }));
  check('engineer: a contact whose contactor has no coil drawn anywhere is marked (it would never switch)', await page.evaluate(runId => {
    document.querySelector('#view-schematic [data-smode="edit"]').click();
    FreeDraw.add('kanonc'); const F = App.project.schematic.free.items, it = F[F.length - 1]; Schematic.sync(); FreeDraw.render(document.querySelector('#view-schematic .sch-body'));
    const q = id => document.querySelector('#view-schematic [data-fi="' + id + '"] .ssym'), g = q(it.id), km = q(runId);
    return g.classList.contains('lowv') && /drawn nowhere/.test(g.innerHTML) && !km.classList.contains('lowv');
  }, engr.runId));
  check('engineer: the Wiring the diagram builds is tidy: its devices sit in one panel row without overlapping, and no two wires share a horizontal run', await page.evaluate(async () => {
    App.showView('wiring'); await new Promise(q => setTimeout(q, 300));
    const C = App.project.circuit, D = Circuit.DEFS, auto = C.comps.filter(c => c.schAuto);
    const xs = auto.map(c => c.x), compact = Math.max(...xs) - Math.min(...xs) <= 1200;
    const box = c => ({ x1: c.x, y1: c.y, x2: c.x + D[c.type].w, y2: c.y + D[c.type].h });
    const apart = auto.every((a, i) => auto.every((b, j) => j <= i || (() => { const p = box(a), q = box(b); return p.x2 <= q.x1 || q.x2 <= p.x1 || p.y2 <= q.y1 || q.y2 <= p.y1; })()));
    const runs = [];
    for (const g of document.querySelectorAll('#view-wiring .wire .wb')) {
      const P = g.getAttribute('d').replace('M', '').split(' L').map(t => t.trim().split(' ').map(Number));
      for (let i = 1; i < P.length; i++) if (P[i][1] === P[i - 1][1] && P[i][0] !== P[i - 1][0]) runs.push({ y: P[i][1], x1: Math.min(P[i][0], P[i - 1][0]), x2: Math.max(P[i][0], P[i - 1][0]), w: g.parentNode.dataset.wid });
    }
    const shared = runs.some((r, i) => runs.some((q, j) => j > i && q.w !== r.w && Math.abs(q.y - r.y) < 1 && q.x1 < r.x2 - 2 && q.x2 > r.x1 + 2));
    App.showView('schematic');
    return compact && apart && !shared;
  }));
  check('engineer: in the Wiring no wire runs over a device or along its row of terminals (it would look connected to them)', await page.evaluate(async () => {
    App.showView('wiring'); await new Promise(q => setTimeout(q, 300));
    const C = App.project.circuit, D = Circuit.DEFS, bad = [];
    const boxes = C.comps.filter(c => !D[c.type].rail && !D[c.type].junction && !D[c.type].layer).map(c => { const d = Circuit.dims(c); return { id: c.id, x1: c.x - 2, y1: c.y - 2, x2: c.x + d.w + 2, y2: c.y + d.h + 2 }; });
    for (const g of document.querySelectorAll('#view-wiring .wire')) {
      const w = C.wires.find(x => x.id === g.dataset.wid); if (w.pts && w.pts.length) continue;
      const P = g.querySelector('.wb').getAttribute('d').replace('M', '').split(' L').map(t => t.trim().split(' ').map(Number));
      // the first and last pieces leave / enter a terminal of the device itself
      for (let i = 2; i < P.length - 1; i++) { const [x1, y1] = P[i - 1], [x2, y2] = P[i]; for (const b of boxes) if (Math.max(x1, x2) > b.x1 && Math.min(x1, x2) < b.x2 && Math.max(y1, y2) > b.y1 && Math.min(y1, y2) < b.y2) bad.push(w.id); }
    }
    App.showView('schematic');
    return bad.length === 0;
  }));
  console.log('AB-style hardware: compact 16 in / 12 out, 16-point cards, one flat look');
  check('hardware: the compact 16 in / 12 out PLC reads I:0/15 and switches O:0/11 from its third common VAC2', await page.evaluate(async () => {
    const prev = App.currentId;
    App.openNew({ name: 'PLC16', circuit: { seq: 3, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }, { id: 'c2', type: 'plc16', x: 0, y: 200, props: { label: 'PLC' }, state: {} }],
      wires: [{ id: 'w1', a: 'c1:L', b: 'c2:L1', pts: [] }, { id: 'w2', a: 'c1:N', b: 'c2:N', pts: [] }, { id: 'w3', a: 'c2:V24', b: 'c2:I15', pts: [] }, { id: 'w4', a: 'c2:C24', b: 'c2:COM', pts: [] }, { id: 'w5', a: 'c1:L', b: 'c2:VAC2', pts: [] }] } });
    if (prev) Store.remove(prev);
    App.showView('ladder'); App.setMode('RUN'); await new Promise(q => setTimeout(q, 400));
    const inOk = ((App.plc.physIn >> 15) & 1) === 1;
    App.plc.data.O[0] |= 1 << 11; App.plc.physOut |= 1 << 11; App.circuitChanged(); await new Promise(q => setTimeout(q, 200));
    const plc = App.project.circuit.comps.find(c => c.type === 'plc16'), pr = Circuit.DEFS.plc16.conduct(plc, App.ctx) || [];
    const outOk = pr.some(([a, b]) => a === 'VAC2' && b === 'O11');
    const map = Circuit.ioMap(App.project.circuit, App.project.io);
    App.setMode('PROG');
    return inOk && outOk && map[0].n === 16 && map[1].n === 12 && !Circuit.ioCheck(PLCcore.parse('I:0/15'), App.project.circuit, App.project.io) && !!Circuit.ioCheck(PLCcore.parse('O:0/12'), App.project.circuit, App.project.io);
  }));
  check('hardware: a 16-point input card reads I:1/15, a 16-point relay card drives O:2/15 from VAC3, and Verify knows 16 points (8 on the 8-point cards)', await page.evaluate(async () => {
    const prev = App.currentId;
    App.openNew({ name: 'Rack16', io: { slots: { 1: 'mdi16', 2: 'mdo16', 3: 'mdi8' } }, circuit: { seq: 8, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } },
      { id: 'c2', type: 'mpsu', x: 0, y: 200, props: { label: 'PS' }, state: {} }, { id: 'c3', type: 'mcpu', x: 120, y: 200, props: { label: 'CPU' }, state: {} },
      { id: 'c4', type: 'mdi16', x: 260, y: 200, props: { label: 'DI', slot: '1' }, state: {} }, { id: 'c5', type: 'mdo16', x: 600, y: 200, props: { label: 'DO', slot: '2' }, state: {} }, { id: 'c6', type: 'mdi8', x: 1000, y: 200, props: { label: 'DI8', slot: '3' }, state: {} }],
      wires: [{ id: 'w1', a: 'c1:L', b: 'c2:L1', pts: [] }, { id: 'w2', a: 'c1:N', b: 'c2:N', pts: [] }, { id: 'w3', a: 'c2:V24', b: 'c4:I15', pts: [] }, { id: 'w4', a: 'c2:C24', b: 'c4:COM', pts: [] }] } });
    if (prev) Store.remove(prev);
    App.showView('ladder'); App.setMode('RUN'); await new Promise(q => setTimeout(q, 400));
    const inOk = ((App.plc.physInX[1] >> 15) & 1) === 1;
    App.plc.data.O[2] |= 1 << 15; App.plc.physOutX[2] |= 1 << 15; App.circuitChanged(); await new Promise(q => setTimeout(q, 200));
    const dout = App.project.circuit.comps.find(c => c.type === 'mdo16'), pr = Circuit.DEFS.mdo16.conduct(dout, App.ctx) || [];
    const outOk = pr.some(([a, b]) => a === 'VAC3' && b === 'O15');
    const chk = a => Circuit.ioCheck(PLCcore.parse(a), App.project.circuit, App.project.io);
    App.setMode('PROG');
    return inOk && outOk && !chk('I:1/15') && !chk('O:2/15') && !!chk('I:3/8') && /8 points/.test(chk('I:3/8').msg);
  }));
  check('hardware: one flat look — no device is drawn with shading (every fill of the device art is one colour)', await page.evaluate(() =>
    [...document.querySelectorAll('svg defs linearGradient, svg defs radialGradient')].every(g => new Set([...g.querySelectorAll('stop')].map(s => s.getAttribute('stop-color'))).size === 1)));
  check('1756-style rack: modules are narrow and tall (70 × 300), terminals on the terminal block at the sides, and a wire leaves its terminal sideways', await page.evaluate(async () => {
    const D = Circuit.DEFS, narrow = ['mcpu', 'mdi8', 'mdi16', 'mdi16ac', 'mdo8', 'mdo16', 'mdo16t', 'mai4', 'mao2'].every(t => D[t].w === 70 && D[t].h === 300);
    const sides = D.mdi16.terms.every(t => t.side === -1 || t.side === 1);
    const prev = App.currentId;
    App.openNew({ name: 'Side', io: { slots: { 1: 'mdi16' } }, circuit: { seq: 4, comps: [{ id: 'c1', type: 'mdi16', x: 200, y: 0, props: { label: 'DI', slot: '1' }, state: {} }, { id: 'c2', type: 'pb_no', x: 0, y: 400, props: { label: 'S1' }, state: {} }, { id: 'c3', type: 'pb_no', x: 400, y: 400, props: { label: 'S2' }, state: {} }],
      wires: [{ id: 'w1', a: 'c2:14', b: 'c1:I0', pts: [] }, { id: 'w2', a: 'c3:14', b: 'c1:I8', pts: [] }] } });
    if (prev) Store.remove(prev);
    App.showView('wiring'); await new Promise(q => setTimeout(q, 300));
    const P = id => document.querySelector(`#view-wiring .wire[data-wid="${id}"] .wb`).getAttribute('d').replace('M', '').split(' L').map(t => t.trim().split(' ').map(Number));
    const a = P('w1'), b = P('w2');
    // I0 (left column) is reached from the left, I8 (right column) from the right
    const left = a[a.length - 2][0] < 200 && a[a.length - 2][1] === a[a.length - 1][1], right = b[b.length - 2][0] > 270 && b[b.length - 2][1] === b[b.length - 1][1];
    return narrow && sides && left && right;
  }));
  check('tag-based address style: I:1/0 is shown Local:1:I.Data.0, and Local:2:O.Data.3 typed is stored O:2/3', await page.evaluate(() => {
    const book = Circuit.addrBook(App.project.circuit, App.project.io, 'tag');
    return book.fmt('I:1/0') === 'Local:1:I.Data.0' && book.toFile('Local:2:O.Data.3') === 'O:2/3' && !!Circuit.STYLES.tag;
  }));
  console.log('PLC target per project: file-based rack or tag-based 1756-style chassis');
  const rackProj = target => ({ name: 'Target', ...(target ? { target } : {}), io: { slots: { 1: 'mdi16', 2: 'mdo16' } }, ladder: { rungs: [{ text: 'XIC I:1/0 OTE O:2/0' }], files: [{ n: 3, name: 'FILL', rungs: [] }] },
    circuit: { seq: 5, comps: [{ id: 'c1', type: 'mpsu', x: 0, y: 0, props: { label: 'PS' }, state: {} }, { id: 'c2', type: 'mcpu', x: 110, y: 0, props: { label: 'CPU' }, state: {} },
      { id: 'c3', type: 'mdi16', x: 200, y: 0, props: { label: 'DI', slot: '1' }, state: {} }, { id: 'c4', type: 'mdo16', x: 290, y: 0, props: { label: 'DO', slot: '2' }, state: {} }], wires: [] } });
  const tgt = await page.evaluate(async proj => {
    const prev = App.currentId; App.openNew(proj); if (prev) Store.remove(prev);
    window._lay0 = App.layout; App.setLayout('single'); App.showView('wiring'); await new Promise(q => setTimeout(q, 250));
    const pal = () => [...document.querySelectorAll('#view-wiring .pal-item')].map(b => b.dataset.type);
    const look = () => ['c1', 'c2', 'c3', 'c4'].map(id => { const g = document.querySelector(`#view-wiring [data-cid="${id}"]`); return g && g.querySelector('.look-slc') ? 'slc' : g && g.querySelector('.look-1756') ? '1756' : '?'; }).join();
    const old = { target: App.project.target, addr: App.project.addr, saved: App.serialize().target, pal: pal(), look: look(), palLook: !!document.querySelector('#view-wiring .pal-item[data-type="mdi16"] .look-slc'), fmt: App.fmt('I:1/0') };
    App.setTarget('tag'); await new Promise(q => setTimeout(q, 250));
    const tag = { target: App.project.target, addr: App.project.addr, saved: App.serialize().target, pal: pal(), look: look(), palLook: !!document.querySelector('#view-wiring .pal-item[data-type="mdi16"] .look-1756'), fmt: App.fmt('I:1/0'), logged: App.events().some(e => /PLC target/.test(e.msg)) };
    const id = App.currentId; App.flushSave(); App.openSaved(id); await new Promise(q => setTimeout(q, 200));
    tag.reopened = App.project.target === 'tag' && App.project.addr === 'tag';
    return { old, tag };
  }, rackProj(null));
  check('PLC target: a project saved before targets existed opens as the file-based rack (addresses I:1/0, data files) and saves the target', tgt.old.target === 'file' && tgt.old.addr === 'file' && tgt.old.saved === 'file' && tgt.old.fmt === 'I:1/0', JSON.stringify(tgt.old));
  check('PLC target file-based: the Wiring library offers the compact controllers and the rack modules, drawn in the rack look (also in the library)', ['plc', 'plc16', 'mcpu', 'mpsu', 'mdi16', 'mdo16', 'mdo16t'].every(t => tgt.old.pal.includes(t)) && tgt.old.look === 'slc,slc,slc,slc' && tgt.old.palLook, JSON.stringify(tgt.old));
  check('PLC target tag-based: the library offers the 1756-style chassis modules and no compact controller; the same modules are drawn 1756-style', !tgt.tag.pal.includes('plc') && !tgt.tag.pal.includes('plc16') && ['mcpu', 'mpsu', 'mdi16', 'mdo16', 'mdo16t', 'mai4', 'mao2'].every(t => tgt.tag.pal.includes(t)) && tgt.tag.look === '1756,1756,1756,1756' && tgt.tag.palLook, JSON.stringify(tgt.tag));
  check('PLC target tag-based: the address style follows (Local:1:I.Data.0), the change is logged, saved and kept on reopening', tgt.tag.target === 'tag' && tgt.tag.addr === 'tag' && tgt.tag.saved === 'tag' && tgt.tag.fmt === 'Local:1:I.Data.0' && tgt.tag.logged && tgt.tag.reopened, JSON.stringify(tgt.tag));
  check('PLC target: the wiring, terminals and program are the same in both looks (only the drawing changes)', await page.evaluate(() => App.serialize().ladder.rungs[0].text === 'XIC I:1/0 OTE O:2/0' && Circuit.DEFS.mdi16.terms.every(t => t.side === -1 || t.side === 1)));
  await page.evaluate(() => App.organizer()); await wait(150);
  check('PLC target tag-based: the Organizer shows Tasks → MainTask → MainProgram → MainRoutine, the routine by name and the 1756-style backplane with its slots', await page.evaluate(() => { const t = document.querySelector('.org').textContent; return t.includes('MainTask') && t.includes('MainProgram') && t.includes('MainRoutine') && t.includes('FILL') && !t.includes('LAD 3') && t.includes('1756 Backplane') && t.includes('Local:1') && t.includes('Local:2'); }));
  const brandTag = await page.evaluate(re => !new RegExp(re, 'i').test(document.documentElement.outerHTML), BRANDS.source);
  await page.evaluate(() => { document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); App.showView('ladder'); }); await wait(150);
  check('PLC target tag-based: the Ladder lists MainRoutine and routines by name, with ＋ Routine', await page.evaluate(() => { const o = [...document.querySelectorAll('#view-ladder [data-lfile] option')].map(x => x.textContent); return o[0] === 'MainRoutine' && o[1] === 'FILL' && document.querySelector('#view-ladder [data-act="newfile"]').textContent.includes('Routine'); }));
  await page.evaluate(() => App.ioConfig()); await wait(150);
  check('PLC target: the I/O Configuration has the target picker and lists each slot\'s tags (Local:1:I.Data)', await page.evaluate(() => !!document.querySelector('.modal [data-target]') && document.querySelector('.modal [data-target]').value === 'tag' && document.querySelector('.modal .io-cfg').textContent.includes('Local:1:I.Data') && document.querySelector('.modal .io-cfg').textContent.includes('Local:2:O.Data')));
  await page.selectOption('.modal [data-target]', 'file'); await wait(250);
  check('PLC target: picking the file-based target in the I/O Configuration switches the project back (I:1/0, data file I:1 per slot)', await page.evaluate(() => App.project.target === 'file' && App.project.addr === 'file' && App.fmt('I:1/0') === 'I:1/0' && document.querySelector('.modal [data-target]').value === 'file' && document.querySelector('.modal .io-cfg').textContent.includes('I:1')));
  check('PLC target: after the target picker reopened the I/O Configuration and it was closed, no dialog is left catching Enter', await page.evaluate(() => { document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }); document.body.dispatchEvent(ev); return !ev.defaultPrevented && !document.querySelector('.modal-wrap'); }));
  await page.evaluate(() => { document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); App.organizer(); }); await wait(150);
  check('PLC target file-based: the project tree shows Program Files (SYS 0, SYS 1, LAD 2 – MAIN, LAD 3 – FILL) and Data Files O0, I1, S2, B3, T4, C5, R6, N7', await page.evaluate(() => { const t = document.querySelector('.org').textContent; return ['SYS 0', 'SYS 1', 'LAD 2 – MAIN', 'LAD 3 – FILL', 'O0 – OUTPUT', 'I1 – INPUT', 'S2 – STATUS', 'B3 – BINARY', 'T4 – TIMER', 'C5 – COUNTER', 'R6 – CONTROL', 'N7 – INTEGER'].every(x => t.includes(x)) && !t.includes('MainTask'); }));
  const brandFile = await page.evaluate(re => !new RegExp(re, 'i').test(document.documentElement.outerHTML), BRANDS.source);
  await page.click('.org [data-org="dN7"]'); await wait(200);
  check('PLC target file-based: a data file in the project tree opens it in the data table (N7)', await page.evaluate(() => !!document.querySelector('#view-ladder .dt-tabs button.on[data-file="N7"]')));
  await page.evaluate(() => App.newProject()); await wait(150);
  const brandNew = await page.evaluate(re => !new RegExp(re, 'i').test(document.documentElement.outerHTML), BRANDS.source);
  await page.selectOption('.modal #f_plc', 'tag'); await page.click('.modal-wrap:last-child .btn.primary'); await wait(300);
  check('PLC target: New project page 2 asks for the chassis, the controller slot and the connection (Realistic by default for tag-based)', await page.evaluate(() => /controller/.test([...document.querySelectorAll('.modal-wrap')].pop().textContent) && document.querySelector('.modal-wrap:last-child #f_ch').value === '7' && document.querySelector('.modal-wrap:last-child #f_conn').value === 'real' && !!document.querySelector('.modal-wrap:last-child #f_slot')));
  await page.click('.modal-wrap:last-child .btn.primary'); await wait(300);
  check('PLC target: New project asks for the target; a tag-based blank project uses tag-based addresses, a 7-slot chassis and the Realistic connection', await page.evaluate(() => App.project.target === 'tag' && App.project.addr === 'tag' && App.project.io.chassis === '7' && App.project.conn.mode === 'real'));
  check('PLC target: no brand names in the target picker, the Organizer, the project tree or the New project form', brandTag && brandFile && brandNew);
  await page.evaluate(() => { document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); App.openNew(Examples.EX.plcmotor.build()); App.setLayout(window._lay0); document.querySelector('#view-ladder [data-lorg]').hidden = true; });
  console.log('PLC chassis: modules snap into slots, the slot is the position');
  {
    await page.evaluate(() => {
      const prev = App.currentId; App.openNew({ name: 'Chassis', target: 'tag', circuit: { seq: 1, comps: [{ id: 'c1', type: 'chassis', x: 0, y: 0, props: { label: 'RACK1', slots: '7' }, state: {} }], wires: [] } }); if (prev) Store.remove(prev);
      window._lay1 = App.layout; App.setLayout('single'); App.showView('wiring');
    });
    await wait(250);
    const add = t => page.click(`#view-wiring .pal-item[data-type="${t}"]`);
    for (const t of ['mpsu', 'mcpu', 'mdi16', 'mdo16']) { await add(t); await wait(120); }
    const seated = await page.evaluate(() => {
      const C = App.project.circuit.comps, ch = C.find(c => c.type === 'chassis'), by = t => C.find(c => c.type === t);
      const x0 = ch.x + 10 + 90 + 2;
      return { ps: by('mpsu').x === ch.x + 10 && by('mpsu').y === ch.y + 52, cpu: by('mcpu').x === x0 && by('mcpu').y === ch.y + 52,
        di: by('mdi16').props.slot === '1' && by('mdi16').x === x0 + 74, dout: by('mdo16').props.slot === '2' && by('mdo16').x === x0 + 148,
        inChassis: ['mpsu', 'mcpu', 'mdi16', 'mdo16'].every(t => Circuit.chassisOf(App.project.circuit, by(t)) === ch) };
    });
    check('chassis: with a chassis in the Wiring, a new power supply goes to the bay, the controller to slot 0 and I/O modules to the first free slots (1, 2)', Object.values(seated).every(Boolean), JSON.stringify(seated));
    // drag the input module from slot 1 to slot 4 with the mouse
    const box = async id => { const b = await (await page.$(`#view-wiring [data-cid="${id}"] .frame`)).boundingBox(); return b; };
    const diId = await page.evaluate(() => App.project.circuit.comps.find(c => c.type === 'mdi16').id);
    const ch74 = (await box(diId)).width / 80 * 74;   // one slot on screen (the frame is 10 wider than the 70-wide module)
    { const b = await box(diId); await page.mouse.move(b.x + b.width / 2, b.y + 40); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + ch74 * 3 + 6, b.y + 52, { steps: 8 }); await page.mouse.up(); await wait(200); }
    check('chassis: an I/O module dragged to another slot snaps into it and takes its number (slot 4 → I:4 / Local:4)', await page.evaluate(() => { const c = App.project.circuit.comps.find(x => x.type === 'mdi16'), ch = App.project.circuit.comps.find(x => x.type === 'chassis'); return c.props.slot === '4' && c.x === ch.x + 10 + 90 + 2 + 4 * 74 && c.y === ch.y + 52; }));
    { const b = await box(diId); await page.mouse.move(b.x + b.width / 2, b.y + 40); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 - ch74 * 2, b.y + 40, { steps: 8 }); await page.mouse.up(); await wait(200); }
    check('chassis: a slot that is taken sends the module back (slot 2 holds the output module)', await page.evaluate(() => App.project.circuit.comps.find(x => x.type === 'mdi16').props.slot === '4' && !!document.querySelector('.toast')));
    await page.evaluate(() => { const C = App.project.circuit.comps, d = C.find(x => x.type === 'mdo16'); d.props.slot = '5'; const err = Circuit.seat(App.project.circuit, d, 'slot'); window._err = err; App.circuitChanged(); });
    check('chassis: picking a slot number moves the module to that slot', await page.evaluate(() => { const C = App.project.circuit.comps, d = C.find(x => x.type === 'mdo16'), ch = C.find(x => x.type === 'chassis'); return window._err === '' && d.x === ch.x + 10 + 90 + 2 + 5 * 74; }));
    check('chassis: slot 0 is the controller\'s and slots 8–12 of a 13-slot chassis are not used', await page.evaluate(() => {
      const C = App.project.circuit.comps, ch = C.find(x => x.type === 'chassis'), d = C.find(x => x.type === 'mdo16');
      d.props.slot = '0'; const e0 = Circuit.seat(App.project.circuit, d, 'slot');
      ch.props.slots = '13'; d.x = ch.x + 10 + 90 + 2 + 9 * 74; const e9 = Circuit.seat(App.project.circuit, d, 'pos');
      d.props.slot = '5'; ch.props.slots = '7'; Circuit.seat(App.project.circuit, d, 'slot'); App.circuitChanged();
      return /controller/.test(e0) && /not used/.test(e9) && Circuit.dims({ type: 'chassis', props: { slots: '13' } }).w > Circuit.dims({ type: 'chassis', props: { slots: '4' } }).w;
    }));
    await page.evaluate(() => { App.project.io = Circuit.cleanIo({ slots: { 4: 'mdi16', 5: 'mdo16' } }); App.addrChanged(); });
    check('chassis: the controller sees the modules in their slots (I/O configuration matches, no fault)', await page.evaluate(() => { const r = Circuit.rack(App.project.circuit, App.project.io); return !!r.cpu && r.bad.length === 0 && App.fmt('I:4/0') === 'Local:4:I.Data.0'; }));
    const chId = await page.evaluate(() => App.project.circuit.comps.find(c => c.type === 'chassis').id);
    { const b = await box(chId); await page.mouse.move(b.x + 30, b.y + 20); await page.mouse.down(); await page.mouse.move(b.x + 130, b.y + 80, { steps: 8 }); await page.mouse.up(); await wait(200); }
    check('chassis: moving the chassis moves its modules, which keep their slots', await page.evaluate(() => { const C = App.project.circuit.comps, ch = C.find(x => x.type === 'chassis'), di = C.find(x => x.type === 'mdi16'); return ch.x !== 0 && di.x === ch.x + 10 + 90 + 2 + 4 * 74 && di.y === ch.y + 52 && di.props.slot === '4'; }));
    check('chassis: drawn in the look of the PLC target (1756-style here)', await page.evaluate(() => !!document.querySelector(`#view-wiring [data-cid="${App.project.circuit.comps.find(c => c.type === 'chassis').id}"] .look-1756`)));
    check('chassis: a project without a chassis keeps its modules where they are (old projects unchanged)', await page.evaluate(() => { const c = { id: 'z', type: 'mdi16', x: 5000, y: 5000, props: { slot: '3' } }; return Circuit.chassisOf(App.project.circuit, c) === null && Circuit.seat(App.project.circuit, c, 'pos') === null && c.x === 5000; }));
    await page.evaluate(() => { App.openNew(Examples.EX.plcmotor.build()); App.setLayout(window._lay1); });
  }
  console.log('PLC module: Organizer on the left, chassis size, module faults');
  {
    await page.evaluate(() => {
      const prev = App.currentId;
      App.openNew({ name: 'Organizer', target: 'tag', io: { slots: { 1: 'mdi16', 2: 'mdo16' }, chassis: '7' }, ladder: { rungs: [{ text: 'XIC I:1/0 OTE O:2/0' }], files: [{ n: 3, name: 'FILL', rungs: [] }] },
        circuit: { seq: 6, comps: [{ id: 'c1', type: 'chassis', x: 0, y: 0, props: { label: 'RACK1', slots: '10' }, state: {} }, { id: 'c2', type: 'mpsu', x: 10, y: 52, props: { label: 'PS1' }, state: {} },
          { id: 'c3', type: 'mcpu', x: 102, y: 52, props: { label: 'CPU1' }, state: {} }, { id: 'c4', type: 'mdi16', x: 176, y: 52, props: { label: 'DI1', slot: '1' }, state: {} }, { id: 'c5', type: 'mdo16t', x: 250, y: 52, props: { label: 'DO1', slot: '2' }, state: {} }], wires: [] } });
      if (prev) Store.remove(prev);
      window._lay2 = App.layout; App.setLayout('single'); App.showView('ladder');
      document.querySelector('#view-ladder [data-lorg]').hidden = true;
    });
    await wait(200);
    await page.click('#view-ladder [data-act="org"]'); await wait(200);
    const org = await page.evaluate(() => { const b = document.querySelector('#view-ladder [data-lorg]'); return { open: !b.hidden, modal: !!document.querySelector('.modal-wrap'), text: b.textContent }; });
    check('PLC module: the Organizer opens docked on the left of the ladder (no dialog), with the path to the controller found in the Wiring', org.open && !org.modal && /Path: Backplane\\0 \(CPU1\)/.test(org.text) && org.text.includes('MainRoutine'), org.text.slice(0, 200));
    check('PLC module: the I/O tree shows the chassis and each module, and marks a module that does not match (⚠ slot 2) and the chassis size (⚠ 7 configured, 10 installed)', /⚠[^⚠]*7 slots configured, 10 installed/.test(org.text) && /\[2\][^\[]*⚠/.test(org.text) && !/\[1\][^\[]*⚠/.test(org.text.split('[2]')[0]), org.text);
    check('PLC module: a chassis of another size is a fault — file-based: RUN is refused; tag-based: the controller runs and every module faults', await page.evaluate(async () => {
      App.project.target = 'file'; App.setMode('RUN'); const fileMode = App.plc.mode; App.project.target = 'tag';
      App.setMode('RUN'); await new Promise(q => setTimeout(q, 300)); const tagMode = App.plc.mode, di = App.project.circuit.comps.find(c => c.type === 'mdi16');
      const st = Circuit.status(di, App.ctx); App.setMode('PROG');
      return fileMode === 'PROG' && tagMode === 'RUN' && /Module fault: the 10-slot chassis/.test(st) && App.events().some(e => e.kind === 'alarm' && /Module fault \(Code 16#0022\) — chassis/.test(e.msg));
    }));
    await page.click('#view-ladder [data-lorg] [data-org="f3"]'); await wait(200);
    check('PLC module: a routine clicked in the Organizer opens in the ladder and the Organizer stays open', await page.evaluate(() => Ladder.file() === 3 && !document.querySelector('#view-ladder [data-lorg]').hidden));
    await page.evaluate(() => App.ioConfig()); await wait(150);
    check('PLC module: the I/O Configuration has a chassis row (configured 7, installed 10, mismatch)', await page.evaluate(() => { const s = document.querySelector('.modal [data-slot="ch"]'); return !!s && s.value === '7' && /mismatch/.test(document.querySelector('.modal [data-st="ch"]').textContent); }));
    await page.click('.modal-foot button:has-text("Read I/O Config")'); await page.click('.modal-foot button:has-text("Apply")'); await wait(200);
    check('PLC module: Read I/O Config + Apply takes the installed chassis and modules; the faults clear in the tree', await page.evaluate(() => { const t = document.querySelector('#view-ladder [data-lorg]').textContent; return App.project.io.chassis === '10' && App.project.io.slots['2'] === 'mdo16t' && Circuit.rack(App.project.circuit, App.project.io).bad.length === 0 && !t.includes('⚠'); }));
    check('PLC module: the chassis size is saved with the I/O configuration; a project without one has no chassis check', await page.evaluate(() => App.serialize().io.chassis === '10' && !('chassis' in Circuit.cleanIo({ slots: {} })) && Circuit.cleanIo({ slots: {}, chassis: '9' }).chassis === undefined));
    await page.click('#view-ladder [data-act="org"]'); await wait(150);
    check('PLC module: the Organizer button closes it again', await page.evaluate(() => document.querySelector('#view-ladder [data-lorg]').hidden));
    await page.evaluate(() => { App.openNew(Examples.EX.plcmotor.build()); App.setLayout(window._lay2); });
  }
  console.log('Comms: engineering PC, driver, cable, Who Active, project path, Download, communication lost');
  {
    await page.evaluate(() => {
      const prev = App.currentId;
      App.openNew({ name: 'Comms PC', target: 'tag', io: { slots: { 1: 'meth', 2: 'mdi16' } }, conn: { mode: 'real' }, ladder: { rungs: [{ text: 'XIC I:2/0 OTE B3:0/0' }] },
        circuit: { seq: 9, comps: [{ id: 'c0', type: 'supply1', x: -260, y: 60, props: { label: 'Q1' }, state: { on: true } },
          { id: 'c1', type: 'chassis', x: 0, y: 0, props: { label: 'RACK1', slots: '4' }, state: {} }, { id: 'c2', type: 'mpsu', x: 10, y: 52, props: { label: 'PS1' }, state: {} },
          { id: 'c3', type: 'mcpu', x: 102, y: 52, props: { label: 'CPU1' }, state: {} }, { id: 'c4', type: 'meth', x: 176, y: 52, props: { label: 'EN1', slot: '1', ip: '192.168.1.20' }, state: {} },
          { id: 'c5', type: 'mdi16', x: 250, y: 52, props: { label: 'DI1', slot: '2' }, state: {} }, { id: 'c6', type: 'epc', x: 0, y: 520, props: { label: 'PC1' }, state: {} }],
          wires: [{ id: 'w1', a: 'c0:L', b: 'c2:L1', pts: [] }, { id: 'w2', a: 'c0:N', b: 'c2:N', pts: [] }] } });
      if (prev) Store.remove(prev);
      window._lay3 = App.layout; App.setLayout('single'); App.showView('ladder');
    });
    await wait(300);
    const who = () => page.evaluate(() => (document.querySelector('.modal-wrap[data-who] .modal-body') || {}).textContent || '');
    const closeAll = () => page.evaluate(() => document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()));
    check('comms: the Ethernet module has no I/O words, the input module keeps slot 2 (Local:2:I.Data.0)', await page.evaluate(() => { const m = Circuit.ioMap(App.project.circuit, App.project.io); return m.length === 1 && m[0].word === 2 && m[0].file === 'I' && !!Circuit.ioCheck(PLCcore.parse('O:1/0'), App.project.circuit, App.project.io) && Ladder.verify(true); }));
    await page.evaluate(() => App.goOnline()); await wait(200);
    check('comms: Go Online without a project path is refused and Who Active opens; the driver is not running', await page.evaluate(() => !App.conn.online) && /Comms driver: not running/.test(await who()));
    await closeAll();
    await page.evaluate(() => App.operate(App.project.circuit.comps.find(c => c.type === 'epc'), 'drv')); await wait(300);
    const st1 = await page.evaluate(() => App.project.circuit.comps.find(c => c.type === 'epc').state.drv);
    await wait(1700);
    const st2 = await page.evaluate(() => App.project.circuit.comps.find(c => c.type === 'epc').state.drv);
    check('comms: the engineering PC\'s driver starts (starting… then running) when its button is clicked', st1 === 'starting' && st2 === 'running', st1 + ' → ' + st2);
    await page.evaluate(() => App.whoActive()); await wait(150);
    check('comms: with the driver running but no cable, Who Active finds nothing and says why', /No cable from PC1/.test(await who()) && (await page.evaluate(() => document.querySelector('.modal [data-who="set"]').disabled)));
    await closeAll();
    await page.evaluate(() => { App.project.circuit.wires.push({ id: 'w9', a: 'c6:ETH', b: 'c4:ETH', pts: [] }); App.circuitChanged(); }); await wait(200);
    await page.evaluate(() => App.whoActive()); await wait(150);
    check('comms: an Ethernet cable to the Ethernet module shows driver → Ethernet → 192.168.1.20 → backplane → 00 CPU1 and the modules', await (async () => { const t = await who(); return /Ethernet/.test(t) && t.includes('192.168.1.20') && /Backplane/.test(t) && /00, CPU1/.test(t) && /02, DI1/.test(t); })());
    await page.click('.modal [data-who="set"]'); await wait(200);
    check('comms: Set Project Path stores the path (shown in Who Active and the Organizer) and it is saved', await page.evaluate(() => { const p = App.project.conn.path; App.organizer(); return p && p.via === 'ETH' && p.ip === '192.168.1.20' && p.ctl === 'CPU1' && /Ethernet\\192\.168\.1\.20\\Backplane\\0/.test(document.querySelector('#view-ladder [data-lorg]').textContent) && App.serialize().conn.path.ip === '192.168.1.20'; }));
    await closeAll();
    await page.evaluate(() => { App.setMode('PROG'); App.download(true); }); await wait(700);
    check('comms: Download writes the project into the controller and goes online', await page.evaluate(() => App.conn.online && App.events().some(e => /Download: the project was written/.test(e.msg))));
    await page.evaluate(() => App.upload()); await wait(150);
    check('comms: Upload shows "not available in the trainer" and changes nothing', await page.evaluate(() => /Upload is not available in the trainer/.test(document.querySelector('.modal-body').textContent) && App.conn.online && App.project.ladder.rungs.length === 1));
    await closeAll();
    await page.evaluate(() => { App.project.circuit.wires = App.project.circuit.wires.filter(w => w.id !== 'w9'); App.circuitChanged(); }); await wait(500);
    check('comms: pulling the cable out while online gives "communication lost" (alarm) and goes offline', await page.evaluate(() => !App.conn.online && App.events().some(e => e.kind === 'alarm' && /Communication lost with CPU1/.test(e.msg))));
    await page.evaluate(() => { App.project.circuit.wires.push({ id: 'w9', a: 'c6:ETH', b: 'c4:ETH', pts: [] }); App.circuitChanged(); App.goOnline(); }); await wait(200);
    const back = await page.evaluate(() => App.conn.online);
    await page.evaluate(() => App.operate(App.project.circuit.comps.find(c => c.type === 'epc'), 'drv')); await wait(500);
    check('comms: with the cable back Go Online works; stopping the driver drops the connection', back && await page.evaluate(() => !App.conn.online && App.events().filter(e => /Communication lost/.test(e.msg)).length >= 2));
    await page.evaluate(() => { const pc = App.project.circuit.comps.find(c => c.type === 'epc'); pc.state.drv = 'running'; App.project.circuit.wires = App.project.circuit.wires.filter(w => w.id !== 'w9'); App.project.circuit.wires.push({ id: 'w8', a: 'c6:USB', b: 'c3:PRG', pts: [] }); App.circuitChanged(); App.whoActive(); }); await wait(200);
    check('comms: a USB cable to the controller\'s programming port finds it too (USB → CPU1); the old Ethernet path no longer reaches it', /USB/.test(await who()) && /00, CPU1/.test(await who()) && await page.evaluate(() => /does not reach/.test(App.pathErr())));
    await closeAll();
    await page.evaluate(() => {
      const prev = App.currentId;
      App.openNew({ name: 'Wrong type', target: 'tag', conn: { mode: 'real' }, circuit: { seq: 3, comps: [{ id: 'c0', type: 'supply1', x: -260, y: 0, props: { label: 'Q1' }, state: { on: true } }, { id: 'c1', type: 'plc16', x: 0, y: 0, props: { label: 'PLC1' }, state: {} }, { id: 'c2', type: 'epc', x: 0, y: 400, props: { label: 'PC1' }, state: { drv: 'running' } }],
        wires: [{ id: 'w1', a: 'c0:L', b: 'c1:L1', pts: [] }, { id: 'w2', a: 'c0:N', b: 'c1:N', pts: [] }, { id: 'w3', a: 'c2:USB', b: 'c1:PRG', pts: [] }] } });
      if (prev) Store.remove(prev);
    }); await wait(300);
    await page.evaluate(() => App.whoActive()); await wait(150);
    await page.click('.modal [data-who="set"]'); await wait(200);
    check('comms: a controller that does not fit the project (compact PLC in a tag-based project) is refused at Set Project Path', await page.evaluate(() => !App.project.conn.path && App.events().some(e => /compact file-based PLC, but the project is tag-based/.test(e.msg))));
    await closeAll();
    check('comms: a Realistic project with no controller in the Wiring needs no path (virtual controller)', await page.evaluate(() => { App.openNew({ name: 'Virtual', conn: { mode: 'real' }, ladder: { rungs: [{ text: 'XIC B3:0/0 OTE B3:0/1' }] } }); App.setMode('PROG'); App.download(true); const ok = App.conn.online; App.goOnline(); return ok && App.pathErr() === null; }));
    check('comms: no brand names in Who Active, the PC or the Ethernet module', await page.evaluate(() => { App.whoActive(); const h = document.documentElement.outerHTML + Circuit.DEFS.epc.info + Circuit.DEFS.meth.info; document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); return !/Allen.?Bradley|Rockwell|RSLogix|RSLinx|MicroLogix|PanelView|SLC 500|ControlLogix|CompactLogix|Logix Designer|Studio 5000|EtherNet\/IP/i.test(h); }));
    await page.evaluate(() => { document.querySelector('#view-ladder [data-lorg]').hidden = true; App.openNew(Examples.EX.plcmotor.build()); App.setLayout(window._lay3); });
  }
  console.log('I/O Configuration per target: module fault (tag-based) or major fault (file-based)');
  {
    const proj = target => ({ name: 'Faults ' + target, target, io: { slots: { 1: 'mdi16', 2: 'mdo16' } }, ladder: { rungs: [{ text: 'XIC B3:0/2 OTE O:2/0' }, { text: 'XIC B3:0/0 OTE B3:0/1' }] },
      circuit: { seq: 8, comps: [{ id: 'c0', type: 'supply1', x: -260, y: 60, props: { label: 'Q1' }, state: { on: true } }, { id: 'c1', type: 'chassis', x: 0, y: 0, props: { label: 'RACK1', slots: '4' }, state: {} },
        { id: 'c2', type: 'mpsu', x: 10, y: 52, props: { label: 'PS1' }, state: {} }, { id: 'c3', type: 'mcpu', x: 102, y: 52, props: { label: 'CPU1' }, state: {} },
        { id: 'c4', type: 'mdo16t', x: 176, y: 52, props: { label: 'DQ1', slot: '1' }, state: {} }, { id: 'c5', type: 'mdo16', x: 250, y: 52, props: { label: 'DO1', slot: '2' }, state: {} }],
        wires: [{ id: 'w1', a: 'c0:L', b: 'c2:L1', pts: [] }, { id: 'w2', a: 'c0:N', b: 'c2:N', pts: [] }] } });
    const tagRun = await page.evaluate(async p => {
      const prev = App.currentId; App.openNew(p); if (prev) Store.remove(prev);
      window._lay4 = App.layout; App.setLayout('single'); App.showView('ladder');
      await new Promise(q => setTimeout(q, 300));
      App.setMode('RUN'); await new Promise(q => setTimeout(q, 400));
      App.plc.write('B3:0/0', 1); await new Promise(q => setTimeout(q, 200));
      const C = App.project.circuit.comps, dq = C.find(c => c.props.label === 'DQ1'), dout = C.find(c => c.props.label === 'DO1');
      const r = { mode: App.plc.mode, logic: App.plc.read('B3:0/1') === 1, faulted: /expects PLC Input Card 16/.test(Circuit.status(dq, App.ctx)), other: /Slot 2: O:2\/0/.test(Circuit.status(dout, App.ctx)),
        alarms: App.events().filter(e => e.kind === 'alarm' && /Module fault \(Code 16#0022\) — slot 1/.test(e.msg)).length };
      await new Promise(q => setTimeout(q, 300));
      r.once = App.events().filter(e => e.kind === 'alarm' && /Module fault \(Code 16#0022\) — slot 1/.test(e.msg)).length === 1;
      App.organizer(); r.tree = /\[1\][^\[]*⚠/.test(document.querySelector('#view-ladder [data-lorg]').textContent) && !!document.querySelector('#view-ladder [data-lorg] .org-add');
      return r;
    }, proj('tag'));
    check('tag-based: a module in the wrong slot is a module fault — the controller keeps running the logic, the other module works', tagRun.mode === 'RUN' && tagRun.logic && tagRun.faulted && tagRun.other, JSON.stringify(tagRun));
    check('tag-based: the module fault is logged once as an alarm and marked ⚠ in the Organizer (with ＋ New Module…)', tagRun.alarms === 1 && tagRun.once && tagRun.tree, JSON.stringify(tagRun));
    await page.click('#view-ladder [data-lorg] .org-add[data-org="newmod"]'); await wait(150);
    check('tag-based: ＋ New Module… opens Select Module Type', await page.evaluate(() => /Select Module Type/.test(document.querySelector('.modal-head').textContent)));
    await page.evaluate(() => { App.setMode('PROG'); }); await wait(100);
    await page.evaluate(() => document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()));
    await page.evaluate(() => App.ioConfig()); await wait(150);
    await page.click('.modal-foot button:has-text("Read I/O Config")'); await page.click('.modal-foot button:has-text("Apply")'); await wait(300);
    check('tag-based: once the configuration matches, the fault clears (logged) and the module works', await page.evaluate(() => App.events().some(e => /Module fault cleared — slot 1/.test(e.msg)) && Circuit.rack(App.project.circuit, App.project.io).bad.length === 0));
    const fileRun = await page.evaluate(async p => {
      App.openNew(p); await new Promise(q => setTimeout(q, 300));
      App.setMode('RUN'); const refused = App.plc.mode === 'PROG';
      App.project.io = Circuit.cleanIo({ slots: { 1: 'mdo16t', 2: 'mdo16' } }); App.addrChanged(); App.setMode('RUN'); await new Promise(q => setTimeout(q, 200));
      const ran = App.plc.mode === 'RUN';
      App.project.io = Circuit.cleanIo({ slots: { 1: 'mdi16', 2: 'mdo16' } }); await new Promise(q => setTimeout(q, 300));
      return { refused, ran, stopped: App.plc.mode === 'PROG' && App.events().some(e => /CPU fault: I\/O configuration mismatch/.test(e.msg)) };
    }, proj('file'));
    check('file-based: the same mismatch is a major fault — RUN is refused, and a running processor stops', fileRun.refused && fileRun.ran && fileRun.stopped, JSON.stringify(fileRun));
    await page.evaluate(() => { document.querySelector('#view-ladder [data-lorg]').hidden = true; App.openNew(Examples.EX.plcmotor.build()); App.setLayout(window._lay4); });
  }
  console.log('Routines and program files: new, JSR by name, rename, delete');
  {
    await page.evaluate(() => {
      const prev = App.currentId; App.openNew({ name: 'Routines', target: 'tag', ladder: { rungs: [{ text: 'XIC B3:0/0 JSR U:3' }], files: [{ n: 3, name: 'FILL', rungs: [{ text: 'XIC B3:0/0 OTE B3:0/1' }] }] } }); if (prev) Store.remove(prev);
      window._lay5 = App.layout; App.setLayout('single'); App.showView('ladder'); App.organizer();
    });
    await wait(250);
    check('routines: a JSR in a tag-based project shows the routine by name (FILL)', await page.evaluate(() => { const t = document.querySelector('#view-ladder .lad-rungs').textContent; return t.includes('Routine Name') && t.includes('FILL'); }));
    await page.click('#view-ladder [data-lorg] [data-org="new"]'); await wait(150);
    await page.fill('#f_nm', 'DRAIN'); await page.click('.modal-wrap:last-child .btn.primary'); await wait(200);
    check('routines: ＋ New Routine… in the Organizer adds a routine (DRAIN) and opens it', await page.evaluate(() => App.project.ladder.files.some(f => f.name === 'DRAIN' && f.n === 4) && Ladder.file() === 4 && document.querySelector('#view-ladder [data-lorg]').textContent.includes('DRAIN')));
    check('routines: a new routine starts with rung 0, empty (red ⊗) — Verify fails until it has an instruction', await page.evaluate(() => { const f = App.project.ladder.files.find(x => x.name === 'DRAIN'); return f.rungs.length === 1 && !f.rungs[0].elems.length && !!document.querySelector('#view-ladder .rung.empty') && !Ladder.verify(true); }));
    await page.evaluate(() => { const f = App.project.ladder.files.find(x => x.name === 'DRAIN'); f.rungs = [Ladder.newRung(Ladder.parseRung('XIC B3:0/5 OTE B3:0/6'))]; App.programChanged(); Ladder.openFile(2); }); await wait(100);
    await page.evaluate(() => { const r = App.project.ladder.rungs; Ladder.resetSel(); });
    await page.evaluate(() => { App.project.ladder.rungs.push(Ladder.newRung(Ladder.parseRung('XIC B3:0/2 JSR U:3'))); App.programChanged(); Ladder.render(); }); await wait(150);
    const jsrId = await page.evaluate(() => App.project.ladder.rungs[1].elems[1].id);
    await page.evaluate(id => Ladder.edit(id), jsrId); await wait(150);
    check('routines: the JSR form lists the routines by name', await page.evaluate(() => { const o = [...document.querySelectorAll('.modal #f_a0 option')].map(x => x.textContent); return o.join() === 'FILL,DRAIN'; }));
    await page.selectOption('.modal #f_a0', 'U:4'); await page.click('.modal-wrap:last-child .btn.primary'); await wait(200);
    check('routines: picking DRAIN stores JSR U:4 and the program verifies', await page.evaluate(() => Ladder.serialize(App.project.ladder.rungs[1].elems) === 'XIC B3:0/2 JSR U:4' && Ladder.verify(true)));
    await page.evaluate(() => { document.querySelector('#view-ladder [data-lorg] [data-orn="3"]').click(); }); await wait(150);
    await page.fill('#f_nm', 'Tank_Fill_Sequence_Long_Name'); await page.click('.modal-wrap:last-child .btn.primary'); await wait(200);
    check('routines: renaming a routine keeps every JSR to it (shown with the new name; a tag-based routine keeps its case and a long name)', await page.evaluate(() => App.project.ladder.files.find(f => f.n === 3).name === 'Tank_Fill_Sequence_Long_Name' && document.querySelector('#view-ladder .lad-rungs').textContent.includes('Tank_Fill_Sequence_Long_Name') && Ladder.verify(true)));
    await page.evaluate(() => { document.querySelector('#view-ladder [data-lorg] [data-ordel="4"]').click(); }); await wait(150);
    await page.click('.modal-wrap:last-child .btn.danger, .modal-wrap:last-child .btn.primary'); await wait(200);
    check('routines: deleting a routine that a JSR calls makes that JSR an error in Verify', await page.evaluate(() => !App.project.ladder.files.some(f => f.n === 4) && !Ladder.verify(true)));
    await page.evaluate(() => { App.project.target = 'file'; App.organizer(); }); await wait(150);
    check('program files: the file-based tree offers ＋ New Program File… and rename / delete on LAD 3', await page.evaluate(() => { const b = document.querySelector('#view-ladder [data-lorg]'); return /New Program File/.test(b.textContent) && !!b.querySelector('[data-orn="3"]') && !!b.querySelector('[data-ordel="3"]'); }));
    await page.evaluate(() => { document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); document.querySelector('#view-ladder [data-lorg]').hidden = true; App.openNew(Examples.EX.plcmotor.build()); App.setLayout(window._lay5); });
  }
  console.log('Ladder UI: status box, path, tabbed instruction palette, online menu');
  {
    await page.evaluate(() => { const prev = App.currentId; App.openNew(Examples.EX.plcmotor.build()); if (prev) Store.remove(prev); window._lay6 = App.layout; App.setLayout('single'); App.showView('ladder'); App.setMode('PROG'); Ladder.setTab('Favorites'); });
    await wait(250);
    const vis = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && !!e.offsetParent; }, sel);
    check('ladder UI: the status box shows Rem Prog, No Forces, No Edits and the path to the compact PLC', await page.evaluate(() => { const b = document.querySelector('#view-ladder [data-lstatus]'); return /Rem Prog/.test(b.querySelector('[data-st-mode]').textContent) && /No Forces/.test(b.textContent) && /No Edits/.test(b.textContent) && /Path: PLC \(compact PLC\)/.test(document.querySelector('#view-ladder [data-st-path]').textContent); }));
    check('ladder UI: Favorites is the first tab and shows XIC, OTE, TON; other instructions wait in their tabs', await vis('#view-ladder [data-ins="XIC"]') && await vis('#view-ladder [data-ins="TON"]') && !(await vis('#view-ladder [data-ins="OSR"]')) && await page.evaluate(() => document.querySelector('#view-ladder .ins-tab.on').dataset.itab === 'Favorites'));
    await page.click('#view-ladder [data-itab="Bit"]'); await wait(100);
    check('ladder UI: the Bit tab shows OSR / OSF and hides the timers; the tab is remembered', await vis('#view-ladder [data-ins="OSR"]') && !(await vis('#view-ladder [data-ins="TON"]')) && await page.evaluate(() => localStorage.getItem('plc-trainer.insTab') === 'Bit'));
    await page.click('#view-ladder [data-itab="Program Control"]'); await wait(100);
    check('ladder UI: the Program Control tab holds JSR, SBR, RET, MCR', (await Promise.all(['JSR', 'SBR', 'RET', 'MCR'].map(t => vis(`#view-ladder [data-ins="${t}"]`)))).every(Boolean));
    await page.click('#view-ladder [data-itab="Favorites"]');
    await page.evaluate(() => { App.setMode('RUN'); App.force('I:0/3', 1); }); await wait(300);
    check('ladder UI: in RUN the status says Rem Run, the RUN light is on and a force shows as Forces on (1)', await page.evaluate(() => { const b = document.querySelector('#view-ladder [data-lstatus]'); const ok = /Rem Run/.test(b.querySelector('[data-st-mode]').textContent) && b.querySelector('[data-st-led="run"]').classList.contains('on') && /Forces on \(1\)/.test(b.textContent); App.force('I:0/3', null); return ok; }));
    await page.click('#view-ladder [data-act="omenu"]'); await wait(150);
    check('ladder UI: the status menu (Simple connection) offers Who Active, Program Mode and the Realistic connection', await page.evaluate(() => { const t = [...document.querySelectorAll('.ctx-menu button')].map(b => b.textContent); return t.includes('Who Active…') && t.includes('Program Mode') && t.some(x => /Realistic connection/.test(x)); }));
    await page.click('.ctx-menu button:has-text("Program Mode")'); await wait(150);
    check('ladder UI: Program Mode in the menu puts the controller in PROG', await page.evaluate(() => App.plc.mode === 'PROG'));
    await page.evaluate(() => App.setConnMode('real')); await wait(150);
    await page.click('#view-ladder [data-act="omenu"]'); await wait(150);
    check('ladder UI: Realistic connection: the status says Rem Prog and the menu has Go Offline, Download, Upload', await page.evaluate(() => { const t = [...document.querySelectorAll('.ctx-menu button')].map(b => b.textContent); return /Rem Prog|Offline/.test(document.querySelector('#view-ladder [data-st-mode]').textContent) && ['Download…', 'Upload…'].every(x => t.includes(x)) && t.some(x => /Go (Online|Offline)/.test(x)); }));
    await page.keyboard.press('Escape');
    await page.evaluate(() => { document.getElementById('ctxMenu') && UI.closeMenu(); App.setConnMode('simple'); App.openNew(Examples.EX.plcmotor.build()); App.setLayout(window._lay6); });
  }
  console.log('Tag editor: Monitor Tags and Edit Tags');
  {
    await page.evaluate(() => { const prev = App.currentId; App.openNew({ name: 'Tag grid', target: 'tag', tags: [{ name: 'START_PB', type: 'ALIAS', addr: 'I:0/0' }, { name: 'RUN_T', type: 'TIMER' }], ladder: { rungs: [{ text: 'XIC START_PB TON RUN_T 1.0 5 0' }] } }); if (prev) Store.remove(prev); App.showView('ladder'); App.tagsDialog('edit'); });
    await wait(200);
    check('tag editor: Edit Tags shows a grid (name, data type, alias / address, description) with an empty row to add a tag', await page.evaluate(() => document.querySelectorAll('.tag-grid [data-trow]').length === 3 && document.querySelector('.tag-grid [data-trow="new"] [data-tf="name"]').value === '' && /Monitor Tags/.test(document.querySelector('.tag-tabs').textContent)));
    await page.fill('.tag-grid [data-trow="new"] [data-tf="name"]', 'level_sp'); await page.selectOption('.tag-grid [data-trow="new"] [data-tf="type"]', 'INT'); await wait(200);
    check('tag editor: typing in the last row creates the tag (LEVEL_SP, INT, gets an N7 word)', await page.evaluate(() => { const t = App.project.tags.find(x => x.name === 'LEVEL_SP'); return !!t && /^N7:/.test(t.addr) && !!document.querySelector('.modal-wrap[data-tags]'); }));
    await page.fill('.tag-grid [data-trow="0"] [data-tf="name"]', 'start_button'); await page.press('.tag-grid [data-trow="0"] [data-tf="name"]', 'Enter'); await wait(200);
    check('tag editor: renaming in the grid (Enter) renames the tag in the program and keeps the window open', await page.evaluate(() => App.project.tags[0].name === 'START_BUTTON' && Ladder.serialize(App.project.ladder.rungs[0].elems).startsWith('XIC START_BUTTON') && !!document.querySelector('.modal-wrap[data-tags]')));
    await page.fill('.tag-grid [data-trow="1"] [data-tf="desc"]', 'Pump run timer'); await page.press('.tag-grid [data-trow="1"] [data-tf="desc"]', 'Tab'); await wait(200);
    check('tag editor: a description typed in the grid is saved', await page.evaluate(() => App.project.tags[1].desc === 'Pump run timer'));
    await page.fill('.tag-grid [data-trow="1"] [data-tf="name"]', '3BAD'); await page.press('.tag-grid [data-trow="1"] [data-tf="name"]', 'Tab'); await wait(200);
    check('tag editor: a bad name is refused with a message and the tag keeps its name', await page.evaluate(() => App.project.tags[1].name === 'RUN_T' && !!document.querySelector('.toast')));
    await page.click('.tag-tabs [data-ttab="monitor"]'); await wait(200);
    check('tag editor: Monitor Tags lists the tags with their values', await page.evaluate(() => document.querySelectorAll('.tag-tbl [data-tedit]').length === 3 && !!document.querySelector('.tag-tbl [data-tval="RUN_T"]')));
    await page.evaluate(() => { document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); App.openNew(Examples.EX.plcmotor.build()); });
  }
  console.log('Like the reference software: online bar, Errors pane, Download, Who Active, Select Module Type');
  {
    await page.evaluate(() => {
      const prev = App.currentId;
      App.openNew({ name: 'Reference', target: 'tag', io: { slots: { 2: 'mdi16' } }, conn: { mode: 'real' }, ladder: { rungs: [{ text: 'XIC B3:0/0 OTE B3:0/1' }, { text: '' }] },
        circuit: { seq: 8, comps: [{ id: 'c0', type: 'supply1', x: -260, y: 60, props: { label: 'Q1' }, state: { on: true } }, { id: 'c1', type: 'chassis', x: 0, y: 0, props: { label: 'RACK1', slots: '4' }, state: {} },
          { id: 'c2', type: 'mpsu', x: 10, y: 52, props: { label: 'PS1' }, state: {} }, { id: 'c3', type: 'mcpu', x: 102, y: 52, props: { label: 'CPU1' }, state: {} },
          { id: 'c4', type: 'mdi16', x: 250, y: 52, props: { label: 'DI1', slot: '2' }, state: {} }, { id: 'c5', type: 'epc', x: 0, y: 500, props: { label: 'PC1' }, state: { drv: 'running' } }],
          wires: [{ id: 'w1', a: 'c0:L', b: 'c2:L1', pts: [] }, { id: 'w2', a: 'c0:N', b: 'c2:N', pts: [] }, { id: 'w3', a: 'c5:USB', b: 'c3:PRG', pts: [] }] } });
      if (prev) Store.remove(prev);
      window._lay7 = App.layout; App.setLayout('single'); App.showView('ladder'); App.setMode('PROG');
    });
    await wait(300);
    check('reference: the online bar has the LED stack (RUN OK BAT I/O), a key switch, the mode box Offline, Path: <none>, No Forces and No Edits', await page.evaluate(() => {
      const b = document.querySelector('#view-ladder [data-lstatus]');
      return ['run', 'ok', 'bat', 'io'].every(k => !!b.querySelector(`[data-st-led="${k}"]`)) && !!b.querySelector('[data-st-key] svg') && b.querySelector('[data-st-mode]').textContent === 'Offline' && /Path: <none>/.test(b.textContent) && /No Forces/.test(b.textContent) && /No Edits/.test(b.textContent);
    }));
    check('reference: an empty rung shows the red ⊗ marker', await page.evaluate(() => { const r = document.querySelector('#view-ladder .rung[data-r="1"]'); return r.classList.contains('empty') && getComputedStyle(r.querySelector('.rung-num'), '::before').content.includes('⊗'); }));
    check('reference: the instruction tabs follow the reference order (… Input/Output holds MSG, Compute/Math, Move/Logical, Program Control)', await page.evaluate(() => { const t = [...document.querySelectorAll('#view-ladder .ins-tab')].map(x => x.dataset.itab); return t.join('|') === 'Favorites|Bit|Timer/Counter|Input/Output|Compare|Compute/Math|Move/Logical|File/Misc|Program Control' && document.querySelector('#view-ladder [data-ins="MSG"]').dataset.g === 'Input/Output'; }));
    // Who Active: actions on the right, Path / Path in Project, Set and Clear Project Path
    await page.evaluate(() => App.whoActive()); await wait(150);
    check('reference: Who Active has Go Online / Upload / Download on the right, Path: USB\\CPU1 and Path in Project: <none>', await page.evaluate(() => { const m = document.querySelector('.modal-wrap[data-who]'); return ['online', 'upload', 'download'].every(k => !!m.querySelector(`.who-acts [data-who="${k}"]`)) && /Path: USB\\CPU1/.test(m.textContent) && /Path in Project: <none>/.test(m.textContent) && m.querySelector('[data-who="clear"]').disabled; }));
    await page.click('.modal [data-who="set"]'); await wait(200);
    check('reference: Set Project Path fills Path in Project and the online bar path; Clear Project Path empties it', await (async () => {
      const set = await page.evaluate(() => /Path in Project: USB\\CPU1/.test(document.querySelector('.modal-wrap[data-who]').textContent) && /Path: USB\\CPU1/.test(document.querySelector('#view-ladder [data-st-path]').textContent));
      await page.click('.modal [data-who="clear"]'); await wait(200);
      const cleared = await page.evaluate(() => !App.project.conn.path && /Path in Project: <none>/.test(document.querySelector('.modal-wrap[data-who]').textContent));
      await page.click('.modal [data-who="set"]'); await wait(200);
      return set && cleared;
    })());
    await page.click('.modal-wrap[data-who] .who-acts [data-who="download"]'); await wait(200);
    check('reference: Download asks first: the project name, Connected Controller (Name CPU1, Type, Path) and a DANGER warning', await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-wrap')].pop(); return /Download offline project 'Reference' to the controller/.test(m.textContent) && /Connected Controller/.test(m.textContent) && /CPU1/.test(m.textContent) && /DANGER/.test(m.textContent); }));
    await page.click('.modal-wrap:last-child .modal-foot button:has-text("Download")'); await wait(300);
    check('reference: the empty rung stops the download: the Errors pane says Verifying…, Complete - 1 error(s), Cancelling download... and counts 1 Error', await page.evaluate(() => { const L = Ladder.outLines().join('\n'); return !App.conn.online && /Verifying routines/.test(L) && /Complete - 1 error\(s\)/.test(L) && /Cancelling download/.test(L) && /^1 Error$/.test(document.querySelector('#view-ladder [data-oc="e"]').textContent) && document.querySelector('#view-ladder [data-lout]').classList.contains('open'); }));
    await page.evaluate(() => { document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); App.project.ladder.rungs.pop(); App.programChanged(); Ladder.render(); App.download(); }); await wait(200);
    await page.click('.modal-wrap:last-child .modal-foot button:has-text("Download")'); await wait(800);
    check('reference: with the rung fixed the download completes: online, the mode box says Rem Prog, the pane says Download complete', await page.evaluate(() => App.conn.online && document.querySelector('#view-ladder [data-st-mode]').textContent === 'Rem Prog' && /Download complete/.test(Ladder.outLines().join('\n')) && /0 Errors/.test(document.querySelector('#view-ladder [data-oc="e"]').textContent)));
    check('reference: the Errors pane chips hide a kind of line, and the rung position reads Rung n of N', await page.evaluate(() => { const c = document.querySelector('#view-ladder [data-oc="m"]'); c.click(); const hidden = !/Download complete/.test(document.querySelector('#view-ladder [data-olog]').textContent); c.click(); return hidden && /^Rung \d+ of 1$/.test(document.querySelector('#view-ladder [data-rungpos]').textContent); }));
    // Select Module Type: search, pick, create in a slot
    await page.evaluate(() => App.newModule()); await wait(150);
    await page.fill('.modal [data-msearch]', 'ob16'); await wait(100);
    check('reference: Select Module Type lists the catalog (Catalog Number / Description / Category) and the search narrows it (1 of N Module Types Found)', await page.evaluate(() => { const rows = [...document.querySelectorAll('.modal [data-mt]')].filter(r => !r.hidden); return rows.length === 1 && rows[0].dataset.mt === 'mdo16t' && /^1 of \d+ Module Types Found$/.test(document.querySelector('.modal [data-mcount]').textContent); }));
    await page.click('.modal [data-mt="mdo16t"]'); await page.click('.modal-wrap:last-child .modal-foot button:has-text("Create")'); await wait(200);
    check('reference: Create opens the module page (Type, Parent Local, Slot)', await page.evaluate(() => { const m = [...document.querySelectorAll('.modal-wrap')].pop(); return /New Module — OB16/.test(m.textContent) && !!m.querySelector('#f_slot') && m.querySelector('#f_parent').value === 'Local'; }));
    await page.selectOption('.modal-wrap:last-child #f_slot', '3'); await page.click('.modal-wrap:last-child .btn.primary'); await wait(200);
    check('reference: the new module is in the I/O Configuration (slot 3) and in the Organizer tree with its catalog number', await page.evaluate(() => { App.organizer(); return App.project.io.slots['3'] === 'mdo16t' && /\[3\] OB16/.test(document.querySelector('#view-ladder [data-lorg]').textContent) && /1756 Backplane, 4-slot chassis/.test(document.querySelector('#view-ladder [data-lorg]').textContent); }));
    check('reference: the Organizer has Controller Fault Handler, Power-Up Handler, Parameters and Local Tags, Unscheduled and Data Types', await page.evaluate(() => { const t = document.querySelector('#view-ladder [data-lorg]').textContent; return ['Controller Fault Handler', 'Power-Up Handler', 'Parameters and Local Tags', 'Unscheduled', 'Data Types'].every(x => t.includes(x)); }));
    await page.evaluate(() => { document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); App.showView('wiring'); }); await wait(200);
    const cpuBox = await (await page.$('#view-wiring [data-cid="c3"] .frame')).boundingBox();
    await page.mouse.click(cpuBox.x + cpuBox.width / 2, cpuBox.y + 60, { button: 'right' }); await wait(150);
    check('reference: right-click on the controller in the Wiring offers Run Mode / Program Mode / Who Active', await page.evaluate(() => { const t = [...document.querySelectorAll('.ctx-menu button')].map(b => b.textContent); return t.includes('Run Mode') && t.includes('Program Mode') && t.includes('Who Active…'); }));
    await page.keyboard.press('Escape');
    check('reference: no brand names in the new dialogs and panes', await page.evaluate(() => !/Allen.?Bradley|Rockwell|RSLogix|RSLinx|MicroLogix|PanelView|SLC 500|ControlLogix|CompactLogix|Logix Designer|Studio 5000/i.test(document.documentElement.outerHTML)));
    await page.evaluate(() => { UI.closeMenu && UI.closeMenu(); document.querySelector('#view-ladder [data-lorg]').hidden = true; App.openNew(Examples.EX.plcmotor.build()); App.setLayout(window._lay7); App.showView('ladder'); });
  }
  console.log('Reference corrections: alias display, live rails, project in the controller, timeout, I/O Not Responding, Faulted');
  {
    await page.evaluate(() => {
      const prev = App.currentId;
      App.openNew({ name: 'Tank line', target: 'tag', io: { slots: { 3: 'mdi16', 2: 'mdo16' } }, conn: { mode: 'real' }, tags: [{ name: 'STOP_PB1', type: 'ALIAS', addr: 'I:3/0', desc: 'Stop' }],
        ladder: { rungs: [{ text: 'XIC STOP_PB1 OTE B3:0/1' }] },
        circuit: { seq: 8, comps: [{ id: 'c0', type: 'supply1', x: -260, y: 60, props: { label: 'Q1' }, state: { on: true } }, { id: 'c1', type: 'chassis', x: 0, y: 0, props: { label: 'RACK1', slots: '4' }, state: {} },
          { id: 'c2', type: 'mpsu', x: 10, y: 52, props: { label: 'PS1' }, state: {} }, { id: 'c3', type: 'mcpu', x: 102, y: 52, props: { label: 'CPU1' }, state: {} },
          { id: 'c4', type: 'mdo16', x: 176, y: 52, props: { label: 'DO1', slot: '2' }, state: {} }, { id: 'c5', type: 'mdi16', x: 250, y: 52, props: { label: 'DI1', slot: '3' }, state: {} }, { id: 'c6', type: 'epc', x: 0, y: 500, props: { label: 'PC1' }, state: { drv: 'running' } }],
          wires: [{ id: 'w1', a: 'c0:L', b: 'c2:L1', pts: [] }, { id: 'w2', a: 'c0:N', b: 'c2:N', pts: [] }, { id: 'w3', a: 'c6:USB', b: 'c3:PRG', pts: [] }] } });
      if (prev) Store.remove(prev);
      window._lay8 = App.layout; App.setLayout('single'); App.showView('ladder'); App.setMode('PROG');
      App.project.conn.ctlName = 'Old line';
      App.project.conn.path = { via: 'USB', ip: '', ctl: 'CPU1' };
    });
    await wait(300);
    check('corrections: an alias shows its name and, under it, the address it stands for (STOP_PB1 / <Local:3:I.Data.0>)', await page.evaluate(() => { const t = [...document.querySelectorAll('#view-ladder .rung-svg text')].map(x => x.textContent); return t.includes('STOP_PB1') && t.includes('<Local:3:I.Data.0>'); }));
    await page.evaluate(() => App.whoActive()); await wait(150);
    check('corrections: Who Active shows the project in the controller (\'Old line\')', await page.evaluate(() => /00, CPU1 — [^']*, 'Old line'/.test(document.querySelector('.modal-wrap[data-who]').textContent)));
    await page.evaluate(() => { document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); App.download(); }); await wait(150);
    check('corrections: Download warns that the controller holds another project, which will be replaced', await page.evaluate(() => /holds another project, 'Old line'\. Download replaces it with 'Tank line'/.test([...document.querySelectorAll('.modal-wrap')].pop().textContent)));
    await page.click('.modal-wrap:last-child .modal-foot button:has-text("Download")'); await wait(150);
    check('corrections: overwriting another project asks once more (Overwrite)', await page.evaluate(() => /holds 'Old line'. Overwrite it with 'Tank line'?/.test([...document.querySelectorAll('.modal-wrap')].pop().textContent)));
    await page.click('.modal-wrap:last-child .modal-foot button:has-text("Overwrite")'); await wait(30);
    await page.evaluate(() => { App.project.circuit.wires = App.project.circuit.wires.filter(w => w.id !== 'w3'); App.circuitChanged(); }); await wait(600);
    check('corrections: a cable pulled out during the download gives "Communications timed out" and the download is cancelled', await page.evaluate(() => !App.conn.online && /Communications timed out\. Cancelling download/.test(Ladder.outLines().join('\n')) && App.project.conn.ctlName === 'Old line'));
    await page.evaluate(() => { App.project.circuit.wires.push({ id: 'w3', a: 'c6:USB', b: 'c3:PRG', pts: [] }); App.circuitChanged(); App.download(true); }); await wait(700);
    check('corrections: with the cable back the download completes and the controller now holds \'Tank line\'', await page.evaluate(() => App.conn.online && App.project.conn.ctlName === 'Tank line' && App.serialize().conn.ctlName === 'Tank line'));
    await page.evaluate(() => { App.setMode('RUN'); }); await wait(300);
    check('corrections: online in RUN the mode box says Rem Run and the power rails are green', await page.evaluate(() => document.querySelector('#view-ladder [data-st-mode]').textContent === 'Rem Run' && document.querySelector('#view-ladder .lad-rungs').classList.contains('live') && getComputedStyle(document.querySelector('#view-ladder .rung-svg .rail')).stroke.replace(/\s/g, '') === 'rgb(47,191,85)'));
    await page.evaluate(() => { App.project.io = Circuit.cleanIo({ slots: { 3: 'mdi16', 2: 'mdo16t' } }); App.addrChanged(); }); await wait(400);
    check('corrections: a module fault shows "I/O Not Responding" in the online bar and the module status gives Code 16#0022', await page.evaluate(() => { const b = document.querySelector('#view-ladder [data-st-io]'); const st = Circuit.status(App.project.circuit.comps.find(c => c.id === 'c4'), App.ctx); return !b.hidden && /I\/O Not Responding/.test(b.textContent) && /Code 16#0022\): an invalid reply was received/.test(st); }));
    await page.evaluate(() => { App.setMode('PROG'); App.project.target = 'file'; App.addrChanged(); Ladder.statusUi(); }); await wait(200);
    check('corrections: a file-based controller with that mismatch shows Faulted in the mode box and a red OK light', await page.evaluate(() => document.querySelector('#view-ladder [data-st-mode]').textContent === 'Faulted' && document.querySelector('#view-ladder [data-st-led="ok"]').classList.contains('bad')));
    await page.evaluate(() => { App.openNew(Examples.EX.plcmotor.build()); App.setLayout(window._lay8); });
  }
  console.log('Gap list: Upload, offline status, module catalog on the project, Controller Tags, placement, chassis example end to end');
  {
    await page.evaluate(() => { const prev = App.currentId; App.openNew({ name: 'No hardware', target: 'tag', conn: { mode: 'real' }, ladder: { rungs: [{ text: 'XIC B3:0/0 OTE B3:0/1' }] } }); if (prev) Store.remove(prev); window._lay9 = App.layout; App.setLayout('single'); App.showView('ladder'); });
    await wait(250);
    check('gaps: with no PLC in the Wiring the status box says Offline and Path: <none>', await page.evaluate(() => document.querySelector('#view-ladder [data-st-mode]').textContent === 'Offline' && document.querySelector('#view-ladder [data-st-path]').textContent === 'Path: <none>'));
    await page.click('#view-ladder [data-act="upload"]'); await wait(150);
    check('gaps: the toolbar Upload button shows "not available in the trainer" too', await page.evaluate(() => /Upload is not available in the trainer/.test([...document.querySelectorAll('.modal-wrap')].pop().textContent)));
    await page.evaluate(() => document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()));
    await page.click('#view-ladder [data-act="omenu"]'); await wait(150);
    check('gaps: offline (Realistic), Run Mode and Program Mode are greyed out in the controller menu', await page.evaluate(() => { const b = t => [...document.querySelectorAll('.ctx-menu button')].find(x => x.textContent === t); return b('Run Mode').disabled && b('Program Mode').disabled; }));
    await page.keyboard.press('Escape'); await page.evaluate(() => UI.closeMenu && UI.closeMenu());
    // modules are configured in the project, before any hardware
    await page.evaluate(() => App.newModule()); await wait(150);
    check('gaps: New Module opens the catalog even with no hardware in the Wiring', await page.evaluate(() => /Select Module Type/.test([...document.querySelectorAll('.modal-wrap')].pop().textContent) && document.querySelectorAll('.modal [data-mt]').length >= 10));
    await page.click('.modal [data-mt="mdi16"]'); await page.click('.modal-wrap:last-child .modal-foot button:has-text("Create")'); await wait(200);
    check('gaps: the module page has Name, Slot, Description and Connection (RPI, Inhibit Module, Major Fault on connection loss)', await page.evaluate(() => ['#f_name', '#f_slot', '#f_desc', '#f_rpi', '#f_inhibit', '#f_mf'].every(s => !!document.querySelector('.modal-wrap:last-child ' + s)) && document.querySelector('.modal-wrap:last-child #f_rpi').value === '20'));
    await page.fill('.modal-wrap:last-child #f_name', 'DI_1'); await page.selectOption('.modal-wrap:last-child #f_slot', '1'); await page.selectOption('.modal-wrap:last-child #f_mf', 'Yes'); await page.click('.modal-wrap:last-child .btn.primary'); await wait(200);
    check('gaps: the module is in the project I/O configuration with its properties, in the Organizer ([1] IB16 DI_1) and its tags in Controller Tags (Local:1:I)', await page.evaluate(() => { App.organizer(); const io = App.project.io; return io.slots['1'] === 'mdi16' && io.mods['1'].name === 'DI_1' && io.mods['1'].mf === true && /\[1\] IB16 DI_1/.test(document.querySelector('#view-ladder [data-lorg]').textContent) && /Local:1:I/.test(document.querySelector('#view-ladder .lad-side').textContent) && App.serialize().io.mods['1'].rpi === 20; }));
    check('gaps: a tag-based project shows Controller Tags (module tags, then tags) instead of the I and O data files', await page.evaluate(() => { const side = document.querySelector('#view-ladder .lad-side'); const tabs = [...side.querySelectorAll('[data-file]')].map(b => b.dataset.file); return /Controller Tags/.test(side.querySelector('.side-head h4').textContent) && tabs[0] === 'TAGS' && !tabs.includes('I') && !tabs.includes('O') && /Module tags/.test(side.textContent) && /Local:1:I\.Data\.0/.test(side.textContent); }));
    // the chassis example: the whole workflow with the hardware
    await page.evaluate(() => { document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); App.openNew(Examples.EX.chassis.build()); App.showView('ladder'); }); await wait(300);
    check('gaps: the 1756-style chassis example opens tag-based, Realistic, Offline, with the PC wired to the controller\'s USB port', await page.evaluate(() => App.project.target === 'tag' && App.project.conn.mode === 'real' && document.querySelector('#view-ladder [data-st-mode]').textContent === 'Offline' && App.project.circuit.wires.some(w => /:USB$/.test(w.a) && /:PRG$/.test(w.b))));
    await page.evaluate(() => { App.operate(App.project.circuit.comps.find(c => c.type === 'epc'), 'drv'); }); await wait(1800);
    await page.evaluate(() => App.whoActive()); await wait(150);
    await page.click('.modal [data-who="set"]'); await wait(150);
    await page.evaluate(() => { document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); App.download(true); }); await wait(700);
    await page.evaluate(() => App.setMode('RUN')); await wait(300);
    await press('S1'); await wait(300);
    check('gaps: chassis example end to end — driver, Who Active, Set Project Path, Download, RUN, START lights the run lamp (Local:2:O.Data.0)', await page.evaluate(() => App.conn.online && App.plc.mode === 'RUN' && App.plc.read('O:2/0') === 1 && App.project.circuit.comps.find(c => c.props.label === 'H1').state.on !== false), await page.evaluate(() => JSON.stringify([App.conn.online, App.plc.mode, App.plc.read('O:2/0'), App.project.conn.path])));
    check('gaps: the ladder shows the alias tags with the address under them (<Local:1:I.Data.0>)', await page.evaluate(() => [...document.querySelectorAll('#view-ladder .rung-svg .alias')].some(t => t.textContent === '<Local:1:I.Data.0>')));
    // a module set to major fault on connection loss stops a tag-based controller
    await page.evaluate(() => { App.project.io = Circuit.cleanIo({ ...App.project.io, mods: { 2: { mf: true } } }); App.project.io.slots['2'] = 'mdo16t'; App.addrChanged(); }); await wait(400);
    check('gaps: a module set to "Major Fault on connection loss" that does not match stops the tag-based controller', await page.evaluate(() => App.plc.mode === 'PROG' && App.events().some(e => /CPU fault: I\/O configuration mismatch/.test(e.msg))));
    await page.evaluate(() => { App.project.io = Circuit.cleanIo({ ...App.project.io, slots: { 1: 'mdi16', 2: 'mdo16' }, mods: { 2: { inhibit: true } } }); App.addrChanged(); }); await wait(300);
    check('gaps: an inhibited module is not checked and does not run (status Inhibited)', await page.evaluate(() => /Inhibited/.test(Circuit.status(App.project.circuit.comps.find(c => c.props.label === 'DO1'), App.ctx)) && Circuit.rack(App.project.circuit, App.project.io).bad.length === 0));
    // a part added from the library goes to free space
    await page.evaluate(() => App.showView('wiring')); await wait(200);
    await page.click('#view-wiring .pal-item[data-type="lamp"]'); await wait(200);
    check('gaps: a part added from the library is placed where it covers no other part', await page.evaluate(() => {
      const C = App.project.circuit.comps, n = C[C.length - 1], box = c => { const d = Circuit.dims(c); return [c.x, c.y, c.x + d.w, c.y + d.h]; }, [a0, b0, a1, b1] = box(n);
      return C.filter(c => c !== n && !Circuit.DEFS[c.type].layer && !Circuit.DEFS[c.type].junction).every(c => { const [x0, y0, x1, y1] = box(c); return a1 <= x0 || a0 >= x1 || b1 <= y0 || b0 >= y1; });
    }));
    await page.evaluate(() => { document.querySelector('#view-ladder [data-lorg]').hidden = true; App.setMode('PROG'); App.openNew(Examples.EX.plcmotor.build()); App.setLayout(window._lay9); });
  }
  console.log('Re-verification fixes: Who Active actions, wizard view, module properties, status strip, Tags only');
  {
    await page.evaluate(() => { const prev = App.currentId; App.openNew(Examples.EX.chassis.build()); if (prev) Store.remove(prev); window._lay10 = App.layout; App.setLayout('single'); App.showView('ladder');
      App.project.circuit.comps.find(c => c.type === 'epc').state.drv = 'running'; App.circuitChanged(); });
    await wait(300);
    check('re-verify: the status strip stays on one line with the chassis example (Events and View on the first line)', await page.evaluate(() => { const b = document.querySelector('.plcbar'), ev = b.querySelector('[data-events]'), m = b.querySelector('[data-mode="PROG"]'); return Math.abs(ev.getBoundingClientRect().top - m.getBoundingClientRect().top) < 12; }));
    check('re-verify: a tag-based project shows only the Tags tab in Controller Tags', await page.evaluate(() => [...document.querySelectorAll('#view-ladder .lad-side [data-file]')].map(b => b.dataset.file).join() === 'TAGS'));
    await page.evaluate(() => App.whoActive()); await wait(150);
    await page.click('.modal [data-who="set"]'); await wait(150);
    await page.click('.modal-wrap[data-who] .who-acts [data-who="upload"]'); await wait(200);
    check('re-verify: Upload from Who Active closes Who Active and shows the notice on top', await page.evaluate(() => !document.querySelector('.modal-wrap[data-who]') && /Upload is not available in the trainer/.test([...document.querySelectorAll('.modal-wrap')].pop().textContent)));
    await page.evaluate(() => { document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); App.whoActive(); }); await wait(150);
    await page.click('.modal-wrap[data-who] .who-acts [data-who="download"]'); await wait(200);
    check('re-verify: Download from Who Active closes Who Active and opens the Download dialog on top', await page.evaluate(() => !document.querySelector('.modal-wrap[data-who]') && /Download offline project/.test([...document.querySelectorAll('.modal-wrap')].pop().textContent)));
    await page.click('.modal-wrap:last-child .modal-foot button:has-text("Download")'); await wait(800);
    await page.evaluate(() => App.whoActive()); await wait(150);
    check('re-verify: after the download Who Active shows the downloaded project on the controller and offers Go Offline', await page.evaluate(() => { const m = document.querySelector('.modal-wrap[data-who]'); return App.conn.online && /00, CPU1 — [^']*, '1756-style chassis'/.test(m.textContent) && m.querySelector('[data-who="online"]').textContent === 'Go Offline'; }));
    await page.evaluate(() => { document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); App.organizer(); }); await wait(200);
    await page.dblclick('#view-ladder [data-lorg] [data-org="m1"]'); await wait(250);
    check('re-verify: a double-click on a module in the I/O tree opens Module Properties and it stays open', await page.evaluate(() => /Module Properties — Local:1 IB16/.test([...document.querySelectorAll('.modal-wrap')].pop().textContent) && !!document.querySelector('.modal-wrap:last-child [data-modrm]')));
    await page.selectOption('.modal-wrap:last-child #f_type', 'mdi16ac'); await page.click('.modal-wrap:last-child .btn.primary'); await wait(200);
    check('re-verify: changing the Type in Module Properties changes the configured module (IA16 in slot 1)', await page.evaluate(() => App.project.io.slots['1'] === 'mdi16ac'));
    await page.evaluate(() => App.moduleProps('1')); await wait(150);
    await page.click('.modal-wrap:last-child [data-modrm]'); await wait(150);
    await page.click('.modal-wrap:last-child .modal-foot button:has-text("Remove")'); await wait(200);
    check('re-verify: Remove module takes the slot out of the I/O configuration', await page.evaluate(() => !App.project.io.slots['1'] && !document.querySelector('#view-ladder [data-lorg] [data-org="m1"] code') || !App.project.io.slots['1']));
    // the wizard opens a tag-based project on the Ladder with rung 0 empty
    await page.evaluate(() => { document.querySelectorAll('.modal-wrap [data-x]').forEach(x => x.click()); App.showView('wiring'); App.newProject(); }); await wait(150);
    await page.selectOption('.modal #f_plc', 'tag'); await page.click('.modal-wrap:last-child .btn.primary'); await wait(200);
    await page.click('.modal-wrap:last-child .btn.primary'); await wait(300);
    check('re-verify: a new tag-based project opens on the Ladder (tab and view agree) with rung 0 empty (⊗) and Verify failing on it', await page.evaluate(() => App.view === 'ladder' && document.querySelector('.tabs [data-view="ladder"]').classList.contains('on') && document.getElementById('view-ladder').classList.contains('active') && App.project.ladder.rungs.length === 1 && !!document.querySelector('#view-ladder .rung.empty') && !Ladder.verify(true)));
    await page.evaluate(() => { document.querySelector('#view-ladder [data-lorg]').hidden = true; App.openNew(Examples.EX.plcmotor.build()); App.setLayout(window._lay10); });
  }
  console.log('Like Simurelay: simple wires, alignment guides, potential colours');
  const simu = await page.evaluate(async () => {
    const prev = App.currentId; App.openNew({ name: 'Simple wires', circuit: { seq: 2, comps: [{ id: 'c1', type: 'battery', x: 0, y: 0, props: { label: 'GB1' }, state: {} }], wires: [] } }); if (prev) Store.remove(prev);
    localStorage.setItem('plc-trainer.schStyle', 'free'); App.showView('schematic'); document.querySelector('#view-schematic [data-sstyle="free"]').click(); FreeDraw.setRouting('simple');
    await new Promise(q => setTimeout(q, 200));
    const F = App.project.schematic.free; let n = 0; const add = (k, tag, x, y) => { const it = { id: 'd' + (++n), k, tag, x, y, r: 0 }; F.items.push(it); return it; };
    add('pP', 'XP1', 200, 40); add('pbnc', 'S2', 200, 160); add('pbno', 'S1', 200, 280); add('kmno', 'K1', 300, 280); add('kmcoil', 'K1', 200, 400); add('pM', 'XP2', 200, 520);
    F.seq = 50; let m = 0; const w = (a, c) => F.wires.push({ id: 'fw' + (++m), a, b: c });
    w('d1:J', 'd2:11'); w('d2:12', 'd3:13'); w('d3:13', 'd4:13'); w('d3:14', 'd4:14'); w('d3:14', 'd5:A1'); w('d5:A2', 'd6:J');
    Schematic.sync(); App.circuitChanged(); FreeDraw.render(document.querySelector('#view-schematic .sch-body'));
    const d = id => document.querySelector(`#view-schematic [data-fw="${id}"] .w`).getAttribute('d');
    return { straight: ['fw1', 'fw2', 'fw5', 'fw6'].every(id => d(id).split(' L').length === 2), seal: d('fw3').split(' L').length === 4, dots: document.querySelectorAll('#view-schematic .fjdot').length,
      used: document.querySelector('#view-schematic [data-ft="d2:11"]').classList.contains('used') && !document.querySelector('#view-schematic [data-ft="d4:13"]').classList.contains('used') === false };
  });
  check('like Simurelay: terminals on one line are joined by one straight wire, the seal-in branch is a simple bracket, junction dots where it branches', simu.straight && simu.seal && simu.dots >= 2, JSON.stringify(simu));
  check('like Simurelay: a connected terminal is drawn as the end of its line (no circle)', simu.used);
  check('like Simurelay: running, the + side of the circuit is red and the 0 V side blue, the energized coil yellow', await page.evaluate(async () => {
    document.querySelector('#view-schematic [data-smode="run"]').click();
    const up = App.operate(App.project.circuit.comps.find(c => c.props.label === 'S1'), 'btn'); await new Promise(q => setTimeout(q, 500)); if (typeof up === 'function') up(); await new Promise(q => setTimeout(q, 300));
    const cls = id => document.querySelector(`#view-schematic [data-fw="${id}"] .w`).classList, coil = document.querySelector('#view-schematic [data-fi="d5"] .ssym');
    const ok = cls('fw5').contains('on') && cls('fw6').contains('neg') && coil.classList.contains('on') && getComputedStyle(coil.querySelector('rect')).fill.replace(/\s/g, '') === 'rgb(255,230,0)';
    document.querySelector('#view-schematic [data-smode="edit"]').click();
    return ok;
  }));
  {
    // drag the seal-in contact near the line of S1's terminals: an alignment guide shows, and it snaps onto the line
    const box = await page.evaluate(() => { const r = document.querySelector('#view-schematic [data-fi="d4"] .hit').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(box.x, box.y); await page.mouse.down(); await page.mouse.move(box.x + 10, box.y + 6, { steps: 4 });
    const guide = await page.evaluate(() => document.querySelectorAll('#view-schematic .fguide').length);
    await page.mouse.up(); await wait(150);
    check('like Simurelay: moving a symbol shows alignment guides and keeps its terminals on the line of the terminals it is wired to', guide > 0 && await page.evaluate(() => App.project.schematic.free.items.find(i => i.id === 'd4').y === 280), String(guide));
  }
  console.log('Like Simurelay: the seal-in built with the mouse, step by step');
  {
    // the same steps as in Simurelay: click 6 library tiles, drag 2 symbols, click 6 pairs of terminals, Play, press
    await page.evaluate(() => { const prev = App.currentId; App.openNew({ name: 'Seal-in by mouse', circuit: { comps: [], wires: [], seq: 0 } }); if (prev) Store.remove(prev); App.showView('schematic'); document.querySelector('#view-schematic [data-sstyle="free"]').click(); document.querySelector('#view-schematic [data-smode="edit"]').click(); FreeDraw.setRouting('simple'); FreeDraw.setLabels({ ask: false }); FreeDraw.search(''); });
    await wait(200);
    await page.selectOption('#view-schematic .fd-grp', 'All');
    // as in Simurelay: each symbol lands in the middle of the view, then is dragged into place
    const id = {};
    const scr = (x, y) => page.evaluate(([x, y]) => { const svg = document.querySelector('#view-schematic .free-svg'), pt = svg.createSVGPoint(); pt.x = x; pt.y = y; const q = pt.matrixTransform(svg.querySelector('.fv').getScreenCTM()); return { x: q.x, y: q.y }; }, [x, y]);
    const pos = k => page.evaluate(i => { const it = App.project.schematic.free.items.find(q => q.id === i); return [it.x, it.y]; }, id[k]);
    const drag = async (k, x, y) => { const [ix, iy] = await pos(k), a = await scr(ix + 25, iy), b = await scr(x + 25, y); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); await wait(150); };
    // the seal-in contact a little above the start button (its branch then runs over the stop button's terminal 12)
    const spots = { pP: [0, -240], pbnc: [0, -120], pbno: [0, 0], kacoil: [0, 120], ka1no: [100, -40], pM: [0, 240] };
    let c0 = null;
    for (const k of Object.keys(spots)) {
      await page.click(`#view-schematic [data-fk="${k}"]`); await wait(120);
      id[k] = await page.evaluate(() => { const F = App.project.schematic.free.items; return F[F.length - 1].id; });
      if (!c0) c0 = await pos(k);
      await drag(k, c0[0] + spots[k][0], c0[1] + spots[k][1]);
    }
    check('Simurelay walk-through: + and 0 V points work on their own: a 24 V battery is added to the Wiring for them, no error', await page.evaluate(() => (FreeDraw.errs || new Map()).size === 0 && App.project.circuit.comps.filter(c => c.type === 'battery').length === 1));
    const ft = async key => { const b = await (await page.$(`#view-schematic [data-ft="${key}"]`)).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const pairs = [[id.pP + ':J', id.pbnc + ':11'], [id.pbnc + ':12', id.pbno + ':13'], [id.pbno + ':14', id.kacoil + ':A1'], [id.kacoil + ':A2', id.pM + ':J'], [id.ka1no + ':11', id.pbno + ':13'], [id.ka1no + ':14', id.pbno + ':14']];
    for (const [a, b] of pairs) { const p = await ft(a); await page.mouse.click(p.x, p.y); await wait(100); const q = await ft(b); await page.mouse.click(q.x, q.y); await wait(150); }
    check('Simurelay walk-through: two clicks per wire make the 6 wires of the circuit', await page.evaluate(n => App.project.schematic.free.wires.length === n && (FreeDraw.errs || new Map()).size === 0, pairs.length));
    const seal = await page.evaluate(([c, s]) => {
      const F = App.project.schematic.free, w = F.wires.find(x => [x.a, x.b].includes(c + ':11')), P = document.querySelector(`#view-schematic [data-fw="${w.id}"] .w`).getAttribute('d').replace('M', '').split(' L').map(p => p.split(' ').map(Number));
      const t12 = document.querySelector(`#view-schematic [data-ft="${s}:12"]`), x = +t12.dataset.x, y = +t12.dataset.y;
      return { P, onTerm: P.some(p => p[0] === x && p[1] === y), dot: [...document.querySelectorAll('#view-schematic .fjdot')].some(d => +d.getAttribute('cx') === x && +d.getAttribute('cy') === y) };
    }, [id.ka1no, id.pbnc]);
    check('Simurelay walk-through: the seal-in branch is a simple bracket that joins at the stop button\'s terminal 12 (same circuit), with a junction dot there', seal.P.length === 4 && seal.onTerm && seal.dot, JSON.stringify(seal));
    await page.evaluate(() => document.querySelector('#view-schematic [data-fdact="play"]').click()); await wait(250); await wait(200);
    const hold = async k => { const b = await (await page.$(`#view-schematic [data-fi="${id[k]}"] .hit`)).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await wait(300); await page.mouse.up(); await wait(400); };
    const pulled = () => page.evaluate(() => App.project.circuit.comps.find(c => c.type === 'relay').state.pulled);
    await hold('pbno'); const on = await pulled();
    await hold('pbnc'); const off = await pulled();
    check('Simurelay walk-through: Play, press S2 (N.O.): KA1 pulls in and holds itself; press S1 (N.C.): it drops out', on === true && off === false && await page.evaluate(() => App.project.circuit.comps.find(c => c.type === 'relay').props.coil === '24VDC'));
    await page.evaluate(() => document.querySelector('#view-schematic [data-fdact="play"]').click()); await wait(250); await wait(150);
    check('Simurelay walk-through: deleting the + and 0 V points takes the battery they brought out of the Wiring again', await page.evaluate(ids => {
      const F = App.project.schematic.free; F.items = F.items.filter(i => !ids.includes(i.id)); F.wires = F.wires.filter(w => !ids.some(d => w.a.startsWith(d + ':') || w.b.startsWith(d + ':'))); Schematic.sync();
      return !App.project.circuit.comps.some(c => c.type === 'battery');
    }, [id.pP, id.pM]));
  }
  check('Simurelay walk-through: L1 and N points on their own bring a 1-phase supply, an L2 point a 3-phase one', await page.evaluate(() => {
    const prev = App.currentId; App.openNew({ name: 'AC points', circuit: { comps: [], wires: [], seq: 0 } }); if (prev) Store.remove(prev);
    const F = App.project.schematic.free; F.items.push({ id: 'd1', k: 'pL1', tag: 'XP1', x: 0, y: 0, r: 0 }, { id: 'd2', k: 'lamp', tag: 'H1', x: 0, y: 100, r: 0 }, { id: 'd3', k: 'pN', tag: 'XP2', x: 0, y: 200, r: 0 }); F.seq = 9;
    Schematic.sync(); const one = App.project.circuit.comps.filter(c => /^supply/.test(c.type)).map(c => c.type).join() === 'supply1' && FreeDraw.errs.size === 0;
    F.items.push({ id: 'd4', k: 'pL2', tag: 'XP3', x: 100, y: 0, r: 0 }); Schematic.sync();
    return one && App.project.circuit.comps.some(c => c.type === 'supply3') && FreeDraw.errs.size === 0;
  }));
  check('Simurelay walk-through: a push button\'s tag is written left of its push head, not over it', await page.evaluate(() => {
    const prev = App.currentId; App.openNew({ name: 'Tag spot', circuit: { comps: [], wires: [], seq: 0 } }); if (prev) Store.remove(prev);
    App.project.schematic.free.items.push({ id: 'd1', k: 'pbno', tag: 'S1', x: 100, y: 100, r: 0 }); App.project.schematic.free.seq = 2; Schematic.sync(); FreeDraw.render(document.querySelector('#view-schematic .sch-body'));
    const t = document.querySelector('#view-schematic [data-fi="d1"] .ftag'); return !!t && +t.getAttribute('x') <= 100 - 36;
  }));
  console.log('Simurelay clone: editor, property bar, settings, Play');
  {
    await page.evaluate(() => {
      const prev = App.currentId; App.openNew({ name: 'Clone', circuit: { comps: [], wires: [], seq: 0 }, schematic: { free: { seq: 9, items: [
        { id: 'd1', k: 'pL1', tag: 'XP1', x: 100, y: 0, r: 0 }, { id: 'd2', k: 'mcb1', tag: 'QF1', x: 100, y: 100, r: 0 }, { id: 'd3', k: 'pbno', tag: 'S1', x: 100, y: 220, r: 0 },
        { id: 'd4', k: 'lamp', tag: 'H1', x: 100, y: 340, r: 0 }, { id: 'd5', k: 'pN', tag: 'XP2', x: 100, y: 460, r: 0 }, { id: 'd6', k: 'pbno', tag: 'S2', x: 300, y: 220, r: 0 }, { id: 'd7', k: 'ktcoil', tag: 'KT1', x: 300, y: 340, r: 0 }],
      wires: [{ id: 'fw1', a: 'd1:J', b: 'd2:1' }, { id: 'fw2', a: 'd2:2', b: 'd3:13' }, { id: 'fw3', a: 'd3:14', b: 'd4:X1' }, { id: 'fw4', a: 'd4:X2', b: 'd5:J' }] } } }); if (prev) Store.remove(prev);
      App.showView('schematic'); document.querySelector('#view-schematic [data-sstyle="free"]').click(); document.querySelector('#view-schematic [data-smode="edit"]').click(); FreeDraw.setRouting('simple');
    });
    await wait(250);
    const ft = async key => { const b = await (await page.$(`#view-schematic [data-ft="${key}"]`)).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const hit = async id => { const b = await (await page.$(`#view-schematic [data-fi="${id}"] .hit`)).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    { const a = await ft('d6:14'); await page.mouse.click(a.x, a.y); await wait(100); await page.mouse.click(a.x + 200, a.y + 40); await wait(150); }
    check('clone: a click on empty space while drawing a wire cancels it (no corner, no wire)', await page.evaluate(() => !document.querySelector('#view-schematic .wtemp') && App.project.schematic.free.wires.length === 4));
    { const a = await hit('d6'); await page.mouse.click(a.x, a.y); await wait(150); }
    check('clone: a selected symbol shows guide lines through its terminals', await page.evaluate(() => document.querySelectorAll('#view-schematic .fguide').length >= 2));
    { const a = await hit('d6'); await page.mouse.dblclick(a.x, a.y); await wait(200); }
    check('clone: double-click opens the property bar in place of the toolbar and the library', await page.evaluate(() => { const b = document.querySelector('#view-schematic .fd-pbar'); return !b.hidden && /Push button N\.O\.: -S2/.test(b.textContent) && getComputedStyle(document.querySelector('#view-schematic .sch-toolbar')).visibility === 'hidden'; }));
    await page.click('#view-schematic [data-pbs="-1"]'); await wait(150);
    check('clone: NUM1 < skips a number another device has (S1 is taken, so S2 stays)', await page.evaluate(() => App.project.schematic.free.items.find(i => i.id === 'd6').tag === 'S2'));
    await page.click('#view-schematic [data-pbs="1"]'); await wait(150);
    check('clone: NUM1 > gives the next free number (S3)', await page.evaluate(() => App.project.schematic.free.items.find(i => i.id === 'd6').tag === 'S3' && /-S3/.test(document.querySelector('#view-schematic .fd-pbar').textContent)));
    await page.click('#view-schematic [data-pbt="tag"]'); await page.click('#view-schematic [data-pbs="1"]'); await wait(150);
    check('clone: TAG > steps the prefix (S to SL)', await page.evaluate(() => App.project.schematic.free.items.find(i => i.id === 'd6').tag === 'SL3'));
    await page.fill('#view-schematic [data-pbcmt]', 'Start'); await page.press('#view-schematic [data-pbcmt]', 'Enter'); await wait(150);
    check('clone: the comment typed in the bar is kept on the symbol', await page.evaluate(() => App.project.schematic.free.items.find(i => i.id === 'd6').c === 'Start'));
    { const a = await hit('d7'); await page.mouse.dblclick(a.x, a.y); await wait(200); }
    const t0 = await page.evaluate(() => App.project.circuit.comps.find(c => c.props.label === 'KT1').props.t);
    await page.click('#view-schematic [data-pbn="t"][data-d="1"]'); await wait(150);
    check('clone: a timer drawn here starts at 2 s and > adds 1 s', Number(t0) === 2 && await page.evaluate(() => Number(App.project.circuit.comps.find(c => c.props.label === 'KT1').props.t) === 3), String(t0));
    { const a = await ft('d4:X1'); await page.mouse.click(a.x, a.y, { button: 'right' }); await wait(200); }
    await page.fill('#view-schematic [data-pbterm]', 'X9'); await page.press('#view-schematic [data-pbterm]', 'Enter'); await wait(150);
    check('clone: right-click on a terminal edits the number written beside it', await page.evaluate(() => App.project.schematic.free.items.find(i => i.id === 'd4').tn.X1 === 'X9' && [...document.querySelectorAll('#view-schematic [data-fi="d4"] .sterm')].some(t => t.textContent === 'X9')));
    { const a = await hit('d4'); await page.mouse.click(a.x + 120, a.y + 60); await wait(150); }
    check('clone: a click on the drawing closes the bar and brings the toolbar back', await page.evaluate(() => document.querySelector('#view-schematic .fd-pbar').hidden && getComputedStyle(document.querySelector('#view-schematic .sch-toolbar')).visibility !== 'hidden'));
    { const a = await hit('d4'); await page.mouse.click(a.x, a.y); await page.keyboard.press('Control+r'); await wait(150); }
    check('clone: Ctrl+R rotates the selected symbol', await page.evaluate(() => App.project.schematic.free.items.find(i => i.id === 'd4').r === 90));
    await page.keyboard.press('Control+z'); await wait(150);
    // Play: only the drawing and a Stop button; everything starts at rest (the breaker off)
    await page.evaluate(() => document.querySelector('#view-schematic [data-fdact="play"]').click()); await wait(300);
    check('clone: Play hides the toolbar and the library and shows a Stop button', await page.evaluate(() => getComputedStyle(document.querySelector('#view-schematic .sch-toolbar')).display === 'none' && getComputedStyle(document.querySelector('#view-schematic .fd-lib')).display === 'none' && getComputedStyle(document.querySelector('#view-schematic .fd-stop')).display !== 'none'));
    check('clone: Play starts with the breaker off (protections by hand)', await page.evaluate(() => App.project.circuit.comps.find(c => c.props.label === 'QF1').state.on === false));
    { const a = await hit('d2'); await page.mouse.click(a.x, a.y); await wait(250); const b = await hit('d3'); await page.mouse.move(b.x, b.y); await page.mouse.down(); await wait(400); }
    check('clone: tap the breaker on, hold S1: the lamp lights and its wires show L1 brown and N blue', await page.evaluate(() => {
      const on = App.project.circuit.comps.find(c => c.props.label === 'H1').state.on, w = id => document.querySelector(`#view-schematic [data-fw="${id}"] .w`);
      return on && w('fw3').classList.contains('p-L1') && w('fw4').classList.contains('p-N') && getComputedStyle(w('fw3')).stroke.replace(/\s/g, '') === 'rgb(163,87,64)';
    }));
    await page.mouse.up(); await wait(200);
    // a short circuit (L1 to N through the closed breaker and S2) stops the simulation; nothing trips by itself
    await page.evaluate(() => { document.querySelector('#view-schematic .fd-stop button').click(); });
    await wait(250);
    await page.evaluate(() => { const F = App.project.schematic.free; F.wires.push({ id: 'fw8', a: 'd2:2', b: 'd6:13' }, { id: 'fw9', a: 'd6:14', b: 'd5:J' }); Schematic.sync(); });
    await page.evaluate(() => document.querySelector('#view-schematic [data-fdact="play"]').click()); await wait(300);
    { const a = await hit('d2'); await page.mouse.click(a.x, a.y); await wait(250); const b = await hit('d6'); await page.mouse.move(b.x, b.y); await page.mouse.down(); await wait(500); await page.mouse.up(); await wait(300); }
    check('clone: a short circuit stops the simulation with "Short circuit detected!", and the breaker did not trip by itself', await page.evaluate(() => [...document.querySelectorAll('.toast')].some(t => /Short circuit detected! Simulation stopped/.test(t.textContent)) &&
      document.querySelector('#view-schematic [data-smode="edit"]').classList.contains('on') && !App.project.circuit.comps.find(c => c.props.label === 'QF1').state.tripped));
    check('clone: Stop put the breaker back off', await page.evaluate(() => App.project.circuit.comps.find(c => c.props.label === 'QF1').state.on === false));
    // the ⋯ menu, and Settings: a colour changed for this theme
    await page.evaluate(() => document.querySelector('#view-schematic [data-fdact="more"]').click()); await wait(150);
    check('clone: the ⋯ menu has New, Open, Capture, Save, Save As and Settings', await page.evaluate(() => ['New', 'Open', 'Capture', 'Save', 'Save As', 'Settings'].every(n => [...document.querySelectorAll('#ctxMenu button')].some(b => b.textContent.trim() === n))));
    await page.keyboard.press('Escape'); await page.mouse.click(5, 300); await wait(100);
    await page.evaluate(() => FreeDraw.settings()); await wait(150);
    await page.evaluate(() => { const i = document.querySelector('.modal [data-fdc="tag"]'); i.value = '#ff00ff'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(150);
    check('clone: Settings, Colors changes the tag colour of the drawing', await page.evaluate(() => getComputedStyle(document.querySelector('#view-schematic [data-fi="d3"] .ftag')).fill.replace(/\s/g, '') === 'rgb(255,0,255)'));
    await page.evaluate(() => { document.querySelector('.modal [data-fdreset]').click(); document.querySelector('.modal [data-x]').click(); }); await wait(150);
  }
  console.log('Finish: drag to wire, supply points, Ladder-style contacts');
  await page.evaluate(async () => {
    const prev = App.currentId; App.openNew({ name: 'Drag wire', circuit: { seq: 2, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }], wires: [] },
      schematic: { free: { seq: 3, items: [{ id: 'd1', k: 'pbno', tag: 'S1', x: 100, y: 100, r: 0 }, { id: 'd2', k: 'lamp', tag: 'H1', x: 300, y: 100, r: 0 }, { id: 'd3', k: 'pL1', tag: 'XP1', x: 500, y: 100, r: 0 }], wires: [] } } }); if (prev) Store.remove(prev);
    localStorage.setItem('plc-trainer.schStyle', 'free'); App.showView('schematic'); document.querySelector('#view-schematic [data-sstyle="free"]').click(); document.querySelector('#view-schematic [data-smode="edit"]').click(); await new Promise(q => setTimeout(q, 200));
  });
  const ftBox = async k => { const e = await page.$(`#view-schematic [data-ft="${k}"]`); const b = await e.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  {
    const A = await ftBox('d1:14'), C = await ftBox('d2:X1');
    await page.mouse.move(A.x, A.y); await page.mouse.down(); await page.mouse.move((A.x + C.x) / 2, (A.y + C.y) / 2 + 30, { steps: 6 }); await page.mouse.move(C.x, C.y, { steps: 6 }); await page.mouse.up(); await wait(200);
  }
  check('finish: a wire is drawn by dragging from one terminal to another (tap, tap still works)', await page.evaluate(() => App.project.schematic.free.wires.some(w => [w.a, w.b].sort().join() === ['d1:14', 'd2:X1'].sort().join())));
  {
    const A = await ftBox('d1:13'); await page.mouse.move(A.x, A.y); await page.mouse.down(); await page.mouse.move(A.x - 80, A.y - 70, { steps: 6 }); await page.mouse.up(); await wait(200);
  }
  check('finish: as in Simurelay, a wire dragged out and let go on empty space is cancelled', await page.evaluate(() => !document.querySelector('#view-schematic .wtemp') && App.project.schematic.free.wires.length === 1));
  { const A = await ftBox('d1:13'); await page.mouse.click(A.x, A.y); await wait(120); }
  await page.keyboard.press('Escape'); await wait(150);
  check('finish: Esc cancels the wire being drawn', await page.evaluate(() => App.project.schematic.free.wires.length === 1 && !document.querySelector('#view-schematic .wtemp')));
  {
    // as in Simurelay, a click on empty space while drawing cancels the wire
    const A = await ftBox('d1:13');
    await page.mouse.click(A.x, A.y); await wait(120); await page.mouse.click(A.x, A.y - 60); await wait(150);
  }
  check('finish: a click on the way while drawing a wire cancels it (Simurelay)', await page.evaluate(() => !document.querySelector('#view-schematic .wtemp') && !App.project.schematic.free.wires.some(x => [x.a, x.b].includes('d3:J'))));
  // a wire with two corners of its own (as one dragged into shape), for the segment drag below
  await page.evaluate(() => { const F = App.project.schematic.free, t = k => document.querySelector('#view-schematic [data-ft="' + k + '"]').dataset, a = t('d1:13'), c = t('d3:J'); F.seq++; F.wires.push({ id: 'fw' + F.seq, a: 'd1:13', b: 'd3:J', pts: [[+a.x, +a.y - 60], [+c.x, +a.y - 60]] }); Schematic.sync(); App.circuitChanged(); }); await wait(200);
  {
    // drag the middle (horizontal) part of that wire 40 lower
    const P = await page.evaluate(() => { const w = App.project.schematic.free.wires.find(x => [x.a, x.b].includes('d3:J')); return { id: w.id, y: w.pts[0][1], x: (w.pts[0][0] + w.pts[1][0]) / 2 }; });
    const m = await page.evaluate(({ x, y }) => { const svg = document.querySelector('#view-schematic .free-svg'), g = svg.querySelector('.fv'), pt = svg.createSVGPoint(); pt.x = x; pt.y = y; const q = pt.matrixTransform(g.getScreenCTM()); return { x: q.x, y: q.y }; }, P);
    await page.mouse.move(m.x, m.y); await page.mouse.down(); await page.mouse.move(m.x, m.y + 20, { steps: 4 }); await page.mouse.move(m.x, m.y + 40, { steps: 4 }); await page.mouse.up(); await wait(200);
    check('finish: dragging a part of a wire moves it (the corners follow)', await page.evaluate(({ id, y }) => { const w = App.project.schematic.free.wires.find(x => x.id === id); return w.pts.some(p => p[1] === y + 40) && !w.pts.some(p => p[1] === y); }, P), JSON.stringify(await page.evaluate(id => App.project.schematic.free.wires.find(x => x.id === id).pts, P.id)) + JSON.stringify(P) + JSON.stringify(m));
  }
  check('finish: a supply point feeds downwards (L1 / +24 V terminal below the circle), a return point upwards (N / 0 V above)', await page.evaluate(() => {
    const K = FreeDraw.KINDS; return K.pL1.terms[0].y > 0 && K.pP.terms[0].y > 0 && K.pN.terms[0].y < 0 && K.pM.terms[0].y < 0 && K.pPE.terms[0].y < 0;
  }));
  check('finish: in the Ladder-style view a N.O. contact is drawn closed when it closes, a N.C. drawn open when it opens', await page.evaluate(() => {
    const prev = App.currentId; App.openNew({ name: 'NEMA', circuit: { seq: 2, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }], wires: [] } }); if (prev) Store.remove(prev);
    App.project.schematic.rungs = [{ elems: [{ k: 'pbno', tag: 'S1' }, { k: 'pbnc', tag: 'S2' }, { k: 'lamp', tag: 'H1' }], comment: '' }]; Schematic.sync();
    localStorage.setItem('plc-trainer.schStyle', 'nema'); App.showView('schematic'); document.querySelector('#view-schematic [data-sstyle="nema"]').click();
    const h = () => { Schematic.render(); return [...document.querySelectorAll('#view-schematic .sel-el .ssym')].slice(0, 2).map(g => g.innerHTML); };
    const s1 = App.project.circuit.comps.find(c => c.props.label === 'S1'), s2 = App.project.circuit.comps.find(c => c.props.label === 'S2');
    const [a0, b0] = h(); s1.state.pressed = true; s2.state.pressed = true; App.circuitChanged(); const [a1, b1] = h(); s1.state.pressed = false; s2.state.pressed = false; App.circuitChanged();
    localStorage.setItem('plc-trainer.schStyle', 'iec'); document.querySelector('#view-schematic [data-sstyle="iec"]').click();
    return a0 !== a1 && b0 !== b1;
  }));
  console.log('Moving contacts: every library symbol whose contact switches is drawn switched');
  check('moving contacts: every symbol in the library with a contact is drawn differently when that contact switches (all of them, not a few)', await page.evaluate(async () => {
    const K = FreeDraw.KINDS, D = Circuit.DEFS, still = [], moved = [];
    const kinds = Object.keys(K).filter(k => K[k].type && !K[k].jct && !K[k].types && !K[k].pots && D[K[k].type] && D[K[k].type].conduct);
    localStorage.setItem('plc-trainer.schStyle', 'free');
    for (const k of kinds) {
      const tag = (K[k].pre || 'X') + '9'; App.openNew({ name: 'sweep', schematic: { free: { seq: 3, items: [{ id: 'd1', k, tag, x: 100, y: 100, r: 0 }], wires: [] } } });
      App.showView('schematic'); document.querySelector('#view-schematic [data-sstyle="free"]').click();
      const dev = App.project.circuit.comps.find(c => c.props.label === tag); if (!dev) continue;
      const ids = K[k].terms.map(t => t.id), mine = () => JSON.stringify((D[dev.type].conduct(dev, App.ctx) || []).filter(([a, b]) => ids.includes(a) && ids.includes(b)).map(x => x.slice().sort()).sort());
      const html = () => { FreeDraw.render(document.querySelector('#view-schematic .sch-body')); return document.querySelector('#view-schematic [data-fi="d1"] .ssym').innerHTML; };
      let any = false, ok = true;
      for (const f of Object.keys(dev.state).filter(x => typeof dev.state[x] === 'boolean' || x === 'pos')) {
        const c0 = mine(), h0 = html(), old = dev.state[f]; dev.state[f] = f === 'pos' ? (old ? 0 : 1) : !old; const c1 = mine(), h1 = html(); dev.state[f] = old;
        if (c0 !== c1) { any = true; if (h0 === h1) ok = false; }
      }
      if (any) (ok ? moved : still).push(k);
    }
    return still.length === 0 && moved.length >= 110;
  }));
  check('moving contacts: in the IEC power circuit the breaker and contactor poles are drawn closed when they close', await page.evaluate(async () => {
    App.openNew({ name: 'Power poles' }); const C = App.project.circuit, s = Circuit.create('supply3', 0, 0, C); s.props.label = 'Q0'; s.state.on = true; C.comps.push(s);
    App.project.schematic.power = { src: 'Q0', main: [], feeders: [{ elems: [{ k: 'qf3', tag: 'QF1' }, { k: 'km3', tag: 'KM1' }, { k: 'm3', tag: 'M1' }] }] }; localStorage.setItem('plc-trainer.schStyle', 'iec'); Schematic.sync(); App.showView('schematic');
    document.querySelector('#view-schematic [data-sstyle="iec"]').click(); const h = i => { Schematic.render(); return document.querySelectorAll('#view-schematic .pel .ssym')[i].innerHTML; };
    const qf = C.comps.find(c => c.props.label === 'QF1'), km = C.comps.find(c => c.props.label === 'KM1'); qf.state.on = false; const q0 = h(0), k0 = h(1);
    qf.state.on = true; km.state.pulled = true; const q1 = h(0), k1 = h(1); km.state.pulled = false; return q0 !== q1 && k0 !== k1;
  }));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); App.showView('ladder'); });
  console.log('IEC current paths: the newer devices and the PLC points');
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); App.showView('schematic'); });
  await page.click('#view-schematic [data-sstyle="iec"]'); await wait(200);
  check('iec: the newer symbols are in one "More symbols…" list, grouped, and are not toolbar buttons', await page.evaluate(() => {
    const sel = document.querySelector('#view-schematic [data-smore]'), more = Object.entries(Schematic.KINDS).filter(([, K]) => K.more).map(([k]) => k);
    return !!sel && sel.querySelectorAll('optgroup:not(.mob-opt) option[value]:not([value=""])').length === more.length && more.length >= 40 && !more.some(k => document.querySelector(`#view-schematic [data-skind="${k}"]`)) && sel.querySelectorAll('optgroup').length >= 4;
  }));
  check('iec: picking a symbol in the list asks for its tag, like a toolbar button', await page.evaluate(async () => {
    const sel = document.querySelector('#view-schematic [data-smore]'); sel.value = 'flcoil'; sel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 150)); const m = document.querySelector('#modal-root .modal'); const ok = !!m && m.textContent.includes('Flasher timer coil') && sel.value === '';
    const x = document.querySelector('#modal-root [data-x]'); if (x) x.click(); return ok;
  }));
  await page.evaluate(() => { const m = document.querySelector('#modal-root'); if (m) m.innerHTML = ''; });
  // a flasher in the current paths: S1 → flasher coil KT1; its N.O. 15-18 → lamp H1; a second path: off-delay coil KT2 and its N.C.
  await page.evaluate(() => { const prev = App.currentId; App.openNew({ name: 'IEC timing' }); if (prev) Store.remove(prev); const C = App.project.circuit; C.comps.push(Circuit.create('supply1', 0, 0, C)); C.comps[0].state.on = true;
    App.project.schematic.rungs = [{ elems: [{ k: 'pbno', tag: 'S1' }, { k: 'flcoil', tag: 'KT1' }], comment: '' }, { elems: [{ k: 'flno', tag: 'KT1' }, { k: 'lamp', tag: 'H1' }], comment: '' },
      { elems: [{ k: 'sel', tag: 'S2' }, { k: 'kfcoil', tag: 'KT2' }], comment: '' }, { elems: [{ k: 'kfno', tag: 'KT2' }, { k: 'lampfl', tag: 'H2' }], comment: '' }];
    Schematic.sync(); App.circuitChanged(); const d = l => App.project.circuit.comps.find(c => c.props.label === l); d('KT1').props.t = 0.3; d('KT1').props.t2 = 0.3; d('KT2').props.t = 1; App.showView('schematic'); });
  await wait(300);
  check('iec: the diagram makes a flasher, an off-delay relay and a flashing lamp, with no problem reported', await page.evaluate(() => { const t = l => (App.project.circuit.comps.find(c => c.props.label === l) || {}).type; return t('KT1') === 'flasher' && t('KT2') === 'timer_off' && t('H2') === 'lamp_fl' && Schematic.errs.size === 0; }));
  await page.evaluate(() => { window.__up = App.operate(App.project.circuit.comps.find(c => c.props.label === 'S1'), 'btn'); });
  check('iec: holding S1 runs the flasher and its N.O. flashes H1', await page.evaluate(() => new Promise(res => { const seen = new Set(); let n = 0; const t = setInterval(() => { seen.add(App.project.circuit.comps.find(c => c.props.label === 'H1').state.on); if (++n > 40 || seen.size === 2) { clearInterval(t); res(seen.size === 2); } }, 50); })));
  await page.evaluate(() => { if (typeof window.__up === 'function') window.__up(); });
  await page.evaluate(() => App.operate(App.project.circuit.comps.find(c => c.props.label === 'S2'), 'knob'));
  check('iec: S2 on pulls the off-delay relay in at once and its N.O. powers the flashing lamp H2', await until(is("d('KT2').on && d('H2').on")));
  await page.evaluate(() => App.operate(App.project.circuit.comps.find(c => c.props.label === 'S2'), 'knob'));
  check('iec: S2 off: H2 stays powered for the off delay, then goes off', await (async () => { await wait(300); const held = await page.evaluate(is("d('H2').on && !d('KT2').pw")); return held && await until(is("!d('H2').on"), null, 2500); })());
  check('iec: an N.O. and an N.C. of one changeover timer are reported (they share terminal 15)', await page.evaluate(() => { App.project.schematic.rungs.push({ elems: [{ k: 'kfnc', tag: 'KT2' }, { k: 'horn', tag: 'HA1' }], comment: '' }); Schematic.sync();
    const m = [...Schematic.errs.values()].some(x => x.includes('KT2') && x.includes('already used')); App.project.schematic.rungs.pop(); Schematic.sync(); return m; }));
  check('iec: a PLC symbol never adds a PLC: with none in the Wiring it is reported', await page.evaluate(() => { App.project.schematic.rungs.push({ elems: [{ k: 'pbno', tag: 'S9' }, { k: 'plci0', tag: 'PLC' }], comment: '' }); Schematic.sync();
    const m = [...Schematic.errs.values()].some(x => /no PLC with this tag/.test(x)) && !App.project.circuit.comps.some(c => c.type === 'plc'); App.project.schematic.rungs.pop(); Schematic.sync(); return m; }));
  // PLC points in the current paths: +24 V → S1 → I0; O0 (relay, VAC0 from +24 V) → H1; the ladder joins them
  const iecPlc = { name: 'IEC PLC', ladder: { rungs: [{ text: 'XIC I:0/0 OTE O:0/0', comment: '' }], desc: {} },
    circuit: { seq: 10, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }, { id: 'c2', type: 'psu24', x: 0, y: 200, props: { label: 'G1' }, state: {} }, { id: 'c3', type: 'plc', x: 300, y: 200, props: { label: 'PLC' }, state: {} }],
      wires: [{ id: 'w1', a: 'c1:L', b: 'c2:L', pts: [] }, { id: 'w2', a: 'c1:N', b: 'c2:N', pts: [] }, { id: 'w3', a: 'c1:L', b: 'c3:L1', pts: [] }, { id: 'w4', a: 'c1:N', b: 'c3:N', pts: [] }] },
    schematic: { L: 'c2:P1', N: 'c2:M1', rungs: [{ elems: [{ k: 'pbno', tag: 'S1' }, { k: 'plci0', tag: 'PLC' }], comment: '' }, { elems: [{ k: 'plcq0', tag: 'PLC' }, { k: 'lamp', tag: 'H1' }], comment: '' }] } };
  await page.evaluate(p => { const prev = App.currentId; localStorage.setItem('plc-trainer.schStyle', 'iec'); App.openNew(JSON.parse(JSON.stringify(p))); if (prev) Store.remove(prev); App.showView('schematic'); }, iecPlc);
  await wait(300); await setMode('RUN');
  check('iec: PLC input and relay output points are wired to the placed PLC, with no problem reported', await page.evaluate(() => { const C = App.project.circuit, plc = C.comps.find(c => c.type === 'plc'), has = t => C.wires.some(w => w.sch && (w.a === plc.id + ':' + t || w.b === plc.id + ':' + t));
    return Schematic.errs.size === 0 && C.comps.filter(c => c.type === 'plc').length === 1 && ['I0', 'COM', 'VAC0', 'O0'].every(has); }));
  await page.evaluate(() => { window.__up = App.operate(App.project.circuit.comps.find(c => c.props.label === 'S1'), 'btn'); });
  check('iec: S1 sets I:0/0, the ladder sets O:0/0, the drawn output contact closes and H1 lights; the input symbol shows ON', await until(is("r('I:0/0') === 1 && r('O:0/0') === 1 && d('H1').on")) &&
    await (async () => { await wait(200); return page.evaluate(() => [...document.querySelectorAll('#view-schematic .ssym.on')].length >= 3); })());
  await page.evaluate(() => { if (typeof window.__up === 'function') window.__up(); });
  check('iec: released, the input and the output drop', await until(is("r('I:0/0') === 0 && r('O:0/0') === 0 && !d('H1').on")));
  await setMode('PROG');
  check('iec: the current paths with the new symbols survive save and reload', await page.evaluate(() => { const p = App.buildProject(JSON.parse(JSON.stringify(App.serialize()))); const ks = p.schematic.rungs.flatMap(r => r.elems.map(e => e.k));
    return ['plci0', 'plcq0'].every(k => ks.includes(k)) && !(p.keep && p.keep.rungs && p.keep.rungs.length); }));
  await page.evaluate(() => { const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); App.showView('ladder'); });


  console.log('Review fixes: device variants in the current paths and power circuit, PLC inputs on 230 V, contacts drawn twice, the list keyboard, Tagalog');
  check('review: in the power circuit a 3-pole symbol on a 1-pole MPCB or overload relay, and the contactor main poles on a N.C.-pole contactor, are reported and not wired', await page.evaluate(() => {
    const prev = App.currentId; App.openNew({ name: 'Variants' }); if (prev) Store.remove(prev); const C = App.project.circuit;
    const mk = (t, l) => { const c = Circuit.create(t, 0, 0, C); c.props.label = l; C.comps.push(c); return c; }; mk('supply3', 'Q0'); mk('mpcb1', 'QMZ'); mk('contactor_nc', 'KMZ'); mk('olr1', 'FZ');
    App.project.schematic.power = { src: 'Q0', main: [], feeders: [{ elems: [{ k: 'qm3', tag: 'QMZ' }, { k: 'km3', tag: 'KMZ' }, { k: 'ol3', tag: 'FZ' }, { k: 'm3', tag: 'MZ' }] }] }; Schematic.sync();
    const m = [...Schematic.perrs.values()].join(' | '); return /QMZ .*no terminal/.test(m) && /KMZ is a Contactor N\.C\. Poles/.test(m) && /FZ .*no terminal/.test(m) && !C.wires.some(w => w.sch && /^(.*):/.test(w.a) && [w.a, w.b].some(k => k.startsWith(C.comps.find(c => c.props.label === 'KMZ').id + ':')));
  }));
  check('review: a PLC input in a 230 V current path is reported and not wired, so the input is not destroyed', await page.evaluate(() => {
    const prev = App.currentId; App.openNew({ name: 'PLC 230', circuit: { seq: 3, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }, { id: 'c2', type: 'plc', x: 0, y: 200, props: { label: 'PLC' }, state: {} }], wires: [] } }); if (prev) Store.remove(prev);
    App.project.schematic.rungs = [{ elems: [{ k: 'sel', tag: 'S7' }, { k: 'plci5', tag: 'PLC' }], comment: '' }]; Schematic.sync();
    const plc = App.project.circuit.comps.find(c => c.type === 'plc');
    return [...Schematic.errs.values()].some(x => /24 V DC/.test(x)) && !App.project.circuit.wires.some(w => w.sch && [w.a, w.b].includes(plc.id + ':I5'));
  }));
  check('review: a N.C.-pole symbol on a normal contactor is reported (it would be drawn N.C. but switch N.O.)', await page.evaluate(() => {
    const prev = App.currentId; App.openNew({ name: 'NC on NO', circuit: { seq: 2, comps: [{ id: 'c1', type: 'contactor', x: 0, y: 0, props: { label: 'KMX' }, state: {} }], wires: [] }, schematic: { free: { seq: 3, items: [{ id: 'd1', k: 'kmn2', tag: 'KMX', x: 0, y: 0, r: 0 }], wires: [] } } }); if (prev) Store.remove(prev);
    const m = FreeDraw.check().get(App.project.schematic.free.items[0]); return !!m && /not a Contactor N\.C\. Poles/.test(m);
  }));
  check('review: the overload changeover sets the relay the drawing makes even when its poles are drawn first', await page.evaluate(() => {
    const prev = App.currentId; App.openNew({ name: 'OL first', circuit: { seq: 2, comps: [{ id: 'c1', type: 'supply3', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }], wires: [] },
      schematic: { free: { seq: 3, items: [{ id: 'd1', k: 'ol3', tag: 'FZ', x: 0, y: 0, r: 0 }, { id: 'd2', k: 'olco', tag: 'FZ', x: 100, y: 0, r: 0 }], wires: [] } } }); if (prev) Store.remove(prev);
    const f = App.project.circuit.comps.find(c => c.props.label === 'FZ'); return !!f && f.props.aux === '95-96-98 changeover' && FreeDraw.check().size === 0;
  }));
  check('review: a contact drawn twice (55-56 inside the block changeover) is reported; a second contactor N.O. takes the aux block 53-54 instead', await page.evaluate(() => {
    const prev = App.currentId; App.openNew({ name: 'Twice', schematic: { free: { seq: 6, items: [{ id: 'd1', k: 'kmnonc', tag: 'KM1', x: 0, y: 0, r: 0 }, { id: 'd2', k: 'kmno', tag: 'KM1', x: 100, y: 0, r: 0 },
      { id: 'd3', k: 'kbonco', tag: 'KM2', x: 200, y: 0, r: 0 }, { id: 'd4', k: 'kbonnc', tag: 'KM2', x: 300, y: 0, r: 0 }, { id: 'd5', k: 'ka1no', tag: 'KA1', x: 400, y: 0, r: 0 }, { id: 'd6', k: 'ka1nc', tag: 'KA1', x: 500, y: 0, r: 0 }], wires: [] } } }); if (prev) Store.remove(prev);
    const e = FreeDraw.check(), F = App.project.schematic.free.items, has = id => e.has(F.find(i => i.id === id));
    return F.find(i => i.id === 'd2').k === 'kxno1' && !has('d2') && has('d4') && !has('d1') && !has('d3') && !has('d5') && !has('d6');   // N.O. and N.C. of one relay changeover share 11: allowed
  }));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); App.showView('schematic'); document.querySelector('#view-schematic [data-sstyle="iec"]').click(); });
  await wait(200);
  check('review: arrow keys on the "More symbols…" list only move the choice; Enter adds it', await (async () => {
    await page.focus('#view-schematic [data-smore]'); await page.keyboard.press('ArrowDown'); await wait(200);
    const none = await page.evaluate(() => !document.querySelector('#modal-root .modal'));
    await page.keyboard.press('Enter'); await wait(200); const form = await page.evaluate(() => !!document.querySelector('#modal-root .modal'));
    await page.evaluate(() => { const x = document.querySelector('#modal-root [data-x]'); if (x) x.click(); }); return none && form; })());
  check('review: in Tagalog the diagram toolbar words are translated (Edit, Undo, Play)', await page.evaluate(async () => { I18N.set('tl'); await new Promise(r => setTimeout(r, 200));
    const t = document.querySelector('#view-schematic .sch-toolbar').textContent; I18N.set('en'); return t.includes('I-edit') && t.includes('Ibalik'); }));
  await page.evaluate(() => { const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); App.showView('ladder'); });
  console.log('Verification gaps: RCBO 4P earth leakage, drawn changeover states of the timers and latch, mouse drag');
  check('gaps: a load fed from an RCBO 4P to PE (earth leakage) trips it; the same load to N does not', await page.evaluate(new Function(solveKit + `
    const t = ret => { circ.comps.length = 0; circ.wires.length = 0; const q = add('supply3'), r = add('rcbo4', {}, { on: true }), h = add('lamp', { coil: '230VAC' });
      w(q, 'L1', r, '1'); w(q, 'L2', r, '3'); w(q, 'L3', r, '5'); w(q, 'N', r, '7'); w(r, '2', h, 'X1'); if (ret === 'PE') w(h, 'X2', q, 'PE'); else w(h, 'X2', r, '8'); run(); return r.state.tripped; };
    return t('PE') === true && t('N') === false;`)));
  check('gaps: an RCBO 2P also trips on earth leakage (L to PE), not on a load to its own N', await page.evaluate(new Function(solveKit + `
    const t = ret => { circ.comps.length = 0; circ.wires.length = 0; const q = add('supply1'), r = add('rcbo', {}, { on: true }), h = add('lamp', { coil: '230VAC' });
      w(q, 'L', r, '1'); w(q, 'N', r, '3'); w(r, '2', h, 'X1'); if (ret === 'PE') w(h, 'X2', q, 'PE'); else w(h, 'X2', r, '4'); run(); return r.state.tripped; };
    return t('PE') === true && t('N') === false;`)));
  // the changeover contacts of the on-delay, off-delay, on/off-delay, flasher and latching relays, drawn next to their coils; S1 (a selector) feeds every coil
  const coT = { name: 'Changeovers', circuit: { seq: 10, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } },
    { id: 'c2', type: 'timer', x: 0, y: 200, props: { label: 'KT1', coil: '230VAC', t: 0.6 }, state: {} }, { id: 'c3', type: 'timer_off', x: 0, y: 300, props: { label: 'KT2', coil: '230VAC', t: 0.6 }, state: {} },
    { id: 'c4', type: 'latch', x: 0, y: 400, props: { label: 'KA1', coil: '230VAC' }, state: {} }, { id: 'c5', type: 'timer_onoff', x: 0, y: 500, props: { label: 'KT3', coil: '230VAC', t: 0.6, t2: 0.6 }, state: {} },
    { id: 'c6', type: 'flasher', x: 0, y: 600, props: { label: 'KT4', coil: '230VAC', t: 0.3, t2: 0.3 }, state: {} }], wires: [] },
    schematic: { free: { seq: 60, items: [fi('d1', 'pL1', 'XP1', 0, 0), fi('d2', 'selno', 'S1', 0, 100), fi('d3', 'pN', 'XP2', 0, 400),
      fi('d10', 'ktcoil', 'KT1', 120, 250), fi('d11', 'kfcoil', 'KT2', 220, 250), fi('d12', 'ltset', 'KA1', 320, 250), fi('d13', 'kdcoil', 'KT3', 420, 250), fi('d14', 'flcoil', 'KT4', 520, 250),
      fi('d20', 'ktco', 'KT1', 120, 500), fi('d21', 'kfco', 'KT2', 220, 500), fi('d22', 'ltco', 'KA1', 320, 500), fi('d23', 'kdco', 'KT3', 420, 500), fi('d24', 'flco', 'KT4', 520, 500)],
    wires: [fw('fw1', 'd1:J', 'd2:13'), ...['d10', 'd11', 'd12', 'd13', 'd14'].flatMap((d, i) => [fw('fw' + (10 + i), 'd2:14', d + ':A1'), fw('fw' + (20 + i), d + ':A2', 'd3:J')])] } } };
  await page.evaluate(p => { const prev = App.currentId; localStorage.setItem('plc-trainer.schStyle', 'free'); App.openNew(JSON.parse(JSON.stringify(p))); if (prev) Store.remove(prev); App.showView('schematic'); }, coT);
  await page.click('#view-schematic [data-sstyle="free"]'); await wait(300);
  const coOn = () => page.evaluate(() => Object.fromEntries(['d20', 'd21', 'd22', 'd23', 'd24'].map(id => [id, document.querySelector(`#view-schematic [data-fi="${id}"] .ssym`).classList.contains('on')])));
  check('gaps: at rest every drawn changeover (KT1 on-delay, KT2 off-delay, KA1 latch, KT3 on/off, KT4 flasher) shows its rest position, no problem', await (async () => { await wait(200); const s = await coOn(); return Object.values(s).every(v => v === false) && await page.evaluate(() => FreeDraw.errs.size === 0); })());
  await page.evaluate(() => App.operate(App.project.circuit.comps.find(c => c.props.label === 'S1'), 'knob'));
  check('gaps: S1 on: the off-delay and latch changeovers switch at once, the on-delay and on/off ones only after 0.6 s', await (async () => { await wait(250); const a = await coOn();
    const early = a.d21 && a.d22 && !a.d20 && !a.d23; const late = await until(is("d('KT1').done && d('KT3').on"), null, 2000); await wait(150); const b = await coOn(); return early && late && b.d20 && b.d23 && b.d21 && b.d22; })());
  check('gaps: the flasher changeover KT4 switches over and back on the drawing', await page.evaluate(() => new Promise(res => { const seen = new Set(); let n = 0; const t = setInterval(() => { const g = document.querySelector('#view-schematic [data-fi="d24"] .ssym'); seen.add(g.classList.contains('on')); if (++n > 30 || seen.size === 2) { clearInterval(t); res(seen.size === 2); } }, 50); })));
  await page.evaluate(() => App.operate(App.project.circuit.comps.find(c => c.props.label === 'S1'), 'knob'));
  check('gaps: S1 off: the on-delay goes back at once, the latch stays set, the off-delay and on/off ones go back after their delay', await (async () => { await wait(250); const a = await coOn();
    const at = !a.d20 && a.d22 && a.d21 && a.d23; const back = await until(is("!d('KT2').on && !d('KT3').on"), null, 2000); await wait(150); const b = await coOn(); return at && back && !b.d21 && !b.d23 && b.d22 && !b.d24; })());
  // drag a placed symbol with the mouse: it moves on the grid, its wires follow, Undo puts it back
  const dragBox = await page.evaluate(() => { const r = document.querySelector('#view-schematic [data-fi="d10"] .hit').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const dragFrom = await page.evaluate(() => { const it = App.project.schematic.free.items.find(i => i.id === 'd10'); return { x: it.x, y: it.y }; });
  await page.mouse.move(dragBox.x, dragBox.y); await page.mouse.down(); await page.mouse.move(dragBox.x + 40, dragBox.y + 20, { steps: 6 }); await page.mouse.move(dragBox.x + 80, dragBox.y + 40, { steps: 6 }); await page.mouse.up();
  await wait(300);
  check('gaps: dragging a placed symbol with the mouse moves it on the grid and its wires follow (still wired in the Wiring)', await page.evaluate(b => { const it = App.project.schematic.free.items.find(i => i.id === 'd10'), k = FreeDraw.view ? FreeDraw.view().k : 1;
    const moved = it.x !== b.x && it.y !== b.y && it.x % 10 === 0 && it.y % 10 === 0 && it.x > b.x && it.y > b.y;
    const C = App.project.circuit, kt = C.comps.find(c => c.props.label === 'KT1'); return moved && C.wires.some(w => w.sch && (w.a === kt.id + ':A1' || w.b === kt.id + ':A1')) && FreeDraw.errs.size === 0; }, dragFrom));
  await page.keyboard.press('Control+z'); await wait(250);
  check('gaps: Undo puts the dragged symbol back', await page.evaluate(b => { const it = App.project.schematic.free.items.find(i => i.id === 'd10'); return it.x === b.x && it.y === b.y; }, dragFrom));

  check('compat: a reader that does not know the new parts, symbols, terminals and settings keeps them and saves them back; this version then reads them all again', await page.evaluate(() => {
    const fi = (id, k, tag, x, y) => ({ id, k, tag, x, y, r: 0 });
    const P = { name: 'New parts', circuit: { seq: 20, comps: [
      { id: 'c1', type: 'supply3', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }, { id: 'c2', type: 'contactor_ton', x: 0, y: 200, props: { label: 'KM1', coil: '230VAC', t: 2 }, state: {} },
      { id: 'c3', type: 'olr', x: 0, y: 300, props: { label: 'F1', aux: '95-96-98 changeover' }, state: {} }, { id: 'c4', type: 'gen3', x: 300, y: 0, props: { label: 'G1', mode: 'auto (C1-C2)' }, state: {} },
      { id: 'c5', type: 'isol1', x: 300, y: 200, props: { label: 'QS1' }, state: {} }, { id: 'c6', type: 'mpcb4', x: 400, y: 300, props: { label: 'QM1' }, state: {} }],
      wires: [{ id: 'w1', a: 'c4:C1', b: 'c5:1', pts: [] }, { id: 'w2', a: 'c5:2', b: 'c4:C2', pts: [] }, { id: 'w3', a: 'c1:L1', b: 'c2:67', pts: [] }, { id: 'w4', a: 'c1:L1', b: 'c3:95', pts: [] }] },
      schematic: { free: { seq: 30, items: [fi('d1', 'kbonno', 'KM1', 0, 0), fi('d2', 'olco', 'F1', 100, 0), fi('d3', 'kmn2', 'KM2', 200, 0)], wires: [] } } };
    const prev = App.currentId; App.openNew(JSON.parse(JSON.stringify(P))); if (prev) Store.remove(prev);
    const saved = JSON.parse(JSON.stringify(App.serialize()));
    // an older reader: no new device types, symbol kinds, terminals C1/C2 or props aux/mode
    const D = Circuit.DEFS, K = FreeDraw.KINDS, newT = ['contactor_ton', 'contactor_tof', 'contactor_nc', 'mpcb4', 'olr1', 'olr2'], bak = {}, bakK = {};
    newT.forEach(t => { bak[t] = D[t]; delete D[t]; }); ['kbonno', 'olco', 'kmn2'].forEach(k => { bakK[k] = K[k]; delete K[k]; });
    const gT = D.gen3.terms, oP = D.olr.props, gP = D.gen3.props; D.gen3.terms = gT.filter(t => !/^C/.test(t.id)); D.olr.props = { trip: 4 }; D.gen3.props = {};
    let out;
    try {
      const prev2 = App.currentId; App.openNew(JSON.parse(JSON.stringify(saved))); if (prev2) Store.remove(prev2);
      const msgs = App.compat(), resaved = JSON.parse(JSON.stringify(App.serialize()));
      out = { msgs, resaved };
    } finally { newT.forEach(t => { D[t] = bak[t]; }); Object.assign(K, bakK); D.gen3.terms = gT; D.olr.props = oP; D.gen3.props = gP; }
    const s2 = out.resaved, comp = l => s2.circuit.comps.find(c => c.props.label === l) || ((s2.keep && s2.keep.comps) || []).find(c => c.props && c.props.label === l);
    const back = App.buildProject(JSON.parse(JSON.stringify(s2))), B = back.circuit.comps, b = l => B.find(c => c.props.label === l);
    return out.msgs.length === 1 && comp('KM1').type === 'contactor_ton' && !!comp('QM1') && comp('F1').props.aux === '95-96-98 changeover' && comp('G1').props.mode === 'auto (C1-C2)' && JSON.stringify(s2).includes('c4:C1') && JSON.stringify(s2).includes('c2:67')
      && b('KM1').type === 'contactor_ton' && b('QM1').type === 'mpcb4' && b('F1').props.aux === '95-96-98 changeover' && b('G1').props.mode === 'auto (C1-C2)' && ['kbonno', 'olco', 'kmn2'].every(k => back.schematic.free.items.some(i => i.k === k)) && !(back.keep && back.keep.comps && back.keep.comps.length);
  }));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); const prev = App.currentId; if (App.openNew(Examples.EX.plcmotor.build()) && prev) Store.remove(prev); App.showView('ladder'); });


  check('no page errors', errors.length === 0, errors.join(' | '));

  console.log('Phone (touch)');
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await phone.addInitScript(classicOn);
  await mockGitHub(phone);
  const perr = [];
  phone.on('pageerror', e => perr.push(e.message));
  await phone.goto(URL);
  await phone.waitForTimeout(500);
  check('no horizontal page scroll', (await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
  check('the welcome message of the first start goes away when another project is opened', await phone.evaluate(() => { const has = () => [...document.querySelectorAll('#toast-root .toast')].some(t => /Welcome|Maligayang/.test(t.textContent));
    const a = has(); App.openNew(Examples.EX.dol.build()); const b = has(); App.openNew(Examples.EX.plcmotor.build()); return a && !b; }));
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
  // the free drawing on a phone: pinch zooms it, a long press on a symbol opens its tag form
  await phone.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'free'); App.openNew({ name: 'Phone free', circuit: { comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }], wires: [], seq: 1 }, schematic: { free: { seq: 2, items: [{ id: 'd1', k: 'lamp', tag: 'H1', x: 60, y: 80, r: 0 }], wires: [] } } }); App.showView('schematic'); });
  await phone.waitForTimeout(300);
  await phone.evaluate(() => { const b = document.querySelector('#view-schematic [data-sstyle="free"]'); if (b) b.click(); }); await phone.waitForTimeout(300);
  const phFv = () => phone.evaluate(() => { const g = document.querySelector('#view-schematic .fd-host .fv'); return g ? g.getAttribute('transform') : ''; });
  const phF0 = await phFv(), phFb = await (await phone.$('#view-schematic .fd-host svg')).boundingBox();
  const phX = phFb.x + phFb.width / 2, phY = phFb.y + phFb.height * 0.7;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: phX - 30, y: phY, id: 1 }, { x: phX + 30, y: phY, id: 2 }] });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: phX - 30 - i * 15, y: phY, id: 1 }, { x: phX + 30 + i * 15, y: phY, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const phF1 = await phFv();
  check('pinch zooms the free drawing', !!phF0 && !!phF1 && scale(phF1) > scale(phF0) * 1.5, `${phF0} → ${phF1}`);
  await phone.evaluate(() => FreeDraw.zoom('fit')); await phone.waitForTimeout(150);
  const lb = await (await phone.$('#view-schematic [data-fi="d1"] .hit')).boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: lb.x + lb.width / 2, y: lb.y + lb.height / 2, id: 3 }] });
  await phone.waitForTimeout(800);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check('a long press on a symbol in the free drawing opens its property bar (tag, comment)', await phone.evaluate(() => { const b = document.querySelector('#view-schematic .fd-pbar'); return !!document.querySelector('.modal #f_t') || (!!b && !b.hidden && !!b.querySelector('[data-pbs]')); }));
  await phone.evaluate(() => { FreeDraw.closeBar(); const c = [...document.querySelectorAll('.modal .btn')].find(b => /cancel/i.test(b.textContent)); if (c) c.click(); localStorage.setItem('plc-trainer.schStyle', 'iec'); });
  await phone.waitForTimeout(150);
  // phone layout of the header and the Electrical Diagram toolbar: nothing cut off at the edge, the side panel and the library reachable
  const cutOff = sel => phone.evaluate(sel => { const W = innerWidth, el = document.querySelector(sel); if (!el) return ['missing ' + sel];
    return [...el.querySelectorAll('button, select')].filter(b => b.offsetParent && getComputedStyle(b).visibility !== 'hidden').filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > W + 1); }).map(b => b.textContent.trim().slice(0, 16)); }, sel);
  check('phone: the header is one row and its buttons and project name fit (no overlap)', await phone.evaluate(() => { const t = document.querySelector('.topbar').getBoundingClientRect(), b = document.querySelector('.brand-title').getBoundingClientRect(), a = document.querySelector('.top-actions').getBoundingClientRect();
    return t.height <= 64 && b.right <= a.left + 1 && a.right <= innerWidth + 1; }));
  for (const st of ['iec', 'free']) {
    await phone.evaluate(st => { localStorage.setItem('plc-trainer.schStyle', st); App.showView('schematic'); document.querySelector(`#view-schematic [data-sstyle="${st}"]`).click(); }, st);
    await phone.waitForTimeout(300);
    const cut = await cutOff('#view-schematic .sch-toolbar'), h = await phone.evaluate(() => document.querySelector('#view-schematic .sch-toolbar').getBoundingClientRect().height);
    check(`phone: the Electrical Diagram toolbar (${st}) wraps, no control is cut off and it stays short`, cut.length === 0 && h <= 140, `${cut.join(', ')} · ${h}px`);
  }
  check('phone: in the IEC view every current-path and power symbol can be added from the list', await phone.evaluate(() => { const o = [...document.querySelectorAll('#view-schematic [data-smore] option')].map(x => x.value).filter(Boolean);
    return Object.keys(Schematic.KINDS).every(k => o.includes(k)) && Object.keys(Schematic.PKINDS).every(k => o.includes('p:' + k)) && o.includes('p:feeder'); }));
  await phone.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'free'); document.querySelector('#view-schematic [data-sstyle="free"]').click(); });
  await phone.waitForTimeout(200);
  await phone.tap('#view-schematic [data-fdact="props"]'); await phone.waitForTimeout(350);
  check('phone: ⚙ in the free drawing opens the properties drawer over the drawing, a tap outside closes it', await phone.evaluate(() => document.querySelector('#view-schematic .sch-side').classList.contains('open')) &&
    await (async () => { await phone.touchscreen.tap(40, 500); await phone.waitForTimeout(350); return phone.evaluate(() => !document.querySelector('#view-schematic .sch-side').classList.contains('open')); })());
  await phone.evaluate(() => { if (!FreeDraw.libOpen()) document.querySelector('#view-schematic [data-fdact="lib"]').click(); });
  await phone.waitForTimeout(200);
  await phone.tap('#view-schematic .fd-lib [data-fk="lamp"]'); await phone.waitForTimeout(250);
  await phone.evaluate(() => { const ok = [...document.querySelectorAll('.modal .btn')].find(b => /ok|add/i.test(b.textContent) && b.classList.contains('primary')); if (ok) ok.click(); });
  await phone.waitForTimeout(300);
  check('phone: after a symbol is placed from the library, the library closes so the drawing is not covered', await phone.evaluate(() => !FreeDraw.libOpen() && !document.querySelector('#view-schematic [data-fdact="lib"]').classList.contains('on')));
  await phone.evaluate(() => { if (!FreeDraw.libOpen()) document.querySelector('#view-schematic [data-fdact="lib"]').click(); document.querySelectorAll('#toast-root > *').forEach(x => x.remove()); });
  const libN0 = await phone.evaluate(async () => { const n = App.project.schematic.free.items.length, g = document.querySelector('#view-schematic .fd-grp'); g.value = 'All'; g.dispatchEvent(new Event('change', { bubbles: true }));
    const e = document.querySelector('#view-schematic .fd-lib [data-fk="kmno"]'), o = { bubbles: true, pointerId: 31, pointerType: 'touch' };
    e.dispatchEvent(new PointerEvent('pointerdown', o)); await new Promise(r => setTimeout(r, 700)); e.dispatchEvent(new PointerEvent('pointerup', o)); e.click(); await new Promise(r => setTimeout(r, 150)); return n; });
  check('phone: a long press on a library tile shows its full name and terminals and does not place it', await phone.evaluate(libN0 => [...document.querySelectorAll('#toast-root .toast')].some(x => /Contactor aux N.O. — terminals 13, 14/.test(x.textContent)) && App.project.schematic.free.items.length === libN0, libN0));
  // wiring by touch: one terminal of a symbol, then its other terminal right away, is not taken as a double tap
  await phone.evaluate(() => { App.openNew({ name: 'Touch wiring', circuit: { seq: 2, comps: [{ id: 'c1', type: 'supply1', x: 0, y: 0, props: { label: 'Q1' }, state: { on: true } }], wires: [] },
    schematic: { free: { seq: 5, items: [{ id: 'd1', k: 'pbno', tag: 'S1', x: 0, y: 0, r: 0 }, { id: 'd2', k: 'pbno', tag: 'S2', x: 120, y: 0, r: 0 }], wires: [] } } }); localStorage.setItem('plc-trainer.schStyle', 'free'); App.showView('schematic');
    document.querySelector('#view-schematic [data-sstyle="free"]').click(); document.querySelector('#view-schematic [data-smode="edit"]').click(); if (FreeDraw.libOpen()) document.querySelector('#view-schematic [data-fdact="lib"]').click(); document.querySelectorAll('#toast-root > *').forEach(x => x.remove()); });
  await phone.waitForTimeout(400);
  const tTap = async ft => { const bb = await (await phone.$('#view-schematic [data-ft="' + ft + '"]')).boundingBox(); await phone.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await phone.waitForTimeout(120); };
  await tTap('d1:13'); await tTap('d2:13'); await tTap('d1:14'); await tTap('d2:14');
  check('phone: tapping one terminal of a symbol and then its other terminal quickly draws both wires', await phone.evaluate(() => App.project.schematic.free.wires.length === 2 && !document.querySelector('#modal-root .modal')));
  await phone.evaluate(() => { localStorage.setItem('plc-trainer.schStyle', 'iec'); });
  await phone.evaluate(() => { App.openNew(Examples.EX.plcmotor.build()); App.setMode('RUN'); App.showView('hmi'); });
  await phone.waitForTimeout(400);
  const hp = await (await phone.$('.hmi-screen .t-pb')).boundingBox();
  await phone.touchscreen.tap(hp.x + hp.width / 2, hp.y + hp.height / 2);
  await phone.waitForTimeout(500);
  check('tapping an HMI button on a phone starts the motor', await phone.evaluate(() => App.plc.read('O:0/0') === 1));
  await phone.evaluate(() => App.showView('ladder'));
  await phone.waitForTimeout(300);
  check('phone toolbars show a fade where more buttons are hidden', await phone.evaluate(() => document.querySelector('.lad-toolbar').classList.contains('more-r')));
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
  await mockGitHub(ctx);
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
  {
    console.log('Free draw only: the Electrical Diagram as users get it');
    const fo = await ctx.newPage({ viewport: { width: 1400, height: 900 } });
    await fo.goto(base); await fo.waitForFunction(() => window.App && App.project);
    const r = await fo.evaluate(async () => {
      App.openNew(Examples.EX.stardelta.build()); App.showView('schematic'); await new Promise(q => setTimeout(q, 300));
      const s = App.project.schematic, vis = e => !!e && getComputedStyle(e).display !== 'none' && e.offsetParent !== null;
      const shown = [...document.querySelectorAll('#view-schematic .sch-toolbar .free-group .tbtn')].filter(vis).map(b => b.dataset.fdact);
      return { free: Schematic.freeOnly(), rungs: s.rungs.length, items: s.free.items.length, errs: FreeDraw.errs ? FreeDraw.errs.size : -1, iec: vis(document.querySelector('#view-schematic [data-sstyle="iec"]')), mode: vis(document.querySelector('#view-schematic [data-smode="edit"]')), shown };
    });
    check('free draw only: no IEC / ladder-style switch and no Edit / Operate (Play does it)', r.free && !r.iec && !r.mode, JSON.stringify(r));
    check('free draw only: a drawing made in the IEC view (the star-delta example) opens as a free drawing, with no errors', r.rungs === 0 && r.items > 20 && r.errs === 0, JSON.stringify(r));
    check('free draw only: one short toolbar — Library, Play, Rotate, Delete, Undo, Redo and ⋯', ['lib', 'play', 'rot', 'del', 'more'].every(a => r.shown.includes(a)) && !['values', 'colors', 'back', 'front', 'copy', 'type'].some(a => r.shown.includes(a)), r.shown.join());
    await fo.click('#view-schematic [data-fdact="more"]'); await fo.waitForTimeout(150);
    check('free draw only: Values, wire colours, Duplicate, Type and front / back are in the ⋯ menu', await fo.evaluate(() => { const t = [...document.querySelectorAll('.ctx-menu button')].map(b => b.textContent); return ['Show values', 'Wire colours', 'Duplicate', 'Change type', 'Bring to front', 'Send to back'].every(w => t.some(x => x.includes(w))); }));
    await fo.keyboard.press('Escape');
    check('free draw only: the converted star-delta starter still runs (the start button pulls in its contactor)', await fo.evaluate(async () => {
      document.querySelector('#view-schematic [data-fdact="play"]').click();
      const C = App.project.circuit, s1 = C.comps.find(c => c.props.label === 'S1'), km = C.comps.find(c => c.props.label === 'KM1');
      const up = App.operate(s1, 'btn'); await new Promise(q => setTimeout(q, 600)); if (typeof up === 'function') up(); await new Promise(q => setTimeout(q, 300));
      return !!km && km.state.pulled;
    }));
    check('free draw: a reversing power circuit (owner’s layout) is drawn with simple wires — L1 / L3 cross to KM2 in lanes beside each other, none loops around', await fo.evaluate(async () => {
      App.openNew({ name: 'FwdRev power', circuit: { seq: 1, comps: [], wires: [] } }); App.showView('schematic');
      const F = App.project.schematic.free; let n = 0;
      const it = (k, tag, x, y) => { const o = { id: 'd' + (++n), k, tag, x, y, r: 0 }; F.items.push(o); return o.id; };
      const xp = it('p3', 'XP4', 640, 80), qf = it('qf3', 'QF3', 660, 280), fu = it('fu3', 'FU1', 660, 560), k1 = it('km3', 'KM1', 660, 690), k2 = it('km3', 'KM2', 860, 660), m = it('m3', 'M2', 660, 900);
      let w = 0; const W = (a, c) => F.wires.push({ id: 'fw' + (++w), a, b: c });
      ['L1', 'L2', 'L3'].forEach((t, i) => W(xp + ':' + t, qf + ':' + ['1', '3', '5'][i])); ['2', '4', '6'].forEach((t, i) => W(qf + ':' + t, fu + ':' + ['1', '3', '5'][i]));
      ['2', '4', '6'].forEach((t, i) => W(fu + ':' + t, k1 + ':' + ['1', '3', '5'][i])); W(fu + ':2', k2 + ':5'); W(fu + ':4', k2 + ':3'); W(fu + ':6', k2 + ':1');
      ['2', '4', '6'].forEach((t, i) => W(k1 + ':' + t, m + ':' + ['U1', 'V1', 'W1'][i])); ['2', '4', '6'].forEach((t, i) => W(k2 + ':' + t, k1 + ':' + t));
      F.seq = 200; Schematic.sync(); FreeDraw.render(document.querySelector('#view-schematic .sch-body')); await new Promise(q => setTimeout(q, 200));
      return F.wires.every(x => document.querySelector(`#view-schematic [data-fw="${x.id}"] .w`).getAttribute('d').split(' L').length <= 4);
    }));
    console.log('Exercises: 100 graded tasks across the modules');
    const xr = await fo.evaluate(async () => {
      const L = Exercises.LIST, n = d => L.filter(x => x.diff === d).length, bad = [];
      for (const e of L) {
        if (e.test) {
          const good = Examples.gradeLesson(e, e.solution), empty = Examples.gradeLesson(e, []);
          if (good.error || !good.every(x => x.ok)) bad.push(e.title + ': solution fails');
          if (!empty.error && empty.every(x => x.ok)) bad.push(e.title + ': passes with an empty program');
          continue;
        }
        const open = () => { App.openNew(e.build ? e.build() : Examples.EX[e.ex].build()); App.plc.setMode('PROG'); };
        open(); let A = Exercises.api(); if (e.setup) e.setup(A);
        const before = await e.check(A);
        open(); A = Exercises.api(); await e.solve(A); if (e.setup) e.setup(Exercises.api());
        const after = await e.check(Exercises.api());
        if (!after.every(x => x.ok)) bad.push(e.title + ': solution fails ' + after.filter(x => !x.ok).map(x => x.say).join('; '));
        if (before.every(x => x.ok)) bad.push(e.title + ': passes before it is done');
      }
      return { total: L.length, easy: n('easy'), medium: n('medium'), hard: n('hard'), project: L.filter(x => x.check).length, hints: L.every(x => x.hint), bad };
    });
    check('exercises: 100 of them — 25 easy, 40 medium, 35 hard — each with a hint', xr.total === 100 && xr.easy === 25 && xr.medium === 40 && xr.hard === 35 && xr.hints, JSON.stringify(xr));
    check('exercises: every solution passes its check and no exercise passes before it is done (ladder on a simulated PLC; drawing, wiring and HMI on the project, buttons pressed by the checker)', xr.bad.length === 0, xr.bad.join(' | '));
    check('exercises: some use the Electrical Diagram, the Wiring and the HMI, and some all modules together', xr.project >= 15, String(xr.project));
    await fo.evaluate(() => { App.showView('learn'); });
    await fo.click('#view-learn [data-ltab="ex"]'); await fo.waitForTimeout(150);
    check('Learn: Course and Exercises tabs; exercises by difficulty with a topic filter and a done count', await fo.evaluate(() => !!document.querySelector('#view-learn [data-ltab="course"]') && document.querySelectorAll('#view-learn [data-xdiff]').length === 3 && !!document.querySelector('#view-learn [data-xtopic]') && /0\/25/.test(document.querySelector('#view-learn [data-xdiff="easy"]').textContent)));
    await fo.click('#view-learn [data-lesson="' + await fo.evaluate(() => Exercises.LIST[0].id) + '"]'); await fo.waitForTimeout(150);
    await fo.click('#view-learn [data-sol]'); await fo.waitForTimeout(150); await fo.click('.modal .btn.primary'); await fo.waitForTimeout(200);
    await fo.evaluate(() => App.showView('learn')); await fo.click('#view-learn [data-check]'); await fo.waitForTimeout(200);
    check('Learn: an exercise passed with Check my work is marked done in the list and the count', await fo.evaluate(() => /1\/25/.test(document.querySelector('#view-learn [data-xdiff="easy"]').textContent) && !!document.querySelector('#view-learn .learn-nav button.done') && !!document.querySelector('#view-learn .grade-ok')));
    await fo.click('[data-examples]'); await fo.waitForTimeout(150);
    check('Examples menu: grouped by category (practice boards, motor control, process, hardware)', await fo.evaluate(() => { const h = [...document.querySelectorAll('.ctx-menu .ctx-head, .ctx-menu .head, .ctx-menu h6')].map(x => x.textContent); return ['Practice boards', 'Motor control', 'Process', 'Hardware'].every(c => h.some(t => t.includes(c))); }));
    await fo.keyboard.press('Escape');
    await fo.close();
  }
  check('app loads offline from cache', await web.evaluate(() => !!(window.App && App.project && document.querySelector('.rung'))));
  await ctx.setOffline(false);
  server.close();
  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
