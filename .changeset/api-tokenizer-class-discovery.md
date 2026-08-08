---
"@loopress/wordpress-plugin": minor
---

`api/` route files no longer need their class name to match a formula derived from the filename (kebab-case filename -> PascalCase class): the class is now discovered by reading the file itself (PHP's own tokenizer, never executed to find out), so it can be named anything. **Internal, breaking**: this replaces the old naming convention entirely, no transition period.

`lps api push` now also rejects a file immediately (before anything is written) if it declares zero or more than one class, or if its class name collides with WordPress core, another active plugin, or another `api/` file already on the site, instead of only failing silently at the next site boot. A file that still fails to load at boot (a stale collision from a plugin activated later, for instance) now shows a warning in the plugin's **API Routes** admin tab, with the actual reason, clearing itself automatically once the file loads clean again.
