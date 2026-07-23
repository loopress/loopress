<?php

declare(strict_types=1);

namespace Loopress\Snippets\Contract;

interface SnippetProvider
{
    public function isActive(): bool;

    /** @return array<int, SnippetData> */
    public function getSnippets(): array;

    public function getSnippet(int $id): ?SnippetData;

    public function createSnippet(SnippetData $data): SnippetData;

    public function updateSnippet(int $id, SnippetData $data): ?SnippetData;

    public function deleteSnippet(int $id): bool;
}
