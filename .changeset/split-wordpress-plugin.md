---
"@loopress/wordpress-plugin": minor
---

The WordPress plugin now builds two editions from the same codebase: the free edition (`loopress.zip`, wordpress.org) keeps snippet synchronization (Code Snippets / WPCode); the Plus edition (`loopress-plus.zip`, loopress.dev only) adds Composer dependency management (install, remove, audit, diagnostics, CLI sync) on top. The free artifact contains no Composer code, even inactive; Plus fully replaces the free edition on activation, both editions never run side by side. REST routes are unchanged (`loopress/v1/snippets*` and `loopress/v1/composer*`, the latter only present in Plus), so existing CLI versions keep working.
