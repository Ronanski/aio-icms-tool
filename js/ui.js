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
  };

  UI.modal = function ({ title, body, buttons = [{ label: 'Close' }], wide = false, onOpen }) {
    const root = document.getElementById('modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${UI.esc(title)}</h3><button class="icon-btn" data-x aria-label="Close">×</button></div>
      <div class="modal-body"></div><div class="modal-foot"></div></div>`;
    const bodyEl = wrap.querySelector('.modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    const foot = wrap.querySelector('.modal-foot');
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); };
    const run = b => { if (b.onClick && b.onClick(bodyEl) === false) return; close(); };
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
      btn.textContent = b.label;
      btn.onclick = () => run(b);
      foot.appendChild(btn);
    });
    wrap.querySelector('[data-x]').onclick = close;
    wrap.addEventListener('pointerdown', e => { if (e.target === wrap) close(); });
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
        const p = buttons.find(b => b.primary);
        if (p) { e.preventDefault(); e.stopPropagation(); run(p); }
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
  UI.form = function (title, fields, onOk, extraHtml = '') {
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
      title, body: html,
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

  UI.confirm = (title, msg, onYes, label = 'OK') => UI.modal({
    title, body: `<p>${UI.esc(msg)}</p>`,
    buttons: [{ label: 'Cancel' }, { label, primary: true, onClick: () => { onYes(); } }]
  });

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
  };
  UI._menuAway = e => { if (!e.target.closest('#ctxMenu')) UI.closeMenu(); };
  UI.closeMenu = () => {
    const m = document.getElementById('ctxMenu');
    if (m) m.remove();
    document.removeEventListener('pointerdown', UI._menuAway, true);
  };

  UI.isTyping = () => {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
  };

  window.UI = UI;
})();
