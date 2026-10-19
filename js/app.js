/* App shell: project state, persistence, scan loop, views, status bar, lessons. */
(function () {
  'use strict';
  const esc = UI.esc;
  const VERSION = '1.2.1';
  const VIEWS = ['ladder', 'wiring', 'panel', 'hmi', 'learn'];
  /* several views side by side; areas a/b/c are laid out by #main.panes-N in the CSS */
  const LAYOUTS = [
    { key: 'single', label: 'Single view', panes: null },
    { key: 'bench', label: 'Workbench: Ladder + Wiring + Panel & Plant', short: 'Workbench', panes: ['ladder', 'wiring', 'panel'] },
    { key: 'lwh', label: 'Ladder + Wiring + HMI', short: 'Ladder · Wiring · HMI', panes: ['ladder', 'wiring', 'hmi'] },
    { key: 'lw', label: 'Ladder + Wiring', short: 'Ladder · Wiring', panes: ['ladder', 'wiring'] },
    { key: 'lp', label: 'Ladder + Panel & Plant', short: 'Ladder · Panel', panes: ['ladder', 'panel'] },
    { key: 'wp', label: 'Wiring + Panel & Plant', short: 'Wiring · Panel', panes: ['wiring', 'panel'] },
    { key: 'lh', label: 'Ladder + HMI', short: 'Ladder · HMI', panes: ['ladder', 'hmi'] },
  ];
  const NARROW = 760;

  const App = {
    project: null,
    plc: new PLCcore.Engine(),
    ctx: { plcIn: 0, plcInRaw: 0, plcOut: 0, plcPowered: false, plcId: null, mode: 'PROG', forces: false },
    api: null,
    view: 'ladder',
    currentId: null,
    layout: 'single',
    dirty: { ladder: true, wiring: true, panel: true, hmi: true },
  };
  window.App = App;
  App.ctx.setMode = m => App.setMode(m);

  /* ---------- project ---------- */
  /* Build a project from saved or imported data. Files can be hand-edited, so every field is checked:
     ids, colors and numbers end up in SVG/HTML markup. Throws if the data is not a project at all. */
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const arr = v => (Array.isArray(v) ? v : []);
  const ID = /^[A-Za-z0-9_-]{1,40}$/;
  const HEX = /^#[0-9a-fA-F]{3,8}$/;
  const str = (v, n = 400) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, n) : '');
  function buildProject(p) {
    if (!isObj(p)) throw new Error('This is not a PLC Trainer project file');
    const lad = isObj(p.ladder) ? p.ladder : {}, cir = isObj(p.circuit) ? p.circuit : {}, hm = isObj(p.hmi) ? p.hmi : {};
    const rungs = arr(lad.rungs).filter(isObj).map(r => {
      const text = str(r.text, 20000), comment = str(r.comment);
      try { return Ladder.newRung(Ladder.parseRung(text), comment); }
      catch (err) { return Ladder.newRung([], `${comment} [could not parse: ${text}]`); }
    });
    const desc = {};
    if (isObj(lad.desc)) for (const k in lad.desc) { const v = str(lad.desc[k], 80); if (v) desc[k] = v; }
    const comps = arr(cir.comps).filter(c => isObj(c) && Object.prototype.hasOwnProperty.call(Circuit.DEFS, c.type) && ID.test(c.id))
      .map(c => Circuit.normalize(JSON.parse(JSON.stringify(c))));
    const ids = new Set(comps.map(c => c.id));
    const termOk = k => typeof k === 'string' && ids.has(k.split(':')[0]) && Circuit.DEFS[comps.find(c => c.id === k.split(':')[0]).type].terms.some(t => t.id === k.split(':')[1]);
    const wires = arr(cir.wires).filter(w => isObj(w) && ID.test(w.id) && termOk(w.a) && termOk(w.b)).map(w => ({
      id: w.id, a: w.a, b: w.b, color: HEX.test(w.color) ? w.color : '#1d1d1d',
      pts: arr(w.pts).filter(q => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)).map(q => [q[0], q[1]]),
    }));
    const objects = arr(hm.objects).map(HMI.clean).filter(Boolean);
    const maxNum = list => list.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0);
    const seq = v => (Number.isFinite(v) ? v : 0);
    return {
      name: str(p.name, 80).trim() || 'Untitled',
      ladder: { rungs, desc },
      circuit: { comps, wires, seq: Math.max(seq(cir.seq), maxNum(comps), maxNum(wires)) },
      hmi: { objects, seq: Math.max(seq(hm.seq), maxNum(objects)) },
      events: arr(p.events).filter(e => isObj(e) && Number.isFinite(e.t) && KINDS[e.kind]).slice(-LOG_KEEP).map(e => ({ t: e.t, kind: e.kind, msg: str(e.msg, 300) })),
    };
  }
  App.buildProject = buildProject;
  App.loadProject = function (p) { applyProject(buildProject(p)); };
  function applyProject(proj) {
    App.project = proj;
    LOG.length = 0; LOG.push(...proj.events); unseen = 0;
    const rungs = proj.ladder.rungs;
    const plc = App.plc;
    plc.setMode('PROG');
    plc.resetData();
    Object.keys(plc.forces).forEach(k => plc.setForce(k, null));
    plc.forcesEnabled = true;
    lastForces = {}; lastFen = true;
    plc.setProgram(rungs);
    plc.applyAll(true);
    Ladder.resetSel(); Workspace.resetView(); HMI.resetSel();
    Object.keys(App.dirty).forEach(k => { App.dirty[k] = true; });
    renderVisible();
    document.querySelector('[data-pname]').textContent = App.project.name;
    clearTimeout(saveT); saveT = null;
    store();
    App.log('system', `Opened project “${App.project.name}”`);
  }
  App.serialize = function () {
    const p = App.project;
    return {
      version: 1, name: p.name,
      ladder: { rungs: p.ladder.rungs.map(r => ({ comment: r.comment || '', text: Ladder.serialize(r.elems) })), desc: p.ladder.desc },
      circuit: { comps: p.circuit.comps.map(c => ({ id: c.id, type: c.type, x: c.x, y: c.y, props: c.props, state: c.state })), wires: p.circuit.wires, seq: p.circuit.seq },
      hmi: p.hmi,
      events: LOG.slice(-LOG_KEEP),
    };
  };
  let saveT = null, saveFailed = false;
  /* write the project to browser storage; warn once if it fails (storage full or blocked) */
  function store() {
    if (!App.project || !App.currentId) return true;
    const ok = Store.save(App.currentId, App.serialize());
    if (!ok && !saveFailed) {
      UI.toast('Could not save: browser storage is full or blocked. Use File → Export to file to keep a copy.', 'danger', 7000);
      App.log('alarm', 'Project could not be saved (browser storage full or blocked)');
    }
    saveFailed = !ok;
    App.lastSave = ok ? Date.now() : App.lastSave;
    saveState(ok ? 'saved' : 'failed');
    return ok;
  }
  function saveState(st) {
    const el = document.querySelector('[data-saved]');
    if (!el) return;
    el.textContent = st === 'saved' ? 'Saved' : st === 'pending' ? 'Saving…' : 'Not saved';
    el.className = 'save-st ' + st;
  }
  App.save = function () {
    clearTimeout(saveT);
    saveState('pending');
    saveT = setTimeout(() => { saveT = null; store(); }, 500);
  };
  /* write any pending change now, before switching to another project */
  App.flushSave = function () {
    if (saveT === null) return true;
    clearTimeout(saveT); saveT = null;
    return store();
  };
  /* open project data as a new saved project (examples, imports, New project).
     The data is checked first, so a broken file leaves the current project as it was. */
  App.openNew = function (data) {
    const proj = buildProject(data);
    App.flushSave();
    App.currentId = Store.newId();
    Store.setCurrent(App.currentId);
    applyProject(proj);
  };
  App.openSaved = function (id) {
    let proj = null;
    try { const data = Store.load(id); if (data) proj = buildProject(data); } catch (err) { proj = null; }
    if (!proj) { UI.toast('That project could not be read', 'danger'); return false; }
    App.flushSave();
    App.currentId = id;
    Store.setCurrent(id);
    applyProject(proj);
    return true;
  };
  App.programChanged = function () { App.plc.setProgram(App.project.ladder.rungs); App.save(); };
  App.circuitChanged = function () { App.dirty.panel = true; App.dirty.wiring = true; renderVisible(); App.save(); };
  App.force = function (norm, val) { App.plc.setForce(norm, val); App.forcesChanged(); };
  /* compare with the last known forces so every change is logged, whichever control made it */
  let lastForces = {}, lastFen = true;
  App.forcesChanged = function () {
    const plc = App.plc, now = plc.forces;
    for (const k in now) if (lastForces[k] !== now[k]) App.log('force', `Force ${now[k] ? 'ON' : 'OFF'} installed on ${k}`);
    for (const k in lastForces) if (!(k in now)) App.log('force', `Force removed from ${k}`);
    if (plc.forcesEnabled !== lastFen) App.log('force', `Forces ${plc.forcesEnabled ? 'enabled' : 'disabled'}`);
    lastForces = { ...now }; lastFen = plc.forcesEnabled;
    Ladder.DataTable.render(); updateBar(true);
  };
  App.setMode = function (m) {
    if (m === 'RUN' && !Ladder.verify(true)) { UI.toast('Program has errors — fix them before going to RUN', 'danger'); App.log('system', 'Go to RUN refused: the program has errors'); Ladder.verify(false); return; }
    if (App.plc.mode !== m) App.log('mode', `Controller mode changed to ${m}`);
    App.plc.setMode(m);
    updateBar(true);
  };
  /* operate a device part (button, breaker handle, selector…) from the wiring or panel view.
     Returns the release function for momentary parts (see App.hold). */
  const PART_NAMES = { btn: 'button', h: 'handle', sw: 'main switch', knob: 'selector', l: 'selector (left)', r: 'selector (right)', lever: 'lever', tgt: 'target', jam: 'JAM', reset: 'RESET', test: 'TEST', add: '+ BOX', auto: 'AUTO', clr: 'CLEAR', use: 'USE', mode: 'key switch' };
  App.operate = function (c, part) {
    Circuit.part(c, part, 'down', App.ctx);
    const st = Circuit.status(c, App.ctx);
    App.log('operator', `${c.props.label}: ${PART_NAMES[part] || part} operated${st ? ' → ' + st : ''}`);
    App.save();
    return App.hold(c.id + ':' + part, () => { Circuit.part(c, part, 'up', App.ctx); App.save(); });
  };

  /* ---------- event log (newest last; the last LOG_KEEP events are saved with the project) ---------- */
  const LOG = [], LOG_MAX = 500, LOG_KEEP = 200;
  const KINDS = { alarm: 'Alarm', mode: 'Mode', force: 'Force', operator: 'Operator', system: 'System' };
  let unseen = 0, logView = null;
  App.log = function (kind, msg) {
    LOG.push({ t: Date.now(), kind, msg: String(msg) });
    if (LOG.length > LOG_MAX) LOG.shift();
    if (kind === 'alarm') unseen++;
    const b = document.querySelector('[data-evbadge]');
    if (b) { b.textContent = unseen; b.hidden = !unseen; }
    if (logView) logView();
  };
  App.events = () => LOG.slice();
  const fmtTime = t => new Date(t).toLocaleTimeString([], { hour12: false }) + '.' + String(t % 1000).padStart(3, '0');
  function eventLog() {
    unseen = 0;
    const b = document.querySelector('[data-evbadge]'); if (b) b.hidden = true;
    let filter = 'all';
    const m = UI.modal({
      title: 'Event log', wide: true,
      body: `<div class="ev-tools"><select data-evf><option value="all">All events</option>${Object.entries(KINDS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
        <span class="spacer"></span><button class="btn" data-evx>⤓ Export CSV</button><button class="btn" data-evc>Clear</button></div>
        <div class="ev-list"></div><p class="help">Newest first (up to ${LOG_MAX} in this session). The last ${LOG_KEEP} events are saved with the project.</p>`,
    });
    const list = m.el.querySelector('.ev-list');
    logView = () => {
      if (!document.body.contains(list)) { logView = null; return; }
      const rows = LOG.filter(e => filter === 'all' || e.kind === filter).slice().reverse();
      list.innerHTML = rows.length ? `<table class="ev"><tr><th>Time</th><th>Type</th><th>Event</th></tr>${rows.map(e => `<tr class="k-${e.kind}"><td>${fmtTime(e.t)}</td><td><span class="evk">${KINDS[e.kind] || esc(e.kind)}</span></td><td>${esc(e.msg)}</td></tr>`).join('')}</table>` : '<p class="help">No events yet.</p>';
    };
    logView();
    m.el.querySelector('[data-evf]').onchange = e => { filter = e.target.value; logView(); };
    m.el.querySelector('[data-evc]').onclick = () => { LOG.length = 0; logView(); };
    m.el.querySelector('[data-evx]').onclick = () => {
      // quote every field; a leading = + - @ would be run as a formula by spreadsheets, so prefix it with '
      const q = v => { let t = String(v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
      const csv = 'time,type,event\n' + LOG.map(e => [new Date(e.t).toISOString(), KINDS[e.kind] || e.kind, e.msg].map(q).join(',')).join('\n');
      download(new Blob([csv], { type: 'text/csv' }), (App.project.name || 'project').replace(/[^\w-]+/g, '_') + '-events.csv');
    };
  }
  App.eventLog = eventLog;

  /* ---------- loop ---------- */
  const alertSeen = new Map();
  let last = performance.now();
  /* App.later(n, fn) runs fn once n more ticks (circuit solve + PLC scan) have passed.
     Momentary buttons release through it, so even a quick tap is seen by at least one scan. */
  App.ticks = 0;
  const pending = [];
  App.later = function (n, fn) { pending.push({ at: App.ticks + n, fn }); };
  App.holdTicks = 2;
  let lastPw = true;
  /* call App.hold(key, up) when a momentary button goes down; call the returned function when it is released.
     up() runs no earlier than App.holdTicks ticks after the press. A newer press on the same key cancels it. */
  const holds = new Map();
  App.hold = function (key, up) {
    const tok = { at: App.ticks };
    holds.set(key, tok);
    return () => {
      const run = () => { if (holds.get(key) === tok) { holds.delete(key); up(); } };
      const wait = tok.at + App.holdTicks - App.ticks;
      if (wait <= 0) run(); else App.later(wait, run);
    };
  };
  function tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const ctx = App.ctx, plc = App.plc, circ = App.project.circuit;
    const pc = circ.comps.find(c => c.type === 'plc');
    ctx.plcId = pc ? pc.id : null;
    ctx.plcOut = plc.physOut; ctx.mode = plc.mode; ctx.forces = plc.forcesEnabled && plc.forceCount() > 0;
    ctx.plcIn = 0; ctx.plcPowered = false;
    const r = Circuit.solve(circ, dt, ctx);
    App.api = r.api;
    for (const a of r.alerts) {
      const t = alertSeen.get(a.msg) || 0;
      if (now - t > 4000) { UI.toast(a.msg, a.kind || 'warn', 4200); App.log('alarm', a.msg); }
      alertSeen.set(a.msg, now);
    }
    if (r.alerts.length) App.save();
    if (pc) { plc.powered = ctx.plcPowered; plc.physIn = ctx.plcIn; } else { plc.powered = true; plc.physIn = 0; }
    if (pc && plc.powered !== lastPw && App.ticks > 0) App.log(plc.powered ? 'system' : 'alarm', plc.powered ? 'PLC power restored' : 'PLC lost its power');
    lastPw = plc.powered;
    ctx.plcInRaw = ctx.plcIn;
    plc.scan(dt);
    App.ticks++;
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= App.ticks) pending.splice(i, 1)[0].fn();
  }
  function frame() {
    const vis = visibleViews();
    if (vis.includes('ladder')) Ladder.update();
    if (vis.includes('wiring')) Workspace.update();
    if (vis.includes('panel')) PanelView.update();
    if (vis.includes('hmi')) HMI.update();
    updateBar(false);
    requestAnimationFrame(frame);
  }

  /* ---------- views ---------- */
  /* 'custom' is the set of windows ticked in the View menu (1 to 3, kept in VIEWS order) */
  const VNAME = { ladder: 'Ladder', wiring: 'Wiring', panel: 'Panel & Plant', hmi: 'HMI' };
  let customPanes = ['ladder', 'wiring'];
  try { const c = JSON.parse(localStorage.getItem('plc-trainer.customPanes') || 'null'); if (Array.isArray(c) && c.length && c.every(v => VNAME[v])) customPanes = c.slice(0, 3); } catch (e) { /* ignore */ }
  const layoutOf = k => (k === 'custom'
    ? { key: 'custom', label: 'Custom', short: customPanes.map(v => VNAME[v]).join(' · '), panes: customPanes.length > 1 ? customPanes : null }
    : LAYOUTS.find(l => l.key === k) || LAYOUTS[0]);
  /* tick or untick a window in the View menu */
  App.toggleWindow = function (v) {
    const cur = visibleViews().filter(x => VNAME[x]);
    let next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
    if (!next.length) return;
    if (next.length > 3) { UI.toast('Up to 3 windows side by side. Untick one first.', 'warn'); return; }
    customPanes = Object.keys(VNAME).filter(x => next.includes(x));
    try { localStorage.setItem('plc-trainer.customPanes', JSON.stringify(customPanes)); } catch (e) { /* ignore */ }
    App.layout = 'custom';
    Workspace.refit();
    App.view = customPanes.includes(App.view) ? App.view : customPanes[0];
    App.showView(App.view);
  };
  function visibleViews() {
    const L = layoutOf(App.layout);
    if (!L.panes || App.view === 'learn' || innerWidth <= NARROW || !L.panes.includes(App.view)) return [App.view];
    return L.panes;
  }
  function renderView(v) {
    App.dirty[v] = false;
    if (v === 'ladder') { Ladder.render(); Ladder.DataTable.render(); }
    if (v === 'wiring') { Workspace.render(); Workspace.onShow(); }
    if (v === 'panel') PanelView.render();
    if (v === 'hmi') { HMI.render(); HMI.onShow(); }
    if (v === 'learn') renderLearn();
  }
  function renderVisible() { visibleViews().forEach(v => { if (App.dirty[v] !== false || v === 'learn') renderView(v); }); }
  App.showView = function (v) {
    const L = layoutOf(App.layout);
    // a view outside the current layout opens on its own; Learn always does
    if (L.panes && v !== 'learn' && !L.panes.includes(v)) App.layout = 'single';
    App.view = v;
    const vis = visibleViews();
    VIEWS.forEach(k => {
      const el = document.getElementById('view-' + k);
      const i = vis.indexOf(k);
      el.classList.toggle('active', i >= 0);
      el.classList.toggle('focus', vis.length > 1 && k === v);
      el.style.gridArea = i >= 0 ? 'abc'[i] : '';
    });
    const main = document.getElementById('main');
    main.classList.remove('panes-1', 'panes-2', 'panes-3');
    main.classList.add('panes-' + vis.length);
    main.classList.toggle('multi', vis.length > 1);
    document.querySelectorAll('.tabs [data-view]').forEach(b => {
      b.classList.toggle('on', b.dataset.view === v);
      b.classList.toggle('shown', vis.length > 1 && vis.includes(b.dataset.view));
    });
    const lb = document.querySelector('[data-layout]');
    const cur = layoutOf(App.layout);
    lb.textContent = '▦ ' + (cur.panes ? cur.short : 'View');
    lb.classList.toggle('on', !!cur.panes);
    vis.forEach(k => renderView(k));
    try { localStorage.setItem('plc-trainer.view', v); localStorage.setItem('plc-trainer.layout', App.layout); } catch (e) { /* ignore */ }
  };
  App.setLayout = function (k) {
    const L = layoutOf(k);
    App.layout = L.key;
    Workspace.refit();
    App.showView(L.panes ? (L.panes.includes(App.view) ? App.view : L.panes[0]) : App.view);
  };

  /* draggable dividers between panes */
  function bindGutters() {
    const main = document.getElementById('main');
    try {
      const sz = JSON.parse(localStorage.getItem('plc-trainer.panes') || '{}');
      if (sz.c1) main.style.setProperty('--c1', sz.c1);
      if (sz.r1) main.style.setProperty('--r1', sz.r1);
    } catch (e) { /* ignore */ }
    main.querySelectorAll('.gutter').forEach(g => {
      g.addEventListener('pointerdown', e => {
        e.preventDefault();
        g.setPointerCapture(e.pointerId);
        g.classList.add('drag');
        const move = ev => {
          const r = main.getBoundingClientRect();
          if (g.dataset.g === 'v') main.style.setProperty('--c1', Math.max(20, Math.min(80, (ev.clientX - r.left) / r.width * 100)).toFixed(1) + '%');
          else main.style.setProperty('--r1', Math.max(15, Math.min(85, (ev.clientY - r.top) / r.height * 100)).toFixed(1) + '%');
        };
        const up = () => {
          g.classList.remove('drag');
          g.removeEventListener('pointermove', move);
          g.removeEventListener('pointerup', up);
          try { localStorage.setItem('plc-trainer.panes', JSON.stringify({ c1: main.style.getPropertyValue('--c1'), r1: main.style.getPropertyValue('--r1') })); } catch (err) { /* ignore */ }
          window.dispatchEvent(new Event('resize'));
        };
        g.addEventListener('pointermove', move);
        g.addEventListener('pointerup', up);
      });
      g.addEventListener('dblclick', () => { main.style.removeProperty(g.dataset.g === 'v' ? '--c1' : '--r1'); window.dispatchEvent(new Event('resize')); });
    });
    // keyboard shortcuts go to the pane the user last touched
    main.addEventListener('pointerdown', e => {
      const v = e.target.closest('.view');
      if (!v || !main.classList.contains('multi')) return;
      const k = v.id.replace('view-', '');
      if (k !== App.view) {
        App.view = k;
        VIEWS.forEach(x => document.getElementById('view-' + x).classList.toggle('focus', x === k));
        document.querySelectorAll('.tabs [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === k));
      }
    }, true);
    let wasNarrow = innerWidth <= NARROW;
    window.addEventListener('resize', () => {
      const n = innerWidth <= NARROW;
      if (n !== wasNarrow) { wasNarrow = n; App.showView(App.view); }
    });
  }

  /* ---------- status bar ---------- */
  let barCache = {};
  function updateBar(force) {
    const plc = App.plc, ctx = App.ctx;
    const st = {
      mode: plc.mode, pw: plc.powered, run: plc.powered && plc.mode === 'RUN', force: plc.forceCount() > 0, fen: plc.forcesEnabled,
      io: (ctx.plcId ? ctx.plcInRaw : plc.data.I[0] & 0xFFFF) + '|' + plc.physOut,
      scan: Math.floor(performance.now() / 500), nplc: !!ctx.plcId,
    };
    if (!force && JSON.stringify(st) === JSON.stringify(barCache)) return;
    barCache = st;
    document.querySelectorAll('.plcbar [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === plc.mode));
    const L = (k, on) => document.querySelector(`[data-led="${k}"]`).classList.toggle('on', !!on);
    L('pw', st.pw); L('run', st.run); L('force', st.force); L('fault', false);
    document.querySelector('[data-led="force"]').classList.toggle('blink', st.force && !st.fen);
    const fb = document.querySelector('[data-forces]');
    fb.textContent = `Forces: ${plc.forcesEnabled ? 'Enabled' : 'Disabled'} (${plc.forceCount()})`;
    fb.classList.toggle('warn', st.force);
    const inW = plc.data.I[0] & 0xFFFF, outW = plc.physOut;
    document.querySelector('[data-io]').innerHTML =
      `<span class="iol">I:0</span>${Array.from({ length: PLCcore.NUM_IN }, (_, i) => `<i class="${(inW >> i) & 1 ? 'on in' : ''}${plc.forces['I:0/' + i] !== undefined ? ' f' : ''}" title="I:0/${i}"></i>`).join('')}` +
      `<span class="iol">O:0</span>${Array.from({ length: PLCcore.NUM_OUT }, (_, i) => `<i class="${(outW >> i) & 1 ? 'on out' : ''}${plc.forces['O:0/' + i] !== undefined ? ' f' : ''}" title="O:0/${i}"></i>`).join('')}`;
    document.querySelector('[data-scan]').textContent = `scan ${plc.scanMs.toFixed(2)} ms`;
    const msg = document.querySelector('[data-msg]');
    let m = '';
    if (!st.nplc) m = 'No PLC in the wiring — ladder runs as a virtual PLC (use forcing to test).';
    else if (!st.pw) m = '⚠ PLC has no power — check QF/L1/N wiring in the Wiring tab.';
    else if (plc.mode === 'PROG') m = st.force && st.fen ? 'Program mode — outputs are off, but forced outputs stay active. Switch to RUN to execute.' : 'Program mode — outputs are off. Switch to RUN to execute.';
    msg.textContent = m;
    msg.title = m;
    msg.classList.toggle('warn', !!st.nplc && !st.pw);
  }

  /* ---------- learn ---------- */
  let lessonId = 'l1';
  function renderLearn() {
    const el = document.getElementById('view-learn');
    const L = Examples.LESSONS;
    const cur = L.find(l => l.id === lessonId) || L[0];
    const ex = Examples.EX[cur.ex];
    const INSTR = PLCcore.INSTR;
    el.innerHTML = `<div class="learn">
      <aside class="learn-nav"><h3>Lessons</h3>${[...new Set(L.map(l => l.level))].map(g => `<h6>${g}</h6>${L.filter(l => l.level === g).map(l => `<button class="${l.id === cur.id ? 'on' : ''}" data-lesson="${l.id}">${esc(l.title)}</button>`).join('')}`).join('')}
        <h3 class="mt">Examples</h3>${Object.entries(Examples.EX).map(([k, e]) => `<button data-ex="${k}">${esc(e.title)}</button>`).join('')}</aside>
      <article class="learn-body">
        <div class="kicker">${esc(cur.level)}</div><h2>${esc(cur.title)}</h2>
        <div class="lesson">${cur.body}</div>
        <div class="btn-row">${ex ? `<button class="btn${cur.test ? '' : ' primary'}" data-load="${cur.ex}">Load “${esc(ex.title)}”</button>` : ''}${cur.test ? `<button class="btn primary" data-check>✓ Check my work</button>` : ''}${cur.solution ? `<button class="btn" data-sol>Insert solution into ladder</button>` : ''}</div>
        ${cur.test ? '<div class="grade" data-grade></div>' : ''}
        <h3 class="mt">Instruction reference</h3>
        <table class="ref"><tr><th>Mnemonic</th><th>Name</th><th>Operands</th><th>What it does</th></tr>${Object.entries(INSTR).map(([k, d]) => `<tr><td><code>${k}</code></td><td>${esc(d.name)}</td><td>${d.args.map(a => esc(a.n)).join(', ')}</td><td>${esc(d.help)}</td></tr>`).join('')}</table>
        <h3 class="mt">Addressing (file-based style)</h3>
        <table class="ref"><tr><th>Address</th><th>Meaning</th></tr>
          <tr><td><code>I:0/0 … I:0/11</code></td><td>Physical inputs (input image)</td></tr>
          <tr><td><code>O:0/0 … O:0/7</code></td><td>Physical relay outputs</td></tr>
          <tr><td><code>B3:0/0</code> or <code>B3/0</code></td><td>Internal bits (word 0, bit 0). <code>B3/17</code> = <code>B3:1/1</code></td></tr>
          <tr><td><code>T4:0</code> · <code>T4:0/DN</code> · <code>T4:0.ACC</code></td><td>Timer structure · done bit (EN, TT, DN) · word (PRE, ACC)</td></tr>
          <tr><td><code>C5:0</code> · <code>C5:0/DN</code> · <code>C5:0.PRE</code></td><td>Counter structure · bits (CU, CD, DN, OV, UN) · words (PRE, ACC)</td></tr>
          <tr><td><code>N7:0</code></td><td>16-bit signed integer</td></tr>
          <tr><td><code>S:1/15</code></td><td>First-scan bit</td></tr></table>
        <h3 class="mt">Keyboard</h3>
        <table class="ref"><tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd> · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> · <kbd>Ctrl</kbd>+<kbd>O</kbd></td><td>Save · Save as · Open project</td></tr><tr><td><kbd>Ctrl</kbd>+scroll</td><td>Zoom the ladder or the HMI (scroll alone zooms the wiring)</td></tr><tr><td>Drag an instruction</td><td>Move it to another place or rung (mouse). Right-click → Change to… swaps XIC ↔ XIO, TON ↔ TOF and so on.</td></tr><tr><td><kbd>Del</kbd></td><td>Delete selected instruction / rung / wire / device</td></tr><tr><td><kbd>Enter</kbd></td><td>Edit selected instruction</td></tr><tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd></td><td>Undo / redo (ladder)</td></tr><tr><td><kbd>Ctrl</kbd>+<kbd>R</kbd></td><td>New rung</td></tr><tr><td><kbd>Esc</kbd></td><td>Cancel wire / clear selection</td></tr><tr><td><kbd>M</kbd></td><td>Multimeter (Wiring)</td></tr></table>
      </article></div>`;
    el.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.lesson) { lessonId = b.dataset.lesson; renderLearn(); el.querySelector('.learn-body').scrollTop = 0; }
      if (b.dataset.load) loadExample(b.dataset.load);
      if (b.dataset.ex) loadExample(b.dataset.ex);
      if (b.hasAttribute('data-check')) {
        const res = Examples.gradeLesson(cur, App.project.ladder.rungs.map(r => Ladder.serialize(r.elems)));
        const box = el.querySelector('[data-grade]');
        if (res.error) { box.innerHTML = `<p class="grade-bad">${esc(res.error)}</p>`; return; }
        const pass = res.every(r => r.ok);
        box.innerHTML = `<p class="${pass ? 'grade-ok' : 'grade-bad'}">${pass ? '✓ All checks passed. Well done!' : `${res.filter(r => r.ok).length} of ${res.length} checks passed. Fix the red ones and check again.`}</p>
          <ul class="grade-list">${res.map(r => `<li class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✗'} ${esc(r.say)}${r.ok ? '' : ` <small>(${esc(r.got)})</small>`}</li>`).join('')}</ul>
          <p class="help">The check runs your current ladder program on a simulated PLC with the inputs pressed for you. Your wiring is not used.</p>`;
        return;
      }
      if (b.hasAttribute('data-sol')) {
        UI.confirm('Insert solution', 'Replace the current ladder program with the lesson solution?', () => {
          App.plc.setMode('PROG');
          App.project.ladder.rungs = cur.solution.map(t => Ladder.newRung(Ladder.parseRung(t)));
          App.plc.setProgram(App.project.ladder.rungs); App.plc.applyAll(true);
          Ladder.resetSel(); App.dirty.ladder = true; App.save();
          UI.toast('Solution inserted — switch to RUN and try it');
          App.showView('ladder');
        }, 'Replace');
      }
    };
  }
  function loadExample(k) {
    const ex = Examples.EX[k];
    App.openNew(ex.build());
    UI.toast(`Opened “${ex.title}” as a new project. Your other projects are in File → Open project.`, 'ok', 4000);
    App.showView(k === 'blank' ? 'wiring' : App.view === 'learn' ? 'wiring' : App.view);
  }
  App.loadExample = loadExample;

  /* ---------- top bar ---------- */
  function bindChrome() {
    document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) App.showView(b.dataset.view); });
    document.querySelector('.plcbar').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mode) App.setMode(b.dataset.mode);
      if (b.hasAttribute('data-forces')) { App.plc.forcesEnabled = !App.plc.forcesEnabled; App.forcesChanged(); }
      if (b.hasAttribute('data-events')) eventLog();
      if (b.hasAttribute('data-layout')) {
        const r = b.getBoundingClientRect();
        const vis = visibleViews();
        UI.menu(r.left, r.bottom + 4, [
          { head: 'Show windows (up to 3)' },
          ...Object.entries(VNAME).map(([k, n]) => ({ label: (vis.includes(k) ? '☑ ' : '☐ ') + n, onClick: () => App.toggleWindow(k) })),
          { sep: true }, { head: 'Ready-made layouts' },
          ...LAYOUTS.map(l => ({ label: (l.key === App.layout ? '✓ ' : '\u2003') + l.label, onClick: () => App.setLayout(l.key) })),
        ]);
      }
    });
    document.querySelector('[data-examples]').addEventListener('click', e => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu(r.left, r.bottom + 4, [{ head: 'Load example' }, ...Object.entries(Examples.EX).map(([k, x]) => ({ label: x.title, onClick: () => loadExample(k) }))]);
    });
    document.querySelector('[data-file]').addEventListener('click', e => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu(r.left, r.bottom + 4, [
        { label: 'New project…', onClick: newProject },
        { label: 'Open project…', kbd: 'Ctrl+O', onClick: openDialog },
        { label: 'Save', kbd: 'Ctrl+S', onClick: saveNow },
        { label: 'Save as…', kbd: 'Ctrl+Shift+S', onClick: saveAs },
        { label: 'Rename project…', onClick: rename },
        { sep: true },
        { label: 'Export to file (.plc.json)', onClick: exportProject },
        { label: 'Import from file…', onClick: () => document.getElementById('importFile').click() },
        { sep: true },
        { label: 'Event log', onClick: eventLog },
        { label: 'Updates…', onClick: () => Updater.dialog() },
        { label: 'Reset PLC data table…', onClick: () => UI.confirm('Reset PLC data table', 'Clear all bits, timers, counters and integers (B3, T4, C5, N7) to zero? The program is kept.', () => { App.plc.resetData(); App.plc.applyAll(true); UI.toast('Data table cleared'); App.log('system', 'PLC data table cleared'); }, 'Reset') },
        { label: `About PLC Trainer v${VERSION}`, onClick: about },
      ]);
    });
    document.getElementById('importFile').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { App.openNew(JSON.parse(t)); UI.toast('Project imported as a new project', 'ok'); }).catch(err => UI.toast('Import failed: ' + err.message, 'danger'));
      e.target.value = '';
    });
    document.querySelector('[data-theme-btn]').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || 'auto';
      const next = cur === 'auto' ? 'dark' : cur === 'dark' ? 'light' : 'auto';
      setTheme(next);
    });
    document.querySelector('[data-pname]').addEventListener('dblclick', rename);
    document.addEventListener('keydown', e => {
      const ctl = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      // Save / Open never reach the browser (its "Save page" / file picker); inside a dialog they do nothing
      if (ctl && (key === 's' || key === 'o')) {
        e.preventDefault();
        if (document.querySelector('.modal-wrap')) return;
        if (key === 'o') openDialog(); else if (e.shiftKey) saveAs(); else saveNow();
        return;
      }
      if (UI.isTyping() || document.querySelector('.modal-wrap')) return;
      const v = App.view;
      if (v === 'ladder') Ladder.onKey(e);
      else if (v === 'wiring') Workspace.onKey(e);
      else if (v === 'hmi') HMI.onKey(e);
    });
    window.addEventListener('resize', () => { if (visibleViews().includes('ladder')) Ladder.render(); });
  }
  function setTheme(t) {
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    document.querySelector('[data-theme-btn]').textContent = t === 'dark' ? '☾' : t === 'light' ? '☀' : '◐';
    document.querySelector('[data-theme-btn]').title = 'Theme: ' + t;
    try { localStorage.setItem('plc-trainer.theme', t); } catch (e) { /* ignore */ }
  }
  function newProject() {
    const opts = Object.entries(Examples.EX).map(([k, x]) => ({ v: k, l: x.title }));
    opts.sort((a, b) => (a.v === 'blank' ? -1 : b.v === 'blank' ? 1 : 0));
    UI.form('New project', [
      { key: 'n', label: 'Project name', value: 'My project' },
      { key: 't', label: 'Start from', value: 'blank', options: opts },
    ], v => {
      const name = v.n.trim();
      if (!name) return 'Enter a project name';
      const p = Examples.EX[v.t].build();
      p.name = name;
      App.openNew(p);
      UI.toast(`Created project “${name}”`, 'ok');
      App.showView(v.t === 'blank' ? 'wiring' : 'ladder');
    }, '<p class="help">Your current project stays saved. Switch back any time with File → Open project.</p>');
  }
  function openDialog() {
    const fmt = t => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const m = UI.modal({
      title: 'Open project',
      body: '<div class="proj-list"></div>',
      buttons: [{ label: 'Close' }],
    });
    const box = m.el.querySelector('.proj-list');
    const draw = () => {
      const list = Store.list();
      box.innerHTML = list.length ? list.map(p => `<div class="proj-row${p.id === App.currentId ? ' cur' : ''}">
          <div><b>${esc(p.name)}</b><small>${p.id === App.currentId ? 'Open now · ' : ''}saved ${fmt(p.updated)}</small></div>
          <button class="btn" data-open="${p.id}" ${p.id === App.currentId ? 'disabled' : ''}>Open</button>
          <button class="icon-btn" data-del="${p.id}" title="Delete project" aria-label="Delete ${esc(p.name)}" ${p.id === App.currentId ? 'disabled' : ''}>🗑</button></div>`).join('')
        : '<p class="help">No saved projects yet.</p>';
    };
    draw();
    box.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.open) { m.close(); App.openSaved(b.dataset.open); UI.toast('Project opened', 'ok'); }
      if (b.dataset.del) {
        const p = Store.list().find(x => x.id === b.dataset.del);
        if (b.dataset.confirm) { Store.remove(b.dataset.del); draw(); UI.toast(`Deleted “${p ? p.name : 'project'}”`); }
        else { b.dataset.confirm = '1'; b.textContent = 'Delete?'; b.classList.add('danger-txt'); }
      }
    };
  }
  function about() {
    UI.modal({
      title: `PLC Trainer v${VERSION}`,
      body: `<p>PLC trainer: ladder logic, power and control wiring, forcing, HMI and live equipment.</p><h4>Install on your device</h4><ul class="tips"><li><b>Android (Chrome)</b>: tap <b>Install app</b> in the top bar, or menu ⋮ → <b>Add to Home screen</b>.</li><li><b>iPhone / iPad (Safari)</b>: tap Share → <b>Add to Home Screen</b>.</li><li><b>Windows / Mac (Chrome or Edge)</b>: click <b>Install app</b>, or the install icon in the address bar.</li></ul><p class="help">Install needs the hosted web address (https). Once installed, the app works offline.</p><p>Windows installer and Android APK: <a href="https://github.com/Ronanski/aio-icms-tool/releases/latest" target="_blank" rel="noopener">download the latest release</a>.</p><p class="help">Educational simulator. Not affiliated with any PLC manufacturer. All trademarks belong to their owners.</p>`,
    });
  }
  App.VERSION = VERSION;
  function rename() {
    UI.form('Rename project', [{ key: 'n', label: 'Project name', value: App.project.name }], v => {
      App.project.name = v.n.trim() || 'Untitled';
      document.querySelector('[data-pname]').textContent = App.project.name;
      App.save();
    });
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportProject() {
    download(new Blob([JSON.stringify(App.serialize(), null, 1)], { type: 'application/json' }), (App.project.name || 'project').replace(/[^\w-]+/g, '_') + '.plc.json');
  }
  /* projects save themselves; Save writes now and confirms */
  function saveNow() {
    clearTimeout(saveT); saveT = null;
    if (store()) { UI.toast(`Saved “${App.project.name}”`, 'ok', 1800); App.log('system', `Saved project “${App.project.name}”`); }
  }
  App.saveNow = saveNow;
  function saveAs() {
    UI.form('Save as', [{ key: 'n', label: 'New project name', value: App.project.name + ' (copy)' }], v => {
      const name = v.n.trim();
      if (!name) return 'Enter a project name';
      // copy the project under a new id and keep working in the copy; the running PLC and plant are not reset
      App.flushSave();
      const data = App.serialize(), id = Store.newId();
      data.name = name;
      if (!Store.save(id, data)) { UI.toast('Could not save the copy: browser storage is full or blocked.', 'danger', 6000); return; }
      App.currentId = id;
      Store.setCurrent(id);
      App.project.name = name;
      document.querySelector('[data-pname]').textContent = name;
      saveState('saved');
      App.log('system', `Saved as “${name}”`);
      UI.toast(`Saved as “${name}”. The original project is still in File → Open project.`, 'ok', 3500);
    });
  }
  App.saveAs = saveAs;

  /* ---------- boot ---------- */
  function boot() {
    let theme = 'auto';
    try { theme = localStorage.getItem('plc-trainer.theme') || 'auto'; } catch (e) { /* ignore */ }
    Ladder.init(document.getElementById('view-ladder'));
    Workspace.init(document.getElementById('view-wiring'));
    PanelView.init(document.getElementById('view-panel'));
    HMI.init(document.getElementById('view-hmi'));
    bindChrome();
    bindGutters();
    ['.plcbar', '.lad-toolbar', '.ws-toolbar', '.hmi-toolbar'].forEach(q => document.querySelectorAll(q).forEach(UI.scrollCue));
    setTheme(theme);
    Store.migrate();
    const cur = Store.current();
    const saved = cur ? Store.load(cur) : null;
    const first = !saved && !Store.list().length;
    let opened = !!saved && App.openSaved(cur);
    for (const p of Store.list()) { if (opened) break; opened = App.openSaved(p.id); }
    if (!opened) App.openNew(Examples.EX.plcmotor.build());
    let v = 'ladder', lay = null;
    try { v = localStorage.getItem('plc-trainer.view') || (first ? 'learn' : 'ladder'); lay = localStorage.getItem('plc-trainer.layout'); } catch (e) { /* ignore */ }
    if (!VIEWS.includes(v)) v = 'ladder';
    // wide screens start on the Workbench (ladder + wiring + panel) until the user picks something else
    App.layout = layoutOf(lay || (innerWidth >= 1200 ? 'bench' : 'single')).key;
    App.showView(v);
    setInterval(tick, 20);
    requestAnimationFrame(frame);
    Updater.init();
    if (first) UI.toast('Welcome! A PLC motor-control example is loaded. Start with the lessons or press RUN.', 'ok', 6000);
  }
  /* ---------- install as an app (PWA) ---------- */
  let installEvt = null;
  function setupPwa() {
    const btn = document.querySelector('[data-install]');
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; btn.hidden = false; });
    window.addEventListener('appinstalled', () => { btn.hidden = true; installEvt = null; UI.toast('PLC Trainer installed', 'ok'); });
    btn.addEventListener('click', async () => {
      if (!installEvt) return;
      installEvt.prompt();
      await installEvt.userChoice.catch(() => null);
      installEvt = null; btn.hidden = true;
    });
    // service workers need http(s); opening index.html from disk still works, just without offline install
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* blocked in sandboxed previews */ });
    }
  }

  document.addEventListener('DOMContentLoaded', () => { boot(); setupPwa(); });
  // save pending edits when the tab or app is closed or sent to the background
  window.addEventListener('pagehide', () => App.flushSave());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') App.flushSave(); });
})();
