---
"@loopress/cli": patch
---

Fixes `lps option add`, `lps menu pull`, and `lps form pull` writing server-only bookkeeping fields (`revision`, and `warnings` for menus) into the local tracked files, despite the documented "never persisted locally" contract on `RemoteOption.revision`/`Menu.revision`/`Menu.warnings`/`RemoteForm.revision`. Each command now writes only the fields that belong to the tracked configuration.
