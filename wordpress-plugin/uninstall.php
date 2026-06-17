<?php

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

$loopress_dir = WP_CONTENT_DIR . '/loopress/';

if (is_dir($loopress_dir)) {
    loopress_delete_directory($loopress_dir);
}

function loopress_delete_directory(string $dir): void
{
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );

    foreach ($items as $item) {
        $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    }

    rmdir($dir);
}