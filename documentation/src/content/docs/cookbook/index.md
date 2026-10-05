---
title: Cookbook
description: Practical recipes combining a Composer package with a Custom API Route, a snippet, or hooks and a single-page app, to solve one specific WordPress problem.
---

Each recipe solves one problem with one Composer package and as few files as possible, committed and pushed like the rest of your project:

- most recipes are a [Custom API Route](/api/routes/), one PHP file pushed with `lps api push`;
- a few are a [snippet](/snippets/), when the code reacts to a WordPress event instead of answering a URL, pushed with `lps snippet push`;
- one pairs [hooks](/hooks/) with a [single-page app](/apps/), pushed with `lps hook push` and `lps app push`.

Every recipe states which kind it is at the top. They all rely on [Composer dependency management](/composer/), a Loopress Full feature, to install their package on the site. If verb methods, `permission()`, Composer autoloading or failure isolation are new to you, start with [Writing Route Files](/api/routes/), in particular [using your own Composer dependencies](/api/routes/#using-your-own-composer-dependencies).

Browse by category below or in the sidebar.
