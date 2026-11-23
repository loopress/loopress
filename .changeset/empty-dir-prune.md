---
"@loopress/cli": patch
---

A first `lps pull` then `lps push` on a site with no API route or hook no longer stops on the empty-directory guard: pruning is refused only when the site holds files the push would delete, and the message names options the command accepts. Inside `lps push` a refused prune no longer stops the other steps, it is reported at the end with a non-zero exit. An existing but empty resource directory now counts as unused, and the failure message no longer ends with a double period.
