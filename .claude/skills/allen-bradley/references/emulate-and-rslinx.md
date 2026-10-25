# Logix Emulate and RSLinx Classic

## Logix Emulate (LGEM5K-GR016M-EN-E, Nov 2022)

**What it is**
- Logix Emulate emulates a Logix 5000 controller in software, without a physical controller or I/O modules.
- You program it, and reach it, from the same PC, or remotely through FactoryTalk Linx Gateway.
- It has a **virtual chassis**. Each emulation module runs as a Windows service.

**Differences from a real controller**
- It cannot control real I/O.
- It supports breakpoints and tracepoints (the BPT/TPT instructions, on the Debug tab).
- It has time scaling ("speed of time"; 0% stops execution) and a Single Scan mode.
- Messaging is local only. Motion uses virtual axes only.
- JSR passes its parameters in reverse order.
- Instruction timing is very different from a real controller's.

**Create a controller**
1. In the virtual chassis, click Slot > Create Module.
2. Pick the Emulate controller.
3. Choose the slot.
4. Set the name and the speed of time.

**Simulated I/O**
- This is the only I/O form Emulate simulates.
- In the virtual chassis:
  1. Click Slot > Create Module.
  2. Pick **1789-SIM 32 Point Input/Output Simulator**.
  3. Choose the slot.
  4. Set the marquee label (default "Simulator Module").
- In the project:
  1. In I/O Configuration, click New Module.
  2. Pick **1756-MODULE** (Generic 1756 Module).
  3. Set Name, Comm Format and Slot.
  4. Set the connection parameters:
     - read/write: Input 1 / size 2, Output 2 / size 1, Configuration 16 / size 0;
     - listen-only: Output instance 3 instead.
  5. Set the **RPI to at least 50 ms**. The profile's default of 5 ms fails.
- Another way to simulate I/O: produced and consumed tags between two emulated controllers.

**Remove a module**
- Click Slot > Remove Module, or right-click the module and click Remove.
- This cannot be undone. For a controller, you can keep or clear its configuration.

**Modes and indicators**
- Modes: Program, Run, Remote, Single Scan.
- Indicators: the controller and simulator status indicators on the chassis.

**Version note**
- Logix Designer v37 and later do not support emulated 5560/5570 controllers. Use FactoryTalk Logix Echo instead.

## RSLinx Classic (4.40 guide)

**Configure Drivers**
- Menu: Communications > Configure Drivers.
- Pick the driver type and click Add New. The default name is `<TYPE>-1`.
- The status shows Running. The driver can be started, stopped and configured.
- The **Virtual Backplane** type ("SoftLogix58xx, USB" in the driver list) is the driver for the Emulate chassis.
- Other types include EtherNet/IP and Ethernet devices.

**RSWho**
- Shows the drivers as a tree. Expand the Virtual Backplane to see the chassis and its slots: the emulated controller and the 1789-SIM.
- A path is written `<driver>\<slot>`, for example `VBP-1\2`.
- In Logix Designer, **Who Active** shows the same RSWho tree. Pick the controller, then Set Project Path, Go Online or Download.
