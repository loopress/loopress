---
"@loopress/wordpress-plugin": patch
---

Crash reports now carry only what the consent card lists: the error, its stack trace, the Loopress version, the environment, and the request method and path. The server name, request bodies, headers, cookies and query strings are no longer sent, and the card lists every field.
