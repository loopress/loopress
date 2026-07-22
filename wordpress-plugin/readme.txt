=== Loopress Full ===
Contributors: jean-smaug
Tags: composer, dependency, package manager, code snippets, developer tools
Requires at least: 6.0
Tested up to: 7.0
Stable tag: 2026.7.6
Requires PHP: 8.2
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Sync ACF field groups, SEO settings, and code snippets with the Loopress CLI, and install, audit, and sync Composer dependencies from the WordPress admin.

== Description ==

Loopress Full is the full edition of the Loopress WordPress plugin. It connects your WordPress site to your development workflow: ACF field groups, SEO settings (Yoast, RankMath), and code snippets (integrating with Code Snippets and WPCode) all sync with the Loopress CLI, and Composer dependency management sits on top: search Packagist, install and remove PHP packages, audit them for known security advisories, and sync your dependency manifest with the Loopress CLI, all without SSH access.

Features:

* Sync ACF field groups, post types, taxonomies, and options pages with `lps acf pull` / `lps acf push`
* Sync SEO settings and redirects (Yoast, RankMath) with `lps seo pull` / `lps seo push`
* Works with Code Snippets and WPCode, no migration needed
* Migrate snippets between WPCode and Code Snippets, one click at a time
* Pull snippets from the site as files with `lps snippet pull`, push edits back with `lps snippet push`
* Install and remove Composer packages from the admin panel
* Audit installed packages for known security advisories
* PHP platform version diagnostics
* Sync composer.json and composer.lock with the Loopress CLI (`lps composer push` / `lps composer pull`)

Loopress Full is distributed exclusively from loopress.dev, not from the WordPress.org plugin directory. If you already have Loopress Light installed, activating Loopress Full deactivates it: Loopress Full is a full replacement, not an add-on.

**Important**: PHP packages installed through Loopress Full are regular code living in `wp-content/loopress/`. Once your own snippets or code load them, they run wherever that code runs, on the front end as well as in the admin. Only install packages you trust, and keep them updated with the built-in security audit.

== Installation ==

1. Download `loopress-full.zip` from loopress.dev and upload it via **Plugins → Add New → Upload Plugin**.
2. Activate the plugin. If Loopress Light was already active, it is deactivated automatically.
3. Open the **Loopress** menu item in the admin sidebar.

== Frequently Asked Questions ==

= Does this require SSH access? =

No. Loopress Full runs Composer directly from the PHP process using the Composer API.

= Why is this plugin not on WordPress.org? =

The plugin directory guidelines do not allow plugins whose purpose is installing executable PHP code from external registries such as Packagist. That capability is exactly what Loopress Full exists for. Separately, the review team also rejected code snippet sync itself, deploying arbitrary PHP/JS/CSS into Code Snippets or WPCode is treated as a remote code deployment mechanism regardless of the authentication in front of it. Both Composer management and snippet sync are therefore distributed only from loopress.dev, in Loopress Full. Loopress Light, the ACF- and SEO-sync-only edition, is on wordpress.org instead.

= What happens when I delete the plugin? =

Deleting the plugin removes the `wp-content/loopress/` directory, including `composer.json`, `composer.lock`, and all packages installed through Loopress Full. Back up these files first if you need to keep them.

== Changelog ==

= 2026.7.6 =
* The plugin now builds two editions from the same codebase. Loopress Full (this download) keeps Composer dependency management; snippet synchronization moved to the separate Loopress Light plugin on wordpress.org. Installing Loopress Full deactivates Loopress Light automatically.

= 2026.7.5 =
* Fixed all issues reported by the WordPress Plugin Check tool: escaped dynamic exception messages, added the missing direct access guard, and bumped "Tested up to" to 7.0.

= 2026.7.4 =
* Fixed `lps snippet pull` failing to delete a locally removed snippet, and excluded trashed snippets from sync.

= 2026.7.3 =
* Plugin management now relies entirely on WordPress core's REST API instead of a custom endpoint.

= 2026.7.2 =
* Added a diagnostics tab to the admin UI.
* Unified the snippet REST route.
* Switched the integrity hash from md5 to sha256.

= 2026.7.1 =
* Improved compatibility of the WPCode sidecar file with the WPCode API.

= 2026.7.0 =
* Initial release: basic UI for Composer dependency installation, and REST endpoints for the Loopress CLI.
