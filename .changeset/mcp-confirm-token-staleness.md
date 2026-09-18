---
"@loopress/mcp": patch
---

The confirm-token handshake every mutating MCP tool uses now catches remote-state staleness, not just local-file staleness. Previously only a file swapped between the preview and confirmed calls was protected against (via a frozen working-tree copy); a remote change on WordPress in that same window (e.g. someone else editing the environment between a `snippet_rollback` preview and its confirm) could still be silently overwritten, since the confirmed call trusted the preview's drift check without re-checking it.

The confirmed call now re-runs the same `--dry-run` once more right before applying, and refuses (`STALE_PREVIEW`) if it reports anything different from what the preview reported, instead of applying against stale data. This applies to every mutating tool generically (push, rm, prune, rollback, ...), not just rollback: each tool's own `--dry-run` output is compared as-is, so tools whose preview doesn't inspect remote state see no behavior change.
