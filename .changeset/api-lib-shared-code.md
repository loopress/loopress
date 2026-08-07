---
"@loopress/wordpress-plugin": patch
---

New `wp-content/loopress/lib/` directory, autoloaded under the `LoopressLib\` namespace (via the same Composer setup as `wp-content/loopress/vendor/`), for code shared between `api/` route files, permission checks and formatters reused across several files, without turning that shared code into a route itself. Existing sites get the new autoload entry migrated into `composer.json` automatically, with a `dump-autoload` to make it take effect immediately rather than only on the next unrelated Composer operation.
