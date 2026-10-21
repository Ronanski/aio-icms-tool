# Seal-in circuit: Simurelay vs PLC Trainer (step by step)

Ginawa noong 2026-10-21. Iisang circuit sa dalawang app, gaya ng gagawin ng user:
**+** sa itaas → **S2** push button N.C. (11-12) → **S1** push button N.O. (13-14) na may **K1** N.O. (13-14) na naka-parallel (seal-in) → **K1** coil (A1-A2) → **−** sa ibaba. Pagkatapos: Play, pindot S1, saka S2.

Simurelay 3.0.9 (Windows desktop app) ang ginamit, sa computer use; walang na-save o binago sa settings nito. Sa atin: `index.html` → Electrical Diagram → Free draw, pinatakbo sa Playwright na totoong mouse ang gamit (scratch script, at ngayon ay nasa `tests/e2e.test.js`, seksyong "Like Simurelay: the seal-in built with the mouse").

## Paghahambing

| # | Hakbang | Simurelay | PLC Trainer (dati) | PLC Trainer (ngayon) |
|---|---|---|---|---|
| 1 | Simula | Bukas agad ang drawing. | Electrical Diagram → **Free draw** (isang click; naaalala sa susunod). | Pareho. |
| 2 | Pumili ng symbol | Library sa kaliwa, may dropdown ng grupo (Sources, Switches, Coils, Auxiliaries…); pangalan sa hover. | Library na may search at grupo; pangalan sa ilalim ng tile. | Pareho. |
| 3 | Ilagay ang symbol | **Click** sa tile → lalabas sa **gitna ng view**, nakapatong sa nauna, naka-select. Ang drag mula sa library ay walang epekto. Kaya bawat symbol: click + drag papunta sa puwesto. | Click → sa **unang bakanteng puwesto** (pababa sa isang column), naka-select. Puwede ring i-drag mula sa library. | Pareho; halos naka-column na ang circuit kaya 2 drag lang ang kailangan (seal-in contact at 0 V). |
| 4 | **+** point | Nakaturo **pataas** ang terminal → **Rotate 2×** para bumaba sa circuit. | Nakaturo na pababa ang + (pataas ang −). | Pareho. |
| 5 | Supply ng + at − | **Gumagana na agad** ang + at −. | **Error:** "no supply with this conductor in the Wiring" — kailangang pumunta sa Wiring at maglagay ng supply. | **Inayos:** kusang naglalagay ng 24 V battery sa Wiring para sa + / −; 1-phase supply para sa L1 / N / PE; 3-phase kapag may L2 o L3. Nawawala ulit kapag binura ang huling point. Ang coil na naunang nailagay ay nakukuha rin ang tamang boltahe (24 V DC). |
| 6 | Tag | Kusang `-S1`, `-S2`, `-K1`; ang N.O. contact ay kusang `-K1` (ang coil na nasa drawing). | Kusang `S1`, `S2`, `KA1`; ang contact ay kusang `KA1`. (IEC prefix: KA = relay; K sa Simurelay.) | Pareho. |
| 7 | Ilipat ang symbol | Drag; snap sa ¼ ng grid; may mahahabang guide line sa mga terminal habang nagda-drag. | Drag; snap sa grid; guide line kapag naka-linya sa ibang terminal; dumidikit sa linya ng terminal na naka-wire. | Pareho. |
| 8 | Simulan ang wire | **Click** sa terminal (nagiging asul). Ang drag mula sa terminal ay walang ginagawa. | Click **o** drag mula sa terminal. | Pareho. |
| 9 | Habang nagwi-wire | Walang linya na sumusunod sa mouse. | May preview ng ruta. | Pareho. |
| 10 | Tapusin ang wire | Click sa kabilang terminal → tuwid kapag naka-linya; kung hindi: labas ng isang grid step, tawid, pasok. | Pareho ang hugis (simple connector). | Pareho. |
| 11 | Click sa bakanteng lugar habang nagwi-wire | **Kanselado** ang wire. | Nagiging **kanto** ng wire; **Esc** ang pang-cancel. | Pareho (sinadya: dagdag na kontrol). |
| 12 | Branch (seal-in) | Wire mula K1 13 papunta sa S1 13; dumadaan ito sa linya at sa terminal 12 ng sariling circuit, may **dot** kung saan naghihiwalay. | Kapag tatama ang simpleng ruta sa terminal 12 (kahit parehong circuit), **umiikot** ito (paliko-likong ruta). | **Inayos:** dumadaan na sa terminal ng sariling circuit (simpleng bracket) at may dot doon; sa terminal ng **ibang** circuit, umiikot pa rin. Puwede ring tapusin ang wire sa gitna ng ibang wire (junction). |
| 13 | Konektadong terminal | Nawawala ang square. | Nawawala ang bilog. | Pareho. |
| 14 | Maikling wire | Ang hawakan ng napakaikling wire ay tumatakip sa terminal — hindi ko ma-click ang S1 14 hangga't hindi inilalayo ang coil. | Laging nasa ibabaw ang terminal. | Pareho. |
| 15 | Ilipat ang bahagi ng wire | Piliin ang wire (start / gitna / dulo, may orange na hawakan sa gitna), i-drag ang gitna. | I-drag ang kahit anong bahagi. | Pareho. |
| 16 | Ilipat ang symbol na may wire | Sumusunod agad ang wires. | Pareho. | Pareho. |
| 17 | Palitan ang tag | Double-click o right-click → bar sa itaas: **TAG** (prefix `<` `>`), **NUM1** (numero `<` `>`, nilalaktawan ang gamit na). Walang pagta-type. Para magpalit ng S1 ↔ S2: 3 edit. | Double-click → i-type ang tag (simbolong iyon lang); **Rename device (F2)** → lahat ng symbol ng device at ang Wiring. | Pareho. |
| 18 | Undo | **Naka-disable** ang Undo buong session (walang epekto ang Ctrl+Z). | Undo / Redo, Ctrl+Z / Ctrl+Y. | Pareho. |
| 19 | Delete | Delete button sa toolbar (walang epekto ang Del key sa test ko). | Del key o Delete button. | Pareho. |
| 20 | Play | Play → nawawala ang toolbar at library, Stop sa kaliwa-itaas; + berde, − asul; dilaw ang coil. | Play / Stop; + pula, 0 V asul; dilaw ang coil. | Pareho. |
| 21 | Pindot | Hold = pindot (momentary); bitaw = balik. S1 → K1 humahawak (seal-in); S2 → bumibitaw. | Pareho. | Pareho. |
| 22 | Tag sa tabi ng push button | Nasa kaliwa ng push head. | **Nakapatong** ang `-S1` sa push head (dashed line). | **Inayos:** nasa kaliwa na ng head. |

## Bilang ng hakbang (para sa circuit na ito)

- **Simurelay:** 6 click sa library + 6 drag (lahat ay lumalabas sa gitna) + 2 Rotate (+ point) + 12 click sa terminals + Play + 2 pindot ≈ **29**. Dagdag na 3 edit kung gusto ang S2 sa N.C.
- **PLC Trainer (ngayon):** 6 click sa library + 2 drag + 12 click sa terminals + Play + 2 pindot = **23** (+1 click sa Free draw kung IEC pa ang huling gamit). Dagdag: F2 → `K1` kung gusto ang K1 imbes na KA1, at 3 rename kung gusto ang S2 sa N.C.
- **PLC Trainer (dati):** hindi ito gumagana nang hindi muna pumupunta sa Wiring para maglagay ng supply.

## Screenshots

Nasa scratchpad ng session (hindi kasama sa repo): `simurelay/` (bawat hakbang sa Simurelay) at `ours/` (bawat hakbang sa atin).
