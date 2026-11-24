---
"@loopress/cli": minor
"@loopress/mcp": minor
---

Changing an environment of type `production` without a terminal now needs `--yes` and a recognized CI provider (GitHub Actions, GitLab CI, CircleCI and the other providers `ci-info` knows). `--yes` alone in a plain shell, or with a bare `CI=true`, is refused. Production checks (the promote warning, the prune confirmation) and the plain HTTP allowance for local environments now follow the environment's type, never its name.
