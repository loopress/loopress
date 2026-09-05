<?php

declare(strict_types=1);

namespace Loopress\Service;

use Loopress\Contract\ActivatableProvider;

/**
 * Shared arbitration for a feature backed by a fixed pool of interchangeable, self-reporting
 * providers (SeoProvider, SnippetProvider, FormProvider): exactly one must be active at a
 * time, since syncing through two at once would land in whichever one happens to win, with no
 * way for the user to know which storage is authoritative. Kept outside every Full-only src/
 * directory (see scripts/build-flavor.cjs) so both editions' services can use it, same
 * reasoning as RestApi\MapsServiceExceptions.
 */
abstract class AbstractSingleProviderService
{
    /** @var ActivatableProvider[] */
    private array $providers;

    public function __construct(ActivatableProvider ...$providers)
    {
        $this->providers = $providers;
    }

    public function isActive(): bool
    {
        return $this->activeProviders() !== [];
    }

    /** @return ActivatableProvider[] */
    protected function activeProviders(): array
    {
        return array_values(array_filter(
            $this->providers,
            static fn(ActivatableProvider $provider): bool => $provider->isActive(),
        ));
    }

    protected function requireActiveProvider(): ActivatableProvider
    {
        $active = $this->activeProviders();

        if (count($active) > 1) {
            throw $this->multipleActiveException();
        }

        return $active[0] ?? throw $this->noneActiveException();
    }

    abstract protected function multipleActiveException(): \RuntimeException;

    abstract protected function noneActiveException(): \RuntimeException;
}
