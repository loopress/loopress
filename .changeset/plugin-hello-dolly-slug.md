---
"@loopress/cli": patch
"@loopress/mcp": patch
---

Fix `lps plugin pull` recording the wrong slug for a single-file plugin whose WordPress.org slug differs from its bare file id (e.g. Hello Dolly: `hello.php` has slug `hello-dolly`, not `hello`). The wrong slug made a later `lps plugin push --force` fail atomically with a Composer "could not be found" error instead of installing anything. The slug is now read from the plugin's `Plugin URI` header when it points to a wordpress.org listing, falling back to the bare file id otherwise.
