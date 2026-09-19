<?php

declare(strict_types=1);

namespace Loopress\Menu\Exception;

// Thrown when a write carries an `expectedRevision` that no longer matches the menu's current
// name/items: something else changed it on WordPress since the caller last read it. This is an
// optimistic-concurrency check, not a resource conflict or a permissions refusal. The write is
// refused so it never silently overwrites that intervening change, the caller is expected to
// re-read and retry. Maps to HTTP 412 Precondition Failed, the standard status for a failed
// conditional write.
class StaleMenuRevisionException extends \RuntimeException {}
