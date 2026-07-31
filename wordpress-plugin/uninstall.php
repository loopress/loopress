<?php

use Symfony\Component\Filesystem\Filesystem;

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

$autoload = __DIR__ . '/vendor/autoload.php';

// A dev checkout symlinked straight into wp-content/plugins/ without `composer install` has no
// vendor/ yet. The cleanup below is already best-effort, so skip it rather than fatal.
if (!file_exists($autoload)) {
    return;
}

require_once $autoload;

$loopress_dir = WP_CONTENT_DIR . '/loopress/';

if (is_dir($loopress_dir)) {
    (new Filesystem())->remove($loopress_dir);
}
