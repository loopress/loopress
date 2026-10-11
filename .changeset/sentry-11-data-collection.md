---
'@loopress/cli': patch
---

Error reports sent to Sentry no longer include HTTP headers, bodies, cookies, query params or stack frame variables, which Sentry 11 now collects by default.
