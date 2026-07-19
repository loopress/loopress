<?php

namespace Loopress\Service;

// ACF has exactly one backend (itself, or nothing), unlike snippets where two interchangeable
// plugins must be arbitrated (see SnippetProvider/SnippetService). No provider interface needed
// here, this talks to ACF's own global functions directly, the same shape as WPCodeSnippetProvider.
class AcfService
{
    public function isActive(): bool
    {
        return function_exists('acf_get_internal_post_type_posts');
    }

    /** @return array<int, array<string, mixed>> */
    public function list(string $postType): array
    {
        $this->requireRegisteredType($postType);

        return array_map(
            fn(array $post): array => $this->prepareForExport($post, $postType),
            acf_get_internal_post_type_posts($postType),
        );
    }

    /** @return array<string, mixed>|null */
    public function get(string $postType, string $key): ?array
    {
        $this->requireRegisteredType($postType);

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
        $this->requireRegisteredType($postType);

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

    // Guards a silent no-op: on ACF Free, acf_import_internal_post_type() (and the other
    // acf_*_internal_post_type() functions) against an unregistered type (e.g. options pages,
    // which require ACF PRO) return the input unchanged rather than failing, nothing is
    // persisted but nothing signals that either. Without this check, a push against an
    // unavailable type would look like a success.
    private function requireRegisteredType(string $postType): void
    {
        if (!acf_get_internal_post_type_instance($postType)) {
            throw new \RuntimeException(esc_html(
                "The \"{$postType}\" ACF object type is not available on this site (ACF PRO may be required for options pages)."
            ));
        }
    }
}
