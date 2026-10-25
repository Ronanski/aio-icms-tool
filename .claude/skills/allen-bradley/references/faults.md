# Faults (1756-PM014O-EN-P, Sep 2024)

## Major faults
- A major fault stops the controller, which enters faulted mode. The outputs go to their faulted state.
- The **Major Faults tab** of Controller Properties shows the type and the code. Clear them there, or with the key switch from PROG to RUN.
- The program's `MajorFaultRecord` attribute holds the same type and code.

| Type | When it happens | Where to handle it |
|---|---|---|
| 1 | Power-up (the controller powers up in Run or Remote Run) | Power-Up Handler |
| 3 | I/O: communication with an I/O module fails | Controller Fault Handler |
| 4 | Program: an instruction faults while it executes | Fault routine of the program |
| 6 | Watchdog timer for a task expires | Controller Fault Handler |
| 11 | Motion: an axis faults | — |

Common codes. Only 4/20 is quoted from PM014. The others are from general Logix knowledge: check them against the Rockwell spreadsheet "Logix 5000 Controller Fault Codes" before relying on them.

| Type/Code | Fault |
|---|---|
| 4/20 | Array subscript too large or less than 0 (also POS/LEN of a CONTROL out of range) |
| 4/21 | Control structure LEN or POS < 0 |
| 4/31 | JSR parameters do not match |
| 4/34 | Timer PRE or ACC is negative |
| 4/82 | SFC jump error |
| 6/1 | Task watchdog expired |
| 3/16 | I/O connection failure with "major fault on connection failure" set |

- **Fault routine.** Create it with Add > New Routine and Assignment = Fault, then assign it in the program's properties. It can clear the fault: GSV MajorFaultRecord, clear it, SSV.
- **Test a fault.** Use the JMP/LBL pattern, or a JSR to the fault routine with code 999.

## Minor faults
- A minor fault does not stop the controller.
- `S:MINOR` is set until the end of the scan.
- GSV FaultLog MinorFaultBits gives the cause:
  - bit 6: task overlap;
  - bit 7: load from nonvolatile memory;
  - bit 9: serial port;
  - bit 10: battery, ESM or UPS.
- Instruction-related minor faults include arithmetic overflow (S:V).

## I/O faults
- The Connection tab of Module Properties shows a code such as 16#0204 or 16#0116.
- The I/O indicator on the controller flashes, and "I/O Not Responding" shows.

| Code | Meaning |
|---|---|
| 16#0204 | Connection request timed out: the module is not there |
| 16#0116 | Electronic keying mismatch: wrong module type in that slot |
| 16#0109 | Invalid connection size: generic module sizes |
| 16#0203 | Connection timed out after it was established |
