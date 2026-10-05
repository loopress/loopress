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

When a token is available, each real push is reported to the console (target URL and success or failure), and `lps api push` reports the list of deployed routes. This is best effort: it never blocks or fails a push.

## Tokens for CI

A CI runner can't run `lps login`. Create a token at [console.loopress.dev/tokens](https://console.loopress.dev/tokens) and expose it as the `LOOPRESS_TOKEN` environment variable: the CLI uses it in place of the stored login token. See [CI/CD Integration](/ci/#deploying-to-a-real-environment).
