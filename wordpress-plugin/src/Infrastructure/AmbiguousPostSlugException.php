<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

// A bare slug that matches several posts (one per parent page): see PostByPath::find().
// Controllers map it to 409, the caller has to disambiguate with the full path.
final class AmbiguousPostSlugException extends \RuntimeException {}
