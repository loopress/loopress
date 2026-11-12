---
"@loopress/cli": minor
---

`lps hook push` and `lps api push` now mirror the repo: a hook or API route file on the site with no local counterpart is deleted in the same all-or-nothing push, listed as `Pruned: <name>` (also with `--dry-run` and `--json`), so a file removed from Git no longer keeps running on the site. Pass `--no-prune` to keep them, `lps push` and `lps promote` inherit the new default. The push refuses to prune, naming the path, when the local directory is missing or has no PHP file, files under an excluded path are kept, and `production` still asks for confirmation (`--yes` in CI). `lps hook rollback` and `lps api rollback` restore a pruned file. The MCP `api_push` and `hook_push` tools take `noPrune` instead of `prune`.
