<?php

declare(strict_types=1);

namespace Loopress\Contract;

/**
 * Uniform contract for the Plus features (Dependencies, Update, Snippets): each one
 * contributes its own PHP-DI wiring and the list of Module classes it wants booted,
 * instead of imperatively building and returning Module instances itself.
 */
interface FeatureProvider
{
    /** @return array<string, mixed> */
    public static function definitions(): array;

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array;
}
