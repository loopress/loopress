<?php

declare(strict_types=1);

namespace Loopress\Dependencies;

use DI\Container;
use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
use Loopress\Dependencies\Module\ComposerModule;

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

    /** @return array<string, mixed> */
    public static function definitions(): array
    {
        return [
            self::AUTOLOAD_ERROR => factory(
                static fn(Container $container): ?string => self::requireVendorAutoload(
                    $container->get(LoopressEnvironment::class),
                ),
            ),
            ComposerModule::class => autowire()->constructorParameter('autoloadError', get(self::AUTOLOAD_ERROR)),
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
