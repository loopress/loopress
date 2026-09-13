# @loopress/cli

## 0.24.1

### Patch Changes

- 406eae1: `lps composer push` now reflects that the server resolves `composer.json` itself and never installs from the uploaded `composer.lock`. When the server's resolution moves a version your local lock had pinned, the command prints the drift and tells you to run `lps composer pull`. The `--json` output gains a `lockDrift` array. The MCP `composer_push` tool description is updated to match.
- b28d36c: `lps api pull` / `lps hook pull` now skip a file the server declined to return (e.g. one over the new size limit): they print a warning and leave any local copy untouched, instead of overwriting it with nothing. `lps api list` / `lps hook list` show the server's reason next to such a file.
- d198555: Add `lps api rm <slug>` / `lps hook rm <slug>` to delete one route or hook file from WordPress (confirmation prompt, `--yes` for CI, `--dry-run`), and `lps api push --prune` / `lps hook push --prune` to delete server-side files with no local counterpart after a push.
  
  `--prune` and `rm` both refuse to delete in a non-interactive shell without `--yes`: unlike `pull`'s local cleanup, a pruned file on the server is not recoverable from the repo. The MCP server gains matching `api_rm` / `hook_rm` tools and a `prune` option on `api_push` / `hook_push`, both behind the confirm-token handshake.
- 69bdc0c: `lps api push` now warns for each pushed route that runs with no authentication (`#[Permission(public: true)]`), and `lps api list` badges those routes `[PUBLIC]` (with a trailing warning). `lps api list --json` includes `"public"` per route. The MCP `api_list` tool exposes the same field.
- de7f283: `lps option add` now defaults `readonly: true` for the behaviour-changing core options the server refuses to write (`default_role`, `users_can_register`, `mailserver_*`, `uninstall_plugins`, `initial_db_version`), alongside the ones that were already read-only by default (`siteurl`, `home`, `cron`, ...). `lps option push` skips read-only options, so tracking one of these for `diff` visibility no longer leads to a `403` on push.
- b43b2c7: `lps form push` and `lps seo push` gain opt-in flags for the sync operations the server now gates:
  
  - `lps form push --allow-notifications` also pushes each form's notification and confirmation settings (off by default, so a stray push cannot redirect submissions).
  - `lps seo push --allow-external-redirects` permits pushing a redirect whose target is on another site (rejected by default).
  
  The MCP `seo_push` tool gains `allowExternalRedirects`. `form_push` via MCP always uses the safe default (notifications preserved); the opt-in is CLI-only by design.
- a52c231: Security: harden the `lps login` / `lps project config` browser authorization flow (F24, F25).
  
  - The loopback callback server now generates a 32-byte `state`, threads it through the authorization URL, and requires it back (constant-time compare) on any request that carries credentials. A local process or a web page open during the wait can no longer POST forged credentials into `config.json` / `auth.json`.
  - The server also enforces an `Origin` allowlist (`https://api.loopress.dev` for site auth, `https://console.loopress.dev` for console login) and shuts down on the first callback-shaped request, valid or not, instead of staying open for the whole 5 minute window.
  - `authorizeWithBrowser` no longer reads the Application Password or username from the URL query string, only from the relay's form POST body, so they can no longer land in shell history, proxy logs or the browser address bar.
  
  No API or console change is required: both relays copy the callback URL, and its `state`, through verbatim.
- c2fb026: Security: strip WordPress site URLs and server response bodies from CLI crash reports (F26).
  
  A failed WordPress request throws an `Error` whose message is built by `formatWpError`: it
  carries the full request URL and, for a 4xx/5xx, the server's raw response body appended after a
  newline (a Composer trace, a WordPress fatal, absolute server paths, package URLs). `finally.ts`
  passed that straight to `Sentry.captureException`.
  
  A `beforeSend` scrubber now runs on every event: it keeps the first line of each exception
  message (the "which endpoint, which status" summary), blanks the site host while keeping the
  `/wp-json/...` REST path, drops everything after the first line, and removes any request
  context. Chained `cause` errors are covered too. The terminal still prints the full, unmodified
  message.

## 0.24.0

### Minor Changes

- 755b390: Added `hooks/`, a new resource for declaring WordPress actions, filters, and scheduled (cron) tasks as plain PHP files, deployed with `lps hook push`/`pull`/`list` (and `lps push`/`pull`/`diff`, `hook_push`/`hook_pull`/`hook_list` MCP tools). One file, one class, public methods attributed with `#[Action(hook, priority, acceptedArgs)]`, `#[Filter(hook, priority, acceptedArgs)]`, or `#[Cron(recurrence, hook?)]` bind straight to `add_action()`/`add_filter()`/WP-Cron (a `#[Cron]` job is just an action bound to a schedule instead of an existing WordPress event). Unlike a REST route, a bound hook runs unconditionally for every visitor with no permission check of its own, so every callback is wrapped to catch and log rather than propagate; a filter additionally fails open, returning the original value on a throw. Loopress Full only, same as custom API routes.
- 0ec5ebe: Add `lps diff`: show what differs between your local tracked files and a WordPress environment, or between two environments with `--against`. Covers snippets, forms, ACF, API routes, SEO, and Composer, comparing the normalized representation each resource round-trips (so serialization quirks like key order or a re-added `<?php` tag never show up as drift). Prints a git-style summary (`+` local-only, `-` remote-only, `~` changed, with a per-field list for objects and a line diff for file contents) and exits non-zero when anything differs, so it doubles as a CI drift gate. Plugins and themes keep their existing `lps plugin status` / `lps theme status`.
- ad89acb: Add per-resource diff commands, scoping flags, and harden `lps diff` for CI use.
  
  - `lps snippet diff`, `lps form diff`, `lps acf diff`, `lps api diff`, `lps seo diff`: run the same normalized comparison as `lps diff` for a single resource, accept the resource's `[PATH]` override, and support `--env` / `--against` / `--json`.
  - `lps diff` gains `--only <resource>...` and `--skip <resource>...` to narrow the run (a project that only tracks some resource types can stop the rest showing as drift).
  - Form and ACF comparisons now ignore server-rewritten save timestamps (`modified`, `modified_gmt`), the same way redirect `hits` is already ignored, so a diff between two independently-configured environments reports real differences only.
  - Exit code is now 0 in sync, 1 on drift, 2 when a resource could not be compared (a fetch failure no longer looks like "no drift" to a CI gate). `--json` change entries now carry a structured `fields` list for object resources. Resources are compared concurrently. A `[PATH]` argument combined with `--against` is rejected rather than silently ignored.
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

- 1c3e617: Add `lps promote <from> <to>`, which copies every tracked resource from one environment to another by running `lps pull` from `<from>` then `lps push` to `<to>` in one step. It confirms once up front (local tracked files are overwritten with `<from>` in the process, and the prompt calls out production targets), forwards `--dry-run` to both halves, and stops before pushing if the pull fails.
- 14874f8: Add `lps pull`, a top-level command that pulls plugins, composer dependencies, ACF, API routes, forms, pages, SEO, and snippets from WordPress in one run instead of calling each resource's `pull` command separately. It's the counterpart of `lps push`. `composer` is pulled before `plugins` so plugin detection sees the fresh `composer.json`, and `--yes` is forwarded only to the resource pulls that prompt before deleting orphaned local files.
- 672395e: Add `lps push`, a top-level command that pushes plugins, composer dependencies, ACF, API routes, forms, pages, SEO, and snippets to WordPress in one run instead of calling each resource's `push` command separately. Production pushes are confirmed once up front rather than once per resource.
- 74cb1ab: Add `lps validate`, an offline check that the local tracked files are push-ready: every resource JSON parses and is an object, snippet sidecars use a known `type` and an integer `id`, API route files are non-empty, `loopress.json` points at a configured project, and `composer.json` is well formed. It contacts nothing, prints one line per problem, exits non-zero when any is found, and supports `--json`. Handy as a pre-commit or CI gate before `lps push`.
- 50fae55: `lps project list` now supports `--json`, like every other `list` command.
- 3bfe6a8: `lps acf list`, `lps form list`, and `lps seo list` now use the same `--json` mechanism as every other command instead of a one-off `-j`/`--json` flag. **Breaking**: the `-j` short flag is removed from these three commands, use `--json` instead.

### Patch Changes

- b2fcf46: Internal refactoring: extract a shared `pullDirectory` helper for the write-then-reconcile-orphans loop duplicated across `acf`/`api`/`form`/`page`/`seo`/`snippet` pull commands, and a shared `guardProductionPush` helper for the production-push confirmation duplicated between `PushCommand` and the top-level `lps push`. No visible behavior change.
- cb993db: Internal refactoring: extract shared helpers for the id-based PUT-then-create-on-404 push dance (`form`, `page`, `seo` redirects, `snippet`), the Listr push-task loop, ENOENT-tolerant directory listing, and count pluralization, previously duplicated across each resource's `push`/`pull` command. No visible behavior change.

## 0.21.0

### Minor Changes

- 182ae2a: `api/` route files can now use a bracketed segment, `[order_id]`, anywhere in their path (e.g. `api/invoice-pdf/[order_id].php`, `api/orders/[order_id]/items/[item_id].php`) to capture a dynamic value into `$request->get_param(...)`, the same convention as Astro/Next.js dynamic routes, without a catch-all segment. The segment name must start with a letter or underscore (it becomes a PHP identifier internally). The generated class name PascalCases each path segment and joins them with `_` (`InvoicePdf_OrderId`, not `InvoicePdfOrderId`), so two differently nested files can never collide on the same class name.

  `lps api push`/`pull`/`list` now support route files nested in subdirectories, needed for the above. **Internal, breaking**: the upload endpoint (`PUT loopress/v1/api-files`) now takes `filename` as a body field instead of a URL path segment (avoids depending on how a given host handles a percent-encoded slash in a URL), so the CLI and the WordPress plugin must be upgraded together, an old CLI against a new plugin (or the reverse) will fail to push.

- c365613: Add `lps dev`, which watches snippets, pages, API routes, and the plugin manifest, pushing each change to the `local` environment automatically. Supports `--only`/`--skip` to limit which resource types are watched.
- 421a1e8: `--json` now works consistently across `snippet`/`page`/`api`/`plugin`/`composer` push/pull/list and `status`: each command returns a structured result (shape documented per command) instead of the interactive progress UI, and errors come through as `{error: {message, name}}` with a non-zero exit code. `snippet list`/`page list`/`api list` previously had their own one-off `--json`/`-j` flag; they now use the same oclif mechanism as everything else. First step towards a `@loopress/mcp` server that wraps `lps` instead of duplicating its logic, see `obsidian/Product/Loopress MCP.md`.

### Patch Changes

- 67a932e: `lps api push` now rejects a file missing `declare(strict_types=1);` (or containing it more than once) before making any network call, mirroring the server's own check instead of failing only after the round-trip.
- 182ae2a: `lps api push`'s server-side PHP syntax check now distinguishes "verified, no error" from "couldn't verify here" (`exec()` disabled, common on managed hosts, or another local condition preventing the check from running), instead of treating both as silent success. The CLI now reports when the check was skipped for the second case instead of staying indistinguishable from a fully verified push.

## 0.20.1

### Patch Changes

- 6091e29: Bug fixes from the QA backlog (5th pass), lot 1:

  - `lps doctor` and `lps project config` now detect Application Passwords being disabled on the target site by reading the `wp-json/` index instead of probing `wp-admin/authorize-application.php`, which sits behind the admin login wall and never reached the check that would report the feature disabled.
  - `lps page push` can now recreate a page whose local id no longer exists on the site (deleted, or pushed to a site where that id never existed): the fallback create no longer sends the stale id, which WordPress core previously rejected with "Cannot create existing post".
  - Server error messages are no longer hidden on a 404: a legitimate applicative 404 from a Loopress controller (e.g. `lps composer pull` on a site with no `composer.lock` pushed yet) now shows the real server message instead of a generic "is the plugin installed?" one, and `lps composer pull` treats that specific case as "no lock yet" and writes `composer.json` alone instead of failing.

## 0.20.0

### Minor Changes

- 886fa43: Add `lps page pull`, `lps page push`, and `lps page list` to sync WordPress pages as files in Git. Talks directly to WordPress core's own REST API (`wp/v2/pages`), no Loopress plugin required. Each page is a pair of files: `<id>-<slug>.html` for the raw Gutenberg block content, a real file you can open and edit directly, and `<id>-<slug>.json` for everything else (title, slug, status, parent, menu_order, template, meta, excerpt...), filtered down to only the fields WordPress actually accepts back on write so readonly/computed noise that changes on every edit regardless of actual content (`_links`, `guid`, `modified`) doesn't produce a diff on every pull. `parent` round-trips as the source site's raw page id and isn't remapped across environments.
- 9bbd03f: `lps project config` now detects when Loopress Full isn't installed on the target site and offers to install it automatically. Since Loopress Full is never distributed on wordpress.org and normally requires a manual zip upload in wp-admin, this closes that gap: after confirming, the CLI downloads the latest release, creates a temporary administrator account (the only way to get plugin-install rights from an application password), drives the wp-admin upload flow headlessly to install and activate the plugin, then removes the temporary account. If the automated install fails for any reason, the temporary account is still cleaned up and the CLI falls back to printing the downloaded zip's local path plus the direct upload URL so the install can be finished by hand.
- 9a0bb9d: Add `lps project rotate` to replace the WordPress application password for the current (or `--env`) environment: it creates a new one, verifies it authenticates on its own, then revokes the old one, never the other way around, so a bad new credential can't lock you out. Every other command now also does this silently in the background once the stored credential is older than 90 days: best-effort, skipped during `--dry-run`, and a failed attempt (site unreachable) just retries on the next run instead of blocking the current command.

## 0.19.0

### Minor Changes

- 7fa0350: Explicit environment targeting and safer destructive operations (CLI backlog lot 3)

  - New `--env <name>` flag on every project-aware command: targets an environment by name for a single run, taking priority over `lps project switch`, with an error listing the available environments when the name does not exist. `lps status --env <name>` previews what would be targeted.
  - New `--yes` (`-y`) flag on commands that ask for confirmation.
  - Production guard: push commands targeting an environment named `production` now ask for confirmation in a terminal, and require `--yes` in non-interactive runs.
  - Pull commands now list local files that would be deleted (because they no longer exist on WordPress) and ask before removing them. `--yes` skips the question; without a TTY the previous behavior (remove and warn) is kept so existing scripts do not break.
  - The CLI never hangs on a prompt in CI: confirmations take their default answer and log it, and commands that require interactive input (`lps init`, `lps project config`) fail immediately with instructions.

- 01300ca: Diagnostics and onboarding (CLI backlog lot 4)

  - New `lps doctor` command: checks that the site is reachable, the Loopress plugin installed, and the credentials valid, each with a corrective action, and shows the plugin version when exposed. Exits non-zero when a check fails, so it can guard a CI deploy.
  - `lps init` now offers to run `lps project config` inline when no project is configured yet, proposes the other feature directories (ACF, SEO, Forms, custom API routes) via an optional multi-select, and ends with a summary of everything configured plus the next useful command.
  - The CLI now warns when a newer version is available (background npm check, at most once a day, never blocking), pointing to the npm update command.

### Patch Changes

- 827af5b: `lps api push` now rejects a route file whose name contains characters outside `[a-z0-9-]` (e.g. uppercase letters, underscores) with a clear "Invalid filename" error before attempting the push. Previously the request reached WordPress, whose REST router matches the filename against the same allowlist and returned a generic 404 that the CLI reported as "Is the required plugin installed and up to date on the site?", a misleading message for what was actually an invalid filename.
- d529f5e: Timeouts and dependency cleanup (CLI backlog lot 1)

  - Calls to the Loopress cloud API now time out after 30s with an actionable error message instead of hanging indefinitely.
  - `lps composer push` waits up to 10 minutes for the server-side `composer install` instead of failing after 30s, shows a wait message, and explains on a real timeout that the install may still be running on the server.
  - Removed unused dependencies: `@oclif/plugin-plugins` and `@oclif/test`.

- adc5b73: Internal refactoring, shared helpers (CLI backlog lot 2). No visible behavior change.

  - One shared orphan-file detection used by the five pull commands (acf, api, form, seo, snippet).
  - One shared directory loader (per-file parse and validation, corrupted files skipped with a warning, missing directory means empty) used by acf push and api push.
  - PushCommand now carries failedCount and the Listr task failure reporting used by the six push commands.
  - Single API_URL definition, shared toSlug() helper, snippet and seo file-format functions moved to utils/.

- 5658d6c: Fix three bugs found during manual QA. Pushing a snippet with a location unsupported by the active provider (WPCode) used to create the snippet anyway with the location silently defaulted, while still reporting failure to the CLI; since the CLI never learned the resulting id, retrying the push (the natural reaction to a reported failure) created another duplicate snippet each time. `WPCodeSnippetProvider` now validates the location before any write, so an invalid location is rejected with nothing created. A pushed `api/` route file with a real PHP parse error was accepted and listed as present by `lps api push`/`list`, while the route silently 404d at request time; `ApiFilesController::push_file()` now runs a real PHP syntax check before writing, rejecting with a clear 400. SEO endpoints (`lps seo`) returned a generic 500 for client-actionable conditions (multiple SEO plugins active, redirects unsupported by the active plugin) instead of the 409/400 used by the equivalent snippets/forms guards; dedicated exceptions now map these correctly, and `get_settings()`/`update_settings()` (which had no error handling at all before this) are covered too.

  Also fixes `lps composer init`'s generated scaffold, which required `composer/installers` without allow-listing it, so Composer 2.2+'s non-interactive plugin-trust gate blocked every real `composer push` through it. Error messages surfaced from a WordPress REST failure now include the server's full detail (e.g. the actual Composer trace) instead of just a generic summary, making failures like this one diagnosable from the CLI's own output.

## 0.18.0

### Minor Changes

- 2b6420c: Adds custom API routes: a versioned `api/` folder (`lps api push`/`pull`/`list` on the CLI) lets a project expose its own WP REST endpoints without hand-writing a plugin, deployed straight to `wp-content/loopress/api/` on Loopress Full and registered under `loopress-api/v1/<filename>`. One file, one class, one method per HTTP verb (`get`/`post`/`put`/`patch`/`delete`), resolved by filename convention (kebab-case -> PascalCase). Defaults to `manage_options` + Application Password auth like every other sync route, with explicit per-file overrides for `permission()` (e.g. an anonymous headless form endpoint) and `headers()` (CORS, including the OPTIONS preflight). Filenames are allowlisted against path traversal, deployed files get an auto-injected `ABSPATH` guard against direct HTTP access, and a bad file (parse error, class collision, throwing `permission()`/`headers()`) is skipped and logged rather than fataling `rest_api_init` or breaking other routes. Full only, like snippet sync: Light stays ACF+SEO only.
- 9383f6e: Adds a WordPress form-sync feature: `lps form list/pull/push` on the CLI, backed by new REST routes under `loopress/v1/forms` on Loopress Full (Light stays ACF+SEO only). The plugin side introduces a generic `FormProvider` abstraction, mirroring the existing snippet sync (Code Snippets/WPCode), with WPForms as the first supported plugin; more WordPress form plugins can be added as additional providers later. Forms are addressed by numeric id (no ACF-style stable key), pulled/pushed as one `<id>-<slug>.json` file per form, with orphan cleanup on pull and the same PUT-then-404-fallback-to-create dance as `lps snippet push`.

## 0.17.0

### Minor Changes

- 31790ce: Add `lps seo pull`, `lps seo push`, and `lps seo list` to sync SEO configuration as JSON files in Git: site-wide Titles & Meta settings (including per-post-type schema defaults), per-post SEO meta, and redirects. Works with either RankMath or Yoast SEO, whichever is active on the site, exactly one must be active, if both are active at once or neither is, every `seo` command fails with a clear error instead of guessing which plugin's data is authoritative. Redirects are only available when RankMath is active: Yoast's equivalent is a Premium-only feature this doesn't support, `seo pull` skips them quietly when unsupported and `seo push` fails clearly per file if you have local redirect files the active plugin can't take.

## 0.16.0

### Minor Changes

- 6f5712c: Add `lps acf pull`/`lps acf push`/`lps acf list`, which sync ACF (Advanced Custom Fields) field groups, post types, taxonomies, and options pages between the WordPress site and local JSON files, the same git-based workflow already available for snippets and Composer dependencies.

  Backed by new `loopress/v1/acf/*` endpoints on the WordPress plugin. Requires ACF to be installed and active; options pages additionally require ACF PRO.

- 6c557ec: Add `lps composer init`, which scaffolds a composer.json wired to WPackagist (repository, `composer/installers`, installer-paths) so WordPress.org plugins and themes can be added and installed through Composer instead of the native plugin API.

  `lps composer pull` now also pulls `composer.json` (previously only `composer.lock`), backed by a new `GET loopress/v1/composer/json` endpoint on the WordPress plugin, so local composer.json stays in sync with packages added or removed through the Loopress admin page.

### Patch Changes

- 9589ec1: From Beta to Alpha to reflect more status of the tool

## 0.15.0

### Minor Changes

- 69b5050: Replaced `lps project sync` with `lps project push` and `lps project pull`, matching the `push`/`pull` naming used by `snippet`, `plugin` and `composer`. `lps project push` creates/links local projects and environments on your Loopress account and pushes credentials (what `sync` did for local-to-remote). `lps project pull` fetches projects and environments already on your account that aren't configured locally yet, now works even when no project is configured locally.

### Patch Changes

- 83a65be: Stopped sending personal data to Sentry when reporting a crash. Command-line argument values (WordPress URLs, application passwords, tokens, emails) are now redacted, only flag names are kept for debugging context. Also disabled `sendDefaultPii` explicitly and set a static `serverName` instead of the machine's real hostname.

## 0.14.0

### Minor Changes

- 42c3956: Use oclif native config system
- 9a8f6b5: `lps plugin` commands now use WordPress core's native `wp/v2/plugins` REST API instead of a custom Loopress endpoint. As a result, plugin version pinning is no longer supported: `lps plugin add` no longer accepts a `[version]` argument, and `loopress.json` always stores `"latest"` for managed plugins. Pin an exact version through the `composer` command group and wpackagist instead.
- b27bd0c: Delay sentry load to improve performances

### Patch Changes

- 13e0495: Move WordPress app-password relay from website to API

## 0.13.0

### Minor Changes

- 6a18588: Add application password creation with open browser
- 01b3005: Add snippet publish command

## 0.12.0

### Minor Changes

- 8a3e52f: Sync projects and snippet files during push/pull

## 0.11.0

### Minor Changes

- 9754a14: Remove snippet provider and put it directl in plugins during init
- 0ab8400: Improve remove UX and synchronization with backend
- 616b2ab: Add `lps project sync` to push locally configured projects, environments and credentials to your Loopress account
- 908875c: Add upsert mechanism on snippet push
- 85b2fcf: Improve ux of project switch with separators

## 0.10.0

### Minor Changes

- Publish schemas on NPM

## 0.9.0

### Minor Changes

- f5bae31: Add list2 to improve UX
- 34a4a22: Setup sentry to monitor the CLI

## 0.8.0

### Minor Changes

- 540c702: Improve structure with fable
- 6122ddc: Align better sidecar file with WPCode api

## 0.7.0

### Minor Changes

- 56cca02: Refine command descriptions. Improve compatibility with WPCode. Add unit tests

## 0.6.0

### Minor Changes

- 18edf51: Add composer command

## 0.5.0

### Minor Changes

- 138acfd: Remove style commands in favor of snippets for custom CSS
- 6aba757: Use sidekick files to store snippets state
- 249b128: Add init command
- 7f4ac7c: CLI can read projectId in loopress.json
- 6aba757: Record deployments in Loopress console

## 0.4.0

### Minor Changes

- 2d33230: Add commands to manage plugins
- 2d33230: Add cli-plugins command as wrapper around oclif plugin plugins
- a3e2a67: Activate plugin after installation

## 0.3.0

### Minor Changes

- Add detection by id for push/pull of snippets

## 0.2.0

### Minor Changes

- 7a3642f: Add full snippet pull with various files

### Patch Changes

- 7b8b35d: Add ascii art of the logo

## 0.1.1

### Patch Changes

- Re-gnerate readme

## 0.1.0

### Minor Changes

- f66babd: Initial release
