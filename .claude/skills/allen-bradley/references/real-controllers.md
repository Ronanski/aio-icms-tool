# Real controllers, and moving from the emulator to them

The owner wants the app to behave so that what you learn on the emulator works the same on a real ControlLogix or
CompactLogix. This file covers the real hardware side and the differences from the emulator.

Sources: general Studio 5000 / RSLinx field practice. Check against the user manuals before relying on a detail:
ControlLogix 5580 (1756-UM543), CompactLogix 5380 (5069-UM001), FactoryTalk Logix Echo (9310-GR001), and the
owner's VM.

## Controller families (the ones a trainer meets)

| Family | Catalog examples | I/O | Notes |
|---|---|---|---|
| ControlLogix 5580 | 1756-L81E … L85E | 1756 modules in a 4/7/10/13/17-slot chassis | Controller in any slot. Built-in Ethernet port. |
| ControlLogix 5570 | 1756-L71 … L75 | 1756 | Needs a 1756-EN2T for Ethernet. Not emulated from v37 on. |
| CompactLogix 5380 | 5069-L306ER … L340ERM | 5069 modules to the right of the controller (local bus, no chassis slots to pick) | Controller is always "slot 0"; the modules are numbered 1, 2, … from left to right. |
| CompactLogix 5370 | 1769-L30ER … L36ERM | 1769 modules | Older, still common in the field. |
| Emulator | Emulate 5570, or Logix Echo 5580 | Virtual chassis | See `emulate-and-rslinx.md`. |

## Front of a real controller
- **Mode switch** (key): RUN, REM, PROG. In REM, the software can choose Remote Run, Remote Program and Remote Test.
  In RUN or PROG the software cannot change the mode.
- **Status indicators**: RUN (green = Run mode), FORCE (amber steady = forces installed and enabled, flashing =
  installed but disabled), SD (card activity), OK (green = no fault, red flashing = major fault, red steady =
  hardware or nonrecoverable fault), I/O (green = all connections OK, green flashing = one or more not responding),
  and the network LEDs (NS, LINK). 5380 and 5580 also have a 4-character status display that scrolls the
  controller name, the IP address and fault text.
- **SD card**: can hold an image of the project. Load options: User Initiated, On Power Up, On Corrupt Memory.

## Getting a real controller on the network
1. A new 5380/5580 has DHCP on and no IP address. Set one with the **BOOTP/DHCP tool** (by MAC address), or with
   RSLinx over a **USB** cable (driver: USB), then in Module Configuration > Port Configuration.
2. Make the controller's **firmware revision** match the project's revision (Controller Properties > General >
   Revision). Update firmware with **ControlFLASH Plus**. A revision mismatch stops the Download.
3. In RSLinx Classic, Configure Drivers > **EtherNet/IP Driver** (browses the subnet) or **Ethernet devices**
   (a list of IP addresses). Name defaults: `AB_ETHIP-1`, `AB_ETH-1`.
4. RSWho / Who Active then shows the path, for example:
   - ControlLogix: `AB_ETHIP-1\192.168.1.10\Backplane\0` (the controller in slot 0 behind the Ethernet module or
     its own port);
   - CompactLogix 5380: `AB_ETHIP-1\192.168.1.20` (the controller itself);
   - emulator: `VBP-1\2` or, for Logix Echo, the Echo driver's IP.

## Going online with a real controller (the same flow the emulator uses)
- **Who Active** → pick the controller → **Set Project Path** → **Go Online**.
- If the project in the controller differs from the open file, the **Connected To Go Online** dialog offers
  **Upload**, **Download** or **Select File**. It names the controller, its serial number and the file.
- **Download** checks, in this order: controller type (catalog), firmware revision, slot, then whether the
  controller's mode allows it. It warns that outputs may change and offers to return the controller to Remote
  Run afterwards. A Download replaces the whole program and the tag values in the controller with the file's.
- **Upload** reads the project from the controller into the open file (tag values too). Then save the file.
- After an upload or online edits, the file on disk is out of date until you **Save**. The title bar shows this.
- **Online status bar** (top left): mode (Rem Run, Rem Prog, Run, Program, Faulted), the forces box (No Forces /
  Forces Enabled / Forces Disabled), the edits box (No Edits / Edits Present), and the energy storage and I/O
  indicators. These mirror the controller's LEDs.

## Emulator ↔ real controller: what changes
| Area | Emulator (Logix Emulate / Echo) | Real controller |
|---|---|---|
| I/O | Simulated only: 1789-SIM on Emulate; the app uses DI16/DO16/AI4/AO4 cards | Real modules; wrong module = keying fault 16#0116, missing module = 16#0204 |
| Timing | Scan time unlike the real one; speed of time can slow or stop it | Real scan time and RPI |
| Debug | BPT/TPT breakpoints, single scan | None of these |
| Mode switch | Software only | Physical key; software changes mode only in REM |
| Firmware | Emulator revision = software revision | Must match the project; update with ControlFLASH Plus |
| Faults | Mostly program faults (type 4) and I/O faults the user injects | Also power-up (type 1), watchdog (6), hardware, battery/ESM minor faults |
| Path | `VBP-1\slot` or Echo IP | `AB_ETHIP-1\<ip>\Backplane\<slot>` |

**Moving a project from the emulator to a real controller** (Rockwell's own workflow, LGEM5K-GR016M):
1. Save a copy of the project.
2. Controller Properties > **Change Controller** to the real catalog number and revision.
3. Replace the simulated I/O modules in I/O Configuration with the real ones, same slots if possible.
4. Re-alias each I/O alias tag to the real module's point. The logic does not change, because it uses the alias
   names. This is why the app should always teach **logic on alias tags, never on `Local:` addresses directly**.
5. Set the path to the real controller and Download.

## What MT PLC Studio can do with a real controller (limits to tell the owner)
- The app runs in a web view. It cannot open RSLinx drivers, USB or raw sockets in the browser.
- The Windows shell (Electron) and the Android shell (Capacitor) **could** reach a real controller over
  EtherNet/IP (CIP, TCP port 44818) for **reading and writing tags** and reading the controller's status. This is
  documented and done by open-source libraries (for example libplctag), but it would be new code in the shells,
  and it needs the owner's approval as its own feature. Writing to a real, running machine is a safety risk:
  such a feature must be read-only by default.
- **Downloading a program to a real controller is not possible** for the app: that protocol is Rockwell's and not
  public. The bridge to real hardware is the **L5X export**: import it in Studio 5000, then download from there.
  So the L5X must import cleanly in the owner's Studio 5000 (check in the VM).
