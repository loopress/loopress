---
title: Loopress Account
description: Log in to the Loopress console to share projects between machines, publish snippets and routes, and see your deployments.
---

Everything that syncs with WordPress works without a Loopress account. An account adds what a single machine can't do on its own: sharing your project configuration between machines, publishing reusable snippets and route files, and a history of deployments in the console at [console.loopress.dev](https://console.loopress.dev).

## Log in

```bash
lps login
```

This opens `console.loopress.dev` in your browser. After you approve, the CLI stores a token in `$XDG_DATA_HOME/loopress/auth.json`, or `~/.local/share/loopress/auth.json` if that variable is unset, and returns you to the terminal.

```bash
lps logout   # Remove the stored token
```

## Share projects between machines

Both commands require being logged in.

| Command | Description |
|---------|-------------|
| `lps project push` | Create a matching project and environment on your Loopress account for each one configured locally, then push the WordPress Application Password as that environment's credentials. Run it again after adding projects or environments: it only creates what's missing and always refreshes credentials. |
| `lps project pull` | Fetch the projects and environments already on your account and add the ones not configured locally yet. Useful when setting up a new machine. |

## Publish snippets and routes

`lps snippet publish` and `lps api publish` upload local files to your Loopress account so they can be deployed to other projects. They don't touch any WordPress site, so they work whichever [plugin edition](/wordpress-plugin/) is installed. The current project must be linked to your account first (`lps project push`).

See [`lps snippet publish`](/snippets/#lps-snippet-publish) and [`lps api publish`](/api/cli/#lps-api-publish).

## Deployment history

When a token is available, each real push is reported to the console (target URL and success or failure), and `lps api push` reports the list of deployed routes. Each record carries the target URL, the status, the command that ran (for example `theme:push`), and, when the project is a Git repository, the current commit hash and whether the working tree had uncommitted changes. Nothing else from your repository is sent, and outside a Git repository the commit is simply omitted. This is best effort: it never blocks or fails a push.

After a successful `lps plugin push` (a full `lps push` runs it as a step), the deployment record also carries the plugins listed in `loopress.json`: for each one the slug, the pinned version and whether it must be active. Other commands send no plugin list.

## Plugin audit reports

When a token is available, `lps plugin audit` also sends its result to the console once it has printed it: the target URL, and for each advisory only the plugin slug, its version, the CVE, the severity, the fixed version and the title, plus the health notes. This is best effort with a 3 second timeout: it never changes the output or the exit code, and without a token nothing is sent.

## Drift reports

When a token is available, `lps diff` also sends its result to the console once it has printed it: the target URL, the verdict (`clean`, `drift` or `inconclusive`), the exit code, and for each difference only the resource, the id and the kind of change (`added`, `removed` or `changed`). File contents and patches are never sent. Comparing two environments with `--against` is not reported. This is best effort with a 3 second timeout: it never changes the exit code or the `--json` output, and without a token nothing is sent.

## Tokens for CI

A CI runner can't run `lps login`. Create a token at [console.loopress.dev/tokens](https://console.loopress.dev/tokens) and expose it as the `LOOPRESS_TOKEN` environment variable: the CLI uses it in place of the stored login token. See [CI/CD Integration](/ci/#deploying-to-a-real-environment).
