<?php

/**
 * Plugin Name: Loopress
 * Description: Manage and install Composer dependencies from the WordPress admin.
 * Version: 2026.7.0
 * Author: jean-smaug
 * Text Domain: loopress
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

define('LOOPRESS_PLUGIN_URL', plugin_dir_url(__FILE__));
define('LOOPRESS_PLUGIN_PATH', plugin_dir_path(__FILE__));
define('LOOPRESS_PLUGIN_SLUG', dirname(plugin_basename(__FILE__)));

require_once plugin_dir_path(__FILE__) . 'vendor/autoload.php';

use Loopress\Plugin;

register_activation_hook(__FILE__, function () {
    do_action('litespeed_purge_all');
});

new Plugin();
