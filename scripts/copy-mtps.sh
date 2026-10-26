#!/usr/bin/env bash
# Copies MT PLC Studio (the mtps/ folder) into a target folder, for GitHub Pages, the Windows exe and the Android APK.
#   scripts/copy-mtps.sh <target-dir> [build-id] [notes-file]
# With a build id, the copy is stamped with it (BUILD in js/app.js, the service-worker cache name) and gets the
# version.json that the in-app updater reads: {version, build, notes}.
set -euo pipefail
dest="${1:?usage: scripts/copy-mtps.sh <target-dir> [build-id] [notes-file]}"
build="${2:-${BUILD_ID:-}}"
notes="${3:-}"
root="${SRC:-$(cd "$(dirname "$0")/.." && pwd)}"
mkdir -p "$dest"
cp -r "$root/mtps/index.html" "$root/mtps/manifest.webmanifest" "$root/mtps/sw.js" "$root/mtps/css" "$root/mtps/js" "$root/mtps/icons" "$dest/"
# the theme fonts (older tags, such as an earlier Stable that Pages still serves, have none)
if [ -d "$root/mtps/fonts" ]; then cp -r "$root/mtps/fonts" "$dest/"; fi
if [ -n "$build" ]; then
  case "$build" in *[!A-Za-z0-9._+-]*) echo "bad build id: $build" >&2; exit 1;; esac
  sed -i "s/^  const BUILD = 'dev';/  const BUILD = '$build';/" "$dest/js/app.js"
  grep -q "const BUILD = '$build';" "$dest/js/app.js" || { echo "could not stamp the build id" >&2; exit 1; }
  sed -i "s/^const VER = '\(.*\)';/const VER = '\1+$build';/" "$dest/sw.js"
  version="$(sed -n "s/^  const VERSION = '\(.*\)';/\1/p" "$root/mtps/js/app.js")"
  node -e '
    const fs = require("fs"), [out, version, build, notesFile] = process.argv.slice(1);
    const notes = notesFile && fs.existsSync(notesFile) ? fs.readFileSync(notesFile, "utf8") : "";
    fs.writeFileSync(out, JSON.stringify({ version, build, notes }, null, 1) + "\n");
  ' "$dest/version.json" "$version" "$build" "$notes"
fi
