---
"@loopress/mcp": patch
---

A confirmed MCP write now leaves its traces in the project: the id files and renamed files the command wrote, and the `.loopress/` rollback snapshots, are copied back from the throwaway copy the command ran in, so a following CLI push does not create duplicates and `snippet_rollback` can list the snapshot. A file you edited in the project between the preview and the confirm is never overwritten: it is reported in `writebackConflicts`. The project's `.git` is reachable from the copy, so the deployment record finds its commit.
