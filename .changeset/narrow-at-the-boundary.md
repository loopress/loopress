---
"@loopress/cli": patch
---

Narrow untyped data at the boundary instead of casting it. Malformed local files now fail with a clear error instead of crashing later: a `composer.json` with a non-string version, a non-object `loopress.json` or Global Styles file, an app `package.json` with non-string scripts. A malformed `auth.json` reads as logged out, an invalid snapshot file is skipped in listings, and an error thrown as a non-Error now shows its text instead of `undefined`.
