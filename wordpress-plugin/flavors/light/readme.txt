=== Loopress Light ===
Contributors: jean-smaug
Tags: code snippets, snippets, sync, git, developer tools
Requires at least: 6.0
Tested up to: 7.0
Stable tag: 2026.7.2
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

Need Composer dependency management too? [Loopress Full](https://loopress.dev) is the full edition, distributed separately from loopress.dev (see FAQ for why).

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/`.
2. Activate the plugin through the **Plugins** screen in WordPress.
3. Install and activate Code Snippets or WPCode if you have not already.
4. Open the **Loopress** menu item in the admin sidebar and follow the CLI pairing instructions.

== Frequently Asked Questions ==

= What is the difference between Loopress Light and Loopress Full? =

Loopress Light (this plugin) syncs code snippets only. Loopress Full adds Composer dependency management, a security audit, and platform diagnostics. Loopress Full is distributed separately from loopress.dev rather than wordpress.org, since directory guidelines do not allow that capability. Installing Loopress Full deactivates Loopress Light automatically: it is a full replacement, not an add-on.

= Which snippet plugins are supported? =

Code Snippets and WPCode. Loopress Light detects whichever is active, and you keep using its interface as usual.

= Does the plugin execute code by itself? =

No. Snippets are stored and executed by your snippet plugin (Code Snippets or WPCode), exactly as when you edit them by hand in its interface. Loopress Light only reads and writes them through that plugin's own APIs.

= Who can access the REST API? =

Only authenticated users with the `manage_options` capability (administrators). The CLI authenticates with a WordPress application password that you can revoke at any time.

= Do I need the CLI? =

The plugin is the site-side companion of the Loopress CLI (`lps`, installable from npm). Without the CLI, it does nothing beyond showing its admin page.

== Changelog ==

= 2026.8.0 =
* Renamed from "Loopress" to "Loopress Light". Package installation features moved to the separate Loopress Full plugin (formerly "Loopress Plus", then "Loopress"), available from loopress.dev. This plugin now focuses on snippet synchronization.

= 2026.7.0 =
* Concurrent operations are now serialized with a lock (second caller gets a clear "operation in progress" error).
* No more filesystem checks on regular front-end page loads.

= 2026.6.0 =
* Initial public release.
