<?php

declare(strict_types=1);

namespace Loopress\Seo\Contract;

use Loopress\Contract\ActivatableProvider;

interface SeoProvider extends ActivatableProvider
{
    /** @return array<int, array<string, mixed>> */
    public function listPostMeta(string $postType): array;

    /** @return array<string, mixed>|null */
    public function getPostMeta(string $postType, string $slug): ?array;

    /**
     * @param array<string, mixed> $meta
     * @param string|null $expectedRevision When given, the write is refused (#234, StaleSeoRevisionException)
     *        unless it still matches this post's current SEO-meta revision.
     * @return array<string, mixed>
     */
    public function upsertPostMeta(string $postType, string $slug, array $meta, ?string $expectedRevision = null): array;

    /** @return array{revision: string, settings: array<string, mixed>} */
    public function getSettings(): array;

    /**
     * @param array<string, mixed> $data
     * @param string|null $expectedRevision When given, the write is refused (#234, StaleSeoRevisionException)
     *        unless it still matches the settings' current revision.
     * @return array{revision: string, settings: array<string, mixed>}
     */
    public function updateSettings(array $data, ?string $expectedRevision = null): array;
}
