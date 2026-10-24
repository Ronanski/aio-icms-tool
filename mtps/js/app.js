/* MT PLC Studio app: window, menus, toolbars, online bar, organizer, ladder editor, dialogs, tag editor, I/O panel,
   projects (docs/PLC_APP_SPEC.md). One state, three layouts: desktop (mouse), tablet and phone (touch). The layout
   follows the window, so a resized Windows window or a turned tablet switches it live without losing anything. */
(function () {
  'use strict';
  const VERSION = '0.2.0-beta.2';
  const BUILD = 'dev';
  const E = window.MTPS, L = E.Ladder, INSTR = E.INSTR;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const U = s => String(s).toUpperCase();
  const store = {
    get(k, d) { try { const v = localStorage.getItem('mtps.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('mtps.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem('mtps.' + k); } catch (e) { /* ignore */ } },
  };
  const isElectron = /Electron\//.test(navigator.userAgent);

  /* ---------- the emulator (spec section 15): chassis, emulated controllers, I/O cards ----------
     Like a PC emulator dashboard: one or more named chassis; an emulated controller is a card in a slot, with an IP
     address, power and a key switch. The app reaches a controller only through the project path, over the emulated
     Ethernet to a controller with an IP address and across its backplane to the slot (Emulate\<ip>\Backplane\<slot>).
     I/O cards are an addition of this app: without them the I/O modules fault and their input tags can be written. */
  const EMUIPS = ['127.0.0.1', '127.0.0.2', '127.0.0.3', '127.0.0.4', '127.0.0.5', '127.0.0.6', '127.0.0.7', '127.0.0.8', '127.0.0.9'];
  const DEFPATH = 'Emulate\\127.0.0.1\\Backplane\\0';
  const pathOf = (ip, slot) => 'Emulate\\' + ip + '\\Backplane\\' + slot;
  function defaultRacks() {
    const c = new E.Chassis(10, 'Chassis');
    c.insert(0, 'PLC-CPU', 'Emulator'); c.setController(0, { ip: '127.0.0.1' });
    c.insert(1, 'PLC-DI16-24V', 'DI_1'); c.insert(2, 'PLC-DO16-24V', 'DO_1');
    return [c];
  }
  const racks = (() => {
    try { const o = store.get('emu', null); if (o && Array.isArray(o.racks) && o.racks.length) return o.racks.map(r => E.Chassis.from(r)); } catch (e) { /* a broken copy: start again */ }
    try {
      // the single chassis of 0.2.0-beta.2: its first controller gets the first address
      const old = store.get('chassis', null);
      if (old && Array.isArray(old.mods)) { const c = E.Chassis.from(old), m = c.controllers()[0]; if (m && !m.ip) m.ip = '127.0.0.1'; return [c]; }
    } catch (e) { /* start again */ }
    return defaultRacks();
  })();
  E.racks = racks;
  let chassis = racks[0];             // the chassis of the project path (I/O panel, Module Properties)
  const NOCTL = new E.Controller();   // what the app sees when no controller answers at the path
  let ctl = NOCTL;
  function parsePath(p) {
    let m = /^Emulate\\([\d.]+)\\Backplane\\(\d+)$/i.exec(p || '');
    if (m) return { ip: m[1], slot: +m[2] };
    m = /Backplane\\(\d+)$/i.exec(p || '');   // an older path: the first chassis
    return m ? { ip: null, slot: +m[1] } : null;
  }
  const pathSlot = p => { const x = parsePath(p); return x ? x.slot : -1; };
  // the chassis reached at an address: the first one with a powered controller there (as the first emulator started)
  const rackAt = ip => (ip == null ? racks[0] : racks.find(r => r.controllers().some(m => m.ip === ip && m.ctl.powered)) || null);
  const gatewayIp = r => { const m = r.controllers().find(x => x.ip && x.ctl.powered); return m ? m.ip : null; };
  function resolve(p) {
    const x = parsePath(p); if (!x) return null;
    const r = rackAt(x.ip); if (!r) return { ip: x.ip, slot: x.slot, rack: null, m: null, ctl: null };
    const m = r.module(x.slot);
    return { ip: x.ip, slot: x.slot, rack: r, m, ctl: m && m.ctl && m.ctl.powered ? m.ctl : null };
  }
  const curPath = () => (S.p ? store.get('path.' + S.p.controller.name, DEFPATH) : DEFPATH);
  function setPath(p) { store.set('path.' + S.p.controller.name, p); relink(); }
  /* the controller at the project's path; one that went away (card removed, power off) drops the app offline */
  function relink() {
    const x = S.p ? resolve(curPath()) : null;
    chassis = x && x.rack ? x.rack : racks.includes(chassis) ? chassis : racks[0];
    const c = x && x.ctl;
    if (c === ctl || (!c && ctl === NOCTL)) return;
    if (S.online) { S.online = false; setTimeout(() => toast('Communication with the controller was lost: offline.', 'err'), 0); }
    ctl = c || NOCTL;
  }
  let chasSave = 0;
  const saveChassis = () => { clearTimeout(chasSave); chasSave = 0; store.set('emu', { racks: racks.map(r => r.toJSON()) }); };
  function watchRack(r) {
    r.on('change', ev => {
      if (!chasSave) chasSave = setTimeout(saveChassis, 800);
      if (ev.what === 'insert' || ev.what === 'remove' || ev.what === 'controller') { relink(); if (S.p) render(); }
    });
  }
  racks.forEach(watchRack);
  function addRack(name, desc) {
    const r = new E.Chassis(10, name); r.desc = desc || '';
    racks.push(r); watchRack(r); saveChassis();
    return r;
  }
  function removeRack(r) { racks.splice(racks.indexOf(r), 1); saveChassis(); relink(); if (S.p) render(); }

  /* ---------- icons: one monoline set on a 24 px grid ---------- */
  const IC = {
    menu: 'M4 7h16M4 12h16M4 17h16', file: 'M6 3h8l4 4v14H6zM14 3v4h4', open: 'M3 7h6l2 2h10v10H3zM3 7V5h6', save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
    undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3', redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3', cut: 'M6 7a2 2 0 1 0 0-.01M6 17a2 2 0 1 0 0 .01M8 8l12 10M8 16 20 6',
    copy: 'M8 8h11v11H8zM5 15V5h10', paste: 'M9 4h6v3H9zM7 5H5v15h14V5h-2', trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    check: 'M5 12.5 10 17 19 7', checkr: 'M4 6h9M4 11h9M4 16h6M14 15l3 3 5-6', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4', tags: 'M3 5h18v14H3zM3 10h18M9 5v14',
    online: 'M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0M12 12v8', more: 'M12 5.5v.01M12 12v.01M12 18.5v.01', moreh: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
    plus: 'M12 5v14M5 12h14', back: 'M15 5l-7 7 7 7', close: 'M6 6l12 12M18 6 6 18', down: 'M6 9l6 6 6-6', right: 'M9 6l6 6-6 6',
    ladder: 'M5 3v18M19 3v18M5 8h4M15 8h4M9 5v6M15 5v6M5 16h14', chip: 'M7 7h10v10H7zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
    tree: 'M4 5h6M4 5v14M4 12h6M4 19h6M14 5h6M14 12h6M14 19h6', warn: 'M12 4l9 16H3L12 4zM12 10v4M12 17v.01', edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
    toggle: 'M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7zM8 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', text: 'M5 7h14M5 12h14M5 17h9', help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01',
    force: 'M13 3 6 13h5l-1 8 7-10h-5l1-8z', xref: 'M4 6h10M4 12h16M4 18h10M18 4v4M16 6h4', goto: 'M5 12h12M13 6l6 6-6 6', newtag: 'M3 12V4h8l10 10-8 8L3 12zM16 2v6M13 5h6',
    play: 'M7 5l12 7-12 7z', stop: 'M7 7h10v10H7z', download: 'M12 4v11M7 10l5 5 5-5M5 20h14', upload: 'M12 20V9M7 14l5-5 5 5M5 4h14', folder: 'M3 6h6l2 2h10v11H3z',
    task: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2', rack: 'M3 5h18v14H3zM7 5v14M11 5v14M15 5v14', type: 'M5 5h14M12 5v14', prog: 'M4 5h16v14H4zM4 9h16',
    tag: 'M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01', io: 'M4 6h16v12H4zM8 10v4M12 10v4M16 10v4', zin: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6M11 8v6',
    zout: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .2-1.3-1.5.3-2-3-1-1 1.8h-2l-1-1.8-3 1 .3 2L5.9 8.2 4 8l-1 3 2 1v0l-2 1 1 3 2-.2 1.3 1.5-.3 2 3 1 1-1.8h2l1 1.8 3-1-.3-2 1.3-1.5 2 .2 1-3z',
    fault: 'M12 3l9 16H3zM9 12l6 6M15 12l-6 6', exit: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9', info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01',
  };
  const ic = (n, c = 'i') => `<svg class="${c}" viewBox="0 0 24 24" aria-hidden="true"><path d="${IC[n] || ''}"/></svg>`;
  const TABS = {
    Favorites: ['RUNG', 'BR', 'BRL', 'XIC', 'XIO', 'OTE', 'OTL', 'OTU', 'ONS', 'TON', 'CTU', 'RES'],
    Bit: ['XIC', 'XIO', 'OTE', 'OTL', 'OTU', 'ONS', 'OSR', 'OSF'],
    'Timer/Counter': ['TON', 'TOF', 'RTO', 'CTU', 'CTD', 'RES'],
    Compare: ['EQU', 'NEQ', 'LES', 'LEQ', 'GRT', 'GEQ', 'LIM', 'MEQ', 'CMP'],
    'Compute/Math': ['ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'SQR', 'NEG', 'ABS', 'CPT'],
    'Move/Logical': ['MOV', 'MVM', 'CLR', 'AND', 'OR', 'XOR', 'NOT', 'BTD', 'SWPB'],
    'File/Misc': ['COP', 'FLL'],
    'Program Control': ['JSR', 'RET', 'SBR', 'JMP', 'LBL', 'MCR', 'AFI', 'NOP', 'TND'],
  };
  const NAME = mn => (mn === 'RUNG' ? 'Rung' : mn === 'BR' ? 'Branch' : mn === 'BRL' ? 'Branch Level' : (INSTR[mn] || {}).name || mn);
  const MODNAMES = { 'PLC-DI16-24V': '16 DC inputs', 'PLC-DI16-120V': '16 AC inputs', 'PLC-DO16-24V': '16 DC outputs', 'PLC-DO16-RLY': '16 relay outputs', 'PLC-AI4': '4 analog inputs', 'PLC-AO4': '4 analog outputs', 'PLC-ENET': 'Ethernet' };

  /* ---------- projects ---------- */
  function blank(name) {
    return {
      format: 'mt-plc-studio', version: 1, controller: { name, type: 'PLC-CPU', rev: '1.0' },
      rack: { size: 10, modules: [{ slot: 1, type: 'PLC-DI16-24V', name: 'DI_1' }, { slot: 2, type: 'PLC-DO16-24V', name: 'DO_1' }] },
      dataTypes: [], tags: [],
      tasks: [{ name: 'MainTask', type: 'continuous', programs: [{ name: 'MainProgram', main: 'MainRoutine', tags: [], routines: [{ name: 'MainRoutine', rungs: [{ t: '' }] }] }] }],
    };
  }
  function example() {
    const p = blank('Motor_Demo'), B = (name, desc, alias) => (alias ? { name, alias, desc } : { name, type: 'BOOL', desc });
    p.tags = [B('Start_PB', 'S1 START PB', 'Local:1:I.Data.0'), B('Stop_PB', 'S0 STOP PB (NC)', 'Local:1:I.Data.1'), B('OL_OK', 'F1 OVERLOAD OK (NC)', 'Local:1:I.Data.2'),
      B('Motor_Run', 'Motor running (seal-in)'), { name: 'Run_Timer', type: 'TIMER', desc: 'Run lamp delay' }, B('Motor_Cmd', 'KM1 MOTOR CONTACTOR', 'Local:2:O.Data.0'),
      B('Run_Lamp', 'H1 RUN LAMP', 'Local:2:O.Data.1'), B('Start_ONS', 'Start one-shot'), { name: 'Start_Count', type: 'COUNTER', desc: 'Motor starts' }];
    p.tasks[0].programs[0].routines[0].rungs = [
      { c: 'Motor start / stop with seal-in. S0 STOP and F1 OVERLOAD are wired N.C., so XIC is true while they are healthy.', t: '[XIC(Start_PB),XIC(Motor_Run)]XIC(Stop_PB)XIC(OL_OK)OTE(Motor_Run);' },
      { t: 'XIC(Motor_Run)OTE(Motor_Cmd);' },
      { c: 'Run lamp 5 s after the motor starts.', t: 'XIC(Motor_Run)TON(Run_Timer,5000,0);' },
      { t: 'XIC(Run_Timer.DN)OTE(Run_Lamp);' },
      { c: 'Count motor starts.', t: 'XIC(Motor_Run)ONS(Start_ONS)CTU(Start_Count,9999,0);' },
    ];
    return p;
  }
  const index = () => store.get('index', []);
  function saveProject() {
    if (!S.p) return;
    const name = S.p.controller.name;
    if (!store.set('p.' + name, S.p)) { toast('Could not save: the device storage is full.', 'err'); return; }
    const ix = index().filter(x => x.name !== name);
    ix.unshift({ name, at: Date.now() });
    store.set('index', ix);
    store.set('last', name);
    S.dirty = false;
    title();
  }
  let saveTimer = 0;
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveProject, 500); };
  function openProject(p, quiet) {
    S.p = p;
    S.prog = allProgs()[0].name;
    S.routine = allProgs()[0].main || allProgs()[0].routines[0].name;
    S.sel = null; S.selRung = rungs().length ? 0 : null; S.undo = []; S.redo = [];
    S.online = false;
    relink();
    reverify();
    saveProject();
    render();
    if (!quiet) toast(`Opened ${p.controller.name}`);
  }
  function validProject(p) {
    return p && p.format === 'mt-plc-studio' && p.controller && E.validName(p.controller.name) && Array.isArray(p.tasks) && p.tasks.length &&
      p.tasks.every(t => Array.isArray(t.programs) && t.programs.every(g => Array.isArray(g.routines) && g.routines.length));
  }

  /* ---------- state ---------- */
  const S = {
    p: null, prog: '', routine: '', sel: null, selRung: null, clip: null, undo: [], redo: [], dirty: false, online: false,
    layout: 'desktop', area: 'ladder', drawer: false, ioOpen: false, errOpen: false, tagOpen: new Set(), verify: null, errRungs: new Set(),
    prefs: Object.assign({ layout: 'auto', theme: 'auto', zoom: 1, org: true, err: true, io: false, tab: 'Favorites', push: false, collapsed: ['dts'] }, store.get('prefs', {})),
    find: '',
  };
  const savePrefs = () => store.set('prefs', S.prefs);
  const allProgs = () => S.p.tasks.flatMap(t => t.programs);
  const curProg = () => allProgs().find(p => p.name === S.prog) || allProgs()[0];
  const curRoutine = () => { const P = curProg(); return P.routines.find(r => r.name === S.routine) || P.routines[0]; };
  const rungs = () => curRoutine().rungs;
  const parsed = i => { const r = rungs()[i]; if (!r) return null; const pr = E.parseRung(r.t); return pr.err ? null : pr.elems; };
  // the ladder and the tags can be edited offline and online (online edits wait for Accept Edits); modules only offline
  const editable = () => true;
  const offline = () => !S.online;
  /* online edits: the project on this device differs from the copy in the controller */
  const pending = () => S.online && !!ctl.M && !ctl.holds(S.p);
  let ctlCopy = { s: null, p: null };
  function ctlRungs() {
    if (ctlCopy.s !== ctl.copy) ctlCopy = { s: ctl.copy, p: ctl.copy ? JSON.parse(ctl.copy) : null };
    const P = ctlCopy.p && ctlCopy.p.tasks.flatMap(t => t.programs).find(g => U(g.name) === U(curProg().name));
    const r = P && P.routines.find(x => U(x.name) === U(curRoutine().name));
    return r ? r.rungs : null;
  }
  const routineEdited = () => pending() && JSON.stringify(ctlRungs()) !== JSON.stringify(rungs());

  /* ---------- verify ---------- */
  function reverify() {
    S.verify = E.verify(S.p);
    S.errRungs = new Set(S.verify.errors.filter(e => e.routine === curRoutine().name && e.program === curProg().name).map(e => e.rung));
  }

  /* ---------- undo / redo and edits ---------- */
  const snap = () => JSON.stringify({ p: S.p, prog: S.prog, routine: S.routine, sel: S.sel, selRung: S.selRung });
  function restore(s) { const o = JSON.parse(s); Object.assign(S, { p: o.p, prog: o.prog, routine: o.routine, sel: o.sel, selRung: o.selRung }); changed(); }
  function edit(fn) {
    const before = snap();
    if (fn() === false) return false;
    S.undo.push(before);
    if (S.undo.length > 100) S.undo.shift();
    S.redo = [];
    changed();
    return true;
  }
  function changed() { S.dirty = true; S.verifyShown = null; reverify(); scheduleSave(); render(); }
  function undo() { if (!editable() || !S.undo.length) return; S.redo.push(snap()); restore(S.undo.pop()); }
  function redo() { if (!editable() || !S.redo.length) return; S.undo.push(snap()); restore(S.redo.pop()); }

  /* ---------- rung elements: paths [k, leg, i, leg, i …] ---------- */
  function seqOf(elems, path) { let arr = elems; for (let i = 0; i < path.length - 1; i += 2) arr = arr[path[i]].legs[path[i + 1]]; return { arr, idx: path[path.length - 1] }; }
  const getEl = (elems, path) => { try { const { arr, idx } = seqOf(elems, path); return arr[idx]; } catch (e) { return null; } };
  const writeRung = (ri, elems) => { rungs()[ri].t = elems.length ? E.serializeRung(elems) : ''; };
  // a branch with only empty legs goes away, a branch with one leg is unwrapped
  function tidy(arr) {
    for (let k = arr.length - 1; k >= 0; k--) {
      const e = arr[k];
      if (e.t !== 'BR') continue;
      e.legs.forEach(tidy);
      if (e.legs.every(l => !l.length)) arr.splice(k, 1);
      else if (e.legs.length === 1) arr.splice(k, 1, ...e.legs[0]);
    }
  }
  const newEl = (mn, ops) => { const d = INSTR[mn]; const need = d.args.filter(a => !a.endsWith('?')).length; const a = (ops || []).slice(0, d.args.length); while (a.length < need) a.push('?'); return { t: mn, a }; };
  function flat(elems, path = [], out = []) {
    elems.forEach((e, k) => { const p = path.concat(k); if (e.t === 'BR') e.legs.forEach((l, li) => flat(l, p.concat(li), out)); else out.push(p); });
    return out;
  }
  // the selected instruction (a selected branch is not one)
  const curEl = () => { const e = S.sel && S.sel.path ? getEl(parsed(S.sel.ri) || [], S.sel.path) : null; return e && e.t !== 'BR' && !S.sel.leg ? e : null; };

  /* insert an instruction (or a pasted one) after the selection, at a drop target, or at the end of the rung */
  function insert(el, at, openAfter) {
    let ri, path;
    const ok = edit(() => {
      ri = at ? at.ri : S.sel ? S.sel.ri : S.selRung;
      if (ri == null || !rungs()[ri]) { rungs().push({ t: '' }); ri = rungs().length - 1; }
      const elems = parsed(ri);
      if (!elems) { toast('This rung has a text error: fix it with Edit Rung first.', 'err'); return false; }
      const tgt = at && at.path ? at.path : !at && S.sel && S.sel.ri === ri && S.sel.path ? S.sel.path : null;
      const leg = at ? at.leg : S.sel && S.sel.leg;
      if (tgt && leg) {
        // a selected branch level: the instruction goes at the end of that level
        const lv = getEl(elems, tgt.slice(0, -1)).legs[tgt[tgt.length - 1]];
        lv.push(el);
        path = tgt.concat(lv.length - 1);
      } else if (tgt) {
        const { arr, idx } = seqOf(elems, tgt), pos = at ? (at.after ? idx + 1 : idx) : idx + 1;
        arr.splice(pos, 0, el);
        path = tgt.slice(0, -1).concat(pos);
      } else { elems.push(el); path = [elems.length - 1]; }
      writeRung(ri, elems);
      S.sel = { ri, path }; S.selRung = null;
    });
    if (ok && openAfter && el.t !== 'BR' && INSTR[el.t] && INSTR[el.t].args.length) setTimeout(() => openEditor(ri, path, 0), 0);
  }
  function insertMn(mn, at) {
    if (mn === 'RUNG') return addRung();
    if (mn === 'BR') return addBranch(at);
    if (mn === 'BRL') return addLevel();
    insert(newEl(mn), at, true);
  }
  function addRung() {
    edit(() => {
      const ri = S.sel ? S.sel.ri : S.selRung;
      const at = ri == null ? rungs().length : ri + 1;
      rungs().splice(at, 0, { t: '' });
      S.sel = null; S.selRung = at;
    });
  }
  function addBranch(at) {
    if (!at && S.sel && S.sel.path && !S.sel.br && !S.sel.leg) {
      return edit(() => {
        const elems = parsed(S.sel.ri); if (!elems) return false;
        const { arr, idx } = seqOf(elems, S.sel.path);
        arr[idx] = { t: 'BR', legs: [[arr[idx]], []] };
        writeRung(S.sel.ri, elems);
        S.sel = { ri: S.sel.ri, path: S.sel.path.concat(0, 0) };
      });
    }
    insert({ t: 'BR', legs: [[], []] }, at, false);
  }
  function addLevel() {
    if (!S.sel || !S.sel.path) { toast('Select a branch or an instruction in a branch first.'); return; }
    edit(() => {
      const elems = parsed(S.sel.ri); if (!elems) return false;
      const bp = S.sel.br ? S.sel.path : S.sel.leg ? S.sel.path.slice(0, -1) : S.sel.path.length >= 3 ? S.sel.path.slice(0, -2) : null;
      if (!bp) { toast('Select a branch or an instruction in a branch first.'); return false; }
      const b = getEl(elems, bp);
      b.legs.push([]);
      writeRung(S.sel.ri, elems);
      S.sel = { ri: S.sel.ri, path: bp.concat(b.legs.length - 1), leg: true };
    });
  }
  function delSel() {
    if (S.sel && S.sel.leg) {
      // delete a branch level with what is on it; a branch left with one level is unwrapped
      return edit(() => {
        const elems = parsed(S.sel.ri); if (!elems) return false;
        const bp = S.sel.path.slice(0, -1), b = getEl(elems, bp);
        b.legs.splice(S.sel.path[S.sel.path.length - 1], 1);
        tidy(elems);
        writeRung(S.sel.ri, elems);
        const ri = S.sel.ri;
        S.sel = getEl(elems, bp) && getEl(elems, bp).t === 'BR' ? { ri, path: bp, br: true } : null;
        if (!S.sel) S.selRung = ri;
      });
    }
    if (S.sel && S.sel.path) {
      edit(() => {
        const elems = parsed(S.sel.ri); if (!elems) return false;
        const { arr, idx } = seqOf(elems, S.sel.path);
        arr.splice(idx, 1);
        tidy(elems);
        writeRung(S.sel.ri, elems);
        const fl = flat(elems);
        const ri = S.sel.ri;
        S.sel = fl.length ? { ri, path: fl[Math.min(fl.length - 1, Math.max(0, idx - 1))] } : null;
        if (!S.sel) S.selRung = ri;
      });
    } else if (S.selRung != null) {
      edit(() => { rungs().splice(S.selRung, 1); S.selRung = rungs().length ? Math.min(S.selRung, rungs().length - 1) : null; });
    }
  }
  const curSelRung = () => (S.sel ? S.sel.ri : S.selRung);
  function copySel(cut) {
    if (S.sel && S.sel.path) {
      const el = curEl(); if (!el) return;
      S.clip = { kind: 'el', el: JSON.parse(JSON.stringify(el)) };
      try { navigator.clipboard && navigator.clipboard.writeText(E.serializeRung([el]).replace(/;$/, '')); } catch (e) { /* ignore */ }
    } else if (S.selRung != null) {
      S.clip = { kind: 'rung', rung: { ...rungs()[S.selRung] } };
      try { navigator.clipboard && navigator.clipboard.writeText(rungs()[S.selRung].t); } catch (e) { /* ignore */ }
    } else return;
    if (cut) delSel(); else toast('Copied');
  }
  function paste() {
    if (!S.clip) { toast('Nothing to paste yet.'); return; }
    if (S.clip.kind === 'el') insert(JSON.parse(JSON.stringify(S.clip.el)), null, false);
    else edit(() => { const ri = curSelRung(); const at = ri == null ? rungs().length : ri + 1; rungs().splice(at, 0, { ...S.clip.rung }); S.sel = null; S.selRung = at; });
  }

  /* ---------- layout ---------- */
  function pickLayout() {
    const p = S.prefs.layout;
    if (p !== 'auto') return p;
    const w = innerWidth, coarse = matchMedia('(pointer: coarse)').matches;
    return w < 768 ? 'phone' : w < 1200 || (coarse && w < 1600) ? 'tablet' : 'desktop';
  }
  function applyTheme() {
    const t = S.prefs.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
  }
  function title() {
    if (!S.p) return;
    // connected to an emulated controller, the title bars say so (as the reference software does)
    document.title = `MT PLC Studio - ${S.p.controller.name}${S.dirty ? '*' : ''} [PLC-CPU 1.0]${S.online ? ' [Emulator]' : ''}`;
  }

  /* ---------- commands (menus, toolbars, keyboard and touch use the same list) ---------- */
  const selIsBool = () => { const e = curEl(); return !!(e && INSTR[e.t] && /^bit/.test(INSTR[e.t].args[0] || '') && e.a[0] && e.a[0] !== '?'); };
  const selForceable = () => { const e = curEl(); return S.online && !!(e && e.a && e.a[0]) && ctl.forced(e.a[0], S.prog) !== undefined && !!ctl.refOf(e.a[0], S.prog).force; };
  const C = {
    new: { l: 'New…', k: 'Ctrl+N', i: 'file', run: cmdNew },
    open: { l: 'Open…', k: 'Ctrl+O', i: 'open', run: cmdOpen },
    save: { l: 'Save', k: 'Ctrl+S', i: 'save', run: () => { saveProject(); toast('Saved'); } },
    saveas: { l: 'Save As…', i: 'save', run: cmdSaveAs },
    import: { l: 'Import…', i: 'upload', run: cmdImport },
    export: { l: 'Export…', i: 'download', run: cmdExport },
    exit: { l: 'Exit', i: 'exit', run: () => { saveProject(); window.close(); }, show: () => isElectron },
    undo: { l: 'Undo', k: 'Ctrl+Z', i: 'undo', run: undo, on: () => editable() && S.undo.length > 0 },
    redo: { l: 'Redo', k: 'Ctrl+Y', i: 'redo', run: redo, on: () => editable() && S.redo.length > 0 },
    cut: { l: 'Cut', k: 'Ctrl+X', i: 'cut', run: () => copySel(true), on: () => editable() && (!!S.sel || S.selRung != null) },
    copy: { l: 'Copy', k: 'Ctrl+C', i: 'copy', run: () => copySel(false), on: () => !!S.sel || S.selRung != null },
    paste: { l: 'Paste', k: 'Ctrl+V', i: 'paste', run: paste, on: () => editable() && !!S.clip },
    del: { l: 'Delete', k: 'Del', i: 'trash', run: delSel, on: () => editable() && (!!S.sel || S.selRung != null) },
    rung: { l: 'Add Rung', k: 'Ctrl+R', i: 'ladder', run: addRung, on: editable },
    branch: { l: 'Add Branch', i: 'tree', run: () => addBranch(), on: editable },
    level: { l: 'Add Branch Level', i: 'tree', run: addLevel, on: () => editable() && !!S.sel },
    ins: { l: 'Add Ladder Element…', k: 'Alt+Ins', i: 'plus', run: () => picker(''), on: editable },
    edit: { l: 'Edit Instruction', k: 'Enter', i: 'edit', run: () => S.sel && S.sel.path && !S.sel.br && !S.sel.leg && openEditor(S.sel.ri, S.sel.path, 0), on: () => editable() && !!curEl() },
    rtext: { l: 'Edit Rung', i: 'text', run: () => rungText(curSelRung()), on: () => editable() && curSelRung() != null },
    comment: { l: 'Edit Rung Comment', i: 'text', run: () => rungComment(curSelRung()), on: () => editable() && curSelRung() != null },
    desc: { l: 'Edit Main Operand Description', k: 'Ctrl+D', i: 'tag', run: editDesc, on: () => !!curEl() && !!tagFor(curEl().a[0]) },
    newtag: { l: 'New Tag…', k: 'Ctrl+W', i: 'newtag', run: () => { const e = curEl(); newTag({ name: e && e.a[0] && e.a[0] !== '?' && !tagFor(e.a[0]) ? e.a[0] : '', kind: e ? (INSTR[e.t] || {}).args[0] : 'bit' }); } },
    toggle: { l: 'Toggle Bit', k: 'Ctrl+T', i: 'toggle', run: toggleSel, on: () => S.online && selIsBool() },
    fon: { l: 'Force On', i: 'force', run: () => forceSel(1), on: selForceable },
    foff: { l: 'Force Off', i: 'force', run: () => forceSel(0), on: selForceable },
    frem: { l: 'Remove Force', i: 'close', run: () => forceSel(null), on: () => selForceable() && ctl.forced(curEl().a[0], S.prog) !== null },
    find: { l: 'Find…', k: 'Ctrl+F', i: 'search', run: cmdFind },
    findnext: { l: 'Find Next', k: 'F3', i: 'search', run: () => findNext(true), on: () => !!S.find },
    goto: { l: 'Go To…', k: 'Ctrl+G', i: 'goto', run: cmdGoto },
    xref: { l: 'Cross Reference', k: 'Ctrl+E', i: 'xref', run: () => xref() },
    verifyr: { l: 'Verify Routine', i: 'checkr', run: () => verifyCmd(true) },
    verifyc: { l: 'Verify Controller', i: 'check', run: () => verifyCmd(false) },
    accept: { l: 'Accept Edits', i: 'check', run: acceptEdits, on: pending },
    cancele: { l: 'Cancel Edits', i: 'undo', run: cancelEdits, on: pending },
    tagsmon: { l: 'Monitor Tags', i: 'tags', run: () => tagEditor('mon') },
    tagsedit: { l: 'Edit Tags', i: 'tags', run: () => tagEditor('edit') },
    who: { l: 'Who Active', i: 'search', run: () => whoActive() },
    chassis: { l: 'Emulator', i: 'rack', run: () => chassisMonitor() },
    online: { l: 'Go Online', i: 'online', run: goOnline, on: () => !S.online },
    offline: { l: 'Go Offline', i: 'online', run: goOffline, on: () => S.online },
    download: { l: 'Download…', i: 'download', run: () => download() },
    upload: { l: 'Upload…', i: 'upload', run: () => upload(), on: () => !!ctl.M },
    prog: { l: 'Program Mode', i: 'stop', run: () => setMode('remprog'), on: () => S.online && ctl.key === 'REM' && ctl.mode !== 'remprog' && !ctl.fault },
    runm: { l: 'Run Mode', i: 'play', run: () => setMode('remrun'), on: () => S.online && ctl.key === 'REM' && ctl.mode !== 'remrun' && !ctl.fault },
    clear: { l: 'Clear Faults', i: 'fault', run: () => { ctl.clearFault(); live(true); }, on: () => S.online && !!ctl.fault },
    fen: { l: 'Enable All I/O Forces', i: 'force', run: () => { ctl.enableForces(true); live(true); }, on: () => S.online && ctl.forceState() === 'disabled' },
    fdis: { l: 'Disable All I/O Forces', i: 'force', run: () => { ctl.enableForces(false); live(true); }, on: () => S.online && ctl.forceState() === 'enabled' },
    fall: { l: 'Remove All I/O Forces', i: 'close', run: () => { ctl.removeForces(); live(true); }, on: () => S.online && ctl.forceState() !== 'none' },
    vorg: { l: 'Controller Organizer', i: 'tree', run: () => { S.prefs.org = !S.prefs.org; S.drawer = !S.drawer; savePrefs(); render(); }, ck: () => S.prefs.org },
    verr: { l: 'Errors', i: 'warn', run: () => { if (S.layout === 'desktop') { S.prefs.err = !S.prefs.err; savePrefs(); } else S.errOpen = !S.errOpen; render(); }, ck: () => S.prefs.err },
    vio: { l: 'I/O Panel', i: 'io', run: () => { if (S.layout === 'desktop') { S.prefs.io = !S.prefs.io; savePrefs(); } else if (S.layout === 'phone') S.area = 'controller'; else S.ioOpen = !S.ioOpen; render(); }, ck: () => S.prefs.io },
    zin: { l: 'Zoom In', i: 'zin', run: () => zoom(1.12) },
    zout: { l: 'Zoom Out', i: 'zout', run: () => zoom(1 / 1.12) },
    options: { l: 'Options…', i: 'gear', run: options },
    updates: { l: 'Updates…', i: 'download', run: () => window.MTPSUpdater && window.MTPSUpdater.dialog() },
    help: { l: 'Instruction Help', k: 'F1', i: 'help', run: instrHelp },
    about: { l: 'About MT PLC Studio', i: 'info', run: about },
  };
  const MENUS = [
    ['File', ['new', 'open', 'save', 'saveas', '-', 'import', 'export', '-', 'exit']],
    ['Edit', ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'del', '-', 'ins', 'rung', 'branch', 'level', '-', 'edit', 'rtext', 'comment', 'desc']],
    ['View', ['vorg', 'verr', 'vio', '-', 'zin', 'zout']],
    ['Search', ['find', 'findnext', 'goto', 'xref']],
    ['Logic', ['verifyr', 'verifyc', '-', 'accept', 'cancele', '-', 'tagsmon', 'tagsedit', 'newtag']],
    ['Communications', ['who', 'chassis', '-', 'online', 'offline', 'upload', 'download', '-', 'prog', 'runm', 'clear', '-', 'fen', 'fdis', 'fall']],
    ['Tools', ['options', 'updates']],
    ['Help', ['help', 'about']],
  ];
  const can = id => { const c = C[id]; return c && (!c.on || c.on()); };
  const ONLINE_ONLY = ['toggle', 'fon', 'foff', 'frem', 'prog', 'runm', 'clear', 'fen', 'fdis', 'fall'];
  function run(id) {
    const c = C[id];
    if (!c) return;
    if (can(id)) { c.run(); return; }
    if (!S.online && ONLINE_ONLY.includes(id)) toast(`${c.l} works online: press Go Online first.`);
  }
  const menuItems = ids => ids.filter(id => id === '-' || !C[id].show || C[id].show()).map(id => (id === '-' ? '-' : { id, l: C[id].l, k: S.layout === 'desktop' ? C[id].k : '', i: C[id].i, dis: !can(id), ck: C[id].ck ? C[id].ck() : undefined }));

  /* ---------- render ---------- */
  function render() {
    if (!S.p) return;
    const lay = pickLayout();
    if (lay !== S.layout) { S.layout = lay; closeLayer(); }
    const app = $('#app');
    const lw = $('#ladwrap'), st = lw ? [lw.scrollTop, lw.scrollLeft] : null;
    // on <body> too, so menus, sheets and dialogs (in #layer, outside #app) take the layout's sizes
    app.className = document.body.className = lay === 'desktop' ? 'desk' : lay === 'tablet' ? 'tab' : 'phone';
    app.innerHTML = (upInfo ? upbar() : '') + (pending() ? editbar() : '') + (lay === 'desktop' ? desktop() : lay === 'tablet' ? tablet() : phone());
    const nl = $('#ladwrap');
    if (nl) { renderLadder(); if (st) { nl.scrollTop = st[0]; nl.scrollLeft = st[1]; } watchLadder(nl); }
    title();
  }
  const modeText = () => (!S.online ? 'Offline' : ctl.fault ? 'Faulted' : { prog: 'Program', run: 'Run', remprog: 'Rem Prog', remrun: 'Rem Run' }[ctl.mode]);
  const modeCls = () => (!S.online ? '' : ctl.fault ? ' fault' : ctl.mode === 'run' || ctl.mode === 'remrun' ? ' run' : '');
  const modeBox = () => `<span class="sbox${modeCls()}" data-box="mode" title="Controller mode">${modeText()}${ic('down')}</span>`;
  function forcesBox() {
    const st = S.online ? ctl.forceState() : 'none';
    return `<span class="sbox" data-box="forces" title="I/O forces" style="font-weight:400"><i class="fi${st === 'enabled' ? ' en' : st === 'disabled' ? ' dis' : ''}"></i>${st === 'none' ? 'No Forces' : 'Forces'}${ic('down')}</span>`;
  }
  const editsBox = () => `<span class="sbox plain${pending() ? ' edits' : ''}" title="Online edits">${pending() ? 'Edits Present' : 'No Edits'}</span>`;
  function editbar() {
    const run = ctl.mode === 'run' || ctl.mode === 'remrun';
    return `<div class="upbar editbar">${ic('edit')}<span class="grow"><b>Edits are not in the controller yet.</b> ${run ? 'It keeps running the old logic until you accept.' : 'Accept them to send them to the controller.'}</span><button class="btn pri" data-cmd="accept">Accept Edits</button><button class="btn" data-cmd="cancele">Cancel Edits</button></div>`;
  }
  function ledsHTML() {
    const on = S.online, run = on && (ctl.mode === 'run' || ctl.mode === 'remrun') && !ctl.fault;
    const L4 = on ? [[run ? 'g' : '', modeText()], [ctl.fault ? 'r blink' : 'g', ctl.fault ? 'Major Fault' : 'Controller OK'], ['g', 'Battery OK'], ctl.ioOk() ? ['g', 'I/O OK'] : ['r blink', 'I/O Not Responding']] : [['', 'RUN'], ['', 'OK'], ['', 'BAT'], ['', 'I/O']];
    return L4.map(([c, t]) => `<div><i class="led ${c}"></i>${t}</div>`).join('');
  }
  const keyHTML = () => `<span class="key" title="Key switch">${['PROG', 'REM', 'RUN'].map(k => `<span data-key="${k}" class="${ctl.key === k ? 'on' : ''}">${k}</span>`).join('')}</span>`;
  const gbtns = tab => TABS[tab].map(m => `<button class="gbtn" data-mn="${m}" title="${esc(NAME(m))}"${editable() ? '' : ' disabled'}>${L.icon(m)}<span>${m === 'RUNG' ? 'Rung' : m === 'BR' ? 'Branch' : m === 'BRL' ? 'Level' : m}</span></button>`).join('');
  const itabs = () => Object.keys(TABS).map(t => `<span data-tab="${esc(t)}" class="${t === S.prefs.tab ? 'on' : ''}">${t}</span>`).join('');
  const tbtn = (id, n) => `<button class="ib" data-cmd="${id}" title="${esc(C[id].l + (C[id].k ? ' (' + C[id].k + ')' : ''))}"${can(id) ? '' : ' disabled'}>${ic(n || C[id].i)}</button>`;

  function desktop() {
    const P = S.prefs, rc = rungs().length;
    return `<div class="dmenu">${MENUS.map(([n]) => `<span data-menu="${n}">${n}</span>`).join('')}</div>
      <div class="dtb">${tbtn('new')}${tbtn('open')}${tbtn('save')}<span class="vsep"></span>${tbtn('cut')}${tbtn('copy')}${tbtn('paste')}<span class="vsep"></span>${tbtn('undo')}${tbtn('redo')}
        <span class="vsep"></span>${tbtn('find')}${tbtn('xref')}<span class="vsep"></span>${tbtn('verifyc')}${tbtn('verifyr')}<span class="vsep"></span>${tbtn('tagsmon')}${tbtn('vio')}
        <span class="grow"></span><span class="muted" style="margin-right:6px">Path: ${esc(curPath())}</span>${S.online ? tbtn('offline') : tbtn('online')}</div>
      <div class="dbar2"><div class="donline" id="olbar">${onlineBarHTML()}</div>
        <div class="dinstr"><div class="glyphs">${gbtns(S.prefs.tab)}</div><div class="itabs">${itabs()}</div></div></div>
      <div class="dmain">${P.org ? `<aside class="org"><div class="ph">Controller Organizer</div><div class="tree">${treeHTML()}</div></aside>` : ''}
        <section class="ed"><div class="rtabs"><span class="t on">${esc(curProg().name)} - ${esc(curRoutine().name)}</span></div>
          <div class="rtb">${tbtn('zout')}${tbtn('zin')}<span class="vsep"></span>${tbtn('rtext')}${tbtn('comment')}<span class="vsep"></span>${tbtn('rung')}${tbtn('del')}</div>
          <div class="ladwrap" id="ladwrap" tabindex="0"></div></section>
        ${P.io ? `<aside class="io"><div class="ph">I/O Panel<span class="grow"></span>${pushSeg()}</div><div class="iob" id="iob">${ioHTML()}</div></aside>` : ''}</div>
      ${P.err ? `<div class="derr"><div class="ph">Errors<span class="grow"></span><button class="ib" data-cmd="verr" title="Close">${ic('close')}</button></div>${errorsHTML()}</div>` : ''}
      <div class="dstatus"><span id="stmsg">${esc(S.msg || 'Ready')}</span><span>${S.online ? 'Online: ' + modeText() : 'Offline'}</span><span>Rung ${curSelRung() == null ? '-' : curSelRung()} of ${rc}</span><span>v${VERSION}</span></div>`;
  }
  const onlineBarHTML = () => `<div class="leds">${ledsHTML()}</div>${keyHTML()}<div class="boxes">${modeBox()}${forcesBox()}${editsBox()}<span class="sbox plain">Path: ${esc(curPath())}</span></div>`;
  const pushSeg = () => `<span class="seg" title="How an input point reacts to a press"><span data-push="0" class="${S.prefs.push ? '' : 'on'}">Toggle</span><span data-push="1" class="${S.prefs.push ? 'on' : ''}">Push</span></span>`;

  function tablet() {
    const land = innerWidth >= 1024 && innerWidth > innerHeight, pinned = land && S.prefs.org;
    const e = curEl();
    return `<div class="appbar"><button class="ib" data-allmenu="1" title="Menu">${ic('menu')}</button><span class="proj">${esc(S.p.controller.name)}<small>PLC-CPU 1.0</small></span>
        <span id="olbar" style="display:contents">${modeBox()}${forcesBox()}${land ? editsBox() : ''}</span><span class="grow"></span>
        ${tbtn('undo')}${tbtn('redo')}${tbtn('verifyc')}${tbtn('find')}<button class="ib${S.ioOpen ? ' on' : ''}" data-cmd="vio" title="I/O panel">${ic('io')}</button>
        <span class="vsep"></span>${S.online ? `<button class="btn danger" data-cmd="offline">${ic('online')}Go Offline</button>` : `<button class="btn pri" data-cmd="online">${ic('online')}Go Online</button>`}</div>
      <div class="tbody">${pinned || S.drawer ? `<aside class="org${pinned ? '' : ' over'}"><div class="ph">Controller Organizer<span class="grow"></span><button class="ib" data-drawer="0">${ic(pinned ? 'moreh' : 'close')}</button></div><div class="tree">${treeHTML()}</div></aside>` : ''}
        <section class="ed"><div class="rtabs">${pinned ? '' : `<button class="ib" data-drawer="1" title="Controller Organizer">${ic('tree')}</button>`}<span class="t on">${esc(curProg().name)} - ${esc(curRoutine().name)}</span><span class="grow"></span>${tbtn('zout')}${tbtn('zin')}<button class="ib" data-more="ladder" title="More">${ic('more')}</button></div>
          <div class="ladwrap" id="ladwrap" tabindex="0"></div>
          ${selbarHTML(e)}
          <div class="ibar"><div class="glyphs">${gbtns(S.prefs.tab)}</div><div class="itabs">${itabs()}${errHandle()}</div></div></section>
        ${S.ioOpen ? `<aside class="io over"><div class="ph">I/O Panel<span class="grow"></span>${pushSeg()}<button class="ib" data-cmd="vio">${ic('close')}</button></div><div class="iob" id="iob">${ioHTML()}</div></aside>` : ''}</div>`;
  }
  const errHandle = () => { const n = S.verify ? S.verify.errors.length : 0; return `<span class="errh${n ? '' : ' ok'}" data-errh="1">${ic(n ? 'warn' : 'check')}<b>${n}</b> Errors${ic('down')}</span>`; };
  function selbarHTML(e) {
    const ri = curSelRung();
    const tag = e && e.a && e.a[0] ? tagFor(e.a[0]) : null;
    return `<div class="selbar">${e ? `<span class="mn">${esc(e.t)}</span><span class="op ell" style="max-width:40%">${esc(e.a.join(', '))}</span>` : `<span class="muted">${ri == null ? 'Tap a rung or an instruction' : 'Rung ' + ri}</span>`}
      <span class="ds ell grow">${esc(tag ? tag.desc || '' : '')}</span>${S.layout !== 'phone' ? `<span class="pos">Rung ${ri == null ? '-' : ri} of ${rungs().length}</span>` : ''}
      <button class="ib" data-cmd="edit" title="Edit"${can('edit') ? '' : ' disabled'}>${ic('edit')}</button><button class="ib" data-cmd="toggle" title="Toggle Bit"${can('toggle') ? '' : ' disabled'}>${ic('toggle')}</button><button class="ib" data-ctx="sel" title="More">${ic('moreh')}</button></div>`;
  }

  function phone() {
    const a = S.area, nErr = S.verify ? S.verify.errors.length : 0;
    let body = '';
    if (a === 'ladder') {
      body = `<div class="pbar"><span class="rt grow" data-routines="1"><span class="tt">${esc(curRoutine().name)}<small>${esc(curProg().name)}</small></span>${ic('down')}</span>${tbtn('undo')}${tbtn('find')}<button class="ib" data-more="ladder">${ic('more')}</button></div>
        <div style="position:relative;flex:1;display:flex;flex-direction:column;min-height:0"><div class="ladwrap" id="ladwrap" tabindex="0"></div><button class="fab" data-cmd="ins" title="Add instruction"${editable() ? '' : ' disabled'}>${ic('plus')}</button></div>${selbarHTML(curEl())}`;
    } else if (a === 'tags') body = `<div class="pbar"><span class="rt grow"><span class="tt">Tags<small>${esc(S.p.controller.name)}</small></span></span><button class="ib" data-cmd="newtag">${ic('plus')}</button></div><div class="page" id="tagpage" style="background:var(--surface);display:flex;flex-direction:column">${tagEditorBody(true)}</div>`;
    else if (a === 'controller') body = `<div class="pbar"><span class="rt grow"><span class="tt">Controller<small>PLC-CPU 1.0 · ${esc(ctl.name || 'empty')}</small></span></span></div><div class="page" id="ctlpage">${controllerPage()}</div>`;
    else if (a === 'project') body = `<div class="pbar"><span class="rt grow"><span class="tt">Project<small>${esc(S.p.controller.name)}</small></span></span><button class="ib" data-cmd="open" title="Open">${ic('open')}</button><button class="ib" data-cmd="new" title="New">${ic('file')}</button></div><div class="page" style="background:var(--surface)"><div class="tree">${treeHTML()}</div></div>`;
    else body = `<div class="pbar"><span class="rt grow"><span class="tt">More<small>MT PLC Studio v${VERSION}</small></span></span></div><div class="page">${morePage()}</div>`;
    const nav = [['ladder', 'Ladder', 'ladder'], ['tags', 'Tags', 'tag'], ['controller', 'Controller', 'chip'], ['project', 'Project', 'tree'], ['more', 'More', 'moreh']]
      .map(([k, n, i]) => `<button class="${a === k ? 'on' : ''}" data-go="${k}"><span class="pill">${ic(i)}</span>${n}${k === 'more' && nErr ? `<span class="bd">${nErr}</span>` : ''}</button>`).join('');
    return `<div class="strip" id="olbar">${modeBox()}${forcesBox()}${editsBox()}${nErr ? `<span class="warn" data-go="more">${ic('warn')}${nErr}</span>` : ''}</div>${body}<nav class="pnav">${nav}</nav>`;
  }
  function controllerPage() {
    const on = S.online;
    return `<div class="card"><div class="ch">Status</div><div class="cb"><div class="leds4">${ledsHTML()}</div>
        <div class="muted" style="margin:14px 0 6px">Key switch</div><span class="seg" style="display:flex">${['PROG', 'REM', 'RUN'].map(k => `<span data-key="${k}" class="${ctl.key === k ? 'on' : ''}">${k}</span>`).join('')}</span>
        <div style="margin-top:8px"><div class="kv"><span>Mode</span><span class="v">${modeText()}</span></div><div class="kv"><span>Controller holds</span><span class="v">${esc(ctl.name || '(no project)')}</span></div><div class="kv"><span>Path</span><span class="v">${esc(curPath())}</span></div></div>
        <div class="brow"><button class="btn" data-cmd="who">${ic('search')}Who Active</button><button class="btn" data-cmd="chassis">${ic('rack')}Emulator</button></div>
        <div class="brow">${on ? `<button class="btn danger" data-cmd="offline">${ic('online')}Go Offline</button>` : `<button class="btn pri" data-cmd="online">${ic('online')}Go Online</button>`}<button class="btn" data-cmd="upload"${can('upload') ? '' : ' disabled'}>${ic('upload')}Upload</button><button class="btn" data-cmd="download">${ic('download')}Download</button></div>
        <div class="brow"><button class="btn" data-cmd="prog"${can('prog') ? '' : ' disabled'}>${ic('stop')}Program</button><button class="btn" data-cmd="runm"${can('runm') ? '' : ' disabled'}>${ic('play')}Run</button>${ctl.fault ? `<button class="btn danger" data-cmd="clear">${ic('fault')}Clear Faults</button>` : ''}</div></div></div>
      <div class="card"><div class="ch">Forces<span class="grow"></span><span class="muted" style="font-weight:400">${S.online ? { none: 'No Forces', disabled: 'Forces disabled', enabled: 'Forces enabled' }[ctl.forceState()] : 'Offline'}</span></div><div class="cb">
        <div class="brow" style="margin-top:0"><button class="btn" data-cmd="fen"${can('fen') ? '' : ' disabled'}>Enable</button><button class="btn" data-cmd="fdis"${can('fdis') ? '' : ' disabled'}>Disable</button><button class="btn" data-cmd="fall"${can('fall') ? '' : ' disabled'}>Remove All</button></div></div></div>
      <div class="card"><div class="ch">I/O panel<span class="grow"></span>${pushSeg()}</div><div class="cb" id="iob" style="padding:0 6px 8px">${ioHTML()}</div></div>`;
  }
  function morePage() {
    const b = (id, t) => `<div class="row" data-cmd="${id}">${ic(C[id].i)}<span class="grow">${t || C[id].l}</span>${ic('right')}</div>`;
    return `<div class="card"><div class="ch">Errors<span class="grow"></span><button class="btn" data-cmd="verifyc">${ic('check')}Verify</button></div>${errorsHTML()}</div>
      <div class="card">${b('find')}${b('goto')}${b('xref')}${b('tagsedit')}</div>
      <div class="card">${b('save')}${b('saveas')}${b('import')}${b('export')}</div>
      <div class="card">${b('options')}${b('updates')}${b('help')}${b('about')}</div>`;
  }

  /* ---------- organizer tree ---------- */
  function treeHTML() {
    const col = new Set(S.prefs.collapsed);
    const N = (key, lvl, txt, icon, o = {}) => {
      const has = o.kids !== undefined, open = has && !col.has(key);
      return { html: `<div class="nd${o.on ? ' on' : ''}" data-org="${esc(key)}" style="padding-left:${4 + lvl * 16}px"><span class="tw" data-tw="${esc(key)}">${has ? ic(open ? 'down' : 'right') : ''}</span>${ic(icon, 'i ti')}<span class="ell">${esc(txt)}</span>${o.f ? `<span class="flt">${o.f}</span>` : ''}</div>`, open };
    };
    let h = '';
    const add = (key, lvl, txt, icon, o, kids) => { const n = N(key, lvl, txt, icon, { ...o, kids }); h += n.html; if (kids && n.open) kids(); };
    add('ctl', 0, 'Controller ' + S.p.controller.name, 'chip', { f: S.online && ctl.fault ? '⚠' : '' }, () => { add('ctags', 1, 'Controller Tags', 'tag'); });
    add('tasks', 0, 'Tasks', 'folder', {}, () => S.p.tasks.forEach(t => add('task:' + t.name, 1, t.name, 'task', {}, () => t.programs.forEach(g => add('prog:' + g.name, 2, g.name, 'prog', {}, () => {
      add('ptags:' + g.name, 3, 'Program Tags', 'tag');
      g.routines.forEach(r => add('rt:' + g.name + '/' + r.name, 3, r.name + (r.name === g.main ? '' : ''), 'ladder', { on: g.name === S.prog && r.name === S.routine,
        f: S.verify && S.verify.errors.some(e => e.program === g.name && e.routine === r.name) ? '⊗' : '' }));
    })))));
    const dt = E.dataTypes(S.p);
    add('dts', 0, 'Data Types', 'folder', {}, () => {
      add('dt:user', 1, 'User-Defined', 'type', {}, () => dt.userDefined.forEach(n => add('dt:u:' + n, 2, n, 'type')));
      add('dt:pre', 1, 'Predefined', 'type', {}, () => dt.predefined.forEach(n => add('dt:p:' + n, 2, n, 'type')));
      add('dt:mod', 1, 'Module-Defined', 'type', {}, () => dt.moduleDefined.forEach(n => add('dt:m:' + n, 2, n, 'type')));
    });
    add('io', 0, 'I/O Configuration', 'folder', {}, () => add('bp', 1, `Backplane, PLC-RACK${S.p.rack.size}`, 'rack', {}, () => {
      add('mod:0', 2, `[0] PLC-CPU ${S.p.controller.name}`, 'chip');
      [...S.p.rack.modules].sort((a, b) => a.slot - b.slot).forEach(m => add('mod:' + m.slot, 2, `[${m.slot}] ${m.type} ${m.name}`, 'rack', { f: S.online && ctl.M && ctl.moduleStatus(m.slot).state === 'Faulted' ? '⚠' : m.inhibit ? 'inhibited' : '' }));
    }));
    return h;
  }

  /* ---------- errors pane ---------- */
  function errorsHTML() {
    const v = S.verifyShown || S.verify || { errors: [], warnings: [], lines: [] };
    const f = S.errFilter || { e: true, w: true, m: true };
    const lines = v.lines.map(t => ({ t, k: /^Error/.test(t) ? 'e' : /^Warning/.test(t) ? 'w' : 'm' })).filter(x => f[x.k]);
    return `<div class="chips"><span class="chip${f.e ? ' on' : ''}" data-ef="e">${ic('fault')}${v.errors.length} Errors</span><span class="chip${f.w ? ' on' : ''}" data-ef="w">${ic('warn')}${v.warnings.length} Warnings</span><span class="chip${f.m ? ' on' : ''}" data-ef="m">${ic('info')}Messages</span></div>
      <div class="log">${lines.map(x => { const m = /Rung (\d+)/.exec(x.t), rt = /^Verifying routine '([^']+)' of program '([^']+)'/.exec(x.t); return `<div class="ln ${x.k}"${m ? ` data-errline="${m[1]}" data-errrt="${esc(lineRoutine(x.t, v))}"` : ''}>${esc(x.t)}</div>`; void rt; }).join('')}</div>`;
  }
  function lineRoutine(t, v) { const e = v.errors.concat(v.warnings).find(x => x.text === t); return e ? e.program + '/' + e.routine : ''; }

  /* ---------- ladder ---------- */
  function tagFor(op) {
    const base = U(String(op || '').split(/[.[]/)[0]);
    const P = curProg();
    return P.tags.find(t => U(t.name) === base) || S.p.tags.find(t => U(t.name) === base) || null;
  }
  function liveRoutine() {
    if (!S.online || !ctl.M) return null;
    const P = ctl.M.programs.find(p => U(p.name) === U(curProg().name));
    return P ? P.routines.get(U(curRoutine().name)) : null;
  }
  function ladderRungs() {
    const R = routineEdited() ? null : liveRoutine();
    if (R) {
      const tag = e => { if (e.t === 'BR') e.legs.forEach(l => l.forEach(tag)); else if (L.OPN[e.t] && /^(timer|counter)$/.test((INSTR[e.t].args[0] || ''))) { try { e.bv = { ...e.x[0].obj() }; } catch (err) { /* ignore */ } } };
      return R.rungs.map((r, i) => { r.elems.forEach(e => e && tag(e)); return { elems: r.elems.filter(Boolean), c: rungs()[i] && rungs()[i].c }; });
    }
    return rungs().map((r, i) => { const pr = E.parseRung(r.t); return { elems: pr.err ? [] : pr.elems, c: r.c, err: S.errRungs.has(i) || !!pr.err }; });
  }
  const CELL = { desktop: 104, tablet: 112, phone: 80 };
  function renderLadder(drop, press) {
    const w = $('#ladwrap');
    if (!w) return;
    const z = S.prefs.zoom;
    const res = L.render(ladderRungs(), {
      W: w.clientWidth || 600, cell: Math.round(CELL[S.layout] * z), font: Math.round((S.layout === 'desktop' ? 11 : 12) * z), descLines: S.layout === 'phone' ? 1 : 2,
      live: S.online && !routineEdited() && !!liveRoutine(), run: S.online && (ctl.mode === 'run' || ctl.mode === 'remrun') && !ctl.fault,
      sel: S.sel, selRung: S.sel ? null : S.selRung, tag: tagFor, forced: S.online ? op => ctl.forced(op, S.prog) : null, drop, press,
    });
    w.innerHTML = res.svg;
  }
  let ro = null, lastW = 0;
  function watchLadder(w) {
    if (ro) ro.disconnect();
    if (!window.ResizeObserver) return;
    lastW = w.clientWidth;
    ro = new ResizeObserver(() => { const nw = w.clientWidth; if (Math.abs(nw - lastW) > 8) { lastW = nw; if (!zoomRaf) zoomRaf = requestAnimationFrame(() => { zoomRaf = 0; renderLadder(); }); } });
    ro.observe(w);
  }
  function zoom(f) { setZoom(S.prefs.zoom * f); savePrefs(); }
  function select(t) {
    if (!t) { S.sel = null; S.selRung = null; return; }
    if (t.path) { S.sel = { ri: t.ri, path: t.path, br: t.br, leg: t.leg }; S.selRung = null; } else if (t.ri != null) { S.sel = null; S.selRung = t.ri; } else { S.sel = null; S.selRung = null; }
  }
  const hit = el => {
    const r = el && el.closest && el.closest('rect.tap');
    if (!r) return null;
    const d = r.dataset;
    if (d.end) return { end: true };
    return { ri: +d.ri, path: d.p ? d.p.split('.').map(Number) : null, br: !!d.br, leg: !!d.leg, rn: !!d.rn };
  };
  const tkey = t => (t ? `${t.ri}|${t.path ? t.path.join('.') : ''}|${t.leg ? 'l' : ''}${t.rn ? 'n' : ''}${t.end ? 'e' : ''}` : '');
  let lastTap = { k: '', t: 0 };
  function onTap(t, x, y, isDbl) {
    const k = tkey(t), now = Date.now();
    const dbl = isDbl || (k === lastTap.k && now - lastTap.t < 380);
    lastTap = dbl ? { k: '', t: 0 } : { k, t: now };
    select(t);
    render();
    if (!dbl || !t) return;
    if (t.path && !t.br && !t.leg) { if (editable()) openEditor(t.ri, t.path, 0); }
    else if (t.rn) { if (editable()) rungText(t.ri); }
  }
  /* pointer handling on the ladder: tap, double-tap, long-press (touch) / right-click (mouse), pinch zoom */
  /* pointer handling on the ladder: tap, double-tap, long-press (touch) / right-click (mouse), pinch zoom.
     The ladder wrapper captures the pointer, so a redraw under the finger (a running timer, the long-press mark)
     never loses the release; a pointer that was never released is dropped at the next press. */
  function bindLadder() {
    const app = $('#app');
    const pts = new Map();
    let pd = null, pinch = null;
    const busy = () => { S.touching = !!pd || !!pinch; };
    app.addEventListener('pointerdown', ev => {
      const w = ev.target.closest('#ladwrap');
      if (!w) return;
      // a pointer that was never released (lost by the browser) must not turn the next tap into a pinch
      for (const [id, p] of pts) if (id !== ev.pointerId && performance.now() - p.t > 1500) pts.delete(id);
      if (ev.pointerType !== 'touch') pts.clear();
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, t: performance.now() });
      // only the primary button and touch are captured: a right-click must still reach the instruction under it
      if (!(ev.pointerType === 'mouse' && ev.button !== 0)) { try { w.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } }
      if (pts.size === 2) {
        const [p1, p2] = [...pts.values()];
        pinch = { d: Math.max(20, Math.hypot(p1.x - p2.x, p1.y - p2.y)), z: S.prefs.zoom };
        if (pd) clearTimeout(pd.timer);
        pd = null;
        busy();
        return;
      }
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      const t = hit(ev.target);
      pd = { x: ev.clientX, y: ev.clientY, t, moved: false, long: false, mouse: ev.pointerType === 'mouse' };
      busy();
      if (!pd.mouse) {
        pd.timer = setTimeout(() => {
          if (!pd || pd.moved) return;
          pd.long = true;
          select(pd.t);
          renderLadder(null, pd.t && pd.t.path ? pd.t : null);
          if (navigator.vibrate) navigator.vibrate(12);
          ctxMenu(pd.t, pd.x, pd.y);
        }, 500);
      }
    });
    const move = ev => {
      const p = pts.get(ev.pointerId);
      if (!p) return;
      p.x = ev.clientX; p.y = ev.clientY; p.t = performance.now();
      if (pinch && pts.size === 2) {
        const [p1, p2] = [...pts.values()], d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        setZoom(pinch.z * d / pinch.d);
        return;
      }
      if (pd && Math.hypot(ev.clientX - pd.x, ev.clientY - pd.y) > 10) { pd.moved = true; clearTimeout(pd.timer); }
    };
    const up = ev => {
      if (!pts.has(ev.pointerId)) return;
      pts.delete(ev.pointerId);
      if (pinch) { if (pts.size < 2) { pinch = null; pts.clear(); savePrefs(); busy(); renderLadder(); } return; }
      if (!pd) { busy(); return; }
      clearTimeout(pd.timer);
      const p = pd;
      pd = null;
      busy();
      if (ev.type === 'pointercancel' || p.moved || p.long) { if (!p.long) live(true); return; }
      onTap(p.t, ev.clientX, ev.clientY);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    app.addEventListener('contextmenu', ev => {
      const w = ev.target.closest('#ladwrap');
      if (!w) { if (ev.target.closest('.nd')) { ev.preventDefault(); orgMenu(ev.target.closest('.nd').dataset.org, ev.clientX, ev.clientY); } return; }
      ev.preventDefault();
      if (pd && !pd.mouse) return;   // a long-press on touch opens the menu itself
      const t = hit(document.elementFromPoint(ev.clientX, ev.clientY) || ev.target);
      select(t);
      render();
      ctxMenu(t, ev.clientX, ev.clientY);
    });
  }
  /* zoom: one redraw per frame however fast the pinch or the buttons go */
  let zoomRaf = 0;
  function setZoom(z) {
    z = Math.max(0.6, Math.min(2, +z.toFixed(2)));
    if (Math.abs(z - S.prefs.zoom) < 0.02) return;
    S.prefs.zoom = z;
    if (!zoomRaf) zoomRaf = requestAnimationFrame(() => { zoomRaf = 0; renderLadder(); });
  }

  /* ---------- context menus (right-click / long-press): spec section 4 ---------- */
  function ctxMenu(t, x, y) {
    if (!t || t.end) return;
    let ids, head;
    if (t.leg) { head = `Rung ${t.ri} · Branch Level`; ids = ['paste', 'del', '-', 'level']; }
    else if (t.path && !t.br) {
      const e = curEl();
      head = `Rung ${t.ri} · ${e ? e.t + ' ' + e.a.join(', ') : ''}`;
      ids = [];
      if (e && e.a[0] && e.a[0] !== '?' && !tagFor(e.a[0]) && /^[A-Za-z_]\w*$/.test(e.a[0])) ids.push('newtag', '-');
      ids.push('cut', 'copy', 'paste', 'del', '-', 'ins', 'edit', 'desc', '-', 'toggle', 'fon', 'foff', 'frem', '-', 'goto', 'xref', 'help');
    } else if (t.br) { head = `Rung ${t.ri} · Branch`; ids = ['cut', 'copy', 'paste', 'del', '-', 'level']; }
    else { head = `Rung ${t.ri}`; ids = ['cut', 'copy', 'paste', 'del', '-', 'rung', 'rtext', 'comment', 'verifyr', '-', 'goto']; }
    const items = menuItems(ids).map(it => (it === '-' ? it : { ...it, l: it.id === 'newtag' ? `New "${curEl().a[0]}"` : t.br && ['cut', 'copy', 'del'].includes(it.id) ? it.l + ' Branch' : t.leg && it.id === 'del' ? 'Delete Branch Level' : !t.path && ['cut', 'copy', 'del'].includes(it.id) ? it.l + ' Rung' : it.id === 'del' ? 'Delete Instruction' : it.l }));
    openMenu(items, { x, y }, head);
  }
  function orgMenu(key, x, y) {
    const items = [];
    if (key.startsWith('rt:')) { items.push({ l: 'Open', run: () => openRoutine(key) }, { l: 'Rename…', run: () => renameRoutine(key) }, { l: 'Delete', run: () => deleteRoutine(key) }); }
    else if (key.startsWith('prog:')) items.push({ l: 'New Routine…', run: () => newRoutine(key.slice(5)), dis: !editable() }, { l: 'Program Tags', run: () => tagEditor('mon', key.slice(5)) });
    else if (key === 'bp' || key === 'io') items.push({ l: 'New Module…', run: newModule, dis: !offline() });
    else if (key.startsWith('mod:') && key !== 'mod:0') items.push({ l: 'Properties', run: () => moduleProps(+key.slice(4)) }, { l: 'Delete', run: () => deleteModule(+key.slice(4)), dis: !offline() });
    else if (key === 'ctags') items.push({ l: 'Monitor Tags', run: () => tagEditor('mon') }, { l: 'Edit Tags', run: () => tagEditor('edit') }, { l: 'New Tag…', run: () => newTag({}) });
    else if (key === 'ctl') items.push({ l: 'Properties…', run: controllerProps });
    if (items.length) openMenu(items, { x, y });
  }

  /* ---------- layer: menus, sheets, dialogs, toasts ---------- */
  function closeLayer() { const l = $('#layer'); l.innerHTML = ''; layerKey = null; }
  let layerKey = null, layerAt = 0, lastDown = 0;
  // the click that ends the press which opened a menu or a dialog (it can come late, on touch screens above all)
  // must not close it: a click on the scrim counts only when its press started after the layer opened
  document.addEventListener('pointerdown', () => { lastDown = performance.now(); }, true);
  const freshLayer = () => lastDown <= layerAt;
  /* items: [{ id | run, l, k, i, dis, ck }] or '-'; at: {x, y} or an element */
  function openMenu(items, at, head) {
    const l = $('#layer');
    l.innerHTML = '';
    layerAt = performance.now();
    const body = `<div class="menu">${head && S.layout !== 'desktop' ? '' : ''}${items.map((it, n) => (it === '-' ? '<hr>' : it.hd ? `<div class="hd">${esc(it.hd)}</div>` : `<div class="it${it.dis ? ' dis' : ''}" data-n="${n}">${it.ck !== undefined ? `<span class="ck">${it.ck ? '✓' : ''}</span>` : it.i ? ic(it.i) : ''}<span>${esc(it.l)}</span>${it.k ? `<span class="k">${esc(it.k)}</span>` : ''}</div>`)).join('')}</div>`;
    if (S.layout === 'phone') {
      l.innerHTML = `<div class="scrim" data-close="1"></div><div class="sheet"><div class="grab"></div>${head ? `<div class="ctx">${esc(head)}</div>` : ''}<div class="sb">${body}</div></div>`;
    } else {
      l.innerHTML = `<div class="scrim clear" data-close="1"></div><div class="pop">${head && S.layout === 'tablet' ? `<div class="menu"><div class="hd">${esc(head)}</div></div>` : ''}${body}</div>`;
      const pop = l.querySelector('.pop'), r = at instanceof Element ? at.getBoundingClientRect() : null;
      let x = r ? r.left : at.x, y = r ? r.bottom : at.y;
      const pw = pop.offsetWidth, ph = pop.offsetHeight;
      if (x + pw > innerWidth - 6) x = Math.max(6, innerWidth - pw - 6);
      if (y + ph > innerHeight - 6) y = Math.max(6, (r ? r.top : at.y) - ph);
      if (y < 6) y = 6;
      pop.style.left = x + 'px'; pop.style.top = y + 'px';
    }
    l.onclick = ev => {
      if (ev.target.closest('[data-close]')) { if (!freshLayer()) closeLayer(); return; }
      const it = ev.target.closest('.it');
      if (!it || it.classList.contains('dis')) return;
      const x = items[+it.dataset.n];
      closeLayer();
      if (x.id) run(x.id); else if (x.run) x.run();
    };
    layerKey = ev => { if (ev.key === 'Escape') closeLayer(); };
  }
  /* a dialog: centred on desktop and tablet, full screen on the phone */
  function dialog(o) {
    const l = $('#layer');
    l.innerHTML = `<div class="scrim"${o.modal ? '' : ' data-close="1"'}></div><div class="dlg ${o.size || ''}" role="dialog" aria-label="${esc(o.title)}">
      <div class="dh">${S.layout === 'phone' ? `<button class="ib" data-close="1">${ic('back')}</button>` : ''}<b>${esc(o.title)}</b>${S.online ? '<span class="emutag">[Emulator]</span>' : ''}${S.layout !== 'phone' ? `<button class="ib" data-close="1" title="Close">${ic('close')}</button>` : ''}</div>
      <div class="db${o.flush ? ' flush' : ''}">${o.body}</div>${o.buttons && o.buttons.length ? `<div class="df">${o.buttons.map((b, n) => `<button class="btn${b.pri ? ' pri' : b.danger ? ' danger' : ''}" data-b="${n}">${esc(b.l)}</button>`).join('')}</div>` : ''}</div>`;
    const el = l.querySelector('.dlg');
    layerAt = performance.now();
    const close = () => { if (o.onClose) o.onClose(); closeLayer(); };
    l.onclick = ev => {
      if (ev.target.closest('[data-close]')) { if (!ev.target.closest('.ib') && freshLayer()) return; close(); return; }
      const b = ev.target.closest('[data-b]');
      if (b) { const fn = o.buttons[+b.dataset.b].run; if (!fn || fn(el) !== false) closeLayer(); }
    };
    layerKey = ev => {
      if (ev.key === 'Escape') { close(); ev.preventDefault(); }
      if (ev.key === 'Enter' && !ev.shiftKey && ev.target.tagName !== 'TEXTAREA' && !(o.noEnter && o.noEnter(ev))) {
        const n = o.buttons ? o.buttons.findIndex(b => b.pri) : -1;
        if (n >= 0) { ev.preventDefault(); el.querySelector(`[data-b="${n}"]`).click(); }
      }
    };
    if (o.mount) o.mount(el);
    const f = el.querySelector('[autofocus]') || el.querySelector('input,select,textarea');
    const fo = () => { f.focus(); if (f.select) f.select(); };
    if (f && S.layout === 'desktop') setTimeout(fo, 0);
    else if (f && o.focus) setTimeout(fo, 50);
    return el;
  }
  function confirmDlg(title, text, okLabel, fn, danger) {
    dialog({ title, body: `<p>${text}</p>`, buttons: [{ l: 'Cancel' }, { l: okLabel, pri: !danger, danger, run: fn }], size: '' });
  }
  function prompt1(title, label, value, fn, hint) {
    dialog({ title, body: `<div class="frow"><label>${esc(label)}</label><input class="inp" id="p1" value="${esc(value)}" autofocus autocomplete="off"></div>${hint ? `<p class="help">${hint}</p>` : ''}<div class="errtx" id="p1e"></div>`,
      focus: true, buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => { const v = el.querySelector('#p1').value.trim(); const err = fn(v); if (err) { el.querySelector('#p1e').textContent = err; return false; } } }] });
  }
  let toastTimer = 0;
  function toast(msg, kind) {
    S.msg = msg;
    const sm = $('#stmsg');
    if (sm) sm.textContent = msg;
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); document.body.appendChild(t); }
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    t.style.position = 'fixed'; t.style.zIndex = 200;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), kind === 'err' ? 4500 : 2200);
  }

  /* ---------- instruction editor (operands, mnemonic) and the tag browser in it ---------- */
  const KIND_TYPES = {
    bit: ['BOOL'], bitw: ['BOOL'], timer: ['TIMER'], counter: ['COUNTER'], struct: ['TIMER', 'COUNTER', 'CONTROL'],
    num: ['SINT', 'INT', 'DINT', 'REAL'], dest: ['SINT', 'INT', 'DINT', 'REAL'], int: ['SINT', 'INT', 'DINT'], idest: ['SINT', 'INT', 'DINT'], expr: ['SINT', 'INT', 'DINT', 'REAL', 'BOOL'],
  };
  function aliasType(alias) {
    if (/\.\d+$/.test(alias)) return 'BOOL';
    if (/\.(DN|EN|TT|CU|CD|OV|UN|ER)$/i.test(alias)) return 'BOOL';
    if (/\.(PRE|ACC|LEN|POS|Fault)$/i.test(alias)) return 'DINT';
    if (/^Local:\d+:I\.Ch\dData$/i.test(alias)) return 'REAL';
    const t = tagFor(alias);
    return t ? (t.type || aliasType(t.alias || '')) : 'BOOL';
  }
  const typeOf = t => (t.alias ? aliasType(t.alias) : U(t.type || 'BOOL') === t.type ? t.type : t.type);
  /* every name an operand can take, with its type */
  function candidates() {
    const out = [], P = curProg();
    // grp: 'in' (input cards and the tags that alias them), 'out' (output cards), 'tag', 'sys'
    const io = name => (/^Local:\d+:I\b/i.test(name) ? 'in' : /^Local:\d+:O\b/i.test(name) ? 'out' : 'tag');
    const add = (name, type, desc, scope, dim, grp) => out.push({ name, type, desc: desc || '', scope, dim, grp: grp || 'tag' });
    const tags = (list, scope) => list.forEach(t => {
      const ty = typeOf(t);
      add(t.name, ty, (t.alias ? `<${t.alias}> ` : '') + (t.desc || ''), scope, t.dim, t.alias ? io(t.alias) : 'tag');
      const M = E.PREDEF[ty];
      if (M && !t.dim) M.forEach(m => add(`${t.name}.${m.name}`, m.type, '', scope));
    });
    tags(P.tags, P.name);
    tags(S.p.tags, 'Controller');
    S.p.rack.modules.forEach(m => {
      const d = E.MODULES[m.type]; if (!d) return;
      const label = `[${m.slot}] ${m.name} · ${MODNAMES[m.type] || m.type}`;
      if (d.kind === 'di' || d.kind === 'do') for (let b = 0; b < 16; b++) add(`Local:${m.slot}:${d.kind === 'di' ? 'I' : 'O'}.Data.${b}`, 'BOOL', label, 'Controller', 0, d.kind === 'di' ? 'in' : 'out');
      if (d.kind === 'ai' || d.kind === 'ao') for (let c = 0; c < 4; c++) add(`Local:${m.slot}:${d.kind === 'ai' ? 'I' : 'O'}.Ch${c}Data`, 'REAL', label, 'Controller', 0, d.kind === 'ai' ? 'in' : 'out');
    });
    ['FS', 'N', 'Z', 'V', 'C', 'MINOR'].forEach(f => add('S:' + f, 'BOOL', 'Status flag', 'System', 0, 'sys'));
    return out;
  }
  function suggest(kind, text) {
    const q = U(text || '').replace(/^\?$/, '');
    if (kind === 'routine') return curProg().routines.map(r => ({ name: r.name, type: 'ROUTINE', desc: '' })).filter(r => U(r.name).includes(q));
    if (kind === 'label') { const s = new Set(); rungs().forEach(r => { const m = /^LBL\((\w+)\)/i.exec(r.t); if (m) s.add(m[1]); }); return [...s].map(n => ({ name: n, type: 'LABEL', desc: '' })).filter(r => U(r.name).includes(q)); }
    if (kind === 'imm' || kind === 'order') return kind === 'order' ? ['REVERSE', 'WORD', 'HIGH/LOW'].map(n => ({ name: n, type: '', desc: '' })) : [];
    const types = KIND_TYPES[kind];
    let list = candidates();
    if (kind === 'elem' || kind === 'elemw') list = list.filter(c => c.dim).map(c => ({ ...c, name: c.name + '[0]' }));
    else if (types) list = list.filter(c => types.includes(c.type) && !c.dim);
    if (q) list = list.filter(c => U(c.name).includes(q)).sort((a, b) => (U(a.name).startsWith(q) ? 0 : 1) - (U(b.name).startsWith(q) ? 0 : 1));
    return list.slice(0, 120);
  }
  /* the tag list of the operand editor, in groups like the tag browser: a contact looks at the inputs first, a coil at the outputs */
  const GRPS = { in: 'Inputs', out: 'Outputs', tag: 'Tags', sys: 'System' };
  function groupedRows(list, kind, mn, cur) {
    const order = kind === 'bitw' || (INSTR[mn] && INSTR[mn].out) ? ['out', 'tag', 'in', 'sys'] : ['in', 'tag', 'out', 'sys'];
    const row = c => `<div class="row${cur && U(c.name) === U(cur) ? ' on' : ''}" data-pick="${esc(c.name)}"><div class="grow"><div class="nm">${esc(c.name)}</div>${c.desc ? `<div class="sub">${esc(c.desc)}</div>` : ''}</div><span class="ty">${esc(c.type)}${c.dim ? '[' + c.dim + ']' : ''}</span></div>`;
    return order.map(g => {
      const its = list.filter(c => (c.grp || 'tag') === g);
      return its.length ? `<div class="grp sgg">${GRPS[g]} <small>${its.length}</small></div>` + its.map(row).join('') : '';
    }).join('');
  }
  const defaultType = kind => ({ bit: 'BOOL', bitw: 'BOOL', timer: 'TIMER', counter: 'COUNTER', struct: 'TIMER' })[kind] || 'DINT';
  function openEditor(ri, path, focusIdx) {
    const elems = parsed(ri), e = elems && getEl(elems, path);
    if (!e || e.t === 'BR') return;
    let mn = e.t, ops = e.a.slice(), focus = focusIdx || 0;
    const names = () => L.OPN[mn] || (INSTR[mn] ? INSTR[mn].args.map((_, i) => 'Operand ' + i) : []);
    const fields = () => (INSTR[mn] ? INSTR[mn].args : []).map((k, i) => `<div class="frow"><label>${esc(names()[i] || 'Operand ' + i)}${k.endsWith('?') ? ' (optional)' : ''}</label><input class="inp mono" data-op="${i}"${i === focus ? ' autofocus' : ''} value="${esc(ops[i] == null ? (k.endsWith('?') ? '' : '?') : ops[i])}" autocomplete="off" spellcheck="false"></div>`).join('');
    const el = dialog({
      title: `Rung ${ri} · ${mn}`, size: 'md', focus: true,
      body: `<div class="frow"><label>Instruction</label><input class="inp mono" id="mn" value="${esc(mn)}" list="mnlist" autocomplete="off" spellcheck="false"></div>
        <datalist id="mnlist">${Object.keys(INSTR).map(k => `<option value="${k}">${esc(INSTR[k].name)}</option>`).join('')}</datalist>
        <div id="ops">${fields()}</div><div class="errtx" id="ee"></div><div class="grp" id="sgh">Tags</div><div class="list" id="sg" style="max-height:${S.layout === 'phone' ? 'none' : '220px'};border:1px solid var(--border);border-top:0"></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: accept }],
      noEnter: ev => ev.target.closest('#sg'),
    });
    const sg = el.querySelector('#sg'), sgh = el.querySelector('#sgh');
    function showSug() {
      const k = INSTR[mn] ? (INSTR[mn].args[focus] || '').replace('?', '') : '';
      const inp = el.querySelector(`[data-op="${focus}"]`);
      const text = inp ? inp.value.trim() : '';
      // an operand that already names a tag shows the whole list with it marked, like the tag browser
      let list = suggest(k, text);
      const exact = list.some(c => U(c.name) === U(text));
      if (exact) list = suggest(k, '');
      const known = !text || text === '?' || exact || !E.validName(text) || ['imm', 'routine', 'label', 'order', 'expr'].includes(k) || E.parseNumber(text);
      sgh.textContent = k === 'imm' ? 'A number (e.g. 5000)' : `Tags for ${names()[focus] || 'operand'}${KIND_TYPES[k] ? ' · ' + KIND_TYPES[k].join(', ') : ''}`;
      sg.innerHTML = (!known ? `<div class="row new" data-newtag="${esc(text)}">${ic('newtag')}<div class="grow"><div class="nm">New "${esc(text)}"</div><div class="sub">Create a ${defaultType(k)} tag · Ctrl+W</div></div></div>` : '') +
        groupedRows(list, k, mn, text) ||
        (known && k !== 'imm' ? '<div class="empty">No matching tags</div>' : '');
      const on = sg.querySelector('.row.on'); if (on) sg.scrollTop = on.offsetTop - sg.offsetTop - 40;
    }
    function readOps() { el.querySelectorAll('[data-op]').forEach(i => { ops[+i.dataset.op] = i.value.trim(); }); }
    function accept() {
      readOps();
      const m = U(el.querySelector('#mn').value.trim());
      if (!INSTR[m]) { el.querySelector('#ee').textContent = `"${m}" is not an instruction.`; return false; }
      const d = INSTR[m], a = d.args.map((k, i) => (ops[i] == null || ops[i] === '' ? (k.endsWith('?') ? null : '?') : ops[i])).filter(v => v !== null);
      edit(() => {
        const els = parsed(ri), x = getEl(els, path);
        x.t = m; x.a = a;
        writeRung(ri, els);
        S.sel = { ri, path };
      });
    }
    el.addEventListener('focusin', ev => { const i = ev.target.closest('[data-op]'); if (i) { focus = +i.dataset.op; showSug(); } });
    el.addEventListener('input', ev => {
      if (ev.target.id === 'mn') {
        const m = U(ev.target.value.trim());
        if (INSTR[m] && m !== mn) { readOps(); mn = m; el.querySelector('#ops').innerHTML = fields(); el.querySelector('.dh b').textContent = `Rung ${ri} · ${mn}`; focus = 0; showSug(); }
      } else if (ev.target.closest('[data-op]')) showSug();
    });
    el.addEventListener('click', ev => {
      const p = ev.target.closest('[data-pick]');
      if (p) { const inp = el.querySelector(`[data-op="${focus}"]`); if (inp) { inp.value = p.dataset.pick; const nx = el.querySelector(`[data-op="${focus + 1}"]`); if (nx) { nx.focus(); nx.select(); } else showSug(); } return; }
      const nt = ev.target.closest('[data-newtag]');
      if (nt) {
        readOps();
        const k = INSTR[mn].args[focus].replace('?', '');
        const keep = { mn, ops: ops.slice(), focus };
        newTag({ name: nt.dataset.newtag, kind: k, after: () => { openEditor(ri, path, keep.focus); const d = $('#layer .dlg'); if (d) { d.querySelector('#mn').value = keep.mn; d.querySelector('#mn').dispatchEvent(new Event('input', { bubbles: true })); keep.ops.forEach((v, i) => { const x = d.querySelector(`[data-op="${i}"]`); if (x) x.value = v; }); } } });
      }
    });
    const first = el.querySelector(`[data-op="${focus}"]`) || el.querySelector('#mn');
    setTimeout(() => { first.focus(); if (first.select) first.select(); showSug(); }, 30);
  }

  /* ---------- tags ---------- */
  function newTag(o) {
    const P = curProg();
    const types = E.ATOMIC.concat(Object.keys(E.PREDEF), (S.p.dataTypes || []).map(d => d.name));
    const edit0 = o.tag;
    const t0 = edit0 || { name: o.name || '', type: defaultType(o.kind), desc: '' };
    dialog({
      title: edit0 ? `Tag Properties - ${edit0.name}` : 'New Tag', focus: true,
      body: `<div class="frow"><label>Name</label><input class="inp mono" id="tn" value="${esc(t0.name)}" autocomplete="off" spellcheck="false"${edit0 ? ' readonly' : ''}></div>
        <div class="frow"><label>Description</label><input class="inp" id="td" value="${esc(t0.desc || '')}"></div>
        <div class="frow"><label>Type</label><select class="inp" id="tk"><option value="base">Base</option><option value="alias"${t0.alias ? ' selected' : ''}>Alias</option></select></div>
        <div class="frow" id="ra"${t0.alias ? '' : ' hidden'}><label>Alias For</label><input class="inp mono" id="ta" value="${esc(t0.alias || '')}" list="aliaslist" autocomplete="off"></div>
        <datalist id="aliaslist">${candidates().filter(c => c.scope !== 'System' && !c.dim).map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
        <div class="frow" id="rt"${t0.alias ? ' hidden' : ''}><label>Data Type</label><select class="inp" id="tt">${types.map(t => `<option${t === (t0.type || 'BOOL') ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="frow" id="rd"${t0.alias ? ' hidden' : ''}><label>Array size</label><input class="inp" id="tdim" type="number" min="0" max="10000" value="${t0.dim || ''}" placeholder="0 = not an array"></div>
        <div class="frow"><label>Scope</label><select class="inp" id="ts"${edit0 ? ' disabled' : ''}><option value="">Controller (${esc(S.p.controller.name)})</option>${allProgs().map(g => `<option value="${esc(g.name)}"${(o.scope || P.name) === g.name ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
        <div class="errtx" id="te"></div>`,
      mount: el => { el.querySelector('#tk').onchange = ev => { const a = ev.target.value === 'alias'; el.querySelector('#ra').hidden = !a; el.querySelector('#rt').hidden = a; el.querySelector('#rd').hidden = a; }; },
      buttons: [{ l: 'Cancel' }, { l: edit0 ? 'OK' : 'Create', pri: true, run: el => {
        const name = el.querySelector('#tn').value.trim(), scope = el.querySelector('#ts').value, alias = el.querySelector('#tk').value === 'alias';
        const err = m => { el.querySelector('#te').textContent = m; return false; };
        if (!E.validName(name)) return err('Use letters, digits and _, starting with a letter or _ (up to 40).');
        const list = edit0 ? o.list : scope ? allProgs().find(g => g.name === scope).tags : S.p.tags;
        if (!edit0 && list.some(t => U(t.name) === U(name))) return err(`A tag named ${name} already exists in this scope.`);
        const t = { name, desc: el.querySelector('#td').value.trim() };
        if (alias) { t.alias = el.querySelector('#ta').value.trim(); if (!t.alias) return err('Type the tag, member or bit this alias points to.'); }
        else { t.type = el.querySelector('#tt').value; const d = +el.querySelector('#tdim').value; if (d > 0) t.dim = Math.floor(d); }
        if (edit0 && edit0.value !== undefined && !alias && t.type === edit0.type) t.value = edit0.value;
        const ok = edit(() => { if (edit0) list.splice(list.indexOf(edit0), 1, t); else list.push(t); });
        if (!ok) return false;
        toast(edit0 ? `Tag ${name} changed` : `Tag ${name} created`);
        if (o.after) setTimeout(o.after, 0);
      } }],
    });
  }
  function editDesc() {
    const e = curEl(), t = e && tagFor(e.a[0]);
    if (!t) return;
    prompt1('Edit Main Operand Description', t.name, t.desc || '', v => { const P = curProg(); const list = P.tags.includes(t) ? P.tags : S.p.tags; edit(() => { const i = list.indexOf(t); list[i] = { ...list[i], desc: v }; }); });
  }
  const fmtVal = v => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(+v.toPrecision(7))) : v === undefined ? '' : String(v));
  function tagRows(mode, scope, q) {
    const list = scope ? allProgs().find(g => g.name === scope).tags : S.p.tags;
    const rows = [];
    const qq = U(q || '');
    list.filter(t => !qq || U(t.name).includes(qq) || U(t.desc || '').includes(qq)).forEach(t => {
      const ty = typeOf(t), path = t.name, isStruct = !!E.PREDEF[ty] || !!t.dim, open = S.tagOpen.has((scope || '') + '|' + t.name);
      const val = rowVal(path, ty, scope, t);
      rows.push(`<div class="row" data-tag="${esc(t.name)}" data-ty="${esc(ty)}"><span class="exp" data-texp="${esc(t.name)}">${isStruct ? ic(open ? 'down' : 'right') : ''}</span><div class="grow"><div class="nm">${esc(t.name)}</div><div class="sub">${esc(t.alias ? '<' + t.alias + '>  ' : '')}${esc(t.desc || '')}</div></div>
        ${mode === 'mon' && !isStruct ? `<span class="val${val.cls}" data-tv="${esc(path)}">${esc(val.t)}</span>` : ''}<span class="ty">${esc(t.alias ? ty : t.type)}${t.dim ? '[' + t.dim + ']' : ''}</span></div>`);
      if (isStruct && open) {
        const mem = t.dim ? Array.from({ length: Math.min(t.dim, 64) }, (_, i) => ({ name: `[${i}]`, type: t.type })) : E.PREDEF[ty];
        mem.forEach(m => {
          const p = t.dim ? `${t.name}${m.name}` : `${t.name}.${m.name}`, v = E.PREDEF[m.type] ? { t: '{…}', cls: '' } : rowVal(p, m.type, scope);
          rows.push(`<div class="row mem" data-tag="${esc(p)}" data-ty="${esc(m.type)}"><div class="grow"><div class="nm">${esc(p)}</div></div>${mode === 'mon' ? `<span class="val${v.cls}" data-tv="${esc(p)}">${esc(v.t)}</span>` : ''}<span class="ty">${esc(m.type)}</span></div>`);
        });
      }
    });
    return rows.join('') || '<div class="empty">No tags yet. Use + to add one.</div>';
  }
  function rowVal(path, ty, scope, t) {
    if (S.online && ctl.M) {
      const v = ctl.read(path, scope || undefined), f = ty === 'BOOL' ? ctl.forced(path, scope || undefined) : null;
      return { t: fmtVal(v), cls: (ty === 'BOOL' && v === 1 ? ' on' : '') + (f !== null && f !== undefined ? ' f' : '') };
    }
    if (t && t.value !== undefined && typeof t.value !== 'object') return { t: fmtVal(t.value), cls: '' };
    return { t: '', cls: '' };
  }
  function tagEditorBody(inline, mode0, scope0) {
    S.tagMode = mode0 || S.tagMode || 'mon';
    if (scope0 !== undefined) S.tagScope = scope0;
    const sc = S.tagScope || '';
    return `<div style="padding:8px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;flex:none;border-bottom:1px solid var(--border)">
        <span class="seg"><span data-tmode="mon" class="${S.tagMode === 'mon' ? 'on' : ''}">Monitor Tags</span><span data-tmode="edit" class="${S.tagMode === 'edit' ? 'on' : ''}">Edit Tags</span></span>
        <select class="inp" id="tscope" style="width:auto;flex:1;min-width:140px"><option value="">Controller (${esc(S.p.controller.name)})</option>${allProgs().map(g => `<option value="${esc(g.name)}"${sc === g.name ? ' selected' : ''}>Program: ${esc(g.name)}</option>`).join('')}</select>
        <input class="inp" id="tq" placeholder="Filter" style="flex:1;min-width:120px" value="${esc(S.tagQ || '')}">${inline ? '' : `<button class="btn" data-cmd="newtag">${ic('plus')}New Tag</button>`}</div>
      <div class="list" id="tagrows" style="flex:1">${tagRows(S.tagMode, sc, S.tagQ)}</div>
      <p class="help" style="padding:0 12px">${S.tagMode === 'mon' ? (S.online ? 'Online: tap a BOOL to toggle it, a number to type a value.' : 'Offline: values are the saved start values of the project.') : 'Tap a tag to change its properties.'}</p>`;
  }
  function tagEditor(mode, scope) {
    if (S.layout === 'phone') { S.tagMode = mode; if (scope !== undefined) S.tagScope = scope; S.area = 'tags'; render(); return; }
    dialog({ title: 'Tags · ' + S.p.controller.name, size: 'lg', flush: true, body: `<div id="tagpage" style="display:flex;flex-direction:column;flex:1;min-height:0">${tagEditorBody(false, mode, scope)}</div>`, buttons: [{ l: 'Close', pri: true }] });
  }
  function refreshTags() { const r = $('#tagrows'); if (r) r.innerHTML = tagRows(S.tagMode, S.tagScope || '', S.tagQ); }
  function tagClick(row) {
    const name = row.dataset.tag, ty = row.dataset.ty, scope = S.tagScope || '';
    const list = scope ? allProgs().find(g => g.name === scope).tags : S.p.tags;
    const t = list.find(x => x.name === name);
    if (S.tagMode === 'edit') { if (t) newTag({ tag: t, list }); return; }
    if (E.PREDEF[ty] || (t && t.dim)) return;
    if (S.online && ctl.M) {
      if (ty === 'BOOL') { if (!ctl.toggle(name, scope || undefined)) toast(`${name} cannot be written here (an input or a read-only tag).`, 'err'); live(true); return; }
      prompt1('Write value', name, fmtVal(ctl.read(name, scope || undefined)), v => { const n = E.parseNumber(v); if (!n) return 'Type a number.'; if (!ctl.write(name, n.v, scope || undefined)) return 'This tag cannot be written (an input or read-only).'; live(true); });
      return;
    }
    if (!t || t.alias) { toast('Start values can be set for base tags only.'); return; }
    if (ty === 'BOOL') { edit(() => { t.value = t.value ? 0 : 1; }); refreshTags(); return; }
    prompt1('Start value', name, fmtVal(t.value || 0), v => { const n = E.parseNumber(v); if (!n) return 'Type a number.'; edit(() => { t.value = n.v; }); });
  }

  /* ---------- dialogs: rung text, comment, find, go to, cross reference, help ---------- */
  function rungText(ri) {
    if (ri == null || !rungs()[ri]) return;
    dialog({ title: `Edit Rung ${ri}`, size: 'md', focus: true,
      body: `<textarea class="inp" id="rtx" rows="5" spellcheck="false">${esc(rungs()[ri].t)}</textarea><p class="help">Rung text, as in the reference: <span class="mono">[XIC(a),XIC(b)]XIC(c)OTE(d);</span></p><div class="errtx" id="rte"></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        const t = el.querySelector('#rtx').value.trim(), pr = E.parseRung(t);
        if (pr.err) { el.querySelector('#rte').textContent = pr.err; return false; }
        edit(() => { rungs()[ri].t = pr.elems.length ? E.serializeRung(pr.elems) : ''; S.sel = null; S.selRung = ri; });
      } }] });
  }
  function rungComment(ri) {
    if (ri == null) return;
    dialog({ title: `Rung ${ri} Comment`, size: 'md', focus: true, body: `<textarea class="inp" id="rc" rows="4" style="font-family:var(--ui)">${esc(rungs()[ri].c || '')}</textarea>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => { const v = el.querySelector('#rc').value.trim(); edit(() => { if (v) rungs()[ri].c = v; else delete rungs()[ri].c; }); } }] });
  }
  function cmdFind() { prompt1('Find', 'Find what', S.find, v => { if (!v) return 'Type a tag or an instruction.'; S.find = v; if (!findNext(false)) return `"${v}" was not found in ${curRoutine().name}.`; }, 'Looks for a tag, an operand or a mnemonic in this routine. F3 finds the next one.'); }
  function findNext(wrapMsg) {
    const q = U(S.find), R = rungs();
    const items = [];
    R.forEach((r, ri) => { const el = parsed(ri); if (el) flat(el).forEach(p => items.push({ ri, p, e: getEl(el, p) })); });
    if (!items.length) return false;
    const cur = S.sel ? items.findIndex(x => x.ri === S.sel.ri && x.p.join() === S.sel.path.join()) : -1;
    for (let k = 1; k <= items.length; k++) {
      const x = items[(cur + k) % items.length];
      if (U(x.e.t) === q || x.e.a.some(a => U(a).includes(q))) { S.sel = { ri: x.ri, path: x.p }; S.selRung = null; render(); scrollToSel(); return true; }
    }
    if (wrapMsg) toast(`"${S.find}" was not found.`);
    return false;
  }
  function cmdGoto() { prompt1('Go To', 'Rung number', curSelRung() == null ? '0' : String(curSelRung()), v => { const n = parseInt(v, 10); if (!(n >= 0 && n < rungs().length)) return `Type a rung from 0 to ${rungs().length - 1}.`; S.sel = null; S.selRung = n; render(); scrollToSel(); }); }
  function scrollToSel() {
    const w = $('#ladwrap'); if (!w) return;
    const ri = curSelRung();
    const r = w.querySelector(`rect.tap[data-rn][data-ri="${ri}"]`);
    if (r) { const y = +r.getAttribute('y'); if (y < w.scrollTop + 20 || y > w.scrollTop + w.clientHeight - 60) w.scrollTop = Math.max(0, y - 40); }
  }
  const DESTR = ['bitw', 'dest', 'idest', 'elemw', 'timer', 'counter', 'struct'];
  function xref(name0) {
    const e = curEl();
    const name = name0 || (e && e.a[0] && e.a[0] !== '?' ? String(e.a[0]).split(/[.[]/)[0] : '');
    const rows = [];
    if (name) allProgs().forEach(g => g.routines.forEach(r => r.rungs.forEach((rg, ri) => {
      const pr = E.parseRung(rg.t); if (pr.err) return;
      flat(pr.elems).forEach(p => {
        const x = getEl(pr.elems, p), d = INSTR[x.t]; if (!d) return;
        x.a.forEach((a, k) => {
          const hitIt = U(String(a).split(/[.[]/)[0]) === U(name) || (d.args[k] === 'expr' && new RegExp(`\\b${name}\\b`, 'i').test(a));
          if (hitIt) rows.push({ g: g.name, r: r.name, ri, p, mn: x.t, a, dest: DESTR.includes((d.args[k] || '').replace('?', '')) ? 'Y' : 'N' });
        });
      });
    })));
    dialog({ title: 'Cross Reference', size: 'lg', flush: true,
      body: `<div style="padding:8px 12px;display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--border)"><label>Tag</label><input class="inp mono" id="xq" value="${esc(name)}" style="max-width:280px"><button class="btn" id="xgo">Find</button></div>
        <div class="list" style="flex:1">${rows.length ? rows.map((x, n) => `<div class="row" data-x="${n}"><div class="grow"><div class="nm">${esc(x.a)}</div><div class="sub">${esc(x.g)} · ${esc(x.r)} · Rung ${x.ri}</div></div><span class="ty">${x.mn}</span><span class="ty" title="Destructive">${x.dest === 'Y' ? 'writes' : 'reads'}</span></div>`).join('') : `<div class="empty">${name ? 'No references to ' + esc(name) : 'Type a tag name'}</div>`}</div>`,
      buttons: [{ l: 'Close', pri: true }],
      mount: el => {
        el.querySelector('#xgo').onclick = () => xref(el.querySelector('#xq').value.trim());
        el.addEventListener('click', ev => { const r = ev.target.closest('[data-x]'); if (!r) return; const x = rows[+r.dataset.x]; closeLayer(); S.prog = x.g; S.routine = x.r; S.sel = { ri: x.ri, path: x.p }; S.selRung = null; if (S.layout === 'phone') S.area = 'ladder'; reverify(); render(); scrollToSel(); });
      } });
  }
  function instrHelp() {
    const e = curEl(), mn = e ? e.t : 'XIC', d = INSTR[mn];
    const names = L.OPN[mn] || (d ? d.args.map((_, i) => 'Operand ' + i) : []);
    dialog({ title: `Instruction Help - ${mn}`, size: 'md',
      body: d ? `<p><b>${mn}</b> · ${esc(d.name)} · ${esc(d.grp)}</p><div class="frow"><label>Operands</label><div class="mono">${d.args.length ? d.args.map((k, i) => `${esc(names[i] || 'Operand ' + i)} <span class="muted">(${k.replace('?', ', optional')})</span>`).join('<br>') : 'none'}</div></div>
        <p class="help">Rung text: <span class="mono">${mn}(${names.map(() => '?').join(',')})</span>. Behaviour as in the reference's instruction help (docs/PLC_APP_SPEC.md section 7).</p>` : 'Select an instruction first.',
      buttons: [{ l: 'Close', pri: true }] });
  }
  function about() {
    dialog({ title: 'About MT PLC Studio', body: `<div style="display:flex;gap:14px;align-items:center"><img src="icons/icon-192.png" width="64" height="64" alt=""><div><b style="font-size:16px">MT PLC Studio</b><br>Version ${VERSION}${BUILD !== 'dev' ? ` <span class="muted">(${esc(BUILD)})</span>` : ''}<br><span class="muted">Tag-based PLC ladder programming and simulation.</span></div></div>
      <p class="help">Built-in controller PLC-CPU 1.0. Instruction behaviour follows the reference software's instruction help. Not affiliated with any PLC manufacturer.</p>`, buttons: [{ l: 'Updates…', run: () => { setTimeout(() => C.updates.run(), 0); } }, { l: 'Close', pri: true }] });
  }
  function options() {
    const P = S.prefs;
    dialog({ title: 'Options',
      body: `<div class="frow"><label>Layout</label><select class="inp" id="ol">${[['auto', 'Automatic (follows the window)'], ['desktop', 'Desktop'], ['tablet', 'Tablet'], ['phone', 'Phone']].map(([v, t]) => `<option value="${v}"${P.layout === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="frow"><label>Theme</label><select class="inp" id="ot">${[['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']].map(([v, t]) => `<option value="${v}"${P.theme === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="frow"><label>Ladder zoom</label><input class="inp" id="oz" type="range" min="60" max="200" step="5" value="${Math.round(P.zoom * 100)}"></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => { P.layout = el.querySelector('#ol').value; P.theme = el.querySelector('#ot').value; P.zoom = +el.querySelector('#oz').value / 100; savePrefs(); applyTheme(); setTimeout(render, 0); } }] });
  }

  /* ---------- projects: new, open, save as, import, export ---------- */
  function cmdNew() {
    prompt1('New Project', 'Controller name', 'New_Project', v => {
      if (!E.validName(v)) return 'Use letters, digits and _, starting with a letter (up to 40).';
      if (index().some(x => U(x.name) === U(v))) return `A project named ${v} already exists. Open it, or pick another name.`;
      saveProject();
      setTimeout(() => openProject(blank(v)), 0);
    }, 'A new project has a 10-slot rack with 16 inputs in slot 1 and 16 outputs in slot 2, and one empty rung.');
  }
  function cmdOpen() {
    saveProject();
    const ix = index();
    const el = dialog({ title: 'Open Project', size: 'md', flush: true,
      body: `<div class="list" style="flex:1">${ix.map(x => `<div class="row" data-open="${esc(x.name)}">${ic('file')}<div class="grow"><div class="nm">${esc(x.name)}</div><div class="sub">Saved ${new Date(x.at).toLocaleString()}</div></div>${x.name !== S.p.controller.name ? `<button class="ib" data-delp="${esc(x.name)}" title="Delete">${ic('trash')}</button>` : '<span class="ty">open</span>'}</div>`).join('')}
        <div class="grp">Examples</div><div class="row" data-ex="1">${ic('ladder')}<div class="grow"><div class="nm">Motor_Demo</div><div class="sub">Start / stop with seal-in, run lamp timer, start counter</div></div></div></div>`,
      buttons: [{ l: 'Import…', run: () => { setTimeout(cmdImport, 0); } }, { l: 'Close', pri: true }] });
    el.addEventListener('click', ev => {
      const d = ev.target.closest('[data-delp]');
      if (d) { ev.stopPropagation(); const n = d.dataset.delp; confirmDlg('Delete project', `Delete <b>${esc(n)}</b> from this device? This cannot be undone.`, 'Delete', () => { store.del('p.' + n); store.set('index', index().filter(x => x.name !== n)); setTimeout(cmdOpen, 0); }, true); return; }
      const o = ev.target.closest('[data-open]');
      if (o) { const p = store.get('p.' + o.dataset.open); closeLayer(); if (validProject(p)) openProject(p); else toast('That project could not be read.', 'err'); return; }
      if (ev.target.closest('[data-ex]')) { closeLayer(); const p = example(); if (index().some(x => x.name === p.controller.name)) p.controller.name = uniqueName(p.controller.name); openProject(p); }
    });
  }
  const uniqueName = n => { let k = 2; while (index().some(x => U(x.name) === U(`${n}_${k}`))) k++; return `${n}_${k}`; };
  function cmdSaveAs() {
    prompt1('Save As', 'New controller name', S.p.controller.name + '_copy', v => {
      if (!E.validName(v)) return 'Use letters, digits and _, starting with a letter (up to 40).';
      if (index().some(x => U(x.name) === U(v))) return `A project named ${v} already exists.`;
      saveProject();
      S.p = JSON.parse(JSON.stringify(S.p)); S.p.controller.name = v;
      saveProject(); render(); toast(`Saved as ${v}`);
    });
  }
  function cmdExport() {
    const name = `${S.p.controller.name}.mtps.json`, blob = new Blob([JSON.stringify(S.p, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`Exported ${name}`);
  }
  function cmdImport() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      f.text().then(t => {
        let p; try { p = JSON.parse(t); } catch (e) { toast('That file is not a project (not JSON).', 'err'); return; }
        if (!validProject(p)) { toast('That file is not an MT PLC Studio project.', 'err'); return; }
        if (index().some(x => U(x.name) === U(p.controller.name))) p.controller.name = uniqueName(p.controller.name);
        saveProject(); openProject(p);
      });
    };
    inp.click();
  }

  /* ---------- organizer actions ---------- */
  function openRoutine(key) { const [g, r] = key.slice(3).split('/'); S.prog = g; S.routine = r; S.sel = null; S.selRung = 0; S.drawer = false; if (S.layout === 'phone') S.area = 'ladder'; reverify(); render(); }
  function newRoutine(gname) {
    const g = allProgs().find(x => x.name === gname);
    prompt1('New Routine', 'Name', 'Routine' + (g.routines.length + 1), v => {
      if (!E.validName(v)) return 'Use letters, digits and _ (up to 40).';
      if (g.routines.some(r => U(r.name) === U(v))) return 'A routine with that name exists.';
      edit(() => { g.routines.push({ name: v, rungs: [{ t: '' }] }); S.prog = g.name; S.routine = v; S.sel = null; S.selRung = 0; });
    }, 'Call it from the main routine with JSR.');
  }
  function renameRoutine(key) {
    const [gn, rn] = key.slice(3).split('/'), g = allProgs().find(x => x.name === gn), r = g.routines.find(x => x.name === rn);
    prompt1('Rename Routine', 'Name', rn, v => {
      if (!E.validName(v)) return 'Use letters, digits and _ (up to 40).';
      if (U(v) !== U(rn) && g.routines.some(x => U(x.name) === U(v))) return 'A routine with that name exists.';
      edit(() => { r.name = v; if (g.main === rn) g.main = v; if (S.routine === rn) S.routine = v; });
    });
  }
  function deleteRoutine(key) {
    const [gn, rn] = key.slice(3).split('/'), g = allProgs().find(x => x.name === gn);
    if (g.main === rn) { toast('The main routine cannot be deleted.', 'err'); return; }
    confirmDlg('Delete Routine', `Delete <b>${esc(rn)}</b> and its rungs?`, 'Delete', () => { edit(() => { g.routines = g.routines.filter(x => x.name !== rn); if (S.routine === rn) { S.routine = g.main; S.sel = null; S.selRung = 0; } }); }, true);
  }
  function newModule() {
    if (!offline()) { toast('Go offline to add a module.'); return; }
    const used = new Set(S.p.rack.modules.map(m => m.slot)), free = [];
    for (let s = 1; s < S.p.rack.size; s++) if (!used.has(s)) free.push(s);
    if (!free.length) { toast('The rack is full.', 'err'); return; }
    dialog({ title: 'New Module',
      body: `<div class="frow"><label>Module</label><select class="inp" id="mt">${Object.keys(E.MODULES).map(t => `<option value="${t}">${t} · ${esc(MODNAMES[t] || '')}</option>`).join('')}</select></div>
        <div class="frow"><label>Slot</label><select class="inp" id="ms">${free.map(s => `<option>${s}</option>`).join('')}</select></div>
        <div class="frow"><label>Name</label><input class="inp" id="mn2" value="MOD_${free[0]}"></div><div class="errtx" id="me"></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'Create', pri: true, run: el => {
        const type = el.querySelector('#mt').value, slot = +el.querySelector('#ms').value, name = el.querySelector('#mn2').value.trim();
        if (!E.validName(name)) { el.querySelector('#me').textContent = 'Use letters, digits and _.'; return false; }
        edit(() => { S.p.rack.modules.push({ slot, type, name }); });
        toast(`Module ${type} added in slot ${slot}: its tags are Local:${slot}:I / O`);
      } }] });
  }
  function deleteModule(slot) {
    const m = S.p.rack.modules.find(x => x.slot === slot);
    confirmDlg('Delete Module', `Delete <b>[${slot}] ${esc(m.type)} ${esc(m.name)}</b>? Rungs and aliases that use Local:${slot} will show errors.`, 'Delete', () => edit(() => { S.p.rack.modules = S.p.rack.modules.filter(x => x.slot !== slot); }), true);
  }
  /* tabbed dialogs (Properties): chips on top, one pane each */
  const tabbed = (tabs, first) => `<div class="fchips dtabs">${tabs.map(([k, t]) => `<span class="fchip${k === first ? ' on' : ''}" data-dt="${k}">${t}</span>`).join('')}</div>` +
    tabs.map(([k, , body]) => `<div data-pane="${k}"${k === first ? '' : ' hidden'}>${body}</div>`).join('');
  function bindTabs(el) {
    el.addEventListener('click', ev => {
      const c = ev.target.closest('[data-dt]'); if (!c) return;
      el.querySelectorAll('[data-dt]').forEach(x => x.classList.toggle('on', x === c));
      el.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== c.dataset.dt; });
    });
  }
  const kv = (k, v) => `<div class="kv"><span>${k}</span><span class="v">${v}</span></div>`;
  const when = t => (t ? new Date(t).toLocaleTimeString() : '');
  /* Module Properties, as in the reference: General, Connection (Inhibit, Major Fault on Controller), Status */
  function moduleProps(slot, tab) {
    const m = S.p.rack.modules.find(x => x.slot === slot);
    if (!m) return;
    const d = E.MODULES[m.type] || {};
    const used = new Set(S.p.rack.modules.filter(x => x !== m).map(x => x.slot)), slots = [];
    for (let s = 1; s < S.p.rack.size; s++) if (!used.has(s)) slots.push(s);
    const st = S.online && ctl.M ? ctl.moduleStatus(slot) : null;
    const io = S.online && ctl.M && ctl.M.mods.get(slot) ? ctl.ioImage(slot) : null;
    const card = chassis.module(slot);
    const dis = offline() ? '' : ' disabled';
    const general = `<div class="frow"><label>Type</label><span>${esc(m.type)} <span class="muted">· ${esc(MODNAMES[m.type] || '')}</span></span></div>
      <div class="frow"><label>Name</label><input class="inp" id="mp-n" value="${esc(m.name)}"${dis}></div>
      <div class="frow"><label>Description</label><input class="inp" id="mp-d" value="${esc(m.desc || '')}"${dis}></div>
      <div class="frow"><label>Slot</label><select class="inp" id="mp-s"${dis}>${slots.map(s => `<option${s === slot ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="frow"><label>Tags</label><span class="mono">${['I', 'O'].filter(x => d[x]).map(x => `Local:${slot}:${x}`).join(', ') || '-'}</span></div>`;
    const conn = `<div class="frow"><label>RPI (ms)</label><input class="inp" id="mp-r" type="number" min="2" max="750" value="${m.rpi || 20}"${dis}></div>
      <label class="frow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="mp-i"${m.inhibit ? ' checked' : ''}${dis}><span>Inhibit module <span class="muted">(no connection: inputs hold, outputs off)</span></span></label>
      <label class="frow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="mp-f"${m.majorOnFail ? ' checked' : ''}${dis}><span>Major fault on controller if the connection fails while in Run</span></label>
      ${st && st.code ? `<div class="kv" style="color:var(--danger)"><span>Module fault</span><span class="v">(Code ${st.code}) ${esc(st.text)}</span></div>` : ''}
      <p class="help">${offline() ? 'These settings go to the controller with the next Download.' : 'Go offline to change them.'}</p>`;
    const bits = v => (typeof v === 'number' ? v.toString(2).padStart(16, '0') : v.map(x => (+x).toFixed(1)).join(', '));
    const status = !S.online ? '<p class="help">Offline. Go online to see the module status.</p>'
      : kv('Status', `<b style="color:${st.state === 'Running' ? 'var(--ok)' : st.state === 'Faulted' ? 'var(--danger)' : 'var(--warn-text)'}">${st.state}</b>`) +
        (st.code ? kv('Fault code', st.code) + kv('Fault', esc(st.text)) : st.text ? kv('Note', esc(st.text)) : '') +
        (io && io.in != null ? kv('Inputs', bits(io.in)) : '') + (io && io.out != null ? kv('Outputs', bits(io.out)) : '') +
        (card && card.type === m.type ? `<div class="brow"><button class="btn" id="mp-x">${card.fault ? 'Clear the card fault' : 'Simulate a module fault'}</button></div>` : `<p class="help">${card ? `Slot ${slot} of the chassis holds a ${esc(card.type)}, not this module.` : `Slot ${slot} of the chassis is empty: add the card in the Emulator.`}</p>`);
    dialog({ title: `Module Properties - [${slot}] ${m.type}`, size: 'md',
      body: tabbed([['gen', 'General', general], ['con', 'Connection', conn], ['st', 'Status' + (st && st.state === 'Faulted' ? ' ⚠' : ''), status]], tab || (st && st.state === 'Faulted' ? 'st' : 'gen')),
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el2 => {
        if (!offline()) return;
        const name = el2.querySelector('#mp-n').value.trim(), ns = +el2.querySelector('#mp-s').value;
        if (!E.validName(name)) { toast('Module name: letters, digits and _.', 'err'); return false; }
        const nv = { slot: ns, type: m.type, name, desc: el2.querySelector('#mp-d').value.trim(), rpi: Math.max(2, Math.min(750, +el2.querySelector('#mp-r').value || 20)), inhibit: el2.querySelector('#mp-i').checked, majorOnFail: el2.querySelector('#mp-f').checked };
        if (!nv.desc) delete nv.desc;
        if (!nv.inhibit) delete nv.inhibit;
        if (!nv.majorOnFail) delete nv.majorOnFail;
        if (JSON.stringify(nv) !== JSON.stringify(m)) edit(() => { S.p.rack.modules.splice(S.p.rack.modules.indexOf(m), 1, nv); });
      } }],
      mount: e2 => {
        bindTabs(e2);
        const x = e2.querySelector('#mp-x');
        if (x) x.onclick = () => { chassis.setFault(slot, !card.fault); chassis.advance(0); live(true); render(); moduleProps(slot, 'st'); };
      } });
  }
  /* Controller Properties: General, Major Faults, Minor Faults */
  function controllerProps(tab) {
    const on = S.online && ctl.M, dis = offline() ? '' : ' disabled';
    const general = `<div class="frow"><label>Name</label><input class="inp" id="cp-n" value="${esc(S.p.controller.name)}"${dis}></div>
      <div class="frow"><label>Description</label><input class="inp" id="cp-d" value="${esc(S.p.controller.desc || '')}"${dis}></div>
      ${kv('Type', 'PLC-CPU (built-in controller)')}${kv('Revision', '1.0')}${kv('Chassis', `PLC-RACK${S.p.rack.size}, slot 0`)}${kv('Path', esc(curPath()))}
      <p class="help">The name is also the project name.</p>`;
    const offMsg = '<p class="help">Offline. Go online to see the faults of the controller.</p>';
    const row = f => `<div class="row"><div class="grow"><div class="sub" style="white-space:normal">${when(f.at)} · Type ${f.type} Code ${f.code}: ${esc(f.text)}${f.count > 1 ? ` (×${f.count})` : ''}</div></div></div>`;
    const majors = !on ? offMsg
      : (ctl.fault ? `<div class="kv" style="color:var(--danger)"><span>Current fault</span><span class="v">Type ${ctl.fault.type}, Code ${ctl.fault.code}</span></div><p>${esc(ctl.fault.text)}</p>` : '<p><b style="color:var(--ok)">No major faults.</b></p>') +
        (ctl.majors.length ? `<div class="grp">Recent</div>${ctl.majors.map(row).join('')}` : '') +
        `<div class="brow"><button class="btn danger" id="cp-cm"${ctl.fault ? '' : ' disabled'}>Clear Majors</button></div>`;
    const minors = !on ? offMsg
      : (ctl.minors.length ? ctl.minors.map(row).join('') : '<p><b style="color:var(--ok)">No minor faults.</b></p>') +
        `<div class="brow"><button class="btn" id="cp-cn"${ctl.minors.length ? '' : ' disabled'}>Clear Minors</button></div>`;
    dialog({ title: 'Controller Properties - ' + S.p.controller.name, size: 'md',
      body: tabbed([['gen', 'General', general], ['maj', 'Major Faults' + (on && ctl.fault ? ' ⚠' : ''), majors], ['min', 'Minor Faults', minors]], tab || (on && ctl.fault ? 'maj' : 'gen')),
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        if (!offline()) return;
        const v = el.querySelector('#cp-n').value.trim(), desc = el.querySelector('#cp-d').value.trim();
        if (!E.validName(v)) { toast('Name: letters, digits and _ (up to 40).', 'err'); return false; }
        if (U(v) !== U(S.p.controller.name) && index().some(x => U(x.name) === U(v))) { toast('A project with that name exists.', 'err'); return false; }
        const old = S.p.controller.name;
        if (v === old && desc === (S.p.controller.desc || '')) return;
        edit(() => { S.p.controller.name = v; if (desc) S.p.controller.desc = desc; else delete S.p.controller.desc; });
        if (v !== old) { store.del('p.' + old); store.set('index', index().filter(x => x.name !== old)); saveProject(); }
      } }],
      mount: el => {
        bindTabs(el);
        const cm = el.querySelector('#cp-cm'), cn = el.querySelector('#cp-cn');
        if (cm) cm.onclick = () => { ctl.clearFault(); live(true); render(); controllerProps('maj'); };
        if (cn) cn.onclick = () => { ctl.clearMinors(); controllerProps('min'); };
      } });
  }

  /* ---------- online ---------- */
  function verifyCmd(routineOnly) {
    reverify();
    const v = routineOnly ? E.verify(S.p, { program: curProg().name, routine: curRoutine().name }) : S.verify;
    if (S.layout === 'desktop') S.prefs.err = true; else if (S.layout === 'tablet') S.errOpen = true; else S.area = 'more';
    S.verifyShown = v;
    render();
    toast(v.errors.length ? `${v.errors.length} error(s), ${v.warnings.length} warning(s)` : `Verified: no errors, ${v.warnings.length} warning(s)`, v.errors.length ? 'err' : 'ok');
  }
  const MODE = () => ({ prog: 'Program', run: 'Run', remprog: 'Rem Prog', remrun: 'Rem Run' }[ctl.mode]);
  function online() {
    S.online = true;
    // the I/O panel holds the simulated field devices: show it when going online
    if (S.layout === 'desktop' && !S.prefs.io) { S.prefs.io = true; savePrefs(); }
    render(); live(true);
  }
  /* Go Online: the same project, online; an empty controller, Download; another project, Upload or Download */
  function goOnline() {
    if (!reachable()) return;
    if (ctl.holds(S.p) && ctl.M) { online(); toast(`Online with ${ctl.name}`); return; }
    if (!ctl.M) { download(); return; }
    dialog({ title: 'Connected To Go Online',
      body: `<p>The controller holds another project, or another version of this one.</p>${kv('In the controller', esc(ctl.name))}${kv('On this device', esc(S.p.controller.name))}${kv('Controller mode', MODE())}
        <p class="help"><b>Upload</b> opens the project of the controller here. <b>Download</b> sends the project of this device to the controller.</p>`,
      buttons: [{ l: 'Cancel' }, { l: 'Upload…', run: () => { setTimeout(upload, 0); } }, { l: 'Download…', pri: true, run: () => { setTimeout(download, 0); } }] });
  }
  /* Upload: the project of the controller (with its current tag values) opens on this device */
  function upload() {
    if (!reachable()) return;
    if (!ctl.M) { toast('The controller is empty: nothing to upload.', 'err'); return; }
    const p = ctl.upload();
    const exists = index().some(x => U(x.name) === U(p.controller.name));
    confirmDlg('Upload', `Upload <b>${esc(p.controller.name)}</b> from the controller?${exists ? ' The copy on this device with the same name is replaced.' : ''}`, 'Upload', () => {
      const path = curPath();
      saveProject();
      openProject(p, true);
      // the uploaded project keeps the path it came from
      setPath(path);
      // the opened copy equals the controller's (values aside), so the controller holds it
      ctl.copy = JSON.stringify(S.p);
      online();
      toast(`Uploaded ${p.controller.name}`, 'ok');
    });
  }
  /* no controller at the path (empty slot, an I/O card, a card removed): like a terminal that finds nothing there */
  function reachable() {
    relink();
    if (ctl !== NOCTL) return true;
    const x = resolve(curPath()) || {};
    const why = !x.rack ? `No emulated controller is on at the address ${esc(x.ip || '?')}.`
      : !x.m ? `Slot ${x.slot} of chassis ${esc(x.rack.name)} is empty.`
        : !x.m.ctl ? `Slot ${x.slot} holds an I/O card (${esc(x.m.type)}), not a controller.`
          : `The controller in slot ${x.slot} (${esc(x.m.name)}) is off.`;
    dialog({ title: 'Failed to go online', body: `<p>No controller answers at the path <b class="mono">${esc(curPath())}</b>.</p>
        <p class="help">${why} Pick a controller in Who Active, or add or turn one on in the Emulator.</p>`,
      buttons: [{ l: 'Close' }, { l: 'Emulator…', run: () => { setTimeout(chassisMonitor, 0); } }, { l: 'Who Active…', pri: true, run: () => { setTimeout(whoActive, 0); } }] });
    return false;
  }
  function download() {
    if (!reachable()) return;
    reverify();
    if (S.verify.errors.length) {
      if (S.layout === 'desktop') S.prefs.err = true; else if (S.layout === 'tablet') S.errOpen = true; else S.area = 'more';
      render();
      toast(`Fix ${S.verify.errors.length} error(s) before downloading.`, 'err');
      return;
    }
    dialog({ title: 'Download', body: `<p>Download to the controller:</p>${kv('Name', esc(ctl.name || '(no project)'))}${kv('Type', 'PLC-CPU 1.0')}${kv('Path', esc(curPath()))}${kv('Mode', MODE())}
        <p>${ctl.name ? `The project in the controller (<b>${esc(ctl.name)}</b>) will be replaced by <b>${esc(S.p.controller.name)}</b>.` : `<b>${esc(S.p.controller.name)}</b> will be downloaded.`} ${RUNM() ? 'The controller goes to Remote Program first.' : ''}</p>`,
      buttons: [{ l: 'Cancel' }, { l: 'Download', pri: true, run: () => {
        if (ctl.key === 'RUN') { toast('The key switch is in RUN: turn it to REM to download.', 'err'); return false; }
        const r = ctl.download(JSON.parse(JSON.stringify(S.p)));
        if (!r.ok) { toast(r.lines[r.lines.length - 1] || 'Download failed.', 'err'); return false; }
        // the cards of the chassis answer at once
        chassis.advance(0);
        saveChassis();
        online();
        setTimeout(() => {
          if (ctl.key === 'REM') confirmDlg('Download', 'Done. Return the controller to Remote Run?', 'Yes', () => { setMode('remrun'); });
        }, 0);
      } }] });
  }
  const RUNM = () => ctl.mode === 'run' || ctl.mode === 'remrun';
  /* Accept Edits: the edited logic goes into the controller without a Download (spec section 8, online edits) */
  function acceptEdits() {
    reverify();
    if (S.verify.errors.length) {
      if (S.layout === 'desktop') S.prefs.err = true; else if (S.layout === 'tablet') S.errOpen = true; else S.area = 'more';
      render();
      toast(`Fix ${S.verify.errors.length} error(s) before accepting the edits.`, 'err');
      return;
    }
    const go = () => {
      const r = ctl.edit(JSON.parse(JSON.stringify(S.p)));
      if (!r.ok) { toast(r.lines[r.lines.length - 1] || 'The edits were not accepted.', 'err'); return; }
      saveProject();
      toast('Edits accepted: the controller runs the new logic.', 'ok');
      live(true); render();
    };
    if (ctl.running) confirmDlg('Accept Edits', 'The controller is running. The edited logic starts on the next scan. Accept the edits?', 'Accept', go);
    else go();
  }
  /* Cancel Edits: back to the logic in the controller */
  function cancelEdits() {
    confirmDlg('Cancel Edits', 'Throw away the edits that are not in the controller?', 'Cancel Edits', () => edit(() => {
      const p = JSON.parse(ctl.copy);
      S.p = p; S.sel = null; S.selRung = 0;
    }), true);
  }
  function goOffline() { S.online = false; toast('Offline. The controller keeps running.'); render(); }
  function setMode(m) { if (!ctl.setMode(m)) toast('The key switch does not allow that mode.', 'err'); live(true); render(); }
  /* Who Active: browse the emulated Ethernet like a communications driver: each controller that is on and has an IP
     address, then its chassis backplane; a controller picked there becomes the project path */
  function whoActive() {
    const cur = parsePath(curPath());
    const modeOf = c => (c.fault ? 'Faulted' : { prog: 'Program', run: 'Run', remprog: 'Rem Prog', remrun: 'Rem Run' }[c.mode]);
    const gates = [];   // [ip, rack] once per address (the first chassis that answers there)
    racks.forEach(r => r.controllers().forEach(m => { if (m.ip && m.ctl.powered && !gates.some(g => g[0] === m.ip)) gates.push([m.ip, r, m]); }));
    let sel = null;
    if (cur) { const x = resolve(curPath()); if (x && x.ctl) sel = { ip: x.ip || gatewayIp(x.rack), slot: x.slot }; }
    if (!sel && gates.length) sel = { ip: gates[0][0], slot: gates[0][2].slot };
    const pad = s => (s < 10 ? '0' + s : s);
    const rows = () => gates.map(([ip, r, gm]) => `<div class="nd" style="padding-left:20px">${ic('chip', 'i ti')}${ip}, PLC-CPU ${esc(gm.name)}</div>
      <div class="nd" style="padding-left:36px">${ic('rack', 'i ti')}Backplane, ${esc(r.name)}</div>` + Array.from({ length: r.size }, (_, s) => {
      const m = r.module(s);
      if (!m) return '';
      if (!m.ctl) return `<div class="nd dim" style="padding-left:52px">${ic('io', 'i ti')}${pad(s)}, ${esc(m.type)} ${esc(m.name)}</div>`;
      const c = m.ctl, on = sel && sel.ip === ip && sel.slot === s;
      if (!c.powered) return `<div class="nd dim" style="padding-left:52px">${ic('chip', 'i ti')}${pad(s)}, PLC-CPU ${esc(m.name)} · off</div>`;
      return `<div class="nd${on ? ' on' : ''}" data-wa="${ip}|${s}" style="padding-left:52px">${ic('chip', 'i ti')}${pad(s)}, PLC-CPU ${esc(m.name)} · ${esc(c.name || '(empty)')} · ${modeOf(c)}${cur && pathOf(ip, s) === curPath() ? ' <span class="muted">(project path)</span>' : ''}</div>`;
    }).join('')).join('') || '<div class="nd dim" style="padding-left:20px">No emulated controller is on with an IP address.</div>';
    const pick = () => (sel ? resolve(pathOf(sel.ip, sel.slot)) : null);
    const info = () => {
      const x = pick();
      if (!x || !x.ctl) return 'Pick a controller. An emulated controller answers only when it is on, and a chassis only through a controller with an IP address.';
      const c = x.ctl;
      return `Path: <b class="mono">${esc(pathOf(sel.ip, sel.slot))}</b>. ${c.holds(S.p) ? 'It holds this project.' : c.name ? `It holds <b>${esc(c.name)}</b>${U(c.name) === U(S.p.controller.name) ? ' (another version)' : ''}: Upload or Download.` : 'It is empty: Download this project.'}`;
    };
    // the picked controller becomes the project path, then the action runs against it
    const via = fn => () => { const x = pick(); if (!x || !x.ctl) { toast('Pick a controller first.', 'err'); return false; } setPath(pathOf(sel.ip, sel.slot)); setTimeout(fn, 0); };
    const el = dialog({ title: 'Who Active', size: 'md',
      body: `<div class="tree" id="wa" style="border:1px solid var(--border);border-radius:var(--r)"><div class="nd">${ic('chip', 'i ti')}Workstation, MT PLC Studio</div><div class="nd" style="padding-left:6px">${ic('online', 'i ti')}Emulate, Ethernet</div><div id="wa-rows">${rows()}</div></div>
        <p class="help" id="wa-i">${info()}</p>`,
      buttons: [{ l: 'Close' }, { l: 'Emulator…', run: () => { setTimeout(chassisMonitor, 0); } }, { l: 'Set Project Path', run: () => { const x = pick(); if (!x || !x.ctl) return false; setPath(pathOf(sel.ip, sel.slot)); render(); toast(`Project path: ${pathOf(sel.ip, sel.slot)}`); return false; } },
        { l: 'Upload…', run: via(upload) }, { l: 'Download…', run: via(download) }, { l: 'Go Online', pri: true, run: via(goOnline) }] });
    el.querySelector('#wa').addEventListener('click', ev => {
      const r = ev.target.closest('[data-wa]'); if (!r) return;
      const [ip, s] = r.dataset.wa.split('|');
      sel = { ip, slot: +s };
      el.querySelector('#wa-rows').innerHTML = rows(); el.querySelector('#wa-i').innerHTML = info();
    });
  }
  /* Toggle Bit: an input of a working card follows its field switch, so that switch is flipped; the input of a faulted
     card (no card in the chassis) holds and is written directly, as on an emulated controller */
  function toggleSel() {
    const e = curEl(); if (!e || !e.a[0]) return;
    const r = ctl.refOf(e.a[0], S.prog);
    if (r && typeof r !== 'string' && r.input && r.force && ctl.inputLive(r)) {
      const [slot, , bit] = r.force.split(':');
      const card = chassis.module(+slot);
      setPoint(+slot, +bit, !((card.field >> +bit) & 1));
      toast(`${e.a[0]} is an input: its field switch ${slot}/${bit} on the chassis was switched.`);
    } else if (!ctl.toggle(e.a[0], S.prog)) toast(`${e.a[0]} cannot be toggled.`, 'err');
    live(true);
  }
  function forceSel(v) { const e = curEl(); if (!e) return; if (!ctl.force(e.a[0], v, S.prog)) toast('Only I/O bits can be forced.', 'err'); else if (v !== null && ctl.forceState() === 'disabled') toast('Force installed. Enable forces (Forces box) to apply it.'); live(true); render(); }

  /* ---------- I/O panel: the field devices wired to the I/O cards of the chassis ---------- */
  function aliasNames() {
    const names = {};
    [...S.p.tags, ...allProgs().flatMap(g => g.tags)].forEach(t => { if (t.alias) names[U(t.alias)] = t.name; });
    return names;
  }
  function ioHTML() {
    const names = aliasNames();
    const cards = [...chassis.mods.values()].filter(m => !m.ctl).sort((a, b) => a.slot - b.slot);
    return cards.map(m => {
      const cfg = S.p.rack.modules.find(x => x.slot === m.slot);
      const ms = S.online && ctl.M && ctl.M.mods.get(m.slot) ? ctl.moduleStatus(m.slot) : null;
      const note = m.fault ? '<small style="color:var(--danger);font-weight:700">Faulted</small>' : ms && ms.state !== 'Running' ? `<small style="color:${ms.state === 'Faulted' ? 'var(--danger)' : 'var(--warn-text)'};font-weight:700">${ms.state}</small>` : !cfg ? '<small class="muted">not in the project</small>' : '';
      const head = `<div class="mh">[${m.slot}] ${esc(m.type)}<small>${esc(m.name)}</small><span class="grow"></span>${note}<button class="btn" style="min-height:24px;padding:0 8px" data-pull="${m.slot}" title="Simulate a fault of this card">${m.fault ? 'Clear' : 'Fault'}</button></div>`;
      const dir = m.kind === 'di' || m.kind === 'ai' ? 'I' : 'O';
      if (m.kind === 'di' || m.kind === 'do') {
        const bits = m.kind === 'di' ? m.field : chassis.outputs(m.slot);
        const pts = Array.from({ length: 16 }, (_, b) => {
          const on = (bits >> b) & 1, nm = names[U(`Local:${m.slot}:${dir}.Data.${b}`)] || '';
          const fr = S.online && ctl.M && ctl.M.mods.get(m.slot) && ctl.forced(`Local:${m.slot}:${dir}.Data.${b}`) != null;
          return `<div class="pt" title="${esc(nm || `Point ${b}`)}"><b class="${m.kind === 'do' ? 'lamp ' : ''}${on ? 'on' : ''}${fr ? ' frc' : ''}"${m.kind === 'di' ? ` data-io="${m.slot}:${b}"` : ''}>${b}</b><i>${esc(nm)}</i></div>`;
        }).join('');
        return `<div class="mod">${head}<div class="pts">${pts}</div></div>`;
      }
      const vals = m.kind === 'ai' ? m.field : chassis.outputs(m.slot);
      return `<div class="mod">${head}${vals.map((v, c) => `<div class="ana"><span>Ch${c}</span>${m.kind === 'ai' ? `<input type="range" min="0" max="100" step="0.5" value="${v}" data-ana="${m.slot}:${c}">` : `<span style="height:8px;background:var(--surface-3);border-radius:4px;overflow:hidden;display:block"><span style="display:block;height:100%;width:${Math.max(0, Math.min(100, v))}%;background:var(--accent)"></span></span>`}<span style="text-align:right">${(+v).toFixed(1)}</span></div>`).join('')}</div>`;
    }).join('') || '<div class="empty">No I/O cards in the chassis. Add one in the Emulator.</div>';
  }
  function setPoint(slot, bit, v, r = chassis) {
    r.setBit(slot, bit, v);
    r.advance(0);
    refreshIO();
  }
  const refreshIO = () => { const iob = $('#iob'); if (iob) iob.innerHTML = ioHTML(); chassisLive(true); };

  /* ---------- Emulator dashboard (spec section 15), laid out like a PC emulator's dashboard ----------
     Devices pane: the chassis and their cards. Details: the Controller pane (name, description, IP address, power),
     a chassis (name, description, its rack of cards) or an I/O card. Device Status: every emulated controller with its
     power switch, mode (Run / Remote / Program), RUN and OK lights and fault message. */
  const CARDNAMES = Object.assign({ 'PLC-CPU': 'Emulated controller' }, MODNAMES);
  let chasWin = null, emuSel = { k: 'r', ri: 0 };
  const modeName = c => (c.fault ? 'Faulted' : { prog: 'Program', run: 'Run', remprog: 'Rem Prog', remrun: 'Rem Run' }[c.mode]);
  const led = (on, t, cls) => `<div class="cled"><i class="led ${on ? cls || 'g' : ''}"></i>${t}</div>`;
  function cardHTML(ri, s) {
    const r = racks[ri], m = r.module(s), id = ri + ':' + s, sl = `<span class="cs">${s}</span>`;
    if (!m) return `<div class="ccard empty" data-cins="${id}" title="Add a module in slot ${s}">${sl}<span class="cplus">${ic('plus')}</span><small>Empty</small></div>`;
    const tail = `<div class="cbtns">${m.ctl ? '' : `<button class="btn" data-cfault="${id}">${m.fault ? 'Clear fault' : 'Fault'}</button>`}<button class="btn" data-crem="${id}" title="Remove the card">${ic('trash')}</button></div>`;
    if (m.ctl) {
      const c = m.ctl, run = c.powered && c.running, fs = c.forceState();
      return `<div class="ccard cpu${c.powered ? '' : ' off'}" data-esel="m:${id}">${sl}<b class="ct">PLC-CPU</b><small class="cn">${esc(m.name)}</small><small class="cn mono">${esc(m.ip || 'no IP address')}</small>
        <div class="cleds">${led(run, 'RUN')}${led(c.powered && fs !== 'none', 'FORCE', fs === 'enabled' ? 'a' : 'a blink')}${led(c.powered && c.M, 'I/O', c.ioOk() ? 'g' : 'r blink')}${led(c.powered, 'OK', c.fault ? 'r blink' : 'g')}</div>
        <div class="cproj">${c.name ? esc(c.name) : '<span class="muted">No project</span>'}</div><div class="cmode${!c.powered ? '' : c.fault ? ' f' : run ? ' r' : ''}">${c.powered ? modeName(c) : 'Off'}</div>
        <span class="seg ckey">${['PROG', 'REM', 'RUN'].map(k => `<span data-emode="${id}:${k}" class="${c.key === k ? 'on' : ''}">${k}</span>`).join('')}</span>${tail}</div>`;
    }
    const names = S.p ? aliasNames() : {}, dir = m.kind === 'di' || m.kind === 'ai' ? 'I' : 'O', mine = r === chassis;
    let body = '';
    if (m.kind === 'di' || m.kind === 'do') {
      const bits = m.kind === 'di' ? m.field : r.outputs(s);
      body = `<div class="cpts">${Array.from({ length: 16 }, (_, b) => `<div class="cpt" title="${esc((mine && names[U(`Local:${s}:${dir}.Data.${b}`)]) || 'Point ' + b)}"><b class="${m.kind === 'do' ? 'lamp ' : ''}${(bits >> b) & 1 ? 'on' : ''}"${m.kind === 'di' ? ` data-io="${id}:${b}"` : ''}>${b}</b></div>`).join('')}</div>`;
    } else if (m.kind === 'ai' || m.kind === 'ao') {
      const vals = m.kind === 'ai' ? m.field : r.outputs(s);
      body = vals.map((v, c) => `<div class="cch"><span>Ch${c} ${(+v).toFixed(1)}</span>${m.kind === 'ai' ? `<input type="range" min="0" max="100" step="0.5" value="${v}" data-ana="${id}:${c}">` : `<span class="bar"><span style="width:${Math.max(0, Math.min(100, v))}%"></span></span>`}</div>`).join('');
    }
    const own = r.owner(s);
    return `<div class="ccard${m.fault ? ' flt' : ''}">${sl}<b class="ct">${esc(m.type.replace('PLC-', ''))}</b><small class="cn">${esc(m.name)}</small>
      <div class="cleds">${led(true, 'OK', m.fault ? 'r blink' : own && own.running ? 'g' : 'g blink')}</div>${body}${tail}</div>`;
  }
  const rackHTML = ri => `<div class="chas">${Array.from({ length: racks[ri].size }, (_, s) => cardHTML(ri, s)).join('')}</div>`;
  function devicesHTML() {
    return racks.map((r, ri) => `<div class="nd${emuSel.k === 'r' && emuSel.ri === ri ? ' on' : ''}" data-esel="r:${ri}">${ic('rack', 'i ti')}<b>${esc(r.name)}</b></div>` +
      [...r.mods.values()].sort((a, b) => a.slot - b.slot).map(m => `<div class="nd${emuSel.k === 'm' && emuSel.ri === ri && emuSel.slot === m.slot ? ' on' : ''}${m.ctl && !m.ctl.powered ? ' dim' : ''}" data-esel="m:${ri}:${m.slot}" style="padding-left:22px">${ic(m.ctl ? 'chip' : 'io', 'i ti')}[${m.slot}] ${esc(m.name)}${m.ctl ? (m.ctl.powered ? '' : ' <small class="muted">off</small>') : ` <small class="muted">${esc(m.type.replace('PLC-', ''))}</small>`}</div>`).join('')).join('');
  }
  function detailsHTML() {
    const r = racks[emuSel.ri];
    if (!r) return '<p class="help">Select a device.</p>';
    if (emuSel.k === 'r') {
      return `<div class="ph" style="background:none">Chassis</div><div class="emuform">
        <div class="frow"><label>Name</label><input class="inp" id="er-n" value="${esc(r.name)}"></div>
        <div class="frow"><label>Description</label><input class="inp" id="er-d" value="${esc(r.desc || '')}"></div>
        <div class="frow"><label>Slots</label><span>${r.size}</span></div>
        <div class="brow"><button class="btn pri" data-erapply="${emuSel.ri}">Apply</button><button class="btn danger" data-erdel="${emuSel.ri}"${racks.length > 1 ? '' : ' disabled'}>Delete chassis</button></div></div>
        <div class="emurack">${rackHTML(emuSel.ri)}</div>`;
    }
    const m = r.module(emuSel.slot);
    if (!m) return '<p class="help">That slot is empty now.</p>';
    if (!m.ctl) return `<div class="ph" style="background:none">I/O card</div><div class="emuform">${kv('Type', esc(m.type) + ' <span class="muted">· ' + esc(CARDNAMES[m.type] || '') + '</span>')}${kv('Name', esc(m.name))}${kv('Chassis', esc(r.name))}${kv('Slot', m.slot)}${kv('State', m.fault ? '<b style="color:var(--danger)">Faulted</b>' : 'OK')}
        <p class="help">An addition of this app: the field devices of a card reach the controller whose project configures the same module in this slot.</p></div><div class="emurack">${rackHTML(emuSel.ri)}</div>`;
    const c = m.ctl, id = emuSel.ri + ':' + m.slot;
    return `<div class="ph" style="background:none">Controller</div><div class="emuform">
      ${kv('Vendor', 'MT PLC Studio')}${kv('Type', 'PLC-CPU (emulated)')}${kv('Revision', '1.0')}
      <div class="frow"><label>Name</label><input class="inp" id="ec-n" value="${esc(m.name)}"></div>
      <div class="frow"><label>Description</label><input class="inp" id="ec-d" value="${esc(m.desc || '')}"></div>
      <div class="frow"><label>IP Address</label><select class="inp" id="ec-ip"><option value=""${m.ip ? '' : ' selected'}>(none)</option>${EMUIPS.map(a => `<option${a === m.ip ? ' selected' : ''}>${a}</option>`).join('')}</select></div>
      ${kv('Chassis', esc(r.name))}${kv('Slot', m.slot)}
      <div class="frow"><label>Controller</label><span class="seg"><span data-epow="${id}:1" class="${c.powered ? 'on' : ''}">On</span><span data-epow="${id}:0" class="${c.powered ? '' : 'on'}">Off</span></span></div>
      ${kv('Holds', c.name ? esc(c.name) : '(no project)')}
      <p class="help">One controller in each chassis needs an IP address: Who Active reaches the chassis through it, and the other controllers across the backplane. Off keeps the project; On starts it again.</p>
      <div class="brow"><button class="btn pri" data-eapply="${id}">Apply</button><button class="btn danger" data-crem="${id}">Delete</button></div></div>`;
  }
  function statusHTML() {
    const rows = racks.flatMap((r, ri) => r.controllers().map(m => {
      const c = m.ctl, id = ri + ':' + m.slot;
      return `<div class="emurow"><span class="seg sw"><span data-epow="${id}:${c.powered ? 0 : 1}" class="${c.powered ? 'on' : ''}" title="Turn the controller ${c.powered ? 'off' : 'on'}">${c.powered ? 'On' : 'Off'}</span></span>
        <span class="grow"><b>${esc(m.name)}</b> <small class="muted">${esc(r.name)} · slot ${m.slot}${m.ip ? ' · ' + esc(m.ip) : ''}</small></span>
        <span class="seg">${[['RUN', 'Run'], ['REM', 'Remote'], ['PROG', 'Program']].map(([k, t]) => `<span data-emode="${id}:${k}" class="${c.key === k ? 'on' : ''}">${t}</span>`).join('')}</span>
        <span class="emuleds">${led(c.powered && c.running, 'Run')}${led(c.powered, 'OK', c.fault ? 'r' : 'g')}</span>
        ${c.fault && c.powered ? `<span class="emuflt">Type ${c.fault.type} Code ${c.fault.code}: ${esc(c.fault.text)}</span>` : ''}</div>`;
    }));
    return rows.join('') || '<p class="help" style="padding:8px">No emulated controllers. Add one.</p>';
  }
  const emuHTML = () => `<div class="emudev"><div class="ph">Devices<span class="grow"></span><button class="btn" data-emu="add">${ic('plus')}Add</button></div><div class="tree" id="emudev" tabindex="-1" autofocus>${devicesHTML()}</div></div>
    <div class="emumain" id="emumain">${detailsHTML()}</div>
    <div class="emustat"><div class="ph">Device Status</div><div id="emustat">${statusHTML()}</div></div>`;
  const chassisSig = () => racks.map(r => r.name + ':' + [...r.mods.values()].map(m => (m.ctl ? [m.slot, m.name, m.ip, m.ctl.powered, m.ctl.key, m.ctl.mode, !!m.ctl.fault, m.ctl.name, m.ctl.forceState(), m.ctl.ioOk(), m.ctl.running].join(',') : [m.slot, m.name, m.fault, JSON.stringify(m.field), JSON.stringify(r.outputs(m.slot))].join(','))).join('|')).join('#') + curPath();
  /* the emulator in the app and in its own window follows the controllers; a form being typed in is left alone */
  function chassisLive(force) {
    const docs = [document];
    if (chasWin && !chasWin.closed) docs.push(chasWin.document); else chasWin = null;
    const sg = chassisSig();
    docs.forEach(d => {
      const b = d.getElementById('emubody');
      if (!b || (!force && b.dataset.sig === sg)) return;
      b.dataset.sig = sg;
      const a = d.activeElement, busy = a && b.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName);
      if (!busy) { b.innerHTML = emuHTML(); return; }
      // typing in the details: refresh the devices, the status and the rack around it
      d.getElementById('emudev').innerHTML = devicesHTML();
      d.getElementById('emustat').innerHTML = statusHTML();
      const rk = d.querySelector('#emumain .emurack');
      if (rk && a.type !== 'range') rk.innerHTML = rackHTML(emuSel.ri);
    });
  }
  const ids = v => v.split(':').map(Number);
  /* the clicks of the emulator (in the app or in its own window) */
  function chassisClick(t) {
    let el;
    const doc = t.ownerDocument;
    if ((el = t.closest('[data-esel]'))) {
      const p = el.dataset.esel.split(':');
      emuSel = p[0] === 'r' ? { k: 'r', ri: +p[1] } : { k: 'm', ri: +p[1], slot: +p[2] };
      if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur();
      chassisLive(true); return true;
    }
    if ((el = t.closest('[data-emu]'))) {
      openMenu([{ l: 'Add Controller…', run: () => insertCard(emuSel.ri, null, 'PLC-CPU') }, { l: 'Add I/O Card…', run: () => insertCard(emuSel.ri, null, 'PLC-DI16-24V') }, '-', { l: 'Add Chassis…', run: newRack }], el.getBoundingClientRect && doc === document ? el : { x: 40, y: 80 });
      if (doc !== document) window.focus();
      return true;
    }
    if ((el = t.closest('[data-cins]'))) { const [ri, s] = ids(el.dataset.cins); insertCard(ri, s); if (doc !== document) window.focus(); return true; }
    if ((el = t.closest('[data-crem]'))) {
      const [ri, s] = ids(el.dataset.crem), r = racks[ri], m = r.module(s);
      confirmDlg('Delete', `Delete <b>[${s}] ${esc(m.type)} ${esc(m.name)}</b> from chassis ${esc(r.name)}?${m.ctl && m.ctl.name ? ` The project <b>${esc(m.ctl.name)}</b> in it is lost.` : ''}`, 'Delete', () => { r.remove(s); r.advance(0); emuSel = { k: 'r', ri }; saveChassis(); refreshIO(); live(true); }, true);
      if (doc !== document) window.focus();
      return true;
    }
    if ((el = t.closest('[data-cfault]'))) { const [ri, s] = ids(el.dataset.cfault), r = racks[ri]; r.setFault(s, !r.module(s).fault); r.advance(0); refreshIO(); live(true); return true; }
    if ((el = t.closest('[data-emode]'))) { const p = el.dataset.emode.split(':'); racks[+p[0]].controller(+p[1]).setKey(p[2]); saveChassis(); chassisLive(true); live(true); render(); return true; }
    if ((el = t.closest('[data-epow]'))) { const [ri, s, on] = ids(el.dataset.epow); racks[ri].setController(s, { on: !!on }); saveChassis(); chassisLive(true); live(true); return true; }
    if ((el = t.closest('[data-eapply]'))) {
      const [ri, s] = ids(el.dataset.eapply), n = doc.getElementById('ec-n').value.trim();
      if (!E.validName(n)) { toast('Name: letters, digits and _ (up to 40).', 'err'); return true; }
      racks[ri].setController(s, { name: n, desc: doc.getElementById('ec-d').value.trim(), ip: doc.getElementById('ec-ip').value });
      saveChassis(); doc.activeElement && doc.activeElement.blur(); chassisLive(true); toast('Controller settings applied.', 'ok'); return true;
    }
    if ((el = t.closest('[data-erapply]'))) {
      const r = racks[+el.dataset.erapply], n = doc.getElementById('er-n').value.trim();
      if (!E.validName(n)) { toast('Name: letters, digits and _ (up to 40).', 'err'); return true; }
      if (racks.some(x => x !== r && U(x.name) === U(n))) { toast('Another chassis has that name.', 'err'); return true; }
      r.name = n; r.desc = doc.getElementById('er-d').value.trim(); saveChassis(); doc.activeElement && doc.activeElement.blur(); chassisLive(true); toast('Chassis settings applied.', 'ok'); return true;
    }
    if ((el = t.closest('[data-erdel]'))) {
      const ri = +el.dataset.erdel, r = racks[ri];
      confirmDlg('Delete chassis', `Delete chassis <b>${esc(r.name)}</b>?${r.controllers().length ? ' Its controllers are deleted with it.' : ''}`, 'Delete', () => { removeRack(r); emuSel = { k: 'r', ri: 0 }; chassisLive(true); refreshIO(); }, true);
      if (doc !== document) window.focus();
      return true;
    }
    return false;
  }
  function newRack() {
    let n = 1; while (racks.some(r => U(r.name) === U('Chassis' + n))) n++;
    dialog({ title: 'Add Chassis', size: 'md', focus: true,
      body: `<div class="frow"><label>Name</label><input class="inp" id="nr-n" value="Chassis${n}"></div><div class="frow"><label>Description</label><input class="inp" id="nr-d" value=""></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'Add', pri: true, run: e2 => {
        const v = e2.querySelector('#nr-n').value.trim();
        if (!E.validName(v)) { toast('Name: letters, digits and _ (up to 40).', 'err'); return false; }
        if (racks.some(r => U(r.name) === U(v))) { toast('Another chassis has that name.', 'err'); return false; }
        addRack(v, e2.querySelector('#nr-d').value.trim());
        emuSel = { k: 'r', ri: racks.length - 1 };
        setTimeout(() => { if (!chasWin) chassisMonitor(); else chassisLive(true); }, 0);
      } }] });
  }
  /* Add Controller / Add I/O Card: the chassis, the slot, the module, its name; a controller also gets an IP address
     and its power state */
  function insertCard(ri, slot, type0) {
    const types = E.Chassis.types();
    const free = r => Array.from({ length: r.size }, (_, s) => s).filter(s => !r.module(s));
    const el = dialog({ title: type0 === 'PLC-CPU' ? 'Add Controller' : 'Add Module', size: 'md', focus: true,
      body: `<div class="frow"><label>Chassis</label><select class="inp" id="ci-r">${racks.map((r, i) => `<option value="${i}"${i === ri ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
        <div class="frow"><label>Slot</label><select class="inp" id="ci-s"></select></div>
        <div class="frow"><label>Module</label><select class="inp" id="ci-t">${types.map(t => `<option value="${t}">${t} · ${esc(CARDNAMES[t] || '')}</option>`).join('')}</select></div>
        <div class="frow"><label>Name</label><input class="inp" id="ci-n" value="" autocomplete="off" spellcheck="false"></div>
        <div id="ci-cpu"><div class="frow"><label>Description</label><input class="inp" id="ci-d" value=""></div>
          <div class="frow"><label>IP Address</label><select class="inp" id="ci-ip"><option value="">(none)</option>${EMUIPS.map(a => `<option>${a}</option>`).join('')}</select></div>
          <label class="frow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="ci-on" checked><span>Turn the controller on</span></label></div>
        <p class="help" id="ci-h"></p>`,
      buttons: [{ l: 'Cancel' }, { l: 'Add', pri: true, run: e2 => {
        const r = racks[+e2.querySelector('#ci-r').value], s = +e2.querySelector('#ci-s').value, t = e2.querySelector('#ci-t').value;
        if (e2.querySelector('#ci-s').value === '') { toast('That chassis has no free slot.', 'err'); return false; }
        const n = e2.querySelector('#ci-n').value.trim() || (t === 'PLC-CPU' ? 'Emulator' + (racks.indexOf(r) ? racks.indexOf(r) + '_' : '') + s : E.MODULES[t].kind.toUpperCase() + '_' + s);
        if (!E.validName(n)) { toast('Name: letters, digits and _.', 'err'); return false; }
        const res = r.insert(s, t, n);
        if (!res.ok) { toast(res.msg, 'err'); return false; }
        if (t === 'PLC-CPU') r.setController(s, { desc: e2.querySelector('#ci-d').value.trim(), ip: e2.querySelector('#ci-ip').value, on: e2.querySelector('#ci-on').checked });
        r.advance(0); saveChassis();
        emuSel = { k: 'm', ri: racks.indexOf(r), slot: s };
        setTimeout(() => { if (!chasWin) chassisMonitor(); else chassisLive(true); refreshIO(); live(true); }, 0);
      } }] });
    const q = sel => el.querySelector(sel);
    const sync = () => {
      const r = racks[+q('#ci-r').value], f = free(r), cur = +q('#ci-s').value;
      q('#ci-s').innerHTML = f.map(s => `<option${s === (slot != null && f.includes(slot) ? slot : cur) ? ' selected' : ''}>${s}</option>`).join('');
      const cpu = q('#ci-t').value === 'PLC-CPU';
      q('#ci-cpu').hidden = !cpu;
      if (cpu && !q('#ci-ip').dataset.touched) { const used = new Set(racks.flatMap(x => x.controllers().map(m => m.ip))); q('#ci-ip').value = gatewayIp(r) ? '' : EMUIPS.find(a => !used.has(a)) || ''; }
      q('#ci-h').textContent = cpu ? 'An emulated controller holds a project (Download through Who Active). Give one controller in each chassis an IP address.' : 'An I/O card brings field switches (inputs) or lamps (outputs); the project must configure the same module in the same slot.';
    };
    q('#ci-t').value = type0 || 'PLC-DI16-24V';
    const cfg = slot != null && S.p && S.p.rack.modules.find(x => x.slot === slot);
    if (cfg && !type0) q('#ci-t').value = cfg.type;
    q('#ci-r').onchange = () => { slot = null; sync(); };
    q('#ci-t').onchange = sync;
    q('#ci-ip').onchange = () => { q('#ci-ip').dataset.touched = '1'; };
    sync();
  }
  function chassisMonitor() {
    dialog({ title: 'Emulator', size: 'lg', flush: true,
      body: `<div id="emubody" class="emu">${emuHTML()}</div>`,
      buttons: (S.layout === 'phone' ? [] : [{ l: 'Open in a window', run: () => { setTimeout(popChassis, 0); } }]).concat([{ l: 'Who Active…', run: () => { setTimeout(whoActive, 0); } }, { l: 'Close', pri: true }]) });
  }
  /* the emulator in a window of its own, beside the programming software. The window starts blank (so it shares this
     window's origin, also for the exe's file:// copy) and this window writes, draws and serves it. */
  function popChassis() {
    if (chasWin && !chasWin.closed) { chasWin.focus(); return; }
    const w = window.open('', 'mtps-chassis', 'width=1180,height=720');
    if (!w) { toast('The window was blocked: the emulator stays in the app.', 'err'); chassisMonitor(); return; }
    const css = new URL('css/app.css', location.href).href, icon = new URL('icons/icon.svg', location.href).href;
    w.document.open();
    w.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>MT PLC Studio - Emulator</title><link rel="icon" href="${icon}"><link rel="stylesheet" href="${css}"></head>
      <body class="desk chaswin"><header class="chashead"><b>Emulator</b><span class="muted">emulated chassis and controllers</span><span class="grow"></span><button class="btn" data-wa-open="1">Who Active…</button></header><div id="emubody" class="emu"></div></body></html>`);
    w.document.close();
    closeLayer();
    mountChassis(w);
  }
  /* this window draws the emulator window and takes its clicks (dialogs open here, in the app) */
  function mountChassis(w) {
    chasWin = w;
    const d = w.document;
    if (document.documentElement.dataset.theme) d.documentElement.dataset.theme = document.documentElement.dataset.theme;
    chassisLive(true);
    d.addEventListener('click', ev => { if (!chassisClick(ev.target) && ev.target.closest('[data-wa-open]')) { window.focus(); whoActive(); } });
    d.addEventListener('pointerdown', ev => { const b = ev.target.closest('[data-io]'); if (!b) return; ioPress(b.dataset.io); ev.preventDefault(); });
    d.addEventListener('input', ev => { const a = ev.target.closest('[data-ana]'); if (a) anaSet(a.dataset.ana, +a.value); });
    w.addEventListener('beforeunload', () => { chasWin = null; });
  }
  /* a field switch (data-io "slot:bit" on the I/O panel, "rack:slot:bit" in the emulator) and an analog slider */
  function ioPress(v) {
    const p = ids(v), r = p.length === 3 ? racks[p[0]] : chassis, s = p[p.length - 2], bit = p[p.length - 1], m = r && r.module(s);
    if (!m) return;
    setPoint(s, bit, !((m.field >> bit) & 1), r);
  }
  function anaSet(v, val) { const p = ids(v), r = p.length === 3 ? racks[p[0]] : chassis; r.setChannel(p[p.length - 2], p[p.length - 1], val); r.advance(0); }

  /* ---------- the controller runs on its own clock; the screen follows only what changed ---------- */
  let lastT = performance.now(), sig = '', lastLive = 0, lastLay = 0;
  function liveSig() {
    if (!S.online) return 'off|' + chassisSig();
    const R = liveRoutine(), parts = [ctl.mode, ctl.key, ctl.fault ? 1 : 0, ctl.forceState()];
    if (R) { const w = e => { if (!e) return; if (e.t === 'BR') e.legs.forEach(l => l.forEach(w)); else { parts.push(e.v ? 1 : 0); if (e.x && e.x[0] && e.x[0].obj && /^(timer|counter)$/.test(INSTR[e.t].args[0] || '')) { try { const s = e.x[0].obj(); parts.push(s.ACC, s.DN); } catch (err) { /* ignore */ } } } }; R.rungs.forEach(r => r.elems.forEach(w)); }
    ctl.M && ctl.M.mods.forEach((m, s) => { const im = ctl.ioImage(s); parts.push(JSON.stringify(im)); });
    return parts.join(',') + '|' + chassisSig();
  }
  let lastFault = null;
  function live(force) {
    const s = liveSig();
    if (!force && s === sig) return;
    sig = s;
    // a new major fault (a module that failed, a watchdog) shows in the organizer and the online bar
    const fk = S.online && ctl.fault ? ctl.fault.at : null;
    if (fk !== lastFault) { lastFault = fk; if (!force) { render(); if (fk) toast(`Major fault: ${ctl.fault.text}`, 'err'); return; } }
    if (S.online && !S.touching) { const now = performance.now(); if (force || now - lastLive > 33) { lastLive = now; renderLadder(); } else { sig = ''; } }
    const ob = $('#olbar');
    if (ob) ob.innerHTML = S.layout === 'desktop' ? onlineBarHTML() : S.layout === 'tablet' ? `${modeBox()}${forcesBox()}${innerWidth >= 1024 && innerWidth > innerHeight ? editsBox() : ''}` : `${modeBox()}${forcesBox()}${editsBox()}${S.verify && S.verify.errors.length ? `<span class="warn" data-go="more">${ic('warn')}${S.verify.errors.length}</span>` : ''}`;
    const iob = $('#iob'); if (iob && !iob.contains(document.activeElement)) iob.innerHTML = ioHTML(); chassisLive(false);
    if (S.tagMode === 'mon') refreshTags();
    const cp = $('#ctlpage'); if (cp && force) cp.innerHTML = controllerPage();
  }
  /* the controller scans on a timer of its own, so it keeps running when the screen does not redraw
     (a hidden or minimised window); the frame loop only draws */
  function tick() {
    const now = performance.now(), dt = Math.min(1000, now - lastT);
    lastT = now;
    racks.forEach(r => r.advance(dt));
  }
  function loop(now) {
    tick();
    // a turned tablet or a resized window may skip the resize event: check the layout a few times a second
    if (now - lastLay > 250) { lastLay = now; if (pickLayout() !== S.layout && !S.touching) render(); }
    live(false);
    requestAnimationFrame(loop);
  }

  /* ---------- instruction picker (Insert, the phone's +) with quick entry: "XIC Start_PB" ---------- */
  function picker(initial) {
    let tab = S.prefs.tab === 'Favorites' ? 'Bit' : S.prefs.tab;
    const tiles = () => {
      const q = U(el.querySelector('#pq').value.trim()).split(/[\s,(]+/)[0];
      const list = q ? Object.keys(INSTR).filter(k => k.startsWith(q) || U(INSTR[k].name).includes(q)) : TABS[tab].filter(m => INSTR[m]);
      return list.map(m => `<div class="tile" data-pk="${m}">${L.icon(m)}<b>${m}</b><small>${esc(NAME(m))}</small></div>`).join('') || '<div class="empty">No instruction matches</div>';
    };
    const el = dialog({ title: 'Add Ladder Element', size: 'md', focus: true,
      body: `<input class="inp mono" id="pq" placeholder="Type: XIC Start_PB, or search" value="${esc(initial || '')}" autocomplete="off" spellcheck="false">
        <div class="fchips" id="pt">${Object.keys(TABS).filter(t => t !== 'Favorites').map(t => `<span class="fchip${t === tab ? ' on' : ''}" data-pt="${esc(t)}">${t}</span>`).join('')}</div>
        <div class="tiles" id="pg"></div><p class="help">${S.sel ? 'Goes after the selected instruction.' : curSelRung() != null ? `Goes at the end of rung ${curSelRung()}.` : 'Goes in a new rung.'} Enter adds the typed instruction with its operands.</p>`,
      buttons: [{ l: 'Cancel' }, { l: 'Add', pri: true, run: el2 => quick(el2.querySelector('#pq').value) }] });
    el.querySelector('#pg').innerHTML = tiles();
    el.addEventListener('input', () => { el.querySelector('#pg').innerHTML = tiles(); });
    el.addEventListener('click', ev => {
      const c = ev.target.closest('[data-pt]');
      if (c) { tab = c.dataset.pt; el.querySelectorAll('[data-pt]').forEach(x => x.classList.toggle('on', x === c)); el.querySelector('#pq').value = ''; el.querySelector('#pg').innerHTML = tiles(); return; }
      const t = ev.target.closest('[data-pk]');
      if (t) { closeLayer(); insertMn(t.dataset.pk); }
    });
    const inp = el.querySelector('#pq');
    setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 30);
  }
  function quick(text) {
    const parts = String(text || '').trim().replace(/\)\s*;?\s*$/, '').split(/[\s,(]+/).filter(Boolean);
    if (!parts.length) return false;
    const mn = U(parts[0]);
    if (!INSTR[mn]) { toast(`"${parts[0]}" is not an instruction.`, 'err'); return false; }
    const el = newEl(mn, parts.slice(1));
    setTimeout(() => insert(el, null, parts.length === 1), 0);
  }

  /* ---------- drag an instruction from the toolbar onto a rung ---------- */
  function bindDrag() {
    let dg = null;
    document.addEventListener('pointerdown', ev => {
      const b = ev.target.closest('.gbtn');
      if (!b || b.disabled || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      dg = { mn: b.dataset.mn, x: ev.clientX, y: ev.clientY, on: false, id: ev.pointerId, b };
    });
    document.addEventListener('pointermove', ev => {
      if (!dg || ev.pointerId !== dg.id) return;
      if (!dg.on && Math.hypot(ev.clientX - dg.x, ev.clientY - dg.y) > 10) {
        dg.on = true;
        dg.g = document.createElement('div');
        dg.g.className = 'ghost'; dg.g.style.position = 'fixed'; dg.g.style.zIndex = 300;
        dg.g.innerHTML = `${L.icon(dg.mn)}<span>${dg.mn}</span>`;
        document.body.appendChild(dg.g);
        try { dg.b.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      }
      if (!dg.on) return;
      dg.g.style.left = ev.clientX + 'px'; dg.g.style.top = ev.clientY + 'px';
      dg.drop = dropAt(ev.clientX, ev.clientY);
      const k = JSON.stringify(dg.drop);
      if (k !== dg.k) { dg.k = k; renderLadder(dg.drop); }
    });
    const end = ev => {
      if (!dg || ev.pointerId !== dg.id) return;
      const d = dg;
      dg = null;
      if (d.g) d.g.remove();
      if (!d.on) { if (ev.type === 'pointerup') insertMn(d.mn); return; }
      renderLadder();
      if (ev.type === 'pointerup' && d.drop) {
        if (d.mn === 'RUNG') { S.sel = null; S.selRung = d.drop.ri; addRung(); return; }
        insertMn(d.mn, d.drop.path ? d.drop : { ri: d.drop.ri, path: null });
      }
    };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  }
  function dropAt(x, y) {
    const el = document.elementFromPoint(x, y), t = hit(el);
    if (!t || t.end || t.ri == null) return null;
    if (t.leg) return { ri: t.ri, path: t.path, leg: true };
    if (t.path && !t.br) { const r = el.getBoundingClientRect(); return { ri: t.ri, path: t.path, after: x > r.left + r.width / 2 }; }
    return { ri: t.ri, end: true };
  }

  /* ---------- events ---------- */
  function bind() {
    const app = $('#app');
    app.addEventListener('click', ev => {
      const t = ev.target;
      let el;
      if ((el = t.closest('[data-cmd]')) && !el.disabled) { run(el.dataset.cmd); return; }
      if ((el = t.closest('[data-menu]'))) { const m = MENUS.find(x => x[0] === el.dataset.menu); openMenu(menuItems(m[1]), el); return; }
      if ((el = t.closest('[data-allmenu]'))) { openMenu(MENUS.flatMap(([n, ids]) => [{ hd: n }, ...menuItems(ids).filter(x => x !== '-')]), el); return; }
      if ((el = t.closest('[data-tab]'))) { S.prefs.tab = el.dataset.tab; savePrefs(); render(); return; }
      if ((el = t.closest('[data-key]'))) { ctl.setKey(el.dataset.key); live(true); render(); return; }
      if ((el = t.closest('[data-box]'))) {
        if (el.dataset.box === 'mode') openMenu(menuItems(['online', 'offline', '-', 'prog', 'runm', 'clear', '-', 'upload', 'download', 'who']), el, 'Mode · key switch in ' + ctl.key);
        else openMenu(menuItems(['fen', 'fdis', 'fall']), el, 'I/O forces');
        return;
      }
      if ((el = t.closest('[data-tw]'))) { const k = el.dataset.tw, c = new Set(S.prefs.collapsed); if (c.has(k)) c.delete(k); else c.add(k); S.prefs.collapsed = [...c]; savePrefs(); render(); return; }
      if ((el = t.closest('[data-org]'))) {
        const k = el.dataset.org;
        if (k.startsWith('rt:')) openRoutine(k);
        else if (k === 'ctags') tagEditor('mon', '');
        else if (k.startsWith('ptags:')) tagEditor('mon', k.slice(6));
        else if (k.startsWith('mod:') && k !== 'mod:0') moduleProps(+k.slice(4));
        else if (k === 'ctl') controllerProps();
        else if (k === 'bp') newModule();
        return;
      }
      if ((el = t.closest('[data-go]'))) { S.area = el.dataset.go; render(); return; }
      if ((el = t.closest('[data-drawer]'))) { if (el.dataset.drawer === '0' && innerWidth >= 1024) { S.prefs.org = false; savePrefs(); } else S.drawer = el.dataset.drawer === '1'; if (el.dataset.drawer === '1') S.prefs.org = true; render(); return; }
      if ((el = t.closest('[data-errh]'))) { S.errOpen = true; errSheet(); return; }
      if ((el = t.closest('[data-ef]'))) { const f = S.errFilter || { e: true, w: true, m: true }; f[el.dataset.ef] = !f[el.dataset.ef]; S.errFilter = f; render(); return; }
      if ((el = t.closest('[data-errline]'))) { gotoErr(el); return; }
      if ((el = t.closest('[data-pull]'))) { const sl = +el.dataset.pull, on = !chassis.module(sl).fault; chassis.setFault(sl, on); chassis.advance(0); toast(on ? `The card in slot ${sl} faulted: see Module Properties for the code.` : `The card in slot ${sl} works again.`); live(true); render(); return; }
      if (chassisClick(t)) return;
      if ((el = t.closest('[data-push]'))) { S.prefs.push = el.dataset.push === '1'; savePrefs(); render(); return; }
      if ((el = t.closest('[data-ctx]'))) { const r = el.getBoundingClientRect(); ctxMenu(S.sel ? { ri: S.sel.ri, path: S.sel.path, br: S.sel.br } : curSelRung() != null ? { ri: curSelRung() } : null, r.left, r.top); return; }
      if ((el = t.closest('[data-more]'))) { openMenu(menuItems(['rung', 'branch', 'level', '-', 'rtext', 'comment', '-', 'verifyr', 'verifyc', 'xref', 'goto', '-', 'newtag', 'tagsmon', '-', 'options']), el); return; }
      if ((el = t.closest('[data-routines]'))) { openMenu(curProg().routines.map(r => ({ l: r.name, ck: r.name === S.routine, run: () => openRoutine(`rt:${curProg().name}/${r.name}`) })).concat(['-', { l: 'New Routine…', run: () => newRoutine(curProg().name), dis: !editable() }]), el); return; }
      if ((el = t.closest('[data-tmode]'))) { S.tagMode = el.dataset.tmode; const p = $('#tagpage'); if (p) p.innerHTML = tagEditorBody(S.layout === 'phone'); return; }
      if ((el = t.closest('[data-texp]'))) { const k = (S.tagScope || '') + '|' + el.dataset.texp; if (S.tagOpen.has(k)) S.tagOpen.delete(k); else S.tagOpen.add(k); refreshTags(); return; }
      if ((el = t.closest('#tagrows .row[data-tag]'))) { tagClick(el); return; }
    });
    // the tag editor (also inside a dialog in #layer)
    document.addEventListener('change', ev => { if (ev.target.id === 'tscope') { S.tagScope = ev.target.value; refreshTags(); } });
    document.addEventListener('input', ev => {
      if (ev.target.id === 'tq') { S.tagQ = ev.target.value; refreshTags(); }
      const a = ev.target.closest && ev.target.closest('[data-ana]');
      if (a) anaSet(a.dataset.ana, +a.value);
    });
    $('#layer').addEventListener('click', ev => {
      let el;
      if ((el = ev.target.closest('[data-tmode]'))) { S.tagMode = el.dataset.tmode; const p = $('#tagpage'); if (p) p.innerHTML = tagEditorBody(false); return; }
      if ((el = ev.target.closest('[data-texp]'))) { const k = (S.tagScope || '') + '|' + el.dataset.texp; if (S.tagOpen.has(k)) S.tagOpen.delete(k); else S.tagOpen.add(k); refreshTags(); return; }
      if ((el = ev.target.closest('#tagrows .row[data-tag]'))) { tagClick(el); return; }
      if ((el = ev.target.closest('[data-cmd]'))) { run(el.dataset.cmd); return; }
      if ((el = ev.target.closest('[data-errline]'))) { closeLayer(); gotoErr(el); return; }
      chassisClick(ev.target);
    }, true);
    // I/O points: Toggle latches, Push holds while pressed
    document.addEventListener('pointerdown', ev => {
      const b = ev.target.closest('[data-io]'); if (!b) return;
      const p = ids(b.dataset.io), r = p.length === 3 ? racks[p[0]] : chassis, s = p[p.length - 2], bit = p[p.length - 1];
      if (S.prefs.push) { setPoint(s, bit, 1, r); const upf = () => { setPoint(s, bit, 0, r); removeEventListener('pointerup', upf); removeEventListener('pointercancel', upf); }; addEventListener('pointerup', upf); addEventListener('pointercancel', upf); }
      else ioPress(b.dataset.io);
      ev.preventDefault();
    });
    document.addEventListener('keydown', onKey);
    addEventListener('resize', () => { const lay = pickLayout(); if (lay !== S.layout) render(); else if (S.layout === 'tablet') render(); });
    addEventListener('beforeunload', () => saveProject());
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveProject(); });
    bindLadder();
    bindDrag();
  }
  function errSheet() {
    const l = $('#layer');
    l.innerHTML = `<div class="scrim" data-close="1"></div><div class="sheet" style="height:46%"><div class="grab"></div><div class="ph" style="background:none;border:0">Errors<span class="grow"></span><button class="btn" data-cmd="verifyc">${ic('check')}Verify</button><button class="ib" data-close="1">${ic('close')}</button></div><div class="sb" style="display:flex;flex-direction:column">${errorsHTML()}</div></div>`;
    l.onclick = ev => { if (ev.target.closest('[data-close]')) closeLayer(); };
    layerKey = ev => { if (ev.key === 'Escape') closeLayer(); };
  }
  function gotoErr(el) {
    const ri = +el.dataset.errline, rt = el.dataset.errrt;
    if (rt) { const [g, r] = rt.split('/'); S.prog = g; S.routine = r; }
    S.sel = null; S.selRung = ri;
    if (S.layout === 'phone') S.area = 'ladder';
    reverify(); render(); scrollToSel();
  }
  function moveSel(dx, dy) {
    const R = rungs();
    if (!R.length) return;
    let ri = curSelRung();
    if (ri == null) { S.selRung = 0; S.sel = null; render(); return; }
    if (dy) { ri = Math.max(0, Math.min(R.length - 1, ri + dy)); S.sel = null; S.selRung = ri; render(); scrollToSel(); return; }
    const fl = flat(parsed(ri) || []);
    const i = S.sel ? fl.findIndex(p => p.join() === S.sel.path.join()) : -1;
    const j = i + dx;
    if (j >= 0 && j < fl.length) S.sel = { ri, path: fl[j] };
    else if (j < 0) { S.sel = null; S.selRung = ri; }
    render();
  }
  function onKey(ev) {
    if ($('#layer').children.length) { if (layerKey) layerKey(ev); return; }
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
    if (inField) return;
    const k = ev.key, ctrl = ev.ctrlKey || ev.metaKey;
    const map = { n: 'new', o: 'open', s: 'save', z: 'undo', y: 'redo', c: 'copy', x: 'cut', v: 'paste', r: 'rung', d: 'desc', w: 'newtag', e: 'xref', g: 'goto', t: 'toggle', f: 'find' };
    if (ctrl && map[k.toLowerCase()]) { ev.preventDefault(); run(map[k.toLowerCase()]); return; }
    if (k === 'Delete') { run('del'); return; }
    if (k === 'Insert') { ev.preventDefault(); run('ins'); return; }
    if (k === 'Enter') { if (S.sel && !S.sel.br) run('edit'); else if (curSelRung() != null && editable()) rungText(curSelRung()); return; }
    if (k === 'F1') { ev.preventDefault(); run('help'); return; }
    if (k === 'F3') { ev.preventDefault(); run('findnext'); return; }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { ev.preventDefault(); moveSel(k === 'ArrowLeft' ? -1 : 1, 0); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown') { ev.preventDefault(); moveSel(0, k === 'ArrowUp' ? -1 : 1); return; }
    if (k === 'Escape') { S.sel = null; render(); return; }
    // quick key entry: typing a mnemonic with a rung or an instruction selected
    if (!ctrl && !ev.altKey && /^[a-zA-Z]$/.test(k) && editable() && (S.sel || curSelRung() != null)) { ev.preventDefault(); picker(k.toUpperCase()); }
  }

  /* ---------- updates ---------- */
  let upInfo = null;
  function upbar() { return `<div class="upbar">${ic('download')}<span class="grow"><b>MT PLC Studio v${esc(upInfo.version)}</b>${upInfo.channel === 'beta' ? ' (beta)' : ''} is ready. You have v${esc(VERSION)}.</span><button class="btn pri" data-up="go">Restart to update</button><button class="btn" data-up="later">Later</button></div>`; }
  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-up]'); if (!b) return;
    if (b.dataset.up === 'go') { saveProject(); window.MTPSUpdater.apply(upInfo); } else { window.MTPSUpdater.skip(upInfo); upInfo = null; render(); }
  });

  /* ---------- start ---------- */
  function start() {
    applyTheme();
    const last = store.get('last');
    let p = last ? store.get('p.' + last) : null;
    if (!validProject(p)) p = blank('New_Project');
    S.layout = pickLayout();
    bind();
    openProject(p, true);
    setInterval(tick, 20);
    requestAnimationFrame(loop);
    if (window.MTPSUpdater) window.MTPSUpdater.init({ version: VERSION, build: BUILD, onAvailable: info => { upInfo = info; render(); }, toast, dialog, esc });
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  E.App = { VERSION, BUILD, state: S, render, run, insertMn, quick, openProject, example, blank, racks, get chassis() { return chassis; }, mountChassis, select: t => { select(t); render(); }, openEditor, toast };
  Object.defineProperty(E.App, 'ctl', { get: () => ctl });
  start();
})();
