---
title: GitLab CI
description: Use the Loopress GitLab CI template to bootstrap WordPress in your pipeline.
---

Reference the template via remote include. Do not copy the file: reference it so you always get the latest version.

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/loopress/setup-ci/v1/gitlab/template.yml'

test:
  extends: .loopress-test

deploy:
  extends: .loopress-deploy
  variables:
    LOOPRESS_SITE: "production"
```

## Variables

| Variable | Description | Default |
|---|---|---|
| `LOOPRESS_WP_VERSION` | WordPress version | `latest` |
| `LOOPRESS_WP_PORT` | WordPress port | `8080` |
| `LOOPRESS_SITE` | Site ID for deploy jobs | `staging` |
| `LOOPRESS_TOKEN` | Loopress cloud token | |

## Available templates

`.loopress-test` boots WordPress and runs `lps snippet push`. Triggers on branches and merge requests.

`.loopress-deploy` deploys to a real site with `lps snippet push`. Requires a `LOOPRESS_TOKEN` variable set in your project CI settings.

## Restoring between groups of tests

A GitLab job is a single isolated container, so restoring between groups of tests happens as an extra step in the same job's `script:`, not a separate job. `.loopress-bootstrap` already downloads the restore script alongside the other setup scripts, call it directly between groups:

```yaml
test:
  extends: .loopress-bootstrap
  script:
    - npx playwright test tests/e2e/happy-path.spec.ts
    - /tmp/loopress-restore.sh
    - npx playwright test tests/e2e/conflicts.spec.ts
```
