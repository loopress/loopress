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
    LOOPRESS_ENV: "production"
```

## Variables

| Variable | Description | Default |
|---|---|---|
| `LOOPRESS_WP_VERSION` | WordPress version | `latest` |
| `LOOPRESS_WP_PORT` | WordPress port | `8080` |
| `LOOPRESS_ENV` | Environment name for deploy jobs (`--env`) | `staging` |
| `LOOPRESS_CONFIG` | File-type CI/CD variable, required by deploy jobs: the output of `lps project export --env <name>` (see below) | |
| `LOOPRESS_TOKEN` | Optional Loopress cloud token | |

## Available templates

`.loopress-test` boots WordPress and runs `lps push`. Triggers on branches and merge requests.

`.loopress-deploy` deploys to a real site: it restores `LOOPRESS_CONFIG`, runs `lps push --env "$LOOPRESS_ENV" --yes`, then `lps diff --env "$LOOPRESS_ENV"` to verify the result. No token is required; set `LOOPRESS_TOKEN` in your project CI settings only for the optional cloud features.

## Storing the credentials

`LOOPRESS_CONFIG` holds one environment's credentials only. Create it from your machine with the `glab` CLI, as a File-type variable:

```bash
lps project export --env production | glab variable set LOOPRESS_CONFIG --type file
```

The application password is rotated every 90 days on your machine, which revokes the stored copy: see [Refreshing the secret](/ci/#refreshing-the-secret).

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
