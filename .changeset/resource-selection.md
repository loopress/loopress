---
"@loopress/cli": minor
---

`lps push` gains `--only` and `--skip`, with the same resource ids as `lps dev` and `lps diff`: comma-separated or repeated (`--only acf,page`, `--skip plugin --skip composer`). A resource left out is reported skipped and never checked against the site, and the run keeps its usual order. `lps dev --only` now takes singular ids (`snippet`, `page`, `hook`, `plugin`...), like the other two commands.
