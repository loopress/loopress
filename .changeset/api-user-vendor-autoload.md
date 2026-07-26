---
"@loopress/wordpress-plugin": patch
---

`api/` route files can now `use` packages installed via the Composer feature (`wp-content/loopress/vendor/`) directly, without a manual `require_once` of the autoloader. Previously this only happened to work by coincidence, as a side effect of the unrelated Dependencies feature loading it first for its own diagnostics; `RouteLoader` now loads it explicitly and independently, and a broken user autoloader is caught and logged instead of breaking every `api/` route.
