---
"@loopress/cli": patch
---

`lps project config`: "Authorize in my browser" works again. It was always rejected with "Rejected a cross-origin request to the login callback server", then fell back to manual entry. WordPress now redirects straight to the CLI on `127.0.0.1`, without going through `api.loopress.dev`, so the Application Password never transits through a Loopress server. This needs WordPress 7.0 or later: on an older site, detected from its public version tag, the command goes straight to manual entry and says why.
