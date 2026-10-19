# Progress

**Current version:** 1.2.1 (released 2026-10-19; 1.2.0 on 2026-10-18 from `main`; downloads on GitHub Releases, web app on GitHub Pages)
**Status:** Stable. Signed Android APK, Windows installer, web/PWA. In-app updates (Stable/Beta). `npm test`: 174/174 on the v1.4 part 1 branch.

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

## Done (v1.2.0, PR #2): audit fixes
- [x] HMI / wiring / panel momentary buttons register on a quick tap (min. 2 scans)
- [x] Overload relay trips only for the motor it feeds
- [x] Safe import: XSS in HMI/wire colors, ids, states; non-project files refused
- [x] Storage full warning; index lists only stored projects; save on close
- [x] S:1/15 after power cycle; force only physical I/O; presets after undo/redo/paste
- [x] Momentary device state not restored stuck; black wires visible in dark mode
- [x] No PLC maker brand names in the UI

## Done (v1.2.0, PR #2): QoL features
- [x] Ladder: drag instructions; right-click Change to…; clear zoom buttons + Ctrl+scroll
- [x] N.O./N.C. contact type for push buttons and selectors
- [x] Collapsible parts groups
- [x] HMI zoom
- [x] Event log with filter and CSV export
- [x] Save / Save as / Open with shortcuts and a saved indicator
- [x] In-app updates: Stable / Beta channel, update bar, download installer, works offline; beta = pre-release in the Release workflow

## Owner actions
- [x] Authorize merge of PR #2 and the release v1.2.0 (GO STABLE v1.2.0)
- [x] Make `main` the default branch; github-pages environment allows `main`
- [x] Android signing key in repo secrets (v1.2.0 APK is release-signed)
- [x] Old branch `ccr-d652d569-13gxij` deleted · [ ] optional: remove its github-pages environment rule

## Done (v1.2.1, PR #5)
From the v1.2.0 audit and the leftovers of the v1.1 audit:
- [x] High: ladder drag never stays armed; no-op/failed drops keep undo/redo; drop on a branch rail
- [x] High: Workbench toolbars wrap inside panes (all buttons, Verify and zoom visible)
- [x] Release workflow refuses to publish a debug-signed APK; tag must match package.json; stable only from `main` with its own CHANGELOG section
- [x] Service worker bypasses the HTTP cache, so web updates load at once
- [x] Update bar in the page flow; phone toolbars show a fade where buttons are hidden
- [x] HMI modes renamed Operate / Design
- [x] Dark-mode contrast (Operator Panel, Verify, active lesson, HMI alarm)
- [x] Ctrl+S/Shift+S/O while typing; Save as keeps the PLC running; CSV formula injection; Reset data table confirm; update-check retry limit; Electron will-navigate guard; menu shortcuts; Learn hint on phones; status message ellipsis
- [x] S:0 math flags and S:5/0; PLC input destroyed by AC; breaker selectivity; oscillation warning
- [x] Portable `.exe` updates with the portable file (the desktop shell passes `?build=portable|installed`)
- [x] Verify: timer preset/accum ≥ 0, whole-number constants in range; warnings for shared timers and CTU/CTD preset mismatch
- [x] 24 VDC PSU: output short → DC OK off + alarm; overload trip delay 0 s trips at once; workflow permissions least-privilege
- [ ] Still open (low): DIV rounding of negative halves (needs a check against the instruction manual); earth-leakage teaching case (L-PE feed)
- [ ] Owner's own list of v1.2 bugs/gaps (not received yet)

## In progress: v1.3.0 builder overhaul, part 1 (owner: "gawin na ang mga pwedeng gawin na")
- [x] View menu with checkboxes (pick up to 3 windows)
- [x] Tap an existing wire → junction dot; start a wire from a wire
- [x] Drag/add/remove wire bends
- [x] Smart alignment while dragging devices (straight wires), with a guide line
- [x] Event log saved with the project

## v1.3.0 part 2 (owner: "GO v1.3 part 2")
- [x] Floating / docked windows (pop out, move, resize, dock; remembered)
- [x] Size for every device (0.5×–2×) and Same size for all
- [x] New parts: fuse, buzzer, key selector, solenoid valve, 1-phase fan, NPN proximity, pressure switch, float switch
- [x] More type options: PNP↔NPN, pressure/float N.O.↔N.C.

## v1.3.0 part 3 (owner: "GO v1.3 part 3")
- [x] Schematic view: rails, rungs, branches, symbols; devices found/created by tag and wired automatically; live power flow; operate mode; contact checks; saved with undo/redo
- [x] Merged (PR #8)

## v1.4.0 part 1 (owner: "GO merge PR #8 then GO v1.4 part 1")
- [x] Flat wiring look: screw terminals, modular bodies, MCB, contactor, motor with terminal box, PLC LCD, prox beam
- [x] DIN rail with snap; terminal block PE-L1-L2-L3-N; motor protection breaker
- [x] Wire labels (ferrules): live conductor or own label; green/yellow earth

## Roadmap agreed with the owner (updated 2026-10-19, after the owner's EduVolt-style screenshots)
**v1.4.0 — wiring like real hardware, 4 workspaces**
- [x] Part 1: flat device graphics, DIN rail + snap, terminal block, motor protection breaker, wire labels
- [ ] Part 2: only 4 workspaces — Ladder, Wiring, Electrical Diagram (Schematic), HMI; Operator Panel removed (operate in the Wiring); Learn moves to Help
- [ ] Part 3: star-delta, reversing (FWD/REV), timer relay with a dial; complete star-delta example (wiring + diagram + ladder)
- [ ] Beta `v1.3.0-beta.1` or `v1.4.0-beta.1` on the owner's GO BETA; stable v1.4.0 on GO STABLE

**v1.5.0 — hardware**
- [ ] Modular rack (chassis, PSU, CPU, I/O cards per slot), generic names only
- [ ] I/O Configuration: a module works only after it is configured
- [ ] Addressing display: Basic, file-based (current) or bit/byte style
- [ ] 2D cabinet: door with pilot devices and HMI, inside layout on DIN rails

**v1.6.0 — HMI**
- [ ] Studio (designer) vs Machine (runtime) modes
- [ ] Pick resolution and terminal type (PC or 4"–15" terminal)
- [ ] More objects: shapes, images, trends, multi-screen navigation, animation, security

**v1.7.0 — more instructions and devices**
- [ ] OSR/OSF, JSR/SBR/RET, MCR, SQO, COP/FLL, analog I/O; VFD, analog level transmitter; Tagalog/English toggle

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
