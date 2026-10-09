---
"@loopress/cli": patch
---

`lps project config` now removes any temporary administrator account left behind by an interrupted Loopress Full install (a killed process, a lost connection), and `lps doctor` reports one as a failed check. Only accounts matching both the `lps-temp-` username prefix and the `@lps-temp.invalid` email are touched.
