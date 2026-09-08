---
"@loopress/cli": minor
---

Add per-resource diff commands and scoping flags for `lps diff`. `lps snippet diff`, `lps page diff`, `lps form diff`, `lps acf diff`, `lps api diff`, and `lps seo diff` each run the same normalized comparison as `lps diff` but for a single resource, accept the resource's `[PATH]` override, and support `--env` / `--against` / `--json`. `lps diff` itself gains `--only <resource>...` and `--skip <resource>...` to narrow the run (useful when a project only tracks some resource types, so the untracked ones stop showing as drift).
