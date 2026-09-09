<?php

declare(strict_types=1);

namespace Loopress\Options\Exception;

// Thrown for option names already owned by another Loopress resource (active_plugins,
// template, stylesheet: see the `plugin`/`theme` resources). Letting `option` write these too
// would give the same underlying data two independent sources of truth that can disagree, so
// this is refused outright rather than merged or overwritten.
class ReservedOptionNameException extends \RuntimeException {}
