---
'@loopress/cli': minor
---

Hold files back from an environment with `environments.<name>.exclude` globs in `loopress.json`. `lps push`, `lps diff` and `lps promote` leave them alone on that environment: never pushed, pruned or mirrored away. `lps diff` lists them as held back without counting them as drift, a push names them, and `lps validate` warns about a glob that matches no file.
