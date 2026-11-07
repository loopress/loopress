---
'@loopress/cli': patch
---

`lps plugin push --force` now leaves a taken-over plugin in the state `loopress.json` asks for in a single push (an inactive plugin pinned with a version string is activated), and activates the folder Composer installed. When the plugin it replaces lives outside that folder, such as core's `hello.php` for `hello-dolly`, the old copy is deleted instead of staying next to the new one. A plugin pin object with an unknown key (`{"version": "1.0", "activate": false}`) is now reported by `lps validate`, with a hint for a likely typo, and refused by `lps plugin push`.
