---
title: CircleCI
description: Use the Loopress CircleCI orb to bootstrap WordPress and run deployments from your pipeline.
---

Import the orb and use the `test` and `deploy` jobs in your workflow.

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

## Jobs

`loopress/test` checks out the repo, boots a WordPress stack, and runs `lps snippet push` against it.

`loopress/deploy` checks out the repo and runs `lps snippet push` against the configured site.
