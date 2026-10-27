<?php

// Constants declared here purely for PHPStan (phpstan.neon bootstrapFiles), never loaded at
// runtime. Defined in loopress.php, outside the analysed paths. Listed in
// dynamicConstantNames too, so PHPStan types them as string, not as these placeholder values.

define('LOOPRESS_PLUGIN_URL', '');
define('LOOPRESS_PLUGIN_PATH', '/var/www/html/wp-content/plugins/loopress/');
define('LOOPRESS_PLUGIN_SLUG', 'loopress');
define('LOOPRESS_SOURCE_CHECKOUT', is_dir(__DIR__));
define('LOOPRESS_VERSION', '0.0.0');
