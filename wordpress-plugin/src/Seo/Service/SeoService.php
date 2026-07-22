<?php

declare(strict_types=1);

namespace Loopress\Seo\Service;

use Loopress\Seo\Contract\SeoProvider;
use Loopress\Seo\Contract\SeoRedirectProvider;

class SeoService
{
    /** @var SeoProvider[] */
    private array $providers;

    public function __construct(SeoProvider ...$providers)
    {
        $this->providers = $providers;
    }

    public function isActive(): bool
    {
        return $this->activeProviders() !== [];
    }

    /** @return array<int, array<string, mixed>> */
    public function listPostMeta(string $postType): array
    {
        return $this->requireActiveProvider()->listPostMeta($postType);
    }

    /** @return array<string, mixed>|null */
    public function getPostMeta(string $postType, string $slug): ?array
    {
        return $this->requireActiveProvider()->getPostMeta($postType, $slug);
    }

    /** @param array<string, mixed> $meta @return array<string, mixed> */
    public function upsertPostMeta(string $postType, string $slug, array $meta): array
    {
        return $this->requireActiveProvider()->upsertPostMeta($postType, $slug, $meta);
    }

    /** @return array<string, mixed> */
    public function getSettings(): array
    {
        return $this->requireActiveProvider()->getSettings();
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function updateSettings(array $data): array
    {
        return $this->requireActiveProvider()->updateSettings($data);
    }

    /** @return array<int, array<string, mixed>> */
    public function listRedirections(): array
    {
        return $this->requireRedirectProvider()->listRedirections();
    }

    /** @return array<string, mixed>|null */
    public function getRedirection(int $id): ?array
    {
        return $this->requireRedirectProvider()->getRedirection($id);
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function createRedirection(array $data): array
    {
        return $this->requireRedirectProvider()->createRedirection($data);
    }

    /** @param array<string, mixed> $data @return array<string, mixed>|null */
    public function updateRedirection(int $id, array $data): ?array
    {
        return $this->requireRedirectProvider()->updateRedirection($id, $data);
    }

    /** @return SeoProvider[] */
    private function activeProviders(): array
    {
        return array_values(array_filter(
            $this->providers,
            static fn(SeoProvider $provider): bool => $provider->isActive(),
        ));
    }

    // Requires exactly one active SEO plugin, same reasoning as SnippetService: if two are
    // active at once, syncing would silently land in whichever one happens to win, with no
    // way for the user to know which storage is authoritative.
    private function requireActiveProvider(): SeoProvider
    {
        $active = $this->activeProviders();

        if (count($active) > 1) {
            throw new \RuntimeException(
                'Multiple SEO plugins are active at once (RankMath and Yoast SEO). Loopress cannot tell ' .
                'which one is authoritative for your SEO data. Deactivate all but one and try again.',
            );
        }

        return $active[0] ?? throw new \RuntimeException('No supported SEO plugin is active.');
    }

    // Mirrors ACF options pages requiring ACF PRO: not every SeoProvider supports redirects
    // (Yoast's equivalent is Premium-only), so this fails loudly rather than silently returning
    // nothing for a provider that was never going to support the request.
    private function requireRedirectProvider(): SeoRedirectProvider
    {
        $provider = $this->requireActiveProvider();

        if (!$provider instanceof SeoRedirectProvider) {
            throw new \RuntimeException('Redirects are not supported by the active SEO plugin.');
        }

        return $provider;
    }
}
