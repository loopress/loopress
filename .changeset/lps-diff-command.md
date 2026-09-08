---
"@loopress/cli": minor
---

Add `lps diff`: show what differs between your local tracked files and a WordPress environment, or between two environments with `--against`. Covers snippets, pages, forms, ACF, API routes, SEO, and Composer, comparing the normalized representation each resource round-trips (so serialization quirks like key order or a re-added `<?php` tag never show up as drift). Prints a git-style summary (`+` local-only, `-` remote-only, `~` changed, with a per-field list for objects and a line diff for file contents) and exits non-zero when anything differs, so it doubles as a CI drift gate. Plugins and themes keep their existing `lps plugin status` / `lps theme status`.
