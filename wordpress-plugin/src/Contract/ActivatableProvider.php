<?php

declare(strict_types=1);

namespace Loopress\Contract;

/**
 * Common shape of every provider a Service arbitrates between (SeoProvider, SnippetProvider,
 * FormProvider): self-reports whether its backing plugin is active, which is all
 * Service\AbstractSingleProviderService needs to pick the one currently in play.
 */
interface ActivatableProvider
{
    public function isActive(): bool;
}
