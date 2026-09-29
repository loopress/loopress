---
"@loopress/cli": minor
"@loopress/wordpress-plugin": minor
---

Apps can now stop other sites from embedding their files: set `"crossOrigin": "same-origin"` (or `"same-site"`) in `loopress.app.json`, and on `lps app push` the plugin writes an `.htaccess` in the app's folder that sends `Cross-Origin-Resource-Policy` with every file. It overrides a site-wide `cross-origin` value set by a security plugin, and is removed when the setting is dropped. `lps app pull` keeps the setting, and `lps app push` warns when the plugin is too old to apply it. Apache and LiteSpeed only (nginx ignores `.htaccess`).
