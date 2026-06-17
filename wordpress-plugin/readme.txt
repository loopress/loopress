=== Loopress ===
Contributors: jean-smaug
Tags: composer, dependency, package manager, developer tools
Requires at least: 6.0
Tested up to: 6.7
Stable tag: 2026.6.0
Requires PHP: 8.2
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Manage and install Composer dependencies directly from the WordPress admin interface.

== Description ==

Loopress lets you manage Composer packages without SSH access. Install, remove, and audit PHP dependencies from a clean admin UI, with production lock support to prevent accidental changes on live sites.

Features:

* Install and remove Composer packages from the admin panel
* Audit installed packages for known security advisories
* Production lock via `wp-config.php` constant or admin toggle
* PHP platform version diagnostics

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/`.
2. Activate the plugin through the **Plugins** screen in WordPress.
3. Navigate to the **Loopress** menu item in the admin sidebar.

== Frequently Asked Questions ==

= Does this require SSH access? =

No. Loopress runs Composer directly from the PHP process using the Composer API.

= How do I prevent changes on a production site? =

Define `LOOPRESS_PRODUCTION_LOCK` as `true` in your `wp-config.php`, or toggle the lock from the plugin settings page.

== Changelog ==

= 2026.6.0 =
* Initial public release.
