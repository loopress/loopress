---
title: Your WordPress Hooks Belong in Git, Not functions.php
description: Loopress Full turns a version-controlled PHP file into live WordPress actions, filters, and cron jobs. Write a class, add an attribute, push it.
date: 2026-09-10
draft: false
cliVersion: 0.24.0
wordpressPluginVersion: 2026.9.0
authors:
  - maxime
tags:
  - hooks
  - wordpress
  - cron
  - git
  - php
excerpt: Every WordPress project has a pile of add_action and add_filter calls holding it together. They live in functions.php or a snippets plugin, invisible to code review. Loopress Full lets you ship them as plain PHP files in Git.
---

You want every blog post to end with a newsletter box. The code is four lines:

```php
add_filter('the_content', function (string $content): string {
    if (!is_singular('post')) {
        return $content;
    }

    return $content . do_shortcode('[newsletter_form]');
});
```

Writing it took a minute. The question that eats the rest of the hour: where does it go, and how does it get to staging and production without someone pasting it into an admin textarea?

## Where hook code lives today

**`functions.php`.** Fastest to write, tied to your theme. Switch themes, lose the hook. A year later it's 900 lines of unrelated callbacks nobody wants to touch.

**A site-specific plugin.** The clean answer, and now your four lines come wrapped in a plugin header, and you still need a way to get that plugin onto each environment and know which version runs where.

**A snippets plugin.** Live in seconds, versioned never. The callback sits in the database, edited through a textarea, invisible to `git log`, invisible to code review. Someone tweaks the priority, something downstream breaks, and there is no diff to point at.

The hook logic is never the hard part. The delivery is.

## One file, one class

With [Loopress Full](https://docs.loopress.dev/wordpress-plugin/) installed, a hook is a plain PHP file in your repo's `hooks/` directory:

```php
<?php

declare(strict_types=1);

use Loopress\Hooks\Attribute\Filter;

class ContentHooks
{
    #[Filter('the_content', priority: 20)]
    public function appendNewsletter(string $content): string
    {
        if (!is_singular('post')) {
            return $content;
        }

        return $content . do_shortcode('[newsletter_form]');
    }
}
```

Save it as `hooks/content-hooks.php` and deploy:

```bash
lps hook push
```

That is the whole thing. No plugin header, no `add_filter` call, no registration array. One class per file, named however you like (the name is read from the file's own tokens, not its filename), and any public method carrying an `#[Action]`, `#[Filter]`, or `#[Cron]` attribute gets wired up. `priority` and `acceptedArgs` map straight onto the arguments you already know from [`add_filter()`](https://developer.wordpress.org/reference/functions/add_filter/).

A `#[Filter]` method returns the value it receives, modified or not. An `#[Action]` returns nothing:

```php
use Loopress\Hooks\Attribute\Action;

class CacheHooks
{
    #[Action('save_post')]
    public function purgeOnSave(int $postId): void
    {
        wp_remote_post('https://cdn.example.com/purge', [
            'body' => ['path' => get_permalink($postId)],
        ]);
    }
}
```

A single class can carry as many of these as it wants, actions and filters mixed freely. Group them by what they touch, not by hook type.

## Cron, without wp-config surgery

The same file format runs scheduled work. `#[Cron]` takes a WordPress recurrence name:

```php
<?php

declare(strict_types=1);

use Loopress\Hooks\Attribute\Cron;

class InvoiceCleanup
{
    #[Cron('daily')]
    public function purgeExpired(): void
    {
        // delete invoice drafts older than 30 days
    }
}
```

`recurrence` is any schedule WordPress knows: the built-in `hourly`, `twicedaily`, `daily`, or a custom one registered through the [`cron_schedules`](https://developer.wordpress.org/reference/hooks/cron_schedules/) filter. The event is scheduled the first time the method is seen and left alone after that, so pushing the same file twice does not stack duplicate jobs.

One sharp edge worth knowing up front: changing `#[Cron('daily')]` to `#[Cron('hourly')]` later does not reschedule the running event. Clear it yourself with [`wp_clear_scheduled_hook()`](https://developer.wordpress.org/reference/functions/wp_clear_scheduled_hook/) if you need the new interval to take effect now. If another part of your code needs to trigger the same job on demand, name the action yourself and `do_action()` it:

```php
#[Cron('daily', hook: 'acme_invoice_cleanup')]
public function purgeExpired(): void { /* ... */ }
```

## Built to not break your site

A hook has no URL and no permission check of its own. Once pushed it runs automatically every time WordPress fires the hook it is bound to, from `init` on every page load to `save_post` on every save, with nothing gating it. A mistake here affects everything that hits that hook, not one endpoint. Loopress keeps that contained:

- `lps hook push` syntax-checks every file server-side and rejects broken PHP with the actual parse error, before anything is written. It also enforces one `declare(strict_types=1);`, exactly one class, and no class-name collision with another plugin.
- If a hook method throws at runtime, it is caught and logged rather than left to white-screen the site. An `#[Action]` simply does not run that time. A `#[Filter]` falls back to the original, unfiltered value.
- Files are protected from direct HTTP access. Pull them back and you get exactly the source you pushed.

Because these files call WordPress functions from a repo where WordPress is not installed, set up [editor stubs](https://docs.loopress.dev/editor-setup/) once for autocomplete and static analysis. The same page covers the [`loopress/php-attributes`](https://docs.loopress.dev/editor-setup/#loopress-attribute-classes) Composer package, which resolves the `#[Action]`, `#[Filter]`, and `#[Cron]` classes your IDE is about to ask about.

## Hooks your repository declares

Because hooks are plain files, the workflow is the one you already have:

```bash
lps hook pull                       # mirror what's on the site locally
git checkout -b add-newsletter-box  # branch, edit, open a PR
lps hook push --dry-run             # see exactly what would change
lps hook push                       # deploy
```

`lps hook list` prints what is live on a site. `lps hook diff` shows what differs between your local files and an environment, or between two environments, and it rolls up into the aggregate `lps diff --only hook`.

Across environments it is the same command with `--env`:

```bash
lps hook push --env staging
# looks right in staging
lps hook push --env production --yes
```

`--yes` is required outside a terminal because pushing to an environment named `production` asks for confirmation first. A local `.php` file whose hook no longer exists on the site is removed on the next `pull`, so the directory stays an honest mirror.

Hooks stop being something you wire up on a site and become something your repository declares.

---

Hooks ship with Loopress Full, the free full edition of the plugin. Loopress Light does not include them.

```bash
npm install -g @loopress/cli
```

The [documentation](https://docs.loopress.dev/hooks/) covers the full attribute reference, the cron scheduling model, and the push validation rules.
