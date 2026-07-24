<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Stubs/WpRestStubs.php';

// WordPress core time constant. GithubReleaseChecker's CACHE_TTL class constant references
// it, and PHP resolves that reference the first time the constant is actually read, which
// for these tests is real test runtime, not just static analysis (already covered for that
// case by psalm-stubs.php).
if (!defined('HOUR_IN_SECONDS')) {
    define('HOUR_IN_SECONDS', 60 * 60);
}

// Same reasoning as HOUR_IN_SECONDS above; PackagistClient's CACHE_TTL references it.
if (!defined('MINUTE_IN_SECONDS')) {
    define('MINUTE_IN_SECONDS', 60);
}

// Normally defined in loopress.php (outside src/, not autoloaded); UpdateController compares
// against it at real test runtime too, same reasoning as HOUR_IN_SECONDS above.
if (!defined('LOOPRESS_VERSION')) {
    define('LOOPRESS_VERSION', '2026.7.0');
}

// WordPress core $wpdb result-format constant. RankMathService references it at real test
// runtime (passed straight through to the FakeWpdb double), same reasoning as HOUR_IN_SECONDS.
if (!defined('ARRAY_A')) {
    define('ARRAY_A', 'ARRAY_A');
}

// WordPress core get_*_by() output-format constant, same reasoning as ARRAY_A above.
if (!defined('OBJECT')) {
    define('OBJECT', 'OBJECT');
}

// ContainerFactory only compiles the PHP-DI container to disk outside WP_DEBUG; forcing
// it on here keeps test runs from writing a compiled container to disk.
if (!defined('WP_DEBUG')) {
    define('WP_DEBUG', true);
}

// Normally defined in loopress.php (outside src/, not autoloaded); SentryModule::isOwnEvent()
// compares stack frame paths against it at real test runtime, same reasoning as LOOPRESS_VERSION
// above. Matches the value already used for static analysis in psalm-stubs.php.
if (!defined('LOOPRESS_PLUGIN_PATH')) {
    define('LOOPRESS_PLUGIN_PATH', '/var/www/html/wp-content/plugins/loopress/');
}
