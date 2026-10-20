/* App shell: project state, persistence, scan loop, views, status bar, lessons. */
(function () {
  'use strict';
  const esc = UI.esc;
  const VERSION = '2.0.0';
  // build id: 'dev' in the repository; the Pages and release builds stamp it (scripts/copy-web.sh) so the updater can tell builds apart
  const BUILD = 'dev';
  /* project file format: raise it when a saved project gains content older versions cannot read. Files without it are 1.
     A part, symbol or wire this version does not know is kept as it is, up to KEEP_MAX characters each. */
  const FORMAT = 2, KEEP_MAX = 20000;
  /* four workspaces; Learn opens from the Help menu */
  const VIEWS = ['ladder', 'schematic', 'wiring', 'hmi', 'learn'];
  /* several views side by side; areas a/b/c are laid out by #main.panes-N in the CSS */
  const LAYOUTS = [
    { key: 'single', label: 'Single view', panes: null },
    { key: 'bench', label: 'Workbench: Ladder + Wiring + HMI', short: 'Workbench', panes: ['ladder', 'wiring', 'hmi'] },
    { key: 'lw', label: 'Ladder + Wiring', short: 'Ladder · Wiring', panes: ['ladder', 'wiring'] },
    { key: 'lh', label: 'Ladder + HMI', short: 'Ladder · HMI', panes: ['ladder', 'hmi'] },
    { key: 'wh', label: 'Wiring + HMI', short: 'Wiring · HMI', panes: ['wiring', 'hmi'] },
    { key: 'sw', label: 'Electrical Diagram + Wiring', short: 'Diagram · Wiring', panes: ['schematic', 'wiring'] },
    { key: 'sl', label: 'Electrical Diagram + Ladder', short: 'Diagram · Ladder', panes: ['ladder', 'schematic'] },
    { key: 'slw', label: 'Ladder + Electrical Diagram + Wiring', short: 'Ladder · Diagram · Wiring', panes: ['ladder', 'schematic', 'wiring'] },
  ];
  /* layouts saved by older versions, which still had the Operator Panel */
  const OLD_LAYOUT = { lwh: 'bench', lp: 'lw', wp: 'wh', swp: 'slw' };
  const NARROW = 760;

  const App = {
    project: null,
    plc: new PLCcore.Engine(),
    ctx: { plcIn: 0, plcInRaw: 0, plcOut: 0, plcInX: [], plcOutX: [], rack: null, plcPowered: false, plcId: null, mode: 'PROG', forces: false },
    api: null,
    view: 'ladder',
    currentId: null,
    layout: 'single',
    dirty: { ladder: true, wiring: true, hmi: true },
  };
  window.App = App;
  App.ctx.setMode = m => App.setMode(m);
  // MSG instructions reach the remote PLCs of the simulated network through this hook
  const remote = node => App.project && App.project.net && App.project.net.remotes.find(r => r.node === node);
  App.plc.net = {
    has: node => !!remote(node),
    read: (node, off, n) => remote(node).data.slice(off, off + n),
    write: (node, off, vals) => { const r = remote(node); vals.forEach((v, k) => { if (off + k < 32) r.data[off + k] = v; }); },
  };
  // the HMI terminal in the Wiring shows and operates the HMI screen
  App.ctx.hmiMini = () => HMI.mini();
  App.ctx.hmiPress = (id, ev) => HMI.pressId(id, ev);
  // Verify checks I/O addresses against the hardware in the Wiring
  App.plc.ioCheck = a => Circuit.ioCheck(a, App.project.circuit, App.project.io);

  /* ---------- project ---------- */
  /* Build a project from saved or imported data. Files can be hand-edited, so every field is checked:
     ids, colors and numbers end up in SVG/HTML markup. Throws if the data is not a project at all. */
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const arr = v => (Array.isArray(v) ? v : []);
  const ID = /^[A-Za-z0-9_-]{1,40}$/;
  const HEX = /^#[0-9a-fA-F]{3,8}$/;
  const str = (v, n = 400) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, n) : '');
  /* simulated network: remote PLCs (node 2–8, 32 N7 words each) and produced / consumed links */
  function cleanNet(n) {
    const o = isObj(n) ? n : {}, int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
    const remotes = arr(o.remotes).filter(isObj).filter(r => Number.isInteger(r.node) && r.node >= 2 && r.node <= 8)
      .filter((r, i, a) => a.findIndex(x => x.node === r.node) === i).slice(0, 7)
      .map(r => ({ node: r.node, name: str(r.name, 16).toUpperCase().replace(/[^A-Z0-9_]/g, '') || 'PLC_' + r.node, data: Array.from({ length: 32 }, (_, i) => int(arr(r.data)[i], -32768, 32767, 0)) }));
    const links = arr(o.links).filter(isObj).filter(l => (l.dir === 'consume' || l.dir === 'produce') && remotes.some(r => r.node === l.node))
      .slice(0, 16).map(l => { const n = int(l.n, 1, 16, 1); return { dir: l.dir, node: l.node, remote: int(l.remote, 0, 32 - n, 0), local: int(l.local, 0, 32 - n, 0), n }; });
    return { remotes, links };
  }
  /* the controller's own program (Realistic connection) is checked like the project's: its rungs, files and tags are
     rebuilt through buildProject, so a hand-edited file cannot carry bad tags or markup into Upload or the ladder */
  function cleanCtl(s) {
    if (typeof s !== 'string' || s.length >= 400000) return null;
    let o; try { o = JSON.parse(s); } catch (e) { return null; }
    if (!isObj(o) || !Array.isArray(o.main)) return null;
    const rungs = list => arr(list).filter(isObj).map(r => ({ text: str(r.t, 20000), comment: str(r.c) }));
    const sub = buildProject({ name: 'controller', ladder: { rungs: rungs(o.main), files: arr(o.files).filter(isObj).map(f => ({ n: f.n, name: f.name, period: f.period, rungs: rungs(f.r) })) }, tags: o.tags });
    return progSnap(sub);
  }
  function buildProject(p) {
    if (!isObj(p)) throw new Error('This is not a PLC Trainer project file');
    const lad = isObj(p.ladder) ? p.ladder : {}, cir = isObj(p.circuit) ? p.circuit : {}, hm = isObj(p.hmi) ? p.hmi : {};
    const parseRungs = list => arr(list).filter(isObj).map(r => {
      const text = str(r.text, 20000), comment = str(r.comment);
      try { return Ladder.newRung(Ladder.parseRung(text), comment); }
      catch (err) { return Ladder.newRung([], `${comment} [could not parse: ${text}]`); }
    });
    const rungs = parseRungs(lad.rungs);
    // subroutine files LAD 3–9
    const files = arr(lad.files).filter(f => isObj(f) && Number.isInteger(f.n) && f.n >= 3 && f.n <= 9)
      .filter((f, i, a) => a.findIndex(g => g.n === f.n) === i).sort((a, b) => a.n - b.n)
      .map(f => ({ n: f.n, name: str(f.name, 10).toUpperCase().replace(/[^A-Z0-9_]/g, '') || 'SUB' + f.n, period: Number.isInteger(f.period) && f.period >= 10 && f.period <= 10000 ? f.period : 0, rungs: parseRungs(f.rungs) }));
    // controller tags: unique valid names; base tags keep a valid address of their type, an alias needs a valid address
    const TT = { BOOL: 'bit', INT: 'word', TIMER: 'struct', COUNTER: 'struct', ALIAS: null };
    const tags = [];
    for (const t of arr(p.tags).filter(isObj)) {
      const name = str(t.name, 40).toUpperCase();
      if (!PLCcore.tagNameOk(name) || tags.some(x => x.name === name) || !Object.prototype.hasOwnProperty.call(TT, t.type)) continue;
      const a = PLCcore.parse(str(t.addr, 20));
      const okA = a && !a.tag && (t.type === 'ALIAS' ? (a.kind === 'bit' || a.kind === 'word') : a.kind === TT[t.type] && ({ BOOL: 'B3', INT: 'N7', TIMER: 'T4', COUNTER: 'C5' }[t.type] === a.file));
      const addr = okA ? a.norm : t.type === 'ALIAS' ? null : PLCcore.allocTag(t.type, tags);
      if (addr) tags.push({ name, type: t.type, addr, desc: str(t.desc, 80) });
    }
    const desc = {};
    if (isObj(lad.desc)) for (const k in lad.desc) { const v = str(lad.desc[k], 80); if (v) desc[k] = v; }
    // ids are a letter and a number below 1e9 (the counter stays exact), each id once; a missing id is not the text "undefined"
    const idOk = (x, i, a) => typeof x.id === 'string' && ID.test(x.id) && (Number(String(x.id).replace(/\D/g, '')) || 0) < 1e9 && a.findIndex(y => isObj(y) && y.id === x.id) === i;
    /* parts, symbols and wires this version does not know (a newer version made them) are put aside unchanged in `keep`
       and written back by App.serialize: they are not shown or simulated, and never lost. Damaged entries are counted. */
    const keep = { comps: [], wires: [], rungs: [], feeders: [], free: { items: [], wires: [] }, kinds: [], dropped: 0,
      fits: x => { try { return JSON.stringify(x).length <= KEEP_MAX; } catch (e) { return false; } } };
    const isKnown = c => Object.prototype.hasOwnProperty.call(Circuit.DEFS, c.type);
    const comps = [];
    arr(cir.comps).forEach((c, i, a) => {
      if (!isObj(c) || !idOk(c, i, a)) { keep.dropped++; return; }
      if (isKnown(c)) comps.push(Circuit.normalize(JSON.parse(JSON.stringify(c))));
      else if (typeof c.type === 'string' && c.type && keep.comps.length < 1000 && keep.fits(c)) { keep.comps.push(JSON.parse(JSON.stringify(c))); keep.kinds.push(c.type); }
      else keep.dropped++;
    });
    const ids = new Set(comps.map(c => c.id)), keptIds = new Set(keep.comps.map(c => c.id));
    const termOk = k => typeof k === 'string' && ids.has(k.split(':')[0]) && Circuit.DEFS[comps.find(c => c.id === k.split(':')[0]).type].terms.some(t => t.id === k.split(':')[1]);
    // a wire end on a part that was put aside, or on a terminal this version does not know
    const endKept = k => typeof k === 'string' && (keptIds.has(k.split(':')[0]) || ids.has(k.split(':')[0]));
    keep.railOk = k => keptIds.has(String(k).split(':')[0]);
    const wires = [];
    arr(cir.wires).forEach((w, i, a) => {
      if (!isObj(w) || !idOk(w, i, a)) { keep.dropped++; return; }
      if (termOk(w.a) && termOk(w.b)) wires.push({
        id: w.id, a: w.a, b: w.b, color: HEX.test(w.color) ? w.color : '#1d1d1d', ...(w.sch === true ? { sch: true } : {}),
        ...(typeof w.tag === 'string' && w.tag.trim() ? { tag: w.tag.trim().slice(0, 12) } : {}),
        pts: arr(w.pts).filter(q => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)).map(q => [q[0], q[1]]),
      });
      else if (endKept(w.a) && endKept(w.b) && keep.wires.length < 4000 && keep.fits(w)) keep.wires.push(JSON.parse(JSON.stringify(w)));
      else keep.dropped++;
    });
    const maxNum = list => list.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0);
    const seq = v => (Number.isInteger(v) && v >= 0 && v < 1e9 ? v : 0);
    const schematic = Schematic.clean(p.schematic, termOk, keep);
    delete keep.fits; delete keep.railOk;
    // tags of what was kept are reserved: a new device never takes one. A kept part or symbol without a readable tag is
    // counted, because its tag (if it has one in the newer version) cannot be reserved
    const reserved = new Set();
    keep.untagged = 0;
    const tagOk = t => typeof t === 'string' && t.trim() !== '';
    keep.comps.forEach(c => { if (isObj(c.props) && tagOk(c.props.label)) reserved.add(c.props.label); else keep.untagged++; });
    keep.free.items.forEach(i => { if (tagOk(i.tag)) reserved.add(i.tag); else keep.untagged++; });
    const walk = a => arr(a).forEach(e => {
      if (!isObj(e)) return;
      if (e.k === 'br') { arr(e.legs).forEach(walk); return; }
      if (tagOk(e.tag)) reserved.add(e.tag); else keep.untagged++;
      ['delta', 'star'].forEach(q => { if (tagOk(e[q])) reserved.add(e[q]); });
    });
    keep.rungs.forEach(x => walk(x.r.elems)); keep.feeders.forEach(x => walk(x.f.elems)); walk(keep.main);
    // a tag of a device this version knows (a kept path may use a known contactor) belongs to that device: not reserved.
    // Only devices count: a saved project holds the devices its symbols use, and a symbol drawn here with a reserved tag
    // was refused, so it must not free the tag when the project is opened again
    comps.forEach(c => reserved.delete(c.props.label));
    keep.tags = [...reserved];
    const format = Number.isInteger(p.format) && p.format > 0 ? p.format : 1;
    const circuit = { comps, wires, seq: Math.max(seq(cir.seq), maxNum(comps), maxNum(wires), maxNum(keep.comps), maxNum(keep.wires)) };
    // read by Circuit.create, the Wiring and the Electrical Diagram; not saved (App.serialize lists the circuit's fields)
    Object.defineProperty(circuit, 'reserved', { value: reserved, enumerable: false });
    return {
      name: str(p.name, 80).trim() || 'Untitled',
      ladder: { rungs, desc, files },
      tags,
      net: cleanNet(p.net),
      // connection: 'simple' (edits run at once) or 'real' (a controller program of its own, Download / Upload)
      conn: { mode: isObj(p.conn) && p.conn.mode === 'real' ? 'real' : 'simple', ctl: isObj(p.conn) ? cleanCtl(p.conn.ctl) : null },
      // new parts and wires never reuse the id or the tag of one that was put aside
      circuit,
      hmi: HMI.cleanAll(hm),
      schematic,
      io: Circuit.cleanIo(p.io),
      addr: Object.prototype.hasOwnProperty.call(Circuit.STYLES, p.addr) ? p.addr : 'file',
      events: arr(p.events).filter(e => isObj(e) && Number.isFinite(e.t) && Object.prototype.hasOwnProperty.call(KINDS, e.kind)).slice(-LOG_KEEP).map(e => ({ t: e.t, kind: e.kind, msg: str(e.msg, 300) })),
      keep, format,
    };
  }
  /* what to tell the user when a project holds things this version does not know */
  function compatMsg(proj) {
    const k = proj.keep, msgs = [];
    if (!k) return msgs;
    const n = k.comps.length + k.free.items.length + k.rungs.length + k.feeders.length + (k.main ? 1 : 0), w = k.wires.length + k.free.wires.length;
    const names = [...new Set(k.kinds.map(s => String(s).replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, 24)).filter(Boolean))].slice(0, 5);
    if (proj.format > FORMAT) msgs.push(`This project was saved by a newer PLC Trainer (project format ${proj.format}; this version reads format ${FORMAT}). Update the app to use everything in it.`);
    if (n || w) msgs.push(`${n} part${n === 1 ? '' : 's'} or symbol${n === 1 ? '' : 's'} and ${w} wire${w === 1 ? '' : 's'} are not known to this version${names.length ? ` (${names.join(', ')})` : ''}. They are kept and saved back unchanged, but not shown or simulated.`);
    if (k.untagged) msgs.push(`${k.untagged} of them ${k.untagged === 1 ? 'has' : 'have'} no tag this version can read, so ${k.untagged === 1 ? 'its tag' : 'their tags'} could not be reserved: a device you add here could get the same tag.`);
    if (k.L || k.N) msgs.push(`The supply rail of the current paths is on a part this version does not know: those current paths are not powered or simulated here, and no other supply is used in its place.`);
    if (k.dropped) msgs.push(`${k.dropped} damaged entr${k.dropped === 1 ? 'y' : 'ies'} in the project could not be read and ${k.dropped === 1 ? 'was' : 'were'} left out.`);
    return msgs;
  }
  App.compat = () => compatMsg(App.project);
  App.buildProject = buildProject;
  App.loadProject = function (p) { applyProject(buildProject(p)); };
  function applyProject(proj) {
    App.project = proj;
    conn.online = false; conn.testing = false;
    App.addrChanged(false);
    LOG.length = 0; LOG.push(...proj.events); unseen = 0;
    const plc = App.plc;
    plc.setMode('PROG');
    plc.resetData();
    Object.keys(plc.forces).forEach(k => plc.setForce(k, null));
    plc.forcesEnabled = true;
    lastForces = {}; lastFen = true;
    App.loadProgram();
    plc.applyAll(true);
    Ladder.resetSel(); Workspace.resetView(); HMI.resetSel(); Schematic.resetSel();
    Object.keys(App.dirty).forEach(k => { App.dirty[k] = true; });
    renderVisible();
    document.querySelector('[data-pname]').textContent = App.project.name;
    clearTimeout(saveT); saveT = null;
    store();
    App.log('system', `Opened project “${App.project.name}”`);
    const cm = compatMsg(proj);
    cm.forEach(m => App.log('system', m));
    if (cm.length) UI.toast(cm.join(' '), 'warn', 9000);
  }
  App.serialize = function () {
    const p = App.project;
    return withKept({
      version: 1, name: p.name,
      ladder: { rungs: p.ladder.rungs.map(r => ({ comment: r.comment || '', text: Ladder.serialize(r.elems) })), desc: p.ladder.desc,
        files: (p.ladder.files || []).map(f => ({ n: f.n, name: f.name, period: f.period || 0, rungs: f.rungs.map(r => ({ comment: r.comment || '', text: Ladder.serialize(r.elems) })) })) },
      tags: p.tags || [],
      net: p.net && (p.net.remotes.length || p.net.links.length) ? p.net : undefined,
      conn: p.conn && p.conn.mode === 'real' ? { mode: 'real', ctl: p.conn.ctl } : undefined,
      circuit: { comps: p.circuit.comps.map(c => ({ id: c.id, type: c.type, x: c.x, y: c.y, props: c.props, state: c.state })), wires: p.circuit.wires, seq: p.circuit.seq },
      hmi: p.hmi,
      schematic: { L: p.schematic.L, N: p.schematic.N, rungs: p.schematic.rungs.map(r => ({ comment: r.comment || '', elems: JSON.parse(JSON.stringify(r.elems, (k, v) => (k === 'p' ? undefined : v))) })), power: p.schematic.power ? JSON.parse(JSON.stringify(p.schematic.power)) : undefined, free: p.schematic.free ? JSON.parse(JSON.stringify(p.schematic.free)) : undefined },
      io: p.io,
      addr: p.addr,
      events: LOG.slice(-LOG_KEEP),
    }, p);
  };
  /* the saved form: what this version keeps aside goes back where it was. A kept current path or feeder goes right after
     the one it followed when the project was opened (`prev`, by identity); if that one was deleted, or Undo replaced the
     diagram, it goes back at its old count (`at`). The kept main power circuit and rails are written back as they were:
     the Electrical Diagram refuses to replace them, and rails it chose by itself meanwhile are not saved over them.
     A kept wire whose other end was deleted here is left out. The format is never lowered. */
  function withKept(out, p) {
    const k = p.keep;
    out.format = Math.max(FORMAT, p.format || 0);
    if (!k) return out;
    const cp = JSON.parse(JSON.stringify(k)), C = out.circuit, S = out.schematic;
    C.comps.push(...cp.comps);
    const cids = new Set(C.comps.map(c => c.id)), on = (e, ids) => typeof e === 'string' && ids.has(e.split(':')[0]);
    C.wires = C.wires.concat(cp.wires.filter(w => on(w.a, cids) && on(w.b, cids)));
    // list: the saved copies of `src` (the project's own objects, same order); kept[j].prev is one of `src` or null
    const put = (list, src, kept, copies, key) => {
      const a = list.slice();
      kept.map((x, j) => { const i = x.prev ? src.indexOf(x.prev) : -1; return { j, at: x.prev === null ? 0 : i >= 0 ? i + 1 : Math.min(x.at, list.length) }; })
        .sort((u, v) => u.at - v.at || u.j - v.j).forEach((q, o) => a.splice(q.at + o, 0, copies[q.j][key]));
      return a;
    };
    S.rungs = put(S.rungs, p.schematic.rungs, k.rungs, cp.rungs, 'r');
    if (S.power) {
      S.power.feeders = put(S.power.feeders || [], (p.schematic.power && p.schematic.power.feeders) || [], k.feeders, cp.feeders, 'f');
      if (cp.main) S.power.main = cp.main;
    }
    if (cp.L) S.L = cp.L;
    if (cp.N) S.N = cp.N;
    if (S.free && (cp.free.items.length || cp.free.wires.length)) {
      S.free.items = S.free.items.concat(cp.free.items);
      const fids = new Set(S.free.items.map(i => i.id));
      S.free.wires = S.free.wires.concat(cp.free.wires.filter(w => on(w.a, fids) && on(w.b, fids)));
    }
    return out;
  }
  let saveT = null, saveFailed = false;
  /* write the project to browser storage; warn once if it fails (storage full or blocked) */
  function store() {
    if (!App.project || !App.currentId) return true;
    const ok = Store.save(App.currentId, App.serialize());
    if (!ok && !saveFailed) {
      UI.toast('Could not save: browser storage is full or blocked. Use File → Export to file to keep a copy.', 'danger', 7000);
      App.log('alarm', 'Project could not be saved (browser storage full or blocked)');
    }
    saveFailed = !ok;
    App.lastSave = ok ? Date.now() : App.lastSave;
    saveState(ok ? 'saved' : 'failed');
    return ok;
  }
  function saveState(st) {
    const el = document.querySelector('[data-saved]');
    if (!el) return;
    el.textContent = st === 'saved' ? 'Saved' : st === 'pending' ? 'Saving…' : 'Not saved';
    el.className = 'save-st ' + st;
  }
  App.save = function () {
    clearTimeout(saveT);
    saveState('pending');
    saveT = setTimeout(() => { saveT = null; store(); }, 500);
  };
  /* write any pending change now, before switching to another project */
  App.flushSave = function () {
    // nothing pending and the last save worked; a failed save is tried again
    if (saveT === null && !saveFailed) return true;
    clearTimeout(saveT); saveT = null;
    return store();
  };
  /* leaving the current project (open another, update): if it cannot be saved, ask before its changes are lost */
  App.leaveProject = function (go) {
    if (App.flushSave()) { go(); return true; }
    UI.confirm('Changes not saved', 'The current project could not be saved (browser storage is full or blocked). Use File → Export to file first to keep it, or continue and lose its latest changes.', go, 'Continue without saving');
    return false;
  };
  /* open project data as a new saved project (examples, imports, New project).
     The data is checked first, so a broken file leaves the current project as it was. */
  App.openNew = function (data) {
    const proj = buildProject(data);
    return App.leaveProject(() => openProject(proj));
  };
  function openProject(proj) {
    App.currentId = Store.newId();
    Store.setCurrent(App.currentId);
    applyProject(proj);
    // an example (or file) with diagram rungs but no diagram wires yet: let the Electrical Diagram wire them now
    const sp = proj.schematic.power;
    if ((proj.schematic.rungs.length || sp.main.length || sp.feeders.some(f => f.elems.length) || proj.schematic.free.wires.length) && !proj.circuit.wires.some(w => w.sch)) Schematic.sync();
  }
  App.openSaved = function (id) {
    let proj = null;
    try { const data = Store.load(id); if (data) proj = buildProject(data); } catch (err) { proj = null; }
    if (!proj) { UI.toast('That project could not be read', 'danger'); return false; }
    return App.leaveProject(() => { App.currentId = id; Store.setCurrent(id); applyProject(proj); });
  };
  /* ---------- v2.0: controller tags and the controller organizer ---------- */
  const TAG_TYPES = { BOOL: 'BOOL (one bit)', INT: 'INT (16-bit integer)', TIMER: 'TIMER', COUNTER: 'COUNTER', ALIAS: 'ALIAS (another name for an address)' };
  App.tagChanged = function () { App.loadProgram(); App.plc.applyAll(false); Ladder.render(); Ladder.DataTable.render(); App.save(); };
  function tagForm(t) {
    const tags = App.project.tags, esc = UI.esc;
    UI.form(t ? `Tag ${t.name}` : 'New tag', [
      { key: 'name', label: 'Name (letters, digits, _)', value: t ? t.name : '' },
      { key: 'type', label: 'Type', value: t ? t.type : 'BOOL', options: Object.entries(TAG_TYPES).map(([v, l]) => ({ v, l })) },
      { key: 'alias', label: 'Alias for (ALIAS only, e.g. I:1/0 or I0.0)', value: t && t.type === 'ALIAS' ? App.fmt(t.addr) : '' },
      { key: 'desc', label: 'Description', value: t ? t.desc : '' },
    ], v => {
      const name = v.name.trim().toUpperCase();
      if (!PLCcore.tagNameOk(name)) return 'A name starts with a letter or _, has letters, digits and _ only, and is not an address or an instruction';
      if (tags.some(x => x !== t && x.name === name)) return `${name} already exists`;
      let addr;
      if (v.type === 'ALIAS') {
        const a = PLCcore.parse(App.addrIn(v.alias));
        if (!a || a.tag || (a.kind !== 'bit' && a.kind !== 'word')) return 'Type the address it stands for, e.g. I:1/0, O:2/3, N7:5';
        addr = a.norm;
      } else addr = t && t.type === v.type ? t.addr : PLCcore.allocTag(v.type, tags.filter(x => x !== t));
      if (!addr) return 'No free address left for this type';
      // renaming a tag renames it in the program too
      if (t && t.name !== name) renameInProgram(t.name, name);
      const n = { name, type: v.type, addr, desc: v.desc.trim().slice(0, 80) };
      if (t) Object.assign(t, n); else tags.push(n);
      App.log('system', `Tag ${name} (${v.type}) ${t ? 'changed' : 'created'} → ${addr}`);
      App.tagChanged(); App.tagsDialog(); return undefined;
    }, `<p class="help">BOOL, INT, TIMER and COUNTER tags get their own address (shown in the list). Use a tag name in an instruction instead of an address: <code>XIC START_PB</code>, <code>TON PUMP_DELAY 1.0 5 0</code>, <code>XIC PUMP_DELAY.DN</code>.</p>`);
  }
  function renameInProgram(from, to) {
    const re = new RegExp(`^${from}(\\.[A-Z]+)?$`);
    const fix = arr => arr.forEach(e => { if (e.t === 'BST') e.legs.forEach(fix); else e.a = e.a.map(x => (re.test(String(x).toUpperCase()) ? to + String(x).toUpperCase().slice(from.length) : x)); });
    [App.project.ladder.rungs, ...(App.project.ladder.files || []).map(f => f.rungs)].forEach(list => list.forEach(r => fix(r.elems)));
  }
  App.tagsDialog = function () {
    document.querySelectorAll('.modal-wrap[data-tags]').forEach(m => m.remove());
    const tags = App.project.tags, esc = UI.esc;
    const m = UI.modal({
      title: 'Controller Tags', wide: true,
      body: `${tags.length ? `<table class="io-cfg tag-tbl"><tr><th>Name</th><th>Type</th><th>Address</th><th>Value</th><th>Description</th><th></th></tr>${tags.map((t, i) => `<tr><td><a href="#" data-tedit="${i}"><code>${esc(t.name)}</code></a></td><td>${t.type}</td><td><code>${esc(App.fmt(t.addr))}</code></td><td class="num" data-tval="${esc(t.name)}"></td><td>${esc(t.desc)}</td><td><button class="tbtn sm" data-tdel="${i}" title="Delete tag">✕</button></td></tr>`).join('')}</table>` : '<p class="help">No tags yet. A tag is a name for a bit, an integer, a timer or a counter, so the program reads like the machine: <code>XIC START_PB</code> instead of <code>XIC I:1/0</code>.</p>'}`,
      buttons: [{ label: '＋ New tag', onClick: () => { tagForm(null); return false; } }, { label: 'Close', primary: true }],
      onOpen: el => {
        el.closest('.modal-wrap').dataset.tags = '1';
        el.querySelectorAll('[data-tedit]').forEach(a => { a.onclick = ev => { ev.preventDefault(); tagForm(tags[Number(a.dataset.tedit)]); }; });
        el.querySelectorAll('[data-tdel]').forEach(b => { b.onclick = () => { const t = tags[Number(b.dataset.tdel)]; UI.confirm('Delete tag', `Delete ${t.name}? Instructions that use it become invalid until you fix them.`, () => { tags.splice(tags.indexOf(t), 1); App.log('system', `Tag ${t.name} deleted`); App.tagChanged(); App.tagsDialog(); }, 'Delete'); }; });
        const upd = () => { if (!el.isConnected) { clearInterval(tm); return; } el.querySelectorAll('[data-tval]').forEach(c => { const t = PLCcore.tagOf(c.dataset.tval); c.textContent = t ? (t.type === 'TIMER' || t.type === 'COUNTER' ? `ACC ${App.plc.read(t.name + '.ACC')} · DN ${App.plc.read(t.name + '.DN')}` : String(App.plc.read(t.name))) : ''; }); };
        const tm = setInterval(upd, 250); upd();
      },
    });
    return m;
  };
  App.organizer = function () {
    const lad = App.project.ladder, esc = UI.esc, r = Circuit.rack(App.project.circuit, App.project.io);
    const PER = [0, 10, 50, 100, 250, 500, 1000];
    const per = lad.files.filter(f => f.period);
    const body = `<ul class="org">
      <li>🖥 <b>Controller</b> “${esc(App.project.name)}” · ${r.cpu ? 'modular rack' : r.ctl ? 'compact PLC' : 'no PLC in the Wiring'} · ${App.plc.mode}
        <ul>
          <li>🏷 <a href="#" data-org="tags">Controller Tags</a> <small>(${App.project.tags.length})</small></li>
          <li>⚙ Tasks<ul>
            <li>↻ <b>MainTask</b> <small>continuous</small><ul><li>▤ <b>MainProgram</b><ul>
              <li>⊢ <a href="#" data-org="f2">MainRoutine</a> <small>LAD 2</small></li>
              ${lad.files.filter(f => !f.period).map(f => `<li>⊢ <a href="#" data-org="f${f.n}">${esc(f.name)}</a> <small>LAD ${f.n} · runs on JSR U:${f.n}</small></li>`).join('')}
            </ul></li></ul></li>
            ${per.map(f => `<li>⏱ <b>PeriodicTask ${f.n}</b> <small>every ${f.period} ms</small><ul><li>⊢ <a href="#" data-org="f${f.n}">${esc(f.name)}</a> <small>LAD ${f.n}</small></li></ul></li>`).join('')}
          </ul></li>
          <li>🔌 <a href="#" data-org="io">I/O Configuration</a></li>
        </ul></li></ul>
      ${lad.files.length ? `<h5>Routine tasks</h5><table class="io-cfg">${lad.files.map(f => `<tr><td>LAD ${f.n} ${esc(f.name)}</td><td><select data-per="${f.n}">${PER.map(p => `<option value="${p}" ${p === (f.period || 0) ? 'selected' : ''}>${p ? `Periodic task, every ${p} ms` : 'Called by JSR'}</option>`).join('')}</select></td></tr>`).join('')}</table>` : '<p class="help">Add a subroutine file with ＋ File in the Ladder: it runs on a JSR, or on its own as a periodic task.</p>'}`;
    UI.modal({
      title: 'Controller Organizer', body, wide: true,
      onOpen: el => {
        el.querySelectorAll('[data-org]').forEach(a => { a.onclick = ev => {
          ev.preventDefault(); el.closest('.modal-wrap').remove();
          const k = a.dataset.org;
          if (k === 'tags') App.tagsDialog(); else if (k === 'io') App.ioConfig(); else { App.showView('ladder'); Ladder.openFile(Number(k.slice(1))); }
        }; });
        el.querySelectorAll('[data-per]').forEach(s => { s.onchange = () => { const f = lad.files.find(x => x.n === Number(s.dataset.per)); f.period = Number(s.value); App.log('system', `LAD ${f.n} ${f.name}: ${f.period ? `periodic task every ${f.period} ms` : 'called by JSR'}`); App.programChanged(); el.closest('.modal-wrap').remove(); App.organizer(); }; });
      },
    });
  };
  /* ---------- v2.0 part C: simulated network (who active, remote PLCs, produced / consumed) ---------- */
  App.network = function () {
    document.querySelectorAll('.modal-wrap[data-net]').forEach(m => m.remove());
    const net = App.project.net, esc = UI.esc, r = Circuit.rack(App.project.circuit, App.project.io), c = App.project.conn;
    const ip = n => `192.168.1.${10 + n}`;
    const hmi = App.project.circuit.comps.some(x => x.type === 'hmiterm') || App.project.hmi.objects.length > 0;
    const nodes = [
      ['💻', 'This computer (programming)', '192.168.1.100', '—', c && c.mode === 'real' ? (App.conn.online ? 'Online with the controller' : 'Offline') : 'Simple connection'],
      ['🖥', `Controller “${esc(App.project.name)}”`, ip(1), '1', `${r.cpu ? 'Modular rack' : r.ctl ? 'Compact PLC' : 'Soft PLC (no PLC in the Wiring)'} · ${App.plc.mode}${App.plc.powered ? '' : ' · no power'}`],
      ...(hmi ? [['▭', 'HMI terminal', ip(9), '9', `${App.project.hmi.objects.length} objects · reads the controller tags`]] : []),
      ...net.remotes.map(x => ['🖥', `Remote PLC ${esc(x.name)}`, ip(x.node), String(x.node), 'RUN · 32 words N7:0–31 for MSG and produced / consumed data']),
    ];
    const free = [2, 3, 4, 5, 6, 7, 8].find(n => !net.remotes.some(x => x.node === n));
    const body = `<h5>Who Active</h5><table class="io-cfg"><tr><th></th><th>Device</th><th>IP address</th><th>Node</th><th>Status</th></tr>${nodes.map(n => `<tr><td>${n[0]}</td><td>${n[1]}</td><td><code>${n[2]}</code></td><td>${n[3]}</td><td>${n[4]}</td></tr>`).join('')}</table>
      <h5>Remote PLCs</h5>${net.remotes.length ? net.remotes.map(x => `<div class="net-remote"><b>${esc(x.name)}</b> <small>node ${x.node}</small> <button class="tbtn sm" data-rdel="${x.node}">✕ Remove</button>
        <div class="net-words">${x.data.slice(0, 16).map((v, i) => `<label><small>N7:${i}</small><input type="number" data-rw="${x.node}:${i}" value="${v}"></label>`).join('')}</div></div>`).join('') : '<p class="help">No remote PLC yet. A remote PLC is another controller on the network: MSG instructions read and write its N7 words, and produced / consumed links copy them every scan.</p>'}
      ${free ? `<button class="btn" data-radd="${free}">＋ Remote PLC (node ${free})</button>` : ''}
      <h5>Produced / consumed data</h5>${net.links.length ? `<table class="io-cfg"><tr><th></th><th>Remote</th><th></th><th>Local</th><th>Words</th><th></th></tr>${net.links.map((l, i) => `<tr><td>${l.dir === 'consume' ? 'Consumed' : 'Produced'}</td><td>${esc((net.remotes.find(x => x.node === l.node) || {}).name)} N7:${l.remote}</td><td>${l.dir === 'consume' ? '→' : '←'}</td><td>N7:${l.local}</td><td>${l.n}</td><td><button class="tbtn sm" data-ldel="${i}">✕</button></td></tr>`).join('')}</table>` : '<p class="help">No links.</p>'}
      ${net.remotes.length ? '<button class="btn" data-ladd>＋ Link</button>' : ''}
      <p class="help">The network is simulated: no real ports are opened. Addresses follow 192.168.1.(10 + node).</p>`;
    UI.modal({
      title: 'Network', wide: true, body,
      onOpen: el => {
        el.closest('.modal-wrap').dataset.net = '1';
        const done = () => { App.save(); App.network(); };
        el.querySelectorAll('[data-rw]').forEach(i => { i.onchange = () => { const [n, w] = i.dataset.rw.split(':').map(Number), x = net.remotes.find(q => q.node === n); x.data[w] = Math.max(-32768, Math.min(32767, Math.round(Number(i.value) || 0))); App.save(); }; });
        el.querySelectorAll('[data-rdel]').forEach(b => { b.onclick = () => { const n = Number(b.dataset.rdel); net.remotes = net.remotes.filter(x => x.node !== n); net.links = net.links.filter(l => l.node !== n); App.log('system', `Network: remote PLC node ${n} removed`); done(); }; });
        const add = el.querySelector('[data-radd]');
        if (add) add.onclick = () => UI.form('New remote PLC', [{ key: 'n', label: 'Name', value: 'PLC_' + add.dataset.radd }], v => { net.remotes.push({ node: Number(add.dataset.radd), name: v.n.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 16) || 'PLC_' + add.dataset.radd, data: new Array(32).fill(0) }); App.log('system', `Network: remote PLC node ${add.dataset.radd} added`); done(); return undefined; });
        el.querySelectorAll('[data-ldel]').forEach(b => { b.onclick = () => { net.links.splice(Number(b.dataset.ldel), 1); done(); }; });
        const la = el.querySelector('[data-ladd]');
        if (la) la.onclick = () => UI.form('New produced / consumed link', [
          { key: 'dir', label: 'Direction', value: 'consume', options: [{ v: 'consume', l: 'Consumed: remote → this controller' }, { v: 'produce', l: 'Produced: this controller → remote' }] },
          { key: 'node', label: 'Remote PLC', value: net.remotes[0].node, options: net.remotes.map(x => ({ v: x.node, l: `${x.name} (node ${x.node})` })) },
          { key: 'remote', label: 'Remote first word N7:', value: '0', type: 'number' }, { key: 'local', label: 'Local first word N7:', value: '10', type: 'number' }, { key: 'n', label: 'Words', value: '4', type: 'number' },
        ], v => {
          const n = Math.round(Number(v.n)), ro = Math.round(Number(v.remote)), lo = Math.round(Number(v.local));
          if (!(n >= 1 && n <= 16) || !(ro >= 0 && ro + n <= 32) || !(lo >= 0 && lo + n <= 32)) return 'Words 1–16, and every word within N7:0–31';
          net.links.push({ dir: v.dir, node: Number(v.node), remote: ro, local: lo, n }); App.log('system', `Network: ${v.dir} link added`); done(); return undefined;
        });
      },
    });
  };
  /* I/O Configuration: which card the CPU expects in each rack slot. A card works only when it is configured. */
  App.ioConfig = function () {
    const circ = App.project.circuit, r = Circuit.rack(circ, App.project.io), esc = UI.esc;
    if (!r.cpu) { UI.modal({ title: 'I/O Configuration', body: `<p class="help">${r.ctl ? 'The compact PLC has fixed I/O: I:0/0–11 and O:0/0–7.' : 'There is no PLC in the Wiring.'} Add a <b>PLC CPU Module</b>, a rack power supply and I/O cards (Wiring → PLC Rack) to configure a modular rack.</p>` }); return; }
    const run = App.plc.mode === 'RUN';
    const opts = sel => `<option value="">— Empty —</option>` + Circuit.CARDS().map(t => `<option value="${t}" ${t === sel ? 'selected' : ''}>${esc(Circuit.DEFS[t].name)}</option>`).join('');
    const inst = s => { const c = r.slots[s] && circ.comps.find(x => x.id === r.slots[s]); return c ? c : null; };
    const row = s => { const c = inst(s); return `<tr><th>${s}</th><td><select data-slot="${s}" ${run ? 'disabled' : ''}>${opts(r.conf[s] || '')}</select></td><td data-have="${c ? c.type : ''}">${c ? `${esc(c.props.label)} — ${esc(Circuit.DEFS[c.type].name)}` : '—'}</td><td class="io-st" data-st="${s}"></td></tr>`; };
    const body = `<p class="help">The CPU runs only when every slot holds the card configured here. ${run ? '<b>Go to PROG to change the configuration.</b>' : 'Use <b>Read I/O Config</b> to copy the installed cards.'}</p>
      <table class="io-cfg"><tr><th>Slot</th><th>Configured module</th><th>Installed in the rack</th><th></th></tr><tr><th>0</th><td>PLC CPU Module</td><td>${esc(circ.comps.find(c => c.id === r.cpu).props.label)}</td><td class="io-st ok">✓</td></tr>${Circuit.SLOTS.map(row).join('')}</table>`;
    const mark = el => el.querySelectorAll('[data-slot]').forEach(sel => {
      const have = sel.closest('tr').querySelector('[data-have]').dataset.have, st = el.querySelector(`[data-st="${sel.dataset.slot}"]`);
      st.textContent = !sel.value && !have ? '' : sel.value === have ? '✓' : '✗ mismatch'; st.className = 'io-st ' + (sel.value === have ? 'ok' : 'bad');
    });
    UI.modal({
      title: 'I/O Configuration', wide: true, body,
      onOpen: el => { mark(el); el.addEventListener('change', () => mark(el)); },
      buttons: [
        ...(run ? [] : [{ label: 'Read I/O Config', onClick: el => { el.querySelectorAll('[data-slot]').forEach(sel => { sel.value = sel.closest('tr').querySelector('[data-have]').dataset.have; }); mark(el); return false; } }]),
        { label: run ? 'Close' : 'Cancel' },
        ...(run ? [] : [{ label: 'Apply', primary: true, onClick: el => {
          const slots = {};
          el.querySelectorAll('[data-slot]').forEach(sel => { if (sel.value) slots[sel.dataset.slot] = sel.value; });
          App.project.io = Circuit.cleanIo({ slots });
          App.addrChanged();
          App.log('system', 'I/O configuration changed: ' + (Object.entries(slots).map(([s, t]) => `slot ${s} ${Circuit.DEFS[t].name}`).join(', ') || 'empty'));
          Ladder.DataTable.render(); updateBar(true); App.dirty.wiring = true; App.save();
        } }]),
      ],
    });
  };
  /* the program in the PLC: LAD 2 and the subroutine files */
  App.loadProgram = function () {
    PLCcore.setTags(App.project.tags);
    const c = App.project.conn;
    if (c && c.mode === 'real') {
      let same = progSnap() === c.ctl;
      // online in PROG: an edit is written to the controller at once (online edit in PROG)
      if (conn.online && App.plc.mode === 'PROG' && !same) { c.ctl = progSnap(); same = true; App.log('system', 'Online edit written to the controller (PROG)'); }
      conn.same = same;
      if (!same && !conn.testing) { loadSnap(c.ctl); updateConn(); return; }
    }
    const subs = {}, per = {}; (App.project.ladder.files || []).forEach(f => { subs[f.n] = f.rungs; if (f.period) per[f.n] = f.period; });
    App.plc.setProgram(App.project.ladder.rungs, subs, per);
    updateConn();
  };
  /* ---------- v2.0 part B: connection to the controller (Realistic mode) ----------
     The controller keeps the program last downloaded (project.conn.ctl, a snapshot). Offline, edits change the project only.
     Go Online compares them; Download writes the project into the controller (in PROG), Upload reads it back.
     Online in RUN, edits are pending: Test edits runs them, Assemble keeps them, Cancel goes back to the controller program. */
  const conn = { online: false, testing: false, same: true };
  App.conn = conn;
  const ladText = list => list.map(r => ({ c: r.comment || '', t: Ladder.serialize(r.elems) }));
  function progSnap(p = App.project) {
    return JSON.stringify({ main: ladText(p.ladder.rungs), files: (p.ladder.files || []).map(f => ({ n: f.n, name: f.name, period: f.period || 0, r: ladText(f.rungs) })), tags: p.tags });
  }
  const readSnap = s => { try { const o = JSON.parse(s); return o && Array.isArray(o.main) ? o : null; } catch (e) { return null; } };
  const rungsOf = list => (Array.isArray(list) ? list : []).map(r => { try { return Ladder.newRung(Ladder.parseRung(String(r.t || '')), String(r.c || '')); } catch (e) { return Ladder.newRung([], String(r.c || '')); } });
  /* run the controller's own program (its tags resolve while the program is prepared, then the project's tags come back) */
  function loadSnap(s) {
    const o = readSnap(s) || { main: [], files: [], tags: [] };
    PLCcore.setTags(Array.isArray(o.tags) ? o.tags : []);
    const subs = {}, per = {};
    (o.files || []).forEach(f => { subs[f.n] = rungsOf(f.r); if (f.period) per[f.n] = f.period; });
    App.plc.setProgram(rungsOf(o.main), subs, per);
    App.plc.applyAll(false);
    PLCcore.setTags(App.project.tags);
  }
  App.setConnMode = function (m) {
    const c = App.project.conn || (App.project.conn = { mode: 'simple', ctl: null });
    if (c.mode === m) return;
    c.mode = m; conn.online = false; conn.testing = false;
    if (m === 'real') c.ctl = progSnap();   // as if the project had just been downloaded
    App.log('system', `Connection: ${m === 'real' ? 'Realistic (download / upload)' : 'Simple (edits run at once)'}`);
    App.loadProgram(); App.save(); Ladder.render();
  };
  function needProg(what, go) {
    if (App.plc.mode === 'PROG') { go(); return; }
    UI.confirm(what, `The controller must be in PROG to ${what.toLowerCase()}. Switch to PROG now?`, () => { App.setMode('PROG'); go(); }, 'Switch to PROG');
  }
  App.download = function () {
    const c = App.project.conn; if (!c || c.mode !== 'real') return;
    if (!Ladder.verify(true)) { UI.toast('The project has errors — Verify and fix them before downloading', 'danger'); Ladder.verify(false); return; }
    needProg('Download', () => { c.ctl = progSnap(); conn.online = true; conn.testing = false; App.log('system', 'Download: the project was written to the controller'); App.loadProgram(); App.plc.applyAll(true); App.save(); UI.toast('Downloaded — online', 'ok'); Ladder.render(); });
  };
  App.upload = function () {
    const c = App.project.conn, o = c && readSnap(c.ctl); if (!o) { UI.toast('The controller has no program', 'warn'); return; }
    const L = App.project.ladder;
    L.rungs = rungsOf(o.main);
    L.files = (o.files || []).map(f => ({ n: f.n, name: f.name, period: f.period || 0, rungs: rungsOf(f.r) }));
    App.project.tags = Array.isArray(o.tags) ? JSON.parse(JSON.stringify(o.tags)) : [];
    conn.online = true; conn.testing = false;
    App.log('system', 'Upload: the controller program was read into the project');
    Ladder.resetSel(); App.loadProgram(); App.save(); Ladder.render(); Ladder.DataTable.render(); UI.toast('Uploaded — online', 'ok');
  };
  App.goOnline = function () {
    const c = App.project.conn; if (!c || c.mode !== 'real') return;
    if (conn.online) { conn.online = false; conn.testing = false; App.log('system', 'Went offline'); App.loadProgram(); Ladder.render(); return; }
    if (progSnap() === c.ctl) { conn.online = true; App.log('system', 'Went online'); App.loadProgram(); Ladder.render(); return; }
    UI.modal({
      title: 'Go Online', body: '<p>The project in this computer and the program in the controller are <b>different</b>.</p><p class="help">Download writes the project into the controller (needs PROG). Upload reads the controller program into the project (the project ladder and tags are replaced).</p>',
      buttons: [{ label: 'Compare…', onClick: () => { App.compare(); return false; } }, { label: 'Upload', onClick: () => App.upload() }, { label: 'Cancel' }, { label: 'Download', primary: true, onClick: () => App.download() }],
    });
  };
  /* what differs between the project and the controller: rungs by file, and tags */
  App.diff = function () {
    const c = App.project.conn, o = readSnap(c && c.ctl) || { main: [], files: [], tags: [] }, p = JSON.parse(progSnap()), out = [];
    const cmp = (label, a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i], y = b[i]; if (!x || !y || x.t !== y.t || x.c !== y.c) out.push({ where: `${label} rung ${String(i).padStart(4, '0')}`, proj: x ? x.t : '(none)', ctl: y ? y.t : '(none)' }); } };
    cmp('LAD 2', p.main, o.main);
    const ns = [...new Set([...p.files.map(f => f.n), ...(o.files || []).map(f => f.n)])].sort();
    for (const n of ns) { const a = p.files.find(f => f.n === n), b = (o.files || []).find(f => f.n === n); cmp(`LAD ${n}`, a ? a.r : [], b ? b.r : []); if (a && b && (a.period || 0) !== (b.period || 0)) out.push({ where: `LAD ${n} task`, proj: a.period ? `every ${a.period} ms` : 'JSR', ctl: b.period ? `every ${b.period} ms` : 'JSR' }); }
    const tk = t => `${t.type} ${t.addr}`, pt = new Map(p.tags.map(t => [t.name, t])), ct = new Map((o.tags || []).map(t => [t.name, t]));
    for (const n of new Set([...pt.keys(), ...ct.keys()])) { const a = pt.get(n), b = ct.get(n); if (!a || !b || tk(a) !== tk(b)) out.push({ where: `Tag ${n}`, proj: a ? tk(a) : '(none)', ctl: b ? tk(b) : '(none)' }); }
    return out;
  };
  App.compare = function () {
    const d = App.diff(), esc = UI.esc;
    UI.modal({ title: 'Compare project ↔ controller', wide: true, body: d.length ? `<table class="io-cfg"><tr><th>Where</th><th>Project (this computer)</th><th>Controller</th></tr>${d.map(x => `<tr><td>${esc(x.where)}</td><td><code>${esc(x.proj)}</code></td><td><code>${esc(x.ctl)}</code></td></tr>`).join('')}</table>` : '<p class="ok-msg">✓ The project and the controller are the same.</p>' });
  };
  /* online edits while running */
  App.testEdits = function () { conn.testing = true; App.log('system', 'Online edits: testing'); App.loadProgram(); App.plc.applyAll(false); Ladder.render(); };
  App.assembleEdits = function () { const c = App.project.conn; c.ctl = progSnap(); conn.testing = false; App.log('system', 'Online edits assembled into the controller'); App.loadProgram(); App.save(); Ladder.render(); };
  App.cancelEdits = function () {
    conn.testing = false;
    const o = readSnap(App.project.conn.ctl); if (o) { App.project.ladder.rungs = rungsOf(o.main); App.project.ladder.files = (o.files || []).map(f => ({ n: f.n, name: f.name, period: f.period || 0, rungs: rungsOf(f.r) })); App.project.tags = o.tags || []; }
    App.log('system', 'Online edits cancelled'); Ladder.resetSel(); App.loadProgram(); App.save(); Ladder.render();
  };
  /* status: Simple / OFFLINE / ONLINE / edits pending */
  function updateConn() {
    const el = document.querySelector('[data-conn]'); if (!el || !App.project) return;
    const c = App.project.conn, real = c && c.mode === 'real';
    const txt = !real ? '' : !conn.online ? 'OFFLINE' + (conn.same ? '' : ' · project ≠ controller') : conn.testing ? 'ONLINE · testing edits' : conn.same ? 'ONLINE' : 'ONLINE · edits pending';
    el.textContent = txt; el.hidden = !real;
    el.className = 'conn-chip ' + (!real ? '' : !conn.online ? 'off' : conn.same ? 'on' : 'edit');
    if (window.Ladder && Ladder.connUi) Ladder.connUi();
  }
  App.updateConn = updateConn;
  App.programChanged = function () { App.loadProgram(); App.save(); };
  App.circuitChanged = function () { App.addrChanged(false); App.dirty.wiring = true; renderVisible(); Ladder.DataTable.render(); App.save(); };
  /* address style of the project (display only): App.fmt(norm) shows an address, App.addrIn(text) reads one typed in any style */
  let book = null;
  App.addrChanged = function (redraw = true) {
    const old = book;
    book = Circuit.addrBook(App.project.circuit, App.project.io, App.project.addr || 'file');
    App.ctx.fmt = book.fmt;
    // the hardware changed the numbering of a bit/byte or basic style: redraw the addresses too
    if (!redraw && old && book.style !== 'file' && JSON.stringify(old.points) !== JSON.stringify(book.points)) redraw = true;
    if (redraw) { App.dirty.wiring = true; App.dirty.ladder = true; renderVisible(); Ladder.render(); Ladder.DataTable.render(); updateBar(true); }
  };
  App.fmt = a => (book ? book.fmt(a) : a);
  // every I/O address in a text (I:1/0, O:2/3) in the address style; the file-based address follows in brackets
  App.fmtText = t => String(t).replace(/\b[IO]:\d+\/\d+\b/g, a => { const f = App.fmt(a); return f === a ? a : `${f} (${a})`; });
  App.addrIn = s => (book ? book.toFile(s) : String(s).trim().toUpperCase());
  App.setAddrStyle = function (st) {
    if (!Object.prototype.hasOwnProperty.call(Circuit.STYLES, st) || App.project.addr === st) return;
    App.project.addr = st;
    App.log('system', `Address style: ${Circuit.STYLES[st]}`);
    App.addrChanged(); App.save();
  };
  App.force = function (norm, val) { App.plc.setForce(norm, val); App.forcesChanged(); };
  /* compare with the last known forces so every change is logged, whichever control made it */
  let lastForces = {}, lastFen = true;
  App.forcesChanged = function () {
    const plc = App.plc, now = plc.forces;
    for (const k in now) if (lastForces[k] !== now[k]) App.log('force', `Force ${now[k] ? 'ON' : 'OFF'} installed on ${App.fmtText(k)}`);
    for (const k in lastForces) if (!(k in now)) App.log('force', `Force removed from ${App.fmtText(k)}`);
    if (plc.forcesEnabled !== lastFen) App.log('force', `Forces ${plc.forcesEnabled ? 'enabled' : 'disabled'}`);
    lastForces = { ...now }; lastFen = plc.forcesEnabled;
    Ladder.DataTable.render(); updateBar(true);
  };
  App.setMode = function (m) {
    const rk = m === 'RUN' && Circuit.rack(App.project.circuit, App.project.io);
    if (rk && rk.cpu && rk.bad.length) {
      const msg = `I/O configuration does not match the rack: ${rk.bad.map(b => b.msg).join('; ')}`;
      UI.toast(msg + ' — open I/O Configuration', 'danger', 6000); App.log('system', 'Go to RUN refused: ' + msg); return;
    }
    if (m === 'RUN' && (!App.project.conn || App.project.conn.mode !== 'real' || conn.same || conn.testing) && !Ladder.verify(true)) { UI.toast('Program has errors — fix them before going to RUN', 'danger'); App.log('system', 'Go to RUN refused: the program has errors'); Ladder.verify(false); return; }
    if (App.plc.mode !== m) App.log('mode', `Controller mode changed to ${m}`);
    App.plc.setMode(m);
    updateBar(true); updateConn();
  };
  /* operate a device part (button, breaker handle, selector…) from the wiring or panel view.
     Returns the release function for momentary parts (see App.hold). */
  const PART_NAMES = { btn: 'button', h: 'handle', sw: 'main switch', knob: 'selector', l: 'selector (left)', r: 'selector (right)', lever: 'lever', tgt: 'target', jam: 'JAM', reset: 'RESET', test: 'TEST', add: '+ BOX', auto: 'AUTO', clr: 'CLEAR', use: 'USE', mode: 'key switch' };
  App.operate = function (c, part) {
    Circuit.part(c, part, 'down', App.ctx);
    const st = Circuit.status(c, App.ctx);
    App.log('operator', `${c.props.label}: ${PART_NAMES[part] || part} operated${st ? ' → ' + st : ''}`);
    App.save();
    return App.hold(c.id + ':' + part, () => { Circuit.part(c, part, 'up', App.ctx); App.save(); });
  };

  /* ---------- event log (newest last; the last LOG_KEEP events are saved with the project) ---------- */
  const LOG = [], LOG_MAX = 500, LOG_KEEP = 200;
  const KINDS = { alarm: 'Alarm', mode: 'Mode', force: 'Force', operator: 'Operator', system: 'System' };
  let unseen = 0, logView = null;
  App.log = function (kind, msg) {
    LOG.push({ t: Date.now(), kind, msg: String(msg) });
    if (LOG.length > LOG_MAX) LOG.shift();
    if (kind === 'alarm') unseen++;
    const b = document.querySelector('[data-evbadge]');
    if (b) { b.textContent = unseen; b.hidden = !unseen; }
    if (logView) logView();
  };
  App.events = () => LOG.slice();
  const fmtTime = t => new Date(t).toLocaleTimeString([], { hour12: false }) + '.' + String(t % 1000).padStart(3, '0');
  function eventLog() {
    unseen = 0;
    const b = document.querySelector('[data-evbadge]'); if (b) b.hidden = true;
    let filter = 'all';
    const m = UI.modal({
      title: 'Event log', wide: true,
      body: `<div class="ev-tools"><select data-evf><option value="all">All events</option>${Object.entries(KINDS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
        <span class="spacer"></span><button class="btn" data-evx>⤓ Export CSV</button><button class="btn" data-evc>Clear</button></div>
        <div class="ev-list"></div><p class="help">Newest first (up to ${LOG_MAX} in this session). The last ${LOG_KEEP} events are saved with the project.</p>`,
    });
    const list = m.el.querySelector('.ev-list');
    logView = () => {
      if (!document.body.contains(list)) { logView = null; return; }
      const rows = LOG.filter(e => filter === 'all' || e.kind === filter).slice().reverse();
      list.innerHTML = rows.length ? `<table class="ev"><tr><th>Time</th><th>Type</th><th>Event</th></tr>${rows.map(e => `<tr class="k-${e.kind}"><td>${fmtTime(e.t)}</td><td><span class="evk">${KINDS[e.kind] || esc(e.kind)}</span></td><td>${esc(e.msg)}</td></tr>`).join('')}</table>` : '<p class="help">No events yet.</p>';
    };
    logView();
    m.el.querySelector('[data-evf]').onchange = e => { filter = e.target.value; logView(); };
    m.el.querySelector('[data-evc]').onclick = () => { LOG.length = 0; logView(); };
    m.el.querySelector('[data-evx]').onclick = () => {
      // quote every field; a leading = + - @ would be run as a formula by spreadsheets, so prefix it with '
      const q = v => { let t = String(v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
      const csv = 'time,type,event\n' + LOG.map(e => [new Date(e.t).toISOString(), KINDS[e.kind] || e.kind, e.msg].map(q).join(',')).join('\n');
      download(new Blob([csv], { type: 'text/csv' }), (App.project.name || 'project').replace(/[^\w-]+/g, '_') + '-events.csv');
    };
  }
  App.eventLog = eventLog;

  /* ---------- loop ---------- */
  const alertSeen = new Map();
  let lastGoal = 0;
  let last = performance.now();
  /* App.later(n, fn) runs fn once n more ticks (circuit solve + PLC scan) have passed.
     Momentary buttons release through it, so even a quick tap is seen by at least one scan. */
  App.ticks = 0;
  const pending = [];
  App.later = function (n, fn) { pending.push({ at: App.ticks + n, fn }); };
  App.holdTicks = 2;
  let lastPw = true;
  /* call App.hold(key, up) when a momentary button goes down; call the returned function when it is released.
     up() runs no earlier than App.holdTicks ticks after the press. A newer press on the same key cancels it. */
  const holds = new Map();
  App.hold = function (key, up) {
    const tok = { at: App.ticks };
    holds.set(key, tok);
    return () => {
      const run = () => { if (holds.get(key) === tok) { holds.delete(key); up(); } };
      const wait = tok.at + App.holdTicks - App.ticks;
      if (wait <= 0) run(); else App.later(wait, run);
    };
  };
  function tick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const ctx = App.ctx, plc = App.plc, circ = App.project.circuit;
    const rack = Circuit.rack(circ, App.project.io), pc = rack.ctl;
    ctx.plcId = pc ? pc.id : null; ctx.rack = rack;
    ctx.plcOut = plc.physOut; ctx.plcOutX = plc.physOutX.slice(); ctx.mode = plc.mode; ctx.forces = plc.forcesEnabled && plc.forceCount() > 0;
    ctx.plcIn = 0; ctx.plcInX = new Array(PLCcore.SIZES.I).fill(0); ctx.plcPowered = false;
    const r = Circuit.solve(circ, dt, ctx);
    App.api = r.api;
    for (const a of r.alerts) {
      // the same alarm is shown again after 4 s at the earliest (also in the first seconds after the app starts)
      const t = alertSeen.get(a.msg);
      if (t === undefined || now - t > 4000) { UI.toast(a.msg, a.kind || 'warn', 4200); App.log('alarm', a.msg); }
      alertSeen.set(a.msg, now);
    }
    if (r.alerts.length) App.save();
    if (now - lastGoal > 250) { lastGoal = now; checkGoals(); }
    if (pc) { plc.powered = ctx.plcPowered; plc.physIn = ctx.plcIn; } else { plc.powered = true; plc.physIn = 0; }
    plc.physInX = ctx.plcInX;
    if (pc && plc.powered !== lastPw && App.ticks > 0) App.log(plc.powered ? 'system' : 'alarm', plc.powered ? 'PLC power restored' : 'PLC lost its power');
    lastPw = plc.powered;
    ctx.plcInRaw = ctx.plcIn;
    // the rack no longer matches the I/O configuration while running: major fault, the CPU stops
    if (rack.cpu && rack.bad.length && plc.mode === 'RUN' && plc.powered) {
      plc.setMode('PROG');
      const msg = `CPU fault: I/O configuration mismatch (${rack.bad.map(b => b.msg).join('; ')}) — the controller stopped`;
      UI.toast(msg, 'danger', 6000); App.log('alarm', msg); updateBar(true);
    }
    plc.scan(dt);
    HMI.sample(now);   // trends keep their history while the HMI is not on screen
    // produced / consumed data: copied every scan while the controller runs
    const net = App.project.net;
    if (net && net.links.length && plc.mode === 'RUN' && plc.powered) for (const l of net.links) {
      const r = net.remotes.find(x => x.node === l.node); if (!r) continue;
      for (let k = 0; k < l.n; k++) { if (l.dir === 'consume') plc.data.N7[l.local + k] = r.data[l.remote + k]; else r.data[l.remote + k] = plc.data.N7[l.local + k]; }
    }
    App.ticks++;
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= App.ticks) pending.splice(i, 1)[0].fn();
  }
  function frame() {
    const vis = shownViews();
    if (vis.includes('ladder')) Ladder.update();
    if (vis.includes('wiring')) Workspace.update();
    if (vis.includes('schematic')) Schematic.update();
    if (vis.includes('hmi')) HMI.update();
    updateBar(false);
    requestAnimationFrame(frame);
  }

  /* ---------- views ---------- */
  /* 'custom' is the set of windows ticked in the View menu (1 to 3, kept in VIEWS order) */
  const VNAME = { ladder: 'Ladder', schematic: 'Electrical Diagram', wiring: 'Wiring', hmi: 'HMI' };
  let customPanes = ['ladder', 'wiring'];
  try { const c = JSON.parse(localStorage.getItem('plc-trainer.customPanes') || 'null'); if (Array.isArray(c) && c.length && c.every(v => VNAME[v])) customPanes = c.slice(0, 3); } catch (e) { /* ignore */ }
  const layoutOf = k => (k === 'custom'
    ? { key: 'custom', label: 'Custom', short: customPanes.map(v => VNAME[v]).join(' · '), panes: customPanes.length > 1 ? customPanes : null }
    : LAYOUTS.find(l => l.key === (OLD_LAYOUT[k] || k)) || LAYOUTS[0]);
  /* tick or untick a window in the View menu */
  App.toggleWindow = function (v) {
    const cur = visibleViews().filter(x => VNAME[x]);
    let next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
    if (!next.length) return;
    if (next.length > 3) { UI.toast('Up to 3 windows side by side. Untick one first.', 'warn'); return; }
    customPanes = Object.keys(VNAME).filter(x => next.includes(x));
    try { localStorage.setItem('plc-trainer.customPanes', JSON.stringify(customPanes)); } catch (e) { /* ignore */ }
    App.layout = 'custom';
    Workspace.refit();
    App.view = customPanes.includes(App.view) ? App.view : customPanes[0];
    App.showView(App.view);
  };
  /* ---------- floating windows: a view can be popped out of the grid into a movable, resizable window ---------- */
  const floats = new Map();          // view -> {x, y, w, h}
  let lastDocked = 'ladder';
  const floating = () => (innerWidth > NARROW ? [...floats.keys()] : []);
  function saveFloats() { try { localStorage.setItem('plc-trainer.floats', JSON.stringify([...floats])); } catch (e) { /* ignore */ } }
  App.floatView = function (v, geom) {
    if (!VNAME[v] || floats.has(v)) return;
    if (innerWidth <= NARROW) { UI.toast('Floating windows need a wider screen', 'warn'); return; }
    const g = geom || { x: 80 + floats.size * 40, y: 140 + floats.size * 40, w: Math.min(760, innerWidth - 160), h: Math.min(520, innerHeight - 200) };
    floats.set(v, g);
    const sec = document.getElementById('view-' + v);
    const fw = document.createElement('div');
    fw.className = 'float-win'; fw.dataset.fv = v;
    fw.innerHTML = `<div class="fw-head" title="Drag to move · drag the bottom-right corner to resize"><b>${VNAME[v]}</b><span class="spacer"></span><button class="tbtn sm" data-dock title="Put this window back in the main area">⤓ Dock</button></div>`;
    sec.style.gridArea = '';
    fw.appendChild(sec);
    document.body.appendChild(fw);
    sec.classList.add('active');
    const place = () => { const q = floats.get(v); Object.assign(fw.style, { left: Math.max(0, Math.min(innerWidth - 120, q.x)) + 'px', top: Math.max(0, Math.min(innerHeight - 60, q.y)) + 'px', width: q.w + 'px', height: q.h + 'px' }); };
    place();
    const head = fw.querySelector('.fw-head');
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      const q = floats.get(v), sx = e.clientX, sy = e.clientY, ox = q.x, oy = q.y;
      head.setPointerCapture(e.pointerId);
      const move = ev => { q.x = ox + ev.clientX - sx; q.y = oy + ev.clientY - sy; place(); };
      const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); saveFloats(); };
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', up);
    });
    fw.querySelector('[data-dock]').onclick = () => App.dockView(v);
    // the window clicked last gets the keyboard and comes to the front
    fw.addEventListener('pointerdown', () => { if (fw !== document.body.lastElementChild) document.body.appendChild(fw); focusView(v); }, true);
    new ResizeObserver(() => { const q = floats.get(v); if (!q || !fw.isConnected) return; q.w = fw.offsetWidth; q.h = fw.offsetHeight; saveFloats(); window.dispatchEvent(new Event('resize')); }).observe(fw);
    saveFloats();
    App.dirty[v] = true;
    if (App.view === v) App.view = lastDocked !== v ? lastDocked : VIEWS.find(x => !floats.has(x));
    App.showView(App.view);
    renderView(v);
    App.log('system', `${VNAME[v]} window floated`);
  };
  App.dockView = function (v) {
    const fw = document.querySelector(`.float-win[data-fv="${v}"]`);
    floats.delete(v); saveFloats();
    if (fw) { const main = document.getElementById('main'); main.insertBefore(document.getElementById('view-' + v), main.querySelector('.gutter')); fw.remove(); }
    App.showView(v);
  };
  function focusView(k) {
    App.view = k;
    VIEWS.forEach(x => document.getElementById('view-' + x).classList.toggle('focus', x === k && shownViews().length > 1));
    document.querySelectorAll('.tabs [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === k));
  }
  /* docked views (the grid); floating views are shown in their own windows */
  function visibleViews() {
    const fl = floating(), L = layoutOf(App.layout);
    let v = fl.includes(App.view) ? lastDocked : App.view;
    if (fl.includes(v)) v = VIEWS.find(x => !fl.includes(x));
    const panes = L.panes ? L.panes.filter(x => !fl.includes(x)) : null;
    if (!panes || panes.length < 2 || v === 'learn' || innerWidth <= NARROW || !panes.includes(v)) return [v];
    return panes;
  }
  const shownViews = () => [...visibleViews(), ...floating()];
  function renderView(v) {
    App.dirty[v] = false;
    if (v === 'ladder') { Ladder.render(); Ladder.DataTable.render(); }
    if (v === 'wiring') { Workspace.render(); Workspace.onShow(); }
    if (v === 'schematic') Schematic.render();
    if (v === 'hmi') { HMI.render(); HMI.onShow(); }
    if (v === 'learn') renderLearn();
  }
  function renderVisible() { shownViews().forEach(v => { if (App.dirty[v] !== false || v === 'learn') renderView(v); }); }
  App.showView = function (v) {
    // a floating window is brought to the front instead of changing the main area
    if (floating().includes(v)) {
      const fw = document.querySelector(`.float-win[data-fv="${v}"]`);
      if (fw) document.body.appendChild(fw);
      focusView(v);
      return;
    }
    lastDocked = v;
    const L = layoutOf(App.layout);
    // a view outside the current layout opens on its own; Learn always does
    if (L.panes && v !== 'learn' && !L.panes.includes(v)) App.layout = 'single';
    App.view = v;
    const vis = visibleViews();
    const fl = floating();
    VIEWS.forEach(k => {
      if (fl.includes(k)) return;
      const el = document.getElementById('view-' + k);
      const i = vis.indexOf(k);
      el.classList.toggle('active', i >= 0);
      el.classList.toggle('focus', vis.length > 1 && k === v);
      el.style.gridArea = i >= 0 ? 'abc'[i] : '';
    });
    const main = document.getElementById('main');
    main.classList.remove('panes-1', 'panes-2', 'panes-3');
    main.classList.add('panes-' + vis.length);
    main.classList.toggle('multi', vis.length > 1);
    document.querySelectorAll('.tabs [data-view]').forEach(b => {
      b.classList.toggle('on', b.dataset.view === v);
      b.classList.toggle('shown', vis.length > 1 && vis.includes(b.dataset.view));
    });
    const lb = document.querySelector('[data-layout]');
    const cur = layoutOf(App.layout);
    lb.textContent = '▦ ' + (cur.panes ? cur.short : 'View');
    lb.classList.toggle('on', !!cur.panes);
    vis.forEach(k => renderView(k));
    try { localStorage.setItem('plc-trainer.view', v); localStorage.setItem('plc-trainer.layout', App.layout); } catch (e) { /* ignore */ }
  };
  App.setLayout = function (k) {
    const L = layoutOf(k);
    App.layout = L.key;
    Workspace.refit();
    App.showView(L.panes ? (L.panes.includes(App.view) ? App.view : L.panes[0]) : App.view);
  };

  /* draggable dividers between panes */
  function bindGutters() {
    const main = document.getElementById('main');
    try {
      const sz = JSON.parse(localStorage.getItem('plc-trainer.panes') || '{}');
      if (sz.c1) main.style.setProperty('--c1', sz.c1);
      if (sz.r1) main.style.setProperty('--r1', sz.r1);
    } catch (e) { /* ignore */ }
    main.querySelectorAll('.gutter').forEach(g => {
      g.addEventListener('pointerdown', e => {
        e.preventDefault();
        g.setPointerCapture(e.pointerId);
        g.classList.add('drag');
        const move = ev => {
          const r = main.getBoundingClientRect();
          if (g.dataset.g === 'v') main.style.setProperty('--c1', Math.max(20, Math.min(80, (ev.clientX - r.left) / r.width * 100)).toFixed(1) + '%');
          else main.style.setProperty('--r1', Math.max(15, Math.min(85, (ev.clientY - r.top) / r.height * 100)).toFixed(1) + '%');
        };
        const up = () => {
          g.classList.remove('drag');
          g.removeEventListener('pointermove', move);
          g.removeEventListener('pointerup', up);
          try { localStorage.setItem('plc-trainer.panes', JSON.stringify({ c1: main.style.getPropertyValue('--c1'), r1: main.style.getPropertyValue('--r1') })); } catch (err) { /* ignore */ }
          window.dispatchEvent(new Event('resize'));
        };
        g.addEventListener('pointermove', move);
        g.addEventListener('pointerup', up);
      });
      g.addEventListener('dblclick', () => { main.style.removeProperty(g.dataset.g === 'v' ? '--c1' : '--r1'); window.dispatchEvent(new Event('resize')); });
    });
    // keyboard shortcuts go to the pane the user last touched
    main.addEventListener('pointerdown', e => {
      const v = e.target.closest('.view');
      if (!v || !main.classList.contains('multi')) return;
      const k = v.id.replace('view-', '');
      if (k !== App.view) {
        App.view = k;
        VIEWS.forEach(x => document.getElementById('view-' + x).classList.toggle('focus', x === k));
        document.querySelectorAll('.tabs [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === k));
      }
    }, true);
    let wasNarrow = innerWidth <= NARROW;
    window.addEventListener('resize', () => {
      const n = innerWidth <= NARROW;
      if (n !== wasNarrow) { wasNarrow = n; if (n) [...floats.keys()].forEach(k => App.dockView(k)); App.showView(App.view); }
    });
  }

  /* ---------- status bar ---------- */
  let barCache = {};
  function updateBar(force) {
    const plc = App.plc, ctx = App.ctx;
    const st = {
      mode: plc.mode, pw: plc.powered, run: plc.powered && plc.mode === 'RUN', force: plc.forceCount() > 0, fen: plc.forcesEnabled,
      io: plc.data.I.join() + '|' + plc.physOut + '|' + plc.physOutX.join() + '|' + JSON.stringify(ctx.rack && [ctx.rack.cpu, ctx.rack.slots, ctx.rack.conf]),
      scan: Math.floor(performance.now() / 500), nplc: !!ctx.plcId,
    };
    if (!force && JSON.stringify(st) === JSON.stringify(barCache)) return;
    barCache = st;
    document.querySelectorAll('.plcbar [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === plc.mode));
    const L = (k, on) => document.querySelector(`[data-led="${k}"]`).classList.toggle('on', !!on);
    L('pw', st.pw); L('run', st.run); L('force', st.force); L('fault', false);
    document.querySelector('[data-led="force"]').classList.toggle('blink', st.force && !st.fen);
    const fb = document.querySelector('[data-forces]');
    fb.textContent = `Forces: ${plc.forcesEnabled ? 'Enabled' : 'Disabled'} (${plc.forceCount()})`;
    fb.classList.toggle('warn', st.force);
    // one group of I/O lights per input word and output word (compact: I:0/O:0, rack: one per card)
    const word = (f, w) => f === 'I' ? plc.data.I[w] & 0xFFFF : w ? plc.physOutX[w] : plc.physOut;
    document.querySelector('[data-io]').innerHTML = Circuit.ioMap(App.project.circuit, App.project.io).filter(m => !m.analog).map(({ file: f, word: w, n }) =>
      `<span class="iol">${App.project.addr === 'file' || !App.project.addr ? `${f}:${w}` : (f === 'I' ? 'I' : 'Q')}</span>${Array.from({ length: n }, (_, i) => `<i class="${(word(f, w) >> i) & 1 ? 'on ' + (f === 'I' ? 'in' : 'out') : ''}${plc.forces[`${f}:${w}/${i}`] !== undefined ? ' f' : ''}" title="${App.fmt(`${f}:${w}/${i}`)}"></i>`).join('')}`).join('');
    document.querySelector('[data-scan]').textContent = `scan ${plc.scanMs.toFixed(2)} ms`;
    const msg = document.querySelector('[data-msg]');
    let m = '';
    if (!st.nplc) m = 'No PLC in the wiring — ladder runs as a virtual PLC (use forcing to test).';
    else if (!st.pw) m = '⚠ PLC has no power — check QF/L1/N wiring in the Wiring tab.';
    else if (plc.mode === 'PROG') m = st.force && st.fen ? 'Program mode — outputs are off, but forced outputs stay active. Switch to RUN to execute.' : 'Program mode — outputs are off. Switch to RUN to execute.';
    msg.textContent = m;
    msg.title = m;
    msg.classList.toggle('warn', !!st.nplc && !st.pw);
  }

  /* ---------- learn ---------- */
  let lessonId = 'l1';
  /* lesson goals: checked a few times a second while you work, one after the other; a goal stays done */
  const goals = { id: null, done: 0, t0: 0 };
  function goalApi() {
    const C = App.project.circuit, none = { state: {}, props: {} };
    return {
      dev: l => C.comps.find(c => c.props.label === l) || none,
      of: t => C.comps.filter(c => c.type === t),
      mode: () => App.plc.mode,
      read: a => { try { return App.plc.read(a); } catch (e) { return 0; } },
      project: App.project,
      ev: txt => LOG.some(e => e.t >= goals.t0 && e.msg.includes(txt)),
      rack: () => Circuit.rack(C, App.project.io),
      rungs: () => App.project.ladder.rungs.map(r => Ladder.serialize(r.elems)),
      screen: () => HMI.screen(),
    };
  }
  function trackLesson(id) {
    if (goals.id === id) return;
    goals.id = id; goals.done = 0; goals.t0 = Date.now();
  }
  App.lessonGoals = () => ({ ...goals });
  App.goalApi = goalApi;
  function checkGoals() {
    const l = goals.id && Examples.LESSONS.find(x => x.id === goals.id);
    if (!l || !l.goals || goals.done >= l.goals.length) return;
    const G = goalApi();
    let ch = false;
    while (goals.done < l.goals.length) {
      let ok = false;
      try { ok = !!l.goals[goals.done].ok(G); } catch (e) { ok = false; }
      if (!ok) break;
      const g = l.goals[goals.done++];
      ch = true;
      App.log('system', `Lesson ${l.title.split(' ·')[0]}: ✓ ${g.say}`);
      UI.toast(goals.done === l.goals.length ? `✓ ${g.say} — lesson complete!` : `✓ ${g.say}`, 'ok', 3500);
    }
    if (ch && App.view === 'learn') renderGoals();
  }
  function renderGoals() {
    const box = document.querySelector('#view-learn [data-goals]'), l = Examples.LESSONS.find(x => x.id === lessonId);
    if (!box || !l || !l.goals) return;
    const n = goals.id === l.id ? goals.done : 0;
    box.innerHTML = `<h3 class="mt">Your checklist</h3><p class="help">${goals.id === l.id ? (n === l.goals.length ? '✓ Lesson complete. Well done!' : 'Checked live while you work in the Wiring, Ladder and HMI, in this order.') : 'Load the example (or start working) to begin: each step is ticked off live while you work.'}</p>
      <ul class="grade-list">${l.goals.map((g, i) => `<li class="${i < n ? 'ok' : i === n ? 'next' : ''}">${i < n ? '✓' : i === n ? '▸' : '○'} ${esc(g.say)}</li>`).join('')}</ul>`;
  }
  function renderLearn() {
    const el = document.getElementById('view-learn');
    const L = Examples.LESSONS;
    const cur = L.find(l => l.id === lessonId) || L[0];
    const ex = Examples.EX[cur.ex];
    const INSTR = PLCcore.INSTR;
    el.innerHTML = `<div class="learn">
      <aside class="learn-nav"><h3>Lessons</h3>${[...new Set(L.map(l => l.level))].map(g => `<h6>${g}</h6>${L.filter(l => l.level === g).map(l => `<button class="${l.id === cur.id ? 'on' : ''}" data-lesson="${l.id}">${esc(l.title)}</button>`).join('')}`).join('')}
        <h3 class="mt">Examples</h3>${Object.entries(Examples.EX).map(([k, e]) => `<button data-ex="${k}">${esc(e.title)}</button>`).join('')}</aside>
      <article class="learn-body">
        <div class="kicker">${esc(cur.level)}</div><h2>${esc(cur.title)}</h2>
        <div class="lesson">${cur.body}</div>
        <div class="btn-row">${ex ? `<button class="btn${cur.test ? '' : ' primary'}" data-load="${cur.ex}">Load “${esc(ex.title)}”</button>` : ''}${cur.test ? `<button class="btn primary" data-check>✓ Check my work</button>` : ''}${cur.solution ? `<button class="btn" data-sol>Insert solution into ladder</button>` : ''}</div>
        ${cur.test ? '<div class="grade" data-grade></div>' : ''}
        ${cur.goals ? '<div class="grade" data-goals></div>' : ''}
        <h3 class="mt">Instruction reference</h3>
        <table class="ref"><tr><th>Mnemonic</th><th>Name</th><th>Operands</th><th>What it does</th></tr>${Object.entries(INSTR).map(([k, d]) => `<tr><td><code>${k}</code></td><td>${esc(d.name)}</td><td>${d.args.map(a => esc(a.n)).join(', ')}</td><td>${esc(d.help)}</td></tr>`).join('')}</table>
        <h3 class="mt">Addressing (file-based style)</h3>
        <table class="ref"><tr><th>Address</th><th>Meaning</th></tr>
          <tr><td><code>I:0/0 … I:0/11</code></td><td>Physical inputs (input image)</td></tr>
          <tr><td><code>O:0/0 … O:0/7</code></td><td>Physical relay outputs</td></tr>
          <tr><td><code>B3:0/0</code> or <code>B3/0</code></td><td>Internal bits (word 0, bit 0). <code>B3/17</code> = <code>B3:1/1</code></td></tr>
          <tr><td><code>T4:0</code> · <code>T4:0/DN</code> · <code>T4:0.ACC</code></td><td>Timer structure · done bit (EN, TT, DN) · word (PRE, ACC)</td></tr>
          <tr><td><code>C5:0</code> · <code>C5:0/DN</code> · <code>C5:0.PRE</code></td><td>Counter structure · bits (CU, CD, DN, OV, UN) · words (PRE, ACC)</td></tr>
          <tr><td><code>N7:0</code></td><td>16-bit signed integer</td></tr>
          <tr><td><code>S:1/15</code></td><td>First-scan bit</td></tr></table>
        <h3 class="mt">Keyboard</h3>
        <table class="ref"><tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd> · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> · <kbd>Ctrl</kbd>+<kbd>O</kbd></td><td>Save · Save as · Open project</td></tr><tr><td><kbd>Ctrl</kbd>+scroll</td><td>Zoom the ladder or the HMI (scroll alone zooms the wiring)</td></tr><tr><td>Drag an instruction</td><td>Move it to another place or rung (mouse). Right-click → Change to… swaps XIC ↔ XIO, TON ↔ TOF and so on.</td></tr><tr><td><kbd>Del</kbd></td><td>Delete selected instruction / rung / wire / device</td></tr><tr><td><kbd>Enter</kbd></td><td>Edit selected instruction</td></tr><tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd></td><td>Undo / redo (ladder)</td></tr><tr><td><kbd>Ctrl</kbd>+<kbd>R</kbd></td><td>New rung</td></tr><tr><td><kbd>Esc</kbd></td><td>Cancel wire / clear selection</td></tr><tr><td><kbd>M</kbd></td><td>Multimeter (Wiring)</td></tr></table>
      </article></div>`;
    renderGoals();
    el.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.lesson) { lessonId = b.dataset.lesson; if (cur.goals || Examples.LESSONS.find(x => x.id === lessonId).goals) trackLesson(lessonId); renderLearn(); el.querySelector('.learn-body').scrollTop = 0; }
      if (b.dataset.load) { loadExample(b.dataset.load); if (cur.goals) { goals.id = null; trackLesson(cur.id); } }
      if (b.dataset.ex) loadExample(b.dataset.ex);
      if (b.hasAttribute('data-check')) {
        const res = Examples.gradeLesson(cur, App.project.ladder.rungs.map(r => Ladder.serialize(r.elems)));
        const box = el.querySelector('[data-grade]');
        if (res.error) { box.innerHTML = `<p class="grade-bad">${esc(res.error)}</p>`; return; }
        const pass = res.every(r => r.ok);
        box.innerHTML = `<p class="${pass ? 'grade-ok' : 'grade-bad'}">${pass ? '✓ All checks passed. Well done!' : `${res.filter(r => r.ok).length} of ${res.length} checks passed. Fix the red ones and check again.`}</p>
          <ul class="grade-list">${res.map(r => `<li class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✗'} ${esc(r.say)}${r.ok ? '' : ` <small>(${esc(r.got)})</small>`}</li>`).join('')}</ul>
          <p class="help">The check runs your current ladder program on a simulated PLC with the inputs pressed for you. Your wiring is not used.</p>`;
        return;
      }
      if (b.hasAttribute('data-sol')) {
        UI.confirm('Insert solution', 'Replace the current ladder program with the lesson solution?', () => {
          App.plc.setMode('PROG');
          App.project.ladder.rungs = cur.solution.map(t => Ladder.newRung(Ladder.parseRung(t)));
          App.loadProgram(); App.plc.applyAll(true);
          Ladder.resetSel(); App.dirty.ladder = true; App.save();
          UI.toast('Solution inserted — switch to RUN and try it');
          App.showView('ladder');
        }, 'Replace');
      }
    };
  }
  function loadExample(k) {
    const ex = Examples.EX[k];
    App.openNew(ex.build());
    UI.toast(`Opened “${ex.title}” as a new project. Your other projects are in File → Open project.`, 'ok', 4000);
    App.showView(k === 'blank' ? 'wiring' : App.view === 'learn' ? 'wiring' : App.view);
  }
  App.loadExample = loadExample;
  function shortcuts() {
    const K = [['Ctrl+S', 'Save'], ['Ctrl+Shift+S', 'Save as'], ['Ctrl+O', 'Open project'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Delete', 'Delete the selection'], ['Esc', 'Cancel a wire or close a menu'],
      ['S / M', 'Wiring: Select / Meter tool'], ['Alt + drag', 'Wiring: place a device freely (no alignment, no DIN-rail clip)'], ['Right-click', 'Device, wire or instruction menu']];
    UI.modal({ title: 'Keyboard shortcuts', body: `<table class="kbd-table">${K.map(([k, d]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(d)}</td></tr>`).join('')}</table>`, buttons: [{ label: 'Close', primary: true }] });
  }

  /* ---------- top bar ---------- */
  function bindChrome() {
    document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) App.showView(b.dataset.view); });
    document.querySelector('.plcbar').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mode) App.setMode(b.dataset.mode);
      if (b.hasAttribute('data-forces')) { App.plc.forcesEnabled = !App.plc.forcesEnabled; App.forcesChanged(); }
      if (b.hasAttribute('data-events')) eventLog();
      if (b.hasAttribute('data-layout')) {
        const r = b.getBoundingClientRect();
        const vis = visibleViews();
        UI.menu(r.left, r.bottom + 4, [
          { head: 'Show windows (up to 3)' },
          ...Object.entries(VNAME).map(([k, n]) => ({ label: (vis.includes(k) ? '☑ ' : '☐ ') + n, onClick: () => App.toggleWindow(k) })),
          { sep: true }, { head: 'Ready-made layouts' },
          ...LAYOUTS.map(l => ({ label: (l.key === App.layout ? '✓ ' : '\u2003') + l.label, onClick: () => App.setLayout(l.key) })),
          { sep: true }, { head: 'Floating windows' },
          ...Object.entries(VNAME).map(([k, n]) => (floats.has(k) ? { label: '⤓ Dock ' + n, onClick: () => App.dockView(k) } : { label: '⧉ Float ' + n, onClick: () => App.floatView(k), disabled: innerWidth <= NARROW })),
        ]);
      }
    });
    document.querySelector('[data-examples]').addEventListener('click', e => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu(r.left, r.bottom + 4, [{ head: 'Load example' }, ...Object.entries(Examples.EX).map(([k, x]) => ({ label: x.title, onClick: () => loadExample(k) }))]);
    });
    document.querySelector('[data-help]').addEventListener('click', e => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu(r.left, r.bottom + 4, [
        { label: '✦ Lessons & guide', onClick: () => App.showView('learn') },
        { label: '⌨ Keyboard shortcuts', onClick: shortcuts },
      ]);
    });
    document.querySelector('[data-file]').addEventListener('click', e => {
      const r = e.currentTarget.getBoundingClientRect();
      UI.menu(r.left, r.bottom + 4, [
        { label: 'New project…', onClick: newProject },
        { label: 'Open project…', kbd: 'Ctrl+O', onClick: openDialog },
        { label: 'Save', kbd: 'Ctrl+S', onClick: saveNow },
        { label: 'Save as…', kbd: 'Ctrl+Shift+S', onClick: saveAs },
        { label: 'Rename project…', onClick: rename },
        { sep: true },
        { label: 'Export to file (.plc.json)', onClick: exportProject },
        { label: 'Import from file…', onClick: () => document.getElementById('importFile').click() },
        { sep: true },
        { label: 'Event log', onClick: eventLog },
        { label: 'Updates…', onClick: () => Updater.dialog() },
        { label: 'Reset PLC data table…', onClick: () => UI.confirm('Reset PLC data table', 'Clear all bits, timers, counters and integers (B3, T4, C5, N7) to zero? The program is kept.', () => { App.plc.resetData(); App.plc.applyAll(true); UI.toast('Data table cleared'); App.log('system', 'PLC data table cleared'); }, 'Reset') },
        { label: `About PLC Trainer v${VERSION}`, onClick: about },
      ]);
    });
    document.getElementById('importFile').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { App.openNew(JSON.parse(t)); UI.toast('Project imported as a new project', 'ok'); }).catch(err => UI.toast('Import failed: ' + err.message, 'danger'));
      e.target.value = '';
    });
    document.querySelector('[data-lang-btn]').addEventListener('click', () => { I18N.set(I18N.lang === 'tl' ? 'en' : 'tl'); App.log('system', `Language: ${I18N.lang === 'tl' ? 'Tagalog' : 'English'}`); });
    document.querySelector('[data-theme-btn]').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || 'auto';
      const next = cur === 'auto' ? 'dark' : cur === 'dark' ? 'light' : 'auto';
      setTheme(next);
    });
    document.querySelector('[data-pname]').addEventListener('dblclick', rename);
    document.addEventListener('keydown', e => {
      const ctl = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      // Save / Open never reach the browser (its "Save page" / file picker); inside a dialog they do nothing
      if (ctl && (key === 's' || key === 'o')) {
        e.preventDefault();
        if (document.querySelector('.modal-wrap')) return;
        if (key === 'o') openDialog(); else if (e.shiftKey) saveAs(); else saveNow();
        return;
      }
      if (UI.isTyping() || document.querySelector('.modal-wrap')) return;
      const v = App.view;
      if (v === 'ladder') Ladder.onKey(e);
      else if (v === 'wiring') Workspace.onKey(e);
      else if (v === 'schematic') Schematic.onKey(e);
      else if (v === 'hmi') HMI.onKey(e);
    });
    window.addEventListener('resize', () => { if (visibleViews().includes('ladder')) Ladder.render(); });
  }
  function setTheme(t) {
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    document.querySelector('[data-theme-btn]').textContent = t === 'dark' ? '☾' : t === 'light' ? '☀' : '◐';
    document.querySelector('[data-theme-btn]').title = 'Theme: ' + t;
    try { localStorage.setItem('plc-trainer.theme', t); } catch (e) { /* ignore */ }
  }
  function newProject() {
    const opts = Object.entries(Examples.EX).map(([k, x]) => ({ v: k, l: x.title }));
    opts.sort((a, b) => (a.v === 'blank' ? -1 : b.v === 'blank' ? 1 : 0));
    UI.form('New project', [
      { key: 'n', label: 'Project name', value: 'My project' },
      { key: 't', label: 'Start from', value: 'blank', options: opts },
    ], v => {
      const name = v.n.trim();
      if (!name) return 'Enter a project name';
      const p = Examples.EX[v.t].build();
      p.name = name;
      App.openNew(p);
      UI.toast(`Created project “${name}”`, 'ok');
      App.showView(v.t === 'blank' ? 'wiring' : 'ladder');
    }, '<p class="help">Your current project stays saved. Switch back any time with File → Open project.</p>');
  }
  function openDialog() {
    const fmt = t => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const m = UI.modal({
      title: 'Open project',
      body: '<div class="proj-list"></div>',
      buttons: [{ label: 'Close' }],
    });
    const box = m.el.querySelector('.proj-list');
    const draw = () => {
      const list = Store.list();
      box.innerHTML = list.length ? list.map(p => `<div class="proj-row${p.id === App.currentId ? ' cur' : ''}">
          <div><b>${esc(p.name)}</b><small>${p.id === App.currentId ? 'Open now · ' : ''}saved ${fmt(p.updated)}</small></div>
          <button class="btn" data-open="${p.id}" ${p.id === App.currentId ? 'disabled' : ''}>Open</button>
          <button class="icon-btn" data-del="${p.id}" title="Delete project" aria-label="Delete ${esc(p.name)}" ${p.id === App.currentId ? 'disabled' : ''}>🗑</button></div>`).join('')
        : '<p class="help">No saved projects yet.</p>';
    };
    draw();
    box.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.open) { m.close(); App.openSaved(b.dataset.open); UI.toast('Project opened', 'ok'); }
      if (b.dataset.del) {
        const p = Store.list().find(x => x.id === b.dataset.del);
        if (b.dataset.confirm) { Store.remove(b.dataset.del); draw(); UI.toast(`Deleted “${p ? p.name : 'project'}”`); }
        else { b.dataset.confirm = '1'; b.textContent = 'Delete?'; b.classList.add('danger-txt'); }
      }
    };
  }
  function about() {
    UI.modal({
      title: `PLC Trainer v${VERSION}`,
      body: `<p>PLC trainer: ladder logic, power and control wiring, forcing, HMI and live equipment.</p><h4>Install on your device</h4><ul class="tips"><li><b>Android (Chrome)</b>: tap <b>Install app</b> in the top bar, or menu ⋮ → <b>Add to Home screen</b>.</li><li><b>iPhone / iPad (Safari)</b>: tap Share → <b>Add to Home Screen</b>.</li><li><b>Windows / Mac (Chrome or Edge)</b>: click <b>Install app</b>, or the install icon in the address bar.</li></ul><p class="help">Install needs the hosted web address (https). Once installed, the app works offline.</p><p>Windows installer and Android APK: <a href="https://github.com/Ronanski/aio-icms-tool/releases/latest" target="_blank" rel="noopener">download the latest release</a>.</p><p class="help">Educational simulator. Not affiliated with any PLC manufacturer. All trademarks belong to their owners.</p>`,
    });
  }
  App.VERSION = VERSION;
  App.BUILD = BUILD;
  function rename() {
    UI.form('Rename project', [{ key: 'n', label: 'Project name', value: App.project.name }], v => {
      App.project.name = v.n.trim() || 'Untitled';
      document.querySelector('[data-pname]').textContent = App.project.name;
      App.save();
    });
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportProject() {
    download(new Blob([JSON.stringify(App.serialize(), null, 1)], { type: 'application/json' }), (App.project.name || 'project').replace(/[^\w-]+/g, '_') + '.plc.json');
  }
  /* projects save themselves; Save writes now and confirms */
  function saveNow() {
    clearTimeout(saveT); saveT = null;
    if (store()) { UI.toast(`Saved “${App.project.name}”`, 'ok', 1800); App.log('system', `Saved project “${App.project.name}”`); }
  }
  App.saveNow = saveNow;
  function saveAs() {
    UI.form('Save as', [{ key: 'n', label: 'New project name', value: App.project.name + ' (copy)' }], v => {
      const name = v.n.trim();
      if (!name) return 'Enter a project name';
      // copy the project under a new id and keep working in the copy; the running PLC and plant are not reset
      App.flushSave();
      const data = App.serialize(), id = Store.newId();
      data.name = name;
      if (!Store.save(id, data)) { UI.toast('Could not save the copy: browser storage is full or blocked.', 'danger', 6000); return; }
      App.currentId = id;
      Store.setCurrent(id);
      App.project.name = name;
      document.querySelector('[data-pname]').textContent = name;
      saveState('saved');
      App.log('system', `Saved as “${name}”`);
      UI.toast(`Saved as “${name}”. The original project is still in File → Open project.`, 'ok', 3500);
    });
  }
  App.saveAs = saveAs;

  /* ---------- boot ---------- */
  function boot() {
    let theme = 'auto';
    try { theme = localStorage.getItem('plc-trainer.theme') || 'auto'; } catch (e) { /* ignore */ }
    Ladder.init(document.getElementById('view-ladder'));
    Workspace.init(document.getElementById('view-wiring'));
    HMI.init(document.getElementById('view-hmi'));
    Schematic.init(document.getElementById('view-schematic'));
    bindChrome();
    bindGutters();
    ['.plcbar', '.lad-toolbar', '.ws-toolbar', '.hmi-toolbar'].forEach(q => document.querySelectorAll(q).forEach(UI.scrollCue));
    setTheme(theme);
    I18N.apply();
    Store.migrate();
    const cur = Store.current();
    const saved = cur ? Store.load(cur) : null;
    const first = !saved && !Store.list().length;
    let opened = !!saved && App.openSaved(cur);
    for (const p of Store.list()) { if (opened) break; opened = App.openSaved(p.id); }
    if (!opened) App.openNew(Examples.EX.plcmotor.build());
    let v = 'ladder', lay = null;
    try { v = localStorage.getItem('plc-trainer.view') || (first ? 'learn' : 'ladder'); lay = localStorage.getItem('plc-trainer.layout'); } catch (e) { /* ignore */ }
    if (v === 'panel') v = 'wiring';   // the Operator Panel was merged into the Wiring (v1.4)
    if (!VIEWS.includes(v)) v = 'ladder';
    // wide screens start on the Workbench (ladder + wiring + HMI) until the user picks something else
    App.layout = layoutOf(lay || (innerWidth >= 1200 ? 'bench' : 'single')).key;
    App.showView(v);
    try { (JSON.parse(localStorage.getItem('plc-trainer.floats') || '[]') || []).forEach(([k, g]) => { if (VNAME[k] && g && [g.x, g.y, g.w, g.h].every(Number.isFinite)) App.floatView(k, g); }); } catch (e) { /* ignore */ }
    setInterval(tick, 20);
    requestAnimationFrame(frame);
    Updater.init();
    if (first) UI.toast('Welcome! A PLC motor-control example is loaded. Start with the lessons or press RUN.', 'ok', 6000);
  }
  /* ---------- install as an app (PWA) ---------- */
  let installEvt = null;
  function setupPwa() {
    const btn = document.querySelector('[data-install]');
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; btn.hidden = false; });
    window.addEventListener('appinstalled', () => { btn.hidden = true; installEvt = null; UI.toast('PLC Trainer installed', 'ok'); });
    btn.addEventListener('click', async () => {
      if (!installEvt) return;
      installEvt.prompt();
      await installEvt.userChoice.catch(() => null);
      installEvt = null; btn.hidden = true;
    });
    // service workers need http(s); opening index.html from disk still works, just without offline install
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* blocked in sandboxed previews */ });
    }
  }

  document.addEventListener('DOMContentLoaded', () => { boot(); setupPwa(); });
  // save pending edits when the tab or app is closed or sent to the background
  window.addEventListener('pagehide', () => App.flushSave());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') App.flushSave(); });
})();
