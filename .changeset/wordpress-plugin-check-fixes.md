---
"@loopress/wordpress-plugin": patch
---

Fixed all errors reported by the WordPress Plugin Check tool: escaped dynamic exception messages across the Composer and snippet provider services, added the missing `ABSPATH` direct-access guard in `loopress.php`, removed the tracked `assets/.gitkeep` hidden file (the `prebuild` script now creates the directory itself), and bumped the readme's "Tested up to" header to 7.0.
