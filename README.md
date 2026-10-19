# PLC Trainer

**Version 1.2.1** · [Changelog](CHANGELOG.md) · [Progress](PROGRESS.md) · [Rules](CONTRIBUTING.md) · [Handoff](HANDOFF.md)

A PLC trainer that runs in the browser. Write ladder logic, wire real-looking power and control circuits, press the buttons right in the wiring, build an HMI, and watch the equipment respond.

No build step. It runs in any modern browser on Windows, Mac, Android, iPhone and iPad, and installs as an app that works offline.

## Download and install
**Web app:** https://ronanski.github.io/aio-icms-tool/ · **Installers:** [latest release](https://github.com/Ronanski/aio-icms-tool/releases/latest)

| Device | Option 1: installer file | Option 2: install from the web |
|---|---|---|
| **Windows** | `PLC-Trainer-Setup-X.Y.Z.exe`, or the `portable.exe` that needs no install. If SmartScreen appears, click *More info → Run anyway*. | Open the web app in Chrome or Edge and click **⤓ Install app** |
| **Android** | `PLC-Trainer-X.Y.Z-android.apk`. Allow *install unknown apps* when asked. | Open the web app in Chrome and tap **Install app** |
| **iPhone / iPad** | (none) | Open the web app in Safari → Share → **Add to Home Screen** |
| **Mac / Linux** | (none) | Open the web app in Chrome or Edge and click **⤓ Install app** |

Installing needs the app served over https; the included GitHub Pages workflow does that once `main` is the repository's default branch and Pages is enabled. On phones the side panels open from the **▤ Data**, **＋ Parts** and **⚙ Props** buttons. Long-press works as right-click, and you can pinch to zoom the wiring.

## Features

**Ladder editor**
- Rungs, nested branches (BST/NXB/BND), rung comments and address descriptions
- Drag an instruction with the mouse to move it, also onto another rung. Right-click → **Change to…** swaps it for a similar one (XIC ↔ XIO, TON ↔ TOF ↔ RTO, EQU ↔ GRT…) and keeps its operands
- Zoom with **🔍− 100% 🔍＋** or Ctrl + scroll
- Instructions: `XIC XIO ONS OTE OTL OTU`, `TON TOF RTO CTU CTD RES`, `EQU NEQ LES LEQ GRT GEQ LIM`, `MOV ADD SUB MUL DIV CLR`
- File-based addressing: `I:0/0`, `O:0/0`, `B3:0/0` (or `B3/17`), `T4:0/DN`, `T4:0.ACC`, `C5:0.PRE`, `N7:0`, `S:1/15`
- Live power flow (energized instructions and wires turn green), live timer and counter values
- Edit rungs as ASCII text, e.g. `BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0`
- Verify (invalid operands, duplicate OTE), undo/redo, copy/paste rungs
- PROG / RUN modes, scan cycle, first-scan bit
- Data files (I, O, B3, T4, C5, N7) with editable values
- **Forcing**: Force On / Force Off / Remove for I/O, a global Forces Enable/Disable, and FORCE LEDs

**Wiring simulator (power and control circuits)**
- Simple, flat drawings like real DIN-rail hardware: screw terminals numbered 1/L1 → 2/T1, a motor with its terminal box, a PLC with an LCD of its I/O
- Components: 3-phase and 1-phase supplies, 24 VDC PSU, fuse, MCCB, MCB 1P/2P, motor protection breaker, thermal overload relay, contactor, control relay, on-delay timer relay, terminal strip, terminal block PE-L1-L2-L3-N, DIN rail (devices clip onto it), PLC (12 DC inputs, 8 relay outputs, built-in 24 V), push buttons NO/NC, E-stop, 2- and 3-position selectors, key selector, pilot lamps, buzzer, limit switch, PNP/NPN proximity sensors, pressure and float switches (NO/NC), solenoid valve, single-phase fan, 3-phase motor, conveyor with photo-eyes, tank with valves and level switches, pneumatic cylinder with reed switches
- Wire terminal-to-terminal, with bends, wire colors and pan/zoom. Click an existing wire to join it with a **junction dot**; drag a selected wire's **bend handles** to re-route it; devices **snap into line** with the terminal they are wired to, so wires run straight. Wires have a thin outline, so black wires show in dark mode. **Wire labels** (ferrules) show the live conductor (L1, L2, L3, N, PE, +24V, 0V) or your own label
- Change a push button or 2-position selector between **N.O. and N.C.** in its properties; its wires move to the new terminals
- Component groups in the parts list fold open and closed
- An electrical solver that works with nets and potentials (L1/L2/L3/N/PE, +24 V/0 V):
  - Motor phase sequence (swap two phases to reverse), single-phasing
  - Short circuits and ground faults trip the nearest breaker
  - A wrong coil voltage either won't pull in or burns the coil
  - Overload relay trips on a jammed or single-phasing motor
- Live voltage overlay, a terminal hover tooltip, and a **multimeter**

**Electrical Diagram** (schematic): draw a relay/contactor control circuit like a ladder (rails, rungs, branches, IEC-style symbols). Every symbol becomes a real device in the Wiring and the rungs are wired for you, so the same electrical simulator runs it; operate buttons right on the schematic.

**Four workspaces**: Ladder, Electrical Diagram, Wiring and HMI. Push buttons, selectors, breakers, overloads and equipment are operated right in the Wiring (the separate Operator Panel was removed in v1.4). Lessons and keyboard shortcuts are in **Help ▾**.

**Workbench layout / View menu**: **▦ View** lets you tick which windows show side by side (up to 3), or float any window over the others (move, resize, dock back). It also shows the ladder, the wiring (control and power circuit) and the HMI side by side, all live at the same time. Drag the dividers to resize. Other layouts pair any two views or add the Electrical Diagram.

**HMI**: an 800×480 operator terminal screen with push buttons (momentary, toggle, set, reset), indicators, pilot lights, numeric display and entry, bar graph, motor and tank graphics, alarm banner and text. It has ☝ Operate and ✎ Design modes, zoom (🔍−, Fit, 🔍＋ or Ctrl + scroll) and binds to PLC tags. Momentary buttons stay on for at least two PLC scans, so a quick tap always registers.

**Updates**: when online, the app tells you about a new version (File → **Updates…**: Stable or Beta channel) and downloads the installer for your device. Offline it works as usual.

**Event log**: **📋 Events** lists mode changes, forces, trips and alarms, PLC power and operator actions with a timestamp. Filter by type and export to CSV.

**Learn**: 12 guided lessons (lessons 1–6 have **Check my work** auto-grading) (first rung, seal-in, latch, timers, flasher, counters, forcing, DOL starter, PLC motor control, conveyor, tank, a forward/reverse challenge), an instruction reference, and 6 example projects.

## Quick start
1. Open `index.html`. The *PLC motor start/stop + HMI* example loads.
2. Click **RUN** in the top bar.
3. Pick **▦ Layout → Workbench**, then press **START** in the wiring. The rung goes green, KM1 pulls in and the motor spins.
4. Click **JAM** on the motor. After a few seconds F1 trips and the HMI shows an alarm.

## Project structure
```
index.html        app shell
css/style.css     styles (light/dark)
js/ui.js          dialogs, menus, toasts, touch helpers
js/store.js       saved projects (browser storage)
js/plc.js         addressing, instruction set, scan engine, forcing
js/ladder.js      ladder renderer/editor + data table
js/circuit.js     component library + electrical solver
js/workspace.js   wiring canvas
js/hmi.js         HMI designer/runtime
js/examples.js    example projects + lessons
js/app.js         app state, scan loop, projects, install
sw.js             offline cache (service worker)
manifest.webmanifest, icons/   app install metadata
scripts/copy-web.sh            copies the app for Pages, Windows and Android builds
desktop/          Windows app (Electron wrapper)
mobile/           Android app (Capacitor wrapper)
```

Use **File ▾ → New project…** to start from a blank sheet or any example, and **File ▾ → Open project…** (Ctrl+O) to switch between saved projects. Projects save automatically in the browser; the label next to the project name shows *Saved* / *Saving…*. **Save** (Ctrl+S) saves at once, **Save as…** (Ctrl+Shift+S) makes a copy under a new name. **Export to file** and **Import from file** move projects between devices as `.plc.json`.

## Development
```bash
npm start                                # serve at http://localhost:8080 (optional; opening index.html works too)
npm install && npx playwright install chromium
npm test                                 # 164 end-to-end checks (desktop, layouts, phone touch, offline)
```
Read [CONTRIBUTING.md](CONTRIBUTING.md) for the branch, commit and release rules, and [RELEASING.md](RELEASING.md) for building the installers.

*This is an educational simulator. It is not affiliated with any PLC manufacturer. All trademarks belong to their owners.*
