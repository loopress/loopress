<?php

declare(strict_types=1);

namespace Loopress\Content\Exception;

// Thrown when an imported row is not an object of scalar columns. Maps to 400.
final class InvalidContentRowException extends \RuntimeException {}
