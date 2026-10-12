---
"@loopress/wordpress-plugin": minor
---

The last error a hook method threw while running is now kept per file (method, message, time), and returned as `runtimeError` by the hook list endpoint while the file is still the version that threw it. The same error is written at most once a minute. Until now it only went to the PHP error log.
