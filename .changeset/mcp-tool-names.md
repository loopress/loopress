---
"@loopress/mcp": minor
---

MCP tool names and inputs now follow the CLI. Tools are named `<topic>_<command>`, top-level commands bare (`push`, `pull`, `diff`, `status`, `doctor`, `promote`, `validate`); `template_*` is now `theme_template_*` and `theme_styles_*` is now `theme_style_*`. `app_remove` and `option_remove` are now `app_rm` and `option_rm`, the `*_rm` tools take `slug` instead of `filename`, and `option_rm` gains `localOnly` and `path` like `lps option rm`. The `diff` resource id `theme-styles` is now `theme-style`. The old names are no longer accepted, so update any agent prompt or config that names them.
