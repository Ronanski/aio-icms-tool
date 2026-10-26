---
name: allen-bradley
description: Allen-Bradley / Rockwell reference for MT PLC Studio (mtps/). Use before changing anything in MT PLC Studio that copies Studio 5000 Logix Designer, RSLinx Classic, Logix Emulate or a real ControlLogix/CompactLogix, such as tags, aliases, I/O addressing (Local:slot:I.Data.bit), the New Tag dialog, the I/O configuration, modules, the ladder editor, instructions and their .members, controller modes, go online, download/upload, faults, the emulator, or moving a project from the emulator to a real PLC. Also use when the owner says "golden reference", "parang RSLogix" or "tulad ng Allen-Bradley".
---

# Allen-Bradley (Studio 5000 / RSLinx / Logix Emulate) for MT PLC Studio

The owner's golden reference is the Rockwell software: **Studio 5000 Logix Designer** (formerly RSLogix 5000), **RSLinx Classic** and **Studio 5000 Logix Emulate**. MT PLC Studio puts all three in one app. Each part has to work the way the reference does, even where the app shows it in its own layout. The goal behind it: **what the owner does on the emulator must be exactly what they would do on a real ControlLogix or CompactLogix.** Where the emulator and a real controller differ, follow the real controller unless the step only exists on the emulator (virtual chassis, speed of time).

## Rules

1. **Look it up before changing it.** Read the reference file for that area (listed below) first. If the answer is not there, search the Rockwell publications (the numbers are in `references/sources.md`), then add what you learn to the right reference file.
2. **Copy the behaviour, not only the look.** That covers the names, the address formats, the dialog fields and their order, what is checked, the error text, and which actions are allowed in each mode.
3. **Test as a user.** Click and tap the way a person would: Playwright with touch for tablet and phone, the mouse for desktop. Test on all three layouts. Setting the state from code does not count as a test.
4. **The buttons the owner uses must show on every device layout**: desktop, tablet portrait and landscape, and phone.
5. **Say what is verified.** Each reference file marks what is quoted from a Rockwell publication and what is general knowledge. Tell the owner which one a change rests on, and check general-knowledge items in the owner's VM when they matter.
6. Keep the app plain HTML, CSS and JS (see `CLAUDE.md`). Engine: `mtps/js/engine.js`. Ladder drawing: `mtps/js/ladder.js`. UI: `mtps/js/app.js`.

## Reference files

| Topic | File |
|---|---|
| Tag names, scope, data types, arrays, bits, alias tags, I/O addresses (`Local:2:I.Data.3`) | `references/addressing-and-tags.md` |
| Studio 5000 workflow: new project, I/O configuration, New Tag, the ladder editor (drag to a node, double-click, right-click), verify, download, modes, online edits | `references/studio5000-workflow.md` |
| RSLinx Classic (drivers, RSWho, Virtual Backplane) and Logix Emulate (virtual chassis, 1789-SIM, speed of time) | `references/emulate-and-rslinx.md` |
| Major, minor and I/O faults, with the codes the app uses | `references/faults.md` |
| Real controllers (ControlLogix, CompactLogix): front panel, IP setup, firmware, EtherNet/IP paths, Go Online / Download / Upload, emulator vs real, moving a project to a real PLC, what the app can and cannot do with real hardware | `references/real-controllers.md` |
| Where each concept lives in MT PLC Studio, plus the known differences still open | `references/app-mapping.md` |
| The Rockwell publications used | `references/sources.md` |

## Quick facts (the ones most often asked)

- **I/O address**: `Location:Slot:Type.Member.SubMember.Bit`. `Location` is `Local` for the controller's own chassis, or the adapter name for remote I/O. `Type` is `I` (input), `O` (output), `C` (configuration) or `S` (status). A digital input point is `Local:2:I.Data.3`; a digital output point is `Local:0:O.Data.2`; an analog channel is `Local:3:I.Ch0Data`. These I/O tags are created automatically, at controller scope, when the module is added to the I/O Configuration.
- **Path to a real controller**: `AB_ETHIP-1\192.168.1.10\Backplane\0` (ControlLogix) or `AB_ETHIP-1\192.168.1.20` (CompactLogix 5380). The emulator's is `VBP-1\<slot>`.
- **Download needs a match**: controller type, firmware revision and slot. A mismatch stops the Download with a message; it is never silently ignored.
- **Write logic on alias tags**, never on `Local:` addresses directly: moving to a real PLC then only re-aliases the I/O.
- **Tag address**: `Name[Element].Member.Bit`. For example `Run_Timer.DN`, `Recipe[3]`, `Word.5`, `Grid[1,2]`.
- **Alias tag**: a descriptive name that points to another tag, member or bit (often an I/O point). Both names share one value. You assign it in the **Alias For** cell with the tag browser. Double-click a tag to select it; for a bit, select the tag, click **+** to its right, then pick the bit number.
- **Tag name rules**: letters, digits and `_`; starts with a letter or `_`; at most 40 characters; no two underscores in a row; no underscore at the end; not case sensitive.
- **Scope**: a controller tag is visible to every program. A program tag is visible only inside its program, and it hides a controller tag with the same name. Produced and consumed tags, message tags and axis tags must be controller scope.
- **Simulated I/O in Logix Emulate**: the virtual chassis holds a 1789-SIM (32-point input/output simulator). The project holds a 1756-MODULE (generic): Input 1 / size 2, Output 2 / size 1, Config 16 / size 0, and an RPI of at least 50 ms. The owner rejected this for the app (0.4.0-beta.2). The app's emulator chassis uses I/O cards instead (DI16, DO16, AI4, AO4).
