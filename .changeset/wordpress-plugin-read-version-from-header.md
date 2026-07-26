---
"@loopress/wordpress-plugin": patch
---

`LOOPRESS_VERSION` is now read from the plugin's own `Version:` header via `get_file_data()` instead of a hardcoded literal, removing a second copy that `scripts/sync-version.js` had to keep in sync and could drift from the header.
