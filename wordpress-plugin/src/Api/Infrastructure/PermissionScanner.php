<?php

declare(strict_types=1);

namespace Loopress\Api\Infrastructure;

/**
 * Answers one question about a route file without ever require()ing or evaluating it: does it
 * declare `#[Permission(public: true)]`, the single attribute that turns a route into
 * unauthenticated server-side code execution (see RouteLoader::permissionFromAttribute() and
 * F1 in the pentest report)?
 *
 * Deliberately narrow and lexical: it matches the attribute by the last segment of its name
 * (`Permission`, however it is namespaced or written with a leading backslash), on the class or
 * on any method, whether `public` is passed by name (`public: true`) or as the first positional
 * argument. It does NOT see an aliased import of the attribute (`use Permission as P;
 * #[P(public: true)]`) or a `permission()` method that simply returns true, both of which are
 * documented as blind spots: this powers an advisory badge and a push warning, not an
 * authorization decision.
 */
final class PermissionScanner
{
    public static function declaresOpenRoute(string $content): bool
    {
        // Malformed input is expected here (an unverified push, or a file mid-edit), the same
        // way ClassScanner silences token_get_all(): a lex failure just means "can't tell".
        $tokens = @token_get_all($content); // phpcs:ignore WordPress.PHP.NoSilencedErrors
        $count  = count($tokens);

        for ($i = 0; $i < $count; $i++) {
            if (!is_array($tokens[$i]) || $tokens[$i][0] !== T_ATTRIBUTE) {
                continue;
            }

            // T_ATTRIBUTE is the "#[" opener. Accumulate the raw text of following tokens
            // until the bracket it opened is balanced again: that span is the whole
            // attribute group, e.g. "#[Route('/x'), Permission(public: true)]". No skip-ahead
            // afterwards: attributes can't nest, so the consumed tokens are never T_ATTRIBUTE
            // and the outer loop steps over them for free.
            $group = '';
            $depth = 0;
            for ($j = $i; $j < $count; $j++) {
                $text   = is_array($tokens[$j]) ? $tokens[$j][1] : $tokens[$j];
                $group .= $text;
                $depth += substr_count($text, '[') - substr_count($text, ']');
                if ($depth <= 0 && $j > $i) {
                    break;
                }
            }

            if (self::groupOpensPermission($group)) {
                return true;
            }
        }

        return false;
    }

    private static function groupOpensPermission(string $group): bool
    {
        // Each comma-separated attribute in the group: a name whose last segment is
        // "Permission", then its (...) argument list. `[^)]*` is enough because a Permission
        // attribute's arguments never contain a nested "(" (public/capability/callback).
        $found = preg_match_all(
            '/(?:^|[\[,])\s*\\\\?(?:[A-Za-z_]\w*\\\\)*Permission\s*\(([^)]*)\)/',
            $group,
            $matches,
        );
        if (!$found) {
            return false;
        }

        foreach ($matches[1] as $args) {
            if (preg_match('/\bpublic\s*:\s*true\b/i', $args) === 1) {
                return true;
            }

            // `public` is the first constructor parameter, so a bare `true` first positional
            // argument is the same thing.
            $firstArg = trim(explode(',', $args)[0]);
            if (strcasecmp($firstArg, 'true') === 0) {
                return true;
            }
        }

        return false;
    }
}
