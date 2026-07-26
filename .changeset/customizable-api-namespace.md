---
"@loopress/wordpress-plugin": patch
---

The REST namespace `api/` route files register under (`loopress-api/v1` by default, e.g. `hello.php` becomes `loopress-api/v1/hello`) is now configurable from the plugin's Settings tab instead of hardcoded. Existing sites keep the same default namespace and routes; only sites that explicitly set a custom value change behavior.
