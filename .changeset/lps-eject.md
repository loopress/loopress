---
"@loopress/cli": minor
---

New `lps eject` command: turns the project into one standard WordPress plugin, so the site keeps working with Loopress deactivated and uninstalled. It reads the repository only, needs no network or account, and writes `eject/<project-slug>/`: post types, taxonomies, post meta, block patterns, roles, hooks, static pages and the child theme stylesheet become plain WordPress calls, and the plugin stays idle while Loopress is still active. API routes, `lib/`, Composer libraries, apps and dynamic blocks are not ejectable yet: the command then refuses with the list and writes nothing. `--dry-run` lists what would be generated, `--out` picks the folder, `--force` replaces it.
