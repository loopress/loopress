# Shared config for the screencast scripts. Sourced, not executed.
# Everything is relative to this directory so the folder can be moved / cloned anywhere.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ROOT

# Where the recording, the throwaway CLI config and the build artifacts live.
OUT="$ROOT/out"

# docker compose targeting our stack, wherever we run from.
dc() { docker compose -f "$ROOT/compose.yml" "$@"; }

# Chrome needs a non-root uid for its sandbox. On a root Linux box we shell out to an
# unprivileged "demo" user (created by setup.sh); everywhere else we run in place.
if [ "$(id -u)" = 0 ] && id demo >/dev/null 2>&1; then
  RUN_AS=(sudo -u demo)
else
  RUN_AS=()
fi

# Python for the orchestrator: the local venv if setup.sh made one, else system python3.
if [ -x "$ROOT/venv/bin/python" ]; then
  PY="$ROOT/venv/bin/python"
else
  PY="$(command -v python3)"
fi

WP_URL="${WP_URL:-http://localhost:8080}"
