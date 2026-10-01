---
"@loopress/cli": patch
"@loopress/wordpress-plugin": patch
---

Template and part file names now accept `_`, like the post type and taxonomy slugs the template hierarchy embeds: `templates/taxonomy-download_tag.html` or `templates/single-my_type.html` no longer stop `lps theme template push`. Page file names keep their stricter rule.
