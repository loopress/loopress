<?php

declare(strict_types=1);

namespace Loopress\Options\Service;

use Loopress\Infrastructure\PostByPath;
use Loopress\Options\Exception\UnresolvedOptionReferenceException;

/**
 * Post IDs stored inside an option (EDD's `edd_settings.purchase_page`, WooCommerce's
 * `woocommerce_shop_page_id`...) differ between environments. The option file declares which of
 * its values are such references, `"refs": {"purchase_page": "page"}`, and they travel as the
 * post's path instead, resolved again on the target like menu items (see PostByPath). This keeps
 * OptionsService free of any per-plugin knowledge: the file says what is a reference, not code.
 *
 * A ref key is a dot path into the value (`checkout.success_page`), or `.` for an option whose
 * whole value is the ID. An unset reference (0, '', null, or a missing key) passes through as is.
 */
final class OptionReferences
{
    public const ROOT = '.';

    /** @param array<string, string> $refs */
    public static function toPaths(mixed $value, array $refs): mixed
    {
        foreach ($refs as $path => $postType) {
            $value = self::mapAt($value, $path, static function (mixed $id) use ($path, $postType): mixed {
                if (!self::isSet($id)) {
                    return $id;
                }

                $post = is_numeric($id) ? get_post((int) $id) : null;
                if (!$post instanceof \WP_Post || $post->post_type !== $postType) {
                    throw new UnresolvedOptionReferenceException(
                        "\"{$path}\" holds \"{$postType}\" ID " . wp_json_encode($id) . ', which does not exist on this environment.',
                    );
                }

                return PostByPath::pathOf($post);
            });
        }

        return $value;
    }

    /** @param array<string, string> $refs */
    public static function toIds(mixed $value, array $refs): mixed
    {
        foreach ($refs as $path => $postType) {
            $value = self::mapAt($value, $path, static function (mixed $postPath) use ($path, $postType): mixed {
                if (!self::isSet($postPath)) {
                    return $postPath;
                }

                // An ID in the file would point at another environment's post: the exact bug
                // refs exist to avoid, so it is refused rather than written as is.
                if (!is_string($postPath) || is_numeric($postPath)) {
                    throw new UnresolvedOptionReferenceException(
                        "\"{$path}\" must hold a \"{$postType}\" path, not an ID. Run `lps option pull` to rewrite the file with paths.",
                    );
                }

                $post = PostByPath::find($postPath, $postType);
                if ($post === null) {
                    throw new UnresolvedOptionReferenceException(
                        "\"{$path}\" points to \"{$postType}\" \"{$postPath}\", which does not exist on this environment.",
                    );
                }

                return $post->ID;
            });
        }

        return $value;
    }

    private static function isSet(mixed $reference): bool
    {
        return $reference !== null && $reference !== '' && $reference !== 0 && $reference !== '0';
    }

    /** @param callable(mixed): mixed $map */
    private static function mapAt(mixed $value, string $path, callable $map): mixed
    {
        if ($path === self::ROOT) {
            return $map($value);
        }

        $key  = strstr($path, '.', true);
        $rest = $key === false ? null : substr($path, strlen($key) + 1);
        $key  = $key === false ? $path : $key;

        if (!is_array($value) || !array_key_exists($key, $value)) {
            return $value;
        }

        $value[$key] = $rest === null ? $map($value[$key]) : self::mapAt($value[$key], $rest, $map);

        return $value;
    }
}
