/* Tagalog / English: the English UI is translated in place. Text nodes and the title, placeholder and aria-label
   of elements whose whole text is in the dictionary are swapped; the English is kept so switching back restores it.
   Technical terms (RUN, PROG, Ladder, rung, wire…) stay in English, as they are used in Philippine practice. */
(function () {
  'use strict';
  const TL = {
    // top bar, menus
    'Examples ▾': 'Mga Halimbawa ▾', 'File ▾': 'File ▾', 'Help ▾': 'Tulong ▾', '⤓ Install app': '⤓ I-install ang app',
    'Lessons, guide and keyboard shortcuts': 'Mga lesson, gabay at keyboard shortcut', 'Theme': 'Tema',
    'New project…': 'Bagong project…', 'Open project…': 'Buksan ang project…', 'Save': 'I-save', 'Save as…': 'I-save bilang…',
    'Rename project…': 'Palitan ang pangalan ng project…', 'Export to file (.plc.json)': 'I-export sa file (.plc.json)', 'Import from file…': 'Mag-import mula sa file…',
    'Event log': 'Talaan ng mga event', 'Updates…': 'Mga update…', 'Reset PLC data table…': 'I-reset ang PLC data table…',
    '✦ Lessons & guide': '✦ Mga lesson at gabay', '⌨ Keyboard shortcuts': '⌨ Mga keyboard shortcut', 'Load example': 'Mag-load ng halimbawa',
    'Single view': 'Isang view', 'Custom': 'Sariling ayos', '📋 Events': '📋 Mga event', '▦ View': '▦ Ayos',
    // status bar, update bar
    'Saved': 'Naka-save', 'Saving…': 'Nagse-save…', 'Restart to update': 'I-restart para mag-update', '⟳ Restart to update': '⟳ I-restart para mag-update',
    'Later': 'Mamaya', "What's new": 'Ano ang bago',
    // common buttons
    'Cancel': 'Kanselahin', 'Close': 'Isara', 'Apply': 'Ilapat', 'Delete': 'Burahin', 'Duplicate': 'Doblehin', 'Repair': 'Ayusin',
    'Same size for all': 'Parehong laki lahat', 'Remove all': 'Alisin lahat', 'Disable': 'I-disable', 'Enable': 'I-enable', 'Reset': 'I-reset',
    'Read I/O Config': 'Basahin ang I/O Config', '+ Screen': '＋ Screen', '＋ Screen': '＋ Screen',
    // ladder
    '✓ Verify': '✓ Suriin', 'Verify project': 'Suriin ang project', '＋ Rung': '＋ Rung', '⑂ Branch': '⑂ Branch', '＋ File': '＋ File',
    'Data Files': 'Mga Data File', 'Forces': 'Mga Force', 'Click a bit to toggle it.': 'I-click ang bit para palitan.',
    'Click a value to edit.': 'I-click ang value para i-edit.', 'Click PRE/ACC to edit.': 'I-click ang PRE/ACC para i-edit.',
    'Inputs follow field wiring. Force to test logic without hardware.': 'Sumusunod ang inputs sa field wiring. I-force para masubukan ang logic kahit walang hardware.',
    'Outputs are written by the ladder; forcing overrides the physical output terminal.': 'Ang ladder ang nagsusulat sa outputs; nilalampasan ng force ang totoong output terminal.',
    'No forces installed. Right-click an I/O instruction or use F1/F0 above.': 'Walang force. I-right-click ang I/O instruction o gamitin ang F1/F0 sa itaas.',
    'Program has errors — fix them before going to RUN': 'May error ang program — ayusin muna bago mag-RUN',
    'Zoom': 'Zoom', 'Address': 'Address', 'Rung': 'Rung',
    // wiring
    'Search components…': 'Maghanap ng piyesa…', 'Collapse all': 'Isara lahat', 'Expand all': 'Buksan lahat', '⊟ Collapse all': '⊟ Isara lahat', '⊞ Expand all': '⊞ Buksan lahat',
    'Collapse all groups': 'Isara ang lahat ng grupo', 'Expand all groups': 'Buksan ang lahat ng grupo', 'Select': 'Pumili', 'Meter': 'Metro',
    'Live voltage': 'Live na boltahe', 'Wire labels': 'Label ng wire', 'Fit': 'Ipagkasya', '⤢ Fit': '⤢ Ipagkasya',
    'Live voltage colors': 'Kulay ng live na boltahe', 'Tips': 'Mga tip', 'Workspace': 'Workspace',
    // electrical diagram
    '✎ Edit': '✎ I-edit', '☝ Operate': '☝ Paganahin', '▶ Play': '▶ Paandarin', '■ Stop': '■ Itigil', '✎ Values': '✎ Mga value',
    'Back': 'Likod', 'Front': 'Harap', '⟳ Rotate': '⟳ Iikot', '⧉ Duplicate': '⧉ Doblehin', '🗑 Delete': '🗑 Burahin', '↶ Undo': '↶ Ibalik', '↷ Redo': '↷ Ulitin',
    '▦ Library': '▦ Library', 'How it works': 'Paano ito gumagana', 'Add a current path': 'Magdagdag ng current path', 'Add a motor feeder': 'Magdagdag ng motor feeder',
    '+ Add a current path': '＋ Magdagdag ng current path', '+ Add a motor feeder': '＋ Magdagdag ng motor feeder',
    // HMI
    '▶ Machine': '▶ Makina', '✎ Studio': '✎ Studio', 'Terminal type': 'Uri ng terminal', 'Screens': 'Mga screen',
    // toasts and messages
    'Welcome! A PLC motor-control example is loaded. Start with the lessons or press RUN.': 'Maligayang pagdating! May naka-load na PLC motor-control example. Magsimula sa mga lesson o pindutin ang RUN.',
    'Data table cleared': 'Na-clear ang data table', 'Rung copied': 'Na-copy ang rung', 'Select a symbol first': 'Pumili muna ng symbol',
  };
  const I18N = { lang: 'en', TL };
  try { I18N.lang = localStorage.getItem('plc-trainer.lang') === 'tl' ? 'tl' : 'en'; } catch (e) { /* private mode */ }
  const orig = new WeakMap();     // text node → English text
  const last = new WeakMap();     // text node → the text this module wrote (anything else was written by the app: new English)
  const origAttr = new WeakMap(); // element → { attr: English }
  const lastAttr = new WeakMap();
  const ATTRS = ['title', 'placeholder', 'aria-label'];
  function tText(n) {
    const en = orig.has(n) && n.nodeValue === last.get(n) ? orig.get(n) : n.nodeValue, key = en.trim();
    if (!key || !(key in TL)) { orig.delete(n); return; }
    orig.set(n, en);
    const want = I18N.lang === 'tl' ? en.replace(key, TL[key]) : en;
    if (n.nodeValue !== want) n.nodeValue = want;
    last.set(n, want);
  }
  function tAttrs(el) {
    let m = origAttr.get(el), l = lastAttr.get(el);
    for (const a of ATTRS) {
      const cur = el.getAttribute(a), v = m && a in m && l && cur === l[a] ? m[a] : cur;
      if (!v || !(v.trim() in TL)) continue;
      if (!m) { m = {}; origAttr.set(el, m); l = {}; lastAttr.set(el, l); }
      m[a] = v;
      const want = I18N.lang === 'tl' ? TL[v.trim()] : v;
      if (cur !== want) el.setAttribute(a, want);
      l[a] = want;
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { tText(root); return; }
    if (root.nodeType !== 1 || root.closest && root.closest('svg, code, textarea, [contenteditable]')) return;
    tAttrs(root);
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: n => (n.nodeType === 1 && /^(SVG|svg|CODE|TEXTAREA|SCRIPT|STYLE)$/.test(n.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = it.nextNode(); n; n = it.nextNode()) { if (n.nodeType === 3) tText(n); else tAttrs(n); }
  }
  let obs = null, busy = false;
  I18N.apply = function () {
    if (!document.body) return;
    busy = true; walk(document.body); busy = false;
    document.documentElement.lang = I18N.lang === 'tl' ? 'tl' : 'en';
    const b = document.querySelector('[data-lang-btn]');
    if (b) { b.textContent = I18N.lang === 'tl' ? 'TL' : 'EN'; b.title = I18N.lang === 'tl' ? 'Wika: Tagalog (i-click para English)' : 'Language: English (click for Tagalog)'; }
    if (!obs) {
      obs = new MutationObserver(list => {
        if (busy || I18N.lang === 'en') return;
        busy = true;
        for (const m of list) { if (m.type === 'characterData') tText(m.target); else if (m.type === 'attributes') tAttrs(m.target); else m.addedNodes.forEach(walk); }
        busy = false;
      });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
  };
  I18N.set = function (l) {
    I18N.lang = l === 'tl' ? 'tl' : 'en';
    try { localStorage.setItem('plc-trainer.lang', I18N.lang); } catch (e) { /* private mode */ }
    I18N.apply();
  };
  window.I18N = I18N;
})();
