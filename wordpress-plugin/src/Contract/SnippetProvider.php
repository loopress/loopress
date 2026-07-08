<?php

namespace Loopress\Contract;

interface SnippetProvider
{
    public function isActive(): bool;

    /** @return array<int, array<string, mixed>> */
    public function getSnippets(): array;

    /** @return array<string, mixed>|null */
    public function getSnippet(int $id): ?array;

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function createSnippet(array $data): array;

    /** @param array<string, mixed> $data @return array<string, mixed>|null */
    public function updateSnippet(int $id, array $data): ?array;

    public function deleteSnippet(int $id): bool;
}
