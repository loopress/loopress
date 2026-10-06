---
"@loopress/wordpress-plugin": patch
---

Errors rethrown by the plugin now keep the original exception as their cause, so crash reports show the underlying failure instead of only the wrapper message.
