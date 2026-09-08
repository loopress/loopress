---
"@loopress/cli": minor
---

Add per-resource diff commands, scoping flags, and harden `lps diff` for CI use.

- `lps snippet diff`, `lps form diff`, `lps acf diff`, `lps api diff`, `lps seo diff`: run the same normalized comparison as `lps diff` for a single resource, accept the resource's `[PATH]` override, and support `--env` / `--against` / `--json`.
- `lps diff` gains `--only <resource>...` and `--skip <resource>...` to narrow the run (a project that only tracks some resource types can stop the rest showing as drift).
- Form and ACF comparisons now ignore server-rewritten save timestamps (`modified`, `modified_gmt`), the same way redirect `hits` is already ignored, so a diff between two independently-configured environments reports real differences only.
- Exit code is now 0 in sync, 1 on drift, 2 when a resource could not be compared (a fetch failure no longer looks like "no drift" to a CI gate). `--json` change entries now carry a structured `fields` list for object resources. Resources are compared concurrently. A `[PATH]` argument combined with `--against` is rejected rather than silently ignored.
