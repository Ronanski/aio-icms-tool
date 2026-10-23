# UI/UX audit — 2026-10-23 (ui-ux-design-master)

This audit follows the owner's **ui-ux-design-master** skill. It took these steps:
1. Understand the app.
2. Measure it with the skill's scripts.
3. Audit 12 layers.
4. Review the features.
5. Prioritize the findings.
6. Show 3 design directions.
7. The owner picks a direction.
8. Write the spec.
9. Build and re-measure.

## 1. The app
- **What it is:** a PLC trainer. Programs (Ladder), drawings (Electrical Diagram), field wiring (Wiring) and operator screens (HMI) run together on a simulated controller.
- **Category:** learning/training together with an engineering tool and an industrial HMI.
- **Users:**
  - students and new technicians, on a phone or a laptop, in Taglish;
  - instructors;
  - engineers who know Studio 5000 / RSLogix.
- **Top tasks:**
  1. When I learn a topic, I want to build a rung and see it run, so that I understand the scan.
  2. When I do an exercise, I want to check my work, so that I know I got it right.
  3. When I wire a panel, I want to press its buttons and see the lamps, so that I can test the circuit.
  4. When I make an operator screen, I want to bind buttons to tags, so that the machine can be run from it.
- **Constraints:**
  - no build step and no runtime dependencies; works offline;
  - device drawings keep their real colours;
  - the simulation behaviour must not change.

## 2. Measurements (skill scripts: Playwright at 390×844, 800×1280, 1280×800 and 1440×900)
| | Before | After |
|---|---|---|
| States reached / controls clicked | 181 / 348 | 182 / 343 |
| JS errors | 0 | 0 |
| Dead controls (no change on click) | 0 real ("Undo" with nothing to undo) | 0 |
| Interface text under 11 px | 507 places (down to 8 px) | 0 (drawings follow their zoom) |
| Ladder controls under 24 px | 51 (F1/F0/× 18 px, tabs 23 px) | 0 |
| White text contrast: RUN / primary in the dark theme | 2.57:1 / 3.20:1 | 5.0:1 / 5.1:1 |
| ON bit "1" / amber text | 2.81:1 / 3.36–3.67:1 | 5.4:1 / 5.9:1 |
| Page wider than the screen | tablet 821 / 876 px in 800 px | none |
| Font sizes on the Ladder at 1440 px | 12 different sizes, down to 8 px | 7 different sizes, from 11 px |

Some findings are not real problems:
- The overlaps that remain are dropdown menus floating over the toolbar, which is expected.
- The HMI contrast findings are the operator-terminal drawing. The script cannot see its dark panel.

## 3. Twelve layers
| # | Layer | Score | Evidence |
|---|---|---|---|
| 1 | Strategy | Good | Learn opens first. Lesson 1 says what to press. |
| 2 | Scope | Good | Ladder, diagram, wiring, HMI, 100 exercises, PLC-software workflow. Missing: generate diagram from Wiring (listed). |
| 3 | Structure | Good | 4 views plus Learn. Menus are 1 level deep. The current view is underlined. |
| 4 | Skeleton | Good (after fixes) | Desktop toolbar on 2 rows. Phone palette on its own row with + Rung first. Tablet bars fixed. |
| 5 | Surface | Good | Neutral greys. Colour only for state (ISA-101). |
| 6 | Typography | Good (after fixes) | Inter + JetBrains Mono. 11 px minimum. 6–7 sizes per screen. |
| 7 | Colour and theme | Good (after fixes) | Fill tokens for white text. Dark theme #0F1419 / #E4E9EF. |
| 8 | Spacing, size, shape | Needs work | 61–82 % of spacing is off the 4 px grid. 5–8 radii. |
| 9 | Components | Good | One icon set. Every state (hover, focus, disabled, on). One primary button per dialog. |
| 10 | Microcopy | Good | Verbs on buttons. Units on timers. Errors say what to do. |
| 11 | Feedback and states | Good | Toasts, undo, and a confirm for destructive actions. Empty states teach. |
| 12 | Accessibility and trust | Good (after fixes) | AA contrast and targets. Focus trap. Works offline. Keyboard paths. |

## 4. Feature review
- **MUST (missing):** none for the top tasks.
- **IMPROVE:**
  - spacing on the 4 / 8 grid (M);
  - radius scale (S);
  - font weights 400 / 600 / 700 (S).
- **NICE:**
  - generate the Electrical Diagram from the Wiring (L, owner listed it for later);
  - SVG ladder glyphs in the palette (M).
- **REMOVE:** none. No duplicates or dead controls were found.
- **KEEP:**
  - task strip;
  - Selected instruction panel;
  - Who Active / Download flow;
  - Data Files with forces;
  - Learn with Check my work.

## 5. Do first (done in PR #72)
1. Text under 11 px (507 places).
2. Controls under 24 px (WCAG 2.5.8).
3. White-text contrast on RUN and on primary buttons in the dark theme.
4. Contrast of the ON bit and of amber text.
5. Phone dialog wider than the screen.
6. Tablet page wider than the screen (Tagalog).
7. Top bar on 2 rows on a tablet.
8. Palette running under the file list.
9. Bit 0 hidden in a narrow data-file grid.

## 6. Design directions
The three directions were shown on the real app (Ladder desktop, HMI and phone):
- **A · Engineering Neutral** (recommended);
- **B · Control-room Dark** (compact);
- **C · Industrial Light** (ISA-101 / WinCC).

The owner picked **A**. The spec is in `docs/DESIGN_SYSTEM.md` (tokens and the hard rules).
