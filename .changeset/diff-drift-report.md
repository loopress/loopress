---
'@loopress/cli': minor
---

`lps diff` now sends its result to the console when a token is available: the verdict, the exit code and, for each difference, the resource, the id and the kind of change (never file contents). It is best effort and never changes the exit code or the `--json` output. Nothing is sent without a token or when comparing two environments with `--against`.
