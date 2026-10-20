/* HMI: operator touchscreen designer + runtime bound to PLC tags. */
(function () {
  'use strict';
  const esc = UI.esc;
  const HMI = {};
  let root, screen, propsEl, mode = 'run', sel = null, drag = null, els = [];
  let cur = 's1', user = false;          // screen on display; logged in (runtime only, never saved)
  const hist = new Map();                // trend samples per object id: [[t, v]…]
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
    rect: { name: 'Rectangle', w: 160, h: 90, d: { label: '', tag: '', onColor: '#2fa84f', offColor: '#3d4a57', blink: 'no' } },
    ellipse: { name: 'Ellipse', w: 100, h: 100, d: { label: '', tag: '', onColor: '#2fa84f', offColor: '#3d4a57', blink: 'no' } },
    line: { name: 'Line / pipe', w: 200, h: 14, d: { tag: '', onColor: '#2f6fd6', offColor: '#7a7770', blink: 'no' } },
    trend: { name: 'Trend', w: 320, h: 160, d: { label: 'LEVEL', tag: 'N7:0', min: 0, max: 100, span: 30, color: '#f2c230' } },
    image: { name: 'Image', w: 160, h: 120, d: { label: '', src: '' } },
    nav: { name: 'Go to Screen', w: 150, h: 56, d: { label: 'NEXT ▶', target: 's1', color: '#2f6fd6', sec: 'no' } },
    login: { name: 'Log in / out', w: 150, h: 56, d: { label: 'LOGIN' } },
  };
  // every object can be hidden by a tag (visible while the tag is 1); buttons and entries can need a log-in
  const COMMON = { vis: '' };
  TYPES.pb.d.sec = 'no'; TYPES.entry.d.sec = 'no';
  /* terminal types: screen size in pixels */
  const RES = { t4: [480, 272, '4.3" terminal'], t6: [640, 480, '6" terminal'], t7: [800, 480, '7" terminal'], t10: [1024, 600, '10" terminal'], t12: [1280, 800, '12" terminal'], t15: [1024, 768, '15" terminal'], pc: [1280, 720, 'PC screen'] };
  const dims = () => RES[(App.project && App.project.hmi.res) || 't7'] || RES.t7;
  HMI.RES = RES;
  const PROPS = {
    label: 'Label', tag: 'Tag (address)', mode: 'Button action', color: 'Color', onText: 'ON text', offText: 'OFF text', onColor: 'ON color', offColor: 'OFF color',
    shape: 'Shape', units: 'Units', scale: 'Scale ×', dec: 'Decimals', min: 'Min', max: 'Max', size: 'Font size',
    blink: 'Blink when ON', span: 'Time span (s)', src: 'Picture', target: 'Go to screen', sec: 'Needs log-in', vis: 'Visible when tag = 1 (empty: always)',
  };
  const hmi = () => App.project.hmi;
  const MODES = ['momentary', 'toggle', 'set', 'reset'], SHAPES = ['box', 'round'], YN = ['no', 'yes'];
  const IMG = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
  const HEXC = /^#[0-9a-fA-F]{3,8}$/;
  const col = (v, d = '#888888') => (HEXC.test(v) ? v : d);

  /* check one saved/imported screen object: known type, safe id, numeric geometry, hex colors */
  HMI.clean = function (o) {
    if (!o || typeof o !== 'object' || !Object.prototype.hasOwnProperty.call(TYPES, o.type) || !/^[A-Za-z0-9_-]{1,40}$/.test(o.id)) return null;
    const t = TYPES[o.type];
    const num = (v, d, lo, hi) => { const x = Number(v); return v !== '' && v != null && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
    const r = { id: o.id, type: o.type, x: num(o.x, 40, 0, 1280), y: num(o.y, 60, 0, 800), w: num(o.w, t.w, 8, 1280), h: num(o.h, t.h, 8, 800), scr: typeof o.scr === 'string' && /^s\d{1,3}$/.test(o.scr) ? o.scr : 's1' };
    for (const k in { ...t.d, ...COMMON }) {
      const d = k in t.d ? t.d[k] : COMMON[k], v = o[k];
      if (/color/i.test(k)) r[k] = col(v, d);
      else if (k === 'mode') r[k] = MODES.includes(v) ? v : d;
      else if (k === 'shape') r[k] = SHAPES.includes(v) ? v : d;
      else if (k === 'blink' || k === 'sec') r[k] = YN.includes(v) ? v : d;
      else if (k === 'src') r[k] = typeof v === 'string' && v.length < 300000 && IMG.test(v) ? v : '';
      else if (k === 'target') r[k] = typeof v === 'string' && /^s\d{1,3}$/.test(v) ? v : d;
      else if (typeof d === 'number') r[k] = num(v, d, -1e9, 1e9);
      else r[k] = typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 200) : d;
    }
    return r;
  };
  /* the whole HMI of a project: objects, screens, terminal type and log-in PIN */
  HMI.cleanAll = function (hm) {
    const h = hm && typeof hm === 'object' ? hm : {};
    // ids below h1e9 (the counter stays exact), each id once
    const objects = (Array.isArray(h.objects) ? h.objects : []).map(HMI.clean).filter(Boolean)
      .filter((o, i, a) => (Number(String(o.id).replace(/\D/g, '')) || 0) < 1e9 && a.findIndex(x => x.id === o.id) === i);
    let screens = (Array.isArray(h.screens) ? h.screens : []).filter(s => s && /^s\d{1,3}$/.test(s.id)).slice(0, 30).map(s => ({ id: s.id, name: String(s.name || s.id).slice(0, 30) || s.id }));
    if (!screens.some(s => s.id === 's1')) screens = [{ id: 's1', name: 'Main' }, ...screens];
    const ids = new Set(screens.map(s => s.id));
    objects.forEach(o => { if (!ids.has(o.scr)) o.scr = 's1'; if (o.type === 'nav' && !ids.has(o.target)) o.target = 's1'; });
    const n = list => list.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0);
    return {
      objects, screens, res: Object.prototype.hasOwnProperty.call(RES, h.res) ? h.res : 't7',
      pin: typeof h.pin === 'string' && /^\d{4,8}$/.test(h.pin) ? h.pin : '1234',
      seq: Math.max(Number.isInteger(h.seq) && h.seq >= 0 && h.seq < 1e9 ? h.seq : 0, n(objects)),
    };
  };

  HMI.init = function (el) {
    root = el;
    el.innerHTML = `
      <div class="hmi">
        <div class="hmi-toolbar">
          <div class="seg" title="Machine: the screen runs as on the machine. Studio: design it (add, move, resize objects, screens, terminal type). The PLC's own RUN/PROG is in the status bar."><button data-mode="run" class="on">▶ Machine</button><button data-mode="edit">✎ Studio</button></div>
          <select class="hmi-scr" data-scr title="Screen on display" aria-label="Screen"></select>
          <button class="tbtn" data-full title="Full screen (Esc to leave)">⛶</button>
          <button class="tbtn mobile-only" data-drawer="props">⚙ Props</button>
          <div class="hmi-zoom"><span class="tb-lbl">Zoom</span><button class="tbtn" data-hz="-1" title="Zoom out (Ctrl + scroll)" aria-label="Zoom out">🔍−</button><button class="tbtn zoomv" data-hz="fit" data-hzv title="Fit the screen to the window">Fit</button><button class="tbtn" data-hz="1" title="Zoom in (Ctrl + scroll)" aria-label="Zoom in">🔍＋</button></div>
          <div class="hmi-add">${Object.entries(TYPES).map(([k, t]) => `<button class="tbtn" data-add="${k}">${t.name}</button>`).join('')}</div>
        </div>
        <div class="hmi-main">
          <div class="hmi-stage"><div class="hmi-bezel"><div class="hmi-brand">Operator terminal</div><div class="hmi-screen"></div><div class="hmi-keys"><span></span><span></span><span></span><span></span></div></div></div>
          <aside class="hmi-props"></aside>
        </div>
      </div>`;
    screen = el.querySelector('.hmi-screen');
    propsEl = el.querySelector('.hmi-props');
    UI.drawer(el.querySelector('[data-drawer="props"]'), propsEl);
    el.querySelector('.hmi-toolbar').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mode) setMode(b.dataset.mode);
      if (b.hasAttribute('data-full')) { const z = root.querySelector('.hmi-bezel'); if (document.fullscreenElement) document.exitFullscreen(); else if (z.requestFullscreen) z.requestFullscreen().catch(() => UI.toast('Full screen is not available here', 'warn')); }
      if (b.dataset.add) add(b.dataset.add);
      if (b.dataset.hz) setZoom(b.dataset.hz === 'fit' ? 'fit' : (zoomK() * (b.dataset.hz > 0 ? 1.15 : 1 / 1.15)));
    });
    root.querySelector('.hmi-stage').addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(zoomK() * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }, { passive: false });
    el.querySelector('[data-scr]').addEventListener('change', ev => HMI.goto(ev.target.value));
    screen.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    setMode('run');
    HMI.watchSize();
  };

  /* Studio can switch “Needs log-in” off, so with secured objects it needs the PIN; back on the Machine you are logged out */
  const secured = () => hmi().objects.some(o => o.sec === 'yes');
  function setMode(m) {
    if (App.project && m === 'edit' && mode !== 'edit' && secured() && !user) { login(() => setMode('edit')); return; }
    if (m === 'run' && mode === 'edit' && user) { user = false; App.log('operator', 'HMI: logged out (back to Machine)'); }
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
    const o = { id: 'h' + hmi().seq, type, scr: cur, x: 40 + n * 20, y: 60 + n * 20, w: t.w, h: t.h, ...JSON.parse(JSON.stringify(t.d)), vis: '' };
    hmi().objects.push(o);
    sel = o.id;
    App.save();
    HMI.render();
  }
  function objAt(e) { const el = e.target.closest('.hobj'); return el ? hmi().objects.find(o => o.id === el.dataset.id) : null; }
  function scale() { return screen.getBoundingClientRect().width / dims()[0]; }
  /* show another screen (Go to Screen buttons, the screen list) */
  HMI.goto = function (id) {
    if (!hmi().screens.some(s => s.id === id) || id === cur) return;
    cur = id; sel = null;
    App.log('operator', `HMI screen “${hmi().screens.find(s => s.id === id).name}”`);
    HMI.render();
  };
  HMI.screen = () => cur;

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
    if (o.type === 'pb') e.preventDefault();
    const mom = press(o);
    if (mom) drag = { mom };
  }
  /* operate a runtime object (screen or the HMI terminal in the Wiring); returns the release for a momentary button */
  function press(o) {
    const plc = App.plc;
    let mom = null;
    if (o.sec === 'yes' && !user) { UI.toast('Log in first (Log in / out button on the screen)', 'warn'); App.log('operator', `HMI “${o.label}” refused: not logged in`); return null; }
    if (o.type === 'nav') { HMI.goto(o.target); return null; }
    if (o.type === 'login') {
      if (user) { user = false; App.log('operator', 'HMI: logged out'); HMI.render(); return null; }
      login(() => HMI.render());
      return null;
    }
    if (o.type === 'pb') {
      if (o.mode === 'momentary') { plc.write(o.tag, 1); const tag = o.tag; mom = App.hold('hmi:' + tag, () => App.plc.write(tag, 0)); }
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
    return mom;
  }
  function login(done) {
    UI.form('Log in', [{ key: 'p', label: 'PIN', value: '', type: 'password' }], v => {
      if (v.p !== hmi().pin) { App.log('operator', 'HMI: wrong PIN'); return 'Wrong PIN'; }
      user = true; App.log('operator', 'HMI: logged in'); done(); return undefined;
    });
  }
  const held = new Map();
  /* press / release an object by id (the HMI terminal mounted in the Wiring) */
  HMI.pressId = function (id, ev) {
    const o = hmi().objects.find(x => x.id === id); if (!o) return;
    if (ev === 'down') { const r = press(o); if (r) held.set(id, r); }
    else if (held.has(id)) { held.get(id)(); held.delete(id); }
  };
  /* the screen as SVG in its 800×480 coordinates, with live values: key changes whenever the picture does */
  let ver = 0;
  HMI.mini = function () {
    const plc = App.plc, [W, Hh] = dims(), objs = hmi().objects.filter(o => (o.scr || 's1') === cur && visible(o));
    const vals = objs.map(o => (o.tag ? plc.read(o.tag) : 0));
    // ver changes on every edit: cheaper than comparing the objects (pictures are big data URLs) every frame
    const key = vals.join(',') + '|' + cur + '|' + W + '|' + user + '|' + ver + '|' + hmi().objects.length + '|' + objs.map(o => o.id).join(',') + (objs.some(o => o.blink === 'yes') ? '|' + Math.floor(performance.now() / 500) % 2 : '');
    const on = (o, v) => !!v && !(o.blink === 'yes' && Math.floor(performance.now() / 500) % 2);
    const T = (x, y, s, size, fill = '#e8eef3', anchor = 'middle') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-family="sans-serif">${esc(s)}</text>`;
    const svg = objs.map((o, i) => {
      const v = vals[i], { x, y, w, h } = o, cx = x + w / 2;
      switch (o.type) {
        case 'pb': return `<g class="part" data-part="h:${esc(o.id)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${col(o.color)}" opacity="${v ? 1 : 0.85}" stroke="${v ? '#fff' : '#000'}" stroke-width="${v ? 4 : 2}"/>${T(cx, y + h / 2 + 8, o.label, 22, '#fff')}</g>`;
        case 'ind': return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.shape === 'round' ? h / 2 : 6}" fill="${col(v ? o.onColor : o.offColor)}"/>${T(cx, y + 20, o.label, 14)}${T(cx, y + h - 12, v ? o.onText : o.offText, 20, '#fff')}`;
        case 'lamp': return `<circle cx="${cx}" cy="${y + h * 0.4}" r="${Math.min(w, h) * 0.3}" fill="${col(v ? o.onColor : o.offColor)}" stroke="#000" stroke-width="2"/>${T(cx, y + h - 6, o.label, 14)}`;
        case 'num': case 'entry': return `<g ${o.type === 'entry' ? `class="part" data-part="h:${esc(o.id)}"` : ''}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#1f2a33" stroke="#4a5a66"/>${T(x + 8, y + 18, o.label, 14, '#9fb0bd', 'start')}${T(x + w - 8, y + h - 12, (v * (Number(o.scale) || 1)).toFixed(Number(o.dec) || 0) + (o.units ? ' ' + o.units : ''), 24, '#fff', 'end')}</g>`;
        case 'bar': case 'tank': {
          const lo = Number(o.min) || 0, hi = Number(o.max) || 100, f = Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)));
          return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#1f2a33" stroke="#4a5a66"/><rect x="${x + 6}" y="${y + 6 + (h - 12) * (1 - f)}" width="${w - 12}" height="${(h - 12) * f}" fill="${col(o.color, '#2f6fd6')}"/>${T(cx, y + 18, o.label, 14)}`;
        }
        case 'motor': return `<circle cx="${cx}" cy="${y + h / 2}" r="${Math.min(w, h) * 0.42}" fill="${v ? '#2fa84f' : '#5b5953'}" stroke="#000" stroke-width="2"/>${T(cx, y + h / 2 + 7, o.label, 18, '#fff')}`;
        case 'alarm': return v ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#d33a2c"/>${T(cx, y + h / 2 + 7, '⚠ ' + o.label, 20, '#fff')}` : '';
        case 'text': return T(x, y + (Number(o.size) || 18), o.label, Number(o.size) || 18, col(o.color, '#ffffff'), 'start');
        case 'rect': return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${col(on(o, v) ? o.onColor : o.offColor)}"/>${o.label ? T(cx, y + h / 2 + 6, o.label, 16, '#fff') : ''}`;
        case 'ellipse': return `<ellipse cx="${cx}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${col(on(o, v) ? o.onColor : o.offColor)}"/>${o.label ? T(cx, y + h / 2 + 6, o.label, 16, '#fff') : ''}`;
        case 'line': return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" fill="${col(on(o, v) ? o.onColor : o.offColor)}"/>`;
        case 'trend': return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#0f171f" stroke="#4a5a66"/><path d="${trendPath(o, w, h, x, y)}" fill="none" stroke="${col(o.color)}" stroke-width="3"/>${T(x + 8, y + 18, o.label, 14, '#9fb0bd', 'start')}`;
        case 'image': return o.src ? `<image href="${esc(o.src)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>` : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#4a5a66" stroke-dasharray="6 4"/>`;
        case 'nav': return `<g class="part" data-part="h:${esc(o.id)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${col(o.color)}"/>${T(cx, y + h / 2 + 7, o.label, 20, '#fff')}</g>`;
        case 'login': return `<g class="part" data-part="h:${esc(o.id)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${user ? '#2fa84f' : '#5b5953'}"/>${T(cx, y + h / 2 + 7, user ? 'LOGOUT' : o.label, 20, '#fff')}</g>`;
      }
      return '';
    }).join('');
    return { key, svg, w: W, h: Hh };
  };
  /* trend line of the last span seconds, scaled into a w×h box at x, y */
  function trendPath(o, w, h, x = 0, y = 0) {
    const pts = hist.get(o.id) || [], now = performance.now(), span = Math.max(2, Number(o.span) || 30) * 1000;
    const lo = Number(o.min) || 0, hi = Number(o.max) || 100;
    return pts.filter(([t]) => now - t <= span).map(([t, v], i) => `${i ? 'L' : 'M'}${(x + w - (now - t) / span * w).toFixed(1)} ${(y + h - 6 - Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1))) * (h - 26)).toFixed(1)}`).join(' ');
  }
  const visible = o => !o.vis || !!App.plc.read(o.vis);
  function onMove(e) {
    if (!drag || !drag.o) return;
    const dx = (e.clientX - drag.sx) / drag.k, dy = (e.clientY - drag.sy) / drag.k;
    const o = drag.o, g = v => Math.round(v / 10) * 10;
    const [W, Hh] = dims();
    if (drag.rs) { o.w = Math.max(10, g(drag.ow + dx)); o.h = Math.max(10, g(drag.oh + dy)); }
    else { o.x = Math.max(0, Math.min(W - o.w, g(drag.ox + dx))); o.y = Math.max(0, Math.min(Hh - o.h, g(drag.oy + dy))); }
    ver++;
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
      case 'rect': case 'ellipse': return `<div class="h-shape${o.type === 'ellipse' ? ' round' : ''}" data-s>${o.label ? `<span>${esc(o.label)}</span>` : ''}</div>`;
      case 'line': return `<div class="h-shape pipe" data-s></div>`;
      case 'trend': return `<div class="h-trend"><small>${esc(o.label)}</small><b data-t></b><svg viewBox="0 0 ${o.w} ${o.h}" preserveAspectRatio="none"><path data-p fill="none" stroke="${col(o.color)}" stroke-width="2.5"/></svg></div>`;
      case 'image': return o.src ? `<img class="h-img" src="${esc(o.src)}" alt="${esc(o.label)}" draggable="false">` : `<div class="h-img empty">🖼 Picture</div>`;
      case 'nav': return `<div class="h-pb nav" style="--c:${col(o.color)}"><span>${esc(o.label)}</span></div>`;
      case 'login': return `<div class="h-pb login"><span data-t>${esc(user ? 'LOGOUT' : o.label)}</span></div>`;
    }
    return '';
  }

  HMI.render = function () {
    ver++;   // every edit ends here
    if (!screen) return;
    if (!hmi().screens.some(s => s.id === cur)) cur = 's1';
    const [W, Hh] = dims();
    Object.assign(screen.style, { width: W + 'px', height: Hh + 'px' });
    root.querySelector('.hmi-brand').textContent = `Operator terminal · ${RES[hmi().res || 't7'][2]} · ${W}×${Hh}`;
    const ss = root.querySelector('[data-scr]');
    ss.innerHTML = hmi().screens.map(s => `<option value="${s.id}" ${s.id === cur ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    ss.hidden = mode !== 'edit' && hmi().screens.length < 2;
    const objs = hmi().objects.filter(o => (o.scr || 's1') === cur);
    screen.innerHTML = objs.map(o => `<div class="hobj t-${esc(o.type)}${sel === o.id ? ' sel' : ''}" data-id="${esc(o.id)}" style="left:${Number(o.x) || 0}px;top:${Number(o.y) || 0}px;width:${Number(o.w) || 0}px;height:${Number(o.h) || 0}px">${inner(o)}${mode === 'edit' ? '<span class="rs"></span>' : ''}</div>`).join('') +
      (objs.length ? '' : `<div class="hmi-empty">Empty screen — switch to <b>Edit</b> and add objects.</div>`);
    els = objs.map(o => {
      const el = screen.querySelector(`[data-id="${o.id}"]`);
      return { o, el, t: el.querySelector('[data-t]'), f: el.querySelector('[data-f]'), l: el.querySelector('[data-l]'), r: el.querySelector('[data-r]'), s: el.querySelector('[data-s]'), p: el.querySelector('[data-p]'), last: null };
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
    const [W, Hh] = dims();
    return Math.max(0.25, Math.min(1.25, (stage.clientWidth - 40) / (W + 60), stage.clientHeight > 200 ? (stage.clientHeight - 30) / (Hh + 100) : 9));
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
    const [W, Hh] = dims(), bz = root.querySelector('.hmi-bezel');
    bz.style.setProperty('--k', k); bz.style.setProperty('--w', W + 'px'); bz.style.setProperty('--h', Hh + 'px');
    const v = root.querySelector('[data-hzv]');
    v.textContent = hz === 'fit' ? `Fit · ${Math.round(k * 100)}%` : Math.round(k * 100) + '%';
    v.classList.toggle('fit', hz === 'fit');
  }
  HMI.onShow = () => requestAnimationFrame(fitScreen);
  let hmiRO = null;
  HMI.watchSize = () => { if (!hmiRO && root) { hmiRO = new ResizeObserver(() => { if (root.offsetParent) fitScreen(); }); hmiRO.observe(root.querySelector('.hmi-stage')); } };
  window.addEventListener('resize', () => { if (root && root.offsetParent) fitScreen(); });

  /* trends sample all the time (every 200 ms), whichever screen or view is on display: the app tick calls this too */
  HMI.sample = function (now = performance.now()) {
    if (!App.project || !App.plc) return;
    const plc = App.plc;
    for (const o of hmi().objects) if (o.type === 'trend') {
      const h = hist.get(o.id) || []; if (!h.length || now - h[h.length - 1][0] >= 200) { h.push([now, plc.read(o.tag)]); while (h.length && now - h[0][0] > 120000) h.shift(); hist.set(o.id, h); }
    }
  };
  HMI.update = function () {
    const plc = App.plc, now = performance.now();
    HMI.sample(now);
    const blinkOff = Math.floor(now / 500) % 2;
    for (const x of els) {
      const o = x.o;
      const v = o.tag ? plc.read(o.tag) : 0, shown = visible(o);
      const key = v + '|' + shown + '|' + (o.type === 'motor' || o.type === 'trend' ? Math.floor(now / 200) : '') + (o.blink === 'yes' ? blinkOff : '') + (o.type === 'login' ? user : '');
      if (key === x.last) continue;
      x.last = key;
      x.el.style.visibility = shown ? '' : (mode === 'edit' ? '' : 'hidden');
      x.el.classList.toggle('hid', !shown);
      switch (o.type) {
        case 'rect': case 'ellipse': case 'line': x.s.style.background = col(v && !(o.blink === 'yes' && blinkOff) ? o.onColor : o.offColor); break;
        case 'trend': x.p.setAttribute('d', trendPath(o, o.w, o.h)); x.t.textContent = String(v); break;
        case 'login': x.t.textContent = user ? 'LOGOUT' : o.label; x.el.classList.toggle('on', user); break;
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

  /* the real I/O points of the hardware, in the project's address style */
  function hwTags() {
    const io = Circuit.addrBook(App.project.circuit, App.project.io, App.project.addr || 'file').points;
    return [...io.O, ...io.I].map(App.fmt);
  }
  function renderProps() {
    if (!propsEl) return;
    const o = hmi().objects.find(o => o.id === sel);
    if (mode !== 'edit') {
      propsEl.innerHTML = `<div class="side-head"><h4>HMI — Machine</h4></div><div class="props"><p class="help">▶ Machine: the screen runs as on the machine. Touch the buttons; <b>Go to Screen</b> buttons change the screen. HMI buttons write to PLC tags (use <code>B3</code> bits — never physical inputs). Indicators read any tag.</p>
      <p class="help">${user ? '🔓 Logged in.' : '🔒 Not logged in: buttons marked “Needs log-in” are locked.'}</p>
      <p class="help">Switch to <b>✎ Studio</b> to add objects and screens, pick the terminal type, drag to move, drag the corner to resize, <b>Del</b> to delete.</p>
      <h5>Tags on this screen</h5><ul class="taglist">${hmi().objects.filter(o => o.tag).map(o => `<li><code title="${esc(o.tag)}">${esc(App.fmt(o.tag))}</code> ${esc(o.label)}</li>`).join('') || '<li class="help">none</li>'}</ul></div>`;
      return;
    }
    if (!o) { renderScreenProps(); return; }
    const keys = [...Object.keys(TYPES[o.type].d), 'vis'];
    propsEl.innerHTML = `<div class="side-head"><h4>${TYPES[o.type].name}</h4></div><div class="props">${keys.map(k => {
      const v = o[k];
      let input;
      if (k === 'mode') input = `<select data-k="mode">${MODES.map(m => `<option ${v === m ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
      else if (k === 'shape') input = `<select data-k="shape">${SHAPES.map(m => `<option ${v === m ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
      else if (k === 'blink' || k === 'sec') input = `<select data-k="${k}">${YN.map(m => `<option ${v === m ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
      else if (k === 'target') input = `<select data-k="target">${hmi().screens.map(s => `<option value="${s.id}" ${v === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
      else if (k === 'src') input = `<span class="btn-row"><button class="btn" data-img>Choose picture…</button>${v ? '<button class="btn" data-noimg>Remove</button>' : ''}</span>`;
      else if (/color/i.test(k)) input = `<div class="swatches">${COLORS.map(c => `<button class="sw${v === c ? ' on' : ''}" data-ck="${k}" data-cv="${c}" style="background:${c}"></button>`).join('')}</div>`;
      else input = `<input data-k="${k}" value="${esc(k === 'tag' || k === 'vis' ? App.fmt(v || '') : v)}" ${k === 'tag' || k === 'vis' ? 'list="hmiTags" spellcheck="false"' : ''}>`;
      return `<label class="field"><span>${PROPS[k] || k}</span>${input}</label>`;
    }).join('')}
      <datalist id="hmiTags">${[...hwTags(), 'B3:0/0', 'B3:0/1', 'B3:0/2', 'B3:0/3', 'N7:0', 'N7:1', 'T4:0.ACC', 'T4:0.PRE', 'C5:0.ACC', 'C5:0.PRE', 'T4:0/DN', 'C5:0/DN'].map(t => `<option value="${esc(t)}">`).join('')}</datalist>
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
      // a tag can be typed in any address style; it is stored file-based
      if ((i.dataset.k === 'tag' || i.dataset.k === 'vis') && v.trim()) { v = App.addrIn(v); const p = PLCcore.parse(v); if (p) v = p.norm; }
      o[i.dataset.k] = v; App.save(); HMI.render();
    }));
    propsEl.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => { o[b.dataset.ck] = b.dataset.cv; App.save(); HMI.render(); });
    const pick = propsEl.querySelector('[data-img]');
    if (pick) pick.onclick = () => choosePicture(src => { o.src = src; App.save(); HMI.render(); });
    const noimg = propsEl.querySelector('[data-noimg]');
    if (noimg) noimg.onclick = () => { o.src = ''; App.save(); HMI.render(); };
    propsEl.querySelector('[data-del]').onclick = () => { hmi().objects = hmi().objects.filter(x => x.id !== o.id); sel = null; App.save(); HMI.render(); };
    propsEl.querySelector('[data-dup]').onclick = () => {
      hmi().seq = (hmi().seq || 0) + 1;
      const n = { ...JSON.parse(JSON.stringify(o)), id: 'h' + hmi().seq, x: o.x + 20, y: o.y + 20 };
      hmi().objects.push(n); sel = n.id; App.save(); HMI.render();
    };
  }
  /* Studio with nothing selected: terminal type, screens and the log-in PIN */
  function renderScreenProps() {
    const h = hmi(), s = h.screens.find(x => x.id === cur);
    propsEl.innerHTML = `<div class="side-head"><h4>HMI — Studio</h4></div><div class="props">
      <label class="field"><span>Terminal type</span><select data-res>${Object.entries(RES).map(([k, [w, hh, n]]) => `<option value="${k}" ${h.res === k ? 'selected' : ''}>${n} · ${w}×${hh}</option>`).join('')}</select></label>
      <h5>Screens</h5><ul class="taglist">${h.screens.map(x => `<li>${x.id === cur ? '▶ ' : ''}<a href="#" data-go="${x.id}">${esc(x.name)}</a> <small>(${h.objects.filter(o => (o.scr || 's1') === x.id).length} objects)</small></li>`).join('')}</ul>
      <div class="btn-row"><button class="btn" data-sadd>＋ Screen</button><button class="btn" data-sren>Rename “${esc(s.name)}”</button>${cur !== 's1' ? '<button class="btn danger" data-sdel>Delete screen</button>' : ''}</div>
      <label class="field"><span>Log-in PIN (4–8 digits)</span><input data-pin type="password" value="${esc(h.pin)}" inputmode="numeric" autocomplete="new-password"></label>
      <p class="help">Add objects from the toolbar, then select one to bind a tag. <b>Go to Screen</b> buttons move between screens; <b>Log in / out</b> unlocks buttons marked “Needs log-in”. Any object can be shown only while a tag is 1 (Visible when…).</p></div>`;
    propsEl.querySelector('[data-res]').onchange = ev => { h.res = ev.target.value; App.log('system', `HMI terminal: ${RES[h.res][2]}`); App.save(); HMI.render(); };
    propsEl.querySelectorAll('[data-go]').forEach(a => { a.onclick = ev => { ev.preventDefault(); HMI.goto(a.dataset.go); }; });
    // a saved HMI keeps 30 screens (cleanAll)
    propsEl.querySelector('[data-sadd]').onclick = () => (h.screens.length >= 30 ? UI.toast('An HMI has at most 30 screens', 'warn') : UI.form('New screen', [{ key: 'n', label: 'Name', value: 'Screen ' + (h.screens.length + 1) }], v => {
      const n = v.n.trim().slice(0, 30); if (!n) return 'Type a name';
      let i = 2; while (h.screens.some(x => x.id === 's' + i)) i++;
      h.screens.push({ id: 's' + i, name: n }); cur = 's' + i; App.save(); HMI.render(); return undefined;
    }));
    propsEl.querySelector('[data-sren]').onclick = () => UI.form('Rename screen', [{ key: 'n', label: 'Name', value: s.name }], v => { const n = v.n.trim().slice(0, 30); if (!n) return 'Type a name'; s.name = n; App.save(); HMI.render(); return undefined; });
    const del = propsEl.querySelector('[data-sdel]');
    if (del) del.onclick = () => { h.objects = h.objects.filter(o => (o.scr || 's1') !== cur); h.objects.forEach(o => { if (o.type === 'nav' && o.target === cur) o.target = 's1'; }); h.screens = h.screens.filter(x => x.id !== cur); cur = 's1'; App.save(); HMI.render(); };
    propsEl.querySelector('[data-pin]').onchange = ev => { if (/^\d{4,8}$/.test(ev.target.value)) { h.pin = ev.target.value; App.save(); } else { UI.toast('The PIN is 4 to 8 digits', 'warn'); ev.target.value = h.pin; } };
  }
  /* a picture from a file, scaled down to at most 400 px and stored in the project */
  function choosePicture(done) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/gif,image/webp';
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const img = new Image(), url = URL.createObjectURL(f);
      img.onload = () => {
        const k = Math.min(1, 400 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        const data = c.toDataURL(f.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
        if (data.length > 290000) { UI.toast('The picture is too big', 'warn'); return; }
        done(data);
      };
      img.onerror = () => UI.toast('This file is not a picture', 'warn');
      img.src = url;
    };
    inp.click();
  }
  HMI.resetSel = () => { sel = null; cur = 's1'; user = false; hist.clear(); ver++; if (root && mode === 'edit' && App.project && secured()) setMode('run'); };   // a project with a PIN opens on the Machine
  window.HMI = HMI;
})();
