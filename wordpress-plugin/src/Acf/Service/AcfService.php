<?php

declare(strict_types=1);

namespace Loopress\Acf\Service;

use Loopress\Acf\Exception\StaleAcfRevisionException;
use Loopress\RestApi\SyncSanitizer;

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
    // already degrade gracefully to []/false/false when a type isn't registered (e.g. an options
    // page nobody called acf_add_options_page() for). There's nothing to guard against, and
    // throwing here would turn a harmless "nothing to pull" into a hard failure that aborts an
    // otherwise-successful multi-type sync. Only upsert() needs the guard: acf_import_internal_post_type()
    // is the one function that silently returns its input unchanged instead of a falsy/empty result.

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

        if ($post === false) {
            return null;
        }

        $exported             = $this->prepareForExport($post, $postType);
        $exported['revision'] = $this->revisionOf($exported);

        return $exported;
    }

    /**
     * @param array<string, mixed> $data
     * @param string|null $expectedRevision When given, the write is refused (#234) unless it
     *        still matches the object's current exported revision, i.e. nothing else changed it
     *        since the caller last read it via get(). A genuinely new object (no post found by
     *        `key` yet) has a null current revision, so an $expectedRevision given for one is
     *        itself a mismatch, same framing as OptionsService's "it no longer exists" case.
     *        This is optimistic concurrency control (a check immediately followed by the write,
     *        both within this one request), not a database-level atomic compare-and-swap.
     * @return array<string, mixed>
     */
    public function upsert(string $postType, array $data, ?string $expectedRevision = null): array
    {
        $this->requireRegisteredType($postType);

        $key = $data['key'] ?? null;
        if (!is_string($key) || $key === '') {
            throw new \RuntimeException('Missing or invalid "key" in the ACF object payload.');
        }

        if ($expectedRevision !== null) {
            $this->assertRevisionMatches($postType, $key, $expectedRevision);
        }

        $existing = acf_get_internal_post_type_post($key, $postType);
        if ($existing instanceof \WP_Post) {
            $data['ID'] = $existing->ID;
        }

        // Field labels, instructions, choices and a Message field's content are rendered
        // (largely un-escaped) in the block editor for every user who opens a post using this
        // group: strip active content from every string in the import payload so a pushed
        // `<script>`/`onerror=` there can't execute in an admin session (F12). `key`/`ID` and
        // other identifiers carry no active content, so they pass through unchanged.
        $imported = acf_import_internal_post_type(SyncSanitizer::deepArray($data), $postType);

        // get() re-reads the just-imported object so the response reflects ACF's own
        // server-computed fields (e.g. `modified`), same as before this existed; the fallback
        // below only fires if that re-read can't find it (unexpected, but not this method's
        // concern to diagnose), and still needs its own revision computed the same way get()
        // would, so a caller can't tell the two paths apart from the shape of the response.
        $result = $this->get($postType, (string) ($imported['key'] ?? $key));
        if ($result !== null) {
            return $result;
        }

        $fallback             = $this->prepareForExport($imported, $postType);
        $fallback['revision'] = $this->revisionOf($fallback);

        return $fallback;
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

    // A content hash of the exported object, excluding fields ACF itself computes/stamps rather
    // than ones a write actually changes: `modified` is a unix timestamp ACF bumps on every
    // save, already excluded the same way by the CLI's resource-state.ts (ACF_VOLATILE_KEYS)
    // when it diffs local files against remote state, so a push that only round-trips the
    // fields that matter still gets a stable revision to condition its own next write on.
    // wp_json_encode() over a raw json_encode() call: WordPress.WP.AlternativeFunctions flags
    // the latter, and wp_json_encode() is WordPress core's own wrapper (see OptionsService's
    // revisionOf() for the same choice). sha256, not md5: this is a plain change-detection tag,
    // never a security control, but sha256 is exactly as cheap here and isn't flagged as a weak
    // hashing algorithm by a security scanner.
    /** @param array<string, mixed> $exported */
    private function revisionOf(array $exported): string
    {
        unset($exported['modified']);

        return hash('sha256', (string) wp_json_encode($exported));
    }

    // Mirrors OptionsService::assertRevisionMatches(): re-reads the object's current state
    // (rather than trusting anything computed earlier in this request) and refuses the write
    // unless it still matches. A `key` with no post behind it yet has a null current revision,
    // so an $expectedRevision given for one always mismatches; the normal `lps acf push` path
    // for a first-time create simply never sends one (see cli/src/commands/acf/push.ts).
    private function assertRevisionMatches(string $postType, string $key, string $expectedRevision): void
    {
        $current         = $this->get($postType, $key);
        $currentRevision = $current === null ? null : $current['revision'];

        if ($currentRevision !== $expectedRevision) {
            $found = $currentRevision === null ? 'it no longer exists' : "its revision is now \"{$currentRevision}\"";
            throw new StaleAcfRevisionException(
                "\"{$key}\" changed on WordPress since it was last read (expected revision \"{$expectedRevision}\", but {$found}). " .
                    'Re-read the object and try again.',
            );
        }
    }

    // Guards a silent no-op specific to upsert(): acf_import_internal_post_type() against an
    // unregistered type (e.g. an options page nobody called acf_add_options_page() for) returns
    // the input unchanged rather than failing, nothing is persisted but nothing signals that
    // either. The other acf_*_internal_post_type() functions don't need this guard, they
    // already degrade to a falsy/empty result on their own (see the comment above list()).
    //
    // Options pages are not PRO-gated: confirmed working with Secure Custom Fields (the free
    // fork recommended by WordPress.org) during the 2026-07-31 QA pass. Not verified against
    // classic ACF Free.
    private function requireRegisteredType(string $postType): void
    {
        if (!acf_get_internal_post_type_instance($postType)) {
            throw new \RuntimeException(esc_html(
                "The \"{$postType}\" ACF object type is not registered on this site. If this is an options page, make sure it was added with acf_add_options_page()."
            ));
        }
    }
}
