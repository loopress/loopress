<?php

declare(strict_types=1);

namespace Loopress\Seo\Exception;

// Thrown when a write carries an `expectedRevision` that no longer matches the active provider's
// current state for that post's meta (or the site-wide settings): something else changed it on
// WordPress since the caller last read it. Mirrors Options\Exception\StaleOptionRevisionException
// (#234) for the seo resource: an optimistic-concurrency check, not a resource conflict or a
// permissions refusal. Maps to HTTP 412 Precondition Failed, same as the option case.
class StaleSeoRevisionException extends \RuntimeException {}
