# Progress

**Current version:** 1.1.0 (released 2026-10-18 from `main`; downloads on GitHub Releases)
**Status:** Stable web app that installs on phones, tablets and PCs. PR #2 (fixes + QoL features) is open and waiting for the owner's merge/release authorization. `npm test`: 107/107 on the PR branch.

## Done (v1.0.0)
- [x] PLC engine: addressing, scan, PROG/RUN, 25 instructions, forcing
- [x] Ladder editor: toolbar, branches, ASCII editing, Verify, undo/redo, data table
- [x] Wiring simulator: 25 components, net solver, breaker trips, coil ratings, overload, multimeter
- [x] Panel & Plant view and split view
- [x] HMI designer and runtime
- [x] 12 lessons and 6 examples
- [x] New project / rename / export / import / autosave
- [x] Light and dark themes
- [x] End-to-end test suite
- [x] Docs: README, CHANGELOG, CONTRIBUTING (rules), PROGRESS, HANDOFF

## Done (v1.1.0)
- [x] Workbench layout: ladder + wiring + panel live side by side, resizable panes
- [x] PWA: manifest, service worker, icons, Install app button, works offline
- [x] Mobile and tablet layout: bottom tabs, drawers, ladder zoom, pinch zoom, long-press menus
- [x] Multiple saved projects (File → Open project)
- [x] Lesson auto-check for lessons 1–6
- [x] CI and GitHub Pages workflows
- [x] Windows installer + portable `.exe` and Android `.apk`, published by the Release workflow

## Done in PR #2 (audit fixes, planned v1.1.1)
- [x] HMI / wiring / panel momentary buttons register on a quick tap (min. 2 scans)
- [x] Overload relay trips only for the motor it feeds
- [x] Safe import: XSS in HMI/wire colors, ids, states; non-project files refused
- [x] Storage full warning; index lists only stored projects; save on close
- [x] S:1/15 after power cycle; force only physical I/O; presets after undo/redo/paste
- [x] Momentary device state not restored stuck; black wires visible in dark mode
- [x] No PLC maker brand names in the UI

## Done in PR #2 (QoL features, planned v1.2.0)
- [x] Ladder: drag instructions; right-click Change to…; clear zoom buttons + Ctrl+scroll
- [x] N.O./N.C. contact type for push buttons and selectors
- [x] Collapsible parts groups
- [x] HMI zoom
- [x] Event log with filter and CSV export
- [x] Save / Save as / Open with shortcuts and a saved indicator
- [x] In-app updates: Stable / Beta channel, update bar, download installer, works offline; beta = pre-release in the Release workflow

## Owner actions
- [x] Authorize merge of PR #2 and the release v1.2.0 (GO STABLE v1.2.0)
- [ ] Make `main` the default branch so Pages can deploy
- [ ] Android signing key in repo secrets, so updates install over old versions (see RELEASING.md)

## Roadmap agreed with the owner
**v1.3.0 — builder overhaul**
- [ ] Electrical schematic mode like the ladder (L1/N rails, rungs, straight wires)
- [ ] Grid, align tools, 90° wires; drag and re-route wires; tap an existing wire to branch with a junction dot
- [ ] Same-size, resizable components with full properties; more components and symbols
- [ ] Window manager: docked or floating windows, saved layouts, View menu with checkboxes

**v1.4.0 — hardware**
- [ ] Modular rack (chassis, PSU, CPU, I/O cards per slot), generic names only
- [ ] I/O Configuration: a module works only after it is configured
- [ ] Addressing display: Basic, file-based (current) or bit/byte style
- [ ] 2D cabinet: door with pilot devices and HMI, inside layout on DIN rails

**v1.5.0 — HMI**
- [ ] Studio (designer) vs Machine (runtime) modes
- [ ] Pick resolution and terminal type (PC or 4"–15" terminal)
- [ ] More objects: shapes, images, trends, multi-screen navigation, animation, security

**v2.0.0 — online (MAJOR: project format changes)**
- [ ] Tag-based engine (tasks, programs, routines)
- [ ] Go Online, Download / Upload with compare, Online Edit (accept, test, assemble)
- [ ] Simulated network: who-active browser, controller ↔ HMI ↔ software links, MSG and produced/consumed tags (no real ports)

## Audit findings not fixed yet
- [ ] Math status flags S:0 (carry, overflow, zero, sign) and S:5/0 on divide by zero
- [ ] PLC inputs accept any voltage (230 VAC on a 24 VDC input)
- [ ] Breaker selectivity: with equal rank, the upstream breaker can trip first
- [ ] No warning for an oscillating circuit (relay fed through its own NC contact)
- [ ] Release workflow publishes a debug-signed APK when signing secrets are missing
- [ ] Low: operand range checks, DIV rounding of negative halves, PSU "DC OK" during a short, Electron `will-navigate` guard, workflow permissions and lockfiles

## Earlier plans
- [ ] Play Store build (`.aab`) and listing
- [ ] Final product name and logo, replacing the placeholder icon
- [ ] Auto-check for the circuit lessons (8–12): verify wiring, not only the ladder

## Backlog (v1.2+)
- [ ] More instructions: OSR/OSF, JSR/SBR/RET, MCR, SQO, COP/FLL, BTD, SCP, analog I/O (I:1.0 words)
- [ ] More devices: VFD, star-delta starter, reversing contactor pair, 3-wire analog level transmitter
- [x] Rung drag-and-drop editing (instructions, PR #2) · [ ] wire dragging and re-routing (v1.3.0)
- [ ] Tagalog / English language toggle
- [ ] Migrate to TypeScript + Vite and add unit tests for `plc.js` and `circuit.js`
- [ ] Choose a license: proprietary for selling, or MIT

## Known limitations
- On phones, wiring large circuits is possible but slow; a tablet or PC is more comfortable.
- Offline install of the PWA needs https (GitHub Pages). The `.exe` and `.apk` work offline as they are.
- The Windows `.exe` is not code-signed, so SmartScreen warns on first run.
- File → Export does not download inside the Android app yet.
- One PLC per project. Loads in series (e.g. two lamps in series) are not modeled.
- Wires are routed automatically from waypoints; you can't drag an existing wire.
- Dragging ladder instructions works with a mouse or pen. On touch, use the long-press menu or ◀ ▶.
- The event log covers the current session only; it is not saved with the project.
- Inside the claude.ai artifact preview, File → Export is blocked. Export works in a normal browser tab.
- Projects are stored per browser (`localStorage`). Use Export to move them to another device.
