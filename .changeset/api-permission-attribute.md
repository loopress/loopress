---
"@loopress/wordpress-plugin": patch
---

`api/` route files can now declare `#[Permission]` on a verb method or on the class, for per-verb authorization (a public `get()` next to an admin-only `post()`, for example) instead of one `permission()` covering every verb. Resolution order: attribute on the verb, attribute on the class, the file's `permission()` method, the closed `manage_options` default. `#[Permission(callback: ...)]` can point to a shared static method, reusable across several route files, with the same fail-closed behavior on a throw as `permission()`.
