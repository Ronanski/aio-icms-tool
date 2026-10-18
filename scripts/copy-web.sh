#!/usr/bin/env bash
# Copies the web app (the files a browser needs) into a target folder.
# Used by GitHub Pages, the Windows build and the Android build so all three ship the same app.
set -euo pipefail
dest="${1:?usage: scripts/copy-web.sh <target-dir>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$dest"
cp -r "$root/index.html" "$root/manifest.webmanifest" "$root/sw.js" "$root/css" "$root/js" "$root/icons" "$dest/"
