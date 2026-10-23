# Logic Studio MT: spec (v1, 2026-10-23)

**Logic Studio MT** is a second app in this repo (`plc.html`). It is a tag-based PLC programming and simulation tool
that looks and works like the desktop programming software studied in `docs/ROCKWELL_UI_STUDY.md`. The current app
(`index.html`) stays as it is. Later a hardware builder and the HMI connect to Logic Studio MT, and the combined app
uses it as its PLC module.

- Visual reference: `docs/design/plc-app-mockup.html`. Open it in a browser and switch states at the top.
- **Tag-based only.** No file-based (SLC / 500-style) target, data files (`I:1/0`, `B3`, `N7`, `T4`), time bases or
  `I:0/0` addressing. The old engine (`js/plc.js`) is not reused as is. Its instruction logic and tests are a
  reference for the new one.

## 1. Rules

- **Layout and workflow follow the reference. Names and artwork do not.**
  - No product, company or catalog names appear in the app. They may appear in `docs/` as references.
  - The icons are our own.
  - Instruction mnemonics (XIC, OTE, TON …) are the industry standard and stay.
- **Desktop sizes, as in the reference:**

  | Element | Size |
  |---|---|
  | UI text | 11 px (Tahoma / Segoe UI) |
  | Ladder text | 11 px Arial |
  | Icons | 16 px |
  | Toolbar buttons | 23 × 22 px |
  | Menu bar | 20 px |
  | Tree rows | 17 px |
  | Dialog rows | 20 px |

  There are no large touch-style controls. The first target is a desktop browser and the Windows app. A tablet must
  still work, and the phone is not a target in v1.
- **Thin drawing:**
  - Offline, rails and rungs are 1 px black.
  - Contacts `] [` and coils `( )` are about 16 px tall.
  - Online in Run, rails turn green (3 px), powered wire is 2 px green, and a true instruction is drawn green.
- Plain HTML/CSS/JS. No build step and no runtime dependencies, as for the rest of the repo.
- **Simple and clean.** Leave out what a trainer does not need. Do not show it disabled.

## 2. Names

| Kind | Name |
|---|---|
| Controller | `PLC-CPU` (revision `1.0`) |
| Rack | `PLC-RACK4`, `PLC-RACK7`, `PLC-RACK10`, `PLC-RACK13` |
| 16 DC inputs | `PLC-DI16-24V` |
| 16 AC inputs | `PLC-DI16-120V` |
| 16 DC outputs (transistor) | `PLC-DO16-24V` |
| 16 relay outputs | `PLC-DO16-RLY` |
| 4 analog inputs / outputs | `PLC-AI4`, `PLC-AO4` |
| Ethernet | `PLC-ENET` |

Module-defined tags have generic names:
- discrete cards: `Local:<slot>:I.Data.<bit>`, `Local:<slot>:O.Data.<bit>`, `Local:<slot>:I.Fault`;
- analog cards: `Local:<slot>:I.Ch<n>Data` (REAL);
- types: `PLC:DI16:I`, `PLC:DO16:O`, `PLC:AI4:I` (and so on), listed under Data Types → Module-Defined.

## 3. Main window (top to bottom)

1. **Title:** `Logic Studio MT - <project> [PLC-CPU 1.0]`, with `*` when there are unsaved changes.
2. **Menu.** Each menu holds only the commands of v1:
   - **File:** New, Open, Save, Save As, Import / Export, Close, Recent, Exit.
   - **Edit:** Undo, Redo, Cut, Copy, Paste, Delete, Select All.
   - **View:** Controller Organizer, Errors, Toolbars.
   - **Search:** Find, Find Next, Go To, Cross Reference.
   - **Logic:** Verify Routine, Verify Controller, Monitor Tags, Edit Tags, Online Edits.
   - **Communications:** Who Active, Go Online, Go Offline, Download, Program Mode, Run Mode, Forces.
   - **Tools:** Options (ladder zoom, colours).
   - **Window** and **Help:** Instruction Help, About.
3. **Standard toolbar:**
   - New, Open, Save;
   - Cut, Copy, Paste;
   - Undo, Redo;
   - search combo, Find, Cross Reference;
   - Verify Controller, Verify Routine;
   - Controller Tags;
   - on the right: the `Path:` combo and Go Online.
4. **Online bar (left):**
   - **Four LEDs:** RUN, OK, BAT, I/O. Online, the labels become `Rem Run`, `Controller OK`, `Battery OK` and
     `I/O OK`, or `I/O Not Responding` with the LED flashing.
   - **Key switch:** PROG / REM / RUN.
   - **Mode box:** `Offline`, `Rem Prog`, `Rem Run`, `Program` or `Run`. Its ▾ menu has Go Online, Program Mode,
     Run Mode and Download….
   - **Forces box:** `No Forces`, `Forces Enabled` (amber) or `Forces Disabled`. Its ▾ menu has Enable, Disable and
     Remove All.
   - **Edits box:** `No Edits` or `Edits Present`.
   - **Path.**
5. **Instruction toolbar (right):**
   - The glyph buttons of the current tab sit above the tabs, which scroll with ◂ ▸.
   - Clicking a button inserts the instruction at the cursor. Dragging drops it on a rung, and the drop target shows
     while dragging.
6. **Controller Organizer (left dock).** Right-click a node for its menu:
   - New Routine, New Program, Rename, Delete, Properties;
   - New Module on the backplane;
   - New Data Type on User-Defined.
   ```
   Controller <name>
     Controller Tags
   Tasks
     MainTask                (continuous)
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
7. **Editor:**
   - routine tabs, such as `MainProgram - MainRoutine` and `Controller Tags`;
   - a routine toolbar with Zoom in / out and Edit Rung as Text, plus Start / Accept / Cancel Pending Rung Edits,
     Test and Assemble when online;
   - the ladder.
8. **Errors pane:**
   - chips `N Errors`, `N Warnings` and `N Messages`, which each show or hide their lines;
   - Search;
   - a monospace log. Double-clicking an error goes to its rung and instruction.
9. **Status bar:** `Ready`, the communication, `Rung n of m`, `APP` and `VER`.

**Left out of v1:**
- Motion, Safety, Alarms, Redundancy, Security, Logical Model and Trends;
- Add-On Instructions;
- Fault and Power-Up handlers;
- event and periodic tasks;
- SFC, FBD and ST editors;
- Upload. The command says it is not available.

## 4. Ladder

### Rung text
The format follows the reference. It is used for Edit Rung as Text, copy / paste, the project file and the tests.

```
[XIC(Start_PB),XIC(Motor_Run)]XIC(Stop_PB)XIC(OL_OK)OTE(Motor_Run);
XIC(Motor_Run)TON(Run_Timer,5000,0);
```

- `[a,b]` is a branch, and branches may nest.
- `;` ends a rung.
- Operands are separated by `,`.
- `?` is an empty operand.
- A number is an immediate value: `5`, `-3`, `2.5`, `16#FF`, `2#1010`.

### Drawing
- **Rung:**
  - the number sits in the left margin (`0`, `1` …);
  - the comment is above the rung, wrapped;
  - `(End)` follows the last rung;
  - a selected rung's number cell turns blue, and a selected instruction gets a light-blue box.
- **Above a bit instruction:**
  - the tag description, wrapped, up to 3 lines;
  - the tag name;
  - `<alias>` when the tag is an alias.
- **Outputs** (coils and output boxes) sit against the right rail.
- **Box instruction:**
  - the mnemonic sits in a tab on the top edge, with the title beside it;
  - there is one row per operand, the name on the left and the value on the right;
  - status bits (`(EN)`, `(DN)` …) are on the right edge;
  - online, the values are live.
- **Verify errors:**
  - a red ⊗ in the left margin of each rung that fails;
  - Errors pane lines such as `Error: Rung 5, OTE, Operand 0: Undefined tag 'Alarm_Horn'.`;
  - `Complete - n error(s), m warning(s)` at the end.

### Editing
- **Keyboard:**

  | Key | Action |
  |---|---|
  | ↑ ↓ ← → | Move between instructions and rungs |
  | Ctrl+R | New rung |
  | Insert | Add an instruction (Add Ladder Element, Alt+Ins) |
  | Enter | Edit the operand |
  | Del | Delete |
  | Ctrl+Z / Ctrl+Y | Undo / Redo |
  | Ctrl+C / X / V | Copy / Cut / Paste (instruction, branch or rung) |
  | Ctrl+D | Edit the description |
  | Ctrl+W | New tag |
  | Ctrl+E | Cross reference |
  | Ctrl+G | Go To |
  | Ctrl+T | Toggle Bit |
  | F1 | Instruction help |

- **Typing a mnemonic:** with a rung selected, typing `XIC Start_PB` and pressing Enter inserts the instruction, as
  the reference's quick key entry does.
- **Edit Rung as Text:** double-click the rung number to edit the rung as text.
- **Branches:**
  - Branch adds `[,]` around the selection;
  - Branch Level adds a leg;
  - drag the branch rail to widen or narrow it.

### Addressing an operand
- **Double-click the operand** to get an inline box with ▾. Type a tag or a member, such as `Run_Timer.DN`,
  `Local:1:I.Data.0` or `Tank[2].Level`. The text completes as you type.
- **▾ opens the tag browser:**
  - name filter and Show: All Tags;
  - Name / Data Type columns;
  - structures and arrays expand to their members;
  - check boxes `Show controller tags` and `Show <program> tags`;
  - tags of a fitting type come first: BOOL and BOOL members for a bit, DINT/INT/REAL for a value, TIMER for TON.
- **Unknown name:** right-click → **New "name"** (Ctrl+W) opens the **New Tag** dialog:
  - fields: Name, Description, Usage, Type (Base / Alias), Alias For, Data Type, Scope, External Access, Style,
    Constant;
  - the data type comes from the instruction (BOOL for a bit, TIMER for TON, COUNTER for CTU, DINT for a value);
  - the scope defaults to the program;
  - Create clears the error marker.
- **Drag a tag** from the tag editor onto an operand.

### Right-click on an instruction
- New "tag" (Ctrl+W)
- Cut / Copy / Paste / Delete
- Add Ladder Element… (Alt+Ins)
- Edit Main Operand Description (Ctrl+D)
- Toggle Bit (Ctrl+T)
- Force On / Force Off / Remove Force
- Go To… (Ctrl+G)
- Go to Cross Reference (Ctrl+E)
- Instruction Help (F1)

The rung number's own menu has Add Rung, Edit Rung, Edit Rung Comment, Cut / Copy / Paste / Delete Rung and Verify
Rung.

## 5. Online

### Communication
The built-in controller is reached by Who Active → Set Project Path → Go Online. This is the flow studied in the
reference, without the driver setup.

### Going online
- The project must verify first.
- If the controller holds another project or no project, the Download dialog opens. It names the controller, its
  mode and the project, and it asks before it overwrites.
- If the controller already holds this project, the app goes online directly.
- After a download the controller is in Rem Prog. "Return the controller to Remote Run?" offers to switch it.
- While online, the I/O configuration is compared with the hardware. A missing or different card makes the I/O LED
  flash and shows a module fault (code and text) in the module's properties.

### Modes
- **Run, Rem Run:** the ladder executes, and power flow is drawn.
- **Program, Rem Prog:** the ladder does not execute, outputs go off, and the values are still live.
- The **key switch** decides who may change the mode. RUN and PROG lock the mode, and REM lets the software change it.
- Going from Program to Run does a **prescan**: OTE bits are cleared, TON is reset, and one-shot storage is set
  so a true input does not fire at start.

### Toggle Bit, forces and online edit
- **Toggle Bit** (Ctrl+T) writes the opposite value once.
  - It works on BOOL tags and members only.
  - On an input bit, the next input update overwrites it, as on the real controller.
- **Force On / Force Off** apply to I/O (`Local:` bits and aliases to them).
  - The Forces box shows `Forces Enabled` in amber.
  - The forced instruction shows a small **F**.
  - Monitor Tags shows the force mask.
  - Disable keeps the forces but stops applying them. Remove All clears them.
- **Online edit:**
  1. Start Pending Rung Edits keeps the running rung (marker **r**) and adds an editable copy (marker **i**). A new
     rung gets **i**, and a deleted rung gets **d**.
  2. Accept Pending Rung Edits verifies the edits and sends them. The old rungs still run.
  3. Test Accepted Program Edits runs the new rungs. Untest goes back to the old ones.
  4. Assemble Accepted Program Edits makes the edits final and removes the markers.
  - Each step can be cancelled.
  - The Edits box shows `Edits Present` while there are markers.

### Cross Reference (Ctrl+E)
- A window with Tag and Scope.
- Columns: Container, Routine, Location (`Rung 3`), Reference (`XIC`), BaseTag, Destructive. Destructive is `Y` when
  the instruction writes the tag.
- Double-click a row, or use Go To, to jump to the rung.

## 6. Tags and data

- **Data types:**
  - atomic: BOOL, SINT (8-bit), INT (16-bit), DINT (32-bit), REAL (32-bit float);
  - predefined: TIMER (`.PRE` and `.ACC` in ms as DINT; `.EN`, `.TT`, `.DN`), COUNTER (`.PRE`, `.ACC`; `.CU`, `.CD`,
    `.DN`, `.OV`, `.UN`), CONTROL (`.LEN`, `.POS`; `.EN`, `.DN`, `.ER`);
  - arrays of one dimension (`Motor[3]`);
  - user-defined types with members of any type (`Pump.Running`);
  - module-defined types.
- **Bits of an integer:** `MyDint.5` (bit 5).
- **Tag kinds:**
  - Base;
  - Alias, which points to a tag, a member or a bit (`Start_PB` → `Local:1:I.Data.0`).
- **Scopes:**
  - controller tags;
  - program tags;
  - a program tag hides a controller tag of the same name.
- **Names:** letters, digits and `_`, up to 40 characters, starting with a letter or `_`. Names are not case
  sensitive, and the typed case is kept.
- **Tag editor:**
  - **Monitor Tags** has the columns Name, Value, Force Mask, Style, Data Type, Description. Online, values can be
    typed in, and BOOL values toggled.
  - **Edit Tags** has the columns Name, Alias For, Base Tag, Data Type, Description, External Access, Constant.
    Its last row is for a new tag.
  - Structures and arrays expand.
  - Styles: Decimal, Binary, Hex, Float.

## 7. Instruction set (v1)

| Tab | Instructions |
|---|---|
| Bit | XIC, XIO, OTE, OTL, OTU, ONS, OSR, OSF |
| Timer/Counter | TON, TOF, RTO, CTU, CTD, RES |
| Compare | EQU, NEQ, LES, LEQ, GRT, GEQ, LIM, MEQ, CMP |
| Compute/Math | ADD, SUB, MUL, DIV, MOD, SQR, NEG, ABS, CPT |
| Move/Logical | MOV, MVM, CLR, AND, OR, XOR, NOT, BTD, SWPB |
| File/Misc | COP, FLL, FAL (later) |
| Program Control | JSR, RET, SBR, JMP, LBL, MCR, AFI, NOP, TND |
| Input/Output | GSV, SSV (later), MSG (later) |

**Math rules:**
- With integer Dest and sources, the fractional part of DIV is truncated. With a REAL source or Dest, the result is
  rounded or kept.
- An overflow wraps and sets the overflow status flag (`S:V`).
- Status flags `S:N`, `S:Z`, `S:V`, `S:C` and `S:FS` (first scan) can be read in the ladder.

**CMP and CPT** take an expression with `+ - * / MOD ** AND OR XOR NOT ( )` and SQR, ABS, NEG, SIN, COS, LN, LOG.
In this tag-based form, `/` is the divide.

**Timers:**
- `TON(Timer,Preset,Accum)`, with Preset in ms.
- The timer is updated once per scan from the real elapsed time.

## 8. Project file and storage

- Projects are saved in the browser (`localStorage`, one key each), as in the current app.
- File → Export saves `.lsmt.json`, and Import opens one.
- Format:
  ```json
  { "format": "logic-studio-mt", "version": 1,
    "controller": { "name": "Motor_Demo", "type": "PLC-CPU", "rev": "1.0" },
    "rack": { "size": 10, "modules": [{ "slot": 1, "type": "PLC-DI16-24V", "name": "DI_1" }] },
    "dataTypes": [{ "name": "Pump", "members": [{ "name": "Running", "type": "BOOL" }] }],
    "tags": [{ "name": "Start_PB", "alias": "Local:1:I.Data.0", "desc": "S1 START PB" }],
    "tasks": [{ "name": "MainTask", "type": "continuous", "programs": [{
      "name": "MainProgram", "main": "MainRoutine", "tags": [],
      "routines": [{ "name": "MainRoutine", "rungs": [{ "c": "Seal-in", "t": "XIC(Start_PB)OTE(Motor_Run);" }] }] }] }] }
  ```
- The values of the tags are saved with the project. The controller keeps its own copy of the project, as a real
  controller does, so a project changed offline must be downloaded again.

## 9. Interfaces (for the hardware builder and the HMI)

```js
LSMT.controller           // the built-in controller
  .mode                   // 'prog' | 'run' | 'remprog' | 'remrun'; .key = 'PROG' | 'REM' | 'RUN'
  .scan(dtMs)             // one scan when in Run
  .read(tag) / .write(tag, value)   // for the HMI and Toggle Bit; writing an input image is refused
  .ioImage(slot)          // { in, out } bits of a discrete card, and channel values of an analog card
  .setInputs(slot, bits)  // from the hardware builder or the I/O panel
  .on('change', fn)       // mode, faults, forces
```

The engine (`js/lsmt/engine.js`) has no DOM, so the tests and the combined app can use it directly.

Until the hardware builder exists, an **I/O panel** (View → I/O Panel) stands in for the field devices:
- each input point has a toggle or a push button;
- each output point has a lamp;
- each analog channel has a slider.

## 10. Files

```
plc.html                 entry of Logic Studio MT
css/lsmt.css             its styles (separate from css/style.css)
js/lsmt/engine.js        tags, types, rung text, verify, scan, instructions (no DOM)
js/lsmt/ladder.js        ladder drawing and editing
js/lsmt/organizer.js     tree, tag editor, dialogs
js/lsmt/app.js           window, menus, toolbars, online bar, errors pane
tests/lsmt.test.js       engine tests (node) and UI tests (Playwright)
```

`js/ui.js` and `js/store.js` may be shared when they fit. Otherwise Logic Studio MT gets its own. Nothing in
`index.html` changes.

## 11. Steps

1. Spec and mockup (done; this file).
2. Engine: types, tags, rung text, verify, scan, instruction set. Tests first.
3. Shell: `plc.html`, menu, toolbars, online bar, organizer, errors pane, status bar.
4. Ladder editor and instruction toolbar: operand editing, tag browser, New Tag, keyboard.
5. Tag editor, built-in controller, Who Active / Download / Go Online, Toggle Bit, forces, online edit, cross reference.
6. I/O panel, project file, release (Pages path, and later its own exe / apk).

## 12. To confirm against the reference software

These were written from memory and have not been seen in the VM yet:
- the force marker on an instruction;
- the online edit markers after Accept / Test;
- the exact look of a true instruction;
- the text of the Edits box;
- the DIV / MOV rounding rules for integers.
