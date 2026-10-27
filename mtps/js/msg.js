/* MT PLC Studio: the Message Configuration dialog of the MSG instruction.
   Sources: v37 help, Message Configuration Dialog Box - Configuration Tab, Communications tab, Tag Tab and Status
   Section; 1756-PM012 (Configure the message: Message Type, Source Element, Number Of Elements, Destination Element,
   Path, Cache Connections; the supported data types); 1756-RM018A chapter 4 (MESSAGE structure, error codes).
   The emulator carries the two message types for a Logix 5000 controller: CIP Data Table Read and CIP Data Table
   Write, over the backplane of the chassis (path 1,<slot>) or to the controller itself (THIS). */
(function () {
  'use strict';
  const E = window.MTPS, A = E.App;
  if (!A || !A.ui) return;
  const U = s => String(s == null ? '' : s).toUpperCase();
  const TYPES = [['read', 'CIP Data Table Read'], ['write', 'CIP Data Table Write']];
  const BITS = [['EN', 'Enable'], ['EW', 'Enable Waiting'], ['ST', 'Start'], ['DN', 'Done']];
  const hex = v => '16#' + ((v | 0) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  // 1756-PM012, Supported data types: SINT, INT, DINT, LINT, REAL and the structures
  const okType = ty => { const b = U(String(ty || '').replace(/\[.*$/, '')); return !!b && !['BOOL', 'LREAL'].includes(b); };
  const REMOTE = /^(?:Program:[A-Za-z_]\w*\.)?[A-Za-z_]\w*(?:\[\s*\d+(?:\s*,\s*\d+){0,2}\s*\]|\.[A-Za-z_]\w*)*$/;
  let style = false;
  function css() {
    if (style) return; style = true;
    const s = document.createElement('style');
    s.textContent = `.mstat{border-top:1px solid var(--border);margin-top:10px;padding-top:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 12px;font-size:13px}
      .mstat .led{display:inline-block;width:12px;height:12px;border-radius:50%;border:1px solid var(--border-strong);background:var(--surface-2);vertical-align:-2px;margin-right:6px}
      .mstat .led.on{background:var(--accent);border-color:var(--accent)}.mstat .wide{grid-column:1/-1}.mstat .mono{font-family:var(--mono)}
      .mpd{font-size:12px;color:var(--muted);margin:-2px 0 8px}.mcm{display:flex;flex-wrap:wrap;gap:4px 14px}.mbl .row{cursor:pointer}`;
    document.head.appendChild(s);
  }
  // the static display under Path: the module the path leads to, from the chassis
  function pathText(t) {
    const b = E.MSG.path(t), ch = A.chassis, own = A.ctl && A.ctl.slot;
    if (b === null) return 'Not a valid path: 1,<slot> (the backplane of the chassis), or THIS.';
    if (!b.length) return 'THIS: this controller.';
    if (b.length !== 2 || b[0] !== 1) return `Port ${b[0]}: this emulated chassis has only the backplane (port 1).`;
    const m = ch && ch.module(b[1]);
    if (b[1] === own) return `Backplane, slot ${b[1]}: this controller.`;
    if (!m) return `Backplane, slot ${b[1]}: no module in this slot.`;
    return `Backplane, slot ${b[1]}: ${m.name || m.type}${m.ctl ? ' (controller)' : ` (${m.type}: not a controller)`}.`;
  }
  /* the dialog for the MESSAGE tag name (scope: a program name, '' for the controller, or left out: the open program,
     then the controller); draft: values typed before New Tag… */
  function msgConfig(name, scope, draft) {
    const u = A.ui, S = A.state, esc = u.esc;
    const find = l => (l || []).find(x => U(x.name) === U(name));
    let prog = null, tag = null;
    if (scope !== undefined && scope !== null) { prog = scope ? u.allProgs().find(x => x.name === scope) || null : null; tag = find(prog ? prog.tags : S.p.tags); }
    else { const P = u.curProg(); tag = find(P.tags); if (tag) prog = P; else tag = find(S.p.tags); }
    if (!tag || tag.alias || U(tag.type) !== 'MESSAGE' || tag.dim) { u.toast(`${name}: Message Configuration needs a MESSAGE tag (not an array).`, 'err'); return null; }
    css();
    const c = Object.assign({ type: 'read', src: '', n: 1, dst: '', path: '', cache: true }, tag.msg || {}, draft || {});
    const on = () => S.online && A.ctl && A.ctl.M;
    const ro = !u.editable();
    const dis = ro ? ' disabled' : '';
    const locals = () => {
      const out = [], add = l => (l || []).forEach(t => { if (t.alias || !okType(t.type)) return; if (E.dimN(t.dim)) out.push(`${t.name}[${(E.dimsOf(t.dim) || []).map(() => 0).join(',')}]`); else out.push(t.name); });
      add(S.p.tags); if (prog) add(prog.tags); else add(u.curProg().tags);
      return [...new Set(out)];
    };
    const conf = `<div class="frow"><label for="mc-ty">Message Type</label><select class="inp" id="mc-ty"${dis}>${TYPES.map(([k, l]) => `<option value="${k}"${k === c.type ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="frow"><label for="mc-src">Source Element</label><input class="inp mono" id="mc-src" value="${esc(c.src)}" autocomplete="off" spellcheck="false" autocapitalize="off"${dis}></div>
      <div class="frow"><label for="mc-n">Number Of Elements</label><input class="inp" id="mc-n" type="number" min="1" max="65535" step="1" inputmode="numeric" value="${esc(c.n)}"${dis}></div>
      <div class="frow"><label for="mc-dst">Destination Element</label><input class="inp mono" id="mc-dst" value="${esc(c.dst)}" autocomplete="off" spellcheck="false" autocapitalize="off"${dis}></div>
      <datalist id="mc-loc">${locals().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="brow" style="margin-top:0"><button class="btn" id="mc-nt" type="button"${dis}>New Tag…</button></div>
      <p class="help" id="mc-hint"></p>`;
    const comm = `<div class="frow"><label for="mc-path">Path</label><span class="afor"><input class="inp mono" id="mc-path" value="${esc(c.path)}" placeholder="1,2" autocomplete="off" spellcheck="false" autocapitalize="off"${dis}><button class="btn" id="mc-br" type="button"${dis}>Browse…</button></span></div>
      <div class="mpd" id="mc-pd"></div><div class="mbl" id="mc-bl" hidden></div>
      <div class="grp">Communication Method</div>
      <div class="mcm"><label class="ck"><input type="radio" name="mc-cm" checked disabled> CIP</label><label class="ck"><input type="radio" name="mc-cm" disabled> DH+</label><label class="ck"><input type="radio" name="mc-cm" disabled> CIP With Source ID</label></div>
      <p class="help">Not available for the CIP message types (they set the method themselves).</p>
      <label class="ck"><input type="checkbox" id="mc-con" disabled> Connected</label>
      <label class="ck"><input type="checkbox" id="mc-cc"${c.cache !== false ? ' checked' : ''}${dis}> Cache Connections</label>
      <label class="ck"><input type="checkbox" id="mc-lc" disabled> Large Connection</label>
      <p class="help">Connected and Large Connection are for CIP Generic messages. Keep Cache Connections set for a message that executes again and again.</p>`;
    const ACC = ['Read/Write', 'Read Only', 'None'], acc = ACC.includes(tag.access) ? tag.access : 'Read/Write';
    const tagTab = `<div class="frow"><label for="mc-tn">Name</label><input class="inp mono" id="mc-tn" value="${esc(tag.name)}" readonly></div>
      <div class="frow"><label for="mc-td">Description</label><input class="inp" id="mc-td" value="${esc(tag.desc || '')}"${dis}></div>
      ${u.kv('Type', 'Base')}${u.kv('Data Type', 'MESSAGE')}${u.kv('Scope', esc(prog ? prog.name : S.p.controller.name))}
      <div class="frow"><label for="mc-ea">External Access</label><select class="inp" id="mc-ea"${ro || on() ? ' disabled' : ''}>${ACC.map(a => `<option${a === acc ? ' selected' : ''}>${a}</option>`).join('')}</select></div>`;
    const stat = `<div class="mstat" id="mc-st">${BITS.map(([b, l]) => `<span><span class="led" data-mb="${b}"></span>${l}</span>`).join('')}<span>Done Length: <span class="mono" data-mv="DN_LEN">0</span></span>
      <span><span class="led" data-mb="ER"></span>Error</span><span>Error Code: <span class="mono" data-mv="ERR"></span></span><span>Extended Error Code: <span class="mono" data-mv="EXERR"></span></span>
      <label class="ck" style="margin:0"><input type="checkbox" id="mc-to"> Timed Out</label><span class="wide">Error Text: <span data-mv="TEXT"></span></span></div>`;
    let timer = 0;
    const stop = () => { clearInterval(timer); timer = 0; };
    const read = el => ({ type: el.querySelector('#mc-ty').value, src: el.querySelector('#mc-src').value.trim(), n: Math.floor(+el.querySelector('#mc-n').value), dst: el.querySelector('#mc-dst').value.trim(), path: el.querySelector('#mc-path').value.trim(), cache: el.querySelector('#mc-cc').checked });
    const fail = (el, m) => { el.querySelector('#mc-e').textContent = m; return false; };
    function apply(el) {
      if (ro) return true;
      const v = read(el), wr = v.type === 'write', local = wr ? v.src : v.dst, remote = wr ? v.dst : v.src, lname = wr ? 'Source Element' : 'Destination Element', rname = wr ? 'Destination Element' : 'Source Element';
      if (!(v.n >= 1 && v.n <= 65535)) return fail(el, 'Number Of Elements: 1 to 65535.');
      if (!local) return fail(el, `${lname}: enter the tag in this controller.`);
      const ty = u.addrType(local);
      if (!ty) return fail(el, `${lname}: ${local} is not a tag or element of this project.`);
      if (!okType(ty)) return fail(el, `${lname}: a ${ty} cannot be sent. The supported data types are SINT, INT, DINT, LINT, REAL and structures.`);
      if (!remote) return fail(el, `${rname}: enter the tag in the other controller (a program tag as Program:<program>.<tag>).`);
      if (!REMOTE.test(remote)) return fail(el, `${rname}: ${remote} is not a tag name.`);
      if (E.MSG.path(v.path) === null || !v.path) return fail(el, 'Path: enter 1,<slot> (the backplane of the chassis) or THIS, or use Browse.');
      const desc = el.querySelector('#mc-td').value.trim(), ea = el.querySelector('#mc-ea').value;
      const same = JSON.stringify(tag.msg || null) === JSON.stringify(v) && desc === (tag.desc || '') && ea === acc;
      if (same) { fail(el, ''); return true; }
      u.edit(() => {
        tag.msg = v;
        if (desc) tag.desc = desc; else delete tag.desc;
        if (!on()) { if (ea !== 'Read/Write') tag.access = ea; else delete tag.access; }
      });
      // online: the controller takes the new configuration at once
      if (on() && A.ctl.setMsg) A.ctl.setMsg(tag.name, prog && S.p.tags.indexOf(tag) < 0 ? prog.name : null, v);
      fail(el, '');
      return true;
    }
    const el = u.dialog({ title: `Message Configuration - ${tag.name}`, size: 'md',
      body: u.tabbed([['conf', 'Configuration', conf], ['comm', 'Communication', comm], ['tag', 'Tag', tagTab]], 'conf') + stat + '<div class="errtx" id="mc-e"></div>',
      onClose: stop,
      buttons: [{ l: 'Cancel', run: () => { stop(); } }, { l: 'Apply', run: x => { apply(x); return false; } }, { l: 'OK', pri: true, run: x => { if (apply(x) === false) return false; stop(); } }],
      mount: m => {
        u.bindTabs(m);
        const q = s => m.querySelector(s);
        // the local element (Destination of a read, Source of a write) offers this controller's tags
        const hint = () => {
          const wr = q('#mc-ty').value === 'write';
          q('#mc-src').setAttribute('list', wr ? 'mc-loc' : ''); q('#mc-dst').setAttribute('list', wr ? '' : 'mc-loc');
          q('#mc-src').placeholder = wr ? 'a tag in this controller' : 'a tag in the target controller';
          q('#mc-dst').placeholder = wr ? 'a tag in the target controller' : 'a tag in this controller';
          q('#mc-hint').textContent = wr ? 'Write: the Source Element is in this controller, the Destination Element in the controller of the Path.' : 'Read: the Source Element is in the controller of the Path, the Destination Element in this controller.';
        };
        q('#mc-ty').onchange = hint; hint();
        const pd = () => { q('#mc-pd').textContent = pathText(q('#mc-path').value); };
        q('#mc-path').addEventListener('input', pd); pd();
        // Browse: the controllers of the chassis (and THIS)
        q('#mc-br').onclick = () => {
          const bl = q('#mc-bl'), ch = A.chassis, own = A.ctl && A.ctl.slot;
          if (!bl.hidden) { bl.hidden = true; return; }
          const rows = [['THIS', 'This controller']].concat(ch ? ch.controllers().filter(x => x.slot !== own).map(x => [`1,${x.slot}`, `[${x.slot}] ${x.name || 'Controller'}`]) : []);
          bl.innerHTML = rows.map(([p, l]) => `<div class="row" data-mcp="${esc(p)}"><div class="grow"><div class="nm">${esc(l)}</div><div class="sub mono">${esc(p)}</div></div></div>`).join('');
          bl.hidden = false;
        };
        q('#mc-bl').addEventListener('click', ev => { const r = ev.target.closest('[data-mcp]'); if (!r) return; q('#mc-path').value = r.dataset.mcp; q('#mc-bl').hidden = true; pd(); });
        q('#mc-nt').onclick = () => { stop(); const d = read(m); u.newTag({ after: () => msgConfig(tag.name, prog ? prog.name : '', d) }); };
        // the Status section: the bits of the tag (online: of the controller, live)
        const prg = prog && S.p.tags.indexOf(tag) < 0 ? prog.name : undefined;
        const show = () => {
          if (!document.body.contains(m)) { stop(); return; }
          const live = on(), o = live ? A.ctl.read(tag.name, prg) : tag.value;
          const f = (o && o.FLAGS) | 0, g = k => (o && o[k]) | 0;
          m.querySelectorAll('[data-mb]').forEach(x => x.classList.toggle('on', !!((f >> E.MSG.BIT[x.dataset.mb]) & 1)));
          q('[data-mv="DN_LEN"]').textContent = g('DN_LEN');
          q('[data-mv="ERR"]').textContent = (f >> 4) & 1 ? hex(g('ERR')) : '';
          q('[data-mv="EXERR"]').textContent = (f >> 4) & 1 && g('EXERR') ? hex(g('EXERR')) : '';
          q('[data-mv="TEXT"]').textContent = (f >> 4) & 1 ? E.MSG.text(g('ERR'), g('EXERR')) : '';
          const to = q('#mc-to'); if (document.activeElement !== to) to.checked = !!((f >> 8) & 1);
          to.disabled = !live;
        };
        q('#mc-to').onchange = ev => { if (on()) A.ctl.write(`${tag.name}.TO`, ev.target.checked ? 1 : 0, prg, true); };
        show();
        // live while online only (no work while the dialog shows an offline tag)
        if (on()) timer = setInterval(show, 250);
      } });
    return el;
  }
  A.msgConfig = msgConfig;
})();
