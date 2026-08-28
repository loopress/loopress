# Loopress - Claude Instructions

## Worktrees

Create worktrees inside `.claude/worktrees/`. This folder must be listed in `.gitignore`.

## MCP server parity

The `mcp/` package wraps CLI commands as tool calls. When you add, remove, or change a CLI command (especially a `list`/`pull`/`push` under `cli/src/commands/`), check that `mcp/src/tools/` still matches: add the missing tool, update its inputs, and refresh the tool tables in `mcp/README.md` and `documentation/src/content/docs/cli/mcp.md`.

## Writing style

Never use the em dash "—" in code or website content. Use a comma, a period, or rephrase the sentence instead.
