---
"@loopress/cli": minor
"@loopress/mcp": minor
"@loopress/wordpress-plugin": minor
---

Pin WordPress.org plugin and theme versions through a lockfile, installed on the site with Composer + WPackagist.

`loopress.json` `plugins` (and the new `themes` key) now take an **exact version** or `"latest"`, instead of always `"latest"`. `lps plugin push` no longer calls WordPress's core `wp/v2/plugins` endpoint (which only installs the current release); it sends an intent to the site, where Loopress Full renders a plugin-owned `composer.json` and runs Composer against the WPackagist repository, landing plugins in `wp-content/plugins/` at the pinned version, with no SSH and no `composer.json` in your repo.

- `lps plugin pull` / `lps theme pull` now pin every plugin/theme to the version running on the site.
- `lps plugin add --version <v>` pins an exact version; `lps theme add` mirrors it.
- New `lps plugin push` flags: `--force` (allow downgrades, and take over a plugin installed by hand, replacing its files) and `--prune` (deactivate active plugins absent from `loopress.json`). Removing an entry from `loopress.json` uninstalls the plugin on the next push (shown in the plan, confirmed).
- New `lps plugin status` / `lps theme status`: report drift (missing, wrong version, inactive, untracked) and exit non-zero for CI.
- New `lps plugin audit`: check pinned plugins against a WordPress vulnerability database (wpvulnerability.net) and the WordPress.org plugin API for health signals.
- New `lps theme` command group (`add`, `pull`, `push`, `status`). Loopress manages installed theme versions only, it never switches the active theme.
- When a repo has a `composer.json` (from `lps composer init`), it is authoritative for plugins/themes and the `plugin`/`theme` commands defer to `lps composer`. `lps composer push` now sends an intent (libraries + WPackagist plugins/themes) instead of a verbatim `composer.json`; the plugin owns the file's shape.
- `POST /loopress/v1/composer/sync` takes `{ intent, lock, force }` and returns the effective `composer.json`, `composer.lock`, and the list of removed packages. It returns 422 (`unmanaged_plugins_present`) when the intent references a plugin/theme folder installed by hand, unless `force` is set. `LoopressEnvironment` scaffolds and migrates the site `composer.json` with the WPackagist repository, `composer/installers`, and the installer-paths that place plugins/themes under `wp-content/`.

New MCP tools: `plugin_status`, `plugin_audit`, `theme_push`, `theme_pull`, `theme_status`. `plugin_push` gains `force` and `prune`.

Limits: WordPress.org plugins/themes only (premium plugins are tracked but never touched); a downgrade replaces files only and does not undo database migrations; multisite is not supported.
