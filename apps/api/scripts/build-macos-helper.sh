#!/bin/sh
# Builds the macOS accessibility helper as a signed app bundle named "Bluebird" (so it shows up by that
# name and icon under System Settings, Privacy & Security, Accessibility), universal for Apple Silicon and
# Intel. Run on a Mac with the Xcode command line tools after editing src/agent/desktop/native/macos-ax.swift,
# then commit the result in src/agent/desktop/native/bin/.
set -eu
cd "$(dirname "$0")/.."
ROOT=$(cd ../.. && pwd)
SRC=src/agent/desktop/native/macos-ax.swift
OUT=src/agent/desktop/native/bin
APP="$OUT/Bluebird.app"
TMP=$(mktemp -d)
rm -rf "$APP" "$OUT/macos-ax" "$OUT/macos-ax.source"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O -swift-version 5 -target arm64-apple-macosx12.0 "$SRC" -o "$TMP/arm64"
swiftc -O -swift-version 5 -target x86_64-apple-macosx12.0 "$SRC" -o "$TMP/x86_64"
lipo -create "$TMP/arm64" "$TMP/x86_64" -output "$APP/Contents/MacOS/Bluebird"

# The icon: the Bluebird logo.
ICONSET="$TMP/AppIcon.iconset"
mkdir -p "$ICONSET"
LOGO="$ROOT/plain.png"
for size in 16 32 128 256 512; do
  sips -z $size $size "$LOGO" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z $double $double "$LOGO" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>app.bluebird.helper</string>
  <key>CFBundleName</key><string>Bluebird</string>
  <key>CFBundleDisplayName</key><string>Bluebird</string>
  <key>CFBundleExecutable</key><string>Bluebird</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
  <key>NSAccessibilityUsageDescription</key><string>Bluebird uses accessibility to read and use the apps you ask it to work with.</string>
  <key>NSScreenCaptureUsageDescription</key><string>Bluebird takes screenshots of apps when you ask it to look at them.</string>
</dict>
</plist>
PLIST

codesign --force --deep --sign - "$APP"
shasum -a 1 "$SRC" | cut -c1-12 > "$OUT/macos-ax.source"
rm -rf "$TMP"
echo "Built $APP ($(cut -c1-12 < "$OUT/macos-ax.source"))"
