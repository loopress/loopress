---
title: GitHub Actions
description: Use the loopress/setup-ci action to bootstrap WordPress in your GitHub Actions workflow.
---

Add the `loopress/setup-ci` action to your workflow. It starts a full WordPress stack and installs the CLI in one step.

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: loopress/setup-ci@main
  - run: lps snippet push
```

## Inputs

| Input | Description | Default |
|---|---|---|
| `wp-version` | WordPress version | `latest` |
| `site-id` | Loopress site ID | `ci` |
| `port` | WordPress port on the runner | `8080` |
| `token` | Loopress cloud token | |

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

  - run: lps snippet push
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
      - run: lps snippet push

  deploy:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @loopress/cli
      - run: lps snippet push
        env:
          LOOPRESS_TOKEN: ${{ secrets.LOOPRESS_TOKEN }}
```
