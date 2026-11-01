#!/usr/bin/env bash
# Builds a self-contained Linux AppImage around the Next.js standalone server.
#
# Layout (AppDir):
#   AppRun                      — sets up db/auth-secret under $HOME, execs node
#   nexnotes.desktop            — desktop entry
#   nexnotes.png                — 512px icon (docs/logo.png)
#   usr/bin/node                — Node runtime bundled from the build machine
#   usr/app/                    — .next/standalone contents
#
# Built with appimagetool in FUSE-less mode (--appimage-extract), which is how
# CI runners without FUSE build AppImages.
#
# Usage: bash scripts/build-appimage.sh <version> <standalone-dir> <out-dir>
set -euo pipefail

VERSION="${1:?usage: build-appimage.sh <version> <standalone-dir> <out-dir>}"
STANDALONE="${2:?missing standalone dir}"
OUT="${3:?missing out dir}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

APPDIR="$(mktemp -d)/nexnotes.AppDir"
mkdir -p "$APPDIR/usr/app" "$APPDIR/usr/bin"
cp -r "$STANDALONE"/. "$APPDIR/usr/app/"
cp "$(readlink -f "$(command -v node)")" "$APPDIR/usr/bin/node"

cat > "$APPDIR/AppRun" <<'EOF'
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "$0")")"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}/nexnotes"
mkdir -p "$DATA"
# First run: seed the schema-initialized SQLite file shipped inside the image
# (prisma generate does not create tables — the bundled db does).
if [ -z "${DATABASE_URL:-}" ] && [ ! -f "$DATA/nexnotes.db" ]; then
  cp "$HERE/usr/app/db/nexnotes.db" "$DATA/nexnotes.db" 2>/dev/null || true
fi
export DATABASE_URL="${DATABASE_URL:-file:$DATA/nexnotes.db}"
if [ -z "${AUTH_SECRET:-}" ]; then
  SEC="$DATA/.auth-secret"
  [ -f "$SEC" ] || { umask 077; head -c 32 /dev/urandom | sha256sum | cut -d' ' -f1 > "$SEC"; }
  export AUTH_SECRET="$(cat "$SEC")"
fi
PORT="${PORT:-3000}"
echo "NexNotes running on http://localhost:$PORT — Ctrl+C to stop"
exec "$HERE/usr/bin/node" "$HERE/usr/app/server.js"
EOF
chmod +x "$APPDIR/AppRun"

cat > "$APPDIR/nexnotes.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=NexNotes
GenericName=Encrypted notes
Comment=Local-first, end-to-end encrypted notes — self-hosted
Exec=AppRun
Icon=nexnotes
Categories=Office;Utility;
Terminal=true
StartupNotify=false
EOF

cp "$ROOT/docs/logo.png" "$APPDIR/nexnotes.png"

cd "$OUT"
TOOL="appimagetool-x86_64.AppImage"
if [ ! -f "$TOOL" ]; then
  curl -fsSL -o "$TOOL" \
    https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage
fi
chmod +x "$TOOL"
rm -rf appimagetool-root
./"$TOOL" --appimage-extract >/dev/null
mv squashfs-root appimagetool-root
./appimagetool-root/AppRun --no-appstream "$APPDIR" "nexnotes-v${VERSION}-linux-x64.AppImage"
echo "built: $OUT/nexnotes-v${VERSION}-linux-x64.AppImage"
