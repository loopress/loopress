---
"@loopress/cli": patch
---

The examples of `lps snippet push`, `lps snippet pull`, `lps snippet publish` and `lps api publish` no longer show a `--path` flag that does not exist: the directory is a positional argument (`lps snippet push ./snippets`).
