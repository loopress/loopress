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
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm install -g @loopress/cli
      - name: Restore site credentials
        env:
          LOOPRESS_CONFIG: ${{ secrets.LOOPRESS_CONFIG }}
        run: |
          mkdir -p ~/.config/loopress
          printf '%s' "$LOOPRESS_CONFIG" > ~/.config/loopress/config.json
      - run: lps push --env production --yes
        env:
          # Optional: only for the cloud features (deployment record)
          LOOPRESS_TOKEN: ${{ secrets.LOOPRESS_TOKEN }}
```

Store the secret with `cfg=$(lps project export --env production) && gh secret set LOOPRESS_CONFIG --body "$cfg"`; see [Refreshing the secret](/ci/#refreshing-the-secret) for the 90-day rotation.

## Guard against overwriting a wp-admin edit

A push from CI has no previous snapshot, so `lps push` cannot notice an edit made on the site since the last deploy. Run the drift guard before the push: it compares the site with the previous commit (what the last deploy pushed, checked out in a temporary `git worktree`) and with the commit being deployed, and fails only on ids that differ from both. The message names them: run `lps pull --env production`, commit, and deploy again.

- No previous commit (first push, new branch) or one that cannot be fetched: the guard is skipped with a warning. An inconclusive comparison only warns.
- It assumes the previous commit was deployed. After a failed or skipped deploy it can raise a false alarm: set the variable `LOOPRESS_SKIP_DRIFT_GUARD=1` to skip it for one run.

```yaml
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: loopress-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm install -g @loopress/cli
      - name: Restore site credentials
        env:
          LOOPRESS_CONFIG: ${{ secrets.LOOPRESS_CONFIG }}
        run: |
          mkdir -p ~/.config/loopress
          printf '%s' "$LOOPRESS_CONFIG" > ~/.config/loopress/config.json
      - name: Drift guard
        env:
          LOOPRESS_SKIP_DRIFT_GUARD: ${{ vars.LOOPRESS_SKIP_DRIFT_GUARD }}
        run: |
          curl -fsSL https://raw.githubusercontent.com/loopress/setup-ci/v1/scripts/drift-guard.sh -o /tmp/drift-guard.sh
          bash /tmp/drift-guard.sh production "${{ github.event.before }}"
      - run: lps push --env production --yes
      - run: lps diff --env production
```

`fetch-depth: 0` gives the guard the previous commit (`github.event.before`), and `concurrency` keeps two runs from deploying to the same environment at once, so the guard of the second run sees the first deploy.

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
