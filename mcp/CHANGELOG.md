# @loopress/mcp

## 0.23.0

### Minor Changes

- d811b3f: Add `lps app push [name]`, `lps app pull [path]`, `lps app list` and `lps app remove <name>` for syncing built single-page app bundles between a local `apps/<name>/` directory (a `loopress.app.json` plus a built `dist/`) and WordPress. `push` builds a sha256 manifest of `dist/`, asks the site which files it already has, uploads only the differences, then commits the new build in one step; the front end keeps serving the old build until that commit lands. `pull` writes each committed app back to `apps/<name>/dist/` and removes local app directories that no longer exist remotely (confirmed in a terminal, reported in CI). Adds an `appsDir` key to `loopress.json` and an "apps" entry to `lps init`.
  
  New MCP tools mirror the commands: `app_push`, `app_pull`, `app_list`, `app_remove` (`app_push`/`app_remove` use the dry-run/confirmToken handshake).
  
  This is a Loopress Full plugin feature; the CLI and MCP surface is edition-agnostic.
- dfb33a3: Pin WordPress.org plugin and theme versions through a lockfile, installed on the site with Composer + WPackagist.
  
  `loopress.json` `plugins` (and the new `themes` key) now take an **exact version** or `"latest"`, instead of always `"latest"`. `lps plugin push` no longer calls WordPress's core `wp/v2/plugins` endpoint (which only installs the current release); it sends an intent to the site, where Loopress Full renders a plugin-owned `composer.json` and runs Composer against the WPackagist repository, landing plugins in `wp-content/plugins/` at the pinned version, with no SSH and no `composer.json` in your repo.
  
  - `lps plugin pull` / `lps theme pull` now pin every plugin/theme to the version running on the site.
  - `lps plugin add --version <v>` pins an exact version; `lps theme add` mirrors it.
  - New `lps plugin push` flags: `--force` (allow downgrades, and take over a plugin installed by hand, replacing its files) and `--prune` (deactivate active plugins absent from `loopress.json`). Removing an entry from `loopress.json` uninstalls the plugin on the next push (shown in the plan, confirmed).
  - New `lps plugin status` / `lps theme status`: report drift (missing, wrong version, inactive, untracked) and exit non-zero for CI.
  - New `lps plugin audit`: check pinned plugins against a WordPress vulnerability database (wpvulnerability.net) and the WordPress.org plugin API for health signals.
  - New `lps theme` command group (`add`, `pull`, `push`, `status`). Loopress manages installed theme versions only, it never switches the active theme.
  - When a repo has a `composer.json` (from `lps composer init`), it is authoritative for plugins/themes and the `plugin`/`theme` commands defer to `lps composer`. `lps composer push` now sends an intent (libraries + WPackagist plugins/themes) instead of a verbatim `composer.json`; the plugin owns the file's shape.
  
  New MCP tools: `plugin_status`, `plugin_audit`, `theme_push`, `theme_pull`, `theme_status`. `plugin_push` gains `force` and `prune`.
  
  Limits: WordPress.org plugins/themes only (premium plugins are tracked but never touched); a downgrade replaces files only and does not undo database migrations; multisite is not supported.
  
  This relies on a Loopress Full plugin feature; see the companion changeset there.

### Patch Changes

- b3e9d88: Fix `lps plugin pull` recording the wrong slug for a single-file plugin whose WordPress.org slug differs from its bare file id (e.g. Hello Dolly: `hello.php` has slug `hello-dolly`, not `hello`). The wrong slug made a later `lps plugin push --force` fail atomically with a Composer "could not be found" error instead of installing anything. The slug is now read from the plugin's `Plugin URI` header when it points to a wordpress.org listing, falling back to the bare file id otherwise.

## 0.22.0

### Minor Changes

- 2867b83: The MCP server now exposes `acf`, `seo` and `form` tools (`_push`, `_pull`, `_list`), matching the CLI. `acf_*` takes an optional `type` array and `seo_*` an optional `postType` array to scope the operation.
- 479525f: The MCP server now exposes `push_all` and `pull_all`, wrapping `lps push` and `lps pull` so an agent can sync every resource in one call instead of eight. `push_all` uses the same dry-run/confirmToken handshake as the other mutating tools.

## 0.21.0

### Minor Changes

- ddce917: Initial release of `@loopress/mcp`: an MCP (Model Context Protocol) stdio server exposing `lps` operations (`snippet`/`page`/`api` push/pull/list, `plugin`/`composer` push/pull, `project_status`) as tool calls for AI agents, plus a `loopress://project/config` resource. It wraps the existing `lps` binary as a subprocess rather than depending on `@loopress/cli` internals, see `obsidian/Product/Loopress MCP.md`.

  Mutating tools (`*_push`) use a two-call handshake: called without `confirmToken`, they run a `--dry-run` preview and return a single-use, 5-minute `confirmToken`; called again with that token, they apply exactly what was previewed. There is no way to skip the preview in a single call, including for a `production` environment.
