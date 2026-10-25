# Studio 5000 Logix Designer workflow

## Sources

- 1756-PM004, Create a tag / Assign an alias (doc-verified).
- LGEM5K-GR016M, "Use Logix Emulate in project development" (doc-verified).
- All other sections come from general Studio 5000 usage. Check them against the software (the owner's VM) when in doubt.

## Start
- With no project open, the start page offers **New Project**, **Open Project** and **Recent Projects**.
- A project is a file (`.ACD`) on disk. The software does not keep a hidden copy.
- Closing with unsaved changes asks whether to save first.

## New Project
1. Pick the controller type (for an emulator, **Emulate 5570 Controller**; for v37+ use FactoryTalk Logix Echo).
2. Set the revision, the name, the location on disk, the chassis size and the slot of the controller.
3. Click Finish. You get:
   - MainTask (continuous) → MainProgram → MainRoutine;
   - an empty I/O Configuration that shows only the controller.

## I/O Configuration
1. Right-click the backplane, then **New Module**.
2. Search the catalog, pick the module, then click **Create**.
3. Set the Name, Description, **Slot**, Comm Format / Connection, Electronic Keying (Exact Match, Compatible Module, Disable Keying) and RPI (1–536870.911 ms).

The module's I/O tags (`Local:slot:I/O/C`) appear in Controller Tags at once.

## New Tag dialog (right-click Controller Tags or Program Tags > New Tag, or right-click an operand > New "Name", or Ctrl+W in the operand)

The fields, in order:

| Field | What it holds |
|---|---|
| Name | The tag's name |
| Description | Optional text |
| Usage | For program parameters only |
| Type | Base / Alias / Produced / Consumed |
| Alias For | Shown for Alias, with the tag browser drop-down |
| Data Type | Has a `…` button: Select Data Type, with array dimensions |
| Parameter Connection | For program parameters |
| Scope | Controller, or the program |
| External Access | Read/Write, Read Only, None |
| Style | Decimal, Hex, Binary, … |
| Constant | A check box |
| Open Configuration | A check box |

- New "Name" from an operand fills in the name and a data type that fits the operand. For example, OTE gives BOOL and TON gives TIMER.
- Alias For is checked on OK. A target that does not exist is an error.

## Edit Tags / Monitor Tags
- They are spreadsheets of the tags for one scope.
- Expand a structure with `+` to see its members. Expand an integer to see its bits.
- The columns are Name, Alias For, Base Tag, Data Type, Description, External Access, Constant and Style. Monitor Tags shows Value and Force Mask instead.

## Ladder editor
- **Instruction toolbar** above the ladder, in tabs (Favorites, Bit, Timer/Counter, Compare, Compute/Math, Move/Logical, File/Misc, Program Control, …). The **Errors window** (with Search Results and Watch) is at the bottom of the main window.
- **Click** selects an instruction or an operand. **Double-click** an operand to edit it. Its tag browser opens with the down arrow.
- **Right-click** opens the menu. It offers Cut, Copy, Paste, Delete, Add Ladder Element, Edit Main Operand Description, New "Tag", Go To Cross Reference, Toggle Bit, and others.
- **Drag and drop.** You can drag an instruction from the toolbar, or one that is already placed. While you drag, every place it can go shows a small grey node: before or after any instruction, on any branch level, at the end of the rung, and on other rungs. The node under the pointer turns green. Ctrl+drag copies the instruction instead of moving it. Branches can be dragged too.
- Branches: Add Branch, Add Branch Level. A branch's start or end can be dragged to widen it.
- Rung comments sit above the rung. Operand descriptions sit above the instruction. Alias information appears in `<...>` below the tag name.

## Verify
- Verify Routine or Verify Controller. The Errors window lists errors and warnings with the rung number. Double-click a line to go to that rung.
- A rung with errors shows `e`/`E` markers in its margin.

## Communications
- Who Active (an RSWho browser) lets you pick the controller, then Go Online, Download or Upload.
- Download compares the project's controller type and slot with the target, and stops if they do not match.
- Download, then the question "Change controller mode back to Remote Run?"
- Modes:
  - key switch: RUN, REM, PROG;
  - remote modes (key in REM): Remote Run, Remote Program, Remote Test.
- Online edits run in this order: start pending edits (e) → accept (i) → test (I) → assemble (or untest).

## Workflow with the emulator (LGEM5K-GR016M)
1. Create a project with the emulator controller type.
2. Make the I/O Configuration match the virtual chassis.
3. Write the logic with **symbolic tags aliased to the simulated I/O** (or to produced and consumed tags).
4. Download and debug.
5. Save a copy.
6. Change the controller type to the real controller.
7. Re-alias the I/O points to the real modules.
