---
"@loopress/cli": minor
---

Add `lps validate`, an offline check that the local tracked files are push-ready: every resource JSON parses and is an object, snippet sidecars use a known `type` and an integer `id`, API route files are non-empty, `loopress.json` points at a configured project, and `composer.json` is well formed. It contacts nothing, prints one line per problem, exits non-zero when any is found, and supports `--json`. Handy as a pre-commit or CI gate before `lps push`.
