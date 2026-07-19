# @loopress/cli

## 0.16.0

### Minor Changes

- 6f5712c: Add `lps acf pull`/`lps acf push`/`lps acf list`, which sync ACF (Advanced Custom Fields) field groups, post types, taxonomies, and options pages between the WordPress site and local JSON files, the same git-based workflow already available for snippets and Composer dependencies.

  Backed by new `loopress/v1/acf/*` endpoints on the WordPress plugin. Requires ACF to be installed and active; options pages additionally require ACF PRO.

- 6c557ec: Add `lps composer init`, which scaffolds a composer.json wired to WPackagist (repository, `composer/installers`, installer-paths) so WordPress.org plugins and themes can be added and installed through Composer instead of the native plugin API.

  `lps composer pull` now also pulls `composer.json` (previously only `composer.lock`), backed by a new `GET loopress/v1/composer/json` endpoint on the WordPress plugin, so local composer.json stays in sync with packages added or removed through the Loopress admin page.

### Patch Changes

- 9589ec1: From Beta to Alpha to reflect more status of the tool

## 0.15.0

### Minor Changes

- 69b5050: Replaced `lps project sync` with `lps project push` and `lps project pull`, matching the `push`/`pull` naming used by `snippet`, `plugin` and `composer`. `lps project push` creates/links local projects and environments on your Loopress account and pushes credentials (what `sync` did for local-to-remote). `lps project pull` fetches projects and environments already on your account that aren't configured locally yet, now works even when no project is configured locally.

### Patch Changes

- 83a65be: Stopped sending personal data to Sentry when reporting a crash. Command-line argument values (WordPress URLs, application passwords, tokens, emails) are now redacted, only flag names are kept for debugging context. Also disabled `sendDefaultPii` explicitly and set a static `serverName` instead of the machine's real hostname.

## 0.14.0

### Minor Changes

- 42c3956: Use oclif native config system
- 9a8f6b5: `lps plugin` commands now use WordPress core's native `wp/v2/plugins` REST API instead of a custom Loopress endpoint. As a result, plugin version pinning is no longer supported: `lps plugin add` no longer accepts a `[version]` argument, and `loopress.json` always stores `"latest"` for managed plugins. Pin an exact version through the `composer` command group and wpackagist instead.
- b27bd0c: Delay sentry load to improve performances

### Patch Changes

- 13e0495: Move WordPress app-password relay from website to API

## 0.13.0

### Minor Changes

- 6a18588: Add application password creation with open browser
- 01b3005: Add snippet publish command

## 0.12.0

### Minor Changes

- 8a3e52f: Sync projects and snippet files during push/pull

## 0.11.0

### Minor Changes

- 9754a14: Remove snippet provider and put it directl in plugins during init
- 0ab8400: Improve remove UX and synchronization with backend
- 616b2ab: Add `lps project sync` to push locally configured projects, environments and credentials to your Loopress account
- 908875c: Add upsert mechanism on snippet push
- 85b2fcf: Improve ux of project switch with separators

## 0.10.0

### Minor Changes

- Publish schemas on NPM

## 0.9.0

### Minor Changes

- f5bae31: Add list2 to improve UX
- 34a4a22: Setup sentry to monitor the CLI

## 0.8.0

### Minor Changes

- 540c702: Improve structure with fable
- 6122ddc: Align better sidecar file with WPCode api

## 0.7.0

### Minor Changes

- 56cca02: Refine command descriptions. Improve compatibility with WPCode. Add unit tests

## 0.6.0

### Minor Changes

- 18edf51: Add composer command

## 0.5.0

### Minor Changes

- 138acfd: Remove style commands in favor of snippets for custom CSS
- 6aba757: Use sidekick files to store snippets state
- 249b128: Add init command
- 7f4ac7c: CLI can read projectId in loopress.json
- 6aba757: Record deployments in Loopress console

## 0.4.0

### Minor Changes

- 2d33230: Add commands to manage plugins
- 2d33230: Add cli-plugins command as wrapper around oclif plugin plugins
- a3e2a67: Activate plugin after installation

## 0.3.0

### Minor Changes

- Add detection by id for push/pull of snippets

## 0.2.0

### Minor Changes

- 7a3642f: Add full snippet pull with various files

### Patch Changes

- 7b8b35d: Add ascii art of the logo

## 0.1.1

### Patch Changes

- Re-gnerate readme

## 0.1.0

### Minor Changes

- f66babd: Initial release
