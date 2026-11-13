---
title: Concepts
description: Projects and environments, common flags, dry runs, how pull and push treat your files, and how the CLI behaves in CI.
---

This page covers the rules every `lps` command shares. Each feature page then only documents what is specific to it.

## Projects and environments

A **project** is one WordPress site you manage, and an **environment** is one installation of it: your local copy, a staging site, production. Each environment has a **type** (`local`, `staging` or `production`, WordPress's own vocabulary, see `wp_get_environment_type()`), a **name** you choose (what `--env` takes), its own URL and its own Application Password. The type, never the name, decides how careful Loopress is: an environment of type `production` asks for confirmation before a push, whatever it is called (`live`, `prod`...).

```bash
lps project config          # Add or update a project/environment
lps project list            # Show all configured projects and their environments
lps project switch          # Interactively pick the active project
lps project rm          # Remove a saved project or environment
lps project rotate          # Rotate the Application Password of the active (or --env) environment
```

### Configuring an environment

`lps project config` prompts for:

| Prompt | Description |
|--------|-------------|
| Project name | Any name not already used (e.g. `My Site`). The project id commands use is derived from it (`my-site`) |
| Environment type | `local`, `staging` or `production`. Drives the production confirmation, and allows plain HTTP for `local` only |
| Environment name | Free text, what `--env` takes. Defaults to the type. The default target is the environment named `local` |
| WordPress URL | Full URL including scheme (`https://example.com`) |
| How to authenticate | **Authorize in my browser (recommended)** or **Enter credentials manually** |

By default the CLI runs a quick diagnostic against your site, then opens your browser to log in to WordPress and creates an [Application Password](/application-passwords/) for you automatically, no copy-pasting required. If the diagnostic fails or the browser flow can't complete, it falls back to manual entry: your WordPress username and an Application Password you generate yourself under **Users → Profile → Application Passwords**. You can also choose manual entry upfront.

Browser authorization needs WordPress 7.0 or later: older versions refuse to send the Application Password back to the CLI on your machine. The diagnostic reads your site's WordPress version and goes straight to manual entry on an older one. If the version is hidden (some security plugins remove it), the CLI tries the browser anyway; if WordPress then says the URL must be served over a secure connection, press Ctrl-C and run `lps project config` again with manual entry.

The browser flow talks to your site directly, with no Loopress server in between. The CLI opens a short-lived loopback server on `127.0.0.1`, which WordPress redirects to once you approve, and only accepts the credential if the redirect carries the one-time `state` value the CLI generated. A request sent with an `Origin` header (a script on another site) is rejected. WordPress puts the Application Password in that redirect URL, so the confirmation page immediately rewrites its own address to remove it from your browser history.

If Loopress Full isn't active on the site yet, `project config` then offers to install it for you, after a confirmation prompt: it downloads the latest release, creates a temporary administrator account, uploads and activates the plugin through a headless local browser (Chrome, Edge or Chromium must be installed), then deletes the temporary account. The account is removed even if the install fails or you press Ctrl-C. If the process is killed outright or the network drops before that, Loopress Full removes the leftover account within the hour once it's active, and shows a notice in wp-admin until then. If the install stopped before Full was activated, the next `lps project config` run on the same site removes it, and `lps doctor` reports it until then. This step is independent of the authentication mode. If the automatic install can't complete (some managed hosts block file uploads via `DISALLOW_FILE_MODS`), the command falls back to instructions for a [manual upload](/wordpress-plugin/#installation).

### Exporting an environment for CI

`lps project export --env <name>` prints to stdout a `config.json` holding only the current project (from `loopress.json`) and that one environment: no other project, no telemetry setting. It has the same format as the real file, so a CI job restores it unchanged. Pipe it straight into your CI secret store:

```bash
cfg=$(lps project export --env production) && gh secret set LOOPRESS_CONFIG --body "$cfg"
cfg=$(lps project export --env production) && glab variable set LOOPRESS_CONFIG "$cfg" --type file --protected
```

The output is a credential: when stdout is a terminal, the command warns on stderr. An unknown environment, or no project, is an error that lists the available environments. The command is not exposed as an MCP tool. After `lps project rotate` (or an automatic rotation), the CI copy is revoked, export it again. See [CI/CD integration](/ci/#refreshing-the-secret).

### Where configuration lives

| File | Scope | Holds |
|------|-------|-------|
| `$XDG_CONFIG_HOME/loopress/config.json` (or `~/.config/loopress/config.json`) | Your machine | Projects, environments, URLs and Application Passwords, plus the active project |
| [`loopress.json`](/loopress-json/) | Your repository | Which project the repository belongs to, where each kind of file lives, pinned plugins and themes |

An environment saved before types existed has none: commands refuse it with "run `lps project config`" until you set one. After reading what the Loopress plugin reports, the CLI also warns when the site's `wp_get_environment_type()` disagrees with the configured type (`development` counts as `local`). A local site that never set `WP_ENVIRONMENT_TYPE` reports `production`, set it in `wp-config.php` to silence the warning. It is only a warning, nothing is blocked.

Credentials never go in the repository. To share projects between machines, see [Loopress Account](/account/).

### Targeting an environment

Commands run against the project set by `projectId` in `loopress.json`, or the active project (`lps project switch`) when there is none. Within that project, the environment is never remembered between commands:

1. `--env <name>` when passed.
2. Otherwise the `local` environment, if the project has one.
3. Otherwise the project's only environment.

A project with several environments and no `local` one needs `--env` on every command. So reaching a remote site is always spelled out in the command itself:

```bash
lps snippet push                 # local
lps snippet push --env staging   # staging
lps status --env staging         # preview what would be targeted
```

`--env` errors with the list of available environments if the name does not exist.

## Common flags

These flags work the same way on every command that accepts them. Feature pages only list the flags specific to a command.

| Flag | Description |
|------|-------------|
| `--env <name>` | Target this environment instead of the default one (`local`, or the project's only environment). Accepted by every command that talks to WordPress. |
| `--dry-run` / `-d` | Show what would happen without changing anything, see [dry runs](#dry-runs). |
| `--yes` / `-y` | Answer yes to confirmations: deleting local files on pull, pushing to an environment of type `production` (including the files `api push` and `hook push` delete there), `--prune`, removals, rollbacks. |
| `--overwrite` | Push even over changes made on the site outside Loopress since your last push, see [changes made outside Loopress](#changes-made-outside-loopress). Not implied by `--yes`. |
| `--json` | Print a structured result instead of formatted text, for scripts and the [MCP server](/cli/mcp/). |

## How pull and push treat your files

### Pull mirrors the site

A `pull` writes one local file per object on WordPress, and **removes local files whose object no longer exists there**, so the directory always mirrors the site. In a terminal, the files about to be removed are listed and a confirmation is asked first (`--yes` skips it). In scripts and CI they are removed and reported, so existing pipelines keep working. Each feature page states which local files count as tracked, files outside that convention are never touched.

Single-file resources (`menus/menu-locations.json`, Global Styles) are always overwritten in place.

### Every file carries its identity

Each resource identifies an object by a stable value stored in the file: a snippet's or form's `id`, an ACF object's `key`, a menu's or a post's `slug`, an option's `name`. `push` uses it to update the right object even if you rename the file. That's why you should **pull before editing locally**: a file written by `pull` always carries its identity.

When a file's id doesn't exist on the target site (a fresh install, another environment), `push` creates the object instead and renames the local file to match the id WordPress assigned.

### Push never deletes by default

A `push` creates and updates, it doesn't remove what you don't have locally. The exceptions are explicit: [`lps api push`](/api/cli/#lps-api-push) and [`lps hook push`](/hooks/#lps-hook-push) mirror the repo, they delete server files absent locally (they are listed first, `--no-prune` keeps them, and `--dry-run` shows them), `--prune` on [`lps plugin push`](/plugins/#lps-plugin-push) deactivates untracked plugins, removing an entry from the [plugin lockfile](/plugins/#the-lockfile) or the [theme lockfile](/themes/) uninstalls it (never the active theme), [`lps theme template push`](/pages/#templates-and-parts) mirrors the project into the Loopress child theme (a template, part or CSS file deleted locally is removed from it), and the `remove` commands delete one object on purpose.

Every real push also saves a snapshot of what it replaced, so you can undo it with [`rollback`](/rollback/). See [which resources support it](/rollback/#which-resources-support-it).

### Holding a feature back from an environment

A branch often carries a feature that isn't ready for production next to changes that are. List the feature's files under `environments.<name>.exclude` in `loopress.json`, as globs relative to `rootDir`, and that environment never receives them:

```json
{
  "environments": {
    "production": {
      "exclude": [
        "cpt/vocabulary-games.json",
        "meta/vocabulary-games.json",
        "hooks/vocabulary-games-page.php",
        "theme/templates/*-vocabulary-games.html"
      ]
    }
  }
}
```

`*` matches within one directory, `**` across directories, `?` one character. A glob that names a directory (`apps/games`) covers everything inside it.

Excluded means "leave alone", not "absent": an excluded file is never pushed, and never pruned or mirrored away either. `api push` and `hook push` keep a server file under an excluded path, and the child theme keeps the site's copy of an excluded template or part. Adding an exclude never deletes the feature from the environment.

- `lps push` (and each `lps <resource> push`), `lps diff` and `lps promote` honor it. `lps diff` lists excluded items in their own "held back" group, not as drift, and its exit code ignores them. A push names what it held back, `--dry-run` included.
- `lps pull` and `lps dev` ignore it: the feature keeps flowing into your files and to `local`.
- `lps validate` warns about a glob that matches no file, a typo would let the feature through.
- Exclusion works on whole files: one menu item or one option inside a file can't be held back. Put it in its own file, or edit it by hand. A dynamic block is excluded as its whole folder (`blocks/<slug>`), not file by file. The theme CSS (`theme/css/`, `theme/blocks/`) is bundled whole and can't be excluded.

### Changes made outside Loopress

Before writing, a push compares the site with the state your last push from this machine left it in. If an object was changed there since (an edit in wp-admin, another tool) and the push would write a different version over it, the push stops and names those objects:

```text
Changed on https://acme.com outside Loopress since your last push (2026-10-12T09:14:02.000Z), this push would overwrite: header-menu.
```

Review the difference with `lps diff --only <resource>`, then either bring the site's version into your files (`pull`, or copy the change by hand), or push with `--overwrite` to replace it. In a terminal the push asks instead of stopping, and a `--dry-run` only warns.

Objects added on the site and absent from your files are never flagged, a push doesn't touch them. Nor are objects deleted on the site (in wp-admin, or with a `remove` command): pushing them again overwrites nothing. Once a `pull` brings the change into your files, the push goes through.

This relies on the [snapshots](/rollback/#where-snapshots-live) kept on the machine that pushed, so it protects a push from the same machine. The first push from a new clone or a CI runner has nothing to compare with and isn't checked. Templates and template parts don't need it: a Site Editor edit stays in the database and keeps winning over the pushed file, and the push warns about it.

### Links to another environment

Content copied from one site often keeps that site's absolute URLs. When an option value, a page, a template, a template part or a block pattern holds an absolute URL whose host is another environment of the project, the push warns, `--dry-run` included, and names the URLs:

```text
pages/about links to the "staging" environment (staging.acme.com), it will still point there on production: https://staging.acme.com/contact. Use a relative path (/about) instead.
```

The push never rewrites them, and still goes through. Relative paths (`/contact`), links to the target environment itself and links to any other site pass without a warning. Environments are told apart by host and port, so `localhost:8080` and `localhost:8081` count as two. Menus run their own check on custom item URLs, see [Menus](/menus/).

## Dry runs

Most commands accept `--dry-run` (`-d`), which shows what would happen without making any changes:

```bash
lps snippet push --dry-run
lps composer push --dry-run
```

A push's dry run still reads the target site, the same way [`lps diff`](/workflow/#lps-diff) does, so it fails when the real push would be refused: for example `lps acf push --dry-run` on a site where ACF isn't active.

It also says, for each local item, what the push would do to the site's copy: `created` (the site doesn't have it), `changed` or `unchanged`. A file whose local and site copies match shows as `unchanged`, so you can see at a glance what the push will really change:

```text
$ lps hook push --dry-run
[dry-run] unchanged: bakery-info
[dry-run] changed: products
```

With `--json`, the same list is the result's `changes` array (`{"id": "products", "status": "changed"}`), next to the fields the result already had. A few pushes say more:

- `lps acf push`: ids are `<type>/<key>` (`field-groups/group_product_details`), and a changed field group names its top-level fields under `fields` (`added`, `changed`, `removed`).
- `lps theme template push`: `changes` is split into `templates`, `parts` and `css`. `css` has `style.css`, the bundle of `theme/css/`, and one entry per `theme/blocks/` file. The child theme mirrors the project, so a file it has and the project doesn't is `removed`. A CSS file is `unknown` when the site's Loopress plugin is too old to report its CSS.
- `lps push` and `lps theme push`: each step under `results` carries that step's own result in `result`.

`lps plugin push` and `lps theme version push` don't need them: their dry run already lists what it would install, update or remove. `lps composer push` and `lps app push` don't list per-item statuses yet.

The statuses use the same comparison as `lps diff`, so a value WordPress stores in another form than your file (a default ACF fills in, a Global Styles value WordPress rewrites) makes the item `changed` even when the push wouldn't change what the site does.

## CI and non-interactive use

Without a TTY, or when the `CI` environment variable is set, the CLI never hangs waiting for a prompt:

- Confirmations take their default answer and log it. Pass `--yes` (`-y`) to answer yes explicitly.
- Commands that require interactive input (`lps init`, `lps project config`) fail immediately with instructions. Configure projects on your machine and commit `loopress.json`; in CI, target environments with `--env`.
- Pushing to an environment of type `production` (whatever its name) asks for confirmation in a terminal, and requires `--yes` in CI:

```bash
lps snippet push --env production --yes
```

- A push that would overwrite changes made on the site outside Loopress fails and names them. Pass `--overwrite` to push anyway, see [changes made outside Loopress](#changes-made-outside-loopress).
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
