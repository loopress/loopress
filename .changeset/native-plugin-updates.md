---
"@loopress/wordpress-plugin": minor
---

Loopress Full now updates through WordPress's native Plugins page flow (the "update available" notice, "Update now" link, and bulk updater), instead of requiring a manual re-upload of `loopress-full.zip`. WordPress fetches the zip directly from the matching GitHub release, using the same GitHub lookup the update-available notice already relied on.
