# Savepoint / handoff

Read this first when you resume work, whether you're a person or an AI agent.

## Savepoint
| | |
|---|---|
| **Version** | v1.1.0 released from `main` (merge commit `1755aee`, PR #1). Unreleased fixes and features wait in PR #2. |
| **Tags** | `v1.1.0` created on GitHub by the Release workflow. `v1.0.0` (`c22dbbd`) has no GitHub release (optional). |
| **Date** | 2026-10-18 |
| **Branch** | `main` holds released code. PR #2 comes from `claude/focused-archimedes-12aqro`: the audit fixes (planned as v1.1.1) and the QoL features (planned as v1.2.0). Version not bumped yet. |
| **Tests** | `npm test`: 96 passed, 0 failed on the PR branch (45 on `main`) |
| **Pull request** | #1 merged (v1.1.0). #2 open: https://github.com/Ronanski/aio-icms-tool/pull/2. Merge and release only with the owner's explicit authorization. |
| **Downloads** | GitHub Releases (Windows `.exe`, Android `.apk`, web zip) built by `release.yml`; web app on GitHub Pages |
| **Live preview** | claude.ai artifact (private): https://claude.ai/artifact/KHjQzV4oxhUo1vuYfxDKXi |

## How to resume in 2 minutes
1. `git checkout <branch>` and `git pull`
2. Open `index.html` in Chrome, or run `npm start` and go to http://localhost:8080
3. Run `npm install`, then `npm test`. All 45 checks should pass before you change anything.
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
  panel.js     PanelView: big operable devices
  hmi.js       HMI: designer + runtime
  examples.js  Examples: EX (projects) + LESSONS
  app.js       App: project state, open/save projects, 20 ms tick loop, views + LAYOUTS (multi-pane grid, gutters), status bar, PWA install
sw.js          service worker (offline cache; bump CACHE every release)
manifest.webmanifest + icons/   install metadata
.github/workflows/  ci.yml (tests on PRs), pages.yml (deploy main to Pages), release.yml (build .exe/.apk/zip; publish release)
scripts/copy-web.sh  the one list of files that make up the app
desktop/  Electron wrapper → Windows installer   mobile/  Capacitor wrapper → Android APK
```
**Each tick (20 ms):** `Circuit.solve()` reads `ctx.plcOut` and writes `ctx.plcIn`, then `App.plc.scan(dt)` runs the ladder and updates `physOut`. Rendering runs separately on `requestAnimationFrame` and touches only the visible views.

**Solver idea:** terminals are nodes. Wires and closed contacts merge them into nets (union-find). Sources put potentials on nets (`L1/L2/L3/N/PE`, `DC+:<id>/DC-:<id>`). Loads read the voltage between two terminals. Conflicting potentials on one net mean a short: the solver trips the lowest-rank breaker that clears it. The solver loops up to 16 times until no contact changes state.

**Adding a component:** call `def('type', {...})` in `circuit.js` with `terms`, then whichever of `conduct`, `sources`, `evaluate`, `tick`, `onPart`, `draw` and `status` it needs. The palette, Panel view and saving pick it up automatically.

**Momentary presses:** `App.hold(key, up)` is called on press and returns the release function; `up()` runs no earlier than `App.holdTicks` (2) ticks after the press, so a quick tap is always scanned. `App.operate(c, part)` presses a device part, logs it and returns that release. `App.later(n, fn)` runs `fn` after n ticks.

**Event log:** `App.log(kind, msg)` with kind `alarm | mode | force | operator | system`. Session only (not saved). `App.events()` returns a copy.

**Loading projects:** `App.buildProject(data)` checks every field (ids, hex colors, numbers, states, HMI objects via `HMI.clean`) and throws on non-project data; `App.openNew` builds first, then switches project. `Circuit.normalize` keeps only saved values with the default's type and resets `transient` state (e.g. `pressed`).

**Contact variants:** a component def can have `variant: { n, of: { NO: type, NC: type } }`. `Circuit.retype(c, type, circ)` changes the type and moves wires by terminal position.

**Adding an instruction:** add an entry to `INSTR` in `plc.js` and a case in `Engine.el()`. The toolbar in `ladder.js` (the `TB` list) and `ICON` handle the button.

## Open decisions (owner: Ronan)
0. **PR #2 release number**: both phases are in one PR, so the next release would be **v1.2.0** (fixes included). Releasing v1.1.1 separately would need a separate branch. Decide, then authorize merge + release.
1. **Make `main` the default branch** (Settings → General → Default branch). The `github-pages` environment only deploys from the default branch, so the first Pages deploy from `main` was refused. After switching, re-run **Actions → Deploy to GitHub Pages** (or push to `main`).
5. **Android signing key**: add the four secrets from `RELEASING.md` before the release you announce, so later updates install over it.
2. **License**: proprietary (to sell) or MIT (open source)?
3. **Product name and logo** without trademarked words.
4. **Next target** after going live: circuit-lesson auto-check, or a Play Store listing.

## Last session summary (audit + PR #2)
- Full audit of the repo (3 reviewers: PLC engine, circuit solver, app/CI). Findings and the roadmap agreed with the owner are in `PROGRESS.md`.
- Owner approved "GO v1.1.1" and "GO v1.2.0". Both are implemented in PR #2; nothing merged or released.
- Root cause of "HMI buttons don't work": a tap shorter than one 20 ms scan was never seen (always on phones). Fixed with `App.hold`.
- Not changed on purpose: forced outputs still act in PROG (as on real controllers); only the status text was corrected.
- Not tested on a real phone, the Windows `.exe` or the Android `.apk`.

## Previous session summary (v1.1.0)
- Workbench layout (ladder + wiring + panel at once); mobile and touch layout; PWA (installable, offline); multiple projects; lesson Check my work.
- Fixed: pending saves are flushed before switching projects; long-press after re-render.
- Added CI and GitHub Pages workflows. They run once `main` exists.
- Created `main` at v1.0.0 and opened PR #1 for v1.1.0.
- Tests grew from 26 to 45 checks, all passing.
- Added Windows (.exe) and Android (.apk) builds plus the Release workflow; the PWA is unchanged.
- Merged PR #1 into `main` and ran the Release workflow on `main` to publish v1.1.0.
