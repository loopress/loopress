---
'@loopress/cli': patch
---

`lps plugin audit` (and the MCP `plugin_audit` tool) no longer aborts when wpvulnerability.net answers `"vulnerability": null`, its value for a plugin without advisories. It now reads as no advisory; any other unexpected shape is still rejected.
