<?php

declare(strict_types=1);

namespace Loopress\Blocks;

use Loopress\Blocks\Module\BlocksModule;
use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;

use function DI\autowire;

/**
 * Entry point of the dynamic blocks feature: a versioned blocks/ folder (`lps block push`)
 * deploys block.json + render.php folders to wp-content/loopress/blocks/, each registered as
 * the server-rendered block loopress/<slug>. Full only, like Hooks: render.php is PHP run on
 * the site, the same remote-code-deployment reason wordpress.org rejected Snippets and Api for.
 */
final class Feature implements FeatureProvider
{
    /** @return array<string, mixed> */
    public static function definitions(): array
    {
        return [
            BlocksModule::class => autowire(),
        ];
    }

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array
    {
        return [BlocksModule::class];
    }
}
