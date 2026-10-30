---
"@loopress/cli": patch
---

`lps push` no longer refuses a fresh site (CI, a new staging) because ACF, a form or a snippet plugin isn't active yet, when the project has no `composer.json` and `loopress.json` pins that plugin active: the run's plugins step installs it before the steps that need it. `--dry-run` skips those steps, since nothing gets activated to preview against.
