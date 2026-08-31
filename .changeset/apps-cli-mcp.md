---
"@loopress/cli": minor
"@loopress/mcp": minor
---

Add `lps app push [name]`, `lps app pull [path]`, `lps app list` and `lps app remove <name>` for syncing built single-page app bundles between a local `apps/<name>/` directory (a `loopress.app.json` plus a built `dist/`) and WordPress. `push` builds a sha256 manifest of `dist/`, asks the site which files it already has, uploads only the differences, then commits the new build in one step; the front end keeps serving the old build until that commit lands. `pull` writes each committed app back to `apps/<name>/dist/` and removes local app directories that no longer exist remotely (confirmed in a terminal, reported in CI). Adds an `appsDir` key to `loopress.json` and an "apps" entry to `lps init`.

New MCP tools mirror the commands: `app_push`, `app_pull`, `app_list`, `app_remove` (`app_push`/`app_remove` use the dry-run/confirmToken handshake).

This is a Loopress Full plugin feature; the CLI and MCP surface is edition-agnostic.
