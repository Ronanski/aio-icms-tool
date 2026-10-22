# Design system v3 — "Engineering Neutral"

This is the visual language of PLC Trainer from v2.4. It is implemented as tokens and component rules in the
"Design system v3" block at the end of `css/style.css`, so the DOM and all simulation code stay unchanged.

## Principles
1. **Colour is information.** Surfaces are neutral greys, so colour stands out where it carries meaning. This follows the high-performance HMI practice in ISA-101.
   - **Blue**: interaction and selection (the selected tab, primary buttons, focus, the PROG mode button).
   - **Green**: RUN, energized, true rung elements.
   - **Amber**: forced, warning.
   - **Red**: fault, alarm, errors.
2. **Engineering text first.**
   - One sans family (Inter) for the interface.
   - JetBrains Mono for addresses, tags, values and the scan time.
   - No serif and no italics in the working views. Rung comments are plain, muted sans.
3. **Dense but calm.**
   - One control height (28–30 px; 38 px on touch screens).
   - Small radii (4 / 6 / 8 px).
   - Thin borders, soft shadows used only for floating layers.
4. **The device drawings are not themed.** Breakers, contactors, PLC modules, HMI terminals and lamps keep their real-world colours, as `CONTRIBUTING.md` requires.

## Tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#E9EDF1` | `#0F1419` | app background, canvas surround |
| `--surface` | `#FFFFFF` | `#171D24` | panels, toolbars, dialogs |
| `--surface-2` | `#F3F5F8` | `#1D242C` | status bar, side panel headers, hover |
| `--surface-3` | `#E3E8EE` | `#262E38` | chips, wells |
| `--border` / `--border-strong` | `#D5DCE3` / `#B4BEC9` | `#2A333E` / `#404B58` | dividers / control outlines |
| `--text` / `--muted` | `#17202B` / `#5A6675` | `#E4E9EF` / `#93A0AE` | body / secondary text (≥ 5:1 on surfaces) |
| `--accent` | `#1F64B8` | `#4C8DFF` | interaction, selection |
| `--accent-soft` / `--accent-text` | `#DCE8F7` / `#1A57A3` | `#1A2E4D` / `#8DB6FF` | selected backgrounds / links |
| `--ok` / `--warn` / `--danger` | `#1E8E46` / `#B87800` / `#C8362B` | `#2FB866` / `#E0A12A` / `#F0594C` | PLC state |
| `--lad-bg` / `--lad-wire` / `--lad-on` | `#FFF` / `#3A4350` / `#1B9E48` | `#12171D` / `#AEB8C4` / `#3DDC75` | ladder editor |
| `--brand` | `#D97757` | same | the logo only |
| `--r-sm` / `--r` / `--r-lg` | 4 / 6 / 8 px | same | radii |
| `--ctl-h` | 30 px | same | control height |

## Components
- **View switcher**: on a computer it is flat, with the active view underlined in the accent colour. On a phone it is the bottom navigation bar (unchanged).
- **Top bar**: one row at every width. Between 761 and 1100 px the project subtitle and the tab icons give way.
- **PLC status bar**:
  - PROG (accent) / RUN (green) switch;
  - POWER / RUN / FORCE / FAULT lights;
  - forces;
  - I/O strip;
  - scan time;
  - message.

  It stays on one line, and the connection chip shortens with "…". Below 1100 px the I/O strip is hidden rather than cut. With the Ladder alone on screen, the bar's lights step back, because the Ladder status box is the controller there.
- **Ladder toolbar**:
  - status box (mode, path, forces, edits);
  - tabbed instruction palette;
  - groups for file, online, rung, address and zoom.

  Between 761 and 1280 px it is one row that scrolls sideways, and the group names give way to separators. In side-by-side layouts it wraps compactly, as before.
- **Buttons**: `.btn` (dialogs and pages, 30 px), `.tbtn` (toolbars, 28 px), `.seg` (mode switch), `.icon-btn`. All share the radius and the focus ring (`:focus-visible`, 2 px accent).
- **Dialogs**: 8 px radius, a darker scrim, and a 16 px bold title.

## Before and after
The images are in `docs/design/`, captured by `node scripts/shots.js <dir> <label>` (same browser setup as the tests).

| Screen | Before | After |
|---|---|---|
| Ladder, desktop, light | `before-desktop-light-ladder.png` | `after-desktop-light-ladder.png` |
| Ladder, 1756-style chassis, desktop, dark | `before-desktop-dark-ladder-chassis.png` | `after-desktop-dark-ladder-chassis.png` |
| Ladder, tablet, light / dark | `before-tablet-*-ladder.png` | `after-tablet-*-ladder.png` |
| Ladder, phone | `before-phone-light-ladder.png` | `after-phone-light-ladder.png` |
| Wiring, desktop, dark | `before-desktop-dark-wiring.png` | `after-desktop-dark-wiring.png` |
| Learn, desktop | `before-desktop-light-learn.png` | `after-desktop-light-learn.png` |
| Electrical Diagram (project without a drawing) | `before-desktop-light-schematic.png` | `after-desktop-light-schematic.png` |

Measured on the plcmotor example: how far down the first rung starts, and whether the page scrolls sideways.

| Size | Before (`main` 6714da6) | After |
|---|---|---|
| Desktop 1440×900 | first rung at 220 px | 205 px |
| Tablet 834×1112 | top bar 114 px (2 rows), toolbar 282 px, first rung at **448 px** | top bar 49 px, toolbar 74 px, first rung at **171 px** |
| Phone 390×844 | page 823 px wide (**sideways panning**) | 390 px, no page scroll |

## Next steps (not done yet)
- Instruction palette icons drawn as small ladder glyphs (SVG) instead of text, like the reference tools.
- HMI designer panels and the Wiring property panel brought onto the same field and section styles.
