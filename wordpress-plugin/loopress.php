<?php

/**
 * Plugin Name: Loopress
 * Description: Sync code snippets (Code Snippets, WPCode) with the Loopress CLI and keep them in Git.
 * Version: 2026.7.2
 * Author: jean-smaug
 * Text Domain: loopress
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

if (!defined('ABSPATH')) {
    exit;
}

// Registered unconditionally, ahead of the coexistence guard below: WordPress only ever
// invokes this callback when THIS file's own plugin is the one being activated, so it must
// not depend on the guard's early return. If it were registered after the guard, activating
// Loopress Plus while the free edition is already active would hit the guard first (the free
// edition's file loads first alphabetically and already defined LOOPRESS_VERSION) and this
// hook would never be registered, silently breaking the automatic free-edition deactivation.
register_activation_hook(__FILE__, function () {
    /* LOOPRESS_PLUS_START */
    // The Plus edition replaces the free plugin: deactivate the free one on activation
    // so the coexistence guard below never fires during a normal upgrade.
    if (function_exists('deactivate_plugins')) {
        deactivate_plugins('loopress/loopress.php');
    }
    /* LOOPRESS_PLUS_END */
    do_action('litespeed_purge_all');
});

// Guards against this file's remaining side effects (constants, the autoloader require,
// the plugins_loaded registration) running twice in the same PHP process. This happens in
// practice with `wp plugin install --force --activate` over an already-active install:
// WordPress's normal bootstrap already loaded the previously-active build once, and
// activate_plugin()'s include_once of the just-replaced file can execute a second time
// (deleting and recreating a file at the same path mid-process can bypass include_once's
// deduplication). Guards on LOOPRESS_PLUGIN_URL rather than LOOPRESS_VERSION below: an
// older already-active build may predate LOOPRESS_VERSION, but has always defined this one.
if (defined('LOOPRESS_PLUGIN_URL')) {
    return;
}

// Both editions of the plugin (free and Plus, see scripts/build-flavor.cjs) define this
// constant: if it is already defined, another edition is active and this one stands down
// entirely, otherwise both would register the same REST routes and admin menu.
if (defined('LOOPRESS_VERSION')) {
    add_action('admin_notices', function () {
        echo '<div class="notice notice-error"><p>';
        echo esc_html__(
            'Two editions of Loopress are active at the same time. Deactivate one of them: Loopress Plus fully replaces the free plugin.',
            'loopress'
        );
        echo '</p></div>';
    });
    return;
}

// Kept in sync with the Version header by scripts/sync-version.js.
define('LOOPRESS_VERSION', '2026.7.2');
define('LOOPRESS_PLUGIN_URL', plugin_dir_url(__FILE__));
define('LOOPRESS_PLUGIN_PATH', plugin_dir_path(__FILE__));
define('LOOPRESS_PLUGIN_SLUG', dirname(plugin_basename(__FILE__)));

require_once plugin_dir_path(__FILE__) . 'vendor/autoload.php';

use Loopress\Plugin;

/* LOOPRESS_PLUS_START */
// Stripped from the free wordpress.org build by scripts/build-flavor.cjs, together with
// src/Plus/ and uninstall.php: the free artifact must not contain any reference to the
// Composer feature, even an inactive one.
add_filter('loopress_modules', fn(array $modules): array => array_merge($modules, \Loopress\Plus\Plus::bootstrap()));
/* LOOPRESS_PLUS_END */

// Booting on plugins_loaded rather than at file inclusion; priority 1 because snippet
// plugins execute user snippets on this same hook at their default priority, and the
// plugin's modules must be registered before that.
add_action('plugins_loaded', function () {
    new Plugin();
}, 1);
