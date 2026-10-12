---
"@loopress/wordpress-plugin": minor
---

Content export and import endpoints for `lps content copy`, in both editions. The import deletes the site's posts and terms, so it only runs on a site whose environment type is `local`. After an import, images missing locally are served from the source site's uploads URL.
