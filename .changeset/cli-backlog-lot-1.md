---
'@loopress/cli': patch
---

Timeouts and dependency cleanup (CLI backlog lot 1)

- Calls to the Loopress cloud API now time out after 30s with an actionable error message instead of hanging indefinitely.
- `lps composer push` waits up to 10 minutes for the server-side `composer install` instead of failing after 30s, shows a wait message, and explains on a real timeout that the install may still be running on the server.
- Removed unused dependencies: `@oclif/plugin-plugins` and `@oclif/test`.
