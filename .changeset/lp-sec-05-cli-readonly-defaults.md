---
"@loopress/cli": patch
---

`lps option add` now defaults `readonly: true` for the behaviour-changing core options the server refuses to write (`default_role`, `users_can_register`, `mailserver_*`, `uninstall_plugins`, `initial_db_version`), alongside the ones that were already read-only by default (`siteurl`, `home`, `cron`, ...). `lps option push` skips read-only options, so tracking one of these for `diff` visibility no longer leads to a `403` on push.
