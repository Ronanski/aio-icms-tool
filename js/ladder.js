/* Ladder editor + renderer (RSLogix 500 look) and the data table sidebar. */
(function () {
  'use strict';
  const { INSTR, parse, validArg } = PLCcore;
  const esc = UI.esc;

  let UID = 1;
  const nid = () => UID++;
  const CW = 100, RH = 86, WY = 60, BW = 216, BOXW = 174, BP = 16, EMPTYW = 56, LM = 14, RM = 14;

  function assignIds(arr) { for (const e of arr) { e.id = nid(); if (e.t === 'BST') e.legs.forEach(assignIds); } }
  function newRung(elems = [], comment = '') { const r = { id: nid(), comment, elems }; assignIds(elems); return r; }

  /* ---------- ASCII (RSLogix "rung text") ---------- */
  function parseRung(text) {
    const tk = text.toUpperCase().replace(/[,;]/g, ' ').trim().split(/\s+/).filter(Boolean);
    let i = 0;
    const KW = ['BST', 'NXB', 'BND', 'SOR', 'EOR'];
    function seq(stops) {
      const out = [];
      while (i < tk.length && !stops.includes(tk[i])) {
        const t = tk[i++];
        if (t === 'SOR' || t === 'EOR') continue;
        if (t === 'BST') {
          const legs = [seq(['NXB', 'BND'])];
          while (tk[i] === 'NXB') { i++; legs.push(seq(['NXB', 'BND'])); }
          if (tk[i] !== 'BND') throw new Error('Branch started with BST is missing its BND');
          i++;
          out.push({ t: 'BST', legs });
          continue;
        }
        const d = INSTR[t];
        if (!d) throw new Error(`Unknown instruction "${t}"`);
        const a = [];
        for (let k = 0; k < d.args.length; k++) {
          if (i >= tk.length || INSTR[tk[i]] || KW.includes(tk[i])) throw new Error(`${t} needs ${d.args.length} operand(s): ${d.args.map(x => x.n).join(', ')}`);
          a.push(tk[i++]);
        }
        out.push({ t, a });
      }
      return out;
    }
    const elems = seq(['NXB', 'BND']);
    if (i < tk.length) throw new Error(`Unexpected "${tk[i]}" — NXB/BND without BST`);
    return elems;
  }
  function serialize(arr) {
    return arr.map(e => e.t === 'BST'
      ? 'BST ' + e.legs.map(l => serialize(l)).join(' NXB ') + ' BND'
      : [e.t, ...e.a].join(' ')).join(' ').replace(/\s+/g, ' ').trim();
  }

  /* ---------- Layout ---------- */
  const isOut = e => e.t === 'BST'
    ? e.legs.length > 0 && e.legs.every(l => l.length && isOut(l[l.length - 1]))
    : !!(INSTR[e.t] && INSTR[e.t].out);
  function boxH(d) { return 38 + d.args.length * 16 + 6; }
  function blockOf(e) {
    if (e.t === 'BST') return brBlock(e);
    const d = INSTR[e.t];
    if (d && d.k === 'box') return { w: BW, h: Math.max(RH, WY - 12 + boxH(d) + 12), render: (x, y, o) => renderBox(e, d, x, y, o) };
    return { w: CW, h: RH, render: (x, y, o) => renderCell(e, d, x, y, o) };
  }
  function seqLay(arr) {
    const items = arr.map(blockOf);
    let w = 0, h = RH;
    items.forEach(b => { w += b.w; h = Math.max(h, b.h); });
    return { items, w, h };
  }
  function brBlock(e) {
    const legs = e.legs.map(l => l.length ? seqLay(l) : { items: [], w: EMPTYW, h: RH, empty: true });
    const lw = Math.max(EMPTYW, ...legs.map(l => l.w));
    const h = legs.reduce((s, l) => s + l.h, 0);
    return { w: lw + BP * 2, h, render: (x, y, o) => renderBr(e, legs, lw, x, y, o) };
  }

  /* ---------- SVG rendering ---------- */
  let SEL = { r: -1, id: null, leg: null };
  let ERR_IDS = new Set();
  const hw = (x1, x2, y, k) => `<line class="w" data-p="${k}" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`;
  const vw = (x, y1, y2, k) => `<line class="w" data-p="${k}" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>`;

  function descLines(norm) {
    const t = PLCcore.tagOf(norm);
    const d = App.project.ladder.desc[norm] || (t && t.desc);
    if (!d) return [];
    const words = String(d).split(/\s+/); const lines = []; let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > 16 && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 2);
  }
  function selCls(id) { return SEL.id === id ? ' sel' : '' + (ERR_IDS.has(id) ? ' err' : ''); }

  function renderSeq(lay, arr, x, y, inKey, width, o) {
    let cx = x, key = inKey;
    lay.items.forEach((b, i) => { b.render(cx, y, o); cx += b.w; key = 'o' + arr[i].id; });
    if (x + width > cx) o.push(hw(cx, x + width, y + WY, key));
    return key;
  }

  function renderCell(e, d, x, y, o) {
    const cx = x + CW / 2, wy = y + WY, id = e.id;
    const p = parse(e.a[0]), noArg = d && !d.args.length;
    const norm = noArg ? '' : p ? p.norm : (e.a[0] || '?');
    const sw = e.t === 'ONS' ? 18 : 13;
    o.push(`<g class="el${selCls(id)}" data-uid="${id}">`);
    o.push(`<rect class="hit" x="${x + 2}" y="${y + 4}" width="${CW - 4}" height="${RH - 8}" rx="6"/>`);
    o.push(hw(x, cx - sw, wy, 'i' + id), hw(cx + sw, x + CW, wy, 'o' + id));
    descLines(norm).forEach((l, k, arr) => o.push(`<text class="desc" x="${cx}" y="${wy - 30 - (arr.length - 1 - k) * 11}">${esc(l)}</text>`));
    if (!noArg) o.push(`<text class="addr${p && p.kind === 'bit' ? '' : ' bad'}" x="${cx}" y="${wy - 17}">${esc(App.fmt(norm))}</text>`);
    o.push(`<text class="fbadge" data-f="${esc(p && p.addr || norm)}" x="${cx}" y="${wy + 26}"></text>`);
    o.push(`<g class="ins" data-h="${id}">`);
    if (d && d.k === 'coil') {
      o.push(`<rect class="hlr" x="${cx - 12}" y="${wy - 11}" width="24" height="22" rx="11"/>`);
      o.push(`<path class="sym" d="M${cx - 6} ${wy - 11} Q${cx - 15} ${wy} ${cx - 6} ${wy + 11} M${cx + 6} ${wy - 11} Q${cx + 15} ${wy} ${cx + 6} ${wy + 11}"/>`);
      if (d.lbl) o.push(`<text class="clbl${d.lbl.length > 2 ? ' sm' : ''}" x="${cx}" y="${wy + 3.5}">${d.lbl}</text>`);
    } else if (e.t === 'ONS') {
      o.push(`<rect class="hlr" x="${cx - 17}" y="${wy - 10}" width="34" height="20" rx="2"/>`);
      o.push(`<path class="sym" d="M${cx - 18} ${wy - 10} H${cx - 14} V${wy + 10} H${cx - 18} M${cx + 18} ${wy - 10} H${cx + 14} V${wy + 10} H${cx + 18}"/>`);
      o.push(`<text class="clbl" x="${cx}" y="${wy + 3.5}">ONS</text>`);
    } else {
      o.push(`<rect class="hlr" x="${cx - 9}" y="${wy - 11}" width="18" height="22" rx="1"/>`);
      o.push(`<path class="sym" d="M${cx - 13} ${wy - 11} H${cx - 8} V${wy + 11} H${cx - 13} M${cx + 13} ${wy - 11} H${cx + 8} V${wy + 11} H${cx + 13}"/>`);
      if (e.t === 'XIO') o.push(`<path class="sym" d="M${cx - 5} ${wy + 9} L${cx + 5} ${wy - 9}"/>`);
    }
    o.push('</g></g>');
  }

  function liveKey(e, k) {
    const p0 = parse(e.a[0]);
    const n = p0 && p0.kind === 'struct' ? p0.norm : null;
    if (['TON', 'TOF', 'RTO'].includes(e.t) && n) { if (k === 2) return n + '.PRE'; if (k === 3) return n + '.ACC'; }
    if (['CTU', 'CTD'].includes(e.t) && n) { if (k === 1) return n + '.PRE'; if (k === 2) return n + '.ACC'; }
    if (e.t === 'SQO') { const c = parse(e.a[3]); if (c && c.kind === 'struct') { if (k === 4) return c.norm + '.LEN'; if (k === 5) return c.norm + '.POS'; } }
    return null;
  }

  function renderBox(e, d, x, y, o) {
    const id = e.id, wy = y + WY, bx = x + 8, by = wy - 12, bh = boxH(d);
    o.push(`<g class="el${selCls(id)}" data-uid="${id}">`);
    o.push(`<rect class="hit" x="${x + 2}" y="${y + 4}" width="${BW - 4}" height="${Math.max(RH, by - y + bh + 10) - 8}" rx="6"/>`);
    o.push(hw(x, bx, wy, 'i' + id));
    o.push(`<g class="ins box" data-h="${id}"><rect class="boxr" x="${bx}" y="${by}" width="${BOXW}" height="${bh}" rx="3"/>`);
    o.push(`<text class="btitle" x="${bx + 8}" y="${by + 15}">${e.t}</text><text class="bsub" x="${bx + 8}" y="${by + 30}">${esc(d.name)}</text></g>`);
    d.args.forEach((spec, k) => {
      const ry = by + 48 + k * 16;
      const raw = e.a[k] ?? '?';
      const p = parse(raw);
      const lk = liveKey(e, k);
      o.push(`<text class="bname" x="${bx + 8}" y="${ry}">${esc(spec.ty === 'prog' && App.project.target === 'tag' ? 'Routine Name' : spec.n)}</text>`);
      if (spec.ty === 'prog' && App.project.target === 'tag' && p && p.kind === 'prog') { const f = fileOf(p.n); o.push(`<text class="bval${f ? '' : ' bad'}" x="${bx + BOXW - 8}" y="${ry}">${esc(f ? f.name : p.norm)}</text>`); return; }
      if (lk) o.push(`<text class="bval" data-v="${lk}" x="${bx + BOXW - 8}" y="${ry}">${esc(raw)}</text>`);
      else if (p && p.kind === 'word') {
        o.push(`<text class="baddr" x="${bx + 78}" y="${ry}">${esc(p.norm)}</text>`);
        o.push(`<text class="bval" data-v="${p.norm}" x="${bx + BOXW - 8}" y="${ry}">0</text>`);
      } else o.push(`<text class="bval${p || !validArg(spec.ty, raw) ? '' : ' bad'}" x="${bx + BOXW - 8}" y="${ry}">${esc(p ? p.norm : String(raw).toUpperCase())}</text>`);
    });
    const rx = bx + BOXW;
    o.push(hw(rx, x + BW, wy, 'o' + id));
    if (d.bits) {
      const p0 = parse(e.a[e.t === 'SQO' ? 3 : e.t === 'MSG' ? 5 : 0]);
      // a TIMER/COUNTER tag's bits are read at its address (PUMP/DN does not parse)
      const base = p0 && p0.kind === 'struct' ? (p0.tag ? p0.addr : p0.norm) : '';
      d.bits.forEach((b, k) => {
        const yy = wy + k * 22;
        if (k > 0) o.push(`<line class="w stub" x1="${rx}" y1="${yy}" x2="${rx + 8}" y2="${yy}"/>`);
        o.push(`<g class="bitind" data-b="${base}/${b}"><rect x="${rx + 6}" y="${yy - 8}" width="28" height="16" rx="8"/><text x="${rx + 20}" y="${yy + 3.5}">${b}</text></g>`);
      });
    }
    o.push('</g>');
  }

  function renderBr(e, legs, lw, x, y, o) {
    const id = e.id, xl = x + 6, xr = x + lw + BP * 2 - 6;
    let ly = y; const ys = [];
    const parts = [];
    legs.forEach((L, li) => {
      const wy = ly + WY; ys.push(wy);
      parts.push(hw(xl, x + BP, wy, 'i' + id));
      let outKey;
      if (L.empty) {
        const lsel = SEL.leg === `${id}:${li}` ? ' sel' : '';
        parts.push(`<g class="leg${lsel}" data-leg="${id}:${li}"><rect class="hit" x="${x + BP}" y="${wy - 16}" width="${lw}" height="32" rx="6"/>`);
        parts.push(hw(x + BP, x + BP + lw, wy, 'i' + id) + '</g>');
        outKey = 'i' + id;
      } else outKey = renderSeq(L, e.legs[li], x + BP, ly, 'i' + id, lw, parts);
      parts.push(hw(x + BP + lw, xr, wy, outKey));
      ly += L.h;
    });
    o.push(hw(x, xl, y + WY, 'i' + id), hw(xr, x + lw + BP * 2, y + WY, 'o' + id));
    o.push(`<g class="br${selCls(id)}" data-uid="${id}">`);
    o.push(`<rect class="hit" x="${xl - 6}" y="${ys[0] - 6}" width="12" height="${ys[ys.length - 1] - ys[0] + 12}" rx="4"/>`);
    o.push(`<rect class="hit" x="${xr - 6}" y="${ys[0] - 6}" width="12" height="${ys[ys.length - 1] - ys[0] + 12}" rx="4"/>`);
    o.push(vw(xl, ys[0], ys[ys.length - 1], 'i' + id), vw(xr, ys[0], ys[ys.length - 1], 'o' + id));
    o.push('</g>');
    o.push(...parts);
  }

  function rungLayout(r) {
    let k = r.elems.length;
    while (k > 0 && isOut(r.elems[k - 1])) k--;
    const cond = r.elems.slice(0, k), outs = r.elems.slice(k);
    const cl = seqLay(cond), ol = seqLay(outs);
    return { cond, outs, cl, ol, need: LM + cl.w + 40 + ol.w + RM, h: Math.max(cl.h, ol.h) + 4 };
  }
  function renderRung(r, W) {
    const L = rungLayout(r), o = [];
    const h = L.h;
    o.push(`<line class="rail" x1="3" y1="0" x2="3" y2="${h}"/><line class="rail" x1="${W - 3}" y1="0" x2="${W - 3}" y2="${h}"/>`);
    o.push(hw(3, LM, WY, 'r' + r.id));
    let key = renderSeq(L.cl, L.cond, LM, 0, 'r' + r.id, 0, o);
    const ox = W - RM - L.ol.w;
    o.push(hw(LM + L.cl.w, ox, WY, key));
    key = renderSeq(L.ol, L.outs, ox, 0, key, 0, o);
    o.push(hw(ox + L.ol.w, W - 3, WY, key));
    if (!r.elems.length) o.push(`<text class="hint" x="${W / 2}" y="${WY - 10}">Empty rung — pick an instruction from the toolbar</text>`);
    return { svg: o.join(''), h };
  }

  /* ---------- Editor ---------- */
  const Ladder = {};
  let root, rungsEl, sideEl, cache = null;
  let undo = [], redo = [], clip = null;
  /* program files: LAD 2 is the main program, LAD 3–9 are subroutines (App.project.ladder.files) called by JSR */
  let curFile = 2;
  const fileOf = n => (App.project.ladder.files || []).find(f => f.n === n);
  const rungs = () => (curFile === 2 || !fileOf(curFile) ? App.project.ladder.rungs : fileOf(curFile).rungs);
  function setRungs(list) { if (curFile === 2 || !fileOf(curFile)) App.project.ladder.rungs = list; else fileOf(curFile).rungs = list; }
  Ladder.file = () => curFile;
  /* Online group and the online-edit banner (Realistic connection) */
  Ladder.connUi = function () {
    if (!root || !App.project) return;
    Ladder.statusUi();
    const c = App.project.conn, real = !!(c && c.mode === 'real'), cn = App.conn;
    const sel = root.querySelector('[data-cmode]'); if (sel) sel.value = real ? 'real' : 'simple';
    const rr = root.querySelector('.lad-comm-real'); if (rr) rr.hidden = !real;
    const ob = root.querySelector('[data-act="online"]'); if (ob) ob.textContent = cn.online ? '⇄ Go Offline' : '⇄ Go Online';
    const b = root.querySelector('[data-lbanner]'); if (!b) return;
    const show = real && cn.online && App.plc.mode === 'RUN' && (!cn.same || cn.testing);
    b.hidden = !show;
    if (show) b.innerHTML = cn.testing
      ? `<b>Testing online edits</b> — the controller runs the edited program. <button class="tbtn" data-act="assemble">✓ Assemble</button><button class="tbtn" data-act="cancel">✕ Cancel edits</button>`
      : `<b>Online edits pending</b> — the controller still runs its program. <button class="tbtn" data-act="test">▶ Test edits</button><button class="tbtn" data-act="assemble">✓ Assemble</button><button class="tbtn" data-act="cancel">✕ Cancel edits</button>`;
  };
  Ladder.openFile = function (n) { if (n !== 2 && !fileOf(n)) return; curFile = n; SEL = { r: -1, id: null, leg: null }; undo = []; redo = []; Ladder.render(); };
  Ladder.renameFile = function (n) {
    const f = fileOf(n); if (!f) return;
    const tag = App.project.target === 'tag';
    UI.form(tag ? 'Rename routine' : `Rename LAD ${n}`, [{ key: 'nm', label: 'Name', value: f.name }], v => {
      const nm = v.nm.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10); if (!nm) return 'Type a name';
      if ((App.project.ladder.files || []).some(x => x !== f && x.name === nm)) return 'Another routine has that name';
      App.log('system', `${tag ? 'Routine' : 'LAD ' + n} ${f.name} renamed ${nm}`); f.name = nm; App.programChanged(); Ladder.render(); return undefined;
    });
  };
  Ladder.deleteFile = function (n) {
    const f = fileOf(n); if (!f) return;
    const tag = App.project.target === 'tag';
    UI.confirm(tag ? 'Delete routine' : `Delete LAD ${n}`, `Delete ${f.name} and its ${f.rungs.length} rung(s)? A JSR that calls it becomes an error until you fix it.`, () => {
      App.project.ladder.files = App.project.ladder.files.filter(x => x !== f); if (curFile === n) curFile = 2;
      App.log('system', `${tag ? 'Routine' : 'LAD ' + n} ${f.name} deleted`); App.programChanged(); Ladder.render();
    }, 'Delete');
  };
  Ladder.newFile = function () {
    const used = new Set((App.project.ladder.files || []).map(f => f.n)); let n = 3; while (used.has(n)) n++;
    const tag = App.project.target === 'tag';
    if (n > 9) { UI.toast(tag ? 'Up to 7 routines besides MainRoutine' : 'Program files go up to LAD 9', 'warn'); return; }
    UI.form(tag ? 'New routine' : `New program file LAD ${n}`, [{ key: 'nm', label: 'Name', value: tag ? 'Routine' + (n - 2) : 'SUB' + n }], v => {
      const nm = v.nm.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10); if (!nm) return 'Type a name';
      App.project.ladder.files = [...(App.project.ladder.files || []), { n, name: nm, rungs: [] }].sort((a, b) => a.n - b.n);
      curFile = n; App.programChanged(); Ladder.render(); return undefined;
    }, tag ? '<p class="help">A routine runs when a JSR to it in MainRoutine (or another routine) is true. Pick it by name in the JSR.</p>' : '<p class="help">A subroutine runs when a JSR U:n instruction in LAD 2 (or another file) is true.</p>');
  };

  function snapshot() {
    undo.push(JSON.stringify(rungs().map(r => ({ c: r.comment, t: serialize(r.elems) }))));
    if (undo.length > 100) undo.shift();
    redo = [];
  }
  /* timer/counter presets live in the data table, so rungs that come back (undo, redo, paste) write theirs again */
  function applyPresets(list) {
    const walk = arr => arr.forEach(e => { if (e.t === 'BST') e.legs.forEach(walk); else App.plc.applyInstr(e, false); });
    list.forEach(r => walk(r.elems));
  }
  function restore(s) {
    const data = JSON.parse(s);
    setRungs(data.map(d => newRung(parseRung(d.t), d.c)));
    applyPresets(rungs());
  }
  function changed() { App.programChanged(); Ladder.render(); }

  function find(id, arr = null, ri = null) {
    if (arr === null) {
      for (let i = 0; i < rungs().length; i++) { const f = find(id, rungs()[i].elems, i); if (f) return f; }
      return null;
    }
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e.id === id) return { e, arr, idx: i, ri };
      if (e.t === 'BST') for (const l of e.legs) { const f = find(id, l, ri); if (f) return f; }
    }
    return null;
  }
  function outIdx(arr) { let k = arr.length; while (k > 0 && isOut(arr[k - 1])) k--; return k; }

  function usedNums(file) {
    const s = new Set();
    const walk = arr => arr.forEach(e => {
      if (e.t === 'BST') return e.legs.forEach(walk);
      (e.a || []).forEach(a => { const p = parse(a); if (p && p.file === file && p.kind === 'struct') s.add(p.word); });
    });
    rungs().forEach(r => walk(r.elems));
    return s;
  }
  function defaultArgs(t) {
    const d = INSTR[t];
    return d.args.map(spec => {
      if (spec.ty === 'timer' || spec.ty === 'counter') {
        const f = spec.ty === 'timer' ? 'T4' : 'C5', used = usedNums(f);
        let n = 0; while (used.has(n)) n++;
        return `${f}:${n}`;
      }
      return spec.d;
    });
  }

  function ensureRung() {
    if (!rungs().length) rungs().push(newRung());
    if (SEL.r < 0 || SEL.r >= rungs().length) SEL.r = rungs().length - 1;
  }

  Ladder.insert = function (t) {
    snapshot();
    ensureRung();
    const d = INSTR[t];
    const e = { t, a: defaultArgs(t) };
    assignIds([e]);
    let placed = false;
    if (SEL.id) {
      const f = find(SEL.id);
      if (f) {
        // a coil added after a condition inside a branch leg belongs at the end of the rung
        const selIsOut = f.e.t !== 'BST' && INSTR[f.e.t] && INSTR[f.e.t].out;
        const top = rungs()[f.ri].elems;
        if (d.out && !selIsOut && f.arr !== top) top.push(e); else f.arr.splice(f.idx + 1, 0, e);
        placed = true; SEL.r = f.ri;
      }
    } else if (SEL.leg) {
      const [bid, li] = SEL.leg.split(':').map(Number);
      const f = find(bid);
      if (f) { f.e.legs[li].push(e); placed = true; SEL.r = f.ri; }
    }
    if (!placed) {
      const arr = rungs()[SEL.r].elems;
      if (d.out) arr.push(e); else arr.splice(outIdx(arr), 0, e);
    }
    SEL.id = e.id; SEL.leg = null;
    App.plc.applyInstr(e, true);
    changed();
    Ladder.edit(e.id, true);
  };

  Ladder.branch = function () {
    snapshot();
    ensureRung();
    if (SEL.id) {
      const f = find(SEL.id);
      if (!f) return;
      if (f.e.t === 'BST') { f.e.legs.push([]); SEL = { r: f.ri, id: null, leg: `${f.e.id}:${f.e.legs.length - 1}` }; }
      else {
        const b = { t: 'BST', legs: [[f.e], []], id: nid() };
        f.arr[f.idx] = b;
        SEL = { r: f.ri, id: null, leg: `${b.id}:1` };
      }
    } else if (SEL.leg) {
      const [bid] = SEL.leg.split(':').map(Number);
      const f = find(bid);
      if (f) { f.e.legs.push([]); SEL.leg = `${bid}:${f.e.legs.length - 1}`; }
    } else {
      const arr = rungs()[SEL.r].elems;
      const b = { t: 'BST', legs: [[], []], id: nid() };
      arr.splice(outIdx(arr), 0, b);
      SEL = { r: SEL.r, id: null, leg: `${b.id}:0` };
    }
    changed();
  };

  function selBranch() {
    if (SEL.id) { const f = find(SEL.id); if (f && f.e.t === 'BST') return f; }
    if (SEL.leg) return find(Number(SEL.leg.split(':')[0]));
    return null;
  }
  Ladder.extend = function (dir) {
    const f = selBranch();
    if (!f) { UI.toast('Select a branch first (click its vertical line or an empty leg)'); return; }
    snapshot();
    if (dir > 0) {
      const nx = f.arr[f.idx + 1];
      if (!nx) return;
      f.arr.splice(f.idx + 1, 1); f.e.legs[0].push(nx);
    } else {
      const pv = f.arr[f.idx - 1];
      if (!pv) return;
      f.arr.splice(f.idx - 1, 1); f.e.legs[0].unshift(pv);
    }
    changed();
  };

  /* instructions that can replace each other keep their operands: same kind, output role and operand types */
  const sig = t => { const d = INSTR[t]; return `${d.k}|${!!d.out}|${d.args.map(a => a.ty).join(',')}`; };
  Ladder.alternatives = t => (INSTR[t] ? Object.keys(INSTR).filter(k => k !== t && sig(k) === sig(t)) : []);
  Ladder.changeTo = function (id, t) {
    const f = find(id);
    if (!f || f.e.t === 'BST' || !Ladder.alternatives(f.e.t).includes(t)) return;
    snapshot();
    f.e.t = t;
    App.plc.applyInstr(f.e, false);
    SEL = { r: f.ri, id, leg: null };
    changed();
  };

  /* move an instruction to another place: before/after another instruction, into an empty branch leg, or onto a rung */
  Ladder.moveTo = function (id, target) {
    const f = find(id);
    if (!f || f.e.t === 'BST') return false;
    if (target.id === id) return false;
    // check the target before touching the program, so a bad drop costs no undo step and keeps redo
    if (target.id != null) {
      const g = find(target.id);
      if (!g) return false;
      // dropping next to itself changes nothing
      if (g.arr === f.arr && g.idx + (target.after ? 1 : 0) - (g.idx > f.idx ? 1 : 0) === f.idx) return false;
    } else if (target.leg) {
      const [bid, li] = target.leg.split(':').map(Number);
      const g = find(bid);
      if (!g || !g.e.legs[li]) return false;
    } else if (target.r == null || !rungs()[target.r]) return false;
    const e = f.e, isO = !!(INSTR[e.t] && INSTR[e.t].out);
    snapshot();
    f.arr.splice(f.idx, 1);
    let ri = f.ri;
    if (target.id != null) {
      const g = find(target.id);
      g.arr.splice(g.idx + (target.after ? 1 : 0), 0, e); ri = g.ri;
    } else if (target.leg) {
      const [bid, li] = target.leg.split(':').map(Number);
      const g = find(bid);
      g.e.legs[li].push(e); ri = g.ri;
    } else {
      const arr = rungs()[target.r].elems;
      if (isO) arr.push(e); else arr.splice(outIdx(arr), 0, e);
      ri = target.r;
    }
    SEL = { r: ri, id, leg: null };
    changed();
    return true;
  };

  Ladder.move = function (dir) {
    if (!SEL.id) return;
    const f = find(SEL.id);
    if (!f) return;
    const j = f.idx + dir;
    if (j < 0 || j >= f.arr.length) return;
    snapshot();
    [f.arr[f.idx], f.arr[j]] = [f.arr[j], f.arr[f.idx]];
    changed();
  };

  Ladder.del = function () {
    if (SEL.leg) {
      const [bid, li] = SEL.leg.split(':').map(Number);
      const f = find(bid);
      if (!f) return;
      snapshot();
      f.e.legs.splice(li, 1);
      if (f.e.legs.length <= 1) f.arr.splice(f.idx, 1, ...(f.e.legs[0] || []));
      SEL.leg = null;
      changed(); return;
    }
    if (SEL.id) {
      const f = find(SEL.id);
      if (!f) return;
      snapshot();
      f.arr.splice(f.idx, 1);
      const nx = f.arr[f.idx] || f.arr[f.idx - 1];
      SEL.id = nx ? nx.id : null;
      changed(); return;
    }
    if (SEL.r >= 0 && rungs()[SEL.r]) {
      snapshot();
      rungs().splice(SEL.r, 1);
      SEL.r = Math.min(SEL.r, rungs().length - 1);
      UI.toast('Rung deleted — Ctrl+Z to undo');
      changed();
    }
  };

  Ladder.addRung = function (above) {
    snapshot();
    const r = newRung();
    const at = SEL.r < 0 ? rungs().length : SEL.r + (above ? 0 : 1);
    rungs().splice(at, 0, r);
    SEL = { r: at, id: null, leg: null };
    changed();
    const el = rungsEl.querySelector(`.rung[data-r="${at}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  };

  Ladder.undo = function () {
    if (!undo.length) return;
    redo.push(JSON.stringify(rungs().map(r => ({ c: r.comment, t: serialize(r.elems) }))));
    restore(undo.pop()); SEL = { r: Math.min(SEL.r, rungs().length - 1), id: null, leg: null }; changed();
  };
  Ladder.redo = function () {
    if (!redo.length) return;
    undo.push(JSON.stringify(rungs().map(r => ({ c: r.comment, t: serialize(r.elems) }))));
    restore(redo.pop()); SEL = { r: Math.min(SEL.r, rungs().length - 1), id: null, leg: null }; changed();
  };

  function suggestions(ty) {
    const L = [];
    if (ty === 'bit') {
      // the real I/O points of the hardware, in the project's address style
      const io = Circuit.addrBook(App.project.circuit, App.project.io, App.project.addr || 'file').points;
      L.push(...io.I.map(App.fmt), ...io.O.map(App.fmt));
      for (let i = 0; i < 16; i++) L.push(`B3:0/${i}`);
      for (let i = 0; i < 6; i++) L.push(`T4:${i}/DN`, `T4:${i}/TT`, `T4:${i}/EN`);
      for (let i = 0; i < 6; i++) L.push(`C5:${i}/DN`);
      L.push('S:1/15');
    } else if (ty === 'timer') for (let i = 0; i < 16; i++) L.push(`T4:${i}`);
    else if (ty === 'counter') for (let i = 0; i < 16; i++) L.push(`C5:${i}`);
    else if (ty === 'struct') { for (let i = 0; i < 8; i++) L.push(`T4:${i}`); for (let i = 0; i < 8; i++) L.push(`C5:${i}`); }
    else if (ty === 'base') L.push('1.0', '0.01', '0.001');
    else if (ty === 'src' || ty === 'dest') {
      for (let i = 0; i < 10; i++) L.push(`N7:${i}`);
      for (let i = 0; i < 4; i++) L.push(`T4:${i}.ACC`, `T4:${i}.PRE`, `C5:${i}.ACC`, `C5:${i}.PRE`);
    }
    return L;
  }

  Ladder.edit = function (id, isNew) {
    const f = find(id);
    if (!f || f.e.t === 'BST') return;
    const e = f.e, d = INSTR[e.t];
    const first = parse(e.a[0]);
    const descKey = first && first.kind !== 'const' ? first.norm : null;
    const files = App.project.ladder.files || [], tag = App.project.target === 'tag';
    const fields = d.args.map((spec, k) => (spec.ty === 'prog' && files.length ? { key: 'a' + k, label: tag ? 'Routine' : spec.n, value: e.a[k], options: files.map(f => ({ v: 'U:' + f.n, l: tag ? f.name : `U:${f.n} — LAD ${f.n} ${f.name}` })) } : spec.ty === 'mtype' ? { key: 'a' + k, label: spec.n, value: e.a[k], options: ['READ', 'WRITE'] } : { key: 'a' + k, label: spec.n, value: spec.ty === 'bit' ? App.fmt(e.a[k]) : e.a[k], list: suggestions(spec.ty) }));
    fields.push({ key: 'desc', label: 'Address description (optional)', value: descKey ? (App.project.ladder.desc[descKey] || '') : '', hint: 'Shown above the instruction, e.g. "START PB" or "MOTOR RUN".' });
    const m = UI.form(`${e.t} — ${d.name}`, fields, vals => {
      const a = [];
      for (let k = 0; k < d.args.length; k++) {
        // a bit address can be typed in any address style; it is stored file-based
        const v = d.args[k].ty === 'bit' ? App.addrIn(vals['a' + k] || '') : String(vals['a' + k] || '').trim().toUpperCase();
        const err = validArg(d.args[k].ty, v);
        if (err) return `${d.args[k].n}: ${err}`;
        const p = parse(v);
        a.push(!p || p.kind === 'const' ? v : p.norm);   // READ / WRITE of a MSG are not addresses
      }
      if (!isNew) snapshot();
      e.a = a;
      const p0 = parse(a[0]);
      if (p0 && p0.kind !== 'const') {
        const ds = vals.desc.trim();
        if (ds) App.project.ladder.desc[p0.norm] = ds; else delete App.project.ladder.desc[p0.norm];
      }
      App.plc.applyInstr(e, true);
      changed();
    }, `<p class="help">${esc(d.help || '')}</p>`);
    // keep the description field in sync with the address being typed
    const a0 = m.el.querySelector('#f_a0'), dIn = m.el.querySelector('#f_desc');
    if (a0 && dIn) a0.addEventListener('input', () => {
      const p = parse(App.addrIn(a0.value));
      dIn.value = p && p.kind !== 'const' ? (App.project.ladder.desc[p.norm] || '') : '';
    });
  };

  Ladder.editAscii = function (ri) {
    const r = rungs()[ri]; if (!r) return;
    UI.form(`Edit rung ${String(ri).padStart(4, '0')} (ASCII)`, [
      { key: 'txt', label: 'Rung text', value: serialize(r.elems), type: 'textarea', rows: 4 },
      { key: 'cm', label: 'Rung comment', value: r.comment || '' },
    ], vals => {
      let elems;
      try { elems = parseRung(vals.txt); } catch (err) { return err.message; }
      snapshot();
      assignIds(elems);
      r.elems = elems; r.comment = vals.cm.trim();
      App.programChanged(); applyPresets([r]);
      SEL = { r: ri, id: null, leg: null };
      changed();
    }, `<p class="help">Example: <code>BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0</code><br>BST = branch start, NXB = next branch, BND = branch end.</p>`);
  };

  Ladder.verify = function (quiet) {
    // every program file; the messages say which file a rung is in
    const errs = [], warns = [];
    [[2, App.project.ladder.rungs], ...(App.project.ladder.files || []).map(f => [f.n, f.rungs])].forEach(([n, list]) => {
      const r = App.plc.verify(list, (App.project.ladder.files || []).map(f => f.n));  // JSR targets: the project's files, not the engine's
      const tag = x => ({ ...x, msg: n === 2 ? x.msg : `LAD ${n}: ${x.msg}` });
      errs.push(...r.errs.map(tag)); warns.push(...r.warns.map(tag));
    });
    ERR_IDS = new Set(errs.filter(x => x.id).map(x => x.id));
    Ladder.render();
    if (quiet) return errs.length === 0;
    // I/O addresses in the messages follow the project's address style
    const row = (x, k) => `<li class="${k}"><b>Rung ${String(x.ri).padStart(4, '0')}</b> — ${esc(App.fmtText(x.msg))}</li>`;
    UI.modal({
      title: 'Verify project',
      body: errs.length || warns.length
        ? `<ul class="verify">${errs.map(x => row(x, 'e')).join('')}${warns.map(x => row(x, 'w')).join('')}</ul>`
        : `<p class="ok-msg">✓ No errors. ${rungs().length} rung(s) verified.</p>`
    });
    return errs.length === 0;
  };

  function forceItems(norm) {
    const a = parse(norm);
    if (!App.plc.isForceable(a)) return [];
    const f = App.plc.forces[norm];
    return [{ sep: true }, { head: 'Force ' + norm },
      { label: 'Force On', onClick: () => App.force(norm, 1), disabled: f === 1 },
      { label: 'Force Off', onClick: () => App.force(norm, 0), disabled: f === 0 },
      { label: 'Remove Force', onClick: () => App.force(norm, null), disabled: f === undefined }];
  }
  Ladder.forceItems = forceItems;

  function elemMenu(x, y, id) {
    const f = find(id); if (!f) return;
    const e = f.e;
    const items = [];
    if (e.t !== 'BST') {
      items.push({ label: 'Edit instruction…', onClick: () => Ladder.edit(id) });
      const alt = Ladder.alternatives(e.t);
      if (alt.length) items.push({ sep: true }, { head: 'Change to' }, ...alt.map(t => ({ label: `${t} — ${INSTR[t].name}`, onClick: () => Ladder.changeTo(id, t) })), { sep: true });
    }
    else items.push({ label: 'Add branch leg', onClick: () => Ladder.branch() }, { label: 'Extend branch ←', onClick: () => Ladder.extend(-1) }, { label: 'Extend branch →', onClick: () => Ladder.extend(1) });
    items.push({ label: 'Move left', onClick: () => Ladder.move(-1) }, { label: 'Move right', onClick: () => Ladder.move(1) });
    if (e.t !== 'BST') items.push({ label: 'Branch around this', onClick: () => Ladder.branch() });
    items.push({ label: 'Delete', danger: true, onClick: () => Ladder.del() });
    if (e.t !== 'BST') {
      const p = parse(e.a[0]);
      if (p && p.kind === 'bit') {
        items.push(...forceItems(p.addr || p.norm));  // forces live at the address, not the tag name
        if (!App.plc.isForceable(p)) items.push({ sep: true }, { label: `Toggle bit ${p.norm}`, onClick: () => { App.plc.setBit(p, !App.plc.getBit(p)); } });
      }
    }
    UI.menu(x, y, items);
  }
  function rungMenu(x, y, ri) {
    UI.menu(x, y, [
      { head: 'Rung ' + String(ri).padStart(4, '0') },
      { label: 'Edit rung (ASCII)…', onClick: () => Ladder.editAscii(ri) },
      { label: 'Insert rung above', onClick: () => Ladder.addRung(true) },
      { label: 'Insert rung below', onClick: () => Ladder.addRung(false) },
      { label: 'Copy rung', onClick: () => { clip = serialize(rungs()[ri].elems); UI.toast('Rung copied'); } },
      { label: 'Paste rung below', disabled: clip == null, onClick: () => { snapshot(); const r = newRung(parseRung(clip)); rungs().splice(ri + 1, 0, r); applyPresets([r]); SEL = { r: ri + 1, id: null, leg: null }; changed(); } },
      { label: 'Delete rung', danger: true, onClick: () => { SEL = { r: ri, id: null, leg: null }; Ladder.del(); } },
    ]);
  }

  /* ---------- View ---------- */
  const TB = [
    ['Bit', ['XIC', 'XIO', 'ONS', 'OTE', 'OTL', 'OTU', 'OSR', 'OSF']],
    ['Timer/Counter', ['TON', 'TOF', 'RTO', 'CTU', 'CTD', 'RES']],
    ['Compare', ['EQU', 'NEQ', 'LES', 'LEQ', 'GRT', 'GEQ', 'LIM']],
    ['Math/Move', ['MOV', 'ADD', 'SUB', 'MUL', 'DIV', 'CLR']],
    ['File/Seq', ['COP', 'FLL', 'SQO', 'MSG']],
    ['Program', ['JSR', 'SBR', 'RET', 'MCR']],
  ];
  // the Favorites tab, as the first tab of the instruction palette
  const FAV = ['XIC', 'XIO', 'OTE', 'OTL', 'OTU', 'ONS', 'TON', 'CTU', 'RES', 'MOV', 'EQU', 'JSR'];
  const ICON = {
    XIC: '-] [-', XIO: '-]/[-', ONS: '-[ONS]-', OTE: '-( )-', OTL: '-(L)-', OTU: '-(U)-', RES: '-(RES)-', MCR: '-(MCR)-', RET: '-(RET)-',
  };

  Ladder.init = function (el) {
    root = el;
    el.innerHTML = `
      <div class="lad-toolbar">
        <div class="tb-group lad-status" data-lstatus><button class="lad-stat-btn" data-act="omenu" title="Controller status — click for Go Online, Download, RUN / PROG and Who Active"><b data-st-mode>Offline</b><span class="caret">▾</span></button>
          <div class="lad-stat-lines"><span data-st-forces>No Forces</span><span data-st-edits>No Edits</span></div>
          <div class="lad-leds">${["run", "ok", "bat", "io"].map(k => `<span data-st-led="${k}"><i></i>${k === "io" ? "I/O" : k.toUpperCase()}</span>`).join("")}</div></div>
        <div class="tb-group lad-pathbox" title="Path to the controller"><span class="tb-lbl">Path</span><span class="lad-path" data-st-path></span></div>
        <div class="tb-group lad-ins"><div class="ins-row">${TB.flatMap(([g, list]) => list.map(t => `<button class="tbtn ins-btn${FAV.includes(t) ? ' fav' : ''}" data-ins="${t}" data-g="${g}" title="${t} — ${esc(INSTR[t].name)}: ${esc(INSTR[t].help)}" aria-label="${t} ${esc(INSTR[t].name)}">${ICON[t] ? `<span class="mono">${ICON[t]}</span>` : `<span class="boxico">${t}</span>`}<small>${t}</small></button>`)).join('')}</div>
          <div class="ins-tabs" role="tablist">${["Favorites", ...TB.map(x => x[0])].map(g => `<button class="ins-tab" role="tab" data-itab="${g}">${g}</button>`).join("")}</div></div>
        <div class="tb-group"><span class="tb-lbl">File</span><select class="lad-file" data-lfile title="Program file: LAD 2 is the main program, LAD 3–9 are subroutines" aria-label="Program file"></select><button class="tbtn" data-act="newfile" title="New subroutine file">＋ File</button><button class="tbtn" data-act="org" title="Controller Organizer: tasks, programs, routines, tags, I/O">🗂 Organizer</button><button class="tbtn" data-act="tags" title="Controller Tags: names for bits, integers, timers, counters and I/O">🏷 Tags</button></div>
        <div class="tb-group lad-comm"><span class="tb-lbl">Online</span><select data-cmode title="Simple: edits run at once. Realistic: the controller keeps its own program; Go Online, Download and Upload as with real PLC software." aria-label="Connection"><option value="simple">Simple</option><option value="real">Realistic</option></select><button class="tbtn" data-act="who" title="Who Active: find the controller through the engineering PC in the Wiring and set the project path">⇆ Who Active</button><button class="tbtn" data-act="network" title="Network: who active, remote PLCs, produced / consumed data">🖧 Network</button><span class="lad-comm-real"><button class="tbtn" data-act="online" title="Go online / offline with the controller">⇄ Go Online</button><button class="tbtn" data-act="download" title="Write the project into the controller (PROG)">⤓ Download</button><button class="tbtn" data-act="upload" title="Read the controller program into the project">⤒ Upload</button><button class="tbtn" data-act="compare" title="Show what differs between the project and the controller">≠ Compare</button></span></div>
        <div class="tb-group"><span class="tb-lbl">Rung</span>
          <button class="tbtn mobile-only" data-act="data" title="Data files and forces">▤ Data</button>
          <button class="tbtn" data-act="rung" title="New rung (Ctrl+R)">＋ Rung</button>
          <button class="tbtn" data-act="branch" title="Branch (BST) around selection / add leg">⑂ Branch</button>
          <button class="tbtn" data-act="extl" title="Extend branch left">⇤</button>
          <button class="tbtn" data-act="extr" title="Extend branch right">⇥</button>
          <button class="tbtn" data-act="ml" title="Move instruction left">◀</button>
          <button class="tbtn" data-act="mr" title="Move instruction right">▶</button>
          <button class="tbtn" data-act="del" title="Delete selection (Del)">🗑</button>
          <button class="tbtn" data-act="undo" title="Undo (Ctrl+Z)">↶</button>
          <button class="tbtn" data-act="redo" title="Redo (Ctrl+Y)">↷</button>
          <button class="tbtn" data-act="ascii" title="Edit selected rung as text">ASCII</button>
          <button class="tbtn accent" data-act="verify" title="Verify project">✓ Verify</button>
          <button class="tbtn" data-act="iocfg" title="I/O Configuration: the card the CPU expects in each rack slot">I/O Config</button>
          <label class="tb-addr" title="How I/O addresses are shown. You can type an address in any style; the program is stored file-based."><span class="tb-lbl">Address</span><select data-addr>${Object.entries(Circuit.STYLES).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></label>
        </div>
        <div class="tb-group zoom-group"><span class="tb-lbl">Zoom</span>
          <button class="tbtn" data-act="zout" title="Zoom out (Ctrl + scroll)" aria-label="Zoom out">🔍−</button>
          <button class="tbtn zoomv" data-act="zreset" data-lz title="Reset zoom to 100%">100%</button>
          <button class="tbtn" data-act="zin" title="Zoom in (Ctrl + scroll)" aria-label="Zoom in">🔍＋</button>
        </div>
      </div>
      <div class="lad-banner" data-lbanner hidden></div>
      <div class="lad-main">
        <aside class="lad-org" data-lorg hidden></aside>
        <div class="lad-rungs" tabindex="0"></div>
        <aside class="lad-side"></aside>
      </div>`;
    rungsEl = el.querySelector('.lad-rungs');
    sideEl = el.querySelector('.lad-side');
    el.querySelector('[data-addr]').addEventListener('change', ev => App.setAddrStyle(ev.target.value));
    el.querySelector('[data-lfile]').addEventListener('change', ev => Ladder.openFile(Number(ev.target.value)));
    el.querySelector('[data-cmode]').addEventListener('change', ev => App.setConnMode(ev.target.value));
    el.querySelector('[data-lbanner]').addEventListener('click', ev => { const b = ev.target.closest('[data-act]'); if (b) ({ test: App.testEdits, assemble: App.assembleEdits, cancel: App.cancelEdits })[b.dataset.act]?.(); });
    el.querySelector('.lad-toolbar').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.itab) { setTab(b.dataset.itab); return; }
      if (b.dataset.act === 'omenu') { const q = b.getBoundingClientRect(); onlineMenu(q.left, q.bottom + 4); return; }
      if (b.dataset.ins) return Ladder.insert(b.dataset.ins);
      ({
        rung: () => Ladder.addRung(false), branch: Ladder.branch, extl: () => Ladder.extend(-1), extr: () => Ladder.extend(1),
        ml: () => Ladder.move(-1), mr: () => Ladder.move(1), del: Ladder.del, undo: Ladder.undo, redo: Ladder.redo,
        ascii: () => Ladder.editAscii(SEL.r < 0 ? 0 : SEL.r), verify: () => Ladder.verify(false), iocfg: () => App.ioConfig(), newfile: Ladder.newFile, org: () => App.organizer(true), tags: () => App.tagsDialog(),
        network: () => App.network(), who: () => App.whoActive(), online: () => App.goOnline(), download: () => App.download(), upload: () => UI.confirm('Upload', 'Replace the ladder and the tags of the project with the program in the controller?', () => App.upload(), 'Upload'), compare: () => App.compare(),
        test: () => App.testEdits(), assemble: () => App.assembleEdits(), cancel: () => App.cancelEdits(),
        zin: () => setZoom(LZ * 1.15), zout: () => setZoom(LZ / 1.15), zreset: () => setZoom(1),
      })[b.dataset.act]?.();
    });
    rungsEl.addEventListener('pointerdown', ev => {
      const rEl = ev.target.closest('.rung');
      if (!rEl || rEl.classList.contains('end')) { if (ev.button === 0 && !rEl) { SEL = { r: -1, id: null, leg: null }; Ladder.render(); } return; }
      const ri = Number(rEl.dataset.r);
      const u = ev.target.closest('[data-uid]'), lg = ev.target.closest('[data-leg]');
      const ns = { r: ri, id: u && !lg ? Number(u.dataset.uid) : null, leg: lg ? lg.dataset.leg : null };
      if (ns.r !== SEL.r || ns.id !== SEL.id || ns.leg !== SEL.leg) { SEL = ns; Ladder.render(); }
    });
    rungsEl.addEventListener('dblclick', ev => {
      const rEl = ev.target.closest('.rung'); if (!rEl || rEl.classList.contains('end')) return;
      const u = ev.target.closest('.el[data-uid]');
      if (u) Ladder.edit(Number(u.dataset.uid));
      else if (ev.target.closest('.rung-num') || ev.target.closest('.rung-comment')) Ladder.editAscii(Number(rEl.dataset.r));
    });
    rungsEl.addEventListener('contextmenu', ev => {
      const rEl = ev.target.closest('.rung'); if (!rEl || rEl.classList.contains('end')) return;
      ev.preventDefault();
      const ri = Number(rEl.dataset.r);
      const u = ev.target.closest('[data-uid]');
      if (u) { SEL = { r: ri, id: Number(u.dataset.uid), leg: null }; Ladder.render(); elemMenu(ev.clientX, ev.clientY, SEL.id); }
      else { SEL = { r: ri, id: null, leg: null }; Ladder.render(); rungMenu(ev.clientX, ev.clientY, ri); }
    });
    DataTable.init(sideEl);
    setTab(insTab);
    // the Organizer stays open (or closed) as the user left it in this browser
    try { if (localStorage.getItem('plc-trainer.orgOpen')) el.querySelector('[data-lorg]').hidden = false; } catch (e) { /* ignore */ }
    UI.drawer(el.querySelector('[data-act="data"]'), sideEl);
    UI.longPress(rungsEl);
    new ResizeObserver(() => { if (root.offsetParent) Ladder.render(); }).observe(rungsEl);
    rungsEl.addEventListener('wheel', ev => { if (!ev.ctrlKey) return; ev.preventDefault(); setZoom(ev.deltaY < 0 ? LZ * 1.1 : LZ / 1.1); }, { passive: false });
    bindDrag();
  };

  /* instruction palette tabs (remembered in this browser) */
  let insTab = (() => { try { return localStorage.getItem('plc-trainer.insTab') || 'Favorites'; } catch (e) { return 'Favorites'; } })();
  function setTab(g) {
    if (!root) return;
    if (!['Favorites', ...TB.map(x => x[0])].includes(g)) g = 'Favorites';
    insTab = g; try { localStorage.setItem('plc-trainer.insTab', g); } catch (e) { /* ignore */ }
    root.querySelectorAll('.ins-tab').forEach(t => { t.classList.toggle('on', t.dataset.itab === g); t.setAttribute('aria-selected', t.dataset.itab === g); });
    root.querySelectorAll('.lad-ins .ins-btn').forEach(b => b.classList.toggle('show', g === 'Favorites' ? b.classList.contains('fav') : b.dataset.g === g));
  }
  Ladder.setTab = setTab;
  /* the online menu of the status box: what the controller connection allows now */
  function onlineMenu(x, y) {
    const c = App.project.conn, real = !!(c && c.mode === 'real'), on = App.conn.online, run = App.plc.mode === 'RUN';
    UI.menu(x, y, [
      { head: real ? (on ? 'Online' : 'Offline') : 'Simple connection' },
      ...(real ? [{ label: on ? 'Go Offline' : 'Go Online', onClick: () => App.goOnline() }, { label: 'Download…', onClick: () => App.download() }, { label: 'Upload…', onClick: () => App.upload() }] : []),
      { label: 'Who Active…', onClick: () => App.whoActive() },
      { sep: true },
      { label: 'Run Mode', disabled: run, onClick: () => App.setMode('RUN') },
      { label: 'Program Mode', disabled: !run, onClick: () => App.setMode('PROG') },
      { sep: true },
      { label: real ? 'Simple connection (edits run at once)' : 'Realistic connection (download)', onClick: () => App.setConnMode(real ? 'simple' : 'real') },
    ]);
  }
  /* status box: mode, forces, edits, the controller lights and the path */
  Ladder.statusUi = function () {
    if (!root || !App.project) return;
    const plc = App.plc, c = App.project.conn, real = !!(c && c.mode === 'real'), on = !real || App.conn.online, run = plc.mode === 'RUN';
    const st = App.status ? App.status() : {};
    const set = (k, v) => { const e = root.querySelector(k); if (e && e.textContent !== v) e.textContent = v; };
    set('[data-st-mode]', !on ? 'Offline' : (real ? 'Online · ' : '') + (run ? 'Run' : 'Program'));
    const n = plc.forceCount();
    set('[data-st-forces]', n ? `Forces ${plc.forcesEnabled ? 'on' : 'off'} (${n})` : 'No Forces');
    set('[data-st-edits]', real && App.conn.online && !App.conn.same ? (App.conn.testing ? 'Testing edits' : 'Edits pending') : 'No Edits');
    set('[data-st-path]', st.path || '');
    const box = root.querySelector('[data-lstatus]'); if (!box) return;
    box.classList.toggle('online', on); box.classList.toggle('run', on && run);
    const L = (k, cls) => { const e = box.querySelector(`[data-st-led="${k}"]`); if (e) e.className = cls || ''; };
    L('run', run && plc.powered ? 'on' : '');
    L('ok', plc.powered ? (st.fault ? 'bad' : 'on') : '');
    L('bat', '');
    L('io', st.io === 'bad' ? 'bad blink' : st.io === 'ok' ? 'on' : '');
  };

  /* drag an instruction with the mouse to move it (touch uses the menu or ◀ ▶) */
  let dnd = null;
  function dropTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || !rungsEl.contains(el)) return null;
    const rEl = el.closest('.rung');
    if (!rEl || rEl.classList.contains('end')) return null;
    const lg = el.closest('[data-leg]');
    if (lg) return { leg: lg.dataset.leg, box: lg.getBoundingClientRect() };
    const u = el.closest('.el[data-uid], .br[data-uid]');
    if (u) {
      const id = Number(u.dataset.uid);
      if (id === dnd.id) return null;
      const b = u.classList.contains('br') ? brBox(u) : u.querySelector('.hit').getBoundingClientRect();
      const after = x > b.left + b.width / 2;
      return { id, after, box: b, edge: after ? b.right : b.left };
    }
    return { r: Number(rEl.dataset.r), box: rEl.querySelector('.rung-svg').getBoundingClientRect() };
  }
  /* a branch's box spans both rails */
  function brBox(g) {
    const r = [...g.querySelectorAll('.hit')].map(h => h.getBoundingClientRect());
    const left = Math.min(...r.map(x => x.left)), right = Math.max(...r.map(x => x.right)), top = Math.min(...r.map(x => x.top)), bottom = Math.max(...r.map(x => x.bottom));
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  }
  function showDrop(t) {
    let m = rungsEl.querySelector('.lad-drop');
    if (!t) { if (m) m.remove(); return; }
    if (!m) { m = document.createElement('div'); m.className = 'lad-drop'; rungsEl.appendChild(m); }
    const o = rungsEl.getBoundingClientRect();
    const sx = rungsEl.scrollLeft - o.left, sy = rungsEl.scrollTop - o.top;
    if (t.edge != null) Object.assign(m.style, { left: (t.edge + sx - 2) + 'px', top: (t.box.top + sy) + 'px', width: '4px', height: t.box.height + 'px' });
    else Object.assign(m.style, { left: (t.box.left + sx) + 'px', top: (t.box.top + sy) + 'px', width: t.box.width + 'px', height: t.box.height + 'px' });
    m.classList.toggle('area', t.edge == null);
  }
  function bindDrag() {
    rungsEl.addEventListener('pointerdown', ev => {
      if (ev.pointerType === 'touch' || ev.button !== 0) return;
      const u = ev.target.closest('.el[data-uid]');
      if (!u) return;
      dnd = { id: Number(u.dataset.uid), sx: ev.clientX, sy: ev.clientY, on: false, pid: ev.pointerId };
    });
    rungsEl.addEventListener('pointermove', ev => {
      if (!dnd || ev.pointerId !== dnd.pid) return;
      if (!(ev.buttons & 1)) { end(ev); return; }
      if (!dnd.on) {
        if (Math.hypot(ev.clientX - dnd.sx, ev.clientY - dnd.sy) < 6) return;
        dnd.on = true;
        try { rungsEl.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
        rungsEl.classList.add('dragging');
        const f = find(dnd.id);
        dnd.ghost = document.createElement('div');
        dnd.ghost.className = 'lad-ghost';
        dnd.ghost.textContent = f ? `${f.e.t} ${f.e.a[0] || ''}` : '';
        document.body.appendChild(dnd.ghost);
        const g = rungsEl.querySelector(`.el[data-uid="${dnd.id}"]`);
        if (g) g.classList.add('dragged');
      }
      Object.assign(dnd.ghost.style, { left: (ev.clientX + 12) + 'px', top: (ev.clientY + 10) + 'px' });
      dnd.t = dropTarget(ev.clientX, ev.clientY);
      showDrop(dnd.t);
    });
    function end(ev) {
      if (!dnd) return;
      const d = dnd;
      // the target is taken where the button is released: outside the rungs nothing is dropped
      if (d.on && ev.type === 'pointerup') d.t = dropTarget(ev.clientX, ev.clientY);
      dnd = null;
      if (!d.on) return;
      showDrop(null);
      d.ghost.remove();
      rungsEl.classList.remove('dragging');
      try { rungsEl.releasePointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
      // drop only on a real button release over a target; a lost release (outside the window) cancels
      if (ev.type === 'pointerup' && d.t) Ladder.moveTo(d.id, d.t); else Ladder.render();
    }
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', () => end({ type: 'cancel' }));
  }

  Ladder.onKey = function (ev) {
    const k = ev.key, c = ev.ctrlKey || ev.metaKey;
    if (c && k.toLowerCase() === 'z') { ev.preventDefault(); Ladder.undo(); }
    else if (c && k.toLowerCase() === 'y') { ev.preventDefault(); Ladder.redo(); }
    else if (c && k.toLowerCase() === 'r') { ev.preventDefault(); Ladder.addRung(false); }
    else if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); Ladder.del(); }
    else if (k === 'Enter' && SEL.id) { ev.preventDefault(); Ladder.edit(SEL.id); }
    else if (k === 'Escape') { SEL = { r: -1, id: null, leg: null }; Ladder.render(); }
  };

  /* ladder zoom: phones start smaller so a whole rung fits */
  let LZ = 1;
  try { LZ = Number(localStorage.getItem('plc-trainer.lz')) || (innerWidth < 760 ? 0.7 : 1); } catch (e) { LZ = innerWidth < 760 ? 0.7 : 1; }
  function setZoom(z) {
    LZ = Math.max(0.45, Math.min(1.8, Math.round(z * 100) / 100));
    const zl = root && root.querySelector('[data-lz]');
    if (zl) zl.textContent = Math.round(LZ * 100) + '%';
    try { localStorage.setItem('plc-trainer.lz', String(LZ)); } catch (e) { /* ignore */ }
    Ladder.render();
  }

  Ladder.render = function () {
    if (!rungsEl) return;
    const zl = root.querySelector('[data-lz]');
    if (zl) zl.textContent = Math.round(LZ * 100) + '%';
    const as = root.querySelector('[data-addr]');
    if (as) as.value = App.project.addr || 'file';
    if (curFile !== 2 && !fileOf(curFile)) curFile = 2;
    Ladder.connUi();
    if (App.renderOrg) App.renderOrg();
    const lf = root.querySelector('[data-lfile]');
    // file-based target: program files LAD 2 · MAIN, LAD 3…; tag-based: MainRoutine and routines by name
    const tag = App.project.target === 'tag';
    if (lf) lf.innerHTML = [`<option value="2">${tag ? 'MainRoutine' : 'LAD 2 · MAIN'}</option>`, ...(App.project.ladder.files || []).map(f => `<option value="${f.n}" ${f.n === curFile ? 'selected' : ''}>${tag ? '' : `LAD ${f.n} · `}${esc(f.name)}</option>`)].join('');
    const nf = root.querySelector('[data-act="newfile"]');
    if (nf) { nf.textContent = tag ? '＋ Routine' : '＋ File'; nf.title = tag ? 'New routine in MainProgram' : 'New subroutine file'; }
    const list = rungs();
    const avail = Math.max(600, (rungsEl.clientWidth - 70) / LZ);
    let W = avail;
    list.forEach(r => { W = Math.max(W, rungLayout(r).need); });
    const html = list.map((r, i) => {
      const { svg, h } = renderRung(r, W);
      const err = JSON.stringify(r.elems).includes('"id":') && [...ERR_IDS].some(id => find(id)?.ri === i);
      return `<div class="rung${SEL.r === i ? ' sel' : ''}${err ? ' has-err' : ''}" data-r="${i}">
        <div class="rung-num" style="padding-top:${Math.round(50 * LZ)}px" title="Double-click to edit rung text; right-click (long-press on touch) for the rung menu">${String(i).padStart(4, '0')}</div>
        <div class="rung-body">${r.comment ? `<div class="rung-comment">${esc(r.comment)}</div>` : ''}
        <svg class="rung-svg" width="${Math.round(W * LZ)}" height="${Math.round(h * LZ)}" viewBox="0 0 ${W} ${h}">${svg}</svg></div></div>`;
    }).join('') + `<div class="rung end"><div class="rung-num">${String(list.length).padStart(4, '0')}</div><div class="rung-body"><svg class="rung-svg" width="${Math.round(W * LZ)}" height="${Math.round(34 * LZ)}" viewBox="0 0 ${W} 34"><line class="rail" x1="3" y1="0" x2="3" y2="34"/><line class="rail" x1="${W - 3}" y1="0" x2="${W - 3}" y2="34"/><line class="w" x1="3" y1="17" x2="${W / 2 - 30}" y2="17"/><line class="w" x1="${W / 2 + 30}" y1="17" x2="${W - 3}" y2="17"/><text class="endt" x="${W / 2}" y="21">(END)</text></svg></div></div>`;
    const st = rungsEl.scrollTop, sl = rungsEl.scrollLeft;
    rungsEl.innerHTML = html;
    rungsEl.scrollTop = st; rungsEl.scrollLeft = sl;
    cache = {
      p: [...rungsEl.querySelectorAll('[data-p]')].map(el => ({ el, k: el.dataset.p, on: null })),
      h: [...rungsEl.querySelectorAll('[data-h]')].map(el => ({ el, k: el.dataset.h, on: null })),
      v: [...rungsEl.querySelectorAll('[data-v]')].map(el => ({ el, a: parse(el.dataset.v), t: null })),
      b: [...rungsEl.querySelectorAll('[data-b]')].map(el => ({ el, a: parse(el.dataset.b), on: null })),
      f: [...rungsEl.querySelectorAll('[data-f]')].map(el => ({ el, k: el.dataset.f, t: null })),
    };
    Ladder.update();
  };

  Ladder.update = function () {
    if (!cache) return;
    const plc = App.plc;
    for (const c of cache.p) { const on = !!plc.pw[c.k]; if (on !== c.on) { c.on = on; c.el.classList.toggle('on', on); } }
    for (const c of cache.h) { const on = !!plc.hl[c.k]; if (on !== c.on) { c.on = on; c.el.classList.toggle('on', on); } }
    for (const c of cache.v) { const t = String(c.a ? plc.getWord(c.a) : '?'); if (t !== c.t) { c.t = t; c.el.textContent = t; } }
    for (const c of cache.b) { const on = !!(c.a && plc.getBit(c.a)); if (on !== c.on) { c.on = on; c.el.classList.toggle('on', on); } }
    for (const c of cache.f) {
      const f = plc.forces[c.k];
      const t = f === undefined ? '' : (f ? 'FORCED ON' : 'FORCED OFF') + (plc.forcesEnabled ? '' : ' (disabled)');
      if (t !== c.t) { c.t = t; c.el.textContent = t; }
    }
    DataTable.update();
  };

  Ladder.resetSel = () => { SEL = { r: -1, id: null, leg: null }; ERR_IDS = new Set(); undo = []; redo = []; curFile = 2; };

  /* ---------- Data table ---------- */
  const DataTable = {};
  let dtFile = 'I', dtEl, dtCache = [];
  DataTable.init = function (el) { dtEl = el; };
  DataTable.show = function (f) { if (['I', 'O', 'B3', 'T4', 'C5', 'R6', 'N7'].includes(f)) { dtFile = f; DataTable.render(); } };
  DataTable.render = function () {
    if (!dtEl || !App.project) return;
    const files = ['I', 'O', 'B3', 'T4', 'C5', 'R6', 'N7'];
    const names = { I: 'I1 Input', O: 'O0 Output', B3: 'B3 Binary', T4: 'T4 Timer', C5: 'C5 Counter', R6: 'R6 Control (sequencers)', N7: 'N7 Integer' };
    let body = '';
    const bitHead = `<tr><th></th>${Array.from({ length: 16 }, (_, i) => `<th>${15 - i}</th>`).join('')}</tr>`;
    const bitRow = (f, w, n) => `<tr><th class="rowh">${f}:${w}</th>${Array.from({ length: 16 }, (_, i) => {
      const b = 15 - i, a = `${f}:${w}/${b}`;
      const dead = (f === 'I' || f === 'O') && b >= n;
      return `<td class="bit${dead ? ' dead' : ''}" data-bit="${a}" title="${a}${App.project.ladder.desc[a] ? ' — ' + esc(App.project.ladder.desc[a]) : ''}">0</td>`;
    }).join('')}</tr>`;
    if (dtFile === 'I' || dtFile === 'O') {
      // one word per I/O slot: the compact PLC's I:0/O:0, or each rack card in its slot
      const words = Circuit.ioMap(App.project.circuit, App.project.io).filter(m => m.file === dtFile);
      const dig = words.filter(m => !m.analog);
      body = words.length ? `${dig.length ? `<table class="dt bits">${bitHead}${dig.map(m => bitRow(dtFile, m.word, m.n)).join('')}</table>` : ''}
      <div class="io-list">${words.map(m => (m.label ? `<div class="io-slot">Slot ${m.word}: ${esc(m.label)} — ${esc(m.name)}</div>` : '') + Array.from({ length: m.n }, (_, i) => {
        // analog card: one word per channel (I:s.c / O:s.c), shown as a number
        if (m.analog) { const a = `${dtFile}:${m.word}.${i}`; return `<div class="io-row ana"><span></span><code>${a}</code><span class="io-desc">${esc(App.project.ladder.desc[a] || '')}</span><span class="num" data-word="${a}">0</span></div>`; }
        const a = `${dtFile}:${m.word}/${i}`;
        return `<div class="io-row" data-io="${a}"><span class="io-led" data-bit="${a}"></span><code title="${a}">${esc(App.fmt(a))}</code><span class="io-desc">${esc(App.project.ladder.desc[a] || '')}</span><span class="io-force" data-force="${a}"></span><span class="io-btns"><button data-fon="${a}" title="Force On">F1</button><button data-foff="${a}" title="Force Off">F0</button><button data-frm="${a}" title="Remove force">✕</button></span></div>`;
      }).join('')).join('')}</div>
      <p class="help">${dtFile === 'I' ? 'Inputs follow field wiring. Force to test logic without hardware.' : 'Outputs are written by the ladder; forcing overrides the physical output terminal.'}</p>`
        : `<p class="help">No ${dtFile === 'I' ? 'input' : 'output'} card in the I/O configuration. Add cards from the PLC Rack parts in the Wiring, then <button class="tbtn sm" data-act="iocfg">I/O Configuration</button>.</p>`;
    } else if (dtFile === 'B3') {
      body = `<table class="dt bits">${bitHead}${Array.from({ length: 8 }, (_, w) => bitRow('B3', w, 16)).join('')}</table><p class="help">Click a bit to toggle it.</p>`;
    } else if (dtFile === 'T4') {
      body = `<table class="dt"><tr><th></th><th>EN</th><th>TT</th><th>DN</th><th>BASE</th><th>PRE</th><th>ACC</th></tr>${Array.from({ length: 12 }, (_, i) => `<tr><th class="rowh">T4:${i}</th><td class="bit" data-bit="T4:${i}/EN">0</td><td class="bit" data-bit="T4:${i}/TT">0</td><td class="bit" data-bit="T4:${i}/DN">0</td><td data-tb="${i}"></td><td class="num" data-word="T4:${i}.PRE">0</td><td class="num" data-word="T4:${i}.ACC">0</td></tr>`).join('')}</table><p class="help">Click PRE/ACC to edit.</p>`;
    } else if (dtFile === 'C5') {
      body = `<table class="dt"><tr><th></th><th>CU</th><th>CD</th><th>DN</th><th>OV</th><th>UN</th><th>PRE</th><th>ACC</th></tr>${Array.from({ length: 12 }, (_, i) => `<tr><th class="rowh">C5:${i}</th>${['CU', 'CD', 'DN', 'OV', 'UN'].map(b => `<td class="bit" data-bit="C5:${i}/${b}">0</td>`).join('')}<td class="num" data-word="C5:${i}.PRE">0</td><td class="num" data-word="C5:${i}.ACC">0</td></tr>`).join('')}</table><p class="help">Click PRE/ACC to edit.</p>`;
    } else if (dtFile === 'R6') {
      body = `<table class="dt"><tr><th></th><th>EN</th><th>DN</th><th>ER</th><th>LEN</th><th>POS</th></tr>${Array.from({ length: 8 }, (_, i) => `<tr><th class="rowh">R6:${i}</th>${['EN', 'DN', 'ER'].map(b => `<td class="bit" data-bit="R6:${i}/${b}">0</td>`).join('')}<td class="num" data-word="R6:${i}.LEN">0</td><td class="num" data-word="R6:${i}.POS">0</td></tr>`).join('')}</table><p class="help">Sequencer controls (SQO). Click LEN/POS to edit.</p>`;
    } else {
      body = `<table class="dt"><tr><th></th>${Array.from({ length: 4 }, (_, i) => `<th>${i}</th>`).join('')}</tr>${Array.from({ length: 8 }, (_, r) => `<tr><th class="rowh">N7:${r * 4}</th>${Array.from({ length: 4 }, (_, i) => `<td class="num" data-word="N7:${r * 4 + i}">0</td>`).join('')}</tr>`).join('')}</table><p class="help">Click a value to edit.</p>`;
    }
    const forces = Object.keys(App.plc.forces);
    dtEl.innerHTML = `<div class="side-head"><h4>Data Files</h4></div>
      <div class="dt-tabs">${files.map(f => `<button class="${f === dtFile ? 'on' : ''}" data-file="${f}" title="${names[f]}">${f}</button>`).join('')}</div>
      <div class="dt-body">${body}</div>
      <div class="side-head"><h4>Forces <span class="count">${forces.length}</span></h4>
        <button class="tbtn sm" data-act="fen">${App.plc.forcesEnabled ? 'Disable' : 'Enable'}</button>
        <button class="tbtn sm" data-act="fclr" ${forces.length ? '' : 'disabled'}>Remove all</button></div>
      <div class="force-list">${forces.length ? forces.map(k => `<div><code title="${k}">${esc(App.fmt(k))}</code> <b class="${App.plc.forces[k] ? 'fon' : 'foff'}">${App.plc.forces[k] ? 'ON' : 'OFF'}</b> <button data-frm="${k}">✕</button></div>`).join('') : '<p class="help">No forces installed. Right-click an I/O instruction or use F1/F0 above.</p>'}</div>`;
    dtCache = [...dtEl.querySelectorAll('[data-bit]')].map(el => ({ el, a: parse(el.dataset.bit), led: el.classList.contains('io-led'), on: null, f: null }))
      .concat([...dtEl.querySelectorAll('[data-word]')].map(el => ({ el, a: parse(el.dataset.word), word: true, t: null })))
      .concat([...dtEl.querySelectorAll('[data-tb]')].map(el => ({ el, tb: Number(el.dataset.tb), t: null })))
      .concat([...dtEl.querySelectorAll('[data-force]')].map(el => ({ el, force: el.dataset.force, t: null })));
    dtEl.onclick = ev => {
      const t = ev.target;
      if (t.dataset.file) { dtFile = t.dataset.file; DataTable.render(); return; }
      if (t.dataset.fon) return App.force(t.dataset.fon, 1);
      if (t.dataset.foff) return App.force(t.dataset.foff, 0);
      if (t.dataset.frm) return App.force(t.dataset.frm, null);
      if (t.dataset.act === 'iocfg') { App.ioConfig(); return; }
      if (t.dataset.act === 'fen') { App.plc.forcesEnabled = !App.plc.forcesEnabled; App.forcesChanged(); return; }
      if (t.dataset.act === 'fclr') { Object.keys(App.plc.forces).forEach(k => App.plc.setForce(k, null)); App.forcesChanged(); return; }
      const bitEl = t.closest('[data-bit]');
      if (bitEl && !bitEl.classList.contains('dead')) {
        const a = parse(bitEl.dataset.bit);
        if (App.plc.isForceable(a)) {
          const r = bitEl.getBoundingClientRect();
          UI.menu(r.left, r.bottom + 2, forceItems(a.norm).slice(1));
        } else if (a.file === 'B3') App.plc.setBit(a, !App.plc.getBit(a));
        return;
      }
      const wEl = t.closest('[data-word]');
      if (wEl) {
        const a = parse(wEl.dataset.word);
        UI.form('Edit ' + a.norm, [{ key: 'v', label: 'Value', value: App.plc.getWord(a), type: 'number' }], v => {
          const n = Number(v.v); if (!Number.isFinite(n)) return 'Enter a number';
          App.plc.setWord(a, n);
        });
      }
    };
    DataTable.update();
  };
  DataTable.update = function () {
    const plc = App.plc;
    for (const c of dtCache) {
      if (c.word) { const t = String(plc.getWord(c.a)); if (t !== c.t) { c.t = t; c.el.textContent = t; } continue; }
      if (c.tb !== undefined) { const t = String(plc.data.T4[c.tb].base); if (t !== c.t) { c.t = t; c.el.textContent = t; } continue; }
      if (c.force) {
        const f = plc.forces[c.force];
        const t = f === undefined ? '' : f ? 'F-ON' : 'F-OFF';
        if (t !== c.t) { c.t = t; c.el.textContent = t; c.el.className = 'io-force ' + (f ? 'fon' : 'foff'); }
        continue;
      }
      const on = !!plc.getBit(c.a);
      const f = plc.forces[c.a.norm];
      if (on !== c.on || f !== c.f) {
        c.on = on; c.f = f;
        c.el.classList.toggle('on', on);
        c.el.classList.toggle('forced', f !== undefined);
        if (!c.led) c.el.textContent = on ? '1' : '0';
      }
    }
  };
  Ladder.DataTable = DataTable;

  Ladder.parseRung = parseRung;
  Ladder.serialize = serialize;
  Ladder.newRung = newRung;
  window.Ladder = Ladder;
})();
