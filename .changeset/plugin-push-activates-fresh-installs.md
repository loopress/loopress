---
"@loopress/cli": patch
---

Fixes `lps plugin push` never activating a plugin it just installed for the first time (`plugin add` followed by `push`), even though the site ends up with the plugin present but inactive. `diffPlugins()` only ever routed a not-yet-installed plugin through `toInstall`, and `push` only activated `toActivate` plus whatever it defensively deactivated for a file swap, never `toInstall`. `push` now re-reads the site's plugin list after a successful Composer sync to resolve the newly installed plugins' WordPress core ids, and activates them alongside everything else.
