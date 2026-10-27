# MT PLC Studio ↔ Allen-Bradley

Where each reference concept lives in the app (`mtps/`), and what still differs. Keep this file up to date with each release.

## Where it lives

| Reference | App | Code |
|---|---|---|
| Studio 5000 start page (no project open) | Start page: New Project, Open Project, Recent (paths only) | `startPage()`, `S.noProj` in `app.js` |
| Project file `.ACD` on disk | `.mtp` (JSON) and `.L5X` on the device's storage. **Nothing is kept inside the app** (owner, 0.4.0-beta.3) | `FS`, `loadFile`, `saveAs`, `rememberFile` |
| New Project wizard | Setup wizard (driver → emulator chassis → project) | `setupWizard`, `newProjectFor` |
| I/O Configuration, New Module | New Module dialog (slots leave out the controller's slot) | `run('newmod')` |
| Module I/O tags `Local:slot:I/O` | `E.MODULES` (DI16, DO16, AI4, AO4, ENET) and `E.MODTYPES`. `Data` is a **DINT**, as on real 1756 modules (0.4.0-beta.3) | `engine.js` |
| Tag name rules | `E.validName`: 40 characters, no `__`, no trailing `_` (0.4.0-beta.3) | `engine.js` |
| Tag address type | `addrType()` resolves `Tag[i].Member.Bit` and `Local:s:I.Member.Bit` → type, or null | `app.js` |
| New Tag / Tag Properties | `newTag()`: Name, Description, Type (Base/Alias), Alias For with the **tag browser** (`aliasBrowser`: I/O tags, Controller Tags, Program Tags, members, `+` bit picker), the alias's data type, Data Type, array size, Scope | `app.js` |
| Operand tag browser | The operand editor list (`groupedRows`, `suggest`, `candidates`) | `app.js` |
| Instruction toolbar | `.dinstr` on desktop. `.ibar` on tablet (above the ladder in portrait). Phone: the + button | `desktop()`, `tablet()`, `phone()` |
| Errors window (bottom) | `.derr` on desktop. `.msgp` (bottom pane) on a portrait tablet. Sheet in tablet landscape. More > Errors on phone | `errorsHTML`, `msgPane` |
| Drag an instruction to a node, Ctrl copies | Mouse: drag. Touch: **hold to lift, drag to a node, let go**; hold and let go without moving opens the menu | `bindLadder`, `dragTo`, `moveEl`, `dropAt`; nodes drawn in `ladder.js` (`o.nodes`) |
| Cross Reference (Search > Cross Reference) | Logic and Tag tabs, Type/Scope/Name/Show; Find All goes to Output > Search Results | `xref`, `findAll`, `errorsHTML` |
| Right-click menus per target | `ctxMenu` ("?", undefined name, tag name, bit/box instruction, branch, level, rung) | `app.js` |
| Click / double-click / right-click | Tap selects. Tap again on the selection (or double-tap) edits. Right-click or hold opens the menu | `onTap`, `ctxMenu` |
| RSLinx drivers, RSWho | Configure Drivers (Virtual Backplane `VBP-1` first), Who Active, path `VBP-1\2` | `DRVTYPES`, `parsePath` |
| Logix Emulate chassis | The Emulator panel (dock) with I/O cards. **No 1789-SIM** (the owner removed it in 0.4.0-beta.2) | `dockHTML`, `E.Chassis` |
| Modes, key switch, online edits | `modeBox`, `keyHTML`, `edPhase` | `app.js` |
| Faults | `Fault(type, code)` in the engine; Controller Properties Major Faults | `engine.js` |
| Structured Text routine (Wave 3) | ST editor in `#stwrap`, compiled and run by `MTPS.ST` | `js/st.js` |
| Function Block Diagram routine (Wave 3) | FBD sheets, blocks, wires, data-flow order; timers / counter from the engine (`FBDI`, `fbdPrescan`) | `js/fbd.js`, `css/fbd.css` |
| Sequential Function Chart routine (Wave 3) | SFC editor, steps / transitions / actions, Controller Properties > SFC Execution in `project.controller.sfc` `{exec, restart, last}` | `js/sfc.js`, `js/tasks.js` (tab) |
| Tasks: continuous / periodic / event, New Task, New Program, Unscheduled Programs, program parameters (Wave 3) | `E.TasksUI`; the engine's timed path (`M.timed`, `preempt`); unscheduled programs in a task of type `unscheduled` | `js/tasks.js`, `engine.js` |
| Add-On Instructions, Assets folder (Wave 3) | Definition editor, logic as program `aoi:<name>` | `js/aoi.js` |
| MSG, Message Configuration (Wave 3) | `tag.msg`, queue stepped each scan | `js/msg.js`, `engine.js` (`MTPS.MSG`) |
| Produced / consumed tags, Logix Echo (Wave 3) | Connection dialogs, RPI transfer between emulated controllers | `js/pc.js` |
| Compare Tool, Generate Report / Print, Logical Organizer, Window menu, RSLinx Options / Configure Shortcuts (Wave 3) | dialogs and windows | `js/report.js`, `css/tools.css`, `app.js` |

## Known differences (open)

- New Tag has Produced / Consumed (Wave 3); Usage is set in Program Properties > Parameters, not in New Tag.
- Select Data Type with Dim 0/1/2 and 2- or 3-dimension arrays exist (Wave 1); the Data Type Editor for UDTs, STRING types and the Add-On-Defined folder exist (Wave 2). Add-On Instructions exist (Wave 3, no Scan Mode routines, no Signature / Change History, not in L5X).
- Edit Tags is a grid with a blank new-tag row; Alias For, Style, External Access, Data Type and Description edit in their cells (Wave 1).
- Branch rails move with Move Branch Rail (0.4.0).
- `C` (configuration) tags exist (0.4.0, members from the 1756 modules); module tag types use the Studio 5000 names (`AB:1756_DI:I:0`, Wave 1); no modelled module has `S` tags.
- No remote I/O locations (only `Local`).
- No rack-optimized connections.
- Electronic Keying (Exact Match, Compatible Module, Disable Keying), revision and RPI 0.2-750 ms exist (Wave 2) with the codes 16#0114/0115/0116/0109/0204; ProductCode values are the app's own.
- Phone: there is no instruction toolbar row. It uses the + picker.
- Continuous, periodic and event tasks with priority preemption (Wave 3; no 1 ms time-slicing for the same priority). Controller Fault Handler, Power-Up Handler, program fault routines and the task watchdog (6/1) exist (Wave 2); handlers are kept as tasks of type fault / powerup in the project.
- Data types: BOOL, SINT, INT, DINT, LINT, REAL, LREAL, STRING, TIMER, COUNTER, CONTROL, PID and UDTs (Wave 2). LINT is exact only to 2^53. Add-On-Defined types from Add-On Instructions (Wave 3).
- Wave 3 added MSG, the string instructions, UID / UIE / EVENT / IOT, and TONR / TOFR / RTOR / CTUD for ST and FBD. Wave 1 added BSL/BSR, FFL/FFU, LFL/LFU, SQO/SQI/SQL; Wave 2 added SIN COS TAN ASN ACS ATN LN LOG XPY,
  DEG RAD TOD FRD TRN, FAL FSC AVE STD SRT SIZE CPS, GSV/SSV (WallClockTime, Controller, Task, Program, Module,
  FaultLog only) and PID (no tuning dialog), plus BPT/TPT for Logix Emulate. The audit configures 89 instructions.
- RSLinx: no EtherNet/IP driver (listed as "not in this version"), so no path to a real controller.
- Logix Emulate: speed of time, Single Scan, Remove Module keep/clear and the Chassis Monitor menu bar (Wave 1); BPT/TPT with trace windows, controller Module Properties (General, System, Emulator, Debug), status bar and chassis Properties (Wave 2). A breakpoint ends the scan; the next scan starts from the top.
- L5X export carries the whole project (Wave 2): UDTs and string types, modules with keying, revision and RPI,
  tasks, programs, fault handlers, rung edit zones. An emulated controller is written as 1756-L85E v37. Not yet
  imported into a real Studio 5000 to prove it opens there.
- RSLinx Classic: every menu item exists (Wave 2); Module Statistics, Driver / CIP / Station Diagnostics, Data
  Monitor and Set Time work on the emulated network. Set Time's dialog is not in the help (layout is a guess).
- ST, FBD and SFC routines, Add-On Instructions, MSG configuration, task timing, program parameters and the Logical Organizer are not in L5X yet (owner 2026-10-27: no L5X format change in Waves 3-4).
