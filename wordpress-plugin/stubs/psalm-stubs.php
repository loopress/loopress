<?php

// Constants declared here purely for Psalm; never loaded at runtime (see psalm.xml <stubs>).

// WordPress core constants, defined at runtime by wp-load.php.
define('ABSPATH', '/var/www/html/');
define('WP_CONTENT_DIR', '/var/www/html/wp-content');
define('MINUTE_IN_SECONDS', 60);
define('HOUR_IN_SECONDS', 60 * 60);
define('DAY_IN_SECONDS', 24 * 60 * 60);
define('OBJECT', 'OBJECT');
define('ARRAY_A', 'ARRAY_A');

// Defined in loopress.php (the plugin bootstrap file, outside src/). Psalm scans that
// file too (see psalm.xml <projectFiles>) for other purposes, but for some reason doesn't pick
// up these define() calls from it, so they're declared here as well.
define('LOOPRESS_PLUGIN_URL', '');
define('LOOPRESS_PLUGIN_PATH', '/var/www/html/wp-content/plugins/loopress/');
define('LOOPRESS_PLUGIN_SLUG', 'loopress');
define('LOOPRESS_SOURCE_CHECKOUT', is_dir(__DIR__));
define('LOOPRESS_VERSION', '0.0.0');

// WordPress functions whose wordpress-stubs return type is a @phpstan-return conditional Psalm
// can't read, so it falls back to mixed. Redeclared with the same types in Psalm's syntax; a
// later stub replaces an earlier one's signature.

/**
 * @param array<string, mixed>|null $args
 * @psalm-return ($args is array{fields: 'ids', ...} ? list<int> : ($args is array{fields: 'id=>parent', ...} ? list<object{ID: int, post_parent: int}> : list<WP_Post>))
 */
function get_posts($args = null) {}

/**
 * @template T
 * @param T $value
 * @return T
 */
function wp_unslash($value) {}

/** @return array{path: string, url: string, subdir: string, basedir: string, baseurl: string, error: false|string} */
function wp_get_upload_dir() {}

/**
 * @param array<string, mixed>|string $args
 * @param 'names'|'objects' $output
 * @psalm-return ($output is 'names' ? array<string, string> : array<string, WP_Post_Type>)
 */
function get_post_types($args = [], $output = 'names', $operator = 'and') {}

/**
 * @param array<string, mixed> $postarr
 * @psalm-return ($wp_error is false ? int : int|WP_Error)
 */
function wp_insert_post($postarr, $wp_error = false, $fire_after_hooks = true) {}

/** @return non-empty-lowercase-string */
function wp_generate_uuid4() {}

/**
 * @template T
 * @param T $value
 * @return T
 */
function wp_slash($value) {}
