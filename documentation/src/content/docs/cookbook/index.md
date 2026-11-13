---
title: Cookbook
description: "Practical recipes that each solve one WordPress problem: a Composer package in a route, a snippet, hooks or an app, or several Loopress resources together."
---

Each recipe solves one problem with one Composer package and as few files as possible, committed and pushed like the rest of your project:

- most recipes are a [Custom API Route](/api/routes/), one PHP file pushed with `lps api push`;
- a few are a [snippet](/snippets/), when the code reacts to a WordPress event instead of answering a URL, pushed with `lps snippet push`;
- one pairs [hooks](/hooks/) with a [single-page app](/apps/), pushed with `lps hook push` and `lps app push`.

Every recipe states which kind it is at the top. The **Site as Code** recipes need no Composer package: they build a feature from several Loopress resources, such as a [post type](/custom-post-types/), a [taxonomy](/taxonomies/), [post meta](/post-meta/) and a route, pushed together with [`lps push`](/workflow/#lps-push).

The other recipes rely on [Composer dependency management](/composer/), a Loopress Full feature, to install their package on the site. If verb methods, `permission()`, Composer autoloading or failure isolation are new to you, start with [Writing Route Files](/api/routes/), in particular [using your own Composer dependencies](/api/routes/#using-your-own-composer-dependencies).

Browse by category below or in the sidebar.
