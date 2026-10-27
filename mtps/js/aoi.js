/* MT PLC Studio: Assets > Add-On Instructions (1756-PM010, Add-On Instructions Programming Manual; v37 help:
   Creating add-on instructions, New Component > Add-On Instruction, Open Instruction Definition).
   - the New Add-On Instruction dialog: Name, Description, Type, Revision, Revision Note, Vendor;
   - the Add-On Instruction Definition editor: General, Parameters (Name, Usage, Data Type, Default, Req, Vis,
     Description, External Access; Move Up / Move Down) and Local Tags (Name, Data Type, Default, Description);
   - the organizer: Assets > Add-On Instructions > <name> > Parameters and Local Tags, Logic (a ladder routine that
     opens in the editor as program 'aoi:<name>').
   The engine (js/engine.js) builds the data type (Data Types > Add-On-Defined) and runs the instruction. */
(function () {
  'use strict';
  const E = window.MTPS, A = E.App;
  if (!A || !A.ui) return;
  const U = s => String(s == null ? '' : s).toUpperCase();
  const IO = E.AOI_IO || ['BOOL', 'SINT', 'INT', 'DINT', 'REAL'];
  const USAGES = ['Input', 'Output', 'InOut'], ACC = ['Read/Write', 'Read Only', 'None'];
  const S = () => A.state;
  const list = () => S().p.aois || (S().p.aois = []);
  const find = n => (S().p.aois || []).find(a => U(a.name) === U(n)) || null;
  let style = false;
  function css() {
    if (style) return; style = true;
    const s = document.createElement('style');
    s.textContent = `.aprows{display:flex;flex-direction:column;gap:6px;margin:6px 0}
      .aprow{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;border:1px solid var(--border);border-radius:var(--r-sm,4px);padding:6px;background:var(--surface)}
      .aprow.fixed{opacity:.75}.aprow .inp{min-width:0}.aprow .an{flex:2 1 140px}.aprow .ad{flex:2 1 120px}.aprow .au{flex:1 1 90px}.aprow .av{flex:1 1 70px}.aprow .ads{flex:3 1 160px}
      .aprow label.ck{margin:0;white-space:nowrap}.aprow .ib{flex:none}.aprow .rv{flex:1 1 100%;font-size:12px;color:var(--muted)}`;
    document.head.appendChild(s);
  }
  /* ---------- the Logic routine as a program of the editor ---------- */
  const cache = new WeakMap();
  function aoiProg(name) {
    const m = /^aoi:(.+)$/.exec(String(name || ''));
    const a = m && find(m[1]);
    if (!a) return null;
    if (!a.routines || !a.routines.length) a.routines = [{ name: 'Logic', rungs: [{ t: '' }] }];
    let P = cache.get(a);
    if (!P) { P = { name: 'aoi:' + a.name, main: 'Logic', aoi: a, tags: [] }; cache.set(a, P); }
    // a tag made in this scope from the logic (New Tag) becomes a local tag
    const known = new Set(['ENABLEIN', 'ENABLEOUT'].concat((a.params || []).map(x => U(x.name)), (a.locals || []).map(x => U(x.name))));
    P.tags.filter(t => !known.has(U(t.name)) && !t.alias).forEach(t => { (a.locals || (a.locals = [])).push({ name: t.name, type: t.type || 'BOOL', dim: t.dim || 0, desc: t.desc || '' }); });
    P.name = 'aoi:' + a.name; P.routines = a.routines;
    P.tags.length = 0;
    P.tags.push({ name: 'EnableIn', type: 'BOOL', desc: 'Enable Input - System Defined Parameter' }, { name: 'EnableOut', type: 'BOOL', desc: 'Enable Output - System Defined Parameter' });
    (a.params || []).forEach(x => P.tags.push({ name: x.name, type: x.type, dim: x.dim || 0, desc: x.desc || '' }));
    (a.locals || []).forEach(x => P.tags.push({ name: x.name, type: x.type, dim: x.dim || 0, desc: x.desc || '' }));
    return P;
  }
  // the members of the data type that are not hidden (the Monitor Tags of an instance tag)
  function aoiMembers(ty) {
    const a = find(ty);
    if (!a) return null;
    return [{ name: 'EnableIn', type: 'BOOL' }, { name: 'EnableOut', type: 'BOOL' }].concat((a.params || []).filter(x => x.usage !== 'InOut').map(x => ({ name: x.name, type: x.type })));
  }
  /* ---------- the organizer ---------- */
  function aoiTree(add, lvl) {
    const s = S(), errs = n => s.verify && s.verify.errors.some(e => e.program === 'aoi:' + n);
    (s.p.aois || []).forEach(a => add('aoi:' + a.name, lvl, a.name, 'prog', { f: errs(a.name) ? '⊗' : '' }, () => {
      add('aoip:' + a.name, lvl + 1, 'Parameters and Local Tags', 'tag');
      add('rt:aoi:' + a.name + '/Logic', lvl + 1, 'Logic', 'ladder', { on: s.prog === 'aoi:' + a.name && s.routine === 'Logic' });
    }));
  }
  function aoiOrg(k, dbl) {
    if (k.startsWith('aoip:')) { definition(k.slice(5), 'par'); return true; }
    if (k.startsWith('aoi:') && dbl) { definition(k.slice(4)); return true; }
    if (k.startsWith('dt:a:') && dbl) { definition(k.slice(5)); return true; }
    if (k.startsWith('rt:aoi:') && dbl) { A.ui.openRoutine(k); return true; }
    return false;
  }
  function aoiMenu(k) {
    const u = A.ui, off = u.editable() && u.offline();
    if (k === 'aois') return [{ l: 'New Add-On Instruction…', i: 'prog', run: () => newAOI(), dis: !off }];
    if (k.startsWith('aoi:') || k.startsWith('aoip:') || k.startsWith('dt:a:')) {
      const n = k.slice(k.indexOf(':', k.startsWith('dt:a:') ? 3 : 0) + 1);
      return [{ l: 'Open Definition', run: () => definition(n) }, { l: 'Open Logic', i: 'ladder', run: () => u.openRoutine('rt:aoi:' + n + '/Logic') }, '-', { l: 'Delete', run: () => del(n), dis: !off }];
    }
    if (k.startsWith('rt:aoi:')) return [{ l: 'Open', run: () => u.openRoutine(k) }];
    return null;
  }
  function del(n) {
    const u = A.ui, a = find(n);
    if (!a) return;
    u.confirmDlg('Delete Add-On Instruction', `Delete the Add-On Instruction <b>${u.esc(a.name)}</b>? Its calls and the tags of its data type no longer verify.`, 'Delete', () => {
      u.edit(() => { const l = list(); l.splice(l.indexOf(a), 1); if (U(S().prog) === U('aoi:' + a.name)) { const g = u.allProgs()[0]; S().prog = g.name; S().routine = g.main || g.routines[0].name; } });
      u.toast(`Add-On Instruction ${a.name} deleted`);
    }, true);
  }
  // the name rules of PM010: up to 40 characters, a letter or _ first, letters, digits and _; not the name of a
  // built-in instruction or of another Add-On Instruction (nor of a data type: the instruction defines one)
  function nameErr(n, self) {
    if (!E.validName(n)) return 'Name: up to 40 characters, starting with a letter or _, then letters, digits and _ (no two _ in a row, no _ at the end).';
    const i = E.INSTR[U(n)];
    if (i && !i.aoi) return `Name: ${n} is the name of a built-in instruction.`;
    const o = find(n);
    if (o && o !== self) return `Name: an Add-On Instruction named ${o.name} already exists.`;
    const p = S().p;
    if (E.ATOMIC.includes(U(n)) || Object.keys(E.PREDEF).some(x => U(x) === U(n)) || (p.dataTypes || []).some(d => U(d.name) === U(n))) return `Name: ${n} is already the name of a data type.`;
    return '';
  }
  const revOk = r => /^\d{1,4}\.\d{1,4}$/.test(String(r || '').trim());
  /* ---------- New Add-On Instruction ---------- */
  function newAOI() {
    const u = A.ui, esc = u.esc;
    if (!u.editable() || !u.offline()) { u.toast('Add-On Instructions are created and edited offline.', 'err'); return null; }
    return u.dialog({ title: 'New Add-On Instruction', size: 'md', focus: true,
      body: `<div class="frow"><label for="na-n">Name</label><input class="inp mono" id="na-n" maxlength="40" autocomplete="off" spellcheck="false" autocapitalize="off"></div>
        <div class="frow"><label for="na-d">Description</label><textarea class="inp" id="na-d" maxlength="512" rows="2"></textarea></div>
        <div class="frow"><label for="na-t">Type</label><select class="inp" id="na-t"><option>Ladder Diagram</option></select></div>
        <div class="frow"><label for="na-r">Revision</label><input class="inp mono" id="na-r" value="1.0" inputmode="decimal" autocomplete="off"></div>
        <div class="frow"><label for="na-rn">Revision Note</label><textarea class="inp" id="na-rn" rows="2"></textarea></div>
        <div class="frow"><label for="na-v">Vendor</label><input class="inp" id="na-v" autocomplete="off"></div>
        <p class="help">The logic of an Add-On Instruction is a ladder routine in this app (Function Block and Structured Text logic are not offered).</p>
        <div class="errtx" id="na-e"></div>`,
      buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
        const q = s => el.querySelector(s), n = q('#na-n').value.trim(), r = q('#na-r').value.trim();
        const e = nameErr(n) || (revOk(r) ? '' : 'Revision: major.minor, e.g. 1.0.');
        if (e) { q('#na-e').textContent = e; return false; }
        const a = { name: n, type: 'Ladder Diagram', rev: r, params: [], locals: [], routines: [{ name: 'Logic', rungs: [{ t: '' }] }] };
        const d = q('#na-d').value.trim(), rn = q('#na-rn').value.trim(), v = q('#na-v').value.trim();
        if (d) a.desc = d; if (rn) a.note = rn; if (v) a.vendor = v;
        u.edit(() => { list().push(a); });
        u.toast(`Add-On Instruction ${n} created`);
        // then the Add-On Instruction Definition opens (v37 help, Creating add-on instructions)
        setTimeout(() => definition(n, 'par'), 0);
      } }] });
  }
  /* ---------- Add-On Instruction Definition ---------- */
  function definition(name, tab) {
    const u = A.ui, esc = u.esc, a = find(name);
    if (!a) return null;
    css();
    const ro = !(u.editable() && u.offline()), dis = ro ? ' disabled' : '';
    // the rows being edited (applied with Apply / OK)
    let pars = (a.params || []).map(x => Object.assign({}, x)), locs = (a.locals || []).map(x => Object.assign({}, x));
    const tyText = x => x.type + (E.dimN(x.dim) ? `[${E.dimText(x.dim)}]` : '');
    const gen = `<div class="frow"><label for="ad-n">Name</label><input class="inp mono" id="ad-n" value="${esc(a.name)}" readonly></div>
      <div class="frow"><label for="ad-d">Description</label><textarea class="inp" id="ad-d" maxlength="512" rows="2"${dis}>${esc(a.desc || '')}</textarea></div>
      <div class="frow"><label for="ad-t">Type</label><select class="inp" id="ad-t" disabled><option>Ladder Diagram</option></select></div>
      <div class="frow"><label for="ad-r">Revision</label><input class="inp mono" id="ad-r" value="${esc(a.rev || '1.0')}"${dis}></div>
      <div class="frow"><label for="ad-rn">Revision Note</label><textarea class="inp" id="ad-rn" rows="2"${dis}>${esc(a.note || '')}</textarea></div>
      <div class="frow"><label for="ad-v">Vendor</label><input class="inp" id="ad-v" value="${esc(a.vendor || '')}"${dis}></div>
      <p class="help">The revision is not managed by the software: you decide how it is used and when it changes.</p>`;
    const fixed = (n, us) => `<div class="aprow fixed"><span class="an mono">${n}</span><span class="au">${us}</span><span class="ad mono">BOOL</span><span class="rv">${n === 'EnableIn' ? 'Enable Input - System Defined Parameter' : 'Enable Output - System Defined Parameter'}</span></div>`;
    const parRow = (x, i) => {
      const io = x.usage === 'InOut', req = io || !!x.req, vis = req || !!x.vis;
      return `<div class="aprow" data-ap="${i}"><input class="inp mono an" data-f="name" value="${esc(x.name)}" placeholder="Name" aria-label="Name"${dis}>
        <select class="inp au" data-f="usage" aria-label="Usage"${dis}>${USAGES.map(s => `<option${s === x.usage ? ' selected' : ''}>${s}</option>`).join('')}</select>
        <input class="inp mono ad" data-f="type" value="${esc(tyText(x))}" placeholder="Data Type" aria-label="Data Type" list="ad-tl"${dis}>
        <input class="inp mono av" data-f="def" value="${esc(io || x.def == null ? '' : x.def)}" placeholder="Default" aria-label="Default"${io || ro ? ' disabled' : ''}>
        <label class="ck"><input type="checkbox" data-f="req"${req ? ' checked' : ''}${io || ro ? ' disabled' : ''}> Req</label>
        <label class="ck"><input type="checkbox" data-f="vis"${vis ? ' checked' : ''}${req || ro ? ' disabled' : ''}> Vis</label>
        <input class="inp ads" data-f="desc" value="${esc(x.desc || '')}" placeholder="Description" aria-label="Description" maxlength="512"${dis}>
        <select class="inp au" data-f="access" aria-label="External Access"${io || ro ? ' disabled' : ''}>${ACC.map(s => `<option${s === (x.access || 'Read/Write') ? ' selected' : ''}>${s}</option>`).join('')}</select>
        <button class="ib" data-mv="-1" title="Move Up" aria-label="Move Up"${dis}>${u.ic('up')}</button><button class="ib" data-mv="1" title="Move Down" aria-label="Move Down"${dis}>${u.ic('down')}</button><button class="ib" data-del="1" title="Delete" aria-label="Delete"${dis}>${u.ic('close')}</button></div>`;
    };
    const locRow = (x, i) => `<div class="aprow" data-al="${i}"><input class="inp mono an" data-f="name" value="${esc(x.name)}" placeholder="Name" aria-label="Name"${dis}>
        <input class="inp mono ad" data-f="type" value="${esc(tyText(x))}" placeholder="Data Type" aria-label="Data Type" list="ad-tl"${dis}>
        <input class="inp mono av" data-f="def" value="${esc(x.def == null || typeof x.def === 'object' ? '' : x.def)}" placeholder="Default" aria-label="Default"${dis}>
        <input class="inp ads" data-f="desc" value="${esc(x.desc || '')}" placeholder="Description" aria-label="Description" maxlength="512"${dis}>
        <button class="ib" data-del="1" title="Delete" aria-label="Delete"${dis}>${u.ic('close')}</button></div>`;
    const types = () => E.ATOMIC.concat(Object.keys(E.PREDEF), (S().p.dataTypes || []).map(d => d.name), (S().p.aois || []).filter(x => x !== a).map(x => x.name));
    const parTab = () => `<div class="aprows" id="ad-pars">${fixed('EnableIn', 'Input')}${fixed('EnableOut', 'Output')}${pars.map(parRow).join('')}</div>
      <div class="brow" style="margin-top:0"><button class="btn" id="ad-np" type="button"${dis}>New Parameter</button></div>
      <p class="help">Input and Output parameters are BOOL, SINT, INT, DINT or REAL, passed by value; an InOut parameter is any data type, passed by reference, and always required and visible. A required parameter is visible. The order of the parameters is the order on the instruction.</p>`;
    const locTab = () => `<div class="aprows" id="ad-locs">${locs.map(locRow).join('')}</div>
      <div class="brow" style="margin-top:0"><button class="btn" id="ad-nl" type="button"${dis}>New Local Tag</button></div>
      <p class="help">Local tags are hidden members of the data type: only the logic of the instruction uses them. A MESSAGE cannot be a local tag (use an InOut parameter); an array has one dimension.</p>`;
    const title = () => `Add-On Instruction Definition - ${a.name} v${a.rev || '1.0'}`;
    const el = u.dialog({ title: title(), size: 'lg',
      body: u.tabbed([['gen', 'General', gen], ['par', 'Parameters', `<div id="ad-pt">${parTab()}</div>`], ['loc', 'Local Tags', `<div id="ad-lt">${locTab()}</div>`]], tab || 'gen') +
        `<datalist id="ad-tl">${types().map(t => `<option value="${esc(t)}">`).join('')}</datalist>${ro ? '<p class="help">Online: the definition is edited offline only.</p>' : ''}<div class="errtx" id="ad-e"></div>`,
      buttons: ro ? [{ l: 'Close' }] : [{ l: 'Cancel' }, { l: 'Apply', run: x => { apply(x); return false; } }, { l: 'OK', pri: true, run: x => (apply(x) ? undefined : false) }],
      mount: m => {
        u.bindTabs(m);
        const q = s => m.querySelector(s);
        // the rows as typed → pars / locs
        const read = () => {
          m.querySelectorAll('[data-ap]').forEach(r => { const x = pars[+r.dataset.ap], f = k => r.querySelector(`[data-f="${k}"]`); x.name = f('name').value.trim(); x.usage = f('usage').value; x.typeText = f('type').value.trim(); x.defText = f('def').value.trim(); x.req = f('req').checked; x.vis = f('vis').checked; x.desc = f('desc').value.trim(); x.access = f('access').value; });
          m.querySelectorAll('[data-al]').forEach(r => { const x = locs[+r.dataset.al], f = k => r.querySelector(`[data-f="${k}"]`); x.name = f('name').value.trim(); x.typeText = f('type').value.trim(); x.defText = f('def').value.trim(); x.desc = f('desc').value.trim(); });
        };
        const redraw = () => { q('#ad-pt').innerHTML = parTab(); q('#ad-lt').innerHTML = locTab(); };
        const keepText = x => { if (x.typeText != null) { const d = u.parseDataType(x.typeText); if (typeof d !== 'string') { x.type = d.type; x.dim = d.dim; } } if (x.defText != null) x.def = x.defText === '' ? undefined : x.defText; };
        m.addEventListener('click', ev => {
          if (ro) return;
          const b = ev.target.closest('button'); if (!b) return;
          if (b.id === 'ad-np') { read(); pars.forEach(keepText); locs.forEach(keepText); pars.push({ name: '', usage: 'Input', type: 'BOOL', req: false, vis: false }); redraw(); const r = m.querySelectorAll('[data-ap]'); r[r.length - 1].querySelector('[data-f="name"]').focus(); return; }
          if (b.id === 'ad-nl') { read(); pars.forEach(keepText); locs.forEach(keepText); locs.push({ name: '', type: 'DINT' }); redraw(); const r = m.querySelectorAll('[data-al]'); r[r.length - 1].querySelector('[data-f="name"]').focus(); return; }
          const row = b.closest('[data-ap],[data-al]'); if (!row) return;
          read(); pars.forEach(keepText); locs.forEach(keepText);
          const arr = row.dataset.ap != null ? pars : locs, i = +(row.dataset.ap != null ? row.dataset.ap : row.dataset.al);
          if (b.dataset.del) arr.splice(i, 1);
          else if (b.dataset.mv) { const j = i + +b.dataset.mv; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; }
          redraw();
        });
        // Required makes a parameter visible; an InOut is always required and visible, and has no default
        m.addEventListener('change', ev => {
          const r = ev.target.closest('[data-ap]'); if (!r || ro) return;
          const f = k => r.querySelector(`[data-f="${k}"]`), io = f('usage').value === 'InOut';
          if (io) { f('req').checked = true; f('vis').checked = true; f('def').value = ''; }
          if (f('req').checked) f('vis').checked = true;
          f('req').disabled = io; f('vis').disabled = io || f('req').checked; f('def').disabled = io; f('access').disabled = io;
        });
        m._read = read;
      } });
    function apply(x) {
      if (ro) return true;
      const q = s => x.querySelector(s), fail = t => { q('#ad-e').textContent = t; return false; };
      x._read();
      const r = q('#ad-r').value.trim();
      if (!revOk(r)) return fail('General: Revision is major.minor, e.g. 1.0.');
      const seen = new Set(['ENABLEIN', 'ENABLEOUT']), P = [], L = [];
      const num = (t, ty) => { if (t == null || t === '') return undefined; const v = Number(t); if (!isFinite(v)) return null; if (ty === 'BOOL') return v === 0 || v === 1 ? v : null; if (ty !== 'REAL' && !Number.isInteger(v)) return null; return v; };
      for (const p of pars) {
        if (!p.name) return fail('Parameters: every parameter needs a name.');
        if (!E.validName(p.name) || seen.has(U(p.name))) return fail(`Parameters: '${p.name}' is not a valid name, or it is used twice (EnableIn and EnableOut are taken).`);
        seen.add(U(p.name));
        const d = u.parseDataType(p.typeText != null ? p.typeText : tyText(p));
        if (typeof d === 'string') return fail(`Parameter ${p.name}: ${d}`);
        if (U(d.type) === U(a.name)) return fail(`Parameter ${p.name}: an Add-On Instruction cannot contain itself.`);
        const io = p.usage === 'InOut';
        if (!io && (!IO.includes(U(d.type)) || d.dim)) return fail(`Parameter ${p.name}: an ${p.usage} parameter must be BOOL, SINT, INT, DINT or REAL (an InOut parameter can be any data type, an array too).`);
        if (Array.isArray(d.dim)) return fail(`Parameter ${p.name}: an InOut array has one dimension in this app.`);
        const o = { name: p.name, usage: p.usage, type: d.type };
        if (d.dim) o.dim = d.dim;
        if (io) { o.req = true; o.vis = true; } else {
          const v = num(p.defText != null ? p.defText : p.def, U(d.type));
          if (v === null) return fail(`Parameter ${p.name}: the Default must be a ${U(d.type) === 'BOOL' ? '0 or 1' : U(d.type) === 'REAL' ? 'number' : 'whole number'}.`);
          if (v !== undefined) o.def = v;
          if (p.req) { o.req = true; o.vis = true; } else if (p.vis) o.vis = true;
          if (p.access && p.access !== 'Read/Write') o.access = p.access;
        }
        if (p.desc) o.desc = p.desc;
        P.push(o);
      }
      for (const l of locs) {
        if (!l.name) return fail('Local Tags: every local tag needs a name.');
        if (!E.validName(l.name) || seen.has(U(l.name))) return fail(`Local Tags: '${l.name}' is not a valid name, or it is the name of a parameter or another local tag.`);
        seen.add(U(l.name));
        const d = u.parseDataType(l.typeText != null ? l.typeText : tyText(l));
        if (typeof d === 'string') return fail(`Local tag ${l.name}: ${d}`);
        if (U(d.type) === 'MESSAGE') return fail(`Local tag ${l.name}: a MESSAGE cannot be a local tag. Use an InOut parameter.`);
        if (U(d.type) === U(a.name)) return fail(`Local tag ${l.name}: an Add-On Instruction cannot contain itself.`);
        if (Array.isArray(d.dim)) return fail(`Local tag ${l.name}: local tags are single dimension arrays.`);
        const o = { name: l.name, type: d.type };
        if (d.dim) o.dim = d.dim;
        if (E.ATOMIC.includes(U(d.type)) && !d.dim) { const v = num(l.defText != null ? l.defText : l.def, U(d.type)); if (v === null) return fail(`Local tag ${l.name}: the Default must be a number of its type.`); if (v !== undefined) o.def = v; }
        if (l.desc) o.desc = l.desc;
        L.push(o);
      }
      const desc = q('#ad-d').value.trim(), note = q('#ad-rn').value.trim(), vendor = q('#ad-v').value.trim();
      u.edit(() => {
        a.params = P; a.locals = L; a.rev = r;
        if (desc) a.desc = desc; else delete a.desc;
        if (note) a.note = note; else delete a.note;
        if (vendor) a.vendor = vendor; else delete a.vendor;
      });
      pars = P.map(o => Object.assign({}, o)); locs = L.map(o => Object.assign({}, o));
      const t = x.querySelector('.dh b'); if (t) t.textContent = title();
      fail('');
      return true;
    }
    return el;
  }
  Object.assign(A, { aoiProg, aoiMembers, aoiTree, aoiOrg, aoiMenu, newAOI, aoiDefinition: definition });
})();
