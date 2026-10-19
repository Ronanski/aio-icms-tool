# Releasing

One version of the app ships four ways. All four are built from the same files by `scripts/copy-web.sh`:

| Where | File | Built by |
|---|---|---|
| Hosted app (web, and what the Windows/Android apps open) | https://ronanski.github.io/aio-icms-tool/ (Stable) and `/beta/` (Beta) | `.github/workflows/pages.yml` |
| Windows | `PLC-Trainer-X.Y.Z-portable.exe` (portable only, no installer) | `release.yml` → Electron, in `desktop/` |
| Android | `PLC-Trainer-X.Y.Z-android.apk` | `release.yml` → Capacitor, in `mobile/` |
| Offline copy | `PLC-Trainer-X.Y.Z-web.zip` (open `index.html`) | `release.yml` |

## How updates reach the apps (in-app, no downloads)
- **Stable** = the latest official release. `pages.yml` puts the code of the latest release tag at the site root.
- **Beta** = every change merged into `main`. `pages.yml` runs on every push to `main` and puts `main` under `/beta/`.
- Each copy gets a `version.json` (`{version, build, notes}`) and a build id stamped into `js/app.js` and `sw.js` by `scripts/copy-web.sh`.
- The Windows and Android apps are thin shells. Their built-in copy moves to the hosted app (bringing the device's projects along the first few starts: `#import=`), and the hosted app is cached by its service worker, so it works offline.
- The app checks `version.json` of its channel when online (at most every 10 minutes, every hour while open). When the build differs it shows **Restart to update**, and a restart loads the new files. Nothing is downloaded and no browser opens.
- A new `.exe` or `.apk` is needed only when the shell itself changes (`desktop/main.js`, `mobile/`), not for app changes.

## Make a stable release
1. Follow the checklist in `CONTRIBUTING.md`: tests pass, CHANGELOG updated, version bumped, merged into `main`.
2. On GitHub, open **Actions → Release → Run workflow**, pick `main` and keep **Publish** ticked.
3. The workflow builds all files, creates the tag `vX.Y.Z` and a GitHub Release with the notes from `CHANGELOG.md`, and starts `pages.yml` so the Stable copy of the hosted app moves to this release.

Every pull request also runs the build jobs without publishing, so a broken build shows up before merging. The files of a PR build can be downloaded from the run's **Artifacts**.

## Beta
Merging into `main` is enough: the Beta copy updates within minutes. A pre-release (version with a suffix, e.g. `1.5.0-beta.1`, run **Release** on any branch) is only a downloadable snapshot.

## Android signing key (do this once)
Without a key, the workflow builds a **debug-signed** APK. It installs fine, but each release is signed with a different key. Users then have to uninstall the old version before installing a new one, which also deletes their saved projects. To sign properly:

```bash
keytool -genkeypair -v -keystore plc-trainer.keystore -alias plctrainer -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 plc-trainer.keystore > keystore.b64      # macOS: base64 -i plc-trainer.keystore
```
Add these under **Settings → Secrets and variables → Actions**:
`ANDROID_KEYSTORE_BASE64` (contents of `keystore.b64`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`plctrainer`), `ANDROID_KEY_PASSWORD`.

Keep the keystore file and passwords safe. **Losing them means existing users can never update the app.**

## What users see when installing
- **Windows**: the `.exe` is not code-signed, so SmartScreen shows "Windows protected your PC". Click **More info → Run anyway**. Removing this warning needs a code-signing certificate, which costs money.
- **Android**: the browser or file manager asks for permission to **install unknown apps**. Allow it for that app, then tap Install. For the Play Store, build an `.aab` and sign it with the same key.
- **iPhone / iPad**: there is no installer file. Use the web link → Share → **Add to Home Screen**.

## Build locally (optional)
```bash
cd desktop && npm install && npm start            # run the Windows/desktop app
cd desktop && npm run dist:win                    # build the .exe (on Windows)
cd mobile && npm install && npm run android       # create mobile/android, then open it in Android Studio
```
