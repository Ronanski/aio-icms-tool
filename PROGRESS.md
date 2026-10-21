# Progress

**Current version:** 2.2.0 (stable release authorized by the owner 2026-10-21 with "go" after the tagging and library-name changes: Simurelay parity v2.2 and Simurelay-like tagging). Before it 2.1.0 (stable release authorized by the owner 2026-10-21: "go stable na yan. make it latest stable update" — v2.0.1 accuracy fixes, v2.1 lessons, the full audit, the Electrical Diagram roadmap Phases 0–6 and the Simurelay parity batch). Before it 2.0.0 (stable release authorized 2026-10-20 with "GO" on the roadmap row "Release v2.0.0 … GO STABLE v2.0.0": v1.6.1 fixes, v1.7 HMI, v1.8 instructions and devices, v2.0 tags/online/network. Before it 1.6.0.)
**Status:** v2.2.2 (Simurelay-like wiring, seal-in walk-through, aux block, AB-style 1756 hardware; owner: "GO STABLE" 2026-10-21) being released from PR #47; v2.2.1 released 2026-10-21; **Stable v2.2.0 released and verified 2026-10-21** (exe, apk, web zip; APK release cert checked; Pages Stable = 2.2.0). Before it v2.1.0 (2026-10-21) (GitHub Release with exe, apk, web zip; APK release cert checked; Pages Stable = 2.1.0). Previous: v2.0.0 (2026-10-20). Portable Windows exe, signed Android APK, web/PWA with in-app updates (Stable/Beta). `npm test`: 611/611 on `fix/parity-verification`, 554/554 on `fix/fd-audit`, 551/551 on `feature/feedback-example`, 538/538 on `feature/fd-timing`, 526/526 on `feature/fd-more-parts`, 516/516 on `feature/fd-properties-editing`, 495/495 on `feature/plc-io-symbols`, 480/480 on `feature/project-compatibility` (454 on `feature/integration-baseline-tests`, 428 on `main`).

## Engineer use (2026-10-21, `fix/wiring-engineer`)
- [x] Contactor aux block 2NO 2NC; a second N.O./N.C. of a contactor takes 53-54 / 61-62 / 71-72 / 83-84
- [x] Warning on a contact whose coil is drawn nowhere
- [x] Wire routing around symbols and terminals; column placement
- [x] Run view: current flow, filled coil, glowing lamp, switch flash
- [x] Drag from a terminal to another to wire (tap, tap still works)
- [x] Contact animation in the Ladder-style (NEMA) diagram view
- [x] Supply points face the current: L/+ feed down, N/0 V/PE return up
- [x] Wire path drawn by the user (click = corner, drag a segment), clean A* auto-route, junction dots
- [x] Tidy Wiring built from the diagram (panel rows, one lane per wire)
- [x] AB-style PLC hardware: compact 16 in / 12 out, 16-point cards (IB16, IA16, OW16, OB16)
- [x] One flat 2D look for all devices (no shading), one font
- [x] 1756-style chassis modules (narrow, terminal block at the sides), tag-based address style
- [x] Simurelay-style wiring in free draw: simple connectors, alignment guides, potential colours; wire styles in the Wiring
- [x] Seal-in built side by side in Simurelay and here (`docs/SIMURELAY_WALKTHROUGH.md`): + / 0 V points bring their own supply, seal-in branch over its own circuit's terminal with a dot, push button tag beside the head
- [ ] 32-point cards (need two words per slot in the data table)
- [ ] Modules that touch: their side terminals face each other (leave a gap for now)
- [x] Stable v2.2.2 (owner: "GO STABLE", 2026-10-21)

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
- [x] DIV rounding of negative halves; earth-leakage teaching case (L-PE feed) (v2.0.1)
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

## Roadmap agreed with the owner (updated 2026-10-20: v1.6.0 stable; v1.7–v2.0 done on `main`)
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

**v1.8.0 — more instructions and devices** (done on `main`, not released)
- [x] OSR/OSF, JSR/SBR/RET (program files LAD 3–9), MCR, SQO (R6 control file), COP/FLL
- [x] Analog I/O cards (4–20 mA in, 0–10 V out); VFD; analog level transmitter; example
- [x] Tagalog/English toggle (main UI; technical terms stay English)

**v2.0.0 — online (MAJOR: project format changes)**
- [x] Tag-based engine (part A): controller tags (BOOL/INT/TIMER/COUNTER/ALIAS) over the data table; Controller Organizer with tasks (continuous + periodic), programs, routines
- [x] Go Online, Download / Upload with compare, Online Edit (test, assemble, cancel) — Realistic connection mode; Simple stays the default
- [x] Simulated network: who-active browser, controller ↔ HMI ↔ software, remote PLCs, MSG and produced/consumed data (no real ports)

**Next (owner: GO on v2.0.0, v2.0.1 and v2.1, 2026-10-20)**
- [x] **Release v2.0.0** (owner: GO, 2026-10-20): ships v1.6.1, v1.7, v1.8 and v2.0 from `main` together. Project format changes (tags, program files): older apps cannot open new projects.
- [x] **v2.0.1 — accuracy fixes**: DIV rounds halves away from zero; Verify checks COP/FLL/SQO/MSG lengths against the file end; earth leakage (L–PE load) trips the RCD or is reported; alarms in the first 4 s after start are no longer lost. (S:0/S:5 flags, breaker selectivity, the oscillation warning, constant range checks and DC OK were already fixed in v1.2.1; the audit list below was out of date.)
- [x] **v2.1 — learning**: live checklists for lessons 8–16 (the wiring is checked, not only the ladder; lesson 12 checks the hardwired 21-22 interlock and the ladder XIO interlock); new lessons 13 rack + I/O Configuration, 14 analog + VFD, 15 HMI screens/trends, 16 download + online edits.
- [ ] **v2.2 — publishing**: Play Store build (`.aab`) and listing, final product name and logo; release workflow refuses a debug-signed APK.
- [ ] Owner's checks on real devices (Beta) and the owner's v1.2 bug list → fixes as they come.

**v2.1.1 — full audit (owner: "PERFORM FULL AUDIT. INITIATE FIX"; "AYUSIN MO LAHAT")**
- [x] Audit in 4 parts (PLC engine/ladder, electrical solver, app/storage/security, diagram/HMI/wiring): 40 findings, all fixed with tests (see CHANGELOG [Unreleased] "Fixed (full audit)")

## Electrical Diagram roadmap (Simurelay-inspired; owner approves each phase separately)
Four connected modules (Ladder, HMI, Wiring, Electrical Diagram) on the one existing simulation. No new solver, no Ladder/HMI rewrite, one device-settings source shared with the Wiring, the HMI reads PLC data only.
- [x] Phase 0 — integration baseline tests (26 checks; branch `feature/integration-baseline-tests`, approved, not merged)
- [x] Phase 1 — project compatibility: keep unknown parts, symbols and wires on load and save; format version; warning (branch `feature/project-compatibility`, not merged)
  - [x] Review corrections: reserved tags of kept content, kept main power circuit and rails protected and saved as they were, kept paths/feeders anchored to their neighbours
  - [x] Kept-rail fix: walang ibang supply na ipinapalit sa kept rail; hindi pinapagana ang current paths na umaasa dito (26 checks sa kabuuan)
  - [x] **Approved sa code-review level** (owner, 2026-10-20): commit `89d084158c9424c709ef93c1c6ea9a1cde2c9d70`, `480 passed, 0 failed` sa tatlong run, local Chrome lang
  - [x] CI run: PR #39 green (2026-10-21); hindi pa merged
  - [ ] Merge sa `main` at Stable release (hiwalay na go signal; dapat mauna sa Phase 4 para hindi itapon ng lumang app ang bagong part types)
  - Hindi pa direktang tested: 3-phase fallback ng `autoRails()`, kept content na walang kept rail, `renderRungs` rail path, at ang `main`/v2.0.0 file comparison (scratch script lang). Mga limitation: nasa `HANDOFF.md`.
- [x] Phase 2 — PLC output-contact and input symbols in the diagram, on the real PLC and rack terminals (free draw: PLC power, relay output, transistor output, input; 15 checks; branch `feature/plc-io-symbols`, naghihintay ng review, hindi merged)
  - [ ] Hindi pa: PLC symbols sa IEC current-path editor; analog cards; CI run
- [x] Phase 3 — inline properties panel, comments, IEC naming and numbering, duplicate warnings, editing (copy/paste, nudge, multi-select, touch, search, grid, image export) (21 checks; branch `feature/fd-properties-editing`, hindi merged)
  - Hindi pa: rename ng device mula sa diagram (sa Wiring pa rin), multi-prefix IEC naming, PNG/SVG download sa loob ng Android app
- [x] Phase 4 — missing parts in small batches (see the Simurelay comparison) (10 checks; branch `feature/fd-more-parts`, hindi merged): changeover/crossover push buttons at selectors, selector NO+NC, E-stop NO, relay/timer/latch changeover contacts, contactor 1P, disconnector 1P/2P, RCBO 4P, 1-2 pole overload/MPCB/fuse switch symbols, bell, siren
  - Hindi pa: NC main contactor poles, roller changeover, multi-voltage PSU, 4P MPCB / fuse switch; mga bagong parts sa IEC current-path editor
- [x] Phase 5 — flasher, on/off-delay timer, flashing lamp, phase-failure relay, countdown on the drawing, conductor-coloured live wires (12 checks; branch `feature/fd-timing`, hindi merged)
  - Hindi pa: star-delta / multifunction timer, phase relay na may under-voltage o asymmetry, colours sa IEC current-path view
- [x] Phase 6 — new example: hardwired 95-96 in the coil circuit, KM1 aux to a PLC input, HMI shows the real running status, discrepancy alarm; end-to-end checks (13 checks, lesson 17; branch `feature/feedback-example`, hindi merged)
  - Hindi pa: drawing ng example sa Electrical Diagram; feedback mula sa motor mismo (speed/current) sa halip na KM1 13-14
- [x] Consolidated final audit: review + 7 fixes (3 checks, branch `fix/fd-audit`), 554/554 local, Windows portable at Android debug APK na-build nang local, Electron smoke test pass; CI hindi pa (walang push)
- [x] Simurelay parity batch: N.C. poles, delay blocks 55-56/67-68, N.C.+N.O. symbols, E-stop/limit changeover, 1/2/4-pole MPCB, 1/2-pole overload, fuse switches 1P/2P/1P+N/3P+N/4P, overload 95-96-98, generator C1-C2, PLC paste points, IEC "More symbols" + PLC points, phone layout, RCBO earth leakage, kept unknown settings (57 checks kasama ang review fixes; 611/611 local; branches `feature/fd-parity-parts`, `fix/mobile-diagram`, `fix/parity-verification`, hindi merged). Inventory: `docs/SIMURELAY_PARITY.md` — 98/114 full (86.0%), 16 partial, 0 missing, 2 excluded
  - Hindi pa (partial): impulse coil at generator C1-C2 na eksaktong Simurelay behaviour, isolator 1P 13-14, roller CON 11-12-13, LV/HV PSU, GND, L1L2L3 bundles, I-II-III / I-0-II selectors, MCB thermal trip, directional link arrow
- [x] Push at PR (owner GO, 2026-10-21): 11 branches naka-push; PR [#39](https://github.com/Ronanski/aio-icms-tool/pull/39) (Phase 0–1 → `main`) at [#40](https://github.com/Ronanski/aio-icms-tool/pull/40) (stacked sa #39)
- [x] CI ng #39 at #40: **green** (2026-10-21) — test (npm test sa Ubuntu), windows, android, web, version: pass; publish: skipped (PR lang). Pareho ring nag-pass ang Phase 1 CI item sa itaas.
- [x] Merge sa `main`: #39, #40, #41 (owner GO) → **Stable v2.1.0 released** 2026-10-21
- [ ] v2.2 parity (PR #42): merge at Stable release — kailangan ng GO
- [x] Parity v2.2: thermal-magnetic MCB, 3-position selectors, directional arrows, L1L2L3(N) points; REA metadata for generator/impulse coil/earth/PSU → 111/114 full (97.4%) (6 checks; branch `feature/parity-v2.2`)
  - Natitirang Partial (3): isolator 1P (13-14), roller CON (11-12-13) — sinadyang IEC numbering; LV/HV power supply (walang 115 V)
- [x] Tagging tulad ng Simurelay: auto tags, Rename device (F2), show/hide tags at terminal numbers, tag colour, library order (8 checks) at mga pangalan sa library tiles + long press (2 checks); branch `feature/diagram-tagging`, 627/627 local
- [ ] Separate, needs its own approval: diode (one-way conduction in the solver)

## Audit findings not fixed yet
- [x] Math status flags S:0 (carry, overflow, zero, sign) and S:5/0 on divide by zero (v1.2.1)
- [x] PLC inputs accept any voltage (230 VAC on a 24 VDC input): an AC voltage on a 24 VDC input destroys the input (compact PLC and rack cards)
- [x] Breaker selectivity: with equal rank, the breaker nearest the fault trips (v1.2.1)
- [x] Warning for an oscillating circuit (relay fed through its own NC contact) (v1.2.1)
- [ ] Release workflow publishes a debug-signed APK when signing secrets are missing
- [x] Low: operand range checks, DIV rounding of negative halves (v2.0.1), PSU "DC OK" during a short, Electron `will-navigate` guard, workflow permissions · [ ] lockfiles

## Earlier plans
- [ ] Play Store build (`.aab`) and listing
- [ ] Final product name and logo, replacing the placeholder icon
- [x] Auto-check for the circuit lessons (8–12): verify wiring, not only the ladder (v2.1)

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
