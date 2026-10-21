# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
