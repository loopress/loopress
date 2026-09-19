<?php

declare(strict_types=1);

namespace Loopress\Options\Exception;

// Thrown when a write carries an `expectedRevision` that no longer matches the option's current
// value: something else changed it on WordPress since the caller last read it. This is an
// optimistic-concurrency check, not a resource conflict (ReservedOptionNameException) or a
// permissions refusal (ProtectedOptionException): the write is refused so it never silently
// overwrites that intervening change, the caller is expected to re-read and retry. Maps to HTTP
// 412 Precondition Failed, the standard status for a failed conditional write.
class StaleOptionRevisionException extends \RuntimeException {}
