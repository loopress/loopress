<?php

declare(strict_types=1);

namespace Loopress\Form\Service;

use Loopress\Form\Contract\FormProvider;
use Loopress\Form\Exception\NoActiveFormPluginException;

class FormService
{
    /** @var FormProvider[] */
    private array $providers;

    public function __construct(FormProvider ...$providers)
    {
        $this->providers = $providers;
    }

    public function isActive(): bool
    {
        return $this->activeProviders() !== [];
    }

    /** @return array<int, array<string, mixed>> */
    public function list(): array
    {
        return $this->requireActiveProvider()->list();
    }

    /** @return array<string, mixed>|null */
    public function get(int $id): ?array
    {
        return $this->requireActiveProvider()->get($id);
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function create(array $data): array
    {
        return $this->requireActiveProvider()->create($data);
    }

    /** @param array<string, mixed> $data @return array<string, mixed>|null */
    public function update(int $id, array $data): ?array
    {
        return $this->requireActiveProvider()->update($id, $data);
    }

    public function delete(int $id): bool
    {
        return $this->requireActiveProvider()->delete($id);
    }

    /** @return FormProvider[] */
    private function activeProviders(): array
    {
        return array_values(array_filter(
            $this->providers,
            static fn(FormProvider $provider): bool => $provider->isActive(),
        ));
    }

    // Requires exactly one active form plugin, same reasoning as SnippetService: if two are
    // active at once, we cannot silently pick one, that would sync forms into whichever plugin
    // happens to win, with no way for the user to know which storage is authoritative.
    private function requireActiveProvider(): FormProvider
    {
        $active = $this->activeProviders();

        if (count($active) > 1) {
            throw new NoActiveFormPluginException(
                'Multiple form plugins are active at once. Loopress cannot tell which one is ' .
                'authoritative for your forms. Deactivate all but one and try again.',
            );
        }

        return $active[0] ?? throw new NoActiveFormPluginException('No supported form plugin is active.');
    }
}
