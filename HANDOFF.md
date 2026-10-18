# Savepoint / handoff

Read this first when you resume work, whether you're a person or an AI agent.

## Savepoint
| | |
|---|---|
| **Version** | v1.1.0 (previous: v1.0.0 at `c22dbbd`) |
| **Tags** | `v1.0.0` and `v1.1.0` exist locally only; this cloud environment can't push tags. Create them on GitHub: Releases → Draft a new release → new tag, target the commits named in CHANGELOG / this file. |
| **Date** | 2026-10-18 |
| **Branch** | `ccr-d652d569-13gxij`, merging into `main` through PR #1 |
| **Tests** | `npm test`: 45 passed, 0 failed (desktop, layouts, phone touch, offline PWA) |
| **Pull request** | #1 `ccr-d652d569-13gxij` → `main` (v1.1.0). `main` = v1.0.0 (`c22dbbd`). |
| **Live preview** | claude.ai artifact (private): https://claude.ai/artifact/KHjQzV4oxhUo1vuYfxDKXi |

## How to resume in 2 minutes
1. `git checkout <branch>` and `git pull`
2. Open `index.html` in Chrome, or run `npm start` and go to http://localhost:8080
3. Run `npm install`, then `npm test`. All 26 checks should pass before you change anything.
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
.github/workflows/  ci.yml (tests on PRs), pages.yml (deploy main to GitHub Pages)
```
**Each tick (20 ms):** `Circuit.solve()` reads `ctx.plcOut` and writes `ctx.plcIn`, then `App.plc.scan(dt)` runs the ladder and updates `physOut`. Rendering runs separately on `requestAnimationFrame` and touches only the visible views.

**Solver idea:** terminals are nodes. Wires and closed contacts merge them into nets (union-find). Sources put potentials on nets (`L1/L2/L3/N/PE`, `DC+:<id>/DC-:<id>`). Loads read the voltage between two terminals. Conflicting potentials on one net mean a short: the solver trips the lowest-rank breaker that clears it. The solver loops up to 16 times until no contact changes state.

**Adding a component:** call `def('type', {...})` in `circuit.js` with `terms`, then whichever of `conduct`, `sources`, `evaluate`, `tick`, `onPart`, `draw` and `status` it needs. The palette, Panel view and saving pick it up automatically.

**Adding an instruction:** add an entry to `INSTR` in `plc.js` and a case in `Engine.el()`. The toolbar in `ladder.js` (the `TB` list) and `ICON` handle the button.

## Open decisions (owner: Ronan)
1. **Merge PR #1 into `main`.** Then enable GitHub Pages (Settings → Pages → Source: GitHub Actions) and the app goes live at `https://ronanski.github.io/aio-icms-tool/`.
2. **License**: proprietary (to sell) or MIT (open source)?
3. **Product name and logo** without trademarked words.
4. **Next target** after going live: circuit-lesson auto-check, or the Android APK.

## Last session summary (v1.1.0)
- Workbench layout (ladder + wiring + panel at once); mobile and touch layout; PWA (installable, offline); multiple projects; lesson Check my work.
- Fixed: pending saves are flushed before switching projects; long-press after re-render.
- Added CI and GitHub Pages workflows. They run once `main` exists.
- Created `main` at v1.0.0 and opened PR #1 for v1.1.0.
- Tests grew from 26 to 45 checks, all passing.
- The v1.1.0 tag is local only. Create it on GitHub.
