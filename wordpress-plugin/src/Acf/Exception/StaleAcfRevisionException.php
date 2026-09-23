<?php

declare(strict_types=1);

namespace Loopress\Acf\Exception;

// Thrown when a write carries an `expectedRevision` that no longer matches the ACF object's
// current exported content: something else changed it on WordPress since the caller last read
// it. This is an optimistic-concurrency check, not the "missing/invalid key" or "unregistered
// type" RuntimeExceptions AcfService::upsert() already throws: the write is refused so it never
// silently overwrites that intervening change, the caller is expected to re-read and retry.
// Maps to HTTP 412 Precondition Failed, the standard status for a failed conditional write, the
// same mapping StaleOptionRevisionException uses for the same pattern on the `option` resource
// (#234).
class StaleAcfRevisionException extends \RuntimeException {}
