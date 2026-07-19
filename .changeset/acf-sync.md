---
"@loopress/cli": minor
"@loopress/wordpress-plugin": patch
---

Add `lps acf pull`/`lps acf push`/`lps acf list`, which sync ACF (Advanced Custom Fields) field groups, post types, taxonomies, and options pages between the WordPress site and local JSON files, the same git-based workflow already available for snippets and Composer dependencies.

Backed by new `loopress/v1/acf/*` endpoints on the WordPress plugin. Requires ACF to be installed and active; options pages additionally require ACF PRO.
