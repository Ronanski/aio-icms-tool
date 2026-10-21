/* Wiring workspace: palette, canvas with pan/zoom, drag components, draw wires terminal-to-terminal,
   live voltage overlay, multimeter, properties panel. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const esc = UI.esc;
  const { DEFS } = Circuit;
  const WS = {};
  let root, svg, gView, gBacks, gRails, gWires, gComps, gOver, propsEl, meterEl, tipEl, bannerEl;
  let view = { x: 40, y: 30, k: 0.9 };
  let sel = null;            // {kind:'comp'|'wire', id}
  let wiring = null;         // {from, pts:[[x,y]], cur:[x,y]}
  let drag = null;
  let tool = 'select';
  let probes = { a: null, b: null, next: 'a' };
  let wireColor = 'auto';
  let showLive = true;
  let showTags = (() => { try { return localStorage.getItem('plc-trainer.wiretags') !== '0'; } catch (e) { return true; } })();
  const compEls = new Map();
  let wireEls = [];
  let palDrawer = null;
  const touches = new Map();   // active touch points, for pinch zoom
  let pinch = null;

  const circ = () => App.project.circuit;
  const SIZES = ['0.5', '0.75', '1', '1.25', '1.5', '2'];
  const byId = id => circ().comps.find(c => c.id === id);
  const snap = v => Math.round(v / 10) * 10;
  const WIRE_COLORS = [
    ['auto', 'Auto (by conductor)', 'conic-gradient(#b3261e 0 25%,#f2c230 0 50%,#2b6fe0 0 75%,#f4f4f0 0)'],
    ['#b3261e', 'Red (L1)'], ['#f2c230', 'Yellow (L2)'], ['#2b6fe0', 'Blue (L3)'], ['#f4f4f0', 'White (N)'], ['#58a83a', 'Green (PE)'], ['#1d1d1d', 'Black (control)'], ['#d33a2c', 'Red (+24 V)'], ['#1f4fa8', 'Dark blue (0 V)'], ['#f39c1e', 'Orange'],
  ];

  function tpos(key) {
    const [cid, tid] = key.split(':');
    const c = byId(cid); if (!c) return null;
    const d = DEFS[c.type];
    const t = d.terms.find(t => t.id === tid); if (!t) return null;
    const s = c.props.size || 1;
    return { x: c.x + t.x * s, y: c.y + t.y * s, dir: t.dir ?? (t.y === 0 ? -1 : 1) };
  }
  // the horizontal height of each wire without bends, given out in renderWires so no two runs lie on one line
  let lanes = null;
  const laneY = new Map();
  function route(a, pts, b, id) {
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
      ym = clearY(ea, eb, ym);
      if (lanes) {
        const x1 = Math.min(ea[0], eb[0]), x2 = Math.max(ea[0], eb[0]), away = a.dir < 0 && b.dir < 0 ? -8 : 8;
        for (let k = 0; k < 16 && lanes.some(l => Math.abs(l.y - ym) < 5 && l.x1 < x2 + 6 && l.x2 > x1 - 6); k++) ym += away;
        lanes.push({ y: ym, x1, x2 }); if (id) laneY.set(id, ym);
      } else if (id && laneY.has(id)) ym = laneY.get(id);
      P.push([ea[0], ym], [eb[0], ym]);
    } else P.push([eb[0], cur[1]]);
    P.push(eb, [b.x, b.y]);
    return P;
  }
  /* a wire without bends runs down, across and down again: pick the height of the horizontal run so the wire crosses
     as few devices as it can (devices are boxes; rails and junctions don't count), staying near the plain middle */
  let boxes = null;
  function deviceBoxes() {
    if (boxes) return boxes;
    boxes = circ().comps.filter(c => !DEFS[c.type].rail && !DEFS[c.type].junction && !DEFS[c.type].layer).map(c => {
      const s = c.props.size || 1, d = Circuit.dims(c);
      return [c.x + 1, c.y + 1, c.x + d.w * s - 1, c.y + d.h * s - 1];
    });
    return boxes;
  }
  const hits = (x1, y1, x2, y2) => deviceBoxes().reduce((n, [l, t, r, b]) => n + (Math.max(x1, x2) > l && Math.min(x1, x2) < r && Math.max(y1, y2) > t && Math.min(y1, y2) < b ? 1 : 0), 0);
  function clearY(ea, eb, y0) {
    const cost = y => hits(ea[0], ea[1], ea[0], y) + hits(Math.min(ea[0], eb[0]), y, Math.max(ea[0], eb[0]), y) + hits(eb[0], y, eb[0], eb[1]);
    let best = y0, bc = cost(y0);
    if (!bc) return y0;
    const cands = [ea[1], eb[1]];
    deviceBoxes().forEach(([, t, , b]) => cands.push(t - 8, b + 8));
    for (const y of cands) {
      const c = cost(y);
      if (c < bc || (c === bc && Math.abs(y - y0) < Math.abs(best - y0))) { best = y; bc = c; }
    }
    return best;
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
          <div class="pal-tools"><button class="tbtn sm" data-pal="close" title="Collapse all groups">⊟ Collapse all</button><button class="tbtn sm" data-pal="open" title="Expand all groups">⊞ Expand all</button></div>
          <div class="pal-list"></div>
        </aside>
        <div class="ws-center">
          <div class="ws-toolbar">
            <button class="tbtn mobile-only" data-drawer="pal">＋ Parts</button>
            <div class="seg"><button class="on" data-tool="select" title="Select / move / operate (S)">✥ Select</button><button data-tool="meter" title="Multimeter: click two terminals (M)">⎓ Meter</button></div>
            <span class="tb-lbl">Wire</span>
            <div class="swatches">${WIRE_COLORS.map(([v, n, bg]) => `<button class="sw${v === wireColor ? ' on' : ''}" data-wc="${v}" title="${n}" style="background:${bg || v}"></button>`).join('')}</div>
            <label class="chk"><input type="checkbox" data-live checked> Live voltage</label>
            <label class="chk" title="Wire markers (ferrules) at both ends: L1, L2, L3, N, PE, +24V, 0V"><input type="checkbox" data-tags${showTags ? ' checked' : ''}> Wire labels</label>
            <span class="spacer"></span>
            <span class="tb-lbl">Zoom</span><button class="tbtn" data-zoom="-1" title="Zoom out (scroll)" aria-label="Zoom out">🔍−</button><button class="tbtn zoomv" data-z data-zoom="0" title="Reset zoom to 100%">100%</button><button class="tbtn" data-zoom="1" title="Zoom in (scroll)" aria-label="Zoom in">🔍＋</button>
            <button class="tbtn" data-fit title="Fit all">⤢ Fit</button>
            <button class="tbtn mobile-only" data-drawer="props">⚙ Props</button>
          </div>
          <div class="ws-canvas">
            <svg class="ws-svg">
              <defs><pattern id="wsGrid" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="0.5" cy="0.5" r="0.7" class="gridDot"/></pattern>
              <pattern id="wsGrid2" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#wsGrid)"/><path d="M100 0 H0 V100" fill="none" class="gridLine"/></pattern></defs>
              <g class="vp"><rect class="bg" x="-6000" y="-6000" width="12000" height="12000" fill="url(#wsGrid2)"/><g class="backs"></g><g class="rails"></g><g class="wires"></g><g class="comps"></g><g class="over"></g></g>
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
    gBacks = svg.querySelector('.backs'); gRails = svg.querySelector('.rails'); gWires = svg.querySelector('.wires'); gComps = svg.querySelector('.comps'); gOver = svg.querySelector('.over');
    propsEl = el.querySelector('.ws-props'); meterEl = el.querySelector('.meter-read'); tipEl = el.querySelector('.ws-tip'); bannerEl = el.querySelector('.ws-banner');
    palDrawer = UI.drawer(el.querySelector('[data-drawer="pal"]'), el.querySelector('.ws-palette'));
    UI.drawer(el.querySelector('[data-drawer="props"]'), propsEl);
    UI.longPress(svg);
    buildPalette('');
    el.querySelector('.ws-search').addEventListener('input', e => buildPalette(e.target.value));
    el.querySelector('.pal-tools').addEventListener('click', e => {
      const b = e.target.closest('[data-pal]'); if (!b) return;
      const open = b.dataset.pal === 'open';
      root.querySelectorAll('.pal-cat').forEach(d => { d.open = open; });
      palClosed = open ? [] : Object.values(DEFS).map(d => d.cat).filter((c, i, a) => a.indexOf(c) === i);
      savePal();
    });
    el.querySelector('.ws-toolbar').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) setTool(b.dataset.tool);
      if (b.dataset.wc) { wireColor = b.dataset.wc; el.querySelectorAll('.sw').forEach(s => s.classList.toggle('on', s === b)); if (sel && sel.kind === 'wire' && wireColor !== 'auto') { const w = circ().wires.find(w => w.id === sel.id); if (w) { w.color = wireColor; renderWires(); App.save(); } } }
      if (b.dataset.zoom) { const z = Number(b.dataset.zoom); zoomAt(z > 0 ? 1.2 : z < 0 ? 1 / 1.2 : 1 / view.k); }
      if (b.hasAttribute('data-fit')) WS.fit();
    });
    el.querySelector('[data-live]').addEventListener('change', e => { showLive = e.target.checked; wireEls.forEach(w => { w.cls = null; }); });
    el.querySelector('[data-tags]').addEventListener('change', e => { showTags = e.target.checked; try { localStorage.setItem('plc-trainer.wiretags', showTags ? '1' : '0'); } catch (err) { /* private mode */ } renderWires(); });
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e); }, { passive: false });
    svg.addEventListener('contextmenu', onCtx);
    svg.addEventListener('dblclick', e => {
      const b = e.target.closest('.bend'), we = e.target.closest('.wire');
      if (b) { const w = circ().wires.find(x => x.id === b.dataset.wid); if (w) { w.pts.splice(Number(b.dataset.i), 1); renderWires(); renderTemp(); App.save(); } return; }
      if (we && sel && sel.kind === 'wire' && sel.id === we.dataset.wid) { addBend(circ().wires.find(x => x.id === sel.id), toWorld(e)); return; }
    });
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

  /* palette groups fold open/closed; the closed ones are remembered in this browser */
  let palClosed = [];
  try { palClosed = JSON.parse(localStorage.getItem('plc-trainer.palClosed') || '[]'); } catch (e) { palClosed = []; }
  if (!Array.isArray(palClosed)) palClosed = [];
  const savePal = () => { try { localStorage.setItem('plc-trainer.palClosed', JSON.stringify(palClosed)); } catch (e) { /* ignore */ } };
  function buildPalette(q) {
    q = q.trim().toLowerCase();
    const cats = {};
    Circuit.ORDER.forEach(t => { const d = DEFS[t]; if (d.hidden) return; if (q && !(d.name.toLowerCase().includes(q) || d.cat.toLowerCase().includes(q))) return; (cats[d.cat] = cats[d.cat] || []).push(t); });
    const list = root.querySelector('.pal-list');
    list.innerHTML = Object.entries(cats).map(([cat, types]) => `<details class="pal-cat" data-cat="${esc(cat)}"${q || !palClosed.includes(cat) ? ' open' : ''}><summary>${esc(cat)} <small>${types.length}</small></summary><div class="pal-grid">${types.map(t => {
      const d = DEFS[t];
      const sample = { id: 'pal', type: t, x: 0, y: 0, props: { label: d.prefix, ...d.props }, state: d.init ? d.init() : {} };
      const pad = 8;
      return `<button class="pal-item" draggable="true" data-type="${t}" title="${esc(d.name)} — ${esc(d.info || '')}"><svg viewBox="${-pad} ${-pad} ${d.w + pad * 2} ${d.h + pad * 2}">${Circuit.draw(sample, null)}${Circuit.drawTerms(d)}</svg><span>${esc(d.name)}</span></button>`;
    }).join('')}</div></details>`).join('') || '<p class="help">No match.</p>';
    list.querySelectorAll('.pal-cat').forEach(d => d.addEventListener('toggle', () => {
      if (q) return;
      palClosed = palClosed.filter(c => c !== d.dataset.cat);
      if (!d.open) palClosed.push(d.dataset.cat);
      savePal();
    }));
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
    if (d.unique && circ().comps.some(c => DEFS[c.type].unique === d.unique)) { UI.toast(d.uniqueMsg || 'Only one of this device per project', 'warn'); return; }
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
    cs.forEach(c => { const d = Circuit.dims(c), s = c.props.size || 1; x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y - 16); x1 = Math.max(x1, c.x + d.w * s); y1 = Math.max(y1, c.y + d.h * s); });
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
    const bendEl = e.target.closest('.bend');
    if (bendEl && !wiring && tool === 'select') {
      const w = circ().wires.find(x => x.id === bendEl.dataset.wid);
      if (w) { drag = { kind: 'bend', w, i: Number(bendEl.dataset.i), moved: false }; svg.setPointerCapture(e.pointerId); }
      return;
    }
    if (termEl && compEl) {
      const key = compEl.dataset.cid + ':' + termEl.dataset.term;
      if (tool === 'meter') { probes[probes.next] = key; probes.next = probes.next === 'a' ? 'b' : 'a'; renderTemp(); updateMeter(); return; }
      onTerm(key, pt); return;
    }
    if (partEl && compEl && !wiring) {
      const c = byId(compEl.dataset.cid);
      if (c) {
        drag = { kind: 'part', rel: App.operate(c, partEl.dataset.part) };
        svg.setPointerCapture(e.pointerId);
      }
      return;
    }
    // clicking an existing wire while wiring ends the new wire there, on a junction dot
    if (wiring && wireEl && tool === 'select') {
      const w = circ().wires.find(x => x.id === wireEl.dataset.wid);
      if (w && w.a !== wiring.from && w.b !== wiring.from) { const k = splitWire(w, pt); if (k) onTerm(k); return; }
    }
    if (wiring) { wiring.pts.push([snap(pt.x), snap(pt.y)]); renderTemp(); return; }
    if (compEl) {
      const c = byId(compEl.dataset.cid);
      select({ kind: 'comp', id: c.id });
      drag = { kind: 'comp', c, ox: pt.x - c.x, oy: pt.y - c.y, moved: false, ...mounted(c) };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (wireEl) { select({ kind: 'wire', id: wireEl.dataset.wid }); return; }
    select(null);
    startPan(e);
  }
  /* devices whose middle lies on a cabinet plate or door c, and the wires that run between them */
  function mounted(c) {
    if (!DEFS[c.type].plate) return {};
    const d = Circuit.dims(c), s = c.props.size || 1;
    const kids = circ().comps.filter(k => k !== c && !DEFS[k.type].plate).filter(k => {
      const kd = Circuit.dims(k), ks = k.props.size || 1, mx = k.x + kd.w * ks / 2, my = k.y + kd.h * ks / 2;
      return mx > c.x && mx < c.x + d.w * s && my > c.y && my < c.y + d.h * s;
    });
    const ids = new Set(kids.map(k => k.id));
    const kw = circ().wires.filter(w => ids.has(w.a.split(':')[0]) && ids.has(w.b.split(':')[0]) && (w.pts || []).length).map(w => ({ w, pts: w.pts.map(p => p.slice()) }));
    return { x0: c.x, y0: c.y, kids: kids.map(k => ({ c: k, x: k.x, y: k.y })), kw };
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
        let nx = snap(pt.x - drag.ox);
        let ny = snap(pt.y - drag.oy);
        // DIN rail: a device whose middle comes within 24 px of a rail's centre line clips onto it
        const dd = DEFS[drag.c.type];
        if (!dd.rail && !dd.junction && !dd.layer && !e.altKey) {
          const ds = drag.c.props.size || 1, mid = ny + dd.h * ds / 2, w = Circuit.dims(drag.c).w * ds;
          const r = circ().comps.find(r => DEFS[r.type].rail && nx + w > r.x && nx < r.x + Circuit.dims(r).w * (r.props.size || 1) && Math.abs(mid - (r.y + 18 * (r.props.size || 1))) <= 24);
          if (r) ny = Math.round(r.y + 18 * (r.props.size || 1) - dd.h * ds / 2);
        }
        // smart alignment: a wired terminal that comes within 8 px of the other end's x snaps onto it, so the wire runs straight
        drag.guide = null;
        if (!e.altKey) {
          const d = DEFS[drag.c.type];
          for (const w of circ().wires) {
            const mine = w.a.startsWith(drag.c.id + ':') ? w.a : w.b.startsWith(drag.c.id + ':') ? w.b : null;
            if (!mine) continue;
            const other = mine === w.a ? w.b : w.a;
            if (other.startsWith(drag.c.id + ':')) continue;
            const t = d.terms.find(x => x.id === mine.split(':')[1]), o = tpos(other);
            const ts = drag.c.props.size || 1;
            if (t && o && Math.abs(nx + t.x * ts - o.x) <= 8) { nx = o.x - t.x * ts; drag.guide = o.x; break; }
          }
        }
        if (nx !== drag.c.x || ny !== drag.c.y) {
          drag.c.x = nx; drag.c.y = ny; drag.moved = true;
          // a cabinet plate or door carries what is mounted on it, and the bends of the wires between those devices
          if (drag.kids) {
            const dx = nx - drag.x0, dy = ny - drag.y0;
            drag.kids.forEach(k => { k.c.x = k.x + dx; k.c.y = k.y + dy; });
            drag.kw.forEach(k => { k.w.pts = k.pts.map(([x, y]) => [x + dx, y + dy]); });
          }
          renderWires();
        }
        renderTemp();
      }
      else if (drag.kind === 'bend') {
        const p = [snap(pt.x), snap(pt.y)], q = drag.w.pts[drag.i];
        if (q && (p[0] !== q[0] || p[1] !== q[1])) { drag.w.pts[drag.i] = p; drag.moved = true; renderWires(); renderTemp(); }
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
    if ((drag.kind === 'comp' || drag.kind === 'bend') && drag.moved) App.save();
    if (drag.kind === 'comp' && drag.guide != null) { drag = null; renderTemp(); }
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
    if (/:(L1|U1)\b/.test(t)) return Circuit.POT_COLORS.L1;
    if (/:N\b/.test(t)) return Circuit.POT_COLORS.N;
    if (/:(M1|M2|C24|COM|BU)\b/.test(t)) return Circuit.POT_COLORS['DC-'];
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
        ...(c.type === 'mcpu' || d.slot ? [{ label: 'I/O Configuration…', onClick: () => App.ioConfig() }] : []),
        { label: 'Duplicate', onClick: () => duplicate(c) },
        ...Object.entries(d.variant ? d.variant.of : {}).filter(([, t]) => t !== c.type).map(([k, t]) => ({ label: `Change contact to ${k}`, onClick: () => retype(c, t) })),
        { label: 'Repair / replace device', onClick: () => { Circuit.repair(c); App.save(); }, disabled: !c.state.burnt && !c.state.badIn && !(c.state.tripped && !d.breaker) },
        { label: 'Remove all wires on this device', onClick: () => { circ().wires = circ().wires.filter(w => !w.a.startsWith(c.id + ':') && !w.b.startsWith(c.id + ':')); App.circuitChanged(); } },
        { label: 'Delete', danger: true, onClick: () => delSel() },
      ]);
    } else if (wireEl) {
      select({ kind: 'wire', id: wireEl.dataset.wid });
      const pt = toWorld(e), w0 = circ().wires.find(w => w.id === sel.id);
      UI.menu(e.clientX, e.clientY, [{ label: 'Start a new wire from here (junction)', onClick: () => { const key = splitWire(w0, pt); if (!key) return; wiring = { from: key, pts: [], cur: null }; select(null); renderTemp(); } },
        { label: 'Add a bend here', onClick: () => addBend(w0, pt) }, { label: 'Straighten (remove bends)', onClick: () => { const w = circ().wires.find(w => w.id === sel.id); if (w) { w.pts = []; App.circuitChanged(); } } }, { label: 'Delete wire', danger: true, onClick: () => delSel() }]);
    }
  }
  function retype(c, type) {
    Circuit.retype(c, type, circ());
    App.circuitChanged();
    UI.toast(`${c.props.label} is now ${DEFS[type].name}`, 'ok');
  }
  function duplicate(c) {
    const n = Circuit.create(c.type, c.x + 30, c.y + 30, circ());
    n.props = { ...JSON.parse(JSON.stringify(c.props)), label: n.props.label, ...(DEFS[c.type].slot ? { slot: n.props.slot } : {}) };
    if (DEFS[c.type].unique) { UI.toast(DEFS[c.type].uniqueMsg || 'Only one of this device per project', 'warn'); return; }
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
    renderTemp();   // bend handles follow the selection
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
  /* wire marker (ferrule) text: the wire's own label, else the conductor that is live on it. Colours are not trusted
     (red is used for 24 V and for 230 V control wires alike); only green/yellow always means earth. */
  const COLOR_TAG = { '#58a83a': 'PE' };
  const POT_TAG = { L1: 'L1', L2: 'L2', L3: 'L3', N: 'N', PE: 'PE', 'DC+': '+24V', 'DC-': '0V' };
  function wireTag(w, api) {
    if (w.tag) return w.tag;
    const pc = api ? Circuit.potClass(api.potsR(api.rootK(w.a))) : '';
    return pc ? POT_TAG[pc] : COLOR_TAG[String(w.color).toLowerCase()] || '';
  }
  function ferrule(p) { return `<g class="ferr" data-x="${p.x}" data-y="${p.y + p.dir * 15}"><rect height="9" rx="1.5"/><text></text></g>`; }
  function setTag(we, txt) {
    if (we.tag === txt) return;
    we.tag = txt;
    we.g.querySelectorAll('.ferr').forEach(f => {
      f.style.display = txt ? '' : 'none';
      if (!txt) return;
      const x = Number(f.dataset.x), y = Number(f.dataset.y), wd = Math.max(14, txt.length * 5.2 + 5), r = f.firstChild, t = f.lastChild;
      r.setAttribute('x', x - wd / 2); r.setAttribute('y', y - 4.5); r.setAttribute('width', wd);
      t.setAttribute('x', x); t.setAttribute('y', y + 2.6); t.textContent = txt;
    });
  }
  function renderWires() {
    boxes = null; lanes = []; laneY.clear();
    const h = [];
    circ().wires.forEach(w => {
      const a = tpos(w.a), b = tpos(w.b);
      if (!a || !b) return;
      const d = pathD(route(a, w.pts || [], b, w.id));
      const wc = esc(w.color || '#1d1d1d');
      // earth wires are green/yellow
      // .wo is a thin outline under the wire so black wires show on dark backgrounds (and white ones on light)
      h.push(`<g class="wire${sel && sel.kind === 'wire' && sel.id === w.id ? ' sel' : ''}" data-wid="${esc(w.id)}"><path class="wh" d="${d}"/><path class="wo" d="${d}"/><path class="wb" d="${d}" stroke="${wc}"/>${String(w.color).toLowerCase() === '#58a83a' ? `<path class="wpe" d="${d}"/>` : ''}<path class="wl" d="${d}"/><circle class="wdot" cx="${a.x}" cy="${a.y}" r="2.6" fill="${wc}"/><circle class="wdot" cx="${b.x}" cy="${b.y}" r="2.6" fill="${wc}"/>${showTags ? ferrule(a) + ferrule(b) : ''}</g>`);
    });
    lanes = null;
    gWires.innerHTML = h.join('');
    wireEls = [...gWires.querySelectorAll('.wire')].map(g => ({ g, id: g.dataset.wid, l: g.querySelector('.wl'), w: circ().wires.find(w => w.id === g.dataset.wid), cls: null, tag: null }));
    if (showTags) wireEls.forEach(we => setTag(we, wireTag(we.w, App.api)));
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
    if (sel && sel.kind === 'wire' && tool === 'select') {
      const w = circ().wires.find(x => x.id === sel.id);
      if (w) (w.pts || []).forEach((p, i) => h.push(`<circle class="bend" data-wid="${esc(w.id)}" data-i="${i}" cx="${p[0]}" cy="${p[1]}" r="5.5"><title>Drag to move this bend · double-click to remove it</title></circle>`));
    }
    if (drag && drag.kind === 'comp' && drag.guide != null) h.push(`<line class="guide" x1="${drag.guide}" y1="-6000" x2="${drag.guide}" y2="6000"/>`);
    gOver.innerHTML = h.join('');
  }

  /* ---------- wire geometry: nearest point, split at a junction, add a bend ---------- */
  function nearestOnWire(w, pt) {
    const P = route(tpos(w.a), w.pts || [], tpos(w.b), w.id);
    let best = null;
    for (let k = 0; k < P.length - 1; k++) {
      const [x1, y1] = P[k], [x2, y2] = P[k + 1], dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
      const u = L ? Math.max(0, Math.min(1, ((pt.x - x1) * dx + (pt.y - y1) * dy) / L)) : 0;
      const x = x1 + u * dx, y = y1 + u * dy, d = Math.hypot(pt.x - x, pt.y - y);
      if (!best || d < best.d) best = { d, x, y, k, P, horiz: dy === 0 };
    }
    return best;
  }
  const dedupe = pts => pts.filter((p, i) => !i || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  /* split wire w at the point nearest pt: a junction dot there and two wires that keep the old route; returns the junction terminal */
  function splitWire(w, pt) {
    // a wire of the Electrical Diagram is made again on every diagram change: a hand-made half would stay behind
    if (w.sch) { UI.toast('This wire comes from the Electrical Diagram: change the diagram instead, or start the new wire from a terminal', 'warn', 5000); return null; }
    const n = nearestOnWire(w, pt);
    // stay on the segment; snap only along it
    const x = n.horiz ? snap(n.x) : n.x, y = n.horiz ? n.y : snap(n.y);
    const j = Circuit.create('jct', x, y, circ());
    j.x = x; j.y = y;
    circ().comps.push(j);
    const key = j.id + ':J', P = n.P;
    const w2 = { id: 'w' + (++circ().seq), a: key, b: w.b, color: w.color, ...(w.tag ? { tag: w.tag } : {}), pts: dedupe(P.slice(n.k + 1, P.length - 2)) };
    w.b = key; w.pts = dedupe(P.slice(2, n.k + 1));
    circ().wires.push(w2);
    App.log('operator', `Junction added on a wire (${keyLabel(w.a)} … ${keyLabel(w2.b)})`);
    App.circuitChanged();
    return key;
  }
  function addBend(w, pt) {
    const n = nearestOnWire(w, pt);
    const idx = p => n.P.findIndex(q => q[0] === p[0] && q[1] === p[1]);
    const at = (w.pts || []).filter(p => idx(p) <= n.k).length;
    w.pts = w.pts || [];
    w.pts.splice(at, 0, [snap(pt.x), snap(pt.y)]);
    renderWires(); renderTemp(); App.save();
  }

  WS.update = function () {
    if (!gComps) return;
    const ctx = App.ctx;
    for (const c of circ().comps) {
      let e = compEls.get(c.id);
      if (!e) {
        const g = document.createElementNS(NS, 'g');
        g.classList.add('comp'); g.dataset.cid = c.id;
        const dl = DEFS[c.type];
        (dl.layer === 'back' ? gBacks : dl.rail || dl.layer === 'rail' ? gRails : gComps).appendChild(g);
        e = { g, sig: null, tr: null };
        compEls.set(c.id, e);
        if (sel && sel.kind === 'comp' && sel.id === c.id) g.classList.add('sel');
      }
      const sz = c.props.size || 1;
      const tr = `translate(${c.x} ${c.y})` + (sz !== 1 ? ` scale(${sz})` : '');
      if (tr !== e.tr) { e.g.setAttribute('transform', tr); e.tr = tr; }
      const s = Circuit.sig(c, ctx);
      if (s !== e.sig) {
        const d = DEFS[c.type];
        e.g.classList.toggle('jct', !!d.junction);
        e.g.innerHTML = d.junction
          ? `<g class="term" data-term="J"><circle class="thit" r="9"/><circle class="jdot" r="4.2"/></g>`
          : `<rect class="frame" x="-5" y="-18" width="${Circuit.dims(c).w + 10}" height="${Circuit.dims(c).h + 23}" rx="8"/><text class="clabel" x="0" y="-6">${esc(c.props.label)}</text>` + Circuit.draw(c, ctx) + Circuit.drawTerms(d);
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
        if (showTags) setTag(w, wireTag(w.w, api));
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
      const fields = d.junction ? [] : [{ k: 'label', n: 'Tag / label' }, { k: 'size', n: 'Size (×)', opts: SIZES }, ...(d.pdefs || [])];
      const vr = d.variant ? `<label class="field"><span>${esc(d.variant.n)}</span><select data-variant>${Object.entries(d.variant.of).map(([k, t]) => `<option value="${t}" ${t === c.type ? 'selected' : ''}>${k === 'NO' ? 'N.O. (normally open)' : k === 'NC' ? 'N.C. (normally closed)' : esc(k)}</option>`).join('')}</select></label>` : '';
      propsEl.innerHTML = `<div class="side-head"><h4>${esc(d.name)}</h4></div>
        <div class="props">${vr}${fields.map(f => `<label class="field"><span>${esc(f.n)}</span>${f.opts ? `<select data-pk="${f.k}">${f.opts.map(o => `<option ${String(c.props[f.k]) === o ? 'selected' : ''}>${o}</option>`).join('')}</select>` : `<input data-pk="${f.k}" type="${f.type || 'text'}" value="${esc(c.props[f.k] ?? '')}">`}</label>`).join('')}
        <div class="status-box"><small>Status</small><div data-status>${esc(Circuit.status(c, App.ctx))}</div></div>
        <p class="help">${esc(d.info || '')}</p>
        <div class="btn-row">${d.junction ? '' : '<button class="btn" data-same title="Give every device in the circuit this size">Same size for all</button>'}<button class="btn" data-dup>Duplicate</button><button class="btn" data-rep ${c.state.burnt || c.state.badIn ? '' : 'disabled'}>Repair</button><button class="btn danger" data-del>Delete</button></div></div>`;
      propsEl.querySelectorAll('[data-pk]').forEach(i => i.addEventListener('change', () => {
        const k = i.dataset.pk;
        if (k === 'label') { setLabel(c, i); return; }
        c.props[k] = i.type === 'number' || k === 'size' ? Number(i.value) : i.value;
        if (k === 'size') App.circuitChanged(); else App.save();
      }));
      const sa = propsEl.querySelector('[data-same]');
      if (sa) sa.onclick = () => { circ().comps.forEach(x => { if (!DEFS[x.type].junction) x.props.size = c.props.size || 1; }); App.circuitChanged(); UI.toast('All devices now have the same size', 'ok'); };
      const vs = propsEl.querySelector('[data-variant]');
      if (vs) vs.onchange = () => retype(c, vs.value);
      propsEl.querySelector('[data-del]').onclick = delSel;
      propsEl.querySelector('[data-dup]').onclick = () => duplicate(c);
      propsEl.querySelector('[data-rep]').onclick = () => { Circuit.repair(c); renderProps(); App.save(); };
    } else if (sel && sel.kind === 'wire') {
      const w = circ().wires.find(w => w.id === sel.id); if (!w) return;
      propsEl.innerHTML = `<div class="side-head"><h4>Wire</h4></div><div class="props">
        <p><code>${esc(keyLabel(w.a))}</code> → <code>${esc(keyLabel(w.b))}</code></p>
        <div class="swatches big">${WIRE_COLORS.slice(1).map(([v, n]) => `<button class="sw${w.color === v ? ' on' : ''}" data-c="${v}" title="${n}" style="background:${v}"></button>`).join('')}</div>
        <label class="field"><span>Wire label (marker)</span><input data-wtag maxlength="12" placeholder="${esc(wireTag({ ...w, tag: '' }, App.api) || 'e.g. 101')}" value="${esc(w.tag || '')}"></label>
        <div class="btn-row"><button class="btn" data-str>Straighten</button><button class="btn danger" data-del>Delete</button></div></div>`;
      propsEl.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { w.color = b.dataset.c; renderWires(); renderProps(); App.save(); });
      propsEl.querySelector('[data-del]').onclick = delSel;
      propsEl.querySelector('[data-str]').onclick = () => { w.pts = []; App.circuitChanged(); };
      propsEl.querySelector('[data-wtag]').addEventListener('change', e => { const v = e.target.value.trim().slice(0, 12); if (v) w.tag = v; else delete w.tag; renderWires(); App.save(); });
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

  /* a tag is unique (the Electrical Diagram and the address book find devices by it); symbols that use it follow the rename */
  const LABEL = /^[A-Za-z0-9_+.-]{1,20}$/, SCHTAG = /^[A-Za-z0-9_-]{1,20}$/;
  function rename(c, v) {
    const old = c.props.label, S = window.Schematic, refs = S && S.refs ? S.refs(old) : 0;
    if (v === old) return null;
    if (!LABEL.test(v)) return 'A tag is 1 to 20 letters, numbers or + . - _ (no spaces)';
    if (circ().comps.some(x => x !== c && x.props.label === v)) return `${v} is already the tag of another device`;
    if (circ().reserved && circ().reserved.has(v)) return `${v} is the tag of a part this version does not know (kept in the project): use another tag`;
    if (refs && !SCHTAG.test(v)) return `${old} is used in the Electrical Diagram: use letters, numbers, - or _ only`;
    c.props.label = v;
    App.log('operator', `Device ${old} renamed ${v}`);
    if (refs) { S.renameTag(old, v); UI.toast(`${old} renamed ${v} — the Electrical Diagram follows`, 'ok'); }
    else if (S && S.refs(v)) S.sync();
    else App.save();
    return null;
  }
  function setLabel(c, inp) {
    const m = rename(c, inp.value.trim());
    if (m) { UI.toast(m, 'warn'); inp.value = c.props.label; }
  }
  /* rename a device from another view (the Electrical Diagram): its symbols everywhere follow */
  WS.renameDevice = (c, v) => rename(c, String(v).trim());
  WS.selectComp = id => select({ kind: 'comp', id });
  WS.onShow = function () { if (!WS._fitted) { WS._fitted = true; requestAnimationFrame(() => WS.fit()); } };
  WS.refit = () => { WS._fitted = false; };
  WS.resetView = function () { WS._fitted = false; sel = null; wiring = null; probes = { a: null, b: null, next: 'a' }; compEls.forEach(e => e.g.remove()); compEls.clear(); };
  window.Workspace = WS;
})();
