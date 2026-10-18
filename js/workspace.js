/* Wiring workspace: palette, canvas with pan/zoom, drag components, draw wires terminal-to-terminal,
   live voltage overlay, multimeter, properties panel. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const esc = UI.esc;
  const { DEFS } = Circuit;
  const WS = {};
  let root, svg, gView, gWires, gComps, gOver, propsEl, meterEl, tipEl, bannerEl;
  let view = { x: 40, y: 30, k: 0.9 };
  let sel = null;            // {kind:'comp'|'wire', id}
  let wiring = null;         // {from, pts:[[x,y]], cur:[x,y]}
  let drag = null;
  let tool = 'select';
  let probes = { a: null, b: null, next: 'a' };
  let wireColor = 'auto';
  let showLive = true;
  const compEls = new Map();
  let wireEls = [];
  let palDrawer = null;
  const touches = new Map();   // active touch points, for pinch zoom
  let pinch = null;

  const circ = () => App.project.circuit;
  const byId = id => circ().comps.find(c => c.id === id);
  const snap = v => Math.round(v / 10) * 10;
  const WIRE_COLORS = [
    ['auto', 'Auto (by potential)', 'conic-gradient(#8B4513 0 25%,#1d1d1d 0 50%,#2f6fd6 0 75%,#d33a2c 0)'],
    ['#1d1d1d', 'Black'], ['#8B4513', 'Brown'], ['#8a8f96', 'Gray'], ['#2f6fd6', 'Blue'], ['#d33a2c', 'Red'], ['#58a83a', 'Green/Yellow'], ['#e8e4da', 'White'], ['#f39c1e', 'Orange'],
  ];

  function tpos(key) {
    const [cid, tid] = key.split(':');
    const c = byId(cid); if (!c) return null;
    const d = DEFS[c.type];
    const t = d.terms.find(t => t.id === tid); if (!t) return null;
    return { x: c.x + t.x, y: c.y + t.y, dir: t.y === 0 ? -1 : 1 };
  }
  function route(a, pts, b) {
    const P = [[a.x, a.y]];
    const ea = [a.x, a.y + a.dir * 12];
    P.push(ea);
    let cur = ea;
    for (const p of pts) { P.push([cur[0], p[1]]); P.push(p); cur = p; }
    if (!b) return P;
    const eb = [b.x, b.y + b.dir * 12];
    if (!pts.length) {
      let ym;
      if (a.dir === b.dir) ym = a.dir < 0 ? Math.min(ea[1], eb[1]) : Math.max(ea[1], eb[1]);
      else ym = (ea[1] + eb[1]) / 2;
      P.push([ea[0], ym], [eb[0], ym]);
    } else P.push([eb[0], cur[1]]);
    P.push(eb, [b.x, b.y]);
    return P;
  }
  const pathD = P => 'M' + P.map(p => p[0] + ' ' + p[1]).join(' L');

  function toWorld(ev) {
    const r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k };
  }
  function applyView() { gView.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`); root.querySelector('[data-z]').textContent = Math.round(view.k * 100) + '%'; }

  /* ---------- init ---------- */
  WS.init = function (el) {
    root = el;
    el.innerHTML = `
      <div class="ws">
        <aside class="ws-palette">
          <input class="ws-search" type="search" placeholder="Search components…">
          <div class="pal-list"></div>
        </aside>
        <div class="ws-center">
          <div class="ws-toolbar">
            <button class="tbtn mobile-only" data-drawer="pal">＋ Parts</button>
            <div class="seg"><button class="on" data-tool="select" title="Select / move / operate (S)">✥ Select</button><button data-tool="meter" title="Multimeter: click two terminals (M)">⎓ Meter</button></div>
            <span class="tb-lbl">Wire</span>
            <div class="swatches">${WIRE_COLORS.map(([v, n, bg]) => `<button class="sw${v === wireColor ? ' on' : ''}" data-wc="${v}" title="${n}" style="background:${bg || v}"></button>`).join('')}</div>
            <label class="chk"><input type="checkbox" data-live checked> Live voltage</label>
            <span class="spacer"></span>
            <button class="tbtn" data-zoom="-1" title="Zoom out">−</button><span class="zoomv" data-z>100%</span><button class="tbtn" data-zoom="1" title="Zoom in">＋</button>
            <button class="tbtn" data-fit title="Fit all">⤢ Fit</button>
            <button class="tbtn mobile-only" data-drawer="props">⚙ Props</button>
          </div>
          <div class="ws-canvas">
            <svg class="ws-svg">
              <defs><pattern id="wsGrid" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="0.5" cy="0.5" r="0.7" class="gridDot"/></pattern>
              <pattern id="wsGrid2" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#wsGrid)"/><path d="M100 0 H0 V100" fill="none" class="gridLine"/></pattern></defs>
              <g class="vp"><rect class="bg" x="-6000" y="-6000" width="12000" height="12000" fill="url(#wsGrid2)"/><g class="wires"></g><g class="comps"></g><g class="over"></g></g>
            </svg>
            <div class="ws-banner"></div>
            <div class="meter-read hidden"></div>
            <div class="ws-tip hidden"></div>
            <div class="ws-hint">Click a terminal ● to start a wire, click empty canvas to add bends, click another terminal to finish. <b>Esc</b> cancels. Drag empty space to pan, scroll to zoom. Click buttons, switches & breakers to operate them.</div>
          </div>
        </div>
        <aside class="ws-props"></aside>
      </div>`;
    svg = el.querySelector('.ws-svg');
    gView = svg.querySelector(".vp");
    gWires = svg.querySelector('.wires'); gComps = svg.querySelector('.comps'); gOver = svg.querySelector('.over');
    propsEl = el.querySelector('.ws-props'); meterEl = el.querySelector('.meter-read'); tipEl = el.querySelector('.ws-tip'); bannerEl = el.querySelector('.ws-banner');
    palDrawer = UI.drawer(el.querySelector('[data-drawer="pal"]'), el.querySelector('.ws-palette'));
    UI.drawer(el.querySelector('[data-drawer="props"]'), propsEl);
    UI.longPress(svg);
    buildPalette('');
    el.querySelector('.ws-search').addEventListener('input', e => buildPalette(e.target.value));
    el.querySelector('.ws-toolbar').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) setTool(b.dataset.tool);
      if (b.dataset.wc) { wireColor = b.dataset.wc; el.querySelectorAll('.sw').forEach(s => s.classList.toggle('on', s === b)); if (sel && sel.kind === 'wire' && wireColor !== 'auto') { const w = circ().wires.find(w => w.id === sel.id); if (w) { w.color = wireColor; renderWires(); App.save(); } } }
      if (b.dataset.zoom) zoomAt(Number(b.dataset.zoom) > 0 ? 1.2 : 1 / 1.2);
      if (b.hasAttribute('data-fit')) WS.fit();
    });
    el.querySelector('[data-live]').addEventListener('change', e => { showLive = e.target.checked; wireEls.forEach(w => { w.cls = null; }); });
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e); }, { passive: false });
    svg.addEventListener('contextmenu', onCtx);
    svg.addEventListener('dblclick', e => { const ce = e.target.closest('.comp'); if (ce && !e.target.closest('[data-part]')) { select({ kind: 'comp', id: ce.dataset.cid }); const i = propsEl.querySelector('input'); if (i) i.focus(); } });
    const canvas = el.querySelector('.ws-canvas');
    canvas.addEventListener('dragover', e => e.preventDefault());
    canvas.addEventListener('drop', e => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/plc-comp'); if (!type) return;
      const p = toWorld(e), d = DEFS[type];
      addComp(type, p.x - d.w / 2, p.y - d.h / 2);
    });
    applyView();
  };

  function buildPalette(q) {
    q = q.trim().toLowerCase();
    const cats = {};
    Circuit.ORDER.forEach(t => { const d = DEFS[t]; if (q && !(d.name.toLowerCase().includes(q) || d.cat.toLowerCase().includes(q))) return; (cats[d.cat] = cats[d.cat] || []).push(t); });
    const list = root.querySelector('.pal-list');
    list.innerHTML = Object.entries(cats).map(([cat, types]) => `<div class="pal-cat"><h5>${cat}</h5><div class="pal-grid">${types.map(t => {
      const d = DEFS[t];
      const sample = { id: 'pal', type: t, x: 0, y: 0, props: { label: d.prefix, ...d.props }, state: d.init ? d.init() : {} };
      const pad = 8;
      return `<button class="pal-item" draggable="true" data-type="${t}" title="${esc(d.name)} — ${esc(d.info || '')}"><svg viewBox="${-pad} ${-pad} ${d.w + pad * 2} ${d.h + pad * 2}">${Circuit.draw(sample, null)}${Circuit.drawTerms(d)}</svg><span>${esc(d.name)}</span></button>`;
    }).join('')}</div></div>`).join('') || '<p class="help">No match.</p>';
    list.querySelectorAll('.pal-item').forEach(b => {
      b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plc-comp', b.dataset.type); e.dataTransfer.effectAllowed = 'copy'; });
      b.addEventListener('click', () => {
        const r = svg.getBoundingClientRect(), d = DEFS[b.dataset.type];
        const n = circ().comps.length % 6;
        addComp(b.dataset.type, (r.width / 2 - view.x) / view.k - d.w / 2 + n * 20, (r.height / 2 - view.y) / view.k - d.h / 2 + n * 20);
        if (palDrawer) palDrawer.close();
      });
    });
  }

  function addComp(type, x, y) {
    const d = DEFS[type];
    if (d.unique && circ().comps.some(c => c.type === type)) { UI.toast('Only one PLC is supported in a project', 'warn'); return; }
    const c = Circuit.create(type, x, y, circ());
    circ().comps.push(c);
    select({ kind: 'comp', id: c.id });
    App.circuitChanged();
  }

  function setTool(t) {
    tool = t;
    root.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    wiring = null; renderTemp();
    if (t !== 'meter') { probes = { a: null, b: null, next: 'a' }; meterEl.classList.add('hidden'); }
    else { meterEl.classList.remove('hidden'); updateMeter(); }
    svg.classList.toggle('meter-mode', t === 'meter');
  }

  function zoomAt(f, ev) {
    const r = svg.getBoundingClientRect();
    const cx = ev ? ev.clientX - r.left : r.width / 2, cy = ev ? ev.clientY - r.top : r.height / 2;
    const k = Math.max(0.25, Math.min(3, view.k * f));
    view.x = cx - (cx - view.x) * k / view.k; view.y = cy - (cy - view.y) * k / view.k; view.k = k;
    applyView();
  }
  WS.fit = function () {
    const cs = circ().comps;
    if (!cs.length || !svg.clientWidth) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    cs.forEach(c => { const d = DEFS[c.type]; x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y - 16); x1 = Math.max(x1, c.x + d.w); y1 = Math.max(y1, c.y + d.h); });
    circ().wires.forEach(w => (w.pts || []).forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }));
    const W = svg.clientWidth, H = svg.clientHeight, pad = 40;
    const k = Math.max(0.25, Math.min(1.4, Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2) / (y1 - y0))));
    view.k = k; view.x = (W - (x1 - x0) * k) / 2 - x0 * k; view.y = (H - (y1 - y0) * k) / 2 - y0 * k;
    applyView();
  };

  /* ---------- pointer handling ---------- */
  function startPinch() {
    const [a, b] = [...touches.values()];
    const r = svg.getBoundingClientRect();
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: view.k, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, vx: view.x, vy: view.y };
  }
  function onDown(e) {
    UI.closeMenu();
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size >= 2) {
        // a second finger turns any drag into a pinch zoom
        if (drag && drag.kind === 'part') drag.rel();
        drag = null; svg.classList.remove('panning');
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        startPinch();
        return;
      }
    }
    if (e.button === 2) return;
    if (e.button === 1) { startPan(e); return; }
    const pt = toWorld(e);
    const compEl = e.target.closest('.comp'), termEl = e.target.closest('.term'), partEl = e.target.closest('[data-part]'), wireEl = e.target.closest('.wire');
    if (termEl && compEl) {
      const key = compEl.dataset.cid + ':' + termEl.dataset.term;
      if (tool === 'meter') { probes[probes.next] = key; probes.next = probes.next === 'a' ? 'b' : 'a'; renderTemp(); updateMeter(); return; }
      onTerm(key, pt); return;
    }
    if (partEl && compEl && !wiring) {
      const c = byId(compEl.dataset.cid);
      if (c) {
        const part = partEl.dataset.part;
        Circuit.part(c, part, 'down', App.ctx);
        drag = { kind: 'part', rel: App.hold(c.id + ':' + part, () => { Circuit.part(c, part, 'up', App.ctx); App.save(); }) };
        svg.setPointerCapture(e.pointerId); App.save();
      }
      return;
    }
    if (wiring) { wiring.pts.push([snap(pt.x), snap(pt.y)]); renderTemp(); return; }
    if (compEl) {
      const c = byId(compEl.dataset.cid);
      select({ kind: 'comp', id: c.id });
      drag = { kind: 'comp', c, ox: pt.x - c.x, oy: pt.y - c.y, moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (wireEl) { select({ kind: 'wire', id: wireEl.dataset.wid }); return; }
    select(null);
    startPan(e);
  }
  function startPan(e) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; svg.setPointerCapture(e.pointerId); svg.classList.add('panning'); }
  function onMove(e) {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size >= 2) {
        const [a, b] = [...touches.values()];
        const r = svg.getBoundingClientRect();
        const k = Math.max(0.25, Math.min(3, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
        const wx = (pinch.mx - pinch.vx) / pinch.k, wy = (pinch.my - pinch.vy) / pinch.k;
        view.k = k; view.x = (a.x + b.x) / 2 - r.left - wx * k; view.y = (a.y + b.y) / 2 - r.top - wy * k;
        applyView();
        return;
      }
    }
    const pt = toWorld(e);
    if (wiring) { wiring.cur = [pt.x, pt.y]; renderTemp(); }
    if (drag) {
      if (drag.kind === 'pan') { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; applyView(); }
      else if (drag.kind === 'comp') {
        const nx = snap(pt.x - drag.ox), ny = snap(pt.y - drag.oy);
        if (nx !== drag.c.x || ny !== drag.c.y) { drag.c.x = nx; drag.c.y = ny; drag.moved = true; renderWires(); renderTemp(); }
      }
      return;
    }
    const termEl = e.target.closest && e.target.closest('.term'), compEl = e.target.closest && e.target.closest('.comp');
    if (termEl && compEl) showTip(e, compEl.dataset.cid + ':' + termEl.dataset.term); else tipEl.classList.add('hidden');
  }
  function onUp(e) {
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId);
      if (pinch) { if (touches.size < 2) { pinch = null; drag = null; } return; }
    }
    if (!drag) return;
    if (drag.kind === 'part') drag.rel();
    if (drag.kind === 'comp' && drag.moved) App.save();
    svg.classList.remove('panning');
    try { svg.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    drag = null;
  }
  function onTerm(key) {
    if (!wiring) { wiring = { from: key, pts: [], cur: null }; select(null); renderTemp(); return; }
    if (key === wiring.from) { wiring = null; renderTemp(); return; }
    const exists = circ().wires.some(w => (w.a === wiring.from && w.b === key) || (w.b === wiring.from && w.a === key));
    if (exists) { UI.toast('These terminals are already wired'); wiring = null; renderTemp(); return; }
    let color = wireColor;
    if (color === 'auto') {
      const api = App.api;
      const pc = api ? (Circuit.potClass(api.potsR(api.rootK(wiring.from))) || Circuit.potClass(api.potsR(api.rootK(key)))) : '';
      color = pc ? Circuit.POT_COLORS[pc] : guessColor(wiring.from, key);
    }
    circ().seq = (circ().seq || 0) + 1;
    const w = { id: 'w' + circ().seq, a: wiring.from, b: key, pts: wiring.pts, color };
    circ().wires.push(w);
    wiring = null;
    renderTemp();
    App.circuitChanged();
  }
  function guessColor(a, b) {
    const t = (a + ' ' + b).toUpperCase();
    if (/:(L1|U1)\b/.test(t)) return '#8B4513';
    if (/:(N|M1|M2|C24|COM|BU)\b/.test(t)) return '#2f6fd6';
    if (/:PE\b/.test(t)) return '#58a83a';
    if (/:(P1|P2|V24|BN)\b/.test(t)) return '#d33a2c';
    return '#1d1d1d';
  }

  function onCtx(e) {
    e.preventDefault();
    if (wiring) { wiring = null; renderTemp(); return; }
    const compEl = e.target.closest('.comp'), wireEl = e.target.closest('.wire');
    if (compEl) {
      const c = byId(compEl.dataset.cid); select({ kind: 'comp', id: c.id });
      const d = DEFS[c.type];
      UI.menu(e.clientX, e.clientY, [
        { head: `${c.props.label} · ${d.name}` },
        { label: 'Duplicate', onClick: () => duplicate(c) },
        { label: 'Repair / replace device', onClick: () => { Circuit.repair(c); App.save(); }, disabled: !c.state.burnt && !(c.state.tripped && !d.breaker) },
        { label: 'Remove all wires on this device', onClick: () => { circ().wires = circ().wires.filter(w => !w.a.startsWith(c.id + ':') && !w.b.startsWith(c.id + ':')); App.circuitChanged(); } },
        { label: 'Delete', danger: true, onClick: () => delSel() },
      ]);
    } else if (wireEl) {
      select({ kind: 'wire', id: wireEl.dataset.wid });
      UI.menu(e.clientX, e.clientY, [{ label: 'Straighten (remove bends)', onClick: () => { const w = circ().wires.find(w => w.id === sel.id); if (w) { w.pts = []; App.circuitChanged(); } } }, { label: 'Delete wire', danger: true, onClick: () => delSel() }]);
    }
  }
  function duplicate(c) {
    const n = Circuit.create(c.type, c.x + 30, c.y + 30, circ());
    n.props = { ...JSON.parse(JSON.stringify(c.props)), label: n.props.label };
    if (DEFS[c.type].unique) { UI.toast('Only one PLC is supported', 'warn'); return; }
    circ().comps.push(n); select({ kind: 'comp', id: n.id }); App.circuitChanged();
  }
  function delSel() {
    if (!sel) return;
    if (sel.kind === 'comp') {
      const id = sel.id;
      circ().comps = circ().comps.filter(c => c.id !== id);
      circ().wires = circ().wires.filter(w => !w.a.startsWith(id + ':') && !w.b.startsWith(id + ':'));
    } else circ().wires = circ().wires.filter(w => w.id !== sel.id);
    sel = null;
    App.circuitChanged();
  }
  WS.onKey = function (e) {
    if (e.key === 'Escape') { wiring = null; renderTemp(); select(null); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delSel(); }
    else if (e.key === 'm' || e.key === 'M') setTool(tool === 'meter' ? 'select' : 'meter');
    else if (e.key === 's' || e.key === 'S') setTool('select');
    else if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey) && sel && sel.kind === 'comp') { e.preventDefault(); duplicate(byId(sel.id)); }
  };

  function select(s) {
    sel = s;
    compEls.forEach((e, id) => e.g.classList.toggle('sel', !!(s && s.kind === 'comp' && s.id === id)));
    wireEls.forEach(w => w.g.classList.toggle('sel', !!(s && s.kind === 'wire' && s.id === w.id)));
    renderProps();
  }

  /* ---------- rendering ---------- */
  WS.render = function () {
    if (!gComps) return;
    const ids = new Set(circ().comps.map(c => c.id));
    compEls.forEach((e, id) => { if (!ids.has(id)) { e.g.remove(); compEls.delete(id); } });
    if (sel && sel.kind === 'comp' && !ids.has(sel.id)) sel = null;
    if (sel && sel.kind === 'wire' && !circ().wires.some(w => w.id === sel.id)) sel = null;
    renderWires();
    WS.update();
    renderProps();
    renderTemp();
  };
  function renderWires() {
    const h = [];
    circ().wires.forEach(w => {
      const a = tpos(w.a), b = tpos(w.b);
      if (!a || !b) return;
      const d = pathD(route(a, w.pts || [], b));
      const wc = esc(w.color || '#1d1d1d');
      // .wo is a thin outline under the wire so black wires show on dark backgrounds (and white ones on light)
      h.push(`<g class="wire${sel && sel.kind === 'wire' && sel.id === w.id ? ' sel' : ''}" data-wid="${esc(w.id)}"><path class="wh" d="${d}"/><path class="wo" d="${d}"/><path class="wb" d="${d}" stroke="${wc}"/><path class="wl" d="${d}"/><circle class="wdot" cx="${a.x}" cy="${a.y}" r="2.6" fill="${wc}"/><circle class="wdot" cx="${b.x}" cy="${b.y}" r="2.6" fill="${wc}"/></g>`);
    });
    gWires.innerHTML = h.join('');
    wireEls = [...gWires.querySelectorAll('.wire')].map(g => ({ g, id: g.dataset.wid, l: g.querySelector('.wl'), w: circ().wires.find(w => w.id === g.dataset.wid), cls: null }));
  }
  function renderTemp() {
    const h = [];
    if (wiring) {
      const a = tpos(wiring.from);
      if (a) {
        const P = route(a, wiring.pts, null);
        if (wiring.cur) { const last = P[P.length - 1]; P.push([last[0], wiring.cur[1]], wiring.cur); }
        h.push(`<path class="wtemp" d="${pathD(P)}"/><circle class="tsel" cx="${a.x}" cy="${a.y}" r="7"/>`);
      }
    }
    ['a', 'b'].forEach(k => {
      if (!probes[k]) return;
      const p = tpos(probes[k]); if (!p) return;
      h.push(`<g class="probe ${k}"><circle cx="${p.x}" cy="${p.y}" r="8"/><text x="${p.x}" y="${p.y - 12}">${k === 'a' ? 'V+' : 'COM'}</text></g>`);
    });
    gOver.innerHTML = h.join('');
  }

  WS.update = function () {
    if (!gComps) return;
    const ctx = App.ctx;
    for (const c of circ().comps) {
      let e = compEls.get(c.id);
      if (!e) {
        const g = document.createElementNS(NS, 'g');
        g.classList.add('comp'); g.dataset.cid = c.id;
        gComps.appendChild(g);
        e = { g, sig: null, tr: null };
        compEls.set(c.id, e);
        if (sel && sel.kind === 'comp' && sel.id === c.id) g.classList.add('sel');
      }
      const tr = `translate(${c.x} ${c.y})`;
      if (tr !== e.tr) { e.g.setAttribute('transform', tr); e.tr = tr; }
      const s = Circuit.sig(c, ctx);
      if (s !== e.sig) {
        const d = DEFS[c.type];
        e.g.innerHTML = `<rect class="frame" x="-5" y="-18" width="${d.w + 10}" height="${d.h + 23}" rx="8"/><text class="clabel" x="0" y="-6">${esc(c.props.label)}</text>` + Circuit.draw(c, ctx) + Circuit.drawTerms(d);
        e.sig = s;
      }
    }
    const api = App.api;
    if (api) {
      for (const w of wireEls) {
        let cls = '';
        if (showLive) {
          const r = api.rootK(w.w.a);
          if (api.net.short.has(r)) cls = 'short';
          else { const pc = Circuit.potClass(api.potsR(r)); if (pc) cls = 'live p-' + pc.replace('+', 'p').replace('-', 'm'); }
        }
        if (cls !== w.cls) { w.cls = cls; w.l.setAttribute('class', 'wl ' + cls); }
      }
      const sh = api.net.short.size ? [...api.net.short.values()][0] : '';
      const msg = sh ? `⚠ ${sh} with no breaker to clear it — circuit is dead. Fix the wiring.` : '';
      if (bannerEl.textContent !== msg) { bannerEl.textContent = msg; bannerEl.classList.toggle('show', !!msg); }
    }
    if (tool === 'meter') updateMeter();
    if (sel && sel.kind === 'comp') {
      const st = propsEl.querySelector('[data-status]');
      if (st) { const c = byId(sel.id); if (c) { const t = Circuit.status(c, ctx); if (st.textContent !== t) st.textContent = t; } }
    }
  };

  function keyLabel(k) {
    const [cid, tid] = k.split(':'); const c = byId(cid); if (!c) return k;
    const t = DEFS[c.type].terms.find(t => t.id === tid);
    return `${c.props.label}:${t ? t.l : tid}`;
  }
  function updateMeter() {
    const api = App.api;
    let html = '<b>Multimeter</b> ';
    if (!probes.a || !probes.b) html += `<span>Click two terminals (${probes.a ? 'COM' : 'V+'} probe next)</span>`;
    else {
      const v = api ? api.vK(probes.a, probes.b) : null;
      const same = api && api.sameNet(probes.a, probes.b);
      const val = v ? `${v.v} V ${v.kind}` : '0 V';
      html += `<span class="mval${v ? ' live' : ''}">${val}</span><small>${esc(keyLabel(probes.a))} → ${esc(keyLabel(probes.b))}${same ? ' · same node (continuity ✓)' : ''}</small>`;
    }
    html += `<button class="tbtn sm" data-mclr>Clear</button>`;
    if (meterEl.innerHTML !== html) {
      meterEl.innerHTML = html;
      const b = meterEl.querySelector('[data-mclr]');
      if (b) b.onclick = () => { probes = { a: null, b: null, next: 'a' }; renderTemp(); updateMeter(); };
    }
  }
  function showTip(e, key) {
    const api = App.api;
    const pots = api ? api.potsR(api.rootK(key)) : new Set();
    const cnt = circ().wires.filter(w => w.a === key || w.b === key).length;
    tipEl.innerHTML = `<b>${esc(keyLabel(key))}</b><br>${pots.size ? 'Potential: ' + esc(Circuit.potText(pots)) : 'No voltage'}<br><small>${cnt} wire(s)</small>`;
    const r = svg.getBoundingClientRect();
    tipEl.style.left = (e.clientX - r.left + 14) + 'px'; tipEl.style.top = (e.clientY - r.top + 14) + 'px';
    tipEl.classList.remove('hidden');
  }

  function renderProps() {
    if (!propsEl) return;
    if (sel && sel.kind === 'comp') {
      const c = byId(sel.id); if (!c) { propsEl.innerHTML = ''; return; }
      const d = DEFS[c.type];
      const fields = [{ k: 'label', n: 'Tag / label' }, ...(d.pdefs || [])];
      propsEl.innerHTML = `<div class="side-head"><h4>${esc(d.name)}</h4></div>
        <div class="props">${fields.map(f => `<label class="field"><span>${esc(f.n)}</span>${f.opts ? `<select data-pk="${f.k}">${f.opts.map(o => `<option ${String(c.props[f.k]) === o ? 'selected' : ''}>${o}</option>`).join('')}</select>` : `<input data-pk="${f.k}" type="${f.type || 'text'}" value="${esc(c.props[f.k] ?? '')}">`}</label>`).join('')}
        <div class="status-box"><small>Status</small><div data-status>${esc(Circuit.status(c, App.ctx))}</div></div>
        <p class="help">${esc(d.info || '')}</p>
        <div class="btn-row"><button class="btn" data-dup>Duplicate</button><button class="btn" data-rep ${c.state.burnt ? '' : 'disabled'}>Repair</button><button class="btn danger" data-del>Delete</button></div></div>`;
      propsEl.querySelectorAll('[data-pk]').forEach(i => i.addEventListener('change', () => {
        const k = i.dataset.pk;
        c.props[k] = i.type === 'number' ? Number(i.value) : i.value;
        App.save();
      }));
      propsEl.querySelector('[data-del]').onclick = delSel;
      propsEl.querySelector('[data-dup]').onclick = () => duplicate(c);
      propsEl.querySelector('[data-rep]').onclick = () => { Circuit.repair(c); renderProps(); App.save(); };
    } else if (sel && sel.kind === 'wire') {
      const w = circ().wires.find(w => w.id === sel.id); if (!w) return;
      propsEl.innerHTML = `<div class="side-head"><h4>Wire</h4></div><div class="props">
        <p><code>${esc(keyLabel(w.a))}</code> → <code>${esc(keyLabel(w.b))}</code></p>
        <div class="swatches big">${WIRE_COLORS.slice(1).map(([v, n]) => `<button class="sw${w.color === v ? ' on' : ''}" data-c="${v}" title="${n}" style="background:${v}"></button>`).join('')}</div>
        <div class="btn-row"><button class="btn" data-str>Straighten</button><button class="btn danger" data-del>Delete</button></div></div>`;
      propsEl.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { w.color = b.dataset.c; renderWires(); renderProps(); App.save(); });
      propsEl.querySelector('[data-del]').onclick = delSel;
      propsEl.querySelector('[data-str]').onclick = () => { w.pts = []; App.circuitChanged(); };
    } else {
      const n = circ().comps.length, m = circ().wires.length;
      propsEl.innerHTML = `<div class="side-head"><h4>Workspace</h4></div><div class="props">
        <p class="help">${n} components · ${m} wires</p>
        <h5>Live voltage colors</h5>
        <ul class="legend">${[['L1', 'Phase L1'], ['L2', 'Phase L2'], ['L3', 'Phase L3'], ['N', 'Neutral'], ['PE', 'Earth'], ['DC+', '+24 V DC'], ['DC-', '0 V DC']].map(([k, n]) => `<li><i style="background:${Circuit.POT_COLORS[k]}"></i>${n}</li>`).join('')}<li><i class="shortc"></i>Dead short</li></ul>
        <h5>Tips</h5>
        <ul class="tips"><li>Power circuit: supply → breaker → contactor main poles → overload → motor.</li>
        <li>Control circuit: PLC 24 V out → push buttons → PLC inputs. PLC relay outputs switch the contactor coil.</li>
        <li>Hover a terminal to see its potential. Use the <b>Meter</b> to measure voltage between two points.</li>
        <li>Right-click a device to duplicate, repair or delete it.</li>
        <li>Shorts trip the nearest breaker; wrong coil voltage burns coils.</li></ul></div>`;
    }
  }

  WS.onShow = function () { if (!WS._fitted) { WS._fitted = true; requestAnimationFrame(() => WS.fit()); } };
  WS.refit = () => { WS._fitted = false; };
  WS.resetView = function () { WS._fitted = false; sel = null; wiring = null; probes = { a: null, b: null, next: 'a' }; compEls.forEach(e => e.g.remove()); compEls.clear(); };
  window.Workspace = WS;
})();
