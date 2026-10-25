<?php

declare(strict_types=1);

namespace Loopress\PostTypes\Service;

use Loopress\PostTypes\Exception\InvalidDeclarationException;

// Post meta keys declared in `meta/<post-type>.json` (`lps meta push`), see
// AbstractDeclaredTypeService. The slug is the post type the keys belong to (`post` and `page`
// included), the arguments are `key => register_post_meta() arguments`. Only the keys are
// declared, never their values (content, like posts).
class PostMetaService extends AbstractDeclaredTypeService
{
    public const OPTION = 'loopress_post_meta';

    private const TYPES = ['string', 'boolean', 'integer', 'number', 'array', 'object'];

    /** @var array<string, array<string, array<string, mixed>>> post type => key => what WordPress held right after we registered it. */
    private array $ours = [];

    /**
     * Every meta key registered for a specific post type, with whether Loopress declared it, for
     * the read-only admin viewer and `lps meta list`. Keys registered for every post type at once
     * (no subtype) aren't listed: they aren't something a meta/ file could conflict with.
     *
     * @return list<array{postType: string, key: string, type: string, single: bool, showInRest: bool, source: string, acf: bool, managed: bool, conflict: bool}>
     */
    public function registered(): array
    {
        $stored = $this->stored();
        $acf    = function_exists('acf_get_field');

        $result    = [];
        // Keys, not values: get_post_types() is keyed by slug, and array_keys() is always array-key.
        $postTypes = array_map('strval', array_unique([...array_keys(get_post_types()), ...array_keys($stored)]));
        sort($postTypes);
        foreach ($postTypes as $postType) {
            foreach (get_registered_meta_keys('post', $postType) as $key => $args) {
                $key     = (string) $key;
                $ours    = ($this->ours[$postType][$key] ?? null) === $args;
                $managed = isset($stored[$postType][$key]);

                $result[] = [
                    'postType'   => $postType,
                    'key'        => $key,
                    'type'       => (string) ($args['type'] ?? 'string'),
                    'single'     => (bool) ($args['single'] ?? false),
                    'showInRest' => !empty($args['show_in_rest']),
                    'source'     => $ours ? 'loopress' : 'other',
                    // Information only: the same key as an ACF or SCF field never changes what Loopress does.
                    'acf'        => $acf && acf_get_field($key) !== false,
                    'managed'    => $managed,
                    'conflict'   => $managed && !$ours,
                ];
            }
        }

        return $result;
    }

    protected function option(): string
    {
        return self::OPTION;
    }

    protected function noun(): string
    {
        return 'Post meta';
    }

    protected function directory(): string
    {
        return 'meta';
    }

    // The slug is a post type: same limit as register_post_type().
    protected function maxSlugLength(): int
    {
        return 20;
    }

    // `post` and `page` are the point: meta goes on any post type, built-in ones included.
    protected function reservedSlugs(): array
    {
        return [];
    }

    // Checked per key in assertArgs(): the top-level keys are meta keys, not arguments.
    protected function codeArgs(): array
    {
        return [];
    }

    protected function arrayArgs(): array
    {
        return [];
    }

    protected function flushesRewriteRules(): bool
    {
        return false;
    }

    // Conflicts are per key, in registerOne(): another plugin's key never blocks the others.
    protected function exists(string $slug): bool
    {
        return false;
    }

    /** @param array<string, mixed> $args */
    protected function assertArgs(string $slug, array $args): void
    {
        foreach ($args as $key => $meta) {
            $key = (string) $key;
            if (preg_match('/^[a-zA-Z0-9_-]{1,255}$/', $key) !== 1) {
                $this->refuse($slug, "\"{$key}\" is not a valid meta key: 1 to 255 letters, digits, \"_\" or \"-\".");
            }

            if (!is_array($meta)) {
                $this->refuse($slug, "\"{$key}\" must be a JSON object of register_post_meta() arguments.");
            }

            $this->assertMetaArgs($slug, $key, $meta);
        }
    }

    /** @param array<mixed> $meta */
    private function assertMetaArgs(string $slug, string $key, array $meta): void
    {
        foreach (['sanitize_callback', 'auth_callback'] as $code) {
            if (array_key_exists($code, $meta)) {
                $this->refuse($slug, "\"{$key}\": \"{$code}\" runs PHP code, use a hook instead of a meta/ file for it.");
            }
        }

        $type = $meta['type'] ?? null;
        if (!in_array($type, self::TYPES, true)) {
            $this->refuse($slug, "\"{$key}\": \"type\" must be one of " . implode(', ', self::TYPES) . '.');
        }

        if (array_key_exists('single', $meta) && !is_bool($meta['single'])) {
            $this->refuse($slug, "\"{$key}\": \"single\" must be true or false.");
        }

        $this->assertShowInRest($slug, $key, $type, $meta['show_in_rest'] ?? false);

        if (array_key_exists('default', $meta) && !$this->matchesType($meta['default'], $type)) {
            $this->refuse($slug, "\"{$key}\": \"default\" must be a {$type}.");
        }
    }

    private function assertShowInRest(string $slug, string $key, string $type, mixed $rest): void
    {
        if (!is_bool($rest) && !is_array($rest)) {
            $this->refuse($slug, "\"{$key}\": \"show_in_rest\" must be true, false or an object.");
        }

        // WordPress calls it with each value on every REST read (WP_REST_Meta_Fields).
        if (is_array($rest) && array_key_exists('prepare_callback', $rest)) {
            $this->refuse($slug, "\"{$key}\": \"show_in_rest.prepare_callback\" runs PHP code, use a hook instead of a meta/ file for it.");
        }

        // WordPress silently leaves an array or object key out of REST without a schema.
        if ($rest !== false && ($type === 'array' || $type === 'object') && !is_array($rest['schema'] ?? null)) {
            $this->refuse($slug, "\"{$key}\": a {$type} exposed in REST needs \"show_in_rest\": { \"schema\": {...} }.");
        }
    }

    /**
     * @param non-empty-lowercase-string $slug
     * @param array<string, mixed> $args
     */
    protected function registerOne(string $slug, array $args): mixed
    {
        foreach ($args as $key => $meta) {
            $key = (string) $key;
            // Never overwrite a key something else registered first: reported as a conflict.
            if (!is_array($meta) || registered_meta_key_exists('post', $key, $slug)) {
                continue;
            }

            if (($meta['type'] ?? null) === 'integer' && is_float($meta['default'] ?? null)) {
                $meta['default'] = (int) $meta['default'];
            }

            try {
                if (register_post_meta($slug, $key, $meta)) {
                    $this->ours[$slug][$key] = get_registered_meta_keys('post', $slug)[$key] ?? [];
                }
            } catch (\Throwable) {
                continue;
            }
        }

        return null;
    }

    private function matchesType(mixed $value, string $type): bool
    {
        return match ($type) {
            'string' => is_string($value),
            'boolean' => is_bool($value),
            // A whole float too (`1.0`, `1e3` decode as floats): JavaScript can't tell them from `1`, so
            // `lps validate` accepts them. Cast back to int in registerOne().
            'integer' => is_int($value) || (is_float($value) && floor($value) === $value),
            'number' => is_int($value) || is_float($value),
            default => is_array($value),
        };
    }

    private function refuse(string $slug, string $message): never
    {
        // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML (see phpcs.xml.dist).
        throw new InvalidDeclarationException("Post meta \"{$slug}\": {$message}");
    }
}
