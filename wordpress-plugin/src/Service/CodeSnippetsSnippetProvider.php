<?php

namespace Loopress\Service;

use Loopress\Contract\SnippetProvider;

class CodeSnippetsSnippetProvider implements SnippetProvider
{
    public function isActive(): bool
    {
        return class_exists('Code_Snippets\\Plugin');
    }

    public function getSnippets(): array
    {
        throw new \RuntimeException('Code Snippets support is not implemented yet.');
    }

    public function getSnippet(int $id): ?array
    {
        throw new \RuntimeException('Code Snippets support is not implemented yet.');
    }

    public function createSnippet(array $data): array
    {
        throw new \RuntimeException('Code Snippets support is not implemented yet.');
    }

    public function updateSnippet(int $id, array $data): ?array
    {
        throw new \RuntimeException('Code Snippets support is not implemented yet.');
    }
}
