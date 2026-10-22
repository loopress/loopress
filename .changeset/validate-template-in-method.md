---
"@loopress/cli": patch
"@loopress/mcp": patch
---

`lps validate` and `lps hook push` no longer reject a hook whose method outputs a template (`?> <p>...</p> <?php` inside the class) as "code outside the class": only inline HTML at the top level of the file is flagged, as the plugin does.
