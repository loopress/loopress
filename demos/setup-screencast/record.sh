#!/bin/bash
# One command: fresh WordPress -> record the `lps project config` flow -> stitch the video.
# Output: out/final/setup.mp4 (+ .poster.jpg, and .webm when WEBM=1).
#
#   ./record.sh              # ~3-4 min once the docker images are cached
#   WEBM=1 ./record.sh       # also encode the vp9 .webm (~+2-3 min)
set -euo pipefail
cd "$(dirname "$0")"
t0=$(date +%s)

bash wp-setup.sh
bash reset-wp.sh
echo "=== recording ==="
bash run.sh
echo "=== stitching ==="
bash build.sh

echo
echo "done in $(( $(date +%s) - t0 ))s  ->  $(pwd)/out/final/setup.mp4"
