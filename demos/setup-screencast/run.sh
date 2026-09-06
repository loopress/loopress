#!/bin/bash
# Record the flow to out/term.cast + out/video/*.webm. Nothing is stitched here.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$ROOT"
exec "${RUN_AS[@]}" env "WP_URL=$WP_URL" "$NODE" --disable-warning=ExperimentalWarning orchestrate.ts
