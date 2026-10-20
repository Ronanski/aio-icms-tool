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
  check('no brand names in the app', await page.evaluate(() => !/Allen.?Bradley|Rockwell|RSLogix|MicroLogix|PanelView|SLC 500/i.test(document.documentElement.outerHTML)));

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
  await el.evaluate(() => { localStorage.setItem('plc-trainer.handoverTest', 'from the old app'); localStorage.setItem('plc-trainer.channel', 'stable'); });
  await el.goto(URL); await el.waitForTimeout(1200);
  check('the Windows app moves to the hosted app (in-app updates)', el.url() === 'https://ronanski.github.io/aio-icms-tool/', el.url());
  check('projects and settings of the old app are brought along', await el.evaluate(() => localStorage.getItem('plc-trainer.handoverTest') === 'from the old app' && !location.hash && !!window.App && !!App.project));
  await el.evaluate(() => { localStorage.setItem('plc-trainer.channel', 'beta'); location.reload(); });
  await el.waitForTimeout(1200);
  check('the Beta channel opens the Beta copy (/beta/)', el.url() === 'https://ronanski.github.io/aio-icms-tool/beta/', el.url());
  await el.evaluate(() => { localStorage.setItem('plc-trainer.handoverTest', 'changed in the hosted app'); });
  await elCtx.close();

  await page.evaluate(() => App.showView('hmi'));
  check('HMI modes are named Operate / Design (not Run)', (await page.textContent('.hmi-toolbar .seg')).includes('Operate') && !(await page.textContent('.hmi-toolbar .seg')).includes('Run'));

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
    const L = path.getTotalLength(), q = path.getPointAtLength(L * 0.6), m = path.getScreenCTM();
    return { x: q.x * m.a + q.y * m.c + m.e, y: q.x * m.b + q.y * m.d + m.f, id: w.id };
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
  check('the junction really connects: +24 V reaches input I:0/9', await page.evaluate(() => (App.plc.physIn >> 9) & 1) === 1);
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
  await page.click('#view-schematic [data-smode="run"]');
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
  await page.click('#view-schematic [data-smode="edit"]');

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
  await page.click('#view-schematic [data-smode="edit"]').catch(() => {});

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
  await page.click('#view-schematic [data-smode="run"]');
  const fS1 = await (await page.$('#view-schematic [data-fi="d4"] .hit')).boundingBox();
  await page.mouse.move(fS1.x + fS1.width / 2, fS1.y + fS1.height / 2); await page.mouse.down(); await wait(200); await page.mouse.up(); await wait(500);
  check('free draw: pressing S1 on the drawing starts KM1, its seal-in holds it, the motor runs', (await get('KM1', 'state.pulled')) && (await get('H1', 'state.on')) && (await get('M1', 'state.drive')) === 'run');
  check('free draw: the live paths light up', await page.evaluate(() => document.querySelectorAll('#view-schematic .fwire .w.on').length > 8));
  await page.click('#view-schematic [data-smode="edit"]');
  await page.click('#view-schematic [data-fdact="lib"]'); await page.click('.ctx-menu button:has-text("Loads")'); await wait(100); await page.click('.ctx-menu button:has-text("Pilot lamp")'); await page.fill('#f_t', 'H9'); await page.click('.modal .btn.primary'); await wait(200);
  const h9 = await page.evaluate(() => App.project.schematic.free.items.find(i => i.tag === 'H9').id);
  check('free draw: ＋ Library adds a symbol and its device', !!h9 && await page.evaluate(() => App.project.circuit.comps.some(c => c.props.label === 'H9')));
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
  const bendW = await page.evaluate(() => { const w = App.project.schematic.free.wires.find(x => x.a === 'd8:PE' || x.b === 'd8:PE'); const el = document.querySelector(`#view-schematic [data-fw="${w.id}"] .fwh`); const r = el.getBoundingClientRect(); return { id: w.id, x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
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
  await page.click('#view-schematic [data-fd="type"]'); await wait(150);
  check('free draw: Type ⇄ turns an inductive sensor into an NPN one', await page.evaluate(() => { const F = App.project.schematic.free; return F.items[F.items.length - 1].k === 'proxn'; }));
  await page.click('#view-schematic [data-fd="back"]'); await wait(150);
  check('free draw: To back draws the symbol first', await page.evaluate(() => App.project.schematic.free.items[0].k === 'proxn'));
  await page.click('#view-schematic [data-smode="run"]');
  const fT = await (await page.$('#view-schematic [data-fi="d3"] .hit')).boundingBox();
  await page.mouse.click(fT.x + fT.width / 2, fT.y + fT.height / 2); await wait(500);
  check('free draw: clicking the thermostat on the drawing switches the heater on', await get('EH1', 'state.on'));
  await page.click('#view-schematic [data-smode="edit"]');
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

  console.log('v1.4 part 2: four workspaces');
  check('the Operator Panel is gone', !(await page.$('#view-panel')) && !(await page.$('.tabs [data-view="panel"]')) && !(await page.evaluate(() => 'PanelView' in window)));
  await page.evaluate(() => { localStorage.setItem('plc-trainer.view', 'panel'); localStorage.setItem('plc-trainer.layout', 'wp'); localStorage.setItem('plc-trainer.floats', '[["panel",{"x":10,"y":10,"w":300,"h":200}]]'); });
  await page.reload(); await wait(800);
  check('a saved Panel view opens the Wiring, an old Wiring + Panel layout becomes Wiring + HMI', await page.evaluate(() => App.view === 'wiring' && App.layout === 'wh' && !document.querySelector('.float-win')));
  await page.evaluate(() => { App.setLayout('single'); App.showView('wiring'); });
  check('terminals are drawn as screw heads', await page.evaluate(() => document.querySelector('.ws-svg .comps .term').querySelectorAll('line').length === 2));

  check('no page errors', errors.length === 0, errors.join(' | '));

  console.log('Phone (touch)');
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await mockGitHub(phone);
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
  check('app loads offline from cache', await web.evaluate(() => !!(window.App && App.project && document.querySelector('.rung'))));
  await ctx.setOffline(false);
  server.close();
  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
