<?php

declare(strict_types=1);

namespace Loopress\Snippets\Service;

use Loopress\Service\AbstractSingleProviderService;
use Loopress\Snippets\Contract\SnippetData;
use Loopress\Snippets\Contract\SnippetProvider;
use Loopress\Snippets\Exception\NoActiveSnippetPluginException;
use Loopress\Snippets\Exception\StaleSnippetRevisionException;

class SnippetService extends AbstractSingleProviderService
{
    public function __construct(SnippetProvider ...$providers)
    {
        parent::__construct(...$providers);
    }

    // No revision here (unlike getSnippet() below): mirrors OptionsService::listOptionNames(),
    // a discovery/bulk read that doesn't need a per-item conditional-write precondition, and
    // computing one for every snippet in the list would be pure waste for callers that only use
    // this to enumerate what exists.
    /** @return array<int, SnippetData> */
    public function getSnippets(): array
    {
        return $this->activeSnippetProvider()->getSnippets();
    }

    public function getSnippet(int $id): ?SnippetData
    {
        $snippet = $this->activeSnippetProvider()->getSnippet($id);

        return $snippet === null ? null : $this->withRevision($snippet);
    }

    public function createSnippet(SnippetData $data): SnippetData
    {
        return $this->withRevision($this->activeSnippetProvider()->createSnippet($data));
    }

    /**
     * @param string|null $expectedRevision When given, the write is refused (#234) unless it
     *        still matches the snippet's current revision, i.e. nothing else changed it since
     *        the caller last read it via getSnippet(). This is optimistic concurrency control (a
     *        check immediately followed by the write, both within this one request), not a
     *        database-level atomic compare-and-swap, the same scope OptionsService::
     *        updateOption() documents for the equivalent option-side check.
     */
    public function updateSnippet(int $id, SnippetData $data, ?string $expectedRevision = null): ?SnippetData
    {
        if ($expectedRevision !== null) {
            $this->assertRevisionMatches($id, $expectedRevision);
        }

        $updated = $this->activeSnippetProvider()->updateSnippet($id, $data);

        return $updated === null ? null : $this->withRevision($updated);
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

    private function withRevision(SnippetData $data): SnippetData
    {
        return new SnippetData(
            id: $data->id,
            name: $data->name,
            code: $data->code,
            type: $data->type,
            active: $data->active,
            description: $data->description,
            tags: $data->tags,
            location: $data->location,
            insertMethod: $data->insertMethod,
            priority: $data->priority,
            shortcodeAttributes: $data->shortcodeAttributes,
            revision: $this->revisionOf($data),
        );
    }

    // Covers every field a write can actually change (see WPCodeSnippetProvider::updateSnippet()/
    // saveMeta() and CodeSnippetsSnippetProvider::updateSnippet()/toPayload()), the same care
    // OptionsService::revisionOf() takes to hash both value and autoload rather than just value:
    // a revision read before, say, a priority-only change would otherwise still match after it,
    // letting a later push holding a stale priority silently overwrite that intervening change
    // once another field changes too. `id` itself is excluded: it identifies the snippet, a
    // write never changes it, so folding it in would only make every snippet's revision depend
    // on data that can never legitimately drift.
    private function revisionOf(SnippetData $data): string
    {
        // wp_json_encode() over PHP's serialize(): normalizes key order the same way on every
        // call, unlike a serialized-bytes comparison, which would treat two calls that produced
        // the same array in a different insertion order as different revisions. sha256, not md5:
        // a plain change-detection tag, never a security control, but sha256 is exactly as cheap
        // here and doesn't trip a "weak hashing algorithm" scanner finding on an otherwise-clean
        // codebase.
        return hash('sha256', (string) wp_json_encode([
            'name'                => $data->name,
            'code'                => $data->code,
            'type'                => $data->type?->value,
            'active'              => $data->active,
            'description'         => $data->description,
            'tags'                => $data->tags,
            'location'            => $data->location,
            'insertMethod'        => $data->insertMethod,
            'priority'            => $data->priority,
            'shortcodeAttributes' => $data->shortcodeAttributes,
        ]));
    }

    private function assertRevisionMatches(int $id, string $expectedRevision): void
    {
        $current         = $this->getSnippet($id);
        $currentRevision = $current?->revision;

        if ($currentRevision !== $expectedRevision) {
            $found = $currentRevision === null ? 'it no longer exists' : "its revision is now \"{$currentRevision}\"";
            throw new StaleSnippetRevisionException(
                "Snippet {$id} changed on WordPress since it was last read (expected revision \"{$expectedRevision}\", but {$found}). " .
                    'Re-read the snippet and try again.',
            );
        }
    }
}
