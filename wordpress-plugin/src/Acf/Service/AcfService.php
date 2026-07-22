<?php

declare(strict_types=1);

namespace Loopress\Acf\Service;

// ACF has exactly one backend (itself, or nothing), unlike snippets where two interchangeable
// plugins must be arbitrated (see SnippetProvider/SnippetService). No provider interface needed
// here, this talks to ACF's own global functions directly, the same shape as WPCodeSnippetProvider.
class AcfService
{
    public function isActive(): bool
    {
        return function_exists('acf_get_internal_post_type_posts');
    }

    // No requireRegisteredType() guard on the read paths (list/get/delete below): ACF's own
    // acf_get_internal_post_type_posts()/acf_get_internal_post_type()/acf_delete_internal_post_type()
    // already degrade gracefully to []/false/false when a type isn't registered (e.g. options
    // pages on ACF Free) — there's nothing to guard against, and throwing here would turn a
    // harmless "nothing to pull" into a hard failure that aborts an otherwise-successful
    // multi-type sync. Only upsert() needs the guard: acf_import_internal_post_type() is the one
    // function that silently returns its input unchanged instead of a falsy/empty result.

    /** @return array<int, array<string, mixed>> */
    public function list(string $postType): array
    {
        return array_map(
            fn(array $post): array => $this->prepareForExport($post, $postType),
            acf_get_internal_post_type_posts($postType),
        );
    }

    /** @return array<string, mixed>|null */
    public function get(string $postType, string $key): ?array
    {
        $post = acf_get_internal_post_type($key, $postType);

        return $post === false ? null : $this->prepareForExport($post, $postType);
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function upsert(string $postType, array $data): array
    {
        $this->requireRegisteredType($postType);

        $key = $data['key'] ?? null;
        if (!is_string($key) || $key === '') {
            throw new \RuntimeException('Missing or invalid "key" in the ACF object payload.');
        }

        $existing = acf_get_internal_post_type_post($key, $postType);
        if ($existing instanceof \WP_Post) {
            $data['ID'] = $existing->ID;
        }

        $imported = acf_import_internal_post_type($data, $postType);

        return $this->get($postType, (string) ($imported['key'] ?? $key)) ?? $this->prepareForExport($imported, $postType);
    }

    public function delete(string $postType, string $key): bool
    {
        return acf_delete_internal_post_type($key, $postType);
    }

    /** @param array<string, mixed> $post @return array<string, mixed> */
    private function prepareForExport(array $post, string $postType): array
    {
        if ($postType === 'acf-field-group') {
            $post['fields'] = acf_get_fields($post);
        }

        return acf_prepare_internal_post_type_for_export($post, $postType);
    }

    // Guards a silent no-op specific to upsert(): on ACF Free, acf_import_internal_post_type()
    // against an unregistered type (e.g. options pages, which require ACF PRO) returns the
    // input unchanged rather than failing, nothing is persisted but nothing signals that
    // either. The other acf_*_internal_post_type() functions don't need this guard, they
    // already degrade to a falsy/empty result on their own (see the comment above list()).
    private function requireRegisteredType(string $postType): void
    {
        if (!acf_get_internal_post_type_instance($postType)) {
            throw new \RuntimeException(esc_html(
                "The \"{$postType}\" ACF object type is not available on this site (ACF PRO may be required for options pages)."
            ));
        }
    }
}
