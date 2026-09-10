---
"@loopress/cli": patch
---

Add `lps api rm <slug>` / `lps hook rm <slug>` to delete one route or hook file from WordPress (confirmation prompt, `--yes` for CI, `--dry-run`), and `lps api push --prune` / `lps hook push --prune` to delete server-side files with no local counterpart after a push.

`--prune` and `rm` both refuse to delete in a non-interactive shell without `--yes`: unlike `pull`'s local cleanup, a pruned file on the server is not recoverable from the repo. The MCP server gains matching `api_rm` / `hook_rm` tools and a `prune` option on `api_push` / `hook_push`, both behind the confirm-token handshake.
