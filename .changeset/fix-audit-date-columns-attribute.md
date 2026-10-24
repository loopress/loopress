---
"@loopress/cli": patch
---

`lps plugin audit` now reads WordPress.org's `last_updated` date form, so abandoned plugins are flagged again. `lps option list` keeps a `COLUMNS` value you set. The top-level code check now catches code placed right after an attribute (`#[Attr] foo();`).
