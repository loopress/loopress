<?php

declare(strict_types=1);

namespace Loopress\Hooks;

use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\Hooks\Module\HooksModule;

use function DI\autowire;

/**
 * Entry point of the custom hooks feature: a versioned hooks/ folder (`lps hook push`)
 * deploys PHP files straight to wp-content/loopress/hooks/, each binding one or more WP
 * actions/filters/cron jobs (see HookLoader). Everything under src/Hooks/ ships only in the
 * Loopress Full edition (see scripts/build-flavor.cjs), same rejection precedent as Api and
 * Snippets: wordpress.org rejects any mechanism that facilitates remote deployment of
 * arbitrary executable code, and binding into WP core's own action/filter hooks is, if
 * anything, a more direct case of that than a REST route ever was.
 */
class Feature implements FeatureProvider
{
    /** @return array<string, mixed> */
    public static function definitions(): array
    {
        return [
            HooksModule::class => autowire(),
        ];
    }

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array
    {
        return [HooksModule::class];
    }
}
