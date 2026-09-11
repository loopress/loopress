---
"@loopress/cli": patch
---

Security: strip WordPress site URLs and server response bodies from CLI crash reports (F26).

A failed WordPress request throws an `Error` whose message is built by `formatWpError`: it
carries the full request URL and, for a 4xx/5xx, the server's raw response body appended after a
newline (a Composer trace, a WordPress fatal, absolute server paths, package URLs). `finally.ts`
passed that straight to `Sentry.captureException`.

A `beforeSend` scrubber now runs on every event: it keeps the first line of each exception
message (the "which endpoint, which status" summary), blanks the site host while keeping the
`/wp-json/...` REST path, drops everything after the first line, and removes any request
context. Chained `cause` errors are covered too. The terminal still prints the full, unmodified
message.
