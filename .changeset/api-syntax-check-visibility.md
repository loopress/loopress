---
"@loopress/wordpress-plugin": minor
"@loopress/cli": patch
---

`lps api push`'s server-side PHP syntax check now distinguishes "verified, no error" from "couldn't verify here" (`exec()` disabled, common on managed hosts), instead of treating both as silent success. The CLI now reports "syntax check skipped, exec() unavailable on this host" for the second case instead of staying indistinguishable from a fully verified push.
