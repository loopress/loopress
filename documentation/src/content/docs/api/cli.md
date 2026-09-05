---
title: CLI
description: Deploy custom WordPress REST API endpoints from version-controlled PHP files.
---

:::note
`pull`, `push`, and `list` below talk to REST endpoints provided by [Loopress Full](/wordpress-plugin/), the free full edition of the plugin, not Loopress Light. Install it on the site before using those commands. `publish` is the exception: it uploads to your Loopress account, not to WordPress, so it doesn't depend on which plugin edition is installed.
:::

The `api` command group lets you version-control custom WordPress REST API endpoints as plain PHP files in Git. Each file becomes one REST route on the site, no other plugin required. See [Writing Route Files](/api/routes/) for everything a route file can do: request handling, responses, authentication, CORS, and the security model.

Once deployed, every route file shows up in the **API** tab of the plugin's [admin UI](/api/admin-ui/).

## Typical workflow

```bash
# 1. Download existing route files from WordPress
lps api pull

# 2. Edit locally, commit to Git
git add api/ && git commit -m "feat: add webhook endpoint"

# 3. Deploy back to WordPress
lps api push
```

## The local directory

`pull`, `push`, and `publish` each operate on one local directory, resolved the same way:

1. The `path` argument, if given
2. The `apiDir` key in the project's `loopress.json`, if set
3. `./api`, the default

## Commands

### `lps api pull`

Download all custom route files from WordPress and write them as `.php` files, one per route.

```bash
lps api pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./api` (or `loopress.json`'s `apiDir`) | Local directory where route files are written |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |

Local `.php` files whose route no longer exists on WordPress are removed on pull, so the directory always mirrors the site. In a terminal the files are listed and a confirmation is asked first (`--yes` skips it); in scripts and CI they are removed with a warning. `--dry-run` announces them ahead of time. Files without the `.php` extension are never touched.

The files you receive are exactly the source you (or a teammate) pushed: the [`ABSPATH` guard](/api/routes/#where-files-live-on-the-server) the plugin injects at deploy time is stripped before the file is sent back, so pulls never introduce noise in your Git diffs.

**Example:**

```bash
lps api pull --dry-run
```

---

### `lps api push`

Upload `.php` files from a local directory to WordPress. Each file is matched by filename: pushing `hello-world.php` creates or overwrites the route file of the same name on the site.

```bash
lps api push [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./api` (or `loopress.json`'s `apiDir`) | Local directory to read `.php` files from |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be pushed without making any changes |

What push does, and deliberately does not do:

- **Files are validated before anything is written.** The CLI rejects filenames that aren't lowercase kebab-case with an explicit message, and the plugin rejects files with a malformed `declare(strict_types=1);` line, zero or more than one class declared, or a class name that collides with WordPress core, another active plugin, or another `api/` file. Invalid PHP syntax is also rejected (returning the parse error) when the server can run the check; where it's unavailable (no PHP CLI binary, `exec` disabled), the push succeeds and a broken file is instead caught later, when `RouteLoader` tries to load it. See [Writing Route Files](/api/routes/#anatomy-of-a-route-file) for the exact rules.
- **One bad file doesn't block the rest.** Files are pushed one by one; a failure is reported per file and the remaining files still go through. The command exits with an error summarizing how many failed.
- **Pushing never deletes a route on WordPress**, even if the local file is gone. Only `lps api pull` cleans up, and only locally.

**Example:**

```bash
lps api push ./api
```

---

### `lps api list`

Print all custom route files currently on WordPress.

```bash
lps api list
```

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON (filename and full file content per route) instead of formatted text |

**Example output:**

```
Found 2 route files:

  hello-world
  webhook-handler
```

---

### `lps api publish`

Publish local route files to your Loopress account so they can be deployed to other projects. This does not touch any WordPress site, it uploads to Loopress only.

Requires `lps login` first, and the current project must be linked to your Loopress account (`lps project push`).

```bash
lps api publish [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./api` (or `loopress.json`'s `apiDir`) | Local directory to read `.php` files from |

**Example:**

```bash
lps api publish
lps api publish ./api
```

## File format

Each file is named `{slug}.php` and declares exactly one class, named however you like, with one public method per HTTP verb:

```php
<?php

declare(strict_types=1);

class HelloWorld
{
    public function get(): array
    {
        return ['message' => 'Hello, world!'];
    }
}
```

Pushed, this answers at `/wp-json/loopress-api/v1/hello-world`.

That's the shape; the full reference lives in [Writing Route Files](/api/routes/): reading the request, response types and status codes, opening up a route with `permission()`, CORS via `headers()`, the configurable namespace, using Composer packages, and how broken files are isolated.
