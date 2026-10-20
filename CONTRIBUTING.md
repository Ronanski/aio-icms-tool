# Rules and conventions

These rules apply to every contributor, human or AI agent.

## 1. Branches
| Branch | Purpose |
|---|---|
| `main` | Released, stable code. Every commit on `main` is shippable. Never commit directly. |
| `feature/<short-name>` | New features, e.g. `feature/pwa-install` |
| `fix/<short-name>` | Bug fixes |
| `docs/<short-name>` | Documentation only |
| `release/vX.Y.Z` | Optional release stabilization |

- Work on a branch, then open a pull request into `main`.
- Merge only when `npm test` passes and `CHANGELOG.md` is updated.

## 2. Commits
Use [Conventional Commits](https://www.conventionalcommits.org/):
```
feat: add CTD instruction to toolbar
fix: description field follows typed address
docs: update handoff savepoint
test: cover tank fill cycle
refactor: split circuit solver from component library
chore: bump version to 1.1.0
```
Keep each commit to one logical change. Write the subject in the imperative mood, at most 72 characters.

## 3. Versioning and releases
The project follows [SemVer](https://semver.org/): `MAJOR.MINOR.PATCH`.
- **MAJOR**: breaking change, e.g. a project file format that old versions can't open
- **MINOR**: new feature, backwards compatible
- **PATCH**: bug fix

Release checklist:
1. Run `npm test`. All checks must pass.
2. Move the `[Unreleased]` notes in `CHANGELOG.md` under the new version and date.
3. Bump the version in `package.json` (and `desktop/`, `mobile/`), `VERSION` in `js/app.js`, and `VER` in `sw.js`. Leave `BUILD = 'dev'` in `js/app.js`: the Pages and release builds stamp it. A beta snapshot uses a suffix: `1.5.0-beta.1` (see `RELEASING.md`).
4. Update `PROGRESS.md` and `HANDOFF.md`.
5. Commit with `chore(release): vX.Y.Z`.
6. Merge into `main`.
7. Run **Actions → Release → Run workflow** on `main`. It creates the tag `vX.Y.Z` and the GitHub Release with the portable `.exe`, `.apk` and web zip attached, and moves the hosted Stable app to it. See `RELEASING.md`.

## 4. Code rules
- **No build step and no runtime dependencies.** Plain HTML, CSS and JS. `index.html` must work when opened directly from disk.
- `desktop/` and `mobile/` are thin wrappers that only package the web app. App features belong in the web code, never in a wrapper.
- Each module is an IIFE that exposes one global (`UI`, `I18N`, `Store`, `PLCcore`, `Ladder`, `Circuit`, `Workspace`, `Schematic`, `HMI`, `Updater`, `Examples`, `FreeDraw`, `App`). Script order in `index.html` matters.
- Match the surrounding style: 2-space indent, single quotes, semicolons, small helpers, short comments only where the logic isn't obvious.
- Colors come from the CSS tokens in `:root`. Every new color needs a dark-mode value.
- The device drawings in `circuit.js` keep their real-world colors, independent of the theme.
- **Project file compatibility**: never rename saved fields (`ladder.rungs[].text`, `circuit.comps[].type/props/state`, `wires[].a/b`). Add new fields with defaults through `Circuit.normalize`. Raise `FORMAT` in `js/app.js` when saved projects gain content that older versions cannot read. Parts, diagram symbols and wires a version does not know are kept by `App.buildProject` (`project.keep`) and written back by `App.serialize`: keep that path working, never drop data you do not understand. Code that picks or accepts a device tag must also skip `circuit.reserved` (the tags of that kept content).
- Allen-Bradley behaviour is the reference: when unsure how an instruction behaves, follow the SLC 500 instruction set manual.

## 5. Testing
- Run `npm test` before every pull request (see the README for setup).
- A new feature or bug fix gets a check in `tests/e2e.test.js`.
- For UI changes, also check by hand in both light and dark themes.

## 6. Trademarks and naming
Don't use "Allen-Bradley", "Rockwell", "RSLogix", "MicroLogix", "PanelView" or "Claude" in the product name, logo or marketing. They may appear only as a description ("AB-style").
