# Progress

**Current version:** 1.6.0 (stable release authorized 2026-10-20 with "GO STABLE v1.6.0": modular PLC rack, I/O Configuration, address styles, 2D cabinet, free draw like SimuRelay. Before it 1.5.0.)
**Status:** Stable v1.6.0 (release in progress 2026-10-20). Portable Windows exe, signed Android APK, web/PWA with in-app updates (Stable/Beta). `npm test`: 310/310.

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
- [x] Merged (PR #9)

## v1.4.0 part 2 (owner: "GO merge PR #9 then GO v1.4 part 2")
- [x] 4 workspaces: Ladder, Electrical Diagram, Wiring, HMI; Panel & Plant removed (operate in the Wiring)
- [x] Help ▾ menu: Lessons & guide, Keyboard shortcuts
- [x] Layouts updated; old saved layouts/views/floating windows mapped to the new ones
- [x] Merged (PR #10)

## v1.4.0 part 3 (owner: "GO merge PR #10 then GO v1.4 part 3")
- [x] 6-terminal motor (star / delta / open windings), timer relay dial (− / +)
- [x] Examples: star-delta hardwired with Electrical Diagram, star-delta PLC, forward/reverse PLC
- [x] Merged (PR #11); v1.4.0-beta.1 pre-release published (4 assets, release-signed APK)

## v1.4.0 part 4 (owner: "GO v1.4 part 4"; reference: IEC diagram picture, "sundin ang standard sa Pilipinas")
- [x] IEC Electrical Diagram: vertical current paths, terminal numbers, -tags, IEC actuators; ladder view kept as an option
- [x] Power circuit in the diagram: supply, main switch, motor feeders, auto-wired L1-L2-L3 + PE, live phases, operate breakers
- [x] Wire colours, Philippine practice (owner confirmed): L1 red, L2 yellow, L3 blue, N white, PE green
- [x] Example: three motors (IEC)
- [x] Merged (PR #13); v1.4.0-beta.2 pre-release published (4 assets, release-signed APK)

## v1.4.1 (owner: "gawen n ito" for v1.4.1 and v1.5; "GO in-app update")
- [x] In-app updates: hosted Stable (latest release) and Beta (main) copies, Restart to update, no downloads; projects brought along
- [x] Windows portable only
- [x] Star-delta motor in the diagram power section; wires route around devices
- [x] Merged (PR #16); stable v1.4.1 authorized (GO STABLE)
- [ ] Owner's report of bugs on a real phone and PC; owner's v1.2 bug list
- [ ] v1.5 hardware (modular PLC, I/O configuration, addressing styles, cabinet)

## v1.5.0 part 1 (owner: "GO v1.5 part 1", after SimuRelay screenshots)
- [x] Free-draw Electrical Diagram: grid, library by group, drag, rotate, wire terminal to terminal, Type ⇄, operate, live paths, saved with the project
- [x] New parts: fuse 3P, MCB 3P, disconnector 3P, RCD 2P, off-delay timer, 1-phase motor, two-speed and Dahlander motors
- [x] Merged (PR #18), on Beta

## v1.5.0 part 2 (auto-merge rule)
- [x] Free draw: junctions (wire onto wire) and wire bends (double click / double tap)
- [x] Contactor 4-pole, impulse relay (Wiring + free draw)
- [x] Merged (PR #19), on Beta

## v1.5.0 part 3 (owner: "ikaw mismo alam mo ang mga symbol"): full IEC component library
- [x] Sensors: thermostat, flow switch, photoelectric PNP/NPN, 3-wire sensor symbol; push button NO+NC, foot switch, H-O-A contacts
- [x] Protection: fuse 2P/4P, MCB 4P, disconnector 4P, fuse disconnector 3P, RCD 4P, RCBO
- [x] Latching relay, heater, hour meter, voltmeter, fan and 2P contactor in free draw
- [x] Free draw: Text, PE earth, Copy (D), To front / To back; 90 symbols
- [x] Electrical Diagram in one line colour like the ladder (owner: "dapat kapareha ng ladder diagram"); power circuit in proportion with the control circuit
- [x] PR #20 merged (`430aea8`); stable v1.5.0 authorized (GO STABLE v1.5.0), released (run #44) · [x] verified: 3 assets, APK cert 27:5F:A5…, Pages version.json 1.5.0
- The hardware work moves to v1.6.0.
- [ ] Next (v1.6): modular PLC rack, I/O configuration, addressing styles, cabinet; editable terminal numbers

## v1.6.0 part 1 (owner: "Continue v 1.6"): modular PLC rack
- [x] Rack power supply, CPU module (slot 0), input cards 24 VDC / 230 VAC, relay and transistor output cards; snap on a DIN rail
- [x] Slot per card (1–7, next free on add); addresses I:slot/bit, O:slot/bit; engine I/O files 8 words, forces on any I/O word
- [x] Data table and status bar per card; one controller per project (compact PLC or CPU module); example *Modular PLC rack*
- [x] Part 2: I/O Configuration (dialog, Read I/O Config, saved in the project; a card works only when configured; mismatch = no RUN / CPU fault; Verify checks I/O addresses)
- [x] Part 3: address styles: file-based / bit-byte / basic (display only, typed in any style, stored file-based; saved per project)
- [x] Part 4: 2D cabinet: backplate, door, cable duct, HMI terminal on the door (live HMI screen, operable); plates carry their devices; example *Motor starter cabinet*
- [x] Free draw like SimuRelay (owner: "GO dito"): library panel with icon grid and groups, drag or click to add, no more stacking, Points L1/L2/L3/N/PE/+24V/0V, battery, generator, AC/DC converter, DC motor, wire pieces and link arrows, toolbar order with Play and Values, zoom bottom right, major grid lines
- [x] Stable v1.6.0 authorized ("GO STABLE v1.6.0", 2026-10-20)
- [ ] Owner to point out the spacing issue in the IEC diagram screenshots (sent 2026-10-20) → fix in v1.6.1

## Roadmap agreed with the owner (updated 2026-10-20, after v1.6.0)
**v1.4.0 — wiring like real hardware, 4 workspaces**
- [x] Part 1: flat device graphics, DIN rail + snap, terminal block, motor protection breaker, wire labels
- [x] Part 2: only 4 workspaces — Ladder, Wiring, Electrical Diagram (Schematic), HMI; Operator Panel removed (operate in the Wiring); Learn moves to Help
- [x] Part 3: star-delta, reversing (FWD/REV), timer relay with a dial; star-delta examples (wiring + diagram, wiring + ladder)
- [x] Part 4: IEC Electrical Diagram with power circuit; Philippine wire colours
- [x] Beta `v1.4.0-beta.1` and `v1.4.0-beta.2` (owner: GO BETA) · [ ] owner's beta feedback · [x] stable v1.4.0 authorized (GO STABLE, PR #15)

**v1.6.0 — hardware** (moved from v1.5.0: v1.5.0 shipped free draw and the IEC library)
- [x] Modular rack (PSU, CPU, I/O cards per slot), generic names only (part 1)
- [x] I/O Configuration: a module works only after it is configured (part 2)
- [x] Addressing display: Basic, file-based or bit/byte style (part 3)
- [x] 2D cabinet: door with pilot devices and HMI, inside layout on DIN rails (part 4)
- [x] Free draw like SimuRelay: icon library panel, new sources, wire pieces, Play / Values, zoom
- [x] Stable v1.6.0 (GO STABLE, 2026-10-20)

**v1.6.1 — fixes from the owner's checks**
- [ ] IEC diagram spacing issue (owner to point it out on the screenshots)
- [ ] Owner's feedback from Beta / real devices; owner's v1.2 bug list
- [x] Address styles also in HMI tags, Verify messages and the event log (the ASCII rung editor stays file-based: it is the program text)

**v1.7.0 — HMI** (done on `main`, not released)
- [x] Studio (designer) vs Machine (runtime) modes, full screen
- [x] Pick resolution and terminal type (PC or 4.3"–15" terminal)
- [x] More objects: shapes (rectangle, ellipse, line/pipe), images, trends, multi-screen navigation, animation (visibility, ON colour, blink), security (log-in PIN)
- [x] HMI terminal on the cabinet door follows the terminal type and the screen on display

**v1.8.0 — more instructions and devices**
- [ ] OSR/OSF, JSR/SBR/RET, MCR, SQO, COP/FLL, analog I/O; VFD, analog level transmitter; Tagalog/English toggle

**v2.0.0 — online (MAJOR: project format changes)**
- [ ] Tag-based engine (tasks, programs, routines)
- [ ] Go Online, Download / Upload with compare, Online Edit (accept, test, assemble)
- [ ] Simulated network: who-active browser, controller ↔ HMI ↔ software links, MSG and produced/consumed tags (no real ports)

## Audit findings not fixed yet
- [ ] Math status flags S:0 (carry, overflow, zero, sign) and S:5/0 on divide by zero
- [x] PLC inputs accept any voltage (230 VAC on a 24 VDC input): an AC voltage on a 24 VDC input destroys the input (compact PLC and rack cards)
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
