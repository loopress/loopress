---
"@loopress/cli": patch
---

Security: harden the `lps login` / `lps project config` browser authorization flow (F24, F25).

- The loopback callback server now generates a 32-byte `state`, threads it through the authorization URL, and requires it back (constant-time compare) on any request that carries credentials. A local process or a web page open during the wait can no longer POST forged credentials into `config.json` / `auth.json`.
- The server also enforces an `Origin` allowlist (`https://api.loopress.dev` for site auth, `https://console.loopress.dev` for console login) and shuts down on the first callback-shaped request, valid or not, instead of staying open for the whole 5 minute window.
- `authorizeWithBrowser` no longer reads the Application Password or username from the URL query string, only from the relay's form POST body, so they can no longer land in shell history, proxy logs or the browser address bar.

No API or console change is required: both relays copy the callback URL, and its `state`, through verbatim.
