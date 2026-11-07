---
"@loopress/cli": minor
---

`lps push` now records a single deployment in the console, `push`, with the status of each of its steps, instead of one record per step. A slow or unreachable console now delays a push by at most one 3 s timeout instead of one per step. A resource pushed alone (`lps acf push`) keeps its own record.
