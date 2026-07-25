<?php

declare(strict_types=1);

namespace Loopress\Seo\Exception;

// Thrown both when the active SEO plugin has no redirects feature at all (Yoast free) and
// when it does but the feature is currently switched off (RankMath's Redirections module).
// Either way the client's request can never succeed as sent, regardless of retrying: a 4xx,
// not the 500 a transient server failure would warrant.
class RedirectsUnavailableException extends \RuntimeException {}
