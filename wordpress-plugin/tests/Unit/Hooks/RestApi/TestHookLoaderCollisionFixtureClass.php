<?php

declare(strict_types=1);

// Deliberately global namespace, not under Loopress\Tests\...: a real hooks/ file typically
// declares its class with no namespace at all, same as WP core and most plugins. Loaded via
// require_once in HookLoaderTest.php since a global-namespace class doesn't fit the
// Loopress\Tests\ PSR-4 prefix and can't be autoloaded.
final class TestHookLoaderCollisionFixture
{
}
