# Progress

**Current version:** 1.1.0 (released 2026-10-18)
**Status:** Stable web app that installs on phones, tablets and PCs. Covered by `npm test` (39/39 passing).

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

## Done (v1.1.0)
- [x] PWA: manifest, service worker, icons, Install app button, works offline
- [x] Mobile and tablet layout: bottom tabs, drawers, ladder zoom, pinch zoom, long-press menus
- [x] Multiple saved projects (File → Open project)
- [x] Lesson auto-check for lessons 1–6
- [x] CI and GitHub Pages workflows

## Next: v1.2.0 (planned)
- [ ] Go live on GitHub Pages (needs `main` + Pages enabled; see HANDOFF open decisions)
- [ ] Final product name and logo, replacing the placeholder icon
- [ ] Auto-check for the circuit lessons (8–12): verify wiring, not only the ladder
- [ ] Android APK (Capacitor) and Windows installer (Tauri)

## Backlog (v1.2+)
- [ ] More instructions: OSR/OSF, JSR/SBR/RET, MCR, SQO, COP/FLL, BTD, SCP, analog I/O (I:1.0 words)
- [ ] More devices: VFD, star-delta starter, reversing contactor pair, 3-wire analog level transmitter
- [ ] Rung drag-and-drop editing; wire dragging and re-routing
- [ ] Tagalog / English language toggle
- [ ] Migrate to TypeScript + Vite and add unit tests for `plc.js` and `circuit.js`
- [ ] Choose a license: proprietary for selling, or MIT

## Known limitations
- On phones, wiring large circuits is possible but slow; a tablet or PC is more comfortable.
- Offline install needs the app served over https (GitHub Pages). Opening `index.html` from disk works, but can't be installed.
- One PLC per project. Loads in series (e.g. two lamps in series) are not modeled.
- Wires are routed automatically from waypoints; you can't drag an existing wire.
- Inside the claude.ai artifact preview, File → Export is blocked. Export works in a normal browser tab.
- Projects are stored per browser (`localStorage`). Use Export to move them to another device.
