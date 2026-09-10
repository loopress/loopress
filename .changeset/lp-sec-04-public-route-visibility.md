---
"@loopress/wordpress-plugin": patch
---

Security: surface which custom API routes run with no authentication (F1).

`#[Permission(public: true)]` on a route's class or a verb method makes that code callable by anyone, with no login. There was no signal for it anywhere. Now the `GET /api-files` list and the `PUT /api-files` push response carry `public: true` for such a route (detected lexically by a new `PermissionScanner`, the file is never executed), and the plugin's **API Routes** admin tab shows a red **Public** badge on the row.

Hooks are unaffected: they have no permission concept, so `HookFilesController` does not add the flag.

Detection has two documented blind spots it does not flag: an aliased import of the attribute, and a `permission()` method that returns `true`.
