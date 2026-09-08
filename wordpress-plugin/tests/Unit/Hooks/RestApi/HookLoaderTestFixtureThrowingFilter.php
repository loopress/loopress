<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Hooks\RestApi;

use Loopress\Hooks\Attribute\Filter;

final class HookLoaderTestFixtureThrowingFilter
{
    #[Filter('the_content')]
    public function tweak(string $content): string
    {
        throw new \RuntimeException("boom on: {$content}");
    }
}
