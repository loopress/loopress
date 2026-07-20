<?php

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Stubs/WpRestStubs.php';

// WordPress core time constant. GithubReleaseChecker's CACHE_TTL class constant references
// it, and PHP resolves that reference the first time the constant is actually read, which
// for these tests is real test runtime, not just static analysis (already covered for that
// case by psalm-stubs.php).
if (!defined('HOUR_IN_SECONDS')) {
    define('HOUR_IN_SECONDS', 60 * 60);
}

// Normally defined in loopress.php (outside src/, not autoloaded); UpdateController compares
// against it at real test runtime too, same reasoning as HOUR_IN_SECONDS above.
if (!defined('LOOPRESS_VERSION')) {
    define('LOOPRESS_VERSION', '2026.7.0');
}
