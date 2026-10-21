# Simurelay parity of the Electrical Diagram symbols

Compares the symbol library of Simurelay (from the metadata of its symbol files: names, categories, terminals; no code) with the PLC Trainer free-draw library. Built by a script from the inventory, so the counts add up. The inventory itself is kept outside the repository.

**Rules.** *Full*: the symbol exists, its terminals exist on the device it makes, the device works in the shared solver (an automated test, named below), and the drawing survives save and reload (the test *every mapped symbol … survives save and reload* places them all in one drawing). Terminal numbers may follow the device's own IEC numbering (a relay N.O. is 11-14). *Partial*: it works, but differs from Simurelay in its terminals, topology or a feature, or Simurelay's exact behaviour is not known. *Missing*: no symbol. *Excluded*: not a library symbol, or a separate decision.

| Files in the inventory | 120 |
|---|---|
| Not symbols (icons, template) | 4 (icon 1024, icon, icon_1024, motor) |
| Symbols reviewed | **116** |
| Excluded | 2 |
| Compared (denominator) | **114** |
| Full | **98** (86.0%) |
| Partial | 16 (14.0%) |
| Missing | 0 (0.0%) |
| Full + Partial | 114 (100.0%) |

Check: 98 + 16 + 0 = 114 compared, + 2 excluded = 116 reviewed.

Earlier figures (audit of 2026-10-21, before this batch): 68 full, 33 partial, 13 missing, 2 excluded (116 reviewed, 114 compared). They added up too; the changes since are the new parts and the stricter rule above.

| # | Simurelay file | Name | Category | Status | PLC Trainer symbol | Evidence / difference |
|---|---|---|---|---|---|---|
| 1 | `arrowDestination` | Destination Arrow | others | Partial | wlink | Link arrow: arrows with the same tag are joined, but there is no source/destination direction |
| 2 | `arrowSource` | Source Arrow | others | Partial | wlink | Same symbol as the destination arrow (no direction) |
| 3 | `battery` | Battery | sources | Full | batt | test: parts: a crossover switch reverses a DC motor |
| 4 | `breaker` | coil | protections | Excluded | - | Template file with no category (not a library symbol) |
| 5 | `breaker1p` | Circuit Breaker 1P | protections | Full | mcb1 | tests: a short before any breaker…, short circuits trip the nearest breaker |
| 6 | `breaker2p` | Circuit Breaker 2P | protections | Full | mcb2 | test: 0 V tied to N is not a short |
| 7 | `breaker3p` | Circuit Breaker 3P | protections | Full | mcb3 | test (v1.5): 3-pole fuse and MCB |
| 8 | `breaker4p` | Circuit Breaker 4P | protections | Full | mcb4 | test (v1.5): 4-pole fuse and MCB |
| 9 | `buttonCON` | Push Button CON | switches | Full | pbcx | test: parts: a changeover push button joins 11-12 at rest and 11-14 while pressed |
| 10 | `buttonCrossover` | Push Button Crossover | switches | Full | pbx | test: parts: a crossover switch reverses a DC motor |
| 11 | `buttonNC` | Push Button NC | switches | Full | pbnc | integration and hardwired seal-in tests |
| 12 | `buttonNO` | Push Button NO | switches | Full | pbno | integration and hardwired seal-in tests |
| 13 | `buttonNONC` | Push Button NCNO | switches | Full | pbnonc (one symbol; or pbcono + pbconc) | test: parity: holding S1 (drawn N.C.+N.O.) pulls in KM1… |
| 14 | `buzzer` | Buzzer | loads | Full | horn | buzzer tests (sounds at its rated voltage) |
| 15 | `coil` | Coil | coils | Full | kmcoil, kacoil | integration and drawn seal-in tests |
| 16 | `coilDelayOff` | Off-Delay Relay Coil | coils | Full | kfcoil | tests: off-delay timer; gaps: S1 off … off-delay goes back after its delay |
| 17 | `coilDelayOn` | On-Delay Relay Coil | coils | Full | ktcoil | tests: timing: while KT1 times…; gaps: drawn changeovers |
| 18 | `coilDelayOnOff` | On-Off-Delay Relay Coil | coils | Full | kdcoil | tests: timing: an on/off-delay relay…; gaps: drawn changeovers |
| 19 | `coilFlasher` | Flasher Relay Coil | coils | Full | flcoil | tests: timing: a flasher relay…; iec: holding S1 runs the flasher |
| 20 | `coilLatch` | Impulse Relay Coil | coils | Partial | kicoil (impulse relay) | Simurelay calls it an impulse relay coil with timer type "latch"; the impulse relay toggles on each pulse (tested), but whether Simurelay's behaves the same is not known from its metadata |
| 21 | `coilSolenoid` | Solenoid Coil | coils | Full | valve | tank example tests (valve opens on its coil) |
| 22 | `contactCON` | Contact CON | auxiliaries | Full | ka1co, ka2co, ktco, kfco, kdco, flco, ltco, olco, kbonco, kbofco | One symbol per device (Simurelay numbers one symbol by the device it is given). tests: parts: a drawn relay changeover…; gaps: drawn changeovers of KT1–KT4 and KA1; parity: tripping F1 moves the drawn changeover 95-96-98 |
| 23 | `contactCONDelayOff` | Off-Delay Contact CON for Contactors | auxiliaries | Full | kbofco (55-56 / 55-58) | Contactor + off-delay block; test: parity: an off-delay contact block… |
| 24 | `contactCONDelayOn` | On-Delay Contact CON for Contactors | auxiliaries | Full | kbonco (55-56 / 55-58) | Contactor + on-delay block; test: parity: an on-delay contact block switches 55-56 / 55-58 / 67-68… |
| 25 | `contactNC` | Contact NC | auxiliaries | Full | kmnc, ka1nc, ka2nc, ktnc, kfnc, olnc | Numbering of each device (contactor 21-22, relay 11-12, timer 15-16, overload 95-96); integration tests |
| 26 | `contactNCDelayOff` | Off-Delay Contact NC for Contactors | auxiliaries | Full | kbofnc (55-56) | test: parity: an off-delay contact block… |
| 27 | `contactNCDelayOn` | On-Delay Contact NC for Contactors | auxiliaries | Full | kbonnc (55-56) | test: parity: an on-delay contact block… |
| 28 | `contactNO` | Contact NO | auxiliaries | Full | kmno, ka1no, ka2no, ktno, kfno, olno | Numbering of each device (contactor 13-14, relay 11-14, timer 15-18, overload 97-98); integration tests |
| 29 | `contactNODelayOff` | Off-Delay Contact NO for Contactors | auxiliaries | Full | kbofno (67-68) | test: parity: an off-delay contact block switches at once… |
| 30 | `contactNODelayOn` | On-Delay Contact NO for Contactors | auxiliaries | Full | kbonno (67-68) | tests: parity: on-delay block; drawn: H3 only after 1 s |
| 31 | `contactNONC` | Contact NCNO | auxiliaries | Full | kmnonc (21-22 / 13-14), kanonc (11-12 / 21-24) | One symbol for a N.C. and a N.O. of one device; all-symbols test; device behaviour in the integration tests |
| 32 | `contactNONCDelayOff` | Off-Delay Contact NCNO for Contactors | auxiliaries | Full | kbofnonc (55-56 / 67-68) | test: parity: off-delay block |
| 33 | `contactNONCDelayOn` | On-Delay Contact NCNO for Contactors | auxiliaries | Full | kbonnonc (55-56 / 67-68) | test: parity: on-delay block |
| 34 | `contactor1p` | Contactor 1P | contactors | Full | km1 | Pole 1-2 of the contactor; contactor tests |
| 35 | `contactor2p` | Contactor 2P | contactors | Full | km2 | contactor tests |
| 36 | `contactor3p` | Contactor 3P | contactors | Full | km3 | integration tests (DOL, PLC motor) |
| 37 | `contactor4p` | Contactor 4P | contactors | Full | km4 | test (v1.5): 4-pole contactor |
| 38 | `contactorNC1p` | Contactor NC 1P | contactors | Full | kmn1 | Contactor with N.C. main poles; tests: parity: a contactor with N.C. main poles…; drawn KM2 feeds H4 at rest |
| 39 | `contactorNC2p` | Contactor NC 2P | contactors | Full | kmn2 | test: parity: a contactor with N.C. main poles… |
| 40 | `contactorNC3p` | Contactor NC 3P | contactors | Full | kmn3 | test: parity: a contactor with N.C. main poles… |
| 41 | `contactorNC4p` | Contactor NC 4P | contactors | Full | kmn4 | test: parity: … (pole 7-8 tested) |
| 42 | `diode` | Diode | others | Excluded | - | Needs one-way conduction in the solver: a separate decision (roadmap) |
| 43 | `emergencyCON` | Switch CON | switches | Full | esco | test: parity: E-stop and limit switch changeovers… |
| 44 | `emergencyNC` | Switch NC | switches | Full | estop | integration tests |
| 45 | `emergencyNO` | Switch NO | switches | Full | esno | test: parts: the E-stop N.O. 13-14 symbol closes… |
| 46 | `emergencyNONC` | Switch NCNO | switches | Full | esnonc | One symbol for 11-12 + 13-14 of the E-stop; all-symbols test; E-stop behaviour tested |
| 47 | `fuse1p` | Fuse 1P | protections | Full | fu1 | fuse tests (a short blows the fuse first) |
| 48 | `fuse2p` | Fuse 2P | protections | Full | fu2 | fuse tests |
| 49 | `fuse3p` | Fuse 3P | protections | Full | fu3 | test (v1.5) |
| 50 | `fuse4p` | Fuse 4P | protections | Full | fu4 | test (v1.5) |
| 51 | `fuseSwitch1p` | Fuse Switch 1P | protections | Full | fsw1 | test: parity: fuse switches 1P, 2P, 4P… |
| 52 | `fuseSwitch1pn` | Fuse Switch 1P+N | protections | Full | fsw1n | test: parity: … the 1P+N fuses blow and the neutral pole stays closed |
| 53 | `fuseSwitch2p` | Fuse Switch 2P | protections | Full | fsw2 | test: parity: fuse switches… |
| 54 | `fuseSwitch3p` | Fuse Switch 3P | protections | Full | fsw3 | tests (v2.0) |
| 55 | `fuseSwitch3pn` | Fuse Switch 3P+N | protections | Full | fsw3n | test: parity: … 3P+N |
| 56 | `fuseSwitch4p` | Fuse Switch 4P | protections | Full | fsw4 | test: parity: fuse switches… |
| 57 | `generator3ph` | Three-Phase Generator (C1-C2 for Auto Mode) | sources | Partial | gen (C1-C2 start) | AUTO mode runs it while C1-C2 are joined (test: parity: a generator in AUTO…). That C1-C2 is a start contact is read from Simurelay's name ("C1-C2 for Auto Mode"); its exact behaviour is not known from its metadata |
| 58 | `isolator1p` | Isolator 1P | protections | Partial | qs1 | Works (test: parts: 1- and 2-pole disconnectors…), but its terminals are 1-2; Simurelay numbers them 13-14 |
| 59 | `isolator2p` | Isolator 2P | protections | Full | qs2 | test: parts: 1- and 2-pole disconnectors… |
| 60 | `isolator3p` | Isolator 3P | protections | Full | qs3 | tests |
| 61 | `isolator4p` | Isolator 4P | protections | Full | qs4 | tests |
| 62 | `junction2p` | Connection 2P | others | Full | wline | free draw wire-piece tests |
| 63 | `junction2p90` | Connection 2P 90Â° | others | Full | wcorner | free draw wire-piece tests |
| 64 | `junction3p` | Connection 3P | others | Full | wtee | free draw wire-piece tests |
| 65 | `junction4p` | Connection 4P | others | Full | wcross | free draw wire-piece tests |
| 66 | `junctionPE` | Connection Ground | others | Full | gnd | test: free draw: the PE earth symbol is wired to the supply PE |
| 67 | `lamp` | Light | loads | Full | lamp | integration tests; lens colour in the properties |
| 68 | `lampBlink` | Light Blink | loads | Full | lampfl | tests: timing: a flashing lamp…; drawn flashing lamp |
| 69 | `motor1ph` | Single-Phase Motor | motors | Full | m1 | tests |
| 70 | `motor3ph` | Three-Phase Motor | motors | Full | m3 | integration tests |
| 71 | `motorBreaker1p` | Motor-Breaker 1P | protections | Full | qm1 | test: parity: … motor protection breakers … trip on a jammed motor |
| 72 | `motorBreaker2p` | Motor-Breaker 2P | protections | Full | qm2 | test: parity: motor protection breakers |
| 73 | `motorBreaker3p` | Motor-Breaker 3P | protections | Full | qm3 | tests |
| 74 | `motorBreaker4p` | Motor-Breaker 4P | protections | Full | qm4 | test: parity: motor protection breakers |
| 75 | `motorDC` | DC Motor | motors | Full | mdc | test: crossover reverses a DC motor |
| 76 | `motorDhalander` | Three-Phase Motor Dahlander | motors | Full | mdh | tests (Dahlander) |
| 77 | `motorStarDelta` | Three-Phase Motor Star/Delta | motors | Full | m6 | star-delta tests |
| 78 | `motorTwoSpeeds` | Three-Phase Motor Two speeds (Separated Winding) | motors | Full | m2s | test (two speeds) |
| 79 | `overload1p` | Overload Relay 1P | protections | Full | ol1 | test: parity: 1- and 2-pole overload relays trip… |
| 80 | `overload2p` | Overload Relay 2P | protections | Full | ol2 | test: parity: overload relays |
| 81 | `overload3p` | Overload Relay 3P | protections | Full | ol3 | integration tests |
| 82 | `phaseFailure` | Phase Failure Relay | protections | Full | kpmon (+ kpno, kpnc, kpco) | tests: timing: a phase failure relay…; drawn phase relay |
| 83 | `powerSupply` | Power Supply | sources | Partial | psu | The 24 V supply has one 230 V input; Simurelay's has an LV and an HV input |
| 84 | `powerSupply2` | Power Supply | sources | Full | psu | tests (24 V supply) |
| 85 | `rcboBreaker2p` | RCBO Circuit Breaker 2P | protections | Full | rcbo | test: gaps: an RCBO 2P also trips on earth leakage… |
| 86 | `rcboBreaker4p` | RCBO Circuit Breaker 4P | protections | Full | rcbo4 | tests: parts: RCBO 4P trips on a short; gaps: earth leakage |
| 87 | `rccbBreaker2p` | RCCB Circuit Breaker 2P | protections | Full | rcd | earth-leakage tests |
| 88 | `rccbBreaker4p` | RCCB Circuit Breaker 4P | protections | Full | rcd4 | RCD 4P tests |
| 89 | `ring` | Bell Ring | loads | Full | bell | test: parts: a bell and a siren sound… |
| 90 | `rollerCON` | Switch CON | switches | Partial | lsco | Works (test: parity: E-stop and limit switch changeovers…) with the IEC numbering 11-12 / 11-14; Simurelay lists 11, 12, 13 |
| 91 | `rollerNC` | Switch NC | switches | Full | lsnc | limit switch tests |
| 92 | `rollerNO` | Switch NO | switches | Full | lsno | limit switch tests |
| 93 | `rollerNONC` | Switch NCNO | switches | Full | lsnonc | One symbol for 21-22 + 13-14; all-symbols test |
| 94 | `siren` | Siren | loads | Full | siren | test: parts: a bell and a siren sound… |
| 95 | `sourceGnd` | Protection Earth | sources | Partial | pM | A 0 V point; there is no separate GND conductor |
| 96 | `sourceL1` | Power Phase L1 | sources | Full | pL1 | potential point tests |
| 97 | `sourceL1L2L3` | Power Phase L1L2L3 | sources | Partial | src3 | The 3-phase supply always has N and PE too |
| 98 | `sourceL1L2L3N` | Power Phase L1L2L3N | sources | Partial | src3 | The 3-phase supply always has PE too |
| 99 | `sourceL2` | Power Phase L2 | sources | Full | pL2 | tests |
| 100 | `sourceL3` | Power Phase L3 | sources | Full | pL3 | tests |
| 101 | `sourceN` | Power Phase N | sources | Full | pN | tests |
| 102 | `sourceNegative` | Power Negative | sources | Full | pM | tests |
| 103 | `sourcePE` | Protection Earth | sources | Full | pPE | tests |
| 104 | `sourcePlus` | Power Positive | sources | Full | pP | tests |
| 105 | `switch3p` | Switch 3 Positions I-II-III | switches | Partial | sel3h, sel3a | The 3-position selector is HAND-OFF-AUTO (13-14 / 23-24); Simurelay's I-II-III topology differs |
| 106 | `switch3p0` | Switch 3 Positions I-0-II | switches | Partial | sel3h, sel3a | Same selector; Simurelay's I-0-II topology differs |
| 107 | `switchCON` | Switch CON | switches | Full | selcx | test: parity: the selector changeover joins 11-12 in position 0 and 11-14 in I |
| 108 | `switchCrossover` | Switch Crossover | switches | Full | selx | test: parts: a crossover switch reverses a DC motor |
| 109 | `switchNC` | Switch NC | switches | Full | selnc | test: parity: … the N.C. selector opens 11-12 in I |
| 110 | `switchNO` | Switch NO | switches | Full | selno | tests; gaps: S1 feeds every coil |
| 111 | `switchNONC` | Switch NCNO | switches | Full | selnonc | One symbol for 21-22 + 13-14; selector NO+NC tested |
| 112 | `text` | Text | others | Full | text | tests |
| 113 | `tmBreaker1p` | Thermal-Magnetic Circuit Breaker 1P | protections | Partial | mcb1 | The MCB trips on a short circuit only; no thermal (overload) trip |
| 114 | `tmBreaker2p` | Thermal-Magnetic Circuit Breaker 2P | protections | Partial | mcb2 | Same as the 1P |
| 115 | `tmBreaker3p` | Thermal-Magnetic Circuit Breaker 3P | protections | Partial | qf3 / mcb3 | Same |
| 116 | `tmBreaker4p` | Thermal-Magnetic Circuit Breaker 4P | protections | Partial | mcb4 | Same |

## Not in Simurelay's library but in PLC Trainer

PLC power, relay and transistor outputs and inputs (real controller and I/O card terminals), sensors (proximity, photo, pressure, float, thermostat, flow), key and foot switches, changeover contacts of the latching relay and timers, phase failure relay contacts, heaters, meters, the generator start input and the fuse/RCBO variants above.
