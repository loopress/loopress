---
"@loopress/cli": patch
---

`lps api push` now follows a symlink to a route file instead of silently skipping it ("Found 0 route files to push"). Broken symlinks are still ignored.
