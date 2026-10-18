# Savepoint / handoff

Read this first when you resume work, whether you're a person or an AI agent.

## Savepoint
| | |
|---|---|
| **Version** | v1.0.0, release commit `c22dbbd` |
| **Tag** | `v1.0.0` exists locally only. The cloud environment blocks tag pushes, so create it on GitHub (Releases → Draft a new release → tag `v1.0.0`, target commit `c22dbbd`). |
| **Date** | 2026-10-18 |
| **Branch** | `ccr-d652d569-13gxij` (`main` not created yet; see "Open decisions") |
| **Tests** | `npm test`: 26 passed, 0 failed |
| **Live preview** | claude.ai artifact (private): https://claude.ai/artifact/KHjQzV4oxhUo1vuYfxDKXi |

## How to resume in 2 minutes
1. `git checkout <branch>` and `git pull`
2. Open `index.html` in Chrome, or run `npm start` and go to http://localhost:8080
3. Run `npm install`, then `npm test`. All 26 checks should pass before you change anything.
4. Read `CONTRIBUTING.md` (rules), then `PROGRESS.md` (what's next).

## Architecture in one screen
```
index.html ── loads scripts in order ──►
  ui.js        UI.modal/form/menu/toast
  plc.js       PLCcore: parse(addr), INSTR table, Engine (data table, scan, forces)
  ladder.js    Ladder: parseRung/serialize (ASCII), SVG render, editor ops, DataTable
  circuit.js   Circuit: DEFS (component library), solve() net solver
  workspace.js Workspace: wiring canvas (pan/zoom, wires, meter, props)
  panel.js     PanelView: big operable devices
  hmi.js       HMI: designer + runtime
  examples.js  Examples: EX (projects) + LESSONS
  app.js       App: project state, persistence, 20 ms tick loop, views, status bar
```
**Each tick (20 ms):** `Circuit.solve()` reads `ctx.plcOut` and writes `ctx.plcIn`, then `App.plc.scan(dt)` runs the ladder and updates `physOut`. Rendering runs separately on `requestAnimationFrame` and touches only the visible views.

**Solver idea:** terminals are nodes. Wires and closed contacts merge them into nets (union-find). Sources put potentials on nets (`L1/L2/L3/N/PE`, `DC+:<id>/DC-:<id>`). Loads read the voltage between two terminals. Conflicting potentials on one net mean a short: the solver trips the lowest-rank breaker that clears it. The solver loops up to 16 times until no contact changes state.

**Adding a component:** call `def('type', {...})` in `circuit.js` with `terms`, then whichever of `conduct`, `sources`, `evaluate`, `tick`, `onPart`, `draw` and `status` it needs. The palette, Panel view and saving pick it up automatically.

**Adding an instruction:** add an entry to `INSTR` in `plc.js` and a case in `Engine.el()`. The toolbar in `ladder.js` (the `TB` list) and `ICON` handle the button.

## Open decisions (owner: Ronan)
1. **Create `main` and merge v1.0.0 into it.** The repo has no default branch yet.
2. **License**: proprietary (to sell) or MIT (open source)?
3. **Product name and logo** without trademarked words.
4. **Next target**: PWA + GitHub Pages first (recommended), or the Android APK.

## Last session summary
- Built the full app (ladder, PLC engine, wiring solver, panel, HMI, lessons, examples).
- Added File → New project (name + template), About with version, and the e2e suite.
- Added the docs: CHANGELOG, CONTRIBUTING, PROGRESS, HANDOFF and CLAUDE.md.
- Prepared the v1.0.0 release (commit `c22dbbd`). The tag still has to be created on GitHub.
