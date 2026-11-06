---
'@loopress/cli': patch
---

On Windows, `snippet push` and `form push` now retry the file rename a few times when an editor or antivirus briefly holds the file (EPERM/EBUSY). Option names that Windows reserves as device names (`CON`, `NUL`, `COM1`...) are now rejected with a clear error by `option add` and `lps validate`.
