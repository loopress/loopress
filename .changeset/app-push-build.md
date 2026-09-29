---
"@loopress/cli": minor
"@loopress/mcp": minor
---

`lps app push` now builds each app before pushing it: when `apps/<name>/package.json` has a `build` script, it runs with the app's package manager (from `packageManager`, else the nearest lockfile, else npm), on `--dry-run` too, so a forgotten rebuild no longer ships a stale `dist/` reported as "up to date". A failing build fails that app and uploads nothing. Pass `--no-build` (MCP: `noBuild`) when CI already built. Dependencies are never installed for you.
