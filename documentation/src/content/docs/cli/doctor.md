---
title: lps doctor
description: Self-diagnose connectivity, plugin, credential and hook problems for the targeted WordPress environment.
---

When a push or pull fails, `lps doctor` tells you whether the problem is the network, the plugin, or the credentials, without opening a ticket.

```bash
lps doctor
lps doctor --env production
```

## What it checks

The command first prints the project, environment and URL it targets (the same resolution every other command uses, including `--env`), then runs the checks in order:

| Check | Failure means |
|-------|---------------|
| WordPress REST API reachable | The site is down, the URL is wrong, or a security plugin blocks `/wp-json/` |
| Loopress plugin installed | The `loopress/v1` endpoints are missing: the plugin is not installed, not active, or outdated |
| Credentials accepted | The application password is rejected by an authenticated core endpoint |
| Plugin recent enough for this CLI | `loopress/v1/capabilities` is missing: the plugin predates this CLI, update it. When it passes, the doctor also prints the edition and version, the environment type, the ACF, form and snippet integrations, the active theme and the state of the Loopress child theme |
| No leftover temporary admin accounts | An interrupted Loopress Full install (see [`project config`](/concepts/#configuring-an-environment)) left its temporary administrator behind. Re-run `lps project config` to remove it, or delete it in wp-admin > Users. The check only reports, it never deletes. Skipped when the credentials are rejected, and informational when they can't list users |
| Hooks load and run without errors | A [hook file](/hooks/) failed to load, or one of its methods threw while running (the last error, until the file is pushed again). Skipped on Loopress Light, which has no hooks |

Each check prints ✓ or ✗ with the cause and the corrective action. If the site is unreachable or no credentials are stored, the remaining checks are skipped instead of piling up timeouts.

## Exit code

`lps doctor` exits non-zero when at least one check fails, so it can guard a CI deploy:

```bash
lps doctor --env staging && lps snippet push --env staging --yes
```

## Example output

```console
Project:      my-site
Environment:  production
URL:          https://example.com

✓ WordPress REST API reachable
✓ Loopress plugin installed (loopress/v1 endpoints)
✓ Credentials accepted (authenticated request)
✓ Plugin recent enough for this CLI (loopress/v1/capabilities)
- Plugin: Loopress Full 2026.17.1, environment type "production"
- Integrations: ACF active, forms none, snippets none
- Theme: twentytwentyfive (block theme)
- Loopress child theme: twentytwentyfive-loopress, not active, `lps theme activate`
✓ No leftover temporary admin accounts
✓ Hooks load and run without errors

All checks passed.
```

`lps doctor --json` returns the same information as a structured `{project, environment, url, checks, ok, pluginVersion, capabilities}` object instead, with one entry per check in `checks` and the site's capabilities as `capabilities` (absent when they couldn't be read).
