<?php

declare(strict_types=1);

namespace Loopress\PostTypes\Exception;

// Thrown when a pushed post type is refused before anything is stored: a malformed or reserved
// slug, or an argument WordPress would call or instantiate (see PostTypeService::CODE_ARGS).
// Maps to HTTP 422.
class InvalidPostTypeException extends \RuntimeException {}
