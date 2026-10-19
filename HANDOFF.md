# Savepoint / handoff

Read this first when you resume work, whether you're a person or an AI agent.

## Savepoint
| | |
|---|---|
| **Version** | **v1.4.1 (stable)**: owner's "GO STABLE v1.4.1" (2026-10-19). Release PR sets 1.4.1 and CHANGELOG `[1.4.1]`; after merge the Release workflow runs from `main` and then starts `pages.yml`, so the hosted Stable copy (site root) moves to v1.4.1, the first stable with in-app updates. Check the release (portable .exe, .apk, web.zip) and https://ronanski.github.io/aio-icms-tool/version.json before calling it done. Beta = `/beta/` = `main` (live since PR #16). v1.4.0 was the previous stable. APK cert `27:5F:A5:15:06:CC:46…` on every release since v1.2.0. |
| **Tags** | `v1.4.0-beta.2`, `v1.4.0-beta.1`, `v1.2.1`, `v1.2.0` and `v1.1.0` created by the Release workflow (plus `v1.4.0` once the stable run publishes). `v1.0.0` (`c22dbbd`) has no GitHub release (optional). |
| **Date** | 2026-10-19 |
| **Branch** | `main` is the **default branch** and holds released code; releases are built from `main`. Work happens on feature branches merged through PRs. The old branch `ccr-d652d569-13gxij` was deleted by the owner. |
| **Tests** | `npm test`: 203 passed on `main`. |
| **Pull requests** | #1–#16 merged (#3 closed); #15 = Release v1.4.0; next = Release v1.4.1. |
| **Downloads** | v1.2.0 assets: `PLC-Trainer-Setup-1.2.0.exe`, `PLC-Trainer-1.2.0-portable.exe`, `PLC-Trainer-1.2.0-android.apk`, `PLC-Trainer-1.2.0-web.zip`. Web app live on GitHub Pages (https://ronanski.github.io/aio-icms-tool/, serves v1.2.0). |
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
- v1.2.1 (PR #5) was merged and released with the owner's "GO merge PR #5 then GO STABLE v1.2.1" (2026-10-19).
- v1.3 parts 1–3 merged (PR #6, #7, #8; #8 with "GO merge PR #8 then GO v1.4 part 1"). Not released: needs a GO BETA or GO STABLE.
- v1.4 part 1 (flat wiring look, DIN rail + snap, terminal block, motor protection breaker, wire labels) merged (PR #9) with "GO merge PR #9 then GO v1.4 part 2".
- v1.4 part 2 (4 workspaces, Panel & Plant removed, Help menu with Lessons) merged (PR #10) with "GO merge PR #10 then GO v1.4 part 3".
- v1.4 part 3 (6-terminal motor, timer dial, star-delta and forward/reverse examples) merged (PR #11). v1.4 is complete.
- **v1.4.0-beta.1** published as a pre-release with the owner's "GO merge PR #11 then GO BETA v1.4.0-beta.1". Apps on the Beta channel are offered it. Not tested on a real phone or Windows PC yet: ask the owner for beta feedback.
- v1.4 part 4 (IEC Electrical Diagram with power circuit, PH wire colours, three-motor example) merged (PR #13) and released as **v1.4.0-beta.2** with the owner's "GO merge PR #13 then GO BETA v1.4.0-beta.2". Not tested on a real phone or Windows PC yet: ask the owner for beta feedback. Wire colours were confirmed by the owner ("STANDARD SA PINAS"): L1 red, L2 yellow, L3 blue, N white, PE green. Schematic data now has `power: {src, main[], feeders[{elems}]}`.
- **v1.5 part 1** (free-draw Electrical Diagram in `js/freedraw.js`, new parts): PR #18, merged when CI is green (owner's standing auto-merge rule); then on Beta. Free-draw data: `schematic.free = {items:[{id,k,tag,x,y,r}], wires:[{id,a:'d1:13',b}], seq}`; symbol kinds in `FreeDraw.KINDS`.
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
