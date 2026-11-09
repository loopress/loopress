---
title: Connect a site to the console
description: Paste a site token in Loopress Full so the site reports its WordPress, PHP and plugin versions, pending updates and Site Health to the Loopress console twice a day.
---

Without a connection, the [console](/account/) only knows what the CLI sends when someone runs a command against a site, and only what `loopress.json` says. Once connected, Loopress Full reports the site's real state twice a day: versions, installed plugins, pending updates and Site Health.

The data flows out of the site: Loopress never holds a WordPress credential and never calls into your site. This is a Loopress Full feature, Loopress Light never sends anything.

## Connect

1. In the console, open the environment's menu and choose **Connect site**. Copy the token: it starts with `lps_site_` and is shown only once.
2. In wp-admin, go to **Loopress → Settings → Console**, paste the token in **Site token** and click **Connect**.

Connecting sends a first report right away and shows the result:

- **Connected**: the token is saved, the site then reports twice a day.
- **Invalid token**: it was revoked or regenerated in the console. Nothing is saved.
- **This token belongs to `<url>`**: the token was generated for another environment. Nothing is saved: generate a token for this environment instead.
- **Could not be reached**: the token is saved anyway, the next report retries. It also shows when the report is larger than 256 KiB, in which case nothing is sent until the reported data shrinks (fewer installed plugins, for instance).

One token per environment. It can only send reports for its own environment, and the console rejects a report whose site URL differs from the environment's URL. A staging site cloned from the production database copies the token: its reports are rejected instead of landing on production, and its **Console** setting warns that the token was connected from another URL. Generate a token for the staging environment and paste it there.

Reports are sent by WP-cron, which by default runs only when the site gets traffic. A site with no visitors reports late unless a system scheduler triggers WP-cron, which is why the console shows the date of the last report. To report on schedule, run WP-cron from a system scheduler (`wp cron event run --due-now` from a crontab, or a request to `wp-cron.php`).

## What is sent

| Field | Content |
| --- | --- |
| `url` | The site URL (`home_url()`), checked against the environment's URL |
| `wordpress` | WordPress version |
| `php` | PHP version |
| `loopress` | Loopress Full version |
| `coreUpdate` | The newer WordPress version WordPress already knows about, or `null` |
| `theme` | The active theme's slug, version, and the newer version available, or `null` |
| `plugins` | Every installed plugin: slug (its directory, or the file name for a single-file plugin), version, active or not, and the newer version available, or `null`. 500 plugins at most |
| `siteHealth` | The good, recommended and critical counts of the last Site Health check, or `null` if it never ran |

Available updates come from what WordPress already stored after its own update checks, and Site Health counts from its own last run: the plugin never triggers an update check or runs the Site Health tests itself.

## What is never sent

Content, users, email addresses (including the admin email), options, and plugin settings.

## Disconnect

Click **Disconnect** under **Loopress → Settings → Console**: the token is deleted from the site and the reports stop. **Reset all settings to default** also disconnects the site. Revoking the token from the console makes the console reject the reports, but the site keeps sending them until you disconnect it in WordPress.

Uninstalling Loopress Full deletes the token and the scheduled report.

## Local development

Reports go to `https://api.loopress.dev`. To point a local site at another api, define the constant in `wp-config.php`:

```php
define('LOOPRESS_API_URL', 'http://localhost:3000');
```
