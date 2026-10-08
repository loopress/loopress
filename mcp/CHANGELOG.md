# @loopress/mcp

## 0.29.0

### Minor Changes

- cc5ede1: `lps plugin pull` no longer adds every plugin installed on the site. Plugins the project already tracks are refreshed, and the others are offered as a list to tick, unticked by default, so a pull from production doesn't bring its cache, security or backup plugins into the project. Without a terminal (`--yes`, `--json`, CI, the MCP server), only tracked plugins and those named with the new `--plugin <slug>` flag are written; the MCP `plugin_pull` tool takes them as `plugins`.
  
  Plugins under `require-dev` in `composer.json` are now installed on the `local` environment by `lps plugin push` and `lps composer push`, and still never on a remote site: use it for Query Monitor, or for a premium plugin's free edition while production runs the paid one.
- bee1b73: Breaking: everything theme related now lives under `lps theme`. `lps template push/list/diff` is now `lps theme template push/list/diff`, and the versions-only `lps theme push/pull` is now `lps theme version push/pull`. `lps theme push` now pushes the whole topic in order (versions, then templates and parts, then Global Styles), and `lps theme pull` pulls versions and Global Styles. `lps theme style push` accepts `--yes`. In the MCP server, `theme_push`/`theme_pull` now wrap the whole topic, the new `theme_version_push`/`theme_version_pull` keep the versions-only behavior, and the `template_*` tool names are unchanged. The `template` and `part` resource names for `lps diff --only/--skip` are unchanged.

### Patch Changes

- cc5ede1: A push's `--dry-run` now reads the target site, the same way `lps diff` does, instead of staying local. It used to announce ACF, SEO, forms or snippets as pushed on a site that would refuse them (plugin missing), and the real push then failed; the dry run now fails the same way. The MCP server's preview and pre-apply check, built on the dry run, benefit too. `lps push --dry-run` also says "would push" instead of "pushed".
- 69ed247: `lps acf`, `lps seo`, `lps form`, `lps menu` and `lps theme style` `push`/`pull` now accept `--json`. The MCP server runs every command with `--json`, so `acf_push`, `acf_pull`, `seo_push`, `seo_pull`, `form_push`, `form_pull`, `menu_push`, `menu_pull`, `theme_styles_push` and `theme_styles_pull` always failed with "Nonexistent flag: --json". A test now checks that every command the MCP server can call supports `--json`.
- 69ed247: The MCP server now refuses a change to `production` even when `env` is omitted and `production` is the active environment. Before, only an explicit `env: "production"` was refused, so `hook_rm`, `api_rm`, a `*_rollback` or a `push` with `prune` could reach production without any human confirmation. A mutating tool called without `env` now resolves the active environment first and pins it, so the confirmed call also applies to the environment that was previewed, even if the active one is switched in between. `lps status --json` reports the resolved `environment` name for this.
- 69ed247: `project_diff` now accepts `template`, `part` and `page` in `only`/`skip`, like `lps diff --only`.
- Updated dependencies [cc5ede1]
- Updated dependencies [426df4b]
- Updated dependencies [69ed247]
- Updated dependencies [69ed247]
- Updated dependencies [cc5ede1]
- Updated dependencies [69ed247]
- Updated dependencies [cc5ede1]
- Updated dependencies [b77aafe]
- Updated dependencies [e57f3a0]
- Updated dependencies [426df4b]
- Updated dependencies [bee1b73]
- Updated dependencies [a3c5097]
  - @loopress/cli@0.29.0

## 0.28.0

### Minor Changes

- cd9479d: `lps app push` now builds each app before pushing it: when `apps/<name>/package.json` has a `build` script, it runs with the app's package manager (from `packageManager`, else the nearest lockfile, else npm), on `--dry-run` too, so a forgotten rebuild no longer ships a stale `dist/` reported as "up to date". A failing build fails that app and uploads nothing. Pass `--no-build` (MCP: `noBuild`) when CI already built. Dependencies are never installed for you.
- 20a406c: Block templates and parts: `templates/<slug>.html` and `parts/<slug>.html` are written by `lps template push` as the files of a child theme of the active block theme, `<parent>-loopress`, the parent staying untouched. Any template of the hierarchy can be overridden, and a template with a `title`/`postTypes` header becomes a page template a static page picks with its `template` header (no header or footer part gives a bare page). Edits made in the Site Editor are never overwritten and show up as drift in `lps template diff` and `lps diff`. Part of `lps push` (before pages), `lps dev`, `lps init` and `lps validate`. MCP gains `template_push`, `template_list` and `template_diff`.
- 61350a3: Breaking: `lps theme-styles pull/push/diff/rollback` is now `lps theme style pull/push/diff/rollback`, grouped with the other theme commands. The `theme-styles` resource name for `lps diff --only/--skip` and the MCP tool names (`theme_styles_*`) are unchanged, and existing rollback snapshots still work.

### Patch Changes

- Updated dependencies [cd9479d]
- Updated dependencies [4d1c8af]
- Updated dependencies [4d1c8af]
- Updated dependencies [eb417c3]
- Updated dependencies [20a406c]
- Updated dependencies [b1c46ac]
- Updated dependencies [61350a3]
  - @loopress/cli@0.28.0

## 0.27.0

### Patch Changes

- bb32133: `lps dev` now also watches `hooks/` and pushes hook files on change. A request the Loopress plugin refuses on purpose with a 403 (for example reading a secret-looking option) now shows the plugin's own reason instead of "Authentication failed, check your credentials", and HTML entities in server messages (`&quot;`) are decoded. Errors from the Loopress cloud API now show the API's own message (validation errors included) instead of a generic "Request failed with status code 400".
  
  `lps validate` now checks JSON files at any depth (ACF's `acf/<type>/`, SEO's `post-meta/` and `redirects/` were silently skipped before), tracked option files (a missing `name`, `autoload` or `value` is reported), and the theme styles directory.
  
  `lps plugin add` and `lps theme add` support `--json`, and the MCP server gets matching `plugin_add` and `theme_add` tools (local `loopress.json` edit only).
  
  Rollback snapshots (`.loopress/snapshots/`, inside your project) hold the environment's full remote state; the `.loopress/` directory now writes its own `.gitignore` so they are never committed by accident.
  
  `lps push`, `lps pull` and `lps promote` with `--json` now print a single valid JSON document: the progress output of the resource commands they run goes to stderr instead of polluting stdout, which broke the MCP `push_all`, `pull_all` and `project_promote` tools. A failed aggregate run now lists each failed resource and its reason.
- e042cde: Fix the MCP server on Windows: every tool failed with `ENOENT` because it spawned `lps` without a shell, and Windows installs it as `lps.cmd`, which Node refuses to run directly. The server now starts the installed CLI's `bin/run.js` with its own Node, falling back to `lps` on `PATH` through `tinyexec`, which also works on Windows. `LPS_BIN` also accepts a `.js` file. `@loopress/cli` now exports its `package.json`, and the MCP server now declares Node 22 or later, like the CLI.
  
  `lps init` now adds `* text=auto eol=lf` to `.gitattributes`, so a checkout on Windows (CRLF by default) keeps the same bytes as what `pull` writes.
- Updated dependencies [1cd51fc]
- Updated dependencies [bb32133]
- Updated dependencies [d043549]
- Updated dependencies [bb32133]
- Updated dependencies [e042cde]
  - @loopress/cli@0.27.0

## 0.26.0

### Minor Changes

- b60df46: Adds `lps page push [SLUG]`, `lps page list` and `lps page diff` for static HTML pages (`pages/<slug>.html`, `pageDir` in `loopress.json`), with an optional `<!-- title: ... / status: draft|publish -->` header. Pages are part of `lps push`, `lps diff --only page`, `lps dev` and `lps init`, and are checked by `lps validate`. The MCP server gets matching `page_push`, `page_list` and `page_diff` tools, and a CLI command that exits non-zero with a regular JSON payload (a diff reporting drift) is now returned as a result instead of an error. Requires Loopress Full.

## 0.25.0

### Minor Changes

- 3ec619c: `lps doctor` now supports `--json`, returning a structured `{project, environment, url, checks, ok, pluginVersion}` result instead of throwing on failure (its human-readable output and exit code are unchanged).
  
  The MCP server gains three read-only tools that were missing from CLI parity: `project_diff` (drift between local files and an environment, or between two environments), `project_doctor` (connectivity, plugin and credential diagnostics), and `validate_local` (checks local tracked files without contacting WordPress).
- 1607fc5: Adds a `menu` resource for syncing WordPress navigation menus and menu locations. The plugin exposes `loopress/v1/menus` and `loopress/v1/menu-locations` REST endpoints, resolving menu items by identity (post type/taxonomy + slug) rather than raw object ids so they remain portable between environments. The CLI gains `lps menu list/pull/push/diff`, wired into `lps push`/`lps pull`/`lps diff`/`lps init` and local file validation, and the MCP server gains matching `menu_push`/`menu_pull`/`menu_list` tools.
- 10d18ec: `lps push`, `lps pull`, and `lps promote` now support `--json` (each returns a structured per-resource result instead of erroring with "Nonexistent flag: --json"). This was a real bug in the MCP server's `push_all` and `pull_all` tools, which always shell out with `--json` and so always failed.
  
  The MCP server also gains `project_promote`, the tool for `lps promote` that CLI parity was missing.
- ce19505: Adds `lps <resource> rollback` for the 9 resource-state-backed resources (snippet, form, acf, api, hook, seo, menu, option, theme-styles). `lps <resource> push` now writes a snapshot of the environment's state (before and about-to-be-pushed) to a local, gitignored cache (`.loopress/snapshots/<resource>/`, capped at the last 10 per resource) right before every real push. `lps <resource> rollback` restores the most recent snapshot (or `--to <id>`), `--list` shows what's available. It refuses to overwrite a change made to the environment since the original push unless explicitly confirmed (interactive prompt, or `--yes`), the same shape as the production-push guard. No WordPress-side capability is required: restoring materializes the archived state into the resource's own local file layout, then delegates to the existing push command.
  
  The MCP server gains a matching `<resource>_rollback` tool per resource, following the existing confirmToken handshake (`list: true` bypasses it as a plain read).
- 4432466: New `lps theme-styles pull/push/diff` command group syncs the active block theme's Global Styles customizations (Site Editor > Styles: colors, typography, spacing) as a local `theme/<stylesheet>-global-styles.json` file, reusing WordPress core's own `wp/v2/themes` and `wp/v2/global-styles/<id>` REST endpoints (no new PHP controller needed). Classic (non-block) themes fail the command clearly instead of syncing nothing silently. This resource is included automatically in `lps diff`, but deliberately left out of the aggregate `lps push`/`lps pull` (like `lps theme`), so a classic-theme site's routine sync isn't broken by this opt-in feature.
  
  The MCP server gains matching `theme_styles_pull` and `theme_styles_push` tools, and `project_diff` now covers `theme-styles` too.

### Patch Changes

- d7aa371: The confirm-token handshake every mutating MCP tool uses now catches remote-state staleness, not just local-file staleness. Previously only a file swapped between the preview and confirmed calls was protected against (via a frozen working-tree copy); a remote change on WordPress in that same window (e.g. someone else editing the environment between a `snippet_rollback` preview and its confirm) could still be silently overwritten, since the confirmed call trusted the preview's drift check without re-checking it.
  
  The confirmed call now re-runs the same `--dry-run` once more right before applying, and refuses (`STALE_PREVIEW`) if it reports anything different from what the preview reported, instead of applying against stale data. This applies to every mutating tool generically (push, rm, prune, rollback, ...), not just rollback: each tool's own `--dry-run` output is compared as-is, so tools whose preview doesn't inspect remote state see no behavior change.

## 0.24.1

### Patch Changes

- cedc316: Security: the mutating-tool confirm handshake now applies from a frozen copy of the working tree, not a fresh disk read (F28).
  
  The two-call handshake bound the `confirmToken` to the CLI arguments, but the apply step re-read the files from disk, up to 5 minutes after the preview the caller approved. A file swapped in that window (a benign `snippets/foo.php` for a web shell) was pushed under an approval given against the old content.
  
  The preview call now copies the working directory to a temp dir (skipping `node_modules`, `.git`, `vendor`, `dist`), runs the dry-run against that copy, and the apply runs from the same copy. The snapshot is removed after the apply and on token expiry or eviction. Known gap, documented: an `lps --path` outside the working directory, or a `loopress.json` that maps a resource directory to an absolute path elsewhere, is still read live.

## 0.24.0

### Minor Changes

- 755b390: Added `hooks/`, a new resource for declaring WordPress actions, filters, and scheduled (cron) tasks as plain PHP files, deployed with `lps hook push`/`pull`/`list` (and `lps push`/`pull`/`diff`, `hook_push`/`hook_pull`/`hook_list` MCP tools). One file, one class, public methods attributed with `#[Action(hook, priority, acceptedArgs)]`, `#[Filter(hook, priority, acceptedArgs)]`, or `#[Cron(recurrence, hook?)]` bind straight to `add_action()`/`add_filter()`/WP-Cron (a `#[Cron]` job is just an action bound to a schedule instead of an existing WordPress event). Unlike a REST route, a bound hook runs unconditionally for every visitor with no permission check of its own, so every callback is wrapped to catch and log rather than propagate; a filter additionally fails open, returning the original value on a throw. Loopress Full only, same as custom API routes.
- f0fe762: Added `options/`, a new resource for tracking individual WordPress options (`wp_options` rows) directly, agnostic of which plugin owns them: no adapter to write, unlike `seo/` which has to know Yoast's vs RankMath's option names and shape. `lps option list` shows every option name and autoload flag on the site (never values, so browsing stays cheap and never leaks a value by accident), `lps option add <name>` starts tracking one as a local file, and `lps option pull`/`push`/`diff`/`remove` work the tracked set from there (`push` is upsert-only, it never deletes an untracked option). Two safety rails: `active_plugins`/`template`/`stylesheet` are refused outright (already owned by the `plugin`/`theme` resources), and environment-owned or WordPress-generated options (`siteurl`, `home`, `db_version`, `cron`, `rewrite_rules`, `WPLANG`) default to `"readonly": true` in their local file, tracked and diffable but skipped by `push` unless explicitly overridden. Mirrored as `option_push`/`option_pull`/`option_list`/`option_add`/`option_remove` MCP tools.
- 6b0fda3: **Breaking:** removed the `page` resource. `lps page pull`/`push`/`list`/`diff`, the `page_pull`/`page_push`/`page_list` MCP tools, the `pageDir` setting in `loopress.json`, and the `pages` entry for `lps dev` / `lps diff --only` are all gone. `lps push`/`pull` no longer touch pages. WordPress pages are core content editable in wp-admin or over `wp/v2/pages` directly; keep them under version control with a general-purpose WP-CLI export if needed.

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
