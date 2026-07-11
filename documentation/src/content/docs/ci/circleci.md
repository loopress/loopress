---
title: CircleCI
description: Use the Loopress CircleCI orb to bootstrap WordPress in your pipeline.
---

Reference the `loopress` orb in your `.circleci/config.yml`.

```yaml
version: 2.1

orbs:
  loopress: loopress-dev/loopress@1

workflows:
  main:
    jobs:
      - loopress/test
      - loopress/deploy:
          site: production
          requires:
            - loopress/test
```

## `setup` command parameters

| Parameter | Type | Description | Default |
|---|---|---|---|
| `wp-version` | string | WordPress version | `latest` |
| `wp-port` | integer | WordPress port | `8080` |
| `token` | env_var_name | Env var holding the cloud token | `LOOPRESS_TOKEN` |

## `deploy` command parameters

| Parameter | Type | Description | Default |
|---|---|---|---|
| `site` | string | Site ID | `staging` |
| `token` | env_var_name | Env var holding the cloud token | `LOOPRESS_TOKEN` |

## Restoring between groups of tests

A CircleCI job is a single executor, so restoring between groups of tests happens as an extra step in the same job, after `setup` has already run once (it's what downloads the restore script and takes the snapshot):

```yaml
- loopress/setup:
    wp-version: "6.5"
- run: npx playwright test tests/e2e/happy-path.spec.ts
- loopress/restore
- run: npx playwright test tests/e2e/conflicts.spec.ts
```
