---
title: CLI
description: Deploy custom WordPress REST API endpoints from version-controlled PHP files.
---

:::note
`api` talks to REST endpoints provided by [Loopress Full](/wordpress-plugin/), the free full edition of the plugin, not Loopress Light. Install it on the site before using these commands.
:::

The `api` command group lets you version-control custom WordPress REST API endpoints as plain PHP files in Git. Each file becomes one REST route on the site, no other plugin required.

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
| `--dryRun` / `-d` | Show what would be written without touching the filesystem |

Local files whose route no longer exists on WordPress are removed on pull, so the directory always mirrors the site.

**Example:**

```bash
lps api pull --dryRun
```

---

### `lps api push`

Upload `.php` files from a local directory to WordPress. Each file is matched by filename. Pushing never deletes a route on WordPress, even if the local file is gone, only `lps api pull` cleans up locally.

```bash
lps api push [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./api` (or `loopress.json`'s `apiDir`) | Local directory to read `.php` files from |

| Flag | Description |
|------|-------------|
| `--dryRun` / `-d` | Show what would be pushed without making any changes |

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
| `--json` / `-j` | Output raw JSON instead of formatted text |

**Example output:**

```
Found 2 route files:

  hello-world
  webhook-handler
```

## File format

Each file is named `{slug}.php`, where `{slug}` is lowercase kebab-case (letters, digits, hyphens only). The filename maps to both a PHP class name and a REST route:

```
api/
  hello-world.php       # class HelloWorld, route /hello-world
  webhook-handler.php   # class WebhookHandler, route /webhook-handler
```

Routes are registered under the `loopress-api/v1` namespace, separate from `loopress/v1` which the CLI itself uses. Each file must declare a class matching its filename (kebab-case to PascalCase) and contain `declare(strict_types=1);` exactly once. The class exposes one public method per HTTP verb it handles:

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

| Method | HTTP verb |
|--------|-----------|
| `get()` | GET |
| `post()` | POST |
| `put()` | PUT |
| `patch()` | PATCH |
| `delete()` | DELETE |

Only the verbs implemented as public methods are registered, every other verb is left off the route entirely.

Two more public methods are recognized if present:

- `permission(): callable` overrides the default `manage_options` capability check for this route
- `headers(): array` sets response headers (e.g. CORS) on every request to this route, including the OPTIONS preflight

:::tip
A route file that fails to load (parse error, missing class, thrown exception) is skipped and logged. It never breaks the rest of the site's REST API.
:::
