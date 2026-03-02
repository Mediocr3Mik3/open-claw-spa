#!/bin/bash
# Generate app icons for all platforms from build/icon.svg
# Requires: rsvg-convert (librsvg) or ImageMagick
#
# Install on macOS:   brew install librsvg
# Install on Ubuntu:  sudo apt install librsvg2-bin
# Install on Windows: choco install imagemagick

set -e
cd "$(dirname "$0")/.."

SVG="build/icon.svg"
OUT="build"

echo "Generating icons from $SVG..."

if command -v rsvg-convert &> /dev/null; then
  # Generate PNG at 512x512 (electron-builder auto-scales from this)
  rsvg-convert -w 512 -h 512 "$SVG" > "$OUT/icon.png"
  echo "  ✓ icon.png (512x512)"

  # macOS needs 1024x1024 for Retina
  rsvg-convert -w 1024 -h 1024 "$SVG" > "$OUT/icon@2x.png"
  echo "  ✓ icon@2x.png (1024x1024)"

  # Generate .icns for macOS (if iconutil is available)
  if command -v iconutil &> /dev/null; then
    ICONSET="$OUT/icon.iconset"
    mkdir -p "$ICONSET"
    for SIZE in 16 32 64 128 256 512; do
      rsvg-convert -w $SIZE -h $SIZE "$SVG" > "$ICONSET/icon_${SIZE}x${SIZE}.png"
      DOUBLE=$((SIZE * 2))
      rsvg-convert -w $DOUBLE -h $DOUBLE "$SVG" > "$ICONSET/icon_${SIZE}x${SIZE}@2x.png"
    done
    iconutil -c icns "$ICONSET" -o "$OUT/icon.icns"
    rm -rf "$ICONSET"
    echo "  ✓ icon.icns (macOS)"
  fi

elif command -v magick &> /dev/null || command -v convert &> /dev/null; then
  CONVERT=$(command -v magick || command -v convert)

  $CONVERT "$SVG" -resize 512x512 "$OUT/icon.png"
  echo "  ✓ icon.png (512x512)"

  # Generate .ico for Windows (multi-size)
  $CONVERT "$SVG" -resize 256x256 \
    \( -clone 0 -resize 16x16 \) \
    \( -clone 0 -resize 32x32 \) \
    \( -clone 0 -resize 48x48 \) \
    \( -clone 0 -resize 64x64 \) \
    \( -clone 0 -resize 128x128 \) \
    \( -clone 0 -resize 256x256 \) \
    -delete 0 "$OUT/icon.ico"
  echo "  ✓ icon.ico (Windows)"
else
  echo "ERROR: Need rsvg-convert (librsvg) or ImageMagick (magick/convert)."
  echo "  macOS:   brew install librsvg"
  echo "  Ubuntu:  sudo apt install librsvg2-bin"
  exit 1
fi

echo ""
echo "Done! Icons generated in $OUT/"
echo ""
echo "Note: electron-builder will auto-generate .ico and .icns from icon.png"
echo "if the platform-specific files are missing. A 512x512 icon.png is sufficient."
