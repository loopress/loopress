<?php

declare(strict_types=1);

namespace Loopress\Snippets\Service;

use Loopress\Snippets\Contract\SnippetData;
use Loopress\Snippets\Contract\SnippetProvider;
use Loopress\Snippets\Exception\NoActiveSnippetPluginException;

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

    /** @return array<int, SnippetData> */
    public function getSnippets(): array
    {
        return $this->requireActiveProvider()->getSnippets();
    }

    public function getSnippet(int $id): ?SnippetData
    {
        return $this->requireActiveProvider()->getSnippet($id);
    }

    public function createSnippet(SnippetData $data): SnippetData
    {
        return $this->requireActiveProvider()->createSnippet($data);
    }

    public function updateSnippet(int $id, SnippetData $data): ?SnippetData
    {
        return $this->requireActiveProvider()->updateSnippet($id, $data);
    }

    public function deleteSnippet(int $id): bool
    {
        return $this->requireActiveProvider()->deleteSnippet($id);
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
            throw new NoActiveSnippetPluginException(
                'Multiple snippet plugins are active at once (Code Snippets and WPCode). Loopress cannot tell ' .
                'which one is authoritative for your snippets. Deactivate all but one and try again.',
            );
        }

        return $active[0] ?? throw new NoActiveSnippetPluginException('No supported snippet plugin is active.');
    }
}
