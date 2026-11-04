---
"@loopress/cli": patch
---

Task labels no longer render one letter per line when the terminal reports no width (for example `script` without a size). The CLI now prints plain task lines in that case.
