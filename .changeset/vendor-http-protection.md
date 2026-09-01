---
"@loopress/wordpress-plugin": patch
---

Fixed `wp-content/loopress/vendor/` (the site-wide Composer dependencies managed by the Dependencies feature) being fully reachable over HTTP: unlike the plugin's own bundled `vendor/`, it had no `.htaccess` or anti-listing `index.php` at all, exposing `vendor/composer/installed.json` (the full dependency tree and exact versions) to anyone who requested it. It now gets the same deny-all `.htaccess` written on first use. Since `.htaccess` only works where the webserver actually reads it (nginx ignores it outright, and some Apache hosts disable `AllowOverride`), the Composer diagnostics panel now also makes a live HTTP check against that file and surfaces a `vendor_publicly_accessible` warning if it's still reachable.
