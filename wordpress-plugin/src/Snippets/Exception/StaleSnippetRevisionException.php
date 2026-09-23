<?php

declare(strict_types=1);

namespace Loopress\Snippets\Exception;

// Thrown when a write carries an `expectedRevision` that no longer matches the snippet's current
// content: something else changed it on WordPress since the caller last read it. This is an
// optimistic-concurrency check, not a location conflict (UnsupportedLocationException) or an
// upstream provider failure (SnippetProviderRequestException): the write is refused so it never
// silently overwrites that intervening change, the caller is expected to re-read and retry. Maps
// to HTTP 412 Precondition Failed, the standard status for a failed conditional write. Mirrors
// StaleOptionRevisionException (#234).
class StaleSnippetRevisionException extends \RuntimeException {}
