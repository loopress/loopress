---
"@loopress/cli": patch
---

Internal refactoring: extract shared helpers for the id-based PUT-then-create-on-404 push dance (`form`, `page`, `seo` redirects, `snippet`), the Listr push-task loop, ENOENT-tolerant directory listing, and count pluralization, previously duplicated across each resource's `push`/`pull` command. No visible behavior change.
