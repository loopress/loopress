---
"@loopress/cli": minor
---

New `lps app rollback`, with the MCP `app_rollback` tool. `lps app push` now saves a snapshot of the site's apps with a copy of their files (the bundle it sends, and the files of the build it replaces, read from the site before they are overwritten), since the site keeps no older build. The rollback uploads the files that differ and commits each app's earlier build, and removes an app the push created. An app whose bundle, with the build it replaces, is over 20 MB gets no copy in the snapshot: the push warns and still succeeds, and a rollback that needs those files refuses before changing anything.
