# PLC Trainer

An Allen-Bradley–style PLC trainer that runs in the browser. Write ladder logic, wire real-looking power and control circuits, operate the panel, build an HMI, and watch the equipment respond.

No install and no build step: open `index.html` in Chrome, Edge or Firefox. Everything runs locally, and your project is saved automatically in the browser.

## Features

**Ladder editor (RSLogix 500 look)**
- Rungs, nested branches (BST/NXB/BND), rung comments and address descriptions
- Instructions: `XIC XIO ONS OTE OTL OTU`, `TON TOF RTO CTU CTD RES`, `EQU NEQ LES LEQ GRT GEQ LIM`, `MOV ADD SUB MUL DIV CLR`
- SLC/MicroLogix addressing: `I:0/0`, `O:0/0`, `B3:0/0` (or `B3/17`), `T4:0/DN`, `T4:0.ACC`, `C5:0.PRE`, `N7:0`, `S:1/15`
- Live power flow (energized instructions and wires turn green), live timer and counter values
- Edit rungs as ASCII text, e.g. `BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0`
- Verify (invalid operands, duplicate OTE), undo/redo, copy/paste rungs
- PROG / RUN modes, scan cycle, first-scan bit
- Data files (I, O, B3, T4, C5, N7) with editable values
- **Forcing**: Force On / Force Off / Remove for I/O, a global Forces Enable/Disable, and FORCE LEDs

**Wiring simulator (power and control circuits)**
- Components: 3-phase and 1-phase supplies, 24 VDC PSU, MCCB, MCB 1P/2P, thermal overload relay, contactor, control relay, on-delay timer relay, terminal strip, PLC (12 DC inputs, 8 relay outputs, built-in 24 V), push buttons NO/NC, E-stop, 2- and 3-position selectors, pilot lamps, limit switch, PNP proximity sensor, 3-phase motor, conveyor with photo-eyes, tank with valves and level switches, pneumatic cylinder with reed switches
- Wire terminal-to-terminal, with bends, wire colors and pan/zoom
- An electrical solver that works with nets and potentials (L1/L2/L3/N/PE, +24 V/0 V):
  - Motor phase sequence (swap two phases to reverse), single-phasing
  - Short circuits and ground faults trip the nearest breaker
  - A wrong coil voltage either won't pull in or burns the coil
  - Overload relay trips on a jammed or single-phasing motor
- Live voltage overlay, a terminal hover tooltip, and a **multimeter**

**Panel & Plant**: every pilot device, breaker and piece of equipment drawn large and fully operable. **Split view** shows it next to the ladder.

**HMI**: a PanelView-style 800×480 screen with push buttons (momentary, toggle, set, reset), indicators, pilot lights, numeric display and entry, bar graph, motor and tank graphics, alarm banner and text. It has Edit and Run modes and binds to PLC tags.

**Learn**: 12 guided lessons (first rung, seal-in, latch, timers, flasher, counters, forcing, DOL starter, PLC motor control, conveyor, tank, a forward/reverse challenge), an instruction reference, and 6 example projects.

## Quick start
1. Open `index.html`. The *PLC motor start/stop + HMI* example loads.
2. Click **RUN** in the top bar.
3. Turn on **⧉ Split view**, then press **START** on the panel. The rung goes green, KM1 pulls in and the motor spins.
4. Click **JAM** on the motor. After a few seconds F1 trips and the HMI shows an alarm.

## Project structure
```
index.html        app shell
css/style.css     styles (light/dark)
js/ui.js          dialogs, menus, toasts
js/plc.js         addressing, instruction set, scan engine, forcing
js/ladder.js      ladder renderer/editor + data table
js/circuit.js     component library + electrical solver
js/workspace.js   wiring canvas
js/panel.js       Panel & Plant view
js/hmi.js         HMI designer/runtime
js/examples.js    example projects + lessons
js/app.js         app state, scan loop, persistence
```

Projects can be exported and imported as `.plc.json` from **File ▾**.

*This is an educational simulator. It is not affiliated with Rockwell Automation; Allen-Bradley, RSLogix, MicroLogix and PanelView are trademarks of their owners.*
