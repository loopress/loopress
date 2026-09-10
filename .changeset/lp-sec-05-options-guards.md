---
"@loopress/wordpress-plugin": patch
---

Security: guard the generic `/loopress/v1/options/{name}` resource so a deployment token is not "read every secret / rewrite site behaviour over HTTP" (F10, F11).

- `GET /options/{name}` now returns `403` for a name that looks like a stored secret (matches `secret`, `password`, `_pass`, `token`, `_key`, `_api_key`, `apikey`, `^auth_`, `nonce`, `salt`, `private_key`, `credential`). This is a best-effort denylist; the real control for a specific site is the new `loopress_option_readable` filter, or tracking only the options it needs.
- `PUT` / `DELETE /options/{name}` now return `403` for a curated set of behaviour-changing core options (`default_role`, `users_can_register`, `siteurl`, `home`, `cron`, `uninstall_plugins`, `mailserver_*`, `db_version`, `initial_db_version`) and for any `loopress_*` option (owned by the plugin's own settings). Re-allow a specific name with the new `loopress_option_writable` filter.
- New `ProtectedOptionException` (403), distinct from `ReservedOptionNameException` (409, still used only for the 3 names owned by the `plugin`/`theme` resources).

A server-enforced allowlist ("only options declared in loopress.json are readable/writable") is the stronger fix and is tracked separately: it needs the tracked list synced to the server.
