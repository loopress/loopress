<?php

declare(strict_types=1);

namespace Loopress\Options\Exception;

// Thrown when Loopress refuses to read or write an option for safety, not because of a
// resource conflict (that is ReservedOptionNameException). Two cases:
//   - reading a name that looks like a stored secret (API keys, passwords, tokens, salts):
//     a leaked deployment token must not double as "read every secret in wp_options over
//     HTTP" (F10). Best-effort: a name-pattern denylist, adjustable via the
//     `loopress_option_readable` filter.
//   - writing a core option whose value changes site behaviour (default_role, siteurl, cron,
//     ...) or any `loopress_*` option (owned by the plugin's own settings): a generic CRUD
//     primitive should not be an escalation path (F11). Adjustable via
//     `loopress_option_writable`.
// Maps to HTTP 403.
class ProtectedOptionException extends \RuntimeException {}
