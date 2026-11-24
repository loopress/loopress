---
"@loopress/cli": patch
---

Pull and push are safer around what the site held. The CLI now records, per resource and environment, what the site held at your last pull or push (git-ignored, in `.loopress/last-seen/`). A pull removes a local file only when the site held it before and no longer does: a file you created and never pushed is kept and listed as "not on the site yet", and on a fresh clone every file is kept. The push guard against changes made outside Loopress compares with that record, so a pull moves its baseline and a pull followed by a push is no longer stopped by an edit you just pulled. `lps pull` followed by `lps diff` now reports everything in sync: `plugin pull` no longer adds an empty `require` to `composer.json` when it has nothing to pin, and a theme with no Global Styles customization is no longer listed as a removed entry.
