=== Loopress Light ===
Contributors: jean-smaug
Tags: code snippets, snippets, sync, git, developer tools
Requires at least: 6.0
Tested up to: 7.0
Stable tag: 2026.7.6
Requires PHP: 8.2
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Sync your code snippets with the Loopress CLI: pull them as files, keep them in Git, push them back.

== Description ==

Loopress Light connects the code snippets of your WordPress site to your development workflow. It integrates with the two most popular snippet plugins, Code Snippets and WPCode, and exposes them to the Loopress CLI (`lps`) so snippets can live in Git like any other code.

Features:

* Works with Code Snippets and WPCode, no migration needed
* Pull snippets from the site as files with `lps snippet pull`
* Push local edits back with `lps snippet push`
* Keep snippets in Git: history, diffs, code review, rollbacks
* Move snippets between environments (local, staging, production)
* REST API restricted to administrators, authenticated with WordPress application passwords

Need Composer dependency management too? [Loopress Full](https://docs.loopress.dev/wordpress-plugin/) is the full edition, free of charge, downloaded directly from loopress.dev instead of wordpress.org (see FAQ for why).

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/`.
2. Activate the plugin through the **Plugins** screen in WordPress.
3. Install and activate Code Snippets or WPCode if you have not already.
4. Open the **Loopress** menu item in the admin sidebar and follow the CLI pairing instructions.

== Frequently Asked Questions ==

= What is the difference between Loopress Light and Loopress Full? =

Loopress Light (this plugin) syncs code snippets only. Loopress Full adds Composer dependency management, a security audit, and platform diagnostics. Loopress Full costs nothing, it is not a paid upgrade: it is downloaded directly from loopress.dev instead of wordpress.org, because directory guidelines do not allow a plugin that installs executable code from external registries such as Packagist, not because of pricing. Installing Loopress Full deactivates Loopress Light automatically: it is a full replacement, not an add-on. See [the documentation](https://docs.loopress.dev/wordpress-plugin/) for the full feature comparison and download link.

= Which snippet plugins are supported? =

Code Snippets and WPCode. Loopress Light detects whichever is active, and you keep using its interface as usual.

= Does the plugin execute code by itself? =

No. Snippets are stored and executed by your snippet plugin (Code Snippets or WPCode), exactly as when you edit them by hand in its interface. Loopress Light only reads and writes them through that plugin's own APIs.

= Who can access the REST API? =

Only authenticated users with the `manage_options` capability (administrators). The CLI authenticates with a WordPress application password that you can revoke at any time.

= Do I need the CLI? =

The plugin is the site-side companion of the Loopress CLI (`lps`, installable from npm). Without the CLI, it does nothing beyond showing its admin page.

== Changelog ==

= 2026.7.6 =
* The plugin now builds two editions from the same codebase. Loopress Light (this plugin) keeps snippet synchronization; Composer dependency management moved to the separate Loopress Full plugin, distributed from loopress.dev.

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
