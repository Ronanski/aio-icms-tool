# Releasing

One version of the app ships four ways. All four are built from the same files by `scripts/copy-web.sh`:

| Channel | File | Built by |
|---|---|---|
| Web / PWA | https://ronanski.github.io/aio-icms-tool/ | `.github/workflows/pages.yml`, on every push to `main` |
| Windows | `PLC-Trainer-Setup-X.Y.Z.exe` (installer), `PLC-Trainer-X.Y.Z-portable.exe` | `release.yml` → Electron, in `desktop/` |
| Android | `PLC-Trainer-X.Y.Z-android.apk` | `release.yml` → Capacitor, in `mobile/` |
| Offline copy | `PLC-Trainer-X.Y.Z-web.zip` (open `index.html`) | `release.yml` |

## Make a release
1. Follow the checklist in `CONTRIBUTING.md`: tests pass, CHANGELOG updated, version bumped, merged into `main`.
2. On GitHub, open **Actions → Release → Run workflow**, pick `main` and keep **Publish** ticked.
3. The workflow builds all files. It then creates the tag `vX.Y.Z` and a GitHub Release with the notes from `CHANGELOG.md`, and attaches the files.

Every pull request also runs the build jobs without publishing, so a broken installer shows up before merging. The files of a PR build can be downloaded from the run's **Artifacts**.

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
