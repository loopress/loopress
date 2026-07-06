# E2E tests

Playwright tests that run the real, built CLI against a real WordPress instance and check
the result both through the REST API and through the wp-admin UI. They exist to catch
regressions in the CLI ↔ WordPress plugin integration that unit tests can't see (e.g. a
snippet actually landing in WPCode's admin list with the right fields).

Unlike `pnpm test` (vitest, mocked, no network), these need a **real, disposable** WordPress
site, never point them at anything you care about, they create and delete content.

## Running locally

You need a WordPress site with the Loopress plugin and WPCode active, and an application
password for an admin user. Point the tests at it with:

```bash
export WP_URL=http://your-site.local
export WP_USERNAME=admin
export WP_ADMIN_PASSWORD=admin        # the real wp-admin account password (UI login)
export WP_APP_PASSWORD=xxxxxxxxxxxxxxxxxxxxxxxx   # REST API application password, no spaces

pnpm test:e2e            # headless run
pnpm test:e2e:ui         # interactive UI mode, great for writing/debugging a new test
```

No WordPress handy? The same `loopress/setup-ci` docker stack used in CI works locally:

```bash
git clone https://github.com/loopress/setup-ci /tmp/loopress-setup-ci
LOOPRESS_COMPOSE_FILE=/tmp/loopress-setup-ci/docker/compose.yml bash /tmp/loopress-setup-ci/scripts/start-wordpress.sh
LOOPRESS_COMPOSE_FILE=/tmp/loopress-setup-ci/docker/compose.yml bash /tmp/loopress-setup-ci/scripts/setup-wordpress.sh
```

Then read the app password it generated from `~/.loopress/config.json` and export the four
variables above (`WP_ADMIN_PASSWORD=admin`, matching what that script sets).

## Notes

- Tests run with `workers: 1`: several of them flip global state (active plugins) on the
  shared WordPress instance, so they can't run concurrently.
- Each test gets its own isolated `HOME` and project directory (see `helpers/environment.ts`)
  so it never touches your real `~/.loopress/config.json`.
- There's no snippet delete endpoint, so test data accumulates on the target site across
  runs. That's expected, this is why it must be a disposable instance.
