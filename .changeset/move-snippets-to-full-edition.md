---
"@loopress/wordpress-plugin": patch
---

Code snippet sync (Code Snippets, WPCode) moved from Loopress Light to Loopress Full, alongside Composer dependency management. wordpress.org's final decision on the appeal rejected Loopress Light's snippet sync REST endpoints as a remote arbitrary-code-deployment mechanism, regardless of the authentication and capability checks in front of them. Loopress Light now syncs only ACF field groups and SEO settings (Yoast, RankMath); `lps snippet pull`/`push` and the snippet migration UI require Loopress Full. REST routes are unchanged (`loopress/v1/snippets*`), so existing CLI versions keep working against Loopress Full.
