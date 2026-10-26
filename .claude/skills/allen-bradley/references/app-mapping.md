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

## Known differences (open)

- New Tag lacks External Access, Style, Constant, Usage and Produced/Consumed.
- There is no Select Data Type dialog with 2- or 3-dimension arrays (the engine supports one dimension in the dialog).
- Edit Tags is a grid with a blank new-tag row, Data Type and Description cells (0.4.0); Alias For is not editable in the cell yet.
- Branch rails move with Move Branch Rail (0.4.0).
- `C` (configuration) tags exist (0.4.0, members from the 1756 modules); no `S` (status) I/O tags. Module tag types use the app's names (`PLC:DI16:I`), not `AB:1756_DI:I:0`.
- No remote I/O locations (only `Local`).
- No rack-optimized connections.
- Electronic keying and RPI exist in Module Properties, but the connection codes are simplified.
- Phone: there is no instruction toolbar row. It uses the + picker.
- Only a continuous MainTask: no periodic or event tasks, one program per task in practice.
- Data types: BOOL, SINT, INT, DINT, REAL, TIMER, COUNTER, CONTROL. No LINT, STRING, UDT editor or Add-On Instructions.
- Instructions missing compared with 1756-RM003 (audit 2026-10-26): GSV/SSV, BSL/BSR, FFL/FFU, LFL/LFU, SQO/SQI/SQL,
  FAL/FSC/AVE/SRT/SIZE, MSG, PID, TRN/TOD/FRD/DEG/RAD, SIN/COS/TAN/LN/LOG/XPY, CTUD/TONR (FBD/ST only), UID/UIE, IOT,
  string instructions. The engine has the 53 in `INSTR`.
- RSLinx: no EtherNet/IP driver (listed as "not in this version"), so no path to a real controller.
- Logix Emulate extras: no speed of time, single scan or BPT/TPT.
- L5X export: modules are written without revision, keying and connection data, and the controller is fixed as
  1756-L85E v37. Not yet imported into a real Studio 5000 to prove it opens there.
