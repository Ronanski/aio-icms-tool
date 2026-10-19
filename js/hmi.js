/* HMI: operator touchscreen designer + runtime bound to PLC tags. */
(function () {
  'use strict';
  const esc = UI.esc;
  const HMI = {};
  let root, screen, propsEl, mode = 'run', sel = null, drag = null, els = [];
  const COLORS = ['#2fa84f', '#d33a2c', '#f2c230', '#f39c1e', '#2f6fd6', '#7a7770', '#ffffff', '#1d1d1d'];
  const TYPES = {
    pb: { name: 'Push Button', w: 130, h: 64, d: { label: 'START', tag: 'B3:0/0', mode: 'momentary', color: '#2fa84f' } },
    ind: { name: 'Indicator', w: 130, h: 64, d: { label: 'MOTOR', tag: 'O:0/0', onText: 'RUNNING', offText: 'STOPPED', onColor: '#2fa84f', offColor: '#5b5953', shape: 'box' } },
    lamp: { name: 'Pilot Light', w: 80, h: 90, d: { label: 'RUN', tag: 'O:0/0', onColor: '#2fa84f', offColor: '#3a3833' } },
    num: { name: 'Numeric Display', w: 150, h: 64, d: { label: 'COUNT', tag: 'C5:0.ACC', units: '', scale: 1, dec: 0 } },
    entry: { name: 'Numeric Entry', w: 150, h: 64, d: { label: 'PRESET', tag: 'T4:0.PRE', min: 0, max: 32767 } },
    bar: { name: 'Bar Graph', w: 70, h: 170, d: { label: 'LEVEL', tag: 'N7:0', min: 0, max: 100, color: '#2f6fd6' } },
    motor: { name: 'Motor Graphic', w: 100, h: 100, d: { label: 'M1', tag: 'O:0/0' } },
    tank: { name: 'Tank Graphic', w: 110, h: 160, d: { label: 'TANK', tag: 'N7:0', min: 0, max: 100 } },
    alarm: { name: 'Alarm Banner', w: 360, h: 44, d: { label: 'OVERLOAD TRIPPED!', tag: 'B3:0/15' } },
    text: { name: 'Text', w: 220, h: 40, d: { label: 'Title text', size: 20, color: '#ffffff' } },
  };
  const PROPS = {
    label: 'Label', tag: 'Tag (address)', mode: 'Button action', color: 'Color', onText: 'ON text', offText: 'OFF text', onColor: 'ON color', offColor: 'OFF color',
    shape: 'Shape', units: 'Units', scale: 'Scale ×', dec: 'Decimals', min: 'Min', max: 'Max', size: 'Font size',
  };
  const hmi = () => App.project.hmi;
  const MODES = ['momentary', 'toggle', 'set', 'reset'], SHAPES = ['box', 'round'];
  const HEXC = /^#[0-9a-fA-F]{3,8}$/;
  const col = (v, d = '#888888') => (HEXC.test(v) ? v : d);

  /* check one saved/imported screen object: known type, safe id, numeric geometry, hex colors */
  HMI.clean = function (o) {
    if (!o || typeof o !== 'object' || !Object.prototype.hasOwnProperty.call(TYPES, o.type) || !/^[A-Za-z0-9_-]{1,40}$/.test(o.id)) return null;
    const t = TYPES[o.type];
    const num = (v, d, lo, hi) => { const x = Number(v); return v !== '' && v != null && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
    const r = { id: o.id, type: o.type, x: num(o.x, 40, 0, 800), y: num(o.y, 60, 0, 480), w: num(o.w, t.w, 20, 800), h: num(o.h, t.h, 20, 480) };
    for (const k in t.d) {
      const d = t.d[k], v = o[k];
      if (/color/i.test(k)) r[k] = col(v, d);
      else if (k === 'mode') r[k] = MODES.includes(v) ? v : d;
      else if (k === 'shape') r[k] = SHAPES.includes(v) ? v : d;
      else if (typeof d === 'number') r[k] = num(v, d, -1e9, 1e9);
      else r[k] = typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 200) : d;
    }
    return r;
  };

  HMI.init = function (el) {
    root = el;
    el.innerHTML = `
      <div class="hmi">
        <div class="hmi-toolbar">
          <div class="seg" title="Operate the screen, or design it (add, move, resize objects). The PLC's own RUN/PROG is in the status bar."><button data-mode="run" class="on">☝ Operate</button><button data-mode="edit">✎ Design</button></div>
          <button class="tbtn mobile-only" data-drawer="props">⚙ Props</button>
          <div class="hmi-zoom"><span class="tb-lbl">Zoom</span><button class="tbtn" data-hz="-1" title="Zoom out (Ctrl + scroll)" aria-label="Zoom out">🔍−</button><button class="tbtn zoomv" data-hz="fit" data-hzv title="Fit the screen to the window">Fit</button><button class="tbtn" data-hz="1" title="Zoom in (Ctrl + scroll)" aria-label="Zoom in">🔍＋</button></div>
          <div class="hmi-add">${Object.entries(TYPES).map(([k, t]) => `<button class="tbtn" data-add="${k}">${t.name}</button>`).join('')}</div>
        </div>
        <div class="hmi-main">
          <div class="hmi-stage"><div class="hmi-bezel"><div class="hmi-brand">Operator terminal · 800×480</div><div class="hmi-screen"></div><div class="hmi-keys"><span></span><span></span><span></span><span></span></div></div></div>
          <aside class="hmi-props"></aside>
        </div>
      </div>`;
    screen = el.querySelector('.hmi-screen');
    propsEl = el.querySelector('.hmi-props');
    UI.drawer(el.querySelector('[data-drawer="props"]'), propsEl);
    el.querySelector('.hmi-toolbar').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mode) setMode(b.dataset.mode);
      if (b.dataset.add) add(b.dataset.add);
      if (b.dataset.hz) setZoom(b.dataset.hz === 'fit' ? 'fit' : (zoomK() * (b.dataset.hz > 0 ? 1.15 : 1 / 1.15)));
    });
    root.querySelector('.hmi-stage').addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(zoomK() * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }, { passive: false });
    screen.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    setMode('run');
    HMI.watchSize();
  };

  function setMode(m) {
    mode = m;
    root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    root.querySelector('.hmi-add').classList.toggle('hidden', m !== 'edit');
    root.querySelector('.hmi').classList.toggle('editing', m === 'edit');
    if (m === 'run') sel = null;
    if (App.project) HMI.render();
  }
  function add(type) {
    const t = TYPES[type];
    hmi().seq = (hmi().seq || 0) + 1;
    const n = hmi().objects.length % 8;
    const o = { id: 'h' + hmi().seq, type, x: 40 + n * 20, y: 60 + n * 20, w: t.w, h: t.h, ...JSON.parse(JSON.stringify(t.d)) };
    hmi().objects.push(o);
    sel = o.id;
    App.save();
    HMI.render();
  }
  function objAt(e) { const el = e.target.closest('.hobj'); return el ? hmi().objects.find(o => o.id === el.dataset.id) : null; }
  function scale() { return screen.getBoundingClientRect().width / 800; }

  function onDown(e) {
    const o = objAt(e);
    if (mode === 'edit') {
      sel = o ? o.id : null;
      if (o) {
        const k = scale();
        drag = { o, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, ow: o.w, oh: o.h, rs: !!e.target.closest('.rs'), k };
        e.preventDefault();
      }
      HMI.render();
      return;
    }
    if (!o) return;
    const plc = App.plc;
    if (o.type === 'pb') {
      e.preventDefault();
      if (o.mode === 'momentary') { plc.write(o.tag, 1); const tag = o.tag; drag = { mom: App.hold('hmi:' + tag, () => App.plc.write(tag, 0)) }; }
      else if (o.mode === 'toggle') plc.write(o.tag, plc.read(o.tag) ? 0 : 1);
      else if (o.mode === 'set') plc.write(o.tag, 1);
      else if (o.mode === 'reset') plc.write(o.tag, 0);
      App.log('operator', `HMI button “${o.label}” pressed (${o.mode}, ${o.tag} = ${plc.read(o.tag)})`);
    } else if (o.type === 'entry') {
      UI.form(`Enter value — ${o.label}`, [{ key: 'v', label: `${o.tag} (${o.min} … ${o.max})`, value: plc.read(o.tag), type: 'number' }], v => {
        const n = Number(v.v);
        if (!Number.isFinite(n)) return 'Enter a number';
        if (n < Number(o.min) || n > Number(o.max)) return `Value must be between ${o.min} and ${o.max}`;
        plc.write(o.tag, n);
        App.log('operator', `HMI entry “${o.label}”: ${o.tag} set to ${plc.read(o.tag)}`);
      });
    }
  }
  function onMove(e) {
    if (!drag || !drag.o) return;
    const dx = (e.clientX - drag.sx) / drag.k, dy = (e.clientY - drag.sy) / drag.k;
    const o = drag.o, g = v => Math.round(v / 10) * 10;
    if (drag.rs) { o.w = Math.max(30, g(drag.ow + dx)); o.h = Math.max(24, g(drag.oh + dy)); }
    else { o.x = Math.max(0, Math.min(800 - o.w, g(drag.ox + dx))); o.y = Math.max(0, Math.min(480 - o.h, g(drag.oy + dy))); }
    const el = screen.querySelector(`[data-id="${o.id}"]`);
    if (el) Object.assign(el.style, { left: o.x + 'px', top: o.y + 'px', width: o.w + 'px', height: o.h + 'px' });
  }
  function onUp() {
    if (!drag) return;
    if (drag.mom) drag.mom();
    if (drag.o) App.save();
    drag = null;
  }
  HMI.onKey = function (e) {
    if (mode !== 'edit' || !sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      hmi().objects = hmi().objects.filter(o => o.id !== sel); sel = null; App.save(); HMI.render();
    }
  };

  function inner(o) {
    switch (o.type) {
      case 'pb': return `<div class="h-pb" style="--c:${col(o.color)}"><span>${esc(o.label)}</span></div>`;
      case 'ind': return `<div class="h-ind ${o.shape === 'round' ? 'round' : ''}"><small>${esc(o.label)}</small><b data-t></b></div>`;
      case 'lamp': return `<div class="h-lamp"><i data-l></i><small>${esc(o.label)}</small></div>`;
      case 'num': return `<div class="h-num"><small>${esc(o.label)}</small><b data-t>0</b></div>`;
      case 'entry': return `<div class="h-num entry"><small>${esc(o.label)} ✎</small><b data-t>0</b></div>`;
      case 'bar': return `<div class="h-bar"><small>${esc(o.label)}</small><div class="trk"><i data-f style="background:${col(o.color)}"></i></div><b data-t>0</b></div>`;
      case 'motor': return `<div class="h-motor"><svg viewBox="-50 -50 100 100"><circle r="44" class="mb"/><g data-r><path d="M0 0 L36 -8 Q40 0 36 8Z"/><path d="M0 0 L36 -8 Q40 0 36 8Z" transform="rotate(120)"/><path d="M0 0 L36 -8 Q40 0 36 8Z" transform="rotate(240)"/></g><circle r="7" class="hub"/></svg><small>${esc(o.label)}</small></div>`;
      case 'tank': return `<div class="h-tank"><small>${esc(o.label)}</small><div class="vessel"><i data-f></i><b data-t>0</b></div></div>`;
      case 'alarm': return `<div class="h-alarm" data-a>⚠ ${esc(o.label)}</div>`;
      case 'text': return `<div class="h-text" style="font-size:${Number(o.size) || 18}px;color:${col(o.color)}">${esc(o.label)}</div>`;
    }
    return '';
  }

  HMI.render = function () {
    if (!screen) return;
    const objs = hmi().objects;
    screen.innerHTML = objs.map(o => `<div class="hobj t-${esc(o.type)}${sel === o.id ? ' sel' : ''}" data-id="${esc(o.id)}" style="left:${Number(o.x) || 0}px;top:${Number(o.y) || 0}px;width:${Number(o.w) || 0}px;height:${Number(o.h) || 0}px">${inner(o)}${mode === 'edit' ? '<span class="rs"></span>' : ''}</div>`).join('') +
      (objs.length ? '' : `<div class="hmi-empty">Empty screen — switch to <b>Edit</b> and add objects.</div>`);
    els = objs.map(o => {
      const el = screen.querySelector(`[data-id="${o.id}"]`);
      return { o, el, t: el.querySelector('[data-t]'), f: el.querySelector('[data-f]'), l: el.querySelector('[data-l]'), r: el.querySelector('[data-r]'), last: null };
    });
    fitScreen();
    renderProps();
    HMI.update();
  };
  /* zoom: 'fit' follows the window size; a number is a fixed scale. Remembered in this browser. */
  let hz = 'fit';
  try { const z = localStorage.getItem('plc-trainer.hz'); hz = z && z !== 'fit' && Number(z) ? Number(z) : 'fit'; } catch (e) { hz = 'fit'; }
  function fitK() {
    const stage = root.querySelector('.hmi-stage');
    return Math.max(0.35, Math.min(1.25, (stage.clientWidth - 40) / 860));
  }
  const zoomK = () => (hz === 'fit' ? fitK() : hz);
  function setZoom(z) {
    hz = z === 'fit' ? 'fit' : Math.max(0.25, Math.min(3, Math.round(z * 100) / 100));
    try { localStorage.setItem('plc-trainer.hz', String(hz)); } catch (e) { /* ignore */ }
    fitScreen();
  }
  HMI.setZoom = setZoom;
  function fitScreen() {
    const k = zoomK();
    root.querySelector('.hmi-bezel').style.setProperty('--k', k);
    const v = root.querySelector('[data-hzv]');
    v.textContent = hz === 'fit' ? `Fit · ${Math.round(k * 100)}%` : Math.round(k * 100) + '%';
    v.classList.toggle('fit', hz === 'fit');
  }
  HMI.onShow = () => requestAnimationFrame(fitScreen);
  let hmiRO = null;
  HMI.watchSize = () => { if (!hmiRO && root) { hmiRO = new ResizeObserver(() => { if (root.offsetParent) fitScreen(); }); hmiRO.observe(root.querySelector('.hmi-stage')); } };
  window.addEventListener('resize', () => { if (root && root.offsetParent) fitScreen(); });

  HMI.update = function () {
    const plc = App.plc;
    for (const x of els) {
      const o = x.o;
      const v = o.tag ? plc.read(o.tag) : 0;
      const key = v + '|' + (o.type === 'motor' ? Math.floor(performance.now() / 40) : '');
      if (key === x.last) continue;
      x.last = key;
      switch (o.type) {
        case 'pb': x.el.classList.toggle('on', !!v); break;
        case 'ind': x.el.style.setProperty('--c', v ? o.onColor : o.offColor); x.t.textContent = v ? o.onText : o.offText; x.el.classList.toggle('on', !!v); break;
        case 'lamp': x.l.style.background = v ? o.onColor : o.offColor; x.el.classList.toggle('on', !!v); x.l.style.color = o.onColor; break;
        case 'num': case 'entry': {
          const n = v * (Number(o.scale) || 1);
          x.t.textContent = n.toFixed(Number(o.dec) || 0) + (o.units ? ' ' + o.units : '');
          break;
        }
        case 'bar': case 'tank': {
          const lo = Number(o.min) || 0, hi = Number(o.max) || 100;
          const f = Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)));
          x.f.style.height = (f * 100) + '%';
          x.t.textContent = String(v);
          break;
        }
        case 'motor':
          x.el.classList.toggle('on', !!v);
          if (v) { x.ang = ((x.ang || 0) + 24) % 360; x.r.setAttribute('transform', `rotate(${x.ang})`); }
          break;
        case 'alarm': x.el.classList.toggle('on', !!v); break;
      }
    }
  };

  function renderProps() {
    if (!propsEl) return;
    const o = hmi().objects.find(o => o.id === sel);
    if (mode !== 'edit') {
      propsEl.innerHTML = `<div class="side-head"><h4>HMI Runtime</h4></div><div class="props"><p class="help">☝ Operate mode: touch the buttons on the screen. HMI buttons write to PLC tags (use <code>B3</code> bits — never physical inputs). Indicators read any tag.</p>
      <p class="help">Switch to <b>✎ Design</b> to add objects, drag to move, drag the corner to resize, <b>Del</b> to delete.</p>
      <h5>Tags on this screen</h5><ul class="taglist">${hmi().objects.filter(o => o.tag).map(o => `<li><code>${esc(o.tag)}</code> ${esc(o.label)}</li>`).join('') || '<li class="help">none</li>'}</ul></div>`;
      return;
    }
    if (!o) { propsEl.innerHTML = `<div class="side-head"><h4>Edit screen</h4></div><div class="props"><p class="help">Add an object from the toolbar, then select it to bind a tag.</p></div>`; return; }
    const keys = Object.keys(TYPES[o.type].d);
    propsEl.innerHTML = `<div class="side-head"><h4>${TYPES[o.type].name}</h4></div><div class="props">${keys.map(k => {
      const v = o[k];
      let input;
      if (k === 'mode') input = `<select data-k="mode">${MODES.map(m => `<option ${v === m ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
      else if (k === 'shape') input = `<select data-k="shape">${SHAPES.map(m => `<option ${v === m ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
      else if (/color/i.test(k)) input = `<div class="swatches">${COLORS.map(c => `<button class="sw${v === c ? ' on' : ''}" data-ck="${k}" data-cv="${c}" style="background:${c}"></button>`).join('')}</div>`;
      else input = `<input data-k="${k}" value="${esc(v)}" ${k === 'tag' ? 'list="hmiTags" spellcheck="false"' : ''}>`;
      return `<label class="field"><span>${PROPS[k] || k}</span>${input}</label>`;
    }).join('')}
      <datalist id="hmiTags">${['B3:0/0', 'B3:0/1', 'B3:0/2', 'B3:0/3', 'O:0/0', 'O:0/1', 'O:0/2', 'I:0/0', 'I:0/1', 'I:0/2', 'N7:0', 'N7:1', 'T4:0.ACC', 'T4:0.PRE', 'C5:0.ACC', 'C5:0.PRE', 'T4:0/DN', 'C5:0/DN'].map(t => `<option value="${t}">`).join('')}</datalist>
      <p class="help warn-txt" data-w></p>
      <div class="btn-row"><button class="btn" data-dup>Duplicate</button><button class="btn danger" data-del>Delete</button></div></div>`;
    const warn = () => {
      const p = PLCcore.parse(o.tag);
      const w = propsEl.querySelector('[data-w]');
      if (!w || !('tag' in o)) return;
      w.textContent = !p ? 'Invalid address' : ((o.type === 'pb' || o.type === 'entry') && p.file === 'I') ? 'Writing to an input (I:) is overwritten by the input scan — use a B3 bit.' : '';
    };
    warn();
    propsEl.querySelectorAll('[data-k]').forEach(i => i.addEventListener('change', () => {
      let v = i.value;
      if (i.dataset.k === 'tag') { const p = PLCcore.parse(v); if (p) v = p.norm; }
      o[i.dataset.k] = v; App.save(); HMI.render();
    }));
    propsEl.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => { o[b.dataset.ck] = b.dataset.cv; App.save(); HMI.render(); });
    propsEl.querySelector('[data-del]').onclick = () => { hmi().objects = hmi().objects.filter(x => x.id !== o.id); sel = null; App.save(); HMI.render(); };
    propsEl.querySelector('[data-dup]').onclick = () => {
      hmi().seq = (hmi().seq || 0) + 1;
      const n = { ...JSON.parse(JSON.stringify(o)), id: 'h' + hmi().seq, x: o.x + 20, y: o.y + 20 };
      hmi().objects.push(n); sel = n.id; App.save(); HMI.render();
    };
  }
  HMI.resetSel = () => { sel = null; };
  window.HMI = HMI;
})();
