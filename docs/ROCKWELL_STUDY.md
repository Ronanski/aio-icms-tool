# RSLogix 500 vs Studio 5000 vs PLC Trainer (pag-aaral)

Ginawa noong 2026-10-21 para sa "PLC target bawat project". Dito lang sa `docs/` binabanggit ang mga pangalan ng produkto
(Rockwell Automation, RSLogix 500, Studio 5000 Logix Designer, SLC 500, MicroLogix, ControlLogix); sa app mismo ay
"file-based" at "tag-based / 1756-style" lang ang tawag, at walang kinopyang code o artwork.

> **Update:** natapos ng hiwalay na study session ang pagtingin sa VM; ang buong tala ay nasa `docs/ROCKWELL_UI_STUDY.md` (layout at flow na nakita mismo). Ang app ay inayon na doon (`feature/plc-ui-align`). Ang mga hanay sa ibaba na may (kaalaman) ay nakumpirma o naitama roon.

## Paano ginawa ang pag-aaral

- VM ng owner: **Win10-Studio500-FTView12** (VMware Workstation). Naka-install: Studio 5000, RSLogix 500, RSLinx Classic,
  FactoryTalk View, Studio 5000 Logix Emulate.
- **Nakita sa VM (computer use):** ang Studio 5000 start page — *Create* (New Project, From Import, From Sample Project),
  *Open* (Existing Project, Sample Project, From Upload), *Explore* (Help, About) at ang *Recent Projects* (hal.
  `PLC2_Exercises`, `Motor_SealIn_No_L…`, `Motor_VFD`, `System_Fault_Latch`, `Simple_Tank_Filling_System.ACD` sa
  `C:\Users\Admin\Documents\Studio 5000\Projects`). Screenshot sa session scratchpad (`study/01-studio5000-start.jpg`).
- **Nakita rin sa VM:** ang main window ng Logix programming software (sa VM na ito ay ang lumang pangalan, *RSLogix 5000*):
  menu File / Edit / View / Search / Logic / Communications / Tools / Window / Help; sa kaliwa ang status ng controller
  (*No Controller*, *No Forces*, *No Edits*, *Redundancy*) na may RUN / OK / BAT / I/O na ilaw at larawan ng key switch;
  *Path* ng komunikasyon; at ang **instruction toolbar** na may mga button (rung, branch, XIC, XIO, OTE, OTL, OTU) at mga
  tab na *Favorites, Safety, Alarms, Bit, Timer/Counter, Input/Output…* (`study/02-logix-main-toolbar.jpg`). Ang RSLogix 500 ay
  may desktop icon na "RSLogix 500" pero hindi pa nabuksan dito.
- **Hindi natapos sa VM:** hindi umaabot sa VMware window ang click at key ng computer use (kahit ang File menu at
  maximize ng VMware mismo), kaya malamang naka-"Run as administrator" ang VMware at hinaharang ng Windows ang input.
  Hiniling sa owner na buksan ulit nang normal; binuksan niya ulit, pero hindi pa rin umaabot ang click (ganoon din nang
  ako ang nagbukas ng VMware). Malamang hindi tinatanggap ng VMware ang ganitong uri ng input sa loob ng VM. Ang mga hakbang sa ibaba na may tatak **(kaalaman)** ay mula sa
  kilalang kilos ng dalawang app (manuals at karanasan), hindi pa na-screenshot sa VM na ito. Kapag gumana na ang input,
  uulitin ang bawat hakbang sa throwaway project at papalitan ang tatak ng **(VM)**.
- Walang binago sa VM o Windows settings, walang licence na ginalaw, walang na-download o na-save sa labas ng temp.

## Paghahambing

| # | Item | RSLogix 500 (SLC 500 / MicroLogix) | Studio 5000 (1756 ControlLogix) | PLC Trainer ngayon |
|---|---|---|---|---|
| 1 | Bagong project | File → New → **Select Processor Type**: listahan ng SLC 5/01…5/05 at MicroLogix 1000/1100/1400; pangalan ng processor, driver, node. Fixed SLC (1747-L20…) o modular (L5x). **(kaalaman)** | Start page → **New Project** (nakita **(VM)**) → wizard: Logix family → controller (hal. 1756-L83E), revision, **chassis** (1756-A4/A7/A10…), **slot** ng controller, pangalan. **(kaalaman)** | File → New project: pangalan, "Start from" (example) at **PLC target**: *File-based controller (data files, I:1/0)* o *Tag-based controller, 1756-style chassis (Local:1:I.Data.0)*. Napapalitan pa sa I/O Configuration. |
| 2 | Hardware / chassis | Rack na 4/7/10/13 slot; **slot 0 = CPU**, power supply sa kaliwa (1746-P1/P2/P4). Mga card: 1746-IB16, -IA16, -OW16, -OB16, -NI4, -NO4V… Mahaba ang card, terminal block sa harap na may pintuan at kulay ng label (pula AC, asul DC, kahel relay). **(kaalaman)** | 1756 chassis; power supply (1756-PA72/PA75) sa kaliwang dulo, hindi slot; controller kahit saang slot (karaniwan 0). Makikitid na module (1756-IB16, -OB16, -OW16I, -IF8…), **RTB** sa harap, LED na "ST" bawat point. **(kaalaman)** | Iisang uri ng device para sa dalawa (`mpsu`, `mcpu`, `mdi8/16`, `mdi16ac`, `mdo8/16`, `mdo16t`, `mai4`, `mao2`), 70 × 300, terminal sa gilid. **Bago:** ang drawing ay sumusunod sa target — file-based = rack look (mas maputing housing, SLOT sa itaas, LED window, pinto na may kulay ng uri, CPU na may RUN/FLT/BATT/FORCE at RS-232); tag-based = 1756 look (dati nang drawing: stripe sa itaas, ST LEDs, L7 controller). |
| 3 | I/O configuration | Project tree → **Controller → I/O Configuration**: larawan ng rack, double-click sa slot → listahan ng card (hal. "1746-IB16 16-Input (SINK) 24 VDC"); **Read I/O Config** kapag online. Ang 16-point card ay pinipili sa listahan ayon sa catalog number. **(kaalaman)** | Controller Organizer → **I/O Configuration → 1756 Backplane** → right-click → **New Module…** → catalog list (filter "IB16") → pangalan, slot, Connection, RPI. **(kaalaman)** | Ladder → Organizer / I/O Config, o right-click sa CPU/card sa Wiring. Listahan ng slot 1–7 na may "Configured module" at "Installed"; **Read I/O Config**; mismatch = hindi tatakbo ang RUN. **Bago:** PLC target picker sa itaas; column na **Data file** (I:1, O:2) o **Tags** (Local:1:I.Data, Local:2:O.Data); "1756-style backplane · Local" na heading sa tag-based. |
| 4 | Address ng I/O | `I:1/0`, `O:2/3` (file : slot / bit); word `I:1.0`. **(kaalaman)** | Tag na gawa ng module: `Local:1:I.Data.0`, `Local:2:O.Data.3` (BOOL sa loob ng DINT `Data`); may `Local:1:C` (config). Puwedeng alias tag (`Start_PB` → `Local:1:I.Data.0`). **(kaalaman)** | Address style: File-based, **Tag-based (Local:1:I.Data.0)**, Bit/byte, Basic. Laging file-based ang naka-save. **Bago:** default ng style ay sumusunod sa target (tag-based → `Local:…`). Alias tags ay nasa Controller Tags (ALIAS). |
| 5 | Data | **Data Files**: O0 OUTPUT, I1 INPUT, S2 STATUS, B3 BINARY, T4 TIMER, C5 COUNTER, R6 CONTROL, N7 INTEGER, F8 FLOAT; puwedeng magdagdag (B9, N10…). **(kaalaman)** | Walang data files: **Controller Tags** (global) at **Program Tags** (sa loob ng program); bawat tag ay may data type (BOOL, DINT, REAL, TIMER, COUNTER, CONTROL, UDT). **(kaalaman)** | Data table: I, O, B3, T4, C5, R6, N7 (walang F8 at walang S2 na makikita). Controller Tags (BOOL/INT/TIMER/COUNTER/ALIAS) na naka-map sa file address. **Bago:** sa file-based na Project Tree ay nakalista ang Data Files O0–N7 (+ S2 na label lang); click = buksan sa data table. |
| 6 | Program | **Program Files**: SYS 0 (system), SYS 1 (reserved), **LAD 2 = main**, LAD 3–255 = subroutine na tinatawag ng `JSR` (U:3…), may `SBR`/`RET`. STI/DII para sa timed interrupt. **(kaalaman)** | **Tasks → Programs → Routines**: `MainTask` (continuous) → `MainProgram` → `MainRoutine`; bagong routine = right-click sa program → Add → New Routine (Ladder); tinatawag ng `JSR RoutineName`. Periodic/Event tasks na may sariling programs. **(kaalaman)** | LAD 2 + LAD 3–9 (`project.ladder.files`), JSR U:n, periodic na file. **Bago:** tag-based → "MainRoutine" at pangalan lang ng routine sa file list, "＋ Routine", Organizer na Tasks → MainTask → MainProgram → MainRoutine + PeriodicTask; file-based → "LAD 2 · MAIN", "＋ File", Project Tree na Program Files (SYS 0, SYS 1, LAD 2 – MAIN, LAD n – NAME) at "Timed, every n ms". Pareho ang engine. |
| 7 | Ladder editor | Instruction toolbar na may tabs (User, Bit, Timer/Counter, Input/Output, Compare, Math…); i-drag o i-click ang instruction sa rung; i-type ang address o i-drag mula sa data file; **ASCII rung text** (`XIC I:1/0 OTE O:2/0`) sa double-click ng rung number. Verify File/Project. **(kaalaman)** | Instruction toolbar na may mga button (rung, branch, XIC, XIO, OTE, OTL, OTU) at tabs na Favorites, Safety, Alarms, Bit, Timer/Counter, Input/Output… **(VM)**; "?" na operand → double-click → tag browser o type ng tag; Quick Key (Alt+Insert) at ASCII rung edit; Verify Routine/Controller. **(kaalaman)** | Toolbar na may grupo (Bit, Timer/Counter, Compare, Math, …), ASCII rung text, address na tina-type sa anumang style, Verify. Hindi binago sa batch na ito. |
| 8 | Timer / counter | `TON T4:0`, base 1.0/0.01, `T4:0/DN`, `T4:0.PRE`, `T4:0.ACC`. **(kaalaman)** | Tag na TIMER/COUNTER: `TON Motor_Delay` (Preset sa ms, walang time base), `Motor_Delay.DN`, `.PRE`, `.ACC`, `.EN`, `.TT`. **(kaalaman)** | T4/C5 file na may base; TIMER/COUNTER tags na may `.DN/.ACC/.PRE` (naka-map sa T4/C5). Wala pang ms preset na walang base. |
| 9 | Project tree | Kaliwa: Project → Controller (Properties, Processor Status, I/O Configuration, Channel Configuration) → Program Files → Data Files → Force Files → Custom Data Monitors. **(kaalaman)** | Controller Organizer: Controller (Controller Tags, Fault Handler, Power-Up Handler) → Tasks → Motion Groups → Assets (Add-On Instructions, Data Types) → I/O Configuration. **(kaalaman)** | Organizer (bago: sumusunod sa target, tingnan ang #6). |

## Ano ang ginawa sa PLC Trainer (Part 2)

- `project.target` = `'file'` (default, kasama ang lahat ng lumang project) o `'tag'`. Naka-save sa project.
- Pinipili sa **New project** at sa **I/O Configuration** (`App.setTarget`). Sumusunod ang address style kapag ito ang
  sariling style ng kabilang target (file ↔ tag); Bit/byte at Basic ay hindi ginagalaw.
- Wiring library: file-based = compact controllers + rack modules (rack look); tag-based = 1756-style modules lang.
  Ang mga device na nasa project na ay hindi binubura o pinapalitan.
- Organizer, ladder file list at "＋ File/Routine" sa pangalan ng target. Walang binago sa solver o PLC engine.

## Hindi pa (susunod)

- Ulitin ang bawat hakbang sa VM kapag umaabot na ang input, at palitan ang **(kaalaman)** ng **(VM)** na may screenshot.
- Program Tags (scope ng program) at maraming Programs sa isang task — sa tag-based, iisang MainProgram lang ngayon.
- `JSR RoutineName` sa ladder (ngayon: JSR U:n, makikita ang pangalan sa file list).
- TIMER na ms preset (walang time base) sa tag-based; F8 FLOAT at S2 STATUS sa data table.
- Data type na DINT/REAL at UDT.
