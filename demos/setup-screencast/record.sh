#!/bin/bash
# One command: fresh WordPress -> record the `lps project config` flow -> stitch the video.
# Output: out/final/setup.mp4 (+ .poster.jpg, and .webm when WEBM=1).
#
#   ./record.sh              # ~3-4 min once the docker images are cached
#   WEBM=1 ./record.sh       # also encode the vp9 .webm (~+2-3 min)
set -euo pipefail
cd "$(dirname "$0")"
source ./lib.sh
t0=$(date +%s)

# wp-setup / reset-wp need docker (root on a shared box); run / build must not be root (Chrome).
bash wp-setup.sh
bash reset-wp.sh
echo "=== recording ==="
"${RUN_AS[@]}" bash run.sh
echo "=== stitching ==="
"${RUN_AS[@]}" bash build.sh

echo
echo "done in $(( $(date +%s) - t0 ))s  ->  $(pwd)/out/final/setup.mp4"
