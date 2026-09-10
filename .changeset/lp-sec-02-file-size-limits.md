---
"@loopress/wordpress-plugin": patch
---

Security: bound the size of `api/` and `hooks/` files so one file can no longer take down `/wp-json/`.

`AbstractFileLoader` tokenises (`token_get_all()`), then `require`s, every file in the directory on every request. With no size limit, a large enough file (or a large enough pile of them) exhausted memory, an uncatchable `E_ERROR` that 500s every REST route on the site, and the same blob would 500 the push that wrote it (LP-SEC-02 / F19 / F20).

Now:

- `PUT /api-files` and `/hook-files` reject a `content` over 512 KB with `413`, before anything tokenises it.
- The loader skips any on-disk file over 512 KB (recorded in the load-errors option, surfaced in the admin tab), so a file planted outside the CLI breaks only itself.
- The loader also stops once the directory as a whole passes an 8 MB budget, a last-resort guard against a runaway directory.
- Both limits are filterable: `loopress_max_file_bytes` and `loopress_max_files_total_bytes` (each passed the subdir, `'api'` or `'hooks'`).
- `list_files` returns `{filename, error}` without `content` for an over-limit file instead of reading it back.
- `FileWriter::withGuard()` fails cleanly if the guard-placement regex bails on its backtrack limit, rather than misplacing the guard.
