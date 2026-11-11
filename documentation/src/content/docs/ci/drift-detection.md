---
title: Drift detection
description: Run lps diff on a schedule in GitHub Actions and notify a webhook when a live site no longer matches your repository.
---

Drift is a change made directly on a site (in wp-admin, by a plugin, by a teammate) that your repository does not know about. `lps diff` compares your tracked files with an environment and reports the difference, so a scheduled job can warn you before the next `lps push` overwrites it.

The webhook variant below needs no token: the job only reads from the site, using the site credentials already stored in your project configuration. You can also [report to Loopress](#report-to-loopress) instead, with a token and no webhook.

## How it works

- `lps diff --env <name> --json` prints a machine readable report.
- The exit code is `0` when in sync, `1` on drift, `2` when a resource could not be compared.
- The report has this shape:

```json
{
  "drift": true,
  "left": "production",
  "right": "local files",
  "resources": {
    "snippet": { "added": [], "changed": [], "removed": [] }
  }
}
```

A resource that could not be compared carries an `error` string.

## Setup

1. Configure the project once on your machine (`lps project config`).
2. Store the export of the environment as a repository secret named `LOOPRESS_CONFIG`: `lps project export --env production | gh secret set LOOPRESS_CONFIG`. It holds only that one environment's credentials, not your whole `config.json`. See [Refreshing the secret](/ci/#refreshing-the-secret) for the 90-day rotation.
3. Store the webhook URL (Slack, Discord, or any endpoint accepting JSON) as a secret named `DRIFT_WEBHOOK_URL`.
4. Add the workflow below to `.github/workflows/drift.yml`.

## GitHub Actions template

```yaml
name: Drift detection

on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:

jobs:
  drift:
    runs-on: ubuntu-latest
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

      - name: Compare production with the repository
        id: diff
        run: |
          set +e
          lps diff --env production --json > drift.json
          echo "code=$?" >> "$GITHUB_OUTPUT"

      - name: Notify the webhook
        if: steps.diff.outputs.code != '0'
        env:
          WEBHOOK_URL: ${{ secrets.DRIFT_WEBHOOK_URL }}
          CODE: ${{ steps.diff.outputs.code }}
        run: |
          if [ "$CODE" = "1" ]; then
            TEXT="Drift detected on production in ${GITHUB_REPOSITORY}"
          else
            TEXT="Drift check inconclusive on production in ${GITHUB_REPOSITORY}"
          fi
          jq -n --arg text "$TEXT" --arg run "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}" \
            --slurpfile report drift.json '{text: ($text + ": " + $run), report: $report[0]}' \
            | curl -fsS -X POST -H 'Content-Type: application/json' --data @- "$WEBHOOK_URL"

      - name: Keep the report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: drift-report
          path: drift.json
```

The payload has a `text` field (what Slack and Discord-compatible endpoints display) plus the full `report`. Adapt the `jq` expression if your endpoint expects another shape.

## Report to Loopress

Instead of (or next to) a webhook, the job can send each result to your Loopress console, which shows the drift status of every environment with the date of the last check. No webhook and no `jq` step: with a token present, `lps diff` reports by itself.

1. Create a token in the console and store it as a repository secret named `LOOPRESS_TOKEN`.
2. Make sure the environment's URL in the console matches the `url` in your site credentials: the report is attached to the environment with that exact URL.
3. Store the export as `LOOPRESS_CONFIG`, as above (`lps project export --env production | gh secret set LOOPRESS_CONFIG`).

```yaml
name: Drift detection

on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:

jobs:
  drift:
    runs-on: ubuntu-latest
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

      - name: Compare production with the repository
        env:
          LOOPRESS_TOKEN: ${{ secrets.LOOPRESS_TOKEN }}
        run: lps diff --env production
```

Reporting is best effort: it never changes the exit code nor the `--json` output, and a failure to reach Loopress is silent. The exit code still fails the job on drift (`1`) or when the comparison is inconclusive (`2`); add `|| true` to the command if you only want the console to show the result. The report sends the site URL, status, and exit code, plus the resource, ID, and kind of change (added, changed, removed) for each item. It never sends the content of the diff.

## Preview a pull request

`lps diff --env production --json` on a pull request previews tracked resource changes, with no secret beyond `LOOPRESS_CONFIG`. It excludes plugins declared in `loopress.json`: without a `composer.json`, run `lps plugin status --env production` to check plugin drift (floating versions can still update on push). See [GitHub Actions](/ci/github-actions/#preview-what-a-pull-request-will-change).

## Variations

- Compare two environments instead of local files: `lps diff --env staging --against production --json`.
- Limit the comparison: `--only snippet --only acf`, or `--skip composer`.
- To fail the workflow on drift instead of notifying, run `lps diff --env production` alone: the non-zero exit code fails the job.
