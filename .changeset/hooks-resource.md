---
"@loopress/cli": minor
"@loopress/mcp": minor
"@loopress/wordpress-plugin": patch
---

Added `hooks/`, a new resource for declaring WordPress actions, filters, and scheduled (cron) tasks as plain PHP files, deployed with `lps hook push`/`pull`/`list` (and `lps push`/`pull`/`diff`, `hook_push`/`hook_pull`/`hook_list` MCP tools). One file, one class, public methods attributed with `#[Action(hook, priority, acceptedArgs)]`, `#[Filter(hook, priority, acceptedArgs)]`, or `#[Cron(recurrence, hook?)]` bind straight to `add_action()`/`add_filter()`/WP-Cron (a `#[Cron]` job is just an action bound to a schedule instead of an existing WordPress event). Unlike a REST route, a bound hook runs unconditionally for every visitor with no permission check of its own, so every callback is wrapped to catch and log rather than propagate; a filter additionally fails open, returning the original value on a throw. Loopress Full only, same as custom API routes.
