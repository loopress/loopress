---
"@loopress/cli": patch
---

`lps api push` now rejects a route file whose name contains characters outside `[a-z0-9-]` (e.g. uppercase letters, underscores) with a clear "Invalid filename" error before attempting the push. Previously the request reached WordPress, whose REST router matches the filename against the same allowlist and returned a generic 404 that the CLI reported as "Is the required plugin installed and up to date on the site?", a misleading message for what was actually an invalid filename.
