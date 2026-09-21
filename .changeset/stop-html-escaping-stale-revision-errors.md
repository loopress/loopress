---
"@loopress/wordpress-plugin": patch
---

Fixes the stale-revision (412) error message showing literal `&quot;` instead of quotes in the CLI's terminal output. The message is only ever thrown into a REST JSON body and then read as `lps` stderr, never rendered as HTML, so it should not have been run through `esc_html()`. Affects options, snippets, forms, ACF objects, menus, and SEO post meta/settings.
