---
"@loopress/wordpress-plugin": minor
---

`api/` route files: the anti-listing `index.php` is now recreated on every boot if missing, not only when `lps api push` happens to write a file, so a Git-based deploy that never goes through `lps api push` still gets it. Also logs (without blocking the route) when a file is missing its ABSPATH guard, which is expected for any file deployed outside `lps api push` since the guard is only ever injected at push time and stripped again on pull.
