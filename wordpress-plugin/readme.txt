=== Loopress ===
Contributors: jean-smaug
Tags: composer, dependency, package manager, code snippets, developer tools
Requires at least: 6.0
Tested up to: 7.0
Stable tag: 2026.7.2
Requires PHP: 8.2
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Sync code snippets with the Loopress CLI, and install, audit, and sync Composer dependencies from the WordPress admin.

== Description ==

Loopress is the full edition of the Loopress WordPress plugin. It connects the code snippets of your WordPress site to your development workflow (integrating with Code Snippets and WPCode, exposing them to the Loopress CLI), and adds Composer dependency management on top: search Packagist, install and remove PHP packages, audit them for known security advisories, and sync your dependency manifest with the Loopress CLI, all without SSH access.

Features:

* Works with Code Snippets and WPCode, no migration needed
* Pull snippets from the site as files with `lps snippet pull`, push edits back with `lps snippet push`
* Install and remove Composer packages from the admin panel
* Audit installed packages for known security advisories
* PHP platform version diagnostics
* Sync composer.json and composer.lock with the Loopress CLI (`lps composer push` / `lps composer pull`)

Loopress is distributed exclusively from loopress.dev, not from the WordPress.org plugin directory. If you already have Loopress Light installed, activating Loopress deactivates it: Loopress is a full replacement, not an add-on.

**Important**: PHP packages installed through Loopress are regular code living in `wp-content/loopress/`. Once your own snippets or code load them, they run wherever that code runs, on the front end as well as in the admin. Only install packages you trust, and keep them updated with the built-in security audit.

== Installation ==

1. Download `loopress.zip` from loopress.dev and upload it via **Plugins → Add New → Upload Plugin**.
2. Activate the plugin. If Loopress Light was already active, it is deactivated automatically.
3. Open the **Loopress** menu item in the admin sidebar.

== Frequently Asked Questions ==

= Does this require SSH access? =

No. Loopress runs Composer directly from the PHP process using the Composer API.

= Why is this plugin not on WordPress.org? =

The plugin directory guidelines do not allow plugins whose purpose is installing executable PHP code from external registries such as Packagist. That capability is exactly what Loopress exists for, so it is distributed separately from loopress.dev. Loopress Light, the snippet-sync-only edition, is on wordpress.org instead.

= What happens when I delete the plugin? =

Deleting the plugin removes the `wp-content/loopress/` directory, including `composer.json`, `composer.lock`, and all packages installed through Loopress. Back up these files first if you need to keep them.

== Changelog ==

= 2026.8.0 =
* Renamed from "Loopress Plus" to "Loopress" (the full edition of the Loopress WordPress plugin, formerly available side by side with a "Loopress" free edition now called "Loopress Light"). No functional changes.

= 2026.7.0 =
* Concurrent Composer operations are now serialized with a lock (second caller gets a clear "operation in progress" error).
* No more filesystem checks on regular front-end page loads.

= 2026.6.0 =
* Initial public release.
