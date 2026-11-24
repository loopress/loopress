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

## Guard against wp-admin edits before a deploy

`lps push` overwrites what was changed on the site outside the repository. On a laptop, `lps push` checks this against its last snapshot. A CI job has no snapshot, so this workflow runs the setup-ci drift guard before the push. It fails the deploy when it would overwrite an edit made in wp-admin, and names the resources.

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
          curl -fsSL https://raw.githubusercontent.com/loopress/setup-ci/main/scripts/drift-guard.sh -o /tmp/drift-guard.sh
          bash /tmp/drift-guard.sh production "${{ github.event.before }}"
      - run: lps push --env production --yes
      - run: lps diff --env production
```

How it works:

- `fetch-depth: 0` gives the job the previous commit, `github.event.before`.
- The guard runs `lps diff --env production --json` twice: in a temporary `git worktree` of the previous commit, and in the checkout being deployed. It needs `jq`, which GitHub-hosted runners include.
- It blocks only on resources present in both reports. Those differ from the previous commit (so the site was edited outside the repository) and from the commit being deployed (so the push would overwrite the edit). Run `lps pull --env production`, commit the result and deploy again. `lps pull` does not cover static pages (they have no `pull`): for a blocked page, copy the wp-admin edit into the page's file by hand, commit and deploy again.
- A comparison that exits `2` (a resource could not be compared) only warns.
- With no previous commit (first push, new branch) or one that cannot be fetched, the guard is skipped with a warning.
- `lps diff --env production` after the push verifies that the site now matches the repository.
- `concurrency` keeps two runs from deploying to the same environment at once.

### Why two diffs

Comparing the site with the previous commit alone would refuse the very commit that pulls a wp-admin edit into the repository: the site still differs from the previous commit, but the deployed files now contain the edit, so nothing would be overwritten. Requiring the id in both reports lets that commit through.

### Limit

The guard assumes the previous commit was deployed. After a failed or skipped deploy, the site legitimately differs from it and the guard can raise a false alarm. Set the repository variable `LOOPRESS_SKIP_DRIFT_GUARD` to `1` to skip it for one run, then remove it.

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
