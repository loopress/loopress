<?php

declare(strict_types=1);

namespace Loopress\Form\Service;

use Loopress\Form\Contract\FormProvider;
use Loopress\Form\Exception\NoActiveFormPluginException;
use Loopress\Service\AbstractSingleProviderService;

class FormService extends AbstractSingleProviderService
{
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
        return $this->activeFormProvider()->get($id);
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function create(array $data): array
    {
        return $this->activeFormProvider()->create($data);
    }

    /** @param array<string, mixed> $data @return array<string, mixed>|null */
    public function update(int $id, array $data): ?array
    {
        return $this->activeFormProvider()->update($id, $data);
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
}
