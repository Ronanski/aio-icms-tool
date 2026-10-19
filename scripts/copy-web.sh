#!/usr/bin/env bash
# Copies the web app (the files a browser needs) into a target folder.
# Used by GitHub Pages, the Windows build and the Android build so all three ship the same app.
#   scripts/copy-web.sh <target-dir> [build-id] [notes-file]
# With a build id, the copy is stamped with it (App.BUILD and the service-worker cache name) and gets a
# version.json that the in-app updater reads: {version, build, notes}.
set -euo pipefail
dest="${1:?usage: scripts/copy-web.sh <target-dir> [build-id] [notes-file]}"
build="${2:-${BUILD_ID:-}}"   # or from the BUILD_ID environment variable (release builds)
notes="${3:-}"
# SRC: copy the app from another checkout (Pages copies the latest release this way); default: this repository
root="${SRC:-$(cd "$(dirname "$0")/.." && pwd)}"
mkdir -p "$dest"
cp -r "$root/index.html" "$root/manifest.webmanifest" "$root/sw.js" "$root/css" "$root/js" "$root/icons" "$dest/"
if [ -n "$build" ]; then
  case "$build" in *[!A-Za-z0-9._+-]*) echo "bad build id: $build" >&2; exit 1;; esac
  sed -i "s/^  const BUILD = 'dev';/  const BUILD = '$build';/" "$dest/js/app.js"
  # versions before the in-app updater (1.4.0 and older) have no build id: they are copied as they are
  grep -q "const BUILD = '$build';" "$dest/js/app.js" || echo "note: no build id in this version of js/app.js" >&2
  # a new cache name per build: the service worker installs the new files and drops the old ones of its channel
  sed -i "s/^const VER = '\(.*\)';/const VER = '\1+$build';/" "$dest/sw.js"
  version="$(sed -n "s/^  const VERSION = '\(.*\)';/\1/p" "$root/js/app.js")"
  node -e '
    const fs = require("fs"), [out, version, build, notesFile] = process.argv.slice(1);
    const notes = notesFile && fs.existsSync(notesFile) ? fs.readFileSync(notesFile, "utf8") : "";
    fs.writeFileSync(out, JSON.stringify({ version, build, notes }, null, 1) + "\n");
  ' "$dest/version.json" "$version" "$build" "$notes"
fi
