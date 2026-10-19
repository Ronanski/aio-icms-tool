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
  const mockGitHub = target => target.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(releases) }));
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
  for (const v of ['wiring', 'hmi', 'panel']) { await page.evaluate(v => App.showView(v), v); await wait(250); }
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
  for (const v of ['ladder', 'panel', 'hmi', 'learn']) { await page.evaluate(v => App.showView(v), v); await wait(150); }
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
  await page.evaluate(() => App.showView('panel')); await wait(200);
  await (await page.$('#view-panel .pcard svg [data-part="btn"]')).click();
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
  const ver = await page.evaluate(() => App.VERSION);
  const [maj, min] = ver.split('.').map(Number);
  const stableTag = `v${maj}.${min + 1}.0`, betaTag = `v${maj}.${min + 2}.0-beta.1`;
  const asset = n => ({ name: n, browser_download_url: 'https://github.com/x/' + n });
  releases = [
    { tag_name: betaTag, prerelease: true, draft: false, html_url: 'https://github.com/x/beta', body: '### Added\n- **Beta** thing <script>', assets: [asset('PLC-Trainer-Setup-b.exe'), asset('PLC-Trainer-b-android.apk')] },
    { tag_name: stableTag, prerelease: false, draft: false, html_url: 'https://github.com/x/stable', body: '- Stable fix', assets: [asset('PLC-Trainer-Setup-s.exe')] },
    { tag_name: 'v99.0.0', prerelease: false, draft: true, html_url: '', body: '', assets: [] },
  ];
  await page.evaluate(() => { localStorage.setItem('plc-trainer.channel', 'stable'); localStorage.removeItem('plc-trainer.updateSkip'); });
  let st = await page.evaluate(() => Updater.check(true).then(s => s.release && s.release.tag_name));
  check('stable channel finds the newest stable release (not beta, not draft)', st === stableTag, st);
  check('an update bar shows the new version', (await page.textContent('.update-bar')).includes(stableTag));
  await page.click('.update-bar [data-u="notes"]');
  check('release notes show as text, never as HTML', await page.evaluate(() => !!document.querySelector('.rel-notes li') && !document.querySelector('.rel-notes script')));
  await page.keyboard.press('Escape');
  await page.evaluate(() => localStorage.setItem('plc-trainer.channel', 'beta'));
  st = await page.evaluate(() => Updater.check(true).then(s => s.release && s.release.tag_name));
  check('beta channel finds the newer beta release', st === betaTag, st);
  check('the bar marks it as BETA', (await page.textContent('.update-bar')).includes('BETA'));
  await page.click('.update-bar [data-u="later"]');
  check('Later hides the bar', !(await page.$('.update-bar')));
  await page.evaluate(() => Updater.check(false).catch(() => null));
  check('a skipped version does not come back on automatic checks', !(await page.$('.update-bar')));
  releases = [{ tag_name: 'v' + ver, prerelease: false, draft: false, html_url: '', body: '', assets: [] }];
  st = await page.evaluate(() => Updater.check(true).then(s => s.status));
  check('no update when this is the newest version', st === 'current', st);
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

  releases = [{ tag_name: 'v99.0.0', prerelease: false, draft: false, html_url: 'https://github.com/x/r', body: '> note', assets: [] }];
  await page.evaluate(() => { localStorage.setItem('plc-trainer.channel', 'stable'); return Updater.check(true); });
  check('the update bar sits under the status bar and covers nothing', await page.evaluate(() => {
    const bar = document.querySelector('.update-bar'), pb = document.querySelector('.plcbar').getBoundingClientRect(), r = bar.getBoundingClientRect();
    return bar.nextElementSibling.id === 'main' && r.top >= pb.bottom - 1;
  }));
  await page.click('.update-bar [data-u="later"]');
  releases = [];
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
  const elCtx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Electron/33.2.1 Chrome/130' });
  await mockGitHub(elCtx);
  const el = await elCtx.newPage();
  const relX = { tag_name: 'v9.9.9', assets: [{ name: 'PLC-Trainer-Setup-9.9.9.exe', browser_download_url: 'https://x/setup' }, { name: 'PLC-Trainer-9.9.9-portable.exe', browser_download_url: 'https://x/portable' }, { name: 'PLC-Trainer-9.9.9-android.apk', browser_download_url: 'https://x/apk' }] };
  await el.goto(URL + '?build=portable'); await el.waitForTimeout(300);
  const pPick = await el.evaluate(r => Updater.assetFor(r), relX);
  await el.goto(URL + '?build=installed'); await el.waitForTimeout(300);
  const iPick = await el.evaluate(r => Updater.assetFor(r), relX);
  check('Windows: the portable app updates with the portable .exe, the installed app with the installer', pPick === 'https://x/portable' && iPick === 'https://x/setup', `${pPick} ${iPick}`);
  await elCtx.close();

  await page.evaluate(() => App.showView('hmi'));
  check('HMI modes are named Operate / Design (not Run)', (await page.textContent('.hmi-toolbar .seg')).includes('Operate') && !(await page.textContent('.hmi-toolbar .seg')).includes('Run'));

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
