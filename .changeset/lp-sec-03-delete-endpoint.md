---
"@loopress/wordpress-plugin": patch
---

Security: add `DELETE /loopress/v1/api-files` and `/hook-files` so a deployed route or hook can be removed through the product.

Route and hook files live under `wp-content/`, outside the plugin directory, so deactivating the plugin never removed them. Before this, a file pushed by a leaked application password could only be cleared over SSH/SFTP (F3). `DELETE` takes `filename` in the query string, validated by the same rules as `PUT` (including the hooks-only "last segment must not be `index`"), returns `404` when the file is absent and `200 {"filename", "deleted": true}` otherwise, and clears any stale boot-time load-error entry for the removed slug.

`uninstall.php` (Full edition) already removed the entire `wp-content/loopress/` tree; a comment now spells out that this is deliberate (api, hooks, vendor, apps, everything), so nothing Loopress wrote survives an uninstall.
