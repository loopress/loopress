---
"@loopress/cli": patch
---

Stopped sending personal data to Sentry when reporting a crash. Command-line argument values (WordPress URLs, application passwords, tokens, emails) are now redacted, only flag names are kept for debugging context. Also disabled `sendDefaultPii` explicitly and set a static `serverName` instead of the machine's real hostname.
