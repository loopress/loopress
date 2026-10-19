---
"@loopress/cli": minor
"@loopress/mcp": minor
---

The MCP server now tells a connecting agent what a Loopress project is and links the documentation of each file format, so an agent writes a Loopress hook instead of plain WordPress code. `lps validate` (and the MCP `validate_local` tool) now runs the same checks on hook and API route files as push: a valid file name, `declare(strict_types=1);` exactly once, and no code outside the class (a hand-written `ABSPATH` guard included, the plugin adds its own), and `declare(strict_types=1);` as the first statement. Those problems now surface before push; PHP syntax and class-name collisions are still checked by the server at push.
