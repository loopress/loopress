---
title: Hooks
description: Version-control WordPress actions, filters, and scheduled (cron) tasks as plain PHP files.
---

:::note
Hooks are a [Loopress Full](/wordpress-plugin/) feature, not available in Loopress Light.
:::

:::tip
Since these files call WordPress functions from a repo where WordPress isn't installed, set up [WordPress stubs](/editor-setup/) once to get autocomplete and static analysis in your editor. The same page covers the [`loopress/php-attributes`](/editor-setup/#loopress-attribute-classes) package, which resolves the `#[Action]`, `#[Filter]`, and `#[Cron]` attributes used below.
:::

A hook file is a plain PHP file in your project's `hooks/` directory. Deployed with `lps hook push`, each file's class binds one or more WordPress actions, filters, or cron jobs directly, the same primitive a `functions.php` snippet would use, just version-controlled and pushed like the rest of your project.

Unlike [custom API routes](/api/), a hook has no URL and no permission check of its own: once pushed, it runs automatically whenever WordPress fires the hook it's bound to, with no manage_options-style gate in front of it. For `#[Action]`/`#[Filter]` that means every request that fires that specific hook, from `init` (every page) to something narrower like `save_post` (only a save); for `#[Cron]` it means every occurrence of the schedule, in the background, not tied to any visitor at all. Keep that in mind when writing one, a mistake affects everything that hits the hook it's bound to, not just calls to one endpoint.

## Anatomy of a hook file

```php
<?php

declare(strict_types=1);

use Loopress\Hooks\Attribute\Action;
use Loopress\Hooks\Attribute\Filter;

class ContentHooks
{
    #[Filter('the_content', priority: 20)]
    public function appendNotice(string $content): string
    {
        return $content . '<p>Thanks for reading!</p>';
    }

    #[Action('save_post')]
    public function onSave(int $postId): void
    {
        // ...
    }
}
```

Saved as `hooks/content-hooks.php` and pushed, `appendNotice()` filters `the_content` at priority 20, and `onSave()` runs on `save_post`.

Two things tie everything together:

| Element | Rule |
|---------|------|
| Class | Exactly one class per file. The class name itself doesn't matter, discovered from the file's own tokens, not from its filename. |
| Method | Any public method attributed with `#[Action]`, `#[Filter]`, or `#[Cron]`. A file needs at least one, but a single class can carry as many as it wants, mixed freely. |

## `#[Action]` and `#[Filter]`

```php
#[Action(string $hook, int $priority = 10, int $acceptedArgs = 1)]
#[Filter(string $hook, int $priority = 10, int $acceptedArgs = 1)]
```

Both map straight onto WordPress's own [`add_action()`](https://developer.wordpress.org/reference/functions/add_action/) / [`add_filter()`](https://developer.wordpress.org/reference/functions/add_filter/): `hook` is the WordPress hook name, `priority` and `acceptedArgs` behave exactly as they do there.

A `#[Filter]` method must return the (possibly modified) value it receives:

```php
#[Filter('excerpt_length')]
public function shorten(int $length): int
{
    return 20;
}
```

If a hook method throws, it's caught and logged rather than left to break the page for every visitor: an `#[Action]` simply doesn't run, a `#[Filter]` falls back to the original, unfiltered value.

## `#[Cron]`

```php
#[Cron(string $recurrence, ?string $hook = null)]
```

Runs a method on a recurring schedule instead of an existing WordPress event:

```php
use Loopress\Hooks\Attribute\Cron;

class InvoiceCleanup
{
    #[Cron('daily')]
    public function cleanup(): void
    {
        // ...
    }
}
```

`recurrence` is any WordPress schedule name: the built-in `hourly`, `twicedaily`, and `daily`, or a custom one your own code registers via the [`cron_schedules`](https://developer.wordpress.org/reference/hooks/cron_schedules/) filter.

The event is scheduled the first time the method is seen, and left alone after that: WordPress's own [`wp_next_scheduled()`](https://developer.wordpress.org/reference/functions/wp_next_scheduled/) check means it's only ever scheduled once. Changing `#[Cron('daily')]` to `#[Cron('hourly')]` later doesn't reschedule the already-running event, clear it yourself first with [`wp_clear_scheduled_hook()`](https://developer.wordpress.org/reference/functions/wp_clear_scheduled_hook/) if you need the new recurrence to take effect immediately.

By default the WordPress action bound to the job is `loopress_hooks_cron_{slug}_{method}` (slashes in a nested slug become underscores), pass `hook` to `#[Cron]` to name it yourself, useful if another part of your code needs to `do_action()` the same job on demand:

```php
#[Cron('daily', hook: 'acme_invoice_cleanup')]
public function cleanup(): void { /* ... */ }
```

## Typical workflow

```bash
# 1. Download existing hook files from WordPress
lps hook pull

# 2. Edit locally, commit to Git
git add hooks/ && git commit -m "feat: append a reading notice via the_content"

# 3. Deploy back to WordPress
lps hook push
```

## Commands

### `lps hook pull`

Download all hook files from WordPress.

```bash
lps hook pull [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./hooks` | Local directory where hook files are written |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be written without touching the filesystem |

A local `.php` file whose slug no longer exists on WordPress is removed on pull, same as `lps api pull`.

---

### `lps hook push`

Upload `.php` files from a local directory to WordPress.

```bash
lps hook push [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `./hooks` | Local directory to read `.php` files from |

| Flag | Description |
|------|-------------|
| `--dry-run` / `-d` | Show what would be pushed without making any changes |

Each file must start with `declare(strict_types=1);` exactly once, and declare exactly one class, same validation as `lps api push` (syntax check, ABSPATH guard, class-name collision detection).

---

### `lps hook list`

Print all hook files currently on WordPress.

```bash
lps hook list
```

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON instead of formatted text |

---

### `lps hook diff`

Show what differs between your local hook files and a WordPress environment, or between two environments. Also included in the aggregate `lps diff` (`lps diff --only hook`).

```bash
lps hook diff
```
