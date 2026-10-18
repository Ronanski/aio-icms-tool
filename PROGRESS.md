# Progress

**Current version:** 1.0.0 (released 2026-10-18)
**Status:** Stable web app. Every core feature works and is covered by `npm test` (26/26 passing).

## Done (v1.0.0)
- [x] PLC engine: addressing, scan, PROG/RUN, 25 instructions, forcing
- [x] Ladder editor: toolbar, branches, ASCII editing, Verify, undo/redo, data table
- [x] Wiring simulator: 25 components, net solver, breaker trips, coil ratings, overload, multimeter
- [x] Panel & Plant view and split view
- [x] HMI designer and runtime
- [x] 12 lessons and 6 examples
- [x] New project / rename / export / import / autosave
- [x] Light and dark themes
- [x] End-to-end test suite
- [x] Docs: README, CHANGELOG, CONTRIBUTING (rules), PROGRESS, HANDOFF

## Next: v1.1.0 (planned)
- [ ] **PWA**: manifest, service worker, app icon. Installable on Android and Windows, works offline.
- [ ] Host on GitHub Pages
- [ ] Mobile and tablet layout: larger touch targets, collapsible side panels
- [ ] Multiple saved projects in the browser (project list)
- [ ] Lesson auto-check: verify the student's rung or wiring and show pass/fail

## Backlog (v1.2+)
- [ ] Android APK via Capacitor; Windows installer via Tauri or Electron
- [ ] More instructions: OSR/OSF, JSR/SBR/RET, MCR, SQO, COP/FLL, BTD, SCP, analog I/O (I:1.0 words)
- [ ] More devices: VFD, star-delta starter, reversing contactor pair, 3-wire analog level transmitter
- [ ] Rung drag-and-drop editing; wire dragging and re-routing
- [ ] Tagalog / English language toggle
- [ ] Migrate to TypeScript + Vite and add unit tests for `plc.js` and `circuit.js`
- [ ] Continuous integration running `npm test` on every pull request
- [ ] Choose a license: proprietary for selling, or MIT

## Known limitations
- The layout targets desktop and tablet. Phones work but feel cramped.
- One PLC per project. Loads in series (e.g. two lamps in series) are not modeled.
- Wires are routed automatically from waypoints; you can't drag an existing wire.
- Inside the claude.ai artifact preview, File → Export is blocked. Export works in a normal browser tab.
- Autosave keeps one project per browser (`localStorage`).
