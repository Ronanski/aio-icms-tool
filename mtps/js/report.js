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

  MTPS.Report = { compare, rungDiff };
  if (typeof module !== 'undefined' && module.exports) module.exports = MTPS.Report;
})(typeof window !== 'undefined' ? window : globalThis);
