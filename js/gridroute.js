/* GridRoute: orthogonal wire routes on a grid (A*), shared by the free-draw Electrical Diagram and the Wiring.
   A route leaves each terminal straight out in its direction, never enters a blocked point (a device body, another
   terminal), never runs on top of another net's wire or touches it with a corner (it may cross one straight), keeps a
   step away from other nets where it can, and takes as few bends as it can. Wires of one net may share a line; where
   three or more lines of one net meet a junction dot is reported. */
(function () {
  'use strict';
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const dirNo = (dx, dy) => DIRS.findIndex(([x, y]) => x === dx && y === dy);
  function heap() {
    const a = [];
    return {
      get size() { return a.length; },
      push(n) { a.push(n); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } },
      pop() {
        const top = a[0], last = a.pop();
        if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
        return top;
      },
    };
  }
  /* opts: G grid step; blocked: Set "gx,gy" no wire may enter; front: Set of points just in front of a terminal;
     wires: [{ id, net, a: {x, y}, b, da: [dx, dy] out of a, db: out of b, fixed: [{x, y}…] (drawn by hand) }];
     stub: how far a wire goes straight out of a terminal before it may turn (grid steps, default 1).
     Returns { paths: Map id → [{x, y}…], dots: [{x, y, net}] }. */
  function solve(opts) {
    const G = opts.G, blocked = opts.blocked, front = opts.front || new Set(), stub = opts.stub || 1;
    const edges = new Map(), pts = new Map();
    const mark = (net, x, y, d) => { const k = x + ',' + y; let m = pts.get(k); if (!m) pts.set(k, m = new Map()); m.set(net, (m.get(net) || 0) | (1 << d)); };
    const occupy = (net, P) => {
      for (let i = 1; i < P.length; i++) {
        const p = P[i - 1], q = P[i]; if (p.x !== q.x && p.y !== q.y) continue;
        if (p.x % G || p.y % G || q.x % G || q.y % G) continue;
        const dx = Math.sign(q.x - p.x), dy = Math.sign(q.y - p.y), d = dirNo(dx, dy); if (d < 0) continue;
        let x = p.x / G, y = p.y / G; const n = Math.abs(q.x - p.x + q.y - p.y) / G;
        for (let s = 0; s < n; s++) {
          const ek = dx ? Math.min(x, x + dx) + ',' + y + ',h' : x + ',' + Math.min(y, y + dy) + ',v';
          let e = edges.get(ek); if (!e) edges.set(ek, e = new Set()); e.add(net);
          mark(net, x, y, d); x += dx; y += dy; mark(net, x, y, (d + 2) % 4);
        }
      }
    };
    const others = (m, net) => { if (!m) return 0; let n = 0; for (const [k] of m) if (k !== net) n++; return n; };
    function search(A, dA, B, dB, net, mine, pad) {
      const x0 = Math.min(A.x, B.x) - pad, x1 = Math.max(A.x, B.x) + pad, y0 = Math.min(A.y, B.y) - pad, y1 = Math.max(A.y, B.y) + pad;
      const H0 = (x, y) => Math.abs(x - B.x) + Math.abs(y - B.y), open = heap(), best = new Map(), from = new Map();
      const k0 = A.x + ',' + A.y + ',' + dA; best.set(k0, 0); open.push({ x: A.x, y: A.y, d: dA, g: 0, f: H0(A.x, A.y), k: k0 });
      let n = 0;
      while (open.size && n++ < 80000) {
        const c = open.pop(); if (c.g > best.get(c.k)) continue;
        if (c.x === B.x && c.y === B.y) {
          if (c.d !== dB && !c.end) { const g = c.g + 8, k = c.k + 'e'; if (!best.has(k) || g < best.get(k)) { best.set(k, g); from.set(k, c.k); open.push({ ...c, g, f: g, k, end: true }); } continue; }
          const P = []; let k = c.k; while (k) { const [x, y] = k.split(','); P.unshift({ x: +x * G, y: +y * G }); k = from.get(k); }
          return P;
        }
        if (c.end) continue;
        for (let d = 0; d < 4; d++) {
          if (d === (c.d + 2) % 4) continue;
          const [dx, dy] = DIRS[d], x = c.x + dx, y = c.y + dy; if (x < x0 || x > x1 || y < y0 || y > y1) continue;
          const pk = x + ',' + y, goal = x === B.x && y === B.y;
          if (!goal && !mine.has(pk) && blocked.has(pk)) continue;
          let g = c.g + 1;
          if (d !== c.d) { g += 8; if (others(pts.get(c.x + ',' + c.y), net)) g += 60; }   // a bend on another net's wire would join it
          const ek = dx ? Math.min(c.x, x) + ',' + y + ',h' : x + ',' + Math.min(c.y, y) + ',v', e = edges.get(ek);
          if (e) { if (e.has(net)) g -= 0.4; for (const q of e) if (q !== net) g += 60; }
          const m = pts.get(pk);
          if (m) for (const [q, bits] of m) if (q !== net) g += bits === (dx ? 10 : 5) ? 4 : 60;   // crossing straight over: fine; touching: not
          if (front.has(pk) && !mine.has(pk)) g += 25;   // in front of another terminal
          const side = dx ? [x + ',' + (y - 1), x + ',' + (y + 1)] : [(x - 1) + ',' + y, (x + 1) + ',' + y];
          for (const s of side) if (others(pts.get(s), net)) g += 1;   // keep a grid step from other nets
          const k = pk + ',' + d;
          if (!best.has(k) || g < best.get(k)) { best.set(k, g); from.set(k, c.k); open.push({ x, y, d, g, f: g + H0(x, y), k }); }
        }
      }
      return null;
    }
    const paths = new Map();
    for (const w of opts.wires) if (w.fixed) { occupy(w.net, w.fixed); paths.set(w.id, w.fixed); }
    const len = w => Math.abs(w.a.x - w.b.x) + Math.abs(w.a.y - w.b.y);
    for (const w of opts.wires.filter(x => !x.fixed).sort((p, q) => len(p) - len(q))) {
      const { a, b, da, db, net } = w;
      const A = { x: Math.round((a.x + da[0] * G * stub) / G), y: Math.round((a.y + da[1] * G * stub) / G) }, B = { x: Math.round((b.x + db[0] * G * stub) / G), y: Math.round((b.y + db[1] * G * stub) / G) };
      const mine = new Set([A.x + ',' + A.y, B.x + ',' + B.y]);
      const dA = dirNo(da[0], da[1]), dB = dirNo(-db[0], -db[1]);
      const mid = (p, q, vert) => (vert ? { x: p.x, y: q.y * G } : { x: q.x * G, y: p.y });
      const g = search(A, dA < 0 ? 1 : dA, B, dB < 0 ? 1 : dB, net, mine, 12) || search(A, dA < 0 ? 1 : dA, B, dB < 0 ? 1 : dB, net, mine, 40);
      let P;
      if (g) P = [a, mid(a, A, !!da[1]), ...g, mid(b, B, !!db[1]), b];
      else { const my = Math.round((a.y + b.y) / (2 * G)) * G; P = [a, { x: a.x, y: my }, { x: b.x, y: my }, b]; }
      // drop repeated points and points that make no turn
      const out = [];
      for (const p of P) { const q = out[out.length - 1]; if (q && q.x === p.x && q.y === p.y) continue; if (out.length > 1) { const r = out[out.length - 2]; if ((r.x === q.x && q.x === p.x) || (r.y === q.y && q.y === p.y)) out.pop(); } out.push(p); }
      occupy(net, out);
      paths.set(w.id, out);
    }
    const dots = [];
    for (const [k, m] of pts) for (const [net, bits] of m) {
      let n = 0; for (let i = 0; i < 4; i++) if (bits & (1 << i)) n++;
      if (n >= 3) { const [x, y] = k.split(','); dots.push({ x: +x * G, y: +y * G, net }); }
    }
    return { paths, dots };
  }
  window.GridRoute = { solve };
})();
