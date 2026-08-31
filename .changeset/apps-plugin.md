---
"@loopress/wordpress-plugin": minor
---

Add single-page app hosting (Loopress Full only). A built SPA bundle uploaded over the REST API lands in `wp-content/loopress/apps/<name>/`: assets are PUT one at a time (per-file size cap, only changed files sent), then one POST `/commit` flips the `loopress_apps` option so the front end serves the new build atomically. The `[loopress_app name="..."]` shortcode enqueues the build's content-hashed entry files and prints the mount point the SPA attaches to. Files from the immediately previous build are kept one generation so an in-flight visitor does not 404 on a lazy chunk. Hash routing only; static assets only (`.php` and other server-executable extensions are rejected). A read-only "Apps" tab in the plugin admin lists what has been deployed.
