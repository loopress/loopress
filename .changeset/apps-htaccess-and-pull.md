---
"@loopress/cli": patch
"@loopress/wordpress-plugin": patch
---

`lps app pull` no longer overwrites an existing `loopress.app.json`: files go into its `assetsDir` and its `entry` is kept, so an app with a custom build folder or an explicit entry can still be pushed after a pull. The `.htaccess` files Loopress writes under `wp-content/loopress/` (`apps/`, `vendor/`) are now updated when a new plugin version changes them (for example the `nosniff` header on apps), instead of only being written once. A file whose first `# Loopress:` line was removed is left alone.
