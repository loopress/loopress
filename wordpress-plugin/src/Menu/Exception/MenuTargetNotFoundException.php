<?php

declare(strict_types=1);

namespace Loopress\Menu\Exception;

// Thrown when a menu item points at a post or term slug that doesn't exist on this environment
// (content not created or not copied here yet). The request is what needs fixing, not the
// server, so it maps to HTTP 422 Unprocessable Content rather than a generic 500.
final class MenuTargetNotFoundException extends \RuntimeException {}
