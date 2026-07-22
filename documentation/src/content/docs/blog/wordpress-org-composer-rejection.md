---
title: Why wordpress.org Won't Let You Install Composer Packages From a Plugin
description: We asked the wordpress.org plugin review team if a Composer package installer belonged in the official directory. The answer was no, and it reshaped how we ship the Loopress plugin.
date: 2026-07-16
draft: false
authors:
  - maxime
tags:
  - composer
  - wordpress
  - wordpress.org
  - open source
excerpt: We built a Composer UI for the WordPress admin, then asked wordpress.org's review team if it belonged in the official directory. Guideline 8 says no, dynamically installed executable code is never acceptable there, no matter how it's used. Here's the rule, and the one-codebase, two-edition architecture we shipped instead.
---

WordPress doesn't have a package manager. If you want a PHP library in your project, be it Guzzle for HTTP calls or a PDF generation library in a snippet, you're either vendoring the code by hand or running Composer somewhere the WordPress admin can't see.

We built a feature to fix that: a Composer UI inside the WordPress admin. Search Packagist, install a package, audit it for known vulnerabilities, all without SSH access ([full walkthrough here](/blog/wordpress-composer-without-ssh/)). Before shipping it, we asked the wordpress.org plugin review team whether it would be acceptable in the official directory.

The answer was no.

## The rule

Here's the relevant line from Guideline 8 of the wordpress.org plugin directory:

> "Plugins may not send executable code via third-party systems."

Installing a PHP package from Packagist is, by definition, downloading executable code from a third party and writing it to disk. It doesn't matter that our plugin never calls the installed code's autoloader itself, that the user has to load it deliberately from their own snippet. The review team was clear: the indirection changes nothing. The mere presence of that capability is enough to trigger the rule, whether or not it's ever used. There's no folder you can hide it in that makes it acceptable, they weren't shy about saying that outright.

If you want PHP dependencies in a plugin distributed on wordpress.org, the only accepted path is to vendor them at submission time: ship the code, with a compatible license and readable source, not fetch it dynamically.

For us, that meant Composer package management could never live in the same plugin that ships on wordpress.org. Full stop, no clever workaround changes that.

## What we tried first, and undid

Our first move was the obvious one: split into two plugins. A "Core" plugin with snippet sync, distributed on wordpress.org, and a "Plus" plugin with Composer management, distributed separately, with the two detecting each other at runtime.

We built it. Two npm packages, two `composer.json` files, two QA configs, two release pipelines, a filter contract between them so Plus could register itself with Core. Tests passed on both. Then we looked at what we'd actually built and reverted the whole thing the same day.

The duplication cost more than the split saved us. Every config file, every CI job, every README existed twice for no product reason. Worse, one version of the idea we considered, Core dynamically loading Plus's code, would have reintroduced the exact pattern the review team had just told us was the problem. That one wasn't even a contender once we thought it through.

## What we shipped instead

One codebase. Two build artifacts.

```
wordpress-plugin/
├── src/
│   ├── Module/, Service/, RestApi/    snippet sync, shared by both editions
│   └── Dependencies/                  all Composer code, this directory
│                                      is physically absent from the
│                                      wordpress.org build, not just inactive
├── frontend/
│   ├── full/    → App.tsx             Composer UI lives here
│   └── light/   → LightApp.tsx        never imports anything from Dependencies/
└── scripts/build-flavor.cjs           assembles each edition and zips it
```

`pnpm pack:light` produces **Loopress Light**: snippet sync only, no Composer code anywhere in the zip, not dead code, not a disabled feature flag, physically not present. `composer.json` in that build ships with an empty `require`. A CI step unzips the artifact after the build and greps it for Composer residue, because trusting the build script to get this right isn't good enough when the whole point is a compliance boundary.

`pnpm pack:full` produces **Loopress Full**: everything, including the package installer, the security audit, and CLI sync for your `composer.json`/`composer.lock`. It's distributed from our own site, never wordpress.org, and its plugin header sets an `Update URI` that stops wordpress.org from ever pushing an update over it by mistake. If Loopress Light is already active on a site, activating Loopress Full deactivates it. The two editions don't coexist. Full replaces Light, it doesn't sit next to it.

This is the same model ACF and Elementor use for their free/pro split: one codebase, one build script, two artifacts with a real feature boundary between them, not a paywall drawn in the UI.

## The honest tradeoff

If you only need snippet sync, Loopress Light is a free wordpress.org install, same as any other plugin in the directory. If you want Composer packages managed from WordPress without SSH, that's Loopress Full ([see how it works](/blog/wordpress-composer-without-ssh/)), a separate download from our site, precisely because wordpress.org's own rules don't allow that capability to live there. We'd rather tell you that upfront than have you discover it after installing the wrong one.

## Thanks

Credit where it's due: the wordpress.org plugins review team answered our question directly and quickly, before we'd submitted anything. That single clear answer, citing the exact guideline, saved us from finding out the hard way through a full submission and rejection cycle. Loopress Light is in review now, built around that answer from the start.
