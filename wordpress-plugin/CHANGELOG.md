# @loopress/wordpress-plugin

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
