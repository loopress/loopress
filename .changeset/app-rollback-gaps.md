---
"@loopress/cli": patch
---

`lps app rollback` now works after the first push of an app from a machine: before uploading, `lps app push` reads the build it replaces from the site when no earlier snapshot has it, downloading only the files the new build overwrites or drops. The rollback also removes an app the push created, never one that existed before. A push whose bundles are above 25 MB still saves a snapshot, without the bundles: its rollback refuses to put back a build before changing anything, and says why.
