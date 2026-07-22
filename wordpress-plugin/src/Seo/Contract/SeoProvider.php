<?php

declare(strict_types=1);

namespace Loopress\Seo\Contract;

interface SeoProvider
{
    public function isActive(): bool;

    /** @return array<int, array<string, mixed>> */
    public function listPostMeta(string $postType): array;

    /** @return array<string, mixed>|null */
    public function getPostMeta(string $postType, string $slug): ?array;

    /** @param array<string, mixed> $meta @return array<string, mixed> */
    public function upsertPostMeta(string $postType, string $slug, array $meta): array;

    /** @return array<string, mixed> */
    public function getSettings(): array;

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function updateSettings(array $data): array;
}
