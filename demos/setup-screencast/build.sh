#!/bin/bash
# Stitch the recorded terminal cast + the two browser clips (authorize, then the installed
# plugin's page) into one synced side-by-side clip.
#
# The cast keeps real time inside the browser-hand-off window so the two panes stay causally
# in sync there; everything before/after is sped up, and the `npm install` stretch harder
# still (nobody wants to watch npm link 170 packages).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$ROOT"

H=814                        # common pane height
GAPCAP=${GAPCAP:-1.4}
WEBM=${WEBM:-0}              # WEBM=1 also encodes the vp9 .webm (slow, ~2-3 min)
NODE="${NODE:-node}"

if [[ -x "$ROOT/bin-agg" ]]; then AGG="$ROOT/bin-agg"; else AGG="agg"; fi

cast="$OUT/term.cast"
mapfile -t clips < <(ls -tr "$OUT"/video/*.webm)      # oldest first: [0] authorize, [1] plugin page
[[ "${#clips[@]}" -ge 2 ]] || { echo "expected 2 browser clips in $OUT/video, got ${#clips[@]}"; exit 1; }
mkdir -p "$OUT/final"

# 1. Reshape the cast timing (see timing.mjs). Emit: final terminal duration, the compressed
#    "Opening WordPress..." time, and the compressed "Loopress Full installed" time.
read TERM_DUR AUTH_AT INSTALL_AT < <("$NODE" "$ROOT/timing.mjs" reshape "$cast" "$OUT/term.capped.cast" "$GAPCAP")
echo "term=${TERM_DUR}s  auth hand-off=${AUTH_AT}s  plugin installed=${INSTALL_AT}s"

# 2. Terminal cast -> gif -> mp4  (agg's idle-time-limit stays high; timing is already shaped)
"$AGG" --font-family "JetBrains Mono" --font-size 18 --fps-cap 30 --speed 1.0 --rows 22 \
  --idle-time-limit 30 --last-frame-duration 2 --theme dracula \
  "$OUT/term.capped.cast" "$OUT/term.gif"
ffmpeg -y -loglevel error -i "$OUT/term.gif" \
  -vf "scale=-2:${H}:flags=lanczos,setsar=1" \
  -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$OUT/term.mp4"

# 3. Normalise both browser clips to the pane height.
ffmpeg -y -loglevel error -i "${clips[0]}" \
  -vf "scale=-2:${H}:flags=lanczos,setsar=1,fps=30,format=yuv420p" -c:v libx264 -crf 20 "$OUT/b1.mp4"
# skip the plugin-page clip's blank first moment (the page still loading)
ffmpeg -y -loglevel error -ss 0.6 -i "${clips[1]}" \
  -vf "scale=-2:${H}:flags=lanczos,setsar=1,fps=30,format=yuv420p" -c:v libx264 -crf 20 "$OUT/b2.mp4"
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
BW=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$OUT/b1.mp4")
D1=$(dur "$OUT/b1.mp4"); D2=$(dur "$OUT/b2.mp4")

# Browser timeline: placeholder(AUTH_AT) -> clip1 -> freeze until the plugin is installed
# -> clip2 -> freeze to the end. Terminal side is frozen to the same total.
read GAP1 BROWSER_DUR FINAL TAIL_B TAIL_T DIM_A DIM_B < <("$NODE" "$ROOT/timing.mjs" layout "$AUTH_AT" "$D1" "$D2" "$INSTALL_AT" "$TERM_DUR")
echo "gap1=${GAP1}s  browser total=${BROWSER_DUR}s  final=${FINAL}s  dim=${DIM_A}..${DIM_B}s"

ffmpeg -y -loglevel error \
  -f lavfi -t "$AUTH_AT" -i "color=c=0x282a36:s=${BW}x${H}:r=30" \
  -i "$OUT/b1.mp4" -i "$OUT/b2.mp4" -filter_complex "
    [0:v]drawtext=text='Chrome opens here when lps requests authorization':
         x=(w-tw)/2:y=(h-th)/2:fontsize=22:fontcolor=0x8a8fa3:font=monospace,format=yuv420p[pre];
    [1:v]tpad=stop_duration=${GAP1}:stop_mode=clone,format=yuv420p[c1];
    [2:v]tpad=stop_duration=${TAIL_B}:stop_mode=clone,format=yuv420p[c2];
    [pre][c1][c2]concat=n=3:v=1:a=0[v]" \
  -map "[v]" -c:v libx264 -crf 20 "$OUT/browser.side.mp4"

# 4. Labelled panes (terminal padded to the full length, browser as built).
ffmpeg -y -loglevel error -i "$OUT/term.mp4" -filter_complex "
  [0:v]tpad=stop_duration=${TAIL_T}:stop_mode=clone,
       pad=iw:ih+42:0:42:color=0x11111b,
       drawtext=text='Terminal':x=18:y=11:fontsize=20:fontcolor=0xa6adc8:font=monospace,setsar=1[v]" \
  -map "[v]" -r 30 -c:v libx264 -pix_fmt yuv420p -crf 20 "$OUT/L.mp4"
ffmpeg -y -loglevel error -i "$OUT/browser.side.mp4" -filter_complex "
  [0:v]pad=iw:ih+42:0:42:color=0x11111b,
       drawbox=x=0:y=42:w=iw:h=ih-42:color=black@0.5:t=fill:enable='between(t,${DIM_A},${DIM_B})',
       drawtext=text='Browser / WordPress':x=18:y=11:fontsize=20:fontcolor=0xa6adc8:font=monospace,setsar=1[v]" \
  -map "[v]" -r 30 -c:v libx264 -pix_fmt yuv420p -crf 20 "$OUT/R.mp4"

# 4a. Desktop: side by side, 10% taller than the natural aspect.
ffmpeg -y -loglevel error -i "$OUT/L.mp4" -i "$OUT/R.mp4" -filter_complex "
  [0:v][1:v]hstack=inputs=2,scale=w=1600:h='2*round(1.1*1600*ih/iw/2)':flags=lanczos,
  pad=ceil(iw/2)*2:ceil(ih/2)*2,setsar=1[v]" \
  -map "[v]" -r 30 -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$OUT/final/setup.mp4"

ffmpeg -y -loglevel error -i "$OUT/final/setup.mp4" \
  -vf "select=gte(n\,$("$NODE" "$ROOT/timing.mjs" poster "$AUTH_AT"))" -vframes 1 "$OUT/final/setup.poster.jpg"

# 4b. Mobile: browser under the terminal, portrait, 1080 wide.
if [[ "${MOBILE:-1}" == 1 ]]; then
  ffmpeg -y -loglevel error -i "$OUT/L.mp4" -i "$OUT/R.mp4" -filter_complex "
    [0:v]scale=1080:-2:flags=lanczos,setsar=1[t];
    [1:v]scale=1080:-2:flags=lanczos,setsar=1[b];
    [t][b]vstack=inputs=2,pad=ceil(iw/2)*2:ceil(ih/2)*2,setsar=1[v]" \
    -map "[v]" -r 30 -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$OUT/final/setup-mobile.mp4"
  ffmpeg -y -loglevel error -i "$OUT/final/setup-mobile.mp4" \
    -vf "select=gte(n\,$("$NODE" "$ROOT/timing.mjs" poster "$AUTH_AT"))" -vframes 1 "$OUT/final/setup-mobile.poster.jpg"
fi

rm -f "$OUT/final/setup.webm"
if [[ "$WEBM" == 1 ]]; then
  echo "encoding vp9 webm (slow)..."
  ffmpeg -y -loglevel error -i "$OUT/final/setup.mp4" \
    -c:v libvpx-vp9 -b:v 0 -crf 34 -deadline good -cpu-used 4 -row-mt 1 -an "$OUT/final/setup.webm"
fi

echo; ls -la "$OUT/final/"
