---
title: Why I Built Loopress
description: From Terraform's "infrastructure as code" philosophy to a frustrating WordPress project. How a side project for my sister turned into a developer tooling ecosystem.
date: 2026-06-08
authors:
  - maxime
tags:
  - developer experience
  - wordpress
  - story
excerpt: I'm a frontend developer who cares deeply about DX. Then I had to build a WordPress site, and nothing was the same.
---

I'm a frontend developer who's spent the last few years working in environments where everything is versioned, deployments are automated, and "it works on my machine" isn't an acceptable answer.

One of the jobs that shaped how I think about this was **Bedrock Streaming**, a streaming platform where every developer owned their infrastructure, frontend included, and the tool we used was **Terraform**. I remember something clicking when I started using it: your infra is just a file, which means it gets versioned, reviewed, and rolled back like any other piece of code. That idea stuck with me well past that job.

## A site for my sister

My sister runs an online French tutoring business ([nativefrenchteacher.com](https://nativefrenchteacher.com)). She's not technical, and she needed to manage her own content without calling me every time. WordPress made sense.

And honestly, it worked great for her. Whatever I needed (bookings, SEO, forms, caching) there was a plugin. The ecosystem is massive.

Building *with* it as a developer was another thing entirely.

I used the Code Snippets plugin constantly. And every time I touched a snippet, the same thought: if something breaks, I have no history. No diff. Just hope it doesn't break.

The real moment was when I needed to manipulate PDFs and wanted to pull in a Packagist package. So I SSH'd into the server, installed Composer manually, ran the install, crossed my fingers. It worked. But it felt wrong. This is a solved problem everywhere else.

## The gap

I came from a world where code lives in Git and environments are reproducible. WordPress assumes you click things in the admin, upload files via FTP, and remember what you changed. Production is always slightly different from local.

That's not a knock on WordPress. It's built for a different audience. But the developer building *on top* of it is left to figure things out alone.

## What I built

I started building **Loopress**: a CLI to version-control code snippets in Git and sync them to any WordPress instance, and a plugin that brings Composer dependency management into the admin panel, no SSH needed.

The goal was to bring the same idea I took away from Terraform into WordPress: your snippets, your dependencies, your configuration, all of it living in a repo, reviewable, deployable, not scattered across admin panels and SSH sessions you'll never remember.

Still building. If any of this sounds familiar, I built it for you.

→ [Get started with the plugin](/wordpress-plugin/) or [the CLI](/cli/)
