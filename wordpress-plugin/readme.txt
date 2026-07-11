=== Loopress ===
Contributors: jean-smaug
Tags: composer, dependency, package manager, developer tools
Requires at least: 6.0
Tested up to: 6.7
Stable tag: 2026.7.2
Requires PHP: 8.2
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Manage and install Composer dependencies directly from the WordPress admin interface.

== Description ==

Loopress lets you manage Composer packages without SSH access. Install, remove, and audit PHP dependencies from a clean admin UI.

Features:

* Install and remove Composer packages from the admin panel
* Audit installed packages for known security advisories
* PHP platform version diagnostics

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/`.
2. Activate the plugin through the **Plugins** screen in WordPress.
3. Navigate to the **Loopress** menu item in the admin sidebar.

== Frequently Asked Questions ==

= Does this require SSH access? =

No. Loopress runs Composer directly from the PHP process using the Composer API.

= What happens when I delete the plugin? =

Deleting the plugin removes the `wp-content/loopress/` directory, including `composer.json`, `composer.lock`, and all packages installed through Loopress. Back up these files first if you need to keep them.

== Changelog ==

= 2026.7.0 =
* Concurrent Composer operations are now serialized with a lock (second caller gets a clear "operation in progress" error).
* Failed syncs restore the previous composer.json and composer.lock instead of leaving mismatched manifests.
* Installed packages now show the exact locked version instead of the constraint.
* Packagist version lookups are cached for five minutes.
* No more filesystem checks on regular front-end page loads.
* Broken vendor directories are now caught reliably and trigger the auto-repair flow.

= 2026.6.0 =
* Initial public release.
