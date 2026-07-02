<?php

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

require_once __DIR__ . '/vendor/autoload.php';

use Symfony\Component\Filesystem\Filesystem;

$loopress_dir = WP_CONTENT_DIR . '/loopress/';

if (is_dir($loopress_dir)) {
    (new Filesystem())->remove($loopress_dir);
}
