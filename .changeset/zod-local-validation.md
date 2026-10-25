---
"@loopress/cli": patch
---

Validate local option files, `loopress.json` plugin pins, `composer.json` sections and declared type arguments with zod. `lps validate` now reports a `composer.json` that is not a JSON object instead of crashing.
