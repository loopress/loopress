---
"@loopress/cli": patch
---

Fix three CLI edge cases: `lps plugin audit` now aborts on a malformed vulnerability response instead of reporting it as clean, composer pull no longer treats a wpackagist theme as the provider of a plugin with the same slug (or the reverse), and `"show_in_rest": null` in a meta file is now rejected.
