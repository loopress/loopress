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
        return $this->activeProviders() !== [];
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

    /** @return SnippetProvider[] */
    private function activeProviders(): array
    {
        return array_values(array_filter(
            $this->providers,
            static fn(SnippetProvider $provider): bool => $provider->isActive(),
        ));
    }

    // Requires exactly one active snippet plugin. If two are active at once (e.g. right after
    // installing one alongside another that was already there), we cannot silently pick one:
    // that would sync snippets into whichever plugin happens to win, with no way for the user
    // to know which storage is authoritative.
    private function requireActiveProvider(): SnippetProvider
    {
        $active = $this->activeProviders();

        if (count($active) > 1) {
            throw new \RuntimeException(
                'Multiple snippet plugins are active at once (Code Snippets and WPCode). Loopress cannot tell ' .
                'which one is authoritative for your snippets. Deactivate all but one and try again.',
            );
        }

        return $active[0] ?? throw new \RuntimeException('No supported snippet plugin is active.');
    }
}
