# @loopress/wordpress-plugin

## 2026.12.0

### Minor Changes

- d043549: A nested `api/orders/index.php` is now the `/orders` route instead of being silently ignored after a successful push. A root `api/index.php` is refused at push time (it's the directory's anti-listing guard, and `/` is the namespace discovery index), and two files resolving to the same route (`orders.php` and `orders/index.php`) are refused at push, or skipped and reported by `lps api list` when deployed another way. Pushing a published `pages/home.html` now makes it the site's front page (Settings > Reading), replacing the previous one; switching it back to draft reverts the site to its latest posts.

### Patch Changes

- bb32133: Serializes every write to `wp-content/loopress/api/` and `hooks/` (batch pushes, single-file pushes, deletions) behind a per-directory lock. Two overlapping `lps api push`/`lps hook push` runs shared one staging directory: the second could end up committing a staging directory holding only its own files, deleting every other route or hook from the site. A second push now waits for the first and starts from its result. If the lock itself can't be taken (for example `wp-content/loopress/` not writable), the request now fails with a JSON 500 carrying the reason instead of a PHP fatal error.

## 2026.11.0

### Minor Changes

- b60df46: Adds static pages (Loopress Full only): a `loopress/v1/pages` endpoint that creates or updates a WordPress page from hand-written HTML, stored in a hidden post meta and rendered inside the active theme through `the_content` (no `wpautop`). Pages managed this way get a "Managed by Loopress" badge and can no longer be edited in wp-admin; trashing stays possible. A push is refused, with nothing written, on a page Loopress didn't create, a trashed page, a slug WordPress would rename, or HTML over the `loopress_max_file_bytes` / `loopress_max_files_total_bytes` limits.

### Patch Changes

- b60df46: Adds `#[Hidden]`, a class-level attribute for route files: every verb in the file is excluded from the `/wp-json/{namespace}` discovery index (`show_in_index => false`, WP core's own flag) while the route keeps dispatching normally. Useful for a route whose response shape isn't a fixed REST resource, a GraphQL endpoint or an HTML-serving page.

## 2026.10.1

### Patch Changes

- 71e7243: Wraps route verb callbacks (`get()`, `post()`, etc.) in a try/catch so an uncaught exception returns a clean 500 response instead of fataling the request. WP core's own dispatch (`WP_REST_Server::respond_to_request()`) has no try/catch around the route callback, unlike `permission_callback` and `headers()`, which `RouteLoader` already wrapped for the same reason.

## 2026.10.0

### Minor Changes

- c15b4b9: Makes `api push` and `hook push` atomic (#236). Previously, `pushFile()` sent one independent HTTP PUT per file: a push of N files that failed partway through (network error, a stale `expectedRevision`, a class collision, a syntax error on file K) left files `1..K-1` already live on the site and `K..N` untouched, a mixed state discoverable only after the fact via `lps diff`.
  
  `AbstractFilesDirectory` gains a batch staging API (`beginBatch`/`stageWrite`/`stageDelete`/`commitBatch`/`abortBatch`): a batch stages into an inactive sibling directory seeded with a copy of every currently live file, and `commitBatch()` swaps it into place with a directory `rename()`, atomic on the filesystems WordPress actually runs on. `AbstractFilesController` gains a `POST {routePath}/batch` endpoint that validates and stages every file (and every `--prune`d filename) of one push, and only calls `commitBatch()` once every single one has succeeded; any failure aborts the batch and leaves the live directory completely untouched.
  
  `api push`/`hook push` now send one batch request instead of N sequential PUTs, folding `--prune` into the same atomic swap rather than a separate round of DELETEs after the fact. The single-file `PUT`/`DELETE` endpoints are unchanged, still used by `lps <resource> rm` and any direct API integration.
- 9b3647d: Loopress Full now updates through WordPress's native Plugins page flow (the "update available" notice, "Update now" link, and bulk updater), instead of requiring a manual re-upload of `loopress-full.zip`. WordPress fetches the zip directly from the matching GitHub release, using the same GitHub lookup the update-available notice already relied on.
- 1607fc5: Adds a `menu` resource for syncing WordPress navigation menus and menu locations. The plugin exposes `loopress/v1/menus` and `loopress/v1/menu-locations` REST endpoints, resolving menu items by identity (post type/taxonomy + slug) rather than raw object ids so they remain portable between environments. The CLI gains `lps menu list/pull/push/diff`, wired into `lps push`/`lps pull`/`lps diff`/`lps init` and local file validation, and the MCP server gains matching `menu_push`/`menu_pull`/`menu_list` tools.

### Patch Changes

- 6f5bc6b: Extends #234's conditional write to the `acf` resource: `lps acf push` now closes the WordPress-side race a write can still land in for field groups, post types, taxonomies, and options pages, the same way it was already closed for `option` in #235.
  
  `GET /acf/{type}/{key}` now returns a `revision` (a content hash of the exported object, excluding fields ACF itself computes such as `modified`). `acf push` reads it right before writing each object, and sends it back as `expectedRevision`; `POST /acf/{type}` refuses the write (412) if the object's revision no longer matches, instead of silently overwriting whatever changed it in between. This is optimistic concurrency control within a single request, not a database-level atomic compare-and-swap: it shrinks the window down to this one request's own execution time, not to zero. The remaining 7 resource-state-backed resources (snippet, form, api, hook, seo, menu, theme-styles) aren't covered yet, tracked in #234 as the remaining rollout.
- d2be612: Extends #234's conditional-write pattern (introduced for `option` in #235) to the two file-based resources, `api` and `hook`, which share the same `AbstractFilesController`/`AbstractFilesDirectory` base classes.
  
  `GET /api-files` and `GET /hook-files` now return a `revision` (a content hash) per file, and `PUT` returns one too on a successful push. `api push` and `hook push` compute each file's expected revision from the remote listing already read for the push's own rollback snapshot, no extra network round trip, and send it back as `expectedRevision`; the server refuses the write (412) if the file's revision no longer matches, instead of silently overwriting whatever changed it in between. A file with no remote counterpart yet (a first push) has nothing to condition on, so it falls back to today's unconditional create. This is optimistic concurrency control within a single request, not a database-level atomic compare-and-swap: it shrinks the window down to this one request's own execution time, not to zero.
  
  The remaining 6 resource-state-backed resources (snippet, form, acf, seo, menu, theme-styles) aren't covered yet, tracked in #234 as the remaining rollout.
- e4f4b0d: Fixes a fatal error in `lps snippet list`/`pull`/`push` whenever the Code Snippets plugin is active. `CodeSnippetsSnippetProvider` called `Snippet::is_trashed()`, a method the current WPackagist release of Code Snippets (3.10.2) no longer has: trash state is exposed as the `trashed` property on `Code_Snippets\Model\Snippet` instead. Both call sites (`isTrashed()` and `trashedIds()`) now read the property, and the static-analysis stub is updated to match the real class.
- 9bd5f61: Extends #234's conditional write to `form`: `lps form push` now closes the same WordPress-side race that `option push` already closed.
  
  `GET /forms/{id}` (and the create/update responses) now return a `revision` (a content hash of the form's canonical state as reported by whichever form plugin is currently active, minus its `id` and its own save-bookkeeping fields). `form push` reads it right before writing each existing form, and sends it back as `expectedRevision`; `PUT /forms/{id}` refuses the write (412) if the form's revision no longer matches, instead of silently overwriting whatever changed it in between. A form with no local id yet (a first push) has nothing to condition on, so it falls back to today's unconditional create, same as `option push`. This is optimistic concurrency control within a single request, not a database-level atomic compare-and-swap: it shrinks the window down to this one request's own execution time, not to zero. The remaining resource-state-backed resources (snippet, acf, api, hook, seo, menu, theme-styles) aren't covered yet, tracked in #234 as the remaining rollout.
- 1d05edd: Continues #234's rollout: `lps menu push` now closes the same WordPress-side race that `option push` closed in #235, this time for the `menu` resource.
  
  `GET /menus/{slug}` (and the upsert response) now return a `revision` (a content hash of the menu's `name` and `items`). `menu push` reads it right before pushing each menu, and sends it back as `expectedRevision`; `POST /menus` refuses the write (412) if the menu's revision no longer matches, instead of silently overwriting whatever changed it in between. This is optimistic concurrency control within a single request, not a database-level atomic compare-and-swap: it shrinks the window down to this one request's own execution time, not to zero. A menu that doesn't exist remotely yet has nothing to condition on, so a first push is unchanged. The other 7 resource-state-backed resources (snippet, form, acf, api, hook, seo, theme-styles) aren't covered yet, tracked in #234 as the remaining rollout.
- bc2359c: Proof of concept for #234: `lps option push` now closes the WordPress-side race a write can still land in, on the one resource this lands on first (`option`).
  
  `GET /options/{name}` now returns a `revision` (a content hash of the value). `option push` reads it right before writing each option, and sends it back as `expectedRevision`; `PUT /options/{name}` refuses the write (412) if the option's revision no longer matches, instead of silently overwriting whatever changed it in between. This is optimistic concurrency control within a single request, not a database-level atomic compare-and-swap: it shrinks the window down to this one request's own execution time, not to zero. The other 8 resource-state-backed resources (snippet, form, acf, api, hook, seo, menu, theme-styles) aren't covered yet, tracked in #234 as the remaining rollout.
- 2e05f74: Closes the same race for `seo` that PR #235 closed for `option` (#234): `lps seo push` now conditions its writes on the active SEO plugin's (RankMath or Yoast) state at read time, instead of silently overwriting a change a different actor made on WordPress in between.
  
  `GET /seo/settings` now returns `{revision, settings}` (a content hash of the settings, wrapped so the hash never gets written back into wp_options as if it were a real Titles & Meta field), and `GET /seo/post-meta/{type}/{slug}` now includes a `revision` alongside `meta`, `slug`, and `title` (a content hash of that post's provider-prefixed SEO meta as a whole, since a write replaces the whole set, not just the keys a particular push happens to mention). `seo push` reads the relevant revision right before writing each settings file or post-meta file, and sends it back as `expectedRevision`; `PUT /seo/settings` and `POST /seo/post-meta/{type}` refuse the write (412) if the revision no longer matches, the same optimistic-concurrency check `option` uses. The revision is bookkeeping, never persisted to local files: `settings.json` and post-meta files on disk are unchanged in shape.
  
  The remaining resources tracked in #234 (snippet, form, acf, api, hook, menu, theme-styles) aren't covered yet.
- f1e8e61: Closes the WordPress-side race `lps snippet push` could still land in (#234), extending the conditional write introduced for `option` to the `snippet` resource.
  
  `GET /snippets/{id}` (and the `create`/`update` responses) now return a `revision`, a content hash of every field an update can change (code, active state, location, priority, and the rest). `snippet push` reads it right before writing each already-known snippet, and sends it back as `expectedRevision`; `PUT /snippets/{id}` refuses the write (412) if the snippet's revision no longer matches, instead of silently overwriting whatever changed it in between. A first push (no known remote id yet) is unaffected, it still falls through to a plain create. This is optimistic concurrency control within a single request, not a database-level atomic compare-and-swap. The remaining resource-state-backed resources (form, acf, api, hook, seo, menu, theme-styles) aren't covered yet, tracked in #234.
- e4f4b0d: Fixes the stale-revision (412) error message showing literal `&quot;` instead of quotes in the CLI's terminal output. The message is only ever thrown into a REST JSON body and then read as `lps` stderr, never rendered as HTML, so it should not have been run through `esc_html()`. Affects options, snippets, forms, ACF objects, menus, and SEO post meta/settings.

## 2026.9.2

### Patch Changes

- 406eae1: Security: `POST /loopress/v1/composer/sync` no longer installs from a client-supplied `composer.lock`.
  
  The endpoint used to write the uploaded `lock` to disk verbatim and run `composer install`, which replayed it as-is: a crafted lock could point `dist.url` / `source.url` at attacker-controlled hosts (server-side request forgery) and regenerate `vendor/composer/autoload_files.php` from those archives, which the plugin then loads on every request (remote code execution). The lock is now advisory only. Composer always runs `update` and resolves the plugin-rendered `composer.json` against its own Packagist and WPackagist repositories; the uploaded lock is only parsed afterwards to report which resolved versions moved (`lockDrift` in the sync response).
  
  Also: every Composer invocation now passes `--no-scripts`, and the `lock` sync argument is capped at 5 MB.
- b28d36c: Security: bound the size of `api/` and `hooks/` files so one file can no longer take down `/wp-json/`.
  
  `AbstractFileLoader` tokenises (`token_get_all()`), then `require`s, every file in the directory on every request. With no size limit, a large enough file (or a large enough pile of them) exhausted memory, an uncatchable `E_ERROR` that 500s every REST route on the site, and the same blob would 500 the push that wrote it (LP-SEC-02 / F19 / F20).
  
  Now:
  
  - `PUT /api-files` and `/hook-files` reject a `content` over 512 KB with `413`, before anything tokenises it.
  - The loader skips any on-disk file over 512 KB (recorded in the load-errors option, surfaced in the admin tab), so a file planted outside the CLI breaks only itself.
  - The loader also stops once the directory as a whole passes an 8 MB budget, a last-resort guard against a runaway directory.
  - Both limits are filterable: `loopress_max_file_bytes` and `loopress_max_files_total_bytes` (each passed the subdir, `'api'` or `'hooks'`).
  - `list_files` returns `{filename, error}` without `content` for an over-limit file instead of reading it back.
  - `FileWriter::withGuard()` fails cleanly if the guard-placement regex bails on its backtrack limit, rather than misplacing the guard.
- d198555: Security: add `DELETE /loopress/v1/api-files` and `/hook-files` so a deployed route or hook can be removed through the product.
  
  Route and hook files live under `wp-content/`, outside the plugin directory, so deactivating the plugin never removed them. Before this, a file pushed by a leaked application password could only be cleared over SSH/SFTP (F3). `DELETE` takes `filename` in the query string, validated by the same rules as `PUT` (including the hooks-only "last segment must not be `index`"), returns `404` when the file is absent and `200 {"filename", "deleted": true}` otherwise, and clears any stale boot-time load-error entry for the removed slug.
  
  `uninstall.php` (Full edition) already removed the entire `wp-content/loopress/` tree; a comment now spells out that this is deliberate (api, hooks, vendor, apps, everything), so nothing Loopress wrote survives an uninstall.
- 69bdc0c: Security: surface which custom API routes run with no authentication (F1).
  
  `#[Permission(public: true)]` on a route's class or a verb method makes that code callable by anyone, with no login. There was no signal for it anywhere. Now the `GET /api-files` list and the `PUT /api-files` push response carry `public: true` for such a route (detected lexically by a new `PermissionScanner`, the file is never executed), and the plugin's **API Routes** admin tab shows a red **Public** badge on the row.
  
  Hooks are unaffected: they have no permission concept, so `HookFilesController` does not add the flag.
  
  Detection has two documented blind spots it does not flag: an aliased import of the attribute, and a `permission()` method that returns `true`.
- de7f283: Security: guard the generic `/loopress/v1/options/{name}` resource so a deployment token is not "read every secret / rewrite site behaviour over HTTP" (F10, F11).
  
  - `GET /options/{name}` now returns `403` for a name that looks like a stored secret (matches `secret`, `password`, `_pass`, `token`, `_key`, `_api_key`, `apikey`, `^auth_`, `nonce`, `salt`, `private_key`, `credential`). This is a best-effort denylist; the real control for a specific site is the new `loopress_option_readable` filter, or tracking only the options it needs.
  - `PUT` / `DELETE /options/{name}` now return `403` for a curated set of behaviour-changing core options (`default_role`, `users_can_register`, `siteurl`, `home`, `cron`, `uninstall_plugins`, `mailserver_*`, `db_version`, `initial_db_version`) and for any `loopress_*` option (owned by the plugin's own settings). Re-allow a specific name with the new `loopress_option_writable` filter.
  - New `ProtectedOptionException` (403), distinct from `ReservedOptionNameException` (409, still used only for the 3 names owned by the `plugin`/`theme` resources).
  
  A server-enforced allowlist ("only options declared in loopress.json are readable/writable") is the stronger fix and is tracked separately: it needs the tracked list synced to the server.
- b43b2c7: Security: the SEO, Forms and ACF sync resources no longer write unvalidated request bodies straight into storage other plugins render (F12, F13).
  
  - New `SyncSanitizer::stripActiveContent()` neutralises script/style blocks, inline event handlers and `javascript:`/`data:text-html` URLs in a string, leaving benign HTML and text byte-for-byte so a pull/edit/push round trip stays stable. Applied recursively to `PUT /seo/settings`, `POST /seo/post-meta`, and every string in an `/acf` import object, all of which are rendered into the public `<head>` or the block editor.
  - `POST` / `PUT /forms` no longer overwrites a form's `settings.notifications` / `settings.confirmations` unless the body carries `"allowNotifications": true`. When allowed, recipient addresses are validated with `is_email` and `sender_address` must be on the site's own domain, and message bodies are stripped of active content. New `FormNotificationException` (422). This closes the confirmed notification-hijack: repointing every submission to an attacker inbox with a spoofed sender.
  - `POST` / `PUT /seo/redirects` rejects a `urlTo` that points off this site unless the body carries `"allowExternal": true`, and constrains `status` to `active` / `inactive`. New `InvalidRedirectException` (422).

## 2026.9.1

### Patch Changes

- 755b390: Added `hooks/`, a new resource for declaring WordPress actions, filters, and scheduled (cron) tasks as plain PHP files, deployed with `lps hook push`/`pull`/`list` (and `lps push`/`pull`/`diff`, `hook_push`/`hook_pull`/`hook_list` MCP tools). One file, one class, public methods attributed with `#[Action(hook, priority, acceptedArgs)]`, `#[Filter(hook, priority, acceptedArgs)]`, or `#[Cron(recurrence, hook?)]` bind straight to `add_action()`/`add_filter()`/WP-Cron (a `#[Cron]` job is just an action bound to a schedule instead of an existing WordPress event). Unlike a REST route, a bound hook runs unconditionally for every visitor with no permission check of its own, so every callback is wrapped to catch and log rather than propagate; a filter additionally fails open, returning the original value on a throw. Loopress Full only, same as custom API routes.
- f0fe762: Added `options/`, a new resource for tracking individual WordPress options (`wp_options` rows) directly, agnostic of which plugin owns them: no adapter to write, unlike `seo/` which has to know Yoast's vs RankMath's option names and shape. `lps option list` shows every option name and autoload flag on the site (never values, so browsing stays cheap and never leaks a value by accident), `lps option add <name>` starts tracking one as a local file, and `lps option pull`/`push`/`diff`/`remove` work the tracked set from there (`push` is upsert-only, it never deletes an untracked option). Two safety rails: `active_plugins`/`template`/`stylesheet` are refused outright (already owned by the `plugin`/`theme` resources), and environment-owned or WordPress-generated options (`siteurl`, `home`, `db_version`, `cron`, `rewrite_rules`, `WPLANG`) default to `"readonly": true` in their local file, tracked and diffable but skipped by `push` unless explicitly overridden. Mirrored as `option_push`/`option_pull`/`option_list`/`option_add`/`option_remove` MCP tools.
- 55b5d6d: Removed the snippet provider migration feature: the **Snippets** admin tab and the `GET`/`POST /loopress/v1/snippets/migration/{direction}` REST routes are gone. Code Snippets and WPCode each ship their own import/export, so moving snippets between them no longer needs a Loopress screen. Snippet sync (`lps snippet pull/push/list` and the `/loopress/v1/snippets` routes) is unchanged.
- 1da6d44: Internal refactor: deduplicated REST error-response handling (`AcfController`, part of `ComposerController`), the filesystem bootstrap snippets shared by `ApiDirectory`/`AppsDirectory`/`LoopressEnvironment`, `composer.lock`/JSON-output parsing in `ComposerService`, and the "exactly one active provider" arbitration duplicated identically across the SEO/Snippets/Forms services. No behavior change.

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
