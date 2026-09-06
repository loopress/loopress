---
title: How Loopress Light Got Into the WordPress.org Directory
description: Loopress Light is on the official directory. Getting there meant an initial rejection, a failed appeal over snippet sync, and rebuilding the plugin around what the review team said they would accept.
date: 2026-09-06
draft: false
cliVersion: 0.23.0
wordpressPluginVersion: 2026.8.1
authors:
  - maxime
tags:
  - wordpress
  - wordpress.org
  - acf
  - seo
  - security
  - open source
excerpt: Submitted in July with code snippet sync, rejected, appealed, rejected again. Here is what the WordPress.org review team said, in their own words, and how Loopress Light ended up in the directory as an ACF and SEO sync tool instead.
---

Loopress Light is now on the [wordpress.org plugin directory](https://wordpress.org/plugins/loopress-light/). You install it from **Plugins, Add New** in any WordPress admin, and it updates itself from there.

Getting it accepted took an initial rejection, a failed appeal, and removing the feature the plugin was first built around. The [Composer side of that story is here](/blog/wordpress-org-composer-rejection/). This is the snippet sync half, mostly in the review team's own words.

## The first no

We submitted Loopress Light on 16 July 2026. That version carried code snippet sync: the CLI could push and pull [Code Snippets](https://wordpress.org/plugins/code-snippets/) and [WPCode](https://wordpress.org/plugins/wpcode/) entries over a REST API, so snippets could live in Git alongside the rest of a project.

The rejection came back within a day, and it was categorical:

> Your plugin has been rejected because we are not accepting plugins of this nature in most cases.

> Script insertion plugins are amazing and powerful. They're also incredibly dangerous and require a high level understanding of sanitization, security, and usage.

The directory rejects this whole category by default. Not this implementation, the category.

## The appeal, and why it lost

We wrote back the next day, arguing the mechanism was narrower than "an API that inserts scripts":

- Loopress Light never executes snippet code. It moves a snippet's fields (name, code, type, location) into Code Snippets or WPCode through that plugin's own API. Storage, sanitization, and execution all stay inside the plugin the site owner already installed for exactly that.
- It is inert on its own. If neither Code Snippets nor WPCode is active, every endpoint returns a 400 and the plugin does nothing.
- Access uses WordPress core's own Application Passwords flow. The site owner approves the CLI on WordPress's own authorization screen and can revoke it from their dashboard at any time. We do not ship an auth scheme.
- Every write is gated by `current_user_can('manage_options')`, the same capability already required to edit a snippet by hand.

The answer did not move:

> The plugin provides REST endpoints through which arbitrary PHP, JavaScript, CSS, and other code can be remotely submitted and stored in Code Snippets or WPCode, where that code can then be executed. It therefore facilitates remote deployment of arbitrary executable code, even though the final execution occurs in another plugin.

And on the authentication argument specifically:

> Application Passwords and manage_options checks establish who is authorized to make the request. They do not validate that the submitted code is safe, nor do they remove the inherent risks of providing an arbitrary-code deployment mechanism.

We had also pointed at the snippet plugins already in the directory. That got a direct response too:

> Those plugins were approved years ago, before real-world experience demonstrated the risks of this model. Removing established plugins now could cause greater harm to their existing users, but their continued presence is not a basis for accepting new plugins that provide or facilitate the same capability.

The takeaway: on this pattern, the directory does not weigh how good your authentication and capability checks are. The ability to deploy arbitrary code remotely is the thing they reject, wherever the execution finally lands.

## Asking instead of guessing

The rejection ended with a specific instruction: do not resubmit as is, and

> A materially different approach, such as providing only predefined, non-modifiable, thoroughly vetted operations rather than accepting arbitrary code, would need to be considered instead.

We had recently built ACF and SCF configuration sync into the CLI: push and pull custom field groups, post types, taxonomies, and options pages as JSON. That is configuration data, not executable code. Rather than strip the plugin and resubmit blind, we described the new flow to the team, an external caller hitting a REST endpoint that maps JSON to ACF's own API and nothing else, and asked whether it would clear the same bar.

> Synchronizing ACF/SCF configuration represented as JSON would not, by itself, raise the same arbitrary executable-code concern as the rejected snippet synchronization feature. However, we cannot pre-approve a plugin from a description or workflow diagram.

They listed what a full review would still check: that all snippet and arbitrary-code functionality was gone, that the synced data could not carry PHP, JS, CSS, or HTML, and that every REST endpoint had authentication, capability checks, validation, and sanitization. Not a green light, but enough to build against.

## The rebuild

Snippet sync came out of the edition that ships to wordpress.org. Not disabled behind a flag: the code is physically absent from the zip, and a CI step unzips the built artifact and greps it for residue. The [Composer post](/blog/wordpress-org-composer-rejection/) covers the one-codebase, two-artifact build in detail.

Snippet sync, WPForms sync, custom REST API routes, and Composer dependency management all live in **Loopress Full** now, distributed from [loopress.dev](https://loopress.dev), never the directory. **Loopress Light** is what was left: ACF and SEO configuration sync, plain JSON, over a `loopress/v1` REST API restricted to administrators.

## Then the ordinary review

The resubmission cleared the policy question and hit a normal technical-issues pass. Two items:

- Two inline `<style>` blocks echoed straight into the admin page. Moved to `wp_enqueue_style` and `wp_add_inline_style`.
- The top-level admin menu registered at position 6, sitting up among Posts and Media. Dropped to 100, below Settings.

Both were fixed in one commit, and after that Loopress Light was approved.

Worth knowing if you are in this queue now: the review emails are partly automated (the team says so in the footer, and that no personal data is shared with the AI), and they ask for short replies that do not enumerate your changes, because they re-review the whole plugin regardless.

## Which edition you want

If you sync ACF field groups and SEO settings, install [Loopress Light](https://wordpress.org/plugins/loopress-light/) from the directory and let it update itself.

If you also need snippet sync, WPForms sync, version-controlled REST API routes, or Composer packages managed from the admin, that is [Loopress Full](/wordpress-plugin/), a separate download, for the reasons above.

## Thanks

The review team was direct at every step, including the ones where the answer was no, and the citations were specific enough to act on each time. Answering the ACF question before a full resubmission is the part we are most grateful for. It turned a blind rebuild-and-hope into a scoped piece of work.
