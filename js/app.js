/* App shell: project state, persistence, scan loop, views, status bar, lessons. */
(function () {
  'use strict';
  const esc = UI.esc;
  const KEY = 'plc-trainer.project.v1';
  const VIEWS = ['ladder', 'wiring', 'panel', 'hmi', 'learn'];

  const App = {
    project: null,
    plc: new PLCcore.Engine(),
    ctx: { plcIn: 0, plcInRaw: 0, plcOut: 0, plcPowered: false, plcId: null, mode: 'PROG', forces: false },
    api: null,
    view: 'ladder',
    split: false,
    dirty: { ladder: true, wiring: true, panel: true, hmi: true },
  };
  window.App = App;
  App.ctx.setMode = m => App.setMode(m);

  /* ---------- project ---------- */
  App.loadProject = function (p) {
    const rungs = ((p.ladder && p.ladder.rungs) || []).map(r => {
      try { return Ladder.newRung(Ladder.parseRung(r.text || ''), r.comment || ''); }
      catch (err) { return Ladder.newRung([], `${r.comment || ''} [could not parse: ${r.text}]`); }
    });
    const comps = ((p.circuit && p.circuit.comps) || []).filter(c => Circuit.DEFS[c.type]).map(c => Circuit.normalize(JSON.parse(JSON.stringify(c))));
    const ids = new Set(comps.map(c => c.id));
    const wires = ((p.circuit && p.circuit.wires) || []).filter(w => ids.has(w.a.split(':')[0]) && ids.has(w.b.split(':')[0])).map(w => ({ ...w, pts: w.pts || [] }));
    const maxNum = arr => arr.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0);
    App.project = {
      name: p.name || 'Untitled',
      ladder: { rungs, desc: { ...((p.ladder && p.ladder.desc) || {}) } },
      circuit: { comps, wires, seq: Math.max((p.circuit && p.circuit.seq) || 0, maxNum(comps), maxNum(wires)) },
      hmi: { objects: ((p.hmi && p.hmi.objects) || []).map(o => ({ ...o })), seq: 0 },
    };
    App.project.hmi.seq = Math.max((p.hmi && p.hmi.seq) || 0, maxNum(App.project.hmi.objects));
    const plc = App.plc;
    plc.setMode('PROG');
    plc.resetData();
    Object.keys(plc.forces).forEach(k => plc.setForce(k, null));
    plc.forcesEnabled = true;
    plc.setProgram(rungs);
    plc.applyAll(true);
    Ladder.resetSel(); Workspace.resetView(); HMI.resetSel();
    Object.keys(App.dirty).forEach(k => { App.dirty[k] = true; });
    renderVisible();
    document.querySelector('[data-pname]').textContent = App.project.name;
    App.save();
  };
  App.serialize = function () {
    const p = App.project;
    return {
      version: 1, name: p.name,
      ladder: { rungs: p.ladder.rungs.map(r => ({ comment: r.comment || '', text: Ladder.serialize(r.elems) })), desc: p.ladder.desc },
      circuit: { comps: p.circuit.comps.map(c => ({ id: c.id, type: c.type, x: c.x, y: c.y, props: c.props, state: c.state })), wires: p.circuit.wires, seq: p.circuit.seq },
      hmi: p.hmi,
    };
  };
  let saveT = null;
  App.save = function () {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(App.serialize())); } catch (e) { /* storage unavailable */ } }, 500);
  };
  App.programChanged = function () { App.plc.setProgram(App.project.ladder.rungs); App.save(); };
  App.circuitChanged = function () { App.dirty.panel = true; App.dirty.wiring = true; renderVisible(); App.save(); };
  App.force = function (norm, val) { App.plc.setForce(norm, val); App.forcesChanged(); };
  App.forcesChanged = function () { Ladder.DataTable.render(); updateBar(true); };
  App.setMode = function (m) {
    if (m === 'RUN' && !Ladder.verify(true)) { UI.toast('Program has errors — fix them before going to RUN', 'danger'); Ladder.verify(false); return; }
    App.plc.setMode(m);
    updateBar(true);
  };

  /* ---------- loop ---------- */
  const alertSeen = new Map();
  let last = performance.now();
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
      if (now - t > 4000) { UI.toast(a.msg, a.kind || 'warn', 4200); }
      alertSeen.set(a.msg, now);
    }
    if (r.alerts.length) App.save();
    if (pc) { plc.powered = ctx.plcPowered; plc.physIn = ctx.plcIn; } else { plc.powered = true; plc.physIn = 0; }
    ctx.plcInRaw = ctx.plcIn;
    plc.scan(dt);
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
  function visibleViews() {
    if (!App.split || App.view === 'learn') return [App.view];
    return [App.view, App.view === 'panel' ? 'ladder' : 'panel'];
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
    App.view = v;
    const vis = visibleViews();
    VIEWS.forEach(k => {
      const el = document.getElementById('view-' + k);
      el.classList.toggle('active', vis[0] === k);
      el.classList.toggle('secondary', vis[1] === k);
    });
    document.getElementById('main').classList.toggle('split', vis.length > 1);
    document.querySelectorAll('.tabs [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    vis.forEach(k => renderView(k));
    try { localStorage.setItem('plc-trainer.view', v); } catch (e) { /* ignore */ }
  };

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
    else if (plc.mode === 'PROG') m = 'Program mode — outputs are off. Switch to RUN to execute.';
    msg.textContent = m;
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
        <div class="btn-row">${ex ? `<button class="btn primary" data-load="${cur.ex}">Load “${esc(ex.title)}”</button>` : ''}${cur.solution ? `<button class="btn" data-sol>Insert solution into ladder</button>` : ''}</div>
        <h3 class="mt">Instruction reference</h3>
        <table class="ref"><tr><th>Mnemonic</th><th>Name</th><th>Operands</th><th>What it does</th></tr>${Object.entries(INSTR).map(([k, d]) => `<tr><td><code>${k}</code></td><td>${esc(d.name)}</td><td>${d.args.map(a => esc(a.n)).join(', ')}</td><td>${esc(d.help)}</td></tr>`).join('')}</table>
        <h3 class="mt">Addressing (SLC 500 / MicroLogix style)</h3>
        <table class="ref"><tr><th>Address</th><th>Meaning</th></tr>
          <tr><td><code>I:0/0 … I:0/11</code></td><td>Physical inputs (input image)</td></tr>
          <tr><td><code>O:0/0 … O:0/7</code></td><td>Physical relay outputs</td></tr>
          <tr><td><code>B3:0/0</code> or <code>B3/0</code></td><td>Internal bits (word 0, bit 0). <code>B3/17</code> = <code>B3:1/1</code></td></tr>
          <tr><td><code>T4:0</code> · <code>T4:0/DN</code> · <code>T4:0.ACC</code></td><td>Timer structure · done bit (EN, TT, DN) · word (PRE, ACC)</td></tr>
          <tr><td><code>C5:0</code> · <code>C5:0/DN</code> · <code>C5:0.PRE</code></td><td>Counter structure · bits (CU, CD, DN, OV, UN) · words (PRE, ACC)</td></tr>
          <tr><td><code>N7:0</code></td><td>16-bit signed integer</td></tr>
          <tr><td><code>S:1/15</code></td><td>First-scan bit</td></tr></table>
        <h3 class="mt">Keyboard</h3>
        <table class="ref"><tr><td><kbd>Del</kbd></td><td>Delete selected instruction / rung / wire / device</td></tr><tr><td><kbd>Enter</kbd></td><td>Edit selected instruction</td></tr><tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd></td><td>Undo / redo (ladder)</td></tr><tr><td><kbd>Ctrl</kbd>+<kbd>R</kbd></td><td>New rung</td></tr><tr><td><kbd>Esc</kbd></td><td>Cancel wire / clear selection</td></tr><tr><td><kbd>M</kbd></td><td>Multimeter (Wiring)</td></tr></table>
      </article></div>`;
    el.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.lesson) { lessonId = b.dataset.lesson; renderLearn(); el.querySelector('.learn-body').scrollTop = 0; }
      if (b.dataset.load) loadExample(b.dataset.load);
      if (b.dataset.ex) loadExample(b.dataset.ex);
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
    UI.confirm('Load example', `Load “${ex.title}”? Your current project will be replaced (export it first if you want to keep it).`, () => {
      App.loadProject(ex.build());
      UI.toast(`Loaded: ${ex.title}`, 'ok');
      App.showView(k === 'blank' ? 'wiring' : App.view === 'learn' ? 'wiring' : App.view);
    }, 'Load');
  }
  App.loadExample = loadExample;

  /* ---------- top bar ---------- */
  function bindChrome() {
    document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) App.showView(b.dataset.view); });
    document.querySelector('.plcbar').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mode) App.setMode(b.dataset.mode);
      if (b.hasAttribute('data-forces')) { App.plc.forcesEnabled = !App.plc.forcesEnabled; App.forcesChanged(); }
      if (b.hasAttribute('data-split')) { App.split = !App.split; b.classList.toggle('on', App.split); App.showView(App.view); }
    });
    document.querySelector('[data-examples]').addEventListener('click', e => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu(r.left, r.bottom + 4, [{ head: 'Load example' }, ...Object.entries(Examples.EX).map(([k, x]) => ({ label: x.title, onClick: () => loadExample(k) }))]);
    });
    document.querySelector('[data-file]').addEventListener('click', e => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu(r.left, r.bottom + 4, [
        { label: 'Rename project…', onClick: rename },
        { label: 'Export project (.json)', onClick: exportProject },
        { label: 'Import project…', onClick: () => document.getElementById('importFile').click() },
        { sep: true },
        { label: 'Reset PLC data table', onClick: () => { App.plc.resetData(); App.plc.applyAll(true); UI.toast('Data table cleared'); } },
        { label: 'New empty project', danger: true, onClick: () => loadExample('blank') },
      ]);
    });
    document.getElementById('importFile').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { App.loadProject(JSON.parse(t)); UI.toast('Project imported', 'ok'); }).catch(err => UI.toast('Import failed: ' + err.message, 'danger'));
      e.target.value = '';
    });
    document.querySelector('[data-theme-btn]').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || 'auto';
      const next = cur === 'auto' ? 'dark' : cur === 'dark' ? 'light' : 'auto';
      setTheme(next);
    });
    document.querySelector('[data-pname]').addEventListener('dblclick', rename);
    document.addEventListener('keydown', e => {
      if (UI.isTyping() || document.querySelector('.modal-wrap')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); exportProject(); return; }
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
  function rename() {
    UI.form('Rename project', [{ key: 'n', label: 'Project name', value: App.project.name }], v => {
      App.project.name = v.n.trim() || 'Untitled';
      document.querySelector('[data-pname]').textContent = App.project.name;
      App.save();
    });
  }
  function exportProject() {
    const blob = new Blob([JSON.stringify(App.serialize(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (App.project.name || 'project').replace(/[^\w-]+/g, '_') + '.plc.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- boot ---------- */
  function boot() {
    let theme = 'auto';
    try { theme = localStorage.getItem('plc-trainer.theme') || 'auto'; } catch (e) { /* ignore */ }
    Ladder.init(document.getElementById('view-ladder'));
    Workspace.init(document.getElementById('view-wiring'));
    PanelView.init(document.getElementById('view-panel'));
    HMI.init(document.getElementById('view-hmi'));
    bindChrome();
    setTheme(theme);
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    const first = !saved;
    App.loadProject(saved || Examples.EX.plcmotor.build());
    let v = 'ladder';
    try { v = localStorage.getItem('plc-trainer.view') || (first ? 'learn' : 'ladder'); } catch (e) { /* ignore */ }
    if (!VIEWS.includes(v)) v = 'ladder';
    App.showView(v);
    setInterval(tick, 20);
    requestAnimationFrame(frame);
    if (first) UI.toast('Welcome! A PLC motor-control example is loaded. Start with the lessons or press RUN.', 'ok', 6000);
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
