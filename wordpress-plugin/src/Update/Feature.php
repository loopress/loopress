<?php

declare(strict_types=1);

namespace Loopress\Update;

use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\Infrastructure\WpHttpClient;
use Loopress\Update\Infrastructure\GithubReleaseChecker;
use Loopress\Update\Module\UpdateCheckModule;

use function DI\autowire;
use function DI\factory;
use function DI\get;

/**
 * Entry point of the update notification feature. Everything under src/Update/ ships only
 * in the Loopress Full edition (see scripts/build-flavor.cjs); the plugin entry file calls
 * this inside its build markers, so the Loopress Light artifact never references this
 * namespace. Loopress Light must never carry an update-checking mechanism of its own, even
 * inactive: wordpress.org guidelines reserve that role for their own SVN-based update flow.
 */
class Feature implements FeatureProvider
{
    private const HTTP_CLIENT = 'loopress.update.http_client';

    /** @return array<string, mixed> */
    public static function definitions(): array
    {
        return [
            // GithubReleaseChecker takes a bare ClientInterface, which PHP-DI can't autowire
            // on its own (it's an interface); this gives it a WpHttpClient configured with the
            // same 5s timeout the direct wp_remote_get() call used before US-18.
            self::HTTP_CLIENT => factory(static fn(): WpHttpClient => new WpHttpClient(5)),
            GithubReleaseChecker::class => autowire()->constructorParameter('httpClient', get(self::HTTP_CLIENT)),
        ];
    }

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array
    {
        return [UpdateCheckModule::class];
    }
}
