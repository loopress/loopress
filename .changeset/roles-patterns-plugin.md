---
"@loopress/wordpress-plugin": minor
---

Custom user roles can now be declared in code, in both editions: each `roles/<slug>.json` file holds a role's name and capabilities. Loopress adds the role in memory on every request and never writes it into the saved roles, so the file stays the only source of truth and removing it really removes the role. Built-in roles are reserved, and a role already saved on the site is skipped. The Config tab lists every role with its number of users. Loopress Full also registers block patterns from `patterns/<slug>.html` files as `loopress/<slug>`, so a `<!-- wp:pattern {"slug":"loopress/<slug>"} /-->` reference in a page, template or part renders the current version.
