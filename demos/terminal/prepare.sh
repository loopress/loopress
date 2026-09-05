#!/usr/bin/env bash
# Scaffolds a throwaway project + Loopress config for the terminal tape, from the same WP_*
# env vars the e2e suite needs (see e2e/README.md). Prints `export` lines: run it as
#   eval "$(demos/terminal/prepare.sh)"
# then `vhs demos/terminal/app-push.tape`.
set -euo pipefail

: "${WP_URL:?set WP_URL}" "${WP_USERNAME:?set WP_USERNAME}" "${WP_APP_PASSWORD:?set WP_APP_PASSWORD}"

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$REPO/demos/.out"
PROJECT="$OUT/terminal-project"
FAKE_HOME="$OUT/terminal-home"

rm -rf "$PROJECT" "$FAKE_HOME"
mkdir -p "$PROJECT/apps" "$FAKE_HOME/.config/loopress" "$FAKE_HOME/bin"

cp -R "$REPO/demos/fixtures/search-app" "$PROJECT/apps/search"
printf '{\n  "appsDir": "apps"\n}\n' > "$PROJECT/loopress.json"

# `lps` shim -> the built CLI in this checkout (run `pnpm --filter @loopress/cli build` first).
cat > "$FAKE_HOME/bin/lps" <<SHIM
#!/bin/sh
exec node "$REPO/cli/bin/run.js" "\$@"
SHIM
chmod +x "$FAKE_HOME/bin/lps"

# Same shape as the e2e runCli fixture: project resolved from global config, no interactive login.
cat > "$FAKE_HOME/.config/loopress/config.json" <<JSON
{
  "currentProject": { "env": "local", "id": "demo" },
  "projects": {
    "demo": {
      "addedAt": "2026-01-01T00:00:00.000Z",
      "name": "demo",
      "environments": {
        "local": {
          "addedAt": "2026-01-01T00:00:00.000Z",
          "name": "local",
          "url": "$WP_URL",
          "token": "$WP_USERNAME:$WP_APP_PASSWORD"
        }
      }
    }
  },
  "telemetry": { "disabled": true }
}
JSON

# %q-quote every value: the caller runs this through `eval`, so an odd character in $PATH
# or the repo path must not be able to break out of the assignment.
printf 'export DEMO_PROJECT=%q\n' "$PROJECT"
printf 'export HOME=%q\n' "$FAKE_HOME"
printf 'export XDG_CONFIG_HOME=%q\n' "$FAKE_HOME/.config"
printf 'export PATH=%q\n' "$FAKE_HOME/bin:$PATH"
