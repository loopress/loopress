---
"@loopress/cli": patch
---

`lps push` no longer refuses a fresh site (CI, a new staging) because ACF, a form or a snippet plugin isn't active yet, when `loopress.json` pins that plugin active: the run's plugins step installs it before the steps that need it.
