---
title: Plugin update PRs
description: Open a weekly pull request that bumps the plugin versions pinned in loopress.json, after checking them on a throwaway WordPress and auditing them.
---

Plugin versions are pinned in `loopress.json`, so an update is a reviewable change. This workflow proposes it for you every week: it runs `lps plugin update`, applies the result to a throwaway WordPress to make sure the new versions install, runs `lps plugin audit`, and opens a pull request that shows what changed.

No token is needed, and no real site is touched. The only credentials involved are those of the disposable WordPress that `loopress/setup-ci` boots inside the job.

## How it works

1. `lps plugin update --json` rewrites the versions in `loopress.json` and lists the changes (`changes` with `slug`, `from`, `to` and `jump`, plus `skipped`). It exits `1` when WordPress.org could not be reached for a plugin.
2. `loopress/setup-ci` boots a throwaway WordPress and writes the site credentials for it (see [GitHub Actions](/ci/github-actions/)).
3. `lps push` applies the updated project to that site. A version that does not install fails the job, so no pull request is opened for it.
4. `lps plugin audit` checks the new versions against a vulnerability database. It exits non-zero when a known vulnerability affects a pinned version, which is reported in the pull request instead of failing the job.
5. `peter-evans/create-pull-request` commits `loopress.json` on a branch and opens (or updates) the pull request.

The pull request body holds a before/after table built from the `--json` report, and the audit output.

## Setup

1. Commit `loopress.json` with your plugins pinned (`lps plugin add`, or `lps plugin pull`).
2. Allow GitHub Actions to create pull requests: repository **Settings > Actions > General > Workflow permissions**, tick "Allow GitHub Actions to create and approve pull requests".
3. Add the workflow below to `.github/workflows/plugin-updates.yml`.

## GitHub Actions template

```yaml
name: Plugin updates

on:
  schedule:
    - cron: "0 6 * * 1"
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      - run: npm install -g @loopress/cli

      - name: Bump the pinned versions
        run: lps plugin update --minor --json > updates.json

      - name: Stop when nothing changed
        id: changes
        run: |
          COUNT=$(jq '.changes | length' updates.json)
          echo "count=$COUNT" >> "$GITHUB_OUTPUT"

      # Boots WordPress and writes its site credentials. Nothing from your real sites is used.
      - if: steps.changes.outputs.count != '0'
        uses: loopress/setup-ci@main

      - name: Check the new versions install
        if: steps.changes.outputs.count != '0'
        run: lps push --yes

      - name: Audit the new versions
        if: steps.changes.outputs.count != '0'
        run: |
          set +e
          lps plugin audit > audit.txt 2>&1
          echo "Exit code: $?" >> audit.txt

      - name: Write the pull request body
        if: steps.changes.outputs.count != '0'
        run: |
          {
            echo "Weekly plugin update. The new versions were installed on a throwaway WordPress."
            echo
            echo "| Plugin | Before | After | Jump |"
            echo "|---|---|---|---|"
            jq -r '.changes[] | "| \(.slug) | \(.from) | \(.to) | \(.jump) |"' updates.json
            echo
            echo "### Audit"
            echo
            echo '```'
            cat audit.txt
            echo '```'
          } > body.md

      - name: Open the pull request
        if: steps.changes.outputs.count != '0'
        uses: peter-evans/create-pull-request@v7
        with:
          add-paths: loopress.json
          branch: chore/plugin-updates
          commit-message: "chore(plugins): update pinned plugin versions"
          title: "chore(plugins): update pinned plugin versions"
          body-path: body.md
```

The branch is reused from one week to the next, so an unmerged pull request is refreshed instead of duplicated.

## Site credentials

The job needs no secret: `loopress/setup-ci` creates a disposable site and its credentials every run. If you also want the workflow to read from a real site (for example `lps plugin status --env production`), restore your configuration from a `LOOPRESS_CONFIG` secret exactly as in [Drift detection](/ci/drift-detection/#setup), before the update step.

## Variations

- Update every release, majors included: `lps plugin update --json`. Use `--patch` to take only patch releases.
- Update selected plugins only: `lps plugin update woocommerce akismet --json`.
- Fail the audit step on a vulnerability instead of reporting it: drop the `set +e` and the exit code line.
