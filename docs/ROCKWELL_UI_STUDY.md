# Reference PLC software: UI study (layout and flow only)

Studied on 2026-10-21 in the owner's VM, using the owner's own licensed copies.
This note describes **layout and behaviour only**. In the app, never use
the vendor's names, icons, artwork or file formats. "AB-style" wording is
fine, and `tests/e2e.test.js` checks for brand names.

## 1. Emulated chassis: the model for the Wiring "PLC rack"

- One window holds a chassis of numbered slots, 0 to 8, with more behind a
  ⌄ button.
- Default population:

  | Slot | Module |
  | --- | --- |
  | 0 | Comms-software module ("RS LINX" label). It is automatic and always present. |
  | 1 | Second comms module ("FT LINX") |
  | 2 | Emulated controller (marquee "EMULATOR"). Has a RUN/REM/PROG key switch and RUN / I/O / FORCE / OK / BAT LEDs. |
  | 3, 4 | Simulated I/O modules (marquee "1789-SIM"). LED bar for points 0–31 and status I/O / OK. |
  | 5–8 | Empty slots shown as grey bays |

- Window menus: Slot, View, Options, All Modules, Help.
- **Create Module** flow (right-click an empty slot):
  1. Select Module (list)
  2. Select Device (slot)
  3. General (marquee label)
  4. Finish
- **I/O module Properties** tabs:
  - **General**
  - **I/O Data**: inputs 00–31 as toggle buttons, outputs 00–31 as lamps, and a "Clear Inputs" button. This is how you "press a field device".
  - **Module Info**
  - **Module Status**: Major/Minor fault, Internal state, Configured, Owned.
- **Controller** context menu:
  - Run, Remote, Program
  - Configure Emulation, Single Scan
  - Properties
  - Remove
  - Clear Major Faults
  - Save
- **Controller Properties** tabs:
  - **General**: startup mode, memory, periodic save, controller name, last loaded
  - **System**: continuous-task dwell, CPU affinity, serial channel 0
  - **Module Info**
  - **Module Status**

## 2. Programming software: the model for the PLC module (1756 target)

### New Project wizard (2 pages)
1. **Project Types:**
   - left rail: View / Logix / …;
   - centre: a searchable tree of controller families (each family expands to models);
   - bottom: Name and Location (Browse…);
   - buttons Cancel / Back / Next / Finish.
2. **Controller details:**
   - Revision (dropdown);
   - **Chassis** (e.g. "1756-A17 17-Slot Chassis");
   - **Slot** (dropdown; the emulator defaulted to 2);
   - Security Authority;
   - Description;
   - then Finish.

### Main window layout (top to bottom)
- **Title:** `Logix Designer - <Project> [<controller> <rev>]*`. The `*` means unsaved changes.
- **Menu:** File, Edit, View, Search, Logic, Communications, Tools, Window, Help.
- **Standard toolbar:** new/open/save, print, cut/copy/paste, undo/redo, a search combo, and verify buttons.
- **Online bar** (left block):
  - a 4-LED stack: RUN / OK / BAT / I/O, which online becomes "Program Mode / Controller OK / Battery OK / I/O";
  - a key-switch icon;
  - `Path: <none>`, which after Set Project Path becomes `Path: Backplane\2`;
  - mode box `Offline`, which online becomes `Rem Prog`;
  - `No Forces` and `No Edits` boxes.
- **Instruction toolbar** (right block):
  - top row: the current tab's buttons as small ladder glyphs;
  - bottom row: tabs `Favorites | Add-On | Alarms | Bit | Timer/Counter | Input/Output | Compare | Compute/Math | …` with ◂ ▸ scroll arrows;
  - Favorites holds rung, branch and branch-level, then XIC, XIO, OTE, OTU, OTL.
- **Controller Organizer** (left dock), tree:
  ```
  Controller <Name>
    Controller Tags
    Controller Fault Handler
    Power-Up Handler
  Tasks
    MainTask                 (continuous)
      MainProgram
        Parameters and Local Tags
        MainRoutine          (ladder)
    Unscheduled
  Motion Groups
    Ungrouped Axes
  Assets
    Add-On Instructions
    Data Types (User-Defined, Strings, Add-On-Defined, Predefined, Module-Defined)
    Trends
  Logical Model
  I/O Configuration
    1756 Backplane, 1756-A17
      [0] 1756-IB16 DI_1      (added by the user)
      [2] <controller> <Name>
  ```
  Bottom tabs: Controller Organizer and Logical Organizer.
- **Editor area:**
  - a dark navy background when no routine is open;
  - routines open as tabs titled `MainProgram - MainRoutine*`;
  - each tab has a small toolbar: zoom ±, rung/branch editing, ASCII edit.
- **Errors pane** (bottom):
  - three toggle chips: `N Errors`, `N Warnings`, `N Messages`;
  - a Search box;
  - a plain monospace log below.
- **Status bar:**
  - `Ready`;
  - `Communication Software: <name>`;
  - `Rung 0 of 1`;
  - `APP / VER`.

### Ladder editor behaviour
- A new routine shows rung `0` with a **red ⊗ marker** (the rung has an error because it is empty) and an `(End)` rung.
- When a rung is selected its number cell turns blue.
- Clicking a toolbar instruction inserts it at the cursor:
  - a contact goes on the left;
  - a coil snaps to the right rail;
  - the operand shows `?`.
- Double-click the operand to open an inline combo. Its ▾ opens a **tag browser**:
  - a name filter;
  - Show: All Tags;
  - columns Name / Data Type / Usage / Description;
  - "Show controller tags" and "Show MainProgram tags" check boxes.
- Module tags appear automatically after adding I/O:
  - `Local:0:C` (config, type `AB:1756_DI:C:1`);
  - `Local:0:I` (input, type `AB:1756_DI:I:0`), expanding to `.Fault` (DINT) and `.Data` (DINT);
  - you address bit 0 as `Local:0:I.Data.0`.
- An unknown operand (e.g. `Lamp1`) leaves the rung in error. Right-click it and choose **New "Lamp1"** (Ctrl+W) to open **New Parameter or Tag**, which has:
  - Name, Description;
  - Usage (Local Tag);
  - Type (Base / Alias…);
  - Alias For;
  - Data Type (BOOL, with a … browse button);
  - Scope (MainProgram or the controller);
  - External Access (Read/Write);
  - Style (Decimal);
  - Constant;
  - Create / Cancel.

  After Create, the rung marker clears.
- Instruction right-click menu:
  - New "tag";
  - Cut / Copy / Paste;
  - Delete;
  - Add Ladder Element… (Alt+Ins);
  - Edit Main Operand Description;
  - Toggle Bit;
  - Force On / Force Off / Remove Force;
  - Go To…;
  - Instruction Help.

### I/O module dialog (I/O Configuration → right-click backplane → New Module…)
- **Select Module Type:**
  - tabs Catalog / Module Discovery / Favorites;
  - a search box and Clear Filters;
  - collapsible **Category filters** (Analog, Communication, Controller, Digital, Drive, …) and **Vendor filters**;
  - a table with Catalog Number / Description / Vendor / Category;
  - "169 of 169 Module Types Found";
  - Add to Favorites, "Close on Create", Create / Close / Help.
- **New Module** properties, with a page list on the left:
  - **General**:
    - Type (e.g. `1756-IB16 16 Point 10V-31.2V DC Input`);
    - Vendor;
    - Parent (Local);
    - **Name**;
    - **Slot** (dropdown);
    - Description;
    - Module Definition box: Series, Revision, Electronic Keying "Compatible Module", Connection: Data, Input Data: Data;
    - a Change… button.
  - **Connection**:
    - Requested Packet Interval (RPI) 20.0 ms (range 0.2–750);
    - Inhibit Module;
    - "Major Fault On Controller If Connection Fails While in Run Mode";
    - a Module Fault box.
  - **Module Info**
  - **Configuration**: input filter times per point group (00–07, 08–15).
  - **Points**
  - The footer shows `Status: Creating`, with OK / Cancel / Help.

### Communications menu
- Who Active
- Select Recent Path…
- Select Communication Software…
- Go Online
- Upload…
- Download
- Program Mode / Run Mode / Test Mode (disabled offline)
- Lock Controller
- Clear Faults
- Go To Faults

### Who Active dialog: the model for "find comms in the Wiring module"
- **Title:** `Who Active (<comms software>)`.
- **Toolbar:** auto-browse (clock), drivers (plug), settings (gear), zoom ±, help.
- **Filter** box.
- **Tree:**
  ```
  <PC name>
    <comms software> - Desktop, <PC name>
      Backplane
        02, <controller>, Emulator R33 11
        03, 1789-SIM ...
        04, 1789-SIM ...
      Ethernet, Ethernet
      Ethernet, Ethernet 2
      USB
  ```
  The status line shows `Browsing - node 03 ... found` and `Zoom: 100%`.
- **Right column:**
  - Go Online, Upload…, Download, Update Firmware…, Close, Help;
  - these are greyed out until a controller node is selected.
- **Bottom:**
  - `Path: Backplane\2` and `Path in Project: <none>`;
  - buttons **Set Project Path** and **Clear Project Path**.
  - After Set Project Path, "Path in Project" becomes `Backplane\2` and the main window's Path box updates.

### Download flow (verified)
1. Click Download. A modal **Download** dialog opens with:
   - a ⚠ icon and the text "Download offline project '<Project>' to the controller.";
   - **Connected Controller:** Name (`<no name>` when empty), Type, Path, Serial Number, Security;
   - a **DANGER: Unexpected hazardous motion of machinery may occur** warning paragraph;
   - buttons Download / Cancel / Help.
2. The project is **verified first**. An empty rung gives "Verifying program connections / Cancelling download... / Complete - 1 error(s), 0 warning(s)" in the Errors pane.
3. The controller must be in **PROG or REM**. With the key in RUN you get "Error: Controller not in correct mode. / Cancelling download...".
4. On success the app goes online: the mode box shows `Rem Prog` and the LEDs read Program Mode / Controller OK.

## 2b. Verified working setup (second pass, owner's corrections)

The first pass got three things wrong. The owner pointed them out, and the
second pass fixed them:

1. **The comms software must be running.**
   - Studio 5000 was set to the newer Linx. Downloads then timed out ("Can't communicate with Linx communication software" / "Communications timed out") and crashed the emulated controller.
   - The working setup is to start the classic comms server first, then Communications → Select Communication Software → choose the classic one. You can only change this with no project open; the app says "Cannot change communication software. The project file is open."
   - The classic RSWho tree:
     ```
     Workstation, <PC>
       Linx Gateways, Ethernet
       AB_VBP-1, 1789-A17/A Virtual Chassis      (driver for the emulated rack)
         00, Workstation, <comms server>
         01, <other comms module>
         02, <controller>, <ProjectName>
         03, 1789-SIM 32 Point Input/Output Simulator
         04, 1789-SIM 32 Point Input/Output Simulator
       EMU500-1, DH-485                          (driver for the SLC-style emulator)
     ```
   - With the classic software, Who Active has a different look: an Autobrowse checkbox, a Refresh button, the same tree, and the same Go Online / Upload / Download / Set Project Path buttons.
2. **Check what is in the controller before you download.**
   - Who Active showed `<no name>` for slot 2 while the emulator was still in "Power Up / Restoring Image". It actually held the owner's project. Downloading would have overwritten it.
   - The safe flow is: browse, read the name, Upload to a new file if unsure, then Download.
   - The Download dialog itself warns "The controller is in Remote Run mode. The mode will be changed to Remote Program prior to download."
3. **The I/O module for the emulator is a specific generic module, not a catalog card.**
   - The simulator card isn't in the catalog. The owner's working project (uploaded from slot 2) uses:
     - `1756-MODULE` (Generic 1756 Module) per simulator slot;
     - Comm Format **Data - DINT**;
     - Input assembly **1**, size **2** (32-bit);
     - Output assembly **2**, size **1**;
     - Configuration assembly **16**, size **0**.
   - **Inputs are `Local:<slot>:I.Data[1].<bit>`**, because `Data[0]` is status. **Outputs are `Local:<slot>:O.Data[0].<bit>`**.
   - Ladder uses **alias tags**: `Stop_PB1 → Local:3:I.Data[1].0` and `Pump_Motor1 → Local:3:O.Data[0].0`. The rung shows the alias name and the base address under it in `<…>`.
   - A wrong assembly configuration faults the module: "(Code 16#0022) An invalid reply was received", Status: Faulted, and "I/O Not Responding" in the online bar.
4. The owner's project has a **MainRoutine plus subroutines** (Analog_Routine, Motor_Routine, VFD_Control_Routine) under one MainProgram. Motor_Routine shows:
   - seal-in branches;
   - a TON (Timer, Preset, Accum, with EN/DN pins on the right);
   - a CPT (Dest / Expression).

   Online, true elements are drawn with green bars and the power rails turn green.
5. A controller in **Faulted** mode shows a red "Controller Fault" LED and `Faulted` in the mode box.

The study controller and I/O card (slots 5 and 6) were removed afterwards. The
rack is back to slots 0–4. The upload copy of the owner's project is in
`Documents\DN600_L5X FILES\Motor_Sealin_No_Latch.ACD`. TrainerStudy.ACD is in
`Documents\Studio 5000\Projects`.

## 3. Mapping to the trainer (proposal)

| Reference | Trainer |
| --- | --- |
| Emulated chassis window | Wiring module **PLC rack** part: slots 0–N, with a comms module fixed in slot 0, the CPU with a key switch, and I/O cards (16 or 32 points). |
| I/O Data tab toggles | Wired field devices on the rack's terminals, plus a "force input" toggle in the card's properties |
| Engineering PC + driver + cable | Wiring parts: PC, comms driver, cable to the CPU port. Who Active only lists the controllers reachable through that chain. |
| New Project wizard | PLC module "New project": choose target (1756-style or SLC-style), chassis size and CPU slot |
| Controller Organizer | Left tree with the same node order (Controller, Tasks/Programs/Routines, Data Types, I/O Configuration) |
| Select Module Type + New Module pages | Add-card dialog: catalog table with filters, then General (name, slot), Connection (RPI, inhibit, major-fault-on-loss), Configuration |
| Module-defined tags | Auto tags. For the simulator-style card: `Local:<slot>:I.Data[1].<n>` (Data[0] is status) and `Local:<slot>:O.Data[0].<n>`. For a catalog card: `Local:<slot>:I.Data.<n>`. SLC target: `I:<slot>/<n>`, `O:<slot>/<n>`. Alias tags (name → address) are shown on the rung as the name plus `<address>`. |
| Comms software must be running | Who Active finds nothing unless the rack has its comms module **and** the PC/driver/cable chain is wired and powered. If that breaks mid-download: "Communications timed out", and the editor goes offline. |
| Check before download | Who Active shows the controller's current project name. Downloading over a different project asks for confirmation. |
| Who Active / Set Project Path | Same dialog shape, with the tree built from the Wiring rack and cable |
| Download | Verify, then check the key mode (PROG/REM), then compare the project's I/O config against the rack. A missing or mismatched card leaves the I/O LED flashing and gives a module fault (code shown in the card's status). |
| Upload | Shows the notice "Not available in the trainer". |
