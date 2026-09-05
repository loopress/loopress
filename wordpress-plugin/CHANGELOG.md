# @loopress/wordpress-plugin

## 2026.9.0

### Minor Changes

- e505f00: Add single-page app hosting (Loopress Full only). A built SPA bundle uploaded over the REST API lands in `wp-content/loopress/apps/<name>/`: assets are PUT one at a time (per-file size cap, only changed files sent), then one POST `/commit` flips the `loopress_apps` option so the front end serves the new build atomically. The `[loopress_app name="..."]` shortcode enqueues the build's content-hashed entry files and prints the mount point the SPA attaches to. Files from the immediately previous build are kept one generation so an in-flight visitor does not 404 on a lazy chunk. Hash routing only; static assets only (`.php` and other server-executable extensions are rejected). A read-only "Apps" tab in the plugin admin lists what has been deployed.
- d213206: Add Composer-backed plugin/theme installs (Loopress Full only). `POST /loopress/v1/composer/sync` takes `{ intent, lock, force }`, renders a plugin-owned `composer.json` from the intent (libraries + WPackagist plugins/themes), runs Composer against the WPackagist repository, and returns the effective `composer.json`, `composer.lock`, and the list of removed packages. It returns 422 (`unmanaged_plugins_present`) when the intent references a plugin/theme folder installed by hand, unless `force` is set. `LoopressEnvironment` scaffolds and migrates the site `composer.json` with the WPackagist repository, `composer/installers`, and the installer-paths that place plugins/themes under `wp-content/`.

### Patch Changes

- eb79278: Fixed `wp-content/loopress/vendor/` (the site-wide Composer dependencies managed by the Dependencies feature) being fully reachable over HTTP: unlike the plugin's own bundled `vendor/`, it had no `.htaccess` or anti-listing `index.php` at all, exposing `vendor/composer/installed.json` (the full dependency tree and exact versions) to anyone who requested it. It now gets the same deny-all `.htaccess` written on first use. Since `.htaccess` only works where the webserver actually reads it (nginx ignores it outright, and some Apache hosts disable `AllowOverride`), the Composer diagnostics panel now also makes a live HTTP check against that file and surfaces a `vendor_publicly_accessible` warning if it's still reachable.

## 2026.8.1

### Patch Changes

- b48b4b5: `api/` route files no longer need their class name to match a formula derived from the filename (kebab-case filename -> PascalCase class): the class is now discovered by reading the file itself (PHP's own tokenizer, never executed to find out), so it can be named anything. **Internal, breaking**: this replaces the old naming convention entirely, no transition period.

  `lps api push` now also rejects a file immediately (before anything is written) if it declares zero or more than one class, or if its class name collides with WordPress core, another active plugin, or another `api/` file already on the site, instead of only failing silently at the next site boot. A file that still fails to load at boot (a stale collision from a plugin activated later, for instance) now shows a warning in the plugin's **API Routes** admin tab, with the actual reason, clearing itself automatically once the file loads clean again.

- 8e43b47: Admin page styles are now enqueued (`wp_add_inline_style`) instead of echoed as raw `<style>` tags, and the Loopress top-level menu item moved from position 6 to 100 so it stops competing with WordPress core's own menu hierarchy. Both were flagged by the wordpress.org plugin review.

## 2026.8.0

### Minor Changes

- 182ae2a: `api/` route files: the anti-listing `index.php` is now recreated on every boot if missing, not only when `lps api push` happens to write a file, so a Git-based deploy that never goes through `lps api push` still gets it. Also logs (without blocking the route) when a file is missing its ABSPATH guard, which is expected for any file deployed outside `lps api push` since the guard is only ever injected at push time and stripped again on pull.
- 182ae2a: `api/` route files can now use a bracketed segment, `[order_id]`, anywhere in their path (e.g. `api/invoice-pdf/[order_id].php`, `api/orders/[order_id]/items/[item_id].php`) to capture a dynamic value into `$request->get_param(...)`, the same convention as Astro/Next.js dynamic routes, without a catch-all segment. The segment name must start with a letter or underscore (it becomes a PHP identifier internally). The generated class name PascalCases each path segment and joins them with `_` (`InvoicePdf_OrderId`, not `InvoicePdfOrderId`), so two differently nested files can never collide on the same class name.

  `lps api push`/`pull`/`list` now support route files nested in subdirectories, needed for the above. **Internal, breaking**: the upload endpoint (`PUT loopress/v1/api-files`) now takes `filename` as a body field instead of a URL path segment (avoids depending on how a given host handles a percent-encoded slash in a URL), so the CLI and the WordPress plugin must be upgraded together, an old CLI against a new plugin (or the reverse) will fail to push.

- 182ae2a: New `wp-content/loopress/lib/` directory, autoloaded under the `LoopressLib\` namespace (via the same Composer setup as `wp-content/loopress/vendor/`), for code shared between `api/` route files, permission checks and formatters reused across several files, without turning that shared code into a route itself. Existing sites get the new autoload entry migrated into `composer.json` automatically, with a `dump-autoload` to make it take effect immediately rather than only on the next unrelated Composer operation.
- 182ae2a: `api/` route files can now declare `#[Permission]` on a verb method or on the class, for per-verb authorization (a public `get()` next to an admin-only `post()`, for example) instead of one `permission()` covering every verb. Resolution order: attribute on the verb, attribute on the class, the file's `permission()` method, the closed `manage_options` default. `#[Permission(callback: ...)]` can point to a shared static method, reusable across several route files, with the same fail-closed behavior on a throw as `permission()`. Combining more than one of `public`, `capability`, or `callback` on the same attribute is rejected (the route fails to register, logged, rather than silently picking one).
- 67a932e: `api/` route files: `permission()` is now called directly by WordPress as the route's `permission_callback` (`permission(WP_REST_Request $request): bool`), instead of being called at registration to produce a callable. **Breaking**: the old `permission(): callable { return fn(): bool => ...; }` form no longer works, update any custom route that overrides `permission()`. A throw inside `permission()` now fails closed (denies that request) instead of skipping the whole route file at boot.

  Also logs when an `api/` file has no public HTTP verb method (`get`/`post`/`put`/`patch`/`delete`), previously silent and indistinguishable from a route that intentionally has none yet.

- 182ae2a: `lps api push`'s server-side PHP syntax check now distinguishes "verified, no error" from "couldn't verify here" (`exec()` disabled, common on managed hosts, or another local condition preventing the check from running), instead of treating both as silent success. The CLI now reports when the check was skipped for the second case instead of staying indistinguishable from a fully verified push.

## 2026.7.16

### Patch Changes

- af9c109: Bug fixes from the QA backlog (5th pass), lot 1:

  - SEO sync (`YoastService`/`RankMathService`) no longer writes arbitrary metadata keys from the request body: the write loop is now bounded to the provider's own prefix, symmetrically with the delete loop right below it. Not exploitable beyond the existing `manage_options` trust boundary, but closes a defense-in-depth gap where a bug elsewhere, or a future feature reusing this endpoint, could silently overwrite metadata belonging to another plugin (ACF, FluentCRM, etc.) on a published post or page.
  - `uninstall.php` no longer fatals when `vendor/` is missing (a dev checkout symlinked into `wp-content/plugins/` without `composer install`). The cleanup was already best-effort, it's now skipped gracefully instead of fataling.
  - Corrected an outdated claim that ACF options pages require ACF PRO, in both a code comment and the error message shown when an object type isn't registered. Confirmed working with Secure Custom Fields (the free fork recommended by WordPress.org) during the 5th QA pass; the error message now points at the real fix (`acf_add_options_page()`) instead of a PRO requirement.

## 2026.7.15

### Patch Changes

- 6dac6c3: Fixed a fatal error on every Loopress Light install (`Class "DI\ContainerBuilder" not found`): the Light build shipped an empty Composer `require`, but shared code (`ContainerFactory`, `WpHttpClient`) depends on `php-di/php-di`, `nyholm/psr7`, and `psr/http-client`. The Light build now keeps those, and only excludes the genuinely Full-only packages (`composer/composer`, `sentry/sentry`).
- 6dac6c3: `LOOPRESS_VERSION` is now read from the plugin's own `Version:` header via `get_file_data()` instead of a hardcoded literal, removing a second copy that `scripts/sync-version.js` had to keep in sync and could drift from the header.

## 2026.7.14

### Patch Changes

- dd36268: `LOOPRESS_VERSION` is now read from the plugin's own `Version:` header via `get_file_data()` instead of a hardcoded literal, removing a second copy that `scripts/sync-version.js` had to keep in sync and could drift from the header.

## 2026.7.13

### Patch Changes

- fae069f: Fixed errors reported by the WordPress Plugin Check tool: escaped the exception message in `WpHttpClient::sendRequest()`, and bumped the readme's "Requires at least" header to 6.2 so the RankMath redirects queries can keep using the `%i` prepare placeholder.

## 2026.7.12

### Patch Changes

- 7e28650: `api/` route files can now `use` packages installed via the Composer feature (`wp-content/loopress/vendor/`) directly, without a manual `require_once` of the autoloader. Previously this only happened to work by coincidence, as a side effect of the unrelated Dependencies feature loading it first for its own diagnostics; `RouteLoader` now loads it explicitly and independently, and a broken user autoloader is caught and logged instead of breaking every `api/` route.
- 827af5b: The REST namespace `api/` route files register under (`loopress-api/v1` by default, e.g. `hello.php` becomes `loopress-api/v1/hello`) is now configurable from the plugin's Settings tab instead of hardcoded. Existing sites keep the same default namespace and routes; only sites that explicitly set a custom value change behavior.
- 5658d6c: Fix three bugs found during manual QA. Pushing a snippet with a location unsupported by the active provider (WPCode) used to create the snippet anyway with the location silently defaulted, while still reporting failure to the CLI; since the CLI never learned the resulting id, retrying the push (the natural reaction to a reported failure) created another duplicate snippet each time. `WPCodeSnippetProvider` now validates the location before any write, so an invalid location is rejected with nothing created. A pushed `api/` route file with a real PHP parse error was accepted and listed as present by `lps api push`/`list`, while the route silently 404d at request time; `ApiFilesController::push_file()` now runs a real PHP syntax check before writing, rejecting with a clear 400. SEO endpoints (`lps seo`) returned a generic 500 for client-actionable conditions (multiple SEO plugins active, redirects unsupported by the active plugin) instead of the 409/400 used by the equivalent snippets/forms guards; dedicated exceptions now map these correctly, and `get_settings()`/`update_settings()` (which had no error handling at all before this) are covered too.

  Also fixes `lps composer init`'s generated scaffold, which required `composer/installers` without allow-listing it, so Composer 2.2+'s non-interactive plugin-trust gate blocked every real `composer push` through it. Error messages surfaced from a WordPress REST failure now include the server's full detail (e.g. the actual Composer trace) instead of just a generic summary, making failures like this one diagnosable from the CLI's own output.

## 2026.7.11

### Patch Changes

- 2b6420c: Adds custom API routes: a versioned `api/` folder (`lps api push`/`pull`/`list` on the CLI) lets a project expose its own WP REST endpoints without hand-writing a plugin, deployed straight to `wp-content/loopress/api/` on Loopress Full and registered under `loopress-api/v1/<filename>`. One file, one class, one method per HTTP verb (`get`/`post`/`put`/`patch`/`delete`), resolved by filename convention (kebab-case -> PascalCase). Defaults to `manage_options` + Application Password auth like every other sync route, with explicit per-file overrides for `permission()` (e.g. an anonymous headless form endpoint) and `headers()` (CORS, including the OPTIONS preflight). Filenames are allowlisted against path traversal, deployed files get an auto-injected `ABSPATH` guard against direct HTTP access, and a bad file (parse error, class collision, throwing `permission()`/`headers()`) is skipped and logged rather than fataling `rest_api_init` or breaking other routes. Full only, like snippet sync: Light stays ACF+SEO only.
- 063616e: Loopress Full's Sentry error reporting is now opt-in. Until an admin decides either way, a banner ("Send crash reports to Loopress?") shows on every tab of the admin page with Allow/Deny buttons; once decided, a switch in the new Settings tab reflects and lets you change the choice. The Sentry PHP SDK's global handlers don't install at all until consent is given. Backed by `GET`/`PUT loopress/v1/sentry/consent`, storing the choice in a WordPress option. A new "Reset all settings to default" button (`DELETE loopress/v1/settings`, global to all Loopress settings, not just Sentry) clears it and brings the banner back. Existing installs upgrading into this send nothing until an admin opts in.
- 063616e: Loopress Full now initializes the Sentry PHP SDK on boot, reporting PHP errors and exceptions from the plugin's own code so they can be triaged across every install. Filtered via a `before_send` callback that only keeps events whose stack trace passes through this plugin's own files, so a site's Sentry project never fills up with errors from its theme or other plugins. Loopress Light doesn't have this: `src/Sentry/` is stripped at build time like the other Full-only features. Currently a scaffold pending the real Sentry project DSN, an unset DSN is a documented no-op for the SDK, so this ships inert until then.
- f542f91: Code snippet sync (Code Snippets, WPCode) moved from Loopress Light to Loopress Full, alongside Composer dependency management. wordpress.org's final decision on the appeal rejected Loopress Light's snippet sync REST endpoints as a remote arbitrary-code-deployment mechanism, regardless of the authentication and capability checks in front of them. Loopress Light now syncs only ACF field groups and SEO settings (Yoast, RankMath); `lps snippet pull`/`push` and the snippet migration UI require Loopress Full. REST routes are unchanged (`loopress/v1/snippets*`), so existing CLI versions keep working against Loopress Full.
- 9383f6e: Adds a WordPress form-sync feature: `lps form list/pull/push` on the CLI, backed by new REST routes under `loopress/v1/forms` on Loopress Full (Light stays ACF+SEO only). The plugin side introduces a generic `FormProvider` abstraction, mirroring the existing snippet sync (Code Snippets/WPCode), with WPForms as the first supported plugin; more WordPress form plugins can be added as additional providers later. Forms are addressed by numeric id (no ACF-style stable key), pulled/pushed as one `<id>-<slug>.json` file per form, with orphan cleanup on pull and the same PUT-then-404-fallback-to-create dance as `lps snippet push`.

## 2026.7.10

### Patch Changes

- 512e72b: Loopress Full now checks GitHub for newer releases and shows an admin notice ("Loopress Full X is available, you are running Y") with a link to the release when one exists. Read-only for now: no download or install, you still update manually via loopress.dev, same as before. Backed by a new `GET loopress/v1/update` endpoint. Loopress Light doesn't have this: WordPress.org reserves update-checking for its own review-and-update flow, so it stays out of that edition.
- 512e72b: Remove wp-admin's default left padding on the Loopress admin page only (scoped to that page, every other wp-admin screen is unaffected), so the plugin's own page layout controls its own spacing instead of being padded twice.

## 2026.7.9

### Patch Changes

- 6f5712c: Add `lps acf pull`/`lps acf push`/`lps acf list`, which sync ACF (Advanced Custom Fields) field groups, post types, taxonomies, and options pages between the WordPress site and local JSON files, the same git-based workflow already available for snippets and Composer dependencies.

  Backed by new `loopress/v1/acf/*` endpoints on the WordPress plugin. Requires ACF to be installed and active; options pages additionally require ACF PRO.

- 6c557ec: Add `lps composer init`, which scaffolds a composer.json wired to WPackagist (repository, `composer/installers`, installer-paths) so WordPress.org plugins and themes can be added and installed through Composer instead of the native plugin API.

  `lps composer pull` now also pulls `composer.json` (previously only `composer.lock`), backed by a new `GET loopress/v1/composer/json` endpoint on the WordPress plugin, so local composer.json stays in sync with packages added or removed through the Loopress admin page.

## 2026.7.8

### Patch Changes

- 3296877: Loopress Light now links to the full documentation (https://docs.loopress.dev/wordpress-plugin/) instead of the bare loopress.dev when mentioning Loopress Full, in both the readme (description and FAQ) and a new note on the plugin's own settings page, and states explicitly that Loopress Full is free. Also fixed ambiguous wording that read as "not distributed from loopress.dev" when the opposite is true.

## 2026.7.7

### Patch Changes

- 3acd857: Fixed a WordPress Plugin Check text domain mismatch on both editions: the source carried `loopress`, a leftover text domain from before the light/full split that matches neither edition's real slug. `scripts/build-flavor.cjs` now rewrites the `Text Domain` header and translation calls to `loopress-light` / `loopress-full` per edition at build time. Also realigned both `readme.txt` changelogs with `CHANGELOG.md`, the source of truth: they had drifted with fabricated `2026.8.0` and `2026.6.0` entries that don't exist in the real release history.

## 2026.7.6

### Patch Changes

- 31a82f6: The WordPress plugin now builds two editions from the same codebase: Loopress Light (`loopress-light.zip`, wordpress.org) keeps snippet synchronization (Code Snippets / WPCode); Loopress Full (`loopress-full.zip`, loopress.dev only) adds Composer dependency management (install, remove, audit, diagnostics, CLI sync) on top. Loopress Light contains no Composer code, even inactive; Loopress Full fully replaces Loopress Light on activation, both editions never run side by side. REST routes are unchanged (`loopress/v1/snippets*` and `loopress/v1/composer*`, the latter only present in Loopress Full), so existing CLI versions keep working.

## 2026.7.5

### Patch Changes

- 887b59f: Fixed all errors reported by the WordPress Plugin Check tool: escaped dynamic exception messages across the Composer and snippet provider services, added the missing `ABSPATH` direct-access guard in `loopress.php`, removed the tracked `assets/.gitkeep` hidden file (the `prebuild` script now creates the directory itself), and bumped the readme's "Tested up to" header to 7.0.

## 2026.7.4

### Patch Changes

- a85959e: Fix two bugs in the Code Snippets provider: `deleteSnippet()` was missing the leading slash required by `WP_REST_Server::dispatch()`, so `DELETE /wp-json/loopress/v1/snippets/{id}` always failed with "Snippet not found" instead of deleting anything. Separately, `getSnippets()`/`getSnippet()` returned trashed snippets indistinguishably from active ones (Code Snippets' own REST API doesn't filter them out), causing `lps snippet pull` to re-import a snippet the user had just deleted from wp-admin.

## 2026.7.3

### Patch Changes

- 9a8f6b5: Removed `PluginService`, `PluginController`, and the `loopress/v1/plugins*` REST routes. Plugin management now relies entirely on WordPress core's native `wp/v2/plugins` REST API, which the Loopress CLI calls directly.

## 2026.7.2

### Patch Changes

- 3f04ab4: Replace md5 hash function by native hash function with sha256
- 13c5fb9: Add tab on the UI and diagnostics panel
- 1dc1228: Unify snippet route

## 2026.7.1

### Patch Changes

- 6122ddc: Align better sidecar file with WPCode api

## 2026.7.0

### Minor Changes

- 25ece79: 1st release of the plugin containing basic UI fordependencies installation. It also contains endpoints to let the CLI interact with Wordpress
