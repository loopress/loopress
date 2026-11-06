---
'@loopress/cli': minor
---

When a console token is available, a `plugin push` (and a full `push`, which runs it) now includes the plugins listed in `loopress.json` (slug, version, active) in the deployment it reports, and `lps plugin audit` sends its advisories and health notes to the console. Both are best effort: output and exit codes are unchanged, and without a token nothing is sent.
