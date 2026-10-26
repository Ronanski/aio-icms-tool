# Savepoint / handoff

Read this first. Old history (past sessions, PLC Trainer phases, per-branch test counts, past PRs) is in `docs/HANDOFF-ARCHIVE.md`; read it only when a task needs it.

## Savepoint
| | |
|---|---|
| **Version** | MT PLC Studio **0.4.0** (Stable) prepared on PR #95, 2026-10-26; released after the themes commit and green CI (owner GO 17:46). Previous: 0.4.0-beta.3 (PR #91). PLC Trainer (repo root): latest `v2.0.0` stable. |
| **Tags** | `mtps-v0.4.0-beta.3`, `mtps-v0.1.0`; Trainer `v2.0.0` back to `v1.1.0` (full list in archive). |
| **Branch** | `main` is the default branch and holds released code. Work on feature branches, merged through PRs only with the owner's GO. |
| **Tests** | See "Tests in the cloud container" below for current counts. |
| **Pull requests** | #1–#92 merged or closed (incl. #39/#40). Open: #93 (Allen-Bradley skill), waiting for owner GO. |
| **Downloads** | GitHub Releases: `PLC-Trainer-X.Y.Z-portable.exe`, `PLC-Trainer-X.Y.Z-android.apk`, `PLC-Trainer-X.Y.Z-web.zip` (portable only since v1.4.1). Web app: https://ronanski.github.io/aio-icms-tool/ (Stable) and `/beta/` (Beta = `main`). |
| **Android signing** | Release key in repo secrets (alias `plctrainer`, cert SHA-256 starts `27:5F:A5:15:06:CC:46`). The v1.2.0 APK was checked to carry this certificate. The owner keeps the keystore and passwords offline; they are not in the repo. |
| **Live preview** | claude.ai artifact (private): https://claude.ai/artifact/KHjQzV4oxhUo1vuYfxDKXi |

## Next session: CLOUD session (owner, 2026-10-26), read first
**MT PLC Studio** (`mtps/`, separate from the PLC Trainer at the repo root):
- Status: PR #95 (branch `claude/project-thread-c32nav`) holds 0.4.0: Studio 5000 right-click menus, one-row chassis + RTB door, Local:n:C tags + Edit Tags grid, RSLinx window, Cross Reference / Find All / branch menu, ladder drag / inline edit / online edit zones / force / Run look, New Project declares only, Logix Emulate Create, staged comm, responsive + perf. Themes thread commits last, then one merge + Stable. Next: COVERAGE MAP artifact (HAVE / PARTIAL / MISSING vs the three products).
- **Before any change in `mtps/`, read the skill `.claude/skills/allen-bradley/`.** Its `references/app-mapping.md` shows where each Studio 5000 / RSLinx / Logix Emulate concept lives in the app, and lists the known differences still open.
- The owner's golden reference is Studio 5000 Logix Designer, RSLinx Classic and Logix Emulate. Research first (the Rockwell manuals are listed in the skill's `references/sources.md`). The owner was angry about unresearched changes: "hindi mo iresearch, hindi mo aralin… puro changes tyo d2".
- Owner rules that also live in local memory (a cloud session cannot see it, so they are copied here):
  - Explanations in simple Taglish, no git jargon.
  - Claude does every step itself: build, test, release, docs. Only the one-click auth goes to the owner.
  - **Test as a real user:** Playwright with touch on a tablet and phone, and the mouse on desktop. Never only set state from code.
  - The buttons the owner uses must show on every device layout.
  - No project is kept inside the app. Projects are New, or opened from the device's storage.
  - Don't touch the repo-root `index.html` for MT PLC Studio work.
  - Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR bodies end with the Claude Code line.
- **Cloud limits:**
  - No access to the owner's PC, the VMware VM (Studio 5000), the tablet or the phone.
  - The VM walkthrough needs a local session over Remote Desktop, with the owner typing the password.
  - In the cloud, work from the docs and the skill only.
- **Tests in the cloud container** (one per file, same env as `CLAUDE.md`):
  `NODE_PATH=/opt/node-tools/node_modules CHROMIUM_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1) node tests/<file>` (the folder may be `chrome-linux64`)
  - `mtps.test.js`: 316
  - `mtps-ref.test.js`: 67
  - `mtps-ui.test.js`: 412
  - `e2e.test.js`: 884
  - `npm run audit` (`tests/mtps-audit-run.js`): 45
- **Release chain:**
  1. Bump the version in `mtps/js/app.js`, `mtps/sw.js`, `desktop-mtps/package.json` and `mobile-mtps/package.json`.
  2. Update `CHANGELOG.md`.
  3. Open a PR and wait for its checks.
  4. Squash-merge, then tag `mtps-v<ver>` on `main`.
  5. The workflow `release-mtps.yml` builds the exe and APK. Pages `/mtps/beta/version.json` updates.
  - CI runners are pinned to `ubuntu-24.04`: `ubuntu-latest` (26.04) breaks Playwright 1.56.
- **Next work (owner's choice, ask nothing that is not needed):**
  1. Wait for the owner's feedback on 0.4.0-beta.3 from the tablet: tag address browser, hold-to-drag, tap again to edit, the portrait toolbar and Errors pane, the start page.
  2. The open differences in `references/app-mapping.md`: New Tag (External Access, Style, Constant, Produced/Consumed), Select Data Type with 2/3-dim arrays, a spreadsheet Tag Editor with an editable Alias For cell, dragging branch ends, `C`/`S` I/O tags, remote I/O, a phone instruction row.
  3. `PROGRESS.md` "MT PLC Studio" list.

## How to resume in 2 minutes
1. `git checkout <branch>` and `git pull`
2. Open `index.html` in Chrome, or run `npm start` and go to http://localhost:8080
3. Run `npm install`, then `npm test`. All checks should pass (counts below) before you change anything.
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

## Older history
Moved verbatim to `docs/HANDOFF-ARCHIVE.md` (PLC Trainer phases, v1.x–v2.x sessions, old standing rules superseded by `CONTRIBUTING.md` and the rules above).
