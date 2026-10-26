<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Infrastructure;

use Loopress\Infrastructure\Narrow;
use PHPUnit\Framework\TestCase;

class NarrowTest extends TestCase
{
    public function test_map_keeps_the_string_keys_only(): void
    {
        $this->assertSame(['a' => 1, 'b' => [2]], Narrow::map(['a' => 1, 0 => 'x', 'b' => [2]]));
        $this->assertSame([], Narrow::map('not an array'));
    }

    public function test_stringMap_also_drops_the_non_string_values(): void
    {
        $this->assertSame(['a' => '1'], Narrow::stringMap(['a' => '1', 'b' => 2, 0 => 'x']));
        $this->assertSame([], Narrow::stringMap(null));
    }
}
