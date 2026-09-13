<?php

declare(strict_types=1);

namespace Loopress\Hooks\Infrastructure;

/**
 * Lists the #[Action]/#[Filter]/#[Cron] bindings a hooks/ file declares, purely from its source
 * text, without ever require()ing or evaluating it (same reasoning as PermissionScanner: this
 * powers an admin-only display, not a registration decision, HookLoader is what actually binds
 * anything real at boot). Used by HookFilesController to show which WP hook each file is
 * attached to, since that name is arbitrary (an attribute argument), unlike an API route's path,
 * which is mechanically derived from the filename alone.
 *
 * Same blind spots as PermissionScanner: an aliased import of the attribute, or one written
 * behind a variable/constant, won't match. Advisory only.
 */
final class HookAttributeScanner
{
    /** @return array<int, array{type: 'action'|'filter'|'cron', hook: ?string, recurrence: ?string}> */
    public static function bindingsIn(string $content): array
    {
        $tokens   = @token_get_all($content); // phpcs:ignore WordPress.PHP.NoSilencedErrors -- malformed input is expected (an unverified push/boot file), not a bug here
        $count    = count($tokens);
        $bindings = [];

        for ($i = 0; $i < $count; $i++) {
            if (!is_array($tokens[$i]) || $tokens[$i][0] !== T_ATTRIBUTE) {
                continue;
            }

            // T_ATTRIBUTE is the "#[" opener. Accumulate the raw text of following tokens
            // until the bracket it opened is balanced again: that span is the whole attribute
            // group, e.g. "#[Action('init'), Filter('the_content')]". Same technique as
            // PermissionScanner::declaresOpenRoute().
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

            array_push($bindings, ...self::bindingsInGroup($group));
        }

        return $bindings;
    }

    /** @return array<int, array{type: 'action'|'filter'|'cron', hook: ?string, recurrence: ?string}> */
    private static function bindingsInGroup(string $group): array
    {
        // Each comma-separated attribute in the group: a name whose last segment is Action,
        // Filter or Cron, then its (...) argument list. `[^)]*` is enough because none of these
        // attributes' arguments ever contain a nested "(" (hook/priority/acceptedArgs/
        // recurrence are all scalar string/int literals).
        preg_match_all(
            '/(?:^|[\[,])\s*\\\\?(?:[A-Za-z_]\w*\\\\)*(Action|Filter|Cron)\s*\(([^)]*)\)/',
            $group,
            $matches,
            PREG_SET_ORDER,
        );

        $found = [];
        foreach ($matches as $match) {
            // strtolower($match[1]) would widen to the generic `lowercase-string`: Psalm can't
            // narrow a preg_match_all() capture group, only a literal match arm, back down to
            // the 'action'|'filter'|'cron' union the return type declares.
            $type = match ($match[1]) {
                'Action' => 'action',
                'Filter' => 'filter',
                'Cron' => 'cron',
            };
            $args = $match[2];

            $found[] = $type === 'cron'
                // Cron's constructor is (string $recurrence, ?string $hook = null).
                ? ['type' => 'cron', 'hook' => self::stringArg($args, 'hook', 1), 'recurrence' => self::stringArg($args, 'recurrence', 0)]
                // Action/Filter's constructor both start with (string $hook, ...).
                : ['type' => $type, 'hook' => self::stringArg($args, 'hook', 0), 'recurrence' => null];
        }

        return $found;
    }

    // Reads one string-literal constructor argument, whether passed by name ("hook: 'x'") or
    // positionally at the given index.
    private static function stringArg(string $args, string $name, int $position): ?string
    {
        if (preg_match('/\b' . preg_quote($name, '/') . '\s*:\s*([\'"])((?:(?!\1).)*)\1/', $args, $m) === 1) {
            return $m[2];
        }

        $parts = array_map('trim', explode(',', $args));
        if (isset($parts[$position]) && preg_match('/^([\'"])((?:(?!\1).)*)\1$/', $parts[$position], $m) === 1) {
            return $m[2];
        }

        return null;
    }
}
