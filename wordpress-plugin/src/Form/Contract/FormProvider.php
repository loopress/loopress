<?php

declare(strict_types=1);

namespace Loopress\Form\Contract;

/**
 * One implementation per WordPress form-builder plugin (WPForms today, others later, same
 * shape as Loopress\Snippets\Contract\SnippetProvider for Code Snippets/WPCode). Deliberately
 * not a canonical value object like SnippetData: unlike snippets (code + placement metadata,
 * nearly identical across backends), form builder plugins have wildly different internal data
 * models (WPForms' nested fields/settings/notifications/confirmations blob vs. e.g. Contact
 * Form 7's shortcode-tag template), so each provider passes its own plugin's native shape
 * through untouched, same reasoning as AcfService for ACF's own export format.
 */
interface FormProvider
{
    public function isActive(): bool;

    /** @return array<int, array<string, mixed>> */
    public function list(): array;

    /** @return array<string, mixed>|null */
    public function get(int $id): ?array;

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function create(array $data): array;

    /** @param array<string, mixed> $data @return array<string, mixed>|null */
    public function update(int $id, array $data): ?array;

    public function delete(int $id): bool;
}
