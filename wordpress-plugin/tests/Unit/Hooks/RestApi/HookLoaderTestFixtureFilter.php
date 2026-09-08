<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Hooks\RestApi;

use Loopress\Hooks\Attribute\Filter;

final class HookLoaderTestFixtureFilter
{
    #[Filter('the_content', priority: 20)]
    public function tweak(string $content): string
    {
        return $content . '-tweaked';
    }
}
