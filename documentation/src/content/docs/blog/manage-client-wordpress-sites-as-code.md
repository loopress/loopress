---
title: Managing Twenty Client WordPress Sites as Code
description: Agencies running dozens of WordPress sites need to know what each one runs and change it without logging into twenty admin panels. One repository per client, one loopress.json per repository, and a for loop.
date: 2026-12-10
draft: true
cliVersion: 0.26.0
wordpressPluginVersion: 2026.11.0
authors:
  - maxime
tags:
  - agencies
  - workflow
  - environments
  - wordpress
excerpt: WP-CLI is great at running a command on a server. It doesn't remember what each of your twenty client sites is supposed to look like. Here's a Git-based setup where every client site's configuration is a repository you can read, diff, and deploy.
---

If you manage WordPress sites for clients, you know the shape of the problem. Twenty sites, each with a staging and a production environment, each with its own snippets, field groups, menus, and plugin versions. A client asks for a change, and first you have to remember how their site is set up. Then you log in, click, and hope staging and production still match.

WP-CLI is the usual answer to "doing it at scale", and it's excellent at what it does: run a command on a server. But it needs SSH on every host, and it's stateless. It changes a site; it doesn't record what the site is supposed to be. After a year of one-off `wp` commands, the canonical state of each client's configuration lives nowhere in particular.

## One repository per client

The setup that scales is boring on purpose. Each client gets a Git repository holding their site's configuration as files:

```text
acme-corp/
  loopress.json
  snippets/
  hooks/
  acf/
    field-groups/
  menus/
  seo/
  options/
```

`loopress.json` is what ties the repository to the client's site. Its `projectId` names a project you configured with `lps project config`, and every `lps` command run inside that directory targets that project, whatever else you were working on a minute ago:

```json title="acme-corp/loopress.json"
{
  "projectId": "acme-corp",
  "rootDir": ".",
  "snippetsDir": "snippets",
  "plugins": {
    "woocommerce": "9.4.2"
  }
}
```

No global "current site" to switch and forget to switch back. `cd acme-corp` is the switch. Each project holds its environments by name, so the commands read the same in every repository:

```bash
cd ~/clients/acme-corp
lps diff --env production          # what does their production run vs. this repo?
lps hook push --env staging        # try a change on their staging
lps promote staging production     # ship it
```

That's the whole mental model: the repository says what the site should be, `--env` says which copy of the site you're talking to.

## Onboarding an existing client

Most client sites weren't built this way, and they don't have to be. Point Loopress at production and pull what's there:

```bash
mkdir acme-corp && cd acme-corp && git init
lps project config       # add the site; creates an application password via the browser
lps init                 # writes loopress.json, pick the features the site uses
lps pull --env production
lps plugin pull --env production
git add . && git commit -m "Snapshot of production as of today"
```

Day one, you haven't changed anything. You've written down what the site runs. From then on, `lps diff --env production` tells you whether that's still true.

## A change that touches every client

Some things belong on every site you manage: a security header, a login-page hardening hook, a GDPR helper. Loopress deliberately has no "push to every client" button, because each client's repository is the source of truth for that client, and a change should land in each of them as a commit.

The loop is short enough to not need one:

```bash
for repo in ~/clients/*/; do
  (
    cd "$repo" || exit
    cp ~/agency/hooks/security-headers.php hooks/
    git add hooks/security-headers.php
    git commit -m "Add agency security headers hook"
    lps hook push --env staging
  )
done
```

Each client gets the file as a reviewed commit in their own history, lands on staging first, and goes to production on that client's own schedule. When one client's staging rejects the file (a class name collision with one of their plugins, a PHP version too old), it fails for that client only, with the reason, and the loop moves on.

## Deploying from CI instead of your laptop

Once each client is a repository, each can deploy itself. The pattern from the [CI documentation](/ci/#deploying-to-a-real-environment) works per repository: store the project config as a CI secret, target environments by name, and pass `--yes` for production:

```bash
lps doctor --env production
lps push --env production --yes
```

Run `lps diff --env production` on a schedule in the same pipeline, and a client's admin-screen tweak shows up as a red build the next morning, instead of as a surprise in your next deploy.

## Where WP-CLI still fits

WP-CLI remains the right tool for server-side operations: search-replace after a domain change, regenerating thumbnails, bulk content fixes. Loopress doesn't replace it and doesn't need SSH to do its own job. The split is simple: WP-CLI for one-off operations on a server, Loopress for the configuration you want recorded, reviewed, and reproducible, one repository per client.

---

```bash
npm install -g @loopress/cli
```

[Getting Started](/getting-started/) walks through `lps project config` and `lps init`. ACF, SEO, menus, and options sync with Loopress Light; hooks, snippets, and plugin pinning need [Loopress Full](/wordpress-plugin/).
