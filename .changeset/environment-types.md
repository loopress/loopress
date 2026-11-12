---
"@loopress/cli": minor
"@loopress/mcp": minor
---

Environments now have a type (`local`, `staging` or `production`) next to their name. `lps project config` asks the type first, then the name (free text, defaults to the type). The production confirmation in the CLI and the production refusal of the MCP server follow the type, so an environment called `live` or `prod` is protected like `production`. An environment saved without a type is refused until you run `lps project config`. The CLI also warns, without blocking, when the site's `wp_get_environment_type()` differs from the configured type.
