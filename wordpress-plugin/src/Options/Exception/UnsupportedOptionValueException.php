<?php

declare(strict_types=1);

namespace Loopress\Options\Exception;

// Thrown when a stored option's value can't round-trip through JSON (a PHP object, e.g. a
// legacy plugin that stored a stdClass or custom class instance). Left unchecked, WP_REST_
// Response would json_encode() it into silent garbage (often just `{}`) instead of failing
// loudly, and a CLI `pull` would write that garbage to disk as if it were the real value.
class UnsupportedOptionValueException extends \RuntimeException {}
