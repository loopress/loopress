---
"@loopress/cli": minor
---

Add `lps seo pull`, `lps seo push`, and `lps seo list` to sync SEO configuration as JSON files in Git: site-wide Titles & Meta settings (including per-post-type schema defaults), per-post SEO meta, and redirects. Works with either RankMath or Yoast SEO, whichever is active on the site, exactly one must be active, if both are active at once or neither is, every `seo` command fails with a clear error instead of guessing which plugin's data is authoritative. Redirects are only available when RankMath is active: Yoast's equivalent is a Premium-only feature this doesn't support, `seo pull` skips them quietly when unsupported and `seo push` fails clearly per file if you have local redirect files the active plugin can't take.
