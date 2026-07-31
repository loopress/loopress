---
"@loopress/wordpress-plugin": patch
---

Bug fixes from the QA backlog (5th pass), lot 1:

- SEO sync (`YoastService`/`RankMathService`) no longer writes arbitrary metadata keys from the request body: the write loop is now bounded to the provider's own prefix, symmetrically with the delete loop right below it. Not exploitable beyond the existing `manage_options` trust boundary, but closes a defense-in-depth gap where a bug elsewhere, or a future feature reusing this endpoint, could silently overwrite metadata belonging to another plugin (ACF, FluentCRM, etc.) on a published post or page.
- `uninstall.php` no longer fatals when `vendor/` is missing (a dev checkout symlinked into `wp-content/plugins/` without `composer install`). The cleanup was already best-effort, it's now skipped gracefully instead of fataling.
- Corrected an outdated claim that ACF options pages require ACF PRO, in both a code comment and the error message shown when an object type isn't registered. Confirmed working with Secure Custom Fields (the free fork recommended by WordPress.org) during the 5th QA pass; the error message now points at the real fix (`acf_add_options_page()`) instead of a PRO requirement.
