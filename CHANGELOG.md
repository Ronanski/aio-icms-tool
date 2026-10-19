# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- **Four workspaces**: Ladder, Electrical Diagram, Wiring and HMI. The *Panel & Plant* view is removed: push buttons, selectors, breakers, overloads and equipment are operated right in the Wiring. Lessons and the new keyboard-shortcut list are in **Help ▾**.
- The Schematic tab is now called **Electrical Diagram**.
- Layouts: *Workbench* is now Ladder + Wiring + HMI; new *Wiring + HMI*, *Electrical Diagram + Ladder* and *Ladder + Electrical Diagram + Wiring*. A layout or window saved with the old panel opens the nearest new one (the Panel view opens the Wiring).

### Added
- **New Wiring look** (simple and flat, like real DIN-rail hardware): light grey modular bodies, screw terminals with a cross slot, terminal numbers such as 1/L1 and 2/T1. Redrawn: MCB (black toggle, red/green contact windows), contactor (indicator window), motor (blue body, terminal box U1 V1 W1 with star or delta bridges, turning shaft with CW/CCW), compact PLC (LCD that shows the I and Q bits), proximity sensor (red beam when powered).
- **DIN Rail** (Wiring group): drag a device onto it and it clips onto the rail. Length 200–1000. Hold Alt to place freely.
- **Terminal Block PE-L1-L2-L3-N**: green PE, grey L1 L2 L3, blue N; each top terminal feeds the one below it.
- **Motor Protection Breaker** (motor circuit breaker): trips on a short circuit (before the MCCB in front of it) and on motor overload; rotary knob ON/OFF/reset, TEST button, current setting Ir, aux contact 13-14.
- **Wire labels (ferrules)** at both ends of every wire: the conductor that is live on it (L1, L2, L3, N, PE, +24V, 0V) or your own label (wire properties, up to 12 characters). Toggle with *Wire labels* in the Wiring toolbar. Earth wires are drawn green/yellow.
- **Schematic view** (new tab): build a control circuit like a ladder: a supply rail (L or +24 V), a return rail (N or 0 V) and rungs of contacts and loads, with parallel branches. Symbols: push buttons N.O./N.C., selector, E-stop, limit switch N.O./N.C., contactor/relay/timer/overload contacts, contactor/relay/timer coils, pilot lamp and buzzer.
  - Each symbol is a real device in the Wiring, found by its tag (S1, KM1…) or added there for you, and the rungs are wired automatically, so the electrical simulator runs the circuit (shorts, trips and coil voltages included).
  - Power flow shows live in green. In *☝ Operate* mode you press buttons, turn selectors and trip overloads right on the schematic.
  - Contacts are checked: a contactor has one N.O. and one N.C. aux contact, a relay two changeover contacts; a rung with a problem is not wired and the problem is listed.
  - New layouts: *Schematic + Wiring* and *Schematic + Wiring + Panel & Plant*. The schematic is saved with the project, with undo/redo.
- **Floating windows**: ▦ View → *Float Ladder / Wiring / Panel & Plant / HMI* pops a window out of the main area. Move it by its title bar, resize it from the corner, *⤓ Dock* puts it back. Floating windows stay live and are remembered.
- **Size** for every device in the wiring (0.5× to 2×), and *Same size for all*. Wires follow the new terminal positions.
- **New parts**: Fuse (blows before any breaker; click to replace), Buzzer/Horn, Key Selector 2-Pos, Solenoid Valve 2/2, Single-Phase Fan 230 V, Proximity Sensor **NPN**, Pressure Switch and Float Switch (each N.O. or N.C.).
- **More type options in the properties**: proximity sensor PNP ↔ NPN, pressure/float switch N.O. ↔ N.C.
- **View menu** (▦ View in the status bar): tick the windows you want side by side (up to 3), e.g. ☑ Ladder ☑ Wiring. The ready-made layouts are still there.
- **Wire junctions**: while drawing a wire, click an existing wire to end the new one there, on a junction dot. Right-click a wire → *Start a new wire from here* to branch off it. The two halves keep their route.
- **Move wire bends**: select a wire and drag the round handles on its bends (snapped to the grid). Double-click a handle to remove it, double-click the selected wire (or right-click → *Add a bend here*) to add one.
- **Smart alignment**: while you drag a device, a wired terminal that comes within 8 px of the other end lines up with it so the wire runs straight; a dashed guide shows it. Hold Alt to place freely.
- The **event log is saved with the project** (last 200 events).

## [1.2.1] - 2026-10-19

### Fixed
- **Ladder drag**: releasing the mouse outside the rungs (or a fast flick) no longer leaves the drag active, which made the next click move an instruction. A drop that changes nothing keeps undo/redo. Dropping on a branch rail places the instruction next to the branch.
- **Workbench layout**: the ladder and wiring toolbars wrap inside their panes, so every instruction button, Verify and the zoom controls are visible.
- **Update bar** sits under the status bar instead of covering PROG/RUN and the I/O strip.
- **Web update**: the service worker skips the browser cache, so *Reload to update* loads the new files at once.
- **Save as** keeps the PLC running and the plant as it is, and tells you if the copy could not be stored.
- **Ctrl+S / Ctrl+Shift+S / Ctrl+O** work while typing in a field and never open the browser's own dialogs.
- **Event log CSV**: labels starting with `=`, `+`, `-` or `@` cannot run as spreadsheet formulas.
- **Dark mode**: Operator Panel labels, Verify, the active lesson and the inactive HMI alarm text are readable.
- A failed update check (offline server, rate limit) is not retried on every start.
- Windows app: links never replace the app window; they open in the browser.
- **Portable Windows app** updates with the new portable `.exe` (the installed app still gets the installer).
- Overload relay: a trip delay of 0 s trips at once (it was silently changed to 4 s).

### Added
- **Math status flags**: ADD, SUB, MUL, DIV, MOV and CLR set `S:0/0` carry, `S:0/1` overflow, `S:0/2` zero and `S:0/3` sign; an overflow or divide by zero also sets `S:5/0`. The S file now has 16 words.
- **PLC input protection**: 230/400 VAC on a 24 VDC input destroys that input (red LED, alarm, status). Right-click → Repair fixes it.
- **Breaker selectivity**: of two breakers of the same kind that can clear a short, the one nearest the fault trips and the upstream one stays on.
- **Oscillation warning** when a circuit never settles (e.g. a relay coil fed through its own N.C. contact).
- Phones: toolbars and the status bar show a fade where more buttons are hidden.
- **Verify** rejects a negative timer preset or accum and constants that are not whole numbers from -32768 to 32767, and warns when one timer is used by two timer instructions or a counter's CTU/CTD presets differ.
- **24 VDC power supply**: a short on its output puts it in current limit: DC OK goes off, with an alarm and status.

### Changed
- HMI modes are now **☝ Operate / ✎ Design**, so they are not confused with the PLC's RUN/PROG.
- File → Reset PLC data table asks first. Menu shortcuts are right-aligned and hidden on touch screens.
- Workflows: only the release job can write to the repository (CI and the build jobs are read-only).
- Release workflow: a published release fails instead of shipping a debug-signed APK; a pushed tag must match `package.json`; stable releases come from `main` only and need their own CHANGELOG section.

## [1.2.0] - 2026-10-18

### Added
- **In-app updates with Stable and Beta channels.** When online, the app checks the GitHub Releases (at start, at most once an hour, and every 6 hours) and shows a bar when a newer version is out, with *What's new*, *Download update* / *Reload to update* and *Later*. File → **Updates…** picks the channel and checks now. Stable sees normal releases only; Beta also sees pre-releases (`vX.Y.Z-beta.N`). Offline the check is skipped and the app works as usual. Windows and Android download the new installer (`.exe` / `.apk`); the web app reloads to update.
- Release workflow: a version with a suffix (e.g. `1.3.0-beta.1`) is published as a **pre-release**. Notes come from `[Unreleased]` when the beta has no CHANGELOG section of its own.
- **Ladder: drag and drop.** Drag an instruction with the mouse to move it before or after another instruction, into an empty branch leg, or onto another rung. Undo works as usual.
- **Ladder: Change to…** Right-click an instruction to swap it for a similar one with the same operands: XIC ↔ XIO ↔ ONS, OTE ↔ OTL ↔ OTU, TON ↔ TOF ↔ RTO, CTU ↔ CTD, EQU ↔ NEQ ↔ LES ↔ LEQ ↔ GRT ↔ GEQ, ADD ↔ SUB ↔ MUL ↔ DIV.
- **N.O. / N.C. contact type** for push buttons and 2-position selectors, in the properties panel and the right-click menu. Wires move to the new terminals (13-14 ↔ 11-12). New part: *Selector Switch 2-Pos (NC)*.
- **Event log** (📋 Events in the status bar, or File → Event log): mode changes, forces, trips and alarms, PLC power, HMI and device operations, each with a timestamp. Filter by type, export to CSV. A red badge counts new alarms.
- **HMI zoom**: 🔍−, Fit and 🔍＋ buttons and Ctrl + scroll.
- **Save, Save as, Open** in the File menu with Ctrl+S, Ctrl+Shift+S and Ctrl+O, and a *Saved / Saving… / Not saved* label next to the project name.
- Parts list groups fold open and closed, with Collapse all / Expand all. The folded groups are remembered.

### Changed
- Zoom controls in the ladder and wiring toolbars are labelled **Zoom** with 🔍 buttons and show the zoom level; click the level to go back to 100%. Ctrl + scroll zooms the ladder.
- **Ctrl+S now saves the project.** Before, it downloaded the project file; that is now File → Export to file.
- File → Export project / Import project are renamed *Export to file* / *Import from file*.
- Brand names of real PLC makers are no longer shown anywhere in the app. The PLC is now "PLC (compact, 12 in / 8 out)", the HMI frame is an "Operator terminal".

### Fixed
- **HMI buttons work on a quick tap.** A tap or fast click used to switch the bit on and off again before the PLC scanned it, so nothing happened, and on phones it never worked. Momentary buttons (HMI, wiring and Panel & Plant) now stay pressed for at least two scans.
- **Overload relays**: a jammed or single-phasing motor no longer trips every overload relay on the same supply. Only the relay that carries that motor's current heats up.
- **Imported or hand-edited project files**: script code hidden in HMI colors, wire colors, ids or device states no longer runs. A file that is not a project is refused, and the open project stays as it was. Broken parts of a file are dropped instead of stopping the import.
- **Storage full**: the app now tells you when a project cannot be saved, and no longer lists a project whose data was not stored.
- A push button held while the project was saved no longer comes back stuck pressed. Motors no longer coast after opening a project.
- Edits are saved when the window or app is closed or sent to the background.
- The first-scan bit `S:1/15` is set again on the first scan after the PLC gets its power back.
- Undo, redo and pasting a rung write the timer and counter presets again (a pasted TON no longer finishes at once).
- Only physical I/O bits can be forced, so a stray force can no longer break forcing.
- In PROG mode the status bar now says that forced outputs stay active, instead of saying that all outputs are off.
- Black wires are visible in dark mode: every wire has a thin outline.

## [1.1.0] - 2026-10-18

### Added
- **Installers**: a Windows installer and portable `.exe` (Electron) and an Android `.apk` (Capacitor), built from the same app files and attached to every GitHub Release. The PWA and the web version stay as they are.
- **Release workflow** (`release.yml`): builds the `.exe`, `.apk` and a web zip on every pull request. Run it manually on `main` to tag the version and publish the GitHub Release with notes from this changelog.
- **Workbench layout**: **▦ Layout** shows the ladder, the wiring (control and power circuit) and the Panel & Plant side by side, all live at once. Other layouts pair any two views or add the HMI. Drag the dividers to resize, double-click a divider to reset. Wide screens start on the Workbench.
- **Phones and tablets**:
  - Bottom tab bar on phones; toolbars become one row that scrolls sideways
  - Data files, the parts palette and the properties panel slide in as drawers
  - Ladder zoom buttons, pinch zoom on the wiring canvas
  - Long-press opens the same menus as right-click (Force, Edit, Delete, Duplicate)
  - Larger touch targets and terminal hit areas
- **Installable app (PWA)**: manifest, app icons, offline cache through a service worker, an **Install app** button, and install steps for Android, iPhone and Windows in File → About.
- **Multiple projects**: File → Open project lists every saved project. New project, examples and imports open as new projects instead of replacing the current one. The v1.0 autosave moves into the list automatically.
- **Check my work** for lessons 1–6: runs your ladder on a simulated PLC with the buttons pressed for you and reports each expected output.
- GitHub Actions: CI runs `npm test` on pull requests, and a workflow deploys `main` to GitHub Pages.
- Tests for layouts, projects, lesson grading, phone touch (drawers, long-press, pinch) and offline install (45 checks).

### Changed
- **▦ Layout** replaces the Split view toggle. Inside a pane, the data files, palette and properties open as slide-over panels.

### Fixed
- Pending changes are saved before switching to another project.
- The long-press menu opened on nothing when the ladder re-rendered under the finger.

## [1.0.0] - 2026-10-18

The first public release.

### Added
- **Ladder editor** in the style of RSLogix 500:
  - Rungs, nested branches, rung comments and address descriptions
  - Bit instructions: XIC, XIO, ONS, OTE, OTL, OTU
  - Timers and counters: TON, TOF, RTO, CTU, CTD, RES
  - Compare: EQU, NEQ, LES, LEQ, GRT, GEQ, LIM
  - Math and move: MOV, ADD, SUB, MUL, DIV, CLR
  - Rung editing as ASCII text, Verify, undo/redo, copy/paste rungs
- **PLC engine**:
  - SLC 500 / MicroLogix addressing: I, O, B3, T4, C5, N7, S
  - Scan cycle, PROG/RUN modes, first-scan bit
  - Data files with editable values
  - I/O forcing with a global enable/disable
- **Wiring simulator** with 25 components across power, protection, control, pilot devices, sensors and equipment:
  - Net and potential based solver
  - Short circuits and ground faults trip the nearest breaker
  - Coil voltage checking: a low voltage won't pull in, an overvoltage burns the device
  - Motor phase sequence and single-phasing; the overload relay trips on a jammed motor
  - Live voltage overlay, terminal tooltips, multimeter
- **Panel & Plant view**: devices drawn large and fully operable, plus split view next to the ladder.
- **HMI**: PanelView-style 800×480 designer and runtime with 10 object types bound to PLC tags.
- **Learn**: 12 lessons, an instruction and addressing reference, and 6 example projects.
- **Projects**: File → New project (name and starting template), rename, export/import `.plc.json`, autosave in the browser.
- Light and dark themes.
- End-to-end regression suite (`npm test`, 26 checks).

[Unreleased]: https://github.com/Ronanski/aio-icms-tool/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/Ronanski/aio-icms-tool/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/Ronanski/aio-icms-tool/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Ronanski/aio-icms-tool/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Ronanski/aio-icms-tool/releases/tag/v1.0.0
