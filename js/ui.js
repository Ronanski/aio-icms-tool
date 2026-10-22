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
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); if (!closed) { closed = true; if (onClose) onClose(); } };
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

  window.UI = UI;
})();
