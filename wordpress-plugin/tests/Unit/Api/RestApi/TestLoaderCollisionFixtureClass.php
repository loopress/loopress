<?php

declare(strict_types=1);

// Deliberately global namespace, not under Loopress\Tests\...: RouteLoader::classNameFor()
// derives a bare, unnamespaced class name, matching how a real api/ file declares its class
// (see the plugin's "Convention de fichier" doc). Loaded via require_once in
// RouteLoaderTest.php since a global-namespace class doesn't fit the Loopress\Tests\ PSR-4
// prefix and can't be autoloaded.
final class TestLoaderCollisionFixture
{
}
