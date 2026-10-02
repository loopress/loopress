---
"@loopress/cli": patch
"@loopress/mcp": patch
---

A push's `--dry-run` now reads the target site, the same way `lps diff` does, instead of staying local. It used to announce ACF, SEO, forms or snippets as pushed on a site that would refuse them (plugin missing), and the real push then failed; the dry run now fails the same way. The MCP server's preview and pre-apply check, built on the dry run, benefit too. `lps push --dry-run` also says "would push" instead of "pushed".
