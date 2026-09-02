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
PYBIN="${PY:-python3}"

if [ -x "$ROOT/bin-agg" ]; then AGG="$ROOT/bin-agg"; else AGG="agg"; fi

cast="$OUT/term.cast"
mapfile -t clips < <(ls -tr "$OUT"/video/*.webm)      # oldest first: [0] authorize, [1] plugin page
[ "${#clips[@]}" -ge 2 ] || { echo "expected 2 browser clips in $OUT/video, got ${#clips[@]}"; exit 1; }
mkdir -p "$OUT/final"

# 1. Reshape the cast timing. Emit: final terminal duration, the compressed "Opening
#    WordPress..." time, and the compressed "Loopress Full installed and activated" time.
read TERM_DUR AUTH_AT INSTALL_AT < <($PYBIN - "$cast" "$OUT/term.capped.cast" "$GAPCAP" <<'PY'
import json, sys
src, dst, cap = sys.argv[1], sys.argv[2], float(sys.argv[3])
F_PRE, F_POST, F_NPM = 0.55, 0.6, 0.22
lines = [l for l in open(src) if l.strip()]
hdr, ev = lines[0], [json.loads(l) for l in lines[1:]]

def find(sub, after=0.0):
    for t, _, d in ev:
        if t >= after and sub in d:
            return t
    return None

# Keep real time for the whole browser-auth wait: from "Opening WordPress..." until the CLI
# gets the callback back. Everything before (npm, prompts) and after (the install log) is sped up.
t_open = find("Opening WordPress in your browser")
t_back = find("Downloading the latest Loopress Full") or find("configured") or (t_open + 16)
lo, hi = t_open - 0.5, t_back + 0.5

npm_lo = find("npm install -g @loopress/cli")
npm_hi = find("packages in ", after=npm_lo or 0.0)
t_installed = find("Loopress Full installed and activated")

out, prev_raw, acc, comp_open, comp_installed = [], 0.0, 0.0, None, None
for t, typ, data in ev:
    dt = t - prev_raw
    prev_raw = t
    protected = lo <= t <= hi
    if not protected and dt > cap:
        dt = cap
    if protected:
        speed = 1.0
    elif npm_lo is not None and npm_hi is not None and npm_lo <= t <= npm_hi:
        speed = F_NPM
    elif t <= lo:
        speed = F_PRE
    else:
        speed = F_POST
    acc += dt * speed
    nt = round(acc, 6)
    if comp_open is None and "Opening WordPress in your browser" in data:
        comp_open = nt
    if comp_installed is None and t_installed is not None and t >= t_installed:
        comp_installed = nt
    out.append([nt, typ, data])
open(dst, "w").write(hdr + "".join(json.dumps(e) + "\n" for e in out))
print(f"{out[-1][0]:.3f} {comp_open:.3f} {(comp_installed or out[-1][0]):.3f}")
PY
)
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
ffmpeg -y -loglevel error -i "${clips[1]}" \
  -vf "scale=-2:${H}:flags=lanczos,setsar=1,fps=30,format=yuv420p" -c:v libx264 -crf 20 "$OUT/b2.mp4"
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
BW=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$OUT/b1.mp4")
D1=$(dur "$OUT/b1.mp4"); D2=$(dur "$OUT/b2.mp4")

# Browser timeline: placeholder(AUTH_AT) -> clip1 -> freeze until the plugin is installed
# -> clip2 -> freeze to the end. Terminal side is frozen to the same total.
read GAP1 BROWSER_DUR FINAL TAIL_B TAIL_T < <($PYBIN -c "
auth,d1,d2,inst,term = $AUTH_AT,$D1,$D2,$INSTALL_AT,$TERM_DUR
gap1 = max(0.3, inst - auth - d1)
bdur = auth + d1 + gap1 + d2
final = max(term, bdur)
print(f'{gap1:.3f} {bdur:.3f} {final:.3f} {final-bdur:.3f} {final-term:.3f}')
")
echo "gap1=${GAP1}s  browser total=${BROWSER_DUR}s  final=${FINAL}s"

ffmpeg -y -loglevel error \
  -f lavfi -t "$AUTH_AT" -i "color=c=0x282a36:s=${BW}x${H}:r=30" \
  -i "$OUT/b1.mp4" -i "$OUT/b2.mp4" -filter_complex "
    [0:v]drawtext=text='Chrome opens here when lps requests authorization':
         x=(w-tw)/2:y=(h-th)/2:fontsize=22:fontcolor=0x8a8fa3:font=monospace,format=yuv420p[pre];
    [1:v]tpad=stop_duration=${GAP1}:stop_mode=clone,format=yuv420p[c1];
    [2:v]tpad=stop_duration=${TAIL_B}:stop_mode=clone,format=yuv420p[c2];
    [pre][c1][c2]concat=n=3:v=1:a=0[v]" \
  -map "[v]" -c:v libx264 -crf 20 "$OUT/browser.side.mp4"

# 4. Side by side, labelled, scaled to a sane width.
ffmpeg -y -loglevel error -i "$OUT/term.mp4" -i "$OUT/browser.side.mp4" -filter_complex "
  [0:v]tpad=stop_duration=${TAIL_T}:stop_mode=clone,
       pad=iw:ih+42:0:42:color=0x11111b,
       drawtext=text='Terminal':x=18:y=11:fontsize=20:fontcolor=0xa6adc8:font=monospace,setsar=1[l];
  [1:v]pad=iw:ih+42:0:42:color=0x11111b,
       drawtext=text='Browser / WordPress':x=18:y=11:fontsize=20:fontcolor=0xa6adc8:font=monospace,setsar=1[r];
  [l][r]hstack=inputs=2,scale=w=1600:h='2*round(1.1*1600*ih/iw/2)':flags=lanczos,pad=ceil(iw/2)*2:ceil(ih/2)*2,setsar=1[v]" \
  -map "[v]" -r 30 -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$OUT/final/setup.mp4"

ffmpeg -y -loglevel error -i "$OUT/final/setup.mp4" \
  -vf "select=gte(n\,$($PYBIN -c "print(int(($AUTH_AT+7)*30))"))" -vframes 1 "$OUT/final/setup.poster.jpg"

rm -f "$OUT/final/setup.webm"
if [ "$WEBM" = 1 ]; then
  echo "encoding vp9 webm (slow)..."
  ffmpeg -y -loglevel error -i "$OUT/final/setup.mp4" \
    -c:v libvpx-vp9 -b:v 0 -crf 34 -deadline good -cpu-used 4 -row-mt 1 -an "$OUT/final/setup.webm"
fi

echo; ls -la "$OUT/final/"
