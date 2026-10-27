/* MT PLC Studio project tools that work on project data only (no window): Compare (as the Logix Designer Compare
   Tool: two projects, the differences by component), the printed report of File > Generate Report and File > Print
   (Studio 5000 v37 help: Reports, Generate Report dialog box settings, Print Options), the sample projects (help v37:
   Vendor Sample Projects) and the release notes of Help > Release Notes. app.js shows them. */
(function (root) {
  'use strict';
  const MTPS = root.MTPS = root.MTPS || {};
  const U = s => String(s).toUpperCase();
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const progsOf = p => (p.tasks || []).flatMap(t => t.programs || []);
  const HANDLER = { fault: 'Controller Fault Handler', powerup: 'Power-Up Handler' };

  /* ---------- Compare ----------
     Left = the open project, right = the file picked. Each component is matched by name (a module by slot, a rung by
     its place after the rungs that did not change), then its properties are compared one by one. The result is one row
     per component: st 'left' (only in the left project), 'right' (only in the right one), 'diff' (in both, with the
     differences in d: [property, left, right]). o.values also compares tag values. */
  const show = v => (v == null || v === '' ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  function props(a, b, keys, skip) {
    const ks = keys || [...new Set(Object.keys(a || {}).concat(Object.keys(b || {})))].filter(k => !(skip || []).includes(k));
    const d = [];
    ks.forEach(k => { const x = show(a && a[k]), y = show(b && b[k]); if (x !== y) d.push([k, x, y]); });
    return d;
  }
  // two lists matched by a key: [[left, right]] with null for the side that lacks it, in the left's order
  function pair(a, b, key) {
    const out = [], seen = new Set(), bm = new Map((b || []).map(x => [key(x), x]));
    (a || []).forEach(x => { const k = key(x); seen.add(k); out.push([x, bm.get(k) || null]); });
    (b || []).forEach(x => { if (!seen.has(key(x))) out.push([null, x]); });
    return out;
  }
  /* the rungs of two routines: the longest run of rungs that are the same (text and comment) stays matched; what is left
     between two matched rungs pairs up as changed rungs, and the rest is only on one side */
  const txt = r => (r.c ? '// ' + r.c + '\n' : '') + (r.t || '');
  function rungDiff(A, B) {
    const ka = A.map(r => (r.t || '') + '\u0001' + (r.c || '')), kb = B.map(r => (r.t || '') + '\u0001' + (r.c || ''));
    const n = A.length, m = B.length, T = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) T[i][j] = ka[i] === kb[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
    const out = [];
    let i = 0, j = 0, ga = [], gb = [];
    const flush = () => {
      const k = Math.max(ga.length, gb.length);
      for (let x = 0; x < k; x++) {
        const l = ga[x], r = gb[x];
        // a: the rung number on the left, b: on the right; ta / tb: the rungs as text (comment first)
        if (l != null && r != null) out.push({ st: 'diff', a: l, b: r, ta: txt(A[l]), tb: txt(B[r]) });
        else if (l != null) out.push({ st: 'left', a: l, ta: txt(A[l]) });
        else out.push({ st: 'right', b: r, tb: txt(B[r]) });
      }
      ga = []; gb = [];
    };
    while (i < n || j < m) {
      if (i < n && j < m && ka[i] === kb[j]) { flush(); i++; j++; }
      else if (j >= m || (i < n && T[i + 1][j] >= T[i][j + 1])) ga.push(i++);
      else gb.push(j++);
    }
    flush();
    return out;
  }
  function compare(a, b, o) {
    o = o || {};
    const rows = [], row = (cat, name, l, r, d) => {
      if (l && r) { if (d.length) rows.push({ cat, name, st: 'diff', d }); }
      else rows.push({ cat, name, st: l ? 'left' : 'right', d: [] });
    };
    const tagSkip = o.values ? [] : ['value'];
    const tags = (cat, ta, tb) => pair(ta, tb, t => U(t.name)).forEach(([l, r]) => row(cat, (l || r).name, l, r, l && r ? props(l, r, null, tagSkip.concat(['name'])) : []));
    // Controller
    const ca = a.controller || {}, cb = b.controller || {};
    const cd = props(ca, cb, ['name', 'type', 'rev', 'slot', 'desc']).map(([f, x, y]) => [{ name: 'Name', type: 'Controller Type', rev: 'Revision', slot: 'Slot', desc: 'Description' }[f], x, y]);
    if (cd.length) rows.push({ cat: 'Controller', name: ca.name || cb.name, st: 'diff', d: cd });
    tags('Controller Tags', a.tags, b.tags);
    // handlers
    Object.keys(HANDLER).forEach(k => {
      const pa = ((a.tasks || []).find(t => t.type === k) || { programs: [] }).programs[0] || null, pb = ((b.tasks || []).find(t => t.type === k) || { programs: [] }).programs[0] || null;
      if (pa || pb) progCmp(HANDLER[k], pa, pb);
    });
    // Tasks, their programs, the programs' tags and routines, the rungs
    const tk = x => (x.tasks || []).filter(t => !HANDLER[t.type]);
    pair(tk(a), tk(b), t => U(t.name)).forEach(([l, r]) => {
      row('Tasks', (l || r).name, l, r, l && r ? props(l, r, null, ['name', 'programs']).concat(props({ programs: l.programs.map(g => g.name).join(', ') }, { programs: r.programs.map(g => g.name).join(', ') }).map(x => ['Scheduled programs', x[1], x[2]])) : []);
    });
    function progCmp(cat, l, r) {
      row(cat, (l || r).name, l, r, l && r ? props(l, r, null, ['name', 'tags', 'routines']) : []);
      if (!l || !r) return;
      tags(`${cat} > ${l.name} > Program Tags`, l.tags, r.tags);
      pair(l.routines, r.routines, x => U(x.name)).forEach(([x, y]) => {
        const nm = `${l.name} > ${(x || y).name}`;
        if (!x || !y) { row('Routines', nm, x, y, []); return; }
        const d = props(x, y, null, ['name', 'rungs']), rd = rungDiff(x.rungs || [], y.rungs || []);
        if (!d.length && !rd.length) return;
        rows.push({ cat: 'Routines', name: nm, st: 'diff', d, rungs: rd });
      });
    }
    const pa = new Map(), pb = new Map();
    tk(a).forEach(t => t.programs.forEach(g => pa.set(U(g.name), g)));
    tk(b).forEach(t => t.programs.forEach(g => pb.set(U(g.name), g)));
    pair([...pa.values()], [...pb.values()], g => U(g.name)).forEach(([l, r]) => progCmp('Programs', l, r));
    // Data Types (user-defined and strings)
    pair(a.dataTypes, b.dataTypes, d => U(d.name)).forEach(([l, r]) => {
      const cat = (l || r).family === 'string' ? 'Data Types > Strings' : 'Data Types > User-Defined';
      if (!l || !r) { row(cat, (l || r).name, l, r, []); return; }
      const d = props(l, r, null, ['name', 'members']);
      pair(l.members, r.members, x => U(x.name)).forEach(([x, y]) => {
        if (!x || !y) d.push(['Member ' + (x || y).name, x ? show(x.type) : '', y ? show(y.type) : '']);
        else props(x, y, null, ['name']).forEach(([f, p, q]) => d.push([`Member ${x.name} ${f}`, p, q]));
      });
      row(cat, l.name, l, r, d);
    });
    // I/O Configuration, by slot
    const ra = (a.rack || {}), rb = (b.rack || {});
    if (show(ra.size) !== show(rb.size)) rows.push({ cat: 'I/O Configuration', name: 'Backplane', st: 'diff', d: [['Chassis Size', show(ra.size), show(rb.size)]] });
    pair(ra.modules, rb.modules, m => m.slot).forEach(([l, r]) => row('I/O Configuration', `[${(l || r).slot}] ${(l || r).name}`, l, r, l && r ? props(l, r, null, ['slot']) : []));
    // Trends
    pair(a.trends, b.trends, t => U(t.name)).forEach(([l, r]) => row('Trends', (l || r).name, l, r, l && r ? props(l, r, null, ['name']) : []));
    const n = k => rows.filter(x => x.st === k).length;
    return { rows, left: n('left'), right: n('right'), diff: n('diff'), same: !rows.length };
  }

  /* ---------- the report (File > Generate Report, File > Print) ----------
     sel: which reports, as the Report Selection of the Generate Report dialog (toc, org, ctl, tags, tasks, progs,
     routines, rprops, dts, mods); scope: { programs: [names], routines: ['prog/routine'] } limits the routines;
     opt: the Print Options (footer, ladder: xref / space + lines, tags: sort 'name' | 'scope', unused);
     h: { ladder(rungs, program, first rung number) → SVG text, ops(rung text, program) → the tag operands, ctlType(p) → text,
     used(p) → Set of upper-case tag names, now } */
  const REPORTS = [['toc', 'Table of Contents'], ['org', 'Controller Organizer Listing'], ['ctl', 'Controller Properties Listing'], ['tags', 'Tag Listing'],
    ['tasks', 'Task Properties Listing'], ['progs', 'Program/Phase Properties Listing'], ['routines', 'Routine Listing'], ['rprops', 'Routine Properties Listing'],
    ['dts', 'Data Type Listing'], ['mods', 'Module Properties Listing']];
  function report(p, sel, opt, h, scope) {
    sel = sel || {}; opt = opt || {}; h = h || {};
    const secs = [], sec = (id, title, body) => secs.push({ id, title, body });
    const tbl = (head, rows) => `<table class="rptt"><thead><tr>${head.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}">None.</td></tr>`}</tbody></table>`;
    const kv = rows => `<table class="rptkv"><tbody>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
    const c = p.controller || {}, all = (p.tasks || []).flatMap(t => t.programs.map(g => ({ t, g })));
    const inScope = (g, r) => !scope || (scope.programs || []).includes(g.name) || (scope.routines || []).includes(g.name + '/' + r.name);
    const tyOf = t => (t.alias ? '' : (t.type || 'DINT') + (t.dim ? `[${[].concat(t.dim).join(',')}]` : ''));
    if (sel.org) {
      const ln = [];
      ln.push(`Controller ${c.name}`, '  Controller Tags');
      Object.keys(HANDLER).forEach(k => { ln.push('  ' + HANDLER[k]); ((p.tasks || []).find(t => t.type === k) || { programs: [] }).programs.forEach(g => ln.push('    ' + g.name)); });
      ln.push('Tasks');
      (p.tasks || []).filter(t => !HANDLER[t.type]).forEach(t => { ln.push('  ' + t.name); t.programs.forEach(g => { ln.push('    ' + g.name, '      Program Tags'); g.routines.forEach(r => ln.push('      ' + r.name)); }); });
      ln.push('Data Types', '  User-Defined');
      (p.dataTypes || []).filter(d => d.family !== 'string').forEach(d => ln.push('    ' + d.name));
      ln.push('  Strings');
      (p.dataTypes || []).filter(d => d.family === 'string').forEach(d => ln.push('    ' + d.name));
      if ((p.trends || []).length) { ln.push('Trends'); p.trends.forEach(t => ln.push('  ' + t.name)); }
      ln.push('I/O Configuration', `  Backplane, PLC-RACK${(p.rack || {}).size || 8}`, `    [${Number.isInteger(c.slot) ? c.slot : 0}] ${c.type || 'PLC-CPU'} ${c.name}`);
      ((p.rack || {}).modules || []).slice().sort((x, y) => x.slot - y.slot).forEach(m => ln.push(`    [${m.slot}] ${m.type} ${m.name}`));
      sec('org', 'Controller Organizer Listing', `<pre class="rptpre">${esc(ln.join('\n'))}</pre>`);
    }
    if (sel.ctl) sec('ctl', 'Controller Properties Listing', kv([['Name', c.name], ['Controller Type', h.ctlType ? h.ctlType(p) : c.type], ['Revision', c.rev || '1.0'], ['Slot', Number.isInteger(c.slot) ? c.slot : 0], ['Description', c.desc || ''],
      ['Chassis Size', (p.rack || {}).size || 8], ['Tasks', (p.tasks || []).filter(t => !HANDLER[t.type]).length], ['Programs', all.length], ['Routines', all.reduce((s, x) => s + x.g.routines.length, 0)], ['Controller Tags', (p.tags || []).length]]));
    if (sel.tags) {
      const used = h.used ? h.used(p) : null;
      const keep = t => opt.unused !== false || !used || used.has(U(t.name));
      const row = (t, sc) => [esc(t.name), esc(sc), esc(t.alias || ''), esc(tyOf(t)), esc(t.desc || ''), esc(t.access || 'Read/Write'), esc(t.style || ''), t.constant ? 'Yes' : ''];
      const head = ['Name', 'Scope', 'Alias For', 'Data Type', 'Description', 'External Access', 'Style', 'Constant'];
      const lists = [[c.name, p.tags || []]].concat(all.map(x => [x.g.name, x.g.tags || []]));
      let body;
      if (opt.sort === 'scope') body = lists.filter(([, ts]) => ts.length).map(([sc, ts]) => `<h4>${esc(sc === c.name ? 'Controller Tags' : `Program Tags: ${sc}`)}</h4>${tbl(head, ts.filter(keep).map(t => row(t, sc)))}`).join('');
      else body = tbl(head, lists.flatMap(([sc, ts]) => ts.filter(keep).map(t => [t, sc])).sort((x, y) => x[0].name.localeCompare(y[0].name, 'en', { sensitivity: 'base' })).map(([t, sc]) => row(t, sc)));
      sec('tags', 'Tag Listing', body);
    }
    if (sel.tasks) sec('tasks', 'Task Properties Listing', (p.tasks || []).filter(t => !HANDLER[t.type]).map(t => `<h4>${esc(t.name)}</h4>${kv([['Type', t.type === 'periodic' ? 'Periodic' : t.type === 'event' ? 'Event' : 'Continuous'], ['Description', t.desc || ''], ['Watchdog (ms)', t.watchdog || 500], ['Inhibit Task', t.inhibit ? 'Yes' : 'No'], ['Disable Automatic Output Processing', t.noOutputs ? 'Yes' : 'No'], ['Scheduled Programs', t.programs.map(g => g.name).join(', ')]])}`).join(''));
    if (sel.progs) sec('progs', 'Program/Phase Properties Listing', all.map(({ t, g }) => `<h4>${esc(g.name)}</h4>${kv([['Task', HANDLER[t.type] || t.name], ['Description', g.desc || ''], ['Main Routine', g.main || ''], ['Fault Routine', g.fault || '<none>'], ['Inhibit Program', g.inhibit ? 'Yes' : 'No'], ['Routines', g.routines.map(r => r.name).join(', ')], ['Program Tags', (g.tags || []).length]])}`).join(''));
    if (sel.routines || sel.rprops) {
      all.forEach(({ g }) => g.routines.forEach(r => {
        if (!inScope(g, r)) return;
        const id = 'r:' + g.name + '/' + r.name;
        if (sel.rprops) sec(id + ':p', `Routine Properties Listing: ${g.name} - ${r.name}`, kv([['Name', r.name], ['Program', g.name], ['Type', 'Ladder Diagram'], ['Description', r.desc || ''], ['Number of Rungs', (r.rungs || []).length], ['Main Routine', r.name === g.main ? 'Yes' : 'No']]));
        if (!sel.routines) return;
        const rr = (r.rungs || []).map((x, i) => ({ x, i })).filter(({ i }) => !opt.range || (i >= opt.range[0] && i <= opt.range[1]));
        // Print extra space between rungs: each rung drawn on its own, Number of lines blank lines between them
        const svg = !h.ladder ? '' : opt.space ? rr.map(({ x, i }, k) => h.ladder([x], g, i, k < rr.length - 1)).join(`<div class="rptgap" style="height:${+((opt.lines || 5) * 1.2).toFixed(2)}em"></div>`) : h.ladder(rr.map(o2 => o2.x), g, rr.length ? rr[0].i : 0);
        // Print embedded cross reference: below each rung, the tags it uses and the rungs of the routine that use them
        let xref = '';
        if (opt.xref && h.ops) {
          const use = new Map(), ops = (r.rungs || []).map(x => h.ops(x.t, g));
          ops.forEach((list, i) => list.forEach(t => { const k = U(t.split(/[.[]/)[0]); if (!use.has(k)) use.set(k, []); use.get(k).push(i); }));
          xref = rr.map(({ i }) => (ops[i].length ? `<table class="rptt rptx"><caption>Rung ${i}: cross reference</caption><thead><tr><th>Tag</th><th>Rungs</th></tr></thead><tbody>${[...new Set(ops[i].map(t => t.split(/[.[]/)[0]))].map(t => `<tr><td>${esc(t)}</td><td>${use.get(U(t)).filter((v, k, a) => a.indexOf(v) === k).join(', ')}</td></tr>`).join('')}</tbody></table>` : '')).join('');
        }
        sec(id, `Routine Listing: ${g.name} - ${r.name}`, (svg ? `<div class="rptlad">${svg}</div>` : `<pre class="rptpre">${esc(rr.map(({ x, i }) => `${i}  ${x.c ? '// ' + x.c + '\n   ' : ''}${x.t}`).join('\n'))}</pre>`) + xref);
      }));
    }
    if (sel.dts) {
      const ud = (p.dataTypes || []);
      sec('dts', 'Data Type Listing', ud.map(d => `<h4>${esc(d.name)}${d.family === 'string' ? ' (string)' : ''}</h4>${d.desc ? `<p>${esc(d.desc)}</p>` : ''}${d.family === 'string' ? kv([['Maximum Characters', d.len]]) : tbl(['Member', 'Data Type', 'Style', 'Description', 'External Access'], (d.members || []).map(m => [esc(m.name), esc((m.type || '') + (m.dim ? `[${m.dim}]` : '')), esc(m.style || ''), esc(m.desc || ''), esc(m.access || 'Read/Write')]))}`).join('') || '<p>No user-defined data types.</p>');
    }
    if (sel.mods) sec('mods', 'Module Properties Listing', tbl(['Slot', 'Name', 'Type', 'Description', 'Revision', 'Electronic Keying', 'RPI (ms)', 'Inhibited'], ((p.rack || {}).modules || []).slice().sort((x, y) => x.slot - y.slot).map(m => [m.slot, esc(m.name), esc(m.type), esc(m.desc || ''), esc(m.rev || '1.1'), esc({ exact: 'Exact Match', compat: 'Compatible Module', off: 'Disable Keying' }[m.keying] || 'Compatible Module'), esc(m.rpi || 20), m.inhibit ? 'Yes' : ''])));
    const when = h.now || new Date().toLocaleString();
    const toc = sel.toc && secs.length ? `<section class="rpts"><h3>Table of Contents</h3><ol class="rpttoc">${secs.map(s => `<li>${esc(s.title)}</li>`).join('')}</ol></section>` : '';
    const foot = opt.footer ? `<div class="rptfoot">${esc(String(opt.footer).slice(0, 128))}</div>` : '';
    // the table of contents goes at the end, as the reference prints it by default
    return { count: secs.length, titles: secs.map(s => s.title), html: `<header class="rpth"><b>${esc(c.name)}</b><span>${esc(h.ctlType ? h.ctlType(p) : c.type || '')}</span><span>${esc(when)}</span></header>${secs.map(s => `<section class="rpts" data-rpt="${esc(s.id)}"><h3>${esc(s.title)}</h3>${s.body}${foot}</section>`).join('')}${toc}` };
  }

  /* ---------- sample projects ----------
     Ready projects that use the app's features: aliases to the I/O, timers, counters, compares and math, a UDT and a
     string type, an analog module, program tags, a subroutine (JSR), a shift register (BSL) and a trend. */
  function base(name, desc, mods) {
    return { format: 'mt-plc-studio', version: 1, controller: { name, type: 'PLC-CPU', rev: '1.0', desc }, info: { created: 0 },
      rack: { size: 8, modules: mods || [{ slot: 1, type: 'PLC-DI16-24V', name: 'DI_1' }, { slot: 2, type: 'PLC-DO16-24V', name: 'DO_1' }] },
      dataTypes: [], tags: [], tasks: [{ name: 'MainTask', type: 'continuous', programs: [{ name: 'MainProgram', main: 'MainRoutine', tags: [], routines: [{ name: 'MainRoutine', rungs: [] }] }] }] };
  }
  const B = (name, desc, alias) => (alias ? { name, alias, desc } : { name, type: 'BOOL', desc });
  const SAMPLES = [
    { name: 'Motor_Demo', title: 'Motor start / stop', desc: 'A seal-in circuit on aliased I/O, a run lamp delay (TON) and a start counter (ONS, CTU).', make() {
      const p = base('Motor_Demo', 'Motor start / stop with seal-in');
      p.tags = [B('Start_PB', 'S1 START PB', 'Local:1:I.Data.0'), B('Stop_PB', 'S0 STOP PB (NC)', 'Local:1:I.Data.1'), B('OL_OK', 'F1 OVERLOAD OK (NC)', 'Local:1:I.Data.2'),
        B('Motor_Run', 'Motor running (seal-in)'), { name: 'Run_Timer', type: 'TIMER', desc: 'Run lamp delay' }, B('Motor_Cmd', 'KM1 MOTOR CONTACTOR', 'Local:2:O.Data.0'),
        B('Run_Lamp', 'H1 RUN LAMP', 'Local:2:O.Data.1'), B('Start_ONS', 'Start one-shot'), { name: 'Start_Count', type: 'COUNTER', desc: 'Motor starts' }];
      p.tasks[0].programs[0].routines[0].rungs = [
        { c: 'Motor start / stop with seal-in. S0 STOP and F1 OVERLOAD are wired N.C., so XIC is true while they are healthy.', t: '[XIC(Start_PB),XIC(Motor_Run)]XIC(Stop_PB)XIC(OL_OK)OTE(Motor_Run);' },
        { t: 'XIC(Motor_Run)OTE(Motor_Cmd);' },
        { c: 'Run lamp 5 s after the motor starts.', t: 'XIC(Motor_Run)TON(Run_Timer,5000,0);' },
        { t: 'XIC(Run_Timer.DN)OTE(Run_Lamp);' },
        { c: 'Count motor starts.', t: 'XIC(Motor_Run)ONS(Start_ONS)CTU(Start_Count,9999,0);' }];
      return p;
    } },
    { name: 'Traffic_Light', title: 'Traffic light', desc: 'A timed sequence: one TON in a subroutine (JSR), DIV, compares (LIM, GEQ) and a lamp test.', make() {
      const p = base('Traffic_Light', 'Two-way traffic light sequence'), g = p.tasks[0].programs[0];
      p.tags = [B('Run_SW', 'S1 RUN SWITCH', 'Local:1:I.Data.0'), B('Test_PB', 'S2 LAMP TEST PB', 'Local:1:I.Data.1'),
        B('NS_Red', 'NORTH-SOUTH RED', 'Local:2:O.Data.0'), B('NS_Amber', 'NORTH-SOUTH AMBER', 'Local:2:O.Data.1'), B('NS_Green', 'NORTH-SOUTH GREEN', 'Local:2:O.Data.2'),
        B('EW_Red', 'EAST-WEST RED', 'Local:2:O.Data.3'), B('EW_Amber', 'EAST-WEST AMBER', 'Local:2:O.Data.4'), B('EW_Green', 'EAST-WEST GREEN', 'Local:2:O.Data.5')];
      g.tags = [{ name: 'Cycle', type: 'TIMER', desc: 'One full cycle, 20 s' }, { name: 'T_s', type: 'DINT', desc: 'Seconds into the cycle' }];
      g.routines[0].rungs = [
        { c: 'The cycle timer and the seconds into the cycle are worked out in the Cycle subroutine.', t: 'JSR(Cycle,0);' },
        { c: 'North-south: green 0-7 s, amber 8-9 s, red 10-19 s. S2 LAMP TEST turns every lamp on.', t: '[LIM(0,T_s,7),XIC(Test_PB)]OTE(NS_Green);' },
        { t: '[LIM(8,T_s,9),XIC(Test_PB)]OTE(NS_Amber);' },
        { t: '[GEQ(T_s,10),XIC(Test_PB)]OTE(NS_Red);' },
        { c: 'East-west: red 0-9 s, green 10-17 s, amber 18-19 s.', t: '[LIM(0,T_s,9),XIC(Test_PB)]OTE(EW_Red);' },
        { t: '[LIM(10,T_s,17),XIC(Test_PB)]OTE(EW_Green);' },
        { t: '[GEQ(T_s,18),XIC(Test_PB)]OTE(EW_Amber);' }];
      g.routines.push({ name: 'Cycle', rungs: [{ c: 'The cycle timer runs while the RUN switch is on and starts again at the end of the cycle.', t: 'XIC(Run_SW)XIO(Cycle.DN)TON(Cycle,20000,0);' }, { t: 'DIV(Cycle.ACC,1000,T_s);' }] });
      return p;
    } },
    { name: 'Tank_Level', title: 'Tank level', desc: 'An analog input scaled with CPT, a Tank UDT, high / low alarms latched with OTL / OTU, a pump in hand / auto, and a trend.', make() {
      const p = base('Tank_Level', 'Tank level with alarms and a fill pump', [{ slot: 1, type: 'PLC-DI16-24V', name: 'DI_1' }, { slot: 2, type: 'PLC-DO16-24V', name: 'DO_1' }, { slot: 3, type: 'PLC-AI4', name: 'AI_1' }]);
      p.dataTypes = [{ name: 'Tank', desc: 'One tank: level and alarm limits', members: [{ name: 'Level', type: 'REAL', desc: 'Level in %' }, { name: 'HiLimit', type: 'REAL' }, { name: 'LoLimit', type: 'REAL' }, { name: 'HiAlarm', type: 'BOOL' }, { name: 'LoAlarm', type: 'BOOL' }] },
        { name: 'STRING_20', family: 'string', len: 20, desc: 'A short message' }];
      p.tags = [{ name: 'Level_Raw', alias: 'Local:3:I.Ch0Data', desc: 'LT1 LEVEL TRANSMITTER 0-10 V' }, B('Reset_PB', 'S1 ALARM RESET PB', 'Local:1:I.Data.0'), B('Auto_SW', 'S2 HAND / AUTO', 'Local:1:I.Data.1'),
        B('Pump', 'M1 FILL PUMP', 'Local:2:O.Data.0'), B('Alarm_Horn', 'H1 ALARM HORN', 'Local:2:O.Data.1'),
        { name: 'T1', type: 'Tank', desc: 'Tank 1', value: { HiLimit: 90, LoLimit: 10 } }, { name: 'Msg', type: 'STRING_20', desc: 'Alarm text' }];
      p.tasks[0].programs[0].routines[0].rungs = [
        { c: 'Scale 0-10 V to 0-100 %.', t: 'CPT(T1.Level,Level_Raw*10.0);' },
        { c: 'High and low level alarms stay on until reset.', t: 'GRT(T1.Level,T1.HiLimit)OTL(T1.HiAlarm);' },
        { t: 'LES(T1.Level,T1.LoLimit)OTL(T1.LoAlarm);' },
        { t: 'XIC(Reset_PB)[OTU(T1.HiAlarm),OTU(T1.LoAlarm)];' },
        { c: 'Fill in auto below 50 %, stop at the high alarm.', t: 'XIC(Auto_SW)[LES(T1.Level,50.0),XIC(Pump)]XIO(T1.HiAlarm)OTE(Pump);' },
        { t: '[XIC(T1.HiAlarm),XIC(T1.LoAlarm)]OTE(Alarm_Horn);' }];
      p.trends = [{ name: 'Tank_Trend', period: 200, pens: [{ name: 'T1.Level', scope: '' }, { name: 'Pump', scope: '' }] }];
      return p;
    } },
    { name: 'Conveyor_Sort', title: 'Conveyor sorter', desc: 'A shift register (BSL) tracks rejected parts down a belt; counters for good and rejected parts; MOV and ADD for the totals.', make() {
      const p = base('Conveyor_Sort', 'Reject sorter on a conveyor');
      p.tags = [B('Part_Eye', 'PE1 PART AT THE INFEED', 'Local:1:I.Data.0'), B('Bad_Part', 'SENSOR: PART IS BAD', 'Local:1:I.Data.1'), B('Belt_Pulse', 'PULSE: BELT MOVED ONE PITCH', 'Local:1:I.Data.2'),
        B('Reset_PB', 'S1 RESET COUNTS', 'Local:1:I.Data.3'), B('Belt_Run', 'M1 CONVEYOR', 'Local:2:O.Data.0'), B('Reject_Sol', 'Y1 REJECT GATE', 'Local:2:O.Data.1'),
        { name: 'Track', type: 'DINT', dim: 1, desc: 'One bit per belt pitch: 1 = bad part' }, { name: 'Track_Ctl', type: 'CONTROL' }, B('Bad_Bit', 'Bad part latched at the infeed'),
        B('Pulse_ONS', 'Belt pulse one-shot'), B('Eye_ONS', 'Part eye one-shot'), { name: 'Good_Cnt', type: 'COUNTER' }, { name: 'Bad_Cnt', type: 'COUNTER' }, { name: 'Total', type: 'DINT', desc: 'Parts seen' }];
      p.tasks[0].programs[0].routines[0].rungs = [
        { t: 'OTE(Belt_Run);' },
        { c: 'Remember a bad part at the infeed.', t: 'XIC(Part_Eye)XIC(Bad_Part)OTL(Bad_Bit);' },
        { c: 'Each belt pitch shifts the tracking bits one place; the bad bit goes in at bit 0.', t: 'XIC(Belt_Pulse)ONS(Pulse_ONS)BSL(Track[0],Track_Ctl,Bad_Bit,8);' },
        { t: 'XIC(Track_Ctl.EN)OTU(Bad_Bit);' },
        { c: 'The reject gate is 5 pitches down the belt.', t: 'XIC(Track[0].5)OTE(Reject_Sol);' },
        { c: 'Counts.', t: 'XIC(Part_Eye)ONS(Eye_ONS)[XIC(Bad_Part)CTU(Bad_Cnt,99999,0),XIO(Bad_Part)CTU(Good_Cnt,99999,0)];' },
        { t: 'ADD(Good_Cnt.ACC,Bad_Cnt.ACC,Total);' },
        { t: 'XIC(Reset_PB)[RES(Good_Cnt),RES(Bad_Cnt),MOV(0,Total)];' }];
      return p;
    } },
  ];

  MTPS.Report = { compare, rungDiff, report, REPORTS, SAMPLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = MTPS.Report;
})(typeof window !== 'undefined' ? window : globalThis);
