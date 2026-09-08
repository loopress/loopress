<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Hooks\RestApi;

use Loopress\Hooks\Attribute\Filter;

final class HookLoaderTestFixtureFilterZeroAcceptedArgs
{
    // A filter that never receives the value it's filtering, only ever returns a fixed one:
    // wrapFilterCallback() must still fall back to the *original* value on a throw, even
    // though this method itself was never passed it (see HookLoader::bindingsFor()).
    #[Filter('some_filter', acceptedArgs: 0)]
    public function tweak(): string
    {
        throw new \RuntimeException('boom');
    }
}
