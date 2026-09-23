<?php

declare(strict_types=1);

namespace Loopress\Form\Service;

use Loopress\Form\Contract\FormProvider;
use Loopress\Form\Exception\NoActiveFormPluginException;
use Loopress\Form\Exception\StaleFormRevisionException;
use Loopress\Service\AbstractSingleProviderService;

class FormService extends AbstractSingleProviderService
{
    // Fields the active provider's own post-save bookkeeping bumps on every write, independent
    // of the form's actual tracked content (see FORM_VOLATILE_KEYS in
    // cli/src/lib/resource-state.ts, which excludes these same keys from `form diff` for the
    // identical reason). Left out of the revision hash below: including them would turn a bare
    // re-save that changed nothing else into a false "stale" failure.
    private const VOLATILE_KEYS = ['modified', 'modified_gmt'];

    public function __construct(FormProvider ...$providers)
    {
        parent::__construct(...$providers);
    }

    /** @return array<int, array<string, mixed>> */
    public function list(): array
    {
        return $this->activeFormProvider()->list();
    }

    /** @return array<string, mixed>|null */
    public function get(int $id): ?array
    {
        $form = $this->activeFormProvider()->get($id);

        return $form === null ? null : $this->withRevision($form);
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function create(array $data): array
    {
        return $this->withRevision($this->activeFormProvider()->create($data));
    }

    /**
     * @param array<string, mixed> $data
     * @param string|null $expectedRevision When given, the write is refused (#234) unless it
     *        still matches the form's current revision, i.e. nothing else changed it since the
     *        caller last read it via get(). This is optimistic concurrency control (a check
     *        immediately followed by the write, both within this one request), not a
     *        database-level atomic compare-and-swap.
     * @return array<string, mixed>|null
     */
    public function update(int $id, array $data, ?string $expectedRevision = null): ?array
    {
        if ($expectedRevision !== null) {
            $this->assertRevisionMatches($id, $expectedRevision);
        }

        $form = $this->activeFormProvider()->update($id, $data);

        return $form === null ? null : $this->withRevision($form);
    }

    public function delete(int $id): bool
    {
        return $this->activeFormProvider()->delete($id);
    }

    // requireActiveProvider() is typed ActivatableProvider at the base-class level; this
    // constructor only ever handed it FormProvider instances, so the narrowing below is
    // always correct, just not something PHP's type system tracks across the base class.
    private function activeFormProvider(): FormProvider
    {
        /** @var FormProvider $provider */
        $provider = $this->requireActiveProvider();

        return $provider;
    }

    protected function multipleActiveException(): \RuntimeException
    {
        return new NoActiveFormPluginException(
            'Multiple form plugins are active at once. Loopress cannot tell which one is ' .
            'authoritative for your forms. Deactivate all but one and try again.',
        );
    }

    protected function noneActiveException(): \RuntimeException
    {
        return new NoActiveFormPluginException('No supported form plugin is active.');
    }

    // A content hash of everything a write actually persists for this form (its whole canonical
    // shape, minus `id`, which identifies the resource rather than describing its content, and
    // minus VOLATILE_KEYS above), opaque to callers, only ever compared for equality (see
    // update()'s $expectedRevision). Computed from whichever provider is currently active, same
    // as every other read in this service, so it always reflects that provider's real state.
    /** @param array<string, mixed> $form */
    private function revisionOf(array $form): string
    {
        unset($form['id']);
        foreach (self::VOLATILE_KEYS as $key) {
            unset($form[$key]);
        }

        return hash('sha256', (string) wp_json_encode($form));
    }

    /**
     * @param array<string, mixed> $form
     * @return array<string, mixed>
     */
    private function withRevision(array $form): array
    {
        $form['revision'] = $this->revisionOf($form);

        return $form;
    }

    private function assertRevisionMatches(int $id, string $expectedRevision): void
    {
        $current         = $this->get($id);
        $currentRevision = $current === null ? null : $current['revision'];

        if ($currentRevision !== $expectedRevision) {
            $found = $currentRevision === null ? 'it no longer exists' : "its revision is now \"{$currentRevision}\"";
            throw new StaleFormRevisionException(
                "Form #{$id} changed on WordPress since it was last read (expected revision \"{$expectedRevision}\", but {$found}). " .
                    'Re-read the form and try again.',
            );
        }
    }
}
