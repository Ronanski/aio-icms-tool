/* MT PLC Studio: tasks and programs, as in Studio 5000 Logix Designer (1756-PM005 Tasks, Programs and Routines; v37
   help: Tasks, programs, and routines). New Program and the Unscheduled Programs folder, Task Properties with its
   Program Schedule tab. app.js hands its helpers over: E.TasksUI(api) returns the dialogs and the organizer items.
   A program no task schedules is kept in a task of type 'unscheduled' (like the fault and power-up handlers): the
   controller never runs it. */
(function () {
  'use strict';
  const E = window.MTPS;
  E.TasksUI = function (A) {
    const { S, esc, U, kv, tabbed, bindTabs, dialog, confirmDlg, toast, edit, editable, offline, render, allProgs, HANDLERS } = A;
    const UNS = 'unscheduled';
    // the tasks of the Tasks folder (not the handlers, not the unscheduled programs)
    const userTasks = () => S.p.tasks.filter(t => !HANDLERS[t.type]);
    const unsTask = make => {
      let t = S.p.tasks.find(x => x.type === UNS);
      if (!t && make) { t = { name: HANDLERS[UNS], type: UNS, programs: [] }; S.p.tasks.push(t); }
      return t || null;
    };
    const progOf = name => allProgs().find(g => g.name === name);
    const taskOf = g => S.p.tasks.find(t => t.programs.includes(g));
    // ControlLogix and Logix Emulate: up to 1000 programs in each task (help: Create a program)
    const MAXPROGS = 1000;
    const offlineOnly = what => { if (offline()) return true; toast(`${what}: go offline first (this version changes tasks and programs offline only).`, 'err'); return false; };
    const openFolder = k => { const c = new Set(S.prefs.collapsed); c.delete(k); S.prefs.collapsed = [...c]; A.savePrefs(); };
    // the routines must stay reachable: the open program changes when it is moved or deleted
    const fixCur = () => {
      if (allProgs().some(g => g.name === S.prog && g.routines.length)) return;
      const g = allProgs().find(x => x.routines.length);
      if (g) { S.prog = g.name; S.routine = g.main || g.routines[0].name; S.sel = null; S.selRung = 0; }
    };

    /* New Program (help v37: New program dialog box settings; Create a program): Name, Description, Parent, Use as
       Folder, Schedule In, Inhibit Program. Parent and Use as Folder belong to the Logical Organizer, which this app
       does not have, so they stay <none> and cleared. Schedule In lists the tasks and the two handlers; <none> leaves
       the program in Unscheduled Programs. A program put in a handler that has one makes that one unscheduled. */
    function newProgram(into) {
      if (!editable() || !offlineOnly('New Program')) return;
      const names = new Set(allProgs().map(g => U(g.name)));
      let n = 'Program1';
      for (let k = 1; names.has(U(n)); ) n = 'Program' + ++k;
      const opts = [['', '<none>'], ...userTasks().map(t => [t.name, t.name]), ['@fault', HANDLERS.fault], ['@powerup', HANDLERS.powerup]];
      const pre = into == null ? '' : into;
      dialog({ title: 'New Program', size: 'md', focus: true,
        body: `<div class="frow"><label for="np-n">Name</label><input class="inp" id="np-n" value="${esc(n)}" maxlength="40" autocomplete="off" spellcheck="false" autocapitalize="off"></div>
          <div class="frow"><label for="np-d">Description</label><textarea class="inp" id="np-d" rows="2" maxlength="512"></textarea></div>
          <div class="frow"><label for="np-par">Parent</label><select class="inp" id="np-par" disabled><option>&lt;none&gt;</option></select></div>
          <label class="ck"><input type="checkbox" id="np-fold" disabled> Use as Folder</label>
          <div class="frow"><label for="np-s">Schedule In</label><select class="inp" id="np-s">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === pre ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <label class="ck"><input type="checkbox" id="np-i"> Inhibit Program</label>
          <p class="help">A program runs only when a task schedules it: with Schedule In &lt;none&gt; it goes to Unscheduled Programs and does not run. Add a routine to it with New Routine; its first routine becomes the main routine.</p><div class="errtx" id="np-e"></div>`,
        buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
          const v = el.querySelector('#np-n').value.trim(), d = el.querySelector('#np-d').value.trim(), s = el.querySelector('#np-s').value, inh = el.querySelector('#np-i').checked;
          const er = t => { el.querySelector('#np-e').textContent = t; return false; };
          if (!E.validName(v)) return er('Name: letters, digits and _, starting with a letter or _, up to 40 characters, no two _ in a row and no _ at the end.');
          if (names.has(U(v))) return er(`A program named ${v} already exists.`);
          const T = s && s[0] !== '@' ? S.p.tasks.find(t => t.name === s) : null;
          if (T && T.programs.length >= MAXPROGS) return er(`The task ${T.name} already schedules ${MAXPROGS} programs.`);
          edit(() => {
            const g = { name: v, tags: [], routines: [] };
            if (d) g.desc = d;
            if (inh) g.inhibit = true;
            if (s[0] === '@') {
              const kind = s.slice(1);
              let h = S.p.tasks.find(t => t.type === kind);
              if (!h) { h = { name: HANDLERS[kind], type: kind, programs: [] }; S.p.tasks.push(h); }
              // help: any existing program becomes unscheduled if a program is created in one of the two handlers
              if (h.programs.length) unsTask(true).programs.push(...h.programs.splice(0));
              h.programs.push(g);
              openFolder(kind === 'fault' ? 'cfh' : 'puh'); openFolder('ctl');
            } else if (T) { T.programs.push(g); openFolder('task:' + T.name); openFolder('tasks'); }
            else { unsTask(true).programs.push(g); openFolder('unsch'); openFolder('tasks'); }
            S.orgSel = 'prog:' + v;
            fixCur();
          });
          toast(`Program ${v} added${s ? ` to ${s[0] === '@' ? HANDLERS[s.slice(1)] : s}` : ' to Unscheduled Programs'}. Add a routine with New Routine.`, 'ok');
        } }] });
    }
    /* Delete a program (help: Delete a program): offline, from the organizer, with a Yes / No confirmation; its
       routines and tags go with it. The project keeps at least one routine to open. */
    function deleteProgram(name) {
      const g = progOf(name);
      if (!g || !editable() || !offlineOnly('Delete Program')) return;
      if (g.routines.length && !allProgs().some(x => x !== g && x.routines.length)) { toast('The project needs at least one routine: this is the last program with routines.', 'err'); return; }
      confirmDlg('Delete Program', `Delete the program <b>${esc(name)}</b>, its routines and its tags?`, 'Yes', () => {
        edit(() => {
          const T = taskOf(g); T.programs.splice(T.programs.indexOf(g), 1);
          S.tabs = S.tabs.filter(k => !k.startsWith(name + '/'));
          fixCur();
        });
      }, true);
    }

    /* Task Properties (help v37: Edit task properties): General (Name, Description), Configuration, Program Schedule
       (Unscheduled and Scheduled lists, Add -> / <- Remove, the order with the arrows: programs run top to bottom;
       help: Schedule a program/phase, Unschedule a program/phase, Change the order of program execution), Monitor. */
    function taskProps(name, tab) {
      const T = S.p.tasks.find(x => x.name === name); if (!T) return;
      const ctl = A.ctl, can = editable() && offline(), dis = editable() ? '' : ' disabled', on = S.online && ctl.M;
      const general = `<div class="frow"><label>Name</label><input class="inp" id="tp-n" value="${esc(T.name)}" maxlength="40"${offline() ? '' : ' disabled'}></div>
        <div class="frow"><label>Description</label><textarea class="inp" id="tp-d" rows="3" maxlength="512"${dis}>${esc(T.desc || '')}</textarea></div>`;
      const conf = `<div class="frow"><label>Type</label><select class="inp" id="tp-t" disabled><option>Continuous</option></select></div>
        <div class="frow"><label>Watchdog (ms)</label><input class="inp" id="tp-w" type="number" min="1" max="2000000" value="${T.watchdog || 500}"${dis}></div>
        <label class="ck"><input type="checkbox" id="tp-o"${T.noOutputs ? ' checked' : ''}${dis}> Disable automatic output processing to reduce task overhead</label>
        <label class="ck"><input type="checkbox" id="tp-i"${T.inhibit ? ' checked' : ''}${dis}> Inhibit task</label>`;
      // the schedule being edited: program names, Scheduled in order
      const st = { s: T.programs.map(g => g.name), u: ((unsTask() || {}).programs || []).map(g => g.name), pick: null };
      const list = (k, arr) => arr.map(n => `<div class="row${st.pick && st.pick[0] === k && st.pick[1] === n ? ' on' : ''}" data-tps="${k}:${esc(n)}"><span class="nm">${esc(n)}</span></div>`).join('') || '<div class="empty">None</div>';
      const schedHTML = () => `<div class="tpsch"><div><div class="grp">Unscheduled</div><div class="tplist" id="tp-ul">${list('u', st.u)}</div></div>
        <div class="tpbtn"><button class="btn" id="tp-add"${can ? '' : ' disabled'}>Add -&gt;</button><button class="btn" id="tp-rem"${can ? '' : ' disabled'}>&lt;- Remove</button></div>
        <div><div class="grp">Scheduled</div><div class="tplist" id="tp-sl">${list('s', st.s)}</div>
        <div class="brow"><button class="btn" id="tp-up" title="Move up" aria-label="Move up"${can ? '' : ' disabled'}>&uarr;</button><button class="btn" id="tp-dn" title="Move down" aria-label="Move down"${can ? '' : ' disabled'}>&darr;</button></div></div></div>
        <p class="help">The programs run in the order of the Scheduled list. A program in Unscheduled does not run.${can ? '' : ' Go offline to change the schedule.'}</p>`;
      const mon = on ? `${kv('Last scan time', ((ctl.scanUs || 0) / 1000).toFixed(3) + ' ms')}${kv('Maximum scan time', ((ctl.maxScanUs || 0) / 1000).toFixed(3) + ' ms')}${kv('Scan period', ctl.period + ' ms')}${kv('Scans', ctl.scans)}<div class="brow"><button class="btn" id="tp-r">Reset</button></div>`
        : '<p class="help">Offline. Go online to see the scan times.</p>';
      dialog({ title: 'Task Properties - ' + T.name, size: 'md',
        body: tabbed([['gen', 'General', general], ['cfg', 'Configuration', conf], ['sch', 'Program Schedule', `<div id="tp-sch">${schedHTML()}</div>`], ['mon', 'Monitor', mon]], tab || 'gen'),
        buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
          if (!editable()) return;
          const n = el.querySelector('#tp-n').value.trim(), d = el.querySelector('#tp-d').value.trim(), w = Math.max(1, +el.querySelector('#tp-w').value || 500);
          if (!E.validName(n)) { toast('Name: letters, digits and _ (up to 40).', 'err'); return false; }
          if (U(n) !== U(T.name) && S.p.tasks.some(t => t !== T && U(t.name) === U(n))) { toast(`A task named ${n} already exists.`, 'err'); return false; }
          const no = el.querySelector('#tp-o').checked, inh = el.querySelector('#tp-i').checked;
          const sched = st.s.join('\n') !== T.programs.map(g => g.name).join('\n');
          if (n === T.name && d === (T.desc || '') && w === (T.watchdog || 500) && no === !!T.noOutputs && inh === !!T.inhibit && !sched) return;
          edit(() => {
            T.name = n; if (d) T.desc = d; else delete T.desc; T.watchdog = w; if (no) T.noOutputs = true; else delete T.noOutputs; if (inh) T.inhibit = true; else delete T.inhibit;
            if (sched && can) {
              const all = T.programs.concat((unsTask() || { programs: [] }).programs), byName = x => all.find(g => g.name === x);
              const keep = st.s.map(byName).filter(Boolean), out = st.u.map(byName).filter(g => g && !keep.includes(g));
              T.programs = keep;
              if (out.length || unsTask()) unsTask(true).programs = out;
              fixCur();
            }
          });
        } }],
        mount: el => {
          bindTabs(el);
          const r = el.querySelector('#tp-r'); if (r) r.onclick = () => { A.ctl.maxScanUs = 0; taskProps(T.name, 'mon'); };
          const box = el.querySelector('#tp-sch');
          box.addEventListener('click', ev => {
            const row = ev.target.closest('[data-tps]');
            if (row) { const i = row.dataset.tps.indexOf(':'); st.pick = [row.dataset.tps.slice(0, i), row.dataset.tps.slice(i + 1)]; box.innerHTML = schedHTML(); return; }
            const b = ev.target.closest('button'); if (!b || b.disabled || !st.pick) return;
            const [k, nm] = st.pick, mv = (from, to) => { from.splice(from.indexOf(nm), 1); to.push(nm); };
            if (b.id === 'tp-add' && k === 'u') { if (st.s.length >= MAXPROGS) { toast(`A task schedules at most ${MAXPROGS} programs.`, 'err'); return; } mv(st.u, st.s); st.pick = ['s', nm]; }
            else if (b.id === 'tp-rem' && k === 's') { mv(st.s, st.u); st.pick = ['u', nm]; }
            else if ((b.id === 'tp-up' || b.id === 'tp-dn') && k === 's') {
              const i = st.s.indexOf(nm), j = i + (b.id === 'tp-up' ? -1 : 1);
              if (j < 0 || j >= st.s.length) return;
              [st.s[i], st.s[j]] = [st.s[j], st.s[i]];
            } else return;
            box.innerHTML = schedHTML();
          });
        } });
    }

    /* the organizer's right-click items this file adds (Studio 5000: Tasks folder > New Task; a task > Add > New
       Program; Unscheduled Programs > New Program; a program or a task > Delete) */
    function orgMore(key, items) {
      const off = !editable() || !offline();
      if (key === 'unsch') items.push({ l: 'New Program…', run: () => newProgram(''), dis: off });
      else if (key.startsWith('task:')) items.unshift({ l: 'New Program…', run: () => newProgram(key.slice(5)), dis: off });
      else if (key.startsWith('prog:')) { const i = items.findIndex(x => x !== '-' && x.l === 'Properties…'); items.splice(i < 0 ? items.length : i, 0, { l: 'Delete', i: 'trash', run: () => deleteProgram(key.slice(5)), dis: off }, '-'); }
    }
    // the Unscheduled Programs folder of the organizer (inside Tasks, after the tasks)
    const unscheduled = () => ((unsTask() || {}).programs || []);
    return { newProgram, deleteProgram, taskProps, orgMore, unscheduled, userTasks };
  };
})();
