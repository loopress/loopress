<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Api\RestApi;

use Loopress\Api\Attribute\Hidden;

#[Hidden]
final class RouteLoaderTestFixtureHidden
{
    /** @return array<string, mixed> */
    public function get(): array
    {
        return ['ok' => true];
    }
}
