---
"@loopress/wordpress-plugin": minor
---

Removed the snippet provider migration feature: the **Snippets** admin tab and the `GET`/`POST /loopress/v1/snippets/migration/{direction}` REST routes are gone. Code Snippets and WPCode each ship their own import/export, so moving snippets between them no longer needs a Loopress screen. Snippet sync (`lps snippet pull/push/list` and the `/loopress/v1/snippets` routes) is unchanged.
