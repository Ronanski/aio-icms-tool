/* MT PLC Studio ladder: lays rungs out on a grid of equal cells and draws them as SVG (docs/PLC_APP_SPEC.md section 4).
   - A bit instruction takes 1 cell, a box 2. Branch legs start and end at the same columns. Outputs sit against the
     right rail. A rung that does not fit wraps to the next row (a branch is never split; outputs on the last row).
   - Offline the lines are thin and dark. Online they are thin blue, in Run the rails are thick green, and a true
     instruction gets a short thick green bar on each side of its glyph (as checked in the reference).
   - Every instruction, rung number and rung gets a transparent hit rect with data-ri / data-p (path) for the editor.
   Paths: [k] for a top-level instruction, [k, leg, i, leg, i …] inside branches. */
(function (root) {
  'use strict';
  const MTPS = root.MTPS;
  const INSTR = MTPS.INSTR;
  const OPN = {
    TON: ['Timer', 'Preset', 'Accum'], TOF: ['Timer', 'Preset', 'Accum'], RTO: ['Timer', 'Preset', 'Accum'],
    CTU: ['Counter', 'Preset', 'Accum'], CTD: ['Counter', 'Preset', 'Accum'],
    EQU: ['Source A', 'Source B'], NEQ: ['Source A', 'Source B'], LES: ['Source A', 'Source B'], LEQ: ['Source A', 'Source B'],
    GRT: ['Source A', 'Source B'], GEQ: ['Source A', 'Source B'], LIM: ['Low Limit', 'Test', 'High Limit'],
    MEQ: ['Source', 'Mask', 'Compare'], CMP: ['Expression'],
    ADD: ['Source A', 'Source B', 'Dest'], SUB: ['Source A', 'Source B', 'Dest'], MUL: ['Source A', 'Source B', 'Dest'],
    DIV: ['Source A', 'Source B', 'Dest'], MOD: ['Source A', 'Source B', 'Dest'], SQR: ['Source', 'Dest'], NEG: ['Source', 'Dest'],
    ABS: ['Source', 'Dest'], CPT: ['Dest', 'Expression'], MOV: ['Source', 'Dest'], MVM: ['Source', 'Mask', 'Dest'], CLR: ['Dest'],
    AND: ['Source A', 'Source B', 'Dest'], OR: ['Source A', 'Source B', 'Dest'], XOR: ['Source A', 'Source B', 'Dest'], NOT: ['Source', 'Dest'],
    BTD: ['Source', 'Source Bit', 'Dest', 'Dest Bit', 'Length'], SWPB: ['Source', 'Order Mode', 'Dest'],
    COP: ['Source', 'Dest', 'Length'], FLL: ['Source', 'Dest', 'Length'], JSR: ['Routine Name', 'Input Par'],
    OSR: ['Storage Bit', 'Output Bit'], OSF: ['Storage Bit', 'Output Bit'],
  };
  const isBox = e => !!(INSTR[e.t] && INSTR[e.t].k === 'box');
  const isOut = e => (e.t === 'BR' ? e.legs.length > 0 && e.legs.every(l => l.length && isOut(l[l.length - 1])) : !!(INSTR[e.t] && INSTR[e.t].out));
  const widthOf = e => (e.t === 'BR' ? Math.max(1, ...e.legs.map(l => l.reduce((s, x) => s + widthOf(x), 0))) : isBox(e) ? 2 : 1);
  const same = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------- text measuring (cached per string and font) ---------- */
  const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  const wcache = new Map();
  const tw = (s, f) => {
    const k = f + '|' + s;
    let w = wcache.get(k);
    if (w === undefined) { if (ctx) { ctx.font = f; w = ctx.measureText(s).width; } else w = s.length * 6.5; wcache.set(k, w); }
    return w;
  };
  // a tag name or alias wraps at : _ . to fit, at most `max` lines
  function wrapName(s, w, font, max) {
    if (tw(s, font) <= w) return [s];
    const parts = s.split(/(?<=[:_.\]])/), out = [];
    let cur = '';
    for (const p of parts) { if (cur && tw(cur + p, font) > w) { out.push(cur); cur = p; } else cur += p; }
    if (cur) out.push(cur);
    if (out.length > max) { out.length = max; out[max - 1] += '…'; }
    return out.map(l => { while (tw(l, font) > w && l.length > 2) l = l.slice(0, -2) + '…'; return l; });
  }
  // words wrap to `max` lines; the last line keeps as many letters as fit, then …
  function wrapWords(s, w, font, max) {
    const words = String(s).split(/\s+/), out = [];
    let cur = '', k = 0;
    for (; k < words.length && out.length < max; k++) {
      const t = cur ? cur + ' ' + words[k] : words[k];
      if (tw(t, font) > w && cur) { out.push(cur); cur = words[k]; } else cur = t;
    }
    if (out.length < max) { out.push(cur); cur = ''; }
    const rest = [cur].concat(words.slice(k)).filter(Boolean).join(' ');
    if (rest) {
      let l = out[max - 1] + ' ' + rest;
      while (tw(l + '…', font) > w && l.length > 1) l = l.slice(0, -1);
      out[max - 1] = l.trimEnd() + '…';
    }
    return out.map(l => { while (tw(l, font) > w && l.length > 2) l = l.slice(0, -2) + '…'; return l; });
  }

  /* ---------- render ----------
     rungs: [{ elems, c (comment), err }]
     o: { W, cell, live, run, sel {ri, path}, selRung, tag(name) → {desc, alias}, descLines, forced(operand) → 0/1/null,
          drop {ri, path, after}, press {ri, path}, font (px) } */
  function render(rungs, o) {
    const S = o.font || 11, LH = Math.round(S * 1.2), CW = o.cell;
    const LM = Math.round(Math.max(30, CW * 0.36)), cols = Math.max(3, Math.floor((o.W - LM - 8) / CW)), RR = LM + cols * CW;
    const fName = `${S + 1}px Arial`, fDesc = `${S}px Arial`, descLines = o.descLines || 2;
    let y = 8, out = '', taps = '';
    const tagOf = a => (o.tag ? o.tag(String(a || '').split(/[.[]/)[0]) : null);
    const head = e => {
      if (isBox(e) || !e.a || !e.a.length) return { lines: [], h: 4 };
      const a = e.a[0], lines = [], tag = tagOf(a);
      if (tag && tag.desc) wrapWords(tag.desc, CW - 8, fDesc, descLines).forEach(t => lines.push(['ds', t]));
      wrapName(a, CW - 8, fName, 2).forEach(t => lines.push(['nm', t]));
      if (tag && tag.alias && !/[.[]/.test(a)) wrapName('<' + tag.alias + '>', CW - 6, fDesc, 2).forEach(t => lines.push(['al', t]));
      return { lines, h: lines.length * LH + 6 };
    };
    const opsOf = e => {
      const names = OPN[e.t] || (e.a || []).map((_, i) => 'Operand ' + i);
      return (e.a || []).map((a, i) => {
        let v = a, val = null;
        if (o.live && e.x) {
          const x = e.x[i];
          if ((e.t === 'TON' || e.t === 'TOF' || e.t === 'RTO' || e.t === 'CTU' || e.t === 'CTD') && i > 0) { const s = e.x[0].obj(); v = i === 1 ? s.PRE : s.ACC; }
          else if (x && typeof x.get === 'function' && x.at && !x.dim && MTPS.ATOMIC.includes(x.type)) { try { val = x.get(); if (x.type === 'REAL') val = +val.toPrecision(6); } catch (err) { val = '?'; } }
        }
        return [names[i] || '', v, val];
      });
    };
    const boxH = e => 22 + opsOf(e).reduce((s, r) => s + (r[2] !== null ? 2 : 1), 0) * (LH + 3);
    /* place a sequence on the grid: items { e, col, row, path }, branches { col, w, rows[], ends[] } */
    function place(arr, col, row, items, brs, path) {
      let c = col, rows = 1;
      arr.forEach((e, k) => {
        const p = path.concat(k);
        if (e.t === 'BR') {
          const w = widthOf(e), legRows = [], ends = [];
          let r = row;
          e.legs.forEach((leg, li) => { legRows.push(r); const res = place(leg, c, r, items, brs, p.concat(li)); ends.push(res.end); r += res.rows; });
          brs.push({ col: c, w, rows: legRows, ends, path: p });
          rows = Math.max(rows, r - row);
          c += w;
        } else { items.push({ e, col: c, row, path: p }); c += isBox(e) ? 2 : 1; }
      });
      return { end: c, rows };
    }
    rungs.forEach((R, ri) => {
      const elems = R.elems || [];
      let split = elems.length;
      while (split > 0 && isOut(elems[split - 1])) split--;
      const ins = elems.slice(0, split), outs = elems.slice(split);
      const outW = outs.reduce((s, e) => s + widthOf(e), 0);
      const lines = [[]];
      let used = 0;
      ins.forEach(e => { const w = widthOf(e); if (used + w > cols && lines[lines.length - 1].length) { lines.push([]); used = 0; } lines[lines.length - 1].push(e); used += w; });
      if (used + outW > cols && lines[lines.length - 1].length) lines.push([]);
      if (R.c) {
        const cl = wrapWords(R.c, RR - LM - 16, `${S + 1}px Arial`, 4);
        cl.forEach((t, i) => { out += `<text class="cm" x="${(LM + RR) / 2}" y="${y + LH + i * (LH + 2)}" text-anchor="middle">${esc(t)}</text>`; });
        y += cl.length * (LH + 2) + 6;
      }
      const rungTop = y;
      let insDone = 0;
      lines.forEach((line, li) => {
        const last = li === lines.length - 1, items = [], brs = [];
        const pr = place(line, 0, 0, items, brs, []);
        items.forEach(it => { it.path[0] += insDone; });
        brs.forEach(b => { b.path[0] += insDone; });
        insDone += line.length;
        const outItems = [], outBrs = [];
        if (last) {
          place(outs, cols - outW, 0, outItems, outBrs, []);
          outItems.forEach(it => { it.path[0] += split; });
          outBrs.forEach(b => { b.path[0] += split; });
        }
        const all = items.concat(outItems), allBr = brs.concat(outBrs);
        const nRows = Math.max(1, ...all.map(it => it.row + 1), ...allBr.map(b => b.rows[b.rows.length - 1] + 1));
        const above = [], below = [];
        for (let r = 0; r < nRows; r++) {
          const its = all.filter(it => it.row === r);
          above.push(Math.max(LH + 6, ...its.map(it => (isBox(it.e) ? 14 : head(it.e).h + 10))));
          below.push(Math.max(16, ...its.map(it => (isBox(it.e) ? boxH(it.e) - 6 : 14))));
        }
        const rowY = [];
        let yy = y;
        for (let r = 0; r < nRows; r++) { rowY.push(yy + above[r]); yy += above[r] + below[r] + 4; }
        const X = c => LM + c * CW, wy = rowY[0];
        const endIn = pr.end, startOut = last ? cols - outW : cols;
        if (li > 0) out += `<path class="wrap" d="M${LM + 3} ${wy - 5}l6 5-6 5z"/>`;
        out += `<line class="w" x1="${LM}" y1="${wy + .5}" x2="${X(endIn)}" y2="${wy + .5}"/>`;
        if (last) out += `<line class="w" x1="${X(endIn)}" y1="${wy + .5}" x2="${X(startOut)}" y2="${wy + .5}"/>`;
        else out += `<line class="w" x1="${X(endIn)}" y1="${wy + .5}" x2="${RR - 12}" y2="${wy + .5}"/><path class="wrap" d="M${RR - 12} ${wy - 5}l6 5-6 5z"/>`;
        if (last && !outs.length) out += `<line class="w" x1="${X(startOut)}" y1="${wy + .5}" x2="${RR}" y2="${wy + .5}"/>`;
        allBr.forEach(b => {
          const x1 = X(b.col), x2 = X(b.col + b.w), ys = b.rows.map(r => rowY[r]);
          b.rows.forEach((r, k) => {
            if (b.ends[k] === b.col) out += `<line class="w" x1="${x1}" y1="${ys[k] + .5}" x2="${x2}" y2="${ys[k] + .5}"/>`;
            else if (k) out += `<line class="w" x1="${X(b.ends[k])}" y1="${ys[k] + .5}" x2="${x2}" y2="${ys[k] + .5}"/>`;
            else if (b.ends[k] < b.col + b.w) out += `<line class="w" x1="${X(b.ends[k])}" y1="${ys[k] + .5}" x2="${x2}" y2="${ys[k] + .5}"/>`;
          });
          out += `<line class="w" x1="${x1 + .5}" y1="${ys[0]}" x2="${x1 + .5}" y2="${ys[ys.length - 1]}"/><line class="w" x1="${x2 + .5}" y1="${ys[0]}" x2="${x2 + .5}" y2="${ys[ys.length - 1]}"/>`;
          const isSel = o.sel && o.sel.ri === ri && same(o.sel.path, b.path);
          if (isSel) out += `<rect class="sel" x="${x1 - 3}" y="${ys[0] - 10}" width="${x2 - x1 + 6}" height="${ys[ys.length - 1] - ys[0] + 20}" rx="3" fill="none"/>`;
          // the branch rail is a hit target of its own (select the branch, add a leg)
          taps += `<rect class="tap" data-ri="${ri}" data-p="${b.path.join('.')}" data-br="1" x="${x1 - 6}" y="${ys[0] + 6}" width="12" height="${Math.max(12, ys[ys.length - 1] - ys[0] - 6)}"/>`;
        });
        if (o.drop && o.drop.ri === ri && o.drop.end && last) {
          const dx = X(startOut) - 2;
          out += `<line class="drop" x1="${dx}" y1="${wy - 18}" x2="${dx}" y2="${wy + 18}"/>`;
        }
        all.forEach(it => {
          const e = it.e, x = X(it.col), w = (isBox(e) ? 2 : 1) * CW, cy = rowY[it.row], cx = x + w / 2, h = head(e);
          const isSel = o.sel && o.sel.ri === ri && same(o.sel.path, it.path);
          if (isSel) out += `<rect class="sel" x="${x + 2.5}" y="${cy - h.h - 6.5}" width="${w - 5}" height="${h.h + (isBox(e) ? boxH(e) + 4 : 26)}" rx="3"/>`;
          if (o.press && o.press.ri === ri && same(o.press.path, it.path)) out += `<circle class="press" cx="${cx}" cy="${cy}" r="${CW * .4}"/>`;
          if (o.drop && o.drop.ri === ri && same(o.drop.path, it.path)) {
            const dx = o.drop.after ? x + w - 2 : x + 2;
            out += `<line class="drop" x1="${dx}" y1="${cy - 18}" x2="${dx}" y2="${cy + 18}"/>`;
          }
          h.lines.forEach(([k, t], i) => { out += `<text class="${k}" x="${cx}" y="${cy - h.h + LH - 4 + i * LH}" text-anchor="middle">${esc(t)}</text>`; });
          const on = o.live && !!e.v;
          if (isBox(e)) out += box(e, x, cy, w, on, o, opsOf(e), LH);
          else out += glyph(e, x, cy, w, on, S);
          const f = o.forced && e.a && e.a[0] ? o.forced(e.a[0]) : null;
          if (f !== null && f !== undefined) out += `<text class="frc" x="${x + 6}" y="${cy + 22}">▸${f ? 'ON' : 'OFF'}</text>`;
          if (e.a && e.a.some(a => a === '?' || a === '')) out += `<rect class="errw" x="${x + 4.5}" y="${cy - 12.5}" width="${w - 9}" height="25" rx="2"/>`;
          taps += `<rect class="tap" data-ri="${ri}" data-p="${it.path.join('.')}" x="${x}" y="${cy - h.h - 6}" width="${w}" height="${h.h + (isBox(e) ? boxH(e) + 4 : 28)}"/>`;
        });
        y = yy + 2;
      });
      const rungBot = Math.max(y, rungTop + 40);
      y = rungBot;
      out += `<line class="rail" x1="${LM + .5}" y1="${rungTop - 4}" x2="${LM + .5}" y2="${rungBot}"/><line class="rail" x1="${RR + .5}" y1="${rungTop - 4}" x2="${RR + .5}" y2="${rungBot}"/>`;
      const selR = o.selRung === ri;
      if (selR) out += `<rect class="rsel" x="0" y="${rungTop - 4}" width="${LM - 4}" height="${rungBot - rungTop + 4}"/>`;
      out += `<text class="rn${selR ? ' on' : ''}" x="${LM - 8}" y="${rungTop + LH + 6}" text-anchor="end">${ri}</text>`;
      if (R.err) out += `<text class="err" x="${LM - 8}" y="${rungTop + 2 * LH + 14}" text-anchor="end">⊗</text>`;
      // the rung itself (empty space) and its number are hit targets too
      taps = `<rect class="tap rung" data-ri="${ri}" x="${LM}" y="${rungTop - 4}" width="${RR - LM}" height="${rungBot - rungTop + 4}"/>` + taps;
      taps += `<rect class="tap" data-ri="${ri}" data-rn="1" x="0" y="${rungTop - 4}" width="${LM}" height="${rungBot - rungTop + 4}"/>`;
      y += 10;
    });
    out += `<text class="rn" x="${LM - 6}" y="${y + 14}" text-anchor="end">(End)</text><line class="rail" x1="${LM + .5}" y1="${y}" x2="${LM + .5}" y2="${y + 20}"/><line class="rail" x1="${RR + .5}" y1="${y}" x2="${RR + .5}" y2="${y + 20}"/><line class="w" x1="${LM}" y1="${y + 20.5}" x2="${RR}" y2="${y + 20.5}"/>`;
    taps += `<rect class="tap" data-end="1" x="0" y="${y - 4}" width="${RR}" height="30"/>`;
    y += 44;
    const W = Math.max(o.W, RR + 8);
    const cls = 'lad' + (o.live ? ' online' : '') + (o.run ? ' run' : '');
    return { svg: `<svg class="${cls}" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}" style="font-size:${S}px">${out}${taps}</svg>`, height: y, cols };
  }
  function glyph(e, x, cy, w, on, S) {
    const cx = x + w / 2, g = 7, k = e.t;
    let s = `<line class="w" x1="${x}" y1="${cy + .5}" x2="${cx - g}" y2="${cy + .5}"/><line class="w" x1="${cx + g}" y1="${cy + .5}" x2="${x + w}" y2="${cy + .5}"/>`;
    const lb = INSTR[k] && INSTR[k].lbl;
    if (INSTR[k] && INSTR[k].k === 'contact') {
      s += `<path class="g" d="M${cx - g + .5} ${cy - 8}v17M${cx + g - .5} ${cy - 8}v17"/>`;
      if (k === 'XIO') s += `<path class="g cv" d="M${cx - 4} ${cy + 7}l8 -15"/>`;
      if (k !== 'XIC' && k !== 'XIO') s += `<text class="bt" x="${cx}" y="${cy + S + 12}" text-anchor="middle">${k}</text>`;
    } else {
      s += `<path class="g cv" d="M${cx - 3} ${cy - 8}c-6 4-6 13 0 17M${cx + 3} ${cy - 8}c6 4 6 13 0 17"/>`;
      if (lb && lb.length === 1) s += `<text class="nm" x="${cx}" y="${cy + 4}" text-anchor="middle">${lb}</text>`;
      else if (lb) s += `<text class="bt" x="${cx}" y="${cy + S + 12}" text-anchor="middle">${lb}</text>`;
    }
    if (on) s += `<rect class="bar" x="${cx - g - 15}" y="${cy - 1.5}" width="11" height="4"/><rect class="bar" x="${cx + g + 4}" y="${cy - 1.5}" width="11" height="4"/>`;
    return s;
  }
  function box(e, x, cy, w, on, o, ops, LH) {
    const L = x + 8, bits = (INSTR[e.t] || {}).bits || [], Rt = x + w - (bits.length ? 30 : 8), top = cy - 9;
    const rows = ops.reduce((s, r) => s + (r[2] !== null ? 2 : 1), 0), h = 22 + rows * (LH + 3);
    let s = `<line class="w" x1="${x}" y1="${cy + .5}" x2="${L}" y2="${cy + .5}"/>`;
    s += `<rect class="bx" x="${L + .5}" y="${top + .5}" width="${Rt - L}" height="${h}"/><rect class="bxh" x="${L + .5}" y="${top + .5}" width="${Math.min(52, Rt - L)}" height="17"/>`;
    s += `<text class="nm b" x="${L + 6}" y="${top + 13}">${e.t}</text>`;
    let yy = top + 17 + LH + 2;
    ops.forEach(([n, v, val]) => {
      const room = Rt - L - 12 - (n ? Math.min(70, n.length * 6.2) : 0);
      let vs = String(v);
      if (vs.length * 6.8 > room) vs = vs.slice(0, Math.max(3, Math.floor(room / 6.8) - 1)) + '…';
      s += `<text class="bt" x="${L + 6}" y="${yy}">${esc(n)}</text><text class="bv" x="${Rt - 5}" y="${yy}" text-anchor="end">${esc(vs)}</text>`;
      if (val !== null) { yy += LH + 3; s += `<text class="bv live" x="${Rt - 5}" y="${yy}" text-anchor="end">${esc(String(val))}</text>`; }
      yy += LH + 3;
    });
    if (bits.length) bits.forEach((b, i) => {
      const by = cy + i * (LH + 4), bOn = o.live && e.bv && e.bv[b];
      s += `<line class="w" x1="${Rt}" y1="${by + .5}" x2="${x + w}" y2="${by + .5}"/><text class="bt" x="${Rt + 14}" y="${by - 3}" text-anchor="middle">${b}</text>`;
      if (bOn) s += `<rect class="bar" x="${Rt + 3}" y="${by - 1.5}" width="22" height="4"/>`;
    });
    else {
      s += `<line class="w" x1="${Rt}" y1="${cy + .5}" x2="${x + w}" y2="${cy + .5}"/>`;
      if (on) s += `<rect class="bar" x="${x + 1}" y="${cy - 1.5}" width="6" height="4"/><rect class="bar" x="${Rt + 1}" y="${cy - 1.5}" width="6" height="4"/>`;
    }
    return s;
  }

  /* instruction glyph for buttons and pickers */
  function icon(mn) {
    const s = 'stroke="currentColor" stroke-width="1.5" fill="none"', W = 'M0 9h10M20 9h10';
    const con = `<path d="${W}M10 2v14M20 2v14" ${s}/>`;
    const coil = l => `<path d="${W}" ${s}/><path d="M12 2c-4 3-4 11 0 14M18 2c4 3 4 11 0 14" ${s}/>${l ? `<text x="15" y="12.5" font-size="8" text-anchor="middle" fill="currentColor" stroke="none" font-family="Arial">${l}</text>` : ''}`;
    let b;
    if (mn === 'XIC') b = con;
    else if (mn === 'XIO') b = con + `<path d="M12 15 18 3" ${s}/>`;
    else if (mn === 'OTE') b = coil('');
    else if (mn === 'OTL') b = coil('L');
    else if (mn === 'OTU') b = coil('U');
    else if (mn === 'BR') b = `<path d="M0 5h30M6 5v9h18V5" ${s}/>`;
    else if (mn === 'BRL') b = `<path d="M0 3h30M6 3v12h18V3M6 9h18" ${s}/>`;
    else if (mn === 'RUNG') b = `<path d="M2 1v16M28 1v16M2 9h26" ${s}/>`;
    else b = `<path d="M0 9h4M26 9h4" ${s}/><rect x="4" y="2" width="22" height="14" ${s}/><text x="15" y="12" font-size="6.5" text-anchor="middle" fill="currentColor" font-family="Arial" font-weight="700">${mn.slice(0, 4)}</text>`;
    return `<svg viewBox="0 0 30 18" aria-hidden="true">${b}</svg>`;
  }

  MTPS.Ladder = { render, icon, isBox, isOut, widthOf, OPN };
})(typeof window !== 'undefined' ? window : globalThis);
