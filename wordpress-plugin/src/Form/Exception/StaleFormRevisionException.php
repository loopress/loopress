<?php

declare(strict_types=1);

namespace Loopress\Form\Exception;

// Thrown when a write carries an `expectedRevision` that no longer matches the form's current
// state: something else changed it on WordPress since the caller last read it. This is an
// optimistic-concurrency check, not a "no active provider" conflict (NoActiveFormPluginException)
// or a notification-content refusal (FormNotificationException): the write is refused so it never
// silently overwrites that intervening change, the caller is expected to re-read and retry. Maps
// to HTTP 412 Precondition Failed, the standard status for a failed conditional write. Mirrors
// Options\Exception\StaleOptionRevisionException, #234's form equivalent.
class StaleFormRevisionException extends \RuntimeException {}
