---
"@loopress/wordpress-plugin": patch
---

A push of API routes or hooks that would take the directory over the total size budget (8 MB by default, `loopress_max_files_total_bytes` filter) is now refused with an error naming the budget and the resulting size, and nothing is written. Before, the push reported success while the files past the budget were skipped at load time.
