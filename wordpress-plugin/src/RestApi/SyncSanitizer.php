<?php

declare(strict_types=1);

namespace Loopress\RestApi;

// Neutralises the active-content vectors (script/style blocks, inline event handlers,
// javascript:/data:text-html URLs) in values that the sync resources write straight into
// storage that other plugins later render: SEO settings and post meta into <head>, ACF
// labels/instructions/message fields into the block editor (F12). Deliberately targeted, not
// wp_kses(): benign HTML and plain text pass through byte-for-byte, so a pull -> edit -> push
// round trip stays stable and `lps <resource> diff` does not report permanent drift on content
// that was never an attack. Lives in Loopress\RestApi (not a Full-only src/ dir, see
// scripts/build-flavor.cjs) so any edition can use it, same as MapsServiceExceptions.
final class SyncSanitizer
{
    public static function stripActiveContent(string $value): string
    {
        // <script>...</script> / <style>...</style>, including one left unclosed at end of input.
        $value = preg_replace('#<(script|style)\b[^>]*>.*?(?:</\1\s*>|\z)#is', '', $value) ?? $value;
        // Any stray opening/closing <script>/<style> tag the block match above did not pair.
        $value = preg_replace('#</?(?:script|style)\b[^>]*>#i', '', $value) ?? $value;
        // Inline event handlers: onerror=..., onclick="...", onload='...' (quoted or bare).
        $value = preg_replace('#\son[a-z]+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)#i', '', $value) ?? $value;
        // javascript:/vbscript:/data:text/html right after an attribute's `=` (optionally quoted).
        $value = preg_replace(
            '#(=\s*["\']?\s*)(?:javascript|vbscript|data\s*:\s*text/html)\s*:#i',
            '$1',
            $value,
        ) ?? $value;

        return $value;
    }

    /**
     * Applies stripActiveContent() to every string leaf, recursing into arrays. Array keys are
     * left untouched: they are identifiers, never rendered.
     *
     * @param mixed $value
     * @return mixed
     */
    public static function deep(mixed $value): mixed
    {
        if (is_string($value)) {
            return self::stripActiveContent($value);
        }

        if (is_array($value)) {
            return array_map(self::deep(...), $value);
        }

        return $value;
    }

    // Same as deep(), typed for the common case of a known-array payload (an option value, an
    // ACF import object) so callers and the static analysers keep the array type.
    /**
     * @param array<array-key, mixed> $value
     * @return array<array-key, mixed>
     */
    public static function deepArray(array $value): array
    {
        return array_map(self::deep(...), $value);
    }
}
