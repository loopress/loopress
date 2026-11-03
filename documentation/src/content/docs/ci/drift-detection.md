---
title: Drift detection
description: Run lps diff on a schedule in GitHub Actions and notify a webhook when a live site no longer matches your repository.
---

Drift is a change made directly on a site (in wp-admin, by a plugin, by a teammate) that your repository does not know about. `lps diff` compares your tracked files with an environment and reports the difference, so a scheduled job can warn you before the next `lps push` overwrites it.

No token is needed: the job only reads from the site, using the site credentials already stored in your project configuration.

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
2. Store your `config.json` (`$XDG_CONFIG_HOME/loopress/config.json`, or `~/.config/loopress/config.json`) as a repository secret named `LOOPRESS_CONFIG`.
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

## Variations

- Compare two environments instead of local files: `lps diff --env staging --against production --json`.
- Limit the comparison: `--only snippet --only acf`, or `--skip composer`.
- To fail the workflow on drift instead of notifying, run `lps diff --env production` alone: the non-zero exit code fails the job.
