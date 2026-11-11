---
"@loopress/cli": minor
---

New `lps project export --env <name>` prints a `config.json` holding only the current project and that one environment, to store as a CI secret (`LOOPRESS_CONFIG`) instead of your whole configuration, so an agency no longer leaks every client's credentials into one repository. After `lps project rotate` or an automatic 90-day rotation, the CLI now reminds you that the CI copy of the credentials is revoked and how to refresh it.
