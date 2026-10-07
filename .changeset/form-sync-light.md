---
"@loopress/wordpress-plugin": minor
---

Form sync (WPForms) now ships in Loopress Light too, not only Loopress Full: `lps form pull` / `push` / `list` work against a site running the wordpress.org edition. Every value in a pushed form (field labels, descriptions, the HTML field's content) is now stripped of active content, the same way ACF and SEO already were: script and style tags, inline event handlers, and `javascript:` URLs are removed, other HTML is kept as is.
