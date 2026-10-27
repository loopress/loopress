---
"@loopress/cli": minor
"@loopress/mcp": minor
"@loopress/wordpress-plugin": minor
---

Dynamic blocks (Loopress Full): `lps block push | pull | list | diff | rollback | rm` and the `block_*` MCP tools deploy `blocks/<slug>/` folders (`block.json` + `render.php`, optionally `style.css` and `view.js`) registered as the server-rendered block `loopress/<slug>`. Each block's CSS and JS load only where it renders, it works inside a Query Loop, and a `render.php` that throws renders nothing instead of breaking the page. `lps push`, `lps pull`, `lps diff` and `lps validate` include them.
