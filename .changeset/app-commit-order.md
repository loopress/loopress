---
"@loopress/wordpress-plugin": patch
---

Committing an app build now saves the new manifest before removing the previous build's stale files, so a failed commit no longer leaves the stored manifest pointing at deleted files.
