=== Loopress Full ===
Contributors: jeansmaug
Tags: composer, dependency, package manager, code snippets, developer tools
Requires at least: 6.2
Tested up to: 7.1
Stable tag: 2026.9.0
Requires PHP: 8.2
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Loopress Light plus hooks, API routes, apps, pages, templates, snippets and Composer, deployed from Git with the Loopress CLI.

== Description ==

Loopress Full is the full edition of the Loopress WordPress plugin. It does everything Loopress Light does (ACF, forms, menus, custom post types, taxonomies, post meta keys, roles and options, synced with the Loopress CLI), and adds the code side of a site: hooks, custom REST API routes, single-page apps, static pages, block templates, parts and patterns in a Loopress child theme, code snippets (through Code Snippets or WPCode), and Composer dependency management: search Packagist, install and remove PHP packages, audit them for known security advisories, all without SSH access.

Features:

* Everything in Loopress Light: ACF, WPForms forms, menus, custom post types, taxonomies, post meta keys, roles and options
* Hooks, filters and cron events as PHP classes: `lps hook push`
* Custom REST API routes: `lps api push`
* Single-page apps (Vue, React, Svelte bundles) mounted with a shortcode: `lps app push`
* Static pages, block templates, parts and patterns: `lps page push`, `lps theme template push`, `lps pattern push`
* Works with Code Snippets and WPCode, no migration needed
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

The plugin directory guidelines do not allow plugins whose purpose is installing executable PHP code from external registries such as Packagist. That capability is exactly what Loopress Full exists for. Separately, the review team also rejected code snippet sync itself, deploying arbitrary PHP/JS/CSS into Code Snippets or WPCode is treated as a remote code deployment mechanism regardless of the authentication in front of it. Both Composer management and snippet sync are therefore distributed only from loopress.dev, in Loopress Full. Loopress Light, the configuration-only edition, is on wordpress.org instead.

= What happens when I delete the plugin? =

Deleting the plugin removes the `wp-content/loopress/` directory, including `composer.json`, `composer.lock`, and all packages installed through Loopress Full. Back up these files first if you need to keep them.

== Changelog ==

Every release is listed in [CHANGELOG.md](https://github.com/loopress/loopress/blob/main/wordpress-plugin/CHANGELOG.md).
