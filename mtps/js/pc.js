/* MT PLC Studio: produced and consumed tags (Logix 5000 Controllers Produced and Consumed Tags, 1756-PM011N; Logix
   Emulate LGEM5K-GR016M chapter 10): the Produced / Consumed Tag Connection dialogs of New Tag and Tag Properties, the
   producing controller as a module of the I/O Configuration, its Module Properties. The engine (engine.js) verifies
   the tags (pcBuild) and the chassis moves the data at the RPI. UI only: app.js hands in its helpers (X). */
(function (root) {
  'use strict';
  const MTPS = root.MTPS || (root.MTPS = {});
  MTPS.PCUI = function (X) {
    const { S, E, U, esc, kv } = X;
    const RPI = [0.196, 536870.911];
    const ctls = () => (S.p.rack.ctls || []);
    const led = (on, t) => `<span class="pcled"><span class="led${on ? ' g' : ''}"></span>${esc(t)}</span>`;
    // the Type of a tag (v37 help: New Tag dialog, Type: Base, Alias, Produced, Consumed)
    const kindOf = t => (t.alias ? 'alias' : t.prod ? 'produced' : t.cons ? 'consumed' : 'base');
    const typeOpts = t => [['base', 'Base'], ['alias', 'Alias'], ['produced', 'Produced'], ['consumed', 'Consumed']].map(([v, l]) => `<option value="${v}"${kindOf(t) === v ? ' selected' : ''}>${l}</option>`).join('');
    const summary = (k, pc) => (k === 'produced' ? `Max Consumers: ${pc.prod.max}` : k === 'consumed' ? (pc.cons.producer ? `${pc.cons.producer}: ${pc.cons.remote || '?'}, RPI ${pc.cons.rpi} ms` : 'No producer: click Connection…') : '');
    /* the live state of a consumed tag in the controller (online): { conn, run, code } or null */
    const live = name => { const c = X.ctl(); return S.online && c.M && c.pcState ? c.pcState(name) : null; };
    /* Produced Tag Connection (PM011: Connection tab, Max Consumers 1 to 255; Send Data State Change Event to
       Consumer needs an IOT instruction; Status tab, Connection Status Included) and Consumed Tag Connection
       (Connection tab: Producer, Remote Data, Requested Packet Interval, Use Unicast Connection; Status tab:
       Connection Status Included, Data Type, Connected to Producer, Producer in Run Mode, online only) */
    function connDlg(k, pc, ty, name, done) {
      const prod = k === 'produced', c = pc.cons, list = ctls();
      const conn = prod
        ? `<div class="frow"><label for="pc-max">Max Consumers</label><input class="inp" id="pc-max" type="number" min="1" max="255" step="1" value="${pc.prod.max}"></div>
          <label class="ck"><input type="checkbox" id="pc-iot" disabled> Send Data State Change Event To Consumer</label>
          <p class="help">The event needs an IOT instruction, which this app does not have. Each consumer takes a connection of the controller.</p>`
        : `<div class="frow"><label for="pc-p">Producer</label><select class="inp" id="pc-p">${list.length ? list.map(x => `<option${U(x.name) === U(c.producer || '') ? ' selected' : ''}>${esc(x.name)}</option>`).join('') : '<option value=""></option>'}</select></div>
          ${list.length ? '' : '<p class="help" id="pc-none">The list is empty: add the producing controller to the I/O Configuration (New Module, PLC-CPU). A controller cannot consume its own data.</p>'}
          <div class="frow"><label for="pc-r">Remote Data</label><input class="inp mono" id="pc-r" value="${esc(c.remote || '')}" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="Tag name in the producer"${S.online ? ' disabled' : ''}></div>
          <div class="frow"><label for="pc-rpi">Requested Packet Interval (RPI)</label><span class="afor"><input class="inp" id="pc-rpi" type="number" min="${RPI[0]}" max="${RPI[1]}" step="any" value="${c.rpi}"><span class="muted">ms (${RPI[0]} - ${RPI[1]})</span></span></div>
          <label class="ck"><input type="checkbox" id="pc-uni"${c.uni === false ? '' : ' checked'}> Use Unicast Connection over EtherNet/IP</label>`;
      const st = !prod && name ? live(name) : null;
      const status = `${led(false, 'Connection Status Included')}<div class="frow"><label>Data Type</label><span class="mono">${esc(ty || '')}</span></div>
        ${prod ? '' : `${led(!!(st && st.conn), 'Connected to Producer' + (st && st.conn ? ': ' + (c.producer || '') : ''))}${led(!!(st && st.run), 'Producer in Run Mode')}
        <p class="help">${S.online ? (st && st.code ? `Connection fault ${esc(st.code)}.` : '') : 'These indicators work online.'} Connection status is included only when the first member of the data type is a CONNECTION_STATUS; this app has no CONNECTION_STATUS type.</p>`}`;
      X.over({ title: prod ? 'Produced Tag Connection' : 'Consumed Tag Connection', cls: 'pcdlg',
        body: `${X.tabbed([['conn', 'Connection', conn], ['st', 'Status', status]], 'conn')}<div class="errtx" id="pc-e"></div>`,
        mount: el => X.bindTabs(el),
        buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
          const err = m => { el.querySelector('#pc-e').textContent = m; return false; };
          if (prod) {
            const n = Number(el.querySelector('#pc-max').value);
            if (!(Number.isInteger(n) && n >= 1 && n <= 255)) return err('Max Consumers: a whole number from 1 to 255.');
            done({ prod: { max: n }, cons: pc.cons });
            return;
          }
          const p = el.querySelector('#pc-p').value, r = el.querySelector('#pc-r').value.trim(), rpi = Number(el.querySelector('#pc-rpi').value);
          if (!p) return err('Producer: select the controller that produces the data.');
          if (!E.validName(r)) return err('Remote Data: type the name of the produced tag in the producer.');
          if (!(rpi >= RPI[0] && rpi <= RPI[1])) return err(`Requested Packet Interval: ${RPI[0]} to ${RPI[1]} ms.`);
          const cons = { producer: p, remote: r, rpi };
          if (!el.querySelector('#pc-uni').checked) cons.uni = false;
          done({ prod: pc.prod, cons });
        } }] });
    }
    /* the New Tag / Tag Properties dialog: its Connection row, and what OK keeps (or the reason it cannot) */
    function tagHook(el, t0, sync) {
      const pc = { prod: Object.assign({ max: 1 }, t0.prod), cons: Object.assign({ producer: '', remote: '', rpi: 20 }, t0.cons) };
      const tk = el.querySelector('#tk'), row = el.querySelector('#tpc'), sm = el.querySelector('#tpcs'), ts = el.querySelector('#ts');
      const show = () => {
        const k = tk.value, on = k === 'produced' || k === 'consumed';
        row.hidden = !on; sm.textContent = summary(k, pc);
        // only controller-scoped tags can be shared (PM011, Create a produced tag / Create a consumed tag)
        if (on && !ts.disabled) { ts.value = ''; ts.dataset.pc = '1'; ts.disabled = true; } else if (!on && ts.dataset.pc) { delete ts.dataset.pc; ts.disabled = false; }
      };
      el.querySelector('#tpcb').onclick = () => connDlg(tk.value, pc, el.querySelector('#tt').value.trim(), t0.name, v => { Object.assign(pc, v); show(); if (sync) sync(); });
      tk.addEventListener('change', show);
      show();
      return {
        // fill t from the dialog; a text is the error
        read(t, scope) {
          const k = tk.value;
          if (k !== 'produced' && k !== 'consumed') return '';
          if (scope) return 'A produced or consumed tag must be a controller tag: set the Scope to the controller.';
          const was = kindOf(t0);
          if (S.online && (was !== k || JSON.stringify(k === 'produced' ? t0.prod : t0.cons) !== JSON.stringify(k === 'produced' ? pc.prod : pc.cons))) return 'A produced or consumed tag can be created or changed only offline: go offline first.';
          if (k === 'consumed' && !pc.cons.producer) return 'Consumed: click Connection… and select the Producer and the Remote Data.';
          if (k === 'produced') t.prod = { max: pc.prod.max }; else { t.cons = { producer: pc.cons.producer, remote: pc.cons.remote, rpi: pc.cons.rpi }; if (pc.cons.uni === false) t.cons.uni = false; }
          return '';
        },
      };
    }
    const tagRows = () => `<div class="frow" id="tpc" hidden><label>Connection</label><span class="afor"><button class="btn" id="tpcb" type="button">Connection…</button><span class="muted ell" id="tpcs"></span></span></div>`;

    /* ---------- the producing controller in the I/O Configuration (LGEM5K-GR016M: Make the producer an I/O module
       of the consumer: New Module, the emulated controller, its Name and Slot) ---------- */
    const peerRow = { t: 'PLC-CPU', cols: ['PLC-CPU', 'Emulated controller (producer of consumed tags)', 'MT PLC Studio', 'Controller'] };
    const usedName = (n, except) => S.p.rack.modules.some(m => U(m.name) === U(n)) || ctls().some(c => c !== except && U(c.name) === U(n)) || U(S.p.controller.name) === U(n);
    function newPeer(free, back) {
      const n0 = (() => { let k = free[0], n = 'PLC_' + k; while (usedName(n)) n = 'PLC_' + ++k; return n; })();
      X.dialog({ title: 'New Module', size: 'md', onClose: back ? () => setTimeout(back, 0) : null,
        body: `<div class="frow"><label>Type</label><span><span class="mono" id="nm-t">PLC-CPU</span> <span class="muted">Emulated controller</span></span></div>
          <div class="frow"><label>Vendor</label><span>MT PLC Studio</span></div>
          <div class="frow"><label>Parent</label><span>Local</span></div>
          <div class="frow"><label>Name</label><input class="inp" id="pcm-n" value="${esc(n0)}" autofocus autocomplete="off" spellcheck="false" autocapitalize="off"></div>
          <div class="frow"><label>Description</label><textarea class="inp" id="pcm-d" rows="2"></textarea></div>
          <div class="frow"><label>Slot</label><select class="inp" id="pcm-s">${free.map(s => `<option>${s}</option>`).join('')}</select></div>
          <p class="help">The controller that produces the tags this project consumes, in its slot of the chassis. Its Name is the producing controller's name.</p>
          <div class="errtx" id="pcm-e"></div>`,
        buttons: [{ l: 'Cancel', run: () => { if (back) setTimeout(back, 0); } }, { l: 'OK', pri: true, run: el => {
          const name = el.querySelector('#pcm-n').value.trim(), slot = +el.querySelector('#pcm-s').value, d = el.querySelector('#pcm-d').value.trim();
          if (!E.validName(name)) { el.querySelector('#pcm-e').textContent = 'Use letters, digits and _.'; return false; }
          if (usedName(name)) { el.querySelector('#pcm-e').textContent = 'A module with that name exists.'; return false; }
          const c = { slot, name }; if (d) c.desc = d;
          X.edit(() => { S.p.rack.ctls = ctls().concat(c); S.orgSel = 'pcm:' + slot; });
          X.toast(`Controller ${name} added in slot ${slot}: consumed tags can name it as their Producer.`);
          if (back) setTimeout(back, 0);
        } }] });
    }
    // the Connection state of the producer, as the consumer sees it online
    const peerState = slot => { const c = X.ctl(); return S.online && c.M && c.peerStatus ? c.peerStatus(slot) : null; };
    function peerProps(slot) {
      const c = ctls().find(x => x.slot === slot); if (!c) return;
      const st = peerState(slot), ed = !S.online;
      const users = S.p.tags.filter(t => t.cons && U(t.cons.producer) === U(c.name)).map(t => t.name);
      X.dialog({ title: `Module Properties: Local:${slot} (PLC-CPU 1.0)`, size: 'md',
        body: X.tabbed([['gen', 'General', `${kv('Type', 'PLC-CPU Emulated controller')}${kv('Vendor', 'MT PLC Studio')}${kv('Parent', 'Local')}
          <div class="frow"><label>Name</label><input class="inp" id="pcp-n" value="${esc(c.name)}"${ed ? '' : ' disabled'} autocomplete="off" spellcheck="false"></div>
          <div class="frow"><label>Description</label><textarea class="inp" id="pcp-d" rows="2"${ed ? '' : ' disabled'}>${esc(c.desc || '')}</textarea></div>${kv('Slot', String(slot))}
          ${kv('Consumed tags', esc(users.join(', ') || '<none>'))}`],
        ['con', 'Connection', st ? `${kv('Status', esc(st.state))}${st.code ? kv('Module Fault', `<span class="mono">(Code ${esc(st.code)})</span> ${esc(st.text)}`) : ''}` : '<p class="help">The connection status shows online.</p>']], st && st.code ? 'con' : 'gen') + '<div class="errtx" id="pcp-e"></div>',
        mount: el => X.bindTabs(el),
        buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
          if (!ed) return;
          const n = el.querySelector('#pcp-n').value.trim(), d = el.querySelector('#pcp-d').value.trim();
          if (!E.validName(n)) { el.querySelector('#pcp-e').textContent = 'Use letters, digits and _.'; return false; }
          if (U(n) !== U(c.name) && usedName(n, c)) { el.querySelector('#pcp-e').textContent = 'A module with that name exists.'; return false; }
          if (n === c.name && d === (c.desc || '')) return;
          // the consumed tags follow the producer's new name
          X.edit(() => { S.p.tags.forEach(t => { if (t.cons && U(t.cons.producer) === U(c.name)) t.cons = Object.assign({}, t.cons, { producer: n }); }); c.name = n; if (d) c.desc = d; else delete c.desc; });
        } }] });
    }
    function peerDelete(slot) {
      const c = ctls().find(x => x.slot === slot); if (!c) return;
      X.confirm('Delete Module', `Delete <b>[${slot}] PLC-CPU ${esc(c.name)}</b>? Consumed tags with this producer will show errors.`, 'Delete', () => X.edit(() => { S.p.rack.ctls = ctls().filter(x => x !== c); if (!S.p.rack.ctls.length) delete S.p.rack.ctls; }), true);
    }
    const treeLabel = c => `[${c.slot}] PLC-CPU ${c.name}`;
    const treeFlag = c => { const s = peerState(c.slot); return s && s.code ? '⚠' : ''; };

    /* ---------- Logic > Produced Tags (v37 help: "shows all tags produced by this controller. From the dialog box
       that appears, you can modify the maximum number of consumers that are allowed"). The columns are the app's. */
    function producedTags() {
      const list = S.p.tags.filter(t => t.prod), ed = !S.online;
      X.dialog({ title: 'Produced Tags', size: 'md',
        body: list.length ? `<table class="rltab pct"><thead><tr><th>Name</th><th>Data Type</th><th>Description</th><th>Max Consumers</th></tr></thead>
          <tbody>${list.map((t, k) => `<tr data-pct="${esc(t.name)}"><td class="mono">${esc(t.name)}</td><td class="mono">${esc(t.type + (E.dimText(t.dim) ? '[' + E.dimText(t.dim) + ']' : ''))}</td><td>${esc(t.desc || '')}</td>
            <td><input class="inp" type="number" min="1" max="255" step="1" data-pcmax="${k}" value="${t.prod.max == null ? 1 : t.prod.max}" aria-label="Max Consumers of ${esc(t.name)}"${ed ? '' : ' disabled'}></td></tr>`).join('')}</tbody></table>
          <p class="help">${ed ? 'Max Consumers: 1 to 255. Each consumer uses a connection of the controller.' : 'Go offline to change Max Consumers.'}</p><div class="errtx" id="pct-e"></div>`
          : '<p class="help">This controller produces no tags. In New Tag or Tag Properties, set Type to Produced.</p>',
        buttons: list.length && ed ? [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
          const v = [...el.querySelectorAll('[data-pcmax]')].map(i => Number(i.value));
          if (v.some(n => !(Number.isInteger(n) && n >= 1 && n <= 255))) { el.querySelector('#pct-e').textContent = 'Max Consumers: a whole number from 1 to 255.'; return false; }
          if (v.every((n, k) => n === (list[k].prod.max == null ? 1 : list[k].prod.max))) return;
          X.edit(() => list.forEach((t, k) => { const i = S.p.tags.indexOf(t); if (i >= 0) S.p.tags[i] = Object.assign({}, t, { prod: Object.assign({}, t.prod, { max: v[k] }) }); }));
        } }] : [{ l: 'Close', pri: true }] });
    }

    /* ---------- Logic > Map PLC/SLC Messages (v37 help: "map a tag from this controller to a PLC/SLC file"; the
       rules of 1756-RM094, Map Tags: only the file numbers messages use, controller tags only, not files 0, 1 and 2
       (the Output, Input and Status files of a PLC-5), arrays of INT (file N or B), DINT (L) or REAL (F)). The
       mapping is kept with the project in plcMap { files: [{ file, tag }], plc2 }. The layout (File Number, Tag
       Name, PLC 2 Mapping) and file numbers 3 to 999 are general knowledge, not quoted. */
    const MAPTY = { INT: 'N or B', DINT: 'L', REAL: 'F' };
    const mapErr = (file, tag) => {
      if (!/^\d+$/.test(String(file)) || +file < 3 || +file > 999) return `File Number ${file}: use 3 to 999 (files 0, 1 and 2 are the Output, Input and Status files of a PLC-5).`;
      const t = S.p.tags.find(x => U(x.name) === U(tag || ''));
      if (!t) return `'${tag}' is not a controller tag.`;
      if (t.alias || !MAPTY[U(t.type || '')] || !E.dimN(t.dim)) return `'${t.name}': map an array tag of INT, DINT or REAL.`;
      return '';
    };
    function mapPlc() {
      const m0 = S.p.plcMap || { files: [], plc2: '' }, ed = !S.online;
      const arrs = S.p.tags.filter(t => !t.alias && MAPTY[U(t.type || '')] && E.dimN(t.dim)).map(t => t.name);
      const row = (f, tag) => `<tr data-maprow="1"><td><input class="inp" type="number" min="3" max="999" data-mapf="1" value="${esc(f)}" aria-label="File Number"${ed ? '' : ' disabled'}></td>
        <td><input class="inp mono" data-mapt="1" value="${esc(tag)}" list="mapl" autocomplete="off" spellcheck="false" autocapitalize="off" aria-label="Tag Name"${ed ? '' : ' disabled'}></td>
        <td class="ck"><button class="ib" type="button" data-mapx="1" title="Delete Map" aria-label="Delete Map"${ed ? '' : ' disabled'}>${X.ic('trash')}</button></td></tr>`;
      X.dialog({ title: 'PLC/SLC Mapping', size: 'md',
        body: `<table class="rltab mapt"><thead><tr><th>File Number</th><th>Tag Name</th><th></th></tr></thead><tbody id="mapb">${m0.files.map(x => row(x.file, x.tag)).join('')}</tbody></table>
          ${ed ? '<button class="btn" type="button" id="mapadd">Add File</button>' : ''}<datalist id="mapl">${arrs.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
          <div class="frow"><label for="map2">PLC 2 Mapping</label><input class="inp mono" id="map2" value="${esc(m0.plc2 || '')}" list="mapl" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="Tag Name"${ed ? '' : ' disabled'}></div>
          <p class="help">Map only the file numbers that messages from a PLC-5 or SLC 500 use, each to a controller array tag: INT (file N or B), DINT (L) or REAL (F). This app has no MSG instruction: the map is kept with the project.</p><div class="errtx" id="map-e"></div>`,
        mount: el => {
          const b = el.querySelector('#mapb');
          if (el.querySelector('#mapadd')) el.querySelector('#mapadd').onclick = () => { const used = [...b.querySelectorAll('[data-mapf]')].map(i => +i.value); let n = 7; while (used.includes(n)) n++; b.insertAdjacentHTML('beforeend', row(n, '')); b.lastElementChild.querySelector('[data-mapt]').focus(); };
          b.addEventListener('click', e => { const x = e.target.closest('[data-mapx]'); if (x) x.closest('tr').remove(); });
        },
        buttons: ed ? [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
          const err = m => { el.querySelector('#map-e').textContent = m; return false; };
          const files = [...el.querySelectorAll('[data-maprow]')].map(r => ({ file: r.querySelector('[data-mapf]').value.trim(), tag: r.querySelector('[data-mapt]').value.trim() })).filter(x => x.file || x.tag);
          for (const x of files) { const e = mapErr(x.file, x.tag); if (e) return err(e); }
          const dup = files.find((x, k) => files.findIndex(y => +y.file === +x.file) !== k); if (dup) return err(`File Number ${dup.file} is mapped twice.`);
          const p2 = el.querySelector('#map2').value.trim();
          if (p2) { const t = S.p.tags.find(x => U(x.name) === U(p2)); if (!t || t.alias || !E.dimN(t.dim)) return err(`PLC 2 Mapping: '${p2}' is not a controller array tag.`); }
          const out = { files: files.map(x => ({ file: +x.file, tag: S.p.tags.find(t => U(t.name) === U(x.tag)).name })).sort((a, b) => a.file - b.file) };
          if (p2) out.plc2 = S.p.tags.find(x => U(x.name) === U(p2)).name;
          if (JSON.stringify(out) === JSON.stringify({ files: m0.files, ...(m0.plc2 ? { plc2: m0.plc2 } : {}) })) return;
          X.edit(() => { if (out.files.length || out.plc2) S.p.plcMap = out; else delete S.p.plcMap; });
          X.toast(out.files.length || out.plc2 ? `PLC/SLC mapping: ${out.files.map(x => `file ${x.file} → ${x.tag}`).concat(out.plc2 ? [`PLC 2 → ${out.plc2}`] : []).join(', ')}` : 'PLC/SLC mapping cleared');
        } }] : [{ l: 'Close', pri: true }] });
    }
    // the tag filter's Mapped (v37 help, Filter the tag list): a tag of the PLC/SLC mapping
    const mapped = t => { const m = S.p.plcMap; return !!(m && t && ((m.files || []).some(x => U(x.tag) === U(t.name)) || (m.plc2 && U(m.plc2) === U(t.name)))); };

    return { kindOf, typeOpts, tagRows, tagHook, connDlg, peerRow, newPeer, peerProps, peerDelete, treeLabel, treeFlag, ctls, producedTags, mapPlc, mapped };
  };
})(typeof window !== 'undefined' ? window : globalThis);
