<?php

declare(strict_types=1);

namespace Loopress\Snippets\Service;

use Loopress\Service\AbstractSingleProviderService;
use Loopress\Snippets\Contract\SnippetData;
use Loopress\Snippets\Contract\SnippetProvider;
use Loopress\Snippets\Exception\NoActiveSnippetPluginException;

class SnippetService extends AbstractSingleProviderService
{
    public function __construct(SnippetProvider ...$providers)
    {
        parent::__construct(...$providers);
    }

    /** @return array<int, SnippetData> */
    public function getSnippets(): array
    {
        return $this->activeSnippetProvider()->getSnippets();
    }

    public function getSnippet(int $id): ?SnippetData
    {
        return $this->activeSnippetProvider()->getSnippet($id);
    }

    public function createSnippet(SnippetData $data): SnippetData
    {
        return $this->activeSnippetProvider()->createSnippet($data);
    }

    public function updateSnippet(int $id, SnippetData $data): ?SnippetData
    {
        return $this->activeSnippetProvider()->updateSnippet($id, $data);
    }

    public function deleteSnippet(int $id): bool
    {
        return $this->activeSnippetProvider()->deleteSnippet($id);
    }

    // requireActiveProvider() is typed ActivatableProvider at the base-class level; this
    // constructor only ever handed it SnippetProvider instances, so the narrowing below is
    // always correct, just not something PHP's type system tracks across the base class.
    private function activeSnippetProvider(): SnippetProvider
    {
        /** @var SnippetProvider $provider */
        $provider = $this->requireActiveProvider();

        return $provider;
    }

    protected function multipleActiveException(): \RuntimeException
    {
        return new NoActiveSnippetPluginException(
            'Multiple snippet plugins are active at once (Code Snippets and WPCode). Loopress cannot tell ' .
            'which one is authoritative for your snippets. Deactivate all but one and try again.',
        );
    }

    protected function noneActiveException(): \RuntimeException
    {
        return new NoActiveSnippetPluginException('No supported snippet plugin is active.');
    }
}
