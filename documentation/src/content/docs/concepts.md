---
title: Concepts
description: Projects and environments, common flags, dry runs, how pull and push treat your files, and how the CLI behaves in CI.
---

This page covers the rules every `lps` command shares. Each feature page then only documents what is specific to it.

## Projects and environments

A **project** is one WordPress site you manage, and an **environment** is one installation of it: `production`, `staging`, `local`, or any name you choose. Each environment has its own URL and its own Application Password.

```bash
lps project config          # Add or update a project/environment
lps project list            # Show all configured projects and their environments
lps project switch          # Interactively pick the active project and environment
lps project remove          # Remove a saved project or environment
lps project rotate          # Rotate the Application Password of the active (or --env) environment
```

### Configuring an environment

`lps project config` prompts for:

| Prompt | Description |
|--------|-------------|
| Project name | A local identifier, lowercase, no spaces (e.g. `my-site`) |
| Environment | `production`, `staging`, `development`, or a custom name |
| WordPress URL | Full URL including scheme (`https://example.com`) |
| How to authenticate | **Authorize in my browser (recommended)** or **Enter credentials manually** |

By default the CLI runs a quick diagnostic against your site, then opens your browser to log in to WordPress and creates an [Application Password](/application-passwords/) for you automatically, no copy-pasting required. If the diagnostic fails or the browser flow can't complete, it falls back to manual entry: your WordPress username and an Application Password you generate yourself under **Users → Profile → Application Passwords**. You can also choose manual entry upfront.

The browser flow is pinned to the terminal that started it. The CLI opens a short-lived loopback server on `127.0.0.1`, and only accepts the credential if the reply carries the one-time `state` value the CLI generated and comes from the expected origin. The Application Password is delivered in the reply body, never in a URL, so it stays out of shell history and proxy logs. The `api.loopress.dev` relay only forwards WordPress's redirect so the `success_url` can be HTTPS; it passes the callback through and does not keep the credential.

If Loopress Full isn't active on the site yet, `project config` then offers to install it for you, after a confirmation prompt: it downloads the latest release, creates a temporary administrator account, uploads and activates the plugin through a headless local browser (Chrome, Edge or Chromium must be installed), then deletes the temporary account. This step is independent of the authentication mode. If the automatic install can't complete (some managed hosts block file uploads via `DISALLOW_FILE_MODS`), the command falls back to instructions for a [manual upload](/wordpress-plugin/#installation).

### Where configuration lives

| File | Scope | Holds |
|------|-------|-------|
| `$XDG_CONFIG_HOME/loopress/config.json` (or `~/.config/loopress/config.json`) | Your machine | Projects, environments, URLs and Application Passwords, plus the active project and environment |
| [`loopress.json`](/loopress-json/) | Your repository | Which project the repository belongs to, where each kind of file lives, pinned plugins and themes |

Credentials never go in the repository. To share projects between machines, see [Loopress Account](/account/).

### Targeting an environment

Every command runs against the **active project and environment**, unless `loopress.json` sets a `projectId`. To target another environment for a single command, pass `--env` instead of switching globally:

```bash
lps snippet push --env staging
lps status --env staging     # preview what would be targeted
```

`--env` takes priority over the active environment, and errors with the list of available environments if the name does not exist. Because `lps project switch` changes state shared by every terminal on the machine, `--env` is the safer choice in scripts.

## Common flags

These flags work the same way on every command that accepts them. Feature pages only list the flags specific to a command.

| Flag | Description |
|------|-------------|
| `--env <name>` | Target this environment instead of the active one. Accepted by every command that talks to WordPress. |
| `--dry-run` / `-d` | Show what would happen without changing anything, see [dry runs](#dry-runs). |
| `--yes` / `-y` | Answer yes to confirmations: deleting local files on pull, pushing to `production`, `--prune`, removals, rollbacks. |
| `--json` | Print a structured result instead of formatted text, for scripts and the [MCP server](/cli/mcp/). |

## How pull and push treat your files

### Pull mirrors the site

A `pull` writes one local file per object on WordPress, and **removes local files whose object no longer exists there**, so the directory always mirrors the site. In a terminal, the files about to be removed are listed and a confirmation is asked first (`--yes` skips it). In scripts and CI they are removed and reported, so existing pipelines keep working. Each feature page states which local files count as tracked, files outside that convention are never touched.

Single-file resources (`seo/settings.json`, `menus/menu-locations.json`, Global Styles) are always overwritten in place.

### Every file carries its identity

Each resource identifies an object by a stable value stored in the file: a snippet's or form's `id`, an ACF object's `key`, a menu's or a post's `slug`, an option's `name`. `push` uses it to update the right object even if you rename the file. That's why you should **pull before editing locally**: a file written by `pull` always carries its identity.

When a file's id doesn't exist on the target site (a fresh install, another environment), `push` creates the object instead and renames the local file to match the id WordPress assigned.

### Push never deletes by default

A `push` creates and updates, it doesn't remove what you don't have locally. The exceptions are explicit: `--prune` on [`lps api push`](/api/cli/#lps-api-push) and [`lps hook push`](/hooks/#lps-hook-push) deletes server files absent locally, `--prune` on [`lps plugin push`](/plugins/#lps-plugin-push) deactivates untracked plugins, removing an entry from the [plugin lockfile](/plugins/#the-lockfile) uninstalls it, and the `remove` commands delete one object on purpose.

Every real push also saves a snapshot of what it replaced, so you can undo it with [`rollback`](/rollback/).

## Dry runs

Most commands accept `--dry-run` (`-d`), which shows what would happen without making any changes:

```bash
lps snippet push --dry-run
lps composer push --dry-run
```

A push's dry run still reads the target site, the same way [`lps diff`](/workflow/#lps-diff) does, so it fails when the real push would be refused: for example `lps acf push --dry-run` on a site where ACF isn't active.

## CI and non-interactive use

Without a TTY, or when the `CI` environment variable is set, the CLI never hangs waiting for a prompt:

- Confirmations take their default answer and log it. Pass `--yes` (`-y`) to answer yes explicitly.
- Commands that require interactive input (`lps init`, `lps project config`) fail immediately with instructions. Configure projects on your machine and commit `loopress.json`; in CI, target environments with `--env`.
- Pushing to an environment named `production` asks for confirmation in a terminal, and requires `--yes` in CI:

```bash
lps snippet push --env production --yes
```

- Pull commands that would delete local files no longer present on WordPress remove them and report them, see [pull mirrors the site](#pull-mirrors-the-site).

See [CI/CD Integration](/ci/) for complete pipelines.

## Error reporting

Loopress sends crash reports to Sentry so bugs can be found and fixed. A crash report includes the command name, its flags and arguments as typed, your Node.js version, and OS. WordPress credentials are never included.

```bash
lps telemetry disable   # Persists across all future commands
lps telemetry enable    # Re-enable
```

Or set `LOOPRESS_TELEMETRY_DISABLED=1` to override the persisted preference for a single run, useful in CI.

## Troubleshooting

When a command fails and the cause is unclear, run [`lps doctor`](/cli/doctor/): it checks that the site is reachable, the plugin installed, and the credentials valid, each with a corrective action. If authentication fails with a `401`, see [Application Passwords](/application-passwords/).
