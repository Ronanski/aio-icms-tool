# MT PLC Studio: spec (v1, 2026-10-23)

**MT PLC Studio** (renamed from "Logic Studio MT" on 2026-10-24; the name avoids the reference's trademarks) is a
second app in this repo, in its own folder `mtps/`, with its own Windows exe, Android APK and in-app updates
(section 14). It has two parts:

- **Software:** the programming tool (this spec).
- **Hardware:** an emulator with a rack, I/O cards, field devices and the HMI. It comes later and plugs into the
  interface in section 9.

MT PLC Studio itself is the software part. It is a tag-based PLC programming and simulation tool
that looks and works like the desktop programming software studied in `docs/ROCKWELL_UI_STUDY.md`. The current app
(`index.html`) stays as it is. Later a hardware builder and the HMI connect to MT PLC Studio, and the combined app
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

  These sizes are for the desktop layout, which has no large touch-style controls. The tablet and the phone (Android
  first) get their own layouts with the same functionality (section 3a).
- **Thin drawing:**
  - Offline, rails and rungs are 1 px black.
  - Contacts `] [` and coils `( )` are about 16 px tall.
  - Online, rails and rung wire are 1 px blue. In Run, only the rails turn green (3 px). The rung wire stays thin
    blue, and a true instruction gets a short thick green bar on each side of its glyph (see section 5).
- Plain HTML/CSS/JS. No build step and no runtime dependencies, as for the rest of the repo.
- **Simple and clean.** Leave out what a trainer does not need. Do not show it disabled.
- **Every button and menu item that is shown works.** A command is greyed out only when the current state does not
  allow it, as in the reference. For example, Toggle Bit is greyed out offline.
- **60 fps or better, also on a low-end PC.** See section 12.

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

1. **Title:** `MT PLC Studio - <project> [PLC-CPU 1.0]`, with `*` when there are unsaved changes.
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
   - **Forces box:** `No Forces`, or `Forces` with a green icon (disabled) or an amber icon (enabled). Its ▾ menu has
     Enable, Disable and Remove All.
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

## 3a. Tablet and phone (Android first)

**One app, three layouts, the same functionality.** Every command of the desktop menus, toolbars and right-click
menus is on the tablet and the phone too, in a place that suits touch. Only the layout and the way commands are reached
differ. The engine, the project file and the controller are the same.

Visual reference: `docs/design/plc-app-mockup-touch.html` (serve the repo, then open it). It shows phone, tablet
landscape and tablet portrait, ten states each, in light and dark, and its ladder runs on the real engine.

### Choosing the layout
| Layout | When | Input |
|---|---|---|
| Desktop | width ≥ 1200 px | mouse and keyboard |
| Tablet | 768–1199 px, or a coarse pointer at ≥ 1200 px | touch; keyboard optional |
| Phone | width < 768 px | touch |

- The layout follows the window, and rotating the device switches it live. Nothing is lost when it switches: the
  open routine, the selection, a pending edit and the scroll position are kept.
- Tools → Options → Layout can force Desktop, Tablet or Phone.
- An attached keyboard keeps every shortcut in section 4 on all three layouts.

### Touch rules (tablet and phone)
- Targets are at least 44 × 44 px on the tablet and 48 × 48 dp on the phone. Text is at least 13 px on the tablet and
  14 px on the phone. The ladder keeps its own zoom.
- Tap selects. Double-tap does what a double-click does: edit the operand, change the instruction, edit the rung as
  text.
- Long-press (500 ms) opens the same menu as the right-click, as a bottom sheet on the phone and a popup on the tablet.
  The items, their order and when they are greyed out are the same as in section 4, *Right-click menus*.
- Pinch zooms the ladder and two-finger drag scrolls it. One-finger drag on an instruction moves it, and the drop
  target shows as on the desktop.
- Hover-only information (tooltips, the tag of a glyph) is shown on long-press or in the selected-instruction bar.

### Tablet
```
┌ app bar: ☰ menu · project · mode box ▾ · Forces ▾ · Edits · Go Online ┐
├ Organizer ┬ routine tabs ─────────────────────────────────────────────┤
│ (drawer;  │ ladder (cells 112 px at 100 %)                             │
│  pinned in│                                                           │
│  landscape│                                                           │
├───────────┴ selected instruction: mnemonic · operands · Edit · ⋯ ─────┤
└ instruction bar: tabs + 44 px glyph buttons · Errors (n) ▴ ──────────┘
```
- ☰ holds all the desktop menus (File … Help) with the same items.
- In portrait there is less room. The Edits box shows only while edits are present, and its state is also in ☰.
- The standard toolbar's commands are in the app bar (Undo, Redo, Verify, Find) and in ☰.
- The Organizer is a drawer: pinned in landscape, sliding over the ladder in portrait.
- The Errors pane is a bottom sheet with the same chips and lines. Tapping a line goes to its rung.
- Tag editor, cross reference and dialogs open as large sheets at most 720 px wide.

### Phone
```
┌ status strip: Rem Run ▾ · Forces · Edits · ⚠ 2 ┐
│ routine name ▾                         🔍  ⋯   │
│ ladder (rungs wrap to the width;                │
│ cells 80 px at 100 %)                           │
│                                      ( + )      │  ← add instruction
├ selected: XIC Start_PB  ·  Edit · Toggle · ⋯ ──┤
└ Ladder · Tags · Controller · Project · More ───┘  ← bottom navigation
```
- **Bottom navigation, five areas:**
  - **Ladder:** the routine, the selected-instruction bar and the + button.
  - **Tags:** Monitor Tags and Edit Tags as one list with a toggle, plus search, filter and scope. Tap a tag to see
    its value and properties.
  - **Controller:** the online bar as a full page: LEDs, key switch, mode, path, Who Active, Go Online, Download,
    modes, forces, the I/O panel and module status.
  - **Project:** the Controller Organizer as a tree: tasks, programs, routines, data types, I/O configuration.
  - **More:** Errors, Search and Cross Reference, File (New, Open, Save, Import / Export), Options, Help.
- **The + button** opens the instruction picker, a sheet with the same tabs as the instruction toolbar and a search
  box. The new instruction goes after the selected one.
- **Operand editing** opens a full-screen tag browser with search, the same type filter, *Show controller / program
  tags*, and *New "name"* (New Tag) at the top when the typed name does not exist.
- **Online edit** works the same way. Start / Accept / Cancel / Test / Assemble are in the rung's long-press sheet
  and in the status strip's *Edits* menu.
- The status strip is always visible. Tapping the mode, Forces or Edits opens the same menu as its desktop box.
- Back (the Android back button or gesture) closes the top sheet first, then returns to the previous area. It never
  drops a pending edit without asking.

### Same functionality: where each desktop command lives
| Desktop | Tablet | Phone |
|---|---|---|
| Menu bar (File … Help) | ☰ | More, and each item's own area |
| Standard toolbar | app bar + ☰ | ⋯ on the Ladder page, More |
| Online bar | app bar boxes | status strip + Controller page |
| Instruction toolbar | instruction bar | + button → picker |
| Right-click menu | long-press popup | long-press bottom sheet |
| Controller Organizer | drawer | Project page |
| Errors pane | bottom sheet | More → Errors, ⚠ badge in the status strip |
| Tag editor | sheet | Tags page |
| Status bar (`Rung n of m`) | under the ladder | in the selected-instruction bar |

### Android app
- The Android app wraps `mtps/index.html` with the existing Capacitor wrapper in `mobile/`, as its own app ("Logic Studio
  MT"), next to the current trainer APK.
- Projects are saved on the device (as in section 8). Export / Import use the Android share sheet and file picker.
- It works offline. The screen stays on while online in Run.
- Minimum: Android 8, 2 GB RAM, a 720 × 1280 screen. The 60 fps rule of section 12 applies on such a device.

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
- **Grid:** the ladder is laid out on cells of one width (104 px at 100 %).
  - A bit instruction takes 1 cell, and a box instruction takes 2 cells.
  - Instructions line up in columns across all rungs and branch legs.
  - Branch legs start at the same column, and a shorter leg is filled with wire up to the branch end.
  - Outputs fill the last cells against the right rail, so coils line up from rung to rung.
  - The right rail is placed at the last whole cell, so the number of instructions in a row follows the window width,
    as in the reference.
- **Rung wrap:** a rung that does not fit in one row continues on the next row.
  - The row ends with ▸ and the next row starts with ▸.
  - The outputs go on the last row.
  - A branch is never split between rows.
- **Text inside a cell:**
  - a description wraps to 3 lines;
  - a tag name or an alias wraps at `:`, `_` or `.` to 2 lines;
  - the text never runs into the next cell.
- **Lines:** 1 px on the pixel grid (crisp edges). Only curves (coil arcs, the XIO slash) are anti-aliased.
- **Rung:**
  - the number sits in the left margin (`0`, `1` …);
  - the rung comment is plain blue text above the rung, centred across it, with no box;
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
- **Change an instruction in place:** double-click the instruction symbol (not its tag). An inline box shows the
  mnemonic with ▾.
  - You can type another mnemonic or pick one from the list. The list shows instructions of the same kind first.
  - The operands are kept where they fit.
  - Enter accepts the change and Esc cancels it.
- **Edit a tag in place:** double-click the tag above the instruction (see Addressing).
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

### Right-click menus
The same menu is shown offline and online. Items the mode does not allow are greyed out.

| Where | Items | Offline | Online |
|---|---|---|---|
| Instruction | New "tag" (Ctrl+W) | when the tag is missing | when the tag is missing |
| | Cut / Copy / Paste / Delete Instruction | ✓ | Copy only, until Start Pending Rung Edits |
| | Add Ladder Element… (Alt+Ins), Edit Instruction (Enter) | ✓ | in a pending-edit rung |
| | Edit Main Operand Description (Ctrl+D) | ✓ | ✓ |
| | Toggle Bit (Ctrl+T), Force On / Force Off / Remove Force | greyed | ✓ (BOOL; forces on I/O) |
| | Go To… (Ctrl+G), Go to Cross Reference (Ctrl+E), Instruction Help (F1) | ✓ | ✓ |
| Rung number | Cut / Copy / Paste / Delete Rung, Add Rung (Ctrl+R), Edit Rung, Edit Rung Comment, Verify Rung, Go To | ✓ | Copy, Go To; the others in a pending-edit rung |
| | Start / Accept / Cancel Pending Rung Edits | greyed | ✓ |
| Branch | Cut / Copy / Paste / Delete Branch, Add Branch Level | ✓ | in a pending-edit rung |
| Tag in the tag editor | New Tag, Edit Tag Properties, Cross Reference, Toggle Bit, Force | edit items | value items |
| I/O Configuration, backplane | New Module…, Paste, Properties | ✓ | Properties only |
| Module | Cut / Copy / Paste / Delete, Cross Reference, Properties (Alt+Enter) | ✓ | Cross Reference, Properties (status, fault code) |
| Routine / Program / Task in the Organizer | New Routine / Program, Rename, Delete, Properties, Open | ✓ | Open, Properties |

Items that belong to left-out features are not in the menus. Examples are motion, safety, add-on instructions,
alarms, trends and Discover Modules.

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

### Look of a running routine
Seen in the reference (VM, 2026-10-23):
- Online, the rails and the rung wire are thin blue. In Run, the rails turn thick green (about 3 px).
- The rung wire is **not** drawn green, even where it carries power.
- A true instruction gets a short thick green bar on each side of its glyph. The glyph itself stays black. This
  applies to a contact whose condition is true, a coil whose bit is 1, and each true status bit of a box (`(EN)`,
  `(DN)`).
- A false instruction has no bars.
- The same bars show online in Program mode and when Faulted: they follow the tag values, not the power flow.
- Box values update live, with a small blue ◂ beside each live value.

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
  - The Forces box shows `No Forces`. Once a force is set it shows `Forces`, with a green icon while forces are
    installed but off, and an amber icon when they are enabled.
  - The forced instruction shows a small orange `▸ON` or `▸OFF` under its glyph, on the left of the cell.
  - Monitor Tags shows the force mask.
  - Disable keeps the forces but stops applying them. Remove All clears them.
- **Online edit:**
  1. Start Pending Rung Edits adds a copy you edit **above** the running rung. The copy has a dashed left rail and
     does not execute. The running rung below keeps a column of **r** letters down its left rail. A new rung gets
     **i**, and a deleted rung gets **d**.
  2. Accept Pending Rung Edits verifies the edits and sends them. The old rung's letters become **R**, and the old
     rungs still run.
  3. Test Accepted Program Edits runs the new rungs. Their rail turns green and the old rung's rail goes back to
     blue. The routine tab reads `(Testing Edits)`. Untest goes back to the old ones.
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

**Math rules** (checked against the reference's instruction help, 2026-10-24):
- With integer Dest and sources, the fractional part of DIV and SQR is truncated. With a REAL source or Dest, the
  result is kept, or rounded into an integer Dest.
- A REAL goes into an integer by rounding: below .5 down, above .5 up, exactly .5 to the even number (2.5 → 2,
  3.5 → 4). A DINT goes into an INT or SINT by dropping the upper bits.
- An overflow wraps, sets `S:V` and is a minor fault (`S:MINOR`).
- DIV by zero is a minor fault. The result is Source A for integers and infinite for REAL.
- MOD is `Source A − trunc(Source A / Source B) × Source B`.
- SQR takes the absolute value of a negative Source.
- The flags are set from the stored value. `S:C` comes from ADD and SUB only.
- Status flags `S:N`, `S:Z`, `S:V`, `S:C`, `S:MINOR` and `S:FS` (first scan) can be read in the ladder. `S:V` and
  `S:MINOR` can also be written (OTE / OTL). `S:MINOR` clears at the start of every scan.

**Program control:**
- A true JMP goes at once to the rung of its LBL. The rest of the JMP's rung is not scanned.
- LBL is the first instruction of its rung, and its name is unique in the routine.
- TND ends the routine. In a subroutine it returns to the caller, and in a main routine the next program runs.
- An MCR with rung-condition-in false toggles the override (all rungs false), so a zone is a conditioned MCR and an
  unconditional one.
  - MCR is the last instruction of its rung.
  - The override is reset at the end of the routine.
- Jumping backward too often trips the watchdog, a major fault.

**Timers and counters:**
- Each scan adds the real time since the last scan: `ACC = ACC + (now − last scan)`.
- Setting DN pauses a TON or RTO, and clearing DN pauses a TOF.
- Prescan:
  - TON: EN, TT and DN cleared, ACC = 0.
  - TOF: EN, TT and DN cleared, ACC = PRE.
  - RTO: EN and TT cleared.
  - CTU / CTD: CU / CD set, so a true input does not count on the first scan.

**CMP and CPT** take an expression with `+ - * / MOD ** AND OR XOR NOT ( )` and SQR, ABS, NEG, SIN, COS, LN, LOG.
In this tag-based form, `/` is the divide.

**Timers:**
- `TON(Timer,Preset,Accum)`, with Preset in ms.
- The timer is updated once per scan from the real elapsed time.

## 8. Project file and storage

- Projects are saved in the browser (`localStorage`, one key each), as in the current app.
- File → Export saves `.mtps.json`, and Import opens one.
- Format:
  ```json
  { "format": "mt-plc-studio", "version": 1,
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
MTPS.controller           // the built-in controller
  .mode                   // 'prog' | 'run' | 'remprog' | 'remrun'; .key = 'PROG' | 'REM' | 'RUN'
  .scan(dtMs)             // one scan when in Run
  .read(tag) / .write(tag, value)   // for the HMI and Toggle Bit; writing an input image is refused
  .ioImage(slot)          // { in, out } bits of a discrete card, and channel values of an analog card
  .setInputs(slot, bits)  // from the hardware builder or the I/O panel
  .on('change', fn)       // mode, faults, forces
```

The engine (`mtps/js/engine.js`) has no DOM, so the tests and the combined app can use it directly.

Until the hardware builder exists, an **I/O panel** (View → I/O Panel) stands in for the field devices:
- each input point has a toggle or a push button;
- each output point has a lamp;
- each analog channel has a slider.

## 10. Files

The app is self-contained in `mtps/`, so it can be packaged, hosted and updated on its own, and the trainer can load
it later as its PLC module.

```
mtps/index.html            entry
mtps/manifest.webmanifest  installable web app (name, icons, any orientation)
mtps/sw.js                 offline cache of its own
mtps/css/app.css           styles: tokens, desktop / tablet / phone layouts, light and dark
mtps/js/engine.js          tags, types, rung text, verify, scan, instructions (no DOM)
mtps/js/ladder.js          ladder layout, drawing and hit testing
mtps/js/app.js             window, menus, toolbars, online bar, organizer, editor, dialogs, I/O panel, storage
mtps/js/update.js          in-app updates (section 14)
mtps/icons/                app icon (SVG and PNG)
desktop-mtps/              Windows wrapper (Electron, portable exe)
mobile-mtps/               Android wrapper (Capacitor, APK)
scripts/copy-mtps.sh       copies mtps/ for Pages, the exe and the APK, and stamps the build
tests/mtps.test.js         engine tests (node)
tests/mtps-ui.test.js      UI tests (Playwright): layouts, resize, rotate, editing, online
```

Nothing in `index.html` changes.

## 11. Steps

1. Spec and mockup (done; this file).
2. Engine: types, tags, rung text, verify, scan, instruction set. Tests first.
3. Mockup of the tablet and phone layouts (section 3a), then the shell: `mtps/index.html`, menu, toolbars, online bar,
   organizer, errors pane, status bar, in all three layouts.
4. Ladder editor and instruction toolbar: operand editing, tag browser, New Tag, keyboard, touch (tap, double-tap,
   long-press, pinch, the + picker).
5. Tag editor, built-in controller, Who Active / Download / Go Online, Toggle Bit, forces, online edit, cross reference.
6. I/O panel, project file, release: Pages path, the Android app first, then the Windows exe.

Each step is tested at 1440 × 900 (desktop), 1024 × 768 and 768 × 1024 (tablet) and 390 × 844 (phone), in both
themes, with screenshots checked by eye.

## 12. Performance (60 fps or better on a low-end PC)

- **Draw once, then patch.** The ladder SVG is built only when the program, the zoom or the window size changes.
- **Live updates touch only what changed.** On each frame the live values are evaluated, and only changed nodes are
  updated: a wire's `on` class, an instruction's `on` class, a box value's text. Nothing is rebuilt and no layout is
  read in the frame loop.
- **Only visible rungs.** Rungs outside the view (plus one screen above and below) are not drawn. Their layout is kept
  so scrolling stays smooth on programs with thousands of rungs.
- **Scan and draw are separate.**
  - The controller scans on its own clock, every 10 ms by default, and catches up in fixed steps when the tab was
    slow.
  - Drawing runs on `requestAnimationFrame`.
  - A scan never waits for drawing.
- **Cached text.** Text widths and wrapped lines are measured once per tag and zoom.
- **Budget:** at most 4 ms of script per frame for 500 visible instructions, at 6× CPU slowdown.
- **Checks:** a test drives Rem Run with Chrome's CPU throttling at 6× and fails below 55 fps. The mockup already holds
  60 fps at 6×.

## 13. To confirm against the reference software

**Seen in the VM on 2026-10-23** (Logix Designer 33, emulated controller; sections 1, 4 and 5 are corrected):
- true instruction: a short thick green bar on each side of the glyph. The glyph stays black, and the rung wire is
  not green;
- rails online: thin blue, thick green in Run;
- force marker: a small orange `▸ON` under the instruction. The Forces box reads `Forces`, with an amber icon when
  enabled;
- online edit: the edit copy sits above with a dashed rail, the running rung has an `r` column, which becomes `R`
  after Accept. The Edits box reads `Edits Present`;
- rung comment: plain blue text, centred, with no box.

**Checked in the reference's instruction help on 2026-10-24** (the same help as in the VM, from the publisher's online
documentation, version 37): DIV / MOD / SQR, data conversion and rounding, math status flags, JMP / LBL, TND, MCR,
TON / TOF / RTO and CTU. See section 7.

**Still to confirm:**
- the marker letter on the edit copy (too small to read over the remote link; `e` assumed);
- the wrap markers of a long rung;
- the default instruction cell width;
- MOD by zero (the help page's fault table did not come through; Source A is assumed, as for DIV).

## 14. Release, names and updates

| | |
|---|---|
| App name | **MT PLC Studio** |
| Version | its own, in `mtps/js/app.js` (`VERSION`), e.g. `0.1.0-beta.1` |
| Tag | `mtps-v<version>` (the trainer keeps `v<version>`) |
| Windows | `MT-PLC-Studio-<version>-portable.exe` (Electron, `desktop-mtps/`, app id `io.github.ronanski.mtplcstudio`) |
| Android | `MT-PLC-Studio-<version>-android.apk` (Capacitor, `mobile-mtps/`, the same app id, launcher name "MT PLC Studio") |
| Web / offline copy | `MT-PLC-Studio-<version>-web.zip`; hosted at `…/aio-icms-tool/mtps/` (Stable) and `…/mtps/beta/` (Beta) |
| Workflow | `.github/workflows/release-mtps.yml` |

- **Separate from the trainer.** Another app id, so both install side by side and keep their own projects. On the web
  both share one origin, so MT PLC Studio's storage keys start with `mtps.`.
- An MT PLC Studio release is never marked *Latest* on GitHub, so the trainer's release stays the latest, and the
  trainer's Pages copy (the latest release) is not replaced by it.
- **Updates in the app**, as in the trainer:
  - The exe and the APK open their built-in copy. When online it checks `version.json` of its channel (Stable
    `/mtps/`, Beta `/mtps/beta/`).
  - When the hosted copy is newer it shows **Restart to update**, which loads the hosted copy. The service worker
    keeps it for offline use.
  - Help → Updates… switches the channel. A preview (`-beta.N`) starts on Beta.
  - A new exe / APK is needed only when the wrapper changes.
- **Windows window:**
  - It is resizable and can be maximized, with a minimum of 800 × 600. Its size, position and maximized state are
    kept between runs.
  - The layout follows the window (section 3a): a narrow window gets the tablet layout.
- **Android:**
  - Portrait and landscape both work, and the orientation is not locked.
  - The layout switches live when the device turns, without losing the routine, the selection or a pending edit.

## 15. Emulator (modelled on FactoryTalk Logix Echo)

The owner asked for this on 2026-10-24. The laptop is the programming terminal. It connects to emulated controllers,
as the owner does with the emulator in the VM, which is Studio 5000 v37 with Logix Echo.

**Reference:** *FactoryTalk Logix Echo Getting Results Guide*, 9310-GR001D-EN-P, October 2025, read on 2026-10-24.
The points used here:
- **Panes:** the Devices pane holds the chassis and the controllers ("[slot] name"). The Controller pane has Vendor,
  Type, Revision, Name, Description, IP Address, Chassis, Slot, and a switch to turn the controller on or off. The
  Device Status pane has an on/off switch, Mode (Run, Remote, Program), the Run and OK lights and fault messages.
- **Chassis:** a default chassis named *Chassis*. More can be added, each with a unique name.
- **IP addresses:** Logix Designer connects over Ethernet to a controller's IP address and bridges across the emulated
  backplane. One controller on each chassis needs an IP address. The loopback addresses are 127.x.x.x.
- **Power:** Off saves the configuration, and the controller does not run.
- **Title bars:** dialog title bars show **[Emulator]** while connected.
- **I/O:** most I/O modules in the I/O Configuration are faulted. I/O values are simulated, and input values can be
  overwritten.

**What the app does:**
- **Engine:** `MTPS.Chassis(size, name)`.
  - Cards in slots: emulated controllers (`PLC-CPU`, each with its own `Controller`, `ip`, `desc`, and power
    through `setController`) and I/O cards (DI16, DO16, AI4, AO4, an addition of this app).
  - Controller power: `Controller.power(on)` and `powered`.
    - Off keeps the project; the controller does not scan or answer.
    - On starts it like a real controller: RUN key gives Run, PROG gives Program, and REM gives the mode it had. The
      current fault is cleared, and a prescan runs before Run.
  - I/O exchange: an empty or faulted slot gives **16#0204**; another module gives **16#0116**.
    - The input data of a faulted module holds and can be written (`inputLive()`), as on Logix Echo.
    - An output card follows the first powered controller, by slot, whose project configures it.
- **App:** `racks`, a list of chassis, is kept across restarts (`mtps.emu`; the single `mtps.chassis` of
  0.2.0-beta.1 migrates).
  - **Path:** `Emulate\<ip>\Backplane\<slot>`, kept per project. The first chassis with a powered controller at
    that IP answers.
    - Go Online, Download and Upload talk only to the controller at the path.
    - If nothing answers there (no device at the IP, an empty slot, an I/O card, a controller that is off), the app
      shows *Failed to go online*.
    - A controller removed or turned off while online drops the app offline.
  - **Who Active:** *Workstation > Emulate, Ethernet > <ip>, PLC-CPU <name> > Backplane, <chassis> > slots*.
    - Controllers that are off are greyed out.
    - The buttons are Set Project Path, Upload, Download and Go Online.
  - **Emulator dashboard** (Communications > Emulator, the phone's Controller page): Devices, details, Device Status.
    - *Add*: Add Controller (chassis, slot, name, description, IP address, on), Add I/O Card, Add Chassis.
    - Selecting a chassis shows its rack of cards: field switches, lamps, *Fault*.
    - *Open in a window* opens a blank window that the app writes, so it shares the origin also for the exe's file://
      copy. Electron allows the frame name `mtps-chassis`.
  - The window title and dialog titles add **[Emulator]** while online.
  - Toggle Bit on the input of a working card flips its field switch. On a faulted module's input, it writes the tag.
- **Not done (yet):**
  - Snapshots.
  - The Download pane of the emulator itself.
  - Virtual time and co-simulation.
  - SD cards.
  - Firmware revisions.
  - Safety controllers.
  - A real network link to another device.

## 16. RSLogix 5000 flows (0.2.0-beta.3)

- **Path bar:** the project path, with a button to Who Active.
- **Go Online:** the same logic goes straight online. Tag values and the project name do not count as a difference
  (`logicKey`).
  - Anything else opens **Connected To Go Online**. It shows the controller (path, name, mode, routines / rungs / tags)
    and the offline project, with **Select File**, Upload (when the controller has a project) and Download.
  - An empty controller says "The controller contains no project".
- **Download:**
  1. Confirm.
  2. A running controller goes to Remote Program.
  3. A progress dialog.
  4. Edits are cleared.
  5. "Return the controller to Remote Run?"
- **Upload:**
  1. Pick the project name to save it as. The dialog says whether a saved project will be replaced.
  2. A progress dialog.
  3. The project opens with the controller's tag values and the same path, and goes online.
- **Upload Tag Values:** the controller's current values become the project's tag values. Save while online asks for
  it.
- **Remote Test** (`remtest`): the logic executes and the outputs are held off. It is reached from the Mode box.
- **Online edits** (`S.ed = { ctl, orig, base, tested }`, `edPhase()`):
  - **Pending (e):** the project differs from the logic before the edits.
  - **Accept Pending Edits:** in Run, accepted (i); the controller keeps the old logic. In Program, the edits are
    finalized at once.
  - **Test Accepted Edits (I):** the controller runs the new logic (`Controller.edit`, values kept).
  - **Untest** goes back to the old logic. **Assemble** drops the old logic.
  - **Cancel Pending Edits** goes back to the accepted or controller logic. **Cancel Accepted Edits** goes back to the
    old logic.
  - The marks sit beside the rung numbers.
- **Emulator snapshots:** the whole emulator (`racks`) is saved under a name (`mtps.emu.snaps`, at most 20).
  Restore replaces it.

## 17. Proposals P1 to P5 (0.3.0-beta.1)

The mockups are on the canvas https://claude.ai/artifact/8GCDxrx7Vkatu6R6e8mfRM.

- **P3 Setup and drivers:**
  - Drivers (`mtps.emu.drivers`) are Emulate Ethernet. EtherNet/IP and Virtual Backplane are listed but not
    available.
  - With no running driver, Who Active lists nothing, and Go Online says to configure drivers.
  - The wizard steps: Communications, Emulator (a powered controller with an IP), New Project (from the emulator
    chassis), Who Active (Set Project Path), Ladder. Quick setup does them with the defaults.
  - A first start with nothing saved opens the wizard with no driver.
- **P1 Dock:** the emulator of the project path's chassis sits beside the ladder.
  - Desktop and tablet portrait: at the bottom. Tablet landscape and phone landscape: at the side. Phone portrait: a
    tab.
  - A splitter sizes it. The rack fits the width; a narrow dock shows only the used slots and the first empty slot.
- **Chassis graphics:** a power supply, a top rail with screws, slots (a backplane connector when empty) and a bottom
  rail with slot numbers.
  - The controller module shows a status display, LEDs, the name, the IP, the project and the key.
  - An I/O module shows an LED matrix and a terminal block: input switches (`data-io`), output lamps, analog sliders
    and bars.
  - A chassis has 4 to 12 slots (`Chassis.resize`).
- **P5 Tag Browser:** search with the match marked; chips for All / Inputs / Outputs / Tags / System; a scope list;
  Recent (8); folding groups; structure members under their tag (open with the arrow, or by typing "."); ↑ ↓ Enter.
- **P2 Classic look:**
  - The `classic` theme is the default.
  - Compact tree rows: 18 px with a mouse, 32 px on a tablet, 40 px on a phone. Options > Density changes them.
  - The desktop toolbar has Who Active, Path, Go Online, Download and Upload.
  - Tablet: Who Active always; Download and Upload in landscape; one row of instructions in portrait.
  - Phone: Who Active in the strip.
  - The menu button opens an accordion of the menus.
- **P4 Files:**
  - `.mtp` holds the project JSON. Open File and Save As use the File System Access API where there is one (Windows),
    and otherwise a file input and a download. Save writes back to an opened or saved .mtp.
  - Upload can save a .mtp.
  - **L5X** export and import cover the controller, `Local` I/O modules (mapped by kind), base and alias tags,
    programs, RLL routines, rungs and comments.
