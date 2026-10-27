/* MT PLC Studio app: window, menus, toolbars, online bar, organizer, ladder editor, dialogs, tag editor, I/O panel,
   projects (docs/PLC_APP_SPEC.md). One state, three layouts: desktop (mouse), tablet and phone (touch). The layout
   follows the window, so a resized Windows window or a turned tablet switches it live without losing anything. */
(function () {
  'use strict';
  const VERSION = '0.5.0';
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
    const c = new E.Chassis(8, 'Chassis');
    c.insert(0, 'PLC-CPU', 'Emulator'); c.setController(0, { ip: '127.0.0.1' });
    c.insert(1, 'PLC-DI16-24V', 'DI_1'); c.insert(2, 'PLC-DO16-24V', 'DO_1');
    return [c];
  }
  const racks = (() => {
    try { const o = store.get('emu', null); if (o && Array.isArray(o.racks) && o.racks.length) return o.racks.map(r => E.Chassis.from(r)); } catch (e) { /* a broken copy: start again */ }
    try {
      // the single chassis of 0.2.0-beta.1: its first controller gets the first address
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
    m = /^([A-Za-z][\w-]*)\\(\d+)$/.exec(p || '');   // the virtual backplane driver: <driver>\<slot>
    if (m && !/^Emulate$/i.test(m[1])) return { vbp: m[1], ip: null, slot: +m[2] };
    m = /Backplane\\(\d+)$/i.exec(p || '');   // an older path: the first chassis
    return m ? { ip: null, slot: +m[1] } : null;
  }
  const pathSlot = p => { const x = parsePath(p); return x ? x.slot : -1; };
  // the chassis reached at an address: the first one with a powered controller there (as the first emulator started)
  const rackAt = ip => (ip == null ? racks[0] : racks.find(r => r.controllers().some(m => m.ip === ip && m.ctl.powered)) || null);
  const gatewayIp = r => { const m = r.controllers().find(x => x.ip && x.ctl.powered); return m ? m.ip : null; };
  function resolve(p) {
    const x = parsePath(p); if (!x) return null;
    if (x.vbp) { const r = racks[0], m = r && r.module(x.slot); return { vbp: x.vbp, ip: null, slot: x.slot, rack: r || null, m: m || null, ctl: m && m.ctl && m.ctl.powered ? m.ctl : null }; }
    const r = rackAt(x.ip); if (!r) return { ip: x.ip, slot: x.slot, rack: null, m: null, ctl: null };
    const m = r.module(x.slot);
    return { ip: x.ip, slot: x.slot, rack: r, m, ctl: m && m.ctl && m.ctl.powered ? m.ctl : null };
  }
  const curPath = () => (S.p ? store.get('path.' + S.p.controller.name, DEFPATH) : DEFPATH);
  function setPath(p) { store.set('path.' + S.p.controller.name, p); rememberPath(p); relink(); }
  // the paths used last (Who Active, Set Project Path, Download, Upload), newest first: Communications > Select Recent Path
  function rememberPath(p) { if (!p) return; S.prefs.paths = [p].concat((S.prefs.paths || []).filter(x => x !== p)).slice(0, 8); savePrefs(); }
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
  function addRack(name, desc, size) {
    const r = new E.Chassis(size || 8, name); r.desc = desc || '';
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
    online: 'M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0M12 12v8', more: 'M12 5.5v.01M12 12v.01M12 18.5v.01', moreh: 'M5.5 12h.01M12 12h.01M18.5 12h.01', up: 'M6 15l6-6 6 6', left: 'M15 6l-6 6 6 6',
    dockr: 'M4 5h16v14H4zM14 5v14', dockb: 'M4 5h16v14H4zM4 14h16',
    plus: 'M12 5v14M5 12h14', bmk: 'M7 4h10v16l-5-4-5 4z', back: 'M15 5l-7 7 7 7', close: 'M6 6l12 12M18 6 6 18', down: 'M6 9l6 6 6-6', right: 'M9 6l6 6-6 6',
    ladder: 'M5 3v18M19 3v18M5 8h4M15 8h4M9 5v6M15 5v6M5 16h14', chip: 'M7 7h10v10H7zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4',
    tree: 'M4 5h6M4 5v14M4 12h6M4 19h6M14 5h6M14 12h6M14 19h6', warn: 'M12 4l9 16H3L12 4zM12 10v4M12 17v.01', edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
    toggle: 'M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7zM8 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', text: 'M5 7h14M5 12h14M5 17h9', help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01',
    force: 'M13 3 6 13h5l-1 8 7-10h-5l1-8z', xref: 'M4 6h10M4 12h16M4 18h10M18 4v4M16 6h4', goto: 'M5 12h12M13 6l6 6-6 6', newtag: 'M3 12V4h8l10 10-8 8L3 12zM16 2v6M13 5h6',
    play: 'M7 5l12 7-12 7z', stop: 'M7 7h10v10H7z', download: 'M12 4v11M7 10l5 5 5-5M5 20h14', upload: 'M12 20V9M7 14l5-5 5 5M5 4h14', folder: 'M3 6h6l2 2h10v11H3z',
    task: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2', rack: 'M3 5h18v14H3zM7 5v14M11 5v14M15 5v14', type: 'M5 5h14M12 5v14', prog: 'M4 5h16v14H4zM4 9h16',
    tag: 'M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01', io: 'M4 6h16v12H4zM8 10v4M12 10v4M16 10v4', zin: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6M11 8v6',
    zout: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .2-1.3-1.5.3-2-3-1-1 1.8h-2l-1-1.8-3 1 .3 2L5.9 8.2 4 8l-1 3 2 1v0l-2 1 1 3 2-.2 1.3 1.5-.3 2 3 1 1-1.8h2l1 1.8 3-1-.3-2 1.3-1.5 2 .2 1-3z',
    net: 'M9 3h6v5H9zM12 8v4M5 12h14M5 12v4M19 12v4M2 16h6v5H2zM16 16h6v5h-6z', fault: 'M12 3l9 16H3zM9 12l6 6M15 12l-6 6', exit: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9', info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01',
  };
  const ic = (n, c = 'i') => `<svg class="${c}" viewBox="0 0 24 24" aria-hidden="true"><path d="${IC[n] || ''}"/></svg>`;
  const TABS = {
    Favorites: ['RUNG', 'BR', 'BRL', 'XIC', 'XIO', 'OTE', 'OTL', 'OTU', 'ONS', 'TON', 'CTU', 'RES'],
    Bit: ['XIC', 'XIO', 'OTE', 'OTL', 'OTU', 'ONS', 'OSR', 'OSF'],
    'Timer/Counter': ['TON', 'TOF', 'RTO', 'CTU', 'CTD', 'RES'],
    'Input/Output': ['GSV', 'SSV'],
    Compare: ['EQU', 'NEQ', 'LES', 'LEQ', 'GRT', 'GEQ', 'LIM', 'MEQ', 'CMP'],
    'Compute/Math': ['ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'SQR', 'NEG', 'ABS', 'CPT'],
    'Move/Logical': ['MOV', 'MVM', 'CLR', 'AND', 'OR', 'XOR', 'NOT', 'BTD', 'SWPB'],
    'File/Misc': ['FAL', 'FSC', 'COP', 'CPS', 'FLL', 'AVE', 'SRT', 'STD', 'SIZE'],
    'File/Shift': ['BSL', 'BSR', 'FFL', 'FFU', 'LFL', 'LFU'],
    Sequencer: ['SQI', 'SQO', 'SQL'],
    'Program Control': ['JSR', 'RET', 'SBR', 'JMP', 'LBL', 'MCR', 'AFI', 'NOP', 'TND'],
    Debug: ['BPT', 'TPT'],
    Special: ['PID'],
    'Trig Functions': ['SIN', 'COS', 'TAN', 'ASN', 'ACS', 'ATN'],
    'Advanced Math': ['LN', 'LOG', 'XPY'],
    'Math Conversions': ['DEG', 'RAD', 'TOD', 'FRD', 'TRN'],
    // Wave 3 (1756-RM018A chapters 17 and 18)
    'ASCII String': ['CONCAT', 'DELETE', 'FIND', 'INSERT', 'MID'],
    'ASCII Conversion': ['STOD', 'STOR', 'DTOS', 'RTOS', 'UPPER', 'LOWER'],
  };
  const NAME = mn => (mn === 'RUNG' ? 'Rung' : mn === 'BR' ? 'Branch' : mn === 'BRL' ? 'Branch Level' : (INSTR[mn] || {}).name || mn);
  const MODNAMES = { 'PLC-DI16-24V': '16 DC inputs', 'PLC-DI16-120V': '16 AC inputs', 'PLC-DO16-24V': '16 DC outputs', 'PLC-DO16-RLY': '16 relay outputs', 'PLC-AI4': '4 analog inputs', 'PLC-AO4': '4 analog outputs', 'PLC-ENET': 'Ethernet' };

  /* ---------- projects ---------- */
  /* the controller types of Change Controller: the emulated controller of this app, and the ControlLogix controllers a
     project is moved to (the emulator workflow: change the type to the real controller, then re-alias the I/O). Only
     PLC-CPU can be downloaded to the emulator; the others are for the L5X export to Studio 5000. [type, description,
     revisions (major)] */
  const CTYPES = [['PLC-CPU', 'Emulated controller', ['1.0']],
    ...['1756-L81E', '1756-L82E', '1756-L83E', '1756-L84E', '1756-L85E'].map(t => [t, 'ControlLogix 5580 Controller', ['33', '34', '35', '36', '37']]),
    ...['1756-L71', '1756-L72', '1756-L73', '1756-L74', '1756-L75'].map(t => [t, 'ControlLogix 5570 Controller', ['30', '31', '32', '33']])];
  const ctype = t => CTYPES.find(x => x[0] === t) || CTYPES[0];
  const emuCtl = p => !p || !p.controller.type || p.controller.type === 'PLC-CPU';
  // "PLC-CPU 1.0", "1756-L85E 37": the project's controller
  const ctlLabel = p => { const c = p && p.controller, t = ctype(c && c.type); return t[0] + ' ' + (c && t[2].includes(String(c.rev)) ? c.rev : t[2][t[2].length - 1]); };
  const ctlSlot = () => (S.p && Number.isInteger(S.p.controller.slot) ? S.p.controller.slot : 0);
  function blank(name) {
    return {
      format: 'mt-plc-studio', version: 1, controller: { name, type: 'PLC-CPU', rev: '1.0' }, info: { created: Date.now() },
      rack: { size: 8, modules: [{ slot: 1, type: 'PLC-DI16-24V', name: 'DI_1' }, { slot: 2, type: 'PLC-DO16-24V', name: 'DO_1' }] },
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
  /* ---------- project files on the device (spec section 18) ----------
     Projects live as files the user names and places: .mtp (the project) and .L5X (exchange with the reference
     software), in folders picked in the app's own file browser. Windows: the computer's folders (desktop-mtps/
     preload.js). Android: the Documents folder (Capacitor Filesystem). A browser: a folder kept in the browser.
     Nothing is kept as a list inside the app; only the session (the open project, its file, unsaved changes) is held
     so a restart comes back to the same place. */
  const FS = (() => {
    if (window.mtpsFS) {
      const b = window.mtpsFS;
      return { kind: 'device', places: () => b.places(), list: d => b.list(d), read: f => b.read(f), write: (f, t) => b.write(f, t), mkdir: d => b.mkdir(d), remove: f => b.remove(f), exists: f => b.exists(f), join: (d, n) => d.replace(/[\\/]+$/, '') + (d.includes('\\') ? '\\' : '/') + n };
    }
    const cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
    if (cap) {
      const D = 'DOCUMENTS', ROOT = 'MT PLC Studio Projects';
      const norm = p => String(p || '').replace(/^\/+|\/+$/g, '');
      let asked = false;
      const perm = async () => { if (asked) return; asked = true; try { await cap.requestPermissions(); } catch (e) { /* not needed on newer Android */ } };
      return { kind: 'device',
        places: async () => { await perm(); try { await cap.mkdir({ path: ROOT, directory: D, recursive: true }); } catch (e) { /* exists */ } return [{ label: 'MT PLC Studio Projects', path: ROOT }, { label: 'Documents', path: '' }]; },
        list: async d => {
          await perm();
          const r = await cap.readdir({ path: norm(d), directory: D });
          const items = (r.files || []).map(x => (typeof x === 'string' ? { name: x, type: /\./.test(x) ? 'file' : 'directory' } : x))
            .filter(x => !x.name.startsWith('.') && (x.type === 'directory' || /\.(mtp|l5x|json)$/i.test(x.name)))
            .map(x => ({ name: x.name, path: (norm(d) ? norm(d) + '/' : '') + x.name, dir: x.type === 'directory', size: x.size || 0, mtime: x.mtime || 0 }));
          const nd = norm(d);
          return { dir: nd, parent: nd ? nd.split('/').slice(0, -1).join('/') : null, items };
        },
        read: async f => (await cap.readFile({ path: norm(f), directory: D, encoding: 'utf8' })).data,
        write: async (f, t) => { await cap.writeFile({ path: norm(f), directory: D, data: t, encoding: 'utf8', recursive: true }); return f; },
        mkdir: d => cap.mkdir({ path: norm(d), directory: D, recursive: true }),
        remove: f => cap.deleteFile({ path: norm(f), directory: D }),
        exists: async f => { try { await cap.stat({ path: norm(f), directory: D }); return true; } catch (e) { return false; } },
        join: (d, n) => (norm(d) ? norm(d) + '/' : '') + n };
    }
    // a browser: a folder tree kept in the browser's storage
    const K = 'vfs', get = () => store.get(K, { '/MT PLC Studio Projects': { dir: true, mtime: Date.now() } }), put = v => store.set(K, v);
    const parentOf = p => { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };
    return { kind: 'browser',
      places: async () => { const v = get(); if (!v['/MT PLC Studio Projects']) { v['/MT PLC Studio Projects'] = { dir: true, mtime: Date.now() }; put(v); } return [{ label: 'MT PLC Studio Projects', path: '/MT PLC Studio Projects' }, { label: 'This browser', path: '/' }]; },
      list: async d => { const v = get(), dd = d === '/' ? '' : d; return { dir: d, parent: d === '/' ? null : parentOf(d), items: Object.keys(v).filter(p => parentOf(p) === (dd || '/') && p !== d && p !== '/').map(p => ({ name: p.slice(p.lastIndexOf('/') + 1), path: p, dir: !!v[p].dir, size: v[p].text ? v[p].text.length : 0, mtime: v[p].mtime })) }; },
      read: async f => { const x = get()[f]; if (!x || x.dir) throw new Error('No such file'); return x.text; },
      write: async (f, t) => { const v = get(); v[f] = { text: t, mtime: Date.now() }; if (!put(v)) throw new Error('The browser storage is full'); return f; },
      mkdir: async d => { const v = get(); v[d] = { dir: true, mtime: Date.now() }; put(v); },
      remove: async f => { const v = get(); delete v[f]; put(v); },
      exists: async f => !!get()[f],
      join: (d, n) => (d === '/' ? '' : d) + '/' + n };
  })();
  E.FS = FS;
  const index = () => [];
  /* no project is kept inside the app (owner, as the reference): a project lives in its file on the device's storage,
     made with New Project or opened with Open Project; the app keeps only its settings */
  function saveProject() { if (S.p) title(); }
  let saveTimer = 0;
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveProject, 500); };
  const baseName = p => String(p).split(/[\\/]/).pop();
  const fmtSize = n => (n > 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B');
  /* the app's own file browser: places, the folder path, folders and files, a new folder, the file name and type */
  async function fileDialog(o) {
    const types = o.types || ['mtp'];
    let places = [];
    try { places = await FS.places(); } catch (e) { toast('The files of this device cannot be reached: ' + (e.message || e), 'err'); return; }
    const st = { dir: store.get('lastDir', null) || places[0].path, data: null, sel: null, type: types[0] };
    const el = dialog({ title: o.title, size: 'lg', flush: true, focus: o.mode === 'save',
      body: `<div class="fb"><aside class="fbp"><div class="lbl">Places</div>${places.map(p => `<div class="row" data-fbp="${esc(p.path)}">${ic('folder')}<span class="ell">${esc(p.label)}</span></div>`).join('')}${o.examples ? `<div class="lbl">Examples</div><div class="row" data-fbex="1">${ic('ladder')}<span class="ell">Motor_Demo</span></div>` : ''}</aside>
        <div class="fbm"><div class="fbbar"><button class="ib" data-fbup="1" title="Up one folder" aria-label="Up one folder">${ic('back')}</button><span class="fbpath mono" id="fbpath"></span><button class="btn" data-fbnew="1">${ic('folder')}New Folder</button></div>
          <div class="fbl" id="fbl"><div class="empty">Loading…</div></div>
          <div class="fbf">${o.mode === 'save' ? `<label for="fbn">File name</label><input class="inp mono" id="fbn" value="${esc(o.name || '')}" autocomplete="off" spellcheck="false">` : '<span class="grow"></span>'}${o.descField ? '<label for="fbd">File description</label><input class="inp" id="fbd" autocomplete="off">' : ''}
            <select class="inp" id="fbt" aria-label="File type">${types.map(t => `<option value="${t}">${t === 'mtp' ? 'MT PLC Studio Project (*.mtp)' : t === 'l5x' ? 'Logix export (*.L5X)' : t === 'txt' ? 'Text file (*.txt)' : 'All projects'}</option>`).join('')}</select></div></div></div>
        <p class="help fbhint">${FS.kind === 'browser' ? 'In a browser, the files are kept by this browser. The Windows and Android apps keep them in the folders of the device.' : ''}</p>`,
      buttons: [{ l: 'Cancel' }, { l: o.mode === 'save' ? 'Save' : 'Open', pri: true, run: () => { act(); return false; } }] });
    const q = s => el.querySelector(s);
    const show = async d => {
      try { st.data = await FS.list(d); } catch (e) { toast('That folder cannot be opened: ' + (e.message || e), 'err'); return; }
      st.dir = st.data.dir; st.sel = null; store.set('lastDir', st.dir);
      q('#fbpath').textContent = st.dir || '/';
      const want = new RegExp('\\.(' + (st.type === 'mtp' ? 'mtp|json' : st.type) + ')$', 'i');
      const items = st.data.items.filter(x => x.dir || want.test(x.name)).sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name));
      q('#fbl').innerHTML = items.map(x => `<div class="row fbi" data-fbi="${esc(x.path)}" data-dir="${x.dir ? 1 : ''}">${ic(x.dir ? 'folder' : /\.l5x$/i.test(x.name) ? 'upload' : 'file')}<span class="grow ell">${esc(x.name)}</span><span class="sub">${x.mtime ? new Date(x.mtime).toLocaleString() : ''}</span><span class="sub fbsz">${x.dir ? '' : fmtSize(x.size)}</span></div>`).join('') || '<div class="empty">This folder has no projects.</div>';
    };
    const ext = () => (st.type === 'l5x' ? '.L5X' : st.type === 'txt' ? '.txt' : '.mtp');
    const act = async () => {
      if (o.mode === 'open') {
        if (!st.sel) { toast('Pick a file.'); return; }
        closeLayer(); o.onPick(st.sel);
        return;
      }
      let n = q('#fbn').value.trim();
      if (!n) { toast('Type a file name.', 'err'); return; }
      if (/[\\/:*?"<>|]/.test(n)) { toast('A file name cannot hold \\ / : * ? " < > |', 'err'); return; }
      if (!new RegExp(ext().replace('.', '\\.') + '$', 'i').test(n)) n += ext();
      const f = FS.join(st.dir, n);
      const dsc = o.descField ? q('#fbd').value.trim() : '';
      const go = () => { closeLayer(); o.onPick(f, dsc); };
      if (await FS.exists(f)) confirmDlg('Replace file', `<b>${esc(n)}</b> already exists in this folder. Replace it?`, 'Replace', go, true);
      else go();
    };
    el.addEventListener('click', ev => {
      const p = ev.target.closest('[data-fbp]'); if (p) { show(p.dataset.fbp); return; }
      if (ev.target.closest('[data-fbex]')) { closeLayer(); o.onExample && o.onExample(); return; }
      if (ev.target.closest('[data-fbup]')) { if (st.data && st.data.parent != null) show(st.data.parent); return; }
      if (ev.target.closest('[data-fbnew]')) {
        const n = prompt1Inline(el, 'New folder name', 'New Folder', async v => { if (!v || /[\\/:*?"<>|]/.test(v)) return 'Type a folder name.'; await FS.mkdir(FS.join(st.dir, v)); show(st.dir); });
        void n; return;
      }
      const it = ev.target.closest('[data-fbi]'); if (!it) return;
      el.querySelectorAll('.fbi.on').forEach(x => x.classList.remove('on'));
      if (it.dataset.dir) { if (it.dataset.clicked) show(it.dataset.fbi); else { it.classList.add('on'); it.dataset.clicked = '1'; setTimeout(() => { delete it.dataset.clicked; }, 450); if (S.layout !== 'desktop') show(it.dataset.fbi); } return; }
      it.classList.add('on'); st.sel = it.dataset.fbi;
      if (o.mode === 'save') q('#fbn').value = baseName(it.dataset.fbi);
      else if (it.dataset.clicked) act(); else { it.dataset.clicked = '1'; setTimeout(() => { delete it.dataset.clicked; }, 450); }
    });
    q('#fbt').addEventListener('change', ev => { st.type = ev.target.value; if (o.mode === 'save') { const n = q('#fbn'); n.value = n.value.replace(/\.(mtp|l5x)$/i, '') + ext(); } show(st.dir); });
    show(st.dir);
  }
  /* a one-line question inside a dialog (the dialog stays open under it) */
  function prompt1Inline(host, label, value, fn) {
    const bar = document.createElement('div');
    bar.className = 'fbask';
    bar.innerHTML = `<label>${esc(label)}</label><input class="inp" value="${esc(value)}"><button class="btn pri">OK</button><button class="btn">Cancel</button>`;
    host.querySelector('.fbm').prepend(bar);
    const inp = bar.querySelector('input'); inp.focus(); inp.select();
    const [ok, no] = bar.querySelectorAll('button');
    no.onclick = () => bar.remove();
    ok.onclick = async () => { const err = await fn(inp.value.trim()); if (err) toast(err, 'err'); else bar.remove(); };
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); ok.click(); } });
    return bar;
  }
  const mtpText = () => JSON.stringify(S.p, null, 1);
  async function writeTo(path) {
    // Controller Properties > Project: Created (kept from the first save) and Edited (each save)
    const now = Date.now(); S.p.info = Object.assign({ created: now }, S.p.info || {}, { edited: now });
    try { await FS.write(path, mtpText()); } catch (e) { toast('Could not save: ' + (e.message || e), 'err'); return false; }
    S.file = { path, name: baseName(path) }; S.dirty = false; rememberFile(path); saveProject(); render();
    toast(`Saved ${S.file.name}`, 'ok');
    return true;
  }
  function saveFileAs() { fileDialog({ mode: 'save', title: 'Save As', name: (S.file ? S.file.name : S.p.controller.name + '.mtp'), types: ['mtp'], onPick: writeTo }); }
  async function loadFile(path, then) {
    let t;
    try { t = await FS.read(path); } catch (e) { toast('That file could not be read: ' + (e.message || e), 'err'); return; }
    let p = null;
    if (/\.l5x$/i.test(path) || /^\s*<\?xml|<RSLogix5000Content/i.test(t)) { p = fromL5X(t); if (!p) return; }
    else { try { p = JSON.parse(t); } catch (e) { toast('That file is not a project.', 'err'); return; } if (!validProject(p)) { toast('That file is not an MT PLC Studio project.', 'err'); return; } }
    S.ed = null; openProject(p, true);
    if (/\.mtp$/i.test(path)) S.file = { path, name: baseName(path) };
    S.dirty = !/\.mtp$/i.test(path); rememberFile(path); saveProject(); render();
    toast(`Opened ${baseName(path)}`);
    if (then) then();
  }
  function rememberFile(path) { if (!/\.mtp$/i.test(path)) return; S.prefs.files = [path].concat((S.prefs.files || []).filter(x => x !== path)).slice(0, 8); savePrefs(); }
  function cmdOpen() {
    const go = () => fileDialog({ mode: 'open', title: 'Open Project', types: ['mtp', 'l5x'], examples: true, onPick: f => loadFile(f), onExample: () => { openProject(example()); } });
    saveChanges(go);
  }
  /* File > Close: the project closes (offline first) and the Start Page shows, as at the first start */
  function closeProject() {
    if (S.online) { S.online = false; linked = null; commLed(); }
    S.ed = null; closeLayer();
    openProject(blank('New_Project'), true);
    S.noProj = true; S.view = 'start'; S.area = 'ladder'; S.selRung = null; S.drawer = false; reverify();
    render();
  }
  /* the reference's prompt before the project closes (Close, New, Open, Exit): "Save changes to <name>?" Yes saves
     first (Save As when it has no file yet) and then goes on, No goes on without saving, Cancel stays */
  function saveChanges(fn) {
    if (!S.dirty || S.noProj) { fn(); return; }
    const then = ok => { if (ok) setTimeout(fn, 0); };
    dialog({ title: 'MT PLC Studio', body: `<p>Save changes to <b>${esc(S.file ? S.file.name : S.p.controller.name)}</b>?</p>`, size: 'sm',
      buttons: [{ l: 'Yes', pri: true, run: () => { setTimeout(() => (S.file && S.file.path ? writeTo(S.file.path).then(then) : fileDialog({ mode: 'save', title: 'Save As', name: S.p.controller.name + '.mtp', types: ['mtp'], onPick: f => writeTo(f).then(then) })), 0); } },
        { l: 'No', run: () => { setTimeout(fn, 0); } }, { l: 'Cancel' }] });
  }
  function exportL5X() { fileDialog({ mode: 'save', title: 'Export L5X', name: S.p.controller.name + '.L5X', types: ['l5x'], onPick: async f => { try { await FS.write(f, toL5X(S.p)); toast(`Exported ${baseName(f)}`, 'ok'); } catch (e) { toast('Could not export: ' + (e.message || e), 'err'); } } }); }
  function importL5X() { fileDialog({ mode: 'open', title: 'Import L5X', types: ['l5x'], onPick: f => loadFile(f) }); }
  /* the projects of the older versions, kept inside the app, become .mtp files in the projects folder (once) */
  async function moveOldProjects() {
    const ix = store.get('index', []);
    if (!ix.length) return;
    let moved = 0, dir;
    try { dir = (await FS.places())[0].path; } catch (e) { return; }
    for (const x of ix) {
      const p = store.get('p.' + x.name);
      if (!validProject(p)) { store.del('p.' + x.name); continue; }
      const f = FS.join(dir, x.name + '.mtp');
      try { if (!(await FS.exists(f))) await FS.write(f, JSON.stringify(p, null, 1)); store.del('p.' + x.name); moved++; } catch (e) { /* keep it for the next try */ }
    }
    if (!store.get('index', []).some(x => store.get('p.' + x.name))) { store.del('index'); store.del('last'); }
    if (moved) toast(`${moved} project(s) from this app were saved as .mtp files in ${dir}.`, 'ok');
  }
  function openProject(p, quiet) {
    S.p = p; S.file = null; S.dirty = false; S.tabs = []; S.descEd = null; S.view = 'ladder'; S.noProj = false;
    // modules of a type this version does not have (the generic module of 0.4.0-beta.1) leave the I/O configuration
    // a project of 0.4.0-beta.3 or older (7, 10 or 12 slots) gets an 8-slot chassis when its modules fit
    if (p.rack && p.rack.size != null && !E.RACKS.includes(p.rack.size)) p.rack.size = E.fitRack(p.rack.size, (p.rack.modules || []).map(m => m.slot).concat(p.controller && Number.isInteger(p.controller.slot) ? p.controller.slot : 0));
    const gone = (p.rack && p.rack.modules || []).filter(m => !E.MODULES[m.type]);
    if (gone.length) { p.rack.modules = p.rack.modules.filter(m => E.MODULES[m.type]); setTimeout(() => toast(`Removed from the I/O configuration: ${gone.map(m => `[${m.slot}] ${m.name}`).join(', ')} (module type no longer in the app).`), 300); }
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
      p.tasks.every(t => Array.isArray(t.programs) && t.programs.every(g => Array.isArray(g.routines) && (g.routines.length || HANDLERS[t.type])));
  }

  /* ---------- state ---------- */
  // [id, name, idea, mini preview: shell, background, canvas, energized]
  const THEMES = [['classic', 'CLASSIC', 'Like the Windows software', '#FFFFFF', '#F0F0F0', '#FFFFFF', '#22A84C'],
    ['controlroom', 'CONTROL ROOM', 'ISA-101 grey, colour only for PLC state', '#E4E7EA', '#D3D7DC', '#F2F3F4', '#14804A'],
    ['workbench', 'WORKBENCH', 'Dark shell, square, IBM Carbon', '#161616', '#F4F4F4', '#FFFFFF', '#198038'],
    ['tonal', 'TONAL TOUCH', 'Soft, rounded, Material 3', '#F5F2FA', '#FBF8FF', '#FFFFFF', '#398A4A']];
  const S = {
    p: null, prog: '', routine: '', sel: null, selRung: null, clip: null, undo: [], redo: [], dirty: false, online: false,
    layout: 'desktop', area: 'ladder', drawer: false, ioOpen: false, errOpen: false, tagOpen: new Set(), verify: null, errRungs: new Set(),
    prefs: Object.assign({ layout: 'auto', theme: 'classic', density: 'auto', zoom: 1, org: true, err: true, io: false, emu: true, emuH: 260, emuW: 380, emuHp: 330, tab: 'Favorites', push: false, collapsed: ['dts'] }, store.get('prefs', {})),
    find: '', ed: null, tabs: [], view: 'ladder',
  };
  const savePrefs = () => store.set('prefs', S.prefs);
  const hadTheme = 'theme' in store.get('prefs', {});
  if (!S.prefs.classic) { S.prefs.classic = 1; if (S.prefs.theme === 'auto') S.prefs.theme = 'classic'; savePrefs(); }
  // themes (Tools > Options > Theme): the old Theme setting becomes Classic in Light, Dark or Follow the device
  if (!S.prefs.themes) {
    const t = S.prefs.theme;
    S.prefs.mode = !hadTheme ? 'auto' : t === 'dark' ? 'dark' : t === 'auto' ? 'auto' : 'light';
    if (!THEMES.some(x => x[0] === t)) S.prefs.theme = 'classic';
    S.prefs.themes = 1; savePrefs();
  }
  const allProgs = () => S.p.tasks.flatMap(t => t.programs);
  /* the Controller Fault Handler and the Power-Up Handler folders (1756-PM014): kept as a task of type fault / powerup
     that holds at most one program, which is never scheduled (it runs on a major fault, or at power-up) */
  const HANDLERS = { fault: 'Controller Fault Handler', powerup: 'Power-Up Handler' };
  const handlerTask = kind => S.p.tasks.find(t => t.type === kind);
  const handlerProg = kind => { const t = handlerTask(kind); return t && t.programs[0] || null; };
  const curProg = () => allProgs().find(p => p.name === S.prog) || allProgs()[0];
  const curRoutine = () => { const P = curProg(); return P.routines.find(r => r.name === S.routine) || P.routines[0]; };
  const rungs = () => curRoutine().rungs;
  const parsed = i => { const r = rungs()[i]; if (!r) return null; const pr = E.parseRung(r.t); return pr.err ? null : pr.elems; };
  // the ladder and the tags can be edited offline and online (online edits wait for Accept Edits); modules only offline
  const editable = () => !S.noProj;
  const offline = () => !S.online;
  /* online edits, as in the reference software: pending edits (on this device only) are accepted; in Run the
     controller then keeps the old logic until the accepted edits are tested, and testing can be undone (Untest)
     until they are assembled. In Program, accepting finalizes them. S.ed = { ctl, orig, base, tested }:
     orig = the controller's project before the edits, base = the accepted project (both JSON). */
  const lkey = p => JSON.stringify(p, (k, v) => (k === 'value' || k === 'desc' || k === 'comments' || k === 'c' || k === 'dx' || k === 'bm' || k === 'info' || k === 'noDocs' ? undefined : k === 'controller' && v && typeof v === 'object' ? { type: v.type, rev: v.rev } : v));
  /* edit zones on the rungs (Studio 5000 "Edit ladder logic in run mode"): rung.z is
     i: the editable copy made by Start Pending Rung Edits, or a new rung (shown e while it has errors);
     r: the original below it, read-only; after Accept they become I (insert zone) and R (replace zone);
     D: a rung deleted online in Run (delete zone). Old logic = no i/I rungs, new logic = no r/R/D rungs. */
  const eachRoutine = (p, fn) => p.tasks.forEach(t => t.programs.forEach(g => g.routines.forEach(fn)));
  function logicOf(p, which) {
    const q = JSON.parse(JSON.stringify(p)), drop = which === 'old' ? /^[iI]$/ : /^[rRD]$/;
    eachRoutine(q, r => { r.rungs = r.rungs.filter(x => !drop.test(x.z || '')); r.rungs.forEach(x => { delete x.z; delete x.dx; }); });
    return q;
  }
  const newLogic = p => logicOf(p, 'new');
  function zonesIn(p) { let z = ''; eachRoutine(p, r => r.rungs.forEach(x => { if (x.z && !z.includes(x.z)) z += x.z; })); return z; }
  const RO_Z = /^[rRDI]$/;
  // online, a rung that is an original (r/R), deleted (D) or accepted (I) cannot be changed
  const roRung = r => !!(S.online && r && RO_Z.test(r.z || ''));
  function edPhase() {
    if (!S.online || !ctl.M) return null;
    const zs = zonesIn(S.p);
    if (/[ir]/.test(zs)) return 'pending';
    const dirty = !ctl.holds(zs ? newLogic(S.p) : S.p);
    if (S.ed && S.ed.ctl === ctl) {
      if (S.ed.tested) return dirty ? 'pending' : 'tested';
      return lkey(S.p) === lkey(JSON.parse(S.ed.base)) ? 'accepted' : 'pending';
    }
    return dirty || zs ? 'pending' : null;
  }
  const pending = () => edPhase() !== null;
  let ctlCopy = { s: null, p: null };
  function ctlRungs() {
    if (ctlCopy.s !== ctl.copy) ctlCopy = { s: ctl.copy, p: ctl.copy ? JSON.parse(ctl.copy) : null };
    const P = ctlCopy.p && ctlCopy.p.tasks.flatMap(t => t.programs).find(g => U(g.name) === U(curProg().name));
    const r = P && P.routines.find(x => U(x.name) === U(curRoutine().name));
    return r ? r.rungs : null;
  }

  /* ---------- verify ---------- */
  function reverify() {
    S.verify = S.noProj ? { errors: [], warnings: [], lines: [] } : E.verify(S.p);
    S.errRungs = new Set(S.verify.errors.filter(e => e.routine === curRoutine().name && e.program === curProg().name).map(e => e.rung));
  }

  /* ---------- undo / redo and edits ---------- */
  const snap = () => JSON.stringify({ p: S.p, prog: S.prog, routine: S.routine, sel: S.sel, selRung: S.selRung });
  function restore(s) { const o = JSON.parse(s); Object.assign(S, { p: o.p, prog: o.prog, routine: o.routine, sel: o.sel, selRung: o.selRung }); changed(); }
  function edit(fn, raw) {
    const before = snap(), post = raw ? null : rungHook();
    if (fn() === false) return false;
    if (post && post() === false) { restore(before); return false; }
    S.undo.push(before);
    if (S.undo.length > 100) S.undo.shift();
    S.redo = [];
    changed();
    return true;
  }
  /* what an edit did to the rungs of the routine (found by object, as writeRung changes a rung in place):
     - the instructions it added or changed are marked dirty (rung.dx, '*' beside the mnemonic until Verify);
     - online, it goes through edit zones as in the reference: a changed rung gets its copy (i) with the original
       below it (r), a new rung is i, a rung deleted in Run stays as D (still executed until the edits are tested);
       an r/R/D/I rung is read-only, so an edit that changes one is undone. */
  const ikeys = t => { const pr = E.parseRung(t || ''), out = []; const w = a => a.forEach(e => (e.t === 'BR' ? e.legs.forEach(w) : out.push(L.ikey(e)))); if (!pr.err) w(pr.elems); return out; };
  // the instructions in rung order as "key#n" (the n-th one with that key), as the ladder draws them
  const occ = keys => { const c = {}; return keys.map(k => { c[k] = (c[k] || 0) + 1; return k + '#' + (c[k] - 1); }); };
  // which new instructions are the old ones (longest common subsequence): new index → old index
  function lcsMap(a, b) {
    const n = a.length, m = b.length, T = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0)), map = new Map();
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i][j] = a[i] === b[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
    for (let i = 0, j = 0; i < n && j < m;) { if (a[i] === b[j]) { map.set(j, i); i++; j++; } else if (T[i + 1][j] >= T[i][j + 1]) i++; else j++; }
    return map;
  }
  function rungHook() {
    if (S.noProj) return null;
    const R = curRoutine(), pre = R.rungs.map(r => ({ r, t: r.t, z: r.z }));
    return () => {
      if (curRoutine() !== R) return true;
      const now = R.rungs, has = new Set(now), at = new Map(pre.map(x => [x.r, x]));
      // the dirty instructions: what is in the rung now and was not before
      now.forEach(r => {
        const x = at.get(r);
        if (x && x.t === r.t) return;
        const ok = x ? ikeys(x.t) : [], nk = ikeys(r.t), oo = occ(ok), no = occ(nk), was = new Set(r.dx || []), map = lcsMap(ok, nk);
        const d = no.filter((k, j) => !map.has(j) || was.has(oo[map.get(j)]));
        if (d.length) r.dx = d; else delete r.dx;
      });
      if (!S.online || !ctl.M) return true;
      const ro = pre.find(x => RO_Z.test(x.z || '') && (!has.has(x.r) || x.r.t !== x.t));
      if (ro) { toast(`Rung ${pre.indexOf(ro)} is read-only (${ro.z}): ${ro.z === 'I' || ro.z === 'R' || ro.z === 'D' ? 'test and assemble, or cancel, the accepted edits first' : 'edit the copy (i) above it'}.`, 'err'); return false; }
      const testing = S.ed && S.ed.ctl === ctl && S.ed.tested, selObj = now[curSelRung()];
      let dels = 0;
      pre.forEach((x, k) => {
        if (has.has(x.r) || x.z) return;
        // a rung deleted in Run is a delete zone (D) until the edits are assembled; in Program it just goes
        if (!ctl.running) return;
        if (testing) { dels = -1; return; }
        let j = -1;
        for (let q = k - 1; q >= 0 && j < 0; q--) j = now.indexOf(pre[q].r);
        x.r.z = 'D'; delete x.r.dx; now.splice(j + 1, 0, x.r); has.add(x.r); dels++;
      });
      if (dels < 0) { toast('Assemble or untest the edits being tested first.', 'err'); return false; }
      now.slice().forEach(r => {
        const x = at.get(r);
        if (!x) { if (!/^[i]$/.test(r.z || '')) { r.z = 'i'; } return; }
        if (x.z || x.t === r.t) return;
        // the first change to a rung starts its pending edit: the copy (i) above, the original (r) below
        r.z = 'i';
        const o = { t: x.t, z: 'r' }; if (r.c) o.c = r.c;
        now.splice(now.indexOf(r) + 1, 0, o);
      });
      // the zones moved rungs down: the selection follows its rung
      const si = selObj ? now.indexOf(selObj) : -1;
      if (si >= 0) { if (S.sel) S.sel.ri = si; else S.selRung = si; }
      if (dels > 0) acceptZones();
      return true;
    };
  }
  /* the D zones go to the controller as accepted edits at once (it keeps running the old logic) */
  function acceptZones() {
    if (!S.ed || S.ed.ctl !== ctl) S.ed = { ctl, orig: ctl.copy, base: null, tested: false };
    // the accepted state: without the pending edits (i copies dropped, r originals back to normal rungs)
    const q = JSON.parse(JSON.stringify(S.p));
    eachRoutine(q, r => { r.rungs = r.rungs.filter(x => x.z !== 'i'); r.rungs.forEach(x => { if (x.z === 'r') delete x.z; }); });
    S.ed.base = JSON.stringify(q);
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
  const TC = ['TON', 'TOF', 'RTO', 'CTU', 'CTD'];
  const newEl = (mn, ops) => { const d = INSTR[mn]; const need = d.args.filter(a => !a.endsWith('?')).length; const a = (ops || []).slice(0, d.args.length); while (a.length < need) a.push(TC.includes(mn) && a.length === 2 ? '0' : '?'); return { t: mn, a }; };
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
        const { arr, idx } = seqOf(elems, tgt), pos = at ? (at.after ? idx + 1 : idx) : S.insMode ? idx : idx + 1;
        arr.splice(pos, 0, el);
        path = tgt.slice(0, -1).concat(pos);
      } else { elems.push(el); path = [elems.length - 1]; }
      writeRung(ri, elems);
      S.sel = { ri, path }; S.selRung = null;
    });
    if (ok && openAfter && el.t !== 'BR' && INSTR[el.t] && INSTR[el.t].args.length) setTimeout(() => (openAfter === 'inline' ? inlineEdit(ri, path, 0) : openEditor(ri, path, 0)), 0);
  }
  /* move an instruction or a branch to a node (Ctrl copies it), as when dragging it in the reference editor: before or
     after an instruction, the free end of a branch level, the end of a rung; into the same rung or another one */
  function locate(arr, obj) {
    for (let k = 0; k < arr.length; k++) {
      if (arr[k] === obj) return { arr, idx: k, path: [k] };
      if (arr[k].t === 'BR') for (let li = 0; li < arr[k].legs.length; li++) { const r = locate(arr[k].legs[li], obj); if (r) return { ...r, path: [k, li].concat(r.path) }; }
    }
    return null;
  }
  function moveEl(src, drop, copy) {
    if (!src || !src.path || src.leg || !drop || !editable()) return false;
    const sameRung = src.ri === drop.ri;
    if (sameRung && drop.path && drop.path.length >= src.path.length && src.path.every((x, i) => x === drop.path[i])) return false;
    let ri, path, kind;
    const ok = edit(() => {
      const se = parsed(src.ri), de = sameRung ? se : parsed(drop.ri);
      if (!se || !de) { toast('This rung has a text error: fix it with Edit Rung first.', 'err'); return false; }
      const moving = getEl(se, src.path);
      if (!moving) return false;
      const br = drop.leg ? getEl(de, drop.path.slice(0, -1)) : null, tgt = drop.path && !drop.leg ? getEl(de, drop.path) : null;
      const item = copy ? JSON.parse(JSON.stringify(moving)) : moving;
      if (!copy) { const { arr, idx } = seqOf(se, src.path); arr.splice(idx, 1); }
      if (br) br.legs[drop.path[drop.path.length - 1]].push(item);
      else if (tgt) { const at = locate(de, tgt); at.arr.splice(at.idx + (drop.after ? 1 : 0), 0, item); }
      else de.push(item);
      tidy(se); if (!sameRung) tidy(de);
      writeRung(src.ri, se); if (!sameRung) writeRung(drop.ri, de);
      ri = drop.ri; kind = item.t === 'BR' ? 'branch' : item.t;
      const at = locate(de, item); path = at ? at.path : null;
      S.sel = path ? { ri, path, br: item.t === 'BR' } : null; S.selRung = path ? null : ri;
    });
    if (ok) toast(`${copy ? 'Copied' : 'Moved'} ${kind} to rung ${ri}`);
    return ok;
  }
  function insertMn(mn, at) {
    if (mn === 'RUNG') return addRung();
    if (mn === 'BR') return addBranch(at);
    if (mn === 'BRL') return addLevel(true);
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
  /* Add Branch Level: a level after the one the caret is on; Append New Level: a level at the end of the branch
     (Rockwell Ladder Editor command reference) */
  function addLevel(append) {
    if (!S.sel || !S.sel.path) { toast('Select a branch or an instruction in a branch first.'); return; }
    edit(() => {
      const elems = parsed(S.sel.ri); if (!elems) return false;
      const bp = S.sel.br ? S.sel.path : S.sel.leg ? S.sel.path.slice(0, -1) : S.sel.path.length >= 3 ? S.sel.path.slice(0, -2) : null;
      if (!bp) { toast('Select a branch or an instruction in a branch first.'); return false; }
      const b = getEl(elems, bp);
      const cur = S.sel.br ? b.legs.length - 1 : S.sel.leg ? S.sel.path[S.sel.path.length - 1] : S.sel.path[S.sel.path.length - 2];
      const at = append ? b.legs.length : cur + 1;
      b.legs.splice(at, 0, []);
      writeRung(S.sel.ri, elems);
      S.sel = { ri: S.sel.ri, path: bp.concat(at), leg: true };
    });
  }
  const branchPath = () => !S.sel || !S.sel.path ? null : S.sel.br ? S.sel.path : S.sel.leg ? S.sel.path.slice(0, -1) : S.sel.path.length >= 3 ? S.sel.path.slice(0, -2) : null;
  /* Move Branch Rail: the start or end rail of the branch moves one element left or right; the element it passes
     goes into or out of the top level of the branch, as when the rail is dragged in the reference */
  function stepRail(which, dir) {
    const bp0 = branchPath(); if (!bp0) return false;
    let ok = false;
    edit(() => {
      const elems = parsed(S.sel.ri); if (!elems) return false;
      const { arr, idx } = seqOf(elems, bp0), b = arr[idx], top = b.legs[0];
      let ni = idx;
      if (which === 'end' && dir > 0) { if (idx + 1 >= arr.length) return false; top.push(arr.splice(idx + 1, 1)[0]); }
      else if (which === 'end' && dir < 0) { if (!top.length) return false; arr.splice(idx + 1, 0, top.pop()); }
      else if (which === 'start' && dir < 0) { if (idx === 0) return false; top.unshift(arr.splice(idx - 1, 1)[0]); ni = idx - 1; }
      else { if (!top.length) return false; arr.splice(idx, 0, top.shift()); ni = idx + 1; }
      writeRung(S.sel.ri, elems);
      S.sel = { ri: S.sel.ri, path: bp0.slice(0, -1).concat(ni), br: true };
      ok = true;
    });
    return ok;
  }
  function moveRailDialog() {
    if (!branchPath()) { toast('Select a branch first.'); return; }
    dialog({ title: 'Move Branch Rail', size: 'sm',
      body: `<p>Move a rail of the branch one element. The element it passes goes into or out of the top level of the branch.</p>
        <div class="mvr"><b>Start rail</b><button class="btn" data-mvr="start,-1">◀ Left</button><button class="btn" data-mvr="start,1">Right ▶</button></div>
        <div class="mvr"><b>End rail</b><button class="btn" data-mvr="end,-1">◀ Left</button><button class="btn" data-mvr="end,1">Right ▶</button></div>`,
      buttons: [{ l: 'Close', pri: true }],
      mount: el => el.addEventListener('click', ev => { const t = ev.target.closest('[data-mvr]'); if (!t) return; const [w, d] = t.dataset.mvr.split(','); if (!stepRail(w, +d)) toast('The rail cannot move that way.'); }) });
  }
  /* Edit > Select All (reference: Ladder Editor > Select All selects all the rungs of the routine; in the Tag Editor,
     all rows of the grid): Copy, Cut and Delete then act on all of them */
  const selAllOn = () => S.view === 'ladder' && !!S.selAll && S.selAll.k === S.prog + '/' + S.routine && !S.sel && S.selRung === S.selAll.ri && rungs().length > 0;
  const tagAllOn = () => S.view === 'tags' && !!S.tagAll;
  // the caret on an instruction: Select All selects all the instructions of its rung (Ladder Editor command reference)
  const insAllOn = () => S.view === 'ladder' && !!S.selIns && S.selIns.k === S.prog + '/' + S.routine && !S.sel && S.selRung === S.selIns.ri && !!(parsed(S.selIns.ri) || []).length;
  function selectAll() {
    if (S.view === 'tags') { S.tagAll = true; refreshTags(); toast('All tag rows selected: Copy copies them.'); return; }
    if (S.sel && S.sel.path) {
      const ri = S.sel.ri, n = flat(parsed(ri) || []).length;
      S.sel = null; S.selRung = ri; S.selAll = null; S.selIns = { k: S.prog + '/' + S.routine, ri };
      render(); toast(`${n} instruction(s) of rung ${ri} selected.`); return;
    }
    const ri = curSelRung() == null ? 0 : curSelRung();
    S.sel = null; S.selRung = ri; S.selAll = { k: S.prog + '/' + S.routine, ri };
    render(); toast(`${rungs().length} rung(s) selected.`);
  }
  function delSel() {
    if (insAllOn()) return edit(() => { const ri = S.selIns.ri; writeRung(ri, []); S.selIns = null; S.sel = null; S.selRung = ri; });
    if (selAllOn()) return edit(() => { rungs().splice(0); S.selAll = null; S.sel = null; S.selRung = null; });
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
    if (tagAllOn()) {
      // the rows as text (tab between the columns), as a copy of the grid
      const rows = scopeTags(S.tagScope || '').map(t => [t.name, t.alias || '', t.alias ? '' : (t.type || 'BOOL') + (t.dim ? '[' + t.dim + ']' : ''), t.desc || ''].join('\t'));
      try { navigator.clipboard && navigator.clipboard.writeText(['Name\tAlias For\tData Type\tDescription'].concat(rows).join('\n')).catch(() => {}); } catch (e) { /* ignore */ }
      S.clipTags = rows; toast(`Copied ${rows.length} tag row(s)`); return;
    }
    if (insAllOn()) {
      const els = JSON.parse(JSON.stringify(parsed(S.selIns.ri)));
      S.clip = { kind: 'els', els };
      try { navigator.clipboard && navigator.clipboard.writeText(E.serializeRung(els).replace(/;$/, '')).catch(() => {}); } catch (e) { /* ignore */ }
      if (cut) delSel(); else toast(`Copied ${flat(els).length} instruction(s)`);
      return;
    }
    if (selAllOn()) {
      const list = rungs().map(r => { const c = { ...r }; delete c.z; delete c.dx; delete c.bm; return c; });
      S.clip = { kind: 'rungs', rungs: list };
      try { navigator.clipboard && navigator.clipboard.writeText(list.map(r => r.t).join('\n')).catch(() => {}); } catch (e) { /* ignore */ }
      if (cut) delSel(); else toast(`Copied ${list.length} rung(s)`);
      return;
    }
    if (S.sel && S.sel.path) {
      const el = curEl(); if (!el) return;
      S.clip = { kind: 'el', el: JSON.parse(JSON.stringify(el)) };
      try { navigator.clipboard && navigator.clipboard.writeText(E.serializeRung([el]).replace(/;$/, '')).catch(() => {}); } catch (e) { /* ignore */ }
    } else if (S.selRung != null) {
      S.clip = { kind: 'rung', rung: { ...rungs()[S.selRung] } }; delete S.clip.rung.z; delete S.clip.rung.bm;
      try { navigator.clipboard && navigator.clipboard.writeText(rungs()[S.selRung].t).catch(() => {}); } catch (e) { /* ignore */ }
    } else return;
    if (cut) delSel(); else toast('Copied');
  }
  function paste() {
    if (!S.clip) { toast('Nothing to paste yet.'); return; }
    if (S.clip.kind === 'el') {
      // the paste matrix of the reference: an instruction pasted on a selected rung (its rung selection region) goes
      // at the start of the rung, on a selected branch level at the start of that level; else after the selection
      const el = JSON.parse(JSON.stringify(S.clip.el)), ri = S.sel ? S.sel.ri : S.selRung, els = ri != null ? parsed(ri) : null;
      if (!S.sel && ri != null && els && els.length) insert(el, { ri, path: [0], after: false }, false);
      else if (S.sel && S.sel.leg && els && (getEl(els, S.sel.path.slice(0, -1)).legs[S.sel.path[S.sel.path.length - 1]] || []).length) insert(el, { ri, path: S.sel.path.concat(0), after: false }, false);
      else insert(el, null, false);
    } else if (S.clip.kind === 'els') {
      // the instructions of a rung: after the selected instruction, at the start of a selected rung, else on a new rung
      edit(() => {
        const items = JSON.parse(JSON.stringify(S.clip.els)), ri0 = S.sel ? S.sel.ri : S.selRung;
        let ri = ri0 != null && rungs()[ri0] ? ri0 : null;
        if (ri == null) { rungs().push({ t: '' }); ri = rungs().length - 1; }
        const els = parsed(ri); if (!els) { toast('This rung has a text error: fix it with Edit Rung first.', 'err'); return false; }
        let path;
        if (S.sel && S.sel.path && !S.sel.leg && !S.sel.br) { const { arr, idx } = seqOf(els, S.sel.path); arr.splice(idx + 1, 0, ...items); path = S.sel.path.slice(0, -1).concat(idx + items.length); }
        else { els.unshift(...items); path = [items.length - 1]; }
        writeRung(ri, els); S.sel = { ri, path }; S.selRung = null; S.selIns = null;
      });
    } else if (S.clip.kind === 'rungs') edit(() => { const ri = curSelRung(), at = ri == null ? rungs().length : ri + 1; rungs().splice(at, 0, ...S.clip.rungs.map(r => ({ ...r }))); S.sel = null; S.selRung = at; });
    else edit(() => { const ri = curSelRung(); const at = ri == null ? rungs().length : ri + 1; const r = { ...S.clip.rung }; delete r.z; rungs().splice(at, 0, r); S.sel = null; S.selRung = at; });
  }

  /* ---------- layout ---------- */
  function pickLayout() {
    const p = S.prefs.layout;
    if (p !== 'auto') return p;
    const w = innerWidth, coarse = matchMedia('(pointer: coarse)').matches;
    return w < 768 ? 'phone' : w < 1200 || (coarse && w < 1600) ? 'tablet' : 'desktop';
  }
  /* the theme changes the look only; data-mode is the resolved Light or Dark (Follow the device asks the system) */
  const darkMq = matchMedia('(prefers-color-scheme: dark)');
  const themeMode = () => S.prefs.mode === 'dark' || (S.prefs.mode === 'auto' && darkMq.matches) ? 'dark' : 'light';
  function applyTheme() {
    const docs = [document].concat(chasWin && !chasWin.closed ? [chasWin.document] : []);
    docs.forEach(d => { d.documentElement.dataset.theme = S.prefs.theme; d.documentElement.dataset.mode = themeMode(); });
  }
  if (darkMq.addEventListener) darkMq.addEventListener('change', () => { if (S.prefs.mode === 'auto') applyTheme(); });
  function title() {
    if (!S.p) return;
    if (S.noProj) { document.title = 'MT PLC Studio'; return; }
    // connected to an emulated controller, the title bars say so (as the reference software does)
    document.title = `MT PLC Studio - ${S.file && S.file.name ? S.file.name.replace(/\.mtp$/i, '') : S.p.controller.name}${S.dirty ? '*' : ''} [${ctlLabel(S.p)}]${S.online ? ' [Emulator]' : ''}`;
  }

  /* ---------- commands (menus, toolbars, keyboard and touch use the same list) ---------- */
  const selIsBool = () => { const e = curEl(); return !!(e && INSTR[e.t] && /^bit/.test(INSTR[e.t].args[0] || '') && e.a[0] && e.a[0] !== '?'); };
  const selForceable = () => { const e = curEl(); return S.online && !!(e && e.a && e.a[0]) && ctl.forced(e.a[0], S.prog) !== undefined && !!ctl.refOf(e.a[0], S.prog).force; };
  const C = {
    new: { l: 'New Project…', k: 'Ctrl+N', i: 'file', run: cmdNew },
    open: { l: 'Open… (.mtp, .L5X)', k: 'Ctrl+O', i: 'open', run: cmdOpen },
    close: { l: 'Close', i: 'close', run: () => saveChanges(closeProject), on: () => !S.noProj },
    save: { l: 'Save', k: 'Ctrl+S', i: 'save', run: saveCmd },
    uptags: { l: 'Upload Tag Values', i: 'upload', run: () => uploadTags(true), on: () => S.online && !!ctl.M && ctl.holds(S.p) },
    saveas: { l: 'Save As… (.mtp file)', i: 'save', run: saveFileAs },
    import: { l: 'Import L5X…', i: 'upload', run: importL5X },
    export: { l: 'Export L5X…', i: 'download', run: exportL5X },

    exit: { l: 'Exit', i: 'exit', run: () => saveChanges(() => { saveProject(); S.dirty = false; window.close(); }), show: () => isElectron },
    undo: { l: 'Undo', k: 'Ctrl+Z', i: 'undo', run: undo, on: () => editable() && S.undo.length > 0 },
    redo: { l: 'Redo', k: 'Ctrl+Y', i: 'redo', run: redo, on: () => editable() && S.redo.length > 0 },
    cut: { l: 'Cut', k: 'Ctrl+X', i: 'cut', run: () => copySel(true), on: () => editable() && (!!S.sel || S.selRung != null) },
    copy: { l: 'Copy', k: 'Ctrl+C', i: 'copy', run: () => copySel(false), on: () => !!S.sel || S.selRung != null || tagAllOn() },
    bmtog: { l: 'Toggle Bookmark', i: 'bmk', run: () => bookmark('tog'), on: () => S.view === 'ladder' && curSelRung() != null && !!rungs()[curSelRung()] },
    bmnext: { l: 'Next Bookmark', i: 'down', run: () => bookmark(1), on: () => !S.noProj && bmList().length > 0 },
    bmprev: { l: 'Previous Bookmark', i: 'up', run: () => bookmark(-1), on: () => !S.noProj && bmList().length > 0 },
    bmall: { l: 'View All Bookmarks…', i: 'bmk', run: () => bookmarksDlg(), on: () => !S.noProj },
    bmclear: { l: 'Clear All Bookmarks', i: 'trash', run: () => bookmark('clear'), on: () => !S.noProj && bmList().length > 0 },
    insmode: { l: 'Insert Mode', k: 'Ctrl+I', i: 'plus', run: () => { S.insMode = !S.insMode; toast(S.insMode ? 'Insert mode: a new instruction goes before the selected one.' : 'Append mode: a new instruction goes after the selected one.'); }, ck: () => !!S.insMode },
    selall: { l: 'Select All', k: 'Ctrl+A', i: 'check', run: selectAll, on: () => !S.noProj && (S.view === 'tags' || (S.view === 'ladder' && rungs().length > 0)) },
    paste: { l: 'Paste', k: 'Ctrl+V', i: 'paste', run: paste, on: () => editable() && !!S.clip },
    del: { l: 'Delete', k: 'Del', i: 'trash', run: delSel, on: () => editable() && (!!S.sel || S.selRung != null) },
    rung: { l: 'Add Rung', k: 'Ctrl+R', i: 'ladder', run: addRung, on: editable },
    branch: { l: 'Add Branch', i: 'tree', run: () => addBranch(), on: editable },
    level: { l: 'Add Branch Level', i: 'tree', run: () => addLevel(false), on: () => editable() && !!S.sel },
    applevel: { l: 'Append New Level', i: 'tree', run: () => addLevel(true), on: () => editable() && !!branchPath() },
    mvrail: { l: 'Move Branch Rail…', i: 'tree', run: moveRailDialog, on: () => editable() && !!branchPath() },
    ins: { l: 'Add Ladder Element…', k: 'Alt+Ins', i: 'plus', run: () => picker(''), on: editable },
    edit: { l: 'Edit Instruction', k: 'Enter', i: 'edit', run: () => S.sel && S.sel.path && !S.sel.br && !S.sel.leg && openEditor(S.sel.ri, S.sel.path, selOpIdx()), on: () => editable() && !!curEl() },
    rtext: { l: 'Edit Rung', i: 'text', run: () => rungText(curSelRung()), on: () => editable() && curSelRung() != null },
    comment: { l: 'Edit Rung Comment', i: 'text', run: () => rungComment(curSelRung()), on: () => editable() && curSelRung() != null },
    desc: { l: 'Edit Main Operand Description', k: 'Ctrl+D', i: 'tag', run: editDesc, on: () => isTagText(selOperand()) },
    sdef: { l: 'Save Instruction Defaults', i: 'save', run: () => {}, on: () => false },
    cdef: { l: 'Clear Instruction Defaults', i: 'close', run: () => {}, on: () => false },
    rimp: { l: 'Import Rungs…', i: 'upload', run: () => importRungs(), on: editable },
    rexp: { l: 'Export Rungs…', i: 'download', run: () => exportRungs(curSelRung()), on: () => curSelRung() != null },
    rstart: { l: 'Start Pending Rung Edits', k: 'Ctrl+Shift+S', i: 'edit', run: () => startRungEdit(curSelRung()), on: () => S.online && !!ctl.M && editable() && curSelRung() != null && !!rungs()[curSelRung()] && !rungs()[curSelRung()].z },
    raccept: { l: 'Accept Pending Rung Edits', i: 'check', run: acceptEdits, on: () => edPhase() === 'pending' },
    rcancel: { l: 'Cancel Pending Rung Edits', i: 'undo', run: () => cancelRungEdit(curSelRung()), on: () => edPhase() === 'pending' },
    rasm: { l: 'Assemble Rung Edit', i: 'check', run: assembleEdits, on: () => edPhase() === 'tested' },
    rcanc: { l: 'Cancel Rung Edit', i: 'undo', run: cancelAccepted, on: () => edPhase() === 'accepted' },
    verifyrung: { l: 'Verify Rung', i: 'checkr', run: () => verifyRung(curSelRung()), on: () => curSelRung() != null },
    newtag: { l: 'New Tag…', k: 'Ctrl+W', i: 'newtag', run: () => { const e = curEl(); newTag({ name: e && e.a[0] && e.a[0] !== '?' && !tagFor(e.a[0]) ? e.a[0] : '', kind: e ? (INSTR[e.t] || {}).args[0] : 'bit' }); } },
    // File > New Component (reference order); Program and Task are listed but not in this version yet
    newrtn: { l: 'New Routine…', i: 'ladder', run: () => newRoutine(orgProg()), on: editable },
    newprog: { l: 'New Program…', i: 'tree', run: () => {}, on: () => false },
    newtask: { l: 'New Task…', i: 'tree', run: () => {}, on: () => false },
    newdt: { l: 'New Data Type…', i: 'tags', run: () => dataTypeEditor(), on: editable },
    newstr: { l: 'New String Type…', i: 'text', run: () => stringTypeEditor(), on: editable },
    newtrend: { l: 'New Trend…', i: 'xref', run: () => trendDialog(), on: () => !S.noProj },
    // File > Import Component (help v37 File menu): Add-On Instructions, Data Type, Equipment Phase, Program, Routine,
    // String Type, Trend; this app has data types, programs and routines
    impaoi: { l: 'Add-On Instructions…', i: 'upload', run: () => {}, on: () => false },
    impdt: { l: 'Data Type…', i: 'upload', run: () => importComponent('DataType'), on: () => editable() && offline() },
    impep: { l: 'Equipment Phase…', i: 'upload', run: () => {}, on: () => false },
    impprog: { l: 'Program…', i: 'upload', run: () => importComponent('Program'), on: () => editable() && offline() },
    imprtn: { l: 'Routine…', i: 'upload', run: () => importComponent('Routine'), on: () => editable() && offline() },
    impstr: { l: 'String Type…', i: 'upload', run: () => {}, on: () => false },
    imptrend: { l: 'Trend…', i: 'upload', run: () => {}, on: () => false },
    impcomp: { l: 'Import Component…', i: 'upload', run: () => importCompMenu(), on: () => editable() && offline() },
    toggle: { l: 'Toggle Bit', k: 'Ctrl+T', i: 'toggle', run: toggleSel, on: () => S.online && selIsBool() },
    fon: { l: 'Force On', i: 'force', run: () => forceSel(1), on: selForceable },
    foff: { l: 'Force Off', i: 'force', run: () => forceSel(0), on: selForceable },
    frem: { l: 'Remove Force', i: 'close', run: () => forceSel(null), on: () => selForceable() && ctl.forced(curEl().a[0], S.prog) !== null },
    find: { l: 'Find…', k: 'Ctrl+F', i: 'search', run: cmdFind },
    replace: { l: 'Replace…', k: 'Ctrl+H', i: 'edit', run: cmdReplace, on: () => !S.noProj },
    findnext: { l: 'Find Next', k: 'F3', i: 'search', run: () => findNext(true), on: () => !!S.find },
    findprev: { l: 'Find Previous', k: 'Shift+F3', i: 'search', run: () => findNext(true, -1), on: () => !!S.find },
    nextres: { l: 'Next Result', k: 'F4', i: 'down', run: () => nextResult(1), on: () => !S.noProj },
    prevres: { l: 'Previous Result', k: 'Shift+F4', i: 'up', run: () => nextResult(-1), on: () => !S.noProj },
    goto: { l: 'Go To…', k: 'Ctrl+G', i: 'goto', run: cmdGoto },
    browse: { l: 'Browse Logic…', i: 'tree', run: () => browseLogic() },
    xref: { l: 'Cross Reference', k: 'Ctrl+E', i: 'xref', run: () => xref() },
    verifyr: { l: 'Verify Routine', i: 'checkr', run: () => verifyCmd(true) },
    verifyc: { l: 'Verify Controller', i: 'check', run: () => verifyCmd(false) },
    accept: { l: 'Accept Pending Edits', i: 'check', run: acceptEdits, on: () => edPhase() === 'pending' },
    cancele: { l: 'Cancel Pending Edits', i: 'undo', run: cancelEdits, on: () => edPhase() === 'pending' },
    tested: { l: 'Test Accepted Edits', i: 'play', run: testEdits, on: () => edPhase() === 'accepted' },
    cancelacc: { l: 'Cancel Accepted Edits', i: 'undo', run: cancelAccepted, on: () => edPhase() === 'accepted' },
    untest: { l: 'Untest Accepted Edits', i: 'undo', run: untestEdits, on: () => edPhase() === 'tested' },
    assemble: { l: 'Assemble Accepted Edits', i: 'check', run: assembleEdits, on: () => edPhase() === 'tested' },
    tagsmon: { l: 'Monitor Tags', i: 'tags', run: () => tagEditor('mon') },
    tagsedit: { l: 'Edit Tags', i: 'tags', run: () => tagEditor('edit') },
    who: { l: 'Who Active', i: 'search', run: () => whoActive() },
    recentpath: { l: 'Select Recent Path…', i: 'net', run: recentPathDlg, on: () => !S.noProj && (S.prefs.paths || []).length > 0 },
    newmod: { l: 'New Module…', i: 'io', run: () => newModule(), on: () => offline() },
    ctlprops: { l: 'Controller Properties…', i: 'gear', run: () => controllerProps() },
    props: { l: 'Properties', i: 'gear', run: propsCmd, on: () => !S.noProj },
    drivers: { l: 'Configure Drivers…', i: 'online', run: () => rslinx('drivers') },
    rswho: { l: 'RSWho (RSLinx Classic)', i: 'net', run: () => rslinx('rswho') },
    setup: { l: 'Setup Wizard…', i: 'gear', run: () => setupWizard(0) },
    chassis: { l: 'Emulator', i: 'rack', run: () => chassisMonitor() },
    online: { l: 'Go Online', i: 'online', run: goOnline, on: () => !S.online },
    offline: { l: 'Go Offline', i: 'online', run: goOffline, on: () => S.online },
    download: { l: 'Download…', i: 'download', run: () => download() },
    upload: { l: 'Upload…', i: 'upload', run: () => upload(), on: () => !!ctl.M },
    prog: { l: 'Program Mode', i: 'stop', run: () => setMode('remprog'), on: () => S.online && ctl.key === 'REM' && ctl.mode !== 'remprog' && !ctl.fault },
    runm: { l: 'Run Mode', i: 'play', run: () => setMode('remrun'), on: () => S.online && ctl.key === 'REM' && ctl.mode !== 'remrun' && !ctl.fault },
    testm: { l: 'Test Mode', i: 'play', run: () => setMode('remtest'), on: () => S.online && ctl.key === 'REM' && ctl.mode !== 'remtest' && !ctl.fault },
    // reference: the Major Faults tab of Controller Properties; on only while the controller has a major fault
    gofaults: { l: 'Go To Faults', i: 'fault', run: () => controllerProps('maj'), on: () => S.online && !!ctl.fault },
    clear: { l: 'Clear Faults', i: 'fault', run: () => { ctl.clearFault(); live(true); }, on: () => S.online && !!ctl.fault },
    fen: { l: 'Enable All I/O Forces', i: 'force', run: () => { ctl.enableForces(true); live(true); }, on: () => S.online && ctl.forceState() === 'disabled' },
    fdis: { l: 'Disable All I/O Forces', i: 'force', run: () => { ctl.enableForces(false); live(true); }, on: () => S.online && ctl.forceState() === 'enabled' },
    fall: { l: 'Remove All I/O Forces', i: 'close', run: () => { ctl.removeForces(); live(true); }, on: () => S.online && ctl.forceState() !== 'none' },
    vorg: { l: 'Controller Organizer', i: 'tree', run: () => { S.prefs.org = !S.prefs.org; S.drawer = !S.drawer; savePrefs(); render(); }, ck: () => S.prefs.org },
    verr: { l: 'Errors', i: 'warn', run: () => { if (S.layout === 'desktop') { S.prefs.err = !S.prefs.err; savePrefs(); } else S.errOpen = !S.errOpen; render(); }, ck: () => S.prefs.err },
    vio: { l: 'Emulator Panel', i: 'rack', run: () => { if (S.layout === 'phone' && innerWidth <= innerHeight) { S.area = 'ladder'; S.phoneEmu = !S.phoneEmu; } else { S.prefs.emu = !S.prefs.emu; savePrefs(); } render(); }, ck: () => S.prefs.emu },
    vwatch: { l: 'Watch', i: 'tags', run: () => showWatch(), on: () => !S.noProj, ck: () => S.outTab === 'watch' && (S.layout !== 'desktop' || S.prefs.err) },
    vcols: { l: 'Toggle Column…', i: 'tags', run: () => colMenu($('#tagpage .tagtbl thead') || $('#tagpage'), null), on: () => !S.noProj && S.view === 'tags' && !!$('#tagpage .tagtbl') },
    zin: { l: 'Zoom In', i: 'zin', run: () => zoom(1.12) },
    zout: { l: 'Zoom Out', i: 'zout', run: () => zoom(1 / 1.12) },
    options: { l: 'Options…', i: 'gear', run: options },
    updates: { l: 'Updates…', i: 'download', run: () => window.MTPSUpdater && window.MTPSUpdater.dialog() },
    helpc: { l: 'Contents', i: 'help', run: () => helpContents() },
    help: { l: 'Instruction Help', k: 'F1', i: 'help', run: () => instrHelp() },
    tips: { l: 'Getting Started', i: 'info', run: () => tipsDlg() },
    about: { l: 'About MT PLC Studio', i: 'info', run: about },
  };
  const MENUS = [
    ['File', ['new', 'setup', '-', 'open', 'close', 'save', 'saveas', '-', { hd: 'New Component' }, 'newdt', 'newmod', 'newprog', 'newrtn', 'newtag', 'newtask', 'newtrend', '-', { hd: 'Import Component' }, 'impaoi', 'impdt', 'impep', 'impprog', 'imprtn', 'impstr', 'imptrend', '-', 'import', 'export', '-', 'recent', 'exit']],
    ['Edit', ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'del', '-', 'ins', 'rung', 'branch', 'level', '-', 'edit', 'rtext', 'comment', 'desc', '-', 'props', 'ctlprops', '-', 'selall']],
    ['View', ['vorg', 'verr', 'vwatch', 'vio', '-', 'vcols', '-', 'zin', 'zout']],
    ['Search', ['find', 'replace', 'goto', 'browse', 'xref', '-', 'findnext', 'findprev', 'nextres', 'prevres', '-', { hd: 'Bookmarks' }, 'bmtog', 'bmnext', 'bmprev', 'bmall', 'bmclear']],
    ['Logic', ['verifyr', 'verifyc', '-', 'accept', 'cancele', 'tested', 'cancelacc', 'untest', 'assemble', '-', 'tagsmon', 'tagsedit', 'newtag', '-', 'newmod']],
    ['Communications', ['rswho', 'drivers', 'who', 'recentpath', 'chassis', '-', 'online', 'offline', 'upload', 'download', '-', 'prog', 'runm', 'testm', 'clear', 'gofaults', '-', 'uptags', '-', 'fen', 'fdis', 'fall']],
    ['Tools', ['options', 'updates']],
    ['Help', ['helpc', 'help', 'tips', 'about']],
  ];
  const can = id => { const c = C[id]; return c && (!c.on || c.on()); };
  const ONLINE_ONLY = ['toggle', 'fon', 'foff', 'frem', 'prog', 'runm', 'clear', 'fen', 'fdis', 'fall'];
  function run(id) {
    const c = C[id];
    if (!c) return;
    if (can(id)) { c.run(); return; }
    if (!S.online && ONLINE_ONLY.includes(id)) toast(`${c.l} works online: press Go Online first.`);
  }
  /* menu rows made when the menu opens: the recent projects of File (up to eight, as the reference's Recent Projects) */
  const DYN = {
    recent: () => { const f = S.prefs.files || []; return f.length ? [{ hd: 'Recent Projects' }, ...f.slice(0, 8).map((p, n) => ({ l: `${n + 1} ${baseName(p)}`, i: 'file', run: () => saveChanges(() => loadFile(p)) })), '-'] : []; },
  };
  const menuItems = ids => ids.flatMap(id => (DYN[id] ? DYN[id]() : [id])).filter(id => typeof id === 'object' || id === '-' || !C[id].show || C[id].show()).map(id => (id === '-' || typeof id === 'object' ? id : { id, l: C[id].l, k: S.layout === 'desktop' ? C[id].k : '', i: C[id].i, dis: !can(id), ck: C[id].ck ? C[id].ck() : undefined }));

  /* ---------- render ---------- */
  /* the workspace tabs: routines as "program/routine", and "tags"; S.view is the active kind */
  function syncTabs() {
    const ok = k => { if (k === 'tags') return true; const [g, r] = k.split('/'); const P = allProgs().find(x => x.name === g); return !!P && P.routines.some(x => x.name === r); };
    S.tabs = S.tabs.filter(ok);
    const cur = S.prog + '/' + S.routine;
    if (S.view === 'ladder' && !S.tabs.includes(cur)) S.tabs.push(cur);
    if (S.view === 'tags' && !S.tabs.includes('tags')) S.tabs.push('tags');
  }
  function tabTitle(k) { if (k === 'tags') return (S.tagScope ? S.tagScope : 'Controller') + ' Tags'; const [g, r] = k.split('/'); return g + ' - ' + r; }
  function rtabsHTML() {
    if (S.noProj) return '';
    const act = S.view === 'tags' ? 'tags' : S.view === 'ladder' ? S.prog + '/' + S.routine : '';
    return S.tabs.map(k => `<span class="t${k === act ? ' on' : ''}" data-tabk="${esc(k)}">${ic(k === 'tags' ? 'tags' : 'ladder', 'i ti')}<span class="ell">${esc(tabTitle(k))}</span><button class="tx" data-tabx="${esc(k)}" title="Close" aria-label="Close ${esc(tabTitle(k))}">${ic('close')}</button></span>`).join('');
  }
  function openTab(k) {
    if (k === 'tags') S.view = 'tags';
    else { const [g, r] = k.split('/'); S.prog = g; S.routine = r; S.view = 'ladder'; S.sel = null; S.selRung = 0; reverify(); }
    render();
  }
  function closeTab(k) {
    const i = S.tabs.indexOf(k); if (i < 0) return;
    const act = S.view === 'tags' ? 'tags' : S.prog + '/' + S.routine;
    S.tabs.splice(i, 1);
    if (k === act || (S.view === 'none')) {
      const nx = S.tabs[Math.min(i, S.tabs.length - 1)];
      if (nx) { openTab(nx); return; }
      S.view = 'none';
    }
    render();
  }
  const emptyWs = () => (S.noProj ? startPage() : '<div class="emptyws"><p><b>No routine open.</b></p><p class="help">Double-click (or tap) a routine in the Controller Organizer to open it here.</p></div>');
  /* the start page while no project is open: New Project, Open Project, the files opened lately (paths only) */
  function startPage() {
    const rec = (S.prefs.files || []).slice(0, 8);
    return `<div class="startpg"><div class="sph"><b>MT PLC Studio</b><span class="muted">v${VERSION}</span></div>
      <div class="spb"><button class="spc" data-cmd="new">${ic('file')}<span><b>New Project</b><small>Pick the controller, the chassis and the I/O, then save it as a .mtp file</small></span></button>
      <button class="spc" data-cmd="open">${ic('open')}<span><b>Open Project</b><small>Open a .mtp or .L5X file from this device's storage</small></span></button></div>
      ${rec.length ? `<div class="grp">Recent projects</div>${rec.map(p => `<div class="row" data-recent="${esc(p)}">${ic('file')}<span class="grow ell"><b>${esc(baseName(p))}</b><small class="muted"> ${esc(p)}</small></span></div>`).join('')}` : ''}
      <p class="help">Projects are not kept inside the app: save your work with Save or Save As.</p></div>`;
  }
  function render() {
    if (!S.p) return;
    syncTabs();
    const lay = pickLayout();
    if (lay !== S.layout) { S.layout = lay; closeLayer(); }
    const app = $('#app');
    const lw = $('#ladwrap'), st = lw ? [lw.scrollTop, lw.scrollLeft] : null;
    const dt = document.activeElement && document.activeElement.id === 'desctx' ? document.activeElement : null, dsel = dt && [dt.selectionStart, dt.selectionEnd];
    if (dt && S.descEd) S.descEd.value = dt.value;
    // on <body> too, so menus, sheets and dialogs (in #layer, outside #app) take the layout's sizes
    const dens = S.prefs.density === 'compact' ? ' dense' : S.prefs.density === 'touch' ? ' roomy' : '';
    const cls = (lay === 'desktop' ? 'desk' : lay === 'tablet' ? 'tab' : 'phone') + (innerHeight > innerWidth ? ' port' : ' land') + dens;
    if (app.className !== cls) app.className = cls;
    if (document.body.className !== cls) document.body.className = cls;
    const html = (upInfo ? upbar() : '') + (pending() ? editbar() : '') + (lay === 'desktop' ? desktop() : lay === 'tablet' ? tablet() : phone());
    // the ladder stays in place when the new frame has it too: the rest of the screen is brought up to date around it
    // and the ladder gets only its changes (a tap in a 200-rung routine does not rebuild and lay out the whole SVG)
    let kept = false;
    if (lw && app.contains(lw)) { const tpl = document.createElement('div'); tpl.innerHTML = html; kept = !!tpl.querySelector('#ladwrap') && morph(app, tpl, lw); }
    if (!kept) app.innerHTML = html;
    const nl = $('#ladwrap');
    if (nl) { renderLadder(); if (st && !kept) { nl.scrollTop = st[0]; nl.scrollLeft = st[1]; } watchLadder(nl); }
    if (dsel) { const ntx = $('#desctx'); if (ntx) { ntx.focus(); ntx.setSelectionRange(dsel[0], dsel[1]); } }
    title();
  }
  /* bring the live element a up to the parsed element b: a node that differs is replaced by the new one, except the
     ladder (lw) and the elements around it, which keep their place and take the new attributes. false: the two do not
     line up (then the caller writes the whole frame). */
  function morph(a, b, lw) {
    const ac = [...a.childNodes], bc = [...b.childNodes];
    if (ac.length !== bc.length) return false;
    for (let i = 0; i < ac.length; i++) {
      const x = ac[i], y = bc[i];
      if (x.nodeType === 1 && (x === lw || x.contains(lw))) {
        if (y.nodeType !== 1 || y.tagName !== x.tagName || (x === lw) !== (y.id === 'ladwrap')) return false;
        for (const at of [...x.attributes]) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
        for (const at of [...y.attributes]) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
        if (x !== lw && !morph(x, y, lw)) return false;
      } else if (!x.isEqualNode(y)) x.replaceWith(y);
    }
    return true;
  }
  const modeText = () => (!S.online ? 'Offline' : ctl.fault ? 'Faulted' : { prog: 'Program', run: 'Run', remprog: 'Rem Prog', remrun: 'Rem Run', remtest: 'Rem Test' }[ctl.mode]);
  const modeCls = () => (!S.online ? '' : ctl.fault ? ' fault' : ctl.mode === 'run' || ctl.mode === 'remrun' ? ' run' : '');
  const modeBox = () => `<span class="sbox${modeCls()}" data-box="mode" title="Controller mode">${modeText()}${ic('down')}</span>`;
  function forcesBox() {
    const st = S.online ? ctl.forceState() : 'none';
    // installed and enabled: the yellow triangle with a red border (as the reference's online bar); the text stays
    const tri = '<svg class="ftri" viewBox="0 0 15 14" aria-hidden="true"><path d="M7.5 1 14 13H1z" fill="#F2C400" stroke="#D0271D" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.5 5v4M7.5 10.6v.9" stroke="#1A1300" stroke-width="1.5"/></svg>';
    return `<span class="sbox" data-box="forces" title="${st === 'enabled' ? 'I/O forces installed and enabled' : st === 'disabled' ? 'I/O forces installed, disabled' : 'I/O forces'}" style="font-weight:400">${st === 'enabled' ? tri : `<i class="fi${st === 'disabled' ? ' dis' : ''}"></i>`}${st === 'none' ? 'No Forces' : st === 'enabled' ? 'Forces' : 'Forces Disabled'}${ic('down')}</span>`;
  }
  const EDTXT = { pending: 'Edits Present', accepted: 'Accepted Edits', tested: 'Testing Edits' };
  const editsBox = () => { const ph = edPhase(); return `<span class="sbox plain${ph ? ' edits' : ''}" title="Online edits">${ph ? EDTXT[ph] : 'No Edits'}</span>`; };
  function editbar() {
    const ph = edPhase(), b = (id, pri) => `<button class="btn${pri ? ' pri' : ''}" data-cmd="${id}">${C[id].l}</button>`;
    if (ph === 'accepted') return `<div class="upbar editbar">${ic('edit')}<span class="grow"><b>Accepted edits (I, R, D).</b> The controller still runs the old logic (R, D). Test them to run the new logic (I).</span>${b('tested', true)}${b('cancelacc')}</div>`;
    if (ph === 'tested') return `<div class="upbar editbar">${ic('edit')}<span class="grow"><b>Testing edits (I).</b> The controller runs the new logic (I), not R or D. Assemble to keep it, or Untest to go back.</span>${b('assemble', true)}${b('untest')}</div>`;
    return `<div class="upbar editbar">${ic('edit')}<span class="grow"><b>Pending edits (i, e).</b> ${ctl.running ? 'The controller keeps the old logic: accept, then test the edits.' : 'Accept them to send them to the controller.'}</span>${b('accept', true)}${b('cancele')}</div>`;
  }
  function ledsHTML() {
    const on = S.online, run = on && (ctl.mode === 'run' || ctl.mode === 'remrun') && !ctl.fault;
    // the four indicators of the reference's online bar: Run Mode, Controller OK, Energy Storage OK, I/O OK
    const L4 = on ? [[run ? 'g' : '', 'Run Mode'], [ctl.fault ? 'r blink' : 'g', ctl.fault ? 'Major Fault' : 'Controller OK'], ['g', 'Energy Storage OK'], ctl.ioOk() ? ['g', 'I/O OK'] : ['r blink', 'I/O Not Responding']] : [['', 'Run Mode'], ['', 'Controller OK'], ['', 'Energy Storage OK'], ['', 'I/O OK']];
    return L4.map(([c, t]) => `<div><i class="led ${c}"></i>${t}</div>`).join('');
  }
  const keyHTML = () => `<span class="key" title="Key switch">${['PROG', 'REM', 'RUN'].map(k => `<span data-key="${k}" class="${ctl.key === k ? 'on' : ''}">${k}</span>`).join('')}</span>`;
  const gbtns = tab => TABS[tab].map(m => `<button class="gbtn" data-mn="${m}" title="${esc(NAME(m))}"${editable() ? '' : ' disabled'}>${L.icon(m)}<span>${m === 'RUNG' ? 'Rung' : m === 'BR' ? 'Branch' : m === 'BRL' ? 'Level' : m}</span></button>`).join('');
  const itabs = () => Object.keys(TABS).map(t => `<span data-tab="${esc(t)}" class="${t === S.prefs.tab ? 'on' : ''}">${t}</span>`).join('');
  const tbtn = (id, n) => `<button class="ib" data-cmd="${id}" title="${esc(C[id].l + (C[id].k ? ' (' + C[id].k + ')' : ''))}"${can(id) ? '' : ' disabled'}>${ic(n || C[id].i)}</button>`;

  const tbtT = (id, t) => `<button class="tbt" data-cmd="${id}" title="${esc(C[id].l)}"${can(id) ? '' : ' disabled'}>${ic(C[id].i)}<span>${t}</span></button>`;
  function desktop() {
    const P = S.prefs, rc = rungs().length;
    return `<div class="dmenu">${MENUS.map(([n]) => `<span data-menu="${n}">${n}</span>`).join('')}</div>
      <div class="dtb">${tbtn('new')}${tbtn('open')}${tbtn('save')}<span class="vsep"></span>${tbtn('cut')}${tbtn('copy')}${tbtn('paste')}<span class="vsep"></span>${tbtn('undo')}${tbtn('redo')}
        <span class="vsep"></span>${tbtn('find')}${tbtn('xref')}<span class="vsep"></span>${tbtn('verifyc')}${tbtn('verifyr')}<span class="vsep"></span>${tbtn('tagsmon')}<button class="ib${S.prefs.emu ? ' on' : ''}" data-cmd="vio" title="Emulator panel">${ic('rack')}</button>
        <span class="grow"></span>${tbtT('rswho', 'RSLinx')}${tbtT('who', 'Who Active')}<span class="pathbar" title="Communications path of the project"><span class="muted">Path:</span><span class="mono pv">${esc(curPath())}</span>${commHTML(true)}</span>${S.online ? tbtT('offline', 'Go Offline') : tbtT('online', 'Go Online')}${tbtT('download', 'Download')}${tbtT('upload', 'Upload')}</div>
      <div class="dbar2"><div class="donline" id="olbar">${onlineBarHTML()}</div>
        <div class="dinstr"><div class="glyphs">${gbtns(S.prefs.tab)}</div><div class="itabs">${itabs()}</div></div></div>
      <div class="dmain">${P.org ? `<aside class="org"><div class="ph">Controller Organizer</div><div class="tree">${treeHTML()}</div>${quickViewHTML()}</aside>` : ''}
        <section class="ed"><div class="rtabs">${rtabsHTML()}</div>
          ${S.view === 'ladder' ? `<div class="rtb">${tbtn('zout')}${tbtn('zin')}<span class="vsep"></span>${tbtn('rtext')}${tbtn('comment')}<span class="vsep"></span>${tbtn('rung')}${tbtn('del')}<span class="vsep"></span>${tbtn('bmprev')}${tbtn('bmnext')}${tbtn('bmtog')}${tbtn('bmall')}</div>
          ${descBarHTML()}<div class="ladwrap" id="ladwrap" tabindex="0"></div>` : S.view === 'tags' ? tagWsHTML() : emptyWs()}${P.emu && dockSide() === 'bottom' ? dockHTML('bottom') : ''}</section>${P.emu && dockSide() === 'side' ? dockHTML('side') : ''}</div>
      ${P.err ? `<div class="derr"><div class="ph">Errors<span class="grow"></span><button class="ib" data-cmd="verr" title="Close">${ic('close')}</button></div>${errorsHTML()}</div>` : ''}
      <div class="dstatus"><span id="stmsg">${esc(S.msg || 'Ready')}</span><span>${S.online ? 'Online: ' + modeText() : 'Offline'}</span><span>Rung ${curSelRung() == null ? '-' : curSelRung()} of ${rc}</span><span>v${VERSION}</span></div>`;
  }
  const onlineBarHTML = () => `<div class="leds">${ledsHTML()}</div>${keyHTML()}<div class="boxes">${modeBox()}${forcesBox()}${editsBox()}</div>`;

  function tablet() {
    const land = innerWidth >= 1024 && innerWidth > innerHeight, pinned = land && S.prefs.org, port = innerWidth <= innerHeight;
    const e = curEl();
    const orgAside = c => `<aside class="org${c}"><div class="ph">Controller Organizer<span class="grow"></span><button class="ib" data-orgprops="1" title="Controller Properties">${ic('gear')}</button><button class="ib" data-drawer="0">${ic(pinned ? 'moreh' : 'close')}</button></div><div class="tree">${treeHTML()}</div>${quickViewHTML()}</aside>`;
    return `<div class="appbar"><button class="ib" data-allmenu="1" title="Menu">${ic('menu')}</button><span class="proj">${S.noProj ? 'MT PLC Studio<small>No project open</small>' : `${esc(S.p.controller.name)}<small>${esc(ctlLabel(S.p))}</small>`}</span>
<span class="grow"></span>
        ${land ? tbtn('undo') + tbtn('redo') + tbtn('verifyc') : ''}<button class="ib${S.prefs.emu ? ' on' : ''}" data-cmd="vio" title="Emulator panel">${ic('rack')}</button>
        <span class="vsep"></span><button class="btn" data-cmd="rswho" title="RSLinx Classic: RSWho and Configure Drivers">${ic('net')}RSLinx</button><button class="btn" data-cmd="who">${ic('search')}Who Active</button>${land ? `<button class="btn" data-cmd="download">${ic('download')}Download</button><button class="btn" data-cmd="upload"${can('upload') ? '' : ' disabled'}>${ic('upload')}Upload</button>` : ''}
        ${commHTML(land)}${S.online ? `<button class="btn danger" data-cmd="offline">${ic('online')}${land ? 'Go Offline' : 'Offline'}</button>` : `<button class="btn pri" data-cmd="online">${ic('online')}${land ? 'Go Online' : 'Online'}</button>`}</div>
      <div class="tstat" id="olbar">${tabStatHTML()}</div>
      <div class="tbody">${pinned ? orgAside('') : ''}
        <section class="ed"><div class="rtabs">${pinned ? '' : `<button class="ib" data-drawer="1" title="Controller Organizer">${ic('tree')}</button>`}<span class="tabsx">${rtabsHTML()}</span><span class="grow"></span>${S.view === 'ladder' ? tbtn('zout') + tbtn('zin') : ''}<button class="ib" data-more="ladder" title="More">${ic('more')}</button></div>
          ${port && S.view === 'ladder' ? `<div class="ibar top"><div class="glyphs one">${gbtns('Favorites')}<button class="gbtn more" data-cmd="ins" title="All instructions">${ic('plus')}<span>All…</span></button></div></div>` : ''}
          <div class="edmain">${!pinned && S.drawer ? orgAside(' over') : ''}${S.view === 'ladder' ? `${descBarHTML()}<div class="ladwrap" id="ladwrap" tabindex="0"></div>
          ${selbarHTML(e)}` : S.view === 'tags' ? tagWsHTML() : emptyWs()}</div>
          ${S.prefs.emu && dockSide(port) === 'bottom' ? dockHTML('bottom') : ''}
          ${port ? msgPane() : `<div class="ibar">${land ? `<div class="glyphs">${gbtns(S.prefs.tab)}</div><div class="itabs">${itabs()}${errHandle()}</div>` : `<div class="glyphs one">${gbtns('Favorites')}<button class="gbtn more" data-cmd="ins" title="All instructions">${ic('plus')}<span>All…</span></button></div>${errHandle()}`}</div>`}</section>
        ${S.prefs.emu && dockSide(port) === 'side' ? dockHTML('side') : ''}</div>`;
  }
  const tabStatHTML = () => `${keyHTML()}${modeBox()}${forcesBox()}${editsBox()}<span class="pathbar" title="Communications path of the project"><span class="muted">Path:</span><span class="mono pv">${esc(curPath())}</span></span>`;
  /* the Errors pane of a portrait tablet: errors, warnings and messages at the bottom of the window, as in the reference */
  function msgPane() {
    const v = S.verifyShown || S.verify || { errors: [], warnings: [], lines: [] }, n = v.errors.length, w = v.warnings.length;
    const last = v.lines.length ? v.lines[v.lines.length - 1] : 'Ready';
    return `<div class="msgp${S.errOpen ? ' open' : ''}"><div class="msgh" data-msgt="1">${ic(S.errOpen ? 'down' : 'up')}<b>Errors</b><span class="cnt${n ? ' e' : ''}">${ic('fault')}${n}</span><span class="cnt${w ? ' w' : ''}">${ic('warn')}${w}</span><span class="ell grow muted">${esc(last)}</span><button class="btn" data-cmd="verifyc">${ic('check')}Verify</button></div>${S.errOpen ? `<div class="msgb">${errorsHTML()}</div>` : ''}</div>`;
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
    if (a === 'ladder' && S.noProj) body = `<div class="page" style="display:flex;flex-direction:column">${startPage()}</div>`;
    else if (a === 'ladder') {
      const pland = innerWidth > innerHeight, emuTab = !pland && S.phoneEmu;
      const tabs = pland ? '' : `<div class="ptabs"><button class="${emuTab ? '' : 'on'}" data-ptab="0">Ladder</button><button class="${emuTab ? 'on' : ''}" data-ptab="1">Emulator${S.online && ctl.running ? ' ●' : ''}</button></div>`;
      if (emuTab) { body = tabs + dockHTML('full'); }
      else body = tabs + `<div class="pbar"><span class="rt grow" data-routines="1"><span class="tt">${esc(curRoutine().name)}<small>${esc(curProg().name)}</small></span>${ic('down')}</span>${tbtn('undo')}${tbtn('find')}<button class="ib" data-more="ladder">${ic('more')}</button></div>
        <div style="position:relative;flex:1;display:flex;flex-direction:column;min-height:0">${descBarHTML()}<div class="ladwrap" id="ladwrap" tabindex="0"></div><button class="fab" data-cmd="ins" title="Add instruction"${editable() ? '' : ' disabled'}>${ic('plus')}</button></div>${selbarHTML(curEl())}`;
      if (pland && S.prefs.emu && !emuTab) body = `<div class="pland"><div class="pleft">${body}</div>${dockHTML('side')}</div>`;
    } else if (a === 'tags') body = `<div class="pbar"><span class="rt grow"><span class="tt">Tags<small>${esc(S.p.controller.name)}</small></span></span><button class="ib" data-cmd="newtag">${ic('plus')}</button></div><div class="page" id="tagpage" style="background:var(--surface);display:flex;flex-direction:column">${tagEditorBody(true)}</div>`;
    else if (a === 'controller') body = `<div class="pbar"><span class="rt grow"><span class="tt">Controller<small>PLC-CPU 1.0 · ${esc(ctl.name || 'empty')}</small></span></span></div><div class="page" id="ctlpage">${controllerPage()}</div>`;
    else if (a === 'project') body = `<div class="pbar"><span class="rt grow"><span class="tt">Project<small>${esc(S.p.controller.name)}</small></span></span><button class="ib" data-cmd="open" title="Open">${ic('open')}</button><button class="ib" data-cmd="new" title="New">${ic('file')}</button></div><div class="page" style="background:var(--surface)"><div class="tree">${treeHTML()}</div>${quickViewHTML()}</div>`;
    else body = `<div class="pbar"><span class="rt grow"><span class="tt">More<small>MT PLC Studio v${VERSION}</small></span></span></div><div class="page">${morePage()}</div>`;
    const nav = [['ladder', 'Ladder', 'ladder'], ['tags', 'Tags', 'tag'], ['controller', 'Controller', 'chip'], ['project', 'Project', 'tree'], ['more', 'More', 'moreh']]
      .map(([k, n, i]) => `<button class="${a === k ? 'on' : ''}" data-go="${k}"><span class="pill">${ic(i)}</span>${n}${k === 'more' && nErr ? `<span class="bd">${nErr}</span>` : ''}</button>`).join('');
    return `<div class="strip"><span id="olbar" style="display:contents">${modeBox()}${forcesBox()}${editsBox()}${nErr ? `<span class="warn" data-go="more">${ic('warn')}${nErr}</span>` : ''}</span><span class="grow"></span>${commHTML(false)}<button class="btn whob" data-cmd="who" title="Who Active" aria-label="Who Active">${ic('search')}<span>Who Active</span></button></div>${body}<nav class="pnav">${nav}</nav>`;
  }
  function controllerPage() {
    const on = S.online;
    return `<div class="card"><div class="ch">Status</div><div class="cb"><div class="leds4">${ledsHTML()}</div>
        <div class="muted" style="margin:14px 0 6px">Key switch</div><span class="seg" style="display:flex">${['PROG', 'REM', 'RUN'].map(k => `<span data-key="${k}" class="${ctl.key === k ? 'on' : ''}">${k}</span>`).join('')}</span>
        <div style="margin-top:8px"><div class="kv"><span>Mode</span><span class="v">${modeText()}</span></div><div class="kv"><span>Controller holds</span><span class="v">${esc(ctl.name || '(no project)')}</span></div><div class="kv"><span>Path</span><span class="v">${esc(curPath())}</span></div></div>
        <div class="brow"><button class="btn" data-cmd="who">${ic('search')}Who Active</button><button class="btn" data-cmd="rswho">${ic('net')}RSLinx</button><button class="btn" data-cmd="chassis">${ic('rack')}Emulator</button></div>
        <div class="brow">${on ? `<button class="btn danger" data-cmd="offline">${ic('online')}Go Offline</button>` : `<button class="btn pri" data-cmd="online">${ic('online')}Go Online</button>`}<button class="btn" data-cmd="upload"${can('upload') ? '' : ' disabled'}>${ic('upload')}Upload</button><button class="btn" data-cmd="download">${ic('download')}Download</button></div>
        <div class="brow"><button class="btn" data-cmd="prog"${can('prog') ? '' : ' disabled'}>${ic('stop')}Program</button><button class="btn" data-cmd="runm"${can('runm') ? '' : ' disabled'}>${ic('play')}Run</button>${ctl.fault ? `<button class="btn danger" data-cmd="clear">${ic('fault')}Clear Faults</button><button class="btn" data-cmd="gofaults">${ic('fault')}Go To Faults</button>` : ''}</div></div></div>
      <div class="card"><div class="ch">Forces<span class="grow"></span><span class="muted" style="font-weight:400">${S.online ? { none: 'No Forces', disabled: 'Forces disabled', enabled: 'Forces enabled' }[ctl.forceState()] : 'Offline'}</span></div><div class="cb">
        <div class="brow" style="margin-top:0"><button class="btn" data-cmd="fen"${can('fen') ? '' : ' disabled'}>Enable</button><button class="btn" data-cmd="fdis"${can('fdis') ? '' : ' disabled'}>Disable</button><button class="btn" data-cmd="fall"${can('fall') ? '' : ' disabled'}>Remove All</button></div></div></div>
`;
  }
  function morePage() {
    const b = (id, t) => `<div class="row" data-cmd="${id}">${ic(C[id].i)}<span class="grow">${t || C[id].l}</span>${ic('right')}</div>`;
    return `<div class="card"><div class="ch">Errors<span class="grow"></span><button class="btn" data-cmd="verifyc">${ic('check')}Verify</button></div>${errorsHTML()}</div>
      <div class="card">${b('find')}${b('replace')}${b('goto')}${b('browse')}${b('xref')}${b('tagsedit')}${b('newdt')}${b('newstr')}${b('newtrend')}</div>
      <div class="card">${b('save')}${b('saveas')}${b('import')}${b('export')}${b('impcomp')}${can('close') ? b('close', 'Close Project') : ''}</div>
      <div class="card">${b('options')}${b('updates')}${b('helpc')}${b('help')}${b('tips')}${b('about')}</div>`;
  }

  /* ---------- organizer tree ---------- */
  function treeHTML() {
    if (S.noProj) return '<div class="empty">No project open: New Project or Open Project.</div>';
    const col = new Set(S.prefs.collapsed);
    const N = (key, lvl, txt, icon, o = {}) => {
      const has = o.kids !== undefined, open = has && !col.has(key);
      return { html: `<div class="nd${o.on ? ' on' : ''}" data-org="${esc(key)}" style="padding-left:${4 + lvl * 16}px"><span class="tw" data-tw="${esc(key)}">${has ? ic(open ? 'down' : 'right') : ''}</span>${ic(icon, 'i ti')}<span class="ell">${esc(txt)}</span>${o.f ? `<span class="flt">${o.f}</span>` : ''}</div>`, open };
    };
    let h = '';
    const add = (key, lvl, txt, icon, o, kids) => { const n = N(key, lvl, txt, icon, { ...o, kids }); h += n.html; if (kids && n.open) kids(); };
    const progNode = (g, lvl) => add('prog:' + g.name, lvl, g.name, 'prog', {}, () => {
      add('ptags:' + g.name, lvl + 1, 'Program Tags', 'tag');
      g.routines.forEach(r => add('rt:' + g.name + '/' + r.name, lvl + 1, r.name + (r.name === g.main ? '' : ''), 'ladder', { on: g.name === S.prog && r.name === S.routine,
        f: S.verify && S.verify.errors.some(e => e.program === g.name && e.routine === r.name) ? '⊗' : '' }));
    });
    add('ctl', 0, 'Controller ' + S.p.controller.name, 'chip', { f: S.online && ctl.fault ? '⚠' : '' }, () => {
      add('ctags', 1, 'Controller Tags', 'tag');
      add('cfh', 1, HANDLERS.fault, 'folder', {}, () => { const g = handlerProg('fault'); if (g) progNode(g, 2); });
      add('puh', 1, HANDLERS.powerup, 'folder', {}, () => { const g = handlerProg('powerup'); if (g) progNode(g, 2); });
    });
    add('tasks', 0, 'Tasks', 'folder', {}, () => S.p.tasks.filter(t => !HANDLERS[t.type]).forEach(t => add('task:' + t.name, 1, t.name, 'task', {}, () => t.programs.forEach(g => progNode(g, 2)))));
    const dt = E.dataTypes(S.p);
    add('dts', 0, 'Data Types', 'folder', {}, () => {
      // a folder shows the expand icon only when it has content (v37 help: Controller Organizer); Add-On-Defined
      // holds the data types of the Add-On Instructions, so it is empty in this app
      const sub = (k, txt, list, pre) => add(k, 1, txt, 'type', {}, list.length ? () => list.forEach(n => add(pre + n, 2, n, 'type')) : undefined);
      sub('dt:user', 'User-Defined', dt.userDefined, 'dt:u:');
      sub('dt:str', 'Strings', dt.strings, 'dt:s:');
      sub('dt:aod', 'Add-On-Defined', dt.addOnDefined || [], 'dt:a:');
      add('dt:pre', 1, 'Predefined', 'type', {}, () => dt.predefined.forEach(n => add('dt:p:' + n, 2, n, 'type')));
      add('dt:mod', 1, 'Module-Defined', 'type', {}, () => dt.moduleDefined.forEach(n => add('dt:m:' + n, 2, n, 'type')));
    });
    const trs = Array.isArray(S.p.trends) ? S.p.trends : [];
    add('trends', 0, 'Trends', 'folder', {}, trs.length ? () => trs.forEach(t => add('trend:' + t.name, 1, t.name, 'xref')) : undefined);
    add('io', 0, 'I/O Configuration', 'folder', {}, () => add('bp', 1, `Backplane, PLC-RACK${S.p.rack.size}`, 'rack', {}, () => {
      add('mod:' + ctlSlot(), 2, `[${ctlSlot()}] ${ctype(S.p.controller.type)[0]} ${S.p.controller.name}`, 'chip');
      [...S.p.rack.modules].sort((a, b) => a.slot - b.slot).forEach(m => add('mod:' + m.slot, 2, `[${m.slot}] ${m.type} ${m.name}`, 'rack', { f: S.online && ctl.M && ctl.moduleStatus(m.slot).state === 'Faulted' ? '⚠' : m.inhibit ? 'inhibited' : '' }));
    }));
    return h;
  }

  /* ---------- errors pane ---------- */
  // the name of the operand an error line points at ("Operand 2" of a TON is its Accum), shown beside the line
  const errOp = t => { const m = /Rung \d+, (\w+), Operand (\d+)/.exec(t), n = m && (L.OPN[m[1]] || [])[+m[2]]; return n ? ` <span class="errop">${esc(n)}</span>` : ''; };
  /* the lines the Errors pane shows: the Errors / Warnings / Messages filters, then the Search box */
  function errLines() {
    const v = S.verifyShown || S.verify || { errors: [], warnings: [], lines: [] };
    const f = S.errFilter || { e: true, w: true, m: true }, q = U((S.errQ || '').trim());
    return v.lines.map(t => ({ t, k: /^Error/.test(t) ? 'e' : /^Warning/.test(t) ? 'w' : 'm' })).filter(x => f[x.k] && (!q || U(x.t).includes(q)))
      .map(x => { const m = /Rung (\d+)/.exec(x.t); return { ...x, ri: m ? +m[1] : null, rt: m ? lineRoutine(x.t, v) : '' }; });
  }
  const errLogHTML = () => errLines().map(x => `<div class="ln ${x.k}${S.errCur && S.errCur === x.t ? ' cur' : ''}"${x.ri != null ? ` data-errline="${x.ri}" data-errrt="${esc(x.rt)}"` : ''}>${esc(x.t)}${errOp(x.t)}</div>`).join('') || (S.errQ ? `<div class="ln m muted">No line contains "${esc(S.errQ)}".</div>` : '');
  function errorsHTML() {
    const tabs = `<div class="otabs"><button class="otab${S.outTab !== 'search' && S.outTab !== 'watch' ? ' on' : ''}" data-otab="err">Errors</button><button class="otab${S.outTab === 'search' ? ' on' : ''}" data-otab="search">Search Results</button><button class="otab${S.outTab === 'watch' ? ' on' : ''}" data-otab="watch">Watch</button></div>`;
    if (S.outTab === 'watch') return tabs + watchHTML();
    if (S.outTab === 'search') {
      const sv = S.search || { lines: [], found: [] };
      return `${tabs}<div class="log">${sv.lines.length ? sv.lines.map(t => { const m = /Rung (\d+)/.exec(t); return `<div class="ln m${t === S.searchCur ? ' cur' : ''}"${m && /^(Found|Replaced)/.test(t) ? ` data-errline="${m[1]}" data-errrt="${esc(lineRoutine(t, { errors: [], warnings: [], found: sv.found }))}"` : ''}>${esc(t)}</div>`; }).join('') : '<div class="ln m muted">No search results. Right-click a tag name and choose Find All.</div>'}</div>`;
    }
    return tabs + errorsBody();
  }
  function errorsBody() {
    const v = S.verifyShown || S.verify || { errors: [], warnings: [], lines: [] };
    const f = S.errFilter || { e: true, w: true, m: true }, hist = S.prefs.errHist || [];
    return `<div class="chips"><span class="chip${f.e ? ' on' : ''}" data-ef="e">${ic('fault')}${v.errors.length} Errors</span><span class="chip${f.w ? ' on' : ''}" data-ef="w">${ic('warn')}${v.warnings.length} Warnings</span><span class="chip${f.m ? ' on' : ''}" data-ef="m">${ic('info')}Messages</span>
      <span class="errsr">${ic('search')}<input class="inp" data-errq="1" type="search" placeholder="Search" value="${esc(S.errQ || '')}" list="errqh" autocomplete="off" spellcheck="false" aria-label="Search the Errors pane" title="Shows the lines that contain the text. F4 / Shift+F4: next / previous line"></span><datalist id="errqh">${hist.map(h => `<option value="${esc(h)}">`).join('')}</datalist></div>
      <div class="log" data-errlog="1">${errLogHTML()}</div>`;
  }
  const refreshErrLog = () => document.querySelectorAll('[data-errlog]').forEach(l => { l.innerHTML = errLogHTML(); const c = l.querySelector('.ln.cur'); if (c) c.scrollIntoView({ block: 'nearest' }); });
  // the last 10 searches, newest first
  function rememberErrQ(q) { q = String(q || '').trim(); if (!q) return; S.prefs.errHist = [q].concat((S.prefs.errHist || []).filter(x => x !== q)).slice(0, 10); savePrefs(); document.querySelectorAll('#errqh').forEach(d => { d.innerHTML = S.prefs.errHist.map(h => `<option value="${esc(h)}">`).join(''); }); }
  /* F4 / Shift+F4 (reference: next / previous error line): the next line of the Errors pane that names a rung, and that rung */
  function nextErrLine(dir) {
    const ls = errLines().filter(x => x.ri != null);
    if (!ls.length) { toast(S.errQ ? `No line with a rung contains "${S.errQ}".` : 'The Errors pane has no line with a rung: Verify first.'); return; }
    const i = ls.findIndex(x => x.t === S.errCur);
    const x = ls[i < 0 ? (dir > 0 ? 0 : ls.length - 1) : (i + dir + ls.length) % ls.length];
    S.errCur = x.t;
    gotoLine(x.ri, x.rt, x.t, false);
    refreshErrLog();
  }
  /* Search > Next Result / Previous Result (reference: the next result listed in the Output window): the Found lines
     of Search Results when that tab shows, else the Errors lines (as F4 / Shift+F4) */
  function nextResult(dir) {
    const fd = S.search && S.search.found || [];
    if (S.outTab !== 'search' || !fd.length) { nextErrLine(dir); return; }
    const i = fd.findIndex(x => x.text === S.searchCur), x = fd[i < 0 ? (dir > 0 ? 0 : fd.length - 1) : (i + dir + fd.length) % fd.length];
    S.searchCur = x.text;
    gotoLine(x.rung, x.program + '/' + x.routine, x.text, false);
  }
  function lineRoutine(t, v) { const e = v.errors.concat(v.warnings, v.found || []).find(x => x.text === t); return e ? e.program + '/' + e.routine : ''; }

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
  /* which shown rung the controller executes (index into its routine), or null when it runs other logic:
     before the edits are tested it runs the normal rungs and the r/R/D zones, while testing the normal rungs,
     the I zones and the r originals of newer pending edits; i copies are never executed */
  function liveIdx() {
    const R = liveRoutine(), cr = ctlRungs();
    if (!R || !cr) return null;
    const tested = !!(S.ed && S.ed.ctl === ctl && S.ed.tested);
    const runs = r => (!r.z ? true : tested ? r.z === 'I' || r.z === 'r' : r.z === 'r' || r.z === 'R' || r.z === 'D');
    const map = [], txt = [];
    rungs().forEach(r => { if (runs(r)) { map.push(txt.length); txt.push(r.t); } else map.push(-1); });
    return txt.length === cr.length && txt.every((t, i) => t === cr[i].t) && R.rungs.length === cr.length ? map : null;
  }
  // the mark left of the rung number: i (e while it has errors), r, I, R, D
  const markOf = (r, err) => (!r.z ? '' : r.z === 'i' && err ? 'e' : r.z);
  function ladderRungs() {
    const R = liveRoutine(), map = R ? liveIdx() : null;
    const tag = e => { if (e.t === 'BR') e.legs.forEach(l => l.forEach(tag)); else if (L.OPN[e.t] && /^(timer|counter)$/.test((INSTR[e.t].args[0] || ''))) { try { e.bv = { ...e.x[0].obj() }; } catch (err) { /* ignore */ } } else if (e.x && INSTR[e.t] && INSTR[e.t].ctl != null) { try { e.bv = { ...e.x[INSTR[e.t].ctl].obj() }; } catch (err) { /* ignore */ } } };
    return rungs().map((r, i) => {
      const pr = E.parseRung(r.t), err = S.errRungs.has(i) || !!pr.err;
      const base = { c: r.c, err, mk: markOf(r, err), ro: roRung(r), dash: !!(S.online && r.z === 'i'), dx: r.dx, bm: !!r.bm };
      if (map && map[i] >= 0) { const lr = R.rungs[map[i]]; lr.elems.forEach(e => e && tag(e)); return { ...base, elems: lr.elems.filter(Boolean) }; }
      return { ...base, elems: pr.err ? [] : pr.elems, still: !!map };
    });
  }
  const CELL = { desktop: 104, tablet: 112, phone: 80 };
  /* Tools > Options > Ladder Editor > Display (help v37): Show Routine Description, Rung Display (Show Rung Numbers,
     Show Rung Comments, Maximum Lines) and Instruction Display (Show Main Operand Description, Maximum Lines, Show Tag
     Alias Information). Saved in prefs.lad; a missing key is the default. */
  const LADDEF = { rdesc: false, nums: true, cm: true, cmLines: 4, desc: true, descLines: 0, alias: true };
  const ladPref = k => { const d = S.prefs.lad || {}; return k in d ? d[k] : LADDEF[k]; };
  const ladShow = () => ({ noNums: !ladPref('nums'), noCm: !ladPref('cm'), cmLines: ladPref('cmLines'), noDesc: !ladPref('desc'), noAlias: !ladPref('alias'), rdesc: ladPref('rdesc') ? curRoutine().desc || '' : '' });
  function renderLadder(drop, press) {
    if (drop === undefined && S.dragDrop) drop = S.dragDrop;
    const w = $('#ladwrap');
    if (!w) return;
    const z = S.prefs.zoom;
    const res = L.render(ladderRungs(), {
      W: w.clientWidth || 600, cell: Math.round(CELL[S.layout] * z), font: Math.round((S.layout === 'desktop' ? 11 : 12) * z), descLines: ladPref('descLines') || (S.layout === 'phone' ? 1 : 2), ...ladShow(),
      live: S.online && !!liveRoutine() && !!liveIdx(), run: S.online && (ctl.mode === 'run' || ctl.mode === 'remrun') && !ctl.fault,
      sel: S.sel, selRung: S.sel || insAllOn() ? null : S.selRung, selAll: selAllOn(), selIns: insAllOn() ? S.selIns.ri : null, tag: tagFor, desc: opDesc, forced: S.online ? op => ctl.forced(op, S.prog) : null, drop: drop && drop !== 'nodes' ? drop : null, nodeOk: S.drag ? nodeOk : null, lifted: S.lifted, press,
    });
    ladPatch(w, res);
    S.ladNodes = res.nodes || null;
  }
  /* write the ladder: when the SVG in place was drawn from the same frame (same size and classes, same taps and rails,
     same number of rungs), only the rungs whose drawing changed are replaced (a tap that moves the selection touches
     one or two rungs, not the 200 of a big routine); otherwise the whole SVG is written */
  let ladLast = null;
  function ladPatch(w, res) {
    const svg = w.firstElementChild, L0 = ladLast;
    ladLast = { head: res.head, tail: res.tail, parts: res.parts, svg: null };
    if (svg && L0 && L0.svg === svg && w.childElementCount === 1 && L0.head === res.head && L0.tail === res.tail && L0.parts.length === res.parts.length) {
      const gs = svg.children;
      let ok = true;
      for (let i = 0; i < res.parts.length && ok; i++) {
        if (L0.parts[i] === res.parts[i]) continue;
        const g = gs[i];
        if (!g || g.getAttribute('data-rg') !== String(i)) { ok = false; break; }
        const tmp = document.createElement('div'); tmp.innerHTML = '<svg>' + res.parts[i] + '</svg>';
        g.replaceWith(tmp.firstChild.firstChild);
      }
      if (ok) { ladLast.svg = svg; return; }
    }
    w.innerHTML = res.svg;
    ladLast.svg = w.firstElementChild;
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
    S.selAll = null; S.selIns = null; S.pickAt = 'lad';
    if (!t) { S.sel = null; S.selRung = null; return; }
    if (t.path) { S.sel = { ri: t.ri, path: t.path, br: t.br, leg: t.leg }; if (t.op != null) S.sel.op = t.op; S.selRung = null; } else if (t.ri != null) { S.sel = null; S.selRung = t.ri; } else { S.sel = null; S.selRung = null; }
  }
  const hit = el => {
    const r = el && el.closest && el.closest('rect.tap');
    if (!r) return null;
    const d = r.dataset;
    if (d.end) return { end: true };
    return { ri: +d.ri, path: d.p ? d.p.split('.').map(Number) : null, br: !!d.br, rr: !!d.rr, leg: !!d.leg, rn: !!d.rn, op: d.opi != null ? +d.opi : undefined, ly: d.ly ? d.ly.split(',').map(Number) : null };
  };
  const tkey = t => (t ? `${t.ri}|${t.path ? t.path.join('.') : ''}|${t.leg ? 'l' : ''}${t.rn ? 'n' : ''}${t.end ? 'e' : ''}|${t.op != null ? t.op : ''}` : '');
  let lastTap = { k: '', t: 0 };
  function onTap(t, x, y, isDbl, touch) {
    const k = tkey(t), now = Date.now();
    const again = touch && t && t.path && !t.br && !t.leg && S.sel && S.sel.ri === t.ri && S.sel.path && S.sel.path.join('.') === t.path.join('.') && !S.sel.br && !S.sel.leg && (t.op == null ? S.sel.op == null : S.sel.op === t.op) && now - lastTap.t > 380;
    const dbl = isDbl || again || (k === lastTap.k && now - lastTap.t < 380);
    lastTap = dbl ? { k: '', t: 0 } : { k, t: now };
    select(t);
    render();
    if (!dbl || !t) return;
    // as in the reference: a double-click on an operand edits it in place, on the instruction itself its mnemonic
    if (t.path && !t.br && !t.leg) { if (editable()) inlineEdit(t.ri, t.path, t.op != null ? t.op : 'mn'); }
    else if (t.rn) { if (editable()) rungText(t.ri); }
  }
  /* ---------- drag and drop (Studio 5000 "Edit Ladder Elements", Dragging and Dropping) ----------
     the part grabbed decides what moves: an instruction (Ctrl copies), only its operand (a tag name: always a copy,
     onto another operand), the rung number (the rung), the left branch rail (one branch level), the right branch rail
     (the end of the branch; with Ctrl or Alt the whole branch). Dropped in another routine, an instruction is copied. */
  function dragKind(t, ev) {
    if (!t || t.end || t.ri == null) return null;
    if (t.rn) return 'rung';
    if (t.br) return t.rr ? (ev.ctrlKey || ev.altKey ? 'el' : 'rr') : 'lvl';
    if (!t.path || t.leg) return null;
    if (t.op != null) { const e = getEl(parsed(t.ri) || [], t.path); return e && e.a && isTagText(e.a[t.op]) ? 'op' : 'el'; }
    return 'el';
  }
  const pfx = (p, q, strict) => !!p && p.length >= q.length + (strict ? 1 : 0) && q.every((v, i) => p[i] === v);
  const sameP = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);
  const NOTAG = /^(routine|label|imm|expr|order|fmode|adim|gclass|ginst|gattr)$/;
  /* is a node a valid drop point for what is dragged (white square)? */
  function nodeOk(n) {
    const d = S.drag; if (!d) return false;
    const src = d.src || {};
    if (d.kind === 'rung') return n.rung != null && !(d.rt === curProg().name + '/' + curRoutine().name && (n.rung === src.ri || n.rung === src.ri + 1));
    if (n.rung != null) return false;
    if (d.kind === 'op') {
      if (n.op == null || (n.ri === src.ri && sameP(n.path, src.path) && n.op === src.op)) return false;
      const e = getEl(parsed(n.ri) || [], n.path), kind = e && INSTR[e.t] ? (INSTR[e.t].args[n.op] || '').replace('?', '') : '';
      return !!kind && !NOTAG.test(kind);
    }
    if (n.op != null) return false;
    if (n.lvl != null) return d.kind === 'lvl' && !(n.ri === src.ri && sameP(n.path, src.path) && (n.lvl === d.lvl || n.lvl === d.lvl + 1)) && !(n.ri === src.ri && pfx(n.path, src.path.concat(d.lvl)));
    if (d.kind === 'rr') return railOk(n, src);
    if (d.kind === 'el' && d.rt === curProg().name + '/' + curRoutine().name && n.ri === src.ri && src.path && pfx(n.path, src.path, true)) return false;
    if (d.kind === 'lvl' && n.ri === src.ri && n.path && pfx(n.path, src.path.concat(d.lvl))) return false;
    return true;
  }
  /* the right rail of a branch moves along its own sequence: after the branch (the instructions passed go into the
     first level) or back into the first level (the instructions passed come out after the branch) */
  function railOk(n, src) {
    if (n.ri !== src.ri || n.leg) return false;
    const bp = src.path, bi = bp[bp.length - 1], els = parsed(src.ri), b = els && getEl(els, bp);
    if (!b || b.t !== 'BR') return false;
    if (n.end) return bp.length === 1 && bi < els.length - 1;
    if (!n.path) return false;
    const at = n.path[n.path.length - 1] + (n.after ? 1 : 0);
    if (n.path.length === bp.length && pfx(n.path, bp.slice(0, -1))) return at > bi + 1;
    if (n.path.length === bp.length + 2 && pfx(n.path, bp.concat(0))) return at < b.legs[0].length;
    return false;
  }
  function moveRail(src, drop) {
    return edit(() => {
      const els = parsed(src.ri); if (!els) return false;
      const bp = src.path, b = getEl(els, bp), { arr, idx: bi } = seqOf(els, bp);
      if (drop.end) b.legs[0].push(...arr.splice(bi + 1));
      else {
        const at = drop.path[drop.path.length - 1] + (drop.after ? 1 : 0);
        if (drop.path.length === bp.length) b.legs[0].push(...arr.splice(bi + 1, at - bi - 1));
        else arr.splice(bi + 1, 0, ...b.legs[0].splice(at));
      }
      tidy(els); writeRung(src.ri, els);
      const l = locate(els, b); S.sel = l ? { ri: src.ri, path: l.path, br: true } : null; if (!l) S.selRung = src.ri;
    });
  }
  /* a branch level moves to a level slot of a branch, or its instructions onto a rung at a node */
  function moveLevel(src, k, drop, copy) {
    const same = src.ri === drop.ri;
    return edit(() => {
      const se = parsed(src.ri), de = same ? se : parsed(drop.ri);
      if (!se || !de) return false;
      const b = getEl(se, src.path); if (!b || b.t !== 'BR' || !b.legs[k]) return false;
      const lvl = copy ? JSON.parse(JSON.stringify(b.legs[k])) : b.legs[k];
      const tb = drop.lvl != null ? getEl(de, drop.path) : null, before = tb ? tb.legs[drop.lvl] : null;
      const lb = drop.leg ? getEl(de, drop.path.slice(0, -1)).legs[drop.path[drop.path.length - 1]] : null;
      const tgt = drop.path && !drop.leg && drop.lvl == null ? getEl(de, drop.path) : null;
      if (!copy) b.legs.splice(b.legs.indexOf(lvl), 1);
      if (tb) tb.legs.splice(before ? tb.legs.indexOf(before) : tb.legs.length, 0, lvl);
      else if (lb) lb.push(...lvl);
      else if (tgt) { const at = locate(de, tgt); at.arr.splice(at.idx + (drop.after ? 1 : 0), 0, ...lvl); }
      else de.push(...lvl);
      tidy(se); if (!same) tidy(de);
      writeRung(src.ri, se); if (!same) writeRung(drop.ri, de);
      S.sel = null; S.selRung = drop.ri;
    });
  }
  /* the rung number moves the rung (Ctrl copies). Online a moved rung is a new rung (i) and, in Run, a deleted one (D) */
  function moveRung(from, to, copy) {
    return edit(() => {
      const R = rungs(), r = R[from]; if (!r || to < 0 || to > R.length) return false;
      const c = { t: r.t }; if (r.c) c.c = r.c;
      if (copy || (S.online && ctl.M)) { R.splice(to, 0, c); if (!copy) R.splice(R.indexOf(r), 1); S.selRung = R.indexOf(c); }
      else { R.splice(from, 1); const k = to > from ? to - 1 : to; R.splice(k, 0, r); S.selRung = k; }
      S.sel = null;
    });
  }
  /* dragging a tag name copies only the operand onto another instruction's operand */
  function copyOperand(src, drop) {
    const se = parsed(src.ri), e0 = se && getEl(se, src.path), v = e0 && e0.a[src.op];
    if (v == null) return false;
    return edit(() => {
      const de = parsed(drop.ri), e = de && getEl(de, drop.path);
      if (!e || !e.a || drop.op >= e.a.length) return false;
      e.a[drop.op] = v; writeRung(drop.ri, de);
      S.sel = { ri: drop.ri, path: drop.path, op: drop.op }; S.selRung = null;
    });
  }
  function dropDone(p, copy) {
    const k = p.kind, here = curProg().name + '/' + curRoutine().name;
    if (k === 'op') return copyOperand(p.t, p.drop);
    if (k === 'rung') return p.rt === here ? moveRung(p.t.ri, p.drop.rung, copy) : false;
    if (k === 'lvl') return moveLevel(p.t, p.lvl, p.drop, copy);
    if (k === 'rr') return moveRail(p.t, p.drop);
    if (p.rt !== here) { if (!p.el) return false; insert(JSON.parse(JSON.stringify(p.el)), p.drop.end ? { ri: p.drop.ri } : p.drop, false); toast(`Copied ${p.el.t === 'BR' ? 'branch' : p.el.t} to ${curRoutine().name}, rung ${p.drop.ri}`); return true; }
    return moveEl(p.t, p.drop, copy);
  }
  // a drag held over a routine tab or an organizer routine row opens that routine
  const rtHover = { k: '', timer: 0 };
  function hoverRoutine(p, x, y) {
    const el = document.elementFromPoint(x, y), tb = el && el.closest && (el.closest('[data-tabk]') || el.closest('[data-org^="rt:"]'));
    const k = tb ? (tb.dataset.tabk || tb.dataset.org.slice(3)) : '';
    if (k === rtHover.k) return;
    clearTimeout(rtHover.timer); rtHover.k = k;
    if (!k || k === 'tags' || k === curProg().name + '/' + curRoutine().name) return;
    rtHover.timer = setTimeout(() => {
      const [g, r] = k.split('/'), P = allProgs().find(x => x.name === g);
      if (!S.drag || !P || !P.routines.some(x => x.name === r)) return;
      S.prog = g; S.routine = r; S.view = 'ladder'; if (!S.tabs.includes(k)) S.tabs.push(k);
      S.sel = null; S.selRung = null; S.lifted = null; reverify(); render(); renderLadder('nodes');
    }, 600);
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
      const kind = editable() ? dragKind(t, ev) : null, movable = !!kind;
      cancelAnimationFrame(fling);
      pd = { x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, lt: performance.now(), vx: 0, vy: 0, t, moved: false, long: false, mouse: ev.pointerType === 'mouse', lift: ev.pointerType === 'mouse' && movable, kind, ctrl: ev.ctrlKey || ev.altKey };
      // a left branch rail moves one level: the one nearest the pointer
      if (kind === 'lvl' && t.ly) { const sv = w.querySelector('svg'), top = sv ? sv.getBoundingClientRect().top : 0; let k = 0; t.ly.forEach((yy, i) => { if (Math.abs(top + yy - ev.clientY) < Math.abs(top + t.ly[k] - ev.clientY)) k = i; }); pd.lvl = k; }
      busy();
      if (!pd.mouse) {
        pd.timer = setTimeout(() => {
          if (!pd || pd.moved) return;
          pd.long = true;
          select(pd.t);
          if (navigator.vibrate) navigator.vibrate(12);
          // hold on an instruction lifts it: drag it to a node, or let go for its menu
          if (movable) { pd.lift = true; S.lifted = pd.t; renderLadder(null, pd.t); return; }
          renderLadder(null, pd.t && pd.t.path ? pd.t : null);
          ctxMenu(pd.t, pd.x, pd.y);
        }, 450);
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
      if (pd && pd.lift && (pd.drag || Math.hypot(ev.clientX - pd.x, ev.clientY - pd.y) > (pd.mouse ? 6 : 10))) { dragTo(pd, ev.clientX, ev.clientY); return; }
      if (pd && Math.hypot(ev.clientX - pd.x, ev.clientY - pd.y) > 10) { pd.moved = true; clearTimeout(pd.timer); }
      // the ladder scrolls under the finger here (the page leaves touches to the app, so a held instruction can be dragged)
      if (pd && pd.moved && !pd.mouse) {
        const w = $('#ladwrap'), dx = ev.clientX - pd.lx, dy = ev.clientY - pd.ly, nt = performance.now(), dt = Math.max(1, nt - pd.lt);
        if (w) { w.scrollLeft -= dx; w.scrollTop -= dy; }
        pd.vx = .8 * (dx / dt) + .2 * pd.vx; pd.vy = .8 * (dy / dt) + .2 * pd.vy;
        pd.lx = ev.clientX; pd.ly = ev.clientY; pd.lt = nt;
      }
    };
    // a flick keeps the ladder going and slows down
    let fling = 0;
    const flick = (vx, vy) => {
      let last = performance.now();
      const step = n => { const w = $('#ladwrap'); if (!w) return; const dt = n - last; last = n; w.scrollLeft -= vx * dt; w.scrollTop -= vy * dt; const k = Math.pow(.995, dt); vx *= k; vy *= k; if (Math.hypot(vx, vy) > .02) fling = requestAnimationFrame(step); };
      fling = requestAnimationFrame(step);
    };
    // a lifted instruction follows the finger: a ghost, the nodes of the routine shown, the node under it marked
    const dragTo = (p, x, y) => {
      if (!p.drag) {
        p.drag = true; p.moved = true; clearTimeout(p.timer);
        if (p.mouse) { select(p.t); S.lifted = p.kind === 'el' ? p.t : null; }
        const e = p.t.path ? getEl(parsed(p.t.ri) || [], p.t.path) : null;
        p.el = e ? JSON.parse(JSON.stringify(e)) : null; p.rt = curProg().name + '/' + curRoutine().name;
        p.g = document.createElement('div'); p.g.className = 'ghost'; p.g.style.position = 'fixed'; p.g.style.zIndex = 300; p.g.style.transform = p.mouse ? 'translate(16px, 12px)' : 'translate(-50%, -140%)'; // never over the green circle
        p.g.innerHTML = p.kind === 'op' ? `<span>${esc(e.a[p.t.op])}</span>` : p.kind === 'rung' ? `<span>Rung ${p.t.ri}</span>` : p.kind === 'lvl' ? '<span>Branch Level</span>' : p.kind === 'rr' ? '<span>Branch End</span>' : e && e.t !== 'BR' ? `${L.icon(e.t)}<span>${e.t}</span>` : '<span>Branch</span>';
        document.body.appendChild(p.g);
        S.drag = { kind: p.kind, src: p.t, lvl: p.lvl, rt: p.rt };
        renderLadder('nodes');
      }
      p.g.style.left = x + 'px'; p.g.style.top = y + 'px';
      const w = $('#ladwrap');
      if (w) { const r = w.getBoundingClientRect(); if (y < r.top + 30) w.scrollTop -= 12; else if (y > r.bottom - 30) w.scrollTop += 12; }
      // held over another routine (its tab or its organizer row): that routine opens, and the drop there copies
      if (p.kind === 'el') hoverRoutine(p, x, y);
      p.drop = dropAt(x, y, p.kind);
      const k = JSON.stringify(p.drop);
      if (k !== p.k) { p.k = k; S.dragDrop = p.drop || 'nodes'; renderLadder(S.dragDrop); }
    };
    document.addEventListener('touchmove', ev => { if (pd && pd.lift && !pd.mouse) ev.preventDefault(); }, { passive: false });
    // the menu that opens when a held finger lets go must not get that finger's click (a phone sheet is under it)
    let menuUp = 0;
    document.addEventListener('click', ev => { if (menuUp && performance.now() - menuUp < 400) { menuUp = 0; ev.preventDefault(); ev.stopPropagation(); } }, true);
    document.addEventListener('pointerdown', () => { menuUp = 0; }, true);
    const up = ev => {
      if (!pts.has(ev.pointerId)) return;
      pts.delete(ev.pointerId);
      if (pinch) { if (pts.size < 2) { pinch = null; pts.clear(); savePrefs(); busy(); renderLadder(); } return; }
      if (!pd) { busy(); return; }
      clearTimeout(pd.timer);
      const p = pd;
      pd = null;
      busy();
      S.lifted = null; S.dragDrop = null; S.drag = null; clearTimeout(rtHover.timer); rtHover.k = '';
      if (p.drag) { p.g.remove(); if (ev.type === 'pointerup' && p.drop && dropDone(p, !(p.t && p.t.rr) && (ev.ctrlKey || p.ctrl))) return; render(); return; }
      if (p.long && p.lift && ev.type === 'pointerup') { render(); ctxMenu(p.t, p.x, p.y); menuUp = performance.now(); return; }
      if (p.moved && !p.mouse && !p.long && performance.now() - p.lt < 80 && Math.hypot(p.vx, p.vy) > .3) flick(p.vx, p.vy);
      if (ev.type === 'pointercancel' || p.moved || p.long) { if (!p.long) live(true); else if (p.lift) render(); return; }
      onTap(p.t, ev.clientX, ev.clientY, false, !p.mouse);
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
  /* the ladder's right-click menus, as in the reference (Studio 5000): the rung number, a branch rail, an instruction
     and the tag name of an instruction each have their own menu. The instruction items are the same for every
     instruction; a Bit instruction (BOOL operand) adds Toggle Bit, Force On and Force Off */
  const renamed = (items, names) => items.map(it => (it === '-' || !names[it.id] ? it : { ...it, l: names[it.id] }));
  const kb = k => (S.layout === 'desktop' ? k : '');
  function tagItems(e, oi, onName) {
    const kind = (((INSTR[e.t] || {}).args || [])[oi] || '').replace('?', ''), a = e.a[oi];
    if (!kind || /^(routine|label|imm|expr|order|fmode|adim|gclass|ginst|gattr)$/.test(kind)) return [];
    if (a === '?' || a === '') return [{ l: 'New Tag…', k: kb('Ctrl+W'), i: 'newtag', run: () => newTag({ kind }), dis: !editable() }, '-'];
    if (!isTagText(a)) return [];
    const base = String(a).split(/[.[]/)[0], tg = tagFor(base);
    if (!tg) return [{ l: `New "${base}"`, k: kb('Ctrl+W'), i: 'newtag', run: () => newTag({ name: base, kind }), dis: !editable() }, '-'];
    if (!onName) return [];
    return [{ l: `Edit "${tg.name}" Properties`, i: 'tag', run: () => newTag({ tag: tg }) }, { l: `Find All "${a}"`, i: 'search', run: () => findAll(a) },
      { l: `Go To Cross Reference For "${base}"`, i: 'xref', run: () => xref(base) }, { l: `Monitor "${a}"`, i: 'tags', run: () => monitorTag(base) },
      { l: `Trend "${a}"`, i: 'xref', run: () => quickTrend(a), dis: !S.online }, '-'];
  }
  function ctxMenu(t, x, y) {
    if (!t || t.end) return;
    if (t.leg) { openMenu(renamed(menuItems(['paste', 'del', '-', 'level', 'applevel']), { del: 'Delete Branch Level' }), { x, y }, `Rung ${t.ri} · Branch Level`); return; }
    if (t.br) { openMenu(renamed(menuItems(['cut', 'copy', 'paste', 'del', '-', 'level', 'applevel', 'mvrail']), { cut: 'Cut Branch', copy: 'Copy Branch', del: 'Delete Branch' }), { x, y }, `Rung ${t.ri} · Branch`); return; }
    if (t.path) {
      const e = curEl();
      if (!e) return;
      const d = INSTR[e.t] || {}, bit = d.grp === 'Bit', oi = selOpIdx(), a = e.a[oi];
      const ids = ['cut', 'copy', 'paste', '-', 'del', 'ins', 'desc', '-', 'sdef', 'cdef', '-'].concat(bit ? ['toggle', '-', 'fon', '-', 'foff', '-'] : [], ['frem', '-', 'goto', 'help']);
      let items = renamed(menuItems(ids), { cut: 'Cut Instruction', copy: 'Copy Instruction', del: 'Delete Instruction' });
      items = items.map(it => (it === '-' ? it : it.id === 'help' ? { ...it, id: null, run: () => instrHelp(e.t) } : it.id === 'desc' && oi ? { ...it, l: `Edit "${a}" Description` } : it));
      // a box operand holding a tag: its forced value is monitored and edited there (the app forces I/O bits only)
      if (!bit && t.op != null && isTagText(a)) items.splice(items.findIndex(it => it.id === 'frem'), 0, { l: `Monitor/Edit Force Value Of "${a}"`, i: 'force', run: () => monitorTag(String(a).split(/[.[]/)[0]) }, '-');
      openMenu(tagItems(e, oi, t.op != null).concat(items), { x, y }, `Rung ${t.ri} · ${e.t} ${e.a.join(', ')}`);
      return;
    }
    const ids = ['cut', 'copy', 'paste', '-', 'del', 'rung', 'rtext', 'comment', 'rimp', 'rexp', '-', 'rstart', 'raccept', 'rcancel', '-', 'rasm', 'rcanc', '-', 'verifyrung', '-', 'goto', 'bmtog', '-', 'ins'];
    openMenu(renamed(menuItems(ids), { cut: 'Cut Rung', copy: 'Copy Rung', del: 'Delete Rung' }), { x, y }, `Rung ${t.ri}`);
  }
  function orgMenu(key, x, y) {
    const dm = dtMenu(key); if (dm) { openMenu(dm, { x, y }); return; }
    const items = [];
    const rtOf = k => { const [gn, rn] = k.slice(3).split('/'), g = allProgs().find(x => x.name === gn); return { g, r: g && g.routines.find(x => x.name === rn) }; };
    const imp = (l, kind) => ({ l, i: 'upload', run: () => { S.orgSel = key; importComponent(kind); }, dis: !editable() || !offline() });
    if (key.startsWith('rt:')) { items.push({ l: 'Open', run: () => openRoutine(key) }, '-', { l: 'Rename…', run: () => renameRoutine(key), dis: !editable() }, { l: 'Delete', run: () => deleteRoutine(key), dis: !editable() }, '-', { l: 'Export Routine…', i: 'download', run: () => exportComponent('Routine', rtOf(key)) }, '-', { l: 'Verify', run: () => { openRoutine(key); verifyCmd(true); } }, { l: 'Properties…', run: () => routineProps(key) }); }
    else if (key.startsWith('prog:')) items.push({ l: 'New Routine…', run: () => newRoutine(key.slice(5)), dis: !editable() }, imp('Import Routine…', 'Routine'), { l: 'Program Tags', run: () => tagEditor('mon', key.slice(5)) }, '-', { l: 'Export Program…', i: 'download', run: () => exportComponent('Program', { g: allProgs().find(x => x.name === key.slice(5)) }) }, '-', { l: 'Properties…', run: () => progProps(key.slice(5)) });
    else if (key.startsWith('task:')) items.push(imp('Import Program…', 'Program'), '-', { l: 'Properties…', run: () => taskProps(key.slice(5)) });
    else if (key === 'dt:user') items.push(imp('Import Data Type…', 'DataType'));
    else if (key.startsWith('dt:u:')) { const d = (S.p.dataTypes || []).find(x => x.name === key.slice(5)); if (d) items.push({ l: 'Export Data Type…', i: 'download', run: () => exportComponent('DataType', { d }) }); }
    else if (key.startsWith('ptags:')) items.push({ l: 'Monitor Tags', run: () => tagEditor('mon', key.slice(6)) }, { l: 'Edit Tags', run: () => tagEditor('edit', key.slice(6)) });
    else if (key === 'bp' || key === 'io') items.push({ l: 'New Module…', run: newModule, dis: !offline() });
    else if (key.startsWith('mod:') && key !== 'mod:0') items.push({ l: 'Properties', run: () => moduleProps(+key.slice(4)) }, { l: 'Delete', run: () => deleteModule(+key.slice(4)), dis: !offline() });
    else if (key === 'ctags') items.push({ l: 'Monitor Tags', run: () => tagEditor('mon') }, { l: 'Edit Tags', run: () => tagEditor('edit') }, { l: 'New Tag…', run: () => newTag({}) });
    else if (key === 'ctl') items.push({ l: 'Verify', run: () => verifyCmd(false) }, '-', { l: 'Properties…', run: () => controllerProps() });
    else if (key === 'cfh' || key === 'puh') items.push({ l: 'New Program…', run: () => newHandlerProgram(key === 'cfh' ? 'fault' : 'powerup'), dis: !editable() || !!handlerProg(key === 'cfh' ? 'fault' : 'powerup') });
    if (items.length) openMenu(items, { x, y });
  }

  /* ---------- layer: menus, sheets, dialogs, toasts ---------- */
  /* the menus as an accordion: tap a menu name to open its commands, tap again to fold it */
  function foldMenu(at) {
    const items = MENUS.flatMap(([n, ids]) => menuItems(ids).filter(x => x !== '-' && !x.hd).map(x => ({ ...x, grp: n })));
    openMenu(items, at);
    const menu = $('#layer .menu'); if (!menu) return;
    // group the commands under their menu's header; a tap on a header folds its group open or shut in place
    MENUS.forEach(([n]) => {
      const its = [...menu.querySelectorAll('.it[data-n]')].filter(el => items[+el.dataset.n].grp === n);
      if (!its.length) return;
      const h = document.createElement('div');
      h.className = 'it fold'; h.dataset.fold = n; h.innerHTML = `${ic('right')}<span>${esc(n)}</span>`;
      its[0].before(h);
      its.forEach(el => { el.classList.add('sub'); el.hidden = true; el.dataset.grp = n; });
    });
    menu.addEventListener('click', ev => {
      const h = ev.target.closest('[data-fold]'); if (!h) return;
      ev.stopPropagation();
      const n = h.dataset.fold, opening = !h.classList.contains('open');
      menu.querySelectorAll('[data-fold]').forEach(x => { x.classList.remove('open'); x.querySelector('svg').outerHTML = ic('right'); });
      menu.querySelectorAll('[data-grp]').forEach(el => { el.hidden = !(opening && el.dataset.grp === n); });
      if (opening) { h.classList.add('open'); h.querySelector('svg').outerHTML = ic('down'); }
    }, true);
  }
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
    const body = `<div class="menu">${head && S.layout !== 'desktop' ? '' : ''}${items.map((it, n) => (it === '-' ? '<hr>' : it.hd ? `<div class="hd">${esc(it.hd)}</div>` : `<div class="it${it.dis ? ' dis' : ''}${it.sub ? ' sub' : ''}" data-n="${n}">${it.ck !== undefined ? `<span class="ck">${it.ck ? '✓' : ''}</span>` : it.i ? ic(it.i) : ''}<span>${esc(it.l)}</span>${it.k ? `<span class="k">${esc(it.k)}</span>` : ''}</div>`)).join('')}</div>`;
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
    num: ['SINT', 'INT', 'DINT', 'LINT', 'REAL', 'LREAL'], dest: ['SINT', 'INT', 'DINT', 'LINT', 'REAL', 'LREAL'], int: ['SINT', 'INT', 'DINT', 'LINT'], idest: ['SINT', 'INT', 'DINT', 'LINT'], expr: ['SINT', 'INT', 'DINT', 'LINT', 'REAL', 'LREAL', 'BOOL'],
    control: ['CONTROL'], darr: ['DINT'], real: ['REAL'], trace: ['BOOL', 'SINT', 'INT', 'DINT', 'LINT', 'REAL', 'LREAL'], fmt: [], fsrc: ['SINT', 'INT', 'DINT', 'LINT', 'REAL', 'LREAL'], farr: ['SINT', 'INT', 'DINT', 'LINT', 'REAL', 'LREAL'], fdst: ['SINT', 'INT', 'DINT', 'LINT', 'REAL', 'LREAL'], ddest: ['DINT'],
    aelem: ['SINT', 'INT', 'DINT', 'REAL'], aelemw: ['SINT', 'INT', 'DINT', 'REAL'], rdest: ['REAL'], gdest: ['SINT', 'INT', 'DINT', 'REAL'], gsrc: ['SINT', 'INT', 'DINT', 'REAL'], pid: ['PID'], pidm: ['PID'], bit0: ['BOOL'],
  };
  // Wave 3: string operands (STRING and the project's string types), numeric / REAL tags only
  const strTypes = () => ['STRING'].concat(((S.p && S.p.dataTypes) || []).filter(d => d.family === 'string').map(d => d.name));
  ['str', 'strw'].forEach(k => Object.defineProperty(KIND_TYPES, k, { get: strTypes }));
  Object.assign(KIND_TYPES, { ntag: ['SINT', 'INT', 'DINT', 'LINT', 'REAL'], rtag: ['REAL'] });
  // the operand kinds that take one element of an array (Bits[0]): the tag list offers the elements
  const ARRK = ['elem', 'elemw', 'darr', 'farr', 'aelem', 'aelemw'];
  /* the name operands that are picked from a list, as the reference editor offers them (Mode of FAL / FSC, the class,
     instance and attribute of GSV / SSV); PCTX is the instruction being edited ({ mn, ops }) */
  let PCTX = null;
  const PICKS = {
    fmode: { title: 'Modes: ALL, INC, or a number of elements per scan', list: () => [['ALL', 'All the elements in one scan'], ['INC', 'One element each false-to-true rung'], ['1', 'A number: that many elements each scan']].map(([name, desc]) => ({ name, type: '', desc })) },
    gclass: { title: 'Object classes', list: () => Object.keys(E.GSVOBJ).map(name => ({ name, type: '', desc: { WallClockTime: 'Date and time', Controller: 'Controller settings', Task: 'A task: scan times, watchdog', Program: 'A program: scan times, fault records', Module: 'An I/O module: status, fault code, mode', FaultLog: 'Fault counts and bits' }[name] || '' })) },
    ginst: { title: 'Instance names', list: () => {
      const O = E.GSVOBJ[Object.keys(E.GSVOBJ).find(k => PCTX && U(k) === U(PCTX.ops[0] || ''))], P = S.p;
      if (!O || !O.inst) return [];
      if (O.inst === 'module') return P.rack.modules.filter(m => m.name).map(m => ({ name: m.name, type: '', desc: `[${m.slot}] ${MODNAMES[m.type] || m.type}` }));
      const all = O.inst === 'task' ? P.tasks.filter(t => !HANDLERS[t.type]).map(t => t.name) : P.tasks.flatMap(t => t.programs.map(g => g.name));
      return [{ name: 'THIS', type: '', desc: `The ${O.inst} this instruction is in` }, ...all.map(name => ({ name, type: '', desc: '' }))];
    } },
    gattr: { title: 'Attributes', list: () => {
      const O = E.GSVOBJ[Object.keys(E.GSVOBJ).find(k => PCTX && U(k) === U(PCTX.ops[0] || ''))];
      return O ? Object.entries(O.attrs).filter(([, a]) => PCTX.mn !== 'SSV' || a[2]).map(([name, a]) => ({ name, type: a[0] + (a[1] > 1 ? `[${a[1]}]` : ''), desc: a[2] ? 'GSV / SSV' : 'GSV' })) : [];
    } },
    adim: { title: 'Dimension to vary (the order is array[0,1,2])', list: () => [['0', 'The first dimension'], ['1', 'The second dimension'], ['2', 'The third dimension']].map(([name, desc]) => ({ name, type: '', desc })) },
  };
  const PICKK = Object.keys(PICKS);
  function aliasType(alias) { return addrType(alias) || 'BOOL'; }
  /* the members of a structured type (predefined, module or user-defined) */
  const membersOf = ty => E.PREDEF[ty] || E.MODTYPES[ty] || (d => (d && d.family === 'string' ? strMems(d.len) : d && d.members))((S.p.dataTypes || []).find(d => U(d.name) === U(ty))) || null;
  const NBITS = { SINT: 8, INT: 16, DINT: 32, LINT: 64 };
  /* the data type of a tag address, as the reference reads it: Name[Element].Member.Bit, or Location:Slot:Type.Member.Bit
     for the I/O tags of a module; null when the address names nothing in the project */
  function addrType(addr, seen) {
    const a = String(addr || '').trim();
    let ty, dim = 0, rest;
    const io = /^Local:(\d+):([ICOS])(.*)$/i.exec(a);
    if (io) {
      const m = S.p.rack.modules.find(x => x.slot === +io[1]), d = m && E.MODULES[m.type], k = U(io[2]);
      if (!d || !d[k]) return null;
      ty = d[k]; rest = io[3];
    } else {
      const b = /^([A-Za-z_]\w*)(.*)$/.exec(a);
      if (!b) return null;
      const t = tagFor(b[1]);
      if (!t || U(t.name) !== U(b[1])) return null;
      rest = b[2];
      if (t.alias) { seen = seen || new Set(); if (seen.has(U(t.name))) return null; seen.add(U(t.name)); return addrType(t.alias + rest, seen); }
      ty = t.type || 'BOOL'; dim = t.dim || 0;
    }
    // Tag[i], Tag[i,j], Tag[i,j,k]: one subscript per dimension, each inside its own dimension
    const re = /^(?:\[\s*(\d+(?:\s*,\s*\d+){0,2})\s*\]|\.([A-Za-z_]\w*)|\.(\d+))/;
    while (rest) {
      const m = re.exec(rest);
      if (!m) return null;
      rest = rest.slice(m[0].length);
      if (m[1] != null) { const ds = E.dimsOf(dim) || [], ix = m[1].split(',').map(Number); if (!ds.length || ix.length !== ds.length || ix.some((x, n) => x >= ds[n])) return null; dim = 0; continue; }
      if (dim) return null;
      if (m[2] != null) { const mem = (membersOf(ty) || []).find(x => U(x.name) === U(m[2])); if (!mem) return null; ty = mem.type; dim = mem.dim || 0; continue; }
      if (!NBITS[ty] || +m[3] >= NBITS[ty]) return null;
      ty = 'BOOL';
    }
    return dim ? ty + '[' + E.dimText(dim) + ']' : ty;
  }
  /* the subscripts of the elements of an array, row by row (the rightmost varies fastest): [2,3] → 0,0 0,1 0,2 1,0 …;
     at most cap of them */
  const subsOf = (dims, cap) => {
    const ds = E.dimsOf(dims) || [], n = Math.min(E.dimN(dims), cap || 64), out = [];
    for (let k = 0; k < n; k++) { let r = k; const ix = []; for (let d = ds.length - 1; d >= 0; d--) { ix.unshift(r % ds[d]); r = Math.floor(r / ds[d]); } out.push(ix.join(',')); }
    return out;
  };
  // a data type with its dimensions: DINT, DINT[10], DINT[4,5]
  const tyDims = (ty, dim) => ty + (E.dimN(dim) ? '[' + E.dimText(dim) + ']' : '');
  /* the tag browser of Alias For (as in the reference): the I/O tags of the modules, the controller tags, the program
     tags; a structure opens to its members, an integer to its bits (+) */
  function aliasBrowser(box, inp, o) {
    const st = { open: new Set(), bits: null };
    const node = (path, ty, depth, kids) => ({ path, ty, depth, kids });
    const build = () => {
      const groups = [];
      const tree = (path, ty, depth) => {
        const n = node(path, ty, depth, null), dm = /^(.*)\[([\d,]+)\]$/.exec(ty);
        if (dm) n.kids = subsOf(dm[2].split(',').map(Number)).map(i => tree(`${path}[${i}]`, dm[1], depth + 1));
        else { const mem = membersOf(ty); if (mem) n.kids = mem.map(m => tree(`${path}.${m.name}`, m.type + (m.dim ? '[' + m.dim + ']' : ''), depth + 1)); }
        return n;
      };
      const ioRows = [];
      S.p.rack.modules.slice().sort((a, b) => a.slot - b.slot).forEach(m => { const d = E.MODULES[m.type]; if (!d) return; ['C', 'I', 'O', 'S'].forEach(k => { if (d[k]) { const n = tree(`Local:${m.slot}:${k}`, d[k], 0); n.desc = `[${m.slot}] ${m.name} · ${MODNAMES[m.type] || m.type}`; ioRows.push(n); } }); });
      groups.push({ name: 'I/O tags (Local)', rows: ioRows, empty: 'No modules in the I/O Configuration: add one with New Module.' });
      const tagRowsOf = list => list.filter(t => !o.self || U(t.name) !== U(o.self)).map(t => { const ty = tyDims(typeOf(t), t.dim); const n = t.alias ? node(t.name, ty, 0, null) : tree(t.name, ty, 0); n.desc = (t.alias ? '<' + t.alias + '> ' : '') + (t.desc || ''); return n; });
      groups.push({ name: `Controller Tags · ${S.p.controller.name}`, rows: tagRowsOf(S.p.tags), empty: 'No controller tags' });
      const P = o.scope && o.scope() ? allProgs().find(g => g.name === o.scope()) : null;
      if (P) groups.push({ name: `Program Tags · ${P.name}`, rows: tagRowsOf(P.tags), empty: 'No program tags' });
      return groups;
    };
    const rowH = n => {
      const bits = NBITS[n.ty], open = st.open.has(n.path), cur = U(inp.value.trim()) === U(n.path);
      let h = `<div class="row abr${cur ? ' on' : ''}" style="padding-left:${8 + n.depth * 16}px" data-abp="${esc(n.path)}">${n.kids ? `<span class="exp" data-abx="${esc(n.path)}">${ic(open ? 'down' : 'right')}</span>` : '<span class="exp"></span>'}<span class="nm grow">${esc(n.depth ? n.path.slice(n.path.search(/[.[][^.[]*$/)) : n.path)}${n.desc ? `<small> ${esc(n.desc)}</small>` : ''}</span><span class="ty">${esc(n.ty)}</span>${bits ? `<button class="ib bitb${st.bits === n.path ? ' on' : ''}" data-abb="${esc(n.path)}" title="Pick a bit">+</button>` : ''}</div>`;
      if (bits && st.bits === n.path) h += `<div class="bitgrid" style="margin-left:${24 + n.depth * 16}px">${Array.from({ length: bits }, (_, b) => `<button data-abp="${esc(n.path + '.' + b)}">${b}</button>`).join('')}</div>`;
      if (n.kids && open) n.kids.forEach(k => { h += rowH(k); });
      return h;
    };
    const flatAll = (rows, out = []) => { rows.forEach(n => { out.push(n); if (n.kids) flatAll(n.kids, out); if (NBITS[n.ty]) for (let b = 0; b < NBITS[n.ty]; b++) out.push(node(n.path + '.' + b, 'BOOL', 0, null)); }); return out; };
    const draw = () => {
      const q = U(inp.value.trim()), groups = build();
      const exact = q && groups.some(g => flatAll(g.rows).some(n => U(n.path) === q));
      box.innerHTML = groups.map(g => {
        if (q && !exact) {
          const hits = flatAll(g.rows).filter(n => U(n.path).includes(q)).slice(0, 60);
          return hits.length ? `<div class="grp">${esc(g.name)}</div>` + hits.map(n => `<div class="row abr" data-abp="${esc(n.path)}"><span class="nm grow">${esc(n.path)}</span><span class="ty">${esc(n.ty)}</span></div>`).join('') : '';
        }
        return `<div class="grp">${esc(g.name)}</div>` + (g.rows.length ? g.rows.map(rowH).join('') : `<div class="empty">${esc(g.empty)}</div>`);
      }).join('') || '<div class="empty">No tag, member or bit matches</div>';
      const on = box.querySelector('.row.on'); if (on) box.scrollTop = on.offsetTop - 40;
    };
    // the current alias opens its parents, as the reference does
    const openTo = p => { for (let i = 1; i < p.length; i++) if (p[i] === '.' || p[i] === '[') st.open.add(p.slice(0, i)); const bm = /^(.*)\.(\d+)$/.exec(p); if (bm && NBITS[addrType(bm[1])]) st.bits = bm[1]; };
    const show = () => { if (inp.value.trim()) openTo(inp.value.trim()); box.hidden = false; draw(); };
    box.addEventListener('mousedown', ev => { if (ev.target.closest('[data-abp],[data-abx],[data-abb]')) ev.preventDefault(); });
    box.addEventListener('click', ev => {
      const x = ev.target.closest('[data-abx]'), b = ev.target.closest('[data-abb]'), p = ev.target.closest('[data-abp]');
      if (x) { const k = x.dataset.abx; if (st.open.has(k)) st.open.delete(k); else st.open.add(k); draw(); return; }
      if (b) { st.bits = st.bits === b.dataset.abb ? null : b.dataset.abb; draw(); return; }
      if (p) { inp.value = p.dataset.abp; inp.dispatchEvent(new Event('input', { bubbles: true })); box.hidden = true; if (o.picked) o.picked(); }
    });
    inp.addEventListener('input', () => { if (!box.hidden) draw(); });
    return { show, hide: () => { box.hidden = true; }, toggle: () => (box.hidden ? show() : (box.hidden = true)) };
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
      const M = E.PREDEF[ty], g = t.alias ? io(t.alias) : 'tag', nb = { SINT: 8, INT: 16, DINT: 32 }[ty];
      if (M && !t.dim) M.forEach(m => add(`${t.name}.${m.name}`, m.type, '', scope, 0, g));
      if (nb && !t.dim) for (let b = 0; b < nb; b++) add(`${t.name}.${b}`, 'BOOL', '', scope, 0, g);
      if (t.dim && E.ATOMIC.includes(ty)) subsOf(t.dim).forEach(i => add(`${t.name}[${i}]`, ty, '', scope, 0, g));
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
    if (kind === 'routine') return curProg().routines.filter(r => r.name !== S.routine).map(r => ({ name: r.name, type: 'ROUTINE', desc: r.desc || (r.name === curProg().main ? 'Main routine' : '') })).filter(r => U(r.name).includes(q));
    if (kind === 'label') { const s = new Map(); rungs().forEach(r => { let m; const re = /\b(LBL|JMP)\((\w+)\)/gi; while ((m = re.exec(r.t))) { const k = U(m[2]); const o = s.get(k) || { name: m[2], lbl: false, jmp: false }; if (U(m[1]) === 'LBL') o.lbl = true; else o.jmp = true; s.set(k, o); } }); return [...s.values()].map(o => ({ name: o.name, type: 'LABEL', desc: o.lbl ? (o.jmp ? 'Label, jumped to' : 'Label') : 'Jump target, no LBL yet' })).filter(r => U(r.name).includes(q)); }
    if (PICKS[kind]) return PICKS[kind].list().filter(c => !q || U(c.name).includes(q) || U(c.desc).includes(q));
    if (kind === 'imm' || kind === 'order') return kind === 'order' ? ['REVERSE', 'WORD', 'HIGH/LOW'].map(n => ({ name: n, type: '', desc: '' })) : [];
    const types = KIND_TYPES[kind];
    let list = candidates();
    if (ARRK.includes(kind)) list = list.filter(c => /\[[\d,]+\]$/.test(c.name) && (!types || types.includes(c.type)));
    // SIZE: an array, or an element of one
    else if (kind === 'sarr') list = list.filter(c => c.dim || /\[[\d,]+\]$/.test(c.name));
    else if (types) list = list.filter(c => types.includes(c.type) && !c.dim);
    if (q) list = list.filter(c => U(c.name).includes(q)).sort((a, b) => (U(a.name).startsWith(q) ? 0 : 1) - (U(b.name).startsWith(q) ? 0 : 1));
    return list.slice(0, 120);
  }
  /* the tag list of the operand editor, in groups like the tag browser: a contact looks at the inputs first, a coil at the outputs */
  const GRPS = { in: 'Inputs', out: 'Outputs', tag: 'Tags', sys: 'System' };
  /* the tag list of the operand editor, like a tag browser (P5): groups that fold, a structure's members folded under
     it (opened by its arrow, or by typing a "."), the current tag marked */
  function groupedRows(list, kind, mn, cur, st) {
    const order = kind === 'expr' ? ['tag', 'in', 'out', 'sys'] : kind === 'bitw' || (INSTR[mn] && INSTR[mn].out) ? ['out', 'tag', 'in', 'sys'] : ['in', 'tag', 'out', 'sys'];
    const q = st.q || '';
    const hl = n => { const i = q ? U(n).indexOf(U(q)) : -1; return i < 0 ? esc(n) : esc(n.slice(0, i)) + '<mark>' + esc(n.slice(i, i + q.length)) + '</mark>' + esc(n.slice(i + q.length)); };
    const row = (c, sub) => `<div class="row${sub ? ' mem' : ''}${cur && U(c.name) === U(cur) ? ' on' : ''}" data-pick="${esc(c.name)}"><div class="grow"><div class="nm">${hl(sub ? c.name.slice(c.name.search(/[.[]/)) : c.name)}</div>${c.desc && !sub ? `<div class="sub">${esc(c.desc)}</div>` : ''}</div><span class="ty">${esc(c.type)}${c.dim ? '[' + c.dim + ']' : ''}</span></div>`;
    return order.filter(g => st.f === 'all' || st.f === g).map(g => {
      const its = list.filter(c => (c.grp || 'tag') === g);
      if (!its.length) return '';
      const shut = st.shut.has(g) && !q;
      let h = `<div class="grp sgg" data-sgg="${g}">${ic(shut ? 'right' : 'down')}${GRPS[g]} <small>${its.length}</small></div>`;
      if (shut) return h;
      const done = new Set();
      its.forEach(c => {
        const cut = c.name.search(/[.[]/), base = cut > 0 && !/^(Local|S):/i.test(c.name) ? c.name.slice(0, cut) : null;
        if (!base) { h += row(c); return; }
        if (done.has(base)) return;
        done.add(base);
        const kids = its.filter(x => U(x.name).startsWith(U(base) + '.') || U(x.name).startsWith(U(base) + '[')), open = st.open.has(base) || /[.[]/.test(q) || (cur && /^[.[]/.test(U(cur).slice(U(base).length)) && U(cur).startsWith(U(base)));
        const parent = candidates().find(x => U(x.name) === U(base));
        h += `<div class="row par" data-sexp="${esc(base)}"><div class="grow"><div class="nm">${ic(open ? 'down' : 'right')}${hl(base)}</div>${parent && parent.desc ? `<div class="sub">${esc(parent.desc)}</div>` : ''}</div><span class="ty">${esc(parent ? parent.type : '')} · ${kids.length}</span></div>`;
        if (open) kids.forEach(x => { h += row(x, true); });
      });
      return h;
    }).join('');
  }
  const RECENT_MAX = 8;
  function rememberTags(list) {
    const r = (S.prefs.recent || []).filter(x => !list.some(y => U(y) === U(x)));
    S.prefs.recent = list.concat(r).slice(0, RECENT_MAX); savePrefs();
  }
  const defaultType = kind => ({ bit: 'BOOL', bitw: 'BOOL', timer: 'TIMER', counter: 'COUNTER', struct: 'TIMER', control: 'CONTROL', str: 'STRING', strw: 'STRING', rtag: 'REAL', msg: 'MESSAGE' })[kind] || 'DINT';
  function openEditor(ri, path, focusIdx) {
    const elems = parsed(ri), e = elems && getEl(elems, path);
    if (!e || e.t === 'BR') return;
    let mn = e.t, ops = e.a.slice(), focus = focusIdx || 0;
    const names = () => L.OPN[mn] || (INSTR[mn] ? INSTR[mn].args.map((_, i) => 'Operand ' + i) : []);
    const fields = () => (INSTR[mn] ? INSTR[mn].args : []).map((k, i) => `<div class="frow"><label>${esc(names()[i] || 'Operand ' + i)}${k.endsWith('?') ? ' (optional)' : ''}</label><input class="inp mono" data-op="${i}"${i === focus ? ' autofocus' : ''} value="${esc(ops[i] == null ? (k.endsWith('?') ? '' : '?') : ops[i])}" autocomplete="off" spellcheck="false" autocapitalize="off" autocorrect="off"${k.replace('?', '') === 'imm' ? ' inputmode="decimal"' : ''} enterkeyhint="next"></div>`).join('');
    const el = dialog({
      title: `Rung ${ri} · ${mn}`, size: 'md', focus: true,
      body: `<div class="frow"><label>Instruction</label><input class="inp mono" id="mn" value="${esc(mn)}" list="mnlist" autocomplete="off" spellcheck="false"></div>
        <datalist id="mnlist">${Object.keys(INSTR).map(k => `<option value="${k}">${esc(INSTR[k].name)}</option>`).join('')}</datalist>
        <div id="ops">${fields()}</div><div class="errtx" id="ee"></div><div class="grp" id="sgh">Tags</div><div class="sgbar" id="sgbar"></div><div class="list" id="sg" style="max-height:${S.layout === 'phone' ? 'none' : '240px'};${S.layout === 'phone' ? '' : 'height:240px;'}border:1px solid var(--border);border-top:0"></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: accept }],
      noEnter: ev => ev.target.closest('#sg'),
    });
    const sg = el.querySelector('#sg'), sgh = el.querySelector('#sgh'), sgbar = el.querySelector('#sgbar');
    const st = { f: 'all', scope: 'all', shut: new Set(), open: new Set(), q: '', act: -1 };
    function showSug() {
      const k = INSTR[mn] ? (INSTR[mn].args[focus] || '').replace('?', '') : '';
      const inp = el.querySelector(`[data-op="${focus}"]`);
      const text = inp ? inp.value.trim() : '';
      // an operand that already names a tag shows the whole list with it marked, like the tag browser
      const word = k === 'expr' ? (/[A-Za-z_][\w.:\[\]]*$/.exec(text) || [''])[0] : null;
      if (k === 'expr') {
        const lst = suggest('expr', word || '').filter(c => U(c.name) !== U(word));
        st.q = word;
        sgbar.innerHTML = `<div class="sgchips">${['+', '-', '*', '/', 'MOD', '(', ')', '=', '<>', '<', '<=', '>', '>=', 'AND', 'OR', 'NOT', 'ABS(', 'SQR('].map(o => `<span class="chip" data-sgop="${esc(o)}">${esc(o)}</span>`).join('')}</div>`;
        sgh.textContent = word ? `Tags matching "${word}"` : 'Tags and operators: tap to add';
        sg.innerHTML = groupedRows(lst, 'expr', mn, '', st) || `<div class="empty">${word ? 'No matching tags' : 'Example: (Level * 2) + Offset'}</div>`;
        st.act = -1;
        return;
      }
      if (k === 'routine' || k === 'label' || k === 'order' || PICKS[k]) {
        PCTX = { mn, ops: [...el.querySelectorAll('[data-op]')].map(i => i.value) };
        const lst = suggest(k, text === '?' ? '' : text), all = lst.length ? lst : suggest(k, '');
        sgbar.innerHTML = '';
        sgh.textContent = k === 'routine' ? 'Routines of this program' : k === 'label' ? 'Labels in this routine' : PICKS[k] ? PICKS[k].title : 'Order modes';
        sg.innerHTML = all.map(c => `<div class="row${U(c.name) === U(text) ? ' on' : ''}" data-pick="${esc(c.name)}"><div class="grow"><div class="nm">${esc(c.name)}</div>${c.desc ? `<div class="sub">${esc(c.desc)}</div>` : ''}</div></div>`).join('') || `<div class="empty">${k === 'routine' ? 'No other routine: add one in the Controller Organizer (right-click the program, New Routine).' : k === 'label' ? 'No labels yet: type a name, then put LBL with the same name at the start of a rung.' : ''}</div>`;
        st.act = -1;
        return;
      }
      let list = suggest(k, text);
      const exact = list.some(c => U(c.name) === U(text));
      if (exact) list = suggest(k, '');
      st.q = exact || text === '?' ? '' : text;
      if (st.scope !== 'all') list = list.filter(c => (c.scope || 'Controller') === st.scope || c.scope === 'System');
      const tagKind = !['imm', 'routine', 'label', 'order', 'expr'].includes(k) && !PICKS[k];
      const pool = suggest(k, '');
      const rec = tagKind ? (S.prefs.recent || []).filter(n => pool.some(c => U(c.name) === U(n))) : [];
      const scopes = ['all', 'Controller', curProg().name];
      sgbar.innerHTML = tagKind ? `<div class="sgchips">${[['all', 'All'], ['in', 'Inputs'], ['out', 'Outputs'], ['tag', 'Tags'], ['sys', 'System']].map(([v, t]) => `<span class="chip${st.f === v ? ' on' : ''}" data-sgf="${v}">${t}</span>`).join('')}<select class="inp sgscope" data-sgs="1" aria-label="Scope">${scopes.map(v => `<option value="${esc(v)}"${st.scope === v ? ' selected' : ''}>${v === 'all' ? 'All scopes' : esc(v)}</option>`).join('')}</select></div>${rec.length ? `<div class="sgrec"><span class="muted">Recent:</span>${rec.map(n => `<span class="chip" data-pick="${esc(n)}">${esc(n)}</span>`).join('')}</div>` : ''}` : '';
      const known = !text || text === '?' || exact || !E.validName(text) || ['imm', 'routine', 'label', 'order', 'expr'].includes(k) || !!PICKS[k] || E.parseNumber(text);
      sgh.textContent = k === 'imm' ? 'A number (e.g. 5000)' : `Tags for ${names()[focus] || 'operand'}${KIND_TYPES[k] ? ' · ' + KIND_TYPES[k].join(', ') : ''}`;
      sg.innerHTML = (!known ? `<div class="row new" data-newtag="${esc(text)}">${ic('newtag')}<div class="grow"><div class="nm">New "${esc(text)}"</div><div class="sub">Create a ${defaultType(k)} tag${window.mtpsFS ? ' · Ctrl+W' : ''}</div></div></div>` : '') +
        groupedRows(list, k, mn, text, st) ||
        (known && k !== 'imm' ? '<div class="empty">No matching tags</div>' : '');
      const on = sg.querySelector('.row.on'); if (on) sg.scrollTop = on.offsetTop - sg.offsetTop - 40;
      st.act = -1;
    }
    // ↑ ↓ move through the tag list from the operand box; Enter picks the highlighted tag
    el.addEventListener('keydown', ev => {
      // Ctrl+W: New Tag for the name typed in the operand (as in the reference editor)
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'w') { ev.preventDefault(); ev.stopPropagation(); const nt = sg.querySelector('[data-newtag]'); if (nt) nt.click(); return; }
      if (!ev.target.closest('[data-op]') || !['ArrowDown', 'ArrowUp', 'Enter'].includes(ev.key)) return;
      const rows = [...sg.querySelectorAll('.row[data-pick], .row[data-sexp]')];
      if (ev.key === 'Enter') { if (st.act >= 0 && rows[st.act]) { ev.preventDefault(); ev.stopPropagation(); rows[st.act].click(); } return; }
      if (!rows.length) return;
      ev.preventDefault();
      st.act = Math.max(0, Math.min(rows.length - 1, st.act + (ev.key === 'ArrowDown' ? 1 : -1)));
      rows.forEach((r, i) => r.classList.toggle('act', i === st.act));
      rows[st.act].scrollIntoView({ block: 'nearest' });
    }, true);
    el.addEventListener('change', ev => { if (ev.target.dataset && ev.target.dataset.sgs) { st.scope = ev.target.value; showSug(); } });
    function readOps() { el.querySelectorAll('[data-op]').forEach(i => { ops[+i.dataset.op] = i.value.trim(); }); }
    function accept() {
      readOps();
      const m = U(el.querySelector('#mn').value.trim());
      if (!INSTR[m]) { el.querySelector('#ee').textContent = `"${m}" is not an instruction.`; return false; }
      if (TC.includes(m)) { if (!ops[2] || ops[2] === '?') ops[2] = '0'; }
      const d = INSTR[m], a = d.args.map((k, i) => (ops[i] == null || (ops[i] === '' && k !== 'ginst') ? (k.endsWith('?') ? null : '?') : ops[i])).filter(v => v !== null);
      rememberTags(a.filter((v, i) => v && v !== '?' && !E.parseNumber(v) && !['imm', 'routine', 'label', 'order', 'expr', ...PICKK].includes((d.args[i] || '').replace('?', ''))));
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
      const fl = ev.target.closest('[data-sgf]'); if (fl) { st.f = fl.dataset.sgf; showSug(); return; }
      const gg = ev.target.closest('[data-sgg]'); if (gg) { const g = gg.dataset.sgg; if (st.shut.has(g)) st.shut.delete(g); else st.shut.add(g); showSug(); return; }
      const sx = ev.target.closest('[data-sexp]'); if (sx) { const b = sx.dataset.sexp; if (st.open.has(b)) st.open.delete(b); else st.open.add(b); showSug(); return; }
      const p = ev.target.closest('[data-pick]');
      const opc = ev.target.closest('[data-sgop]');
      if (opc) { const inp = el.querySelector(`[data-op="${focus}"]`); if (inp) { const v = inp.value === '?' ? '' : inp.value, o = opc.dataset.sgop, sp = /[\w)]$/.test(v) && !/^[)]/.test(o) ? ' ' : ''; inp.value = v + sp + o + (/\($/.test(o) ? '' : ' '); inp.focus(); showSug(); } return; }
      if (p && INSTR[mn] && (INSTR[mn].args[focus] || '').replace('?', '') === 'expr') { const inp = el.querySelector(`[data-op="${focus}"]`); if (inp) { const v = inp.value === '?' ? '' : inp.value, w = (/[A-Za-z_][\w.:\[\]]*$/.exec(v) || [''])[0]; inp.value = v.slice(0, v.length - w.length) + p.dataset.pick + ' '; inp.focus(); showSug(); } return; }
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

  /* ---------- inline edit on the rung (reference: "Modify an Instruction") ----------
     A small combo box over the operand (or the mnemonic) with a tag drop-down (Alt+Down, or the arrow button).
     Enter accepts and goes on to the next operand, Tab accepts, Esc, scrolling or a click elsewhere drops the edit.
     A new mnemonic (morph) keeps the operands that fit it: TON(Tmr1,5000,0) to XIC keeps Tmr1. */
  const SEL_KIND = /^(routine|label|order|fmode|adim|gclass|ginst|gattr)$/;
  function fitsKind(v, k, was) {
    if (v == null || v === '' || v === '?') return true;
    if (k === 'expr' || k === 'num') return true;
    if (k === 'imm') return !!E.parseNumber(v);
    if (SEL_KIND.test(k)) return k === was;
    return isTagText(v) || /^Local:/i.test(v) || /^S:/i.test(v);
  }
  function morphOps(old, m) {
    const was = INSTR[old.t] ? INSTR[old.t].args : [];
    const blank = (k, i) => (k.endsWith('?') ? null : TC.includes(m) && i === 2 ? '0' : '?');
    return INSTR[m].args.map((k, i) => { const v = old.a[i]; if (v == null) return blank(k, i); return fitsKind(v, k.replace('?', ''), (was[i] || '').replace('?', '')) ? v : blank(k, i); }).filter(v => v !== null);
  }
  const inlRect = (ri, path, op) => {
    const w = $('#ladwrap'); if (!w) return null;
    const q = `rect.tap[data-ri="${ri}"][data-p="${path.join('.')}"]`;
    return (op === 'mn' ? null : w.querySelector(`${q}[data-opi="${op}"]`)) || [...w.querySelectorAll(q)].find(r => !r.dataset.opi && !r.dataset.br && !r.dataset.leg) || null;
  };
  function inlineEdit(ri, path, op, typed) {
    if (!editable()) return false;
    const els = parsed(ri), e = els && getEl(els, path);
    if (!e || e.t === 'BR') return false;
    const mn = op === 'mn', d = INSTR[e.t];
    if (!mn && (!d || op >= d.args.length)) return false;
    S.sel = mn ? { ri, path } : { ri, path, op }; S.selRung = null;
    if (S.layout === 'phone') S.area = 'ladder';
    render();
    let r = inlRect(ri, path, op);
    if (!r) return false;
    r.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    r = inlRect(ri, path, op);
    const b = r.getBoundingClientRect(), touch = S.layout !== 'desktop';
    const H = touch ? 44 : 24, W = Math.min(innerWidth - 12, Math.max(b.width + (touch ? 24 : 12), touch ? 220 : 160));
    const x = Math.max(6, Math.min(innerWidth - W - 6, b.left + b.width / 2 - W / 2));
    const y = Math.max(6, Math.min(innerHeight - H - 6, b.top + b.height / 2 - H / 2));
    const kind = mn ? 'mn' : (d.args[op] || '').replace('?', '');
    const cur = mn ? e.t : e.a[op] == null ? '' : String(e.a[op]);
    const start = typed != null ? typed : cur === '?' ? '' : cur;
    const up = y + H + (touch ? 5 * 44 : 8 * 26) > innerHeight - 6;
    const l = $('#layer');
    l.innerHTML = `<div class="scrim clear" data-iscrim="1"></div><div class="inled${up ? ' up' : ''}" id="inled" style="left:${x}px;top:${y}px;width:${W}px" role="combobox" aria-expanded="false">
      <div class="inrow"><input class="inp mono" id="inl" value="${esc(start)}" autocomplete="off" spellcheck="false" autocapitalize="off" autocorrect="off" enterkeyhint="next" aria-label="${esc(mn ? 'Instruction' : (L.OPN[e.t] || [])[op] || 'Operand')}"${kind === 'imm' ? ' inputmode="decimal"' : ''}><button class="ib" id="inldd" type="button" title="Browse (Alt+Down)" aria-label="Browse">${ic('down')}</button></div>
      <div class="inlist" id="inlist" role="listbox" hidden></div><div class="inerr" id="inerr" hidden></div></div>`;
    layerAt = performance.now();
    const box = $('#inled'), inp = $('#inl'), list = $('#inlist'), er = $('#inerr');
    let act = -1;
    const rowsOf = () => [...list.querySelectorAll('[data-ipk]')];
    const items = () => {
      const t = inp.value.trim(), q = U(t);
      if (mn) return Object.keys(INSTR).filter(k => !q || k.startsWith(q) || U(NAME(k)).includes(q)).sort((a, c) => (a.startsWith(q) ? 0 : 1) - (c.startsWith(q) ? 0 : 1) || a.localeCompare(c)).map(k => ({ name: k, type: '', desc: NAME(k) }));
      // the whole list for the operand's type while the text is the current operand, the matches while typing
      PCTX = { mn: e.t, ops: e.a };
      const all = suggest(kind, ''), m = !q || all.some(c => U(c.name) === q) && q === U(cur) ? all : suggest(kind, t);
      return m;
    };
    const draw = () => {
      const its = items().slice(0, 150);
      list.innerHTML = its.length ? its.map((c, i) => `<div class="row${i === act ? ' act' : ''}${U(c.name) === U(inp.value.trim()) ? ' on' : ''}" data-ipk="${esc(c.name)}" role="option"><div class="grow"><div class="nm">${esc(c.name)}</div>${c.desc ? `<div class="sub">${esc(c.desc)}</div>` : ''}</div>${c.type ? `<span class="ty">${esc(c.type)}${c.dim ? '[' + c.dim + ']' : ''}</span>` : ''}</div>`).join('')
        : `<div class="empty">${kind === 'imm' ? 'Type a number, e.g. 5000' : mn ? 'No instruction starts with that' : 'No matching tags: type a new name, then New Tag (Ctrl+W)'}</div>`;
    };
    const openList = on => { list.hidden = !on; box.setAttribute('aria-expanded', on ? 'true' : 'false'); if (on) { act = -1; draw(); const o = list.querySelector('.row.on'); if (o) o.scrollIntoView({ block: 'nearest' }); } };
    const fail = m => { er.textContent = m; er.hidden = false; inp.classList.add('bad'); inp.focus(); return false; };
    const accept = next => {
      const v = inp.value.trim();
      const els2 = parsed(ri), x2 = els2 && getEl(els2, path);
      if (!x2 || x2.t === 'BR') { closeLayer(); return true; }
      if (mn) {
        const m = U(v);
        if (!INSTR[m]) return fail(`"${v}" is not an instruction.`);
        closeLayer();
        if (m !== x2.t) edit(() => { const a = parsed(ri), x = getEl(a, path); x.a = morphOps(x, m); x.t = m; writeRung(ri, a); S.sel = { ri, path }; S.selRung = null; });
        return true;
      }
      const dd = INSTR[x2.t], ops = x2.a.slice();
      ops[op] = v;
      const a2 = dd.args.map((k, i) => (ops[i] == null || (ops[i] === '' && k !== 'ginst') ? (k.endsWith('?') ? null : '?') : ops[i])).filter(z => z !== null);
      closeLayer();
      if (a2.join('\u0001') !== x2.a.join('\u0001')) {
        if (v && v !== '?' && isTagText(v) && !SEL_KIND.test(kind) && kind !== 'imm' && kind !== 'expr') rememberTags([v]);
        edit(() => { const a = parsed(ri), x = getEl(a, path); x.a = a2; writeRung(ri, a); S.sel = { ri, path, op }; S.selRung = null; });
      } else { S.sel = { ri, path, op }; render(); }
      if (next && op + 1 < dd.args.length) setTimeout(() => inlineEdit(ri, path, op + 1), 0);
      return true;
    };
    const cancel = () => { closeLayer(); render(); };
    const pick = name => { inp.value = name; openList(false); accept(true); };
    inp.addEventListener('input', () => { er.hidden = true; inp.classList.remove('bad'); openList(true); });
    $('#inldd').addEventListener('click', () => { openList(list.hidden); inp.focus(); });
    list.addEventListener('click', ev => { const rw = ev.target.closest('[data-ipk]'); if (rw) pick(rw.dataset.ipk); });
    // a click (a press) anywhere else, or scrolling, drops the edit
    const sc = l.querySelector('[data-iscrim]');
    sc.addEventListener('pointerdown', ev => { if (!freshLayer()) { ev.preventDefault(); cancel(); } });
    sc.addEventListener('wheel', () => cancel(), { passive: true });
    // the wheel over the combo itself scrolls the ladder under it too: only the tag list scrolls in place
    box.addEventListener('wheel', ev => { if (!ev.target.closest('#inlist')) cancel(); }, { passive: true });
    l.onclick = null;
    layerKey = ev => {
      if (ev.key === 'Escape') { ev.preventDefault(); cancel(); return; }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'w' && !mn) { ev.preventDefault(); const n = inp.value.trim(); closeLayer(); newTag({ name: E.validName(n) ? n : '', kind, after: () => render() }); return; }
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (list.hidden) { if (ev.key === 'ArrowDown') openList(true); return; }
        if (ev.altKey) { openList(false); return; }
        const rows = rowsOf(); if (!rows.length) return;
        act = Math.max(0, Math.min(rows.length - 1, act + (ev.key === 'ArrowDown' ? 1 : -1)));
        rows.forEach((rw, i) => rw.classList.toggle('act', i === act));
        rows[act].scrollIntoView({ block: 'nearest' });
        return;
      }
      if (ev.key === 'Enter') { ev.preventDefault(); const rows = rowsOf(); if (!list.hidden && act >= 0 && rows[act]) pick(rows[act].dataset.ipk); else accept(!(ev.ctrlKey || ev.metaKey)); return; }
      if (ev.key === 'Tab') { ev.preventDefault(); accept(false); }
    };
    if (touch) openList(true);
    inp.focus();
    if (typed != null) inp.setSelectionRange(inp.value.length, inp.value.length); else inp.select();
    if (typed != null && !touch) openList(true);
    return true;
  }
  const inlineOpen = () => !!$('#inled');

  /* ---------- tags ---------- */
  /* External Access and Style (radix), as in the New Tag dialog and the Tag Editor of the reference (help: New Parameter
     or Tag dialog box, Tag Editor columns; L5X attributes ExternalAccess and Radix, 1756-RM014). A structure has no
     style; a REAL shows Float or Exponential; an integer or BOOL Binary, Octal, Decimal, Hex (integers also ASCII). */
  const ACCESS = ['Read/Write', 'Read Only', 'None'];
  const baseTy = ty => String(ty || 'BOOL').replace(/\[.*$/, '');
  const stylesOf = ty => { const b = U(baseTy(ty)); return b === 'REAL' || b === 'LREAL' ? ['Float', 'Exponential'] : b === 'BOOL' ? ['Binary', 'Octal', 'Decimal', 'Hex'] : ['SINT', 'INT', 'DINT'].includes(b) ? ['Binary', 'Octal', 'Decimal', 'Hex', 'ASCII'] : b === 'LINT' ? ['Binary', 'Octal', 'Decimal', 'Hex', 'ASCII', 'Date/Time', 'Date/Time (ns)'] : []; };
  const defStyle = ty => (/^L?REAL$/.test(U(baseTy(ty))) ? 'Float' : stylesOf(ty).length ? 'Decimal' : '');
  const styleOfTag = (t, ty) => { const l = stylesOf(ty || (t && t.type)); return t && l.includes(t.style) ? t.style : defStyle(ty || (t && t.type)); };
  const accessOf = t => (t && ACCESS.includes(t.access) ? t.access : 'Read/Write');
  /* a value as its Style shows it (1756-RM014, Data display style: 15 in an INT is 2#0000_0000_0000_1111, 8#000_017,
     16#000F, '$00$0F', 1.5000000e+01); null for Decimal and Float, which show the number as it is */
  const BITW = { SINT: 8, INT: 16, DINT: 32, LINT: 64 };
  const grp_ = (x, n) => x.replace(new RegExp(`\\B(?=(\\w{${n}})+$)`, 'g'), '_');
  function styled(v, ty, st) {
    if (typeof v !== 'number' || !st || st === 'Decimal' || st === 'Float') return null;
    if (/^Date\/Time/.test(st)) return dateTime(v, st !== 'Date/Time');
    if (st === 'Exponential') { const [m, e] = v.toExponential(7).split('e'); return m + 'e' + (e[0] === '-' ? '-' : '+') + e.replace(/^[+-]/, '').padStart(2, '0'); }
    const w = BITW[U(ty)];
    if (!w || !Number.isInteger(v)) return null;
    const u = BigInt.asUintN(w, BigInt(v));
    if (st === 'Hex') return '16#' + grp_(u.toString(16).toUpperCase().padStart(w / 4, '0'), 4);
    if (st === 'Binary') return '2#' + grp_(u.toString(2).padStart(w, '0'), 4);
    if (st === 'Octal') return '8#' + grp_(u.toString(8).padStart(Math.ceil(w / 3), '0'), 3);
    if (st === 'ASCII') { let x = ''; for (let k = w / 8 - 1; k >= 0; k--) { const c = Number((u >> BigInt(8 * k)) & 255n); x += c === 36 ? '$$' : c === 39 ? "$'" : c > 31 && c < 127 ? String.fromCharCode(c) : '$' + c.toString(16).toUpperCase().padStart(2, '0'); } return `'${x}'`; }
    return null;
  }
  const fmtSt = (v, ty, t) => (t && !t.alias && !t.dim && styled(v, ty, styleOfTag(t, ty))) || fmtVal(v);
  // the base tag of an alias (the last link of the chain), whose External Access and Constant the alias shows
  const aliasBase = a => { const x = baseTagOf(a) || '', b = /^([A-Za-z_]\w*)/.exec(x), t = b && !/^Local:/i.test(x) ? tagFor(b[1]) : null; return t && !t.alias ? t : null; };
  /* the L5X attributes of a base tag, and back; Dimensions="10" or "4 5" (also read with commas or brackets) */
  const l5xDims = t => (E.dimN(t.dim) ? ` Dimensions="${E.dimText(t.dim).replace(/,/g, ' ')}"` : '');
  const l5xDimsIn = g => { const a = String(g.getAttribute('Dimensions') || '').replace(/[[\]]/g, '').split(/[\s,]+/).filter(Boolean).map(Number), d = E.dimsOf(a); return !d || !d.length ? 0 : d.length === 1 ? d[0] : d; };
  const l5xAttrs = (t, x) => { const st = styleOfTag(t); return `${st ? ` Radix="${st}"` : ''} Constant="${t.constant ? 'true' : 'false'}" ExternalAccess="${x(accessOf(t))}"`; };
  function l5xTagIn(g, o) {
    const ra = g.getAttribute('Radix'), ea = g.getAttribute('ExternalAccess');
    if (ra && stylesOf(o.type).includes(ra) && ra !== defStyle(o.type)) o.style = ra;
    if (ea && ACCESS.includes(ea) && ea !== 'Read/Write') o.access = ea;
    if (g.getAttribute('Constant') === 'true' && !o.alias) o.constant = true;
    return o;
  }
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
        <div class="frow" id="ra"${t0.alias ? '' : ' hidden'}><label>Alias For</label><span class="afor"><input class="inp mono" id="ta" value="${esc(t0.alias || '')}" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="Local:1:I.Data.0"><button class="btn" id="tab" type="button" title="Browse tags">${ic('down')}</button></span></div>
        <div class="asg abrw" id="asg" hidden></div>
        <div class="frow" id="rat"${t0.alias ? '' : ' hidden'}><label>Data Type</label><span class="mono" id="tat"></span></div>
        <div class="frow" id="rt"${t0.alias ? ' hidden' : ''}><label for="tt">Data Type</label><span class="afor"><input class="inp mono" id="tt" value="${esc(tyDims(t0.type || 'BOOL', t0.dim))}" list="ttl" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="Data Type"><button class="btn" id="ttb" type="button" title="Select Data Type (with the array dimensions)" aria-label="Select Data Type">…</button></span><datalist id="ttl">${types.map(t => `<option value="${t}">`).join('')}</datalist></div>
        <div class="frow"><label>Scope</label><select class="inp" id="ts"${edit0 ? ' disabled' : ''}><option value="">Controller (${esc(S.p.controller.name)})</option>${allProgs().map(g => `<option value="${esc(g.name)}"${(o.scope || P.name) === g.name ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
        <div class="frow"><label>External Access</label><select class="inp" id="tea">${ACCESS.map(a => `<option${a === accessOf(t0) ? ' selected' : ''}>${a}</option>`).join('')}</select></div>
        <div class="frow"><label>Style</label><select class="inp" id="tsty"></select></div>
        <div class="frow ckrow"><label for="tcon">Constant</label><input type="checkbox" id="tcon"${t0.constant ? ' checked' : ''}></div>
        ${edit0 ? '' : '<div class="frow ckrow"><label for="tocf">Open Configuration</label><input type="checkbox" id="tocf" disabled title="Opens the configuration of a data type that has one (MESSAGE, PID, AXIS…) after Create. No data type of this app has one."></div>'}
        <div class="errtx" id="te"></div>`,
      mount: el => {
        const ta = el.querySelector('#ta'), asg = el.querySelector('#asg'), tat = el.querySelector('#tat');
        const br = aliasBrowser(asg, ta, { self: edit0 && edit0.name, scope: () => el.querySelector('#ts').value || (edit0 && o.list !== S.p.tags ? (allProgs().find(g => g.tags === o.list) || {}).name : '') });
        const showType = () => { const v = ta.value.trim(), ty = v ? addrType(v) : null; tat.textContent = !v ? '-' : ty || 'not a tag, member or bit of this project'; tat.classList.toggle('bad', !!v && !ty); };
        // Style lists the display formats of the data type; an alias takes External Access, Constant and its data type
        // from its base tag, so those boxes are greyed (help: Tag Editor columns, Alias For)
        const sty = el.querySelector('#tsty'), ea = el.querySelector('#tea'), con = el.querySelector('#tcon');
        let styWant = t0.alias ? '' : styleOfTag(t0);
        const sync = () => {
          const a = el.querySelector('#tk').value === 'alias', ty = a ? addrType(ta.value.trim()) || '' : el.querySelector('#tt').value.trim(), l = stylesOf(ty), b = a ? aliasBase(ta.value.trim()) : null;
          if (sty.value) styWant = sty.value;
          sty.innerHTML = l.map(x => `<option${x === (l.includes(styWant) ? styWant : defStyle(ty)) ? ' selected' : ''}>${x}</option>`).join('');
          sty.disabled = a || !l.length; ea.disabled = a; con.disabled = a;
          if (a) { ea.value = accessOf(b); con.checked = !!(b && b.constant); }
        };
        el.querySelector('#tk').onchange = ev => { const a = ev.target.value === 'alias'; el.querySelector('#ra').hidden = !a; el.querySelector('#rat').hidden = !a; el.querySelector('#rt').hidden = a; if (a) { br.show(); ta.focus(); } else { br.hide(); ea.value = accessOf(t0.alias ? null : t0); con.checked = !t0.alias && !!t0.constant; } sync(); };
        ta.addEventListener('input', () => { showType(); sync(); }); ta.addEventListener('focus', () => br.show());
        el.querySelector('#tt').addEventListener('input', sync);
        el.querySelector('#ttb').onclick = () => selectDataType(el.querySelector('#tt').value, v => { el.querySelector('#tt').value = v; sync(); });
        el.querySelector('#tab').onclick = () => br.toggle();
        showType(); sync();
      },
      buttons: [{ l: 'Cancel' }, { l: edit0 ? 'OK' : 'Create', pri: true, run: el => {
        const name = el.querySelector('#tn').value.trim(), scope = el.querySelector('#ts').value, alias = el.querySelector('#tk').value === 'alias';
        const err = m => { el.querySelector('#te').textContent = m; return false; };
        if (!E.validName(name)) return err('Tag names: letters, digits and _, starting with a letter or _, up to 40 characters, no two _ in a row and no _ at the end.');
        const list = edit0 ? o.list : scope ? allProgs().find(g => g.name === scope).tags : S.p.tags;
        if (!edit0 && list.some(t => U(t.name) === U(name))) return err(`A tag named ${name} already exists in this scope.`);
        const t = { name, desc: el.querySelector('#td').value.trim() };
        if (alias) {
          t.alias = el.querySelector('#ta').value.trim().replace(/^local:/i, 'Local:').replace(/^(Local:\d+:)([icos])/, (m, a, b) => a + b.toUpperCase());
          if (!t.alias) return err('Alias For: pick the tag, member or bit this alias points to (Browse).');
          if (U(t.alias.split(/[.[]/)[0]) === U(name)) return err('A tag cannot be an alias for itself.');
          if (!addrType(t.alias)) return err(/^Local:/i.test(t.alias) ? `Alias For: ${t.alias} is not an I/O point of this project. I/O tags are Local:<slot>:I or O, then .Data.<bit> (digital) or .Ch<n>Data (analog), for a module in the I/O Configuration.` : `Alias For: ${t.alias} is not a tag, member or bit of this project.`);
        }
        else {
          const dt = parseDataType(el.querySelector('#tt').value);
          if (typeof dt === 'string') return err(dt);
          t.type = dt.type; if (dt.dim) t.dim = dt.dim;
          const acc = el.querySelector('#tea').value, st = el.querySelector('#tsty').value;
          if (acc !== 'Read/Write') t.access = acc;
          if (st && st !== defStyle(t.type)) t.style = st;
          if (el.querySelector('#tcon').checked) t.constant = true;
        }
        if (!t.desc) delete t.desc;
        if (edit0 && edit0.value !== undefined && !alias && t.type === edit0.type && E.dimText(t.dim) === E.dimText(edit0.dim)) t.value = edit0.value;
        const ok = edit(() => { if (edit0) list.splice(list.indexOf(edit0), 1, t); else list.push(t); });
        if (!ok) return false;
        toast(edit0 ? `Tag ${name} changed` : `Tag ${name} created`);
        if (o.after) setTimeout(o.after, 0);
      } }],
    });
  }
  /* the data types a tag can have (atomic, predefined, user-defined), and the Data Type text of the reference:
     DINT, DINT[10], DINT[4,5], DINT[2,3,4] → { type, dim } or the reason it is not one */
  const tagTypes = () => E.ATOMIC.concat(Object.keys(E.PREDEF), (S.p.dataTypes || []).map(d => d.name));
  function parseDataType(txt) {
    const m = /^\s*([A-Za-z_]\w*)\s*(?:\[\s*([^\]]*)\])?\s*$/.exec(String(txt || ''));
    if (!m) return 'Data Type: type a data type, e.g. DINT, DINT[10] or DINT[4,5] (or use … to select it).';
    const ty = tagTypes().find(x => U(x) === U(m[1]));
    if (!ty) return `Data Type: '${m[1]}' is not a data type of this project.`;
    if (m[2] == null) return { type: ty, dim: 0 };
    const a = m[2].split(',').map(x => x.trim()), d = E.dimsOf(a.map(Number));
    if (!d || !d.length || a.some(x => !/^\d+$/.test(x))) return 'Data Type: an array has 1, 2 or 3 dimensions, each a whole number of 1 or more, e.g. DINT[4,5].';
    return { type: ty, dim: d.length === 1 ? d[0] : d };
  }
  /* Select Data Type (the … beside Data Type), as in the reference: the list of data types with the box above it that
     filters it, Show Data Types by Groups, and the Array Dimensions Dim 2, Dim 1, Dim 0 (Dim 1 is open when Dim 0 is
     more than 0, Dim 2 when Dim 1 is). The data type shows them as [Dim 2, Dim 1, Dim 0]. It opens over the dialog
     that asked for it and gives the text back to done(). */
  function selectDataType(cur, done, cancel) {
    const l = $('#layer'), was = { key: layerKey, click: l.onclick };
    const pd = parseDataType(cur), d0 = typeof pd === 'string' ? { type: String(cur || '').replace(/\[.*$/, '').trim(), dim: 0 } : pd;
    const ds = (E.dimsOf(d0.dim) || []).slice().reverse();   // [Dim 0, Dim 1, Dim 2]
    const user = (S.p.dataTypes || []).map(x => x.name);
    const scrim = document.createElement('div'), el = document.createElement('div');
    scrim.className = 'scrim sdtscrim';
    el.className = 'dlg sdt'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Select Data Type');
    const dimIn = n => `<label class="sdim"><span>Dim ${n}</span><input class="inp" type="number" min="0" inputmode="numeric" id="sdd${n}" value="${ds[n] || 0}" aria-label="Dim ${n}"></label>`;
    el.innerHTML = `<div class="dh"><b>Select Data Type</b><button class="ib" data-sdc="1" title="Close" aria-label="Close">${ic('close')}</button></div>
      <div class="db"><label class="sdlab" for="sdq">Data Types:</label><input class="inp mono" id="sdq" value="${esc(d0.type)}" autocomplete="off" spellcheck="false" autocapitalize="off">
        <div class="list sdtl" id="sdl" role="listbox" aria-label="Data Types"></div>
        <label class="ck"><input type="checkbox" id="sdg"> Show Data Types by Groups</label>
        <fieldset class="sdd"><legend>Array Dimensions</legend>${dimIn(2)}${dimIn(1)}${dimIn(0)}</fieldset><div class="errtx" id="sde"></div></div>
      <div class="df"><button class="btn" data-sdc="1">Cancel</button><button class="btn pri" data-sdo="1">OK</button></div>`;
    l.appendChild(scrim); l.appendChild(el);
    const q = el.querySelector('#sdq'), list = el.querySelector('#sdl'), D = n => el.querySelector('#sdd' + n);
    const draw = () => {
      const f = U(q.value.trim()), all = tagTypes(), exact = all.some(x => U(x) === f), hit = x => !f || exact || U(x).includes(f);
      const row = x => `<div class="row${U(x) === f ? ' on' : ''}" data-sdt="${esc(x)}" role="option"><span class="nm grow">${esc(x)}</span></div>`;
      const groups = [['Predefined', all.filter(x => !user.includes(x))], ['User-Defined', user]];
      list.innerHTML = el.querySelector('#sdg').checked ? groups.map(([g, xs]) => (xs.filter(hit).length ? `<div class="grp">${g}</div>` + xs.filter(hit).map(row).join('') : '')).join('')
        : all.filter(hit).slice().sort((a, b) => a.localeCompare(b)).map(row).join('') || '<div class="empty">No data type matches</div>';
      const on = list.querySelector('.row.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    };
    const dims = () => {
      D(1).disabled = !(+D(0).value > 0); if (D(1).disabled) D(1).value = 0;
      D(2).disabled = !(+D(1).value > 0); if (D(2).disabled) D(2).value = 0;
    };
    const close = () => { scrim.remove(); el.remove(); layerKey = was.key; l.onclick = was.click; };
    const ok = () => {
      const ty = tagTypes().find(x => U(x) === U(q.value.trim()));
      if (!ty) { el.querySelector('#sde').textContent = `'${q.value.trim()}' is not a data type of this project.`; return; }
      const v = [2, 1, 0].map(n => Math.floor(+D(n).value) || 0);
      if (v.some(x => x < 0)) { el.querySelector('#sde').textContent = 'A dimension is a whole number, 0 or more.'; return; }
      const used = v.filter(x => x > 0);
      close(); done(ty + (used.length ? '[' + used.join(',') + ']' : ''));
    };
    l.onclick = ev => {
      if (!el.contains(ev.target)) return;
      if (ev.target.closest('[data-sdc]')) { close(); if (cancel) cancel(); return; }
      if (ev.target.closest('[data-sdo]')) { ok(); return; }
      const r = ev.target.closest('[data-sdt]'); if (r) { q.value = r.dataset.sdt; draw(); }
    };
    list.addEventListener('dblclick', ev => { const r = ev.target.closest('[data-sdt]'); if (r) { q.value = r.dataset.sdt; ok(); } });
    q.addEventListener('input', draw);
    el.querySelector('#sdg').addEventListener('change', draw);
    [0, 1, 2].forEach(n => D(n).addEventListener('input', dims));
    layerKey = ev => { if (ev.key === 'Escape') { ev.preventDefault(); close(); if (cancel) cancel(); } else if (ev.key === 'Enter') { ev.preventDefault(); ok(); } };
    dims(); draw();
    setTimeout(() => { q.focus(); q.select(); }, 0);
  }
  /* the description of an operand: the tag's own description when the operand is the tag; otherwise (an I/O address,
     a member such as Timer.DN, a bit) an operand description kept with the project, as the reference allows */
  const opDesc = op => { const k = U(String(op || '')); const c = S.p.comments && S.p.comments[k]; if (c) return c; const t = tagFor(op); return t ? t.desc || '' : ''; };
  const selOpIdx = () => (S.sel && S.sel.op != null ? S.sel.op : 0);
  const selOperand = () => { const e = curEl(); return e && e.a ? e.a[selOpIdx()] : undefined; };
  const isTagText = a => !!a && a !== '?' && /^[A-Za-z_]\w*$/.test(String(a).split(/[.[]/)[0]) && !E.parseNumber(a);
  function editDesc() {
    const op = selOperand();
    if (!op || op === '?') return;
    const t = tagFor(op), own = t && U(t.name) === U(op);
    openDescBar(`Description For: ${op}`, own ? t.desc || '' : (S.p.comments || {})[U(op)] || '', v => {
      if (own) { const P = curProg(); const list = P.tags.includes(t) ? P.tags : S.p.tags; edit(() => { const i = list.indexOf(t); list[i] = { ...list[i], desc: v }; if (!v) delete list[i].desc; }); return; }
      edit(() => { S.p.comments = S.p.comments || {}; if (v) S.p.comments[U(op)] = v; else delete S.p.comments[U(op)]; });
    });
  }
  /* the description and rung comment editors, as in the reference: a bar above the ladder ("Description For: tag",
     "Rung Comment For Rung: n") with a check mark to keep the text and a cross to drop it */
  function descBarHTML() {
    const d = S.descEd;
    if (!d) return '';
    return `<div class="descbar${d.rung ? ' rungbar' : ''}" id="descbar"><div class="dbh"><span class="ell">${esc(d.title)}</span><button class="ib dok" data-desc="ok" title="Accept (Ctrl+Enter)" aria-label="Accept">${ic('check')}</button><button class="ib dno" data-desc="x" title="Cancel (Esc)" aria-label="Cancel">${ic('close')}</button></div><textarea class="inp${d.rung ? ' mono' : ''}" id="desctx" rows="${d.rung ? 2 : 3}" spellcheck="false" autocapitalize="off" autocorrect="off" aria-label="${esc(d.title)}">${esc(d.value)}</textarea>${d.err ? `<div class="errtx" id="descerr">${esc(d.err)}</div>` : ''}</div>`;
  }
  /* o.rung: the Rung Text Edit Bar (the rung's ASCII text, monospaced, Enter accepts too); save may return an error
     text, which keeps the bar open with the text the user typed */
  function openDescBar(title, value, save, o) {
    if (S.layout === 'phone') S.area = 'ladder';
    S.descEd = { title, value, save, rung: !!(o && o.rung) };
    render();
    const tx = $('#desctx'); if (tx) { tx.focus(); if (o && o.rung) tx.setSelectionRange(tx.value.length, tx.value.length); else tx.select(); }
  }
  function closeDescBar(ok) {
    const d = S.descEd; if (!d) return;
    const tx = $('#desctx'), v = (tx ? tx.value : d.value).trim();
    S.descEd = null;
    const err = ok ? d.save(v) : null;
    if (typeof err === 'string' && err) {
      S.descEd = { ...d, value: v, err };
      render();
      const nt = $('#desctx'); if (nt) nt.focus();
      return;
    }
    render();
  }
  const fmtVal = v => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(+v.toPrecision(7))) : v === undefined ? '' : String(v));
  /* the rows of the tag editor, as in the reference: at controller scope the module-defined tags of each module in
     the I/O Configuration come first (Local:<slot>:C, :I and :O, made with the module, read-only, gone with it), then
     the project's tags. A structure opens to its members, an array to its elements, an integer to its bits. */
  function tagKids(path, ty, dim) {
    if (E.dimN(dim)) return subsOf(dim).map(i => ({ path: `${path}[${i}]`, ty, dim: 0 }));
    const mem = membersOf(ty);
    if (mem) return mem.map(m => ({ path: `${path}.${m.name}`, ty: m.type, dim: m.dim || 0 }));
    if (NBITS[ty]) return Array.from({ length: NBITS[ty] }, (_, b) => ({ path: `${path}.${b}`, ty: 'BOOL', dim: 0 }));
    return null;
  }
  function moduleTags() {
    const out = [];
    S.p.rack.modules.slice().sort((a, b) => a.slot - b.slot).forEach(m => { const d = E.MODULES[m.type]; if (d) ['C', 'I', 'O', 'S'].forEach(k => { if (d[k]) out.push({ path: `Local:${m.slot}:${k}`, ty: d[k], dim: 0, mod: m }); }); });
    return out;
  }
  const scopeTags = scope => (scope ? allProgs().find(g => g.name === scope).tags : S.p.tags);
  // calls fn(entry, depth, kids, open) for each row shown: the tags, then the members of the open ones
  function tagWalk(scope, q, fn) {
    const qq = U(q || ''), hit = (n, d) => tagHit(qq, n, d), sh = showFilter(scope);
    const top = (scope ? [] : moduleTags().filter(x => hit(x.path) && sh(x)))
      .concat(scopeTags(scope).filter(t => hit(t.name, t.desc)).map(t => ({ path: t.name, ty: typeOf(t), dim: t.dim || 0, t })).filter(sh));
    const go = (e, depth) => {
      const kids = tagKids(e.path, e.ty, e.dim), open = !!kids && S.tagOpen.has(scope + '|' + e.path);
      fn(e, depth, kids, open);
      if (open) kids.forEach(k => go({ ...k, mod: e.mod, member: true }, depth + 1));
    };
    top.forEach(e => go(e, 0));
  }
  const tyText = e => (e.t ? tyDims(e.t.alias || !e.t.type ? e.ty : e.t.type, e.t.dim) : tyDims(e.ty, e.dim));
  const aggr = e => !!E.dimN(e.dim) || !!membersOf(e.ty) || /\[[\d,]+\]$/.test(e.ty);
  function tagRows(mode, scope, q) {
    const rows = [];
    tagWalk(scope || '', q, (e, depth, kids, open) => {
      const v = aggr(e) && !strRow(e) ? null : rowVal(e.path, e.ty, scope, e.t);
      const sub = e.t ? (e.t.alias ? '<' + e.t.alias + '>  ' : '') + (e.t.desc || '') : !e.member && e.mod ? `[${e.mod.slot}] ${e.mod.name} (module-defined)` : '';
      rows.push(`<div class="row${depth ? ' mem' : ''}${e.mod ? ' modtag' : ''}" data-tag="${esc(e.path)}" data-ty="${esc(e.ty)}"${e.mod ? ' data-mod="1"' : ''}${depth ? ` style="padding-left:${20 + depth * 18}px"` : ''}><span class="exp"${kids ? ` data-texp="${esc(e.path)}"` : ''}>${kids ? ic(open ? 'down' : 'right') : ''}</span><div class="grow"><div class="nm">${esc(e.path)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
        ${mode === 'mon' && v ? `<span class="val${v.cls}" data-tv="${esc(e.path)}">${esc(v.t)}</span>` : ''}<span class="ty">${esc(tyText(e))}</span></div>`);
    });
    return rows.join('') || '<div class="empty">No tags yet. Use + to add one.</div>';
  }
  function rowVal(path, ty, scope, t) {
    const sv = strVal(path, ty, scope, t); if (sv) return sv;
    if (S.online && ctl.M) {
      const v = ctl.read(path, scope || undefined), f = ty === 'BOOL' ? ctl.forced(path, scope || undefined) : null;
      return { t: fmtSt(v, ty, t), cls: (ty === 'BOOL' && v === 1 ? ' on' : '') + (f !== null && f !== undefined ? ' f' : '') };
    }
    if (t && t.value !== undefined && typeof t.value !== 'object') return { t: fmtSt(t.value, ty, t), cls: '' };
    // an atomic tag without a start value starts at 0
    return { t: E.ATOMIC.includes(ty) && !(t && t.dim) ? (t && !t.alias && styled(0, ty, styleOfTag(t, ty))) || (/^L?REAL$/.test(ty) ? '0.0' : '0') : '', cls: '' };
  }
  function tagEditorBody(inline, mode0, scope0) {
    S.tagMode = mode0 || S.tagMode || 'mon';
    if (scope0 !== undefined) S.tagScope = scope0;
    const sc = S.tagScope || '';
    return `<div style="padding:8px 12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;flex:none;border-bottom:1px solid var(--border)">
        <span class="seg"><span data-tmode="mon" class="${S.tagMode === 'mon' ? 'on' : ''}">Monitor Tags</span><span data-tmode="edit" class="${S.tagMode === 'edit' ? 'on' : ''}">Edit Tags</span></span>
        <select class="inp" id="tscope" style="width:auto;flex:1;min-width:140px"><option value="">Controller (${esc(S.p.controller.name)})</option>${allProgs().map(g => `<option value="${esc(g.name)}"${sc === g.name ? ' selected' : ''}>Program: ${esc(g.name)}</option>`).join('')}</select>
        ${tagShowBar()}<input class="inp" id="tq" placeholder="Filter" style="flex:1;min-width:120px" value="${esc(S.tagQ || '')}">${inline ? '' : `<button class="btn" data-cmd="newtag">${ic('plus')}New Tag</button>`}</div>
      <div class="list" id="tagrows" style="flex:1">${tagRows(S.tagMode, sc, S.tagQ)}</div>
      <p class="help" style="padding:0 12px">${S.tagMode === 'mon' ? (S.online ? 'Online: tap a BOOL to toggle it, a number to type a value.' : 'Offline: values are the saved start values of the project.') : 'Tap a tag to change its properties.'}</p>`;
  }
  function tagEditor(mode, scope) {
    if (S.layout === 'phone') { S.tagMode = mode; if (scope !== undefined) S.tagScope = scope; S.area = 'tags'; render(); return; }
    S.tagMode = mode || 'mon'; if (scope !== undefined) S.tagScope = scope;
    S.view = 'tags'; S.drawer = false; render();
  }
  /* Monitor Tags while values change: only the Value (and Force Mask) cells are written, the rows stay */
  function liveTagValues() {
    const r = $('#tagrows'); if (!r) return;
    const scope = S.tagScope || '', byName = new Map(scopeTags(scope).map(t => [t.name, t]));
    r.querySelectorAll('[data-tv]').forEach(c => {
      if (c.children.length) return; // a value being typed
      const row = c.closest('[data-tag]'), path = c.dataset.tv, ty = row ? row.dataset.ty : '';
      const v = rowVal(path, ty, scope, row && !row.classList.contains('mem') ? byName.get(path) : null), cls = 'val' + v.cls;
      if (c.className !== cls) c.className = cls;
      if (c.textContent !== v.t) c.textContent = v.t;
      const fc = c.tagName === 'TD' ? c.nextElementSibling : null;
      if (fc) { const fm = S.online && ctl.M && ty === 'BOOL' ? ctl.forced(path, scope || undefined) : null, ft = fm === 1 ? '1' : fm === 0 ? '0' : ''; if (fc.textContent !== ft) fc.textContent = ft; }
    });
  }
  function refreshTags() { const r = $('#tagrows'); if (r) r.innerHTML = r.tagName === 'TBODY' ? tagTableRows() : tagRows(S.tagMode, S.tagScope || '', S.tagQ); }
  /* the tag editor in a workspace tab: a table (Name, Value, Force Mask, Style, Data Type, Description in Monitor Tags;
     Name, Alias For, Data Type, Style, Description in Edit Tags), with the Monitor / Edit tabs at the bottom */
  const styleOf = ty => (/^L?REAL$/.test(ty) ? 'Float' : E.PREDEF[ty] || membersOf(ty) ? '' : 'Decimal');
  // the tag an alias ends at (an alias of an alias goes on to the base tag)
  const baseTagOf = a => { let x = String(a || ''); for (let n = 0; n < 16 && !/^Local:/i.test(x); n++) { const b = /^([A-Za-z_]\w*)(.*)$/.exec(x), t = b && tagFor(b[1]); if (!t || !t.alias || U(t.name) !== U(b[1])) break; x = t.alias + b[2]; } return x; };
  const TCOLS = { mon: ['Name', 'Value', 'Force Mask', 'Style', 'Data Type', 'Description'], edit: ['Name', 'Alias For', 'Base Tag', 'Data Type', 'Style', 'Description', 'External Access', 'Usage', 'Constant'] };
  function tagTableRows() {
    const scope = S.tagScope || '', mon = S.tagMode === 'mon', rows = [];
    tagWalk(scope, S.tagQ, (e, depth, kids, open) => {
      const t = e.t && !e.member ? e.t : null, ag = aggr(e) && !strRow(e);
      const cls = [depth ? 'mem' : '', e.mod ? 'modtag' : '', t && S.tagJust === t.name ? 'just' : '', S.tagAll && !depth ? 'all' : ''].filter(Boolean).join(' ');
      const head = `<tr${cls ? ` class="${cls}"` : ''} data-tag="${esc(e.path)}" data-ty="${esc(e.ty)}"${e.mod ? ' data-mod="1"' : ''}><td class="ex"></td>`
        + `<td class="nm" style="padding-left:${4 + depth * 16}px"><span class="tx"${kids ? ` data-texp="${esc(e.path)}"` : ''}>${kids ? ic(open ? 'down' : 'right') : ''}</span>${esc(e.path)}</td>`;
      if (mon) {
        const v = ag ? { t: '{…}', cls: '' } : rowVal(e.path, e.ty, scope, t);
        const fm = S.online && ctl.M && e.ty === 'BOOL' ? ctl.forced(e.path, scope || undefined) : null;
        rows.push(head + `<td class="val${v.cls}"${ag ? '' : ` data-tv="${esc(e.path)}"`}>${esc(v.t)}</td><td class="mono">${fm === 1 ? '1' : fm === 0 ? '0' : ''}</td><td>${t ? styleOfTag(t.alias ? null : t, e.ty) : styleOf(e.ty)}</td><td class="mono">${esc(tyText(e))}</td><td class="ds">${esc(t ? t.desc || '' : '')}</td></tr>`);
        return;
      }
      const base = !!t && !t.alias, sty = base && stylesOf(t.type).length;
      // an alias takes External Access from its base tag (greyed); a module-defined tag has none (help: Tag Editor)
      const acc = base ? accessOf(t) : t && aliasBase(t.alias) ? accessOf(aliasBase(t.alias)) : '';
      rows.push(head + `<td class="mono${t ? ' ced' : ''}"${t ? ' data-tcell="alias"' : ''}>${esc((t && t.alias) || '')}</td><td class="mono">${esc(t && t.alias ? baseTagOf(t.alias) : '')}</td>`
        + `<td class="mono${base ? ' ced' : ''}"${base ? ' data-tcell="type"' : ''}>${esc(tyText(e))}</td><td${sty ? ' class="ced" data-tcell="style"' : ''}>${t ? styleOfTag(base ? t : null, e.ty) : styleOf(e.ty)}</td>`
        + `<td class="ds${t ? ' ced' : ''}"${t ? ' data-tcell="desc"' : ''}>${esc(t ? t.desc || '' : '')}</td>`
        + `<td class="${base ? 'ced' : 'dim'}"${base ? ' data-tcell="access"' : ''}>${acc}</td><td>${depth ? '' : scope ? 'Local Tag' : '&lt;controller&gt;'}</td>`
        + `<td class="ck">${depth ? '' : `<input type="checkbox" data-tconst="${esc(e.path)}"${t && t.constant ? ' checked' : ''}${base ? '' : ' disabled'} aria-label="Constant">`}</td></tr>`);
    });
    if (!mon) rows.push(`<tr class="newrow" data-newrow="1"><td class="ex" title="New tag">${ic('edit')}</td><td class="nm"><input class="nrin mono" id="tnew" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="Type a new tag name, then Enter" aria-label="New tag name"></td><td colspan="8" class="help">New tags are DINT; or use <button type="button" class="lnk" data-cmd="newtag">New Tag…</button></td></tr>`);
    return rows.join('') || `<tr><td colspan="${TCOLS.mon.length + 1}" class="empty">No tags.</td></tr>`;
  }
  function tagWsHTML() {
    const sc = S.tagScope || '', mon = S.tagMode === 'mon';
    return `<div class="tagws" id="tagpage"><div class="tagbar"><label for="tscope">Scope:</label><select class="inp" id="tscope"><option value="">${esc(S.p.controller.name)} (controller)</option>${allProgs().map(g => `<option value="${esc(g.name)}"${sc === g.name ? ' selected' : ''}>${esc(g.name)} (program)</option>`).join('')}</select>
        ${tagShowBar()}<input class="inp" id="tq" placeholder="Enter name filter…" value="${esc(S.tagQ || '')}"><span class="grow"></span><button class="btn" data-cmd="newtag">${ic('plus')}New Tag</button></div>
      ${tagColStyle(mon)}<div class="tagtbl"><table><thead><tr><th></th>${TCOLS[mon ? 'mon' : 'edit'].map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody id="tagrows">${tagTableRows()}</tbody></table></div>
      <div class="tagtabs"><span data-tmode="mon" class="${mon ? 'on' : ''}">Monitor Tags</span><span data-tmode="edit" class="${mon ? '' : 'on'}">Edit Tags</span><span class="grow"></span><span class="help">${mon ? (S.online ? 'Online: click a BOOL value to toggle it, a number to write it.' : 'Offline: the values are the start values of the project.') : 'Click a tag to change it. Type a name in the last row to add one.'}</span></div></div>`;
  }
  /* a click on a row of the tag editor: Edit Tags opens Tag Properties (or edits the Data Type / Description cell
     in place); Monitor Tags toggles or writes the value online, or the start value offline. The module-defined
     tags cannot be edited or deleted: they come and go with their module. */
  function tagClick(row, cell) {
    S.tagAll = false; S.pickAt = 'tag'; S.tagPick = row.dataset.tag;
    const name = row.dataset.tag, ty = row.dataset.ty, scope = S.tagScope || '';
    const list = scopeTags(scope);
    const t = list.find(x => x.name === name);
    const slot = row.dataset.mod ? (/^Local:(\d+)/.exec(name) || [])[1] : null;
    if (S.tagMode === 'edit') {
      if (t && cell) { tagCellEdit(cell, t, list); return; }
      if (t) { newTag({ tag: t, list }); return; }
      if (slot != null) toast(`${name.split(/[.[]/)[0]} is a module-defined tag: it comes with the module in slot ${slot}. Change the module in the I/O Configuration.`);
      return;
    }
    if (isStrTy(ty) && !(t && t.dim)) { editString(name, ty, scope, t); return; }
    if (membersOf(ty) || /\[[\d,]+\]$/.test(ty) || (t && t.dim)) return;
    if (S.online && ctl.M) {
      if (ty === 'BOOL') { if (!ctl.toggle(name, scope || undefined, true)) toast(`${name} cannot be written here (an input or a read-only tag).`, 'err'); live(true); return; }
      prompt1('Write value', name, fmtVal(ctl.read(name, scope || undefined)), v => { const n = E.parseNumber(v); if (!n) return 'Type a number.'; if (!ctl.write(name, n.v, scope || undefined, true)) return 'This tag cannot be written (an input or read-only).'; live(true); });
      return;
    }
    if (slot != null) { toast('A module-defined tag has no start value: its values come from the module when online.'); return; }
    if (!t || t.alias) { toast('Start values can be set for base tags only.'); return; }
    if (ty === 'BOOL') { edit(() => { t.value = t.value ? 0 : 1; }); refreshTags(); return; }
    prompt1('Start value', name, fmtVal(t.value || 0), v => { const n = E.parseNumber(v); if (!n) return 'Type a number.'; edit(() => { t.value = n.v; }); });
  }
  /* Edit Tags: the Alias For, Data Type, Style, Description or External Access cell of a tag, edited in place (Enter
     or another cell keeps it, Esc does not). Alias For has the button of the reference that opens the tag browser. */
  function tagCellEdit(td, t, list) {
    if (td.querySelector('input, select')) return;
    const k = td.dataset.tcell, types = E.ATOMIC.concat(Object.keys(E.PREDEF), (S.p.dataTypes || []).map(d => d.name));
    td.innerHTML = k === 'type' ? `<span class="cdt"><input class="cin mono" aria-label="Data Type" value="${esc(tyDims(t.type || 'BOOL', t.dim))}" list="cdtl" autocomplete="off" spellcheck="false" autocapitalize="off"><button class="cdtb" type="button" data-cdtb="1" title="Select Data Type" aria-label="Select Data Type">…</button><datalist id="cdtl">${types.map(x => `<option value="${esc(x)}">`).join('')}</datalist></span>`
      : k === 'style' ? cellSel(stylesOf(t.type), styleOfTag(t), 'Style') : k === 'access' ? cellSel(ACCESS, accessOf(t), 'External Access')
      : k === 'alias' ? `<span class="cdt"><input class="cin mono" aria-label="Alias For" value="${esc(t.alias || '')}" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="Local:1:I.Data.0"><button class="cdtb" type="button" data-cabb="1" title="Browse tags" aria-label="Browse tags">${ic('down')}</button></span>`
      : `<input class="cin" aria-label="Description" value="${esc(t.desc || '')}">`;
    const f = td.querySelector('input, select');
    let done = false, picking = false, box = null;
    const commit = keep => {
      if (done) return; done = true;
      if (box) { box.remove(); box = null; }
      const v = f.value.trim(), was = k === 'type' ? tyDims(t.type || 'BOOL', t.dim) : k === 'style' ? styleOfTag(t) : k === 'access' ? accessOf(t) : k === 'alias' ? t.alias || '' : t.desc || '';
      if (!keep || v === was) { refreshTags(); return; }
      if (k === 'style' || k === 'access') {
        edit(() => { const n = { ...t }; if (k === 'style') { if (v === defStyle(t.type)) delete n.style; else n.style = v; } else if (v === 'Read/Write') delete n.access; else n.access = v; list[list.indexOf(t)] = n; });
        return;
      }
      if (k === 'alias') {
        // a tag typed in Alias For makes the tag an alias of it (it then takes its data type from there)
        const a = v.replace(/^local:/i, 'Local:').replace(/^(Local:\d+:)([icos])/, (m, x, y) => x + y.toUpperCase());
        const bad = !a ? 'Alias For: type or browse the tag, member or bit this alias points to. To make it a base tag, open its Tag Properties.'
          : U(a.split(/[.[]/)[0]) === U(t.name) ? 'A tag cannot be an alias for itself.'
          : !addrType(a) ? (/^Local:/i.test(a) ? `Alias For: ${a} is not an I/O point of this project.` : `Alias For: ${a} is not a tag, member or bit of this project.`) : '';
        if (bad) { toast(bad, 'err'); refreshTags(); return; }
        edit(() => { const n = { name: t.name, alias: a }; if (t.desc) n.desc = t.desc; list[list.indexOf(t)] = n; });
        return;
      }
      if (k === 'type') {
        const dt = parseDataType(v);
        if (typeof dt === 'string') { toast(dt, 'err'); refreshTags(); return; }
        if (dt.type === (t.type || 'BOOL') && E.dimText(dt.dim) === E.dimText(t.dim)) { refreshTags(); return; }
        edit(() => { const n = { ...t, type: dt.type }; if (dt.dim) n.dim = dt.dim; else delete n.dim; delete n.value; if (n.style && !stylesOf(baseTy(dt.type)).includes(n.style)) delete n.style; list[list.indexOf(t)] = n; });
        return;
      }
      edit(() => { const n = { ...t }; if (v) n.desc = v; else delete n.desc; list[list.indexOf(t)] = n; });
    };
    f.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); commit(true); } else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); commit(false); } });
    f.addEventListener('blur', () => { if (!picking) commit(true); });
    if (f.tagName === 'SELECT') f.addEventListener('change', () => commit(true));
    const ab = td.querySelector('[data-cabb]');
    if (ab) {
      // the tag browser of Alias For, under the cell (over the grid); picking a row writes it in the cell
      box = document.createElement('div'); box.className = 'asg abrw tabr'; box.hidden = true; document.body.appendChild(box);
      const place = () => { const r = td.getBoundingClientRect(), w = Math.min(Math.max(r.width, 380), innerWidth - 16); box.style.width = w + 'px'; box.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px'; box.style.top = (r.bottom + 270 < innerHeight ? r.bottom + 2 : Math.max(8, r.top - 264)) + 'px'; };
      const br = aliasBrowser(box, f, { self: t.name, scope: () => S.tagScope || '', picked: () => { picking = false; commit(true); } });
      box.addEventListener('pointerdown', () => { picking = true; setTimeout(() => { picking = false; }, 600); });
      box.addEventListener('mousedown', ev => ev.preventDefault());
      ab.addEventListener('pointerdown', () => { picking = true; });
      ab.addEventListener('mousedown', ev => { picking = true; ev.preventDefault(); });
      ab.addEventListener('click', ev => { ev.stopPropagation(); picking = false; place(); br.toggle(); f.focus(); });
    }
    const b = td.querySelector('[data-cdtb]');
    if (b) {
      // the … opens Select Data Type; the cell waits for it (OK writes the type, Cancel goes back to the cell)
      b.addEventListener('pointerdown', () => { picking = true; });
      b.addEventListener('mousedown', ev => { picking = true; ev.preventDefault(); });
      b.addEventListener('click', ev => { ev.stopPropagation(); picking = true; selectDataType(f.value, v => { picking = false; f.value = v; commit(true); }, () => { picking = false; f.focus(); }); });
    }
    f.focus(); if (f.select) f.select();
  }
  const cellSel = (l, cur, lab) => `<select class="cin" aria-label="${lab}">${l.map(x => `<option${x === cur ? ' selected' : ''}>${x}</option>`).join('')}</select>`;
  // Edit Tags: the blank row at the end (the pencil): a name typed there makes a DINT tag in this scope
  function newTagInline(inp) {
    const name = inp.value.trim(), list = scopeTags(S.tagScope || '');
    if (!name) return;
    if (!E.validName(name)) { toast('Tag names: letters, digits and _, starting with a letter or _, up to 40 characters, no two _ in a row and no _ at the end.', 'err'); return; }
    if (list.some(t => U(t.name) === U(name))) { toast(`A tag named ${name} already exists in this scope.`, 'err'); return; }
    inp.value = '';
    if (!edit(() => { list.push({ name, type: 'DINT' }); })) return;
    S.tagJust = name;
    toast(`Tag ${name} created (DINT)`);
    setTimeout(() => { const i = $('#tnew'); if (i) i.focus(); }, 0);
  }
  function toggleConst(box) {
    const list = scopeTags(S.tagScope || ''), t = list.find(x => x.name === box.dataset.tconst);
    if (!t || t.alias) return;
    edit(() => { const n = { ...t }; if (box.checked) n.constant = true; else delete n.constant; list[list.indexOf(t)] = n; });
  }

  /* ---------- dialogs: rung text, comment, find, go to, cross reference, help ---------- */
  function rungText(ri) {
    if (ri == null || !rungs()[ri]) return;
    // the Rung Text Edit Bar of the reference, above the routine: the rung's ASCII text, ✓ accepts, ✕ cancels
    S.sel = null; S.selRung = ri;
    openDescBar(`Rung ${ri}`, rungs()[ri].t, v => {
      const pr = E.parseRung(v);
      if (pr.err) return pr.err;
      if (!rungs()[ri]) return '';
      const t = pr.elems.length ? E.serializeRung(pr.elems) : '';
      if (t !== rungs()[ri].t) edit(() => { rungs()[ri].t = t; S.sel = null; S.selRung = ri; });
      return '';
    }, { rung: true });
  }
  function rungComment(ri) {
    if (ri == null || !rungs()[ri]) return;
    openDescBar(`Rung Comment For Rung: ${ri}`, rungs()[ri].c || '', v => { edit(() => { if (v) rungs()[ri].c = v; else delete rungs()[ri].c; }); });
  }
  function cmdFind() { prompt1('Find', 'Find what', S.find, v => { if (!v) return 'Type a tag or an instruction.'; S.find = v; if (!findNext(false)) return `"${v}" was not found in ${curRoutine().name}.`; }, 'Looks for a tag, an operand or a mnemonic in this routine. F3 finds the next one.'); }
  function findNext(wrapMsg, dir = 1) {
    const q = U(S.find), R = rungs();
    const items = [];
    R.forEach((r, ri) => { const el = parsed(ri); if (el) flat(el).forEach(p => items.push({ ri, p, e: getEl(el, p) })); });
    if (!items.length) return false;
    const cur = S.sel ? items.findIndex(x => x.ri === S.sel.ri && x.p.join() === S.sel.path.join()) : -1;
    const n = items.length, at = cur < 0 && dir < 0 ? n : cur;
    for (let k = 1; k <= n; k++) {
      const x = items[(((at + k * dir) % n) + n) % n];
      if (U(x.e.t) === q || x.e.a.some(a => U(a).includes(q))) { S.sel = { ri: x.ri, path: x.p }; S.selRung = null; render(); scrollToSel(); return true; }
    }
    if (wrapMsg) toast(`"${S.find}" was not found.`);
    return false;
  }
  /* Search > Replace, as the reference's Replace dialog: Find What, Replace With, Find Where (this routine or all
     routines, in the organizer's order), Wrap, Match Whole Word Only, Direction, Find Within (Instructions,
     Instruction Operands, Rung Comments); Find Next, Replace (the selected occurrence, else finds the first),
     Replace All (results in Search Results). As in the reference, nothing is replaced while online. */
  const rxEsc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* Find Where (help v37, Search in routines): Current Routine, All Routines in Current Program, All Routines in
     Current Task, All Routines; Limit To (Limit To options): Text Only, References to Exact Tag and Its Members,
     References to Tag, Forces, Edit Zones, Shorted Branches; Use Wildcards: * stands for zero or more characters
     (Match Whole Word Only is then always on) */
  const FWHERE = [['', 'Current Routine'], ['prog', 'All Routines in Current Program'], ['task', 'All Routines in Current Task'], ['all', 'All Routines']];
  const LIMITS = [['text', 'Text Only'], ['exact', 'References to Exact Tag and Its Members'], ['ref', 'References to Tag'], ['forces', 'Forces'], ['zones', 'Edit Zones'], ['short', 'Shorted Branches']];
  const noWhat = l => l === 'forces' || l === 'zones' || l === 'short';
  function repRe(o) {
    const whole = o.whole || o.wild, body = o.wild ? o.what.split('*').map(rxEsc).join('(.*?)') : rxEsc(o.what);
    return whole ? new RegExp('(^|[^A-Za-z0-9_])(' + body + ')(?![A-Za-z0-9_])', 'i') : new RegExp('()(' + body + ')', 'i');
  }
  function repHits(o) {
    const lim = o.lim || 'text', hits = [], re = noWhat(lim) ? null : repRe(o);
    const has = t => re.test(String(t));
    const W = U(o.what), refOk = a => { const u = U(String(a)), sub = (x, y) => x === y || x.startsWith(y + '.') || x.startsWith(y + '['); return lim === 'exact' ? sub(u, W) : sub(u, W) || sub(W, u); };
    const T = S.p.tasks.find(t => t.programs.includes(curProg())) || S.p.tasks[0];
    const progs = o.where === 'all' ? allProgs() : o.where === 'task' ? T.programs : [curProg()];
    const list = o.where === '' || o.where == null ? [{ g: curProg(), r: curRoutine() }] : progs.flatMap(g => g.routines.map(r => ({ g, r })));
    const gi0 = allProgs().flatMap(g => g.routines.map(r => g.name + '/' + r.name));
    list.forEach(({ g, r }) => r.rungs.forEach((rg, ri) => {
      const gi = gi0.indexOf(g.name + '/' + r.name);
      if (lim === 'zones') { if (rg.z) hits.push({ g: g.name, r: r.name, ri, kind: 'rung', key: [gi, ri, -1, 0] }); return; }
      if (lim === 'text' && o.cm && rg.c && has(rg.c)) hits.push({ g: g.name, r: r.name, ri, kind: 'cm', key: [gi, ri, -1, 0] });
      const pr = E.parseRung(rg.t); if (pr.err) return;
      if (lim === 'short') {
        // a branch with an empty level: the rung condition passes it as a wire
        let fi = 0; const walk = (arr, path) => arr.forEach((e, k) => { const pth = path.concat(k); if (e.t !== 'BR') { fi++; return; } if (e.legs.some(l => !l.length)) hits.push({ g: g.name, r: r.name, ri, kind: 'br', path: pth, key: [gi, ri, fi, 0], e }); e.legs.forEach((l, li) => walk(l, pth.concat(li))); });
        walk(pr.elems, []); return;
      }
      flat(pr.elems).forEach((path, fi) => {
        const e = getEl(pr.elems, path);
        if (lim === 'forces') { (e.a || []).forEach((a, oi) => { if (S.online && isTagText(a) && ctl.forced(a, g.name) != null) hits.push({ g: g.name, r: r.name, ri, kind: 'op', path, oi, key: [gi, ri, fi, 1 + oi], e }); }); return; }
        if (lim === 'text' && o.ins && has(e.t)) hits.push({ g: g.name, r: r.name, ri, kind: 'ins', path, key: [gi, ri, fi, 0], e });
        if (lim === 'text' ? o.ops : true) (e.a || []).forEach((a, oi) => { if (lim === 'text' ? has(a) : isTagText(a) && refOk(a)) hits.push({ g: g.name, r: r.name, ri, kind: 'op', path, oi, key: [gi, ri, fi, 1 + oi], e }); });
      });
    }));
    return { hits, list, re };
  }
  // the last 10 strings searched for and replaced with, newest first (the Find What / Replace With pull-down lists)
  function rememberFind(k, v) { v = String(v || '').trim(); if (!v) return; S.prefs[k] = [v].concat((S.prefs[k] || []).filter(x => x !== v)).slice(0, 10); savePrefs(); }
  const keyCmp = (a, b) => { for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  const selKey = () => JSON.stringify([S.prog, S.routine, S.sel, S.selRung]);
  function cmdReplace() {
    const a = selOperand(), o = { what: isTagText(a) ? String(a) : S.find || '', with: S.repWith || '', where: '', wrap: true, whole: false, wild: false, up: false, ins: true, ops: true, cm: true, lim: S.prefs.limitTo || 'text' };
    const hl = k => `<datalist id="${k}">${(S.prefs[k] || []).map(h => `<option value="${esc(h)}">`).join('')}</datalist>`;
    const el = dialog({ title: 'Replace', size: 'md', focus: true,
      body: `<div class="frow"><label for="rp-f">Find What:</label><input class="inp mono" id="rp-f" list="findHist" value="${esc(o.what)}" autocomplete="off" spellcheck="false" autofocus>${hl('findHist')}</div>
        <div class="frow"><label for="rp-l">Limit To:</label><select class="inp" id="rp-l">${LIMITS.map(([v, t]) => `<option value="${v}"${v === o.lim ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="frow"><label for="rp-w">Replace With:</label><input class="inp mono" id="rp-w" list="repHist" value="${esc(o.with)}" autocomplete="off" spellcheck="false">${hl('repHist')}</div>
        <div class="frow"><label for="rp-wh">Find Where:</label><select class="inp" id="rp-wh">${FWHERE.map(([v, t]) => `<option value="${v}">${t}${v ? '' : ': ' + esc(curRoutine().name)}</option>`).join('')}</select></div>
        <div class="frow"><span></span><div><label class="ockb"><input type="checkbox" id="rp-wrap" checked> Wrap</label><label class="ockb"><input type="checkbox" id="rp-whole"> Match Whole Word Only</label><label class="ockb"><input type="checkbox" id="rp-wild"> Use Wildcards</label>
          <div class="ockb">Direction: <label class="ockb"><input type="radio" name="rp-dir" id="rp-up"> Up</label><label class="ockb"><input type="radio" name="rp-dir" id="rp-down" checked> Down</label></div></div></div>
        <div class="frow"><span>Find Within:</span><div><b>Ladder Diagrams</b><label class="ockb"><input type="checkbox" id="rp-ins" checked> Instructions</label><label class="ockb"><input type="checkbox" id="rp-ops" checked> Instruction Operands</label><label class="ockb"><input type="checkbox" id="rp-cm" checked> Rung Comments</label></div></div>
        <div class="errtx" id="rp-e"></div><p class="help" id="rp-m"></p>`,
      buttons: [{ l: 'Find Next', pri: true, run: () => { act('next'); return false; } }, { l: 'Replace', run: () => { act('one'); return false; } }, { l: 'Replace All', run: () => { act('all'); return false; } }, { l: 'Close' }] });
    const q = s2 => el.querySelector(s2);
    const say = (m, err) => { q('#rp-e').textContent = err ? m : ''; q('#rp-m').textContent = err ? '' : m; };
    const read = () => { Object.assign(o, { what: q('#rp-f').value.trim(), with: q('#rp-w').value.trim(), where: q('#rp-wh').value, wrap: q('#rp-wrap').checked, whole: q('#rp-whole').checked, wild: q('#rp-wild').checked, up: q('#rp-up').checked, ins: q('#rp-ins').checked, ops: q('#rp-ops').checked, cm: q('#rp-cm').checked, lim: q('#rp-l').value }); S.find = o.what; S.repWith = o.with; S.prefs.limitTo = o.lim; savePrefs(); };
    // Find What is off for the Limit To choices that need no text; Use Wildcards keeps Match Whole Word Only on
    const sync = () => { const nw = noWhat(q('#rp-l').value); q('#rp-f').disabled = nw; q('#rp-w').disabled = nw; const w = q('#rp-wild').checked; if (w) q('#rp-whole').checked = true; q('#rp-whole').disabled = w; };
    el.addEventListener('change', ev => { if (ev.target.id === 'rp-l' || ev.target.id === 'rp-wild') sync(); });
    sync();
    // where the search stands: the occurrence found last while it is still selected, else the selection
    const pos = list => {
      if (S.repHit && S.repHit.sk === selKey()) return S.repHit.key;
      const gi = Math.max(0, list.findIndex(x => x.g.name === S.prog && x.r.name === S.routine));
      if (S.sel && S.sel.path) { const els = parsed(S.sel.ri) || [], fi = flat(els).findIndex(p => p.join() === S.sel.path.join()); return [gi, S.sel.ri, fi, S.sel.op != null ? 1 + S.sel.op : 0]; }
      return S.selRung != null ? [gi, S.selRung, -1, -1] : [gi, -1, 0, 0];
    };
    const show = h => {
      S.prog = h.g; S.routine = h.r; S.view = 'ladder'; if (S.layout === 'phone') S.area = 'ladder';
      if (h.kind === 'cm' || h.kind === 'rung') { S.sel = null; S.selRung = h.ri; } else { S.sel = { ri: h.ri, path: h.path }; if (h.kind === 'op') S.sel.op = h.oi; if (h.kind === 'br') S.sel.br = true; S.selRung = null; }
      S.selAll = null; reverify(); render(); scrollToSel();
      S.repHit = { key: h.key, sk: selKey() };
      say(`Found: ${h.g} - ${h.r}, Rung ${h.ri}${h.kind === 'cm' ? ', rung comment' : h.kind === 'rung' ? `, edit zone ${rungsOf(h).rungs[h.ri].z}` : h.kind === 'br' ? ', shorted branch' : `, ${h.e.t}${h.kind === 'op' ? `, Operand ${h.oi}` : ''}`}`);
    };
    const next = () => {
      const { hits, list } = repHits(o), wt = noWhat(o.lim) ? LIMITS.find(x => x[0] === o.lim)[1] : `"${o.what}"`;
      if (!hits.length) { say(`Search complete: ${wt} was not found.`, true); return null; }
      const p = pos(list);
      let h = o.up ? [...hits].reverse().find(x => keyCmp(x.key, p) < 0) : hits.find(x => keyCmp(x.key, p) > 0);
      if (!h && o.wrap) h = o.up ? hits[hits.length - 1] : hits[0];
      if (!h) { say(`Search complete: no more ${wt} ${o.up ? 'above' : 'below'}.`, true); return null; }
      show(h); return h;
    };
    // the new text of one occurrence (the matched part is replaced, every time it appears in that operand or comment)
    const swap = (t, re) => String(t).replace(new RegExp(re.source, 'gi'), (m0, a1, a2, ...g) => {
      if (!o.wild) return a1 + o.with;
      const parts = o.with.split('*'), caps = g.slice(0, o.what.split('*').length - 1);
      return a1 + parts.map((x, i) => x + (i < parts.length - 1 ? caps[i] || '' : '')).join('');
    });
    // a reference found by Limit To is replaced whole: the tag part becomes Replace With, its members stay
    const swapRef = t => { const u = U(String(t)), w = U(o.what); return u === w || u.startsWith(w + '.') || u.startsWith(w + '[') ? o.with + String(t).slice(o.what.length) : o.with; };
    function apply(h, re, R) {
      const rg = R.rungs[h.ri];
      if (h.kind === 'cm') { const c = swap(rg.c, re); if (c) rg.c = c; else delete rg.c; return true; }
      const pr = E.parseRung(rg.t); if (pr.err) return false;
      const x = getEl(pr.elems, h.path); if (!x) return false;
      if (h.kind === 'op') x.a[h.oi] = re ? (o.lim === 'text' ? swap(x.a[h.oi], re) : swapRef(x.a[h.oi])) : x.a[h.oi];
      else { const m = U(swap(x.t, re)); if (!INSTR[m]) return false; x.a = morphOps(x, m); x.t = m; }
      rg.t = E.serializeRung(pr.elems);
      return true;
    }
    const routineOf = h => allProgs().find(g => g.name === h.g).routines.find(r => r.name === h.r), rungsOf = routineOf;
    const act = kind => {
      read();
      const nw = noWhat(o.lim);
      if (!o.what && !nw) { say('Type what to find.', true); return; }
      if (o.lim === 'text' && !o.ins && !o.ops && !o.cm) { say('Pick at least one place in Find Within.', true); return; }
      if (o.wild && /\*\*/.test(o.what)) { say('Consecutive wildcard characters (**) are not permitted in Find What.', true); return; }
      if (o.wild && o.with.split('*').length > o.what.split('*').length) { say('Replace With must contain the same number or fewer wildcard characters than Find What.', true); return; }
      if (!nw) { rememberFind('findHist', o.what); if (kind !== 'next') rememberFind('repHist', o.with); ['findHist', 'repHist'].forEach(k => { const d = q('#' + k); if (d) d.innerHTML = (S.prefs[k] || []).map(h => `<option value="${esc(h)}">`).join(''); }); }
      if (kind === 'next') { next(); return; }
      if (nw) { say(`Replace needs Text Only or a tag reference in Limit To.`, true); return; }
      if (S.online) { say('Cannot replace logic, tags or comments while online.', true); return; }
      if (!editable()) return;
      const { hits, re } = repHits(o);
      if (kind === 'one') {
        const p = S.repHit && S.repHit.sk === selKey() ? S.repHit.key : null, h = p && hits.find(x => keyCmp(x.key, p) === 0);
        if (!h) { next(); return; }
        let ok = true;
        edit(() => { ok = apply(h, re, routineOf(h)); return ok; });
        if (!ok) { say('Fail to replace element: that is not a valid instruction. Type a valid instruction and try again.', true); return; }
        S.repHit = null; render();
        if (!next()) say(`Replaced. No more "${o.what}".`);
        return;
      }
      if (!hits.length) { say(`Nothing to replace: "${o.what}" was not found.`, true); return; }
      const done = [];
      edit(() => {
        // from the last occurrence back, so the paths of the ones before it stay right
        [...hits].reverse().forEach(h => { if (apply(h, re, routineOf(h))) done.unshift(h); });
        return done.length ? true : false;
      });
      S.repHit = null;
      const lines = done.map(h => `Replaced: ${h.g} - ${h.r}, Rung ${h.ri}, ${h.kind === 'cm' ? 'Rung Comment' : `${h.e.t}${h.kind === 'op' ? `, Operand ${h.oi}` : ''}`}`);
      S.search = { errors: [], warnings: [], found: done.map((h, n) => ({ text: lines[n], program: h.g, routine: h.r, rung: h.ri })), lines: [`Replacing "${o.what}" with "${o.with}" in ${o.where ? FWHERE.find(x => x[0] === o.where)[1] : curRoutine().name}...`, ...lines, `Complete - ${done.length} occurrence(s) replaced.`] };
      S.outTab = 'search';
      if (S.layout === 'desktop') S.prefs.err = true; else if (S.layout === 'tablet') S.errOpen = true;
      reverify(); render();
      say(done.length < hits.length ? `${done.length} of ${hits.length} replaced (an instruction name that is not valid was left).` : `${done.length} occurrence(s) replaced. See Search Results.`, done.length < hits.length);
    };
  }
  /* Search > Browse Logic (help v37, Browse Logic dialog box): Find, the Logic tree (programs, + shows their routines,
     then the rungs; a double-click on a rung opens it in the editor), the Description of the selected logic, Go To.
     Find keeps the components whose name (or rung text) has the text, with what holds them. */
  function browseLogic() {
    const open = new Set(['g:' + S.prog, 'r:' + S.prog + '/' + S.routine]);
    let cur = 'r:' + S.prog + '/' + S.routine;
    const nodes = () => {
      const f = U((el.querySelector('#bl-f') || {}).value || '').trim(), out = [];
      allProgs().forEach(g => {
        const gk = 'g:' + g.name, rs = g.routines.map(r => {
          const rk = 'r:' + g.name + '/' + r.name, rgs = r.rungs.map((rg, ri) => ({ k: 'n:' + g.name + '/' + r.name + '/' + ri, l: `Rung ${ri}`, t: rg.t, d: rg.c || '', hit: !!f && U(rg.t).includes(f) }));
          return { k: rk, l: r.name, d: r.desc || (r.name === g.main ? 'Main routine' : ''), hit: !f || U(r.name).includes(f), rgs };
        });
        const gHit = !f || U(g.name).includes(f);
        if (f && !gHit && !rs.some(r => r.hit || r.rgs.some(x => x.hit))) return;
        out.push({ k: gk, l: g.name, d: g.desc || '', lv: 0, kids: rs.length });
        if (!open.has(gk) && !f) return;
        rs.forEach(r => {
          if (f && !gHit && !r.hit && !r.rgs.some(x => x.hit)) return;
          out.push({ k: r.k, l: r.l, d: r.d, lv: 1, kids: r.rgs.length });
          if (open.has(r.k) || (f && r.rgs.some(x => x.hit))) r.rgs.forEach(x => { if (!f || x.hit || r.hit || gHit) out.push({ k: x.k, l: x.l, t: x.t, d: x.d, lv: 2, kids: 0 }); });
        });
      });
      return out;
    };
    const el = dialog({ title: 'Browse Logic', size: 'md',
      body: `<div class="frow"><label for="bl-f">Find:</label><input class="inp mono" id="bl-f" autocomplete="off" spellcheck="false"></div>
        <label>Logic:</label><div class="gwl bltree" id="bl-t"></div>
        <label>Description:</label><div class="bldesc" id="bl-d"></div>`,
      buttons: [{ l: 'Close' }, { l: 'Go To', pri: true, run: () => go() }] });
    const q = x => el.querySelector(x);
    const draw = () => {
      const ns = nodes();
      if (ns.length && !ns.some(n => n.k === cur)) cur = ns[0].k;
      q('#bl-t').innerHTML = ns.map(n => `<div class="row${n.k === cur ? ' on' : ''}" data-bl="${esc(n.k)}" style="padding-left:${8 + n.lv * 18}px">${n.kids ? `<span class="blx" data-blx="${esc(n.k)}">${open.has(n.k) ? '−' : '+'}</span>` : '<span class="blx"></span>'}${esc(n.l)}${n.t != null ? ` <span class="mono sub">${esc(n.t || '(empty)')}</span>` : ''}</div>`).join('') || '<div class="empty">No logic matches.</div>';
      shown = ns; mark();
    };
    // the selection only: the rows stay (a double-click needs the row it started on)
    let shown = [];
    const mark = () => {
      el.querySelectorAll('#bl-t .row').forEach(r => r.classList.toggle('on', r.dataset.bl === cur));
      const c = shown.find(n => n.k === cur); q('#bl-d').textContent = c ? c.d || '' : '';
      const on = q('#bl-t .row.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    };
    // Go To: the routine (its first rung) or the rung, in the ladder editor
    function go() {
      const k = cur, [g, r, ri] = k.slice(2).split('/');
      if (k[0] === 'g') { const pg = allProgs().find(x => x.name === g); S.prog = g; S.routine = pg.main || pg.routines[0].name; }
      else { S.prog = g; S.routine = r; }
      S.view = 'ladder'; S.sel = null; S.selAll = null; S.selRung = ri != null ? +ri : 0; S.drawer = false; if (S.layout === 'phone') S.area = 'ladder';
      setTimeout(() => { reverify(); render(); scrollToSel(); }, 0);
    }
    q('#bl-t').addEventListener('click', ev => {
      const x = ev.target.closest('[data-blx]'); if (x) { const k = x.dataset.blx; if (open.has(k)) open.delete(k); else open.add(k); cur = k; draw(); return; }
      const r = ev.target.closest('[data-bl]'); if (r) { cur = r.dataset.bl; mark(); }
    });
    q('#bl-t').addEventListener('dblclick', ev => {
      const r = ev.target.closest('[data-bl]'); if (!r) return;
      cur = r.dataset.bl;
      if (cur[0] === "n") { go(); closeLayer(); } else { if (open.has(cur)) open.delete(cur); else open.add(cur); draw(); }
    });
    q('#bl-f').addEventListener('input', draw);
    draw();
  }
  /* Bookmarks (help v37, Bookmark toolbar; Deleting or Going to a Bookmark): mark a rung to come back to it. Toggle
     (insert or remove) on the selected rung, Next and Previous through every routine in the organizer's order (they
     wrap), View All (the Edit/Goto Bookmark dialog: the list, Goto, Delete, Close), Clear All. rung.bm is kept in the
     project, is no logic (not an Undo step; online it leaves the project matching the controller), is not in the L5X
     and stays behind when a rung is copied. */
  const bmList = () => S.noProj ? [] : allProgs().flatMap(g => g.routines.flatMap(r => r.rungs.map((rg, ri) => rg.bm ? { g: g.name, r: r.name, ri, rg } : null).filter(Boolean)));
  function bmGo(b) { S.prog = b.g; S.routine = b.r; S.view = 'ladder'; S.sel = null; S.selAll = null; S.selRung = b.ri; if (S.layout === 'phone') S.area = 'ladder'; reverify(); render(); scrollToSel(); }
  function bookmark(how) {
    const L = bmList();
    if (how === 'tog') { const rg = rungs()[curSelRung()]; if (!rg) return; if (rg.bm) delete rg.bm; else rg.bm = 1; S.dirty = true; render(); toast(rg.bm ? `Bookmark on rung ${curSelRung()}.` : `Bookmark removed from rung ${curSelRung()}.`); return; }
    if (how === 'clear') { L.forEach(b => delete b.rg.bm); S.dirty = true; render(); toast(`${L.length} bookmark(s) removed.`); return; }
    if (!L.length) { toast('No bookmarks.'); return; }
    // the place of the caret in the same order: routine, then rung
    const keys = allProgs().flatMap(g => g.routines.map(r => g.name + '/' + r.name)), at = [keys.indexOf(S.prog + '/' + S.routine), S.view === 'ladder' && curSelRung() != null ? curSelRung() : -0.5];
    const k = b => [keys.indexOf(b.g + '/' + b.r), b.ri], cmp = (a, b) => a[0] - b[0] || a[1] - b[1];
    const b = how > 0 ? L.find(x => cmp(k(x), at) > 0) || L[0] : [...L].reverse().find(x => cmp(k(x), at) < 0) || L[L.length - 1];
    bmGo(b);
  }
  function bookmarksDlg() {
    let on = 0;
    const list = () => { const L = bmList(); return L.length ? L.map((b, i) => `<div class="row${i === on ? ' on' : ''}" data-bmi="${i}"><span class="grow"><b>${esc(b.g)} - ${esc(b.r)}</b>, Rung ${b.ri}${b.rg.c ? ` <span class="sub">${esc(b.rg.c)}</span>` : ''}</span></div>`).join('') : '<div class="empty">No bookmarks.</div>'; };
    const el = dialog({ title: 'Edit/Goto Bookmark', size: 'md',
      body: `<label>Bookmarks:</label><div class="gwl hlist" id="bml">${list()}</div>`,
      buttons: [{ l: 'Goto', pri: true, run: () => { const b = bmList()[on]; if (!b) return false; setTimeout(() => bmGo(b), 0); } }, { l: 'Delete', run: e2 => { const b = bmList()[on]; if (b) { delete b.rg.bm; S.dirty = true; on = Math.max(0, Math.min(on, bmList().length - 1)); e2.querySelector('#bml').innerHTML = list(); render(); } return false; } }, { l: 'Close' }] });
    const box = el.querySelector('#bml');
    box.addEventListener('click', ev => { const r = ev.target.closest('[data-bmi]'); if (r) { on = +r.dataset.bmi; box.querySelectorAll('[data-bmi]').forEach(x => x.classList.toggle('on', x === r)); } });
    box.addEventListener('dblclick', ev => { const r = ev.target.closest('[data-bmi]'); if (r) { const b = bmList()[+r.dataset.bmi]; closeLayer(); bmGo(b); } });
  }
  /* Go To, as in the reference: "Go to what" (a rung, or a tag's Cross Reference, Edit, Monitor, Properties or its row
     in the tag editor) and the rung or the tag to go to */
  function cmdGoto() {
    const a = selOperand(), tag0 = isTagText(a) ? String(a).split(/[.[]/)[0] : '';
    const WHAT = [['rung', 'Rung', 'Place caret on rung:'], ['xref', 'Cross Reference', 'Tag:'], ['edit', 'Edit', 'Tag:'], ['mon', 'Monitor', 'Tag:'], ['props', 'Properties', 'Tag:'], ['tag', 'Tag', 'Set row selection on tag:']];
    let what = 'rung';
    const val = w => (w === 'rung' ? (curSelRung() == null ? '0' : String(curSelRung())) : tag0);
    const el = dialog({ title: 'Go To', focus: true,
      body: `<div class="gotod"><div><label>Go to what:</label><div class="gwl" id="gwl">${WHAT.map(([k, l]) => `<div class="row${k === what ? ' on' : ''}" data-gw="${k}">${l}</div>`).join('')}</div></div>
        <div><label for="gv" id="gl">${WHAT[0][2]}</label><input class="inp mono" id="gv" value="${esc(val(what))}" autocomplete="off" spellcheck="false" autofocus><div class="errtx" id="ge"></div></div></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'Go To', pri: true, run: el2 => {
        const v = el2.querySelector('#gv').value.trim(), err = m => { el2.querySelector('#ge').textContent = m; return false; };
        if (what === 'rung') { const n = parseInt(v, 10); if (!(n >= 0 && n < rungs().length)) return err(`Type a rung from 0 to ${rungs().length - 1}.`); setTimeout(() => { S.sel = null; S.selRung = n; render(); scrollToSel(); }, 0); return; }
        const tg = tagFor(v);
        if (!tg) return err(`"${v}" is not a tag of ${curProg().name} or of the controller.`);
        const scope = curProg().tags.includes(tg) ? curProg().name : '';
        setTimeout(() => { if (what === 'xref') xref(tg.name); else if (what === 'props') newTag({ tag: tg }); else if (what === 'mon') monitorTag(tg.name); else { S.tagQ = tg.name; tagEditor('edit', scope); } }, 0);
      } }] });
    el.querySelector('#gwl').addEventListener('click', ev => {
      const r = ev.target.closest('[data-gw]'); if (!r) return;
      what = r.dataset.gw;
      el.querySelectorAll('[data-gw]').forEach(x => x.classList.toggle('on', x === r));
      el.querySelector('#gl').textContent = WHAT.find(x => x[0] === what)[2];
      const inp = el.querySelector('#gv'); inp.value = val(what); inp.focus(); inp.select();
    });
  }
  /* Monitor "tag": the tag editor in Monitor Tags, filtered to the tag */
  function monitorTag(name) {
    const tg = tagFor(name), scope = tg && curProg().tags.includes(tg) ? curProg().name : '';
    S.tagQ = name; tagEditor('mon', scope);
  }
  /* the Errors pane as the reference's output window: Verify Rung and Find All write their results there */
  function showOutput(v) {
    if (S.layout === 'desktop') S.prefs.err = true; else if (S.layout === 'tablet') S.errOpen = true; else S.area = 'more';
    S.verifyShown = v; S.outTab = 'err';
    render();
  }
  function verifyRung(ri) {
    if (ri == null || !rungs()[ri]) return;
    reverify();
    const g = curProg().name, r = curRoutine().name, mine = x => x.program === g && x.routine === r && x.rung === ri;
    const errors = S.verify.errors.filter(mine), warnings = S.verify.warnings.filter(mine);
    if (!errors.length && rungs()[ri].dx) { delete rungs()[ri].dx; renderLadder(); }
    showOutput({ errors, warnings, lines: [`Verifying rung ${ri} of routine '${r}' of program '${g}'...`, ...errors.map(x => x.text), ...warnings.map(x => x.text), `Complete - ${errors.length} error(s), ${warnings.length} warning(s)`] });
    toast(errors.length ? `Rung ${ri}: ${errors.length} error(s)` : `Rung ${ri} verified: no errors`, errors.length ? 'err' : 'ok');
  }
  /* Find All "tag": every instruction of the project that uses the tag (or one of its members), as Found lines */
  function findAll(what) {
    const w = U(String(what || '')), whole = !/[.[]/.test(w), found = [];
    const hitOp = x => { const u = U(String(x)); return u === w || (whole && u.split(/[.[]/)[0] === w); };
    allProgs().forEach(g => g.routines.forEach(r => r.rungs.forEach((rg, ri) => {
      const pr = E.parseRung(rg.t); if (pr.err) return;
      const walk = arr => arr.forEach(e => {
        if (e.t === 'BR') { e.legs.forEach(walk); return; }
        (e.a || []).forEach((x, oi) => { if (hitOp(x)) { const text = `Found: ${g.name} - ${r.name}, Rung ${ri}, ${e.t}, Operand ${oi}: ${e.t}(${e.a.join(',')})`; found.push({ text, program: g.name, routine: r.name, rung: ri }); } });
      });
      walk(pr.elems);
    })));
    // the reference puts the result in the Search Results tab of the Output window (Errors, Search Results, Watch)
    S.search = { errors: [], warnings: [], found, lines: [`Searching for "${what}" in ${S.p.controller.name}...`, ...found.map(x => x.text), `Complete - ${found.length} occurrence(s) found.`] };
    S.outTab = 'search';
    if (S.layout === 'desktop') S.prefs.err = true; else if (S.layout === 'tablet') S.errOpen = true; else S.area = 'more';
    render();
  }
  /* Export Rungs / Import Rungs: the rungs as a Logix .L5X file (TargetType Rung), with the tags they use */
  function rungsL5X(list, desc) {
    const cd = v => `<![CDATA[${String(v).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`, P = curProg(), names = new Set();
    list.forEach(r => { const pr = E.parseRung(r.t); if (pr.err) return; const walk = arr => arr.forEach(e => { if (e.t === 'BR') e.legs.forEach(walk); else (e.a || []).forEach(x => { if (isTagText(x)) names.add(U(String(x).split(/[.[]/)[0])); }); }); walk(pr.elems); });
    const tags = [...P.tags, ...S.p.tags].filter(tg => names.has(U(tg.name)));
    const tagX = tg => `<Tag Name="${esc(tg.name)}" TagType="${tg.alias ? 'Alias' : 'Base'}"${tg.alias ? ` AliasFor="${esc(tg.alias)}"` : ` DataType="${esc(tg.type)}"${l5xDims(tg)}${l5xAttrs(tg, esc)}`}>${tg.desc ? `<Description>${cd(tg.desc)}</Description>` : ''}</Tag>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="33.00" TargetType="Rung" TargetCount="${list.length}" ContainsContext="true" ExportDate="${new Date().toUTCString()}" ExportOptions="References NoRawData L5KData DecoratedData Context RoutineLabels AliasExtras IOTags NoStringData ForceProtectedEncoding AllProjDocTrans">
<Controller Use="Context" Name="${esc(S.p.controller.name)}">${desc ? `<Description>${cd(desc)}</Description>` : ''}
<Tags Use="Context">${tags.filter(tg => S.p.tags.includes(tg)).map(tagX).join('')}</Tags>
<Programs Use="Context"><Program Use="Context" Name="${esc(P.name)}"><Tags Use="Context">${tags.filter(tg => P.tags.includes(tg)).map(tagX).join('')}</Tags>
<Routines Use="Context"><Routine Use="Context" Name="${esc(curRoutine().name)}" Type="RLL"><RLLContent Use="Context">
${list.map((u, i) => `<Rung Use="Target" Number="${i}" Type="N">${u.c ? `<Comment>${cd(u.c)}</Comment>` : ''}<Text>${cd(u.t || '')}</Text></Rung>`).join('\n')}
</RLLContent></Routine></Routines></Program></Programs></Controller></RSLogix5000Content>
`;
  }
  function exportRungs(ri) {
    if (ri == null || !rungs()[ri]) return;
    fileDialog({ mode: 'save', title: 'Export Rungs', name: `${curRoutine().name}_Rung${ri}.L5X`, types: ['l5x'], descField: true,
      onPick: async (f, desc) => { try { await FS.write(f, rungsL5X([rungs()[ri]], desc)); toast(`Exported rung ${ri} to ${baseName(f)}`, 'ok'); } catch (e) { toast('Could not export: ' + (e.message || e), 'err'); } } });
  }
  function importRungs() {
    fileDialog({ mode: 'open', title: 'Import Rungs', types: ['l5x'], onPick: async f => {
      let x;
      try { x = await FS.read(f); } catch (e) { toast('That file could not be read: ' + (e.message || e), 'err'); return; }
      const doc = new DOMParser().parseFromString(x, 'application/xml'), root = doc.querySelector('RSLogix5000Content');
      const rs = root ? [...doc.querySelectorAll('Rung')].map(r => ({ t: (r.querySelector('Text') || {}).textContent || '', c: ((r.querySelector('Comment') || {}).textContent || '').trim() })) : [];
      if (!rs.length) { toast('That file holds no rungs to import.', 'err'); return; }
      const bad = rs.map(r => E.parseRung(r.t.trim())).findIndex(pr => pr.err);
      if (bad >= 0) { toast(`Rung ${bad} of the file cannot be read.`, 'err'); return; }
      const have = n => !!tagFor(n);
      const tags = [...doc.querySelectorAll('Tag')].map(tg => ({ el: tg, name: tg.getAttribute('Name'), type: tg.getAttribute('DataType') || 'BOOL', alias: tg.getAttribute('AliasFor') || '', dim: l5xDimsIn(tg), desc: ((tg.querySelector('Description') || {}).textContent || '').trim(), prog: tg.parentElement && tg.parentElement.parentElement && tg.parentElement.parentElement.tagName === 'Program' }));
      // Import Configuration, as in the reference: each tag of the file is created, or the project's tag of that name is used
      dialog({ title: 'Import Configuration', size: 'md',
        body: `<p>${rs.length} rung(s) from <b class="mono">${esc(baseName(f))}</b> go after ${curSelRung() == null ? 'the last rung' : `rung ${curSelRung()}`} of ${esc(curRoutine().name)}.</p>
          <table class="ictbl"><tr><th>Tag</th><th>Operation</th><th>Final Name</th></tr>${tags.map(tg => `<tr><td class="mono">${esc(tg.name)}</td><td>${have(tg.name) ? 'Use Existing' : 'Create'}</td><td class="mono">${esc(tg.name)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No tags in the file.</td></tr>'}</table>`,
        buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: () => {
          edit(() => {
            const at = curSelRung() == null ? rungs().length : curSelRung() + 1;
            rungs().splice(at, 0, ...rs.map(r => (r.c ? { t: r.t.trim(), c: r.c } : { t: r.t.trim() })));
            tags.filter(tg => !have(tg.name)).forEach(tg => { const o = { name: tg.name, type: tg.alias ? undefined : tg.type }; if (tg.alias) o.alias = tg.alias; if (tg.dim) o.dim = tg.dim; if (tg.desc) o.desc = tg.desc; if (!o.type) delete o.type; else l5xTagIn(tg.el, o); (tg.prog ? curProg().tags : S.p.tags).push(o); });
            S.sel = null; S.selRung = at;
          });
          toast(`Imported ${rs.length} rung(s).`, 'ok');
        } }] });
    } });
  }
  function scrollToSel() {
    const w = $('#ladwrap'); if (!w) return;
    const ri = curSelRung();
    const r = w.querySelector(`rect.tap[data-rn][data-ri="${ri}"]`);
    if (r) { const y = +r.getAttribute('y'); if (y < w.scrollTop + 20 || y > w.scrollTop + w.clientHeight - 60) w.scrollTop = Math.max(0, y - 40); }
  }
  const DESTR = ['bitw', 'dest', 'idest', 'elemw', 'timer', 'counter', 'struct', 'control', 'darr', 'farr', 'fdst', 'ddest', 'aelemw', 'rdest', 'gdest', 'pid'];
  /* Cross Reference, as the reference's window (Search > Cross Reference, Ctrl+E): Type, Scope, Name (with * as a
     wildcard), Show (All, Destructive, Non-Destructive) and Refresh at the top; a Logic tab with the columns Element,
     Container, Routine, Location, Reference, BaseTag, Destructive, Description (sorted by a click on a header; a
     double-click goes to the location) and a Tag tab with the tags that alias it (Scope, Tag, Alias For, Base Tag). */
  function xref(name0, o = {}) {
    const e = curEl();
    const st = {
      type: o.type || 'Tag', scope: o.scope || '', show: o.show || 'all', tab: o.tab || 'logic', sort: o.sort || null, sel: 0,
      name: name0 != null ? name0 : e && e.a[0] && e.a[0] !== '?' ? String(e.a[0]).split(/[.[]/)[0] : '',
    };
    const progs = allProgs();
    const allTags = () => [...S.p.tags.map(t => ({ t, scope: S.p.controller.name })), ...progs.flatMap(g => g.tags.map(t => ({ t, scope: g.name })))];
    const baseOf = n => { let t = allTags().find(x => U(x.t.name) === U(n)), k = 0; while (t && t.t.alias && k++ < 8) { const b = U(String(t.t.alias).split(/[.[]/)[0]); const nx = allTags().find(x => U(x.t.name) === b); if (!nx) return String(t.t.alias); t = nx; } return t ? t.t.name : n; };
    const match = n => { const q = U(st.name.trim()); if (!q) return false; const u = U(n); return q.endsWith('*') ? u.startsWith(q.slice(0, -1)) : u === q; };
    const rowsOf = () => {
      const rows = [];
      if (!st.name.trim()) return rows;
      progs.filter(g => !st.scope || g.name === st.scope).forEach(g => g.routines.forEach(r => r.rungs.forEach((rg, ri) => {
        const pr = E.parseRung(rg.t); if (pr.err) return;
        flat(pr.elems).forEach(p => {
          const x = getEl(pr.elems, p), d = INSTR[x.t]; if (!d) return;
          if (st.type === 'Routine') { if (x.t === 'JSR' && match(String(x.a[0]))) rows.push({ el: x.t, g: g.name, r: r.name, ri, p, ref: String(x.a[0]), base: '', dest: 'N', desc: '' }); return; }
          if (st.type === 'Label') { if ((x.t === 'JMP' || x.t === 'LBL') && match(String(x.a[0]))) rows.push({ el: x.t, g: g.name, r: r.name, ri, p, ref: String(x.a[0]), base: '', dest: 'N', desc: '' }); return; }
          x.a.forEach((a, k) => {
            const kind = (d.args[k] || '').replace('?', ''); if (['routine', 'label', 'imm', 'order', ...PICKK].includes(kind)) return;
            const names = kind === 'expr' ? (String(a).match(/[A-Za-z_][\w:]*(?:\[[^\]]*\])?(?:\.\w+)*/g) || []) : [String(a)];
            names.forEach(ref => {
              const b = ref.split(/[.[]/)[0]; if (!match(b)) return;
              const tg = tagFor(b);
              rows.push({ el: x.t, g: g.name, r: r.name, ri, p, ref, base: tg && tg.alias ? baseOf(b) + String(ref).slice(b.length) : '', dest: DESTR.includes(kind) ? 'Y' : 'N', desc: tg ? tg.desc || '' : '' });
            });
          });
        });
      })));
      return rows.filter(x => st.show === 'all' || (st.show === 'dest' ? x.dest === 'Y' : x.dest === 'N'));
    };
    const COLS = [['el', 'Element'], ['g', 'Container'], ['r', 'Routine'], ['ri', 'Location'], ['ref', 'Reference'], ['base', 'BaseTag'], ['dest', 'Destructive'], ['desc', 'Description']];
    let rows = [];
    const sorted = () => { const r = rowsOf(); if (st.sort) { const [k, dir] = st.sort; r.sort((a, b) => (k === 'ri' ? a.ri - b.ri : String(a[k]).localeCompare(String(b[k]))) * dir); } return r; };
    const aliasRows = () => { if (st.type !== 'Tag' || !st.name.trim()) return []; return allTags().filter(x => match(x.t.name) || (x.t.alias && match(String(x.t.alias).split(/[.[]/)[0]))).map(x => ({ scope: x.scope, tag: x.t.name, alias: x.t.alias || '', base: x.t.alias ? baseOf(x.t.name) : '' })); };
    const body = () => {
      rows = sorted();
      const head = COLS.map(([k, l]) => `<th data-xs="${k}">${l}${st.sort && st.sort[0] === k ? (st.sort[1] > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
      const logic = rows.length ? `<table class="xrt"><thead><tr>${head}</tr></thead><tbody>${rows.map((x, n) => `<tr data-x="${n}"${n === st.sel ? ' class="on"' : ''}><td class="mono">${x.el}</td><td>${esc(x.g)}</td><td>${esc(x.r)}</td><td>Rung ${x.ri}</td><td class="mono">${esc(x.ref)}</td><td class="mono">${esc(x.base)}</td><td>${x.dest}</td><td>${esc(x.desc)}</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">${st.name.trim() ? `No references to ${esc(st.name)}` : 'Type a name, or a few letters and *'}</div>`;
      const ar = aliasRows();
      const tagT = st.type !== 'Tag' ? '<div class="empty">This information is available only for tags.</div>' : ar.length ? `<table class="xrt"><thead><tr><th>Scope</th><th>Tag</th><th>Alias For</th><th>Base Tag</th></tr></thead><tbody>${ar.map(x => `<tr><td>${esc(x.scope)}</td><td class="mono">${esc(x.tag)}</td><td class="mono">${esc(x.alias)}</td><td class="mono">${esc(x.base)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No tags.</div>';
      return `<div class="xrh">
          <label>Type <select class="inp" id="xty">${['Tag', 'Routine', 'Label'].map(t => `<option${t === st.type ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <label>Scope <select class="inp" id="xsc"><option value="">${esc(S.p.controller.name)}</option>${progs.map(g => `<option${g.name === st.scope ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
          <label class="grow">Name <input class="inp mono" id="xq" list="xql" value="${esc(st.name)}" autocomplete="off"><datalist id="xql">${(st.type === 'Tag' ? allTags().map(x => x.t.name) : st.type === 'Routine' ? progs.flatMap(g => g.routines.map(r => r.name)) : []).map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
          <label>Show <select class="inp" id="xsh"><option value="all"${st.show === 'all' ? ' selected' : ''}>Show All</option><option value="dest"${st.show === 'dest' ? ' selected' : ''}>Destructive</option><option value="non"${st.show === 'non' ? ' selected' : ''}>Non-Destructive</option></select></label>
          <button class="btn" id="xgo">Refresh</button></div>
        <div class="xrtabs"><button class="xtab${st.tab === 'logic' ? ' on' : ''}" data-xt="logic">Logic</button><button class="xtab${st.tab === 'tag' ? ' on' : ''}" data-xt="tag">Tag</button><span class="grow"></span><span class="muted">${st.tab === 'logic' ? `${rows.length} reference(s)` : ''}</span></div>
        <div class="xrb">${st.tab === 'logic' ? logic : tagT}</div>`;
    };
    const goTo = x => { if (!x) return; closeLayer(); S.prog = x.g; S.routine = x.r; S.view = 'ladder'; S.sel = { ri: x.ri, path: x.p }; S.selRung = null; if (S.layout === 'phone') S.area = 'ladder'; reverify(); render(); scrollToSel(); };
    dialog({ title: 'Cross Reference - ' + st.type + ': ' + (st.name || ''), size: 'lg', flush: true, body: `<div class="xr" id="xr">${body()}</div>`,
      buttons: [{ l: 'Go To Location', run: () => { goTo(rows[st.sel]); return false; } }, { l: 'Close', pri: true }],
      mount: el => {
        const box = el.querySelector('#xr');
        const redraw = () => { const f = document.activeElement && document.activeElement.id; box.innerHTML = body(); const h = el.querySelector('.dh b'); if (h) h.textContent = 'Cross Reference - ' + st.type + ': ' + st.name; if (f === 'xq') { const q = box.querySelector('#xq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } };
        box.addEventListener('change', ev => { const id = ev.target.id; if (id === 'xty') { st.type = ev.target.value; st.sel = 0; } else if (id === 'xsc') st.scope = ev.target.value; else if (id === 'xsh') st.show = ev.target.value; else if (id === 'xq') st.name = ev.target.value; else return; redraw(); });
        box.addEventListener('keydown', ev => { if (ev.target.id === 'xq' && ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); st.name = ev.target.value; st.sel = 0; redraw(); } });
        box.addEventListener('click', ev => {
          let t;
          box.querySelectorAll('.xrm').forEach(m => m.remove());
          if (ev.target.id === 'xgo') { const q = box.querySelector('#xq'); st.name = q.value; redraw(); return; }
          if ((t = ev.target.closest('[data-xt]'))) { st.tab = t.dataset.xt; redraw(); return; }
          if ((t = ev.target.closest('[data-xs]'))) { const k = t.dataset.xs; st.sort = st.sort && st.sort[0] === k ? [k, -st.sort[1]] : [k, 1]; redraw(); return; }
          if ((t = ev.target.closest('[data-x]'))) { const n = +t.dataset.x; if (n === st.sel && (S.layout !== 'desktop')) { goTo(rows[n]); return; } st.sel = n; box.querySelectorAll('[data-x]').forEach(r => r.classList.toggle('on', +r.dataset.x === n)); }
        });
        box.addEventListener('dblclick', ev => { const t = ev.target.closest('[data-x]'); if (t) goTo(rows[+t.dataset.x]); });
        box.addEventListener('contextmenu', ev => {
          const t = ev.target.closest('[data-x]'); if (!t) return; ev.preventDefault(); ev.stopPropagation();
          const x = rows[+t.dataset.x], b = x.ref.split(/[.[]/)[0], tg = tagFor(b); st.sel = +t.dataset.x;
          const items = [['go', 'Go To Location', !1], ['edit', `Edit Tag "${b}"`, !tg], ['mon', `Monitor Tag "${b}"`, !tg], ['trend', `Trend Tag "${b}"`, !tg || !S.online]];
          box.querySelectorAll('.xrm').forEach(m => m.remove());
          const m = document.createElement('div'); m.className = 'menu xrm'; m.style.cssText = 'position:fixed;z-index:400';
          m.innerHTML = items.map(([k, l, dis]) => `<div class="it${dis ? ' dis' : ''}" data-xm="${k}"><span>${esc(l)}</span></div>`).join('');
          box.appendChild(m); m.style.left = Math.min(ev.clientX, innerWidth - m.offsetWidth - 6) + 'px'; m.style.top = Math.min(ev.clientY, innerHeight - m.offsetHeight - 6) + 'px';
          m.onclick = me => { const it = me.target.closest('[data-xm]'); me.stopPropagation(); m.remove(); if (!it || it.classList.contains('dis')) return; const k = it.dataset.xm; if (k === 'go') goTo(x); else if (k === 'edit') { closeLayer(); newTag({ tag: tg }); } else if (k === 'mon') { closeLayer(); monitorTag(b); } else if (k === 'trend') { closeLayer(); quickTrend(b); } };
        });
      } });
  }
  const HELP = E.HELP || { H: {}, TIPS: { en: [], tl: [] } }, HREF = E.HELPREF || { R: {}, KIND: {} };
  const HGRP = [['Debug', 'Debug Instructions (Logix Emulate)'], ['Bit', 'Bit Instructions'], ['Timer/Counter', 'Timer and Counter Instructions'], ['Input/Output', 'Input/Output Instructions'], ['Compare', 'Compare Instructions'], ['Compute/Math', 'Compute/Math Instructions'], ['Move/Logical', 'Move/Logical Instructions'], ['File/Misc', 'File/Misc. Instructions'], ['File/Shift', 'Array (File)/Shift Instructions'], ['Sequencer', 'Sequencer Instructions'], ['Program Control', 'Program Control Instructions'],
    ['Special', 'Special Instructions'], ['Trig Functions', 'Trigonometric Instructions'], ['Advanced Math', 'Advanced Math Instructions'], ['Math Conversions', 'Math Conversion Instructions']];
  const hlang = () => (S.prefs.helpLang === 'tl' ? 'tl' : 'en');
  /* Instruction Help, laid out as the reference software's instruction help: contents on the left; for the
     instruction, its operands, description, arithmetic status flags, fault conditions, execution and an example
     rung. A plain-language summary (English or Taglish) is at the end, folded. */
  // one instruction's help page (Instruction Help and Help > Contents)
  function instrPage(mn) {
    const grpOf = g => (HGRP.find(x => x[0] === g) || [g, g])[1];
    const example = () => {
      const h = (HELP.H[mn] || {}).en; if (!h) return '';
      const parts = h[2].split(';').map(x => x.trim()).filter(Boolean), rungsX = [], notes = [];
      parts.forEach(p => { const pr = /^[A-Z]{2,4}\(|^\[/.test(p) ? E.parseRung(p + ';') : { err: 1 }; if (!pr.err) rungsX.push({ elems: pr.elems }); else if (p !== '…') notes.push(p); });
      if (!rungsX.length) return `<p class="mono">${esc(h[2])}</p>`;
      const svg = L.render(rungsX, { W: 520, cell: 64, font: 11, descLines: 1 }).svg;
      return `<div class="ihex">${svg}</div>${notes.length ? `<p>${esc(notes.join('; ').replace(/^./, c => c.toUpperCase()).replace(/\.+$/, ''))}.</p>` : ''}`;
    };
    const page = () => {
      const d = INSTR[mn], r = HREF.R[mn] || { ops: [], exec: [] }, names = L.OPN[mn] || d.args.map((_, i) => 'Operand ' + i);
      const ops = d.args.length ? `<table class="iht"><thead><tr><th>Operand</th><th>Type</th><th>Format</th><th>Description</th></tr></thead><tbody>${d.args.map((k, i) => { const kd = HREF.KIND[k.replace('?', '')] || ['', '']; return `<tr><td>${esc(names[i] || 'Operand ' + i)}${k.endsWith('?') ? ' (optional)' : ''}</td><td>${esc(kd[0])}</td><td>${esc(kd[1])}</td><td>${esc(r.ops[i] || '')}</td></tr>`; }).join('')}</tbody></table>${r.members ? `<p class="muted">Structure members: ${esc(r.members)}</p>` : ''}` : '<p>None.</p>';
      const h = (HELP.H[mn] || {})[hlang()], lang = hlang();
      return `<h3>${esc(d.name)} (${mn})</h3><p class="muted">${esc(grpOf(d.grp))} · Available language: Relay Ladder</p>
        <h4>Operands</h4>${ops}
        <h4>Rung text</h4><p class="mono">${mn}(${names.map(() => '?').join(',')})</p>
        <h4>Description</h4><p>${esc(r.desc || d.name)}</p>
        <h4>Arithmetic Status Flags</h4><p>${esc(r.flags || 'Not affected.')}</p>
        <h4>Fault Conditions</h4><p>${esc(r.faults || 'None.')}</p>
        <h4>Execution</h4><table class="iht"><thead><tr><th>Condition</th><th>Relay Ladder Action</th></tr></thead><tbody>${(r.exec || []).map(([c, t]) => `<tr><td>${esc(c)}</td><td>${esc(t)}</td></tr>`).join('')}</tbody></table>
        <h4>Example</h4>${example()}
        ${h ? `<details class="ipl"${S.prefs.helpPlain ? ' open' : ''}><summary>Plain-language summary</summary>
          <div class="frow"><label>Language</label><select class="inp" data-hlsel="1" style="width:auto"><option value="en"${lang === 'en' ? ' selected' : ''}>English</option><option value="tl"${lang === 'tl' ? ' selected' : ''}>Filipino (Taglish)</option></select></div>
          <p><b>${lang === 'tl' ? 'Sa madaling salita' : 'In short'}:</b> ${esc(h[0])}</p><p>${esc(h[1])}</p><p><b>${lang === 'tl' ? 'Maihahambing sa' : 'Comparable to'}:</b> ${esc(h[3])}</p></details>` : ''}`;
    };
    return page();
  }
  function instrHelp(start) {
    const e = curEl();
    let mn = typeof start === 'string' && INSTR[start] ? start : e && INSTR[e.t] ? e.t : 'XIC';
    const grpOf = g => (HGRP.find(x => x[0] === g) || [g, g])[1];
    const groups = [...new Set(Object.values(INSTR).map(d => d.grp))];
    const toc = groups.map(g => `<div class="ihg">${esc(grpOf(g))}</div>${Object.keys(INSTR).filter(k => INSTR[k].grp === g).map(k => `<div class="ihi" data-ih="${k}">${k}<span>${esc(INSTR[k].name)}</span></div>`).join('')}`).join('');
    const pick = `<select class="inp hpick" aria-label="Instruction">${groups.map(g => `<optgroup label="${esc(grpOf(g))}">${Object.keys(INSTR).filter(k => INSTR[k].grp === g).map(k => `<option value="${k}">${k} - ${esc(INSTR[k].name)}</option>`).join('')}</optgroup>`).join('')}</select>`;
    const page = () => instrPage(mn);
    dialog({ title: 'Instruction Help', size: 'lg', flush: true,
      body: `<div class="ihelp"><aside class="ihl">${toc}</aside><div class="ihr"><div class="ihpick">${pick}</div><article class="ihc">${page()}</article></div></div>`,
      buttons: [{ l: 'Close', pri: true }],
      mount: el => {
        const sel = el.querySelector('.hpick'), art = el.querySelector('.ihc');
        const show = () => { sel.value = mn; art.innerHTML = page(); art.scrollTop = 0; el.querySelectorAll('[data-ih]').forEach(x => x.classList.toggle('on', x.dataset.ih === mn)); const on = el.querySelector('.ihi.on'); if (on) on.scrollIntoView({ block: 'nearest' }); };
        show();
        sel.onchange = () => { mn = sel.value; show(); };
        el.addEventListener('click', ev => { const i = ev.target.closest('[data-ih]'); if (i) { mn = i.dataset.ih; show(); } });
        el.addEventListener('change', ev => { if (ev.target.dataset.hlsel) { S.prefs.helpLang = ev.target.value; S.prefs.helpPlain = true; savePrefs(); art.innerHTML = page(); } });
        el.addEventListener('toggle', ev => { if (ev.target.matches && ev.target.matches('details.ipl')) { S.prefs.helpPlain = ev.target.open; savePrefs(); } }, true);
      } });
  }
  /* Help > Contents: the help window of the reference (help v37 opens on Contents, with Index and Search) over the
     help this app has: Getting Started, the keyboard shortcuts and every instruction's page. Contents is a tree of
     topics; Index lists keywords (type to find one); Search lists the topics that have all the words typed. */
  function helpTopics() {
    const grpOf = g => (HGRP.find(x => x[0] === g) || [g, g])[1], T = [];
    const tips = HELP.TIPS.en || [];
    T.push({ id: 'start', t: 'Getting Started', lv: 0, html: () => `<h3>Getting Started</h3><table class="iht"><tbody>${tips.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`, txt: tips.flat().join(' '), kw: tips.map(x => x[0]) });
    const keys = Object.keys(C).filter(k => C[k].k).map(k => [C[k].k, C[k].l.replace(/…$/, '')]).concat([['F2', 'Edit the selected operand'], ['Shift+F10', 'Shortcut menu of the selection'], ['Ctrl+Home / Ctrl+End', 'First / last rung'], ['Ctrl+Enter', 'Accept the comment or description being edited'],
      ['Alt+Enter', 'Properties of the active routine'], ['Alt+0', 'Show or hide the Controller Organizer'], ['Alt+1', 'Show or hide the Errors window'], ['Alt+F, E, V, S, L, C, T, H', 'Open the File, Edit, View, Search, Logic, Communications, Tools, Help menu'],
      ['Ctrl+PageDown / Ctrl+PageUp', 'Next / previous routine window'], ['Ctrl+Tab / Shift+Ctrl+Tab, Ctrl+F6', 'Next / previous window (routine or tags)'], ['Ctrl+F4', 'Close the window in focus'], ['Ctrl+D (a rung selected)', 'Edit the rung comment'], ['Esc', 'Cancel; clear the selection']]);
    T.push({ id: 'keys', t: 'Keyboard Shortcuts', lv: 0, html: () => `<h3>Keyboard Shortcuts</h3><table class="iht"><thead><tr><th>Keys</th><th>Command</th></tr></thead><tbody>${keys.map(([k, l]) => `<tr><td class="mono">${esc(k)}</td><td>${esc(l)}</td></tr>`).join('')}</tbody></table>`, txt: keys.flat().join(' '), kw: ['keyboard shortcuts', 'shortcut keys'] });
    T.push({ id: 'ins', t: 'Instructions', lv: 0, folder: true });
    [...new Set(Object.values(INSTR).map(d => d.grp))].forEach(g => {
      T.push({ id: 'g:' + g, t: grpOf(g), lv: 1, folder: true });
      Object.keys(INSTR).filter(k => INSTR[k].grp === g).forEach(k => { const r = HREF.R[k] || {}; T.push({ id: 'i:' + k, t: `${INSTR[k].name} (${k})`, lv: 2, up: 'g:' + g, html: () => instrPage(k), txt: [k, INSTR[k].name, r.desc || '', (r.ops || []).join(' '), r.members || '', (r.exec || []).flat().join(' ')].join(' '), kw: [k, INSTR[k].name] }); });
    });
    return T;
  }
  function helpContents(tab, q0) {
    const T = helpTopics(), pages = T.filter(x => x.html);
    let on = 'start', at = tab === 'index' || tab === 'search' ? tab : 'contents';
    const open = new Set(['ins']);
    const KW = pages.flatMap(x => x.kw.map(k => [k, x.id])).sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }));
    const side = (el) => {
      const q = (el && el.querySelector('#hq') || {}).value || q0 || '';
      if (at === 'contents') return T.filter(x => x.lv === 0 || (x.lv === 1 && open.has('ins')) || (x.lv === 2 && open.has('ins') && open.has(x.up))).map(x => `<div class="row${x.id === on ? ' on' : ''}" data-ht="${x.id}" style="padding-left:${8 + x.lv * 16}px">${x.folder ? `<span class="blx">${open.has(x.id) ? '−' : '+'}</span>` : '<span class="blx"></span>'}${esc(x.t)}</div>`).join('');
      if (at === 'index') { const u = q.trim().toLowerCase(); return KW.filter(([k]) => !u || k.toLowerCase().startsWith(u) || k.toLowerCase().includes(u)).map(([k, id]) => `<div class="row${id === on ? ' on' : ''}" data-ht="${id}">${esc(k)}</div>`).join('') || '<div class="empty">No keyword.</div>'; }
      const w = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!w.length) return '<div class="empty">Type the words to find, then List Topics.</div>';
      const hit = pages.filter(x => w.every(y => (x.t + ' ' + x.txt).toLowerCase().includes(y)));
      return hit.map(x => `<div class="row${x.id === on ? ' on' : ''}" data-ht="${x.id}">${esc(x.t)}</div>`).join('') || '<div class="empty">No topics found.</div>';
    };
    const head = () => at === 'contents' ? '' : at === 'index' ? `<label for="hq">Type in the keyword to find:</label><input class="inp" id="hq" value="${esc(q0 || '')}" autocomplete="off">` : `<label for="hq">Type in the word(s) to search for:</label><div class="hqrow"><input class="inp" id="hq" value="${esc(q0 || '')}" autocomplete="off"><button type="button" class="btn" id="hgo">List Topics</button></div>`;
    const el = dialog({ title: 'Help', size: 'lg', flush: true,
      body: `<div class="ihelp hcont"><aside class="ihl"><div class="xrtabs">${[['contents', 'Contents'], ['index', 'Index'], ['search', 'Search']].map(([k, l]) => `<button class="xtab${k === at ? ' on' : ''}" data-hct="${k}">${l}</button>`).join('')}</div><div class="hqh" id="hqh">${head()}</div><div class="gwl hlist" id="hl"></div></aside><div class="ihr"><article class="ihc" id="hc"></article></div></div>`,
      buttons: [{ l: 'Close', pri: true }] });
    const q = x => el.querySelector(x);
    const list = () => { q('#hl').innerHTML = side(el); };
    const show = id => { const x = pages.find(p => p.id === id); if (!x) return; on = id; q('#hc').innerHTML = x.html(); q('#hc').scrollTop = 0; el.querySelectorAll('#hl [data-ht]').forEach(r => r.classList.toggle('on', r.dataset.ht === id)); };
    list(); show(on); q0 = '';
    el.addEventListener('click', ev => {
      const tb = ev.target.closest('[data-hct]'); if (tb) { at = tb.dataset.hct; el.querySelectorAll('[data-hct]').forEach(b => b.classList.toggle('on', b === tb)); q('#hqh').innerHTML = head(); list(); const i = q('#hq'); if (i) i.focus(); return; }
      if (ev.target.id === 'hgo') { list(); return; }
      const r = ev.target.closest('#hl [data-ht]'); if (!r) return;
      const x = T.find(t => t.id === r.dataset.ht);
      if (x.folder) { if (open.has(x.id)) open.delete(x.id); else open.add(x.id); list(); return; }
      show(x.id);
    });
    el.addEventListener('input', ev => { if (ev.target.id === 'hq' && at === 'index') list(); });
    el.addEventListener('keydown', ev => { if (ev.target.id === 'hq' && ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); list(); const f = q('#hl [data-ht]'); if (f && at === 'index') show(f.dataset.ht); } });
  }
  /* Getting Started: how to work the editor and the emulator (Help > Getting Started) */
  function tipsDlg() {
    const rows = (HELP.TIPS.en || []);
    dialog({ title: 'Getting Started', size: 'md', body: `<table class="iht"><tbody>${rows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`, buttons: [{ l: 'Close', pri: true }] });
  }
  function about() {
    dialog({ title: 'About MT PLC Studio', body: `<div style="display:flex;gap:14px;align-items:center"><img src="icons/icon-192.png" width="64" height="64" alt=""><div><b style="font-size:16px">MT PLC Studio</b><br>Version ${VERSION}${BUILD !== 'dev' ? ` <span class="muted">(${esc(BUILD)})</span>` : ''}<br><span class="muted">Tag-based PLC ladder programming and simulation.</span></div></div>
      <p class="help">Built-in controller PLC-CPU 1.0. Instruction behaviour follows the reference software's instruction help. Not affiliated with any PLC manufacturer.</p>`, buttons: [{ l: 'Updates…', run: () => { setTimeout(() => C.updates.run(), 0); } }, { l: 'Close', pri: true }] });
  }
  /* Tools > Options, as the Workstation Options dialog (help v37): the Categories list on the left (a changed
     category gets a * after its name), the page of the category, Reset Category; OK, Cancel, Apply. The pages are the
     options this app has: Application, Ladder Editor, Ladder Editor > Display, and the app's own Appearance. */
  const OCATS = [['app', 'Application', 0], ['ladd', 'Ladder Editor', 0], ['ladv', 'Display', 1], ['look', 'Appearance', 0]];
  function options(cat) {
    const P = S.prefs, was = [P.theme, P.mode], back = () => { [P.theme, P.mode] = was; applyTheme(); };
    let on = OCATS.some(c => c[0] === cat) ? cat : 'app';
    const lp = ladPref, ck = (id, v, t) => `<label class="ockb"><input type="checkbox" id="${id}"${v ? ' checked' : ''}> ${t}</label>`;
    const num = (id, v, a, b, t, ph) => `<div class="frow"><label for="${id}">${t}</label><input class="inp" id="${id}" type="number" min="${a}" max="${b}" value="${v || ''}"${ph ? ` placeholder="${ph}"` : ''}></div>`;
    const pages = {
      app: `<div class="grp">Application</div>
        <div class="frow"><label>Communications</label><label class="rlck"><input type="checkbox" id="ofc"${P.fastComm ? ' checked' : ''}>Fast communications (no connect, browse or transfer delays)</label></div>`,
      ladd: `<div class="grp">Ladder Editor</div>
        <label class="ockb"><input type="checkbox" id="oqk"${P.quickKeys ? ' checked' : ''}> Enable Quick Keys</label>
        <p class="help">On: one key inserts an instruction after the selection: ${Object.entries(QUICK).map(([q, m]) => `<b class="mono">${q.toUpperCase()}</b> ${m === 'BR' ? 'Branch' : m}`).join(', ')}. Off (the default): typing edits the selected operand; Alt+Insert opens Add Ladder Element.</p>`,
      ladv: `<div class="grp">Ladder Editor &gt; Display</div>
        ${ck('ordsc', lp('rdesc'), 'Show Routine Description')}
        <div class="grp">Rung Display</div>${ck('ornum', lp('nums'), 'Show Rung Numbers')}${ck('orcm', lp('cm'), 'Show Rung Comments')}${num('orcl', lp('cmLines'), 1, 1000, 'Maximum Lines')}
        <div class="grp">Instruction Display</div>${ck('oodsc', lp('desc'), 'Show Main Operand Description')}${num('oodl', lp('descLines'), 1, 20, 'Maximum Lines', 'Automatic (2, 1 on a phone)')}${ck('oali', lp('alias'), 'Show Tag Alias Information')}`,
      look: `<div class="grp">Appearance</div>
        <div class="frow"><label>Layout</label><select class="inp" id="ol">${[['auto', 'Automatic (follows the window)'], ['desktop', 'Desktop'], ['tablet', 'Tablet'], ['phone', 'Phone']].map(([v, t]) => `<option value="${v}"${P.layout === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="frow"><label>Theme</label><div class="thpick" role="radiogroup" aria-label="Theme">${THEMES.map(([v, n, d, sh, bg, cv, on]) => `<button type="button" class="thc" role="radio" data-th="${v}" aria-checked="${P.theme === v}"><span class="tmini" style="background:${bg};--mon:${on}"><i style="background:${sh}"></i><span><u style="background:${sh}"></u><u style="background:${cv}"></u></span></span><b>${n}</b><small>${d}</small></button>`).join('')}</div></div>
        <div class="frow"><label>Mode</label><div class="thmode" role="group" aria-label="Mode">${[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Follow the device']].map(([v, t]) => `<button type="button" data-thm="${v}" aria-pressed="${P.mode === v}">${t}</button>`).join('')}</div></div>
        <div class="frow"><label>Density</label><select class="inp" id="od">${[['auto', 'Automatic (compact with a mouse, larger on touch)'], ['compact', 'Compact'], ['touch', 'Touch (larger)']].map(([v, t]) => `<option value="${v}"${P.density === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="frow"><label>Ladder zoom</label><input class="inp" id="oz" type="range" min="60" max="200" step="5" value="${Math.round(P.zoom * 100)}"></div>`,
    };
    const dirty = new Set();
    const cats = () => OCATS.map(([k, t, lv]) => `<div class="row${k === on ? ' on' : ''}" data-ocat="${k}" style="padding-left:${8 + lv * 16}px">${t}${dirty.has(k) ? '*' : ''}</div>`).join('');
    // the defaults of a category (Reset Category)
    const reset = el => {
      const q = x => el.querySelector(x);
      if (on === 'app') q('#ofc').checked = false;
      if (on === 'ladd') q('#oqk').checked = false;
      if (on === 'ladv') { q('#ordsc').checked = LADDEF.rdesc; q('#ornum').checked = LADDEF.nums; q('#orcm').checked = LADDEF.cm; q('#orcl').value = LADDEF.cmLines; q('#oodsc').checked = LADDEF.desc; q('#oodl').value = ''; q('#oali').checked = LADDEF.alias; }
      if (on === 'look') { q('#ol').value = 'auto'; q('#od').value = 'auto'; q('#oz').value = 100; P.theme = 'classic'; P.mode = 'auto'; applyTheme(); el.querySelectorAll('[data-th]').forEach(b => b.setAttribute('aria-checked', b.dataset.th === 'classic')); el.querySelectorAll('[data-thm]').forEach(b => b.setAttribute('aria-pressed', b.dataset.thm === 'auto')); }
      dirty.add(on); el.querySelector('#ocats').innerHTML = cats();
    };
    const clamp = (v, a, b) => { const n = parseInt(v, 10); return n >= a ? Math.min(b, n) : 0; };
    const save = el => {
      const q = x => el.querySelector(x);
      P.quickKeys = q('#oqk').checked; P.fastComm = q('#ofc').checked; P.layout = q('#ol').value; P.density = q('#od').value; P.zoom = +q('#oz').value / 100;
      const lad = { rdesc: q('#ordsc').checked, nums: q('#ornum').checked, cm: q('#orcm').checked, cmLines: clamp(q('#orcl').value, 1, 1000) || LADDEF.cmLines, desc: q('#oodsc').checked, descLines: clamp(q('#oodl').value, 1, 20), alias: q('#oali').checked };
      P.lad = {}; Object.keys(lad).forEach(k => { if (lad[k] !== LADDEF[k]) P.lad[k] = lad[k]; });
      savePrefs(); applyTheme(); was[0] = P.theme; was[1] = P.mode;
      dirty.clear(); el.querySelector('#ocats').innerHTML = cats();
      setTimeout(render, 0);
    };
    dialog({ title: 'Options', size: 'lg',
      body: `<div class="optd"><div><label>Categories:</label><div class="gwl" id="ocats">${cats()}</div></div>
        <div class="optpg">${OCATS.map(([k]) => `<div data-opg="${k}"${k === on ? '' : ' hidden'}>${pages[k]}</div>`).join('')}
        <div class="brow"><button type="button" class="btn" id="oreset">Reset Category</button></div></div></div>`,
      // a theme shows at once; Cancel or Close puts the one before back
      mount: el => {
        el.addEventListener('click', ev => {
          const c = ev.target.closest('[data-th]'), m = ev.target.closest('[data-thm]'), g = ev.target.closest('[data-ocat]');
          if (g) { on = g.dataset.ocat; el.querySelectorAll('[data-opg]').forEach(x => { x.hidden = x.dataset.opg !== on; }); el.querySelector('#ocats').innerHTML = cats(); return; }
          if (ev.target.closest('#oreset')) { reset(el); return; }
          if (c) { P.theme = c.dataset.th; el.querySelectorAll('[data-th]').forEach(b => b.setAttribute('aria-checked', b === c)); }
          if (m) { P.mode = m.dataset.thm; el.querySelectorAll('[data-thm]').forEach(b => b.setAttribute('aria-pressed', b === m)); }
          if (c || m) { applyTheme(); if (!dirty.has('look')) { dirty.add('look'); el.querySelector('#ocats').innerHTML = cats(); } }
        });
        const mark = ev => { const pg = ev.target.closest('[data-opg]'); if (pg && !dirty.has(pg.dataset.opg)) { dirty.add(pg.dataset.opg); el.querySelector('#ocats').innerHTML = cats(); } };
        el.addEventListener('change', mark); el.addEventListener('input', mark);
      },
      onClose: back,
      buttons: [{ l: 'Cancel', run: back }, { l: 'Apply', run: el => { save(el); return false; } }, { l: 'OK', pri: true, run: el => { save(el); } }] });
  }

  /* ---------- projects: new, open, save as, import, export ---------- */
  /* ---------- communications drivers (spec section 17), like the communications software's Configure Drivers ----------
     Who Active, Go Online, Download and Upload need a running driver. The emulator is reached with the Emulate
     Ethernet driver; the others are listed for what they are but not available here. */
  const DRVTYPES = [['vbp', 'Virtual Backplane', 'Reaches the emulated chassis slot by slot, as the emulator\'s virtual backplane (path VBP-1\\<slot>).', true],
    ['emulate', 'Emulate Ethernet', 'Reaches emulated controllers by IP address (127.0.0.x).', true],
    ['ethip', 'EtherNet/IP', 'Real controllers on a network: not in this version.', false]];
  const DRVNAME = { vbp: 'Virtual Backplane', emulate: 'Ethernet' };
  let drvSel = 'vbp';
  const drivers = (() => {
    const d = store.get('emu.drivers', null);
    if (Array.isArray(d)) return d;
    // a first start (nothing saved yet) begins without a driver, so the setup shows the first step for real
    const fresh = !store.get('emu', null) && !store.get('chassis', null) && !store.get('index', []).length && !navigator.webdriver;
    const v = fresh ? [] : [{ name: 'EMULATE-1', type: 'emulate', run: true }];
    store.set('emu.drivers', v);
    return v;
  })();
  const saveDrivers = () => store.set('emu.drivers', drivers);
  const driverUp = type => drivers.some(d => d.run && (type ? d.type === type : d.type === 'emulate' || d.type === 'vbp'));
  const vbpName = () => (drivers.find(d => d.type === 'vbp') || { name: 'VBP-1' }).name;
  const vbpPath = slot => vbpName() + '\\' + slot;
  function addDriver(type) {
    const base = type === 'vbp' ? 'VBP-' : 'EMULATE-';
    let n = 1; while (drivers.some(d => d.name === base + n)) n++;
    drivers.push({ name: base + n, type, run: true }); saveDrivers();
  }
  function driversHTML() {
    const sel = drvSel;
    return `<div class="drv"><div class="drvcol"><div class="lbl">Available driver types</div>${DRVTYPES.map(([k, n, d, ok]) => `<div class="row${sel === k ? ' on' : ''}${ok ? '' : ' dim'}" data-drvt="${k}"><div class="grow"><div class="nm">${n}</div><div class="sub">${d}</div></div></div>`).join('')}
        <button class="btn pri" data-drvadd="1"${drivers.some(d => d.type === sel) ? ' disabled' : ''}>Add New…</button></div>
      <div class="drvcol"><div class="lbl">Configured drivers</div>${drivers.map((d, i) => `<div class="row"><div class="grow"><div class="nm mono">${esc(d.name)}, ${DRVNAME[d.type] || d.type}</div><div class="sub">${d.run ? '<b style="color:var(--ok)">Running</b>' : 'Stopped'}</div></div><button class="btn" data-drvrun="${i}">${d.run ? 'Stop' : 'Start'}</button><button class="btn" data-drvdel="${i}">${ic('trash')}</button></div>`).join('') || '<div class="empty">No drivers. Pick Virtual Backplane, then Add New.</div>'}</div></div>`;
  }
  function driverClick(t, redraw) {
    let el;
    if ((el = t.closest('[data-drvadd]'))) { addDriver(drvSel); relink(); redraw(); return true; }
    if ((el = t.closest('[data-drvrun]'))) { const d = drivers[+el.dataset.drvrun]; d.run = !d.run; saveDrivers(); relink(); redraw(); return true; }
    if ((el = t.closest('[data-drvdel]'))) { drivers.splice(+el.dataset.drvdel, 1); saveDrivers(); relink(); redraw(); return true; }
    if ((el = t.closest('[data-drvt]'))) { if (!DRVTYPES.find(x => x[0] === el.dataset.drvt)[3]) { toast('That driver is not available in this version.'); return true; } drvSel = el.dataset.drvt; redraw(); return true; }
    return false;
  }
  const configureDrivers = () => rslinx('drivers');

  /* ---------- RSLinx Classic diagnostic counters (Driver Diagnostics, CIP Diagnostics, Station Diagnostics) ----------
     What the drivers carry is counted the way RSLinx Classic counts it (RSLinx Classic help, Driver Diagnostics and
     CIP Diagnostics): an RSWho browse or poll is one unconnected request and its reply per device, Go Online opens a
     CIP connection (a Forward Open), and while online the tag updates go as connected packets, 4 a second each way.
     The labels are the ones of the help; Packets/second is worked out every second. */
  const RLDIAG = {
    vbp: [['gen', 'General', ['Unconnected requests sent', 'Unconnected responses sent', 'Connected packets sent', 'Unsendable packets', 'Sends failed', 'Unconnected requests received', 'Unconnected responses received', 'Connected packets received', 'Unrecognized receipts']],
      ['perf', 'Performance', null], ['vb', 'Virtual Backplane', ['Packets received', 'Untraceable packets']]],
    eth: [['gen', 'General', ['Commands Sent', 'Replies Received', 'Unsol. Received', 'Unsol. Replied', 'Broadcast Sent', 'Broadcast Received', 'Communication Errors', 'Commands canceled', 'Commands timed out', 'Connections open', 'Total connections initiated', 'Server connections open', 'Total connections accepted']],
      ['perf', 'Performance', null], ['log', 'Connection Event Log', null], ['act', 'Active Connections', null]],
    cip: [['disp', 'CIP Dispatching', ['"Fast" PCCC requests via Messaging', '"Slow" PCCC requests via Messaging', '"Fast" PCCC requests via DHRIO', '"Slow" PCCC requests via DHRIO', 'Requests canceled', 'Requests not sent', 'Requests sent unconnected', 'Requests sent connected', 'Requests timed out unconnected', 'Requests timed out on connection', 'Requests failed with connection', 'CIP error responses received', 'PCCC responses received', 'Connections open', 'Connections attempted', 'Connections established', 'Connections rejected', 'Connections closed', 'Connections timed out', 'Connections dropped']],
      ['msg', 'Messaging', ['PCCC requests received', 'PCCC replies canceled', 'PCCC replies returned', 'CIP requests received', 'CIP replies canceled', 'CIP replies returned', 'MR connections open', 'MR connections requested', 'MR connections accepted', 'MR connections closed', 'MR connections timed out', 'MR connection receipts', 'MR connection sends', 'Unconnected requests outstanding', 'Unconnected requests sent', 'Unconnected requests failed', 'Unconnected requests canceled', 'Unconnected requests completed', 'Unconnected requests timed out', 'Fragmentation NAKs received']],
      ['conn', 'Connections', ['Originated connections', 'Bridged connections', 'Accepted connections', 'Connection open attempts', 'Open attempts rejected', 'Connection close attempts', 'Close attempts rejected', 'Connections established', 'Connections closed', 'Connections timed out sending', 'Connections timed out receiving', 'Connections dropped', 'Packet send attempts', 'Packets written', 'Packets overwritten', 'Packets sent', 'Packets resent', 'Packets received', 'Invalid receipts', 'Duplicate receipts']]] };
  const rlStat = { d: {}, cip: {}, m: {} };
  let rlCur = null;   // the CIP connection open now: { drv, path, node, host, bs, br }
  const rlD = n => rlStat.d[n] || (rlStat.d[n] = { c: {}, ev: [], rate: [0, 0], prev: [0, 0] });
  const rlInc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
  const rlEth = d => !!d && d.type !== 'vbp';
  const rlDrvOf = path => { const x = parsePath(path); return x ? drivers.find(d => d.run && d.type === (x.vbp ? 'vbp' : 'emulate')) || null : null; };
  // the station number of an address on the Ethernet driver: its row in the station mapping (Configure…)
  const rlStation = ip => { const st = []; racks.forEach(r => r.controllers().forEach(m => { if (m.ip && !st.includes(m.ip)) st.push(m.ip); })); const i = st.indexOf(ip); return i < 0 ? st.length : i; };
  function rlEvt(d, node, err) { const s = rlD(d.name); s.ev.unshift({ t: Date.now(), node, err }); if (s.ev.length > 255) s.ev.length = 255; }
  // one unconnected request to a device (a browse, a poll, Device Properties); ok false: the device does not answer
  function rlUnc(d, ok, node) {
    if (!d) return;
    const c = rlD(d.name).c, x = rlStat.cip;
    if (rlEth(d)) { rlInc(c, 'Commands Sent'); if (ok) rlInc(c, 'Replies Received'); else { rlInc(c, 'Commands timed out'); rlInc(c, 'Communication Errors'); rlEvt(d, node, 'Command timed out: no reply from the node'); } }
    else { rlInc(c, 'Unconnected requests sent'); if (ok) { rlInc(c, 'Unconnected responses received'); rlInc(c, 'Packets received'); } else rlInc(c, 'Sends failed'); }
    rlInc(x, 'msg:Unconnected requests sent'); rlInc(x, ok ? 'msg:Unconnected requests completed' : 'msg:Unconnected requests timed out');
  }
  // an RSWho node found by a browse (or polled by Autobrowse): its driver is the first part of its key
  function rlAsk(n) {
    if (!n || !n.m) return;
    const d = drivers.find(x => x.name === n.k.slice(2).split('/')[0]), ip = (/\/ip:([\d.]+)/.exec(n.k) || [])[1], ok = !n.m.ctl || n.m.ctl.powered;
    rlUnc(d, ok, ip ? rlStation(ip) : n.m.slot);
    if (d && ok) rlInc(rlM(rlRackOf(n.m), n.m), 'Unconnected requests received');
  }
  // n packets each way on the open connection (the tag updates while online)
  function rlPkt(n) {
    const d = rlCur && drivers.find(x => x.name === rlCur.drv && x.run);
    if (!d) return;
    const c = rlD(d.name).c;
    if (rlEth(d)) { rlInc(c, 'Commands Sent', n); rlInc(c, 'Replies Received', n); } else { rlInc(c, 'Connected packets sent', n); rlInc(c, 'Connected packets received', n); rlInc(c, 'Packets received', n); }
    ['Packet send attempts', 'Packets written', 'Packets sent', 'Packets received'].forEach(k => rlInc(rlStat.cip, 'conn:' + k, n));
    rlCur.bs += n * jitter(60, 90); rlCur.br += n * jitter(90, 260);
  }
  // Go Online, Download, Upload: the connection to the controller at the path (one at a time, as the project has one path)
  function rlOpen(path) {
    if (rlCur && rlCur.path === path) return;
    rlClose(false);
    const d = rlDrvOf(path), x = parsePath(path);
    if (!d || !x) return;
    rlUnc(d, true, x.vbp ? x.slot : rlStation(x.ip));
    ['Connection open attempts', 'Connections established'].forEach(k => rlInc(rlStat.cip, 'conn:' + k));
    if (rlEth(d)) rlInc(rlD(d.name).c, 'Total connections initiated');
    const t = resolve(path);
    if (t && t.m) ['Connection requests received', 'Connections accepted'].forEach(k => rlInc(rlM(t.rack, t.m), k));
    rlCur = { drv: d.name, path, node: x.vbp ? x.slot : rlStation(x.ip), host: x.vbp ? `${x.vbp}\\${x.slot}` : x.ip, bs: 0, br: 0 };
  }
  function rlClose(lost) {
    if (!rlCur) return;
    const d = drivers.find(x => x.name === rlCur.drv);
    rlInc(rlStat.cip, 'conn:Connection close attempts'); rlInc(rlStat.cip, lost ? 'conn:Connections timed out receiving' : 'conn:Connections closed');
    if (lost && rlEth(d)) rlEvt(d, rlCur.node, 'Connection timed out: the node stopped answering');
    const t = resolve(rlCur.path), x = parsePath(rlCur.path), r = t && t.rack, m = r && x && r.module(x.slot);
    if (m) rlInc(rlM(r, m), lost ? 'Connections timed out' : 'Connections closed');
    rlCur = null;
  }
  // no controller answers at the path: the open attempt is rejected (the Ethernet driver logs it)
  function rlRefused(path) {
    const d = rlDrvOf(path), x = parsePath(path);
    if (!d || !x) return;
    rlUnc(d, false, x.vbp ? x.slot : rlStation(x.ip));
    rlInc(rlStat.cip, 'conn:Connection open attempts'); rlInc(rlStat.cip, 'conn:Open attempts rejected');
    const t = resolve(path);
    if (t && t.m && !t.m.ctl) rlInc(rlM(t.rack, t.m), 'Connections rejected');
  }
  setInterval(() => {
    if (!rlCur) return;
    const x = resolve(rlCur.path);
    if (!x || !x.ctl || !drivers.some(d => d.name === rlCur.drv && d.run)) { rlClose(true); return; }
    if (S.online && ctl !== NOCTL) rlPkt(1); else if (!linked || performance.now() - linked.t > 15000) rlClose(false);
  }, 250);
  const rlTot = (d, s) => (rlEth(d) ? [s.c['Commands Sent'] || 0, s.c['Replies Received'] || 0] : [(s.c['Unconnected requests sent'] || 0) + (s.c['Connected packets sent'] || 0) + (s.c['Unconnected responses sent'] || 0), (s.c['Unconnected responses received'] || 0) + (s.c['Connected packets received'] || 0) + (s.c['Unconnected requests received'] || 0)]);
  setInterval(() => drivers.forEach(d => { const s = rlD(d.name), t = rlTot(d, s); s.rate = [Math.max(0, t[0] - s.prev[0]), Math.max(0, t[1] - s.prev[1])]; s.prev = t; }), 1000);
  /* the diagnostic windows: a table of counters per tab; md.snap holds them while the window is frozen */
  const rlNum = v => `<td class="mono">${(v || 0).toLocaleString('en-US')}</td>`;
  const rlCtab = (labels, get) => `<table class="rltab rldtab"><thead><tr><th>Counter</th><th>Value</th></tr></thead><tbody>${labels.map(l => `<tr><td>${esc(l)}</td>${rlNum(get(l))}</tr>`).join('')}</tbody></table>`;
  function rlDrvBody(md) {
    const src = md.snap || { d: rlStat.d, cur: rlCur }, d = drivers.find(x => x.name === md.name);
    if (!d) return '<p class="help">The driver was deleted.</p>';
    const s = src.d[d.name] || { c: {}, ev: [], rate: [0, 0] }, tabs = RLDIAG[rlEth(d) ? 'eth' : 'vbp'], tab = tabs.find(t => t[0] === md.tab) || tabs[0];
    const cur = src.cur && src.cur.drv === d.name ? src.cur : null, gauge = { 'Connections open': cur ? 1 : 0 };
    if (tab[0] === 'perf') return `${rlCtab(['Packets Sent/second', 'Packets received/second'], l => s.rate[l.startsWith('Packets Sent') ? 0 : 1])}<p class="help">${d.run ? `${esc(d.name)} is running.` : `${esc(d.name)} is stopped: nothing goes through it.`}</p>`;
    if (tab[0] === 'log') return `<table class="rltab rldtab rlwide"><thead><tr><th>Time</th><th>Node</th><th>Error Description</th></tr></thead><tbody>${s.ev.map(e => `<tr><td class="mono">${esc(new Date(e.t).toLocaleTimeString())}</td><td class="mono">${esc(String(e.node))}</td><td>${esc(e.err)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No connection events.</td></tr>'}</tbody></table><p class="help">The last 255 events are kept.</p>`;
    if (tab[0] === 'act') return `<table class="rltab rldtab rlwide"><thead><tr><th>Node</th><th>Station</th><th>Host Name</th><th>Bytes sent</th><th>Bytes Received</th></tr></thead><tbody>${cur ? `<tr><td class="mono">${esc(String(cur.node))}</td><td class="mono">${esc(String(cur.node))}</td><td class="mono">${esc(cur.host)}</td>${rlNum(cur.bs)}${rlNum(cur.br)}</tr>` : '<tr><td colspan="5" class="muted">No active connections.</td></tr>'}</tbody></table><p class="help">Updated every 2 seconds.</p>`;
    return rlCtab(tab[2], l => (l in gauge ? gauge[l] : s.c[l]));
  }
  function rlCipBody(md) {
    const src = md.snap || { cip: rlStat.cip, cur: rlCur }, tab = RLDIAG.cip.find(t => t[0] === md.tab) || RLDIAG.cip[0];
    const gauge = { 'conn:Originated connections': src.cur ? 1 : 0 };
    return rlCtab(tab[2], l => { const k = tab[0] + ':' + l; return k in gauge ? gauge[k] : src.cip[k]; });
  }
  const rlTabs = (md, tabs) => `<div class="fchips dtabs rldt">${tabs.map(([k, l]) => `<span class="fchip${k === md.tab ? ' on' : ''}" data-rltab="${k}">${esc(l)}</span>`).join('')}</div>`;
  const rlWin = (title, tabs, body, foot) => `<div class="rlov rlov2 rldgo"><div class="rlbox rldg" role="dialog" aria-label="${esc(title)}"><div class="bh">${esc(title)}</div>${tabs}<div class="bb" data-rldg>${body}</div><div class="bf">${foot || ''}<button class="btn pri" data-rlpx="cancel">Close</button></div></div></div>`;
  function rlDiagBody(md) {
    if (md.k === 'cipdiag') return rlCipBody(md);
    if (md.k === 'mstat') { const n = rlFind(rlTree(), md.key); return n && n.m ? rlMsBody(md, n.m) : '<p class="help">The device does not answer.</p>'; }
    if (md.k === 'dmon') return rlDmBody(md);
    if (md.k === 'settime') { const n = rlDmCtl(md), c = n && n.m.ctl; return c ? kv('Controller time', esc(rlNowOf(c).toLocaleString())) + kv('Workstation time', esc(new Date().toLocaleString())) : ''; }
    if (md.k === 'drvdiag' && !md.name) return `<div class="rltabw"><table class="rltab" id="rldl"><thead><tr><th>Driver</th><th>Status</th></tr></thead><tbody>${drivers.map(d => `<tr class="${d.name === md.sel ? 'on' : ''}" data-rldp="${esc(d.name)}"><td><span class="mono">${esc(d.name)}</span> <span class="muted">${esc((RLTYPES.find(y => y[0] === d.type) || [, , , d.type])[3])}</span></td><td class="${d.run ? 'run' : ''}">${d.run ? 'Running' : 'Stopped'}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No drivers are configured.</td></tr>'}</tbody></table></div><p class="help">Pick a configured driver to see its counters.</p>`;
    return rlDrvBody(md);
  }
  function rlDiagHTML(md) {
    if (md.k === 'cipdiag') return rlWin('CIP Diagnostics', rlTabs(md, RLDIAG.cip), rlDiagBody(md), md.snap ? '<span class="grow muted">Frozen</span>' : '');
    if (md.k === 'drvdiag' && !md.name) return rlWin('Driver Diagnostics', '', rlDiagBody(md), `<button class="btn" data-rldx="dpick"${md.sel ? '' : ' disabled'}>OK</button>`);
    const d = drivers.find(x => x.name === md.name);
    return rlWin(md.title || `Driver Diagnostics - ${md.name}`, d ? rlTabs(md, RLDIAG[rlEth(d) ? 'eth' : 'vbp']) : '', rlDiagBody(md), (md.foot || '') + (md.snap ? '<span class="grow muted">Frozen</span>' : ''));
  }

  /* ---------- RSLinx Classic: one window with the menu bar, RSWho and Configure Drivers (RSLinx Classic 4.40) ----------
     It works on the same drivers list as Who Active, Go Online and Download (drivers, saveDrivers, relink): a driver
     added, stopped or deleted here is what they see. Only Communications > RSWho and Configure Drivers work; the other
     menus list their items greyed out. */
  const RLTYPES = [['vbp', 'Virtual Backplane (SoftLogix58xx, USB)', 'AB_VBP-', 'A-B Virtual Chassis'],
    ['emulate', 'Emulate Ethernet (emulated controllers by IP)', 'EMU500-', 'A-B Ethernet, emulated controllers'],
    ['ethip', 'EtherNet/IP Driver', 'AB_ETHIP-', 'A-B Ethernet'], ['eth', 'Ethernet devices', 'AB_ETH-', 'A-B Ethernet'], ['df1', 'RS-232 DF1 devices', 'AB_DF1-', 'DF1']];
  const RLAVAIL = ['vbp', 'emulate'];
  /* the menus of RSLinx Classic (RSLinx Classic help, the menu reference). What cannot work without real hardware,
     Windows DDE/OPC clients or FactoryTalk security opens a note that says so (na:<key>, RLNA) */
  const RLMENUS = [['File', [['Open Project…', 'na:open'], ['Select Default Project…', 'na:defproj'], ['Compact Harmony…', 'na:harmony'], '-', ['Exit', 'exit']]],
    ['Edit', [['Copy DDE/OPC Link to the Clipboard', 'na:copylink']]],
    ['View', [['RSWho', 'rswho'], ['Event Log…', 'evlog'], '-', ['Options…', 'opts']]],
    ['Communications', [['RSWho', 'rswho'], ['Configure Drivers…', 'drivers'], ['Configure Shortcuts…', 'na:shortcuts'], ['Configure Client Application(s)…', 'na:clients'], ['Configure CIP Options…', 'na:cipopts'], '-', ['Driver Diagnostics', 'drvdiag'], ['CIP Diagnostics', 'cipdiag']]],
    ['Station', [['Diagnostics', 'stdiag', () => !!rlSelDev()], '-', ['Freeze', 'frz', () => !!(rlS.modal && rlS.modal.st && !rlS.modal.snap)], ['Unfreeze', 'unfrz', () => !!(rlS.modal && rlS.modal.st && rlS.modal.snap)], ['Reset Diagnostic Counters', 'rst', () => !!(rlS.modal && rlS.modal.st)], '-',
      ['Data Monitor', 'dmon', () => !!rlSelCpu()], ['Change Mode…', 'chmode'], ['Set Time…', 'settime', () => !!rlSelCpu()]]],
    ['DDE/OPC', [['Topic Configuration…', 'na:dde.1'], ['Alias Topic Configuration…', 'na:dde.2'], ['Active Topics/Items…', 'na:dde.3'], ['Communication Events…', 'na:dde.4'], ['Optimized Packets…', 'na:dde.5'], ['Server Diagnostics…', 'na:dde.6'], ['DDE Client Diagnostics…', 'na:dde.7'], ['OPC Group Diagnostics…', 'na:dde.8'], '-', ['Update ControlLogix Tag Info', 'na:dde.9'], '-', ['Options…', 'na:dde.10']]],
    ['Security', [['Set Security User…', 'na:sec.11'], ['Show Security Access…', 'na:sec.12']]],
    ['Window', [['Cascade', 'wcas'], ['Tile', 'wtile'], ['Arrange Icons', 'warr'], ['Close All', 'wclose']]],
    ['Help', [['RSLinx Classic Help', 'na:help'], ['Release Notes', 'na:notes'], ['Quick Start', 'na:quick'], '-', ['About RSLinx Classic…', 'about']]]];
  const RLNA = {
    open: 'Open Project opens an RSLinx Classic project (the drivers, topics and settings saved as a file). In emulation the drivers are kept with MT PLC Studio: Configure Drivers holds them.',
    defproj: 'Select Default Project picks the RSLinx Classic project loaded at startup. In emulation the drivers are kept with MT PLC Studio.',
    harmony: 'Compact Harmony compacts the Harmony files of the RSWho browse. The emulated browse keeps no Harmony files.',
    copylink: 'Copy DDE/OPC Link to the Clipboard copies a link for a DDE/OPC client (a spreadsheet, an HMI). There are no DDE/OPC clients in emulation.',
    shortcuts: 'Configure Shortcuts names the paths that DDE/OPC topics and FactoryTalk applications use. There are no DDE/OPC clients in emulation: the project path is set in Who Active.',
    clients: 'Configure Client Application(s) sets up the client programs of RSLinx Classic on this computer. They are not part of the emulation.',
    cipopts: 'Configure CIP Options sets the CIP connection options of RSLinx Classic. The emulation uses fixed values.',
    dde: 'The DDE/OPC server of RSLinx Classic serves controller data to Windows programs (a spreadsheet, an HMI). There are no DDE/OPC clients in emulation: use Data Monitor, or the Watch and Monitor Tags windows of the programming software.',
    sec: 'RSLinx Classic security comes from FactoryTalk Security on a Windows network. It is not part of the emulation: everyone has full access.',
    help: 'The RSLinx Classic help is not part of the emulation. The help of MT PLC Studio (F1) explains these windows.',
    notes: 'The release notes of RSLinx Classic are not part of the emulation. Help > About RSLinx Classic shows the version.',
    quick: 'The Quick Start of RSLinx Classic is not part of the emulation. In short: Communications > Configure Drivers, add a driver, then RSWho.',
    eds: 'Upload EDS file from device reads the EDS file a device holds. The emulated modules are known to RSLinx already: there is nothing to upload.',
    topic: 'Configure New DDE/OPC Topic makes a DDE/OPC topic for this controller. There are no DDE/OPC clients in emulation: use Data Monitor.' };
  const rlS = { view: 'rswho', sel: 'ws', shut: new Set(), auto: true, dsel: 0, dtype: 'vbp', menu: '', modal: null, tb: true, sb: true, gone: new Set(), bg: [] };
  // the device / the controller picked in RSWho (the Station menu works on it)
  const rlSelDev = () => { const n = rlFind(rlTree(), rlS.sel); return n && n.m ? n : null; };
  const rlSelCpu = () => { const n = rlSelDev(); return n && n.m.ctl ? n : null; };
  const rlMiOn = it => !!it[1] && (!it[2] || it[2]());
  // the Window menu ends with the open child windows; the one in front is ticked
  const rlWinItems = () => {
    const ws = (rlS.nochild ? [] : [['RSWho - 1', 'wsel:rw']]).concat(rlS.modal && rlS.modal.live ? [[rlS.modal.title || rlLiveTitle(rlS.modal), 'wsel:m']] : [], (rlS.bg || []).map((m, i) => [m.title || rlLiveTitle(m), 'wsel:' + i]));
    return RLMENUS.find(m => m[0] === 'Window')[1].concat(ws.length ? ['-'] : [], ws.map(([l, a], i) => [`${i + 1} ${l}`, a, null, a === (rlS.modal && rlS.modal.live ? 'wsel:m' : 'wsel:rw')]));
  };
  const rlLiveTitle = md => ({ drvdiag: md.name ? `Driver Diagnostics - ${md.name}` : 'Driver Diagnostics', cipdiag: 'CIP Diagnostics', mstat: 'Module Statistics', dmon: 'Data Monitor', settime: 'Set Time' })[md.k] || 'RSLinx Classic';
  const ctlMode = c => (c.fault ? 'Faulted' : { prog: 'Program', run: 'Run', remprog: 'Rem Prog', remrun: 'Rem Run', remtest: 'Rem Test' }[c.mode]);
  /* the RSWho tree: what each running driver reaches, built from the same chassis data as Who Active */
  function rlTree() {
    const pad = n => (n < 10 ? '0' + n : n);
    const slots = (r, k, pathFn) => Array.from({ length: r.size }, (_, n) => {
      const m = r.module(n); if (!m || rlS.gone.has(k + '/s' + n)) return null;
      const c = m.ctl;
      return { k: k + '/s' + n, l: `${pad(n)}, ${c ? 'PLC-CPU' : m.type} ${m.name}`, i: c ? 'chip' : 'io', dim: c && !c.powered, path: c ? pathFn(n) : null, m, kids: [] };
    }).filter(Boolean);
    const kids = drivers.filter(d => d.run && RLAVAIL.includes(d.type)).map(d => {
      const k = 'd:' + d.name;
      if (d.type === 'vbp') {
        const r = racks[0];
        return { k, l: `${d.name}, Virtual Backplane`, i: 'online', kids: r ? [{ k: k + '/r', l: `Virtual Chassis, ${r.name}`, i: 'rack', kids: slots(r, k + '/r', n => d.name + '\\' + n) }] : [] };
      }
      const seen = new Set(), ips = [];
      racks.forEach(r => r.controllers().forEach(gm => {
        if (!gm.ip || !gm.ctl.powered || seen.has(gm.ip)) return;
        seen.add(gm.ip);
        const ik = k + '/ip:' + gm.ip;
        ips.push({ k: ik, l: `${gm.ip}, PLC-CPU ${gm.name}`, i: 'chip', kids: [{ k: ik + '/bp', l: `Backplane, ${r.name}`, i: 'rack', kids: slots(r, ik + '/bp', n => pathOf(gm.ip, n)) }] });
      }));
      return { k, l: `${d.name}, Ethernet`, i: 'online', kids: ips };
    });
    return { k: 'ws', l: 'Workstation, MT PLC Studio', i: 'chip', kids };
  }
  const rlFind = (n, k) => { if (n.k === k) return n; for (const c of n.kids) { const f = rlFind(c, k); if (f) return f; } return null; };
  const rlCount = n => 1 + n.kids.reduce((s, c) => s + rlCount(c), 0);
  /* lim: how many nodes the browse has found so far (in tree order); a node whose nodes are not all found yet shows
     that it is still browsing */
  function rlTreeHTML(root, lim = Infinity) {
    let left = lim;
    const row = (n, d) => {
      if (left <= 0) return '';
      left--;
      const open = !rlS.shut.has(n.k), has = n.kids.length > 0, before = left;
      let kids = '';
      if (has && open) kids = n.kids.map(c => row(c, d + 1)).join('');
      else if (has) left -= Math.min(left, rlCount(n) - 1);
      const busy = d > 0 && has && before - left < rlCount(n) - 1;
      return `<div class="nd${n.k === rlS.sel ? ' on' : ''}${n.dim ? ' dim' : ''}" data-rln="${esc(n.k)}" style="padding-left:${6 + d * 16}px"><span class="tw"${has ? ` data-rltw="${esc(n.k)}"` : ''}>${has ? ic(open ? 'down' : 'right') : ''}</span>${ic(n.i, 'i ti')}<span class="ell">${esc(n.l)}${n.dim ? ' · off' : ''}</span>${busy ? '<span class="browsing"><i class="spin"></i>Browsing…</span>' : ''}</div>${kids}`;
    };
    return row(root, 0) + (root.kids.length ? '' : '<div class="nd dim" style="padding-left:38px">No driver is running: Communications &gt; Configure Drivers…</div>');
  }
  function rlPaneHTML(root) {
    const n = rlFind(root, rlS.sel) || root;
    if (n.kids.length) return `<div class="rltiles">${n.kids.map(c => `<button class="rltile${c.dim ? ' dim' : ''}" data-rlk="${esc(c.k)}">${ic(c.i)}<span>${esc(c.l)}${c.dim ? ' · off' : ''}</span></button>`).join('')}</div>`;
    if (!n.m) return `<p class="help" style="padding:12px">${n.k === 'ws' ? 'No driver is running. Add one in Communications &gt; Configure Drivers…' : 'Nothing found on this node.'}</p>`;
    const m = n.m, c = m.ctl, kv = (a, b) => `<div class="kv"><span>${a}</span><span class="v">${esc(b)}</span></div>`;
    return `<div class="rlprops"><div class="rlph">${ic(n.i)}<b>${esc(n.l)}</b></div>${kv('Slot', String(m.slot != null ? m.slot : n.k.split('/s').pop()))}${kv('Module', c ? 'PLC-CPU (emulated controller)' : m.type)}${kv('Name', m.name)}
      ${c ? kv('Path', n.path) + kv('Status', c.powered ? ctlMode(c) : 'Off') + kv('Holds', c.name || '(empty)') + (m.ip ? kv('IP Address', m.ip) : '') : ''}</div>${c && c.powered ? '<p class="help" style="padding:0 12px">Pick this controller in Who Active to set the project path, go online or download.</p>' : ''}`;
  }
  function rlDrvHTML() {
    const t = RLTYPES.find(x => x[0] === rlS.dtype), d = drivers[rlS.dsel];
    return `<div class="rlbox rlcdbox" role="dialog" aria-label="Configure Drivers"><div class="bh">Configure Drivers</div><div class="bb rlcd">
      <div class="rlcdl"><fieldset><legend>Available Driver Types:</legend><div class="rlts"><select class="inp" id="rldt">${RLTYPES.map(([k, n]) => `<option value="${k}"${k === rlS.dtype ? ' selected' : ''}>${esc(n)}${RLAVAIL.includes(k) ? '' : ' (not in this version)'}</option>`).join('')}</select><button class="btn" data-rladd="1">Add New…</button></div></fieldset>
        <fieldset class="rlcfg"><legend>Configured Drivers:</legend><div class="rltabw"><table class="rltab"><thead><tr><th>Name and Description</th><th>Status</th></tr></thead><tbody>${drivers.map((x, i) => `<tr class="${i === rlS.dsel ? 'on' : ''}" data-rlrow="${i}"><td><span class="mono">${esc(x.name)}</span> <span class="muted">${esc((RLTYPES.find(y => y[0] === x.type) || [, , , x.type])[3])}</span></td><td class="${x.run ? 'run' : ''}">${x.run ? 'Running' : 'Stopped'}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No drivers. Pick a type, then Add New…</td></tr>'}</tbody></table></div></fieldset>
        <p class="help">${t && RLAVAIL.includes(t[0]) ? '' : 'That driver type reaches real hardware: it is not in this version. '}Without a running driver, Who Active finds nothing and the project cannot go online.</p></div>
      <div class="rlbtns"><button class="btn pri" data-rlclose="1">Close</button><button class="btn" disabled>Help</button><span class="rlgap"></span><button class="btn" data-rlcfg="1"${d ? '' : ' disabled'}>Configure…</button><button class="btn" disabled>Startup…</button>
        <button class="btn" data-rlstart="1"${d && !d.run ? '' : ' disabled'}>Start</button><button class="btn" data-rlstop="1"${d && d.run ? '' : ' disabled'}>Stop</button><button class="btn" data-rldel="1"${d ? '' : ' disabled'}>Delete</button></div></div></div>`;
  }
  /* RSWho: right-click a device (RSLinx Classic GR001: Station Diagnostics, Configure DDE Topic and the other services
     of that device; Upload EDS file from device; Remove for a device with a red X). Device Properties shows what the
     emulated module reports: vendor, product type and code, revision, serial number, product name. */
  const RLPTYPE = { cpu: ['Programmable Logic Controller', 14], di: ['General Purpose Discrete I/O', 7], do: ['General Purpose Discrete I/O', 7], ai: ['Analog I/O', 10], ao: ['Analog I/O', 10] };
  const rlSerial = (r, m) => { let h = 2166136261; for (const ch of r.name + ':' + m.slot + ':' + m.type) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0).toString(16).toUpperCase().padStart(8, '0'); };
  function rlDevice(m) {
    const r = racks.find(x => x.module(m.slot) === m) || racks[0], pt = RLPTYPE[m.kind] || ['Generic Device', 0];
    return [['Vendor', 'MT PLC Studio'], ['Product Type', `${pt[0]} (${pt[1]})`], ['Product Code', String(m.ctl ? 1 : Object.keys(E.MODULES).indexOf(m.type) + 2)],
      ['Revision', m.ctl ? '1.0' : m.rev || E.REV0], ['Serial Number', rlSerial(r, m)], ['Product Name', m.ctl ? `PLC-CPU ${m.name}` : `${m.type} ${CARDNAMES[m.type] || ''}`.trim()],
      ['Address', `${r.name}, slot ${m.slot}`]].concat(m.ctl ? [['Status', m.ctl.powered ? ctlMode(m.ctl) : 'Off']] : [['Status', m.fault ? 'Faulted' : 'OK']], [['Faults', rlFaults(m)]]);
  }
  // the fault information a device reports (Device Properties, Module Statistics > General)
  const rlFaults = m => (m.ctl ? (m.ctl.fault ? `Major fault: Type ${m.ctl.fault.type}, Code ${m.ctl.fault.code}` : m.ctl.minors && m.ctl.minors.length ? `Minor faults: ${m.ctl.minors.length}` : 'None') : m.fault ? 'Module fault' : 'None');
  /* Module Statistics (right-click a module in RSWho; the ControlLogix Gateway Configuration tool of RSLinx Classic,
     which supports SoftLogix5800): General, Connection Manager and Backplane, polled once a second, with Lock Counters
     and Reset Counters. A virtual backplane has no CRC errors or bus timeouts, so those stay at 0. */
  const RLMS = { cm: ['Unconnected requests received', 'Connection requests received', 'Connections accepted', 'Connections rejected', 'Connections open', 'Connections closed', 'Connections timed out'],
    bp: ['Received Multicast CRC', 'Received Bad CRC', 'Received Bus Timeouts', 'Transmit Bad CRC', 'Transmit Bus Timeout', 'Multicast CRC Threshold', 'Transmit Retry Limit'] };
  const rlRackOf = m => racks.find(x => x.module(m.slot) === m) || racks[0];
  const rlMk = (r, m) => `${r.name}:${m.slot}`;
  const rlM = (r, m) => rlStat.m[rlMk(r, m)] || (rlStat.m[rlMk(r, m)] = {});
  const rlMsHTML = md => {
    const n = rlFind(rlTree(), md.key), m = n && n.m;
    const body = rlDiagBody(md);
    return rlWin(`Module Statistics - ${n ? n.l : ''}`, m ? rlTabs(md, [['gen', 'General'], ['cm', 'Connection Manager'], ['bp', 'Backplane']]) : '', body,
      `<button class="btn${md.lock ? ' on' : ''}" data-rldx="lock" aria-pressed="${md.lock ? 'true' : 'false'}">Lock Counters</button><button class="btn" data-rldx="reset">Reset Counters</button><span class="grow"></span>`);
  };
  function rlMsBody(md, m) {
    const r = rlRackOf(m), on = !m.ctl || m.ctl.powered, c = md.lock || rlM(r, m);
    if (!on) return `<p class="help">The device does not answer: ${esc(m.name)} is off.</p>`;
    if (md.tab === 'cm') {
      const open = rlCur && (() => { const x = resolve(rlCur.path); return x && x.m === m ? 1 : 0; })();
      return `<div class="lbl">Statistics</div>${rlCtab(RLMS.cm, l => (l === 'Connections open' ? (md.lock ? md.lock[l] : open) : c[l]))}`;
    }
    if (md.tab === 'bp') return `${kv('ControlBus Status', 'OK')}${kv('Slot Address', String(m.slot))}${kv('Rack Size', `${r.size} slots`)}${kv('Serial Number', rlSerial(r, { slot: 'chassis', type: r.name }))}${kv('Revision', '1.0')}${rlCtab(RLMS.bp, () => 0)}`;
    const d = Object.fromEntries(rlDevice(m));
    return [['Device name', d['Product Name']], ['Vendor', d.Vendor], ['Product type', d['Product Type']], ['Product code', d['Product Code']], ['Revision', d.Revision], ['Serial number', d['Serial Number']], ['Faults', d.Faults]].map(([a, b]) => kv(a, esc(b))).join('');
  }
  function rlCtxHTML(root) {
    const c = rlS.ctx, n = rlFind(root, c.k);
    if (n && !n.m && /^d:[^/]+$/.test(n.k)) return rlDrvCtx(c);
    if (!n || !n.m) return '';
    const cpu = !!n.m.ctl, it = (l, a) => `<div class="it${a ? '' : ' dis'}"${a ? ` data-rlci="${a}"` : ''}><span>${esc(l)}</span></div>`;
    return `<div class="menu rlpop rlctx" role="menu" style="left:${c.x}px;top:${c.y}px">${it('Device Properties', 'props')}${it('Module Statistics', 'mstat')}<hr>${it('Station Diagnostics', 'stdiag')}${it('Driver Diagnostics', 'drvdiag')}${cpu ? it('Data Monitor', 'dmon') + it('Set Time…', 'settime') + it('Configure New DDE/OPC Topic', 'na:topic') : ''}${it('Upload EDS file from device', 'na:eds')}<hr>${it('Remove', n.dim ? 'remove' : '')}</div>`;
  }
  // right-click a driver in RSWho: Driver Diagnostics
  const rlDrvCtx = c => `<div class="menu rlpop rlctx" role="menu" style="left:${c.x}px;top:${c.y}px"><div class="it" data-rlci="drvdiag"><span>Driver Diagnostics</span></div></div>`;
  /* Configure… of a driver. Virtual Backplane: the Configure Virtual Backplane window, Slot Number (the slot of the
     RSLinx Classic module in the virtual chassis, slot 0 by default; LGEM5K-GR016M chapter 6). Emulate Ethernet: the
     station mapping of an Ethernet devices driver, one station per emulated controller with an IP address. */
  function rlCfgHTML(md) {
    const d = drivers.find(x => x.name === md.name);
    if (!d) return '';
    const bf = `<div class="errtx" id="rlerr">${esc(md.err || '')}</div></div><div class="bf"><button class="btn" data-rlpx="cancel">Cancel</button><button class="btn pri" data-rlpx="ok">OK</button></div></div></div>`;
    if (d.type === 'vbp') return `<div class="rlov rlov2"><div class="rlbox rlsm" role="dialog" aria-label="Configure Virtual Backplane"><div class="bh">Configure Virtual Backplane (${esc(d.name)})</div><div class="bb">
      <div class="frow"><label for="rlslot">Slot Number</label><input class="inp num" id="rlslot" type="number" min="0" max="${(racks[0] ? racks[0].size : 8) - 1}" step="1" value="${esc(md.v != null ? md.v : d.slot || 0)}"></div>
      <p class="help">The slot of the RSLinx Classic module in the virtual chassis (${esc(racks[0] ? racks[0].name : 'Chassis')}). An emulated controller can be in any other slot.</p>${bf}`;
    const st = [];
    racks.forEach(r => r.controllers().forEach(m => { if (m.ip && !st.some(x => x[1] === m.ip)) st.push([st.length, m.ip, m.name]); }));
    return `<div class="rlov rlov2"><div class="rlbox rlsm" role="dialog" aria-label="Configure driver"><div class="bh">Configure driver: ${esc(d.name)}</div><div class="bb">
      <div class="lbl">Station Mapping</div><div class="rltabw"><table class="rltab" id="rlmap"><thead><tr><th>Station</th><th>Host Name</th></tr></thead><tbody>${st.map(([n, ip, nm]) => `<tr><td>${n}</td><td class="mono">${esc(ip)} <span class="muted">${esc(nm)}</span></td></tr>`).join('') || '<tr><td colspan="2" class="muted">No emulated controller has an IP address.</td></tr>'}</tbody></table></div>
      <p class="help">The host names are the IP addresses of the emulated controllers (Emulator > Controller > IP Address).</p>${bf}`;
  }
  /* Data Monitor (right-click a controller, or Station > Data Monitor; RSLinx Classic help): the data file list (File,
     Type, Elements, Length in bytes, sortable, loaded with a progress and Stop), then a file's data table: one row per
     element with its Radix (Binary, Octal, Decimal, Hex, ASCII), Type and Access Rights, polled at the poll rate (250 ms
     to 34560000 ms; above 1000 ms it is polled at 1000 ms). It only reads. A Logix controller has tags, not data files:
     each atomic controller tag (or array of them) is one file here. */
  const RLBY = { BOOL: 1, SINT: 1, INT: 2, DINT: 4, REAL: 4 }, RLRX = ['Binary', 'Octal', 'Decimal', 'Hex', 'ASCII'];
  function rlFiles(c) {
    if (!c || !c.M) return [];
    return [...c.M.tags.values()].filter(r => RLBY[r.type] && !r.alias).map(r => {
      const n = r.dims && r.dims.length ? r.dims.reduce((a, b) => a * b, 1) : r.dim || 1;
      return { f: r.name, t: r.type + (r.dim ? `[${(r.dims && r.dims.length ? r.dims : [r.dim]).join(',')}]` : ''), n, b: n * RLBY[r.type], rec: r };
    });
  }
  // the addresses of a file's elements (at most 256 shown)
  function rlAddrs(rec) {
    if (!rec.dim) return [rec.name];
    const ds = rec.dims && rec.dims.length ? rec.dims : [rec.dim], out = [], idx = ds.map(() => 0);
    for (let k = 0; k < 256; k++) {
      out.push(`${rec.name}[${idx.join(',')}]`);
      let j = ds.length - 1; while (j >= 0 && ++idx[j] >= ds[j]) idx[j--] = 0;
      if (j < 0) break;
    }
    return out;
  }
  function rlRadix(v, rx, type) {
    if (type === 'REAL') return Number(v).toPrecision(7).replace(/\.?0+$/, '').replace(/\.?0+e/, 'e');
    const bits = { BOOL: 1, SINT: 8, INT: 16, DINT: 32 }[type] || 32, u = bits === 32 ? v >>> 0 : (v & ((1 << bits) - 1));
    if (rx === 'Binary') return u.toString(2).padStart(bits, '0');
    if (rx === 'Octal') return u.toString(8);
    if (rx === 'Hex') return u.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0');
    if (rx === 'ASCII') { let s = ''; for (let b = Math.ceil(bits / 8) - 1; b >= 0; b--) { const ch = (u >>> (b * 8)) & 255; s += ch >= 32 && ch < 127 ? String.fromCharCode(ch) : '.'; } return `'${s}'`; }
    return String(v);
  }
  const rlDmCtl = md => { const n = rlFind(rlTree(), md.key); return n && n.m && n.m.ctl ? n : null; };
  function rlDmRead(md) {
    const n = rlDmCtl(md), c = n && n.m.ctl, f = c && rlFiles(c).find(x => x.f === md.file);
    if (!f || !c.powered) return false;
    md.vals = rlAddrs(f.rec).map(a => { try { return Number(c.read(a)); } catch (e) { return 0; } });
    rlAsk(n);
    return true;
  }
  function rlDmBody(md) {
    const n = rlDmCtl(md), c = n && n.m.ctl;
    if (!c || !c.powered) return '<p class="help">The device does not answer.</p>';
    const fs = rlFiles(c);
    if (!md.file) {
      const key = { File: 'f', Type: 't', Elements: 'n', 'Length (bytes)': 'b' }[md.sort] || 'f', s = fs.slice().sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (md.desc ? -1 : 1)).slice(0, md.loaded);
      return `<div class="rltabw rldmw"><table class="rltab rldm" id="rldmf"><thead><tr>${['File', 'Type', 'Elements', 'Length (bytes)'].map(h => `<th data-rlsort="${h}">${h}${md.sort === h ? (md.desc ? ' ▼' : ' ▲') : ''}</th>`).join('')}</tr></thead><tbody>${s.map(x => `<tr class="${x.f === md.fsel ? 'on' : ''}" data-rldf="${esc(x.f)}"><td class="mono">${esc(x.f)}</td><td>${esc(x.t)}</td><td class="mono">${x.n}</td><td class="mono">${x.b}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">${c.M ? 'No data files.' : 'The controller holds no project.'}</td></tr>`}</tbody></table></div>
        <div class="rldms"><span class="grow">${md.loaded < fs.length && !md.stop ? `Loading data files… ${Math.round(md.loaded / Math.max(1, fs.length) * 100)}%` : md.stop && md.loaded < fs.length ? `Stopped: ${md.loaded} of ${fs.length} files` : 'Complete'}</span></div>`;
    }
    if (md.pp) return `<div class="frow"><label for="rldmr">Poll rate (ms)</label><input class="inp num" id="rldmr" type="number" min="250" max="34560000" value="${esc(md.pp.v)}"></div><p class="help">From 250 to 34560000 ms. A rate above 1000 ms is polled at 1000 ms.</p><div class="errtx" id="rlerr">${esc(md.pp.err || '')}</div>
      <div class="rldmb"><button class="btn" data-rldx="ppcancel">Cancel</button><button class="btn pri" data-rldx="ppok">OK</button></div>`;
    const f = fs.find(x => x.f === md.file);
    if (!f) return '<p class="help">The file is gone (the controller holds another project).</p>';
    const ro = f.rec.constant || (f.rec.io && f.rec.io.dir === 'I'), vals = md.vals || [];
    return `<div class="rltabw rldmw"><table class="rltab rldm" id="rldmt"><thead><tr><th>Address</th><th>Value</th><th>Radix</th><th>Type</th><th>Access Rights</th></tr></thead><tbody>${rlAddrs(f.rec).map((a, i) => { const rx = md.rx[i] || 'Decimal'; return `<tr class="${md.selr === a ? 'on' : ''}" data-rldr="${esc(a)}"><td class="mono">${esc(a)}</td><td class="mono">${esc(rlRadix(vals[i] || 0, rx, f.rec.type))}</td><td><select class="inp" data-rlrx="${i}"${f.rec.type === 'REAL' ? ' disabled' : ''}>${RLRX.map(r => `<option${r === rx ? ' selected' : ''}>${r}</option>`).join('')}</select></td><td>${esc(f.rec.type)}</td><td>${ro ? 'Read Only' : 'Read/Write'}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="rldms"><span>Status: ${md.active ? 'active' : 'inactive'}</span><span class="grow">Selection: ${esc(md.selr || '')}</span><span>Poll rate: ${md.rate} ms</span></div>`;
  }
  function rlDmHTML(md) {
    const n = rlDmCtl(md), nm = n ? n.l.replace(/^\d+, /, '') : '';
    const foot = !md.file ? `<button class="btn" data-rldx="dmstop"${md.stop || !n || md.loaded >= rlFiles(n.m.ctl).length ? ' disabled' : ''}>Stop</button><span class="grow"></span>`
      : md.pp ? '<span class="grow"></span>' : `<button class="btn" data-rldx="dmprop">Properties…</button><button class="btn" data-rldx="dmref">Refresh</button><button class="btn" data-rldx="dmact">${md.active ? 'Deactivate' : 'Activate'}</button><span class="grow"></span>`;
    return rlWin(`Data Monitor - ${nm}${md.file ? ' - ' + md.file : ''}`, '', rlDiagBody(md), foot) + (md.gm ? `<div class="menu rlpop rlctx" role="menu" style="left:${md.gm.x}px;top:${md.gm.y}px">${[['Properties…', 'dmprop'], ['Refresh', 'dmref'], ['Activate', 'dmon1'], ['Deactivate', 'dmoff']].map(([l, a]) => `<div class="it${(a === 'dmon1' && md.active) || (a === 'dmoff' && !md.active) ? ' dis' : ''}" data-rldx="${a}"><span>${l}</span></div>`).join('')}</div>` : '');
  }
  /* Set Time: the date and time of the controller's clock, set from the workstation's or typed in */
  const rlNowOf = c => new Date(Date.now() + (c.wallOff || 0));
  const rlDt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  function rlStHTML(md) {
    const n = rlDmCtl(md), c = n && n.m.ctl;
    return `<div class="rlov rlov2"><div class="rlbox rlsm" role="dialog" aria-label="Set Time"><div class="bh">Set Time - ${esc(n ? n.l : '')}</div><div class="bb">${c && c.powered ? `<div data-rldg>${rlDiagBody(md)}</div>
      <div class="frow"><label for="rlstv">New controller time</label><input class="inp" id="rlstv" type="datetime-local" step="1" value="${esc(md.v || rlDt(rlNowOf(c)))}"></div>
      <button class="btn" data-rldx="stnow">Set to Workstation Time</button>` : '<p class="help">The device does not answer.</p>'}<div class="errtx" id="rlerr">${esc(md.err || '')}</div></div>
      <div class="bf"><button class="btn" data-rlpx="cancel">Cancel</button><button class="btn pri" data-rldx="stok"${c && c.powered ? '' : ' disabled'}>OK</button></div></div></div>`;
  }
  // a note, a question or an About box in the RSLinx Classic window
  const rlNote = (title, body, btns) => `<div class="rlov rlov2"><div class="rlbox rlsm" role="dialog" aria-label="${esc(title)}"><div class="bh">${esc(title)}</div><div class="bb">${body}</div><div class="bf">${btns || '<button class="btn pri" data-rlpx="cancel">OK</button>'}</div></div></div>`;
  function rlMiscHTML(md) {
    if (md.k === 'note') return rlNote(md.t, `<p style="margin-top:0"><b>${esc(md.t)}</b> is not available in emulation.</p><p class="help" style="margin-bottom:0">${esc(md.x)}</p>`);
    if (md.k === 'remove') return rlNote('RSLinx Classic', `<p style="margin:0">Are you sure you want to remove this node?</p><p class="help" style="margin-bottom:0">${esc(md.l)}. It comes back with the next browse if it answers again.</p>`, '<button class="btn" data-rlpx="cancel">No</button><button class="btn pri" data-rldx="rmok">Yes</button>');
    if (md.k === 'about') return rlNote('About RSLinx Classic', `<p style="margin-top:0"><b>RSLinx Classic</b>, as emulated by MT PLC Studio ${esc(VERSION)}</p>${kv('Drivers', 'Virtual Backplane, Emulate Ethernet')}${kv('Configured', String(drivers.length))}${kv('Running', String(drivers.filter(d => d.run).length))}<p class="help" style="margin-bottom:0">Not the Rockwell Automation product: a practice copy of its windows for the emulated controllers.</p>`);
    if (md.k === 'evlog') {
      const ev = []; drivers.forEach(d => (rlStat.d[d.name] ? rlStat.d[d.name].ev : []).forEach(e => ev.push(Object.assign({ d: d.name }, e))));
      ev.sort((a, b) => b.t - a.t);
      return rlNote('Open Event Viewer', `<p style="margin-top:0">RSLinx Classic writes its events to the Windows Event Viewer (the Application log). The emulation has no Event Viewer; these are the events of this session:</p>
        <div class="rltabw"><table class="rltab rldtab rlwide"><thead><tr><th>Time</th><th>Driver</th><th>Event</th></tr></thead><tbody>${ev.slice(0, 100).map(e => `<tr><td class="mono">${esc(new Date(e.t).toLocaleTimeString())}</td><td class="mono">${esc(e.d)}</td><td>${esc(`Node ${e.node}: ${e.err}`)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No events.</td></tr>'}</tbody></table></div>`);
    }
    if (md.k === 'opts') {
      const gen = `<label class="frow rlck2"><input type="checkbox" id="rlo-sb"${md.sb ? ' checked' : ''}><span>Show Status Bar</span></label><label class="frow rlck2"><input type="checkbox" id="rlo-tb"${md.tb ? ' checked' : ''}><span>Show Toolbar</span></label>`;
      const dde = `<p class="help" style="margin:0">${esc(RLNA.dde)}</p>`;
      return `<div class="rlov rlov2"><div class="rlbox rlsm" role="dialog" aria-label="Options"><div class="bh">Options</div>${rlTabs(md, [['gen', 'General'], ['dde', 'DDE/OPC']])}<div class="bb">${md.tab === 'dde' ? dde : gen}</div>
        <div class="bf"><button class="btn" data-rlpx="cancel">Cancel</button><button class="btn pri" data-rldx="optok">OK</button></div></div></div>`;
    }
    return '';
  }
  function rlModalHTML() {
    const md = rlS.modal;
    if (md.k === 'cfg') return rlCfgHTML(md);
    const misc = rlMiscHTML(md); if (misc) return misc;
    if (md.k === 'dmon') return rlDmHTML(md);
    if (md.k === 'settime') return rlStHTML(md);
    if (md.k === 'drvdiag' || md.k === 'cipdiag') return rlDiagHTML(md);
    if (md.k === 'mstat') return rlMsHTML(md);
    if (md.k === 'mode') {
      const n = rlFind(rlTree(), md.key), c = n && n.m && n.m.ctl, cur = c && { prog: 'remprog', run: 'remrun' }[c.mode] || (c && c.mode);
      return `<div class="rlov rlov2"><div class="rlbox rlsm" role="dialog" aria-label="Change Mode"><div class="bh">Change Mode</div><div class="bb">${c ? `<p style="margin-top:0"><b>${esc(n.l)}</b><br>Current mode: ${esc(ctlMode(c))} · key switch ${esc(c.key)}</p>
        ${[['remrun', 'Run'], ['remprog', 'Program'], ['remtest', 'Test']].map(([m, l]) => `<label class="frow" style="grid-template-columns:auto 1fr"><input type="radio" name="rlmd" value="${m}"${m === (md.v || cur) ? ' checked' : ''}><span>${l}</span></label>`).join('')}
        <p class="help">Software changes the mode only while the key switch is in REM (Remote).</p>` : '<p class="help">Select a controller in RSWho.</p>'}<div class="errtx" id="rlerr">${esc(md.err || '')}</div></div>
      <div class="bf"><button class="btn" data-rlpx="cancel">Cancel</button><button class="btn pri" data-rlpx="ok"${c ? '' : ' disabled'}>OK</button></div></div></div>`;
    }
    if (md.k === 'props') {
      const n = rlFind(rlTree(), md.key);
      return `<div class="rlov rlov2"><div class="rlbox rlsm" role="dialog" aria-label="Device Properties"><div class="bh">Device Properties</div><div class="bb rlprops">${n && n.m ? rlDevice(n.m).map(([a, b]) => `<div class="kv"><span>${a}</span><span class="v">${esc(b)}</span></div>`).join('') : '<p class="help">The device does not answer.</p>'}</div>
      <div class="bf">${n && n.m ? '<button class="btn" data-rldx="mstat">Module Statistics…</button>' : ''}<button class="btn pri" data-rlpx="cancel">OK</button></div></div></div>`;
    }
    if (md.k === 'add') return `<div class="rlov rlov2"><div class="rlbox rlsm" role="dialog" aria-label="Add New RSLinx Classic Driver"><div class="bh">Add New RSLinx Classic Driver</div><div class="bb">
      <p style="margin-top:0">Choose a name for the new driver.<br>(15 characters maximum)</p><input class="inp mono" id="rlname" value="${esc(md.v)}" autocomplete="off" spellcheck="false"><div class="errtx" id="rlerr">${esc(md.err || '')}</div></div>
      <div class="bf"><button class="btn" data-rlpx="cancel">Cancel</button><button class="btn pri" data-rlpx="ok">OK</button></div></div></div>`;
    return `<div class="rlov rlov2"><div class="rlbox rlsm" role="dialog" aria-label="RSLinx Classic"><div class="bh">RSLinx Classic</div><div class="bb"><p style="margin:0">Delete the driver <b class="mono">${esc(md.name)}</b>? Who Active, Go Online and Download can no longer use it.</p></div>
      <div class="bf"><button class="btn" data-rlpx="cancel">Cancel</button><button class="btn danger" data-rlpx="ok">Delete</button></div></div></div>`;
  }
  /* the RSWho status while it browses, as in the RSLinx Classic figure (LINX-GR001, RSWho): "Browsing - node
     10.224.69.105 found", the address of the node found last (its label up to the comma) */
  const browseSt = label => { const a = label ? String(label).split(',')[0].trim() : ''; return a ? `Browsing - node ${a} found` : 'Browsing - node found'; };
  function rslinx(view) {
    rlS.view = view || 'rswho'; rlS.menu = ''; rlS.modal = null; rlS.ctx = null;
    if (!drivers[rlS.dsel]) rlS.dsel = 0;
    let treeKey = '', lim = Infinity, btimer = 0;
    const stopBrowse = () => { if (btimer) { clearTimeout(btimer); btimer = 0; busyComm(-1); } };
    const quit = () => { clearInterval(timer); clearInterval(ltimer); stopBrowse(); };
    const el = dialog({ title: 'RSLinx Classic', size: 'lg rlw', flush: true, body: '<div class="rl" id="rl"></div>', onClose: () => quit() });
    const bstat = root => (lim < rlCount(root) ? browseSt(order(root)[lim - 1].l) : rlS.auto ? 'Browsing - done' : 'Not browsing');
    const box = el.querySelector('#rl');
    const draw = () => {
      const root = rlTree();
      if (!rlFind(root, rlS.sel)) rlS.sel = 'ws';
      const sel = rlFind(root, rlS.sel);
      treeKey = JSON.stringify(root, (k, v) => (k === 'm' ? undefined : v));
      box.innerHTML = `<div class="rlmb" role="menubar">${RLMENUS.map(([n]) => `<button data-rlm="${esc(n)}" class="${rlS.menu === n ? 'on' : ''}">${esc(n)}</button>`).join('')}</div>
        <div class="rltb"${rlS.tb ? '' : ' hidden'}><button class="btn${rlS.view === 'rswho' ? ' on' : ''}" data-rlv="rswho">${ic('tree')}RSWho</button><button class="btn${rlS.view === 'drivers' ? ' on' : ''}" data-rlv="drivers">${ic('online')}Configure Drivers…</button></div>
        <div class="rlchild"${rlS.nochild ? ' hidden' : ''}><div class="rlch"><b>RSWho - 1</b><label class="rlck"><input type="checkbox" id="rlauto"${rlS.auto ? ' checked' : ''}>Autobrowse</label><button class="btn" data-rlref="1">Refresh</button><span class="grow"></span><span class="muted ell" id="rlbst">${bstat(root)}</span></div>
          <div class="rlwho"><div class="rltree tree" id="rltree">${rlTreeHTML(root, lim)}</div><div class="rlpane" id="rlpane">${rlPaneHTML(root)}</div></div></div>
        <div class="rlst"${rlS.sb ? '' : ' hidden'}><span class="ell grow">${sel && sel.path ? 'Path: ' + esc(sel.path) : 'For Help, press F1'}</span><span>Drivers running: ${drivers.filter(d => d.run).length} of ${drivers.length}</span></div>
        ${rlS.view === 'drivers' ? `<div class="rlov">${rlDrvHTML()}</div>` : ''}${rlS.modal ? rlModalHTML() : ''}${rlS.ctx ? rlCtxHTML(root) : ''}
        ${rlS.menu ? `<div class="menu rlpop" role="menu">${(rlS.menu === 'Window' ? rlWinItems() : RLMENUS.find(m => m[0] === rlS.menu)[1]).map(it => (it === '-' ? '<hr>' : `<div class="it${rlMiOn(it) ? '' : ' dis'}"${rlMiOn(it) ? ` data-rlmi="${it[1]}"` : ''}>${it[1] === 'tb' || it[1] === 'sb' || it.length > 3 ? `<span class="ck">${(it.length > 3 ? it[3] : rlS[it[1]]) ? '✓' : ''}</span>` : ''}<span>${esc(it[0])}</span></div>`)).join('')}</div>` : ''}`;
      if (rlS.menu) {
        const b = box.querySelector(`[data-rlm="${rlS.menu}"]`), p = box.querySelector('.rlpop');
        p.style.top = (b.offsetTop + b.offsetHeight + 2) + 'px';
        p.style.left = Math.max(4, Math.min(b.offsetLeft - box.querySelector('.rlmb').scrollLeft, box.clientWidth - p.offsetWidth - 4)) + 'px';
      }
      if (rlS.modal && rlS.modal.k === 'add') { const i = box.querySelector('#rlname'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      box.style.setProperty('--rlmbh', box.querySelector('.rlmb').offsetHeight + 'px');
      const dg = box.querySelector('[data-rldg]'); if (dg) dg.dataset.h = dg.innerHTML;
    };
    /* the diagnostic windows are live: their counters are read 4 times a second (Active Connections every 2 seconds),
       while the window is not frozen; a menu or a right-click menu over them holds them */
    let ltick = 0;
    const rlLive = md => {
      if (md.k === 'drvdiag' && md.tab === 'act' && ltick % 8) return false;
      if (md.k === 'dmon') {
        // the file list loads a few files at a time; the data table is polled at its rate (1000 ms at most)
        if (md.gm) return false;
        if (!md.file) { const n = rlDmCtl(md), all = n ? rlFiles(n.m.ctl).length : 0; if (md.stop || md.loaded >= all) return false; md.loaded = fastComm() ? all : Math.min(all, md.loaded + 2); return true; }
        if (md.pp || !md.active || (ltick * 250) % Math.min(1000, md.rate) >= 250) return false;
        rlDmRead(md); return true;
      }
      if (md.k === 'settime') return ltick % 4 === 0;
      if (md.k === 'mstat') {
        // Module Statistics polls the module once a second (an unconnected request through its driver)
        if (ltick % 4) return false;
        const n = rlFind(rlTree(), md.key);
        if (n && n.m) rlAsk(n);
        return true;
      }
      return true;
    };
    const ltimer = setInterval(() => {
      if (!el.isConnected) { clearInterval(ltimer); return; }
      ltick++;
      const md = rlS.modal;
      if (!md || !md.live || rlS.menu || rlS.ctx || rlLive(md) === false) return;
      const b = box.querySelector('[data-rldg]'); if (!b) return;
      const h = rlDiagBody(md);
      if (b.dataset.h !== h) { b.innerHTML = h; b.dataset.h = b.innerHTML; }
    }, 250);
    const rlAct = a => {
      if (a === 'drvdiag') { rlS.view = 'rswho'; rlS.modal = { k: 'drvdiag', name: null, sel: (drivers[0] || {}).name, tab: 'gen', live: true }; draw(); return true; }
      if (a === 'cipdiag') { rlS.view = 'rswho'; rlS.modal = { k: 'cipdiag', tab: 'disp', live: true }; draw(); return true; }
      if (a.startsWith('na:')) {
        const it = RLMENUS.flatMap(m => m[1]).find(x => x !== '-' && x[1] === a);
        rlS.modal = { k: 'note', t: it ? it[0].replace(/…$/, '') : 'RSLinx Classic', x: RLNA[a.slice(3).split('.')[0]] }; draw(); return true;
      }
      if (a === 'about' || a === 'evlog') { rlS.modal = { k: a }; draw(); return true; }
      if (a === 'opts') { rlS.modal = { k: 'opts', tab: 'gen', tb: rlS.tb, sb: rlS.sb }; draw(); return true; }
      // Window: one child window shows at a time here, so Cascade, Tile and Arrange Icons leave it as it is
      if (a === 'wcas' || a === 'wtile' || a === 'warr') { draw(); return true; }
      if (a === 'wclose') { rlS.modal = null; rlS.bg = []; rlS.nochild = true; draw(); return true; }
      if (a.startsWith('wsel:')) {
        const w = a.slice(5), cur = rlS.modal && rlS.modal.live ? rlS.modal : null;
        if (w === 'rw') { if (cur) rlS.bg.push(cur); rlS.modal = null; }
        else if (w !== 'm') { const m = rlS.bg.splice(+w, 1)[0]; if (cur) rlS.bg.push(cur); rlS.modal = m; }
        draw(); return true;
      }
      if (a === 'rswho') { rlS.nochild = false; rlS.view = 'rswho'; if (rlS.modal && rlS.modal.live) { rlS.bg.push(rlS.modal); rlS.modal = null; } draw(); return true; }
      // Station Diagnostics: the counters of the station's driver, with Station > Freeze, Unfreeze and Reset Diagnostic
      // Counters (Reset keeps the last four counters of an Ethernet driver, the connection counts)
      if (a === 'stdiag') { const n = rlSelDev(); if (n) { rlS.view = 'rswho'; rlS.modal = { k: 'drvdiag', name: drvOfKey(n.k), title: `Station Diagnostics - ${n.l}`, tab: 'gen', live: true, st: true }; } draw(); return true; }
      if (a === 'frz' && rlS.modal) { rlS.modal.snap = JSON.parse(JSON.stringify({ d: rlStat.d, cur: rlCur })); draw(); return true; }
      if (a === 'unfrz' && rlS.modal) { rlS.modal.snap = null; draw(); return true; }
      if (a === 'rst' && rlS.modal) {
        const s = rlD(rlS.modal.name), keep = ['Connections open', 'Total connections initiated', 'Server connections open', 'Total connections accepted'];
        s.c = Object.fromEntries(Object.entries(s.c).filter(([k]) => keep.includes(k))); s.rate = [0, 0]; s.prev = rlTot(drivers.find(x => x.name === rlS.modal.name), s);
        if (rlS.modal.snap) rlS.modal.snap = JSON.parse(JSON.stringify({ d: rlStat.d, cur: rlCur }));
        draw(); return true;
      }
      if (a === 'dmon') { const n = rlSelCpu(); if (n) { rlS.view = 'rswho'; rlS.modal = { k: 'dmon', key: n.k, sort: 'File', desc: false, loaded: fastComm() ? 1e9 : 0, file: null, rx: {}, rate: 1000, active: true, live: true }; } draw(); return true; }
      if (a === 'settime') { const n = rlSelCpu(); if (n) { rlS.view = 'rswho'; rlS.modal = { k: 'settime', key: n.k, live: true }; } draw(); return true; }
      return false;
    };
    const drvOfKey = k => (k ? k.slice(2).split('/')[0] : '');
    const rlCtxAct = (a, k) => {
      if (a === 'drvdiag') { rlS.modal = { k: 'drvdiag', name: drvOfKey(k), tab: 'gen', live: true }; return; }
      if (a === 'mstat') { rlS.modal = { k: 'mstat', key: k, tab: 'gen', live: true }; return; }
      if (a.startsWith('na:')) { rlS.modal = { k: 'note', t: { eds: 'Upload EDS file from device', topic: 'Configure New DDE/OPC Topic' }[a.slice(3)] || 'RSLinx Classic', x: RLNA[a.slice(3)] }; return; }
      if (a === 'remove') { const n = rlFind(rlTree(), k); rlS.modal = { k: 'remove', key: k, l: n ? n.l : '' }; return; }
      if (a === 'stdiag' || a === 'dmon' || a === 'settime') { rlS.sel = k; rlAct(a); return; }
      rlS.modal = { k: 'props', key: k };
    };
    const rlDx = a => {
      const md = rlS.modal;
      if (a === 'dpick' && md.sel) { md.name = md.sel; md.tab = 'gen'; draw(); }
      if (a === 'mstat') { rlS.modal = { k: 'mstat', key: md.key, tab: 'gen', live: true }; draw(); }
      if (a === 'rmok') { rlS.gone.add(md.key); if (rlS.sel === md.key) rlS.sel = 'ws'; rlS.modal = null; draw(); }
      if (a === 'optok') { const sb = box.querySelector('#rlo-sb'), tb = box.querySelector('#rlo-tb'); if (sb) rlS.sb = sb.checked; if (tb) rlS.tb = tb.checked; rlS.modal = null; draw(); }
      if (md.k === 'dmon') {
        md.gm = null;
        if (a === 'dmstop') md.stop = true;
        if (a === 'dmprop') md.pp = { v: md.rate };
        if (a === 'ppcancel') md.pp = null;
        if (a === 'ppok') {
          const v = box.querySelector('#rldmr').value.trim(), n = +v;
          if (!/^\d+$/.test(v) || n < 250 || n > 34560000) { md.pp = { v, err: 'Enter a poll rate from 250 to 34560000 ms.' }; draw(); return; }
          md.rate = n; md.pp = null;
        }
        if (a === 'dmref') rlDmRead(md);
        if (a === 'dmact') md.active = !md.active;
        if (a === 'dmon1') md.active = true;
        if (a === 'dmoff') md.active = false;
        draw();
      }
      if (md.k === 'settime') {
        const c = rlDmCtl(md) && rlDmCtl(md).m.ctl, i = box.querySelector('#rlstv');
        if (!c || !i) return;
        if (a === 'stnow') { md.v = rlDt(new Date()); md.err = ''; draw(); return; }
        if (a === 'stok') {
          const t = new Date(i.value);
          if (!i.value || isNaN(t)) { md.v = i.value; md.err = 'Enter a date and a time.'; draw(); return; }
          c.wallOff = t.getTime() - Date.now(); rlAsk(rlDmCtl(md)); rlS.modal = null; toast('The controller\'s clock is set.', 'ok'); draw();
        }
      }
      // Lock Counters holds the values shown (the module goes on counting); Reset Counters sets them to 0
      if (md.k === 'mstat' && (a === 'lock' || a === 'reset')) {
        const n = rlFind(rlTree(), md.key), m = n && n.m;
        if (!m) return;
        const r = rlRackOf(m);
        if (a === 'lock') md.lock = md.lock ? null : Object.assign({ 'Connections open': rlCur && resolve(rlCur.path) && resolve(rlCur.path).m === m ? 1 : 0 }, rlM(r, m));
        else { rlStat.m[rlMk(r, m)] = {}; if (md.lock) md.lock = { 'Connections open': md.lock['Connections open'] }; }
        draw();
      }
    };
    // a browse step redraws only the tree, its pane and the status (the scroll position and the menus stay)
    const drawTree = () => {
      const t = box.querySelector('#rltree'), pn = box.querySelector('#rlpane'), bs = box.querySelector('#rlbst');
      if (!t || rlS.menu || rlS.modal) { draw(); return; }
      const root = rlTree();
      if (!rlFind(root, rlS.sel)) rlS.sel = 'ws';
      treeKey = JSON.stringify(root, (k, v) => (k === 'm' ? undefined : v));
      const h = rlTreeHTML(root, lim), ph = rlPaneHTML(root), st = bstat(root);
      if (t.innerHTML !== h) t.innerHTML = h;
      if (pn.dataset.h !== ph) { pn.innerHTML = ph; pn.dataset.h = ph; }
      if (bs.textContent !== st) bs.textContent = st;
    };
    // Browse: the nodes come in one by one in tree order; a device (a controller or a card) takes 150-400 ms to answer
    const order = n => [n].concat(...n.kids.map(order));
    const step = () => {
      btimer = 0;
      if (!el.isConnected) { busyComm(-1); return; }
      const all = order(rlTree());
      lim++;
      rlAsk(all[lim - 1]);
      if (lim >= all.length) { lim = Infinity; busyComm(-1); drawTree(); return; }
      drawTree();
      btimer = setTimeout(step, all[lim] && all[lim].m ? jitter(150, 400) : jitter(80, 160));
    };
    const browse = () => {
      stopBrowse();
      rlS.gone.clear();
      if (fastComm()) { lim = Infinity; order(rlTree()).forEach(rlAsk); drawTree(); return; }
      lim = 2; busyComm(1); drawTree();
      btimer = setTimeout(step, jitter(150, 300));
    };
    // Autobrowse: the tree follows the emulator (controllers turned on or off, cards added) while the box is ticked,
    // quietly: only a change redraws it, and it is not browsed again
    const timer = setInterval(() => {
      if (!el.isConnected) { quit(); return; }
      // Autobrowse polls every device it found, once a second
      if (rlS.auto && lim === Infinity) order(rlTree()).forEach(rlAsk);
      if (!rlS.auto || rlS.menu || rlS.modal || rlS.ctx || lim !== Infinity) return;
      if (JSON.stringify(rlTree(), (k, v) => (k === 'm' ? undefined : v)) !== treeKey) drawTree();
    }, 1000);
    const changed = () => { saveDrivers(); relink(); render(); };
    const addOk = () => {
      const v = box.querySelector('#rlname').value.trim(), md = rlS.modal;
      const err = !v ? 'Enter a name for the driver.' : v.length > 15 ? `The name has ${v.length} characters: 15 characters maximum.` : !/^[A-Za-z][A-Za-z0-9_-]*$/.test(v) ? 'Use letters, digits, - and _, starting with a letter.'
        : /^emulate$/i.test(v) ? 'That name is kept for the Emulate path.' : drivers.some(d => d.name.toUpperCase() === v.toUpperCase()) ? `A driver named ${v} already exists.` : '';
      if (err) { md.v = v; md.err = err; draw(); return; }
      drivers.push({ name: v, type: md.type, run: true }); rlS.dsel = drivers.length - 1; rlS.modal = null;
      changed(); draw();
    };
    const modalAct = ok => {
      const md = rlS.modal;
      // Close of a data table goes back to the data file list
      if (!ok && md.k === 'dmon' && md.file) { md.file = null; md.pp = null; md.gm = null; draw(); return; }
      if (!ok || md.k === 'props') { rlS.modal = null; draw(); return; }
      if (md.k === 'add') { addOk(); return; }
      if (md.k === 'mode') {
        // the same controller code as Studio's Run / Program / Test Mode (Controller.setMode, REM key only)
        const n = rlFind(rlTree(), md.key), c = n && n.m && n.m.ctl, b = box.querySelector('[name="rlmd"]:checked');
        if (!c || !b) { rlS.modal = null; draw(); return; }
        if (!c.powered) { md.err = 'The device does not answer.'; draw(); return; }
        if (!c.setMode(b.value)) { md.v = b.value; md.err = c.key !== 'REM' ? 'The key switch does not allow that mode.' : 'The controller holds no project: download first.'; draw(); return; }
        saveChassis(); rlS.modal = null; live(true); render(); draw(); return;
      }
      if (md.k === 'cfg') {
        const d = drivers.find(x => x.name === md.name), i = box.querySelector('#rlslot');
        if (d && i) {
          const v = i.value.trim(), n = +v, max = (racks[0] ? racks[0].size : 8) - 1, m = racks[0] && racks[0].module(n);
          const err = !/^\d+$/.test(v) || n > max ? `Enter a slot number from 0 to ${max}.` : m && n !== (d.slot || 0) ? `Slot ${n} holds [${n}] ${m.ctl ? 'PLC-CPU' : m.type} ${m.name}: pick a free slot.` : '';
          if (err) { md.v = v; md.err = err; draw(); return; }
          d.slot = n; saveDrivers();
        }
        rlS.modal = null; draw(); return;
      }
      const i = drivers.findIndex(d => d.name === md.name);
      if (i >= 0) drivers.splice(i, 1);
      rlS.dsel = Math.min(rlS.dsel, drivers.length - 1); if (rlS.dsel < 0) rlS.dsel = 0;
      rlS.modal = null; changed(); draw();
    };
    // right-click (long-press on touch) a device in the tree or the right pane: its menu
    const ctxAt = (k, cx, cy) => {
      const b = box.getBoundingClientRect();
      rlS.ctx = { k, x: Math.max(4, Math.min(cx - b.left, b.width - 230)), y: Math.max(4, Math.min(cy - b.top, b.height - 220)) };
      rlS.sel = k; draw();
    };
    const devAt = t => { const x = t.closest('[data-rln],[data-rlk]'); const k = x && (x.dataset.rln || x.dataset.rlk); const n = k && rlFind(rlTree(), k); return n && (n.m || /^d:[^/]+$/.test(n.k)) ? k : null; };
    box.addEventListener('contextmenu', ev => { const k = devAt(ev.target); if (!k || rlS.modal || rlS.view !== 'rswho') return; ev.preventDefault(); rlS.menu = ''; ctxAt(k, ev.clientX, ev.clientY); });
    let rlLp = null;
    box.addEventListener('pointerdown', ev => {
      if (ev.pointerType === 'mouse') return;
      const k = devAt(ev.target); if (!k || rlS.modal) return;
      const cx = ev.clientX, cy = ev.clientY;
      rlLp = { cx, cy, t: setTimeout(() => { rlLp = null; ctxAt(k, cx, cy); box.dataset.lp = String(performance.now()); box.dataset.lpx = cx + ',' + cy; }, 550) };
    });
    ['pointerup', 'pointercancel', 'pointermove'].forEach(n => box.addEventListener(n, ev => { if (rlLp && (ev.type !== 'pointermove' || Math.hypot(ev.clientX - rlLp.cx, ev.clientY - rlLp.cy) > 10)) { clearTimeout(rlLp.t); rlLp = null; } }));
    box.addEventListener('click', ev => {
      const t = ev.target;
      let x;
      if (rlS.ctx) {
        // the click that ends a long-press leaves the menu open
        if (box.dataset.lp && performance.now() - +box.dataset.lp < 400) { const [lx, ly] = (box.dataset.lpx || '').split(',').map(Number); if (!t.closest('[data-rlci]') || Math.hypot(ev.clientX - lx, ev.clientY - ly) < 12) return; }
        const it = t.closest('[data-rlci]'), k = rlS.ctx.k;
        if (!it && t.closest('.rlctx')) return;
        rlS.ctx = null;
        if (it) rlCtxAct(it.dataset.rlci, k);
        draw();
        return;
      }
      if ((x = t.closest('[data-rlm]'))) { rlS.menu = rlS.menu === x.dataset.rlm ? '' : x.dataset.rlm; draw(); return; }
      if ((x = t.closest('[data-rlmi]'))) {
        const a = x.dataset.rlmi; rlS.menu = '';
        if (a === 'exit') { quit(); closeLayer(); return; }
        // View > Toolbar / Status Bar: show or hide them (kept while the app runs)
        if (a === 'tb' || a === 'sb') { rlS[a] = !rlS[a]; draw(); return; }
        if (a === 'chmode') { const n = rlFind(rlTree(), rlS.sel); if (n && n.m && n.m.ctl) { rlS.view = 'rswho'; rlS.modal = { k: 'mode', key: rlS.sel }; } else toast('Select a controller in RSWho first.', 'err'); draw(); return; }
        if (rlAct(a)) return;
        rlS.view = a; draw(); return;
      }
      if (rlS.menu) { if (!t.closest('.rlpop')) { rlS.menu = ''; draw(); } return; }
      if ((x = t.closest('[data-rlpx]'))) { modalAct(x.dataset.rlpx === 'ok'); return; }
      if ((x = t.closest('[data-rltab]')) && rlS.modal) { rlS.modal.tab = x.dataset.rltab; draw(); return; }
      // picking a driver marks its row in place (a redraw would split a double-click)
      if ((x = t.closest('[data-rldp]')) && rlS.modal) { rlS.modal.sel = x.dataset.rldp; box.querySelectorAll('[data-rldp]').forEach(r => r.classList.toggle('on', r === x)); const b = box.querySelector('[data-rldx="dpick"]'); if (b) b.disabled = false; return; }
      if ((x = t.closest('[data-rldx]')) && rlS.modal) { rlDx(x.dataset.rldx, x); return; }
      if (rlS.modal && rlS.modal.k === 'dmon') {
        const md = rlS.modal;
        if (md.gm) { md.gm = null; draw(); return; }
        if ((x = t.closest('[data-rlsort]'))) { md.desc = md.sort === x.dataset.rlsort ? !md.desc : false; md.sort = x.dataset.rlsort; draw(); return; }
        // a file: a click picks it, a double-click (or a tap on the picked one) opens its data table
        if ((x = t.closest('[data-rldf]'))) { if (md.fsel === x.dataset.rldf && ev.pointerType !== 'mouse' && ev.detail < 2) { rlDmOpen(md, x.dataset.rldf); return; } md.fsel = x.dataset.rldf; box.querySelectorAll('[data-rldf]').forEach(r => r.classList.toggle('on', r === x)); return; }
        if ((x = t.closest('[data-rldr]')) && !t.closest('select')) { md.selr = x.dataset.rldr; draw(); return; }
      }
      if (rlS.modal) return;
      if ((x = t.closest('[data-rlv]'))) { rlS.view = x.dataset.rlv; draw(); return; }
      if ((x = t.closest('[data-rltw]'))) { const k = x.dataset.rltw; if (rlS.shut.has(k)) rlS.shut.delete(k); else rlS.shut.add(k); draw(); return; }
      if ((x = t.closest('[data-rln]'))) { rlS.sel = x.dataset.rln; rlS.shut.delete(rlS.sel); draw(); return; }
      if ((x = t.closest('[data-rlk]'))) { rlS.sel = x.dataset.rlk; rlS.shut.delete(rlS.sel); draw(); return; }
      if (t.closest('[data-rlref]')) { browse(); return; }
      if (t.closest('[data-rlclose]')) { rlS.view = 'rswho'; draw(); return; }
      if ((x = t.closest('[data-rlrow]'))) { rlS.dsel = +x.dataset.rlrow; draw(); return; }
      if (t.closest('[data-rladd]')) {
        const ty = RLTYPES.find(y => y[0] === rlS.dtype);
        if (!RLAVAIL.includes(ty[0])) { toast('That driver is not available in this version.', 'err'); return; }
        if (drivers.some(d => d.type === ty[0])) { toast(`Only one ${ty[1].replace(/ \(.*/, '')} driver can be configured.`, 'err'); return; }
        let n = 1; while (drivers.some(d => d.name.toUpperCase() === ty[2] + n)) n++;
        rlS.modal = { k: 'add', type: ty[0], v: ty[2] + n, err: '' }; draw(); return;
      }
      const d = drivers[rlS.dsel];
      if (t.closest('[data-rlstart]') && d) { d.run = true; changed(); draw(); return; }
      if (t.closest('[data-rlstop]') && d) { d.run = false; changed(); draw(); return; }
      if (t.closest('[data-rldel]') && d) { rlS.modal = { k: 'del', name: d.name }; draw(); return; }
      if (t.closest('[data-rlcfg]') && d) { rlS.modal = { k: 'cfg', name: d.name }; draw(); }
    });
    box.addEventListener('dblclick', ev => { const x = ev.target.closest('[data-rldp]'); if (x && rlS.modal) { rlS.modal.sel = x.dataset.rldp; rlDx('dpick'); } });
    const rlDmOpen = (md, f) => { md.file = f; md.fsel = f; md.selr = null; md.rx = {}; md.vals = null; rlDmRead(md); draw(); };
    box.addEventListener('dblclick', ev => { const x = ev.target.closest('[data-rldf]'); if (x && rlS.modal && rlS.modal.k === 'dmon') rlDmOpen(rlS.modal, x.dataset.rldf); });
    // right-click the data table: Properties, Refresh, Activate, Deactivate
    box.addEventListener('contextmenu', ev => {
      const md = rlS.modal; if (!md || md.k !== 'dmon' || !md.file || md.pp || !ev.target.closest('#rldmt')) return;
      ev.preventDefault(); ev.stopPropagation();
      const b = box.getBoundingClientRect(); md.gm = { x: Math.max(4, Math.min(ev.clientX - b.left, b.width - 200)), y: Math.max(4, Math.min(ev.clientY - b.top, b.height - 170)) }; draw();
    }, true);
    box.addEventListener('change', ev => {
      if ((ev.target.id === 'rlo-sb' || ev.target.id === 'rlo-tb') && rlS.modal && rlS.modal.k === 'opts') { rlS.modal[ev.target.id.slice(4)] = ev.target.checked; return; }
      if (ev.target.dataset.rlrx && rlS.modal && rlS.modal.k === 'dmon') { rlS.modal.rx[+ev.target.dataset.rlrx] = ev.target.value; draw(); return; }
      if (ev.target.id === 'rlauto') { rlS.auto = ev.target.checked; draw(); }
      if (ev.target.id === 'rldt') { rlS.dtype = ev.target.value; draw(); }
    });
    layerKey = ev => {
      if (ev.key === 'Escape' && rlS.ctx) { ev.preventDefault(); rlS.ctx = null; draw(); return; }
      if (ev.key === 'Escape') { ev.preventDefault(); if (rlS.modal) { rlS.modal = null; draw(); } else if (rlS.menu) { rlS.menu = ''; draw(); } else { quit(); closeLayer(); } }
      if (ev.key === 'Enter' && rlS.modal) { ev.preventDefault(); modalAct(true); }
    };
    draw(); browse();
    return el;
  }

  /* ---------- setup wizard: the real order of a first project (spec section 17) ----------
     1 Communications (a driver), 2 Emulator (a controller with an IP address), 3 New Project, 4 Who Active (the project
     path), 5 Ladder. Quick setup does all of it with the defaults. */
  const WZSTEPS = [['Communications', 'Configure Drivers'], ['Emulator', 'Chassis and controller'], ['New Project', 'Type, revision, slot, I/O'], ['Who Active', 'Set Project Path'], ['Ladder', 'Write, Verify, Download']];
  function setupWizard(step0) {
    const wz = { step: step0 || 0, name: '', made: false, size: 8 };
    const ctls = () => racks.flatMap((r, ri) => r.controllers().map(m => ({ r, ri, m })));
    // the controllers a running driver reaches: every powered one of the virtual chassis, and those with an IP address
    const gates = () => ctls().filter(x => x.m.ctl.powered && ((driverUp('vbp') && x.ri === 0) || (driverUp('emulate') && x.m.ip)));
    const done0 = i => [driverUp(), gates().length > 0, wz.made, !!(S.p && resolve(curPath()) && resolve(curPath()).ctl), false][i];
    const done = i => { for (let j = 0; j <= i; j++) if (!done0(j)) return false; return true; };
    const pad = s => (s < 10 ? '0' + s : s);
    const body = () => {
      const s = wz.step, nav = (next, label) => `<div class="wznav"><button class="btn" data-wz="back"${s ? '' : ' disabled'}>Back</button><span class="grow"></span><button class="btn pri" data-wz="next"${next ? '' : ' disabled'}>${label || 'Next: ' + WZSTEPS[s + 1][0]}</button></div>`;
      let c = '';
      if (s === 0) c = `<h3>1. Communications: Configure Drivers</h3><p class="help">As in the communications software: add a driver so the programming software can reach the emulated controller.</p>${driversHTML()}<p class="tip">This is the first step on a real job too: no driver, no Who Active, no Download. Virtual Backplane reaches the emulator's chassis slot by slot.</p>${nav(done(0))}`;
      else if (s === 1) {
        const r = racks[0], free = Array.from({ length: r.size }, (_, i) => i).filter(i => !r.module(i));
        c = `<h3>2. Emulator: chassis and controller</h3><p class="help">Create the emulated controller in a slot of the chassis. The I/O cards of the chassis are added in the Emulator.</p>
          <div class="list wzl">${ctls().map(x => `<div class="row"><div class="grow"><div class="nm">[${x.m.slot}] ${esc(x.m.name)}</div><div class="sub">${esc(x.r.name)} · ${x.m.ip || 'no IP address'} · ${x.m.ctl.powered ? 'On' : 'Off'}</div></div>${x.m.ip && x.m.ctl.powered ? ic('check') : ''}</div>`).join('') || '<div class="empty">No emulated controller yet.</div>'}</div>
          ${gates().length ? '' : `<div class="wzadd"><div class="frow"><label>Chassis</label><span>${esc(r.name)} (${r.size} slots)</span></div><div class="frow"><label>Slot</label><select class="inp" id="wz-s">${free.map(i => `<option>${i}</option>`).join('')}</select></div><div class="frow"><label>Name</label><input class="inp" id="wz-cn" value="Emulator"></div><button class="btn pri" data-wz="addctl">Create Controller</button></div>`}
          ${nav(done(1))}`;
      } else if (s === 2) {
        const g = gates()[0];
        c = `<h3>3. New Project</h3><p class="help">The project's controller must match the emulated one: type, revision and slot.</p>
          <div class="frow"><label>Name</label><input class="inp" id="wz-n" value="${esc(wz.name || (S.p && !wz.made ? uniqueProj('New_Project') : S.p.controller.name))}"${wz.made ? ' disabled' : ''}></div>
          ${kv('Type', 'PLC-CPU (emulated)')}${kv('Revision', '1.0')}
          <div class="frow"><label>Chassis size</label><select class="inp" id="wz-z"${wz.made ? ' disabled' : ''}>${E.RACKS.concat(g && !E.RACKS.includes(g.r.size) ? [g.r.size] : []).map(n => `<option${n === (g ? g.r.size : 8) ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
          ${kv('Slot', g ? g.m.slot : 0)}
          <label class="frow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="wz-io" checked${wz.made ? ' disabled' : ''}><span>Put the I/O cards of the emulator chassis in the I/O Configuration</span></label>
          ${wz.made ? '<p class="tip">Project made.</p>' : ''}${nav(true, wz.made ? 'Next: Who Active' : 'Create Project')}`;
      } else if (s === 3) {
        const cur = curPath();
        c = `<h3>4. Who Active: Set Project Path</h3><p class="help">Browse the driver and pick the controller. Its path is saved in the project.</p>
          <div class="tree wzl"><div class="nd">${ic('chip', 'i ti')}Workstation, MT PLC Studio</div>
          ${gates().map(x => { const p = driverUp('vbp') && x.ri === 0 ? vbpPath(x.m.slot) : pathOf(x.m.ip, x.m.slot); return `<div class="nd${p === cur ? ' on' : ''}" data-wzp="${esc(p)}" style="padding-left:12px">${ic('chip', 'i ti')}${esc(p)} · PLC-CPU ${esc(x.m.name)}</div>`; }).join('')}</div>
          ${kv('Project path', `<span class="mono">${esc(cur)}</span>`)}${nav(done(3))}`;
      } else {
        c = `<h3>5. Ladder</h3><p class="help">Communications, emulator, project and path are ready. Now:</p>
          <ol class="wzsteps"><li>Write rungs (toolbar, or type a mnemonic).</li><li>Verify the routine.</li><li>Go Online → Download.</li><li>Run, and work the inputs on the emulator's I/O cards.</li></ol>${nav(true, 'Finish')}`;
      }
      return `<div class="wz"><div class="wzrail"><b>Setup</b>${WZSTEPS.map(([n, d], i) => `<div class="wzs${i === s ? ' on' : ''}${done(i) ? ' ok' : ''}"><span class="n">${done(i) ? '✓' : i + 1}</span><span><b>${n}</b><small>${d}</small></span></div>`).join('')}<span class="grow"></span><button class="btn" data-wz="quick">Quick setup</button></div><div class="wzc">${c}</div></div>`;
    };
    const el = dialog({ title: 'Setup', size: 'lg', flush: true, body: `<div id="wzb" style="display:flex;flex:1;min-height:0">${body()}</div>`, buttons: [{ l: 'Close' }] });
    const redraw = () => { el.querySelector('#wzb').innerHTML = body(); render(); };
    el.addEventListener('click', ev => {
      const t = ev.target;
      if (driverClick(t, redraw)) return;
      const p = t.closest('[data-wzp]'); if (p) { setPath(p.dataset.wzp); redraw(); return; }
      const b = t.closest('[data-wz]'); if (!b) return;
      const a = b.dataset.wz;
      if (a === 'back') { wz.step--; redraw(); return; }
      if (a === 'addctl') {
        const r = racks[0], s = +el.querySelector('#wz-s').value, n = el.querySelector('#wz-cn').value.trim() || 'Emulator';
        if (!E.validName(n)) { toast('Name: letters, digits and _.', 'err'); return; }
        const res = r.insert(s, 'PLC-CPU', n); if (!res.ok) { toast(res.msg, 'err'); return; }
        const used = new Set(racks.flatMap(x => x.controllers().map(m => m.ip)));
        r.setController(s, { ip: EMULATE_IP(used), on: true }); saveChassis(); redraw(); return;
      }
      if (a === 'quick') { quickSetup(el.querySelector('#wz-n') ? el.querySelector('#wz-n').value.trim() : ''); closeLayer(); return; }
      if (a === 'next') {
        if (wz.step === 2 && !wz.made) {
          const n = el.querySelector('#wz-n').value.trim();
          if (!E.validName(n)) { toast('Name: letters, digits and _ (up to 40).', 'err'); return; }
          if (index().some(x => U(x.name) === U(n)) && !(S.p && U(S.p.controller.name) === U(n))) { toast(`A project named ${n} exists. Pick another name.`, 'err'); return; }
          newProjectFor(n, +el.querySelector('#wz-z').value, el.querySelector('#wz-io').checked);
          wz.made = true; wz.name = n;
        }
        if (wz.step === 4) { closeLayer(); toast('Ready: write your first rung.', 'ok'); return; }
        wz.step++; redraw();
      }
    });
  }
  const EMULATE_IP = used => EMUIPS.find(a => !used.has(a)) || '';
  const uniqueProj = base => { let n = base, k = 1; while (index().some(x => U(x.name) === U(n))) n = base + '_' + (++k); return n; };
  /* a project whose controller and I/O match the emulator chassis that answers first, with its path set */
  function newProjectFor(name, size, copyIO) {
    const vbp = driverUp('vbp');
    const g = racks.flatMap((r, ri) => r.controllers().filter(m => m.ctl.powered && ((vbp && ri === 0) || m.ip)).map(m => ({ r, ri, m })))[0];
    const p = blank(name);
    p.rack.size = size;
    if (g) p.controller.slot = g.m.slot;
    if (g && copyIO) p.rack.modules = [...g.r.mods.values()].filter(m => !m.ctl && m.slot < size).map(m => { const n = m.name.replace(/[^A-Za-z0-9_]/g, '_'); return { slot: m.slot, type: m.type, name: n }; });
    else if (!copyIO) p.rack.modules = [];
    else p.rack.modules = p.rack.modules.filter(m => m.slot !== p.controller.slot);
    saveProject();
    openProject(p, true);
    if (g) setPath(vbp && g.ri === 0 ? vbpPath(g.m.slot) : pathOf(g.m.ip, g.m.slot));
    render();
  }
  function quickSetup(name) {
    if (!driverUp()) addDriver('vbp');
    if (!racks[0].controllers().some(m => m.ctl.powered) && !racks.some(r => r.controllers().some(m => m.ip && m.ctl.powered))) {
      const r = racks[0], s = Array.from({ length: r.size }, (_, i) => i).find(i => !r.module(i));
      if (s != null) { r.insert(s, 'PLC-CPU', 'Emulator'); r.setController(s, { ip: '127.0.0.1', on: true }); saveChassis(); }
    }
    const n = E.validName(name) && !index().some(x => U(x.name) === U(name)) ? name : uniqueProj('New_Project');
    newProjectFor(n, racks[0].size, true);
    toast('Quick setup done: driver, emulator, project and path are ready.', 'ok');
  }
  function cmdNew() {
    saveChanges(newProjectDlg);
  }
  /* New Project, as in the reference: it only declares the controller (type, name, revision, chassis, slot,
     description). Drivers, the emulated controller and I/O modules are set up any time after (Setup Wizard,
     RSLinx, the Emulator, New Module). */
  function newProjectDlg() {
    const sl = z => Array.from({ length: z }, (_, i) => `<option>${i}</option>`).join('');
    const el = dialog({ title: 'New Project', size: 'md', focus: true,
      body: `<div class="frow"><label>Controller</label><select class="inp" id="np-t"><option value="PLC-CPU">PLC-CPU · Emulated Logix controller</option></select></div>
        <div class="frow"><label>Name</label><input class="inp" id="np-n" value="${esc(uniqueProj('New_Project'))}" autocomplete="off" spellcheck="false"></div>
        <div class="frow"><label>Revision</label><select class="inp" id="np-r"><option>1.0</option></select></div>
        <div class="frow"><label>Chassis</label><select class="inp" id="np-z">${E.RACKS.map(n => `<option value="${n}"${n === 8 ? ' selected' : ''}>PLC-RACK${n} (${n} slots)</option>`).join('')}</select></div>
        <div class="frow"><label>Slot</label><select class="inp" id="np-s">${sl(8)}</select></div>
        <div class="frow"><label>Description</label><input class="inp" id="np-d" value=""></div>
        <p class="help">Drivers, the emulated controller and the I/O modules can be set up any time after: Communications, the Emulator, and New Module.</p>`,
      buttons: [{ l: 'Cancel' }, { l: 'Finish', pri: true, run: e2 => {
        const n = e2.querySelector('#np-n').value.trim();
        if (!E.validName(n)) { toast('Name: letters, digits and _ (up to 40).', 'err'); return false; }
        const p = blank(n), d = e2.querySelector('#np-d').value.trim();
        p.rack.size = +e2.querySelector('#np-z').value; p.rack.modules = [];
        p.controller.slot = +e2.querySelector('#np-s').value; p.controller.rev = e2.querySelector('#np-r').value;
        if (d) p.controller.desc = d;
        openProject(p, true); render();
        toast(`Project ${n} made. Add the I/O modules with New Module, and set the path with Who Active.`, 'ok');
      } }] });
    el.querySelector('#np-z').onchange = () => { const s = el.querySelector('#np-s'), v = Math.min(+s.value, +el.querySelector('#np-z').value - 1); s.innerHTML = sl(+el.querySelector('#np-z').value); s.value = v; };
  }


  /* ---------- project files (P4): .mtp (the project, like a project file of the reference software) and .L5X ----------
     Open and Save As use the system's file dialogs where there are any (Windows: Open / Save As); elsewhere Open reads
     a picked file and Save As downloads it. Projects are also kept on this device, as before. */
  /* L5X export, the whole project as Studio 5000 writes a controller export: the controller (type, revision, slot), the
     user-defined data types (consecutive BOOL members packed into a hidden SINT host, as the L5X schema stores them),
     the I/O modules (revision, keying, RPI, inhibit, major fault on failure), every tag with its attributes and its
     offline value as Decorated data, the programs (main and fault routine, inhibit), the routines and rungs with their
     descriptions and comments, and the tasks (type, watchdog, inhibit, output processing). fromL5X reads all of it back. */
  const L5XCAT = { 'PLC-DI16-24V': '1756-IB16', 'PLC-DI16-120V': '1756-IA16', 'PLC-DO16-24V': '1756-OB16E', 'PLC-DO16-RLY': '1756-OW16I', 'PLC-AI4': '1756-IF8', 'PLC-AO4': '1756-OF4' };
  // module firmware revision and connection, as a new module of that catalog number gets them (not checked in the VM)
  const L5XMOD = { di: ['3', '1', 'StandardInput', 'Input'], do: ['3', '1', 'StandardOutput', 'Output'], ai: ['1', '1', 'Float', 'Input'], ao: ['1', '1', 'Float', 'Output'] };
  const l5xIdx = (k, dims) => { const out = []; for (let d = dims.length - 1; d >= 0; d--) { out.unshift(k % dims[d]); k = Math.floor(k / dims[d]); } return out.join(','); };
  /* the L5X of a module and of a rung, as 1756-RM014D describes them. Module: Name, CatalogNumber, Vendor, ProductType
     (7 discrete, 14 controller; 10 analog is not confirmed), ProductCode (this app's own numbers), Major, Minor,
     ParentModule, ParentModPortId, Inhibited, MajorFault; then Description, <EKey State="CompatibleModule|ExactMatch|
     Disabled"/>, <Ports> (Port Id, Address = slot, Type ICP, Upstream) and <Communications><Connections> (Connection
     Name, RPI in microseconds, Type Input or Output, EventID). Rung Type: N normal; this app's pending edit (the copy i
     above the original r) is er above rN, a pending insert e; an accepted edit (I above R) is IR above R, an accepted
     insert I; D delete. Import reads them back (d, a pending delete, as D; rI and rR as r). */
  const L5XKEY = { exact: 'ExactMatch', compat: 'CompatibleModule', off: 'Disabled' };
  const l5xZone = (rs, i) => { const z = rs[i].z || '', nx = (rs[i + 1] || {}).z; return z === 'i' ? (nx === 'r' ? 'er' : 'e') : z === 'r' ? 'rN' : z === 'I' ? (nx === 'R' ? 'IR' : 'I') : z === 'R' || z === 'D' ? z : 'N'; };
  const l5xZoneIn = ty => ({ e: 'i', er: 'i', rN: 'r', rI: 'r', rR: 'r', IR: 'I', I: 'I', R: 'R', D: 'D', d: 'D', i: 'i', r: 'r' })[ty] || '';
  function l5xModule(m, x, cd) {
    const d = E.MODULES[m.type] || {}, [M1, n1] = String(m.rev || E.REV0).split('.'), out = d.kind === 'do' || d.kind === 'ao';
    return `<Module Name="${x(m.name)}" CatalogNumber="${L5XCAT[m.type] || m.type}" Vendor="1" ProductType="${E.PTYPE[d.kind] || 0}" ProductCode="${Object.keys(E.MODULES).indexOf(m.type) + 2}" Major="${+M1}" Minor="${+n1}" ParentModule="Local" ParentModPortId="1" Inhibited="${m.inhibit ? 'true' : 'false'}" MajorFault="${m.majorOnFail ? 'true' : 'false'}">${m.desc ? `<Description>${cd(m.desc)}</Description>` : ''}<EKey State="${L5XKEY[m.key] || 'CompatibleModule'}"/><Ports><Port Id="1" Address="${m.slot}" Type="ICP" Upstream="true"/></Ports><Communications><Connections><Connection Name="${out ? 'Output' : 'Input'}" RPI="${Math.round((m.rpi || 20) * 1000)}" Type="${out ? 'Output' : 'Input'}" EventID="0"/></Connections></Communications></Module>`;
  }
  function l5xKit(p) {
    const x = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const cd = v => `<![CDATA[${String(v).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
    const dsc = v => (v ? `<Description>${cd(v)}</Description>` : '');
    const udts = p.dataTypes || [];
    const memOf = ty => E.PREDEF[U(ty)] || E.MODTYPES[ty] || (udts.find(d => U(d.name) === U(ty)) || {}).members || [];
    const atom = ty => E.ATOMIC.includes(U(ty));
    const num = (ty, v) => { const n = +v || 0; return U(ty) === 'REAL' ? (Number.isInteger(n) ? n.toFixed(1) : String(n)) : String(Math.trunc(n)); };
    const rdx = (ty, st) => (U(ty) === 'REAL' ? st === 'Exponential' ? 'Exponential' : 'Float' : st || 'Decimal');
    // a value as Decorated data: DataValue / Array of Element / Structure of DataValueMember, ArrayMember, StructureMember
    const mems = (ty, v) => memOf(ty).map(m => {
      const mv = v && typeof v === 'object' ? v[m.name] : undefined, mt = U(m.type) === 'BIT' ? 'BOOL' : m.type;
      if (m.dim > 0) return `<ArrayMember Name="${x(m.name)}" DataType="${x(mt)}" Dimensions="${m.dim}"${atom(mt) ? ` Radix="${rdx(mt)}"` : ''}>${elems(mt, [m.dim], mv)}</ArrayMember>`;
      if (atom(mt)) return `<DataValueMember Name="${x(m.name)}" DataType="${U(mt)}"${U(mt) === 'BOOL' ? '' : ` Radix="${rdx(mt)}"`} Value="${num(mt, mv)}"/>`;
      return `<StructureMember Name="${x(m.name)}" DataType="${x(mt)}">${mems(mt, mv)}</StructureMember>`;
    }).join('');
    const elems = (ty, dims, v) => { const n = dims.reduce((a, b) => a * b, 1); let s = ''; for (let k = 0; k < n; k++) { const ev = Array.isArray(v) ? v[k] : undefined; s += atom(ty) ? `<Element Index="[${l5xIdx(k, dims)}]" Value="${num(ty, ev)}"/>` : `<Element Index="[${l5xIdx(k, dims)}]"><Structure DataType="${x(ty)}">${mems(ty, ev)}</Structure></Element>`; } return s; };
    const data = t => {
      const ty = t.type || 'BOOL', dims = E.dimsOf(t.dim) || [];
      const body = dims.length ? `<Array DataType="${x(ty)}" Dimensions="${dims.join(',')}"${atom(ty) ? ` Radix="${rdx(ty, styleOfTag(t))}"` : ''}>${elems(ty, dims, t.value)}</Array>`
        : atom(ty) ? `<DataValue DataType="${U(ty)}" Radix="${rdx(ty, styleOfTag(t))}" Value="${num(ty, t.value)}"/>` : `<Structure DataType="${x(ty)}">${mems(ty, t.value)}</Structure>`;
      return `<Data Format="Decorated">${body}</Data>`;
    };
    const tag = t => t.alias ? `<Tag Name="${x(t.name)}" TagType="Alias" AliasFor="${x(t.alias)}">${dsc(t.desc)}</Tag>`
      : `<Tag Name="${x(t.name)}" TagType="Base" DataType="${x(t.type || 'BOOL')}"${l5xDims(t)}${l5xAttrs(t, x)}>${dsc(t.desc)}${data(t)}</Tag>`;
    // the user-defined types, each after the types its members use
    const done = new Set(), order = [];
    const visit = (d, seen = new Set()) => { if (done.has(d) || seen.has(d)) return; seen.add(d); (d.members || []).forEach(m => { const u = udts.find(y => U(y.name) === U(m.type)); if (u) visit(u, seen); }); done.add(d); order.push(d); };
    udts.forEach(d => visit(d));
    // a user-defined or string type, as l5xTypes writes it
    const udt = d => l5xTypes({ dataTypes: [d] }, x, cd).replace(/^<DataTypes>\n|\n<\/DataTypes>$/g, '');
    const mod = m => l5xModule(m, x, cd);
    // a routine and a program; use: the Use attribute of a component export (Target or Context)
    const rtn = (r, use) => `<Routine${use ? ` Use="${use}"` : ''} Name="${x(r.name)}" Type="RLL">${dsc(r.desc)}
<RLLContent>
${r.rungs.map((u, i) => `<Rung Number="${i}" Type="${l5xZone(r.rungs, i)}">${u.c ? `<Comment>${cd(u.c)}</Comment>` : ''}<Text>${cd(u.t || '')}</Text></Rung>`).join('\n')}
</RLLContent>
</Routine>`;
    const prog = (g, use, only) => `<Program${use ? ` Use="${use}"` : ''} Name="${x(g.name)}" TestEdits="false" MainRoutineName="${x(g.main || '')}"${g.fault ? ` FaultRoutineName="${x(g.fault)}"` : ''} Disabled="${g.inhibit ? 'true' : 'false'}" UseAsFolder="false">${dsc(g.desc)}
<Tags${use ? ' Use="Context"' : ''}>${(only ? only.tags : g.tags || []).map(tag).join('')}</Tags>
<Routines${use ? ' Use="Context"' : ''}>
${only ? rtn(only.routine, 'Target') : g.routines.map(r => rtn(r)).join('\n')}
</Routines>
</Program>`;
    return { x, cd, dsc, tag, udt, order, mod, prog };
  }
  function toL5X(p) {
    const { x, cd, dsc, tag, udt, order, mod, prog } = l5xKit(p);
    const emu = emuCtl(p), pt = emu ? '1756-L85E' : ctype(p.controller.type)[0], mj = emu ? '37' : ctlLabel(p).split(' ')[1], mn = emu ? '11' : '0';
    const progs = p.tasks.flatMap(t => t.programs), hp = k => { const t = p.tasks.find(y => y.type === k); return t && t.programs[0] ? t.programs[0].name : ''; }, cslot = Number.isInteger(p.controller.slot) ? p.controller.slot : 0;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetName="${x(p.controller.name)}" TargetType="Controller" ContainsContext="false" ExportDate="${new Date().toUTCString()}" ExportOptions="NoRawData L5KData DecoratedData ForceProtectedEncoding AllProjDocTrans">
${emu ? '<!--MT PLC Studio: PLC-CPU 1.0-->\n' : ''}<Controller Use="Target" Name="${x(p.controller.name)}" ProcessorType="${pt}" MajorRev="${mj}" MinorRev="${mn}"${hp('fault') ? ` MajorFaultProgram="${x(hp('fault'))}"` : ''}${hp('powerup') ? ` PowerLossProgram="${x(hp('powerup'))}"` : ''}>
${dsc(p.controller.desc)}${l5xTypes({ dataTypes: order }, x, cd)}
<Modules>
<Module Name="Local" CatalogNumber="${pt}" Vendor="1" ProductType="14" Major="${mj}" Minor="${mn}" ParentModule="Local" ParentModPortId="1" Inhibited="false" MajorFault="true"><EKey State="CompatibleModule"/><Ports><Port Id="1" Address="${cslot}" Type="ICP" Upstream="false"><Bus Size="${p.rack.size}"/></Port></Ports></Module>
${p.rack.modules.map(mod).join('\n')}
</Modules>
<Tags>
${p.tags.map(tag).join('\n')}
</Tags>
<Programs>
${progs.map(g => prog(g)).join('\n')}
</Programs>
<Tasks>
${p.tasks.filter(t => !HANDLERS[t.type]).map(t => `<Task Name="${x(t.name)}" Type="CONTINUOUS" Watchdog="${t.watchdog || 500}" DisableUpdateOutputs="${t.noOutputs ? 'true' : 'false'}" InhibitTask="${t.inhibit ? 'true' : 'false'}">${dsc(t.desc)}<ScheduledPrograms>${t.programs.map(g => `<ScheduledProgram Name="${x(g.name)}"/>`).join('')}</ScheduledPrograms></Task>`).join('\n')}
</Tasks>
</Controller>
</RSLogix5000Content>
`;
  }
  /* a Decorated value back: a number, an array (flat, last index fastest) or an object of members */
  function l5xValIn(el) {
    if (!el) return undefined;
    const kids = n => [...n.children];
    const atomV = (n, ty) => { const v = Number(n.getAttribute('Value')); return Number.isFinite(v) ? v : 0; };
    const arr = n => kids(n).filter(k => k.tagName === 'Element').map(e => (e.hasAttribute('Value') ? atomV(e) : struct(kids(e)[0])));
    const struct = n => { const o = {}; if (!n) return o; kids(n).forEach(m => { const nm = m.getAttribute('Name'); if (!nm) return; o[nm] = m.tagName === 'DataValueMember' ? atomV(m) : m.tagName === 'ArrayMember' ? arr(m) : struct(m); }); return o; };
    return el.tagName === 'DataValue' ? atomV(el) : el.tagName === 'Array' ? arr(el) : el.tagName === 'Structure' ? struct(el) : undefined;
  }
  // a start value worth keeping: anything that is not all zero
  const nonZero = v => (Array.isArray(v) ? v.some(nonZero) : v && typeof v === 'object' ? Object.values(v).some(nonZero) : !!v);
  /* L5X import: the parts this app knows. I/O modules map by catalog number (or by kind: digital in/out, analog in/out);
     rung text is kept as written, so an instruction this app lacks shows up in Verify */
  function fromL5X(t, quiet) {
    let d; try { d = new DOMParser().parseFromString(t, 'application/xml'); } catch (e) { d = null; }
    const c = d && d.querySelector('Controller');
    if (!c || d.querySelector('parsererror')) { toast('That L5X file could not be read.', 'err'); return null; }
    const kids = (el, sel) => [...el.children].filter(k => k.tagName === sel);
    const txt = el => (el ? el.textContent : '');
    const desc = el => txt(kids(el, 'Description')[0]).trim();
    const yes = (el, a) => el.getAttribute(a) === 'true';
    const name = (c.getAttribute('Name') || 'Imported').replace(/[^A-Za-z0-9_]/g, '_').replace(/^([^A-Za-z_])/, '_$1').slice(0, 40);
    const p = blank(name);
    if (desc(c)) p.controller.desc = desc(c);
    // a Studio 5000 project keeps its controller type (Change Controller to PLC-CPU to run it on the emulator)
    const pt = CTYPES.find(x => x[0] === U(c.getAttribute('ProcessorType') || ''));
    if (pt && pt[0] !== 'PLC-CPU' && !/MT PLC Studio: PLC-CPU/.test(t)) { p.controller.type = pt[0]; const mr = c.getAttribute('MajorRev'); p.controller.rev = pt[2].includes(mr) ? mr : pt[2][pt[2].length - 1]; }
    const tagsOf = el => (el ? kids(el, 'Tag') : []).map(g => {
      const n = g.getAttribute('Name'), ds = desc(g);
      if (g.getAttribute('TagType') === 'Alias') return ds ? { name: n, alias: g.getAttribute('AliasFor'), desc: ds } : { name: n, alias: g.getAttribute('AliasFor') };
      const o = { name: n, type: g.getAttribute('DataType') || 'BOOL', desc: ds };
      const dim = l5xDimsIn(g); if (dim) o.dim = dim;
      l5xTagIn(g, o);
      if (!o.desc) delete o.desc;
      const dd = kids(g, 'Data').find(x => x.getAttribute('Format') === 'Decorated'), v = dd ? l5xValIn(dd.firstElementChild) : undefined;
      if (v !== undefined && nonZero(v)) o.value = v;
      return o;
    });
    // user-defined data types and string types: the hidden BOOL hosts leave, a BIT member is a BOOL
    p.dataTypes = l5xTypesIn(c);
    p.tags = tagsOf(kids(c, 'Tags')[0]);
    const byCat = {}; Object.keys(L5XCAT).forEach(k => { byCat[L5XCAT[k]] = k; });
    const mods = [], kindOf = cat => byCat[U(cat)] || (/-I[ABCGMNV]\d|-IB\d|-IA\d|-IV\d/i.test(cat) ? 'PLC-DI16-24V' : /-O[ABWVX]\d|-OB\d|-OW\d/i.test(cat) ? 'PLC-DO16-24V' : /-IF\d|-IR\d|-IT\d/i.test(cat) ? 'PLC-AI4' : /-OF\d/i.test(cat) ? 'PLC-AO4' : null);
    const ms = kids(c, 'Modules')[0];
    let size = 10;
    (ms ? kids(ms, 'Module') : []).forEach(m => {
      const port = m.querySelector('Port'), slot = parseInt(port && port.getAttribute('Address'), 10);
      if (m.getAttribute('Name') === 'Local' && m.getAttribute('ParentModule') === 'Local') { const bus = m.querySelector('Bus'); if (bus) size = parseInt(bus.getAttribute('Size'), 10) || size; if (slot >= 0) p.controller.slot = slot; }
    });
    (ms ? kids(ms, 'Module') : []).forEach(m => {
      const cat = m.getAttribute('CatalogNumber') || '', port = m.querySelector('Port'), slot = parseInt(port && port.getAttribute('Address'), 10);
      const type = kindOf(cat);
      const exact = Object.keys(L5XCAT).find(k => L5XCAT[k] === cat.toUpperCase()), mt = exact || type;
      if (!mt || !(slot >= 0) || slot === p.controller.slot || m.getAttribute('ParentModule') !== 'Local' || m.getAttribute('Name') === 'Local') return;
      const o = { slot, type: mt, name: (m.getAttribute('Name') || mt).replace(/[^A-Za-z0-9_]/g, '_') }, a = k => m.getAttribute(k), ek = m.querySelector('EKey'), cx = m.querySelector('Connections > Connection'), ds = txt(kids(m, 'Description')[0]).trim();
      const st = ek && ek.getAttribute('State'), key = Object.keys(L5XKEY).find(k => L5XKEY[k] === st), M1 = (ek && st === 'Custom' && ek.getAttribute('Major')) || a('Major'), n1 = (ek && st === 'Custom' && ek.getAttribute('Minor')) || a('Minor');
      if (ds) o.desc = ds;
      if (key && key !== 'compat') o.key = key;
      if (/^\d+$/.test(M1 || '') && /^\d+$/.test(n1 || '') && `${+M1}.${+n1}` !== E.REV0) o.rev = `${+M1}.${+n1}`;
      if (a('Inhibited') === 'true') o.inhibit = true;
      if (a('MajorFault') === 'true') o.majorOnFail = true;
      const rpi = cx && +cx.getAttribute('RPI') / 1000; if (rpi >= E.RPI[0] && rpi <= E.RPI[1] && rpi !== 20) o.rpi = rpi;
      mods.push(o);
    });
    p.rack.size = E.fitRack(E.RACKS.find(n => n >= size) || size, mods.map(m => m.slot).concat(p.controller.slot || 0));
    p.rack.modules = mods.filter(m => m.slot < p.rack.size);
    const progs = kids(c, 'Programs')[0];
    const list = (progs ? kids(progs, 'Program') : []).map(g => {
      const routines = kids(kids(g, 'Routines')[0] || g, 'Routine').filter(r => (r.getAttribute('Type') || 'RLL') === 'RLL').map(r => {
        const o = { name: r.getAttribute('Name'), rungs: [...r.querySelectorAll('RLLContent > Rung')].map(u => { const o = { t: txt(u.querySelector('Text')).trim() }; const cm = txt(u.querySelector('Comment')).trim(); if (cm) o.c = cm; const z = l5xZoneIn(u.getAttribute('Type')); if (z) o.z = z; return o; }) };
        if (desc(r)) o.desc = desc(r);
        return o;
      });
      routines.forEach(r => { if (!r.rungs.length) r.rungs = [{ t: '' }]; });
      const o = { name: g.getAttribute('Name'), main: g.getAttribute('MainRoutineName') || (routines[0] && routines[0].name) || 'MainRoutine', tags: tagsOf(kids(g, 'Tags')[0]), routines: routines.length ? routines : [{ name: 'MainRoutine', rungs: [{ t: '' }] }] };
      const fr = g.getAttribute('FaultRoutineName'); if (fr && routines.some(r => r.name === fr)) o.fault = fr;
      if (yes(g, 'Disabled')) o.inhibit = true;
      if (desc(g)) o.desc = desc(g);
      return o;
    });
    // the tasks and the programs they schedule; a program no task schedules goes in the first task
    // the Controller Fault Handler and Power-Up Handler programs (Controller MajorFaultProgram, PowerLossProgram)
    const hand = [['fault', c.getAttribute('MajorFaultProgram')], ['powerup', c.getAttribute('PowerLossProgram')]].map(([k, n]) => [k, n && list.find(g => g.name === n)]).filter(([, g]) => g);
    const tk = kids(c, 'Tasks')[0], used = new Set(hand.map(([, g]) => g));
    const tasks = (tk ? kids(tk, 'Task') : []).map(x => {
      const o = { name: x.getAttribute('Name'), type: 'continuous', programs: [] }, w = parseInt(x.getAttribute('Watchdog'), 10);
      if (w && w !== 500) o.watchdog = w;
      if (yes(x, 'InhibitTask')) o.inhibit = true;
      if (yes(x, 'DisableUpdateOutputs')) o.noOutputs = true;
      if (desc(x)) o.desc = desc(x);
      x.querySelectorAll('ScheduledProgram').forEach(sp => { const g = list.find(y => y.name === sp.getAttribute('Name')); if (g && !used.has(g)) { used.add(g); o.programs.push(g); } });
      return o;
    }).filter(o => E.validName(o.name));
    if (list.length) {
      if (!tasks.length) tasks.push({ name: 'MainTask', type: 'continuous', programs: [] });
      tasks[0].programs.push(...list.filter(g => !used.has(g)));
      p.tasks = tasks.filter(o => o.programs.length).concat(hand.map(([k, g]) => ({ name: HANDLERS[k], type: k, programs: [g] })));
    }
    const n = list.reduce((k, g) => k + g.routines.reduce((m, r) => m + r.rungs.length, 0), 0);
    if (!quiet) setTimeout(() => toast(`Imported ${name}: ${list.length} program(s), ${n} rung(s), ${p.tags.length} controller tag(s). Run Verify to see what this app does not support.`, 'ok'), 50);
    return p;
  }

  /* ---------- File > Import Component, and the organizer's Export (help v37: About Import/Export of Components) ----------
     A routine, a program or a user-defined data type as a component .L5X (TargetType Routine / Program / DataType,
     ContainsContext): the file holds the component and what it uses (tags, data types). Import Configuration then
     shows each item with its Operation: Create, Overwrite (the component when its final name exists) or Use Existing
     (a tag or data type the project has already); the component's final name can be changed. */
  const COMPK = { Routine: 'Routine', Program: 'Program', DataType: 'Data Type' };
  function udtsFor(p, types) {
    const out = new Set(), list = p.dataTypes || [];
    const add = n => { const d = list.find(y => U(y.name) === U(n)); if (!d || out.has(d)) return; out.add(d); (d.members || []).forEach(m => add(m.type)); };
    types.forEach(add);
    return out;
  }
  // the names (upper case) the rungs' operands use, members and bits left out
  function rungNames(rs) {
    const names = new Set();
    rs.forEach(r => { const pr = E.parseRung(r.t || ''); if (pr.err) return; const walk = arr => arr.forEach(e => { if (e.t === 'BR') e.legs.forEach(walk); else (e.a || []).forEach(a => (String(a).match(/(?<![.\w:])[A-Za-z_]\w*/g) || []).forEach(n => names.add(U(n)))); }); walk(pr.elems); });
    return names;
  }
  function compL5X(kind, o) {
    const p = S.p, k = l5xKit(p), g = o.g, rs = kind === 'Routine' ? o.r.rungs : kind === 'Program' ? g.routines.flatMap(r => r.rungs) : [];
    const names = rungNames(rs), mine = n => (g ? g.tags : []).some(y => U(y.name) === U(n));
    const ptags = kind === 'Routine' ? g.tags.filter(t => names.has(U(t.name))) : [];
    const ctags = kind === 'DataType' ? [] : p.tags.filter(t => names.has(U(t.name)) && !mine(t.name));
    const used = udtsFor(p, kind === 'DataType' ? [o.d.name] : [...ctags, ...(kind === 'Program' ? g.tags : ptags)].map(t => t.type || ''));
    const dts = k.order.filter(d => used.has(d)).map(d => k.udt(d).replace('<DataType ', `<DataType Use="${kind === 'DataType' && d === o.d ? 'Target' : 'Context'}" `));
    const name = kind === 'DataType' ? o.d.name : kind === 'Routine' ? o.r.name : g.name;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetName="${k.x(name)}" TargetType="${kind}"${kind === 'Routine' ? ' TargetSubType="RLL"' : ''} ContainsContext="true" ExportDate="${new Date().toUTCString()}" ExportOptions="References NoRawData L5KData DecoratedData Context Dependencies ForceProtectedEncoding AllProjDocTrans">
<Controller Use="Context" Name="${k.x(p.controller.name)}">
<DataTypes Use="Context">${dts.join('\n')}</DataTypes>
${kind === 'DataType' ? '' : `<Tags Use="Context">${ctags.map(k.tag).join('')}</Tags>
<Programs Use="Context">
${kind === 'Routine' ? k.prog(g, 'Context', { tags: ptags, routine: o.r }) : k.prog(g, 'Target')}
</Programs>`}
</Controller>
</RSLogix5000Content>
`;
  }
  function exportComponent(kind, o) {
    const name = kind === 'DataType' ? o.d.name : kind === 'Routine' ? o.r.name : o.g.name;
    fileDialog({ mode: 'save', title: `Export ${COMPK[kind]}`, name: `${name}.L5X`, types: ['l5x'], onPick: async f => { try { await FS.write(f, compL5X(kind, o)); toast(`Exported ${COMPK[kind]} ${name} to ${baseName(f)}`, 'ok'); } catch (e) { toast('Could not export: ' + (e.message || e), 'err'); } } });
  }
  function importComponent(kind) {
    if (!offline()) { toast('Go offline to import a component.'); return; }
    fileDialog({ mode: 'open', title: `Import ${COMPK[kind]}`, types: ['l5x'], onPick: async f => {
      let t; try { t = await FS.read(f); } catch (e) { toast('That file could not be read: ' + (e.message || e), 'err'); return; }
      let d = null; try { d = new DOMParser().parseFromString(t, 'application/xml'); } catch (e) { /* not XML */ }
      const root = d && !d.querySelector('parsererror') && d.querySelector('RSLogix5000Content'), tt = root ? root.getAttribute('TargetType') : '';
      if (!root) { toast('That L5X file could not be read.', 'err'); return; }
      if (tt !== kind) { toast(`That file holds ${tt ? 'a ' + (COMPK[tt] || tt) : 'no component'}, not a ${COMPK[kind]}.`, 'err'); return; }
      const q = fromL5X(t, true); if (!q) return;
      importConfig(kind, q, root.getAttribute('TargetName') || '', baseName(f));
    } });
  }
  function importConfig(kind, q, tname, file) {
    const qg = q.tasks.flatMap(t => t.programs), dts = q.dataTypes || [];
    let comp = null, ptags = [];
    if (kind === 'Routine') { const g = qg[0]; comp = g ? g.routines.find(r => r.name === tname) || g.routines[0] : null; ptags = g ? g.tags : []; }
    else if (kind === 'Program') comp = qg.find(g => g.name === tname) || qg[0] || null;
    else comp = dts.find(x => x.name === tname) || null;
    if (!comp) { toast(`That file holds no ${COMPK[kind]}.`, 'err'); return; }
    const ctags = kind === 'DataType' ? [] : q.tags;
    const st = { name: comp.name, into: kind === 'Routine' ? orgProg() : kind === 'Program' ? (S.p.tasks.find(t => S.orgSel === 'task:' + t.name) || S.p.tasks[0]).name : '' };
    const intoProg = () => allProgs().find(g => g.name === st.into);
    const has = (list, n) => (list || []).some(y => U(y.name) === U(n));
    const exists = () => (kind === 'Routine' ? has(intoProg().routines, st.name) : kind === 'Program' ? has(allProgs(), st.name) : has(S.p.dataTypes, st.name));
    const refDts = dts.filter(x => x !== comp), refPt = kind === 'Routine' ? ptags : [];
    const rows = () => [[COMPK[kind], comp.name, exists() ? 'Overwrite' : 'Create', st.name]]
      .concat(refDts.map(x => ['Data Type', x.name, has(S.p.dataTypes, x.name) ? 'Use Existing' : 'Create', x.name]))
      .concat(ctags.map(x => ['Tag', x.name, has(S.p.tags, x.name) ? 'Use Existing' : 'Create', x.name]))
      .concat(refPt.map(x => ['Tag', x.name, has(intoProg().tags, x.name) ? 'Use Existing' : 'Create', x.name]));
    const table = () => `<table class="ictbl"><tr><th>Type</th><th>Import Name</th><th>Operation</th><th>Final Name</th></tr>${rows().map(([k, n, op, f], i) => `<tr><td>${k}</td><td class="mono">${esc(n)}</td><td>${op}</td><td class="mono">${i ? esc(f) : ''}</td></tr>`).join('')}</table>`;
    const into = kind === 'Routine' ? allProgs().map(g => g.name) : kind === 'Program' ? S.p.tasks.map(t => t.name) : [];
    const el = dialog({ title: 'Import Configuration', size: 'md',
      body: `<div class="frow"><label>File</label><span class="mono">${esc(file)}</span></div>
        <div class="frow"><label>Files containing</label><span>${COMPK[kind]}</span></div>
        ${into.length ? `<div class="frow"><label for="ic-i">Into</label><select class="inp" id="ic-i">${into.map(n => `<option${n === st.into ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>` : ''}
        <div class="frow"><label for="ic-n">Final Name</label><input class="inp mono" id="ic-n" value="${esc(st.name)}" autocomplete="off" spellcheck="false"></div>
        <div id="ic-t">${table()}</div><div class="errtx" id="ic-e"></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: e2 => {
        const err = m => { e2.querySelector('#ic-e').textContent = m; return false; };
        if (!E.validName(st.name)) return err('Final Name: letters, digits and _ (up to 40).');
        const over = exists(), cl = v => JSON.parse(JSON.stringify(v));
        edit(() => {
          S.p.dataTypes = S.p.dataTypes || [];
          refDts.forEach(x => { if (!has(S.p.dataTypes, x.name)) S.p.dataTypes.push(cl(x)); });
          ctags.forEach(x => { if (!has(S.p.tags, x.name)) S.p.tags.push(cl(x)); });
          if (kind === 'DataType') {
            const nd = Object.assign(cl(comp), { name: st.name }), i = S.p.dataTypes.findIndex(y => U(y.name) === U(st.name));
            if (i >= 0) S.p.dataTypes.splice(i, 1, nd); else S.p.dataTypes.push(nd);
            return;
          }
          if (kind === 'Routine') {
            const g = intoProg(), nr = Object.assign(cl(comp), { name: st.name }), i = g.routines.findIndex(y => U(y.name) === U(st.name));
            refPt.forEach(x => { if (!has(g.tags, x.name)) g.tags.push(cl(x)); });
            if (i >= 0) { nr.name = g.routines[i].name; g.routines.splice(i, 1, nr); } else g.routines.push(nr);
            S.prog = g.name; S.routine = nr.name;
          } else {
            const ng = Object.assign(cl(comp), { name: st.name }), T = S.p.tasks.find(t => t.name === st.into);
            const at = S.p.tasks.find(t => t.programs.some(y => U(y.name) === U(st.name)));
            if (at) { const i = at.programs.findIndex(y => U(y.name) === U(st.name)); ng.name = at.programs[i].name; at.programs.splice(i, 1, ng); } else T.programs.push(ng);
            S.prog = ng.name; S.routine = ng.main || ng.routines[0].name;
          }
          S.view = 'ladder'; S.sel = null; S.selRung = 0;
        });
        reverify(); render();
        toast(`${COMPK[kind]} ${st.name} ${over ? 'overwritten' : 'imported'} from ${file}.`, 'ok');
      } }] });
    const upd = () => { st.name = el.querySelector('#ic-n').value.trim(); const i = el.querySelector('#ic-i'); if (i) st.into = i.value; el.querySelector('#ic-t').innerHTML = table(); };
    el.addEventListener('input', upd); el.addEventListener('change', upd);
  }
  // File > Import Component on the phone and tablet's More: the kinds, as the reference's submenu
  function importCompMenu(at) { openMenu(['impdt', 'impprog', 'imprtn'].map(id => ({ id, l: C[id].l, i: C[id].i })), at || { x: 40, y: 80 }, 'Import Component'); }

  /* ---------- organizer actions ---------- */
  function openRoutine(key) { const [g, r] = key.slice(3).split('/'); S.prog = g; S.routine = r; S.view = 'ladder'; S.sel = null; S.selRung = 0; S.drawer = false; if (S.layout === 'phone') S.area = 'ladder'; reverify(); render(); }
  /* Edit > Properties (reference: the properties of the current component): what was picked last, in the Controller
     Organizer (routine, program, task, module, controller), the Tag Editor (a tag) or the ladder (the tag of the
     selected operand, else the routine) */
  function propsCmd() {
    const k = S.orgSel || '';
    if (S.pickAt === 'org' && k) {
      if (k.startsWith('rt:')) return routineProps(k);
      if (k.startsWith('prog:')) return progProps(k.slice(5));
      if (k.startsWith('task:')) return taskProps(k.slice(5));
      if (k.startsWith('mod:') && +k.slice(4) !== ctlSlot()) return moduleProps(+k.slice(4));
      return controllerProps();
    }
    if (S.pickAt === 'tag' && S.view === 'tags' && S.tagPick) {
      const list = scopeTags(S.tagScope || ''), t = list.find(x => x.name === S.tagPick), io = /^Local:(\d+)/.exec(S.tagPick);
      if (t) return newTag({ tag: t, list });
      if (io) return moduleProps(+io[1]);
    }
    if (S.view === 'ladder') {
      const a = selOperand(), t = isTagText(a) ? tagFor(String(a).split(/[.[]/)[0]) : null;
      if (t) return newTag({ tag: t });
      return routineProps(`rt:${S.prog}/${S.routine}`);
    }
    controllerProps();
  }
  // the program picked in the Controller Organizer (a program or one of its routines), else the open routine's
  function orgProg() {
    const k = S.orgSel || '', g = k.startsWith('prog:') ? k.slice(5) : k.startsWith('rt:') ? k.slice(3).split('/')[0] : '';
    return allProgs().some(x => x.name === g) ? g : curProg().name;
  }
  /* New Routine (help v37; 1756-PM014, Create a fault routine for a program): Name, Description, Type, In Program,
     Assignment (Main, Fault or none). The first routine of a program without a main routine is Main by default. */
  function newRoutine(gname) {
    const g = allProgs().find(x => x.name === gname);
    let n = 'Routine' + (g.routines.length + 1);
    for (let k = g.routines.length + 1; g.routines.some(r => U(r.name) === U(n)); ) n = 'Routine' + ++k;
    dialog({ title: 'New Routine', size: 'md', focus: true,
      body: `<div class="frow"><label>Name</label><input class="inp" id="p1" value="${esc(n)}" autofocus autocomplete="off" spellcheck="false" autocapitalize="off"></div>
        <div class="frow"><label>Description</label><textarea class="inp" id="nr-d" rows="2"></textarea></div>
        <div class="frow"><label>Type</label><select class="inp" disabled><option>Ladder Diagram</option></select></div>
        <div class="frow"><label>In Program</label><select class="inp" disabled><option>${esc(g.name)}</option></select></div>
        <div class="frow"><label>Assignment</label><select class="inp" id="nr-a"><option value=""${g.main ? ' selected' : ''}>&lt;none&gt;</option><option value="main"${g.main ? '' : ' selected'}>Main</option><option value="fault">Fault</option></select></div>
        <p class="help">Call a routine from the main routine with JSR. A Fault routine runs when an instruction of this program faults; it clears the fault by setting Type and Code of the program's MajorFaultRecord to 0.</p><div class="errtx" id="p1e"></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        const v = el.querySelector('#p1').value.trim(), d = el.querySelector('#nr-d').value.trim(), as = el.querySelector('#nr-a').value, er = t => { el.querySelector('#p1e').textContent = t; return false; };
        if (!E.validName(v)) return er('Use letters, digits and _ (up to 40).');
        if (g.routines.some(r => U(r.name) === U(v))) return er('A routine with that name exists.');
        edit(() => { const r = { name: v, rungs: [{ t: '' }] }; if (d) r.desc = d; g.routines.push(r); if (as === 'main') g.main = v; else if (as === 'fault') g.fault = v; S.prog = g.name; S.routine = v; S.view = 'ladder'; S.sel = null; S.selRung = 0; });
      } }] });
  }
  /* New Program in the Controller Fault Handler or Power-Up Handler folder (1756-PM014; help: the handler program cannot
     be created or changed in Remote Run or Run). The handler holds one program; its first routine becomes its main
     routine (New Routine, Assignment Main). */
  function newHandlerProgram(kind) {
    if (handlerProg(kind)) { toast(`The ${HANDLERS[kind]} already has a program.`, 'err'); return; }
    if (S.online && ctl.M && (ctl.mode === 'run' || ctl.mode === 'remrun')) {
      toast(kind === 'fault' ? 'Failed to create the program as the Controller Fault Handler program. Not allowed in the current mode: change the controller mode (Remote Run, Run) first.'
        : 'Failed to create the program as the Power Up Handler program. The current mode (Remote Run, Run) prevents it: change the controller mode first.', 'err');
      return;
    }
    const names = new Set(allProgs().map(g => U(g.name)));
    let n = kind === 'fault' ? 'FaultHandler' : 'PowerUp', k = 1;
    while (names.has(U(n))) n = (kind === 'fault' ? 'FaultHandler' : 'PowerUp') + ++k;
    dialog({ title: 'New Program', size: 'md', focus: true,
      body: `<div class="frow"><label>Name</label><input class="inp" id="np2-n" value="${esc(n)}" autocomplete="off" spellcheck="false" autocapitalize="off"></div>
        <div class="frow"><label>Description</label><textarea class="inp" id="np2-d" rows="2"></textarea></div>
        <div class="frow"><label>Schedule in</label><select class="inp" id="np2-s" disabled><option>${HANDLERS[kind]}</option></select></div>
        <p class="help">${kind === 'fault' ? 'This program runs when a major fault occurs, or a program fault is not cleared by a fault routine.' : 'This program runs at power-up after the power was lost in Run mode.'} Add a routine to it with New Routine; to clear the fault, set Type and Code of its MajorFaultRecord to 0.</p><div class="errtx" id="np2-e"></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        const v = el.querySelector('#np2-n').value.trim(), d = el.querySelector('#np2-d').value.trim();
        if (!E.validName(v)) { el.querySelector('#np2-e').textContent = 'Use letters, digits and _ (up to 40).'; return false; }
        if (names.has(U(v))) { el.querySelector('#np2-e').textContent = 'A program with that name exists.'; return false; }
        edit(() => {
          let t = handlerTask(kind);
          if (!t) { t = { name: HANDLERS[kind], type: kind, programs: [] }; S.p.tasks.push(t); }
          const g = { name: v, tags: [], routines: [] }; if (d) g.desc = d;
          t.programs.push(g);
          S.orgSel = 'prog:' + v;
          const c = new Set(S.prefs.collapsed); c.delete(kind === 'fault' ? 'cfh' : 'puh'); c.delete('ctl'); S.prefs.collapsed = [...c]; savePrefs();
        });
        toast(`Program ${v} added to the ${HANDLERS[kind]}. Add a routine with New Routine.`, 'ok');
      } }] });
  }
  function renameRoutine(key) {
    const [gn, rn] = key.slice(3).split('/'), g = allProgs().find(x => x.name === gn), r = g.routines.find(x => x.name === rn);
    prompt1('Rename Routine', 'Name', rn, v => {
      if (!E.validName(v)) return 'Use letters, digits and _ (up to 40).';
      if (U(v) !== U(rn) && g.routines.some(x => U(x.name) === U(v))) return 'A routine with that name exists.';
      edit(() => { S.tabs = S.tabs.map(k => (k === gn + '/' + rn ? gn + '/' + v : k)); r.name = v; if (g.main === rn) g.main = v; if (g.fault === rn) g.fault = v; if (S.routine === rn) S.routine = v; });
    });
  }
  function deleteRoutine(key) {
    const [gn, rn] = key.slice(3).split('/'), g = allProgs().find(x => x.name === gn);
    if (g.main === rn) { toast('The main routine cannot be deleted.', 'err'); return; }
    confirmDlg('Delete Routine', `Delete <b>${esc(rn)}</b> and its rungs?`, 'Delete', () => { edit(() => { g.routines = g.routines.filter(x => x.name !== rn); if (g.fault === rn) delete g.fault; if (S.routine === rn) { S.routine = g.main; S.sel = null; S.selRung = 0; } }); }, true);
  }
  /* Select Module Type (v37 help: Select Module Type dialog box - Catalog tab; Create modules; Search for modules):
     a Search box (incremental, up to 4 terms separated by *, over every column but Category), the Catalog Results
     (Catalog Number, Description, Vendor, Category; a click on a heading sorts it, ascending first), "N of M Module
     Types Found", the Module Type Category and Vendor Filters (All, grayed out when the search leaves none), Clear
     Filter, Show/Hide Filters, Add to Favorites (Favorites tab) and Close on Create. Create opens New Module (the
     fields of the General tab of Module Properties). Module Discovery (online browse) is not emulated. */
  const SMTCAT = { di: 'Digital', do: 'Digital', ai: 'Analog', ao: 'Analog' }, SMTVEND = 'MT PLC Studio';
  const smt = { tab: 'cat', q: '', cats: {}, vends: {}, sort: 0, dir: 1, close: true, filt: true, sel: '' };
  const smtTypes = () => Object.keys(E.MODULES).filter(t => !E.MODULES[t].emuOnly && E.MODULES[t].kind !== 'enet')
    .map(t => ({ t, cols: [t, MODNAMES[t] || '', SMTVEND, SMTCAT[E.MODULES[t].kind] || 'Other'] }));
  const smtHit = (r, q) => { const terms = q.toLowerCase().split('*').map(x => x.trim()).filter(Boolean).slice(0, 4), hay = r.cols.slice(0, 3).join(' ').toLowerCase(); return terms.every(x => hay.includes(x)); };
  function newModule() {
    if (!offline()) { toast('Go offline to add a module.'); return; }
    const used = new Set(S.p.rack.modules.map(m => m.slot).concat(ctlSlot())), free = [];
    for (let s = 0; s < S.p.rack.size; s++) if (!used.has(s)) free.push(s);
    if (!free.length) { toast('The rack is full.', 'err'); return; }
    const all = smtTypes(), favs = () => (S.prefs.favMods || []).filter(t => all.some(r => r.t === t));
    const box = (k, list, on, hit) => `<div class="smt-fl"><label class="ck"><input type="checkbox" data-smtall="${k}"${list.every(x => on[x] !== false) ? ' checked' : ''}> <b>All</b></label>${list.map(x => `<label class="ck${hit.has(x) ? '' : ' muted'}"><input type="checkbox" data-smt${k}="${esc(x)}"${on[x] !== false ? ' checked' : ''}> ${esc(x)}</label>`).join('')}</div>`;
    const body = () => {
      const fav = smt.tab === 'fav', src = fav ? all.filter(r => favs().includes(r.t)) : all, hits = src.filter(r => smtHit(r, smt.q));
      const rows = hits.filter(r => smt.cats[r.cols[3]] !== false && smt.vends[r.cols[2]] !== false)
        .sort((a, b) => smt.dir * a.cols[smt.sort].localeCompare(b.cols[smt.sort]) || a.t.localeCompare(b.t));
      if (!rows.some(r => r.t === smt.sel)) smt.sel = rows.length ? rows[0].t : '';
      const cats = [...new Set(src.map(r => r.cols[3]))].sort(), vends = [...new Set(src.map(r => r.cols[2]))].sort();
      return `<table class="rltab smt-t"><thead><tr>${['Catalog Number', 'Description', 'Vendor', 'Category'].map((h, n) => `<th data-smtsort="${n}">${h}${smt.sort === n ? (smt.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr data-smt="${r.t}"${r.t === smt.sel ? ' class="on"' : ''}>${r.cols.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="4" class="muted">${fav ? 'No favorites: select a module type on the Catalog tab and choose Add to Favorites.' : 'No module type matches.'}</td></tr>`}</tbody></table>
        <div class="smt-n" id="smt-n">${rows.length} of ${src.length} Module Types Found</div>
        <div class="smt-f"${smt.filt ? '' : ' hidden'}><div><div class="grp">Module Type Category Filters</div>${box('cat', cats, smt.cats, new Set(hits.map(r => r.cols[3])))}</div>
        <div><div class="grp">Module Type Vendor Filters</div>${box('vend', vends, smt.vends, new Set(hits.map(r => r.cols[2])))}</div></div>`;
    };
    const create = () => { if (!smt.sel) { toast('Select a module type.', 'err'); return false; } newModule2(smt.sel, free, smt.close ? null : newModule); return false; }; // false: New Module has replaced this layer
    dialog({ title: 'Select Module Type', size: 'lg',
      body: `<div class="fchips dtabs"><span class="fchip${smt.tab === 'cat' ? ' on' : ''}" data-smttab="cat">Catalog</span><span class="fchip${smt.tab === 'fav' ? ' on' : ''}" data-smttab="fav">Favorites</span></div>
        <div class="smt-bar"><input class="inp" id="smt-q" type="search" maxlength="40" placeholder="Search" value="${esc(smt.q)}" autofocus autocomplete="off" spellcheck="false" autocapitalize="off">
        <button class="btn" id="smt-clr">Clear Filter</button><button class="btn" id="smt-sh">${smt.filt ? 'Hide Filters ▲' : 'Show Filters ▼'}</button></div>
        <div id="smt-b">${body()}</div>
        <div class="smt-bar"><label class="ck"><input type="checkbox" id="smt-close"${smt.close ? ' checked' : ''}> Close on Create</label><span class="grow"></span><button class="btn" id="smt-fav">Add to Favorites</button></div>`,
      buttons: [{ l: 'Close' }, { l: 'Create', pri: true, run: create }],
      mount: el => {
        const q = el.querySelector('#smt-q'), draw = () => { el.querySelector('#smt-b').innerHTML = body(); el.querySelector('#smt-sh').textContent = smt.filt ? 'Hide Filters ▲' : 'Show Filters ▼'; el.querySelectorAll('[data-smttab]').forEach(c => c.classList.toggle('on', c.dataset.smttab === smt.tab)); el.querySelector('#smt-fav').textContent = smt.tab === 'fav' ? 'Remove from Favorites' : 'Add to Favorites'; };
        // the help: alphanumeric text up to 40 characters, without ! @ # $ ^ ( ) _ + = ~ ` / | { } [ ]
        q.oninput = () => { const v = q.value.replace(/[!@#$^()_+=~`/|{}[\]]/g, ''); if (v !== q.value) q.value = v; smt.q = v; draw(); };
        el.querySelector('#smt-clr').onclick = () => { smt.q = q.value = ''; smt.cats = {}; smt.vends = {}; draw(); };
        el.querySelector('#smt-sh').onclick = () => { smt.filt = !smt.filt; draw(); };
        el.querySelector('#smt-close').onchange = e => { smt.close = e.target.checked; };
        el.querySelector('#smt-fav').onclick = () => {
          if (!smt.sel) return;
          const f = favs().filter(t => t !== smt.sel); if (smt.tab !== 'fav') f.push(smt.sel);
          S.prefs.favMods = f; savePrefs(); toast(smt.tab === 'fav' ? `${smt.sel} removed from the Favorites.` : `${smt.sel} added to the Favorites.`); draw();
        };
        el.addEventListener('click', e => {
          const tb = e.target.closest('[data-smttab]'), th = e.target.closest('[data-smtsort]'), tr = e.target.closest('tr[data-smt]');
          if (tb) { smt.tab = tb.dataset.smttab; draw(); }
          else if (th) { const n = +th.dataset.smtsort; smt.dir = smt.sort === n ? -smt.dir : 1; smt.sort = n; draw(); }
          else if (tr) { smt.sel = tr.dataset.smt; el.querySelectorAll('tr[data-smt]').forEach(x => x.classList.toggle('on', x === tr)); }
        });
        el.addEventListener('dblclick', e => { const tr = e.target.closest('tr[data-smt]'); if (tr) { smt.sel = tr.dataset.smt; create(); } });
        el.addEventListener('change', e => {
          const a = e.target.dataset.smtall, c = e.target.dataset.smtcat, v = e.target.dataset.smtvend;
          if (a) { const o = a === 'cat' ? smt.cats : smt.vends; el.querySelectorAll(`[data-smt${a}]`).forEach(x => { o[x.getAttribute('data-smt' + a)] = e.target.checked; }); draw(); }
          else if (c != null) { smt.cats[c] = e.target.checked; draw(); }
          else if (v != null) { smt.vends[v] = e.target.checked; draw(); }
        });
      } });
  }
  /* New Module (help: the same information as the General tab of Module Properties): Type, Vendor, Parent, Name,
     Description, Slot; Open Module Properties opens Module Properties after OK. back: Close on Create was cleared,
     so Select Module Type comes back after this dialog. */
  function newModule2(type, free, back) {
    const n0 = (() => { let k = free[0], n = 'MOD_' + k; while (S.p.rack.modules.some(m => U(m.name) === U(n))) n = 'MOD_' + ++k; return n; })();
    dialog({ title: 'New Module', size: 'md', mount: keyMount, onClose: back ? () => setTimeout(back, 0) : null,
      body: `<div class="frow"><label>Type</label><span><span class="mono" id="nm-t">${esc(type)}</span> <span class="muted">${esc(MODNAMES[type] || '')}</span></span></div>
        <div class="frow"><label>Vendor</label><span>${SMTVEND}</span></div>
        <div class="frow"><label>Parent</label><span>Local</span></div>
        <div class="frow"><label>Name</label><input class="inp" id="mn2" value="${esc(n0)}" autofocus autocomplete="off" spellcheck="false" autocapitalize="off"></div>
        <div class="frow"><label>Description</label><textarea class="inp" id="nm-d" rows="2"></textarea></div>
        <div class="frow"><label>Slot</label><select class="inp" id="ms">${free.map(s => `<option>${s}</option>`).join('')}</select></div>
        ${keyRows({ type }, '')}
        <label class="ck"><input type="checkbox" id="nm-op"> Open Module Properties</label>
        <div class="errtx" id="me"></div>`,
      buttons: [{ l: 'Cancel', run: () => { if (back) setTimeout(back, 0); } }, { l: 'OK', pri: true, run: el => {
        const slot = +el.querySelector('#ms').value, name = el.querySelector('#mn2').value.trim(), d = el.querySelector('#nm-d').value.trim(), op = el.querySelector('#nm-op').checked;
        if (!E.validName(name)) { el.querySelector('#me').textContent = 'Use letters, digits and _.'; return false; }
        if (S.p.rack.modules.some(m => U(m.name) === U(name))) { el.querySelector('#me').textContent = 'A module with that name exists.'; return false; }
        const kr = keyRead(el); if (!kr) return false;
        const m = { slot, type, name }; if (d) m.desc = d; if (kr.rev !== E.REV0) m.rev = kr.rev; if (kr.key !== 'compat') m.key = kr.key;
        edit(() => { S.p.rack.modules.push(m); S.orgSel = 'mod:' + slot; });
        toast(`Module ${type} added in slot ${slot}: its tags are ${['C', 'I', 'O'].filter(k => (E.MODULES[type] || {})[k]).map(k => `Local:${slot}:${k}`).join(', ')}`);
        if (op) setTimeout(() => moduleProps(slot), 0); else if (back) setTimeout(back, 0);
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
  /* Revision (major.minor; the minor revision is chosen, major 0-127 and minor 0-255) and Electronic Keying (Exact
     Match, Compatible Module, Disable Keying), as on the General tab (help: Module Properties - General for 1756) */
  function keyRows(m, dis) {
    const [M1, n1] = String(m.rev || E.REV0).split('.'), k = m.key || 'compat';
    return `<div class="frow"><label>Revision</label><span><input class="inp" id="mk-M" type="number" min="0" max="127" value="${M1}" style="width:70px"${dis}> . <input class="inp" id="mk-m" type="number" min="0" max="255" value="${n1}" style="width:70px"${dis}></span></div>
      <div class="frow"><label>Electronic Keying</label><select class="inp" id="mk-k"${dis}>${Object.entries(E.KEYING).map(([v, l]) => `<option value="${v}"${v === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <p class="help" id="mk-h"${k === 'off' ? '' : ' hidden'} style="color:var(--danger)">ATTENTION: Be extremely cautious when using Disable Keying; if used incorrectly, this option can lead to personal injury or death, property damage, or economic loss. With Disable Keying, communication can occur with a device other than the type specified in the project.</p>`;
  }
  function keyMount(el) { const k = el.querySelector('#mk-k'); if (k) k.onchange = () => { el.querySelector('#mk-h').hidden = k.value !== 'off'; }; }
  function keyRead(el) {
    const M1 = el.querySelector('#mk-M').value.trim(), n1 = el.querySelector('#mk-m').value.trim();
    if (!/^\d+$/.test(M1) || +M1 > 127 || !/^\d+$/.test(n1) || +n1 > 255) { toast('Revision: major 0 to 127, minor 0 to 255.', 'err'); return null; }
    return { rev: `${+M1}.${+n1}`, key: el.querySelector('#mk-k').value };
  }
  /* Module Properties, as in the reference: General, Connection (Inhibit, Major Fault on Controller), Status */
  function moduleProps(slot, tab) {
    const m = S.p.rack.modules.find(x => x.slot === slot);
    if (!m) return;
    const d = E.MODULES[m.type] || {};
    const used = new Set(S.p.rack.modules.filter(x => x !== m).map(x => x.slot).concat(ctlSlot())), slots = [];
    for (let s = 0; s < S.p.rack.size; s++) if (!used.has(s)) slots.push(s);
    const st = S.online && ctl.M ? ctl.moduleStatus(slot) : null;
    const io = S.online && ctl.M && ctl.M.mods.get(slot) ? ctl.ioImage(slot) : null;
    const card = chassis.module(slot);
    const dis = offline() ? '' : ' disabled';
    const general = `<div class="frow"><label>Type</label><span>${esc(m.type)} <span class="muted">· ${esc(MODNAMES[m.type] || '')}</span></span></div>
      <div class="frow"><label>Name</label><input class="inp" id="mp-n" value="${esc(m.name)}"${dis}></div>
      <div class="frow"><label>Description</label><input class="inp" id="mp-d" value="${esc(m.desc || '')}"${dis}></div>
      <div class="frow"><label>Slot</label><select class="inp" id="mp-s"${dis}>${slots.map(s => `<option${s === slot ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
      ${keyRows(m, dis)}
      <div class="frow"><label>Tags</label><span class="mono">${['C', 'I', 'O'].filter(x => d[x]).map(x => `Local:${slot}:${x}`).join(', ') || '-'}</span></div>`;
    const conn = `<div class="frow"><label>Requested Packet Interval (RPI)</label><span><input class="inp" id="mp-r" type="number" min="${E.RPI[0]}" max="${E.RPI[1]}" step="0.1" value="${m.rpi || 20}" style="width:110px"${dis}> ms <span class="muted">(${E.RPI[0].toFixed(1)} - ${E.RPI[1].toFixed(1)} ms)</span></span></div>
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
        const rpi = +el2.querySelector('#mp-r').value, kr = keyRead(el2);
        if (!(rpi >= E.RPI[0] && rpi <= E.RPI[1])) { toast(`Enter an RPI from ${E.RPI[0].toFixed(1)} to ${E.RPI[1].toFixed(1)} ms.`, 'err'); return false; }
        if (!kr) return false;
        const nv = { slot: ns, type: m.type, name, desc: el2.querySelector('#mp-d').value.trim(), rpi: Math.round(rpi * 10) / 10, inhibit: el2.querySelector('#mp-i').checked, majorOnFail: el2.querySelector('#mp-f').checked, rev: kr.rev, key: kr.key };
        if (nv.rev === E.REV0) delete nv.rev;
        if (nv.key === 'compat') delete nv.key;
        if (!nv.desc) delete nv.desc;
        if (!nv.inhibit) delete nv.inhibit;
        if (!nv.majorOnFail) delete nv.majorOnFail;
        if (JSON.stringify(nv) !== JSON.stringify(m)) edit(() => { S.p.rack.modules.splice(S.p.rack.modules.indexOf(m), 1, nv); });
      } }],
      mount: e2 => {
        bindTabs(e2); keyMount(e2);
        const x = e2.querySelector('#mp-x');
        if (x) x.onclick = () => { chassis.setFault(slot, !card.fault); chassis.advance(0); live(true); render(); moduleProps(slot, 'st'); };
      } });
  }
  /* Controller Properties: General, Major Faults, Minor Faults */
  let orgTap = { k: '', t: 0 };
  /* Task Properties: General, Configuration, Program Schedule, Monitor (the reference's tabs; one continuous task here) */
  function taskProps(name) {
    const T = S.p.tasks.find(x => x.name === name); if (!T) return;
    const dis = editable() ? '' : ' disabled', on = S.online && ctl.M;
    const general = `<div class="frow"><label>Name</label><input class="inp" id="tp-n" value="${esc(T.name)}"${offline() ? '' : ' disabled'}></div>
      <div class="frow"><label>Description</label><textarea class="inp" id="tp-d" rows="3"${dis}>${esc(T.desc || '')}</textarea></div>`;
    const conf = `<div class="frow"><label>Type</label><select class="inp" id="tp-t" disabled><option>Continuous</option></select></div>
      <div class="frow"><label>Watchdog (ms)</label><input class="inp" id="tp-w" type="number" min="1" max="2000000" value="${T.watchdog || 500}"${dis}></div>
      <label class="ck"><input type="checkbox" id="tp-o"${T.noOutputs ? ' checked' : ''}${dis}> Disable automatic output processing to reduce task overhead</label>
      <label class="ck"><input type="checkbox" id="tp-i"${T.inhibit ? ' checked' : ''}${dis}> Inhibit task</label>
      <p class="help">This controller has one continuous task. Periodic and event tasks are not emulated.</p>`;
    const sched = `<div class="grp">Scheduled programs</div>${T.programs.map((g, i) => `<div class="row"><span class="mono">${i + 1}</span><span class="grow">${esc(g.name)}</span></div>`).join('') || '<p class="help">None.</p>'}`;
    const mon = on ? `${kv('Last scan time', ((ctl.scanUs || 0) / 1000).toFixed(3) + ' ms')}${kv('Maximum scan time', ((ctl.maxScanUs || 0) / 1000).toFixed(3) + ' ms')}${kv('Scan period', ctl.period + ' ms')}${kv('Scans', ctl.scans)}<div class="brow"><button class="btn" id="tp-r">Reset</button></div>`
      : '<p class="help">Offline. Go online to see the scan times.</p>';
    dialog({ title: 'Task Properties - ' + T.name, size: 'md',
      body: tabbed([['gen', 'General', general], ['cfg', 'Configuration', conf], ['sch', 'Program Schedule', sched], ['mon', 'Monitor', mon]], 'gen'),
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        if (!editable()) return;
        const n = el.querySelector('#tp-n').value.trim(), d = el.querySelector('#tp-d').value.trim(), w = Math.max(1, +el.querySelector('#tp-w').value || 500);
        if (!E.validName(n)) { toast('Name: letters, digits and _ (up to 40).', 'err'); return false; }
        const no = el.querySelector('#tp-o').checked, inh = el.querySelector('#tp-i').checked;
        if (n === T.name && d === (T.desc || '') && w === (T.watchdog || 500) && no === !!T.noOutputs && inh === !!T.inhibit) return;
        edit(() => { T.name = n; if (d) T.desc = d; else delete T.desc; T.watchdog = w; if (no) T.noOutputs = true; else delete T.noOutputs; if (inh) T.inhibit = true; else delete T.inhibit; });
      } }],
      mount: el => { bindTabs(el); const r = el.querySelector('#tp-r'); if (r) r.onclick = () => { ctl.maxScanUs = 0; taskProps(name); }; } });
  }
  /* Program Properties: General, Configuration (main and fault routines), Monitor */
  function progProps(name) {
    const g = allProgs().find(x => x.name === name); if (!g) return;
    const dis = editable() ? '' : ' disabled', opts = sel => `<option value="">&lt;none&gt;</option>${g.routines.map(r => `<option${r.name === sel ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}`;
    const general = `<div class="frow"><label>Name</label><input class="inp" id="pp-n" value="${esc(g.name)}" disabled></div>
      <div class="frow"><label>Description</label><textarea class="inp" id="pp-d" rows="3"${dis}>${esc(g.desc || '')}</textarea></div>
      ${kv('Scheduled in', esc((S.p.tasks.find(t => t.programs.includes(g)) || {}).name || '-'))}`;
    const conf = `<div class="frow"><label>Main</label><select class="inp" id="pp-m"${dis}>${opts(g.main)}</select></div>
      <div class="frow"><label>Fault</label><select class="inp" id="pp-f"${dis}>${opts(g.fault)}</select></div>
      <label class="ck"><input type="checkbox" id="pp-i"${g.inhibit ? ' checked' : ''}${dis}> Inhibit program</label>
      <p class="help">The main routine runs each scan; it calls the other routines with JSR.</p>`;
    const mon = `${kv('Routines', g.routines.length)}${kv('Rungs', g.routines.reduce((n, r) => n + r.rungs.length, 0))}${kv('Program tags', (g.tags || []).length)}`;
    dialog({ title: 'Program Properties - ' + g.name, size: 'md',
      body: tabbed([['gen', 'General', general], ['cfg', 'Configuration', conf], ['mon', 'Monitor', mon]], 'gen'),
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        if (!editable()) return;
        const d = el.querySelector('#pp-d').value.trim(), m = el.querySelector('#pp-m').value, fr = el.querySelector('#pp-f').value, inh = el.querySelector('#pp-i').checked;
        if (d === (g.desc || '') && m === (g.main || '') && fr === (g.fault || '') && inh === !!g.inhibit) return;
        edit(() => { if (d) g.desc = d; else delete g.desc; g.main = m || undefined; if (!m) delete g.main; if (fr) g.fault = fr; else delete g.fault; if (inh) g.inhibit = true; else delete g.inhibit; });
      } }],
      mount: bindTabs });
  }
  /* Routine Properties: General (name, description, type, program, rungs) */
  function routineProps(key) {
    const [gn, rn] = key.slice(3).split('/'), g = allProgs().find(x => x.name === gn), r = g && g.routines.find(x => x.name === rn);
    if (!r) return;
    const dis = editable() ? '' : ' disabled';
    dialog({ title: 'Routine Properties - ' + r.name, size: 'md',
      body: `<div class="frow"><label>Name</label><input class="inp" id="rp-n" value="${esc(r.name)}"${dis}></div>
        <div class="frow"><label>Description</label><textarea class="inp" id="rp-d" rows="3"${dis}>${esc(r.desc || '')}</textarea></div>
        ${kv('Type', 'Ladder Diagram')}${kv('In program', esc(g.name))}${kv('Number of rungs', r.rungs.length)}${kv('Main routine', g.main === r.name ? 'Yes' : 'No')}`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        if (!editable()) return;
        const n = el.querySelector('#rp-n').value.trim(), d = el.querySelector('#rp-d').value.trim();
        if (!E.validName(n)) { toast('Name: letters, digits and _ (up to 40).', 'err'); return false; }
        if (n !== r.name && g.routines.some(x => U(x.name) === U(n))) { toast('A routine with that name exists.', 'err'); return false; }
        if (n === r.name && d === (r.desc || '')) return;
        edit(() => { if (n !== r.name) { S.tabs = S.tabs.map(k => (k === gn + '/' + rn ? gn + '/' + n : k)); if (g.main === rn) g.main = n; if (g.fault === rn) g.fault = n; if (S.routine === rn && S.prog === gn) S.routine = n; r.name = n; } if (d) r.desc = d; else delete r.desc; });
      } }] });
  }
  /* Change Controller (Controller Properties > General > Change Controller…, help v37): the type and the revision,
     From and To; then the confirmation of the type change (Yes / No). The logic, tags and I/O configuration stay. */
  function changeController() {
    const c = S.p.controller, from = ctype(c.type), fromRev = ctlLabel(S.p).split(' ')[1];
    const revs = t => ctype(t)[2].map(r => `<option${r === (t === c.type ? fromRev : ctype(t)[2][ctype(t)[2].length - 1]) ? ' selected' : ''}>${r}</option>`).join('');
    const el = dialog({ title: 'Change Controller', size: 'md',
      body: `<table class="iht"><thead><tr><th></th><th>From</th><th>To</th></tr></thead><tbody>
          <tr><td>Type</td><td class="mono">${esc(from[0])} ${esc(from[1])}</td><td><select class="inp" id="cc-t">${CTYPES.map(([t, d]) => `<option value="${t}"${t === from[0] ? ' selected' : ''}>${t} ${esc(d)}</option>`).join('')}</select></td></tr>
          <tr><td>Revision</td><td class="mono">${esc(fromRev)}</td><td><select class="inp" id="cc-r">${revs(from[0])}</select></td></tr></tbody></table>
        <p class="help" id="cc-h"></p>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: e2 => {
        const t = e2.querySelector('#cc-t').value, r = e2.querySelector('#cc-r').value;
        if (t === from[0] && r === fromRev) return;
        if (t === from[0]) { edit(() => { c.rev = r; }); render(); toast(`Revision changed to ${r}.`, 'ok'); return; }
        setTimeout(() => confirmDlg('Confirm Controller Type Change', `Change the controller from <b>${esc(from[0])}</b> to <b>${esc(t)}</b>, revision ${esc(r)}?</p>
          <ul><li>The logic, the tags, the data types and the I/O configuration are kept.</li>
          <li>${t === 'PLC-CPU' ? 'The project can be downloaded to the emulated controller again.' : `A ${esc(t)} project cannot be downloaded to the emulated controller (PLC-CPU): export it to L5X for Studio 5000, or change the type back.`}</li>
          <li>Check the I/O configuration and the aliases of the I/O points for the real modules.</li></ul><p>`, 'Yes', () => { edit(() => { c.type = t; c.rev = r; }); render(); toast(`Controller changed to ${t} ${r}.`, 'ok'); }), 0);
      } }] });
    const sel = el.querySelector('#cc-t'), help = () => { el.querySelector('#cc-h').textContent = sel.value === 'PLC-CPU' ? 'PLC-CPU runs on the emulator of this app.' : `${ctype(sel.value)[1]}: for the L5X export to Studio 5000. The emulator runs PLC-CPU projects only.`; };
    sel.onchange = () => { el.querySelector('#cc-r').innerHTML = revs(sel.value); help(); };
    help();
  }
  function controllerProps(tab) {
    const on = S.online && ctl.M, dis = offline() ? '' : ' disabled';
    const general = `<div class="frow"><label>Name</label><input class="inp" id="cp-n" value="${esc(S.p.controller.name)}"${dis}></div>
      <div class="frow"><label>Description</label><input class="inp" id="cp-d" value="${esc(S.p.controller.desc || '')}"${dis}></div>
      ${kv('Vendor', emuCtl(S.p) ? 'MT PLC Studio' : 'Allen-Bradley')}${kv('Type', `${esc(ctype(S.p.controller.type)[0])} ${esc(ctype(S.p.controller.type)[1])}`)}${kv('Revision', esc(ctlLabel(S.p).split(' ')[1]))}
      <div class="brow" style="margin-top:0"><button class="btn" id="cp-cc"${dis}>Change Controller…</button></div>${kv('Chassis', `PLC-RACK${S.p.rack.size}`)}
      <div class="frow"><label>Slot</label><select class="inp" id="cp-s"${dis}>${Array.from({ length: S.p.rack.size }, (_, i) => i).filter(i => i === ctlSlot() || !S.p.rack.modules.some(m => m.slot === i)).map(i => `<option${i === ctlSlot() ? ' selected' : ''}>${i}</option>`).join('')}</select></div>${kv('Path', esc(curPath()))}
      <p class="help">The name is also the project name.</p>`;
    const offMsg = '<p class="help">Offline. Go online to see the faults of the controller.</p>';
    const dateTab = `${kv('Controller time', new Date().toLocaleString())}<p class="help">The emulated controller uses the clock of this device.</p>`;
    const advTab = `${kv('Controller Fault Handler', esc((handlerProg('fault') || {}).name || '<none>'))}${kv('Power-Up Handler', esc((handlerProg('powerup') || {}).name || '<none>'))}${kv('System overhead time slice', '20 %')}${kv('Scan period', (ctl.period || 10) + ' ms')}`;
    /* Project tab (v37 help, Controller Properties dialog box - Project tab): the project file, not the controller */
    const inf = S.p.info || {}, dt = t => (t ? esc(new Date(t).toLocaleString()) : '<span class="muted">-</span>'), fp = S.file ? S.file.path : '';
    const projTab = `${kv('Name', fp ? esc(baseName(fp)) : '<span class="muted">(not saved yet)</span>')}${kv('Path', fp ? esc(fp.slice(0, fp.length - baseName(fp).length) || '/') : '<span class="muted">-</span>')}${kv('Created', dt(inf.created))}${kv('Edited', dt(inf.edited))}
      <label class="ck"><input type="checkbox" id="cp-docs"${(on ? ctl.docs !== false : !S.p.noDocs) ? ' checked' : ''}${offline() ? '' : ' disabled'}> Download Project Documentation and Extended Properties</label>
      <p class="help">${offline() ? 'Cleared: the descriptions and rung comments do not go to the controller, so an upload has none.' : 'Online: the setting of the project in the controller.'} To change the file name or path, use Save As.</p>`;
    const allR = allProgs().flatMap(g => g.routines);
    const memTab = `${kv('Programs', allProgs().length)}${kv('Routines', allR.length)}${kv('Rungs', allR.reduce((n, r) => n + r.rungs.length, 0))}${kv('Controller tags', S.p.tags.length)}${kv('Program tags', allProgs().reduce((n, g) => n + (g.tags || []).length, 0))}${kv('I/O modules', S.p.rack.modules.length)}`;
    const row = f => `<div class="row"><div class="grow"><div class="sub" style="white-space:normal">${when(f.at)} · Type ${f.type} Code ${f.code}: ${esc(f.text)}${f.count > 1 ? ` (×${f.count})` : ''}</div></div></div>`;
    const majors = !on ? offMsg
      : (ctl.fault ? `<div class="kv" style="color:var(--danger)"><span>Current fault</span><span class="v">Type ${ctl.fault.type}, Code ${ctl.fault.code}</span></div><p>${esc(ctl.fault.text)}</p>` : '<p><b style="color:var(--ok)">No major faults.</b></p>') +
        (ctl.majors.length ? `<div class="grp">Recent</div>${ctl.majors.map(row).join('')}` : '') +
        `<div class="brow"><button class="btn danger" id="cp-cm"${ctl.fault ? '' : ' disabled'}>Clear Majors</button></div>`;
    const minors = !on ? offMsg
      : (ctl.minors.length ? ctl.minors.map(row).join('') : '<p><b style="color:var(--ok)">No minor faults.</b></p>') +
        `<div class="brow"><button class="btn" id="cp-cn"${ctl.minors.length ? '' : ' disabled'}>Clear Minors</button></div>`;
    dialog({ title: 'Controller Properties - ' + S.p.controller.name, size: 'md',
      body: tabbed([['gen', 'General', general], ['maj', 'Major Faults' + (on && ctl.fault ? ' ⚠' : ''), majors], ['min', 'Minor Faults', minors], ['dt', 'Date/Time', dateTab], ['adv', 'Advanced', advTab], ['proj', 'Project', projTab], ['mem', 'Memory', memTab]], tab || (on && ctl.fault ? 'maj' : 'gen')),
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        if (!offline()) return;
        const v = el.querySelector('#cp-n').value.trim(), desc = el.querySelector('#cp-d').value.trim(), cs = +el.querySelector('#cp-s').value;
        if (cs !== ctlSlot()) edit(() => { S.p.controller.slot = cs; });
        const docs = el.querySelector('#cp-docs').checked;
        if (docs === !!S.p.noDocs) edit(() => { if (docs) delete S.p.noDocs; else S.p.noDocs = true; });
        if (!E.validName(v)) { toast('Name: letters, digits and _ (up to 40).', 'err'); return false; }
        const old = S.p.controller.name;
        if (v === old && desc === (S.p.controller.desc || '')) return;
        edit(() => { S.p.controller.name = v; if (desc) S.p.controller.desc = desc; else delete S.p.controller.desc; });
      } }],
      mount: el => {
        bindTabs(el);
        const cm = el.querySelector('#cp-cm'), cn = el.querySelector('#cp-cn'), cc = el.querySelector('#cp-cc');
        if (cc) cc.onclick = () => { if (offline()) changeController(); };
        if (cm) cm.onclick = () => { ctl.clearFault(); live(true); render(); controllerProps('maj'); };
        if (cn) cn.onclick = () => { ctl.clearMinors(); controllerProps('min'); };
      } });
  }

  /* ---------- data types: the Data Type Editor (v37 help: Using user-defined data types; Data Type Editor) ----------
     Data Types > User-Defined > New Data Type: Name (40 characters), Description (512), the members (Name, Data Type,
     Style, Description, External Access; a new row is added as one is typed), Size (read-only, worked out when the
     type is saved), then Apply (save, keep editing) or OK (save and close). A member array has one dimension
     (1756-PM004). The members are kept as { name, type, dim, desc, style, access } in project.dataTypes. */
  const udtOf = n => (S.p.dataTypes || []).find(d => U(d.name) === U(n) && d.family !== 'string');
  // the tags (any scope) and the user types whose members use a data type: a type in use cannot be deleted
  function typeUsers(n) {
    const u = U(n), out = [];
    S.p.tags.forEach(t => { if (!t.alias && U(t.type || '') === u) out.push(t.name); });
    allProgs().forEach(g => g.tags.forEach(t => { if (!t.alias && U(t.type || '') === u) out.push(g.name + '/' + t.name); }));
    (S.p.dataTypes || []).forEach(d => (d.members || []).forEach(m => { if (U(m.type) === u) out.push(d.name + '.' + m.name); }));
    return out;
  }
  const sizeText = n => { const b = E.typeSize(S.p, n); return b == null ? '' : `${b} byte${b === 1 ? '' : 's'}`; };
  const memTypeText = m => m.type + (m.dim > 0 ? `[${m.dim}]` : '');
  function dataTypeEditor(name) {
    const d0 = name ? udtOf(name) : null;
    if (name && !d0) return;
    let cur = d0;   // the type as last saved (Apply / OK)
    const ro = S.online && !!d0 && typeUsers(d0.name).length > 0;
    const accSel = a => `<select class="cin" data-mf="access" aria-label="External Access"${ro ? ' disabled' : ''}>${ACCESS.map(x => `<option${x === (a || 'Read/Write') ? ' selected' : ''}>${x}</option>`).join('')}</select>`;
    const stySel = (ty, st) => { const l = ty ? stylesOf(ty) : []; return `<select class="cin" data-mf="style" aria-label="Style"${!l.length || ro ? ' disabled' : ''}>${l.map(x => `<option${x === (l.includes(st) ? st : defStyle(ty)) ? ' selected' : ''}>${x}</option>`).join('')}</select>`; };
    const rowHTML = m => `<tr data-mrow="1"><td><input class="cin mono" data-mf="name" value="${esc(m.name || '')}" placeholder="${m.name ? '' : 'Add Member…'}" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="Member Name"${ro ? ' readonly' : ''}></td>
      <td><span class="cdt"><input class="cin mono" data-mf="type" value="${esc(m.type ? memTypeText(m) : '')}" list="dtel" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="Data Type"${ro ? ' readonly' : ''}><button class="cdtb" type="button" data-mdt="1" title="Select Data Type" aria-label="Select Data Type"${ro ? ' disabled' : ''}>…</button></span></td>
      <td>${stySel(m.type || '', m.style)}</td><td><input class="cin" data-mf="desc" value="${esc(m.desc || '')}" aria-label="Description"${ro ? ' readonly' : ''}></td><td>${accSel(m.access)}</td>
      <td class="ck"><button class="ib" type="button" data-mdel="1" title="Delete Member" aria-label="Delete Member"${ro ? ' disabled' : ''}>${ic('close')}</button></td></tr>`;
    const body = `<div class="frow"><label for="dten">Name</label><input class="inp mono" id="dten" value="${esc(d0 ? d0.name : '')}" maxlength="40" autocomplete="off" spellcheck="false" autocapitalize="off"${ro ? ' readonly' : ''}></div>
      <div class="frow"><label for="dted">Description</label><textarea class="inp" id="dted" rows="2" maxlength="512"${ro ? ' readonly' : ''}>${esc(d0 ? d0.desc || '' : '')}</textarea></div>
      <div class="frow"><label>Members</label><span class="muted" id="dtes">Data Type Size: ${d0 ? sizeText(d0.name) : '(worked out when the type is saved)'}</span></div>
      <div class="tagtbl dtegrid"><table><thead><tr><th>Name</th><th>Data Type</th><th>Style</th><th>Description</th><th>External Access</th><th></th></tr></thead><tbody id="dterows">${(d0 ? d0.members : []).map(rowHTML).join('')}${ro ? '' : rowHTML({})}</tbody></table></div>
      <datalist id="dtel">${tagTypes().map(t => `<option value="${esc(t)}">`).join('')}</datalist>
      ${ro ? '<p class="help">The controller is online and this data type is in use: change it offline.</p>' : ''}<div class="errtx" id="dtee"></div>`;
    const grab = el => [...el.querySelectorAll('#dterows tr')].map(tr => { const f = k => tr.querySelector(`[data-mf="${k}"]`); return { name: f('name').value.trim(), type: f('type').value.trim(), style: f('style').value, desc: f('desc').value.trim(), access: f('access').value }; }).filter(m => m.name || m.type);
    // check and save the type; the text of the first problem, or '' when it was saved
    const save = el => {
      const name = el.querySelector('#dten').value.trim(), desc = el.querySelector('#dted').value.trim(), rows = grab(el);
      if (!E.validName(name)) return 'Name: letters, digits and _, starting with a letter or _, up to 40 characters, no two _ in a row and no _ at the end.';
      const taken = E.ATOMIC.concat(Object.keys(E.PREDEF), Object.keys(E.MODTYPES), (S.p.dataTypes || []).filter(d => d !== cur).map(d => d.name));
      if (taken.some(t => U(t) === U(name))) return `A data type named ${name} already exists.`;
      const mems = [], seen = new Set();
      for (const r of rows) {
        if (!E.validName(r.name)) return `Member '${r.name || '?'}': letters, digits and _, starting with a letter or _, up to 40 characters.`;
        if (seen.has(U(r.name))) return `Member ${r.name} is defined more than once.`;
        seen.add(U(r.name));
        const m = /^([A-Za-z_][\w:]*)\s*(?:\[\s*(\d+)\s*\])?$/.exec(r.type);
        if (!m) return `Member ${r.name}: type a data type, e.g. DINT or DINT[10] (a member array has one dimension).`;
        const ty = tagTypes().concat(Object.keys(E.MODTYPES)).find(x => U(x) === U(m[1]));
        if (!ty) return `Member ${r.name}: '${m[1]}' is not a data type of this project.`;
        if (U(ty) === U(name) || (cur && U(ty) === U(cur.name))) return `Member ${r.name}: a data type cannot contain itself.`;
        const o = { name: r.name, type: ty };
        if (m[2] != null) { if (!(+m[2] > 0)) return `Member ${r.name}: the array size must be 1 or more.`; o.dim = +m[2]; }
        if (r.desc) o.desc = r.desc;
        if (r.style && r.style !== defStyle(ty) && stylesOf(ty).includes(r.style)) o.style = r.style;
        if (r.access && r.access !== 'Read/Write') o.access = r.access;
        mems.push(o);
      }
      // a type that holds this one, directly or deeper, cannot become one of its members
      const holds = (t, seen2 = new Set()) => { const d = udtOf(t); if (!d || seen2.has(U(t))) return false; seen2.add(U(t)); return d.members.some(x => (cur && U(x.type) === U(cur.name)) || holds(x.type, seen2)); };
      const loop = mems.find(x => holds(x.type));
      if (loop) return `Member ${loop.name}: ${loop.type} contains ${name}, so ${name} cannot contain it.`;
      const nd = { name, members: mems }; if (desc) nd.desc = desc;
      const was = cur;
      const ok = edit(() => {
        S.p.dataTypes = S.p.dataTypes || [];
        if (was) {
          S.p.dataTypes[S.p.dataTypes.indexOf(was)] = nd;
          // a renamed type: the tags and the members that use it follow
          if (U(was.name) !== U(name) || was.name !== name) {
            const fix = t => { if (!t.alias && U(t.type || '') === U(was.name)) t.type = name; };
            S.p.tags.forEach(fix); allProgs().forEach(g => g.tags.forEach(fix));
            S.p.dataTypes.forEach(d => (d.members || []).forEach(x => { if (U(x.type) === U(was.name)) x.type = name; }));
          }
        } else S.p.dataTypes.push(nd);
      });
      if (!ok) return 'The data type could not be saved.';
      cur = nd;
      return '';
    };
    const el = dialog({
      title: d0 ? `Data Type: ${d0.name}` : 'New Data Type', size: 'lg', body,
      noEnter: ev => !!ev.target.closest('#dterows'),
      mount: el => {
        const tb = el.querySelector('#dterows');
        const err = el.querySelector('#dtee');
        // the last row is the new-member row: typing in it adds the next blank row
        tb.addEventListener('input', ev => {
          const tr = ev.target.closest('tr');
          if (ev.target.dataset.mf === 'type') { const s = tr.querySelector('[data-mf="style"]'), ty = ev.target.value.replace(/\[.*$/, '').trim(); s.outerHTML = stySel(ty, s.value); }
          if (tr === tb.lastElementChild && !ro && ev.target.value.trim()) { tr.querySelector('[data-mf="name"]').placeholder = ''; tb.insertAdjacentHTML('beforeend', rowHTML({})); }
        });
        tb.addEventListener('click', ev => {
          const tr = ev.target.closest('tr'); if (!tr) return;
          if (ev.target.closest('[data-mdel]')) { if (tr !== tb.lastElementChild) tr.remove(); else tr.querySelectorAll('input').forEach(i => { i.value = ''; }); return; }
          if (ev.target.closest('[data-mdt]')) {
            const f = tr.querySelector('[data-mf="type"]');
            selectDataType(f.value, v => { f.value = v.replace(/\[(\d+),.*\]$/, '[$1]'); f.dispatchEvent(new Event('input', { bubbles: true })); f.focus(); }, () => f.focus());
          }
        });
        tb.addEventListener('keydown', ev => {
          if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT') return;
          ev.preventDefault();
          const tr = ev.target.closest('tr'), nx = tr.nextElementSibling; if (nx) nx.querySelector('[data-mf="name"]').focus();
        });
        el._err = err;
      },
      buttons: [{ l: 'Cancel' },
        { l: 'Apply', run: el => {
          if (ro) return false;
          const e = save(el); el.querySelector('#dtee').textContent = e;
          if (!e) { el.querySelector('#dtes').textContent = 'Data Type Size: ' + sizeText(cur.name); el.querySelector('.dh b').textContent = 'Data Type: ' + cur.name; toast(`Data type ${cur.name} saved`); }
          return false;
        } },
        { l: 'OK', pri: true, run: el => {
          if (ro) return;
          const e = save(el); if (e) { el.querySelector('#dtee').textContent = e; return false; }
          toast(`Data type ${cur.name} saved (${sizeText(cur.name)})`);
        } }],
    });
    return el;
  }
  function deleteDataType(n) {
    const d = (S.p.dataTypes || []).find(x => U(x.name) === U(n)); if (!d) return;
    const users = typeUsers(d.name);
    if (users.length) { toast(`Data type ${d.name} is used by ${users.slice(0, 3).join(', ')}${users.length > 3 ? '…' : ''}: it cannot be deleted.`, 'err'); return; }
    confirmDlg('Delete Data Type', `Delete the data type <b>${esc(d.name)}</b>? Yes removes it from the controller; No leaves it as it is.`, 'Yes', () => { edit(() => { S.p.dataTypes.splice(S.p.dataTypes.indexOf(d), 1); }); toast(`Data type ${d.name} deleted`); }, true);
  }
  /* the organizer's data type nodes: double-click (or tap again) opens the editor; their right-click menus */
  function dtOpen(k) {
    if (k.startsWith('dt:u:')) { dataTypeEditor(k.slice(5)); return true; }
    if (k.startsWith('dt:s:')) { stringTypeEditor(k.slice(5)); return true; }
    if (k.startsWith('trend:')) { openTrend(k.slice(6)); return true; }
    return false;
  }
  function dtMenu(k) {
    const nst = { l: 'New String Type…', i: 'text', run: () => stringTypeEditor(), dis: !editable() };
    if (k === 'dts') return [{ l: 'New Data Type…', i: 'tags', run: () => dataTypeEditor(), dis: !editable() }, nst];
    if (k === 'dt:user') return [{ l: 'New Data Type…', i: 'tags', run: () => dataTypeEditor(), dis: !editable() }, { l: 'Import Data Type…', i: 'upload', run: () => { S.orgSel = k; importComponent('DataType'); }, dis: !editable() || !offline() }];
    if (k === 'dt:str') return [nst];
    if (k === 'trends') return [{ l: 'New Trend…', i: 'xref', run: () => trendDialog(), dis: S.noProj }];
    if (k.startsWith('trend:')) { const n = k.slice(6); return [{ l: 'Open', run: () => openTrend(n) }, '-', { l: 'Delete', i: 'trash', run: () => deleteTrend(n) }, '-', { l: 'Properties…', run: () => trendDialog(n) }]; }
    if (k.startsWith('dt:s:')) { const n = k.slice(5); return [{ l: 'Open', run: () => stringTypeEditor(n) }, '-', { l: 'Delete', i: 'trash', run: () => deleteDataType(n), dis: !editable() || U(n) === 'STRING' }]; }
    if (k.startsWith('dt:u:')) { const n = k.slice(5); const d = (S.p.dataTypes || []).find(x => x.name === n); return [{ l: 'Open', run: () => dataTypeEditor(n) }, '-', { l: 'Delete', i: 'trash', run: () => deleteDataType(n), dis: !editable() }, '-', { l: 'Export Data Type…', i: 'download', run: () => exportComponent('DataType', { d }), dis: !d }]; }
    return null;
  }
  /* L5X: the user-defined types as the L5X reference writes them (general knowledge, not checked against an export):
     BOOL members are bits (DataType="BIT") of a hidden SINT member named ZZZZZZZZZZ<type><n> */
  function l5xTypes(p, x, cd) {
    const list = (p.dataTypes || []);
    if (!list.length) return '<DataTypes/>';
    const mem = (m, extra) => `<Member Name="${x(m.name)}" DataType="${x(m.type)}" Dimension="${m.dim > 0 ? m.dim : 0}" Radix="${x(stylesOf(m.type).length ? (stylesOf(m.type).includes(m.style) ? m.style : defStyle(m.type)) : 'NullType')}" Hidden="false"${extra || ''} ExternalAccess="${x(accessOf(m))}">${m.desc ? `<Description>${cd(m.desc)}</Description>` : ''}</Member>`;
    return `<DataTypes>\n${list.map(d => {
      if (d.family === 'string') return `<DataType Name="${x(d.name)}" Family="StringFamily" Class="User">${d.desc ? `<Description>${cd(d.desc)}</Description>` : ''}<Members><Member Name="LEN" DataType="DINT" Dimension="0" Radix="Decimal" Hidden="false" ExternalAccess="Read/Write"/><Member Name="DATA" DataType="SINT" Dimension="${d.len}" Radix="ASCII" Hidden="false" ExternalAccess="Read/Write"/></Members></DataType>`;
      let host = null, bit = 8, n = 0;
      const ms = (d.members || []).map(m => {
        if (U(m.type) === 'BOOL' && !(m.dim > 0)) {
          let h = '';
          if (bit >= 8) { host = `ZZZZZZZZZZ${d.name}${n++}`; bit = 0; h = `<Member Name="${x(host)}" DataType="SINT" Dimension="0" Radix="Decimal" Hidden="true" ExternalAccess="Read/Write"/>`; }
          return h + mem({ ...m, type: 'BIT' }, ` Target="${x(host)}" BitNumber="${bit++}"`).replace(' Radix="NullType"', ' Radix="Decimal"');
        }
        bit = 8; return mem(m);
      }).join('');
      return `<DataType Name="${x(d.name)}" Family="NoFamily" Class="User">${d.desc ? `<Description>${cd(d.desc)}</Description>` : ''}<Members>${ms}</Members></DataType>`;
    }).join('\n')}\n</DataTypes>`;
  }
  /* ---------- the Watch tab of the Output window (v37 help: About the Output Window; Create and use a Quick Watch
     list): View > Watch. The Quick Watch menu lists the open routines (all the tags of that routine) and the saved
     Quick Watch lists; tags are added by typing a name in the grid (Name, Scope, Value, Description, sorted by a
     click on Name, Scope or Description). A list gets a name in the box beside the menu (Enter) and is then saved with
     the project; an unnamed list is lost when the app closes. The Value is live online; offline it shows the last
     online value. Online a click on a Value toggles a BOOL or writes a number. ---------- */
  const W = { sel: '', tags: [], sort: null, last: new Map(), at: 0 };
  const wLists = () => (S.p && Array.isArray(S.p.watch) ? S.p.watch : []);
  // the tag of a watch row: a program tag of its scope, or a controller tag
  const wTag = r => (r.scope ? (allProgs().find(g => g.name === r.scope) || { tags: [] }).tags : S.p.tags).find(t => U(t.name) === U(r.name.split(/[.[]/)[0])) || null;
  function wRows() {
    if (W.sel.startsWith('rt:')) {
      const [g, rn] = W.sel.slice(3).split('/'), P = allProgs().find(x => x.name === g), R = P && P.routines.find(x => x.name === rn), seen = new Set(), out = [];
      if (!R) return [];
      const add = a => { const b = (/^[A-Za-z_]\w*/.exec(String(a)) || [])[0]; if (!b || seen.has(U(b))) return; const pt = P.tags.find(t => U(t.name) === U(b)), ct = S.p.tags.find(t => U(t.name) === U(b)); if (!pt && !ct) return; seen.add(U(b)); out.push({ name: (pt || ct).name, scope: pt ? P.name : '' }); };
      R.rungs.forEach(x => { const pr = E.parseRung(x.t || ''); const w = a => a.forEach(e => (e.t === 'BR' ? e.legs.forEach(w) : (e.a || []).forEach(o => (String(o).match(/[A-Za-z_][\w]*(?:\[[^\]]*\])?(?:\.\w+)*/g) || []).forEach(add)))); if (!pr.err) w(pr.elems); });
      return out;
    }
    if (W.sel.startsWith('list:')) { const l = wLists().find(x => x.name === W.sel.slice(5)); return l ? l.tags : []; }
    return W.tags;
  }
  const wType = r => { const t = wTag(r); return t ? (r.name.includes('.') || r.name.includes('[') ? addrType(r.name) || '' : typeOf(t)) : ''; };
  function wVal(r) {
    const k = (r.scope || '') + '|' + U(r.name), t = wTag(r), ty = wType(r);
    if (S.online && ctl.M) {
      if (!t || (membersOf(ty) && !isStrTy(ty)) || (t.dim && !/\[/.test(r.name))) { W.last.set(k, '{…}'); return '{…}'; }
      const v = rowVal(r.name, ty, r.scope, r.name.includes('.') || r.name.includes('[') ? null : t).t;
      W.last.set(k, v); return v;
    }
    return W.last.has(k) ? W.last.get(k) : '';
  }
  function watchHTML() {
    const rows = wRows().slice(), custom = !W.sel.startsWith('rt:');
    if (W.sort) rows.sort((a, b) => { const f = x => (W.sort === 'Scope' ? x.scope || S.p.controller.name : W.sort === 'Description' ? (wTag(x) || {}).desc || '' : x.name); return f(a).localeCompare(f(b)); });
    const opts = S.tabs.filter(k => k !== 'tags').map(k => `<option value="rt:${esc(k)}"${W.sel === 'rt:' + k ? ' selected' : ''}>${esc(k.replace('/', ' - '))}</option>`).join('')
      + wLists().map(l => `<option value="list:${esc(l.name)}"${W.sel === 'list:' + l.name ? ' selected' : ''}>${esc(l.name)}</option>`).join('');
    const names = S.p.tags.concat(curProg().tags).map(t => t.name);
    const row = r => { const t = wTag(r), ty = wType(r); return `<tr data-wrow="${esc((r.scope || '') + '|' + r.name)}"><td class="nm" title="${esc(`${r.name}\nData Type: ${ty || '?'}${t && t.alias ? '\nAlias For: ' + t.alias : ''}\nScope: ${r.scope || S.p.controller.name}`)}">${esc(r.name)}</td><td>${esc(r.scope || S.p.controller.name)}</td><td class="val" data-wval="1">${esc(wVal(r))}</td><td class="ds">${esc(t ? t.desc || '' : 'not a tag of this project')}</td><td class="ck">${custom ? `<button class="ib" type="button" data-wdel="1" title="Remove from the list" aria-label="Remove ${esc(r.name)}">${ic('close')}</button>` : ''}</td></tr>`; };
    return `<div class="wbar"><label for="wsel">Quick Watch:</label><select class="inp" id="wsel"><option value=""${W.sel === '' ? ' selected' : ''}>(Quick Watch list)</option>${opts}</select>
        <input class="inp" id="wname" placeholder="Name the list to save it" value="${esc(W.sel.startsWith('list:') ? W.sel.slice(5) : '')}" maxlength="40" autocomplete="off" spellcheck="false"${custom ? '' : ' disabled'} aria-label="Quick Watch list name">
        <button class="btn" type="button" data-wref="1">Refresh</button></div>
      <div class="tagtbl wtbl"><table><thead><tr>${['Name', 'Scope', 'Value', 'Description'].map(c => `<th${c !== 'Value' ? ` data-wsort="${c}"` : ''}>${c}${W.sort === c ? ' ▲' : ''}</th>`).join('')}<th></th></tr></thead>
        <tbody id="wrows">${rows.map(row).join('')}${custom ? `<tr class="newrow"><td colspan="5"><input class="nrin mono" id="wadd" list="waddl" placeholder="Type a tag name to watch, then Enter" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="Add a tag to watch"><datalist id="waddl">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></td></tr>` : ''}</tbody></table></div>`;
  }
  function showWatch() {
    S.outTab = 'watch';
    if (S.layout === 'desktop') { S.prefs.err = true; savePrefs(); render(); }
    else if (S.layout === 'phone') { S.area = 'more'; render(); }
    else if (innerWidth > innerHeight) { render(); errSheet(); }
    else { S.errOpen = true; render(); }
    setTimeout(() => { const i = $('#wadd'); if (i && S.layout === 'desktop') i.focus(); }, 0);
  }
  // the Values while online: about 5 times a second, only the cells that changed
  function liveWatch(force) {
    const now = performance.now();
    if (!force && now - W.at < 200) return false;
    W.at = now;
    document.querySelectorAll('#wrows tr[data-wrow]').forEach(tr => {
      const k = tr.dataset.wrow, i = k.indexOf('|'), r = { scope: k.slice(0, i), name: k.slice(i + 1) }, c = tr.querySelector('[data-wval]'), v = wVal(r);
      if (c && c.textContent !== v) c.textContent = v;
    });
    return true;
  }
  function wAdd(inp) {
    const v = inp.value.trim(); if (!v) return;
    const b = (/^[A-Za-z_]\w*/.exec(v) || [])[0], P = curProg(), pt = b && P.tags.find(t => U(t.name) === U(b)), ct = b && S.p.tags.find(t => U(t.name) === U(b));
    if (!pt && !ct) { toast(`${v} is not a tag of ${P.name} or of the controller.`, 'err'); return; }
    if (!addrType(v) && !(pt || ct).dim) { toast(`${v} is not a tag, member or bit of this project.`, 'err'); return; }
    const r = { name: v.replace(/^[A-Za-z_]\w*/, (pt || ct).name), scope: pt ? P.name : '' };
    if (W.sel.startsWith('list:')) { const l = wLists().find(x => x.name === W.sel.slice(5)); if (l && !l.tags.some(x => x.name === r.name && x.scope === r.scope)) edit(() => { l.tags.push(r); }); }
    else if (!W.tags.some(x => x.name === r.name && x.scope === r.scope)) { W.tags.push(r); render(); }
    setTimeout(() => { const i = $('#wadd'); if (i) i.focus(); }, 0);
  }
  function wName(inp) {
    const n = inp.value.trim();
    if (!E.validName(n)) { toast('Quick Watch list names: letters, digits and _, up to 40 characters.', 'err'); return; }
    if (W.sel.startsWith('list:')) {
      const l = wLists().find(x => x.name === W.sel.slice(5)); if (!l || l.name === n) return;
      if (wLists().some(x => U(x.name) === U(n))) { toast(`A Quick Watch list named ${n} exists.`, 'err'); return; }
      edit(() => { l.name = n; }); W.sel = 'list:' + n; render(); return;
    }
    if (wLists().some(x => U(x.name) === U(n))) { toast(`A Quick Watch list named ${n} exists.`, 'err'); return; }
    const tags = W.tags.slice();
    edit(() => { S.p.watch = wLists().concat([{ name: n, tags }]); });
    W.tags = []; W.sel = 'list:' + n; render();
    toast(`Quick Watch list ${n} is saved with the project`);
  }
  function wValClick(tr) {
    const k = tr.dataset.wrow, i = k.indexOf('|'), r = { scope: k.slice(0, i), name: k.slice(i + 1) }, ty = wType(r), sc = r.scope || undefined;
    if (!S.online || !ctl.M) { toast('The Watch tab writes values online: press Go Online first.'); return; }
    if (ty === 'BOOL') { if (!ctl.toggle(r.name, sc, true)) toast(`${r.name} cannot be written here (an input or a read-only tag).`, 'err'); live(true); liveWatch(true); return; }
    if (isStrTy(ty)) { editString(r.name, ty, r.scope, wTag(r)); return; }
    if (!E.ATOMIC.includes(ty)) return;
    prompt1('Write value', r.name, fmtVal(ctl.read(r.name, sc)), v => { const n = E.parseNumber(v); if (!n) return 'Type a number.'; if (!ctl.write(r.name, n.v, sc, true)) return 'This tag cannot be written (an input or read-only).'; live(true); liveWatch(true); });
  }
  document.addEventListener('click', ev => {
    const t = ev.target; if (!t.closest || !S.p) return;
    let el;
    // the Output window as a sheet (tablet landscape): its tabs
    if ((el = t.closest('#layer .sheet [data-otab]'))) { S.outTab = el.dataset.otab; errSheet(); return; }
    if (!t.closest('.wtbl, .wbar')) return;
    if ((el = t.closest('[data-wdel]'))) {
      const k = el.closest('tr').dataset.wrow, i = k.indexOf('|'), sc = k.slice(0, i), n = k.slice(i + 1);
      if (W.sel.startsWith('list:')) { const l = wLists().find(x => x.name === W.sel.slice(5)); if (l) edit(() => { l.tags = l.tags.filter(x => !(x.name === n && (x.scope || '') === sc)); }); }
      else { W.tags = W.tags.filter(x => !(x.name === n && (x.scope || '') === sc)); render(); }
      if ($('#layer .sheet .wtbl')) errSheet();
      return;
    }
    if ((el = t.closest('[data-wsort]'))) { W.sort = W.sort === el.dataset.wsort ? null : el.dataset.wsort; render(); if ($('#layer .sheet .wtbl')) errSheet(); return; }
    if (t.closest('[data-wref]')) { render(); if ($('#layer .sheet .wtbl')) errSheet(); liveWatch(true); return; }
    if ((el = t.closest('[data-wval]'))) wValClick(el.closest('tr'));
  });
  document.addEventListener('change', ev => { if (ev.target.id === 'wsel' && S.p) { W.sel = ev.target.value; render(); if ($('#layer .sheet .wtbl')) errSheet(); } });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' || !S.p) return;
    if (ev.target.id === 'wadd') { ev.preventDefault(); ev.stopPropagation(); wAdd(ev.target); if ($('#layer .sheet .wtbl')) errSheet(); }
    else if (ev.target.id === 'wname') { ev.preventDefault(); ev.stopPropagation(); wName(ev.target); if ($('#layer .sheet .wtbl')) errSheet(); }
  }, true);

  /* ---------- Trends (v37 help: About trending; Create a trend; New Trend dialog box overview; Trend chart window
     overview; Trend control bar overview; Quick Trend command). A trend holds up to 8 tags (BOOL, SINT, INT, DINT,
     REAL), a Sample Period of 1 ms to 30 min (10 ms by default), a Name (40) and a Description (128). The chart
     runs online only (Run is unavailable offline or while it runs) and stops when the controller goes offline. The
     trends are saved with the project (not logic: no online edit). Kept light: one chart window, samples at most once
     a frame, at most 3000 samples, the chart redrawn 4 times a second. ---------- */
  const TPENS = ['#1f77b4', '#d62728', '#2ca02c', '#ff7f0e', '#9467bd', '#8c564b', '#e377c2', '#17becf'];
  const TTYPES = ['BOOL', 'SINT', 'INT', 'DINT', 'REAL'];
  const TR = { win: null, cur: null, run: false, on: false, buf: null, at: 0, drawAt: 0, span: 60000, quick: null };
  const trList = () => (S.p && Array.isArray(S.p.trends) ? S.p.trends : []);
  const trGet = n => (TR.quick && n === TR.quick.name ? TR.quick : trList().find(t => t.name === n));
  const perText = ms => (ms % 60000 === 0 ? ms / 60000 + ' min' : ms % 1000 === 0 ? ms / 1000 + ' s' : ms + ' ms');
  // a trend tag: a tag, member or bit of the program in use or of the controller, of a type a trend shows
  function penOf(txt) {
    const v = String(txt).trim(), b = (/^[A-Za-z_]\w*/.exec(v) || [])[0], P = curProg();
    const pt = b && P.tags.find(t => U(t.name) === U(b)), ct = b && S.p.tags.find(t => U(t.name) === U(b)), t = pt || ct;
    if (!t) return { err: `${v || '?'} is not a tag of ${P.name} or of the controller.` };
    const name = v.replace(/^[A-Za-z_]\w*/, t.name), ty = name === t.name ? (t.dim ? '' : typeOf(t)) : addrType(name) || '';
    if (!TTYPES.includes(ty)) return { err: `${name}: a trend shows BOOL, SINT, INT, DINT and REAL values${ty ? ` (this is ${ty})` : ''}.` };
    return { name, scope: pt ? P.name : '' };
  }
  function trendDialog(name) {
    const T0 = name ? trList().find(t => t.name === name) : null, pens = T0 ? T0.pens.map(p => ({ ...p })) : [];
    const per = T0 ? T0.period : 10, unit = per % 60000 === 0 ? 'min' : per % 1000 === 0 ? 's' : 'ms', pv = per / { min: 60000, s: 1000, ms: 1 }[unit];
    const names = S.p.tags.concat(curProg().tags).filter(t => !t.dim && TTYPES.includes(typeOf(t))).map(t => t.name);
    const list = el => {
      el.querySelector('#trpl').innerHTML = pens.map((p, i) => `<div class="row"><i class="pen" style="background:${TPENS[i]}"></i><span class="grow mono ell">${esc(p.name)}</span><span class="muted ell">${esc(p.scope || S.p.controller.name)}</span><button class="ib" type="button" data-trdel="${i}" title="Remove" aria-label="Remove ${esc(p.name)}">${ic('close')}</button></div>`).join('') || '<p class="help">No tags yet: type a tag name, then Add.</p>';
      el.querySelector('#trpc').textContent = `${pens.length} of 8`;
    };
    dialog({ title: T0 ? `Trend Properties - ${T0.name}` : 'New Trend', size: 'md',
      body: `<div class="frow"><label for="trn">Name</label><input class="inp" id="trn" maxlength="40" value="${esc(T0 ? T0.name : '')}" autocomplete="off" spellcheck="false"></div>
        <div class="frow"><label for="trd">Description</label><textarea class="inp" id="trd" rows="2" maxlength="128">${esc(T0 ? T0.desc || '' : '')}</textarea></div>
        <div class="frow"><label for="trs">Sample Period</label><span class="trsp"><input class="inp num" id="trs" type="number" min="1" step="1" value="${pv}"><select class="inp" id="tru" aria-label="Sample Period unit"><option value="ms">ms</option><option value="s">s</option><option value="min">min</option></select></span></div>
        <div class="grp">Tags to trend <span class="muted" id="trpc"></span></div>
        <div class="trpadd"><input class="inp mono" id="trt" list="trtl" placeholder="Tag name (BOOL, SINT, INT, DINT, REAL)" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="Tag to add"><datalist id="trtl">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist><button class="btn" type="button" id="tra">${ic('plus')}Add</button></div>
        <div class="trpl" id="trpl"></div><div class="errtx" id="tre"></div>`,
      noEnter: ev => ev.target.id === 'trt',
      mount: el => {
        list(el); el.querySelector('#tru').value = unit;
        const inp = el.querySelector('#trt'), er = el.querySelector('#tre');
        const add = () => {
          if (!inp.value.trim()) return;
          const p = penOf(inp.value); er.textContent = '';
          if (p.err) { er.textContent = p.err; return; }
          if (pens.length >= 8) { er.textContent = 'A trend holds up to 8 tags.'; return; }
          if (pens.some(x => U(x.name) === U(p.name) && x.scope === p.scope)) { er.textContent = `${p.name} is in the trend.`; return; }
          pens.push(p); inp.value = ''; list(el); inp.focus();
        };
        el.querySelector('#tra').onclick = add;
        inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } });
        el.querySelector('#trpl').addEventListener('click', ev => { const b = ev.target.closest('[data-trdel]'); if (b) { pens.splice(+b.dataset.trdel, 1); list(el); } });
      },
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        const er = el.querySelector('#tre'), n = el.querySelector('#trn').value.trim(), d = el.querySelector('#trd').value;
        const pn = Number(el.querySelector('#trs').value), ms = pn * { min: 60000, s: 1000, ms: 1 }[el.querySelector('#tru').value];
        if (!E.validName(n)) { er.textContent = 'Name: letters, digits and _ (starting with a letter or _), up to 40 characters.'; return false; }
        if (trList().some(t => t !== T0 && U(t.name) === U(n))) { er.textContent = `A trend named ${n} exists.`; return false; }
        if (d.length > 128) { er.textContent = 'Description: up to 128 characters.'; return false; }
        if (!Number.isInteger(ms) || ms < 1 || ms > 1800000) { er.textContent = 'Sample Period: 1 ms to 30 min, in whole milliseconds.'; return false; }
        const t = { name: n, period: ms, pens }; if (d.trim()) t.desc = d;
        if (T0) { const old = T0.name; edit(() => { delete T0.desc; Object.assign(T0, t); }); if (TR.cur === old) { TR.cur = n; TR.run = false; TR.buf = null; if (TR.win) openTrend(n); } }
        else { edit(() => { S.p.trends = trList().concat([t]); }); openTrend(n); }
      } }] });
  }
  function deleteTrend(n) {
    confirmDlg('Delete Trend', `Delete the trend ${esc(n)}?`, 'Delete', () => { if (TR.cur === n) closeTrend(); edit(() => { S.p.trends = trList().filter(t => t.name !== n); }); }, true);
  }
  function closeTrend() { if (TR.win) TR.win.remove(); TR.win = null; TR.run = false; TR.cur = null; TR.buf = null; TR.quick = null; }
  function openTrend(n) {
    const T = trGet(n); if (!T) return;
    if (TR.cur !== n) { TR.run = false; TR.cur = n; TR.buf = null; }
    let w = TR.win;
    if (!w || !w.isConnected) {
      w = document.createElement('div'); w.className = 'twin'; w.setAttribute('role', 'dialog');
      document.body.appendChild(w); TR.win = w;
      const ww = Math.min(600, innerWidth - 16);
      w.style.left = Math.max(8, (innerWidth - ww) / 2) + 'px'; w.style.top = Math.max(8, Math.min(140, innerHeight - 420)) + 'px';
    }
    w.setAttribute('aria-label', 'Trend ' + T.name);
    const sp = [[10000, '10 s'], [60000, '1 min'], [300000, '5 min'], [600000, '10 min']];
    w.innerHTML = `<div class="twh" data-tdrag="1"><b class="ell">${T === TR.quick ? 'Quick Trend' : 'Trend - ' + esc(T.name)}</b><span class="grow"></span><button class="ib" type="button" data-tx="1" title="Close" aria-label="Close">${ic('close')}</button></div>
      <div class="tbar"><button class="btn" type="button" data-trun="1">${ic('play')}Run</button><button class="btn" type="button" data-tstop="1">${ic('stop')}Stop</button>
        <label class="muted" for="tspan">Time span</label><select class="inp" id="tspan">${sp.map(([v, l]) => `<option value="${v}"${TR.span === v ? ' selected' : ''}>${l}</option>`).join('')}</select><span class="muted ell" id="tstat"></span></div>
      <canvas class="tcv" height="200"></canvas>
      <div class="tleg">${T.pens.map((p, i) => `<span class="tpen"><i class="pen" style="background:${TPENS[i]}"></i><span class="mono ell">${esc(p.name)}</span><b class="mono" data-tv="${i}"></b></span>`).join('') || '<span class="muted">No tags: right-click the trend, Properties…, to add tags.</span>'}</div>`;
    trBar(); trDraw();
  }
  function trBar() {
    const w = TR.win; if (!w) return;
    const on = S.online && !!ctl.M, T = trGet(TR.cur), r = w.querySelector('[data-trun]'), s = w.querySelector('[data-tstop]'), st = w.querySelector('#tstat');
    r.disabled = !on || TR.run || !T || !T.pens.length; s.disabled = !TR.run;
    st.textContent = TR.run ? `Running · sample period ${perText(T.period)}` : on ? 'Stopped' : 'Offline: go online to run the trend';
  }
  function trRun() {
    const T = trGet(TR.cur); if (!T || !S.online || !ctl.M || !T.pens.length) return;
    if (!TR.buf || TR.buf.v.length !== T.pens.length) TR.buf = { t: [], v: T.pens.map(() => []) };
    TR.run = true; TR.at = 0; trBar();
  }
  function trSample() {
    const T = trGet(TR.cur), b = TR.buf;
    b.t.push(Date.now());
    T.pens.forEach((p, i) => { let v; try { v = Number(ctl.read(p.name, p.scope || undefined)); } catch (e) { v = NaN; } b.v[i].push(v); });
    if (b.t.length > 3000) { b.t.splice(0, 500); b.v.forEach(a => a.splice(0, 500)); }
  }
  // from the frame loop: sample at the Sample Period (at most once a frame), redraw 4 times a second
  function trendTick(now) {
    const w = TR.win; if (!w) return;
    if (!w.isConnected || !trGet(TR.cur)) { closeTrend(); return; }
    const on = S.online && !!ctl.M;
    if (on !== TR.on) { TR.on = on; if (!on) TR.run = false; trBar(); }
    if (!TR.run) return;
    if (now - TR.at >= trGet(TR.cur).period) { TR.at = now; trSample(); }
    if (now - TR.drawAt > 250) { TR.drawAt = now; trDraw(); }
  }
  function trDraw() {
    const w = TR.win, cv = w && w.querySelector('.tcv'); if (!cv) return;
    const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 560, H = cv.clientHeight || 200;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'), cs = getComputedStyle(w), col = n => cs.getPropertyValue(n).trim();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = col('--surface') || '#fff'; g.fillRect(0, 0, W, H);
    const L = 54, R = W - 8, Tp = 8, B = H - 20, b = TR.buf, n = b ? b.t.length : 0;
    const end = n ? b.t[n - 1] : Date.now(), start = end - TR.span;
    let i0 = 0; if (n) { let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (b.t[m] < start) lo = m + 1; else hi = m; } i0 = lo; }
    let mn = Infinity, mx = -Infinity;
    if (b) b.v.forEach(a => { for (let k = i0; k < n; k++) { const v = a[k]; if (v < mn) mn = v; if (v > mx) mx = v; } });
    if (!(mx >= mn)) { mn = 0; mx = 1; } if (mx === mn) { mn -= 1; mx += 1; }
    const pad = (mx - mn) * 0.05; mn -= pad; mx += pad;
    const X = t => L + (t - start) / TR.span * (R - L), Y = v => B - (v - mn) / (mx - mn) * (B - Tp);
    g.strokeStyle = col('--border') || '#ddd'; g.lineWidth = 1; g.fillStyle = col('--muted') || '#666'; g.font = '10px sans-serif';
    for (let k = 0; k <= 4; k++) { const y = Math.round(Tp + k * (B - Tp) / 4) + 0.5, v = mx - k * (mx - mn) / 4; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); g.fillText(+v.toPrecision(4) + '', 2, y + 3); }
    for (let k = 0; k <= 6; k++) { const x = Math.round(L + k * (R - L) / 6) + 0.5; g.beginPath(); g.moveTo(x, Tp); g.lineTo(x, B); g.stroke(); }
    const hms = t => new Date(t).toTimeString().slice(0, 8);
    g.fillText(hms(start), L, H - 6); const e = hms(end); g.fillText(e, R - g.measureText(e).width, H - 6);
    if (b && n) {
      const step = Math.max(1, Math.floor((n - i0) / (W * 2)));
      b.v.forEach((a, p) => {
        g.strokeStyle = TPENS[p]; g.lineWidth = 1.5; g.beginPath(); let first = true, py = 0;
        for (let k = i0; k < n; k += step) { const v = a[k]; if (!isFinite(v)) { first = true; continue; } const x = X(b.t[k]), y = Y(v); if (first) { g.moveTo(x, y); first = false; } else { g.lineTo(x, py); g.lineTo(x, y); } py = y; }
        g.stroke();
      });
    }
    w.querySelectorAll('[data-tv]').forEach(s => { const a = b && b.v[+s.dataset.tv], v = a && a.length ? a[a.length - 1] : null; s.textContent = v == null || !isFinite(v) ? '' : String(+v.toPrecision(7)); });
  }
  // Quick Trend (the ladder's and the Cross Reference's right-click menus): a trend of one tag, not saved, online
  function quickTrend(a) {
    if (!S.online || !ctl.M) { toast('Quick Trend runs online: press Go Online first.'); return; }
    const p = penOf(a); if (p.err) { toast(p.err, 'err'); return; }
    TR.quick = { name: '(Quick Trend)', period: 100, pens: [p] }; TR.cur = null;
    openTrend(TR.quick.name); trRun();
  }
  document.addEventListener('click', ev => {
    const t = ev.target; if (!t.closest || !TR.win || !TR.win.contains(t)) return;
    if (t.closest('[data-tx]')) { closeTrend(); return; }
    if (t.closest('[data-trun]')) { trRun(); return; }
    if (t.closest('[data-tstop]')) { TR.run = false; trBar(); trDraw(); }
  });
  document.addEventListener('change', ev => { if (ev.target.id === 'tspan' && TR.win) { TR.span = +ev.target.value; trDraw(); } });
  document.addEventListener('pointerdown', ev => {
    const h = ev.target.closest && ev.target.closest('[data-tdrag]'); if (!h || ev.target.closest('button')) return;
    const w = TR.win, sx = ev.clientX - w.offsetLeft, sy = ev.clientY - w.offsetTop; ev.preventDefault();
    const mv = e => { w.style.left = Math.max(0, Math.min(innerWidth - 60, e.clientX - sx)) + 'px'; w.style.top = Math.max(0, Math.min(innerHeight - 30, e.clientY - sy)) + 'px'; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });

  /* ---------- the Quick View pane below the Controller Organizer (v37 help, Controller Organizer: "provides summary
     information about the selected item"): the type, the description and a few details of the item last clicked in
     the organizer. Its header folds it (kept in the preferences). The rows shown are this app's choice. ---------- */
  function qvRows(k) {
    const P = S.p, n = (a, w) => `${a} ${w}${a === 1 ? '' : 's'}`, prog = g => allProgs().find(x => x.name === g);
    const TT = { BOOL: 'Boolean', SINT: '8-bit integer', INT: '16-bit integer', DINT: '32-bit integer', LINT: '64-bit integer', REAL: '32-bit float', LREAL: '64-bit float' };
    if (k === 'ctl') return [P.controller.name, [['Type', P.controller.type || 'PLC-CPU'], ['Revision', P.controller.rev || ''], ['Slot', ctlSlot()], ['Description', P.controller.desc || ''], ['Mode', modeText()]]];
    if (k === 'ctags') return ['Controller Tags', [['Type', 'Tags of the controller scope'], ['Tags', P.tags.length]]];
    if (k === 'tasks') return ['Tasks', [['Type', 'Folder'], ['Tasks', P.tasks.length]]];
    if (k.startsWith('task:')) { const T = P.tasks.find(x => x.name === k.slice(5)); return T && [T.name, [['Type', 'Continuous task'], ['Description', T.desc || ''], ['Watchdog', (T.watchdog || 500) + ' ms'], ['Programs', T.programs.length], ['Inhibited', T.inhibit ? 'Yes' : 'No']]]; }
    if (k.startsWith('prog:')) { const g = prog(k.slice(5)); return g && [g.name, [['Type', 'Program'], ['Description', g.desc || ''], ['Main Routine', g.main || '<none>'], ['Routines', g.routines.length], ['Tags', g.tags.length]]]; }
    if (k.startsWith('ptags:')) { const g = prog(k.slice(6)); return g && ['Program Tags', [['Type', 'Tags of the program scope'], ['Program', g.name], ['Tags', g.tags.length]]]; }
    if (k.startsWith('rt:')) { const [gn, rn] = k.slice(3).split('/'), g = prog(gn), R = g && g.routines.find(x => x.name === rn); return R && [R.name, [['Type', 'Ladder Diagram routine'], ['Description', R.desc || ''], ['Program', g.name], ['Main Routine', g.main === R.name ? 'Yes' : 'No'], ['Rungs', R.rungs.length]]]; }
    if (k === 'dts' || k === 'dt:user' || k === 'dt:str' || k === 'dt:aod' || k === 'dt:pre' || k === 'dt:mod') {
      const d = E.dataTypes(P), L = { dts: ['Data Types', null], 'dt:user': ['User-Defined', d.userDefined], 'dt:str': ['Strings', d.strings], 'dt:aod': ['Add-On-Defined', d.addOnDefined || []], 'dt:pre': ['Predefined', d.predefined], 'dt:mod': ['Module-Defined', d.moduleDefined] }[k];
      return [L[0], [['Type', 'Folder']].concat(L[1] ? [['Data types', L[1].length]] : [])];
    }
    if (/^dt:[uspam]:/.test(k)) {
      const nm = k.slice(5), c = k[3], ud = (P.dataTypes || []).find(x => U(x.name) === U(nm)), ms = membersOf(nm) || [];
      const kind = { u: 'User-Defined data type', s: 'String data type', a: 'Add-On-Defined data type', p: TT[nm] ? 'Predefined atomic data type' : 'Predefined data type', m: 'Module-Defined data type' }[c];
      const r = [['Type', kind], ['Description', (ud && ud.desc) || TT[nm] || '']];
      if (c === 's' || nm === 'STRING') r.push(['Maximum Characters', c === 's' && ud ? ud.len : 82]);
      else if (ms.length) r.push(['Members', ms.length]);
      r.push(['Size', sizeText(nm) || '']);
      return [nm, r];
    }
    if (k === 'trends') return ['Trends', [['Type', 'Folder'], ['Trends', trList().length]]];
    if (k.startsWith('trend:')) { const T = trList().find(x => x.name === k.slice(6)); return T && [T.name, [['Type', 'Trend'], ['Description', T.desc || ''], ['Sample Period', perText(T.period)], ['Tags', T.pens.map(x => x.name).join(', ') || '<none>']]]; }
    if (k === 'io') return ['I/O Configuration', [['Type', 'Folder'], ['Modules', P.rack.modules.length + 1]]];
    if (k === 'bp') return [`Backplane, PLC-RACK${P.rack.size}`, [['Type', 'Chassis'], ['Size', n(P.rack.size, 'slot')]]];
    if (k.startsWith('mod:')) {
      const s = +k.slice(4);
      if (s === ctlSlot()) return [P.controller.name, [['Type', 'PLC-CPU controller'], ['Slot', s], ['Revision', P.controller.rev || '']]];
      const m = P.rack.modules.find(x => x.slot === s);
      return m && [m.name, [['Type', m.type], ['Description', m.desc || ''], ['Slot', s], ['Inhibited', m.inhibit ? 'Yes' : 'No']].concat(S.online && ctl.M ? [['Status', ctl.moduleStatus(s).state]] : [])];
    }
    return null;
  }
  function quickViewHTML() {
    if (S.noProj) return '';
    const open = S.prefs.qv !== false, q = open && qvRows(S.orgSel || '');
    const body = !open ? '' : q ? `<div class="qvb"><div class="qvn">${esc(q[0])}</div>${q[1].filter(x => x[1] !== '' && x[1] != null).map(([a, b]) => kv(esc(a), esc(String(b)))).join('')}</div>` : '<div class="qvb muted">Select an item in the Controller Organizer.</div>';
    return `<div class="qv" id="qview"><button class="qvh" type="button" data-qv="1" aria-expanded="${open}">${ic(open ? 'down' : 'right')}<span>Quick View</span></button>${body}</div>`;
  }
  const qvRefresh = () => document.querySelectorAll('#qview').forEach(x => { x.outerHTML = quickViewHTML(); });
  document.addEventListener('click', ev => {
    const t = ev.target; if (!t.closest || !S.p) return;
    if (t.closest('[data-qv]')) { S.prefs.qv = S.prefs.qv === false; savePrefs(); qvRefresh(); return; }
    if (t.closest('[data-org]')) qvRefresh();
  });

  /* ---------- the Tag Editor command bar: Show and the filter; the columns ----------
     v37 help, Tag Editor command bar settings: Scope; Show (All Tags, Configure… = the Define Tag Filter dialog,
     Filter History = the five filters used last); the Filter icon (Filter On Name, Description or Both) and the box
     beside it. Filter the tag list: Filter On (<all>, Unused, Produced, Consumed, Can Be Forced, Alias; the parameter
     kinds are left out: this app has no program parameters) and Include Data Types, Clear Filter, OK. Filtering is
     applied to the base tags only. Hide and Show Columns: right-click a column name, Hide Column or Toggle Column, or
     View > Toggle Column; the Tag Editor and the Data Monitor keep their own columns. */
  const FILTER_ON = ['<all>', 'Unused', 'Produced', 'Consumed', 'Can Be Forced', 'Alias'];
  const tagShow = () => { const f = S.prefs.tagShow; return f && FILTER_ON.includes(f.on) ? { on: f.on, types: Array.isArray(f.types) ? f.types : [] } : { on: '<all>', types: [] }; };
  const showAll = f => f.on === '<all>' && !f.types.length;
  const showText = f => (showAll(f) ? 'All Tags' : [f.on !== '<all>' ? f.on : '', f.types.join(', ')].filter(Boolean).join('; '));
  const tagFilterOn = () => (['name', 'desc', 'both'].includes(S.prefs.tagFon) ? S.prefs.tagFon : 'both');
  const tagHit = (qq, n, d) => !qq || (tagFilterOn() !== 'desc' && U(n).includes(qq)) || (tagFilterOn() !== 'name' && U(d || '').includes(qq));
  // the base names the logic of a scope refers to (operands, expressions) and the targets of its aliases
  function usedNames(scope) {
    const out = new Set(), words = t => (String(t).match(/[A-Za-z_]\w*/g) || []).forEach(w => out.add(U(w)));
    const progs = scope ? allProgs().filter(g => g.name === scope) : allProgs();
    progs.forEach(g => g.routines.forEach(r => r.rungs.forEach(x => { const pr = E.parseRung(x.t || ''); const w = a => a.forEach(e => (e.t === 'BR' ? e.legs.forEach(w) : (e.a || []).forEach(words))); if (!pr.err) w(pr.elems); })));
    S.p.tags.concat(...allProgs().map(g => g.tags)).forEach(t => { if (t.alias) words(t.alias.split(/[.[]/)[0]); });
    return out;
  }
  function showFilter(scope) {
    const f = tagShow();
    if (showAll(f)) return () => true;
    const used = f.on === 'Unused' ? usedNames(scope) : null, types = new Set(f.types.map(U));
    return e => {
      if (types.size && !types.has(U(baseTy(e.ty)))) return false;
      switch (f.on) {
        case 'Unused': return !e.mod && !!e.t && !used.has(U(e.t.name));
        case 'Produced': case 'Consumed': return false;   // no produced or consumed tags in this app
        case 'Can Be Forced': return e.mod ? /:[IO]$/.test(e.path) : !!(e.t && e.t.alias && /^Local:\d+:[IO]\./i.test(baseTagOf(e.t.alias)));
        case 'Alias': return !!(e.t && e.t.alias);
      }
      return true;
    };
  }
  const fonIcon = () => `<button class="ib tfon" type="button" data-tfon="1" title="Filter On: ${{ name: 'Name', desc: 'Description', both: 'Both' }[tagFilterOn()]}" aria-label="Filter options"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6 7.5V18l-4 2v-7.5z"/></svg></button>`;
  const tagShowBar = () => `<label class="tshl" for="tshow">Show:</label><button class="btn tshow" type="button" id="tshow" data-tshow="1" title="Show: ${esc(showText(tagShow()))}"><span class="ell">${esc(showText(tagShow()))}</span>${ic('down')}</button>${fonIcon()}`;
  function setShow(f) {
    S.prefs.tagShow = f;
    if (!showAll(f)) { const k = JSON.stringify(f); S.prefs.tagHist = [f].concat((S.prefs.tagHist || []).filter(x => JSON.stringify(x) !== k)).slice(0, 5); }
    savePrefs(); tagsRedraw();
  }
  const tagsRedraw = () => { if (S.view === 'tags' && S.layout !== 'phone') render(); else { const p = $('#tagpage'); if (p) p.innerHTML = tagEditorBody(S.layout === 'phone'); } };
  function showMenu(at) {
    const f = tagShow(), hist = (S.prefs.tagHist || []).slice(0, 5);
    openMenu([{ l: 'All Tags', ck: showAll(f), run: () => setShow({ on: '<all>', types: [] }) }, { l: 'Configure…', i: 'gear', run: defineTagFilter }]
      .concat(hist.length ? ['-', { hd: 'Filter History' }, ...hist.map(h => ({ l: showText(h), ck: JSON.stringify(h) === JSON.stringify(f), run: () => setShow(h) }))] : []), at);
  }
  function fonMenu(at) {
    const set = m => { S.prefs.tagFon = m; savePrefs(); refreshTags(); const b = $('[data-tfon]'); if (b) b.title = 'Filter On: ' + { name: 'Name', desc: 'Description', both: 'Both' }[m]; };
    openMenu([['name', 'Filter On Name'], ['desc', 'Filter On Description'], ['both', 'Filter On Both']].map(([m, l]) => ({ l, ck: tagFilterOn() === m, run: () => set(m) })), at);
  }
  function defineTagFilter() {
    const f = tagShow(), types = [...new Set(E.ATOMIC.concat(Object.keys(E.PREDEF), (S.p.dataTypes || []).map(d => d.name), moduleTags().map(x => x.ty)))];
    dialog({ title: 'Define Tag Filter', size: 'md',
      body: `<div class="frow"><label for="dfon">Filter On</label><select class="inp" id="dfon">${FILTER_ON.map(x => `<option${x === f.on ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="frow"><label>Include Data Types</label><span class="muted">None checked: every data type</span></div>
        <div class="list dftl" id="dftl">${types.map(t => `<label class="row ck"><input type="checkbox" value="${esc(t)}"${f.types.some(x => U(x) === U(t)) ? ' checked' : ''}> <span class="mono">${esc(t)}</span></label>`).join('')}</div>`,
      mount: el => { el.querySelector('.df').insertAdjacentHTML('afterbegin', '<button class="btn" type="button" id="dfclr">Clear Filter</button><span class="grow"></span>'); el.querySelector('#dfclr').onclick = () => { el.querySelectorAll('#dftl input').forEach(i => { i.checked = false; }); el.querySelector('#dfon').value = '<all>'; }; },
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => { setShow({ on: el.querySelector('#dfon').value, types: [...el.querySelectorAll('#dftl input:checked')].map(i => i.value) }); } }] });
  }
  const tcolHidden = mode => ((S.prefs.tagCols || {})[mode] || []).filter(c => TCOLS[mode].includes(c) && c !== 'Name');
  function tagColStyle(mon) {
    const mode = mon ? 'mon' : 'edit', h = tcolHidden(mode);
    return h.length ? `<style>${h.map(c => `#tagpage .tagtbl tr:not(.newrow) > :nth-child(${TCOLS[mode].indexOf(c) + 2})`).join(',')}{display:none}</style>` : '';
  }
  function setCol(mode, c, show) {
    const o = Object.assign({}, S.prefs.tagCols), h = new Set(tcolHidden(mode));
    if (show) h.delete(c); else h.add(c);
    o[mode] = [...h]; S.prefs.tagCols = o; savePrefs(); render();
  }
  // the column menu: Hide Column (the one under the pointer), then Toggle Column with every column but Name
  function colMenu(at, col) {
    const mode = S.tagMode === 'mon' ? 'mon' : 'edit', h = tcolHidden(mode);
    const items = col && col !== 'Name' ? [{ l: `Hide Column "${col}"`, run: () => setCol(mode, col, false) }, '-'] : [];
    openMenu(items.concat({ hd: 'Toggle Column' }, TCOLS[mode].filter(c => c !== 'Name').map(c => ({ l: c, ck: !h.includes(c), run: () => setCol(mode, c, h.includes(c)) }))), at);
  }
  document.addEventListener('click', ev => {
    const t = ev.target, b = t.closest && (t.closest('[data-tshow]') || t.closest('[data-tfon]'));
    if (!b || !S.p) return;
    if (b.dataset.tshow) showMenu(b); else fonMenu(b);
  });
  document.addEventListener('contextmenu', ev => {
    const th = ev.target.closest && ev.target.closest('#tagpage .tagtbl th');
    if (!th || !S.p) return;
    ev.preventDefault(); ev.stopPropagation();
    colMenu({ x: ev.clientX, y: ev.clientY }, th.textContent.trim());
  }, true);

  /* the Date/Time styles of a LINT (v37 help: About the Tag Editor): microseconds since 1970 as
     DT#2014-05-28-19:00:01.200_000 (UTC-05:00), or nanoseconds as LDT#…200_000_000 (UTC-05:00), in the computer's time
     zone; a negative value cannot be shown as a date (null: the number is shown) */
  function dateTime(v, ns) {
    if (!Number.isInteger(v) || v < 0) return null;
    const b = BigInt(v), per = ns ? 1000000000n : 1000000n, sec = Number(b / per), frac = (b % per).toString().padStart(ns ? 9 : 6, '0');
    const d = new Date(sec * 1000);
    if (isNaN(d) || d.getFullYear() > 2250) return null;
    const p2 = n => String(n).padStart(2, '0'), off = -d.getTimezoneOffset(), oh = Math.floor(Math.abs(off) / 60), om = Math.abs(off) % 60;
    return `${ns ? 'LDT' : 'DT'}#${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${frac.replace(/(\d{3})(?=\d)/g, '$1_')} (UTC${off < 0 ? '-' : '+'}${p2(oh)}:${p2(om)})`;
  }
  /* ---------- strings: STRING (LEN, DATA[82], 1756-PM004) and the string types of Data Types > Strings ----------
     New String Type: Name, Description, Maximum Characters (1 to 65535, v37 help: Using user-defined data types), the
     size. A string shows its text in Monitor Tags ('Hello'), $ marks the special characters as the String Browser
     writes them ($$ $' $L $N $P $R $T $hh; v37 help: Failed to modify the String data) */
  const strMems = n => [{ name: 'LEN', type: 'DINT' }, { name: 'DATA', type: 'SINT', dim: n }];
  const strTypeOf = ty => (U(ty) === 'STRING' ? { name: 'STRING', len: 82, family: 'string' } : (S.p.dataTypes || []).find(d => d.family === 'string' && U(d.name) === U(ty)) || null);
  const isStrTy = ty => !!ty && !!strTypeOf(ty);
  const strRow = e => isStrTy(e.ty) && !E.dimN(e.dim);
  const SESC = { 36: '$$', 39: "$'", 10: '$L', 12: '$P', 13: '$R', 9: '$T' };
  function strText(o) {
    const d = (o && o.DATA) || [], n = Math.max(0, Math.min(o && o.LEN | 0, d.length));
    let x = '';
    for (let k = 0; k < n; k++) { const c = d[k] & 255; x += SESC[c] || (c > 31 && c < 127 ? String.fromCharCode(c) : '$' + c.toString(16).toUpperCase().padStart(2, '0')); }
    return `'${x}'`;
  }
  // the text a user typed, with or without the quotes → { LEN, DATA } or the reason it is not a string
  function parseStr(txt, max) {
    let s = String(txt);
    if (s.startsWith("'")) {
      // the ending quote must be there and not written $' (an odd number of $ before it)
      const dl = s.length >= 2 && s.endsWith("'") ? (/\$*'$/.exec(s.slice(1))[0].length - 1) : 1;
      if (dl % 2) return 'Missing string termination character: put the ending quote on the data.';
      s = s.slice(1, -1);
    }
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "'") return "String literal contains an invalid character combination: a quote inside the string is written $'.";
      if (ch !== '$') { const c = ch.charCodeAt(0); if (c > 255) return `'${ch}' is not an ASCII character.`; out.push(c); continue; }
      const a = s[i + 1] || '', b = s[i + 2] || '', u = a.toUpperCase();
      if (a === '$' || a === "'") { out.push(a.charCodeAt(0)); i++; continue; }
      if (u === 'L') { out.push(10); i++; continue; }
      if (u === 'N') { out.push(13, 10); i++; continue; }
      if (u === 'P') { out.push(12); i++; continue; }
      if (u === 'R') { out.push(13); i++; continue; }
      if (u === 'T') { out.push(9); i++; continue; }
      if (/^[0-9A-Fa-f]{2}$/.test(a + b)) { out.push(parseInt(a + b, 16)); i += 2; continue; }
      return `String literal contains an invalid character combination: '$${a}${b}'.`;
    }
    if (out.length > max) return `Too much character information provided: ${out.length} characters, at most ${max}.`;
    const DATA = new Array(max).fill(0); out.forEach((c, k) => { DATA[k] = c > 127 ? c - 256 : c; });
    return { LEN: out.length, DATA };
  }
  // the value at a member path inside a start value (Tag.DATA[3] in { LEN, DATA })
  const valAt = (v, rest) => { let o = v; const re = /\.(\w+)|\[(\d+)\]/g; let m; while (o != null && (m = re.exec(rest))) o = m[1] != null ? o[m[1]] : o[+m[2]]; return o; };
  /* the Value of a string row (the text), and of a DATA element (ASCII, as the reference shows a string's DATA) */
  function strVal(path, ty, scope, t) {
    const on = S.online && ctl.M;
    if (isStrTy(ty)) {
      if (t && t.dim) return null;
      const o = on ? ctl.read(path, scope || undefined) : t && t.value && typeof t.value === 'object' ? t.value : offStart(path, scope);
      return { t: strText(o), cls: '' };
    }
    const m = /^(.*)\.DATA\[(\d+)\]$/.exec(path);
    if (U(ty) === 'SINT' && m && isStrTy(addrType(m[1]) || '')) {
      const v = on ? ctl.read(path, scope || undefined) : valAt(offStart(m[1], scope), `.DATA[${m[2]}]`);
      return { t: styled(Number(v) || 0, 'SINT', 'ASCII'), cls: '' };
    }
    const ml = /^(.*)\.LEN$/.exec(path);
    if (!on && ml && isStrTy(addrType(ml[1]) || '')) return { t: String(Number(valAt(offStart(ml[1], scope), '.LEN')) || 0), cls: '' };
    return null;
  }
  // a start value inside a base tag (offline), for a member path
  const offStart = (path, scope) => { const b = /^([A-Za-z_]\w*)(.*)$/.exec(path); const t = b && scopeTags(scope || '').find(x => U(x.name) === U(b[1])); return t && t.value && typeof t.value === 'object' ? valAt(t.value, b[2]) : null; };
  /* the String Browser (v37 help: String Browser Dialog Box Overview): the tag's name as the title (* once it is
     edited), the edit field, and Count (characters typed of the maximum). Online it writes the controller, offline
     the start value of a base tag. */
  function editString(name, ty, scope, t) {
    const max = strTypeOf(ty).len, on = S.online && ctl.M;
    if (!on && !t) { toast('Start values can be set for base tags only.'); return; }
    if (!on && t.alias) { toast('Start values can be set for base tags only.'); return; }
    const cur = on ? ctl.read(name, scope || undefined) : t.value;
    const txt = strText(cur).slice(1, -1);
    dialog({ title: name, size: 'md', focus: true,
      body: `<textarea class="inp mono" id="sbx" rows="4" spellcheck="false" autocapitalize="off" aria-label="String data">${esc(txt)}</textarea>
        <div class="kv"><span>Count</span><span class="v" id="sbc"></span></div><p class="help">$$ is $, $' a quote, $L line feed, $N new line, $P form feed, $R return, $T tab, $hh a character in hex.</p><div class="errtx" id="sbe"></div>`,
      mount: el => {
        const x = el.querySelector('#sbx'), cnt = () => { const r = parseStr(x.value, 65535); el.querySelector('#sbc').textContent = `${typeof r === 'string' ? '?' : r.LEN} of ${max}`; };
        x.addEventListener('input', () => { el.querySelector('.dh b').textContent = name + ' *'; cnt(); }); cnt();
      },
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        const r = parseStr(el.querySelector('#sbx').value, max);
        if (typeof r === 'string') { el.querySelector('#sbe').textContent = 'Failed to modify the String data. ' + r; return false; }
        if (on) { if (!ctl.write(name, r, scope || undefined, true)) { el.querySelector('#sbe').textContent = 'This tag cannot be written (read-only).'; return false; } live(true); refreshTags(); return; }
        edit(() => { t.value = r; });
      } }] });
  }
  function stringTypeEditor(name) {
    const pre = name && U(name) === 'STRING', d0 = name ? strTypeOf(name) : null;
    if (name && !d0) return;
    const ro = pre || (S.online && !!d0 && typeUsers(d0.name).length > 0);
    const R = ro ? ' readonly' : '';
    dialog({ title: d0 ? `String Type: ${d0.name}` : 'New String Type', size: 'md',
      body: `<div class="frow"><label for="stn">Name</label><input class="inp mono" id="stn" value="${esc(d0 ? d0.name : '')}" maxlength="40" autocomplete="off" spellcheck="false" autocapitalize="off"${R}></div>
        <div class="frow"><label for="std">Description</label><textarea class="inp" id="std" rows="2" maxlength="512"${R}>${esc(pre ? 'The string type of the controller: LEN and DATA[82]' : d0 ? d0.desc || '' : '')}</textarea></div>
        <div class="frow"><label for="stl">Maximum Characters</label><input class="inp" id="stl" type="number" min="1" max="65535" inputmode="numeric" value="${d0 ? d0.len : 82}"${R}></div>
        <div class="frow"><label>Data Type Size</label><span id="sts">${d0 ? sizeText(d0.name) : '(worked out when the type is saved)'}</span></div>
        ${pre ? '<p class="help">STRING is the predefined string type: it cannot be changed. Make a string type of another length with New String Type.</p>' : ro ? '<p class="help">The controller is online and this string type is in use: change it offline.</p>' : ''}<div class="errtx" id="ste"></div>`,
      buttons: ro ? [{ l: 'Close' }] : [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        const n = el.querySelector('#stn').value.trim(), desc = el.querySelector('#std').value.trim(), len = +el.querySelector('#stl').value;
        const err = m => { el.querySelector('#ste').textContent = m; return false; };
        if (!E.validName(n)) return err('Name: letters, digits and _, starting with a letter or _, up to 40 characters, no two _ in a row and no _ at the end.');
        const taken = E.ATOMIC.concat(Object.keys(E.PREDEF), Object.keys(E.MODTYPES), (S.p.dataTypes || []).filter(d => d !== d0).map(d => d.name));
        if (taken.some(t => U(t) === U(n))) return err(`A data type named ${n} already exists.`);
        if (!(Number.isInteger(len) && len >= 1 && len <= 65535)) return err('Maximum Characters: a whole number from 1 to 65535.');
        const nd = { name: n, family: 'string', len }; if (desc) nd.desc = desc;
        edit(() => {
          S.p.dataTypes = S.p.dataTypes || [];
          if (d0) {
            S.p.dataTypes[S.p.dataTypes.indexOf(d0)] = nd;
            if (d0.name !== n) { const fix = t => { if (!t.alias && U(t.type || '') === U(d0.name)) t.type = n; }; S.p.tags.forEach(fix); allProgs().forEach(g => g.tags.forEach(fix)); S.p.dataTypes.forEach(d => (d.members || []).forEach(x => { if (U(x.type) === U(d0.name)) x.type = n; })); }
          } else S.p.dataTypes.push(nd);
        });
        toast(`String type ${n} saved (${sizeText(n)})`);
      } }] });
  }
  function l5xTypesIn(c) {
    const dts = [...c.children].find(k => k.tagName === 'DataTypes');
    return (dts ? [...dts.children].filter(k => k.tagName === 'DataType') : []).map(g => {
      const o = { name: g.getAttribute('Name'), members: [] }, ds = [...g.children].find(k => k.tagName === 'Description');
      if (ds && ds.textContent.trim()) o.desc = ds.textContent.trim();
      if (g.getAttribute('Family') === 'StringFamily') { const dm = g.querySelector('Members > Member[Name="DATA"]'); delete o.members; o.family = 'string'; o.len = parseInt(dm && dm.getAttribute('Dimension'), 10) || 82; return o; }
      const ms = [...g.querySelectorAll('Members > Member')].filter(m => m.getAttribute('Hidden') !== 'true');
      ms.forEach(m => {
        const ty = m.getAttribute('DataType') === 'BIT' ? 'BOOL' : m.getAttribute('DataType'), mo = { name: m.getAttribute('Name'), type: ty };
        const dim = parseInt(m.getAttribute('Dimension'), 10); if (dim > 0) mo.dim = dim;
        const md = [...m.children].find(k => k.tagName === 'Description'); if (md && md.textContent.trim()) mo.desc = md.textContent.trim();
        const ra = m.getAttribute('Radix'), ea = m.getAttribute('ExternalAccess');
        if (ra && stylesOf(ty).includes(ra) && ra !== defStyle(ty)) mo.style = ra;
        if (ea && ACCESS.includes(ea) && ea !== 'Read/Write') mo.access = ea;
        o.members.push(mo);
      });
      return o;
    });
  }

  /* ---------- online ---------- */
  /* Verify clears the dirty marks ('*') of the rungs it finds without errors */
  function clearDirty(list, v) {
    const bad = new Set(v.errors.map(e => e.program + '/' + e.routine + '/' + e.rung));
    allProgs().forEach(g => g.routines.forEach(r => { if (list && !list.includes(r)) return; r.rungs.forEach((x, n) => { if (x.dx && !bad.has(g.name + '/' + r.name + '/' + n)) delete x.dx; }); }));
  }
  function verifyCmd(routineOnly) {
    reverify();
    const v = routineOnly ? E.verify(S.p, { program: curProg().name, routine: curRoutine().name }) : S.verify;
    clearDirty(routineOnly ? [curRoutine()] : null, v);
    if (S.layout === 'desktop') S.prefs.err = true; else if (S.layout === 'tablet') S.errOpen = true; else S.area = 'more';
    S.verifyShown = v; S.outTab = 'err';
    render();
    toast(v.errors.length ? `${v.errors.length} error(s), ${v.warnings.length} warning(s)` : `Verified: no errors, ${v.warnings.length} warning(s)`, v.errors.length ? 'err' : 'ok');
  }
  const MODE = () => ({ prog: 'Program', run: 'Run', remprog: 'Rem Prog', remrun: 'Rem Run', remtest: 'Rem Test' }[ctl.mode]);
  function online() {
    S.online = true;
    // the I/O panel holds the simulated field devices: show it when going online
    if (!S.prefs.emu && S.layout !== 'phone') { S.prefs.emu = true; savePrefs(); }
    render(); live(true); commLed();
  }
  /* Go Online: the same project goes online; otherwise "Connected To Go Online" (as in the reference): Select File,
     Upload or Download, with what the controller and this device hold */
  function goOnline() { connect(goOnline2); }
  function goOnline2() {
    if (ctl.M && (ctl.holds(S.p) || (zonesIn(S.p) && (ctl.holds(newLogic(S.p)) || ctl.holds(logicOf(S.p, 'old')))) || (S.ed && S.ed.ctl === ctl))) { online(); toast(`Online with ${ctl.name}`); return; }
    const inCtl = ctl.M ? JSON.parse(ctl.copy) : null;
    const facts = p => { const progs = p.tasks.flatMap(t => t.programs); return `${progs.reduce((n, g) => n + g.routines.length, 0)} routine(s), ${progs.reduce((n, g) => n + g.routines.reduce((m, r) => m + r.rungs.length, 0), 0)} rung(s), ${p.tags.length + progs.reduce((n, g) => n + g.tags.length, 0)} tag(s)`; };
    /* the condition (v37 help, Correlate a project with a controller), then the connected controller and the offline
       project, as the Options tab of the Connected To Go Online dialog shows them */
    const cond = !inCtl ? ['There is no project loaded in the controller.', 'Download a project to the controller to go online.']
      : U(inCtl.controller.name) !== U(S.p.controller.name) ? ['The open project doesn\'t match the project in the controller.', 'Check the communications path. If it is right, the wrong project file is open: Select File opens the right one, or Upload copies the controller\'s project into a new file.']
      : S.dirty ? ['Offline changes have been made to the open project.', 'Offline changes to the logic and configuration cannot be correlated: Download them to the controller, or discard them with Upload.']
      : ['You need to upload or download in order to go online using the open project.', 'The controller holds another copy of this project (or online changes this copy does not have): Upload makes both copies the same; Download replaces the controller\'s.'];
    const ctlType = c => esc((c && c.controller && c.controller.type) || 'PLC-CPU') + ' (emulated)';
    const files = [];
    dialog({ title: 'Connected To Go Online', size: 'md',
      body: `<div class="grp" style="background:none;padding-left:0">Condition</div><p class="corr-cond"><b>${esc(cond[0])}</b></p><p class="help">${esc(cond[1])}</p>
        <div class="grp" style="background:none;padding-left:0">Connected Controller</div>${kv('Controller Name', inCtl ? esc(inCtl.controller.name) : '&lt;no name&gt;')}${kv('Controller Type', ctlType(inCtl))}${kv('Comm Path', esc(curPath()))}${kv('Serial Number', '<span class="muted">-</span>')}${kv('Security', 'No Protection')}${inCtl ? kv('Contents', facts(inCtl)) : ''}${kv('Mode', MODE())}
        <div class="grp" style="background:none;padding-left:0">Offline Project</div>${kv('Controller Name', esc(S.p.controller.name))}${kv('Controller Type', ctlType(S.p))}${kv('File', esc(S.file ? S.file.path : ''))}${kv('Revision', esc(S.p.controller.rev || '1.0'))}${kv('Serial Number', '<span class="muted">-</span>')}${kv('Security', 'No Protection')}${kv('Contents', facts(S.p))}
        <p class="help"><b>Select File</b> opens another project file (or names a new one to upload into). <b>Upload</b> copies the controller's project into the open project, then goes online. <b>Download</b> replaces the controller's project with the open one, then goes online.</p>`,
      buttons: [{ l: 'Cancel', run: () => { linked = null; } }, { l: 'Select File…', run: () => { setTimeout(selectFile, 0); } }].concat(inCtl ? [{ l: 'Upload…', run: () => { setTimeout(upload, 0); } }] : []).concat([{ l: 'Download…', pri: true, run: () => { setTimeout(download, 0); } }]) });
    void files;
  }
  /* Select File: open a saved project; when it matches the controller, go online with it */
  function selectFile() {
    const path = curPath();
    fileDialog({ mode: 'open', title: 'Select File', types: ['mtp', 'l5x'], onPick: f => loadFile(f, () => {
      setPath(path);
      if (ctl.M && ctl.holds(S.p)) { online(); toast(`Online with ${ctl.name}`); } else setTimeout(goOnline, 0);
    }) });
  }
  /* Upload: the controller's project, with its tag values, goes into a project file on this device (a new one, or
     one that is replaced), then online */
  function upload() { connect(upload2, 'Upload'); }
  function upload2() {
    if (!ctl.M) { toast('The controller is empty: nothing to upload.', 'err'); return; }
    const p = ctl.upload();
    confirmDlg('Upload', `Upload <b>${esc(p.controller.name)}</b> from <span class="mono">${esc(curPath())}</span>? It opens here, with the controller's tag values; then pick where to save its file.`, 'Upload', () => {
      const x = xferSteps(p, 'Uploading'), from = ctl;
      setTimeout(() => transfer({ title: 'Uploading', kind: 'upload', ms: x.ms, sub: `From ${curPath()}`, steps: x.st, doneText: 'Upload complete',
        cancelled: () => { linked = null; toast('Upload cancelled. Nothing was opened.'); }, done: () => {
        if (ctl !== from) { toast('The controller stopped answering: the upload failed.', 'err'); return; }
        const path = curPath();
        S.ed = null;
        openProject(p, true);
        setPath(path);
        S.dirty = true; saveProject();
        online();
        toast(`Uploaded ${p.controller.name}`, 'ok');
        setTimeout(saveFileAs, 300);
      } }), 0);
    });
  }
  /* ---------- the feel of a real connection (RSLinx browse, Go Online, Download, Upload) ----------
     The steps wait on setTimeout, never in a loop, so the screen keeps taking input. fastComm (Options, or
     ?fastcomm=1 in the address) skips the waits: the tests use it. */
  const fastComm = () => !!S.prefs.fastComm || /[?&]fastcomm=1(&|$)/.test(location.search);
  const jitter = (a, b) => Math.round(a + Math.random() * (b - a));
  let commBusy = 0, linked = null;
  /* the COMM indicator: blinks fast while data moves, slowly while online, dark offline */
  const commCls = () => (commBusy ? ' busy' : S.online ? ' on' : '');
  const commHTML = txt => `<span class="comm" title="Communications activity"><i class="commled${commCls()}"></i>${txt ? '<b>COMM</b>' : ''}</span>`;
  function commLed() { const c = 'commled' + commCls(); document.querySelectorAll('.commled').forEach(e => { if (e.className !== c) e.className = c; }); }
  const busyComm = d => { commBusy = Math.max(0, commBusy + d); commLed(); };
  /* the size of the project, for the transfer time and its steps */
  function projSize(p) {
    const progs = p.tasks.flatMap(t => t.programs);
    return { progs, tags: p.tags.length + progs.reduce((n, g) => n + g.tags.length, 0), rungs: progs.reduce((n, g) => n + g.routines.reduce((m, r) => m + r.rungs.length, 0), 0) };
  }
  /* the transfer steps of a whole project, as the reference names them while it downloads or uploads */
  function xferSteps(p, verb) {
    const z = projSize(p), st = [{ t: `${verb}…`, w: 2 }, { t: `${verb} tags (${z.tags})…`, w: 2 + z.tags / 10 }];
    z.progs.forEach(g => {
      st.push({ t: `${verb} program ${g.name}…`, w: 1 });
      g.routines.forEach(r => st.push({ t: `${verb} routine ${g.name} - ${r.name} (${r.rungs.length} rung${r.rungs.length === 1 ? '' : 's'})…`, w: 1 + r.rungs.length / 8 }));
    });
    return { st, ms: Math.min(3000, Math.max(1500, 1400 + z.rungs * 6 + z.tags * 3)) };
  }
  /* the transfer dialog of Download, Upload and Go Online: a determinate bar through named steps, with Cancel.
     A step with run() runs when it starts (false stops the transfer); a step with fixed: true cannot be cancelled
     any more (the controller has taken the data). */
  function transfer(o) {
    const steps = o.steps, W = steps.reduce((s, x) => s + x.w, 0), total = fastComm() ? (o.fastMs != null ? o.fastMs : 600) : o.ms;
    let i = -1, acc = 0, timer = 0, over = false, fixed = false;
    busyComm(1);
    const el = dialog({ title: o.title, modal: true, size: 'xfer',
      body: `<p class="xfer-t" id="xft">${esc(steps[0].t)}</p><div class="prog det" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="${esc(o.title)}"><i></i></div>
        <div class="xfer-s"><span class="muted ell grow" id="xfs">${esc(o.sub || '')}</span><span class="mono" id="xfp">0%</span></div>`,
      buttons: o.noCancel ? [] : [{ l: 'Cancel', run: () => { cancel(); } }],
      onClose: () => { if (!over) cancel(); } });
    el.dataset.xfer = o.kind || '';
    const bar = el.querySelector('.prog i'), pb = el.querySelector('.prog'), cb = el.querySelector('[data-b="0"]');
    const end = () => { over = true; clearTimeout(timer); busyComm(-1); };
    function cancel() {
      if (over || fixed) return false;
      end(); if (el.isConnected) closeLayer();
      if (o.cancelled) o.cancelled();
      return true;
    }
    const next = () => {
      if (over) return;
      i++;
      if (i >= steps.length) {
        end();
        const fin = () => { if (el.isConnected) closeLayer(); o.done(); };
        if (o.doneText && el.isConnected) { el.querySelector('#xft').textContent = o.doneText; timer = setTimeout(fin, fastComm() ? 0 : 350); } else fin();
        return;
      }
      const s = steps[i];
      if (s.fixed) { fixed = true; if (cb) cb.disabled = true; }
      if (s.run && s.run() === false) { end(); if (el.isConnected) closeLayer(); return; }
      acc += s.w;
      const dur = total * s.w / W, pc = Math.round(acc / W * 100);
      if (el.isConnected) {
        el.querySelector('#xft').textContent = s.t;
        bar.style.transitionDuration = Math.round(dur) + 'ms'; bar.style.width = pc + '%';
        pb.setAttribute('aria-valuenow', pc); el.querySelector('#xfp').textContent = pc + '%';
      }
      timer = setTimeout(next, dur);
    };
    // Esc is Cancel (not a plain close: the transfer would go on behind it)
    layerKey = ev => { if (ev.key === 'Escape') { ev.preventDefault(); cancel(); } };
    // the dialog paints at 0 %, then the bar moves
    timer = setTimeout(next, 30);
    return { el, cancel };
  }
  /* Connecting to the controller: RSLinx opens the path before anything else (Go Online, Download or Upload from
     offline). Then the checks of reachable(). fastComm, or a path just reached, skips the wait. */
  function connect(then, what) {
    const path = curPath();
    if (fastComm() || S.online || (linked && linked.path === path && linked.ctl === ctl && performance.now() - linked.t < 15000)) { if (reachable()) { linked = { path, ctl, t: performance.now() }; rlOpen(path); then(); } return; }
    transfer({ title: what || 'Go Online', kind: 'connect', ms: jitter(600, 1000), sub: path,
      steps: [{ t: `Connecting to the controller at ${path}…`, w: 3 }, { t: 'Checking the controller: type, revision and project…', w: 1 }],
      cancelled: () => toast('Connecting was cancelled.'),
      done: () => { if (!reachable()) { linked = null; return; } linked = { path, ctl, t: performance.now() }; rlOpen(path); then(); } });
  }
  /* Upload Tag Values: the controller's current values become the project's values (not an edit) */
  function uploadTags(say) {
    const p = ctl.upload(); if (!p) return;
    const take = (dst, src) => dst.forEach(t => { const x = src.find(y => y.name === t.name); if (x && x.value !== undefined && !t.alias) t.value = x.value; });
    take(S.p.tags, p.tags);
    allProgs().forEach(g => { const pg = p.tasks.flatMap(t => t.programs).find(y => y.name === g.name); if (pg) take(g.tags, pg.tags); });
    saveProject();
    if (say) toast('Tag values uploaded into the project.', 'ok');
  }
  /* Save: online with the same project, the reference asks whether to upload the tag values first */
  function saveCmd() {
    if (S.online && ctl.M && ctl.holds(S.p)) {
      dialog({ title: 'Save', body: '<p>Upload the tag values from the controller into the project before saving?</p>',
        buttons: [{ l: 'Cancel' }, { l: 'No', run: () => { setTimeout(() => (S.file && S.file.path ? writeTo(S.file.path) : saveFileAs()), 0); } }, { l: 'Yes', pri: true, run: () => { uploadTags(false); setTimeout(() => (S.file && S.file.path ? writeTo(S.file.path) : saveFileAs()), 0); } }] });
      return;
    }
    if (S.file && S.file.path) writeTo(S.file.path); else saveFileAs();
  }
  /* no controller at the path (empty slot, an I/O card, a card removed): like a terminal that finds nothing there */
  function reachable() {
    relink();
    const px = parsePath(curPath()), need = px && px.vbp ? 'vbp' : 'emulate';
    if (!driverUp(need)) {
      dialog({ title: 'Failed to go online', body: `<p>No ${need === 'vbp' ? 'Virtual Backplane' : 'Emulate Ethernet'} driver is running, so the path <b class="mono">${esc(curPath())}</b> cannot be reached.</p><p class="help">Add or start it in Communications &gt; Configure Drivers, or pick another path in Who Active.</p>`,
        buttons: [{ l: 'Close' }, { l: 'Configure Drivers…', pri: true, run: () => { setTimeout(configureDrivers, 0); } }] });
      return false;
    }
    if (ctl !== NOCTL) return true;
    const x = resolve(curPath()) || {};
    const why = !x.rack ? (x.vbp ? 'The emulator has no chassis.' : `No emulated controller is on at the address ${esc(x.ip || '?')}.`)
      : !x.m ? `Slot ${x.slot} of chassis ${esc(x.rack.name)} is empty.`
        : !x.m.ctl ? `Slot ${x.slot} holds an I/O card (${esc(x.m.type)}), not a controller.`
          : `The controller in slot ${x.slot} (${esc(x.m.name)}) is off.`;
    rlRefused(curPath());
    dialog({ title: 'Failed to go online', body: `<p>No controller answers at the path <b class="mono">${esc(curPath())}</b>.</p>
        <p class="help">${why} Pick a controller in Who Active, or add or turn one on in the Emulator.</p>`,
      buttons: [{ l: 'Close' }, { l: 'Emulator…', run: () => { setTimeout(chassisMonitor, 0); } }, { l: 'Who Active…', pri: true, run: () => { setTimeout(whoActive, 0); } }] });
    return false;
  }
  function download() {
    // verify first (offline, nothing to connect for), then open the path
    reverify();
    if (S.verify.errors.length) { download2(); return; }
    connect(download2, 'Download');
  }
  function download2() {
    reverify();
    if (S.verify.errors.length) {
      if (S.layout === 'desktop') S.prefs.err = true; else if (S.layout === 'tablet') S.errOpen = true; else S.area = 'more';
      render();
      toast(`Fix ${S.verify.errors.length} error(s) before downloading.`, 'err');
      return;
    }
    const tx = resolve(curPath());
    if (tx && tx.slot !== ctlSlot()) {
      dialog({ title: 'Download', body: `<p><b>Failed to download.</b> The controller of the project is in slot <b>${ctlSlot()}</b>, but the controller at the path <b class="mono">${esc(curPath())}</b> is in slot <b>${tx.slot}</b>.</p><p class="help">Change the slot in Controller Properties, or pick the controller in slot ${ctlSlot()} in Who Active.</p>`,
        buttons: [{ l: 'Close' }, { l: 'Controller Properties…', run: () => { setTimeout(() => controllerProps(), 0); } }, { l: 'Who Active…', pri: true, run: () => { setTimeout(whoActive, 0); } }] });
      return;
    }
    if (!emuCtl(S.p)) {
      dialog({ title: 'Download', body: `<p><b>Failed to download.</b> The project is for a <b>${esc(ctlLabel(S.p))}</b> controller, but the controller at the path <b class="mono">${esc(curPath())}</b> is a <b>PLC-CPU 1.0</b>.</p><p class="help">The controller type and revision of the project must match the controller. Change Controller in Controller Properties to PLC-CPU to download to the emulator.</p>`,
        buttons: [{ l: 'Close' }, { l: 'Controller Properties…', pri: true, run: () => { setTimeout(() => controllerProps(), 0); } }] });
      return;
    }
    dialog({ title: 'Download', body: `<p>Download to the controller:</p>${kv('Name', esc(ctl.name || '(no project)'))}${kv('Type', 'PLC-CPU 1.0')}${kv('Slot', ctlSlot())}${kv('Path', esc(curPath()))}${kv('Mode', MODE())}
        <p>${ctl.name ? `The project in the controller (<b>${esc(ctl.name)}</b>) will be replaced by <b>${esc(S.p.controller.name)}</b>.` : `<b>${esc(S.p.controller.name)}</b> will be downloaded.`} ${RUNM() ? 'The controller goes to Remote Program first.' : ''}</p>`,
      buttons: [{ l: 'Cancel', run: () => { linked = null; } }, { l: 'Download', pri: true, run: () => {
        if (ctl.key === 'RUN') { toast('The key switch is in RUN: turn it to REM to download.', 'err'); return false; }
        const wasRun = ctl.running;
        if (wasRun) ctl.setMode('remprog');
        const x = xferSteps(S.p, 'Downloading'), to = ctl, copy = JSON.parse(JSON.stringify(S.p, S.p.noDocs ? (k, v) => (k === 'desc' || k === 'c' ? undefined : v) : undefined));
        let r = null, cleared = false;
        // "Before a project is downloaded, the memory of the controller is cleared" (v37 help, Download dialog box)
        x.st[0].run = () => { if (ctl === to) { to.clearMemory(); cleared = true; saveChassis(); } };
        // the controller takes the project at Verifying: from there the transfer cannot be cancelled
        x.st.push({ t: 'Verifying…', w: 2, fixed: true, run: () => {
          if (ctl !== to) { toast('The controller stopped answering: the download failed.', 'err'); return false; }
          r = ctl.download(copy);
          if (!r.ok) { toast(r.lines[r.lines.length - 1] || 'Download failed.', 'err'); return false; }
          S.ed = null;
          // the cards of the chassis answer at once
          chassis.advance(0);
          saveChassis();
        } });
        setTimeout(() => transfer({ title: 'Downloading', kind: 'download', ms: x.ms, sub: `To ${curPath()}`, steps: x.st, doneText: 'Download complete',
          cancelled: () => {
            linked = null;
            if (!cleared) { toast('Download cancelled. The project in the controller was not changed.'); return; }
            if (S.online) { S.online = false; commLed(); }
            render(); live(true);
            toast('Download cancelled. The controller memory was cleared before the download: the controller holds no project now.', 'err');
          },
          done: () => {
            online();
            if (wasRun && ctl.key === 'REM') confirmDlg('Download', 'Done. Return the controller to Remote Run?', 'Yes', () => { setMode('remrun'); });
          } }), 0);
      } }] });
  }
  const RUNM = () => ctl.mode === 'run' || ctl.mode === 'remrun';
  /* Accept Pending Edits: in Run the edits go to the controller as accepted (not running yet); in Program they are
     finalized at once */
  function acceptEdits() {
    reverify();
    if (S.verify.errors.length) {
      if (S.layout === 'desktop') S.prefs.err = true; else if (S.layout === 'tablet') S.errOpen = true; else S.area = 'more';
      render();
      toast(`Fix ${S.verify.errors.length} error(s) before accepting the edits.`, 'err');
      return;
    }
    if (S.ed && S.ed.ctl === ctl && S.ed.tested) { toast('Assemble or untest the edits being tested first.', 'err'); return; }
    // accepting verifies the edits: their dirty marks go
    eachRoutine(S.p, r => r.rungs.forEach(x => { delete x.dx; }));
    if (ctl.running) {
      // the pending zones become accepted ones: i → I (insert zone), r → R (replace zone); the controller still runs the old logic
      eachRoutine(S.p, r => r.rungs.forEach(x => { if (x.z === 'i') x.z = 'I'; else if (x.z === 'r') x.z = 'R'; }));
      S.ed = { ctl, orig: S.ed && S.ed.ctl === ctl ? S.ed.orig : ctl.copy, base: JSON.stringify(S.p), tested: false };
      S.undo = []; S.redo = [];
      S.dirty = true; saveProject();
      toast('Edits accepted. The controller still runs the old logic: Test Accepted Edits to run them.', 'ok');
    } else {
      // in Program the new rungs replace the originals at once
      const nl = newLogic(S.p), r = ctl.edit(JSON.parse(JSON.stringify(nl)));
      if (!r.ok) { toast(r.lines[r.lines.length - 1] || 'The edits were not accepted.', 'err'); return; }
      S.p = nl; S.ed = null; S.undo = []; S.redo = [];
      S.dirty = true; reverify(); saveProject();
      toast('Edits accepted and finalized in the controller.', 'ok');
    }
    live(true); render();
  }
  /* Test Accepted Edits: the controller runs the new logic (insert zones, not the replace and delete zones); the old one is kept for Untest */
  function testEdits() {
    confirmDlg('Test Accepted Edits', 'The controller will run the edited logic from the next scan. Test the accepted edits?', 'Test', () => {
      const r = ctl.edit(newLogic(JSON.parse(S.ed.base)));
      if (!r.ok) { toast(r.lines[r.lines.length - 1] || 'The edits could not be tested.', 'err'); return; }
      S.ed.tested = true; live(true); render();
      toast('Testing the edits: the controller runs the new logic.', 'ok');
    });
  }
  /* Untest Accepted Edits: back to the old logic; the edits stay accepted */
  function untestEdits() {
    const r = ctl.edit(JSON.parse(S.ed.orig));
    if (!r.ok) { toast('Could not go back to the old logic.', 'err'); return; }
    S.ed.tested = false; live(true); render();
    toast('Untested: the controller runs the old logic again.');
  }
  /* Assemble Accepted Edits: insert zones become normal rungs, the replace and delete zones are removed */
  function assembleEdits() {
    dialog({ title: 'Assemble Accepted Edits', body: '<p>Finalize all edits in program?</p><p class="help">The edited logic stays in the controller and the old logic is dropped.</p>', buttons: [{ l: 'No' }, { l: 'Yes', pri: true, run: () => {
      S.p = newLogic(S.p); S.ed = null; S.undo = []; S.redo = [];
      S.sel = null; S.selRung = rungs().length ? 0 : null;
      changed(); live(true);
      toast('Edits assembled.', 'ok');
    } }] });
  }
  /* Cancel Pending Edits: back to the accepted edits, or to the controller's logic */
  function cancelEdits() {
    const back = S.ed && S.ed.ctl === ctl ? S.ed.base : ctl.copy;
    confirmDlg('Cancel Pending Edits', 'Throw away the pending edits?', 'Cancel Edits', () => edit(() => { S.p = JSON.parse(back); S.sel = null; S.selRung = 0; }, true), true);
  }
  /* Cancel Pending Rung Edits on one rung: its copy (i) goes and its original (r) is a normal rung again */
  function cancelRungEdit(ri) {
    const R = rungs(), r = R[ri];
    if (!r || !/^[ir]$/.test(r.z || '')) { cancelEdits(); return; }
    edit(() => {
      const i = r.z === 'i' ? ri : R[ri - 1] && R[ri - 1].z === 'i' ? ri - 1 : -1, o = r.z === 'r' ? ri : R[ri + 1] && R[ri + 1].z === 'r' ? ri + 1 : -1;
      if (o >= 0) delete R[o].z;
      if (i >= 0) R.splice(i, 1);
      S.sel = null; S.selRung = Math.max(0, Math.min(i >= 0 ? i : ri, R.length - 1));
    }, true);
  }
  /* Start Pending Rung Edits: the rung is copied; the copy (i) is edited, the original (r) stays below it, read-only */
  function startRungEdit(ri) {
    const r = rungs()[ri];
    if (!r) return;
    if (r.z) { toast(`Rung ${ri} is already ${r.z === 'i' ? 'being edited' : 'an edit zone (' + r.z + ')'}.`, 'err'); return; }
    edit(() => { const o = { t: r.t, z: 'r' }; if (r.c) o.c = r.c; r.z = 'i'; rungs().splice(ri + 1, 0, o); S.sel = null; S.selRung = ri; }, true);
  }
  /* Cancel Accepted Edits: the accepted edits are removed; the project is the controller's again */
  function cancelAccepted() {
    const back = S.ed.orig;
    confirmDlg('Cancel Accepted Edits', 'Remove the accepted edits? The project goes back to the logic the controller runs.', 'Remove', () => { S.ed = null; edit(() => { S.p = JSON.parse(back); S.sel = null; S.selRung = 0; }, true); }, true);
  }
  function goOffline() { S.online = false; linked = null; rlClose(false); toast('Offline. The controller keeps running.'); render(); commLed(); }
  /* Communications > Select Recent Path (reference: go online using a recent communications path) */
  function recentPathDlg() {
    let sel = (S.prefs.paths || []).includes(curPath()) ? curPath() : (S.prefs.paths || [])[0];
    const rows = () => (S.prefs.paths || []).map(p => `<div class="row${p === sel ? ' on' : ''}" data-rpath="${esc(p)}">${ic('net')}<span class="grow mono ell">${esc(p)}</span>${p === curPath() ? '<span class="sub">project path</span>' : ''}</div>`).join('');
    const go = () => { setPath(sel); render(); if (S.online) { toast('Go Offline first, then go online at the other path.'); return; } setTimeout(goOnline, 0); };
    const el = dialog({ title: 'Select Recent Path', size: 'md',
      body: `<p class="help">The communications paths used last. Pick one to go online there.</p><div class="list" id="rpl">${rows()}</div>`,
      buttons: [{ l: 'Cancel' }, { l: 'Set Project Path', run: () => { setPath(sel); render(); toast(`Project path: ${sel}`); } }, { l: 'Go Online', pri: true, run: go }] });
    el.querySelector('#rpl').addEventListener('click', ev => {
      const r = ev.target.closest('[data-rpath]'); if (!r) return;
      if (r.dataset.rpath === sel && r.dataset.clicked) { closeLayer(); go(); return; }
      sel = r.dataset.rpath; el.querySelector('#rpl').innerHTML = rows();
      const n = el.querySelector(`[data-rpath="${CSS.escape(sel)}"]`); if (n) { n.dataset.clicked = '1'; setTimeout(() => { delete n.dataset.clicked; }, 450); }
    });
  }
  function setMode(m) { if (!ctl.setMode(m)) toast('The key switch does not allow that mode.', 'err'); live(true); render(); }
  /* Who Active: browse the emulated Ethernet like a communications driver: each controller that is on and has an IP
     address, then its chassis backplane; a controller picked there becomes the project path */
  function whoActive() {
    const modeOf = ctlMode;
    const pad = n => (n < 10 ? '0' + n : n);
    const cur = curPath();
    let sel = resolve(cur) && resolve(cur).ctl ? cur : null;
    // the tree as rows; a driver row (d) is still browsing while its rows are not all found; dev: a device answers
    const slotRows = (out, r, pathFn, ind) => {
      for (let n = 0; n < r.size; n++) {
        const m = r.module(n);
        if (!m) continue;
        if (!m.ctl) { out.push({ h: `<div class="nd dim" style="padding-left:${ind}px">${ic('io', 'i ti')}${pad(n)}, ${esc(m.type)} ${esc(m.name)}</div>`, dev: 1 }); continue; }
        const c = m.ctl, p = pathFn(n);
        if (!c.powered) { out.push({ h: `<div class="nd dim" style="padding-left:${ind}px">${ic('chip', 'i ti')}${pad(n)}, PLC-CPU ${esc(m.name)} · off</div>`, dev: 1 }); continue; }
        if (!sel) sel = p;
        out.push({ h: `<div class="nd${p === sel ? ' on' : ''}" data-wa="${esc(p)}" style="padding-left:${ind}px">${ic('chip', 'i ti')}${pad(n)}, PLC-CPU ${esc(m.name)} · ${esc(c.name || '(empty)')} · ${modeOf(c)}${p === cur ? ' <span class="muted">(project path)</span>' : ''}</div>`, dev: 1 });
      }
    };
    const list = () => {
      const out = [];
      drivers.filter(d => d.run).forEach(d => {
        if (d.type === 'vbp') {
          out.push({ h: `<div class="nd" style="padding-left:6px">${ic('online', 'i ti')}${esc(d.name)}, Virtual Backplane`, d: 1 });
          const r = racks[0];
          if (r) { out.push({ h: `<div class="nd" style="padding-left:20px">${ic('rack', 'i ti')}Virtual Chassis, ${esc(r.name)}</div>` }); slotRows(out, r, n => d.name + '\\' + n, 36); } else out.push({ h: '<div class="nd dim" style="padding-left:20px">No chassis in the emulator.</div>' });
        } else if (d.type === 'emulate') {
          out.push({ h: `<div class="nd" style="padding-left:6px">${ic('online', 'i ti')}${esc(d.name)}, Ethernet`, d: 1 });
          const seen = new Set();
          racks.forEach(r => r.controllers().forEach(gm => {
            if (!gm.ip || !gm.ctl.powered || seen.has(gm.ip)) return;
            seen.add(gm.ip);
            out.push({ h: `<div class="nd" style="padding-left:20px">${ic('chip', 'i ti')}${gm.ip}, PLC-CPU ${esc(gm.name)}</div>`, dev: 1 }, { h: `<div class="nd" style="padding-left:36px">${ic('rack', 'i ti')}Backplane, ${esc(r.name)}</div>` });
            slotRows(out, r, n => pathOf(gm.ip, n), 52);
          }));
          if (!seen.size) out.push({ h: '<div class="nd dim" style="padding-left:20px">No emulated controller is on with an IP address.</div>' });
        }
      });
      return out;
    };
    // Browse: the rows come in one by one, as a driver finds the nodes on its network (150-400 ms a device)
    let shown = 0, btimer = 0, auto = true, last = '', lastSt = '';
    const rows = all => {
      if (!all.length) return '<div class="nd dim" style="padding-left:6px">No communications driver: Communications &gt; Configure Drivers</div>';
      const n = Math.min(shown, all.length);
      return all.slice(0, n).map((x, i) => {
        if (!x.d) return x.h;
        let stop = all.length;
        for (let j = i + 1; j < all.length; j++) if (all[j].d) { stop = j; break; }
        return x.h + (n < stop ? ' <span class="browsing"><i class="spin"></i>Browsing…</span>' : '') + '</div>';
      }).join('');
    };
    const pick = () => (sel ? resolve(sel) : null);
    const info = () => {
      const x = pick();
      if (!x || !x.ctl) return 'Pick a controller. An emulated controller answers only when it is on.';
      const c = x.ctl;
      return `Path: <b class="mono">${esc(sel)}</b>. ${c.holds(S.p) ? 'It holds this project.' : c.name ? `It holds <b>${esc(c.name)}</b>${U(c.name) === U(S.p.controller.name) ? ' (another version)' : ''}: Upload or Download.` : 'It is empty: Download this project.'}${x.slot !== ctlSlot() ? ` <span style="color:var(--danger)">The project's controller is in slot ${ctlSlot()}; this one is in slot ${x.slot}.</span>` : ''}`;
    };
    // the picked controller becomes the project path, then the action runs against it
    const via = fn => () => { const x = pick(); if (!x || !x.ctl) { toast('Pick a controller first.', 'err'); return false; } setPath(sel); setTimeout(fn, 0); };
    let atimer = 0;
    list(); // picks the first controller that answers when the project path has none
    const stopAll =() => { if (btimer) { clearTimeout(btimer); btimer = 0; busyComm(-1); } clearInterval(atimer); };
    const el = dialog({ title: 'Who Active', size: 'md',
      body: `<div class="wabar"><label class="rlck"><input type="checkbox" id="wa-auto" checked>Autobrowse</label><button class="btn" id="wa-ref">Refresh</button><span class="grow"></span><span class="muted ell" id="wa-st"></span></div>
        <div class="tree" id="wa" style="border:1px solid var(--border);border-radius:var(--r)"><div class="nd">${ic('chip', 'i ti')}Workstation, MT PLC Studio</div><div id="wa-rows"></div></div>
        <p class="help" id="wa-i">${info()}</p>`,
      onClose: stopAll,
      buttons: [{ l: 'Close', run: stopAll }, { l: 'Emulator…', run: () => { stopAll(); setTimeout(chassisMonitor, 0); } }, { l: 'Set Project Path', run: () => { const x = pick(); if (!x || !x.ctl) return false; setPath(sel); render(); toast(`Project path: ${sel}`); return false; } },
        { l: 'Upload…', run: () => { stopAll(); return via(upload)(); } }, { l: 'Download…', run: () => { stopAll(); return via(download)(); } }, { l: 'Go Online', pri: true, run: () => { stopAll(); return via(goOnline)(); } }] });
    const draw = () => {
      const all = list(), h = rows(all), st = shown < all.length ? browseSt(shown > 0 && all[shown - 1].h.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, '')) : auto ? 'Browsing - done' : 'Not browsing';
      if (h !== last) { el.querySelector('#wa-rows').innerHTML = h; last = h; }
      if (st !== lastSt) { el.querySelector('#wa-st').textContent = st; lastSt = st; }
    };
    const step = () => {
      btimer = 0;
      if (!el.isConnected) { busyComm(-1); return; }
      const all = list();
      shown++;
      if (shown >= all.length) { shown = Infinity; busyComm(-1); draw(); return; }
      draw();
      const nx = all[shown];
      btimer = setTimeout(step, nx && nx.dev ? jitter(150, 400) : jitter(80, 150));
    };
    const browse = () => {
      if (btimer) { clearTimeout(btimer); btimer = 0; busyComm(-1); }
      if (fastComm()) { shown = Infinity; draw(); return; }
      shown = 1; busyComm(1); draw();
      btimer = setTimeout(step, jitter(150, 300));
    };
    // Autobrowse: a quiet check each second; the rows change only when the network does (no browse again)
    atimer = setInterval(() => { if (!el.isConnected) { stopAll(); return; } if (auto && shown === Infinity) draw(); }, 1000);
    el.querySelector('#wa').addEventListener('click', ev => {
      const r = ev.target.closest('[data-wa]'); if (!r) return;
      sel = r.dataset.wa;
      draw(); el.querySelector('#wa-i').innerHTML = info();
    });
    el.querySelector('#wa-ref').addEventListener('click', browse);
    el.querySelector('#wa-auto').addEventListener('change', ev => { auto = ev.target.checked; draw(); });
    browse();
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
  const refreshIO = () => { const iob = $('#iob'); if (iob) { iob.innerHTML = iob.classList.contains('dockb') ? dockBody() : ioHTML(); iob._mh = null; } chassisLive(true); };

  /* ---------- the emulator dock (P1): the chassis of the project path beside the ladder, sized by a splitter ----------
     bottom (desktop, tablet portrait), side (tablet landscape, phone landscape), full (the phone's Emulator tab).
     The modules keep their size; every slot of the chassis shows, in one row that scrolls sideways when it must. */
  function dockBody() {
    const ri = Math.max(0, racks.indexOf(chassis));
    const cs = chassis.controllers();
    return rackHTML(ri) + `<div class="dockst">${cs.map(m => { const c = m.ctl, id = ri + ':' + m.slot; return `<span class="dkc"><b>[${m.slot}] ${esc(m.name)}</b> ${c.powered ? modeName(c) : 'Off'}${c.single ? ' · Single Scan' : ''}<span class="seg">${[['RUN', 'Run'], ['REM', 'Rem'], ['PROG', 'Prog']].map(([k, t]) => `<span data-emode="${id}:${k}" class="${c.key === k ? 'on' : ''}">${t}</span>`).join('')}</span></span>`; }).join('') || '<span class="muted">No controller in this chassis.</span>'}</div>`;
  }
  /* the emulator panel: on the right in landscape and at the bottom in portrait, unless it was moved; it can be
     folded to a thin bar (like the organizer) and opened again from there */
  const dockSide = portrait => (portrait ? 'bottom' : S.prefs.dockAt === 'bottom' ? 'bottom' : S.prefs.dockAt === 'right' ? 'side' : innerWidth > innerHeight ? 'side' : 'bottom');
  function dockHTML(where) {
    if (S.prefs.emuMin && where !== 'full') {
      return `<div class="dock ${where} min" id="dock"><button class="dkbar" data-dkmin="0" title="Show the emulator panel">${ic(where === 'side' ? 'left' : 'up')}<b>Emulator</b><span class="muted">${esc(chassis.name)}</span></button></div>`;
    }
    const P = S.prefs, size = where === 'bottom' ? `height:${S.layout === 'tablet' ? P.emuHp : P.emuH}px` : where === 'side' ? `width:${P.emuW}px` : '';
    const pick = racks.length > 1 ? `<select class="inp dksel" data-dkr="1" aria-label="Chassis">${racks.map((r, i) => `<option value="${i}"${r === chassis ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>` : `<span class="muted">${esc(chassis.name)} · ${chassis.size} slots</span>`;
    return `${where === 'full' ? '' : `<div class="split ${where}" data-split="${where}" title="Drag to resize"></div>`}<div class="dock ${where}" id="dock" style="${size}">
      <div class="ph"><b>Emulator</b>${pick}<span class="grow"></span><button class="ib" data-cmd="chassis" title="Emulator dashboard (Device Status, chassis, snapshots)">${ic('gear')}</button>${S.layout !== 'phone' ? `<button class="ib" data-dkpop="1" title="Open in its own window">${ic('goto')}</button>` : ''}${where === 'full' ? '' : `${innerWidth > innerHeight ? `<button class="ib" data-dkat="${where === 'side' ? 'bottom' : 'right'}" title="${where === 'side' ? 'Move the panel under the ladder' : 'Move the panel to the right of the ladder'}">${ic(where === 'side' ? 'dockb' : 'dockr')}</button>` : ''}<button class="ib" data-dkmin="1" title="Fold the emulator panel">${ic(where === 'side' ? 'right' : 'down')}</button>`}</div>
      ${emuMenuBar('dock')}<div class="dockb" id="iob">${dockBody()}</div><div class="emst" id="emst-dock">${emuStatus(Math.max(0, racks.indexOf(chassis)))}</div></div>`;
  }
  /* the Chassis Monitor menu bar (Logix Emulate, LGEM5K-GR016M chapters 3-5): Slot > Create Module / Remove Module /
     Properties, View, Options, All Modules > Run / Program, Help; the right-click menus stay as they are */
  const EMUMENUS = ['File', 'Slot', 'View', 'Options', 'All Modules', 'Help'];
  const emuMenuBar = where => `<div class="emb" role="menubar">${EMUMENUS.map(n => `<button type="button" data-emb="${where}:${n}">${n}</button>`).join('')}</div>`;
  function emuMenu(el) {
    const [where, name] = el.dataset.emb.split(':'), doc = el.ownerDocument, was = emuOpen();
    const ri = where === 'dock' ? Math.max(0, racks.indexOf(chassis)) : Math.min(emuSel.ri || 0, racks.length - 1), r = racks[ri];
    const used = [...r.mods.keys()].sort((a, b) => a - b), free = Array.from({ length: r.size }, (_, s) => s).filter(s => !r.module(s));
    const cur = emuSel.k === 'm' && emuSel.ri === ri && r.module(emuSel.slot) ? emuSel.slot : null;
    const P = S.prefs, tog = k => () => { P[k] = !P[k]; savePrefs(); chassisLive(true); render(); backToEmu(was); };
    const items = {
      File: [{ l: 'Chassis Properties…', i: 'gear', run: () => chassisProps(ri, 'gen', was) }, '-', { l: where === 'dock' ? 'Close the Emulator Panel' : 'Close', run: () => { if (where === 'dock') { P.emuMin = true; savePrefs(); render(); } else if (doc !== document) doc.defaultView.close(); else closeLayer(); } }],
      Slot: [{ l: 'Create Module…', i: 'plus', dis: !free.length, run: () => insertCard(ri, free[0]) }, { l: 'Remove Module…', i: 'trash', dis: !used.length, run: () => removeModuleDlg(ri, cur, was) }, '-',
        { l: 'Properties…', i: 'gear', dis: cur == null, run: () => { emuSel = { k: 'm', ri, slot: cur }; if (r.module(cur).ctl) { emuProps(ri + ':' + cur, 'gen', was); return; } if (was || chasWin) { chassisLive(true); backToEmu(was); } else chassisMonitor(); } }],
      View: [{ l: 'Compact', ck: !!P.emuCompact, run: tog('emuCompact') }, { l: 'Hide Slots 9-16', ck: false, dis: true }],
      Options: [{ l: 'Clear Configuration on Remove', ck: !!P.clearOnRemove, run: tog('clearOnRemove') }, { l: 'Always On Top', ck: false, dis: true }, { l: 'Auto Refresh Rate', dis: true }],
      'All Modules': [{ l: 'Run…', dis: !r.controllers().length, run: () => allModes(ri, 'RUN', was) }, { l: 'Program…', dis: !r.controllers().length, run: () => allModes(ri, 'PROG', was) }],
      Help: [{ l: 'Help Topics', i: 'help', run: () => run('tips') }, { l: 'About MT PLC Studio', i: 'info', run: () => run('about') }] }[name];
    openMenu(items, doc === document ? el : { x: 40, y: 80 }, name);
    if (doc !== document) window.focus();
  }
  /* Slot > Remove Module: pick the slot, then a prompt confirms the removal (cannot be undone) */
  function removeModuleDlg(ri, cur, was) {
    const r = racks[ri], used = [...r.mods.keys()].sort((a, b) => a - b);
    dialog({ title: 'Remove Module', size: '', focus: true,
      body: `<div class="frow"><label>Slot</label><select class="inp" id="rmm-s">${used.map(s => `<option value="${s}"${s === cur ? ' selected' : ''}>${s}: ${esc(r.module(s).type)} ${esc(r.module(s).name)}</option>`).join('')}</select></div>`,
      buttons: [{ l: 'Cancel', run: () => backToEmu(was) }, { l: 'OK', pri: true, run: e2 => {
        const s = +e2.querySelector('#rmm-s').value, m = r.module(s);
        if (!m) return;
        setTimeout(() => {
          if (m.ctl) { removeCpu(ri, s, was); return; }
          dialog({ title: 'Remove Module', size: '', body: `<p>Remove <b>[${s}] ${esc(m.type)} ${esc(m.name)}</b> from the virtual chassis ${esc(r.name)}? This cannot be undone.</p>`,
            buttons: [{ l: 'Cancel', run: () => backToEmu(was) }, { l: 'OK', danger: true, run: () => { r.remove(s); r.advance(0); emuSel = { k: 'r', ri }; saveChassis(); refreshIO(); live(true); backToEmu(was); } }] });
        }, 0);
      } }] });
  }
  /* All Modules > Run / Program: every emulated controller of the chassis is ticked; clear the ones to leave as they are */
  function allModes(ri, k, was) {
    const r = racks[ri], cs = r.controllers(), t = k === 'RUN' ? 'Run' : 'Program';
    dialog({ title: `${t} Mode`, size: '',
      body: `<p style="margin-top:0">Put these emulated controllers in ${t} mode:</p>${cs.map(m => `<label class="frow" style="grid-template-columns:auto 1fr"><input type="checkbox" data-amod="${m.slot}" checked><span>Slot ${m.slot}: ${esc(m.name)}</span></label>`).join('')}`,
      buttons: [{ l: 'Cancel', run: () => backToEmu(was) }, { l: 'OK', pri: true, run: e2 => {
        e2.querySelectorAll('[data-amod]').forEach(b => { if (b.checked) r.controller(+b.dataset.amod).setKey(k); });
        saveChassis(); chassisLive(true); live(true); render(); backToEmu(was);
      } }] });
  }
  /* ---------- Emulator dashboard (spec section 15), laid out like a PC emulator's dashboard ----------
     Devices pane: the chassis and their cards. Details: the Controller pane (name, description, IP address, power),
     a chassis (name, description, its rack of cards) or an I/O card. Device Status: every emulated controller with its
     power switch, mode (Run / Remote / Program), RUN and OK lights and fault message. */
  const CARDNAMES = Object.assign({ 'PLC-CPU': 'Emulated controller' }, MODNAMES);
  let chasWin = null, emuSel = { k: 'r', ri: 0 };
  const modeName = c => (c.fault ? 'Faulted' : { prog: 'Program', run: 'Run', remprog: 'Rem Prog', remrun: 'Rem Run', remtest: 'Rem Test' }[c.mode]);
  const led = (on, t, cls) => `<div class="cled"><i class="led ${on ? cls || 'g' : ''}"></i>${t}</div>`;
  /* the chassis as hardware: a power supply on the left, rails with screws, a backplane connector in each empty slot,
     and modules plugged into the slots. An I/O module has its status LEDs and a terminal block (screw terminals, where
     field devices will be wired); its points are worked in the Module I/O window (right-click or long-press, or I/O),
     as in the reference emulator */
  const rtbOpen = new Set();   // the I/O cards ('rack:slot') whose RTB door is open: UI state only
  /* the 20-pin RTB of a 1756 digital module, as its wiring diagram has it (1756-UM058): pin 1 at the top right, the
     even pins in the left column and the odd ones in the right. On the card the two halves (pins 1-10 and 11-20) stand
     side by side, each as on the RTB (even left, odd right), so the card keeps its size. A screw shows its pin
     number; its signal (IN-0, GND-0, …) is in its title. 1756-OW16I has a 36-pin RTB and is not one of these. */
  const rtbPins = (a, g) => { const p = {}; for (let i = 0; i < 8; i++) { p[i + 1] = a + '-' + i; p[i + 11] = a + '-' + (i + 8); } return Object.assign(p, g); };
  const RTBPINS = {
    'PLC-DI16-24V': rtbPins('IN', { 9: 'GND-0', 10: 'GND-0', 19: 'GND-1', 20: 'GND-1' }),             // 1756-IB16
    'PLC-DI16-120V': rtbPins('IN', { 9: 'L2-0', 10: 'L2-0', 19: 'L2-1', 20: 'L2-1' }),                // 1756-IA16
    'PLC-DO16-24V': rtbPins('OUT', { 9: 'RTN OUT-0', 10: 'DC-0(+)', 19: 'RTN OUT-1', 20: 'DC-1(+)' }), // 1756-OB16E
  };
  const rtb20 = pins => `<div class="mterm rtb20" aria-label="Terminal block, 20 pins">${[0, 1, 2, 3, 4].map(r => [2 * r + 2, 2 * r + 1, 2 * r + 12, 2 * r + 11].map(n => {
    const l = pins[n], com = !/^(IN|OUT)-/.test(l);
    return `<span class="scr${com ? ' com' : ''}" data-pin="${n}" title="Pin ${n}: ${esc(l)}" aria-label="Pin ${n}, ${esc(l)}"><i></i><b>${n}</b></span>`;
  }).join('')).join('')}</div>`;
  function cardHTML(ri, s) {
    const r = racks[ri], m = r.module(s), id = ri + ':' + s;
    if (!m) return `<div class="ccard empty" data-cins="${id}" title="Plug a module into slot ${s}"><span class="bpc" aria-hidden="true"></span><span class="cplus">${ic('plus')}</span><small>Empty</small></div>`;
    const tail = `<div class="cbtns">${m.ctl ? '' : `<button class="btn" data-cio="${id}" title="Module I/O: the points of this module">I/O</button><button class="btn" data-cfault="${id}">${m.fault ? 'Clear' : 'Fault'}</button>`}<button class="btn" data-crem="${id}" title="Pull the module out" aria-label="Remove module">${ic('trash')}</button></div>`;
    if (m.ctl) {
      const c = m.ctl, run = c.powered && c.running, fs = c.forceState();
      const disp = !c.powered ? '' : c.fault ? 'FLT' : { prog: 'PROG', run: 'RUN', remprog: 'PROG', remrun: 'RUN', remtest: 'TEST' }[c.mode];
      return `<div class="ccard cpu${c.powered ? '' : ' off'}" data-esel="m:${id}" data-ccpu="${id}">
        <div class="mf"><div class="mcat">PLC-CPU</div><div class="mdisp">${disp}</div>
          <div class="mleds">${led(run, 'RUN')}${led(c.powered && fs !== 'none', 'FORCE', fs === 'enabled' ? 'a' : 'a blink')}${led(c.powered && c.M, 'I/O', c.ioOk() ? 'g' : 'r blink')}${led(c.powered, 'OK', c.fault ? 'r blink' : 'g')}</div>
          <div class="mname">${esc(m.name)}</div><div class="mip">${esc(m.ip || 'no IP')}</div>
          <div class="mproj">${c.name ? esc(c.name) : 'no project'}</div>
          <span class="seg ckey" title="Key switch">${['PROG', 'REM', 'RUN'].map(k => `<span data-emode="${id}:${k}" class="${c.key === k ? 'on' : ''}">${k === 'PROG' ? 'P' : k === 'REM' ? 'R' : 'RUN'}</span>`).join('')}</span></div>${tail}</div>`;
    }
    const own = r.owner(s), okc = m.fault ? 'r blink' : own && own.running ? 'g' : 'g blink';
    const n = m.kind === 'di' || m.kind === 'do' ? 16 : 4;
    const st = m.kind === 'di' ? m.field : m.kind === 'do' ? r.outputs(s) : null;
    const face = st != null ? `<div class="mmat" title="Status indicators: points 0-7 and 8-15">${Array.from({ length: 16 }, (_, b) => `<div><span>${b}</span><i class="${(st >> b) & 1 ? (m.kind === 'do' ? 'y' : 'g') : ''}"></i></div>`).join('')}</div>`
      : `<div class="mana">${(m.kind === 'ai' ? m.field : r.outputs(s)).map((v, c) => `<div><span>Ch${c}</span><b>${(+v).toFixed(1)}</b></div>`).join('')}</div>`;
    const com = m.kind === 'di' ? ['GND', 'GND'] : m.kind === 'do' ? ['DC+', 'RTN'] : ['RTN', 'RTN'];
    const lab = i => (m.kind === 'ai' || m.kind === 'ao' ? (i % 2 ? '-' : '+') + Math.floor(i / 2) : String(i));
    const pts = m.kind === 'ai' || m.kind === 'ao' ? 8 : n;
    const term = RTBPINS[m.type] ? rtb20(RTBPINS[m.type]) : `<div class="mterm" aria-label="Terminal block">${Array.from({ length: pts }, (_, i) => `<span class="scr" title="Terminal ${lab(i)}"><i></i><b>${lab(i)}</b></span>`).join('')}${com.map(c => `<span class="scr com"><i></i><b>${c}</b></span>`).join('')}</div>`;
    /* the RTB (removable terminal block) housing: its door is closed over the terminals, as on a 1756 module; a click
       or tap opens it on its side hinge and shows the terminals, another one closes it (kept per card, not in the project) */
    const open = rtbOpen.has(id);
    const rtb = `<div class="mrtb${open ? ' open' : ''}" data-rtb="${id}">${term}<button type="button" class="rtbdoor" data-rtb="${id}" aria-expanded="${open}" aria-label="${open ? 'Close' : 'Open'} the terminal block door of slot ${s}" title="${open ? 'Close' : 'Open'} the RTB door"><span class="rtblock" aria-hidden="true"></span><span class="rtbrib" aria-hidden="true"></span><b>${esc(m.type.replace('PLC-', ''))}</b><small>RTB</small></button></div>`;
    return `<div class="ccard io${m.fault ? ' flt' : ''}" data-esel="m:${id}" data-cmod="${id}"><div class="mf"><div class="mcat">${esc(m.type.replace('PLC-', ''))}</div><div class="mleds one">${led(true, 'OK', okc)}</div>${face}<div class="mname">${esc(m.name)}</div></div>${rtb}${tail}</div>`;
  }
  /* the chassis drawn as one row of slots, as in the Logix Emulate Chassis Monitor: a power supply, then every slot
     (4 or 8) side by side, each empty slot as big as a module. On a narrow screen the row scrolls sideways; it never
     wraps into a second row. */
  const rackHTML = ri => {
    const r = racks[ri], row = Array.from({ length: r.size }, (_, s) => s);
    return `<div class="chasrow"><div class="chas" style="--n:${row.length}" data-slots="${row.length}" data-chas="${ri}"><div class="rkps" aria-label="Power supply"><b>PS</b><i class="led g"></i><span>PWR</span><div class="vents"></div></div>
      <div class="rkbay"><div class="rkrail top">${row.map(() => '<i></i>').join('')}</div><div class="rkslots">${row.map(s => cardHTML(ri, s)).join('')}</div><div class="rkrail bot">${row.map(s => `<span>${s}</span>`).join('')}</div></div></div></div>`;
  };
  /* ---------- Module I/O window: the I/O of a chassis in one small window that stays open, inputs and outputs
     together. Each input point is a button that switches it; each output point lights while it is on; analog
     channels have a value box. The module that opened it is marked. ---------- */
  const ioWins = new Map();   // rack index → element
  function ioWinHTML(ri, focus) {
    const r = racks[ri];
    if (!r) return '<p class="help">The chassis is gone.</p>';
    const mods = [...r.mods.values()].filter(m => !m.ctl).sort((x, y) => x.slot - y.slot);
    if (!mods.length) return '<p class="help">No I/O modules in this chassis.</p>';
    const names = r === chassis && S.p ? aliasNames() : {};
    return mods.map(m => {
      const s = m.slot, dir = m.kind === 'di' || m.kind === 'ai' ? 'I' : 'O', inp = dir === 'I';
      const nm = b => names[U(`Local:${s}:${dir}.Data.${b}`)] || '';
      const head = `<div class="iomh"><b>[${s}] ${esc(m.name)}</b><span class="muted">${esc(m.type.replace('PLC-', ''))} · ${inp ? 'Inputs' : 'Outputs'}</span>${m.fault ? '<span class="iofl">Faulted</span>' : ''}</div>`;
      let body;
      if (m.kind === 'di' || m.kind === 'do') {
        const bits = inp ? m.field : r.outputs(s);
        body = `<div class="iobits">${Array.from({ length: 16 }, (_, b) => { const on = (bits >> b) & 1, t = `${dir === 'I' ? 'Input' : 'Output'} ${b}${nm(b) ? ' · ' + nm(b) : ''}: ${on ? 'ON' : 'OFF'}`;
          return inp ? `<button class="iob${on ? ' on' : ''}" data-iobit="${ri}:${s}:${b}" title="${esc(t)}" aria-pressed="${on ? 'true' : 'false'}">${b}</button>` : `<span class="iob out${on ? ' on' : ''}" title="${esc(t)}">${b}</span>`; }).join('')}</div>`;
      } else {
        const vals = inp ? m.field : r.outputs(s);
        body = `<div class="ioana">${vals.map((v, c) => inp
          ? `<label><span>Ch${c}</span><input class="inp num" type="number" step="0.5" value="${(+v).toFixed(1)}" data-anan="${ri}:${s}:${c}" aria-label="Channel ${c} value"></label>`
          : `<span><span>Ch${c}</span><b class="mono">${(+v).toFixed(1)}</b></span>`).join('')}</div>`;
      }
      return `<div class="iom${s === focus ? ' cur' : ''}" data-iom="${s}">${head}${body}</div>`;
    }).join('');
  }
  function openIoWin(id, doc, near) {
    const [ri, s] = ids(id), r = racks[ri];
    if (!r) return;
    doc = doc || document;
    let w = ioWins.get(ri);
    if (w && w.ownerDocument !== doc) { w.remove(); w = null; }
    if (!w) {
      const vw = doc.defaultView || window;
      w = doc.createElement('div');
      w.className = 'iowin'; w.dataset.iowin = String(ri);
      doc.body.appendChild(w);
      ioWins.set(ri, w);
      w.dataset.place = '1';
    }
    w.dataset.focus = String(s);
    w.innerHTML = `<div class="iowh" data-iodrag="1"><b>Module I/O · ${esc(r.name)}</b><span class="grow"></span><button class="ib" data-iox="${ri}" aria-label="Close">${ic('close')}</button></div><div class="iowb">${ioWinHTML(ri, s)}</div>`;
    if (w.dataset.place) {
      // first opening: beside the module (left of it if there is room, else right), inside the window
      delete w.dataset.place;
      const vw = doc.defaultView || window, ww = w.offsetWidth || 420, wh = w.offsetHeight || 200;
      const r = near && near.getBoundingClientRect ? near.getBoundingClientRect() : null;
      let x = r ? (r.left - ww - 12 >= 0 ? r.left - ww - 12 : r.right + 12) : vw.innerWidth - ww - 24, y = r ? r.top : 120;
      x = Math.max(4, Math.min(vw.innerWidth - ww - 4, x)); y = Math.max(4, Math.min(vw.innerHeight - wh - 4, y));
      w.style.left = x + 'px'; w.style.top = y + 'px';
    }
    const cur = w.querySelector('.iom.cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  function ioWinsLive() { ioWins.forEach((w, ri) => { if (!w.isConnected) { ioWins.delete(ri); return; } if (!w.contains(w.ownerDocument.activeElement) || !w.ownerDocument.activeElement.matches('input')) { const b = w.querySelector('.iowb'), st = b.scrollTop; setHTML(b, ioWinHTML(ri, +w.dataset.focus)); b.scrollTop = st; } }); }
  /* the Module I/O windows of one window (the app, or the Emulator window): close, input switches, analog values, dragging by the title */
  function bindIoWins(doc) {
    const vw = doc.defaultView;
    doc.addEventListener('click', ev => {
      const x = ev.target.closest('[data-iox]'); if (x) { const k = +x.dataset.iox, w = ioWins.get(k); if (w) w.remove(); ioWins.delete(k); return; }
      const b = ev.target.closest('[data-iobit]');
      if (b) { const p = ids(b.dataset.iobit), r = racks[p[0]], m = r && r.module(p[1]); if (m) { setPoint(p[1], p[2], !((m.field >> p[2]) & 1), r); live(true); } }
    });
    doc.addEventListener('change', ev => {
      const n = ev.target.closest && ev.target.closest('[data-anan]');
      if (n) anaSet(n.dataset.anan, +n.value);
    });
    doc.addEventListener('pointerdown', ev => {
      const h = ev.target.closest('[data-iodrag]'); if (!h || ev.target.closest('button')) return;
      const w = h.parentElement, sx = ev.clientX - w.offsetLeft, sy = ev.clientY - w.offsetTop;
      ev.preventDefault();
      const mv = e => { w.style.left = Math.max(0, Math.min(vw.innerWidth - 120, e.clientX - sx)) + 'px'; w.style.top = Math.max(0, Math.min(vw.innerHeight - 40, e.clientY - sy)) + 'px'; };
      const upf = () => { vw.removeEventListener('pointermove', mv); vw.removeEventListener('pointerup', upf); };
      vw.addEventListener('pointermove', mv); vw.addEventListener('pointerup', upf);
    });
  }
  function moduleMenu(id, x, y) {
    const [ri, s] = ids(id), r = racks[ri], m = r && r.module(s);
    if (!m) return;
    openMenu([{ l: 'Module I/O…', i: 'io', run: () => openIoWin(id) }, { l: m.fault ? 'Clear the fault' : 'Simulate a fault', i: 'fault', run: () => { r.setFault(s, !m.fault); r.advance(0); live(true); render(); refreshIO(); } }, '-', { l: 'Remove module', i: 'trash', run: () => chassisClick(Object.assign(document.createElement('div'), { closest: q => (q === '[data-crem]' ? { dataset: { crem: id } } : null) })) }], { x, y }, `[${s}] ${m.type} ${m.name}`);
  }
  /* Logix Emulate: right-click (or long-press) an emulated controller: its mode, Configure Emulation, Remove
     (LGEM5K-GR016M chapters 4 and 5) */
  const emuOpen = () => !!document.querySelector('#layer #emubody');
  const backToEmu = was => { if (was) setTimeout(() => { if (!emuOpen() && !$('#layer .dlg, #layer .menu')) chassisMonitor(); }, 0); };
  function cpuMenu(id, x, y) {
    const [ri, s] = ids(id), r = racks[ri], m = r && r.module(s), was = emuOpen();
    if (!m || !m.ctl) return;
    const c = m.ctl, key = k => () => { c.setKey(k); saveChassis(); chassisLive(true); live(true); render(); backToEmu(was); };
    openMenu([{ l: 'Program', ck: c.key === 'PROG', run: key('PROG') }, { l: 'Run', ck: c.key === 'RUN', run: key('RUN') }, { l: 'Remote', ck: c.key === 'REM', run: key('REM') },
      { l: 'Single Scan', ck: c.single, run: () => { c.singleScan(!c.single); asked.delete(c); chassisLive(true); live(true); render(); backToEmu(was); } }, '-',
      { l: 'Configure Emulation…', i: 'gear', run: () => configEmulation(id, was) }, { l: 'Properties…', i: 'info', run: () => emuProps(id, 'gen', was) }, '-',
      { l: 'Remove', i: 'trash', run: () => { chassisClick(Object.assign(document.createElement('div'), { closest: q => (q === '[data-crem]' ? { dataset: { crem: id } } : null) })); } }], { x, y }, `[${s}] PLC-CPU ${m.name}`);
  }
  /* Single Scan: when the one scan is done, a prompt asks to run the controller continuously or to scan once more */
  const asked = new WeakSet();
  function singleAsk() {
    for (const r of racks) for (const m of r.controllers()) {
      const c = m.ctl;
      if (!c.held) { asked.delete(c); continue; }
      if (asked.has(c)) continue;
      asked.add(c);
      const was = emuOpen();
      dialog({ title: 'Single Scan', size: '', modal: true,
        body: `<p>The single scan of <b>[${m.slot}] ${esc(m.name)}</b> is complete. Run the emulated controller continuously, or perform a single scan again?</p>`,
        buttons: [{ l: 'Run Continuously', run: () => { c.runContinuous(); asked.delete(c); chassisLive(true); live(true); backToEmu(was); } },
          { l: 'Single Scan', pri: true, run: () => { c.scanAgain(); asked.delete(c); live(true); backToEmu(was); } }] });
      return;
    }
  }
  /* Remove (an emulated controller): cannot be undone; the controller's configuration stays in place unless Clear
     module configuration is ticked (ticked at first with Options > Clear Configuration on Remove) */
  function removeCpu(ri, s, was) {
    const r = racks[ri], m = r && r.module(s);
    if (!m || !m.ctl) return;
    dialog({ title: 'Remove Module', size: '',
      body: `<p style="margin-top:0">Remove <b>[${s}] PLC-CPU ${esc(m.name)}</b> from the virtual chassis ${esc(r.name)}? This cannot be undone.</p>
        <label class="frow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="rm-clr"${S.prefs.clearOnRemove ? ' checked' : ''}><span>Clear module configuration</span></label>
        <p class="help">Not ticked: the configuration${m.ctl.name ? ` and the controller image (${esc(m.ctl.name)})` : ''} stay in place, and a controller created later in slot ${s} can use them. Ticked: both are deleted.</p>`,
      buttons: [{ l: 'Cancel', run: () => backToEmu(was) }, { l: 'OK', danger: true, run: e2 => {
        r.remove(s, !e2.querySelector('#rm-clr').checked); r.advance(0); emuSel = { k: 'r', ri }; saveChassis(); refreshIO(); live(true); backToEmu(was);
      } }] });
  }
  /* Configure Emulation: the Speed of Time area (slider in 1 % steps or the % box, Confirm Time % Change, 100% NOW,
     0% NOW; the last value set shows on the left). A change takes effect at once; 0 % stops execution. */
  function configEmulation(id, was) {
    const [ri, s] = ids(id), r = racks[ri], m = r && r.module(s);
    if (!m || !m.ctl) return;
    const c = m.ctl;
    const el = dialog({ title: 'Configure Emulation', size: 'md', onClose: () => backToEmu(was),
      body: `<p class="help" style="margin-top:0">[${s}] PLC-CPU <b>${esc(m.name)}</b> · ${esc(r.name)}</p>
        <fieldset class="sotf"><legend>Speed of Time</legend><input type="range" id="sot-r" min="0" max="100" step="1" value="${c.sot}" aria-label="Speed of time">
          <div class="sotrow"><span>Set: <b id="sot-cur">${c.sot}</b> %</span><span class="grow"></span><input class="inp num" id="sot-v" type="number" min="0" max="100" step="1" value="${c.sot}" aria-label="Speed of time percent"><span>%</span></div>
          <div class="sotrow"><button class="btn" data-sot="0">0% NOW</button><button class="btn" data-sot="100">100% NOW</button><span class="grow"></span><button class="btn pri" data-sot="ok">Confirm Time % Change</button></div></fieldset>
        <p class="help">100 % runs the logic in real time. A lower value slows the timers and the scan (60 %: one second takes about 1.67 s). 0 % stops program execution.</p>
        ${traceCfgHTML(c)}`,
      buttons: [{ l: 'Close', run: () => backToEmu(was) }] });
    bindTraceCfg(el, ri, s, () => configEmulation(id, was));
    const q = k => el.querySelector(k);
    const show = () => { q('#sot-cur').textContent = c.sot; q('#sot-r').value = c.sot; q('#sot-v').value = c.sot; };
    q('#sot-r').oninput = () => { q('#sot-v').value = q('#sot-r').value; };
    q('#sot-v').oninput = () => { q('#sot-r').value = q('#sot-v').value; };
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-sot]'); if (!b) return;
      const ok = b.dataset.sot === 'ok', v = ok ? +q('#sot-v').value : +b.dataset.sot;
      if ((ok && q('#sot-v').value === '') || !(v >= 0 && v <= 100)) { toast('Speed of time: 0 to 100 %.', 'err'); return; }
      r.setController(s, { sot: Math.round(v) }); saveChassis(); chassisLive(true); live(true);
      show(); toast(`Speed of time: ${c.sot} %.`, 'ok');
    });
  }
  /* ---------- Logix Emulate breakpoints, tracepoints and trace windows (LGEM5K-GR016M chapters 4, 9 and 11) ----------
     A trace window opens by itself the first time a BPT or TPT of a controller writes a trace (Display all new
     traces); its title bar holds the slot and the text of the Format before the colon. Freeze Display, Clear Display,
     Freeze Log (only while the trace is logged to disk). A triggered breakpoint stops the program and prompts; OK
     lets it run on. The traces, the settings and the log file are in Configure Emulation. */
  const trWins = new Map();   // 'rack:slot|title' → its window
  const trFrozen = new Set(), trSeen = new WeakMap(), bpAsked = new WeakSet();
  const trStamp = e => (e.t == null ? '' : `${String(e.t).padStart(8)} ms  `);
  const trTitle = (c, tr) => `Slot ${c.slot}: ${tr.head}`;
  const tlogOf = c => c.tlog || (c.tlog = { on: false, file: '', text: '', dirty: false, frozen: new Set() });
  const trKey = k => { const i = k.indexOf('|'), [ri, s] = ids(k.slice(0, i)), title = k.slice(i + 1); return { ri, s, title, c: racks[ri] && racks[ri].controller(s) }; };
  function trWinHTML(ri, s, title) {
    const c = racks[ri] && racks[ri].controller(s), tr = c && c.traces.get(title), k = ri + ':' + s + '|' + title;
    if (!tr) return '<p class="help">This trace was removed.</p>';
    const lg = tlogOf(c);
    return `<div class="trtags muted">Trace This: <span class="mono">${esc(tr.tags.join(', '))}</span></div><div class="trlist mono" data-trl="1">${trRows(tr)}</div>
      <div class="trbtns"><button class="btn${trFrozen.has(k) ? ' on' : ''}" data-trf="${esc(k)}" aria-pressed="${trFrozen.has(k)}">Freeze Display</button><button class="btn" data-trc="${esc(k)}">Clear Display</button><button class="btn${lg.frozen.has(title) ? ' on' : ''}" data-trg="${esc(k)}"${lg.on ? '' : ' disabled'}>Freeze Log</button></div>`;
  }
  const trRows = tr => tr.list.slice(-200).map(e => `<div>${esc(trStamp(e) + e.text)}</div>`).join('') || '<span class="muted">No traces.</span>';
  function openTrace(ri, s, title, doc) {
    const c = racks[ri] && racks[ri].controller(s), tr = c && c.traces.get(title);
    if (!tr) return;
    doc = doc || document;
    const k = ri + ':' + s + '|' + title;
    let w = trWins.get(k);
    if (w && !w.isConnected) w = null;
    if (!w) {
      w = doc.createElement('div'); w.className = 'iowin trwin'; w.dataset.trwin = k;
      doc.body.appendChild(w); trWins.set(k, w);
      const n = [...trWins.values()].filter(x => x.isConnected).length - 1, vw = doc.defaultView || window;
      w.style.left = Math.max(4, Math.min(vw.innerWidth - 360, 80 + n * 26)) + 'px'; w.style.top = Math.max(4, Math.min(vw.innerHeight - 260, 90 + n * 26)) + 'px';
    }
    w.innerHTML = `<div class="iowh" data-iodrag="1"><b class="ell">${esc(trTitle(c, tr))}</b><span class="grow"></span><button class="ib" data-trx="${esc(k)}" aria-label="Close">${ic('close')}</button></div><div class="iowb trb">${trWinHTML(ri, s, title)}</div>`;
    const l = w.querySelector('[data-trl]'); if (l) l.scrollTop = l.scrollHeight;
  }
  function closeTraces(c) { trWins.forEach((w, k) => { if (!c || trKey(k).c === c) { w.remove(); trWins.delete(k); } }); }
  /* each tick: new traces open their window and go to the log, a triggered breakpoint prompts, open windows follow */
  function tracesLive() {
    racks.forEach((r, ri) => r.controllers().forEach(m => {
      const c = m.ctl, seen = trSeen.get(c) || new Map(), lg = tlogOf(c);
      trSeen.set(c, seen);
      c.traces.forEach((tr, title) => {
        const was = seen.get(title), k = ri + ':' + m.slot + '|' + title;
        if (was !== tr.n) {
          if (was == null && c.tcfg.show) openTrace(ri, m.slot, title);
          if (lg.on && !lg.frozen.has(title)) { tr.list.slice(-Math.min(tr.list.length, tr.n - (was || 0))).forEach(e => { lg.text += `${trTitle(c, tr)}\t${trStamp(e)}${e.text}\r\n`; }); lg.dirty = true; }
          seen.set(title, tr.n);
        }
        // only the list follows (at most 8 times a second): the buttons stay in place under the pointer
        const w = trWins.get(k), now = performance.now();
        if (w && w.isConnected && !trFrozen.has(k) && +w.dataset.n !== tr.n && now - (+w.dataset.at || 0) >= 120) {
          w.dataset.n = String(tr.n); w.dataset.at = String(now);
          const l = w.querySelector('[data-trl]'); if (l) { l.innerHTML = trRows(tr); l.scrollTop = l.scrollHeight; }
        }
      });
      if (c.bp && !bpAsked.has(c.bp)) {
        const bp = c.bp; bpAsked.add(bp);
        const was = emuOpen(), ack = () => { if (c.bp === bp) c.resume(); live(true); backToEmu(was); };
        dialog({ title: `Slot ${m.slot}: ${bp.head}`, size: '', modal: true, onClose: ack,
          body: `<p style="margin-top:0" class="bptext">${esc(bp.text)}</p><div class="rlprops">${bp.tags.map((t, i) => kv(esc(t), esc(String(bp.vals[i])))).join('')}</div>
            <p class="help">The breakpoint of <b>${esc(m.name)}</b> stopped the program. The project cannot be edited until the execution goes on. OK lets the program run; it stops again while the condition holds.</p>`,
          buttons: [{ l: 'OK', pri: true, run: ack }] });
      }
    }));
  }
  // the trace log file is written about once a second
  setInterval(() => racks.forEach(r => r.controllers().forEach(m => { const lg = m.ctl.tlog; if (lg && lg.dirty && lg.file) { lg.dirty = false; FS.write(lg.file, lg.text).catch(e => toast('Could not write the trace log file: ' + (e.message || e), 'err')); } })), 1000);
  /* the trace area of Configure Emulation (LGEM5K-GR016M, Configure trace windows) */
  function traceCfgHTML(c) {
    const lg = tlogOf(c), list = [...c.traces.entries()];
    return `<fieldset class="sotf trcfg"><legend>Traces</legend>
      <label class="frow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="tr-ign"${c.tcfg.ignore ? ' checked' : ''}><span>Ignore If No Value Changed</span></label>
      <div class="frow"><label for="tr-ts">TimeStamp</label><select class="inp" id="tr-ts">${['None', 'Delta', 'Absolute'].map(t => `<option${t === c.tcfg.ts ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <label class="frow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="tr-show"${c.tcfg.show ? ' checked' : ''}><span>Display all new traces</span></label>
      <label class="frow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="tr-log"${lg.on ? ' checked' : ''}><span>Log new traces to disk</span></label>
      <div class="frow"><label>Trace Log File</label><span class="sotrow"><span class="mono ell" id="tr-file">${esc(lg.file || '(none)')}</span><span class="grow"></span><button class="btn" data-trbrowse="1">Browse…</button></span></div>
      <div class="lbl">Current traces <span class="muted">(double-click to open)</span></div><div class="trset" id="tr-list">${list.map(([t, tr]) => `<div class="row" data-tro="${esc(t)}"><span class="mono">${tr.kind}</span><span class="grow ell">${esc(tr.head)}</span><span class="muted">${tr.n}</span></div>`).join('') || '<div class="empty">No traces yet.</div>'}</div>
      <div class="sotrow wrap"><button class="btn" data-trall="1"${list.length ? '' : ' disabled'}>Display All Traces</button><button class="btn" data-trclose="1">Close All Traces</button><button class="btn" data-trrem="1"${list.length ? '' : ' disabled'}>Remove All Traces</button><button class="btn" data-trlogx="1"${lg.on ? '' : ' disabled'}>Close Log File</button></div></fieldset>`;
  }
  function bindTraceCfg(el, ri, s, reopen) {
    const c = racks[ri].controller(s), lg = tlogOf(c);
    const redraw = () => { const f = el.querySelector('.trcfg'); if (f) f.outerHTML = traceCfgHTML(c); };
    el.addEventListener('change', ev => {
      const t = ev.target;
      if (t.id === 'tr-ign') c.tcfg.ignore = t.checked;
      else if (t.id === 'tr-ts') c.tcfg.ts = t.value;
      else if (t.id === 'tr-show') c.tcfg.show = t.checked;
      else if (t.id === 'tr-log') { if (t.checked && !lg.file) { t.checked = false; toast('Browse to the trace log file first.', 'err'); return; } lg.on = t.checked; redraw(); return; }
      else return;
      saveChassis();
    });
    // Browse: the log file; a file that holds data is appended to or overwritten
    const pick = () => fileDialog({ mode: 'save', title: 'Trace Log File', name: lg.file ? baseName(lg.file) : 'traces.txt', types: ['txt'], onPick: async f => {
      let old = '';
      try { if (await FS.exists(f)) old = await FS.read(f); } catch (e) { old = ''; }
      const use = keep => { lg.file = f; lg.text = keep ? old : ''; lg.dirty = !keep; lg.on = true; setTimeout(reopen, 0); };
      if (old) setTimeout(() => dialog({ title: 'Trace Log File', size: '', body: `<p><b>${esc(baseName(f))}</b> already holds data. Append the traces to the end of the file, or overwrite it?</p>`, buttons: [{ l: 'Cancel', run: () => setTimeout(reopen, 0) }, { l: 'Overwrite', run: () => use(false) }, { l: 'Append', pri: true, run: () => use(true) }] }), 0);
      else use(false);
    } });
    el.addEventListener('click', ev => {
      const t = ev.target;
      if (t.closest('[data-trbrowse]')) { pick(); return; }
      if (t.closest('[data-trall]')) { c.traces.forEach((_, k) => openTrace(ri, s, k)); return; }
      if (t.closest('[data-trclose]')) { closeTraces(c); return; }
      if (t.closest('[data-trrem]')) { closeTraces(c); c.traces.clear(); trSeen.delete(c); redraw(); return; }
      if (t.closest('[data-trlogx]')) { if (lg.dirty && lg.file) { lg.dirty = false; FS.write(lg.file, lg.text).catch(() => {}); } lg.on = false; redraw(); toast('The trace log file is closed.', 'ok'); return; }
      const r = t.closest('[data-tro]');
      // double-click (on touch: a tap) a trace to open its window
      if (r) { el.querySelectorAll('[data-tro].on').forEach(x => x.classList.remove('on')); r.classList.add('on'); if (S.layout !== 'desktop' || (r.dataset.clk && performance.now() - +r.dataset.clk < 450)) openTrace(ri, s, r.dataset.tro); r.dataset.clk = String(performance.now()); }
    });
  }
  /* the buttons of a trace window */
  document.addEventListener('click', ev => {
    const t = ev.target, w = t.closest && t.closest('.trwin');
    if (!w) return;
    let x;
    if ((x = t.closest('[data-trx]'))) { w.remove(); trWins.delete(x.dataset.trx); return; }
    const k = (x = t.closest('[data-trf],[data-trc],[data-trg]')) && (x.dataset.trf || x.dataset.trc || x.dataset.trg), o = k && trKey(k);
    if (!o || !o.c) return;
    const tr = o.c.traces.get(o.title), lg = tlogOf(o.c);
    if (x.dataset.trf) { if (trFrozen.has(k)) trFrozen.delete(k); else trFrozen.add(k); }
    else if (x.dataset.trc) { if (tr) tr.list = []; }
    else if (lg.frozen.has(o.title)) lg.frozen.delete(o.title); else lg.frozen.add(o.title);
    openTrace(o.ri, o.s, o.title);
  });
  /* Properties of an emulated controller, on the emulator side. General and System hold the settings of the create
     wizard (LGEM5K-GR016M, Create a Studio 5000 Logix Emulate controller, steps 6 and 8): Version, Startup Mode,
     Memory Size, Periodic Save Interval, Use RSLinx Classic, Enable Periodic Save; Continuous Task Dwell Time, CPU
     Affinity, Channel 0 Serial Port. Emulator: speed of time, Single Scan, IP address, power. Debug: the trace
     settings and traces of Configure Emulation. */
  function emuProps(id, tab, was) {
    const [ri, s] = ids(id), r = racks[ri], m = r && r.module(s);
    if (!m || !m.ctl) return;
    const c = m.ctl, e = c.emu, chk = (i, on, t, dis) => `<label class="frow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="${i}"${on ? ' checked' : ''}${dis ? ' disabled' : ''}><span>${t}</span></label>`;
    const cpus = Math.max(1, Math.min(64, navigator.hardwareConcurrency || 1));
    const gen = `${kv('Module Type', 'PLC-CPU (emulated controller)')}${kv('Slot', s)}
      <div class="frow"><label for="ep-n">Name</label><input class="inp" id="ep-n" value="${esc(m.name)}" autocomplete="off" spellcheck="false"></div>
      <div class="frow"><label for="ep-d">Description</label><input class="inp" id="ep-d" value="${esc(m.desc || '')}"></div>
      <div class="frow"><label for="ep-v">Version</label><select class="inp" id="ep-v"><option>1.0</option></select></div>
      <div class="frow"><label for="ep-st">Startup Mode</label><select class="inp" id="ep-st"><option value="remprog"${e.startup === 'remprog' ? ' selected' : ''}>Remote Program</option><option value="last"${e.startup === 'last' ? ' selected' : ''}>Last Controller State</option></select></div>
      <div class="frow"><label for="ep-m">Memory Size (KB)</label><input class="inp num" id="ep-m" type="number" min="64" step="64" value="${m.mem || 3072}"></div>
      <div class="frow"><label for="ep-ps">Periodic Save Interval (min)</label><input class="inp num" id="ep-ps" type="number" min="1" max="1440" step="1" value="${e.psave}"></div>
      ${chk('ep-lx', e.linx, 'Use RSLinx Classic <span class="muted">(for internal communications)</span>')}${chk('ep-pson', e.psaveOn, 'Enable Periodic Save')}
      <p class="help">Remote Program: with the key switch in REM the controller always starts in Remote Program. Last Controller State: it starts in the mode it had. Periodic Save keeps the program, data and configuration every interval.</p>`;
    const sys = `<div class="frow"><label for="ep-dw">Continuous Task Dwell Time (ms)</label><input class="inp num" id="ep-dw" type="number" min="0" max="100" step="1" value="${e.dwell}"></div>
      <div class="frow"><label for="ep-cpu">CPU Affinity</label><select class="inp" id="ep-cpu">${Array.from({ length: cpus }, (_, n) => `<option value="${n}"${n === e.cpu ? ' selected' : ''}>CPU ${n}</option>`).join('')}</select></div>
      <div class="frow"><label for="ep-com">Channel 0 Serial Port</label><select class="inp" id="ep-com">${['', 'COM1', 'COM2', 'COM3', 'COM4'].map(p => `<option value="${p}"${p === e.com0 ? ' selected' : ''}>${p || '(none)'}</option>`).join('')}</select></div>
      <p class="help">The dwell time is the time between the end of the continuous task and its next start (0-100 ms, default 10): the time left for the other applications. The emulated controller runs on one CPU. A serial port emulates channel 0 of the controller.</p>`;
    const emu = `<div class="frow"><label>Speed of Time</label><span><b>${c.sot}</b> % <button class="btn" data-ecfg="${id}">Configure Emulation…</button></span></div>
      ${chk('ep-ss', c.single, 'Single Scan')}
      <div class="frow"><label for="ep-ip">IP Address</label><select class="inp" id="ep-ip"><option value=""${m.ip ? '' : ' selected'}>(none)</option>${EMUIPS.map(a => `<option${a === m.ip ? ' selected' : ''}>${a}</option>`).join('')}</select></div>
      ${chk('ep-on', c.powered, 'Controller on')}${kv('Mode', c.powered ? esc(modeName(c)) : 'Off')}${kv('Key switch', esc(c.key))}${kv('Holds', c.name ? esc(c.name) + (c.dlAt ? ' <span class="muted">· downloaded ' + esc(new Date(c.dlAt).toLocaleString()) + '</span>' : '') : '(no project)')}
      <p class="help">Speed of time and Single Scan are Logix Emulate only: a physical controller runs in real time.</p>`;
    const el = dialog({ title: `Module Properties - [${s}] PLC-CPU ${m.name}`, size: 'md', onClose: () => backToEmu(was),
      body: tabbed([['gen', 'General', gen], ['sys', 'System', sys], ['emu', 'Emulator', emu], ['dbg', 'Debug', traceCfgHTML(c)]], tab || 'gen'),
      buttons: [{ l: 'Cancel', run: () => backToEmu(was) }, { l: 'OK', pri: true, run: e2 => {
        const v = k => e2.querySelector(k).value.trim(), n = v('#ep-n');
        if (!E.validName(n)) { toast('Name: letters, digits and _ (up to 40).', 'err'); return false; }
        const err = c.setEmu({ startup: v('#ep-st'), psave: v('#ep-ps'), psaveOn: e2.querySelector('#ep-pson').checked, linx: e2.querySelector('#ep-lx').checked, dwell: v('#ep-dw'), cpu: +v('#ep-cpu'), com0: v('#ep-com') });
        if (err) { toast(err, 'err'); return false; }
        if (!(+v('#ep-m') >= 64)) { toast('Memory Size: 64 KB or more.', 'err'); return false; }
        r.setController(s, { name: n, desc: v('#ep-d'), mem: +v('#ep-m'), ip: v('#ep-ip'), on: e2.querySelector('#ep-on').checked });
        if (e2.querySelector('#ep-ss').checked !== c.single) c.singleScan(e2.querySelector('#ep-ss').checked);
        saveChassis(); chassisLive(true); live(true); render(); backToEmu(was);
      } }],
      mount: e2 => { bindTabs(e2); e2.addEventListener('click', ev => { const b = ev.target.closest('[data-ecfg]'); if (b) { ev.stopPropagation(); setTimeout(() => configEmulation(id, was), 0); } }); } });
    bindTraceCfg(el, ri, s, () => emuProps(id, 'dbg', was));
  }
  // Enable Periodic Save: the chassis (programs, data, configuration) is saved every Periodic Save Interval
  let lastPSave = Date.now();
  setInterval(() => { const due = racks.some(r => r.controllers().some(m => m.ctl.emu.psaveOn && Date.now() - lastPSave >= m.ctl.emu.psave * 60000)); if (due) { lastPSave = Date.now(); saveChassis(); } }, 15000);
  /* the Chassis Monitor's Computer box (hidden by View > Compact, LGEM5K-GR016M chapter 3) and its status bar: the
     selected module on the left; the slots in use, the controllers running and the slot of the RSLinx Classic module
     (Configure Virtual Backplane) on the right */
  const computerName = () => (location.hostname || 'localhost').toUpperCase();
  function emuStatus(ri) {
    const r = racks[ri];
    if (!r) return '<span class="grow">Ready</span>';
    const cs = r.controllers(), run = cs.filter(m => m.ctl.powered && m.ctl.running).length, d = drivers.find(x => x.type === 'vbp');
    const m = emuSel.k === 'm' && emuSel.ri === ri ? r.module(emuSel.slot) : null;
    const left = m ? `Slot ${m.slot}: ${m.ctl ? 'PLC-CPU' : m.type} ${m.name}${m.ctl ? ' · ' + (m.ctl.powered ? modeName(m.ctl) + (m.ctl.bp ? ' · Breakpoint' : '') : 'Off') : m.fault ? ' · Faulted' : ''}` : 'Ready';
    return `<span class="grow ell">${esc(left)}</span><span>${esc(r.name)}</span><span>${r.mods.size} of ${r.size} slots used</span><span>${run} of ${cs.length} controller${cs.length === 1 ? '' : 's'} running</span>${d ? `<span>RSLinx: ${esc(d.name)}, slot ${d.slot || 0}</span>` : ''}`;
  }
  /* chassis Properties (File > Chassis Properties…, or right-click the power supply): General (name, description,
     slots, computer) and Slots (what each slot holds) */
  function chassisProps(ri, tab, was) {
    const r = racks[ri];
    if (!r) return;
    const d = drivers.find(x => x.type === 'vbp');
    const gen = `<div class="frow"><label for="cp-n">Name</label><input class="inp" id="cp-n" value="${esc(r.name)}" autocomplete="off" spellcheck="false"></div>
      <div class="frow"><label for="cp-d">Description</label><input class="inp" id="cp-d" value="${esc(r.desc || '')}"></div>
      <div class="frow"><label for="cp-z">Slots</label><select class="inp" id="cp-z">${E.RACKS.concat(E.RACKS.includes(r.size) ? [] : [r.size]).map(n => `<option${n === r.size ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      ${kv('Computer', esc(computerName()))}${kv('Virtual Backplane', d ? `${esc(d.name)} · the RSLinx Classic module in slot ${d.slot || 0}` : 'No Virtual Backplane driver (RSLinx Classic > Configure Drivers)')}`;
    const slots = `<div class="rltabw"><table class="rltab" id="cp-slots"><thead><tr><th>Slot</th><th>Module</th><th>Name</th><th>Status</th></tr></thead><tbody>${Array.from({ length: r.size }, (_, s) => {
      const m = r.module(s), st = !m ? '' : m.ctl ? (m.ctl.powered ? modeName(m.ctl) : 'Off') : m.fault ? 'Faulted' : r.owner(s) ? 'Running' : 'OK';
      return `<tr><td>${s}</td><td>${m ? esc(m.ctl ? 'PLC-CPU' : m.type) : d && (d.slot || 0) === s ? 'RSLinx Classic' : '<span class="muted">Empty</span>'}</td><td>${m ? esc(m.name) : ''}</td><td>${esc(st)}</td></tr>`; }).join('')}</tbody></table></div>`;
    dialog({ title: `Chassis Properties - ${r.name}`, size: 'md', onClose: () => backToEmu(was),
      body: tabbed([['gen', 'General', gen], ['slots', 'Slots', slots]], tab || 'gen'),
      buttons: [{ l: 'Cancel', run: () => backToEmu(was) }, { l: 'OK', pri: true, run: e2 => {
        const n = e2.querySelector('#cp-n').value.trim(), z = +e2.querySelector('#cp-z').value;
        if (!E.validName(n)) { toast('Name: letters, digits and _ (up to 40).', 'err'); return false; }
        if (racks.some(x => x !== r && U(x.name) === U(n))) { toast('Another chassis has that name.', 'err'); return false; }
        if (z !== r.size) { const rz = r.resize(z); if (!rz.ok) { toast(rz.msg, 'err'); return false; } }
        r.name = n; r.desc = e2.querySelector('#cp-d').value.trim(); saveChassis(); relink(); chassisLive(true); render(); backToEmu(was);
      } }],
      mount: bindTabs });
  }
  // right-click (or long-press) the power supply of a chassis: its Properties
  document.addEventListener('contextmenu', ev => {
    const ps = ev.target.closest && ev.target.closest('.rkps'), ch = ps && ps.closest('[data-chas]');
    if (!ch) return;
    ev.preventDefault();
    const ri = +ch.dataset.chas, was = emuOpen();
    openMenu([{ l: 'Properties…', i: 'gear', run: () => chassisProps(ri, 'gen', was) }], { x: ev.clientX, y: ev.clientY }, racks[ri] ? racks[ri].name : '');
  });
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
        <div class="frow"><label>Slots</label><select class="inp" id="er-z">${E.RACKS.concat(E.RACKS.includes(r.size) ? [] : [r.size]).map(n => `<option${n === r.size ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="brow"><button class="btn pri" data-erapply="${emuSel.ri}">Apply</button><button class="btn danger" data-erdel="${emuSel.ri}"${racks.length > 1 ? '' : ' disabled'}>Delete chassis</button></div></div>
        <div class="emurack">${rackHTML(emuSel.ri)}</div>`;
    }
    const m = r.module(emuSel.slot);
    if (!m) return '<p class="help">That slot is empty now.</p>';
    if (!m.ctl) return `<div class="ph" style="background:none">I/O card</div><div class="emuform">${kv('Type', esc(m.type) + ' <span class="muted">· ' + esc(CARDNAMES[m.type] || '') + '</span>')}${kv('Name', esc(m.name))}${kv('Chassis', esc(r.name))}${kv('Slot', m.slot)}${kv('State', m.fault ? '<b style="color:var(--danger)">Faulted</b>' : 'OK')}
        <div class="frow"><label>Revision</label><span class="seg">${['1.1', '1.2', '2.1'].concat(['1.1', '1.2', '2.1'].includes(m.rev || E.REV0) ? [] : [m.rev]).map(v => `<span data-erev="${emuSel.ri}:${m.slot}:${v}" class="${(m.rev || E.REV0) === v ? 'on' : ''}">${v}</span>`).join('')}</span></div>
        <p class="help">The firmware revision of the card: the controller checks it against the Revision and Electronic Keying of its I/O configuration.</p>
        <p class="help">An addition of this app: the field devices of a card reach the controller whose project configures the same module in this slot.</p></div><div class="emurack">${rackHTML(emuSel.ri)}</div>`;
    const c = m.ctl, id = emuSel.ri + ':' + m.slot;
    return `<div class="ph" style="background:none">Controller</div><div class="emuform">
      ${kv('Vendor', 'MT PLC Studio')}${kv('Type', 'PLC-CPU (emulated)')}${kv('Revision', '1.0')}
      <div class="frow"><label>Name</label><input class="inp" id="ec-n" value="${esc(m.name)}"></div>
      <div class="frow"><label>Description</label><input class="inp" id="ec-d" value="${esc(m.desc || '')}"></div>
      <div class="frow"><label>IP Address</label><select class="inp" id="ec-ip"><option value=""${m.ip ? '' : ' selected'}>(none)</option>${EMUIPS.map(a => `<option${a === m.ip ? ' selected' : ''}>${a}</option>`).join('')}</select></div>
      ${kv('Chassis', esc(r.name))}${kv('Slot', m.slot)}
      <div class="frow"><label>Controller</label><span class="seg"><span data-epow="${id}:1" class="${c.powered ? 'on' : ''}">On</span><span data-epow="${id}:0" class="${c.powered ? '' : 'on'}">Off</span></span></div>
      ${kv('Revision', '1.0')}${kv('Memory Size', (m.mem || 3072) + ' KB')}${kv('Holds', c.name ? esc(c.name) : '(no project)')}
      <div class="frow"><label>Speed of Time</label><span>${c.sot} % <button class="btn" data-ecfg="${id}">Configure Emulation…</button></span></div>
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
  const emuHTML = () => `${emuMenuBar('win')}<div class="emcomp">Computer: <b>${esc(computerName())}</b></div><div class="emudev"><div class="ph">Devices<span class="grow"></span><button class="btn" data-emu="add">${ic('plus')}Add</button></div><div class="tree" id="emudev" tabindex="-1" autofocus>${devicesHTML()}</div></div>
    <div class="emumain" id="emumain">${detailsHTML()}</div>
    <div class="emustat"><div class="ph">Device Status</div><div id="emustat">${statusHTML()}</div></div><div class="emst">${emuStatus(Math.min(emuSel.ri || 0, racks.length - 1))}</div>`;
  const chassisSig = () => racks.map(r => r.name + ':' + [...r.mods.values()].map(m => (m.ctl ? [m.slot, m.name, m.ip, m.ctl.powered, m.ctl.key, m.ctl.mode, !!m.ctl.fault, m.ctl.name, m.ctl.forceState(), m.ctl.ioOk(), m.ctl.running].join(',') : [m.slot, m.name, m.fault, JSON.stringify(m.field), JSON.stringify(r.outputs(m.slot))].join(','))).join('|')).join('#') + curPath();
  /* the emulator in the app and in its own window follows the controllers; a form being typed in is left alone */
  function chassisLive(force) {
    const docs = [document];
    if (chasWin && !chasWin.closed) docs.push(chasWin.document); else chasWin = null;
    const sg = chassisSig(), est = $('#emst-dock');
    if (est) setHTML(est, emuStatus(Math.max(0, racks.indexOf(chassis))));
    docs.forEach(d => {
      const b = d.getElementById('emubody');
      if (!b || (!force && b.dataset.sig === sg)) return;
      b.dataset.sig = sg;
      b.classList.toggle('compact', !!S.prefs.emuCompact);
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
    if ((el = t.closest('[data-cio]'))) { openIoWin(el.dataset.cio, el.ownerDocument, el.closest('.ccard') || el); return true; }
    if ((el = t.closest('[data-rtb]'))) {
      // the RTB door: swing it open or shut in place (every view of that card), so the hinge animates
      const k = el.dataset.rtb, open = !rtbOpen.has(k);
      if (open) rtbOpen.add(k); else rtbOpen.delete(k);
      const docs = [document].concat(chasWin && !chasWin.closed ? [chasWin.document] : []);
      docs.forEach(d => d.querySelectorAll(`.mrtb[data-rtb="${k}"]`).forEach(x => {
        x.classList.toggle('open', open);
        const b = x.querySelector('.rtbdoor'); if (!b) return;
        b.setAttribute('aria-expanded', String(open));
        b.setAttribute('aria-label', `${open ? 'Close' : 'Open'} the terminal block door of slot ${k.split(':')[1]}`); b.title = `${open ? 'Close' : 'Open'} the RTB door`;
      }));
      return true;
    }
    if ((el = t.closest('[data-emu]'))) {
      openMenu([{ l: 'Add Controller…', run: () => insertCard(emuSel.ri, null, 'PLC-CPU') }, { l: 'Add I/O Card…', run: () => insertCard(emuSel.ri, null, 'PLC-DI16-24V') }, '-', { l: 'Add Chassis…', run: newRack }, '-', { l: 'Snapshots…', run: snapshots }], el.getBoundingClientRect && doc === document ? el : { x: 40, y: 80 });
      if (doc !== document) window.focus();
      return true;
    }
    if ((el = t.closest('[data-cins]'))) { const [ri, s] = ids(el.dataset.cins); insertCard(ri, s); if (doc !== document) window.focus(); return true; }
    if ((el = t.closest('[data-crem]'))) {
      const [ri, s] = ids(el.dataset.crem), r = racks[ri], m = r.module(s);
      if (m && m.ctl) { removeCpu(ri, s, emuOpen()); if (doc !== document) window.focus(); return true; }
      confirmDlg('Delete', `Delete <b>[${s}] ${esc(m.type)} ${esc(m.name)}</b> from chassis ${esc(r.name)}?${m.ctl && m.ctl.name ? ` The project <b>${esc(m.ctl.name)}</b> in it is lost.` : ''}`, 'Delete', () => { r.remove(s); r.advance(0); emuSel = { k: 'r', ri }; saveChassis(); refreshIO(); live(true); }, true);
      if (doc !== document) window.focus();
      return true;
    }
    if ((el = t.closest('[data-emb]'))) { emuMenu(el); return true; }
    if ((el = t.closest('[data-ecfg]'))) { configEmulation(el.dataset.ecfg, emuOpen()); if (doc !== document) window.focus(); return true; }
    if ((el = t.closest('[data-cfault]'))) { const [ri, s] = ids(el.dataset.cfault), r = racks[ri]; r.setFault(s, !r.module(s).fault); r.advance(0); live(true); render(); refreshIO(); return true; }
    if ((el = t.closest('[data-emode]'))) { const p = el.dataset.emode.split(':'); racks[+p[0]].controller(+p[1]).setKey(p[2]); saveChassis(); chassisLive(true); live(true); render(); return true; }
    if ((el = t.closest('[data-erev]'))) { const [ri, s, v] = el.dataset.erev.split(':'), r = racks[+ri]; r.setRevision(+s, v); r.advance(0); saveChassis(); chassisLive(true); live(true); render(); refreshIO(); return true; }
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
      const z = +doc.getElementById('er-z').value;
      if (z !== r.size) { const rz = r.resize(z); if (!rz.ok) { toast(rz.msg, 'err'); return true; } }
      r.name = n; r.desc = doc.getElementById('er-d').value.trim(); saveChassis(); doc.activeElement && doc.activeElement.blur(); chassisLive(true); toast('Chassis settings applied.', 'ok'); return true;
    }
    if ((el = t.closest('[data-erdel]'))) {
      const ri = +el.dataset.erdel, r = racks[ri];
      confirmDlg('Delete chassis', `Delete chassis <b>${esc(r.name)}</b>?${r.controllers().length ? ' Its controllers are deleted with it.' : ''}`, 'Delete', () => { removeRack(r); emuSel = { k: 'r', ri: 0 }; chassisLive(true); refreshIO(); }, true);
      if (doc !== document) window.focus();
      return true;
    }
    // a click on a card that hit none of its controls selects it in the dashboard
    // a tap on an I/O module in the chassis opens its Module I/O window
    if ((el = t.closest('.ccard.io[data-cmod]')) && !t.closest('button')) { openIoWin(el.dataset.cmod, el.ownerDocument, el); }
    if ((el = t.closest('[data-esel]'))) {
      const p = el.dataset.esel.split(':');
      emuSel = p[0] === 'r' ? { k: 'r', ri: +p[1] } : { k: 'm', ri: +p[1], slot: +p[2] };
      if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur();
      chassisLive(true); return true;
    }
    return false;
  }
  /* Snapshots (as in the reference emulator): save the chassis, controllers, their projects and values; restore
     replaces the whole emulator with the saved one */
  function snapshots() {
    const list = store.get('emu.snaps', []);
    const el = dialog({ title: 'Snapshots', size: 'md', flush: true,
      body: `<div class="list">${list.map((x, i) => `<div class="row"><div class="grow"><div class="nm">${esc(x.name)}</div><div class="sub">${new Date(x.at).toLocaleString()} · ${x.emu.racks.length} chassis, ${x.emu.racks.reduce((n, r) => n + r.mods.filter(m => m.type === 'PLC-CPU').length, 0)} controller(s)</div></div><button class="btn" data-snr="${i}">Restore</button><button class="btn" data-snd="${i}">${ic('trash')}</button></div>`).join('') || '<div class="empty">No snapshots yet.</div>'}</div>
        <div class="frow" style="padding:10px 12px"><label>New snapshot</label><input class="inp" id="sn-n" value="Snapshot${list.length + 1}"></div>`,
      buttons: [{ l: 'Close' }, { l: 'Add Snapshot', pri: true, run: e2 => {
        const n = e2.querySelector('#sn-n').value.trim();
        if (!n) { toast('Type a name.', 'err'); return false; }
        list.unshift({ name: n, at: Date.now(), emu: { racks: racks.map(r => r.toJSON()) } });
        if (!store.set('emu.snaps', list.slice(0, 20))) { toast('Could not save: the device storage is full.', 'err'); return false; }
        toast(`Snapshot ${n} added.`, 'ok');
        setTimeout(snapshots, 0);
        return false;
      } }] });
    el.addEventListener('click', ev => {
      const r = ev.target.closest('[data-snr]'), d = ev.target.closest('[data-snd]');
      if (d) { list.splice(+d.dataset.snd, 1); store.set('emu.snaps', list); snapshots(); return; }
      if (!r) return;
      const x = list[+r.dataset.snr];
      confirmDlg('Restore Snapshot', `Restore <b>${esc(x.name)}</b>? The chassis and controllers now in the emulator are replaced, with the projects they hold.`, 'Restore', () => {
        racks.splice(0, racks.length, ...x.emu.racks.map(o => E.Chassis.from(o)));
        racks.forEach(watchRack);
        emuSel = { k: 'r', ri: 0 };
        saveChassis(); relink(); render(); refreshIO();
        toast(`Snapshot ${x.name} restored.`, 'ok');
      }, true);
    });
  }
  function newRack() {
    let n = 1; while (racks.some(r => U(r.name) === U('Chassis' + n))) n++;
    dialog({ title: 'Add Chassis', size: 'md', focus: true,
      body: `<div class="frow"><label>Name</label><input class="inp" id="nr-n" value="Chassis${n}"></div><div class="frow"><label>Slots</label><select class="inp" id="nr-z">${E.RACKS.map(k => `<option${k === 8 ? ' selected' : ''}>${k}</option>`).join('')}</select></div><div class="frow"><label>Description</label><input class="inp" id="nr-d" value=""></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'Add', pri: true, run: e2 => {
        const v = e2.querySelector('#nr-n').value.trim();
        if (!E.validName(v)) { toast('Name: letters, digits and _ (up to 40).', 'err'); return false; }
        if (racks.some(r => U(r.name) === U(v))) { toast('Another chassis has that name.', 'err'); return false; }
        addRack(v, e2.querySelector('#nr-d').value.trim(), +e2.querySelector('#nr-z').value);
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
          <div class="frow"><label>Revision</label><select class="inp" id="ci-rev"><option>1.0</option></select></div>
          <div class="frow"><label>Memory Size (KB)</label><input class="inp" id="ci-mem" type="number" min="64" step="64" value="3072"></div>
          <div class="frow"><label>IP Address</label><select class="inp" id="ci-ip"><option value="">(none)</option>${EMUIPS.map(a => `<option>${a}</option>`).join('')}</select></div>
          <label class="frow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="ci-on" checked><span>Turn the controller on</span></label>
          <div id="ci-prev" class="ciprev" hidden></div></div>
        <p class="help" id="ci-h"></p>`,
      buttons: [{ l: 'Cancel' }, { l: 'Add', pri: true, run: e2 => {
        const r = racks[+e2.querySelector('#ci-r').value], s = +e2.querySelector('#ci-s').value, t = e2.querySelector('#ci-t').value;
        if (e2.querySelector('#ci-s').value === '') { toast('That chassis has no free slot.', 'err'); return false; }
        const n = e2.querySelector('#ci-n').value.trim() || (t === 'PLC-CPU' ? 'Emulator' + (racks.indexOf(r) ? racks.indexOf(r) + '_' : '') + s : E.MODULES[t].kind.toUpperCase() + '_' + s);
        if (!E.validName(n)) { toast('Name: letters, digits and _.', 'err'); return false; }
        const res = r.insert(s, t, n);
        if (!res.ok) { toast(res.msg, 'err'); return false; }
        const pv = t === 'PLC-CPU' && e2.querySelector('#ci-prev:not([hidden])');
        if (pv) r.useKept(s, pv.querySelector('#cp-use').checked, !!(pv.querySelector('#cp-img') && pv.querySelector('#cp-img').checked));
        if (t === 'PLC-CPU') r.setController(s, { name: n, desc: e2.querySelector('#ci-d').value.trim(), ip: e2.querySelector('#ci-ip').value, mem: +e2.querySelector('#ci-mem').value || 3072, on: e2.querySelector('#ci-on').checked });
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
      prevCfg(cpu && r.kept.get(+q('#ci-s').value));
      q('#ci-h').textContent = cpu ? 'An emulated controller holds a project (Download through Who Active). Give one controller in each chassis an IP address.' : 'An I/O card brings field switches (inputs) or lamps (outputs); the project must configure the same module in the same slot.';
    };
    /* a controller removed from this slot left its configuration: use it, or reset it to default values (the name
       stays); Load Saved Controller Image from Previous Instance (LGEM5K-GR016M, Create a controller, step 5) */
    let pvAt = null;
    const prevCfg = k => {
      const b = q('#ci-prev');
      if (!k) { b.hidden = true; b.innerHTML = ''; pvAt = null; return; }
      if (pvAt === k) return;
      pvAt = k; b.hidden = false;
      b.innerHTML = `<p><b>Previous configuration information exists for this slot.</b></p>
        <label class="frow" style="grid-template-columns:auto 1fr"><input type="radio" name="cp" id="cp-use" checked><span>Use the Configuration from the Previous Controller</span></label>
        <label class="frow" style="grid-template-columns:auto 1fr"><input type="radio" name="cp" id="cp-def"><span>Reset the Configuration to Default Values</span></label>
        ${k.project ? `<label class="frow" style="grid-template-columns:auto 1fr"><input type="checkbox" id="cp-img"><span>Load Saved Controller Image from Previous Instance: <b>${esc(k.project.controller ? k.project.controller.name : k.name)}</b>${k.at ? ', last downloaded ' + esc(new Date(k.at).toLocaleString()) : ''}</span></label>
        <p class="help">Using a previously loaded controller image may result in unexpected operation. Make sure the program is correct before running emulations.</p>` : ''}`;
      const fill = use => { q('#ci-n').value = k.name; q('#ci-d').value = use ? k.desc || '' : ''; q('#ci-mem').value = use ? k.mem || 3072 : 3072; q('#ci-ip').value = use ? k.ip || '' : ''; q('#ci-ip').dataset.touched = '1'; };
      b.querySelector('#cp-use').onchange = () => fill(true); b.querySelector('#cp-def').onchange = () => fill(false);
      fill(true);
    };
    q('#ci-t').value = type0 || 'PLC-DI16-24V';
    const cfg = slot != null && S.p && S.p.rack.modules.find(x => x.slot === slot);
    if (cfg && !type0) q('#ci-t').value = cfg.type;
    q('#ci-r').onchange = () => { slot = null; sync(); };
    q('#ci-t').onchange = sync;
    q('#ci-s').onchange = sync;
    q('#ci-ip').onchange = () => { q('#ci-ip').dataset.touched = '1'; };
    sync();
  }
  function chassisMonitor() {
    dialog({ title: 'Emulator', size: 'lg', flush: true,
      body: `<div id="emubody" class="emu${S.prefs.emuCompact ? ' compact' : ''}">${emuHTML()}</div>`,
      buttons: (S.layout === 'phone' ? [] : [{ l: 'Open in a window', run: () => { setTimeout(popChassis, 0); } }]).concat([{ l: 'Who Active…', run: () => { setTimeout(whoActive, 0); } }, { l: 'Close', pri: true }]) });
  }
  /* the emulator in a window of its own, beside the programming software. The window starts blank (so it shares this
     window's origin, also for the exe's file:// copy) and this window writes, draws and serves it. */
  function popChassis() {
    if (chasWin && !chasWin.closed) { chasWin.focus(); return; }
    const w = window.open('', 'mtps-chassis', 'width=1180,height=720');
    if (!w) { toast('The window was blocked: the emulator stays in the app.', 'err'); chassisMonitor(); return; }
    const css = new URL('css/app.css', location.href).href, css2 = new URL('css/themes.css', location.href).href, icon = new URL('icons/icon.svg', location.href).href;
    w.document.open();
    w.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>MT PLC Studio - Emulator</title><link rel="icon" href="${icon}"><link rel="stylesheet" href="${css}"><link rel="stylesheet" href="${css2}"></head>
      <body class="desk chaswin"><header class="chashead"><b>Emulator</b><span class="muted">emulated chassis and controllers</span><span class="grow"></span><button class="btn" data-wa-open="1">Who Active…</button></header><div id="emubody" class="emu"></div></body></html>`);
    w.document.close();
    closeLayer();
    mountChassis(w);
  }
  /* this window draws the emulator window and takes its clicks (dialogs open here, in the app) */
  function mountChassis(w) {
    chasWin = w;
    const d = w.document;
    d.documentElement.dataset.theme = S.prefs.theme; d.documentElement.dataset.mode = themeMode();
    chassisLive(true);
    d.addEventListener('click', ev => { if (!chassisClick(ev.target) && ev.target.closest('[data-wa-open]')) { window.focus(); whoActive(); } });
    d.addEventListener('pointerdown', ev => { const b = ev.target.closest('[data-io]'); if (!b) return; ioPress(b.dataset.io); ev.preventDefault(); });
    d.addEventListener('input', ev => { const a = ev.target.closest('[data-ana]'); if (a) anaSet(a.dataset.ana, +a.value); });
    bindIoWins(d);
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
  // the ladder part of the signature (what the rungs show), kept apart so a change elsewhere does not redraw them
  let ladPart = '', ladSig = '', ladCost = 0, lastTags = 0, tagCost = 0, scrollAt = 0;
  // a redraw of the ladder waits while it is being scrolled (passive: the scroll itself is never held up)
  document.addEventListener('scroll', ev => { if (ev.target && ev.target.id === 'ladwrap') scrollAt = performance.now(); }, { capture: true, passive: true });
  // write HTML only when it changed: no new DOM, style and layout for the same content
  const setHTML = (el, h) => { if (el._mh !== h) { el.innerHTML = h; el._mh = h; } };
  function liveSig() {
    if (!S.online) { ladPart = ''; return 'off|' + chassisSig(); }
    const R = liveRoutine(), parts = [ctl.mode, ctl.key, ctl.fault ? 1 : 0, ctl.forceState()];
    if (R) { const w = e => { if (!e) return; if (e.t === 'BR') e.legs.forEach(l => l.forEach(w)); else { parts.push(e.v ? 1 : 0); if (e.x && e.x[0] && e.x[0].obj && /^(timer|counter)$/.test(INSTR[e.t].args[0] || '')) { try { const s = e.x[0].obj(); parts.push(s.ACC, s.DN); } catch (err) { /* ignore */ } } else if (e.x && INSTR[e.t].ctl != null) { try { const s = e.x[INSTR[e.t].ctl].obj(); parts.push(s.POS, s.LEN, s.EN, s.EU, s.DN, s.EM, s.ER); } catch (err) { /* ignore */ } } } }; R.rungs.forEach(r => r.elems.forEach(w)); }
    ladPart = parts.join(',');
    const io = [];
    ctl.M && ctl.M.mods.forEach((m, s) => { const im = ctl.ioImage(s); io.push(JSON.stringify(im)); });
    return ladPart + ',' + io.join(',') + '|' + chassisSig();
  }
  let lastFault = null;
  function live(force) {
    const s = liveSig();
    if (!force && s === sig) return;
    sig = s;
    // a new major fault (a module that failed, a watchdog) shows in the organizer and the online bar
    const fk = S.online && ctl.fault ? ctl.fault.at : null;
    if (fk !== lastFault) { lastFault = fk; if (!force) { render(); if (fk) toast(`Major fault: ${ctl.fault.text}`, 'err'); return; } }
    // the ladder: only when what it shows changed, at most 20 times a second, and less often when one redraw costs
    // more (a big routine on a slow device: the gap is 4 times the last redraw), never during a scroll
    if (S.online && !S.touching && (force || ladPart !== ladSig)) {
      const now = performance.now();
      if (force || (now - lastLive > Math.max(50, ladCost * 4) && now - scrollAt > 150)) { lastLive = now; ladSig = ladPart; renderLadder(); const c = performance.now() - now; ladCost = ladCost ? ladCost * 0.7 + c * 0.3 : c; } else { sig = ''; }
    }
    const ob = $('#olbar');
    if (ob) setHTML(ob, S.layout === 'desktop' ? onlineBarHTML() : S.layout === 'tablet' ? tabStatHTML() : `${modeBox()}${forcesBox()}${editsBox()}${S.verify && S.verify.errors.length ? `<span class="warn" data-go="more">${ic('warn')}${S.verify.errors.length}</span>` : ''}`);
    const iob = $('#iob'); if (iob && !iob.contains(document.activeElement)) setHTML(iob, iob.classList.contains('dockb') ? dockBody() : ioHTML()); chassisLive(false); ioWinsLive();
    const est = $('#emst-dock'); if (est) setHTML(est, emuStatus(Math.max(0, racks.indexOf(chassis))));
    // Monitor Tags: about 7 times a second at most (less when the list is long), as a value display
    if (S.tagMode === 'mon') { const now = performance.now(); if (force || now - lastTags > Math.max(150, tagCost * 4)) { lastTags = now; liveTagValues(); tagCost = performance.now() - now; } else sig = ''; }
    if (force && S.outTab === 'watch') liveWatch(true);
    const cp = $('#ctlpage'); if (cp && force) cp.innerHTML = controllerPage();
  }
  /* the controller scans on a timer of its own, so it keeps running when the screen does not redraw
     (a hidden or minimised window); the frame loop only draws */
  function tick() {
    const now = performance.now(), dt = Math.min(1000, now - lastT);
    lastT = now;
    racks.forEach(r => r.advance(dt));
    singleAsk(); tracesLive();
  }
  function loop(now) {
    tick();
    // a turned tablet or a resized window may skip the resize event: check the layout a few times a second
    if (now - lastLay > 250) { lastLay = now; if (pickLayout() !== S.layout && !S.touching) render(); }
    live(false);
    if (S.online && S.outTab === 'watch') liveWatch(false);
    trendTick(now);
    requestAnimationFrame(loop);
  }

  /* ---------- instruction picker (Insert, the phone's +) with quick entry: "XIC Start_PB" ---------- */
  /* Add Ladder Element, as in the reference: the Ladder Element box (a mnemonic, or a whole instruction such as
     "XIC Start_PB"), the list of instructions by group with their description (it jumps to the match while you
     type), Show Language Elements By Groups, and Instruction Help >> for the selected one */
  function picker(initial) {
    const groups = [...new Set(Object.values(INSTR).map(d => d.grp))];
    let byGrp = S.prefs.aleGroups !== false, help = false, cur = '';
    const open = new Set();
    const el = dialog({ title: 'Add Ladder Element', size: 'md', focus: true,
      body: `<div class="ale1"><label for="pq">Ladder Element:</label><input class="inp mono" id="pq" value="${esc(initial || '')}" autocomplete="off" spellcheck="false"><button class="btn" id="alehb">Instruction Help &gt;&gt;</button></div>
        <div class="alew"><div class="alel" id="pg" role="listbox"></div><div class="aleh" id="alehp" hidden></div></div>
        <div class="alef"><label class="alec"><input type="checkbox" id="aleg"${byGrp ? ' checked' : ''}> Show Language Elements By Groups</label><span class="grow"></span><button class="btn" disabled title="Add-On Instructions are not in the app yet">New Add-On Instruction…</button></div>
        <p class="help">${S.sel ? 'Goes after the selected instruction.' : curSelRung() != null ? `Goes at the end of rung ${curSelRung()}.` : 'Goes in a new rung.'} Type a mnemonic or a whole instruction (XIC Start_PB), then OK. A second click on a row adds it.</p>`,
      buttons: [{ l: 'Cancel' }, { l: 'Help', run: () => { const m = cur; setTimeout(() => instrHelp(m), 0); } }, { l: 'OK', pri: true, run: el2 => quick(el2.querySelector('#pq').value) }] });
    const q = s => el.querySelector(s);
    const row = m => `<div class="row${m === cur ? ' on' : ''}" data-pk="${m}" role="option">${L.icon(m)}<b class="mono">${m}</b><span class="ell">${esc(NAME(m))}</span></div>`;
    const draw = () => {
      const all = Object.keys(INSTR);
      q('#pg').innerHTML = byGrp ? groups.map(g => { const ms = all.filter(m => INSTR[m].grp === g), o = open.has(g); return `<div class="row grp" data-pgrp="${esc(g)}">${ic(o ? 'down' : 'right')}${ic('folder')}<span>${esc(g)}</span></div>${o ? ms.map(row).join('') : ''}`; }).join('') : all.slice().sort().map(row).join('');
      const on = q('#pg .row.on'); if (on) on.scrollIntoView({ block: 'nearest' });
      if (help) q('#alehp').innerHTML = cur ? `<b class="mono">${cur}</b><div>${esc(NAME(cur))}</div><div class="muted">${esc(INSTR[cur].grp)}</div><div style="margin-top:6px">Operands: ${esc(((L.OPN[cur] || []).join(', ')) || 'none')}</div><button class="btn" data-alefull="1" style="margin-top:8px">${ic('help')}Open Instruction Help</button>` : '<span class="muted">Select an instruction.</span>';
    };
    const match = () => {
      const w = U(q('#pq').value.trim()).split(/[\s,(]+/)[0];
      cur = w ? Object.keys(INSTR).find(k => k === w) || Object.keys(INSTR).find(k => k.startsWith(w)) || '' : cur;
      if (cur) open.add(INSTR[cur].grp);
      draw();
    };
    match();
    el.addEventListener('input', ev => { if (ev.target.id === 'pq') match(); });
    q('#aleg').addEventListener('change', ev => { byGrp = ev.target.checked; S.prefs.aleGroups = byGrp; savePrefs(); draw(); });
    q('#alehb').addEventListener('click', () => { help = !help; q('#alehp').hidden = !help; q('#alehb').innerHTML = help ? 'Instruction Help &lt;&lt;' : 'Instruction Help &gt;&gt;'; draw(); });
    el.addEventListener('click', ev => {
      if (ev.target.closest('[data-alefull]')) { const m = cur; closeLayer(); instrHelp(m); return; }
      const g = ev.target.closest('[data-pgrp]');
      if (g) { const n = g.dataset.pgrp; if (open.has(n)) open.delete(n); else open.add(n); draw(); return; }
      const r = ev.target.closest('[data-pk]'); if (!r) return;
      if (r.dataset.pk === cur && r.classList.contains('on')) { closeLayer(); insertMn(cur); return; }
      cur = r.dataset.pk; q('#pq').value = cur; draw();
    });
    const inp = q('#pq');
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
      // the All… button (no data-mn) opens Add Ladder Element by its data-cmd: it is not an instruction to drag
      if (!b || b.disabled || !b.dataset.mn || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
      dg = { mn: b.dataset.mn, x: ev.clientX, y: ev.clientY, on: false, id: ev.pointerId, b, touch: ev.pointerType !== 'mouse', held: ev.pointerType === 'mouse' };
      if (dg.touch) { const d = dg; d.timer = setTimeout(() => { if (dg === d) { d.held = true; b.classList.add('lift'); if (navigator.vibrate) navigator.vibrate(10); } }, 350); }
    });
    // once an instruction is held, the row must not scroll under the finger
    document.addEventListener('touchmove', ev => { if (dg && dg.held && dg.touch) ev.preventDefault(); }, { passive: false });
    document.addEventListener('pointermove', ev => {
      if (!dg || ev.pointerId !== dg.id) return;
      if (dg.touch && !dg.held) { if (Math.hypot(ev.clientX - dg.x, ev.clientY - dg.y) > 10) { clearTimeout(dg.timer); dg = null; } return; }
      if (!dg.on && Math.hypot(ev.clientX - dg.x, ev.clientY - dg.y) > 10) {
        dg.on = true;
        dg.g = document.createElement('div');
        dg.g.className = 'ghost'; dg.g.style.position = 'fixed'; dg.g.style.zIndex = 300; dg.g.style.transform = dg.touch ? 'translate(-50%, -140%)' : 'translate(16px, 12px)';
        dg.g.innerHTML = `${L.icon(dg.mn)}<span>${dg.mn}</span>`;
        document.body.appendChild(dg.g);
        S.drag = { kind: 'tb' }; renderLadder('nodes');
        try { dg.b.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      }
      if (!dg.on) return;
      dg.g.style.left = ev.clientX + 'px'; dg.g.style.top = ev.clientY + 'px';
      dg.drop = dropAt(ev.clientX, ev.clientY, 'tb');
      const k = JSON.stringify(dg.drop);
      if (k !== dg.k) { dg.k = k; renderLadder(dg.drop || 'nodes'); }
    });
    const end = ev => {
      if (!dg || ev.pointerId !== dg.id) return;
      const d = dg;
      dg = null;
      if (d.g) d.g.remove();
      if (!d.on) { if (ev.type === 'pointerup') insertMn(d.mn); return; }
      S.drag = null;
      renderLadder();
      if (ev.type === 'pointerup' && d.drop) {
        if (d.mn === 'RUNG') { S.sel = null; S.selRung = d.drop.ri; addRung(); return; }
        insertMn(d.mn, d.drop.path ? d.drop : { ri: d.drop.ri, path: null });
      }
    };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  }
  /* the drop point under the pointer: the node beside the instruction half it is on, the free end of a level, else
     the nearest valid node of the rung under it (drop zones are valid per rung, as in the reference) */
  function dropAt(x, y, kind) {
    const el = document.elementFromPoint(x, y), t = hit(el), sv = $('#ladwrap svg'), ns = S.ladNodes || [];
    if (!t || !sv) return null;
    const R = sv.getBoundingClientRect(), bare = n => { if (!n) return null; const c = { ...n }; delete c.x; delete c.y; return c; };
    const near = list => { let b = null, d = 1e9; list.forEach(n => { const q = Math.hypot(R.left + n.x - x, (R.top + n.y - y) * 1.5); if (q < d) { d = q; b = n; } }); return b; };
    if (kind === 'op') return bare(t.op != null && t.path ? ns.find(n => n.op === t.op && n.ri === t.ri && sameP(n.path, t.path)) : null);
    if (kind === 'rung') { const rs = ns.filter(n => n.rung != null); let b = null; rs.forEach(n => { if (!b || Math.abs(R.top + n.y - y) < Math.abs(R.top + b.y - y)) b = n; }); return bare(b); }
    if (t.end || t.ri == null) return null;
    const mine = ns.filter(n => n.ri === t.ri && n.op == null && n.rung == null);
    let c = null;
    if (t.leg) c = mine.find(n => n.leg && sameP(n.path, t.path));
    else if (t.path && !t.br) { const r = el.getBoundingClientRect(), after = x > r.left + r.width / 2; c = mine.find(n => n.path && !n.leg && n.lvl == null && sameP(n.path, t.path) && !!n.after === after); }
    return bare(c || near(mine));
  }

  /* ---------- events ---------- */
  function bind() {
    const app = $('#app');
    app.addEventListener('click', ev => {
      const t = ev.target;
      let el;
      if ((el = t.closest('[data-desc]'))) { closeDescBar(el.dataset.desc === 'ok'); return; }
      if ((el = t.closest('[data-otab]'))) { S.outTab = el.dataset.otab; render(); return; }
      if ((el = t.closest('[data-cmd]')) && !el.disabled) { run(el.dataset.cmd); return; }
      if ((el = t.closest('[data-menu]'))) { const m = MENUS.find(x => x[0] === el.dataset.menu); openMenu(menuItems(m[1]), el); return; }
      if ((el = t.closest('[data-allmenu]'))) { foldMenu(el); return; }
      if ((el = t.closest('[data-tab]'))) { S.prefs.tab = el.dataset.tab; savePrefs(); render(); return; }
      if ((el = t.closest('[data-key]'))) { ctl.setKey(el.dataset.key); live(true); render(); return; }
      if ((el = t.closest('[data-box]'))) {
        if (el.dataset.box === 'mode') openMenu(menuItems(['online', 'offline', '-', 'prog', 'runm', 'testm', 'clear', '-', 'upload', 'download', 'who']), el, 'Mode · key switch in ' + ctl.key);
        else openMenu(menuItems(['fen', 'fdis', 'fall']), el, 'I/O forces');
        return;
      }
      if ((el = t.closest('[data-orgprops]'))) { controllerProps(); return; }
      if ((el = t.closest('[data-tw]'))) { const k = el.dataset.tw, c = new Set(S.prefs.collapsed); if (c.has(k)) c.delete(k); else c.add(k); S.prefs.collapsed = [...c]; savePrefs(); render(); return; }
      if ((el = t.closest('[data-org]'))) {
        const k = el.dataset.org, now = Date.now(), dbl = orgTap.k === k && now - orgTap.t < 400;
        S.orgSel = k; S.pickAt = 'org';
        orgTap = dbl ? { k: '', t: 0 } : { k, t: now };
        if (dbl && dtOpen(k)) return;
        if (dbl && (k === 'ctl' || k.startsWith('task:') || k.startsWith('prog:') || k.startsWith('rt:'))) {
          // the first tap of the double-tap folded the node: put it back
          if (!k.startsWith('rt:')) { const c = new Set(S.prefs.collapsed); if (c.has(k)) c.delete(k); else c.add(k); S.prefs.collapsed = [...c]; savePrefs(); render(); }
          if (k === 'ctl') controllerProps(); else if (k.startsWith('task:')) taskProps(k.slice(5)); else if (k.startsWith('prog:')) progProps(k.slice(5)); else routineProps(k);
          return;
        }
        if (el.querySelector('[data-tw] svg') && !k.startsWith('rt:') && k !== 'bp') { const c = new Set(S.prefs.collapsed); if (c.has(k)) c.delete(k); else c.add(k); S.prefs.collapsed = [...c]; savePrefs(); render(); return; }
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
      if ((el = t.closest('[data-recent]'))) { const f = el.dataset.recent; saveChanges(() => loadFile(f)); return; }
      if ((el = t.closest('[data-errh]'))) { S.errOpen = true; errSheet(); return; }
      if ((el = t.closest('[data-msgt]')) && !t.closest('[data-cmd]')) { S.errOpen = !S.errOpen; render(); return; }
      if ((el = t.closest('[data-ef]'))) { const f = S.errFilter || { e: true, w: true, m: true }; f[el.dataset.ef] = !f[el.dataset.ef]; S.errFilter = f; render(); return; }
      if ((el = t.closest('[data-errline]'))) { gotoErr(el); return; }
      if ((el = t.closest('[data-pull]'))) { const sl = +el.dataset.pull, on = !chassis.module(sl).fault; chassis.setFault(sl, on); chassis.advance(0); toast(on ? `The card in slot ${sl} faulted: see Module Properties for the code.` : `The card in slot ${sl} works again.`); live(true); render(); return; }
      if ((el = t.closest('[data-ptab]'))) { S.phoneEmu = el.dataset.ptab === '1'; render(); return; }
      if ((el = t.closest('[data-dkpop]'))) { popChassis(); return; }
      if ((el = t.closest('[data-dkmin]'))) { S.prefs.emuMin = el.dataset.dkmin === '1'; savePrefs(); render(); return; }
      if ((el = t.closest('[data-dkat]'))) { S.prefs.dockAt = el.dataset.dkat; S.prefs.emuMin = false; savePrefs(); render(); return; }
      if (chassisClick(t)) return;
      if ((el = t.closest('[data-ctx]'))) { const r = el.getBoundingClientRect(); ctxMenu(S.sel ? { ri: S.sel.ri, path: S.sel.path, br: S.sel.br } : curSelRung() != null ? { ri: curSelRung() } : null, r.left, r.top); return; }
      if ((el = t.closest('[data-more]'))) { openMenu(menuItems(['rung', 'branch', 'level', '-', 'rtext', 'comment', '-', 'verifyr', 'verifyc', 'xref', 'goto', '-', 'bmtog', 'bmnext', 'bmprev', 'bmall', '-', 'newtag', 'tagsmon', '-', 'options']), el); return; }
      if ((el = t.closest('[data-routines]'))) { openMenu(curProg().routines.map(r => ({ l: r.name, ck: r.name === S.routine, run: () => openRoutine(`rt:${curProg().name}/${r.name}`) })).concat(['-', { l: 'New Routine…', run: () => newRoutine(curProg().name), dis: !editable() }]), el); return; }
      if ((el = t.closest('[data-tmode]'))) { S.tagMode = el.dataset.tmode; if (S.view === 'tags' && S.layout !== 'phone') render(); else { const p = $('#tagpage'); if (p) p.innerHTML = tagEditorBody(S.layout === 'phone'); } return; }
      if ((el = t.closest('[data-tabx]'))) { closeTab(el.dataset.tabx); return; }
      if ((el = t.closest('[data-tabk]'))) { openTab(el.dataset.tabk); return; }
      if ((el = t.closest('[data-texp]'))) { const k = (S.tagScope || '') + '|' + el.dataset.texp; if (S.tagOpen.has(k)) S.tagOpen.delete(k); else S.tagOpen.add(k); refreshTags(); return; }
      if ((el = t.closest('#tagrows [data-tconst]'))) { toggleConst(el); return; }
      if (t.closest('#tagrows [data-newrow]')) return;
      if ((el = t.closest('#tagrows [data-tag]'))) { tagClick(el, t.closest('[data-tcell]')); return; }
    });
    // the tag editor (also inside a dialog in #layer)
    document.addEventListener('change', ev => {
      if (ev.target.id === 'tscope') { S.tagScope = ev.target.value; if (S.view === 'tags' && S.layout !== 'phone') render(); else refreshTags(); }
      // the dock shows another chassis (the project path keeps its own)
      if (ev.target.dataset && ev.target.dataset.dkr) { chassis = racks[+ev.target.value] || chassis; const b = $('#iob'); if (b) { b.innerHTML = dockBody(); b._mh = null; } }
    });
    bindIoWins(document);
    // a module: right-click (mouse) or long-press (touch) opens its menu, as in the reference emulator
    document.addEventListener('contextmenu', ev => {
      // Logix Emulate: right-click an empty slot of the chassis, then Create
      const e = ev.target.closest('[data-cins]');
      if (e) { ev.preventDefault(); const [ri, s] = ids(e.dataset.cins); openMenu([{ l: 'Create…', i: 'plus', run: () => insertCard(ri, s) }], { x: ev.clientX, y: ev.clientY }, `Slot ${s}`); return; }
      const u = ev.target.closest('[data-ccpu]'); if (u) { ev.preventDefault(); cpuMenu(u.dataset.ccpu, ev.clientX, ev.clientY); return; }
      const c = ev.target.closest('[data-cmod]'); if (!c) return; ev.preventDefault(); moduleMenu(c.dataset.cmod, ev.clientX, ev.clientY);
    });
    let lp = null;
    document.addEventListener('pointerdown', ev => {
      const c = ev.target.closest('[data-cmod],[data-ccpu]'); if (!c || ev.pointerType === 'mouse' || ev.target.closest('button,.seg')) return;
      const x = ev.clientX, y = ev.clientY;
      lp = { x, y, t: setTimeout(() => { lp = null; if (c.dataset.ccpu) cpuMenu(c.dataset.ccpu, x, y); else moduleMenu(c.dataset.cmod, x, y); }, 550) };
    });
    const lpEnd = ev => { if (lp && (ev.type !== 'pointermove' || Math.hypot(ev.clientX - lp.x, ev.clientY - lp.y) > 10)) { clearTimeout(lp.t); lp = null; } };
    ['pointerup', 'pointercancel', 'pointermove'].forEach(t => document.addEventListener(t, lpEnd));
    // the dock's splitter: drag to size the emulator panel (height at the bottom, width at the side)
    document.addEventListener('pointerdown', ev => {
      const sp = ev.target.closest('[data-split]'); if (!sp) return;
      const dock = $('#dock'); if (!dock) return;
      ev.preventDefault();
      const side = sp.dataset.split === 'side', start = side ? ev.clientX : ev.clientY, from = side ? dock.offsetWidth : dock.offsetHeight;
      const key = side ? 'emuW' : S.layout === 'tablet' ? 'emuHp' : 'emuH';
      const move = e => {
        const d = (side ? e.clientX : e.clientY) - start, v = Math.round(Math.max(150, Math.min((side ? innerWidth : innerHeight) * 0.75, from - d)));
        S.prefs[key] = v; dock.style[side ? 'width' : 'height'] = v + 'px';
      };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); savePrefs(); renderLadder(); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });
    document.addEventListener('change', ev => { if (ev.target.dataset && ev.target.dataset.errq) rememberErrQ(ev.target.value); });
    document.addEventListener('input', ev => {
      if (ev.target.id === 'tq') { S.tagQ = ev.target.value; refreshTags(); }
      if (ev.target.dataset && ev.target.dataset.errq) { S.errQ = ev.target.value; S.errCur = null; refreshErrLog(); }
      const a = ev.target.closest && ev.target.closest('[data-ana]');
      if (a) anaSet(a.dataset.ana, +a.value);
    });
    $('#layer').addEventListener('click', ev => {
      let el;
      if ((el = ev.target.closest('[data-tmode]'))) { S.tagMode = el.dataset.tmode; const p = $('#tagpage'); if (p) p.innerHTML = tagEditorBody(false); return; }
      if ((el = ev.target.closest('[data-texp]'))) { const k = (S.tagScope || '') + '|' + el.dataset.texp; if (S.tagOpen.has(k)) S.tagOpen.delete(k); else S.tagOpen.add(k); refreshTags(); return; }
      if ((el = ev.target.closest('#tagrows [data-tag]'))) { tagClick(el); return; }
      if ((el = ev.target.closest('[data-cmd]'))) { run(el.dataset.cmd); return; }
      if ((el = ev.target.closest('[data-errline]'))) { closeLayer(); gotoErr(el); return; }
      chassisClick(ev.target);
    }, true);
    // I/O points: each press switches the point
    document.addEventListener('pointerdown', ev => {
      const b = ev.target.closest('[data-io]'); if (!b) return;
      ioPress(b.dataset.io);
      ev.preventDefault();
    });
    document.addEventListener('keydown', onKey);
    // the blank row of Edit Tags: Enter (or leaving the cell) makes the tag, Esc clears it
    document.addEventListener('keydown', ev => { if (ev.target.id !== 'tnew') return; if (ev.key === 'Enter') { ev.preventDefault(); newTagInline(ev.target); } else if (ev.key === 'Escape') ev.target.value = ''; });
    document.addEventListener('focusout', ev => { if (ev.target.id === 'tnew' && ev.target.value.trim() && ev.target.isConnected) newTagInline(ev.target); });
    addEventListener('resize', () => { const lay = pickLayout(); if (lay !== S.layout) render(); else if (S.layout === 'tablet') render(); });
    addEventListener('beforeunload', ev => { if (S.dirty && !window.mtpsFS && !window.Capacitor) { ev.preventDefault(); ev.returnValue = ''; } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveProject(); });
    bindLadder();
    bindDrag();
  }
  function errSheet() {
    const l = $('#layer');
    l.innerHTML = `<div class="scrim" data-close="1"></div><div class="sheet" style="height:46%"><div class="grab"></div><div class="ph" style="background:none;border:0">Errors<span class="grow"></span><button class="btn" data-cmd="verifyc">${ic('check')}Verify</button><button class="ib" data-close="1">${ic('close')}</button></div><div class="sb" style="display:flex;flex-direction:column">${errorsHTML()}</div></div>`;
    l.onclick = ev => { if (ev.target.closest('[data-close]')) closeLayer(); };
    layerKey = ev => { if (ev.key === 'Escape') closeLayer(); else if (ev.key === 'F4') { ev.preventDefault(); closeLayer(); nextResult(ev.shiftKey ? -1 : 1); } };
  }
  function gotoErr(el) { S.errCur = (el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild.nodeValue : el.textContent) || null; gotoLine(+el.dataset.errline, el.dataset.errrt, el.textContent, true); }
  /* go to the rung of an Errors line (double-click, or F4): the instruction it names is selected; a double-click also
     opens its operand editor */
  function gotoLine(ri, rt, text, openEd) {
    if (rt) { const [g, r] = rt.split('/'); S.prog = g; S.routine = r; S.view = 'ladder'; }
    S.sel = null; S.selRung = ri;
    if (S.layout === 'phone') S.area = 'ladder';
    reverify(); render(); scrollToSel();
    const m = /Rung \d+, (\w+)(?:, Operand (\d+))?/.exec(text || ''), els = parsed(ri);
    if (m && els && editable()) {
      const want = U(m[1]), op = m[2] != null ? +m[2] : 0, hits = [];
      const walk = (arr, p) => arr.forEach((e, k) => { const q = p.concat(k); if (e.t === 'BR') e.legs.forEach((l, li) => walk(l, q.concat(li))); else if (e.t === want) hits.push({ e, q }); });
      walk(els, []);
      const h = hits.find(x => x.e.a[op] === '?' || x.e.a[op] === '') || hits[0];
      if (h) { S.sel = { ri, path: h.q, op }; S.selRung = null; render(); scrollToSel(); if (openEd) { if (S.layout !== 'desktop') closeLayer(); setTimeout(() => openEditor(ri, h.q, op), 60); } }
    }
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
  /* Quick Keys (reference: Tools > Options > Ladder Editor, "Assign Quick Keys"; off by default): one key inserts */
  const QUICK = { x: 'XIC', f: 'XIO', o: 'OTE', l: 'OTL', u: 'OTU', t: 'TON', c: 'CTU', d: 'GEQ', b: 'BR' };
  function quickKey(mn) { if (mn === 'BR') addBranch(); else insert(newEl(mn), null, 'inline'); }
  // the selected instruction (not a branch or a level), and the operand a key edits: the selected one, else the main one
  const selInstr = () => (S.sel && S.sel.path && !S.sel.br && !S.sel.leg && curEl() ? S.sel : null);
  const editSelOperand = typed => { const s = selInstr(); return !!s && inlineEdit(s.ri, s.path, s.op != null ? s.op : 0, typed); };
  /* where the selection is on the screen (for Shift+F10, the context menu of the selection) */
  function selPoint() {
    const w = $('#ladwrap'); if (!w) return null;
    let r = null;
    if (S.sel && S.sel.path) r = [...w.querySelectorAll(`rect.tap[data-ri="${S.sel.ri}"][data-p="${S.sel.path.join('.')}"]`)].find(x => (S.sel.op != null ? x.dataset.opi === String(S.sel.op) : !x.dataset.opi) && !!x.dataset.br === !!S.sel.br && !!x.dataset.leg === !!S.sel.leg);
    else if (curSelRung() != null) r = w.querySelector(`rect.tap[data-rn][data-ri="${curSelRung()}"]`);
    if (!r) return null;
    const b = r.getBoundingClientRect();
    return { x: b.left + Math.min(b.width / 2, 40), y: b.top + Math.min(b.height / 2, 30) };
  }
  // Alt+0 / Alt+1: show the Controller Organizer / the Errors pane (each layout has its own place for them)
  function showOrg() { if (S.layout === 'phone') S.area = 'project'; else if (S.layout === 'tablet') { S.prefs.org = true; S.drawer = true; } else S.prefs.org = true; savePrefs(); render(); }
  function showErrors() { if (S.layout === 'desktop') { S.prefs.err = true; savePrefs(); } else if (S.layout === 'tablet') S.errOpen = true; else S.area = 'more'; render(); const q = $('[data-errq]'); if (q && S.layout === 'desktop') q.focus(); }
  /* more of the keyboard table (help v37, Use the keyboard to navigate): Alt+Enter the active routine's properties;
     Alt+F, E, V, S, L, C, T, H the main menu; Ctrl+PageDown / Ctrl+PageUp, Ctrl+Tab / Shift+Ctrl+Tab and Ctrl+F6 the
     next or previous routine window (tab); Ctrl+F4 closes it; Ctrl+D on a rung edits its comment */
  const ALTM = { KeyF: 'File', KeyE: 'Edit', KeyV: 'View', KeyS: 'Search', KeyL: 'Logic', KeyC: 'Communications', KeyT: 'Tools', KeyH: 'Help' };
  function tableKey(ev, k, ctrl) {
    if (S.noProj && !ev.altKey) return false;
    if (ev.altKey && !ctrl && k === 'Enter') { if (S.view === 'ladder') routineProps('rt:' + S.prog + '/' + S.routine); return true; }
    if (ev.altKey && !ctrl && !ev.shiftKey && ALTM[ev.code] && S.layout === 'desktop') { const m = $(`.dmenu [data-menu="${ALTM[ev.code]}"]`); if (m) m.click(); return !!m; }
    if (!ctrl || ev.altKey) return false;
    const act = S.view === 'tags' ? 'tags' : S.view === 'ladder' ? S.prog + '/' + S.routine : null;
    const step = d => { if (!S.tabs.length) return; const i = S.tabs.indexOf(act); openTab(S.tabs[((i < 0 ? 0 : i + d) % S.tabs.length + S.tabs.length) % S.tabs.length]); };
    if (k === 'PageDown' || k === 'PageUp') { step(k === 'PageDown' ? 1 : -1); return true; }
    if (k === 'Tab' || k === 'F6') { step(ev.shiftKey ? -1 : 1); return true; }
    if (k === 'F4') { if (act) closeTab(act); return true; }
    if (k.toLowerCase() === 'd' && !ev.shiftKey && S.view === 'ladder' && !S.sel && curSelRung() != null) { if (editable()) rungComment(curSelRung()); return true; }
    return false;
  }
  function onKey(ev) {
    if ($('#layer').children.length) { if (layerKey) layerKey(ev); return; }
    if (ev.target.id === 'desctx') {
      if (ev.key === 'Escape') { ev.preventDefault(); closeDescBar(false); } else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey || (S.descEd && S.descEd.rung && !ev.shiftKey))) { ev.preventDefault(); closeDescBar(true); }
      return;
    }
    const k = ev.key, ctrl = ev.ctrlKey || ev.metaKey;
    if (k === 'F4' && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); nextResult(ev.shiftKey ? -1 : 1); return; }
    if (k === 'Enter' && ev.target.dataset && ev.target.dataset.errq) { rememberErrQ(ev.target.value); return; }
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
    if (inField) return;
    if (ev.key === 'Escape' && S.descEd) { ev.preventDefault(); closeDescBar(false); return; }
    if (k === 'Enter' && ctrl) { ev.preventDefault(); if (S.descEd) closeDescBar(true); return; }
    if (ev.altKey && !ctrl && (ev.code === 'Digit0' || ev.code === 'Numpad0')) { ev.preventDefault(); showOrg(); return; }
    if (ev.altKey && !ctrl && (ev.code === 'Digit1' || ev.code === 'Numpad1')) { ev.preventDefault(); showErrors(); return; }
    if (tableKey(ev, k, ctrl)) { ev.preventDefault(); return; }
    const map = { a: 'selall', h: 'replace', n: 'new', o: 'open', s: 'save', z: 'undo', y: 'redo', c: 'copy', x: 'cut', v: 'paste', r: 'rung', d: 'desc', w: 'newtag', e: 'xref', g: 'goto', t: 'toggle', f: 'find', i: 'insmode' };
    if (ctrl && ev.shiftKey && k.toLowerCase() === 's') { ev.preventDefault(); run('rstart'); return; }
    if (ctrl && (k === 'Home' || k === 'End')) { ev.preventDefault(); const n = rungs().length; if (n) { S.sel = null; S.selRung = k === 'Home' ? 0 : n - 1; render(); scrollToSel(); } return; }
    if (ctrl && map[k.toLowerCase()]) { ev.preventDefault(); run(map[k.toLowerCase()]); return; }
    if (k === 'Delete') { run('del'); return; }
    if (k === 'Insert') { ev.preventDefault(); run('ins'); return; }
    if (k === 'F10' && ev.shiftKey || k === 'ContextMenu') { ev.preventDefault(); const p = selPoint(); if (p) ctxMenu(S.sel ? { ri: S.sel.ri, path: S.sel.path, br: S.sel.br, leg: S.sel.leg, op: S.sel.op } : { ri: curSelRung() }, p.x, p.y); return; }
    if (k === 'F2') { ev.preventDefault(); editSelOperand(); return; }
    if (k === 'Enter') { if (selInstr() && S.sel.op != null) editSelOperand(); else if (S.sel && !S.sel.br) run('edit'); else if (curSelRung() != null && editable()) rungText(curSelRung()); return; }
    if (k === 'F1') { ev.preventDefault(); run('help'); return; }
    if (k === 'F3') { ev.preventDefault(); run(ev.shiftKey ? 'findprev' : 'findnext'); return; }
    if (k === 'Home' || k === 'End') {
      ev.preventDefault();
      const ri = curSelRung(), fl = ri == null ? [] : flat(parsed(ri) || []);
      if (fl.length) { S.sel = { ri, path: fl[k === 'Home' ? 0 : fl.length - 1] }; S.selRung = null; render(); scrollToSel(); }
      return;
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { ev.preventDefault(); moveSel(k === 'ArrowLeft' ? -1 : 1, 0); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown') { ev.preventDefault(); moveSel(0, k === 'ArrowUp' ? -1 : 1); return; }
    if (k === 'Escape') { S.sel = null; S.selAll = null; S.selIns = null; if (S.tagAll) { S.tagAll = false; refreshTags(); } render(); return; }
    if (ctrl || ev.altKey || k.length !== 1 || !editable()) return;
    // Quick Keys on: one key inserts its instruction after the selection (or at the end of the selected rung)
    if (S.prefs.quickKeys && QUICK[k.toLowerCase()] && (S.sel || curSelRung() != null)) { ev.preventDefault(); quickKey(QUICK[k.toLowerCase()]); return; }
    // otherwise typing starts the edit of the selected operand, the typed key replacing its text
    if (/^[\w:.[\]#+-]$/.test(k) && selInstr()) { ev.preventDefault(); editSelOperand(k); }
  }

  /* ---------- updates ---------- */
  let upInfo = null;
  function upbar() { return `<div class="upbar">${ic('download')}<span class="grow"><b>MT PLC Studio v${esc(upInfo.version)}</b>${upInfo.channel === 'beta' ? ' (beta)' : ''} is ready. You have v${esc(VERSION)}.</span><button class="btn pri" data-up="go">Restart to update</button><button class="btn" data-up="later">Later</button></div>`; }
  document.addEventListener('input', ev => { if (ev.target.id === 'desctx' && S.descEd) S.descEd.value = ev.target.value; });
  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-up]'); if (!b) return;
    if (b.dataset.up === 'go') { saveProject(); window.MTPSUpdater.apply(upInfo); } else { window.MTPSUpdater.skip(upInfo); upInfo = null; render(); }
  });

  /* ---------- start ---------- */
  function start() {
    applyTheme();
    store.del('session');
    S.layout = pickLayout();
    bind();
    openProject(blank('New_Project'), true);
    S.noProj = true; S.view = 'start'; S.selRung = null; reverify();
    render();
    setTimeout(moveOldProjects, 500);
    if (!driverUp() && !drivers.length) setTimeout(() => setupWizard(0), 300);
    setInterval(tick, 20);
    requestAnimationFrame(loop);
    if (window.MTPSUpdater) window.MTPSUpdater.init({ version: VERSION, build: BUILD, onAvailable: info => { upInfo = info; render(); }, toast, dialog, esc });
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  E.App = { VERSION, BUILD, state: S, render, run, insertMn, quick, openProject, example, blank, racks, get chassis() { return chassis; }, mountChassis, toL5X, fromL5X, select: t => { select(t); render(); }, openEditor, toast, xref, findAll };
  Object.defineProperty(E.App, 'ctl', { get: () => ctl });
  start();
})();
