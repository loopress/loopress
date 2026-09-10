---
"@loopress/cli": patch
---

`lps api pull` / `lps hook pull` now skip a file the server declined to return (e.g. one over the new size limit): they print a warning and leave any local copy untouched, instead of overwriting it with nothing. `lps api list` / `lps hook list` show the server's reason next to such a file.
