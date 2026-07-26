---
title: lps doctor
description: Self-diagnose connectivity, plugin and credential problems for the targeted WordPress environment.
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
| Plugin version | Informational: shown when the plugin exposes it (Loopress Full) |

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
✗ Credentials accepted (authenticated request)
  Authentication failed (401) on https://example.com/wp-json/wp/v2/users/me. Check your credentials with `lps project config`.
- Plugin version: not exposed by this plugin edition.

Error: 1 check failed.
```
