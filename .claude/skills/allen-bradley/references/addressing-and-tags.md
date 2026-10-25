# Addressing and tags (Logix 5000)

Source: *Logix 5000 Controllers I/O and Tag Data*, publication 1756-PM004 (Nov 2023), chapters 1–2.

## Tag types
| Type | What it is |
|---|---|
| Base | Stores a value. This is the default. |
| Alias | Another name for a tag, member or bit. Both names share one value. |
| Produced | A tag another controller can consume over the network. Controller scope only. |
| Consumed | A tag that receives the value produced by another controller. Controller scope only. |

## Scope
- **Controller tags** (global): every program can use them. All I/O tags, produced and consumed tags, MSG tags, AXIS tags and PanelView tags live here.
- **Program tags** (local): only the routines of that program can use them. A program tag hides a controller tag of the same name: inside that program, the name refers to the program tag.
- In the tag window, `(C)` beside an alias means its target is at controller scope.

## Names
- Letters (A–Z, a–z), digits (0–9) and `_`.
- Starts with a letter or `_`.
- At most 40 characters.
- No two `_` in a row, and no `_` at the end.
- Not case sensitive: `MOTOR` and `motor` are the same tag.
- The same rules apply to program, routine, task, module and data type names.

## Data types
- Atomic types:
  - `BOOL` (1 bit)
  - `SINT` (8 bits)
  - `INT` (16 bits)
  - `DINT` (32 bits)
  - `LINT` (64 bits)
  - `REAL` (32-bit float)
- **Prefer DINT.** The controller allocates at least 4 bytes per tag, and instructions work natively on 32-bit values.
- Predefined structures:
  - `TIMER` (`.PRE .ACC .EN .TT .DN`)
  - `COUNTER` (`.PRE .ACC .CU .CD .DN .OV .UN`)
  - `CONTROL` (`.LEN .POS .EN .EU .DN .EM .ER .UL .IN .FD`)
  - plus others such as `MESSAGE` and `PID`.
- Module-defined types: the I/O tags (for example `AB:1756_DI:I:0`).
- User-defined types (UDT): members of any type. A member array has one dimension only.

## Arrays
- Arrays have 1, 2 or 3 dimensions, for example `DINT[10]`, `DINT[4,5]` or `DINT[2,3,4]`.
- Subscripts start at 0.
- Address an element as `Tag[3]` or `Tag[1,2]`.
- **Indirect subscripts** are allowed: `Tag[Index]`, `Tag[Index+1]`, `Tag[ABS(X)]`.
- A subscript out of range is a **major fault** (type 4, code 20). Transitional instructions check the subscript even when the rung is false.

## Bits
- Any bit of a SINT, INT or DINT can be addressed with `.n`: `Word.0` to `Word.31` for a DINT.
- An indirect bit is written `Word.[Index]`.
- A bit number past the size of the integer is an error.

## Full address
`Tag[Element].Member.SubMember.Bit`, for example `Line[2].Motor.Cmd.0`.

## I/O addresses
Format: `Location:Slot:Type.Member.SubMember.Bit`

| Part | Values |
|---|---|
| Location | `Local` for the controller's own chassis or DIN rail; the adapter's name for remote I/O (for example `Rack2:3:I.Data.0`) |
| Slot | The module's slot number in its chassis |
| Type | `I` input, `O` output, `C` configuration, `S` status |
| Member | Digital modules: `Data` (and `Fault`). Analog modules: `Ch0Data`, `Ch1Data`, … |
| Bit | Digital: the point number in `Data` |

- Real 1756 discrete modules store `Data` as a **DINT**, even on a 16-point module.
- With rack-optimized connections, digital I/O appears as `Rack:I.Data[slot]` instead. Direct connections, which is what the app models, give `Local:slot:I.Data`.
- I/O tags are created automatically at controller scope when the module is added to the I/O Configuration. Removing the module removes the tags.
- The Rockwell manual's own examples:
  - `drill_1_depth_limit` is an alias for `Local:2:I.Data.3`
  - `drill_1_on` is an alias for `Local:0:O.Data.2`
  - `stop` is an alias for `Local:2:I.Data.1`
  - `conveyor_on` is an alias for `Local:0:O.Data.0`
  - `north_tank` is an alias for `tanks[0,1]`

## Alias tags
Use an alias to:
- program the logic before the wiring diagrams exist;
- give an I/O device a descriptive name;
- give a complex tag a simpler name;
- name an element of an array.

Typical workflow:
1. Create a descriptive tag for each device and write the logic with it.
2. Add the modules to the I/O Configuration.
3. Convert each tag to an alias of its I/O point.

To assign an alias in the Tag Editor:
1. Click the **Alias For** cell, then its browse arrow.
2. Pick the target. Double-click a tag to select it. For a bit: select the tag, click **+** to its right, then choose the bit number.
3. Click another cell.

Notes:
- The alias's data type is the type of its target, shown greyed out.
- **Show Tag Alias Information**: Tools > Options > Ladder Editor > Display. This shows `<Local:2:I.Data.3>` under the alias name in the ladder.
