/* Panel & Plant view: operator panel (pilot devices), plant equipment, power & cabinet,
   all live and operable — the same devices as in the wiring, drawn larger. */
(function () {
  'use strict';
  const esc = UI.esc;
  const { DEFS } = Circuit;
  const PV = {};
  let root, cards = [], active = null;
  const SECTIONS = [
    ['panel', 'Operator Panel', 'Push buttons, selectors and pilot lights on the panel door.'],
    ['plant', 'Plant / Equipment', 'Motors, conveyor, tank, cylinder and field sensors.'],
    ['power', 'Power & Protection', 'Supplies, breakers and overload relays.'],
    ['cabinet', 'Control Cabinet', 'PLC, contactors, relays, timers and power supplies.'],
  ];
  const SCALE = { panel: 1.5, plant: 1.3, power: 1, cabinet: 0.95 };

  PV.init = function (el) {
    root = el;
    el.addEventListener('pointerdown', e => {
      const p = e.target.closest('[data-part]'), card = e.target.closest('.pcard');
      if (!p || !card) return;
      const c = App.project.circuit.comps.find(c => c.id === card.dataset.cid);
      if (!c) return;
      e.preventDefault();
      Circuit.part(c, p.dataset.part, 'down', App.ctx);
      active = { c, part: p.dataset.part };
      App.save();
    });
    window.addEventListener('pointerup', () => { if (active) { Circuit.part(active.c, active.part, 'up', App.ctx); active = null; } });
  };

  PV.render = function () {
    if (!root) return;
    const comps = App.project.circuit.comps;
    const html = SECTIONS.map(([key, title, sub]) => {
      const list = comps.filter(c => DEFS[c.type].view === key);
      if (!list.length) return '';
      return `<section class="psec psec-${key}"><header><h3>${title}</h3><p>${sub}</p></header><div class="pgrid">${list.map(c => {
        const d = DEFS[c.type], k = SCALE[key];
        return `<div class="pcard" data-cid="${c.id}"><div class="pcard-head"><b>${esc(c.props.label)}</b><span>${esc(d.name)}</span></div>
          <svg viewBox="-4 -4 ${d.w + 8} ${d.h + 8}" style="--pw:${Math.round((d.w + 8) * k)}px"></svg>
          <div class="pcard-foot" data-st></div></div>`;
      }).join('')}</div></section>`;
    }).join('');
    root.innerHTML = `<div class="panel-view">${html || `<div class="empty"><h3>Nothing to show yet</h3><p>Add devices in the <b>Wiring</b> tab, or load an example from the top bar.</p></div>`}</div>`;
    cards = [...root.querySelectorAll('.pcard')].map(el => ({ el, svg: el.querySelector('svg'), st: el.querySelector('[data-st]'), c: comps.find(c => c.id === el.dataset.cid), sig: null, stt: null }));
    PV.update();
  };

  PV.update = function () {
    const ctx = App.ctx;
    for (const k of cards) {
      if (!k.c) continue;
      const s = Circuit.sig(k.c, ctx);
      if (s !== k.sig) { k.svg.innerHTML = Circuit.draw(k.c, ctx); k.sig = s; }
      const t = Circuit.status(k.c, ctx);
      if (t !== k.stt) { k.st.textContent = t; k.stt = t; }
    }
  };
  window.PanelView = PV;
})();
