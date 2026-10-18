# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.0] - 2026-10-18

### Added
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
- Tests for projects, lesson grading, phone touch (drawers, long-press, pinch) and offline install (39 checks).

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

[Unreleased]: https://github.com/Ronanski/aio-icms-tool/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Ronanski/aio-icms-tool/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Ronanski/aio-icms-tool/releases/tag/v1.0.0
