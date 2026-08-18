---
"@loopress/cli": minor
---

`lps acf list`, `lps form list`, and `lps seo list` now use the same `--json` mechanism as every other command instead of a one-off `-j`/`--json` flag. **Breaking**: the `-j` short flag is removed from these three commands, use `--json` instead.
