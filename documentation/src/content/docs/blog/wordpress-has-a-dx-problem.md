---
title: WordPress Has a DX Problem, and Developers Are Paying for It
description: WordPress powers a huge share of the web but treats developers like afterthoughts. This post explains the problem and what a better workflow looks like.
date: 2026-07-08
draft: false
authors:
  - maxime
tags:
  - developer experience
  - wordpress
  - beginners
excerpt: WordPress is powerful. But if you're a developer, working with it can feel like you're fighting the tool instead of building with it. Here's why, and what to do about it.
---

WordPress is remarkable. It powers well over 40% of all websites, according to [W3Techs](https://w3techs.com/technologies/details/cm-wordpress). Your clients love it. Their non-technical staff can update content without calling you. The plugin ecosystem is enormous.

But if you're a developer, the moment you sit down to *build* with WordPress, something feels off.

You're editing files directly on the server. You're copy-pasting snippets from the admin panel. You're hoping you remember what you changed last week. You're sending a colleague a zip file with the "latest version" of some PHP function.

None of this is how modern software is built. And yet, it's the default WordPress workflow. This is the gap Loopress exists to close, and it's worth understanding exactly where the friction comes from before looking at how to fix it.

## What is developer experience?

Developer experience (DX) refers to how smooth (or painful) it is to work with a tool as a developer. Good DX means: fast feedback loops, predictable environments, version-controlled code, and reproducible deployments.

Think of how you work with a modern JavaScript project:

- Code lives in Git
- Dependencies are declared in `package.json` and locked in `package-lock.json`
- You run `npm install` and the project works
- Staging and production match because the environment is defined in code

Now think about a typical WordPress project:

- Snippets are stored in a database, edited through a UI
- PHP packages require SSH access to install
- "Deploying" means FTP or a database export
- Staging and production drift apart over time because changes happen manually in both

This isn't a criticism of WordPress as a product; it was built for a different audience. But developers using it to build things deserve better.

## What can go wrong

Here's a real scenario: you add a PHP snippet to your WordPress site using the Code Snippets plugin. It works. Three months later, a junior dev edits it and introduces a bug that takes checkout down for an hour. You have no idea what changed, when, or why. There's no diff, no history, no rollback button. You dig through admin logs hoping to find something, then end up rewriting the snippet from memory.

Or: a client wants a PDF export feature. You need to pull in a Packagist package. You SSH into the server, install Composer, run `composer require`, and pray nothing breaks in production. It worked, but it was thirty minutes of friction that shouldn't exist.

These aren't edge cases. They're the everyday reality of WordPress development.

## What a better workflow looks like

Imagine instead:

```bash
# Pull your snippets down as files
lps snippet pull

# Edit them locally, in your editor, with Git tracking changes
git add snippets/my-function.php
git commit -m "fix: correct tax calculation logic"

# Push back to WordPress
lps snippet push
```

Your snippet is now version-controlled. You have a diff. You can roll back. You can review the change in a PR. This is how software is supposed to work, and it's exactly what Loopress brings to WordPress: a CLI that treats your snippets and Composer dependencies as files, plus a plugin that lets you manage PHP dependencies from the admin panel without server access.

WordPress stays WordPress. Your clients can still use it the way they love. You just work with it like a developer.

## What's next

The rest of this blog will cover specific workflows in detail: version-controlling Code Snippets with Git, installing Composer packages without SSH, syncing menus and styles between environments, and managing multiple client sites as code. Those posts are coming soon; this one lays the groundwork for why they matter.
