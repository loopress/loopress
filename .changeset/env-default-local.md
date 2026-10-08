---
"@loopress/cli": minor
"@loopress/mcp": patch
---

Commands no longer remember an environment. Without `--env`, they target the project's `local` environment, or its only environment when it has just one. A project with several environments and no `local` one needs `--env` on every command. `lps project switch` now picks a project only, and `lps project list` tags the default environment with `[default]` instead of an arrow on the switched one (`isDefault` replaces `isCurrent` per environment in `--json`). An existing `config.json` keeps working: the `env` field of `currentProject` is ignored and dropped on the next write.
