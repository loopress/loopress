---
"@loopress/wordpress-plugin": patch
---

Fixed errors reported by the WordPress Plugin Check tool: escaped the exception message in `WpHttpClient::sendRequest()`, and bumped the readme's "Requires at least" header to 6.2 so the RankMath redirects queries can keep using the `%i` prepare placeholder.
