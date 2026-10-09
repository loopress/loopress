---
"@loopress/wordpress-plugin": minor
---

Loopress Full now removes, every hour, any temporary administrator account left behind by an interrupted `lps project config` install, once it is more than 15 minutes old. Until then, administrators see a wp-admin notice naming it. Only accounts matching both the `lps-temp-` username prefix and the `@lps-temp.invalid` email are touched.
