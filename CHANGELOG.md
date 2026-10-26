# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- Docs: `HANDOFF.md` trimmed to current status; old history moved verbatim to `docs/HANDOFF-ARCHIVE.md`.

### Changed (MT PLC Studio 0.4.0, Stable): closer to Studio 5000, RSLinx Classic and Logix Emulate (owner)
- **Right-click menus in the Studio 5000 order**, one for each target: "?" (New Tag…), an undefined name
  (New "name"), a tag name (Edit Properties, Find All, Go To Cross Reference For, Monitor, Trend), a bit or a box
  instruction, a branch, a branch level, and a rung (Import/Export Rungs, Start/Accept/Cancel Pending Rung Edits,
  Assemble, Verify Rung). Edit "Bit" is gone.
- **Edit bar above the routine** for the main operand description, the rung comment and the rung text
  (✓ accepts, ✕ cancels, Ctrl+Enter). **Go To** dialog. **Add Ladder Element** is a grouped list with a help pane.
- **Operands are edited on the rung** in a small combo box with the tags of the operand's type (Enter goes to the
  next operand, Esc cancels); a double-click on an instruction changes its mnemonic and keeps the operands that fit.
- **Quick Keys are off** by default (Tools > Options > Ladder Editor); a letter starts an operand edit and
  Alt+Insert opens Add Ladder Element. New shortcuts: Ctrl+I, F2, F4 / Shift+F4, Alt+0, Alt+1, Shift+F10,
  Home/End, Ctrl+Home/End, Ctrl+Enter. The Errors pane has a Search box with history.
- **Cross Reference window** as in the Rockwell help: Type, Scope, Name (* wildcard), Show (All, Destructive,
  Non-Destructive), Refresh; the Logic tab (Element, Container, Routine, Location, Reference, BaseTag,
  Destructive, Description, sorted by a click on a header, double-click goes there) and the Tag tab (aliases).
  **Find All** lists its results in a Search Results tab of the Output window.
- **Branch menu:** Add Branch Level (after the level at the caret), Append New Level, Move Branch Rail.
- **New Project only declares the controller** (Controller, Name, Revision, Chassis, Slot, Description).
  Drivers, the emulated controller and I/O modules are set up any time after. File > New Component holds Tag
  and Module.
- **Chassis:** one row of 4 or 8 slots, an empty slot as big as a module; an old 7/10/12-slot chassis becomes 8
  when its modules fit. Each I/O card has an **RTB door** over its terminals that opens on its hinge. Discrete
  cards show their status indicators in two rows, 0-7 and 8-15.
- **Logix Emulate:** right-click an empty slot, then Create. The emulated controller has a Revision and a Memory
  Size (3072 KB by default).
- **Module tags:** each module makes its `Local:<slot>:C`, `:I` and `:O` tags in Controller Tags (read-only,
  live online). **Edit Tags** is a grid (Name, Alias For, Base Tag, Data Type, Style, Description, Usage,
  Constant) with a blank last row for a new tag.
- **RSLinx Classic window:** menu bar, RSWho (tree, Autobrowse, Refresh) and Configure Drivers (Available Driver
  Types, Add New with a 15-character name, Configured Drivers with Status, Start, Stop, Delete).
- **Drag and drop as in the reference:** white squares mark where an element can go, one green circle where it
  will. Ctrl copies, and so does a drop on another routine. The tag name alone copies the operand; the rung number
  moves the rung; the left rail of a branch moves that level, the right rail its end.
- **Online edits with edit zones:** Start Pending Rung Edits copies the rung: the copy is `i` (dashed rail) with the
  original `r` below, read-only. Accept makes them `I` and `R`; a rung deleted in Run is `D`; Test runs the `I`
  rungs, Assemble removes `R` and `D`, Cancel restores. A changed instruction shows `*` until Verify.
- **Run look:** thick green rails, long green bars on both sides of a true instruction, red ▸ON / ▸OFF for a forced
  bit, a triangle in the Forces box; the online bar LEDs read Run Mode, Controller OK, Energy Storage OK, I/O OK.
  Pasting an instruction on a selected rung puts it at the start of the rung.
- **Communications feel real:** RSWho and Who Active browse node by node; Go Online connects first; Download and
  Upload show their stages with a progress bar and Cancel; a COMM LED blinks while data moves. Options > Fast
  communications skips the delays.
- **Smoother on slow devices:** live values redraw only what changed (the ladder up to 20 times a second, Monitor
  Tags cell by cell); scrolling a 200-rung ladder on a slow CPU went from about 3 to over 40 frames a second.
- Fixed: "Remove module" in a module's menu opened the Module I/O window; the Emulator panel's header buttons
  were cut off in a narrow side panel.

### Changed (MT PLC Studio 0.4.0-beta.3): tag addresses, moving instructions, tablet portrait, no project kept in the app (owner)
- **Projects live in files only.** The app keeps no project inside it any more: it starts on a start page with
  New Project and Open Project (a .mtp or .L5X file on the device's storage), and the files opened lately. Save with
  Save or Save As; a browser asks before closing with unsaved changes.
- **New Tag, Alias For:** a tag browser as in the reference: the I/O tags of the modules (`Local:<slot>:I` and `O`)
  open to their members (`.Fault`, `.Data`), an integer has a **+** that opens its bits (0 to 31), then the
  controller and program tags. The alias's data type is shown, and an address that names nothing in the project
  (for example a slot with no module) is refused with the reason.
- **I/O data as on the reference's discrete modules:** `Local:<slot>:I.Data` and `Local:<slot>:O.Data` are DINT.
- **Tag names follow the reference's rules:** no two underscores in a row and no underscore at the end.
- **Move an instruction to any node:** with the mouse, drag it (Ctrl copies); on a touch screen, hold it until it is
  lifted, then drag it. The nodes it can go to are shown (before or after an instruction, on a branch level, at the
  end of a rung, on another rung). Hold and let go without moving gives its menu; tap selects, tap again edits.
- **Tablet portrait:** the instruction buttons are above the ladder, and the Errors pane (errors, warnings,
  messages) is at the bottom of the window.

### Changed (MT PLC Studio 0.4.0-beta.2): the SIM card and generic module removed; smaller modules (owner)
- **Removed:** the SIM-16 simulator card and the Generic Module of 0.4.0-beta.1. The I/O cards stay as they were:
  inputs `Local:<slot>:I.Data.<bit>`, outputs `Local:<slot>:O.Data.<bit>`, as for the reference's discrete modules.
  A saved project with a generic module opens without it (a message says so); a SIM card in the emulator is dropped.
- **Kept:** the Virtual Backplane driver (`VBP-1\<slot>`), the controller's slot and the Download slot check, the
  wizard order, the phone fixes.
- **Smaller modules:** narrower slots, the terminal block in four columns with small screws, shorter fronts, so the
  ladder keeps most of the screen.

### Changed (MT PLC Studio 0.4.0-beta.1): set up and run as with the reference emulator
The steps are now those of the reference software (owner's walkthrough of Studio 5000, RSLinx Classic and Logix
Emulate): communications driver, emulated controller and I/O simulator, new project with its controller slot, generic
module in the I/O configuration, alias tags, ladder, Who Active, Download, Run, and the simulator's I/O Data.
- **SIM-16 I/O simulator card** in the emulator: 16 inputs and 16 outputs in one module. A tap on the card (or its I/O
  button) opens its I/O Data: inputs toggled with a tap, outputs lit. Its front shows the IN and OUT points.
- **Generic Module** in the I/O Configuration (Logic > New Module, or the backplane in the organizer): comm format
  (Data - DINT / INT / SINT) and the input, output and configuration assembly instances and sizes. Its tags are
  `Local:<slot>:I.Data[]` and `Local:<slot>:O.Data[]`. With the SIM card (Data - DINT, Input 1 / 2, Output 2 / 1,
  Configuration 3 / 0) the inputs are `Local:3:I.Data[1].0` to `.15` and the outputs `Local:3:O.Data[0].0` to `.15`.
  A wrong size gives module fault 16#0109; another card 16#0116; an empty slot 16#0204. The tag lists offer these points.
- **Virtual Backplane driver** (Communications > Configure Drivers, listed first): reaches the emulator's chassis slot
  by slot; the path is `VBP-1\<slot>`. Who Active shows VBP-1 → Virtual Chassis → the slots. Emulate Ethernet stays.
- **The controller's slot** in the project (Controller Properties > General, Edit > Controller Properties): modules
  can use any other slot; Download refuses when the controller at the path is in another slot, and says why.
- **Setup wizard** in the reference's order: Virtual Backplane driver; controller and SIM-16 card; New Project (the SIM
  card becomes a Generic Module); Who Active; ladder. Quick setup does the same.
- **Phone:** the setup wizard fits the screen (its buttons were off to the side); the chassis wraps 3 slots per row so
  every card is on screen.

### Fixed (MT PLC Studio 0.3.0-beta.6): a TON left with Accum "?" (owner, Android tablet)
- **Timers and counters start with Accum 0**, so only the tag and the preset are asked, as in the reference. OK in the
  operand box with an empty Accum also puts 0.
- **Error lines show the operand's name** beside the reference's wording ("Operand 2" of a TON: Accum).
- **A tap on an error line opens the operand box** on the instruction and the operand it names.

### Changed (MT PLC Studio 0.3.0-beta.5): every instruction checked against the reference
- **Tag browser in the operand box, as in the reference:** a structure's members (T1.DN, T1.ACC, C1.DN …), the bits of
  a SINT / INT / DINT (D1.0 to D1.31) and the elements of an array (Recipe[0] …) are listed folded under their tag.
- **Expressions (CMP, CPT):** the tags that match the word being typed are listed and tapping one puts it in the
  expression; operator buttons (+ − * / MOD ( ) = <> < <= > >= AND OR NOT ABS SQR). The list heading keeps one line so
  the buttons do not move while typing.
- **JSR** lists the other routines of the program (not the routine itself); **JMP / LBL** list the labels and jump
  targets of the routine; **SWPB** lists its order modes.
- **Phone and tablet keyboards:** number operands open the number pad; tag names are not capitalized or autocorrected.
- **Box instructions widen** to show long operands in full (they were cut off on a phone).
- **Engine, as in the reference:** a negative timer .PRE or .ACC is a major fault (type 4, code 34); COP copies bytes
  between SINT, INT, DINT and REAL and takes a single tag as well as an array element; BTD drops the bits that run past
  bit 31 instead of refusing the rung.
- **Tests:** `tests/mtps-ref.test.js` checks every instruction against the reference (67 checks, part of `npm test`);
  `npm run audit` adds every instruction through the screens on a desktop, an Android tablet and an Android phone
  (touch) and runs a program with all of them.

### Fixed (MT PLC Studio 0.3.0-beta.4): found by building and running a motor seal-in on the Windows app
- **Ctrl+W no longer closes the Windows app.** The built-in window menu is gone; in the operand box Ctrl+W creates the
  typed tag, as the hint says. In a browser, where Ctrl+W closes the tab, the hint is not shown.
- **Setup wizard:** a step shows ✓ only when the steps before it are done; the Next button no longer turns white under
  the mouse (all primary buttons keep their colour).
- **New Tag:** Alias For is hidden for a Base tag, and its suggestions are listed inside the dialog instead of a list
  that stayed open over the Create button. Rows marked hidden now stay hidden everywhere.
- **Module I/O window** opens beside the module that was tapped, not over the ladder.
- **Download:** "Return the controller to Remote Run?" is asked only when the controller was running before the
  download, as in the reference.

### Changed (MT PLC Studio 0.3.0-beta.3): operands, organizer, emulator panel and help as in RSLogix 5000
- **Operands, one by one:** each operand inside an instruction box (Timer, Preset, Source, Dest…) can be selected on its
  own. A double-click opens the operand editor on that operand. A right-click (long-press) gives Edit "operand", New
  "tag", Edit "tag" Properties and Edit "tag" Description. Ctrl+D edits the description of the selected operand.
- **Box instructions show the description** of their main operand above them, like contacts and coils.
- **The operand editor keeps its size** while typing, so OK and Cancel stay in place.
- **Controller Organizer:**
  - Task, Program and Routine Properties (General, Configuration, Program Schedule, Monitor with scan times), from
    a double-click or the right-click menu. Controller Properties adds Date/Time, Advanced, File and Memory.
  - A tap on a folder, the controller, a task or a program folds it open or shut; rows are taller on touch screens.
  - Inhibit Task and Inhibit Program stop their logic.
- **Emulator panel:**
  - In landscape it is docked to the right of the ladder by default; it can be moved under the ladder and back.
  - It folds to a thin bar, like the organizer, and opens again from the bar.
  - The modules keep their size instead of stretching across the panel.
  - On a tablet in portrait the organizer drawer no longer covers it.
- **Module I/O window:** smaller, with the inputs and outputs of the chassis together. Each input point is a button
  that switches it and lights green; output points light amber. A tap on an I/O module opens it.
- **Tablet menu:** the menu groups fold again (they all showed open before).
- **Instruction Help** is laid out like the reference: a contents list, then for each instruction the operands table
  (type, format, description), description, arithmetic status flags, fault conditions, the execution table
  (Prescan, rung-condition-in false / true, Postscan) and a drawn example rung. A plain-language summary (English or
  Filipino) is folded at the end.
- **Getting Started** (Help menu) replaces the Tips and the first-start card.

### Changed (MT PLC Studio 0.3.0-beta.2): the owner's 14 points, with RSLogix 5000 and Logix Emulate as the reference
- **Ladder:** the power rails run unbroken from the first rung down to (End), as in the reference editor.
- **Descriptions:** any instruction operand can get a description (Edit Main Operand Description). For a tag, it is
  the tag's description; for an I/O point or a member, it is a description of that operand. It shows above the
  instruction.
- **Workspace tabs:** each routine and the tag table open in tabs that stay open, each with a close (×) button.
  Making a new routine opens it in a new tab and keeps the others.
- **Monitor Tags / Edit Tags** is a table in a tab, as in the reference:
  - Monitor: Name, Value, Force Mask, Style, Data Type, Description, with live values.
  - Edit: Name, Alias For, Data Type, Style, Description, and a row for a new tag.
- **I/O modules:** the module front is a terminal block with screws, under the LED points. A right-click (long-press
  on touch) on a module, or its I/O button, opens a **Module I/O** window of its own (as in Logix Emulate): input
  switches, analog sliders and values, and the output lamps. It can be moved and works in the Emulator window too.
  The Toggle / Push choice is gone.
- **Chassis rows:** a chassis past 8 slots (6 on a tablet or phone) goes on in a new row. Each row can be folded away.
- **Tablet portrait:**
  - One status row holds the key switch, the mode (Rem Run / Rem Prog), forces, online edits and the path.
  - The Errors handle stays in place while the instruction row scrolls.
  - On touch, an instruction is dragged only after it is held for a moment, so the row can be scrolled.
  - The organizer has Controller Properties and a close button.
  - The menu folds open one group at a time without redrawing (no flicker). It was broken past the File menu.
- **Project files on the device:**
  - Open, Save, Save As, Import L5X and Export L5X use the app's own file browser: places (MT PLC Studio Projects,
    Documents, Desktop, Downloads, the drives), folders, New Folder, the file name and the type.
  - Windows keeps the files in the folders picked (default Documents\MT PLC Studio Projects); Android in its
    Documents folder; a browser keeps them in its own storage.
  - The built-in project list is gone. The projects kept there before are moved into files on the first start.
  - Upload asks first, opens the controller's project online, then asks where to save its file.
- **Instruction Help (F1):** for every instruction, a **Simple** tab (what it does, how it works, an example rung,
  an everyday comparison) and a **Reference** tab (operands, rung text, the rules), in **English or Taglish**.
- **Tips:** how to select, edit, open menus and add instructions. A card offers them on the first start; they stay in
  Help > Tips.

### Added (MT PLC Studio 0.3.0-beta.1): the five proposals
- **Setup wizard** (first start, File > New Project), in the order of a real first project:
  1. Communications: Configure Drivers, add the Emulate Ethernet driver.
  2. Emulator: a controller with an IP address.
  3. New Project: the controller and I/O of the emulator chassis.
  4. Who Active: Set Project Path.
  5. Ladder.
  - Quick setup does it all at once.
  - **Configure Drivers** is also in the Communications menu. Without a running driver, Who Active finds nothing and
    Go Online says why.
- **Emulator beside the ladder:**
  - Docked under the ladder on Windows and in tablet portrait, at the side in tablet landscape, and as a Ladder /
    Emulator tab on the phone.
  - Resized by dragging the bar.
  - The rack fits the panel without scrolling; a narrow panel shows only the used slots and one empty slot.
- **The chassis looks like hardware:** a power supply, rails with screws, numbered slots, and a backplane connector in
  each empty slot. Each module has its front face (display and LEDs, or the I/O LED matrix) and a terminal block with
  the field switches or lamps. Chassis have 4 to 12 slots.
- **Tag Browser in the operand box:**
  - Search as you type, with the match marked.
  - All / Inputs / Outputs / Tags / System chips and a scope list.
  - Recent tags.
  - Groups that fold, and timers and counters folded under their tag.
  - ↑ ↓ Enter to pick from the keyboard.
- **Classic look** (the default): light grey, square and compact, like the Windows programming software.
  - The toolbar has Who Active, the path, Go Online, Download and Upload.
  - The organizer tree is compact.
  - Options > Density sets Compact or Touch.
  - In tablet portrait: one row of instructions with "All…", and the menu folds open one menu at a time. Who Active is
    on every screen size.
- **Project files:**
  - **.mtp** project files with Open File and Save As. Windows uses its own file dialogs; Save keeps writing the same
    file.
  - Upload can save to a .mtp file.
  - **Import and Export L5X** (RSLogix 5000 XML): controller, I/O modules, tags, programs and rungs.

### Changed (MT PLC Studio 0.2.0-beta.3): Download, Upload, Go Online and online edits work as in RSLogix 5000
- **Path bar** on the toolbar, with a button that opens Who Active.
- **Connected To Go Online** now comes up in more cases, and shows the path, the name, the mode and the contents of
  the project in the controller beside the offline project:
  - when the controller holds another project or version;
  - when the controller is empty ("The controller contains no project").
  - The choices are **Select File**, Upload and Download.
- **Download** asks first; a running controller goes to Remote Program. Then a progress dialog, then "Return the
  controller to Remote Run?".
- **Upload** asks for the project file to save it in (a new one, or one that is replaced), shows a progress dialog,
  then goes online.
- **Upload Tag Values** (Communications menu), and **Save while online** asks whether to upload the tag values.
  Different tag values or another project name no longer count as edits.
- **Remote Test** mode: the logic runs, the outputs stay off.
- **Online edits in Run:**
  - Accept Pending Edits: the rung is marked **e**, then **i**. The controller still runs the old logic.
  - Test Accepted Edits: marked **I**. The controller runs the new logic.
  - Untest goes back to the old logic. Assemble keeps the new logic. Cancel Pending and Cancel Accepted Edits undo.
  - In Program mode, Accept finalizes the edits at once.
- **Emulator snapshots:** add and restore a saved state of the chassis and controllers.

### Changed (MT PLC Studio 0.2.0-beta.2): the emulator works like FactoryTalk Logix Echo
- **Emulator dashboard** (Communications > Emulator) with the three panes of the reference emulator:
  - **Devices:** chassis, then cards as "[slot] name".
  - **Controller:** vendor, type, revision, name, description, **IP address**, chassis, slot, and power **On/Off**.
  - **Device Status:** every controller with its on/off switch, **Run / Remote / Program**, Run and OK lights and its
    fault message.
- **Several chassis:** Add Chassis, Add Controller (with the next free 127.0.0.x address) and Add I/O Card.
- **Connecting over Ethernet:**
  - Who Active lists each controller that is on and has an IP address, then the backplane of its chassis.
  - The project path is `Emulate\<ip>\Backplane\<slot>`.
  - Turning a controller off drops the app offline; turning it on starts it again with its project.
- **"[Emulator]"** shows in the title bars while online.
- **Without I/O cards**, the I/O modules fault and their input tags can be written or toggled, as on Logix Echo. The
  I/O cards stay as an addition (field switches and lamps).

### Added (MT PLC Studio 0.2.0-beta.1)
- **Emulated chassis.** The controller is now a card in a rack, as in a PC emulator, and the app is the programming
  terminal that connects to it.
  - **Chassis Monitor** (Communications menu):
    - A 10-slot rack: insert or remove controller and I/O cards.
    - LEDs, and a key switch on the controller.
    - Field switches on input cards, lamps on output cards.
    - *Fault* on an I/O card.
    - *Open in a window* puts it beside the ladder.
  - **Who Active:** browse the virtual backplane and pick the controller. Its path (`Virtual\Backplane\<slot>`)
    becomes the project path. Upload, Download and Go Online all go through that path.
  - **Real I/O behaviour:**
    - The project's I/O configuration must match the cards in the chassis.
    - An empty slot or a faulted card gives code 16#0204; the wrong card gives 16#0116.
    - Removing the controller card while online drops the app offline.
  - The chassis and the projects in its controllers are kept when the app restarts.
- The I/O panel now shows the cards of the chassis.

### MT PLC Studio 0.1.0 (first stable release)
- The beta 1 to 3 changes below, as the first stable version. Apps on Stable and on Beta both get it as an in-app update.

### Fixed (MT PLC Studio 0.1.0-beta.3)
- **Branches:** tapping a branch on the tablet or phone no longer breaks the screen.
- **Branch levels:** each level of a branch, empty or not, can now be selected.
  - A new instruction goes into the selected level, from the toolbar or by drag and drop.
  - Delete removes the level (*Delete Branch Level*). The branch rail is easier to hit with a finger.
- **Adding an instruction from the toolbar:** its operand box no longer closes by itself right after it opens.
  This happened on touch screens above all.
- **The controller keeps scanning when the window is hidden or minimised**, like a real PLC.
  Before, it ran only while the screen redrew.
- **The operand box focuses the operand**, not the instruction name, and names the operands (*Bit*,
  *Storage Bit*, *Structure*, *Label Name*).

### Added (MT PLC Studio 0.1.0-beta.3)
- **Online edits:** the ladder can be edited while online, in Program or Run mode.
  - The edits wait as *Edits Present*, with **Accept Edits** and **Cancel Edits** (bar on top, Logic menu).
  - Accept sends the new logic to the controller without a Download and without leaving Run.
  - Tag values, timer and counter accums stay; an edited preset is used.
  - Modules and controller settings still need Go Offline.
- **The tag list of the operand box is grouped** into Inputs, Outputs, Tags and System.
  - A contact (XIC, XIO) shows Inputs first; a coil (OTE, OTL, OTU) shows Outputs first.
  - Each I/O point says its slot and module. A tag aliased to an I/O point sits with that point's group.
  - An operand that already names a tag shows the whole list, with that tag marked.

### Fixed (MT PLC Studio 0.1.0-beta.2)
- **Selecting instructions:** after a long-press, or while a running timer redraws the ladder, taps were read as a
  pinch and nothing could be selected any more. The ladder now follows each finger or click until it is released.
- **Zoom no longer lags:** one redraw per frame, and the ladder no longer redraws over and over when a scrollbar
  comes and goes.
- **Toggle Bit on an input** (such as a push button) now switches its point on the I/O panel, because an input
  follows its field device. Online-only commands used offline say "press Go Online first".
- **First start opens an empty project.** The example is in File > Open.

### Added (MT PLC Studio 0.1.0-beta.2)
- **Module Properties** (click a module in I/O Configuration) with three tabs:
  - General: name, description, slot.
  - Connection: RPI, *Inhibit module*, and *Major fault on controller if the connection fails*.
  - Status: Running / Inhibited / Faulted, fault code and inputs / outputs.
- **Simulate a module fault:** *Fault* on the I/O panel, or in Module Properties, takes the card out.
  - The I/O LED flashes *I/O Not Responding*, a ⚠ shows on the module, and its Fault tag reads 16#FFFFFFFF.
  - With *Major fault on controller* ticked, the controller faults (type 3, code 16).
- **Controller Properties:** General, *Major Faults* (current and recent, Clear Majors) and *Minor Faults*
  (overflows, Clear Minors).
- **Upload:** opens the project that is in the built-in controller, with its current values.
  - Go Online with another version in the controller asks: Upload or Download.
- **Going online shows the I/O panel** (desktop).

### Added
- **MT PLC Studio 0.1.0-beta.1 (preview): a separate app** for tag-based PLC ladder programming and simulation, in
  `mtps/`. It has its own Windows exe, Android APK, icon and in-app updates, and installs next to PLC Trainer.
  - **Three layouts with the same functions:**
    - desktop, like the reference software: menus, toolbars, online bar, Controller Organizer, Errors pane, status bar;
    - tablet: an app bar, the Organizer as a drawer, an instruction bar with 44 px buttons;
    - phone: bottom navigation, a + button and full-screen dialogs.
  - **The layout follows the window.** A resized or maximized Windows window and a tablet in portrait or landscape
    switch live, keeping the routine, the selection and the scroll position.
  - **Ladder editor:**
    - Click / tap selects. Insert an instruction from the toolbar (click, or drag onto a rung), or type a mnemonic.
    - Branch, Branch Level, Add Rung, Delete, Cut / Copy / Paste and Undo / Redo.
    - Edit Rung as text, rung comments, and right-click / long-press menus.
    - The keyboard shortcuts of the reference work, and pinch zooms.
  - **Operand editor with a tag browser** that lists the tags that fit the operand. *New "name"* creates a missing
    tag (BOOL for a bit, TIMER for TON …).
  - **Tags:** Monitor Tags / Edit Tags, controller and program scope, aliases, start values. Online, values can be
    toggled and typed.
  - **Built-in controller:**
    - Verify; Go Online with Download (and "Return the controller to Remote Run?"); Rem Run / Rem Prog and the key switch.
    - Toggle Bit; forces on I/O bits with the ▸ON / ▸OFF marker.
    - Live green bars on true instructions and live timer / counter values.
    - Clear Faults.
  - **I/O panel:** input points (Toggle or Push), output lamps, analog sliders.
  - **Projects** are saved on the device. New / Open / Save As / Import / Export (`.mtps.json`), plus an example
    (motor start / stop with a timer and a counter).
  - **The engine** (`mtps/js/engine.js`, no DOM, `tests/mtps.test.js`): data types, tags, aliases, rung text,
    verify with the reference's lines, modes, prescan, faults, forces and the v1 instruction set.
    - Behaviour checked against the reference's instruction help: DIV by zero, SQR, rounding, `S:MINOR` / `S:V` /
      `S:C`, JMP, TND, MCR and timer pause.
  - **Tests:** `tests/mtps-ui.test.js` (layouts, resize / rotate, editing, New Tag, verify, online, I/O, forces,
    persistence) is part of `npm test`.
  - **Release:** `.github/workflows/release-mtps.yml` publishes tags `mtps-v*` with
    `MT-PLC-Studio-<version>-portable.exe`, `-android.apk` and `-web.zip`. Pages hosts `/mtps/` (Stable) and
    `/mtps/beta/` (Beta) for the in-app updates.
- **Spec and mockups:** `docs/PLC_APP_SPEC.md` (the reference look checked in the VM, tablet and phone layouts,
  release section) and the touch mockup `docs/design/plc-app-mockup-touch.html`.

## [2.5.0] - 2026-10-23

### Fixed
- **Readable text:** no interface text under 11 px. It went down to 8 px: palette labels, data-file bits, status boxes, tabs and small print. Drawings follow their zoom.
- **Controls at least 24 × 24 px (WCAG 2.5.8):** the Data Files F1 / F0 / × were 18 px, and the Wiring colour swatches 18 px.
- **Contrast at least 4.5:1 (WCAG 1.4.3):**
  - white text on the RUN button (it was 2.6:1) and on primary buttons in the dark theme (3.2:1);
  - the ON bit "1" in the data tables (2.8:1);
  - amber text such as "Saving…" and Verify warnings (3.4:1).
- **Phone:** a dialog with a long option (New project) no longer runs past the screen. OK and × were cut off.
- **Tablet and Tagalog:**
  - the top bar stays on one row;
  - the PLC bar scrolls inside itself instead of widening the page (821 / 876 px in an 800 px screen);
  - the instruction palette no longer runs under the program file list.
- **Data Files:** on a narrow panel the 16-bit grid scrolls and opens at bit 0, as in the reference software.
- Measured with the skill's scripts (Playwright, 4 screen sizes, about 350 clicks):
  - text under 11 px: 507 → 0 in the interface;
  - controls under 24 px in the Ladder: 51 → 0;
  - JS errors: 0, before and after.

### Added
- **CPT (Compute)** in Compute/Math: Dest = an expression of constants and word addresses with + − * **|** (divide) ** and ( ), and SQR, ABS, NEG. Example: `(N7:1+5)*2` or `T4:0.ACC*10|4`.
  - The result is rounded like DIV. Divide by zero or an overflow gives 32767 / −32768 and sets S:0/1.
  - As in the controller, divide is `|`, because `/` belongs to bit addresses. Typing `/` gets a message that says so. A bit address is refused as a value.
  - Spaces typed in the expression are taken out. A long expression is cut in the box, and the Selected instruction panel shows all of it.
- **New Tag from an operand:** typing a name that is not a tag yet (`XIC START_PB`) offers to create it with the type the operand needs: BOOL for a bit, INT for a word, TIMER or COUNTER. The instruction then takes it.
- **Tag browser:** an operand lists the project's tags that fit it first. A bit gets BOOL and bit aliases plus TIMER .DN/.TT/.EN; a word gets INT plus .ACC/.PRE; a timer or counter operand gets its own type.

## [2.4.0] - 2026-10-23

### Fixed
- **Import:** a project whose name is already in the list opens as "name (2)", so Open project no longer shows two projects with the same name.
- **HMI Studio:** a new Go to Screen button goes to the next screen and is named after it ("▶ ALARMS"). Before, it was "NEXT ▶" and pointed at Main, even on Main itself.

### Fixed
- **Electrical Diagram:** an opened project shows its whole drawing (Fit, no bigger than 100 %). It used to open on the corner the last project was looking at, so the star-delta power circuit was off screen.
- **Electrical Diagram:** a timer coil's tag (-KT1) no longer lies on the symbol.
- **Phone Ladder:** the instruction palette has a row of its own, and the other tools are one scrolling row under it with **+ Rung** first. Before, the status box filled the width (one instruction in sight) and + Rung was far off to the right. The bar above stays the controller.
- **Phone Learn:** tapping a lesson or exercise in the list brings its page into sight. The page used to open below the long list, out of view.
- **Workbench:** the Ladder toolbar beside the Wiring and HMI is about 110 px shorter (356 → 247 px at 1280 × 800). The bar above is the controller, the instruction palette is one scrolling row, and the groups wrap as a whole, so more rungs are in sight.
- **Long programs:** a Ladder of 500 rungs with errors redraws in about 0.14 s instead of 1.8 s after every click or edit. Each rung used to search the whole program for every error.
- **Wiring:** Fit leaves the hint line at the bottom out, so the lowest devices (the practice board lamps) are no longer under it.
- **I/O strip** in the bar: an ON input or output is green, as in the Data Files (it was amber, the colour of a forced bit).
- **Address style** "File-based (I:e/b)" and the PLC target name use SLC element/bit notation. "I:1/0" was wrong for the compact PLC (I:0/0).
- **Examples:** "Three motors" is no longer called an IEC diagram; the Electrical Diagram is free draw only.

### Changed
- **New look: "Engineering Neutral"** (`docs/DESIGN_SYSTEM.md`):
  - neutral grey surfaces in light and dark;
  - blue for interaction and selection, with green, amber and red kept for PLC state (RUN, forced, fault);
  - one sans font for the interface and mono for addresses and values, with no serif or italics in the working views;
  - one control height and radius scale, and a keyboard focus ring;
  - the view switcher is flat, with the active view underlined.
  
  Device drawings keep their real colours.
- **Tablet layout:**
  - the top bar stays on one row;
  - the ladder toolbar is one row that scrolls sideways instead of five stacked rows.
  
  On a 834 × 1112 tablet the first rung now starts at 171 px instead of 448 px.
- **One set of controller lights:** with the Ladder alone on screen, its status box (RUN / OK / BAT / I/O, forces, path) is the controller, and the bar's POWER / RUN / FORCE / FAULT lights step back. Other views and side-by-side layouts keep them. Below 1100 px the bar's I/O strip is hidden instead of cut to a few cells.
- **Electrical Diagram:** a project whose devices are only in the Wiring now says so, and names the examples with a finished diagram, instead of just "Empty drawing".

- **Learn:**
  - each exercise has its own project. Start offers **Continue** or **Start over**, instead of a new project every time.
  - **Check my work** only grades the exercise's own project.
  - **The solution** goes into that project (Ctrl+Z undoes it). Passing with the solution is not counted as done.
  - Switching tabs shows an exercise or a lesson to match.
- **Ladder:**
  - **Find…** in the instruction palette: type a mnemonic or words of its name ("on delay", "compare"), and Enter adds it.
  - Error and warning lines in the Errors pane go to their rung.
  - Address errors say what is wrong (bit 0–15, a word or timer without its bit, an unknown file, a name that is not a tag).
  - The timer help explains Preset × Time Base.
- **Wiring:** undo and redo (Ctrl+Z / Ctrl+Y and ↶ ↷) for every change: placing, moving, wiring, deleting.
- **One icon set:** every toolbar and dialog button uses the same line icons (download, undo, zoom, Who Active, network…) instead of emoji and symbols. Labels stay, and Tagalog still translates them.
- **Ladder:**
  - **Selected instruction** panel at the top of the side panel: the operands with live values (bits; PRE / ACC / EN TT DN), a timer's delay, the description, **Used in** (every other rung with the same address, as links), and Edit operands.
  - The palette shows each instruction's mnemonic under its glyph.
  - The toolbar fits two rows on a 1440 px screen.
- **HMI Studio:** undo and redo (Ctrl+Z / Ctrl+Y and ↶ ↷) for every edit.
- **Open project:** a deleted project can be restored from the toast for a few seconds.
- **Dialogs:** Tab stays inside a dialog, and focus returns where it was when the dialog closes.
- **Organizer:** a project tree, with the open routine marked.
- **HMI Studio:** objects in Controls, Indicators, Equipment and Drawing groups.
- **Dialogs and menus:**
  - destructive confirms are red and start on Cancel, and Enter presses the focused button;
  - menus close with Escape and move with ↑ ↓.

### Fixed
- **PROG → RUN now behaves like the controller's prescan.**
  - A seal-in held by an internal bit drops out, and on-delay timers start again.
  - A latched output (OTL) is still on when the processor returns to RUN. It used to be lost, and an internal seal-in used to come back on.
  - Outside RUN the output terminals are off and the output image is kept.
- **Work could be lost:**
  - "Insert solution into ladder" no longer replaces the program of whatever project is open.
  - The same project open in two windows no longer overwrites the other window's changes without a word: saving pauses and asks which version to keep.
  - The Wiring had no undo.
- **Ladder:** cancelling the address dialog of a new instruction no longer leaves an `XIC I:0/0` behind.
- **Import and open:** rungs that cannot be read are reported, and a file with no project parts is refused with the reason.
- **Routine names** of the tag-based controller keep their case and length when the project is opened again.
- **Verify** of a long program is about 5× faster (500 rungs: 1.1 s → 0.2 s).
- **Timers in a background tab** keep real time. The browser runs a hidden tab only about once a second, and the PLC used to count just 0.1 s of it.
- **Project name:** a very long name no longer widens the top bar, and renaming to an empty name is refused.
- **Phone and tablet:** the whole app could be panned sideways on the Ladder. Hidden instruction names escaped the scrolling toolbar and made the page 823 px wide on a 390 px phone.
- **Electrical Diagram:** a second symbol from the library no longer lands exactly on top of the first one. It goes to the next free spot.
- **HMI:** an alarm banner that is not active shows "No active alarm" instead of the alarm text in grey. Studio still shows the text.
- **HMI Studio:** an empty screen says "add objects from the toolbar above" on one line, instead of "switch to Studio" split over three lines while already in Studio.
- **Update notice:** a new build of the same version names the builds, instead of "v2.3.0 is ready. You have v2.3.0".
- **Lessons:** "Running feedback and a discrepancy alarm" is now lesson 12, in the Circuits group where it is listed. Lessons 12–16 become 13–17.
- **Phone:** the view tabs use drawn icons of one size (the Wiring glyph was tiny), and the "Saved" pill is no longer cut off by a long project name.
- **Tablet Ladder:**
  - a short rung fits the pane, so its coil is in sight. Rungs used to be at least 600 px wide and ran past an 834 px tablet's pane.
  - up to 1024 px the status box steps back as intended (a later rule kept it on screen), so the instruction palette is about twice as wide;
  - all 16 bits of the Data Files grid fit beside the ladder. Bits 2–0 were scrolled out of sight.
- **Data Files:** an ON bit is green (energized) instead of amber, the colour of a forced bit.
- **Wiring toolbar:** Zoom and Fit stay together, and on a tablet the toolbar is two rows instead of three.
- **Phone Ladder:** the Errors pane head is one row; the chips wrapped and "Rung n of m" was cut off.
- **Phone Electrical Diagram:** the toolbar buttons show their icons (they were empty boxes), and the empty-drawing hint wraps instead of running off the screen.

### Added
- **Task strip:** while an exercise's project is open, a strip above the work shows the exercise and its task, with **Task** (back to it in Learn) and **✓ Check my work**. You no longer have to switch to Learn to read the task again.
- **100 exercises** in Learn → Exercises: 25 easy, 40 medium and 35 hard, by topic (contacts and logic, seal-in and latches, timers, counters, compare and math, sequences, motor control, process, Electrical Diagram, Wiring, HMI, and integration of every module). Each has a hint, a starting project, **Check my work** and a solution. Ladder exercises are run on a simulated PLC. Drawing, wiring and HMI exercises are checked on your own project: the checker presses your buttons and switches the PLC to RUN when needed. Done exercises are ticked and counted.
- **Practice board 16**: the 16 in / 12 out compact PLC with START, STOP, four push buttons, two selectors and eight lamps, for the medium and hard exercises.
- **Learn** has two tabs, Course (the lessons) and Exercises (by difficulty with a topic filter). The **Examples** menu is grouped by category: practice boards, motor control, process, hardware and cabinet.
- **PLC target per project**: *File-based controller* (rack with data files, addresses I:1/0) or *Tag-based controller, 1756-style chassis* (addresses Local:1:I.Data.0). Pick it in File → New project or at the top of the I/O Configuration; it is saved with the project, and projects made before it open as file-based, unchanged. The Wiring library follows it (file-based: compact controllers and rack modules; tag-based: chassis modules only), the rack modules are drawn in the look of the target (a rack look with an LED window and a door, or the 1756-style look), and the address style follows the target. The Organizer speaks the target's language: a Project Tree with Program Files (SYS 0, SYS 1, LAD 2 – MAIN, LAD 3…) and Data Files (O0 … N7, a click opens the data table), or Tasks → MainTask → MainProgram → MainRoutine with the routines by name and the backplane slots (Local:1…). The ladder's file list shows MainRoutine and ＋ Routine for tag-based projects. The I/O Configuration lists the data file or the tags of each slot.
- **PLC chassis** in the Wiring (PLC Rack): a backplane with a power-supply bay and 4, 7, 10 or 13 slots. With a chassis in the Wiring, a new power supply goes to its bay, the controller to slot 0 and each I/O module to the first free slot. A module dragged onto the chassis snaps into a slot and takes that slot's number (I:3/0 or Local:3:I.Data.0 for slot 3); picking a slot number moves it there; a taken slot, slot 0 or slots 8–12 send it back with a message. Moving the chassis moves its modules. It is drawn in the look of the PLC target. Projects without a chassis are unchanged.
- **Organizer docked on the left of the Ladder** (the Organizer button opens and closes it; it stays as you left it): the path to the controller found in the Wiring, the project tree in the target's terms, and the I/O tree with the chassis and every configured or installed module. A module that does not match the I/O Configuration, or a chassis of another size, is marked ⚠ with the reason.
- **Chassis size in the I/O Configuration**: once set (or copied with Read I/O Config), a chassis of another size in the Wiring is a fault and RUN is refused, like a module in the wrong slot. Projects without it are not checked.
- **Communication like real PLC software** (Realistic connection): an **Engineering PC** in the Wiring (PLC Rack) with a comms driver you start on its screen, a USB port for the controller's new programming port (USB on the chassis controller, PORT on the compact PLCs) and an Ethernet port for the new **PLC Ethernet Module** (a slot in the chassis, with an IP address, configured in the I/O Configuration, no I/O words). In the Ladder, **Who Active** (Online group) shows what the PC reaches: driver → USB or Ethernet → IP → backplane → controller and modules, or why nothing is found. **Set Project Path** remembers it (a compact PLC in a tag-based project is refused); Go Online and Download need that path. Pulling the cable or stopping the driver while online gives **Communication lost** and goes offline. A Realistic project with no controller in the Wiring still runs on the virtual controller.
- **I/O faults follow the PLC target**: a tag-based (1756-style) controller keeps running when a module does not match the I/O Configuration — that module faults (inactive, ⚠ in the Organizer, logged once as an alarm, "cleared" when fixed) and its I/O light turns red; a chassis of another size faults every module. A file-based processor still refuses RUN and stops on a mismatch. The Organizer's I/O tree has **＋ New Module…**.
- **Routines and program files in the Organizer**: ＋ New Routine… (tag-based) or ＋ New Program File… (file-based), and ✎ rename / 🗑 delete on each one. In a tag-based project a JSR shows and picks the routine **by name** (stored as U:n, so older projects are unchanged); renaming keeps every JSR, deleting one that a JSR calls makes that JSR an error in Verify.
- **New Ladder toolbar in the layout of PLC programming software**: a **status box** (Offline / Online · Run / Program, forces, edits, RUN / OK / BAT / I/O lights; click it for Go Online / Offline, Download, Upload, Who Active, Run / Program Mode and the connection), the **path** to the controller, and a **tabbed instruction palette** (Favorites, Bit, Timer/Counter, Compare, Math/Move, File/Seq, Program) with small instruction buttons instead of one long row of large ones; the tab is remembered.
- **Tag editor with Monitor Tags and Edit Tags**: Edit Tags is a grid (name, data type, alias / address, description) edited in place — Enter or Tab saves the cell, the last row adds a tag, a rename changes the program too, a bad name is refused with a message.
- **Aligned with the reference programming software** (`docs/ROCKWELL_UI_STUDY.md`): the online bar has the RUN / OK / BAT / I/O light stack, a key switch, the mode box (Offline, Rem Prog, Rem Run) with `Path: Backplane\0` style paths, and No Forces / No Edits boxes; the instruction tabs follow the reference order (Favorites, Bit, Timer/Counter, Input/Output, Compare, Compute/Math, Move/Logical, File/Misc, Program Control); an **Errors pane** under the ladder (N Errors / N Warnings / N Messages chips, a log, Rung n of N); an empty rung shows a red ⊗ and is a Verify error; **Download** first shows the connected controller and a DANGER notice, verifies (an error cancels it: "Complete - 1 error(s)", "Cancelling download...") and ends Online, Rem Prog; **Who Active** has Go Online / Upload / Download on the right and Path / Path in Project with Set and Clear Project Path; **New Module…** opens Select Module Type (search, Catalog Number / Description / Category) and then the module page (Type, Parent Local, Slot); the Organizer adds Controller Fault Handler, Power-Up Handler, Parameters and Local Tags, Unscheduled, Data Types and "1756 Backplane, n-slot chassis"; right-click on the controller in the Wiring gives Run Mode / Program Mode / Who Active.
- **Corrections from the verified reference tool**: an alias tag shows its name and, under it, the address it stands for (`STOP_PB1` / `<Local:3:I.Data.0>`); online in RUN the power rails are green; Who Active and Download show the **project in the controller**, and Download warns when it replaces another project and when the controller is in Remote Run (it changes to Remote Program by itself); over a cable the download takes a moment, and a chain broken meanwhile gives **"Communications timed out. Cancelling download..."**; a module that is not the configured one reports **Module fault (Code 16#0022): an invalid reply was received** and the online bar shows **I/O Not Responding**; a file-based controller with an I/O mismatch shows **Faulted** in the mode box with a red OK light.
- **Gap list from the side-by-side check**: Upload is the "not available in the trainer" notice everywhere (also the toolbar button); a new routine starts with rung 0 empty (red ⊗, Verify error); Run / Program Mode are greyed out while offline; with no PLC in the Wiring the status box says Offline and `Path: <none>`; **New Module… works on the project alone** (no hardware needed) and its page has Name, Slot, Description and Connection (RPI, Inhibit Module, Major Fault on connection loss) — an inhibited module is not checked, a mismatch on a "major fault" module stops a tag-based controller, and clicking a module in the Organizer opens its properties; **New project has a second page** (chassis size, controller slot, connection — Realistic by default for tag-based); a tag-based project shows **Controller Tags** (module tags Local:n:I/O, then the tags with value and type) instead of the I and O data files; the Download dialog shows the controller's project as Name (`<no name>` when empty), a Serial Number and Security, and asks once more before overwriting another project; a part added from the Wiring library is placed where it covers no other part; long I/O names no longer overlap in the data table; new example **1756-style chassis: Who Active and Download** (chassis, PC on the USB port, alias tags).
- **Re-verification fixes**: Who Active closes before Go Online / Upload / Download, so their windows are on top and Who Active is fresh next time (the downloaded project on the controller, Go Offline when online); a new tag-based project opens on the Ladder with rung 0 empty; a double-click no longer closes the window it just opened; Module Properties also for an installed module, with a Type you can change and **Remove module**; the PLC status strip stays on one line (the I/O lights and the message are clipped instead); Controller Tags shows only the Tags tab in a tag-based project.
- `docs/ROCKWELL_STUDY.md`: a comparison of the two kinds of programming software and PLC Trainer, item by item (new project, chassis, I/O configuration, addresses, data, program structure, ladder editor, timers, project tree).

### Fixed
- Leaving the Organizer by one of its links no longer leaves an invisible dialog behind that swallowed the next Escape key.
- **Reversing power circuits** in free draw: the wires that cross L1 and L3 over to KM2 no longer loop around the drawing. When a simple wire would lie on a wire of another phase, its crossing part moves to the next free lane (10, 20, 30… either side), the way you would drag it in Simurelay.

### Changed
- **Upload** now only says it is not available in the trainer; Download is the way a program gets into the controller. Go Online offers Download and Compare.
- **The Electrical Diagram is free draw only**, like Simurelay. The IEC and ladder-style views and the Edit / Operate switch are gone (Play operates the drawing). A project or example drawn in the old views opens as a free drawing: each current path becomes a column from its supply point to its return point, and the power circuit sits beside them.
- **One short drawing toolbar**: Library, Play, Rotate, Delete, Undo, Redo and ⋯. Show values, wire colours, Duplicate, Change type and Bring to front / Send to back are in the ⋯ menu.

### Fixed
- **Update bar**: the Android and Windows apps no longer say "v2.3.0 is ready. You have v2.3.0". A built-in copy is offered only a newer version.
- **Dialogs**: Escape in a dialog opened over another dialog (for example New tag over Controller Tags) closes only the top one. A dialog closed from inside the app no longer keeps catching the next Escape or Enter (cancelling a wire, editing an instruction).
- **Switching the update channel** (File → Updates…) no longer says "You have the latest beta version" while the Stable app is still loaded: it says the channel loads on restart and offers **Restart into Beta / Stable**.
- **Moving projects from the Android / Windows app to the hosted app** sends only the projects changed since the last start, newest first, within a safe link size. With many projects (after many exercises) the hand-over could fail silently before.
- **Startup** no longer fails when the saved project list is damaged: bad entries are skipped.
- No third-party product names in the drawing settings and help (wire routing is "Simple (straight connectors)"). The brand check now also reads every string in the app's code, not only the page on screen.
- **Routine names** on the tag-based controller keep their case and take up to 40 letters, digits and _ (they were cut to 10 capitals, "TEST_ROUTI"). File-based program files keep 10 capitals.
- **PLC bar**: the OFFLINE / ONLINE chip shortens with "…" (full text on hover), so Events and Layout stay on the same row on narrower screens.

## [2.3.0] - 2026-10-21

### Changed
- **Free draw works like Simurelay** (behaviour taken from studying Simurelay 3.0.9 itself; our own code and drawings, `docs/SIMURELAY_WALKTHROUGH.md`):
  - **Look**: Simurelay's colours in light and dark (they follow the app theme): canvas, grey/black symbols, teal/green tags and terminal numbers, small square terminals that disappear once wired, a grid of fine lines with a stronger line every four steps, blue selection, and an orange handle on the middle of a selected wire.
  - **Placing and wiring**: a symbol from the library lands in the middle of the view, selected. Click a terminal, then another terminal: the wire. A click anywhere else cancels the wire (no more corners by clicking; drag the middle of a selected wire to move it). The selected symbol shows guide lines through its terminals.
  - **Property bar** at the top in place of the toolbar and the library (double-click, right-click, or Values on a selected symbol): the name and tag, a comment, **TAG** `<` `>` (the prefix: K, KA, KM, KV, R, RA for coils; S, SL for switches; Q, QA; F, FA, FU; H, L; M, MA, MP…), **NUM1** `<` `>` (the number; numbers another device has are skipped), and the device's settings (a time steps by 1 s from 0 to 60 s). Right-click a terminal to change the number written beside it. A click on the drawing closes the bar. The side panel is gone on a computer (its settings are in ⋯ → Settings).
  - **⋯ menu**: New, Open, Capture (picture), Save, Save As, Settings (Show Grid, Show Zoom Panel, Dark Mode, Wires, tags and terminal numbers, and the colours of Element Tag, Comment, Terminal Tag, N, L1, L2, L3, PE, + and −, per theme, with Reset).
  - **Play**: only the drawing and a Stop button stay, with a green line along the top. Everything starts at rest (buttons out, switches and breakers off, timers cleared) and Stop puts it back. Protections work by hand: tap a breaker to switch it, a fuse to blow or replace it, an overload to trip or reset it; nothing trips by itself. A short circuit stops the simulation with "Short circuit detected! Simulation stopped." Wires show their conductor: L1 brown, L2 grey, L3 cyan, N blue, PE yellow, + red, 0 V blue; the energized coil is yellow.
  - **Keys** as Simurelay's (with Ctrl): Ctrl+R rotate, Ctrl+B back, Ctrl+F front, Ctrl+D duplicate, Ctrl+Delete delete, Ctrl+arrows move, Ctrl+V values (paste when something is copied). The old keys still work.
  - **Tags**: a relay coil and its contacts are K1, K2… (was KA); a timer drawn here starts at 2 s.

## [2.2.2] - 2026-10-21

### Added
- **+ and 0 V points work on their own** (free draw, as in Simurelay): when no supply of that conductor is in the Wiring, a 24 V battery is added there for the + / 0 V points (a 1-phase supply for L1 / N / PE, a 3-phase one when L2 or L3 is drawn), and it leaves again with the last point. Before, the points showed "no supply with this conductor in the Wiring" until you added one yourself. Coils drawn before the points get the supply's voltage too.
- **Seal-in branch like Simurelay**: a simple wire may now run over a terminal of its own circuit (the seal-in contact's wire joining at the stop button's terminal 12), with a junction dot there, instead of taking a detour. It still goes around a terminal of another circuit.
- **Comparison with Simurelay, step by step** (`docs/SIMURELAY_WALKTHROUGH.md`): the same seal-in circuit built in both apps.
- **Wires the way Simurelay draws them** (free draw, default): a wire is a simple connector from terminal to terminal. It runs straight when the terminals line up; otherwise out, across and in, so it always goes where you expect, and you drag its middle to move it. Only a wire that would run over another terminal, through a symbol, or on top of another circuit goes around. The router that goes around everything is still there under Drawing settings → Wires.
- **Alignment guides** while you move a symbol: a dashed line shows when one of its terminals is on the line of another terminal, and it snaps onto the line of the terminals it is wired to.
- **Running colours like Simurelay**: red where + (or a phase) reaches, blue where 0 V (or N) reaches, a yellow coil when it pulls in. A connected terminal is drawn as the end of its line (no circle), with teal terminal numbers and the tag upright beside a vertical symbol.
- **Wire style in the Wiring**: Square (routed around the devices), Straight or Curved (cable). The wire being drawn is shown exactly as it will be.
- **AB-style 1756 chassis** (Wiring): every rack module is now drawn as a narrow, tall ControlLogix-like module (70 × 300): a colour stripe and module code on top (PA, L7, IB16, IA16, OW16, OB16, IF4, OF2), ST status LEDs, and a removable terminal block whose two columns of terminals sit on the module's sides, so their wires leave sideways. Leave a gap between modules for the wiring. Before, the 16-point cards were up to 380 wide.
- **Tag-based address style** (*Local:1:I.Data.0*), next to file-based, bit/byte and basic.
- **More I/O, AB-style hardware** (Wiring): a compact PLC with 16 inputs and 12 relay outputs (three output commons, VAC0–VAC2), and 16-point rack cards: 24 VDC input (IB16), 230 VAC input (IA16), relay output (OW16, four commons) and 24 VDC transistor output (OB16). Addresses I:slot/0–15 and O:slot/0–15. Verify, the I/O Configuration, the data table and the diagram symbols know the new points. The 12/8 controller and the 8-point cards stay, so older projects open unchanged.
- **You draw the wire's path** (free draw, as in Simurelay): while drawing a wire, every click on the way is a corner, and **Esc** cancels. **Drag any part of a wire** to move it; the corners follow.
- **Junction dots** where one circuit branches.
- **Wire by dragging** in free draw: press on a terminal, drag to another terminal (or onto a wire for a junction) and let go. Let go on empty space to cancel. Tap, tap still works.
- **Contacts move in the Ladder-style view** too: a closed N.O. is bridged, and an opened N.C. has its blade lifted.
- **Contactor auxiliary block** (front-mounted 2 N.O. + 2 N.C.: 53-54, 61-62, 71-72, 83-84), as on a real contactor. In free draw, a second N.O. (or N.C.) of KM1 is numbered on the block automatically, so a run lamp can be driven by KM1 53-54 while 13-14 holds the seal-in. Before, the second contact became a new KM2 with no coil, and the lamp never lit. The Wiring gets the matching *Contactor + Aux Block 2NO 2NC*.
- **A contact whose coil is drawn nowhere is marked** (dashed, with a tooltip): it would never switch.
- **Livelier run view** in free draw: current flows along the live wires, an energized coil is filled, and a lit lamp glows. A contact that has just switched flashes. All of this follows *reduce motion*.

### Changed
- **Smaller compact controllers**: inputs 16 apart instead of 22 (the 16/12 one is 442 wide, was 522).
- **One look for all the hardware**: flat 2D devices with no shading, and one sans-serif font on every device. The PLC rack is drawn AB-style: charcoal modules with a label plate (module code, kind, slot), a colour stripe by kind (red AC, blue DC, orange relay, green analog), and a numbered status LED for every point. Before, it was a grey-blue rack in a serif font. The timer kind labels no longer cover the terminal numbers.
- **Automatic wire routes are clean**: a wire without corners of its own is routed on the grid with as few bends as possible. It never crosses a symbol, passes over a terminal it does not connect, or runs on top of another circuit's wire. Wires of one circuit share a line and branch with a dot.
- **The Wiring built from the diagram is tidy**: its devices are placed side by side in panel rows (the gap used to grow with every device). Wires without bends are routed around the devices by the same router as the diagram: they never run along a row of terminals (that looked connected to every terminal) or over a device, and never lie on top of another wire.
- **Live voltage in the Wiring** is a thin row of dots flowing along the wire, instead of thick stripes over it.
- **Supply points face the way current flows**: L1, L2, L3 and +24 V have their terminal below the circle (they feed the current path from the top); N, PE and 0 V have it above.
- **Wires route like a drawn diagram**: a wire without bends of its own leaves each terminal straight, goes around symbols, and never passes over a terminal it does not connect (that looked like a connection) or runs on top of another wire.
- **New symbols are placed in columns** (a current path goes down), with room for the terminal numbers.

## [2.2.1] - 2026-10-21

### Fixed
- **A push button's tag no longer covers its push head** (free draw): the tag is written left of the head, as in Simurelay.
- **Contacts move on the drawing** — every one of the 118 library symbols with a contact (checked by a test that switches each): N.O. contacts, main poles, breakers, disconnectors, fuse switches (each pole on its own, so the neutral of a 1P+N / 3P+N stays closed when the fuses blow), changeovers and PLC outputs; a blown fuse is drawn broken; in the IEC view the current paths and the power circuit (breaker, motor breaker, contactor, star-delta) switch too. Before, only the colour changed.
- **Wiring by touch**: tapping one terminal of a symbol and then its other terminal quickly no longer counts as a double tap (the second wire was lost).
- **A new symbol never takes a device that belongs to another circuit**: on the *PLC motor control* example a drawn coil became the 230 V motor contactor KM1 and stayed off; it is now the next contactor (KM2), and a contact goes with the coil on the same drawing.
- **Coil voltage follows the drawn supply**: devices the drawing makes on +24 V / 0 V points get 24 V DC coils (L / N points: 230 V AC).
- **Too low a coil voltage is reported** (message, device status, dashed coil on the drawing) instead of the coil staying silently off.
- **New symbols are placed in the visible part of the drawing**, left to right, never off the edge of a phone screen; no message for every symbol placed.

### Tests
- 9 checks: every library contact symbol is drawn switched when its contact switches; the IEC power poles; the owner's case on the PLC motor example (KM2, 24 V DC, seal-in), moving N.O. and N.C. contacts, the coil voltage warning, quick touch wiring.

## [2.2.0] - 2026-10-21

### Added
- **Names in the symbol library**: every tile shows a short name under its icon — the device, the kind of contact, its timing and terminals (*KA N.O. 11-14*, *KT N.C. T-on 15-16*, *F C/O 95-96/98*); the full name is the tooltip, and on a touch screen a long press on a tile shows the full name and terminals without placing it. The third column of tiles is no longer cut off.
- **Tagging like Simurelay** (Electrical Diagram, free draw): a placed symbol gets its tag at once — the next one of its kind (S1, KM1, KM2…), or for a contact, coil or pole the device of that kind whose part is not drawn yet — with no form (the old form is the option *Ask for a tag when placing a symbol*). **Rename device…** in Properties (or **F2**) renames a device from the diagram: every symbol of it and the device in the Wiring follow. Drawing settings: **show or hide the tags and the terminal numbers**, and a **tag colour**. The library groups follow Simurelay's order (Sources, Switches, Auxiliaries, Coils, Loads, Contactors, Protections, Motors, Others), then Sensors and PLC.
- **Thermal-magnetic MCBs**: the 1P–4P MCBs also trip, after a thermal delay (10 s, a setting), when the motor they feed stays overloaded; an overload relay set faster in the same feeder trips first.
- **3-position selectors I-II-III and I-0-II** (Wiring and Electrical Diagram): common 1 to 2 / 3 / 4, or to 2 / nothing / 3.
- **Source and destination link arrows** in the diagram (arrows with the same tag are connected, as with the link arrow), and **L1 L2 L3** and **L1 L2 L3 N** points in one symbol.
- **docs/SIMURELAY_PARITY.md**: 111 of 114 Simurelay symbols full (97.4%); the generator, impulse coil, earth source and power supply checked against Simurelay's symbol metadata (read with REA, no code).

### Tests
- **Library names** (2 checks): the short name on every tile and its tooltip; a long press on a tile (phone) shows the name and does not place it.
- **Tagging** (8 checks): library order, automatic tags, rename from the diagram (and a refused rename), F2, the Rename button, tag and terminal visibility, tag colour.
- **Parity v2.2** (6 checks): selector positions, MCB thermal trip and selectivity with an overload relay, drawn L1 L2 L3 points running a motor, arrows carrying L1, the drawn I-II-III selector, save and reload.

## [2.1.0] - 2026-10-21

### Fixed (full audit)
- **PLC**: timers in a **periodic task** now count with the task period (they ran up to 10× too fast or too slow). Verify finds a **duplicate OTE** or a **shared timer** also when one of them is written with a tag name. **Forcing** through an alias tag forces the address itself (no second, conflicting force). A tag such as `U:3` or `T4:0` on an HMI object no longer stops the screen updates. In Realistic mode, Verify checks JSR targets against the project's program files. EN/DN lights work for TIMER and COUNTER tags. A counter counting back across an overflow clears OV (and UN), as the controller does.
- **Electrical**: a **VFD** makes its own output: the input phase order does not reverse the motor, a missing input phase stops the drive, a motor on the mains next to it is no longer slowed down, and a short on its output trips the drive. **Earth leakage** is now seen for every load (24 V power supply, valves, cylinders, tank), for a **borrowed neutral** (return to an N that bypasses the RCD) and for N bonded to PE after the RCD; several leaks at once are all handled. A short circuit **before any breaker** no longer trips the breakers after it: it is reported. 0 V tied to N is no longer a short. A star-delta motor with a wrong delta (two windings on the same phases) does not run normally, and a star point tied to N runs. A jammed **DC motor** trips its protection. The HMI terminal no longer starts on reversed 24 V. A tank level from a deleted tank no longer stays in a level transmitter.
- **Electrical Diagram**: free-draw **Type ⇄** keeps the symbol connected (the device the diagram made changes with it, its wires follow the new terminals). A device terminal used both in the current paths and in the free drawing is reported in the view you edit, instead of being wired twice. **Delete** after adding a symbol deletes that symbol (not a power device selected before), and Delete after Undo no longer fails. Wires made by the diagram keep their **bends, colour and wire marker** when the diagram changes. One tag for two kinds of device, or a power supply tag that is not a 3-phase supply, is reported at once and nothing is wired to terminals the device does not have. Devices the diagram added and no longer uses are removed from the Wiring.
- **Wiring**: a device tag must be unique and valid; **renaming** a device that the Electrical Diagram uses renames its symbols too. A wire made by the diagram is not split in the Wiring (change the diagram instead).
- **HMI**: with objects that need a log-in, **✎ Studio** asks for the PIN first, the PIN field is hidden, and going back to the Machine logs out. Trends keep recording while the HMI is not on screen. Limits on screens (30) and free-draw symbols (400) are shown when reached instead of losing the extra ones on reload. The HMI terminal in the Wiring no longer slows down with big images.
- **Speed**: one overloaded motor in a large circuit no longer slows every tick down (200 feeders: 227 ms → 5 ms per tick).
- **Projects and safety**: the controller program saved for the Realistic connection is checked on load like the rest of the project (a hand-edited file could carry bad tags or markup, or stop the app from starting). The hand-over from the Windows/Android app's built-in copy only takes projects (merged by id, the newer one wins, the other kept as a copy), the current project and the update channel, nothing else. Opening another project or updating no longer drops changes that could not be saved: it asks first. Ids and counters from a file are kept exact (no lost devices on reload). The offline copy is used when the server answers with an error page. The Windows app only opens its own page and the hosted app. The release workflow gives the Android signing key only to the step that signs, never to pull requests.

### Added
- **More Simurelay-like parts** (Wiring and Electrical Diagram): **contactor with N.C. main poles** (1P–4P symbols), **contactor with an on- or off-delay contact block** (55-56 N.C., 55-58 N.O., 67-68 N.O.), **E-stop changeover** and **limit switch changeover** (11-12 / 11-14), **motor protection breakers 1P, 2P and 4P**, **overload relays 1P and 2P**, **fuse switches 1P, 2P, 1P+N, 3P+N and 4P** (the neutral pole is switched, not fused), and an **overload relay setting "95-96-98 changeover"**. The 1- and 2-pole overload, motor-breaker and fuse-switch symbols now make devices with that many poles (a drawing made before, with the 3-pole device under them, still works). In the diagram also: **N.C. + N.O. in one symbol** for the push button, selector, E-stop, limit switch, contactor aux and relay, the delay-block contacts, and the **generator's C1-C2 start input** (set the generator to *auto (C1-C2)*: it runs while a contact joins C1 and C2).
- **IEC current paths: "More symbols…" list** with the off-delay, on/off-delay and flasher timers, the contactor delay blocks, the latching and phase failure relays, the flashing lamp, bell, siren, valve, the NO+NC push button and selector, the E-stop N.O., and the **PLC inputs and relay outputs** of the PLC placed in the Wiring (the diagram never adds a PLC).
- **Copy and paste of PLC symbols**: a pasted or duplicated PLC input or output takes the next point of the same controller that is not drawn yet; when all are drawn you are told so.
- **docs/SIMURELAY_PARITY.md**: the symbol-by-symbol comparison with Simurelay, with the test behind each one.
- **Example *PLC motor with running feedback + HMI*** and **lesson 17**: F1 95-96 is hardwired in the coil circuit, the coil is fed after QF1, and KM1 13-14 goes back to input I:0/3. The HMI motor and RUNNING indicator show the real running status, not the command; when the command and the feedback disagree for 2 s a discrepancy alarm latches, stops the motor and shows on the HMI until RESET (for example with QF1 off). The lesson checks the three steps live.
- **Timing and monitoring parts** (Wiring and Electrical Diagram): **flasher timer relay** (cyclic: time closed and time open), **on/off-delay timer relay** (both delays in one relay), **flashing pilot lamp** (0.5, 1 or 2 flashes a second) and **phase failure relay** (11-14 closes with three phases in the right sequence; drops on a lost phase or a wrong sequence, sequence check can be turned off). Diagram symbols for their coils, N.O., N.C. and changeover contacts, and the phase relay's L1 L2 L3 measuring box.
- **Countdown on the drawing**: a timer relay coil that is timing shows the time left beside it.
- **🎨 Colours** in the free-draw toolbar: each drawn wire takes the colour of its conductor (L1 red, L2 yellow, L3 blue, N grey, PE green, +24 V red, 0 V blue). The choice is remembered.
- **More parts** (Wiring and Electrical Diagram): **push button changeover** (11-12 / 11-14), **selector changeover**, **selector NO + NC** (13-14 / 21-22, maintained), **push button and selector crossover** (reversing contact: 1-4 / 3-2 at rest, 1-2 / 3-4 operated), **disconnector 1P and 2P**, **RCBO 4P**, **bell** and **siren**. In the diagram also: **E-stop N.O. 13-14**, **changeover contacts** of the control relay (11-12-14, 21-22-24), the on- and off-delay timers (15-16-18) and the latching relay, **contactor main contact 1P**, and 1- or 2-pole symbols of the overload relay, motor protection breaker and fuse disconnector (the 3-pole device with its other poles unused, as in a panel).
- **Electrical Diagram properties and editing** (free draw):
  - **Properties** on the right for one selected symbol: its tag (and PLC point), a **comment** drawn under the tag, and the settings of its device — coil voltage, delay, lens colour… These are the device's own settings, the same ones the Wiring shows: change them in either place.
  - **Select several**: Shift+click, Shift+drag a box, Ctrl+A. Drag one of them to move them all; arrow keys move the selection one grid step (Shift: five); Rotate and Delete act on all of them.
  - **Copy and paste** (Ctrl+C / Ctrl+V, D to duplicate): a pasted coil and its contacts become one new device with a new tag, with the wires between them; a PLC symbol stays on its controller.
  - **Search** in the symbol library, **grid** as lines and dots, dots or none, and **Save as PNG / SVG** of the drawing.
  - On a touch screen, **pinch** zooms the drawing and a **long press** opens a symbol's tag form.
- **PLC symbols in the Electrical Diagram** (free draw, new **PLC** group): **PLC power L1/N**, **PLC relay output** (O0–O3 from VAC0, O4–O7 from VAC1), **PLC transistor output** (+V → O) and **PLC input** (I → COM). Each one is a terminal of the real PLC or I/O card placed in the Wiring — the compact PLC, the rack power supply, input cards, relay and transistor output cards — picked by its tag, with the point chosen in its form (**Tag / point…** moves it to another point and its drawn wires follow). The ladder drives the drawn outputs and reads the drawn inputs, so a PLC circuit can be drawn and run entirely in the diagram, next to hardwired circuits. Each symbol shows its address (I:0/0, O:2/1…, in the project's address style) and the live state of its point. The diagram never adds a controller: a missing PLC or card, another kind of device, or a point the card does not have is reported and not wired. (Help → Lessons): lessons 8–16 list their steps and tick each one off **while you work** in the Wiring, Ladder and HMI (a toast and an event-log line per step; *lesson complete* at the end). The circuit lessons now check the wiring itself, not only the ladder: lesson 12 checks that the N.C. 21-22 of each contactor is really in the other one's coil circuit, and the XIO interlock in the ladder.
- New lessons: **13 Modular PLC rack and I/O Configuration**, **14 Analog input, analog output and a VFD**, **15 HMI screens, trends and navigation**, **16 Download and online edits**.
- **Earth leakage**: a load fed between a phase and PE (instead of N) sends its current to earth. The RCD in front of it trips (*FI1 TRIPPED — earth leakage through H1*); without an RCD the load keeps working and a warning says that nothing protects it.
- **Verify** rejects COP, FLL, SQO and MSG instructions whose length runs past the end of their file (N7 and B3 have 32 words; a remote PLC too).

### Fixed
- **Device variants are checked everywhere**: in the IEC current paths and power circuit a symbol on a device of the same family that lacks its terminals (a 3-pole feeder symbol on a 1-pole motor breaker or overload relay) or behaves differently (main poles on a N.C.-pole contactor; a N.C.-pole symbol on a normal contactor) is reported instead of being wired in part. A PLC input in a 230 V current path is reported (it would destroy the input). A contact drawn twice (13-14 alone and inside an N.C.+N.O. symbol) is reported. The overload changeover symbol sets its relay whichever symbol is drawn first. Arrow keys on the **More symbols…** list only move the choice (Enter adds it). The diagram toolbar words are translated in Tagalog again.
- **RCBO 2P and 4P trip on earth leakage** (a load fed from it to PE), as an RCD does; before, they only tripped on a short circuit.
- **Phone layout**: the header is one row (the examples are in File → New project), the Electrical Diagram toolbar wraps instead of scrolling so no control is cut off, the current-path and power symbols are picked from one list, a **⚙** button opens the properties in the free drawing, and the library closes after a symbol is placed.
- The **welcome message** of the first start goes away when another project is opened.
- A project file whose free drawing has symbols but no drawn wires makes its devices when it is opened (before: only after the first edit).
- **Electrical Diagram (free draw)**: on a touch screen, a finger lifted off the drawing after it was redrawn (always after a long press, which opens the tag form) no longer blocks every later tap as a false pinch. A symbol moved just before a pinch is kept. A symbol added after Ctrl+A is the only one selected, so Delete or R no longer acts on the whole drawing. In **▶ Play**, editing keys (Delete, R, D, arrows, Ctrl+V, Ctrl+A) do nothing. Ctrl+C copies selected page text as usual and copies symbols only when symbols are selected. The Point list of a PLC input symbol offers only the points of the placed card (no I8–I11 on an 8-input card). A timing countdown updates in place instead of redrawing the whole drawing ten times a second.
- **DIV** rounds a half away from zero, like the controller: −5 ÷ 2 = −3 (was −2).
- Alarms raised in the first seconds after the app starts (a breaker trip, a short) were shown and logged only from the 4th second on; they are now shown at once.

### Project compatibility
- Settings a newer version added to a device this version knows (for example the overload relay's aux setting or the generator start) are **kept and saved back** instead of being dropped.
- **Nothing is lost when a project from a newer version is opened.** Parts, Electrical Diagram symbols and wires that this version does not know are kept as they are and saved back unchanged and in place (a current path or motor feeder holding an unknown symbol stays where it was), so the newer version still finds them. They are not shown or simulated here; everything else in the project works as before.
- A current path holding an unknown symbol is kept whole: before, the unknown symbol was dropped and its neighbours were joined, which changed the circuit.
- Projects now record a **file format** (`format: 2`). A project from a newer format, unknown parts or symbols, or damaged entries that could not be read are reported when the project opens (a warning and an event-log line), instead of being dropped silently.
- A part or wire with no id in a damaged file is no longer loaded (a missing id was read as the text “undefined”).
- **Tags of kept parts are reserved.** A new device (added, duplicated, made by the Electrical Diagram, or a suggested tag) never gets the tag of a part, symbol, current path or feeder this version does not know; renaming a device to such a tag, or typing it on a diagram symbol, is refused with a message. A tag that also belongs to a device this version knows stays usable. A kept part without a readable tag is reported, because its tag cannot be reserved.
- A kept **main power circuit** or **supply rail** cannot be replaced in the Electrical Diagram (a message says why), and is saved back as it was.
- When a **supply rail** of the current paths is on a part this version does not know, the Electrical Diagram no longer puts another supply in its place: those current paths stay unpowered and are not simulated (before, they ran from another supply — a 24 V PSU or the 1-phase supply — and the other rail and the diagram's wires to that supply were saved into the project). The warning on opening says so.
- A kept current path or feeder is saved right after the one it followed, also when you insert or delete others before it.

### Tests
- **Review fixes** (7 checks): variants in the power circuit, PLC input on 230 V, N.C. poles on a normal contactor, overload changeover drawn second, a contact drawn twice, the list keyboard, Tagalog toolbar.
- **Parity parts** (50 checks): N.C. main poles, on- and off-delay blocks, E-stop and limit changeovers, selector changeover and N.C. selector, fuse switches (fuses blow, the neutral stays), 1/2/4-pole motor breakers and 1/2-pole overload relays (jam trip, changeover aux), generator AUTO; a drawing with the changeover overload contact, the delay block, N.C. poles and a N.C.+N.O. push button working live; an older 1-pole drawing on a 3-pole relay; PLC copy and paste of points; every symbol of the Simurelay comparison in one drawing, with save and reload; IEC current paths with a flasher, an off-delay relay, a flashing lamp and PLC points through the ladder; phone header and diagram toolbar with nothing cut off, the properties drawer and the library; RCBO 2P/4P earth leakage; the drawn changeovers of the on-delay, off-delay, on/off-delay, flasher and latching relays; a mouse drag of a placed symbol with Undo; the welcome message; a project read by a version without the new parts.
- **Audit fixes** (3 checks): a touch lifted outside the redrawn drawing does not block the next tap (fails without the fix); Delete and Ctrl+A do nothing in ▶ Play; a symbol added after Ctrl+A is the only one deleted.
- **Running feedback example** (13 checks, through the real tick loop): the wiring (95-96 in the coil circuit, coil after QF1, 13-14 to I:0/3); the HMI reads PLC data only and follows the feedback; HMI START and STOP with RUNNING / NOT RUNNING on the HMI; QF1 off shows COMMAND ON and NOT RUNNING, then the discrepancy alarm latches, drops the command and shows its banner; START is refused while latched; RESET clears it; the motor runs again; an overload trip is reported as an overload, not as a discrepancy; lesson 17; save and reload.
- **Timing and monitoring** (12 checks): parts list and symbol terminals; the solver runs the flasher, the on/off delay, the flashing lamp and the phase failure relay (healthy, lost phase, wrong sequence, sequence check off); a drawn phase relay lights its lamp, a drawn flashing lamp flashes, a timing coil counts down and the countdown goes away, 🎨 Colours colours the wires by conductor and turns off again; save and reload.
- **More parts** (10 checks): every new device is in the parts list and every new symbol fits its device's terminals; the solver runs the changeover push button, the NO+NC selector, both crossovers (a DC motor reverses), the 1- and 2-pole disconnectors, the RCBO 4P (trips on a short), the bell and the siren; a drawn relay changeover contact swaps two lamps and shows it; the drawn E-stop N.O. closes; save and reload.
- **Diagram properties and editing** (21 checks): the Properties fields; a delay and a coil voltage shared with the Wiring both ways; comments drawn and saved; a tag clash reported and undone; Ctrl+A, arrow keys, Shift+click and Shift+drag selection; group Delete with Undo; Ctrl+C / Ctrl+V of a coil and contact as one new device; D on one symbol; library search; grid styles; the SVG picture and the PNG / SVG downloads; pinch zoom and long press on a phone.
- **PLC symbols** (15 checks): the library shows four PLC symbols; a PLC circuit drawn only in the diagram is wired to the real PLC terminals and powers the PLC; S1 → I:0/0 → rung → O:0/0 → H1 through the live tick loop, with the symbols showing their state and address (also in another address style); moving an output to another point moves its wires; save and reload; a missing controller, the wrong device or a missing point is reported; on a modular rack, the input card, relay card and transistor card run the same way.
- **Project compatibility** (26 checks; 6 for a kept supply rail: no substitute supply, the other rail and wires saved unchanged, nothing powered without a supply, save → reload → save, the warning, and automatic rails still chosen in projects without a kept rail): unknown parts, symbols and wires survive save → reload → save; the known circuit still runs; a current path with an unknown symbol is not joined; new parts never reuse a kept id or tag (Wiring, duplicate, diagram suggestions); renaming to a reserved tag and typing one on a diagram symbol are refused; a part without a readable tag is reported; the kept main power circuit and rail cannot be replaced and are saved as they were; kept paths and feeders keep their place when others are inserted or deleted; the warning names the newer format and the unknown kinds; deleting a known part leaves out kept wires that ended on it; every example and a v2.0.0 project open with no warning; damaged data loads without errors and is reported; a file that is not a project is still refused.
- **Integration baseline** (26 checks, no change to the app): HMI START/STOP → PLC → output contact → contactor → motor through the real 20 ms tick loop; the Wiring push button on the same rung; overload trip, alarm bit, event log, reset and restart; PROG drops the outputs; a hardwired DOL starter working with the PLC in PROG; a seal-in circuit drawn only in the Electrical Diagram (devices and wires made for you, live wires shown); free-draw Undo/Redo and Delete; save and reload of every example, of device state and of the drawn circuit. One check records current behaviour on purpose: with the main breaker off, the *PLC motor* example's HMI follows the PLC command, because that example has no running feedback.

## [2.0.0] - 2026-10-20

A major release: controller tags and the Controller Organizer, online work with the controller (download, upload, compare, online edits), a simulated network with MSG, new instructions and analog I/O with a VFD, a much bigger HMI (screens, terminal types, trends, security), and Tagalog. **Projects saved with 2.0.0 can use tags, program files and a controller program that older versions do not know: open them with 2.0.0 or newer.**

### Added
- **Simulated network (v2.0)** (Ladder → *🖧 Network*): **Who Active** list (this computer, the controller, the HMI terminal, remote PLCs with their IP addresses and status); **remote PLCs** (nodes 2–8, 32 N7 words each, editable); **produced / consumed** links that copy words every scan while the controller runs. No real ports are opened.
- **MSG** instruction: READ / WRITE a block of N7 words of a remote PLC over the simulated network, with EN / DN / ER in an R6 control (ER when the node does not answer).
- **Online with the controller (v2.0)** (Ladder → *Online*): **Simple** (as before: edits run at once) or **Realistic**: the controller keeps the program last downloaded, as with real PLC software.
  - Offline, edits change the project only; the status bar shows **OFFLINE · project ≠ controller**.
  - **⇄ Go Online** compares them and offers **Download** (writes the project into the controller; needs PROG and a project without errors), **Upload** (reads the controller program into the project) or **Compare**.
  - **≠ Compare** lists every rung (by file), task and tag that differs.
  - **Online edits**: in PROG an edit is written at once; in RUN it is pending — **▶ Test edits** runs it, **✓ Assemble** keeps it, **✕ Cancel edits** goes back to the controller program.
  - The connection mode and the controller program are saved with the project.
- **Controller Tags (v2.0)** (Ladder → *🏷 Tags*): give names to addresses. **BOOL**, **INT**, **TIMER** and **COUNTER** tags get their own address (B3, N7, T4, C5, from the top down); an **ALIAS** tag is another name for an address (`START_PB` = `I:1/0`). Use the names in instructions (`XIC START_PB`, `TON RUN_T 1.0 5 0`, `XIC RUN_T.DN`); the ladder shows the names and the tag description; renaming a tag renames it in the program; live values in the list. Saved with the project.
- **Controller Organizer (v2.0)** (Ladder → *🗂 Organizer*): the project as tasks, programs and routines: MainTask (continuous) → MainProgram → MainRoutine (LAD 2) and the subroutines; Controller Tags; I/O Configuration. A subroutine file can be a **periodic task** (runs on its own every 10 … 1000 ms) instead of being called by JSR.
- **New instructions (v1.8)**: **OSR / OSF** (one-shot rising / falling with storage and output bits), **MCR** zones, **JSR / SBR / RET** with **program files** (LAD 2 main + subroutine files LAD 3–9: *File* list and *＋ File* in the Ladder toolbar, saved with the project), **COP / FLL** (copy / fill a block of words, file addresses `#N7:0`), **SQO** (sequencer output with a mask, control file **R6**: EN, DN, LEN, POS; new R6 tab in the data table). Verify checks JSR targets and MCR pairs.
- **Analog I/O (v1.8)**: **Analog Input Card 4 × 4–20 mA** (I:slot.ch, 4 mA = 0 … 20 mA = 32767, wire break < 3.6 mA = 0) and **Analog Output Card 2 × 0–10 V** (O:slot.ch). The data table shows the analog words; Verify and the I/O Configuration know them.
- **Level Transmitter 4–20 mA** (3-wire, 24 V DC): measures the tank with the tag in its properties, or its own test level.
- **VFD**: 400 V in, motor out; FWD / REV inputs (24 V DC), speed reference 0–10 V on AI (0–60 Hz) or the keypad speed, ramp up and down; the motor speed follows the frequency, REV swaps two phases.
- Example **Analog: tank level transmitter and VFD pump**.
- **Tagalog / English** (EN/TL button in the top bar): menus, buttons, common messages and help texts in Tagalog; technical terms stay in English. Remembered in this browser.
- **HMI v1.7**:
  - **▶ Machine** (runtime, as on the machine) and **✎ Studio** (designer) modes, replacing Operate / Design; **⛶ full screen** for the terminal.
  - **Terminal type**: 4.3" 480×272, 6" 640×480, 7" 800×480 (default, as before), 10" 1024×600, 12" 1280×800, 15" 1024×768 or a PC screen 1280×720. The screen, the zoom and the HMI terminal on the cabinet door follow it.
  - **Several screens**: add, rename and delete screens in Studio; **Go to Screen** buttons move between them in Machine.
  - New objects: **Rectangle**, **Ellipse**, **Line / pipe** (ON/OFF colour by a tag, optional blink), **Trend** (history of a tag over a time span), **Image** (a picture from a file, scaled to 400 px and saved in the project), **Go to Screen**, **Log in / out**.
  - **Animation**: every object can be visible only while a tag is 1.
  - **Security**: push buttons, numeric entries and Go to Screen buttons can need a log-in; **Log in / out** asks for the PIN (4–8 digits, set in Studio, default 1234). Log-ins and refusals go to the event log.

### Changed
- The address style (file-based, bit/byte, basic) is also used in the **Verify** messages and the event log (with the file address in brackets, e.g. `I0.0 (I:1/0)`) and in the **HMI** tag field, its suggestions (the real I/O points) and the runtime tag list. An HMI tag can be typed in any style; it is stored file-based.

## [1.6.0] - 2026-10-20

Hardware: a modular PLC rack with I/O Configuration, address styles and a 2D control cabinet; and a free-draw Electrical Diagram reworked with an icon library panel.

### Added
- **Modular PLC rack** (Wiring → *PLC Rack*): a rack power supply (230 VAC in, 24 VDC out for sensors), a **CPU module** (slot 0, key switch PROG/RUN, PWR/RUN/FLT/FORCE lights) and I/O cards: **input card 8 × 24 VDC**, **input card 8 × 230 VAC**, **relay output card 8** and **transistor output card 8 × 24 VDC**. Snap them on a DIN rail.
  - Each card has a **slot** (1–7, the next free slot when you add it); its I/O is addressed by the slot: a card in slot 2 is **I:2/0–7** or **O:2/0–7**, like a modular controller.
  - Two cards in one slot: the second one is inactive and says so. Wrong voltage on a card destroys the input or the card.
  - The data table (I and O) and the status bar show one word per card; rack I/O can be forced.
  - Only one controller per project: a compact PLC or a CPU module.
- **I/O Configuration** for the modular PLC (Ladder → *I/O Config*, or right-click the CPU or a card): pick the card the CPU expects in each slot 1–7, or **Read I/O Config** to copy the installed cards. Saved with the project.
  - A card works only when it is configured in its slot. If the rack does not match the configuration, the CPU refuses RUN and its **FLT** light is on; a card removed or moved while running is a **CPU fault** that stops the controller (logged as an alarm).
  - **Verify** checks I/O addresses against the hardware: an address in an unconfigured slot, slot 0 or past a card's 8 points is an error; on the compact PLC, an address it does not have (e.g. I:1/0) is a warning.
  - The data table follows the I/O configuration (a missing card shows as *(missing)*).
- **Address styles** (Ladder toolbar → *Address*): show I/O addresses **file-based** (`I:1/0`, `O:2/0`), **bit/byte** (`I0.0`, `Q0.0`) or **basic** (`I1`, `Q1`). Bit/byte and basic number the real I/O points in order (compact PLC, or the configured rack cards). Used in the ladder, the instruction dialog and its suggestions, the data table, the forces list, the status bar and the card labels in the Wiring. An address can be typed in any style; the program is always stored file-based, so projects open the same in every style. Saved with the project.
- **2D cabinet** (Wiring → *Cabinet*): **Control Cabinet** backplate and **Cabinet Door** (size and name plate in the properties), **Cable Duct** (horizontal or vertical) and an **HMI Terminal** for the door. Cabinet and door are drawn behind the devices; moving one moves everything mounted on it, with the bends of the wires between those devices.
  - The HMI terminal shows the screen made in the HMI workspace, live, and its buttons can be pressed in the Wiring. It needs 24 VDC on + / M; without power it is dark.
- **Free draw, reworked** (Electrical Diagram → *Free draw*):
  - **Library panel** beside the drawing: an icon grid of every symbol with a group list (All, Sources, Switches, …, Motors) and a colour bar per group. Click a symbol to add it, or drag it onto the drawing. *Library* in the toolbar hides or shows the panel.
  - Toolbar in this order: Library, **▶ Play** (operate the drawing; ■ Stop to edit again), **Values**, Back, Front, Rotate, Duplicate, Delete, Undo, Redo, Type ⇄.
  - **Values** shows the voltage on each load (e.g. 230 V~, 24 V=), open/closed on each contact and the conductor on each wire point.
  - **Zoom buttons** (−, fit, +) at the bottom right, and a grid with major lines every 100 px.
  - New symbols: **Point L1, L2, L3, N, PE, +24 V, 0 V** (wired to that conductor of the supply), **AC/DC converter** (the 24 V power supply), **3-phase generator**, **battery 24 V**, **DC motor**, and **wire pieces**: straight, corner, T, cross and a **link arrow** (arrows with the same tag are connected).
  - Wire pieces, junctions and points get a tag on their own (no dialog).
- New devices in the Wiring: **Battery 24 V**, **3-Phase Generator** (START/STOP) and **DC Motor 24 V** (reverses with the polarity).
- Example **Motor starter cabinet (modular PLC, door with HMI)**: breakers, the modular PLC, contactor, overload and terminal block on DIN rails between cable ducts; START/STOP, pilot lamps and the HMI terminal on the door; START/STOP from the door or the HMI.
- Example **Modular PLC rack (PSU, CPU, I/O cards)**: START/STOP with a seal-in on I:1/0, I:1/1 and O:2/0.

### Fixed
- Free draw: symbols added one after another no longer land on top of each other; each goes to the nearest free spot.

## [1.5.0] - 2026-10-19

Free-draw Electrical Diagram with a full IEC component library (90 symbols), new parts in the Wiring, and a cleaner diagram: one line colour like the ladder, power and control circuits in proportion.

### Added
- **Free draw** in the Electrical Diagram (*✎ Free draw*): place IEC symbols anywhere on a grid, drag them, rotate them (**R**), and wire terminal to terminal. Every symbol is a real device in the Wiring (found by its tag or added for you) and every drawn wire is wired there, so the simulator runs the drawing; live paths light up and ☝ Operate presses buttons, switches breakers and trips overloads on the drawing.
  - **＋ Library** by group: Sources, Switches, Sensors, Auxiliaries, Coils, Loads, Contactors, Protections, Others, Motors (90 IEC 60617 symbols).
  - **Type ⇄** turns a switch contact into another actuator: push button, selector, key, limit, E-stop, foot, pressure, level, temperature or flow switch; and a 3-wire sensor into inductive/photoelectric, PNP/NPN.
  - Wrong device types and a device part drawn twice are reported.
- Free draw: **junctions** (end a new wire on an existing wire to branch it) and **wire bends** (double-click a wire to add one, drag it, double-click to remove; works with a double tap on phones).
- **Full IEC component library**, in the Wiring and in free draw:
  - Sensors: **thermostat** and **flow switch** (N.O./N.C.), **photoelectric sensor** PNP/NPN, and the 3-wire sensor symbol (BN, BK, BU) for inductive and photoelectric sensors.
  - Pilot devices: **push button N.O. + N.C.** (13-14 / 21-22) and **foot switch**; selector H-O-A HAND and AUTO contacts in free draw.
  - Protection: **fuse 2P and 4P**, **MCB 4P**, **disconnector 4P**, **fuse disconnector 3P**, **RCD 4P 30 mA**, **RCBO 2P** (trips on an earth fault and on a short circuit).
  - Control: **latching relay** (SET A1-A2 / RESET B1-B2, keeps its state without power); 2-pole contactor main contacts in free draw.
  - Loads: **heater**, **hour meter** (counts the time it is powered), **voltmeter** (shows the voltage between V1 and V2), fan in free draw.
- Free draw: **Text** notes, a **PE earth** symbol wired to the supply PE, **⧉ Copy** (**D**) and **To front / To back**.
- **Contactor 4-Pole** (1-2, 3-4, 5-6, 7-8 + 13-14) and **Impulse Relay** (each pulse on the coil toggles the contact: one lamp from several push buttons), in the Wiring and in free draw.
- **New parts**: Fuse 3-Pole, MCB 3-Pole, Disconnector 3-Pole, **RCD 2-Pole 30 mA** (trips on an earth fault before the breakers, not on a line-to-neutral short; TEST button), **Off-Delay Timer Relay**, **Single-Phase Motor**, **Two-Speed Motor** (two windings) and **Dahlander Motor** (slow/fast by connection; a wrong connection is a fault).

### Changed
- Electrical Diagram: the power circuit is drawn in one line colour like the control circuit and the ladder (no more red/yellow/blue lines next to grey ones); live paths still light up. The Philippine wire colours stay on the real wires in the Wiring.
- Electrical Diagram: the power circuit is in proportion with the control circuit: wider pole spacing, a bigger motor symbol, and its rows spread so the motors sit level with the N rail.

### Fixed
- The RCD ring in the free-draw symbol is drawn as a ring, not a filled shape.

## [1.4.1] - 2026-10-19

Updates now install inside the app (no downloads), the Windows app is portable only, and the Electrical Diagram draws star-delta motors.

### Added
- **In-app updates, no downloads**: the Windows and Android apps open the hosted app, which updates itself. When a new version is ready the app shows **Restart to update**; nothing is downloaded, no installer, no browser. Works offline with the last version it has.
  - **Stable** channel = official releases. **Beta** channel = every change as soon as it is merged (File → Updates…).
  - The first start of the new app brings the projects of the old app along.
- **Star-delta motor in the Electrical Diagram power circuit** (*M Y-Δ*): the motor with its delta and star contactors, wired for you. The *Star-delta starter (hardwired)* example now draws its power circuit in the diagram.

### Changed
- **Windows: portable app only** (`PLC-Trainer-X.Y.Z-portable.exe`). The installer is gone.
- Wiring: a wire without bends now picks the route that crosses the fewest devices.

## [1.4.0] - 2026-10-19

Wiring that looks like real DIN-rail hardware, four workspaces, an IEC Electrical Diagram with the power circuit, star-delta and forward/reverse, and Philippine wire colours.

### Added
- **IEC Electrical Diagram** (new default view): L rail on top, N rail at the bottom, one numbered column per current path, contacts drawn the IEC way with their terminal numbers (95/96, 11/12, 13/14, A1/A2, X1/X2) and tags like -KM1. Push-button, selector, E-stop, limit-switch, timer and overload actuators are shown. *⇄ Ladder* switches back to the horizontal ladder style.
- **Power circuit in the diagram**: the 3-phase supply, a main switch and motor feeders (circuit breaker or motor protection breaker → contactor main contacts → overload relay → motor 3~ with PE). The diagram adds the devices to the Wiring and wires L1-L2-L3 and PE for you; live phases light up. *＋ Feeder* and the *Power* buttons build it; Operate mode switches breakers and resets overloads from the diagram.
- **Example**: *Three motors (IEC Electrical Diagram)*, with main breaker Q4, feeders Q1-Q3 → KM1-KM3 → F1-F3 → M1-M3, start/stop with seal-in, run lamps and pilot lamps.
- A coil with a lamp across it (a branch made only of loads) is drawn at the bottom of its current path.
- **Motor with 6 terminals** (U1 V1 W1 / U2 V2 W2) for star-delta starting: it runs in STAR when U2 V2 W2 are joined (reduced speed in this model) and in DELTA when every winding is across two phases; it says when the windings are not connected. Star and delta at the same time short the phases and trip the breaker.
- **Timer relay with a dial**: the dial shows the set delay, − / + change it (0.5–60 s), and a bar fills while it times.
- **Examples**: *Star-delta starter (hardwired, Electrical Diagram)*, which wires its control circuit from the diagram; *Star-delta starter (PLC)* with ladder; *Forward / reverse (PLC)* with ladder and contactor interlocks.
- An opened project whose Electrical Diagram is not wired yet is wired at once.
- **New Wiring look** (simple and flat, like real DIN-rail hardware): light grey modular bodies, screw terminals with a cross slot, terminal numbers such as 1/L1 and 2/T1. Redrawn: MCB (black toggle, red/green contact windows), contactor (indicator window), motor (blue body, terminal box U1 V1 W1 with star or delta bridges, turning shaft with CW/CCW), compact PLC (LCD that shows the I and Q bits), proximity sensor (red beam when powered).
- **DIN Rail** (Wiring group): drag a device onto it and it clips onto the rail. Length 200–1000. Hold Alt to place freely.
- **Terminal Block PE-L1-L2-L3-N**: green PE, grey L1 L2 L3, white N; each top terminal feeds the one below it.
- **Motor Protection Breaker** (motor circuit breaker): trips on a short circuit (before the MCCB in front of it) and on motor overload; rotary knob ON/OFF/reset, TEST button, current setting Ir, aux contact 13-14.
- **Wire labels (ferrules)** at both ends of every wire: the conductor that is live on it (L1, L2, L3, N, PE, +24V, 0V) or your own label (wire properties, up to 12 characters). Toggle with *Wire labels* in the Wiring toolbar. Earth wires are drawn green/yellow.
- **Electrical Diagram** (new tab): build a control circuit: a supply rail (L or +24 V), a return rail (N or 0 V) and rungs of contacts and loads, with parallel branches. Symbols: push buttons N.O./N.C., selector, E-stop, limit switch N.O./N.C., contactor/relay/timer/overload contacts, contactor/relay/timer coils, pilot lamp and buzzer.
  - Each symbol is a real device in the Wiring, found by its tag (S1, KM1…) or added there for you, and the rungs are wired automatically, so the electrical simulator runs the circuit (shorts, trips and coil voltages included).
  - Power flow shows live in green. In *☝ Operate* mode you press buttons, turn selectors and trip overloads right on the diagram.
  - Contacts are checked: a contactor has one N.O. and one N.C. aux contact, a relay two changeover contacts; a rung with a problem is not wired and the problem is listed.
  - The diagram is saved with the project, with undo/redo.
- **Floating windows**: ▦ View → *Float Ladder / Electrical Diagram / Wiring / HMI* pops a window out of the main area. Move it by its title bar, resize it from the corner, *⤓ Dock* puts it back. Floating windows stay live and are remembered.
- **Size** for every device in the wiring (0.5× to 2×), and *Same size for all*. Wires follow the new terminal positions.
- **New parts**: Fuse (blows before any breaker; click to replace), Buzzer/Horn, Key Selector 2-Pos, Solenoid Valve 2/2, Single-Phase Fan 230 V, Proximity Sensor **NPN**, Pressure Switch and Float Switch (each N.O. or N.C.).
- **More type options in the properties**: proximity sensor PNP ↔ NPN, pressure/float switch N.O. ↔ N.C.
- **View menu** (▦ View in the status bar): tick the windows you want side by side (up to 3), e.g. ☑ Ladder ☑ Wiring. The ready-made layouts are still there.
- **Wire junctions**: while drawing a wire, click an existing wire to end the new one there, on a junction dot. Right-click a wire → *Start a new wire from here* to branch off it. The two halves keep their route.
- **Move wire bends**: select a wire and drag the round handles on its bends (snapped to the grid). Double-click a handle to remove it, double-click the selected wire (or right-click → *Add a bend here*) to add one.
- **Smart alignment**: while you drag a device, a wired terminal that comes within 8 px of the other end lines up with it so the wire runs straight; a dashed guide shows it. Hold Alt to place freely.
- The **event log is saved with the project** (last 200 events).

### Changed
- **Wire colours follow Philippine practice**: L1 red, L2 yellow, L3 blue, N white, PE green; 24 V DC + red, 0 V blue; 230 V control wiring black. The wire colour palette, *Auto* colours, examples and new diagram wiring use them. Wires in existing projects keep their colours.
- **Four workspaces**: Ladder, Electrical Diagram, Wiring and HMI. The *Panel & Plant* view is removed: push buttons, selectors, breakers, overloads and equipment are operated right in the Wiring. Lessons and the new keyboard-shortcut list are in **Help ▾**.
- Layouts: *Workbench* is now Ladder + Wiring + HMI; new *Wiring + HMI*, *Electrical Diagram + Ladder* and *Ladder + Electrical Diagram + Wiring*. A layout or window saved with the old panel opens the nearest new one (the Panel view opens the Wiring).

### Fixed
- A diagram tag that was not text could be read as the word "undefined".

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
