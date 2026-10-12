---
"@loopress/cli": patch
---

`lps dev` runs a push once per batch when several changed types share it: saving a template and a stylesheet together (`templates`, `parts`, `css`, `blocks`) rewrites the child theme once instead of once per type.
