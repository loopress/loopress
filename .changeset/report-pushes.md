---
"@loopress/cli": minor
---

A successful push now tells the site it happened (once per `lps <resource> push`, never on a dry run), so the plugin's Overview tab can show what was pushed, when, and whether it changed since. An older plugin that doesn't know about it is ignored silently.
