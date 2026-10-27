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

    /* the task settings of New Task and of Task Properties > Configuration (1756-PM005, Create a Task / Create a
       Periodic Task: Type, Trigger, Tag, Execute Task If No Event Occurs Within, Period, Priority, Watchdog, Disable
       Automatic Output Processing To Reduce Task Overhead, Inhibit Task). Ranges (help v37: Task Properties -
       Configuration): Period 0.1 to 2,000,000 ms, Priority 1 to 15, Watchdog 1 to 2,000,000 ms. A field that does not
       belong to the type is hidden. Only one task can be continuous. */
    const TYPES = [['continuous', 'Continuous'], ['periodic', 'Periodic'], ['event', 'Event']];
    // the triggers of an event task; this controller has no motion axes and no consumed-tag events
    const TRIGGERS = [['axisreg1', 'Axis Registration 1'], ['axisreg2', 'Axis Registration 2'], ['axiswatch', 'Axis Watch'], ['consumed', 'Consumed Tag'],
      ['event', 'EVENT Instruction Only'], ['input', 'Module Input Data State Change'], ['motion', 'Motion Group Execution']];
    const TRIG_ON = new Set(['event', 'input']);
    const TMAX = 2000000;
    // the input tags of the input modules (Module Input Data State Change)
    const inTags = () => ((S.p.rack || {}).modules || []).filter(m => { const d = (E.MODULES || {})[m.type]; return d && (d.kind === 'di' || d.kind === 'ai'); }).map(m => `Local:${m.slot}:I`);
    // dis: the fields that can change online (Watchdog, the two check boxes); dt: the type and its timing (offline)
    function cfgHTML(T, p, dis, dt) {
      const type = T.type || 'continuous', cont = S.p.tasks.some(t => t !== T && t.type === 'continuous'), trig = T.trigger || 'event';
      const sel = (v, w) => (v === w ? ' selected' : ''), tags = inTags(), tag = trig === 'input' ? T.tag || tags[0] || '' : '';
      const vis = (types, html) => `<div class="tpf" data-tpf="${types}"${types.split(' ').includes(type) ? '' : ' style="display:none"'}>${html}</div>`;
      return `<div class="frow"><label for="${p}-t">Type</label><select class="inp" id="${p}-t"${dt}>${TYPES.map(([v, l]) => `<option value="${v}"${sel(v, type)}${v === 'continuous' && cont ? ' disabled' : ''}>${l}</option>`).join('')}</select></div>
        ${vis('event', `<div class="frow"><label for="${p}-tr">Trigger</label><select class="inp" id="${p}-tr"${dt}>${TRIGGERS.map(([v, l]) => `<option value="${v}"${sel(v, trig)}${TRIG_ON.has(v) ? '' : ' disabled'}>${l}</option>`).join('')}</select></div>
        <div class="frow"><label for="${p}-tg">Tag</label><select class="inp" id="${p}-tg"${dt || (trig === 'input' ? '' : ' disabled')}><option value=""${sel('', tag)}>&lt;none&gt;</option>${tags.map(t => `<option${sel(t, tag)}>${t}</option>`).join('')}</select></div>
        <label class="ck"><input type="checkbox" id="${p}-to"${T.timeoutOn ? ' checked' : ''}${dt}> Execute Task If No Event Occurs Within</label>
        <div class="frow"><label for="${p}-tv">Timeout (ms)</label><input class="inp" id="${p}-tv" type="number" min="0.1" max="${TMAX}" step="any" value="${T.timeout || 10}"${dt || (T.timeoutOn ? '' : ' disabled')}></div>`)}
        ${vis('periodic', `<div class="frow"><label for="${p}-p">Period (ms)</label><input class="inp" id="${p}-p" type="number" min="0.1" max="${TMAX}" step="any" value="${T.period || 10}"${dt}></div>`)}
        ${vis('periodic event', `<div class="frow"><label for="${p}-pr">Priority</label><input class="inp" id="${p}-pr" type="number" min="1" max="15" step="1" value="${T.priority == null ? 10 : T.priority}"${dt}></div><p class="help tphint">(Lower Number Yields Higher Priority)</p>`)}
        <div class="frow"><label for="${p}-w">Watchdog (ms)</label><input class="inp" id="${p}-w" type="number" min="1" max="${TMAX}" value="${T.watchdog || 500}"${dis}></div>
        <label class="ck"><input type="checkbox" id="${p}-o"${T.noOutputs ? ' checked' : ''}${dis}> Disable Automatic Output Processing To Reduce Task Overhead</label>
        <label class="ck"><input type="checkbox" id="${p}-i"${T.inhibit ? ' checked' : ''}${dis}> Inhibit Task</label>`;
    }
    // the fields follow the type and the trigger
    function cfgBind(el, p) {
      const t = el.querySelector(`#${p}-t`), tr = el.querySelector(`#${p}-tr`), tg = el.querySelector(`#${p}-tg`), to = el.querySelector(`#${p}-to`), tv = el.querySelector(`#${p}-tv`);
      const sync = () => {
        el.querySelectorAll('[data-tpf]').forEach(x => { x.style.display = x.dataset.tpf.split(' ').includes(t.value) ? '' : 'none'; });
        if (t.disabled) return;
        tg.disabled = tr.value !== 'input'; tv.disabled = !to.checked;
        // EVENT Instruction Only has no tag (<none>); Module Input Data State Change takes the first input module
        if (tg.disabled) tg.value = ''; else if (!tg.value && tg.options.length > 1) tg.selectedIndex = 1;
      };
      [t, tr, to].forEach(x => x.addEventListener('change', sync));
    }
    // the settings typed in, checked: { v } or { err }
    function cfgRead(el, p, self) {
      const q = s => el.querySelector(`#${p}-${s}`), num = s => Number(q(s).value);
      const v = { type: q('t').value, watchdog: num('w'), noOutputs: q('o').checked, inhibit: q('i').checked };
      if (!(Number.isInteger(v.watchdog) && v.watchdog >= 1 && v.watchdog <= TMAX)) return { err: 'Watchdog: a whole number of ms from 1 to 2,000,000.' };
      if (v.type === 'continuous' && S.p.tasks.some(t => t.type === 'continuous' && t !== self)) return { err: 'Only one task can be continuous.' };
      if (v.type !== 'continuous') {
        v.priority = num('pr');
        if (!(Number.isInteger(v.priority) && v.priority >= 1 && v.priority <= 15)) return { err: 'Priority: a whole number from 1 (highest) to 15 (lowest).' };
      }
      if (v.type === 'periodic') {
        v.period = num('p');
        if (!(v.period >= 0.1 && v.period <= TMAX)) return { err: 'Period: 0.1 to 2,000,000 ms.' };
      }
      if (v.type === 'event') {
        v.trigger = q('tr').value; v.timeoutOn = q('to').checked; v.timeout = num('tv');
        if (!TRIG_ON.has(v.trigger)) return { err: 'This trigger is not supported by this controller.' };
        if (v.trigger === 'input') { v.tag = q('tg').value; if (!v.tag) return { err: 'Module Input Data State Change needs an input module in the I/O Configuration.' }; }
        if (v.timeoutOn && !(v.timeout >= 0.1 && v.timeout <= TMAX)) return { err: 'Execute Task If No Event Occurs Within: 0.1 to 2,000,000 ms.' };
      }
      return { v };
    }
    // the settings into the task object of the project (only the fields of its type)
    function cfgApply(T, v) {
      T.type = v.type; T.watchdog = v.watchdog;
      ['period', 'priority', 'trigger', 'tag', 'timeout', 'timeoutOn', 'noOutputs', 'inhibit'].forEach(k => { delete T[k]; });
      if (v.noOutputs) T.noOutputs = true;
      if (v.inhibit) T.inhibit = true;
      if (v.type !== 'continuous') T.priority = v.priority;
      if (v.type === 'periodic') T.period = v.period;
      if (v.type === 'event') {
        T.trigger = v.trigger; if (v.tag) T.tag = v.tag;
        if (v.timeoutOn) T.timeoutOn = true;
        if (v.timeout >= 0.1) T.timeout = v.timeout;
      }
    }
    const sameCfg = (T, v) => { const b = Object.assign({ type: 'continuous', watchdog: 500 }, T), t = Object.assign({}, b); cfgApply(t, v); return ['type', 'watchdog', 'period', 'priority', 'trigger', 'tag', 'timeout', 'timeoutOn', 'noOutputs', 'inhibit'].every(k => t[k] === b[k]); };

    /* New Task (1756-PM005, Create a Task: right-click the Tasks folder > New Task): Name, Description and the task
       settings. A controller has at most 32 tasks. */
    const MAXTASKS = 32;
    function newTask() {
      if (!editable() || !offlineOnly('New Task')) return;
      if (userTasks().length >= MAXTASKS) { toast(`The controller supports ${MAXTASKS} tasks.`, 'err'); return; }
      const names = new Set(S.p.tasks.map(t => U(t.name)));
      let n = 'Task1';
      for (let k = 1; names.has(U(n)); ) n = 'Task' + ++k;
      dialog({ title: 'New Task', size: 'md', focus: true,
        body: `<div class="frow"><label for="nt-n">Name</label><input class="inp" id="nt-n" value="${esc(n)}" maxlength="40" autocomplete="off" spellcheck="false" autocapitalize="off"></div>
          <div class="frow"><label for="nt-d">Description</label><textarea class="inp" id="nt-d" rows="2" maxlength="512"></textarea></div>
          ${cfgHTML({ type: 'periodic' }, 'nt', '', '')}
          <p class="help">A periodic task runs its programs every Period; an event task runs when its trigger happens. A task of a higher priority (a lower number) interrupts one of a lower priority; the continuous task has the lowest. Schedule programs in it with New Program or Task Properties &gt; Program Schedule.</p><div class="errtx" id="nt-e"></div>`,
        buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
          const v = el.querySelector('#nt-n').value.trim(), d = el.querySelector('#nt-d').value.trim();
          const er = t => { el.querySelector('#nt-e').textContent = t; return false; };
          if (!E.validName(v)) return er('Name: letters, digits and _, starting with a letter or _, up to 40 characters, no two _ in a row and no _ at the end.');
          if (names.has(U(v))) return er(`A task named ${v} already exists.`);
          const c = cfgRead(el, 'nt', null); if (c.err) return er(c.err);
          edit(() => {
            const T = { name: v, type: c.v.type, programs: [] };
            if (d) T.desc = d;
            cfgApply(T, c.v);
            // a new task goes after the last task (before the handlers and the unscheduled programs)
            const last = S.p.tasks.reduce((k, t, i) => (HANDLERS[t.type] ? k : i), -1);
            S.p.tasks.splice(last + 1, 0, T);
            openFolder('tasks'); S.orgSel = 'task:' + v;
          });
          toast(`Task ${v} added. Schedule a program in it with New Program.`, 'ok');
        } }],
        mount: el => cfgBind(el, 'nt') });
    }
    /* Delete a task (help: Delete a task): offline; a task that still schedules programs is not deleted (Studio 5000:
       Failed to delete task; unschedule its programs first). */
    function deleteTask(name) {
      const T = S.p.tasks.find(t => t.name === name);
      if (!T || HANDLERS[T.type] || !editable() || !offlineOnly('Delete Task')) return;
      if (T.programs.length) { toast(`Failed to delete task ${name}: it schedules ${T.programs.length} program${T.programs.length > 1 ? 's' : ''}. Unschedule them first (Task Properties > Program Schedule).`, 'err'); return; }
      confirmDlg('Delete Task', `Delete the task <b>${esc(name)}</b>?`, 'Yes', () => {
        edit(() => { S.p.tasks.splice(S.p.tasks.indexOf(T), 1); if (S.orgSel === 'task:' + name) S.orgSel = 'tasks'; });
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
      const conf = cfgHTML(T, 'tp', dis, can ? '' : ' disabled') + (can ? '' : '<p class="help">Go offline to change the type, the period, the priority or the trigger.</p>');
      // the schedule being edited: program names, Scheduled in order
      const st = { s: T.programs.map(g => g.name), u: ((unsTask() || {}).programs || []).map(g => g.name), pick: null };
      const list = (k, arr) => arr.map(n => `<div class="row${st.pick && st.pick[0] === k && st.pick[1] === n ? ' on' : ''}" data-tps="${k}:${esc(n)}"><span class="nm">${esc(n)}</span></div>`).join('') || '<div class="empty">None</div>';
      const schedHTML = () => `<div class="tpsch"><div><div class="grp">Unscheduled</div><div class="tplist" id="tp-ul">${list('u', st.u)}</div></div>
        <div class="tpbtn"><button class="btn" id="tp-add"${can ? '' : ' disabled'}>Add -&gt;</button><button class="btn" id="tp-rem"${can ? '' : ' disabled'}>&lt;- Remove</button></div>
        <div><div class="grp">Scheduled</div><div class="tplist" id="tp-sl">${list('s', st.s)}</div>
        <div class="brow"><button class="btn" id="tp-up" title="Move up" aria-label="Move up"${can ? '' : ' disabled'}>&uarr;</button><button class="btn" id="tp-dn" title="Move down" aria-label="Move down"${can ? '' : ' disabled'}>&darr;</button></div></div></div>
        <p class="help">The programs run in the order of the Scheduled list. A program in Unscheduled does not run.${can ? '' : ' Go offline to change the schedule.'}</p>`;
      /* Monitor (1756-PM005, Manually Check for Overlaps): Scan Times (Elapsed Time) Max and Last, Interval Times
         (Elapsed Time Between Triggers) Max and Min, Task Overlap Count, Reset. Online only; the fields are empty offline. */
      const RT = on && ctl.M.tasks.find(t => t.name === T.name), ms = us => (RT && us != null ? (us / 1000).toFixed(3) : '');
      const iv = x => (RT && x != null ? (+x).toFixed(3) : ''), out = (id, v) => `<input class="inp tpmon" id="${id}" value="${v}" readonly tabindex="-1"> ms`;
      const mon = `<div class="grp">Scan Times (Elapsed Time):</div>
        <div class="frow"><label for="tp-mx">Max</label><span>${out('tp-mx', ms(RT && RT.maxUs))}</span></div>
        <div class="frow"><label for="tp-ls">Last</label><span>${out('tp-ls', ms(RT && RT.us))}</span></div>
        <div class="brow"><button class="btn" id="tp-r"${RT ? '' : ' disabled'}>Reset</button></div>
        <div class="grp">Interval Times (Elapsed Time Between Triggers):</div>
        <div class="frow"><label for="tp-ix">Max</label><span>${out('tp-ix', iv(RT && RT.ivMax))}</span></div>
        <div class="frow"><label for="tp-in">Min</label><span>${out('tp-in', iv(RT && RT.ivMin))}</span></div>
        <div class="frow"><label for="tp-ov">Task Overlap Count</label><input class="inp tpmon" id="tp-ov" value="${RT ? RT.overlap || 0 : ''}" readonly tabindex="-1"></div>
        <p class="help">${RT ? 'The values when this tab opened. Reset clears the maximum scan time, the interval times and the overlap count.' : 'Go online to see the scan times, the interval times and the overlap count.'}</p>`;
      dialog({ title: 'Task Properties - ' + T.name, size: 'md',
        body: tabbed([['gen', 'General', general], ['cfg', 'Configuration', conf], ['sch', 'Program / Phase Schedule', `<div id="tp-sch">${schedHTML()}</div>`], ['mon', 'Monitor', mon]], tab || 'gen'),
        buttons: [{ l: 'Cancel' }, { l: 'OK', pri: true, run: el => {
          if (!editable()) return;
          const n = el.querySelector('#tp-n').value.trim(), d = el.querySelector('#tp-d').value.trim();
          if (!E.validName(n)) { toast('Name: letters, digits and _ (up to 40).', 'err'); return false; }
          if (U(n) !== U(T.name) && S.p.tasks.some(t => t !== T && U(t.name) === U(n))) { toast(`A task named ${n} already exists.`, 'err'); return false; }
          const c = cfgRead(el, 'tp', T); if (c.err) { toast(c.err, 'err'); return false; }
          const sched = st.s.join('\n') !== T.programs.map(g => g.name).join('\n');
          if (n === T.name && d === (T.desc || '') && sameCfg(T, c.v) && !sched) return;
          edit(() => {
            T.name = n; if (d) T.desc = d; else delete T.desc;
            cfgApply(T, c.v);
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
          cfgBind(el, 'tp');
          const r = el.querySelector('#tp-r');
          if (r) r.onclick = () => { const t = A.ctl.M && A.ctl.M.tasks.find(x => x.name === T.name); A.ctl.maxScanUs = 0; if (t) { t.maxUs = 0; t.ivMax = t.ivMin = null; t.overlap = 0; } taskProps(T.name, 'mon'); };
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
      if (key === 'tasks') items.push({ l: 'New Task…', run: newTask, dis: off });
      else if (key === 'unsch') items.push({ l: 'New Program…', run: () => newProgram(''), dis: off });
      else if (key.startsWith('task:')) {
        items.unshift({ l: 'New Program…', run: () => newProgram(key.slice(5)), dis: off });
        const i = items.findIndex(x => x !== '-' && x.l === 'Properties…');
        items.splice(i < 0 ? items.length : i, 0, { l: 'Delete', i: 'trash', run: () => deleteTask(key.slice(5)), dis: off || !!((S.p.tasks.find(t => t.name === key.slice(5)) || {}).programs || []).length }, '-');
      }
      else if (key.startsWith('prog:')) { const i = items.findIndex(x => x !== '-' && x.l === 'Properties…'); items.splice(i < 0 ? items.length : i, 0, { l: 'Delete', i: 'trash', run: () => deleteProgram(key.slice(5)), dis: off }, '-'); }
    }
    // the Unscheduled Programs folder of the organizer (inside Tasks, after the tasks)
    const unscheduled = () => ((unsTask() || {}).programs || []);
    // Quick View of a task
    const typeText = T => ({ continuous: 'Continuous task', periodic: 'Periodic task', event: 'Event task' })[T.type || 'continuous'] || T.type;
    const quick = T => T.type === 'periodic' ? [['Period', (T.period || 10) + ' ms'], ['Priority', T.priority == null ? 10 : T.priority]]
      : T.type === 'event' ? [['Trigger', (TRIGGERS.find(x => x[0] === (T.trigger || 'event')) || [0, ''])[1] + (T.trigger === 'input' ? ` (${T.tag})` : '')], ['Priority', T.priority == null ? 10 : T.priority]] : [];
    return { typeText, quick, newProgram, deleteProgram, newTask, deleteTask, taskProps, orgMore, unscheduled, userTasks };
  };
})();
