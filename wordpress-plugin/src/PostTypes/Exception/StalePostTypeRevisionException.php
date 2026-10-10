<?php

declare(strict_types=1);

namespace Loopress\PostTypes\Exception;

// Thrown when a write carries an `expectedRevision` that no longer matches the stored post type:
// something else changed it since the caller last read it. Same optimistic-concurrency check as
// StaleMenuRevisionException (#234). Maps to HTTP 412.
class StalePostTypeRevisionException extends \RuntimeException {}
