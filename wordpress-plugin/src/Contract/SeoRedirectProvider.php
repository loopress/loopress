<?php

namespace Loopress\Contract;

// Redirects aren't part of the base SeoProvider contract: unlike post meta and settings, not
// every supported SEO plugin has an equivalent (Yoast's redirect manager is Premium-only).
// SeoService checks `instanceof SeoRedirectProvider` on the active provider before delegating,
// the same way ACF options pages require ACF PRO rather than every ACF object type being
// unconditionally available.
interface SeoRedirectProvider extends SeoProvider
{
    /** @return array<int, array<string, mixed>> */
    public function listRedirections(): array;

    /** @return array<string, mixed>|null */
    public function getRedirection(int $id): ?array;

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function createRedirection(array $data): array;

    /** @param array<string, mixed> $data @return array<string, mixed>|null */
    public function updateRedirection(int $id, array $data): ?array;
}
