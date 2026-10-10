<?php

declare(strict_types=1);

namespace Loopress\PostTypes\Exception;

// Thrown when a pushed post type or taxonomy is refused before anything is stored: a malformed or
// reserved slug, an argument of the wrong type, or one WordPress would call or instantiate (see
// AbstractDeclaredTypeService). Maps to HTTP 422.
class InvalidDeclarationException extends \RuntimeException {}
