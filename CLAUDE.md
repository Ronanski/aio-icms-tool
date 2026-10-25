# Notes for AI agents

- Start with `HANDOFF.md` (savepoint and architecture), then `CONTRIBUTING.md` (rules) and `PROGRESS.md` (roadmap).
- MT PLC Studio (`mtps/`): read the skill `.claude/skills/allen-bradley/` before changing it (the owner's golden reference is Studio 5000 / RSLinx / Logix Emulate). Its tests: `tests/mtps.test.js`, `tests/mtps-ref.test.js`, `tests/mtps-ui.test.js` and `npm run audit`, run like e2e below.
- Plain HTML/CSS/JS. Keep it free of a build step and of runtime dependencies.
- Run the tests with `npm test`. In the Claude Code cloud container, use:
  `NODE_PATH=/opt/node-tools/node_modules CHROMIUM_PATH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1) node tests/e2e.test.js`
- Use Conventional Commits, and update `CHANGELOG.md` under `[Unreleased]` with every user-visible change.
- At the end of every session, update the savepoint in `HANDOFF.md` and the checkboxes in `PROGRESS.md`.
