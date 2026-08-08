<?php

// Constants declared here purely for Psalm; never loaded at runtime (see psalm.xml <stubs>).

// WordPress core constants, defined at runtime by wp-load.php.
define('ABSPATH', '/var/www/html/');
define('WP_CONTENT_DIR', '/var/www/html/wp-content');
define('MINUTE_IN_SECONDS', 60);
define('HOUR_IN_SECONDS', 60 * 60);
define('OBJECT', 'OBJECT');
define('ARRAY_A', 'ARRAY_A');

// Defined in loopress.php (the plugin bootstrap file, outside src/). Psalm scans that
// file too (see psalm.xml <projectFiles>) for other purposes, but for some reason doesn't pick
// up these define() calls from it, so they're declared here as well.
define('LOOPRESS_PLUGIN_URL', '');
define('LOOPRESS_PLUGIN_PATH', '/var/www/html/wp-content/plugins/loopress/');
define('LOOPRESS_VERSION', '0.0.0');
