#!/usr/bin/env bash
# Regenerate every demo clip. Web (Playwright) + terminal (vhs), then post-process each raw
# recording into a Safari-safe mp4, a vp9 webm and a poster frame.
#
#   WP_URL=... WP_USERNAME=... WP_APP_PASSWORD=... WP_ADMIN_PASSWORD=... pnpm demos
#
# Needs: ffmpeg (brew install ffmpeg), and vhs for the terminal tapes (brew install vhs).
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=demos/.out
mkdir -p "$OUT/final"

# 1. Web screencasts -> $OUT/<name>.webm (each *.demo.ts saves its own via page.video()).
pnpm exec playwright test -c playwright.demos.config.ts "$@"

# 2. Terminal screencasts -> $OUT/terminal-*.{gif,mp4}
if command -v vhs >/dev/null 2>&1; then
  if [ -n "${WP_URL:-}" ]; then
    eval "$(demos/terminal/prepare.sh)"
    for tape in demos/terminal/*.tape; do vhs "$tape"; done
  else
    echo "WP_URL unset; skipping terminal tapes (they need a live instance)" >&2
  fi
else
  echo "vhs not installed (brew install vhs); skipping terminal tapes" >&2
fi

# 3. Post-process every raw webm into final deliverables.
shopt -s nullglob
for webm in "$OUT"/*.webm; do
  name=$(basename "$webm" .webm)
  ffmpeg -y -loglevel error -i "$webm" -vf "fps=30,scale=1280:-2" -an \
    -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart "$OUT/final/$name.mp4"
  ffmpeg -y -loglevel error -i "$webm" -vf "fps=30,scale=1280:-2" -an \
    -c:v libvpx-vp9 -b:v 0 -crf 34 "$OUT/final/$name.webm"
  ffmpeg -y -loglevel error -i "$webm" -vf "scale=1280:-2,select=gte(n\,15)" -vframes 1 \
    "$OUT/final/$name.poster.jpg"
done

echo
echo "Finals in $OUT/final/ . Copy the ones you want into website/src/assets/demos/ and"
echo "embed with <video autoplay muted loop playsinline poster=...>."
