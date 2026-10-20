# Savepoint / handoff

Read this first when you resume work, whether you're a person or an AI agent.

## Savepoint
| | |
|---|---|
| **Version** | **v2.0.0 (stable), released and verified 2026-10-20** (owner: GO on "Release v2.0.0"). Release run #63 from `main` (`473e1c4`): 3 assets; APK cert `27:5F:A5:15:06:CC:46…` (checked); Pages `version.json` = 2.0.0 (checked). v1.6.0 was the previous stable. v2.0.1 accuracy fixes merged (PR #36, Beta); v2.1 lessons with live checklists (Beta). Next on the roadmap: v2.2 publishing (Play Store, name, logo) — needs the owner's GO. |
| **Tags** | `v2.0.0`, `v1.6.0`, `v1.5.0`, `v1.4.1`, `v1.4.0`, `v1.4.0-beta.2`, `v1.4.0-beta.1`, `v1.2.1`, `v1.2.0`, `v1.1.0`. `v1.0.0` (`c22dbbd`) has no GitHub release (optional). |
| **Date** | 2026-10-20 |
| **Branch** | `main` is the **default branch** and holds released code; releases are built from `main`. Work happens on feature branches merged through PRs. The old branch `ccr-d652d569-13gxij` was deleted by the owner. |
| **Tests** | `npm test`: 428 passed (v2.1.1 full audit). |
| **Pull requests** | #1–#33 merged (#3 closed). #23–#26 = v1.6 hardware (rack, I/O Configuration, address styles, cabinet); #27 = free draw like SimuRelay; #28 = Release v1.6.0; #29 = v1.6.1 fixes; #30 = v1.7 HMI; #31 = v1.8; #32–#33 = v2.0 parts A–C. |
| **Downloads** | GitHub Releases: `PLC-Trainer-X.Y.Z-portable.exe`, `PLC-Trainer-X.Y.Z-android.apk`, `PLC-Trainer-X.Y.Z-web.zip` (portable only since v1.4.1). Web app: https://ronanski.github.io/aio-icms-tool/ (Stable) and `/beta/` (Beta = `main`). |
| **Android signing** | Release key in repo secrets (alias `plctrainer`, cert SHA-256 starts `27:5F:A5:15:06:CC:46`). The v1.2.0 APK was checked to carry this certificate. The owner keeps the keystore and passwords offline; they are not in the repo. |
| **Live preview** | claude.ai artifact (private): https://claude.ai/artifact/KHjQzV4oxhUo1vuYfxDKXi |

## How to resume in 2 minutes
1. `git checkout <branch>` and `git pull`
2. Open `index.html` in Chrome, or run `npm start` and go to http://localhost:8080
3. Run `npm install`, then `npm test`. All 164 checks should pass before you change anything.
4. Read `CONTRIBUTING.md` (rules), then `PROGRESS.md` (what's next).

## Architecture in one screen
```
index.html ── loads scripts in order ──►
  ui.js        UI.modal/form/menu/toast, longPress (touch → context menu), drawer
  store.js     Store: many projects in localStorage (index + one key each)
  plc.js       PLCcore: parse(addr), INSTR table, Engine (data table, scan, forces)
  ladder.js    Ladder: parseRung/serialize (ASCII), SVG render, editor ops, DataTable
  circuit.js   Circuit: DEFS (component library), solve() net solver
  workspace.js Workspace: wiring canvas (pan/zoom, wires, meter, props)
  hmi.js       HMI: designer + runtime
  freedraw.js  FreeDraw: free-draw diagram (symbols on a grid, wired terminal to terminal, synced as `sch` wires)
  schematic.js Schematic: rail/rung control-circuit editor; symbols map to Wiring devices by tag; generated wires carry `sch: true`
  examples.js  Examples: EX (projects) + LESSONS
  update.js    Updater: GitHub Releases check, Stable/Beta channel, update bar, File → Updates…
  app.js       App: project state, open/save projects, 20 ms tick loop, views + LAYOUTS (multi-pane grid, gutters), status bar, PWA install
sw.js          service worker (offline cache; bump CACHE every release)
manifest.webmanifest + icons/   install metadata
.github/workflows/  ci.yml (tests on PRs), pages.yml (deploy main to Pages), release.yml (build .exe/.apk/zip; publish release)
scripts/copy-web.sh  the one list of files that make up the app
desktop/  Electron wrapper → Windows installer   mobile/  Capacitor wrapper → Android APK
```
**Each tick (20 ms):** `Circuit.solve()` reads `ctx.plcOut` and writes `ctx.plcIn`, then `App.plc.scan(dt)` runs the ladder and updates `physOut`. Rendering runs separately on `requestAnimationFrame` and touches only the visible views.

**Solver idea:** terminals are nodes. Wires and closed contacts merge them into nets (union-find). Sources put potentials on nets (`L1/L2/L3/N/PE`, `DC+:<id>/DC-:<id>`). Loads read the voltage between two terminals. Conflicting potentials on one net mean a short: the solver trips the lowest-rank breaker that clears it. The solver loops up to 16 times until no contact changes state.

**Adding a component:** call `def('type', {...})` in `circuit.js` with `terms`, then whichever of `conduct`, `sources`, `evaluate`, `tick`, `onPart`, `draw` and `status` it needs. The palette and saving pick it up automatically. Devices are operated in the Wiring (`onPart`), there is no separate panel view since v1.4.

**Momentary presses:** `App.hold(key, up)` is called on press and returns the release function; `up()` runs no earlier than `App.holdTicks` (2) ticks after the press, so a quick tap is always scanned. `App.operate(c, part)` presses a device part, logs it and returns that release. `App.later(n, fn)` runs `fn` after n ticks.

**Event log:** `App.log(kind, msg)` with kind `alarm | mode | force | operator | system`. Session only (not saved). `App.events()` returns a copy.

**Loading projects:** `App.buildProject(data)` checks every field (ids, hex colors, numbers, states, HMI objects via `HMI.clean`) and throws on non-project data; `App.openNew` builds first, then switches project. `Circuit.normalize` keeps only saved values with the default's type and resets `transient` state (e.g. `pressed`).

**Updates:** `Updater.check(manual)` fetches the repo's releases when online (auto: 3 s after start, then every 6 h, min 1 h apart), `pick()` chooses the newest for the channel (`plc-trainer.channel`: stable | beta; beta includes pre-releases) newer than `App.VERSION`. Windows downloads `Setup-*.exe`, Android `*-android.apk`, web reloads. Tests mock `api.github.com`. A release is a beta when its version has a suffix (`1.3.0-beta.1`); `release.yml` then publishes a pre-release.

**View menu / custom layout:** `App.layout = 'custom'` uses `customPanes` (ticked windows, saved in `plc-trainer.customPanes`); `App.toggleWindow(v)` ticks/unticks. **Junctions:** type `jct` (hidden from the palette, one terminal `J`, `dir: 0`); `splitWire(w, pt)` in `workspace.js` puts one on a wire and splits it, keeping the route by passing the route corners as `pts`. Bend handles (`.bend`) are drawn in the overlay for the selected wire. **Events** are saved in the project (`events`, last 200).

**Floating windows:** `App.floatView(v, geom)` moves the view's `<section>` into a `.float-win` on `<body>`; `App.dockView(v)` moves it back into `#main`. `visibleViews()` returns the docked grid views, `shownViews()` adds floating ones (render/update loop). Saved in `plc-trainer.floats`; docked automatically on narrow screens. **Device size:** `props.size` (0.4–3) scales the drawing (`scale()` in the transform) and `tpos()`.

**Schematic:** `App.project.schematic = { L, N, rungs: [{ elems: [{k, tag} | {k:'br', legs}] }] }`. `Schematic.sync()` removes wires with `sch: true`, creates missing devices (`ensureDevice`) and wires each valid rung between the rails (`SK` maps a symbol kind to device type and terminals; relay contacts get pole 1/2). Empty branch legs stay open. Rails default to the 24 V PSU, else the 1-phase supply, else L1/N.

**Contact variants:** a component def can have `variant: { n, of: { NO: type, NC: type } }`. `Circuit.retype(c, type, circ)` changes the type and moves wires by terminal position.

**Adding an instruction:** add an entry to `INSTR` in `plc.js` and a case in `Engine.el()`. The toolbar in `ladder.js` (the `TB` list) and `ICON` handle the button.

## Open decisions (owner: Ronan)
1. **Clean-up (owner, optional)**: remove the `ccr-…` rule in Settings → Environments → github-pages (the branch itself is already deleted).
2. **License**: proprietary (to sell) or MIT (open source)?
3. **Product name and logo** without trademarked words.
4. **Next target** after going live: circuit-lesson auto-check, or a Play Store listing.

## Start of next session (read first)
- **v2.1.1 full audit (2026-10-20, Beta):** 40 findings fixed. Key changes to know: `Circuit` has `feeders()` (bridges in the wire-net graph, replaces one rebuild per device in `feedsOverload`), `earthLeak()` returns every leak (RCD fed-through test with the RCD tripped), the VFD is a `sources` device with `breaker: 0.2`, a short before all protection trips nothing. `buildProject` cleans `conn.ctl` via `cleanCtl()`; ids < 1e9 and unique; `App.leaveProject(go)` asks before leaving an unsaved project. index.html hand-over takes only projects (merged by id, newer wins, the other kept as `<id>-web`), current and channel. Schematic: `checks()` shares terminal use across rungs/power/free, `renameTag`, `refs`, orphan schAuto cleanup; Workspace `setLabel`; HMI `sample(now)` from the app tick, PIN to enter Studio when any object is secured. PLC: periodic dt, forces stored by address, `verify(rungs, fileNums)`.
- **v2.0.0 stable + v2.0.1 + v2.1 (2026-10-20):** owner GO on the three roadmap rows. v2.0.0 released and verified; v2.0.1 (PR #36: DIV rounding, file-length Verify, earth leakage, alarms in the first 4 s) and v2.1 (lesson goals) on Beta only. Lesson goals: `goals: [{say, ok(G)}]` in `js/examples.js` (`GOALS`), checked in order every 250 ms by `checkGoals()` in `js/app.js` for the tracked lesson (`goals = {id, done, t0}`, set when a lesson is opened or its example loaded); `App.goalApi()` gives G (dev, of, mode, read, project, ev, rack, rungs, screen). Lesson 12's `interlocked()` unions wires and every pair a device can close in some state, then checks that cutting a contactor's 21-22 un-feeds the other coil.
- **GO STABLE v1.6.0 given (2026-10-20).** Steps: release PR (version bump to 1.6.0 in package.json, desktop/, mobile/, `VERSION` in js/app.js, `VER` in sw.js; CHANGELOG `[1.6.0]`) → merge when CI is green → run Release workflow on `main` (publish) → verify release assets, APK cert and Pages `version.json`. If a step is not done when you resume, finish it.
- **v1.6.0 released and verified (2026-10-20):** release run #53; 3 assets; APK cert `27:5F:A5:15:06:CC:46…` (checked); Pages `version.json` = 1.6.0. v1.6.1 (address style in Verify/event log/HMI tags) merged (PR #29).
- **Owner (2026-10-20): "go proceed v1.6.1 fixes up to 2.0.0 -- provide update here after".** Work through the roadmap, merge each part into `main` (Beta). No stable release without a new "GO STABLE".
- **v1.7 HMI**: `project.hmi = {objects, screens:[{id:'s1',name}], res:'t7', pin:'1234', seq}` cleaned by `HMI.cleanAll`; objects carry `scr` (screen) and `vis` (visibility tag); `sec: 'yes'` needs log-in (runtime `user` flag, never saved). Types added: rect, ellipse, line, trend (samples every 200 ms in `hist`), image (data URL ≤ 300 kB, `IMG` regex), nav (`target`), login. `HMI.RES` terminal sizes; `dims()`; `HMI.goto(id)`, `HMI.screen()`; Studio side panel `renderScreenProps()`. `HMI.mini()` returns `{key, svg, w, h}` for the current screen; `hmiterm` scales it.
- **v1.8**: `plc.js` adds OSR/OSF, MCR (`runRungs` makes a zone false; `r._mcr`), JSR/SBR/RET (`setProgram(main, subs)`, depth ≤ 8, `_ret`), COP/FLL (`kind: 'file'` `#N7:n`), SQO (R6 file: EN DN ER LEN POS). I/O files are 40 words: 0–7 digital per slot, analog `I:s.c` = word `PLCcore.ANA(s,c)` = 8+4s+c. Ladder program files: `project.ladder.files = [{n, name, rungs}]`, `curFile`, `Ladder.openFile/newFile`, `App.loadProgram()`. Analog signals are looked up by net, not solved: `ctx.anaSrc[key] = mA` (ltx), `ctx.anaOut[key] = V` (mao2), `ctx.vfdOut[key] = Hz` (vfd → motor `state.k`), `ctx.tanks[label] = lvl`. Defs `mai4`, `mao2` (`analog: 'I'|'O'`, `chans`), `ltx`, `vfd`. `js/i18n.js` (`I18N`): dictionary EN→TL applied to text nodes and title/placeholder/aria-label by a MutationObserver; `plc-trainer.lang`.
- **v2.0 part A (tags, organizer)**: `project.tags = [{name, type: BOOL|INT|TIMER|COUNTER|ALIAS, addr, desc}]`; `PLCcore.setTags(list)` (called by `App.loadProgram`) makes `parse()` resolve a tag name (and `.DN`, `.ACC`… members) to its address, keeping `norm` = the tag name (so programs store names). `PLCcore.allocTag`, `tagNameOk`, `tagOf`. Program files can have `period` (ms) → `Engine.setProgram(main, subs, periodic)` runs them every period. UI: `App.tagsDialog()`, `App.organizer()`.
- **v2.0 part B (online)**: `project.conn = {mode: 'simple'|'real', ctl}`; `ctl` is a JSON snapshot (`progSnap()`: main, files, tags). Runtime `App.conn = {online, testing, same}`. `App.loadProgram()` runs the project when same/testing (or Simple), else `loadSnap(ctl)` (the controller's own rungs, prepared with its tags). Online in PROG writes edits to `ctl` at once. `App.goOnline/download/upload/compare/diff/testEdits/assembleEdits/cancelEdits`, `App.setConnMode`. UI: Online group in the Ladder toolbar, `[data-lbanner]` banner, `[data-conn]` chip in the status bar.
- **v2.0 part C (network)**: `project.net = {remotes:[{node 2–8, name, data[32]}], links:[{dir: consume|produce, node, remote, local, n}]}` (`cleanNet`). `App.plc.net` hook (has/read/write) for MSG (`engine.msgs`, 0.1 s delay, R6 EN/DN/ER). Links copied after each RUN scan in the tick. `App.network()` dialog (Who Active, remote words, links). **v2.0 roadmap items are all done on `main`; no release yet.**
- **Waiting on the owner:** they will point out a spacing issue on two IEC screenshots sent 2026-10-20 (star-delta and three motors examples). Fix it in v1.6.1.
- **v1.6 part 1 (modular PLC rack)**, owner: "Continue v 1.6". New devices in `js/circuit.js` (cat *PLC Rack*): `mpsu` (rack PSU, `unique: 'psu'`), `mcpu` (CPU, slot 0, `unique: 'cpu'` shared with the compact `plc`), `mdi8`, `mdi8ac`, `mdo8`, `mdo8t` (`slot: true`, `props.slot` '1'–'7'; `Circuit.create` picks the next free slot). `Circuit.rack(circ)` → `{ctl, cpu, slots, pw}`; `Circuit.ioMap(circ)` → I/O words for the data table and status bar. Each tick `App.ctx.rack`, `ctx.plcInX[slot]` (cards write it in `evaluate`) and `ctx.plcOutX` (from `plc.physOutX`). Engine: `SIZES.I/O` = 8 words; `physInX`/`physOutX` for slots 1–7; forces per word (`_fm[file][word]`). Merged (PR #23).
- **v1.6 part 2 (I/O Configuration)**: project field `io = { slots: { '1': 'mdi8', … } }` (cleaned by `Circuit.cleanIo`, saved by `App.serialize`). `Circuit.rack(circ, io)` adds `conf` and `bad` (mismatches); `cardOn` needs `conf[slot] === c.type`. `App.setMode('RUN')` refuses a mismatch; the tick faults RUN → PROG on a mismatch. Dialog `App.ioConfig()` (Ladder toolbar *I/O Config*, Wiring right-click on CPU/cards). Verify: `plc.ioCheck = a => Circuit.ioCheck(a, circ, io)` (rack: errors; compact: warnings). Merged (PR #24).
- **v1.6 part 3 (address styles)**: project field `addr` ('file' | 'bitbyte' | 'basic', `Circuit.STYLES`). `Circuit.addrBook(circ, io, style)` numbers the I/O points of `ioMap` (inputs and outputs separately): `fmt(norm)` for display, `toFile(text)` reads any style. `App.fmt`, `App.addrIn`, `App.setAddrStyle`, `App.addrChanged()` (rebuilt on project load, circuit change, I/O config change; `App.ctx.fmt` for the card labels). Only bit operands are styled; ASCII rung text, HMI tags and Verify messages stay file-based. Merged (PR #25).
- **v1.6 part 4 (2D cabinet)**: defs `encl`, `door` (`layer: 'back'`, `plate: true`, size via `dims` from `props.w/h`), `duct` (`layer: 'rail'`), `hmiterm` (24 VDC on P/M; draws `ctx.hmiMini()` = `HMI.mini()` SVG of the screen; parts `h:<objectId>` → `ctx.hmiPress` = `HMI.pressId`). `Circuit.dims` now honours `dims().h`. Workspace: new `.backs` layer under `.rails`; dragging a plate moves the devices whose middle is on it (`mounted()`) and the bends of wires between them. Example `EX.cabinet`. Merged (PR #26).
- **Free draw like SimuRelay** (owner's "GO dito", 2026-10-20): `freedraw.js` builds a shell once (`.fd-wrap` = `.fd-lib` icon grid + `.fd-canvas` with `.fd-host` svg and `.fd-zoom`); the svg re-renders inside `.fd-host`. Library state `plc-trainer.fdLib` {open, grp}. New kinds: potential points (`look: 'pot'`, `pot: L1|L2|L3|N|PE|+|-`, wired by `potKey()` to the supply terminal, `POT` order prefers supply3/supply1 over the generator), wire pieces (`look: 'wire'`, `jct: true`: every end maps to the junction's J; link arrows share a tag), `conv` (psu24), `gen` (new device `gen3`), `batt` (new device `battery`), `mdc` (new device `motordc`). `K.auto` kinds get a tag without a dialog; `freeSpot()` places new symbols. `FD.values` + `valueOf()`; `FD.zoom`, `FD.toggleLib`. Toolbar in `schematic.js` free-group (Play clicks the Edit/Operate seg). The owner was sent IEC screenshots (star-delta, three motors) to point out a spacing issue: wait for that.
- **v1.6 is feature-complete; next step is the owner's "GO STABLE v1.6.0"** (bump versions, CHANGELOG `[1.6.0]`, Release workflow). Not tested on a real phone or Windows PC.
- **Owner's standing rule (2026-10-19, this session): "Sabi ko pag merge matic na. Go stable lng ang magiging permission ko dito saka kung ano next update."** Merge own PRs when CI is green without asking; only a Stable release needs "GO STABLE".
- **Session 2026-10-19 (latest):** v1.5 parts 1–3 and **stable v1.5.0**. Free-draw Electrical Diagram (`js/freedraw.js`): grid, 90 IEC 60617 symbols in 10 groups, junctions, bends, Text, PE earth, Copy (D), To front/back, Type ⇄. New devices in `js/circuit.js`: fuse 2P/3P/4P, MCB 3P/4P, disconnector 3P/4P, fuse disconnector, RCD 2P/4P, RCBO, off-delay timer, impulse relay, latching relay, contactor 4P, push button NO+NC, foot switch, thermostat, flow switch, photoelectric sensor, heater, hour meter, voltmeter, 1-phase, two-speed and Dahlander motors.
- Owner's diagram direction: the Electrical Diagram looks like the ladder ("dapat kapareha ng ladder diagram, parang AutoCAD o simulator"): one line colour, live paths light up; PH wire colours only on the real wires in the Wiring. Power and control circuits in proportion (`PP` pole spacing, `PE_` stretched to the N rail in `renderPowerV`).
- Owner wants symbols from my own IEC knowledge, not only from their screenshots ("reference lang un").
- **Next:** v1.6 hardware (v1.5.0 release already verified): modular PLC rack (PSU, CPU, I/O cards), I/O Configuration, addressing styles (Basic / file / bit-byte), 2D cabinet. Also open: editable terminal numbers, owner's feedback from real devices, owner's v1.2 bug list.
- v1.2.1 (PR #5) was merged and released with the owner's "GO merge PR #5 then GO STABLE v1.2.1" (2026-10-19).
- v1.3 parts 1–3 merged (PR #6, #7, #8; #8 with "GO merge PR #8 then GO v1.4 part 1"). Not released: needs a GO BETA or GO STABLE.
- v1.4 part 1 (flat wiring look, DIN rail + snap, terminal block, motor protection breaker, wire labels) merged (PR #9) with "GO merge PR #9 then GO v1.4 part 2".
- v1.4 part 2 (4 workspaces, Panel & Plant removed, Help menu with Lessons) merged (PR #10) with "GO merge PR #10 then GO v1.4 part 3".
- v1.4 part 3 (6-terminal motor, timer dial, star-delta and forward/reverse examples) merged (PR #11). v1.4 is complete.
- **v1.4.0-beta.1** published as a pre-release with the owner's "GO merge PR #11 then GO BETA v1.4.0-beta.1". Apps on the Beta channel are offered it. Not tested on a real phone or Windows PC yet: ask the owner for beta feedback.
- v1.4 part 4 (IEC Electrical Diagram with power circuit, PH wire colours, three-motor example) merged (PR #13) and released as **v1.4.0-beta.2** with the owner's "GO merge PR #13 then GO BETA v1.4.0-beta.2". Not tested on a real phone or Windows PC yet: ask the owner for beta feedback. Wire colours were confirmed by the owner ("STANDARD SA PINAS"): L1 red, L2 yellow, L3 blue, N white, PE green. Schematic data now has `power: {src, main[], feeders[{elems}]}`.
- **v1.5 part 1** (free-draw Electrical Diagram in `js/freedraw.js`, new parts): merged (PR #18), live on Beta (`beta.8e8b511`).
- **v1.5 part 2** (free-draw junctions and bends, contactor 4P, impulse relay): PR, auto-merged when CI is green. Next: v1.5 hardware (modular PLC rack, I/O configuration, addressing styles, cabinet). Free-draw data: `schematic.free = {items:[{id,k,tag,x,y,r}], wires:[{id,a:'d1:13',b}], seq}`; symbol kinds in `FreeDraw.KINDS`.
- **v1.4.1** merged (PR #16) and released stable with "GO STABLE v1.4.1": in-app updates without downloads (hosted Stable/Beta copies on Pages, `version.json`, build ids, shells that open the hosted app, project hand-over `#import=`), Windows portable only, star-delta in the diagram power section, wire routing. The new update path only reaches people once they run a shell built from this code (one last manual download), and the Stable copy only gets the new updater code at the next stable release (v1.4.1).
- **GO STABLE v1.4.0** given. Steps: PR #15 (version 1.4.0 + CHANGELOG [1.4.0]) → merge when CI is green → Release workflow from `main` → verify the release, assets, APK cert and Pages. If a step is not done when you resume, finish it.
- Next after v1.4.0: owner's feedback from real devices, then v1.5 hardware (modular PLC, I/O config, addressing styles, cabinet).
- Owner's direction (EduVolt-style screenshots): simple flat hardware graphics; operate devices in the Wiring; only 4 workspaces: Ladder, Wiring, Electrical Diagram, HMI. Copy the look, never brand names or logos (the app is public on Pages and Releases). Next after v1.4: release (GO BETA / GO STABLE), then v1.5 hardware. Roadmap in `PROGRESS.md`.
- The owner said they found **more gaps and bugs in v1.2** but has not listed them yet. Ask for that list.
- PR #4 (docs) was merged.
- **Standing rule from the owner (2026-10-19): "automerge and save progress kada tapos ng task. no need for my permission. ang permission lang ay pag stable release na."** So: merge your own PRs into `main` as soon as CI is green (that publishes them to the Beta channel), and update this savepoint and `PROGRESS.md` after every task, without asking. A **stable release still needs "GO STABLE vX.Y.Z"** in the owner's message. Answer in Taglish, in one short table.

## Last session summary (audit, PR #2, release v1.2.0)
- Post-release audit of v1.2.0 done; findings and the proposed v1.2.1 list are in `PROGRESS.md` (two High items reproduced: ladder drag stays armed, Workbench toolbars cut off). Nothing fixed yet: waiting for the owner's GO.
- Released v1.2.0 from `main` with all four assets; the APK is release-signed with the new key (verified against the keystore fingerprint).
- `main` is now the default branch. The `github-pages` environment needed a deployment rule for `main` (Settings → Environments → github-pages); after that, Pages deployed v1.2.0.
- First release run failed in the Android job ("keystore password was incorrect", empty alias) because only the base64 secret was set; it published nothing. After the owner added the other three secrets, the rerun passed.
- v1.1.0 Android users must uninstall once (v1.1.0 was debug-signed); from v1.2.0 on, updates install over the app.
- Full audit of the repo (3 reviewers: PLC engine, circuit solver, app/CI). Findings and the roadmap agreed with the owner are in `PROGRESS.md`.
- Owner approved "GO v1.1.1" and "GO v1.2.0". Both are implemented in PR #2; nothing merged or released.
- Root cause of "HMI buttons don't work": a tap shorter than one 20 ms scan was never seen (always on phones). Fixed with `App.hold`.
- Not changed on purpose: forced outputs still act in PROG (as on real controllers); only the status text was corrected.
- Not tested on a real phone, the Windows `.exe` or the Android `.apk`.
- Owner asked for in-app updates (Stable/Beta channels, works offline) and approved adding it to PR #2: notify + download for `.exe` and `.apk`; beta releases are pre-releases seen by apps on the Beta channel. Done in `js/update.js` + `release.yml`. Not tested against the real GitHub API from an installed app yet (tests use a mock).
- Android updates install over the old app only with the signing key in secrets (open decision 5).

## Previous session summary (v1.1.0)
- Workbench layout (ladder + wiring + panel at once); mobile and touch layout; PWA (installable, offline); multiple projects; lesson Check my work.
- Fixed: pending saves are flushed before switching projects; long-press after re-render.
- Added CI and GitHub Pages workflows. They run once `main` exists.
- Created `main` at v1.0.0 and opened PR #1 for v1.1.0.
- Tests grew from 26 to 45 checks, all passing.
- Added Windows (.exe) and Android (.apk) builds plus the Release workflow; the PWA is unchanged.
- Merged PR #1 into `main` and ran the Release workflow on `main` to publish v1.1.0.
