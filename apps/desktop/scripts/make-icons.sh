#!/usr/bin/env bash
# Draws the app icon and installer background from the logo, and builds build/icon.icns.
set -euo pipefail
cd "$(dirname "$0")/.."
swiftc -O scripts/make-art.swift -o /tmp/bluebird-make-art
/tmp/bluebird-make-art ../../plain.png build
rm -rf build/icon.iconset && mkdir build/icon.iconset
for s in 16 32 128 256 512; do
  sips -z $s $s build/icon-1024.png --out build/icon.iconset/icon_${s}x${s}.png >/dev/null
  sips -z $((s * 2)) $((s * 2)) build/icon-1024.png --out build/icon.iconset/icon_${s}x${s}@2x.png >/dev/null
done
iconutil -c icns build/icon.iconset -o build/icon.icns
rm -rf build/icon.iconset
# The setup window shows the same icon.
sips -z 160 160 build/icon-1024.png --out src/logo.png >/dev/null
echo "icons ready"
