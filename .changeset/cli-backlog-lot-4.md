---
'@loopress/cli': minor
---

Diagnostics and onboarding (CLI backlog lot 4)

- New `lps doctor` command: checks that the site is reachable, the Loopress plugin installed, and the credentials valid, each with a corrective action, and shows the plugin version when exposed. Exits non-zero when a check fails, so it can guard a CI deploy.
- `lps init` now offers to run `lps project config` inline when no project is configured yet, proposes the other feature directories (ACF, SEO, Forms, custom API routes) via an optional multi-select, and ends with a summary of everything configured plus the next useful command.
- The CLI now warns when a newer version is available (background npm check, at most once a day, never blocking), pointing to the npm update command.
