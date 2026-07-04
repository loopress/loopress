<?php

namespace Loopress\Service;

use Loopress\Contract\SnippetProvider;

class SnippetService
{
    /** @var SnippetProvider[] */
    private array $providers;

    public function __construct(SnippetProvider ...$providers)
    {
        $this->providers = $providers;
    }

    public function isActive(): bool
    {
        return $this->activeProvider() !== null;
    }

    /** @return array<int, array<string, mixed>> */
    public function getSnippets(): array
    {
        return $this->requireActiveProvider()->getSnippets();
    }

    /** @return array<string, mixed>|null */
    public function getSnippet(int $id): ?array
    {
        return $this->requireActiveProvider()->getSnippet($id);
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function createSnippet(array $data): array
    {
        return $this->requireActiveProvider()->createSnippet($data);
    }

    /** @param array<string, mixed> $data @return array<string, mixed>|null */
    public function updateSnippet(int $id, array $data): ?array
    {
        return $this->requireActiveProvider()->updateSnippet($id, $data);
    }

    private function activeProvider(): ?SnippetProvider
    {
        foreach ($this->providers as $provider) {
            if ($provider->isActive()) {
                return $provider;
            }
        }

        return null;
    }

    private function requireActiveProvider(): SnippetProvider
    {
        return $this->activeProvider() ?? throw new \RuntimeException('No supported snippet plugin is active.');
    }
}
