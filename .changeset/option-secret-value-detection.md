---
"@loopress/wordpress-plugin": patch
---

The options resource now also refuses to read an option whose value holds a well-known credential format (about a hundred, from gitleaks' prefix-based rules: Stripe, GitHub, Slack, AWS, Google API, OpenAI, Anthropic keys, PEM private keys, ...), including inside a settings array, so a live key under an innocent option name no longer ends up in the JSON you commit. The error names the format and the path inside the value, never the value, and the `loopress_option_readable` filter overrides it.
