<?php

declare(strict_types=1);

namespace Loopress\Dependencies;

use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
use Loopress\Dependencies\Infrastructure\PackagistClient;
use Loopress\Dependencies\Module\ComposerModule;
use Loopress\Infrastructure\WpHttpClient;
use Psr\Container\ContainerInterface;
use Psr\Http\Message\ResponseFactoryInterface;

use function DI\autowire;
use function DI\factory;
use function DI\get;

/**
 * Entry point of the Composer dependency management feature. Everything under
 * src/Dependencies/ ships only in the Loopress Full edition (see scripts/build-flavor.cjs);
 * the plugin entry file calls this inside its build markers, so the Loopress Light
 * artifact never references this namespace.
 */
class Feature implements FeatureProvider
{
    private const AUTOLOAD_ERROR = 'loopress.dependencies.autoload_error';
    private const HTTP_CLIENT    = 'loopress.dependencies.http_client';

    /** @return array<string, mixed> */
    public static function definitions(): array
    {
        return [
            self::AUTOLOAD_ERROR => factory(
                static fn(ContainerInterface $container): ?string => self::requireVendorAutoload(
                    $container->get(LoopressEnvironment::class),
                ),
            ),
            ComposerModule::class => autowire()->constructorParameter('autoloadError', get(self::AUTOLOAD_ERROR)),

            // PackagistClient takes a bare ClientInterface, which PHP-DI can't autowire on its
            // own (it's an interface); this gives it a WpHttpClient configured with the same
            // 10s timeout the direct wp_remote_get() call used before US-18.
            self::HTTP_CLIENT => factory(static fn(ContainerInterface $c): WpHttpClient => new WpHttpClient(
                $c->get(ResponseFactoryInterface::class),
                10,
            )),
            PackagistClient::class => autowire()->constructorParameter('httpClient', get(self::HTTP_CLIENT)),
        ];
    }

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array
    {
        return [ComposerModule::class];
    }

    private static function requireVendorAutoload(LoopressEnvironment $env): ?string
    {
        $autoload = $env->getAutoloadPath();
        if (!$autoload) {
            return null;
        }

        // A broken vendor/ can surface as any Throwable (\Error for missing files,
        // E_USER_ERROR from Composer's platform check, ...): catch everything so the
        // admin UI can offer the auto-repair flow instead of white-screening the site.
        try {
            ob_start();
            require_once $autoload;
            ob_end_clean();

            return null;
        } catch (\Throwable $e) {
            ob_end_clean();

            return $e->getMessage();
        }
    }
}
