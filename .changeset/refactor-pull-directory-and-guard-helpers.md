---
"@loopress/cli": patch
---

Internal refactoring: extract a shared `pullDirectory` helper for the write-then-reconcile-orphans loop duplicated across `acf`/`api`/`form`/`page`/`seo`/`snippet` pull commands, and a shared `guardProductionPush` helper for the production-push confirmation duplicated between `PushCommand` and the top-level `lps push`. No visible behavior change.
