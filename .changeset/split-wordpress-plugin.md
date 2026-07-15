---
"@loopress/wordpress-plugin": patch
---

The WordPress plugin now builds two editions from the same codebase: Loopress Light (`loopress-light.zip`, wordpress.org) keeps snippet synchronization (Code Snippets / WPCode); Loopress Full (`loopress-full.zip`, loopress.dev only) adds Composer dependency management (install, remove, audit, diagnostics, CLI sync) on top. Loopress Light contains no Composer code, even inactive; Loopress Full fully replaces Loopress Light on activation, both editions never run side by side. REST routes are unchanged (`loopress/v1/snippets*` and `loopress/v1/composer*`, the latter only present in Loopress Full), so existing CLI versions keep working.
