---
title: GitHub Actions
description: Use the loopress/setup-ci action to bootstrap WordPress in your GitHub Actions workflow.
---

Add the `loopress/setup-ci` action to your workflow. It starts a full WordPress stack and installs the CLI in one step.

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: loopress/setup-ci@main
  - run: lps push
```

## Inputs

| Input | Description | Default |
|---|---|---|
| `wp-version` | WordPress version | `latest` |
| `site-id` | Loopress site ID | `ci` |
| `port` | WordPress port on the runner | `8080` |
| `token` | Optional Loopress cloud token (not needed to push) | |

## Outputs

| Output | Description |
|---|---|
| `wp-url` | WordPress URL (`http://localhost:<port>`) |

## Full example

```yaml
steps:
  - uses: actions/checkout@v4

  - uses: loopress/setup-ci@main
    with:
      wp-version: "6.5"
      port: "9090"
      token: ${{ secrets.LOOPRESS_TOKEN }}

  - run: lps push
```

## Restoring between groups of tests

`loopress/setup-ci` takes a snapshot of the database as its last setup step. If your e2e suite runs several independent groups of tests and respawning the whole Docker stack between them is too slow, call `loopress/setup-ci/restore` to reset WordPress back to that clean snapshot instead. It's a separate action so it never re-triggers the boot/install steps, it's always something you call explicitly:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: loopress/setup-ci@main

  - name: Happy path tests
    run: npx playwright test tests/e2e/happy-path.spec.ts

  - uses: loopress/setup-ci/restore@main

  - name: Conflict tests
    run: npx playwright test tests/e2e/conflicts.spec.ts
```

The snapshot path defaults to `/tmp/loopress-snapshot-clean.sql` and doesn't need configuring for most cases. To override it, set `LOOPRESS_SNAPSHOT_PATH` in the job or step `env:` around both the setup and restore steps.

## Test and deploy workflow

A common pattern is to test on every branch push and deploy only from `main`:

```yaml
name: Loopress

on:
  push:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: loopress/setup-ci@main
      - run: lps push

  deploy:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @loopress/cli
      - run: lps push
        env:
          LOOPRESS_TOKEN: ${{ secrets.LOOPRESS_TOKEN }}
```

## Preview what a pull request will change

On a pull request, `lps diff` previews tracked resource changes on an environment, so a reviewer sees more than file diffs. The preview excludes plugins declared in `loopress.json`; see [Drift detection](/ci/drift-detection/#preview-a-pull-request). The job needs no secret beyond `LOOPRESS_CONFIG`, and it does not post a comment: the summary is in the job log.

```yaml
name: Preview

on:
  pull_request:

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @loopress/cli
      - name: Restore site credentials
        env:
          LOOPRESS_CONFIG: ${{ secrets.LOOPRESS_CONFIG }}
        run: |
          mkdir -p ~/.config/loopress
          printf '%s' "$LOOPRESS_CONFIG" > ~/.config/loopress/config.json
      - name: Summarize the changes against production
        run: lps diff --env production --json || true
```

The command exits non-zero when there is a difference, hence `|| true`: the preview informs, it does not block.
