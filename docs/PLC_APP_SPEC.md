# PLC app: spec (draft, 2026-10-23)

A second app in this repo, `plc.html`: a tag-based PLC programming and simulation tool that looks and works like the
desktop programming software studied in `docs/ROCKWELL_UI_STUDY.md`. The current app (`index.html`) stays as it is.
Later a hardware builder and the HMI connect to it, and the combined app uses it as its PLC module.

Visual reference: `docs/design/plc-app-mockup.html` (open it in a browser and switch the states at the top).

## Rules

- **Layout and workflow follow the reference; names and artwork do not.** No product, company or catalog names in
  the app (they may appear in `docs/` as references). Icons are our own. Instruction mnemonics (XIC, OTE, TON …) are
  the industry standard and stay.
- **Desktop size, as in the reference.** UI text 11 px (Tahoma / Segoe UI), ladder text 11 px Arial, icons 16 px,
  toolbar buttons 23 × 22 px, tree rows 17 px, menu bar 20 px. No large touch-style controls. Phone is not a target
  for this app at first.
- **Thin drawing.** Rails and rungs 1 px black offline. Contacts `] [` and coils `( )` about 16 px tall. Online, the
  rails turn green (3 px), powered wire 2 px green, a true instruction green.
- Plain HTML/CSS/JS, no build step, no runtime dependencies (as for the rest of the repo).
- Simple and clean: only what a trainer needs. Anything else is left out, not shown disabled.

## Module names

`PLC-<kind><points>-<voltage>`:

| Kind | Name |
|---|---|
| Controller | `PLC-CPU` |
| Rack | `PLC-RACK4`, `PLC-RACK7`, `PLC-RACK10`, `PLC-RACK13` |
| 16 DC inputs | `PLC-DI16-24V` |
| 16 AC inputs | `PLC-DI16-120V` |
| 16 DC outputs (transistor) | `PLC-DO16-24V` |
| 16 relay outputs | `PLC-DO16-RLY` |
| 4 analog in / out | `PLC-AI4`, `PLC-AO4` |
| Ethernet | `PLC-ENET` |

Module-defined tags keep the generic form `Local:<slot>:I.Data.<bit>` / `Local:<slot>:O.Data.<bit>` (`.Fault` too).

## Main window (top to bottom)

1. **Title:** `PLC Designer - <project> [PLC-CPU <rev>]`, `*` when unsaved. (App name to be chosen by the owner.)
2. **Menu:** File, Edit, View, Search, Logic, Communications, Tools, Window, Help.
3. **Standard toolbar:** New, Open, Save | Cut, Copy, Paste | Undo, Redo | search combo, Find, Cross Reference |
   Verify Controller, Verify Routine | Controller Tags | on the right: `Path:` combo and Go Online.
4. **Online bar (left):** four LEDs (RUN, OK, BAT, I/O; online their text becomes `Rem Run`, `Controller OK`,
   `Battery OK`, `I/O OK`), key switch PROG / REM / RUN, mode box (`Offline`, `Rem Prog`, `Rem Run`, `Program`, `Run`)
   with a ▾ menu (Go Online, Run Mode, Program Mode, Download…), Forces box (`No Forces` / `Forces Enabled` amber /
   `Forces Disabled`), Edits box (`No Edits` / `Edits Present`), `Path`.
5. **Instruction toolbar (right):** glyph buttons of the current tab, tabs under it with ◂ ▸. Tabs: Favorites, Bit,
   Timer/Counter, Input/Output, Compare, Compute/Math, Move/Logical, File/Misc, Program Control. Favorites: Rung,
   Branch, Branch Level, XIC, XIO, OTE, OTU, OTL, ONS, TON, CTU. Click inserts at the cursor; drag drops on a rung.
6. **Controller Organizer (left dock):**
   ```
   Controller <name>
     Controller Tags
   Tasks
     MainTask
       MainProgram
         Program Tags
         MainRoutine
   Data Types
     User-Defined
     Predefined
     Module-Defined
   I/O Configuration
     Backplane, PLC-RACK10
       [0] PLC-CPU <name>
       [1] PLC-DI16-24V DI_1
   ```
7. **Editor:** routine tabs (`MainProgram - MainRoutine`, `Controller Tags`), a small routine toolbar (Zoom, Edit Rung
   as Text, and online: Start / Accept / Cancel Pending Rung Edits, Test, Assemble), the ladder.
8. **Errors pane:** chips `N Errors`, `N Warnings`, `N Messages`, Search, monospace log. Double-click an error goes
   to the rung.
9. **Status bar:** `Ready`, communication, `Rung n of m`, `APP`, `VER`.

Left out: Motion, Safety, Alarms, Redundancy, Security, Logical Model, Trends, Add-On Instructions, Fault and
Power-Up handlers, event and periodic tasks, SFC / FBD / ST. Some may come back later.

## Ladder

- **Rung text** as in the reference: `[XIC(Start_PB),XIC(Motor_Run)]XIC(Stop_PB)OTE(Motor_Run);` — `[a,b]` is a
  branch, `;` ends a rung, `?` is an empty operand. Used for Edit Rung as Text, copy / paste and the project file.
- **Rung:** number in the left margin (`0`, `1` …), comment above the rung, `(End)` after the last rung. A selected
  rung's number cell is blue.
- **Operand stack above an instruction:** tag description (wrapped, up to 3 lines), tag name, `<alias>` for an alias tag.
- **Outputs** (coils and output boxes) sit against the right rail.
- **Box instructions:** mnemonic in a tab on the top edge, title beside it, one row per operand (name left, value
  right), output bits `(EN)` `(DN)` on the right edge. Online the values are live.
- **Errors (offline):** a red ⊗ in the left margin of every rung that does not verify (empty `?` operand, tag that
  does not exist, wrong type). The Errors pane lists `Rung n, XIC, Operand 0: …`.

### Addressing an operand
- Double-click the operand: an inline box with ▾. Type a tag name or a member (`Run_Timer.DN`, `Local:1:I.Data.0`).
- ▾ opens the **tag browser**: name filter, Show: All Tags, Name / Data Type columns, structures expand to members,
  `Show controller tags` and `Show MainProgram tags`. Tags of a fitting type come first.
- A name that is not a tag: right-click → **New "name"** (Ctrl+W) → **New Tag** dialog (Name, Description, Usage,
  Type Base / Alias, Alias For, Data Type, Scope, External Access, Style, Constant). The data type is filled in from the
  instruction (BOOL for a bit, TIMER for TON …). Create clears the marker.
- Drag a tag from the tag editor onto an operand.

### Right-click on an instruction
New "tag" (Ctrl+W) · Cut / Copy / Paste / Delete · Add Ladder Element… (Alt+Ins) · Edit Main Operand Description
(Ctrl+D) · Toggle Bit (Ctrl+T) · Force On / Force Off / Remove Force · Go To… (Ctrl+G) · Cross Reference (Ctrl+E) ·
Instruction Help (F1).

### Online
- Go Online needs a verified project. If the controller holds another project or none: Download dialog (as studied).
- Remote Run: rails green, powered wire green, true instructions green, box values live. Remote Program: values live,
  no power flow.
- **Toggle Bit** (Ctrl+T) writes the opposite value once (BOOL only).
- **Force On / Off:** the Forces box becomes `Forces Enabled` (amber) and the forced instruction shows a small **F**.
  Forces menu: Enable / Disable / Remove All.
- **Online edit:** Start Pending Rung Edits keeps the running rung (marker **r**) and adds an editable copy (marker
  **i**); a new rung gets **i**, a deleted one **d**. Accept Pending Rung Edits sends them (still untested), Test
  Accepted Program Edits runs the new rungs, Assemble makes them final and removes the markers. Cancel at each step.

### Cross Reference (Ctrl+E)
Window with Tag and Scope, columns Container, Routine, Location (`Rung 3`), Reference (`XIC`), BaseTag, Destructive
(Y when the instruction writes the tag). Double-click a row or Go To jumps to the rung.

## Tags and data (new engine)

- Data types: BOOL, SINT, INT, DINT, REAL, TIMER (PRE / ACC in ms, .EN .TT .DN), COUNTER (.CU .CD .DN .OV .UN), CONTROL,
  arrays (`Motor[3]`), user-defined types (`Pump.Running`), module-defined types.
- Tag kinds: Base, Alias (to a tag or a member, e.g. `Local:1:I.Data.0`).
- Scopes: controller tags and program tags; a program tag hides a controller tag of the same name.
- Tasks → Programs → Routines; MainTask continuous. `JSR(Routine)` by name.
- Tag editor: Edit Tags and Monitor Tags grids (Name, Value, Force Mask, Style, Data Type, Description), members expand.

## Interfaces (for the hardware builder and the HMI)

```js
plc.ioImage(slot)            // { in: number, out: number } bits of a discrete card
plc.setInputs(slot, bits)    // from the hardware builder (or the test I/O panel)
plc.read(tag) / plc.write(tag, value)   // HMI and Toggle Bit; writing an input tag is refused
plc.scan(dtMs)               // one scan in Run
plc.mode                     // 'prog' | 'run' | 'remprog' | 'remrun' and the key switch position
```
Until the hardware builder exists, an **I/O panel** stands in for the field: toggles on input points, lamps on
output points.

## Steps

1. This spec and the mockup (owner review).
2. Engine: tags, data types, tasks / programs / routines, rung text, scan, instruction set; tests first.
3. Shell: `plc.html`, menu, toolbars, online bar, organizer, errors pane, status bar.
4. Ladder editor and instruction toolbar; operand editing, tag browser, New Tag.
5. Tag editor, built-in controller, Download / Go Online, Toggle Bit, forces, online edit, cross reference.
6. I/O panel.

## To confirm against the reference software

Marked from memory, not yet seen in the VM: the force marker on an instruction, the edit markers' letters after
Accept / Test, the exact green of true instructions, and the online bar's Edits text.
