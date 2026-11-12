---
"@loopress/wordpress-plugin": minor
---

Installing, updating, removing and repairing Composer packages from wp-admin now works only on sites whose environment type is `local` or `development`, on the REST routes themselves and in the UI. Anywhere else (WordPress reports `production` when the type is not set) those routes answer 403 and the Dependencies tab lists the installed packages read-only: change dependencies in the repo and run `lps composer push`. The API routes namespace is now read-only in wp-admin: set `api.namespace` in `loopress.json` and run `lps api push`.
