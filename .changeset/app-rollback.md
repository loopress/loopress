---
"@loopress/cli": minor
---

`lps app push` now saves a rollback snapshot with a copy of the bundles it sent, and `lps app rollback` puts back the builds the last push replaced: it uploads the files of the previous build that differ from the site, then commits it. A push whose bundles are above 25 MB saves no snapshot and says so. The MCP server gets `app_rollback`.
