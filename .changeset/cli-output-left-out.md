---
"@loopress/cli": patch
---

A file a push cannot read (corrupted JSON, a menu with no slug) is now handled the same way for every resource: one warning per file, the other files are still pushed, then the command exits non-zero naming what was left out instead of printing "All pushed". `lps option pull` says "no longer present on WordPress" like the other resources, `lps push --dry-run` no longer prints both `unchanged` and `Would push` for an option, and the deployment record and the drift report now share one 3 second wait for a slow cloud per run.
