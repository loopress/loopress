<?php

declare(strict_types=1);

namespace Loopress\Tests\Stubs;

/**
 * The user Global Styles post of each stylesheet, behind the WP_Theme_JSON_Resolver test double
 * in WpRestStubs.php. Kept off that class: static analysis reads WordPress's own declaration of it.
 */
final class UserGlobalStyles
{
    /** @var array<string, array<string, mixed>> stylesheet => post data */
    public static array $posts = [];

    /** @var string[] stylesheets a post was created for */
    public static array $created = [];

    public static function reset(): void
    {
        self::$posts   = [];
        self::$created = [];
    }
}
