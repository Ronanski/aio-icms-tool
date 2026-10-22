/* Small UI helpers: modal dialogs, forms, context menus, toasts. */
(function () {
  'use strict';
  const UI = {};

  UI.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  UI.toast = function (msg, kind = 'info', ms = 2800) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
    return el;
  };

  UI.modal = function ({ title, body, buttons = [{ label: 'Close' }], wide = false, onOpen, onClose }) {
    const root = document.getElementById('modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${UI.esc(title)}</h3><button class="icon-btn" data-x aria-label="Close">×</button></div>
      <div class="modal-body"></div><div class="modal-foot"></div></div>`;
    const bodyEl = wrap.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    const foot = wrap.querySelector('.modal-foot');
    // onClose runs once, however the dialog closes (a button, ×, Escape, a click outside)
    let closed = false;
    // focus goes back where it was when the dialog closes (keyboard users keep their place)
    const back = document.activeElement;
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); if (!closed) { closed = true; if (onClose) onClose(); if (back && back.isConnected && typeof back.focus === 'function' && !document.querySelector('#modal-root .modal-wrap')) back.focus(); } };
    const run = b => { if (b.onClick && b.onClick(bodyEl) === false) return; close(); };
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
      btn.textContent = b.label;
      btn.onclick = () => run(b);
      foot.appendChild(btn);
    });
    wrap.querySelector('[data-x]').onclick = close;
    // a click on the backdrop closes the window, but not the second click of the double-click that opened it
    const t0 = Date.now();
    wrap.addEventListener('pointerdown', e => { if (e.target === wrap && Date.now() - t0 > 400) close(); });
    function onKey(e) {
      // a dialog removed without close() lets go of the keys; only the top dialog of a stack answers them
      if (!wrap.isConnected) { document.removeEventListener('keydown', onKey, true); return; }
      const all = root.querySelectorAll('.modal-wrap');
      if (all[all.length - 1] !== wrap) return;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
      // Tab stays inside the dialog
      else if (e.key === 'Tab') {
        const f = [...wrap.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
      }
      // Enter on a focused button presses that button (Cancel stays Cancel); elsewhere it means the primary button
      else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && !(e.target.tagName === 'BUTTON' && wrap.contains(e.target))) {
        const p = buttons.find(b => b.primary);
        if (p) { e.preventDefault(); e.stopImmediatePropagation(); run(p); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    root.appendChild(wrap);
    if (onOpen) onOpen(bodyEl);
    const first = bodyEl.querySelector('input,select,textarea');
    if (first) setTimeout(() => { first.focus(); if (first.select) first.select(); }, 20);
    return { close, el: bodyEl };
  };

  /* fields: [{key,label,value,type,options,list,hint,rows}] ; onOk(values) returns error string or nothing */
  UI.form = function (title, fields, onOk, extraHtml = '', opts = {}) {
    const html = fields.map(f => {
      const id = 'f_' + f.key;
      let input;
      if (f.options) {
        input = `<select id="${id}" data-k="${f.key}">${f.options.map(o => {
          const v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o;
          return `<option value="${UI.esc(v)}" ${String(v) === String(f.value) ? 'selected' : ''}>${UI.esc(l)}</option>`;
        }).join('')}</select>`;
      } else if (f.type === 'textarea') {
        input = `<textarea id="${id}" data-k="${f.key}" rows="${f.rows || 4}" spellcheck="false">${UI.esc(f.value)}</textarea>`;
      } else {
        input = `<input id="${id}" data-k="${f.key}" type="${f.type || 'text'}" value="${UI.esc(f.value ?? '')}" ${f.list ? `list="dl_${f.key}"` : ''} autocomplete="off" spellcheck="false">` +
          (f.list ? `<datalist id="dl_${f.key}">${f.list.map(v => `<option value="${UI.esc(v)}">`).join('')}</datalist>` : '');
      }
      return `<label class="field"><span>${UI.esc(f.label)}</span>${input}${f.hint ? `<small>${UI.esc(f.hint)}</small>` : ''}</label>`;
    }).join('') + extraHtml + `<div class="form-err"></div>`;
    return UI.modal({
      title, body: html, onClose: opts.onClose,
      buttons: [{ label: 'Cancel' }, {
        label: 'OK', primary: true, onClick: el => {
          const vals = {};
          el.querySelectorAll('[data-k]').forEach(i => { vals[i.dataset.k] = i.value; });
          const err = onOk(vals);
          if (err) { el.querySelector('.form-err').textContent = err; return false; }
        }
      }]
    });
  };

  // a destructive confirm (delete, remove, replace, reset, clear, discard) is red and starts on Cancel, so Enter does not destroy
  UI.confirm = (title, msg, onYes, label = 'OK') => {
    const danger = /delete|remove|replace|reset|clear|discard|without saving|start over/i.test(label);
    return UI.modal({
      title, body: `<p>${UI.esc(msg)}</p>`,
      buttons: [{ label: 'Cancel' }, { label, primary: true, danger, onClick: () => { onYes(); } }],
      onOpen: danger ? el => setTimeout(() => { const c = el.parentElement.querySelector('.modal-foot .btn'); if (c) c.focus(); }, 30) : undefined,
    });
  };

  UI.menu = function (x, y, items) {
    UI.closeMenu();
    const m = document.createElement('div');
    m.className = 'ctx-menu';
    m.id = 'ctxMenu';
    items.forEach(it => {
      if (it.sep) { m.appendChild(document.createElement('hr')); return; }
      if (it.head) { const h = document.createElement('div'); h.className = 'ctx-head'; h.textContent = it.head; m.appendChild(h); return; }
      const b = document.createElement('button');
      b.textContent = it.label;
      if (it.kbd) { const k = document.createElement('kbd'); k.textContent = it.kbd; b.appendChild(k); }
      if (it.disabled) b.disabled = true;
      if (it.danger) b.className = 'danger';
      b.onclick = () => { UI.closeMenu(); if (it.onClick) it.onClick(); };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 8)) + 'px';
    m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 8)) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', UI._menuAway, true), 0);
    document.addEventListener('keydown', UI._menuKey, true);
  };
  /* a menu answers the keyboard: Escape closes it, the arrows move between its items, Enter presses one */
  UI._menuKey = e => {
    const m = document.getElementById('ctxMenu'); if (!m) return;
    const items = [...m.querySelectorAll('button:not(:disabled)')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); UI.closeMenu(); }
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) {
      e.preventDefault(); e.stopImmediatePropagation();
      const n = items.length, down = e.key === 'ArrowDown';
      items[i < 0 ? (down ? 0 : n - 1) : (i + (down ? 1 : n - 1)) % n].focus();
    }
  };
  UI._menuAway = e => { if (!e.target.closest('#ctxMenu')) UI.closeMenu(); };
  UI.closeMenu = () => {
    const m = document.getElementById('ctxMenu');
    if (m) m.remove();
    document.removeEventListener('pointerdown', UI._menuAway, true);
    document.removeEventListener('keydown', UI._menuKey, true);
  };

  /* Touch: a long press acts as right-click (opens the same context menus).
     Device controls ([data-part]) are excluded so buttons can be held down. */
  UI.longPress = function (root) {
    let timer = null, sx = 0, sy = 0, target = null, fingers = 0;
    const cancel = () => { clearTimeout(timer); timer = null; };
    root.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      fingers++;
      if (fingers > 1 || e.target.closest('[data-part]')) { cancel(); return; }
      sx = e.clientX; sy = e.clientY; target = e.target;
      timer = setTimeout(() => {
        timer = null;
        try { if (navigator.vibrate) navigator.vibrate(15); } catch (err) { /* not supported */ }
        // the view may have re-rendered since touchdown, so look up what is under the finger now
        const el = document.elementFromPoint(sx, sy) || target;
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: sx, clientY: sy }));
      }, 550);
    });
    root.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); });
    const up = e => { if (e.pointerType === 'touch') fingers = Math.max(0, fingers - 1); cancel(); };
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    // the browser's own long-press menu event (Android) replaces ours
    root.addEventListener('contextmenu', e => { if (e.isTrusted) cancel(); }, true);
  };

  /* Narrow screens: a side panel slides in over the content when its button is tapped. */
  UI.drawer = function (btn, panel) {
    const away = e => {
      if (!panel.contains(e.target) && !btn.contains(e.target) && !e.target.closest('.modal-wrap, .ctx-menu')) close();
    };
    function close() {
      panel.classList.remove('open'); btn.classList.remove('on');
      document.removeEventListener('pointerdown', away, true);
    }
    btn.addEventListener('click', () => {
      if (panel.classList.contains('open')) { close(); return; }
      panel.classList.add('open'); btn.classList.add('on');
      setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
    });
    return { close };
  };

  /* a row that scrolls sideways gets .more-l / .more-r while buttons are hidden on that side (CSS fades the edge) */
  UI.scrollCue = function (el) {
    const upd = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle('more-l', max > 2 && el.scrollLeft > 2);
      el.classList.toggle('more-r', max > 2 && el.scrollLeft < max - 2);
    };
    el.addEventListener('scroll', upd, { passive: true });
    new ResizeObserver(upd).observe(el);
    upd();
  };

  UI.isTyping = () => {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
  };

  /* ---------- icons: one monoline set (24 px grid) for every toolbar and dialog button ----------
     Buttons are written with a short glyph in front of their label ("⤓ Download"); the glyph is shown as the matching
     icon, so templates stay plain text and every module gets the same look. Labels and data attributes are untouched. */
  const P = {
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14', upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
    list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01', layout: 'M4 4h16v16H4zM10 4v16M10 12h10',
    plus: 'M12 5v14M5 12h14', check: 'M5 12.5l4.5 4.5L19 7.5', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    fit: 'M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7', refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1', full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1',
    zoomout: 'M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14zM20 20l-4-4M8 11h6', zoomin: 'M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14zM20 20l-4-4M8 11h6M11 8v6',
    undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3', redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
    play: 'M7 5l12 7-12 7z', left: 'M15 6l-6 6 6 6', right: 'M9 6l6 6-6 6',
    folder: 'M3 7h6l2 2h10v10H3z', tag: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
    radar: 'M12 10a2 2 0 1 0 0 4 2 2 0 1 0 0-4zM6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M9.2 9.2a4 4 0 0 0 0 5.6M14.8 9.2a4 4 0 0 1 0 5.6',
    network: 'M9 3h6v5H9zM3 16h6v5H3zM15 16h6v5h-6zM12 8v4M6 16v-4h12v4', link: 'M8 12h8M5 9l-3 3 3 3M19 9l3 3-3 3',
    diff: 'M5 9h14M5 15h14M15 5L9 19', data: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14', branch: 'M3 8h18M7 8v8h10V8',
    first: 'M20 12H8M12 7l-5 5 5 5M4 5v14', last: 'M4 12h12M12 7l5 5-5 5M20 5v14', pencil: 'M4 20h4L19 9l-4-4L4 16z',
    paint: 'M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1.1.9-2 2-2h2a4 4 0 0 0 4-4c0-4.2-4-7.5-9-7.5zM7.5 12h.01M9.5 7.5h.01M14.5 7.5h.01',
    more: 'M5 12h.01M12 12h.01M19 12h.01', collapse: 'M4 4h16v16H4zM8 12h8', expand: 'M4 4h16v16H4zM8 12h8M12 8v8',
    theme: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM12 3v18', moon: 'M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.5 6.5 0 0 0 10 10z',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8',
  };
  UI.icon = (name, extra = '') => (P[name] ? `<svg class="ic${extra ? ' ' + extra : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${P[name]}"/></svg>` : '');
  // the glyph a button starts with → its icon (the longest glyph is tried first)
  const GLYPH = { '🔍−': 'zoomout', '🔍＋': 'zoomin', '🔍+': 'zoomin', '⤓': 'download', '⤒': 'upload', '📋': 'list', '▦': 'layout', '＋': 'plus', '✓': 'check',
    '🗑': 'trash', '⤢': 'fit', '⟳': 'refresh', '⧉': 'copy', '⛶': 'full', '⚙': 'gear', '↶': 'undo', '↷': 'redo', '▶': 'play', '◀': 'left', '🗂': 'folder',
    '🏷': 'tag', '⇆': 'radar', '🖧': 'network', '⇄': 'link', '≠': 'diff', '▤': 'data', '⑂': 'branch', '⇤': 'first', '⇥': 'last', '✎': 'pencil', '🎨': 'paint',
    '⋯': 'more', '⊟': 'collapse', '⊞': 'expand', '◐': 'theme', '☾': 'moon', '☀': 'sun' };
  const KEYS = Object.keys(GLYPH).sort((a, b) => b.length - a.length);
  UI.iconize = function (b) {
    const t = b.firstChild;
    if (!t || t.nodeType !== 3) return;
    const s = t.nodeValue.replace(/^\s+/, ''), k = KEYS.find(g => s.startsWith(g));
    if (!k) return;
    const rest = s.slice(k.length).replace(/^[\s️]+/, '');
    // a lone ▶ next to ◀ moves something right; with a label it is Play
    const name = k === '▶' && !rest && !(b.textContent || '').trim().slice(1) ? 'right' : GLYPH[k];
    t.nodeValue = rest;
    b.insertAdjacentHTML('afterbegin', UI.icon(name, rest || b.childNodes.length > 1 ? '' : 'solo'));
    if (!rest && b.childNodes.length === 1 && !b.getAttribute('aria-label') && b.title) b.setAttribute('aria-label', b.title);
  };
  const BTN = '.tbtn, .btn, .icon-btn, .seg button';
  UI.iconizeAll = root => { if (root.matches && root.matches(BTN)) UI.iconize(root); if (root.querySelectorAll) root.querySelectorAll(BTN).forEach(UI.iconize); };
  if (typeof MutationObserver !== 'undefined') {
    const watch = () => {
      UI.iconizeAll(document.body);
      new MutationObserver(list => list.forEach(m => {
        if (m.type === 'childList') { m.addedNodes.forEach(n => { if (n.nodeType === 1) UI.iconizeAll(n); }); const p = m.target; if (p.nodeType === 1 && p.matches && p.matches(BTN)) UI.iconize(p); }
      })).observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch);
  }

  window.UI = UI;
})();
