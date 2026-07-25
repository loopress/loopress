# Loopress

CLI to interact with the Loopress ecosystem

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@loopress/cli.svg)](https://www.npmjs.com/package/@loopress/cli)
[![Downloads/week](https://img.shields.io/npm/dw/@loopress/cli.svg)](https://npmjs.org/package/@loopress/cli)

<!-- toc -->
* [Loopress](#loopress)
* [Usage](#usage)
* [Error reporting](#error-reporting)
* [Commands](#commands)
<!-- tocstop -->

# Usage

<!-- usage -->
```sh-session
$ npm install -g @loopress/cli
$ lps COMMAND
running command...
$ lps (--version)
@loopress/cli/0.17.0 darwin-arm64 node-v24.11.0
$ lps --help [COMMAND]
USAGE
  $ lps COMMAND
...
```
<!-- usagestop -->

# Error reporting

Loopress sends crash reports to our Sentry project so we can find and fix bugs.

To opt out, either:

- run `lps telemetry disable` (persists across all future commands), or
- set `LOOPRESS_TELEMETRY_DISABLED=1` (overrides the persisted preference for a single run,
  useful in CI).

A crash report includes the command name, its flags/args as typed, your Node.js
version, and OS. WordPress credentials are configured via `lps project config`
and are never passed as command-line arguments, so they don't end up in a
report.

# Commands

<!-- commands -->
* [`lps acf list`](#lps-acf-list)
* [`lps acf pull [PATH]`](#lps-acf-pull-path)
* [`lps acf push [PATH]`](#lps-acf-push-path)
* [`lps api list`](#lps-api-list)
* [`lps api pull [PATH]`](#lps-api-pull-path)
* [`lps api push [PATH]`](#lps-api-push-path)
* [`lps composer init`](#lps-composer-init)
* [`lps composer pull`](#lps-composer-pull)
* [`lps composer push`](#lps-composer-push)
* [`lps form list`](#lps-form-list)
* [`lps form pull [PATH]`](#lps-form-pull-path)
* [`lps form push [PATH]`](#lps-form-push-path)
* [`lps help [COMMAND]`](#lps-help-command)
* [`lps init`](#lps-init)
* [`lps login`](#lps-login)
* [`lps logout`](#lps-logout)
* [`lps plugin add SLUG`](#lps-plugin-add-slug)
* [`lps plugin pull`](#lps-plugin-pull)
* [`lps plugin push`](#lps-plugin-push)
* [`lps project config`](#lps-project-config)
* [`lps project list`](#lps-project-list)
* [`lps project pull`](#lps-project-pull)
* [`lps project push`](#lps-project-push)
* [`lps project remove`](#lps-project-remove)
* [`lps project switch`](#lps-project-switch)
* [`lps seo list`](#lps-seo-list)
* [`lps seo pull [PATH]`](#lps-seo-pull-path)
* [`lps seo push [PATH]`](#lps-seo-push-path)
* [`lps snippet list`](#lps-snippet-list)
* [`lps snippet publish [PATH]`](#lps-snippet-publish-path)
* [`lps snippet pull [PATH]`](#lps-snippet-pull-path)
* [`lps snippet push [PATH]`](#lps-snippet-push-path)
* [`lps status`](#lps-status)
* [`lps telemetry disable`](#lps-telemetry-disable)
* [`lps telemetry enable`](#lps-telemetry-enable)

## `lps acf list`

List ACF field groups, post types, taxonomies, and options pages from WordPress

```
USAGE
  $ lps acf list [-j] [--type field-groups|post-types|taxonomies|options-pages...]

FLAGS
  -j, --json              Output in JSON format
      --type=<option>...  Limit to specific ACF object types
                          <options: field-groups|post-types|taxonomies|options-pages>

DESCRIPTION
  List ACF field groups, post types, taxonomies, and options pages from WordPress

EXAMPLES
  $ lps acf list

  $ lps acf list --type field-groups
```

_See code: [src/commands/acf/list.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/acf/list.ts)_

## `lps acf pull [PATH]`

Pull ACF field groups, post types, taxonomies, and options pages from WordPress

```
USAGE
  $ lps acf pull [PATH] [-d] [--type field-groups|post-types|taxonomies|options-pages...]

ARGUMENTS
  [PATH]  Path to ACF directory (overrides project config)

FLAGS
  -d, --dry-run           Show what would change without making changes
      --type=<option>...  Limit to specific ACF object types
                          <options: field-groups|post-types|taxonomies|options-pages>

DESCRIPTION
  Pull ACF field groups, post types, taxonomies, and options pages from WordPress

EXAMPLES
  $ lps acf pull

  $ lps acf pull --type field-groups
```

_See code: [src/commands/acf/pull.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/acf/pull.ts)_

## `lps acf push [PATH]`

Push ACF field groups, post types, taxonomies, and options pages to WordPress

```
USAGE
  $ lps acf push [PATH] [-d] [--type field-groups|post-types|taxonomies|options-pages...]

ARGUMENTS
  [PATH]  Path to ACF directory (overrides project config)

FLAGS
  -d, --dry-run           Show what would change without making changes
      --type=<option>...  Limit to specific ACF object types
                          <options: field-groups|post-types|taxonomies|options-pages>

DESCRIPTION
  Push ACF field groups, post types, taxonomies, and options pages to WordPress

EXAMPLES
  $ lps acf push

  $ lps acf push --type field-groups
```

_See code: [src/commands/acf/push.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/acf/push.ts)_

## `lps api list`

List custom API route files from WordPress

```
USAGE
  $ lps api list [-j]

FLAGS
  -j, --json  Output in JSON format

DESCRIPTION
  List custom API route files from WordPress

EXAMPLES
  $ lps api list
```

_See code: [src/commands/api/list.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/api/list.ts)_

## `lps api pull [PATH]`

Pull custom API route files from WordPress

```
USAGE
  $ lps api pull [PATH] [-d]

ARGUMENTS
  [PATH]  Path to api directory (overrides project config)

FLAGS
  -d, --dry-run  Show what would change without making changes

DESCRIPTION
  Pull custom API route files from WordPress

EXAMPLES
  $ lps api pull

  $ lps api pull --path ./api
```

_See code: [src/commands/api/pull.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/api/pull.ts)_

## `lps api push [PATH]`

Push custom API route files to WordPress

```
USAGE
  $ lps api push [PATH] [-d]

ARGUMENTS
  [PATH]  Path to api directory (overrides project config)

FLAGS
  -d, --dry-run  Show what would change without making changes

DESCRIPTION
  Push custom API route files to WordPress

EXAMPLES
  $ lps api push

  $ lps api push --path ./api
```

_See code: [src/commands/api/push.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/api/push.ts)_

## `lps composer init`

Create a composer.json wired to WPackagist for installing WordPress.org plugins and themes

```
USAGE
  $ lps composer init [-d]

FLAGS
  -d, --dry-run  Show what would change without making changes

DESCRIPTION
  Create a composer.json wired to WPackagist for installing WordPress.org plugins and themes

EXAMPLES
  $ lps composer init

  $ lps composer init --dry-run
```

_See code: [src/commands/composer/init.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/composer/init.ts)_

## `lps composer pull`

Pull composer.json and composer.lock from WordPress

```
USAGE
  $ lps composer pull [-d]

FLAGS
  -d, --dry-run  Show what would change without making changes

DESCRIPTION
  Pull composer.json and composer.lock from WordPress

EXAMPLES
  $ lps composer pull

  $ lps composer pull --dry-run
```

_See code: [src/commands/composer/pull.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/composer/pull.ts)_

## `lps composer push`

Push composer.json and composer.lock to WordPress and run composer install

```
USAGE
  $ lps composer push [-d]

FLAGS
  -d, --dry-run  Show what would change without making changes

DESCRIPTION
  Push composer.json and composer.lock to WordPress and run composer install

EXAMPLES
  $ lps composer push

  $ lps composer push --dry-run
```

_See code: [src/commands/composer/push.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/composer/push.ts)_

## `lps form list`

List forms from WordPress

```
USAGE
  $ lps form list [-j]

FLAGS
  -j, --json  Output in JSON format

DESCRIPTION
  List forms from WordPress

EXAMPLES
  $ lps form list
```

_See code: [src/commands/form/list.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/form/list.ts)_

## `lps form pull [PATH]`

Pull forms from WordPress

```
USAGE
  $ lps form pull [PATH] [-d]

ARGUMENTS
  [PATH]  Path to forms directory (overrides project config)

FLAGS
  -d, --dry-run  Show what would change without making changes

DESCRIPTION
  Pull forms from WordPress

EXAMPLES
  $ lps form pull
```

_See code: [src/commands/form/pull.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/form/pull.ts)_

## `lps form push [PATH]`

Push forms to WordPress. Local files created or updated remotely are renamed on disk to the `<id>-<slug>.json` convention.

```
USAGE
  $ lps form push [PATH] [-d]

ARGUMENTS
  [PATH]  Path to forms directory (overrides project config)

FLAGS
  -d, --dry-run  Show what would change without making changes

DESCRIPTION
  Push forms to WordPress. Local files created or updated remotely are renamed on disk to the `<id>-<slug>.json`
  convention.

EXAMPLES
  $ lps form push
```

_See code: [src/commands/form/push.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/form/push.ts)_

## `lps help [COMMAND]`

Display help for lps.

```
USAGE
  $ lps help [COMMAND...] [-n]

ARGUMENTS
  [COMMAND...]  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for lps.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/6.2.53/src/commands/help.ts)_

## `lps init`

Initialize a loopress.json config file in the current directory

```
USAGE
  $ lps init

DESCRIPTION
  Initialize a loopress.json config file in the current directory

EXAMPLES
  $ lps init
```

_See code: [src/commands/init.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/init.ts)_

## `lps login`

Log in to the Loopress console

```
USAGE
  $ lps login

DESCRIPTION
  Log in to the Loopress console

EXAMPLES
  $ lps login
```

_See code: [src/commands/login.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/login.ts)_

## `lps logout`

Log out from the Loopress console

```
USAGE
  $ lps logout

DESCRIPTION
  Log out from the Loopress console

EXAMPLES
  $ lps logout
```

_See code: [src/commands/logout.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/logout.ts)_

## `lps plugin add SLUG`

Add a WordPress.org plugin to loopress.json

```
USAGE
  $ lps plugin add SLUG [-d]

ARGUMENTS
  SLUG  Plugin slug on WordPress.org

FLAGS
  -d, --dry-run  Show what would change without making changes

DESCRIPTION
  Add a WordPress.org plugin to loopress.json

EXAMPLES
  $ lps plugin add woocommerce

  $ lps plugin add contact-form-7 --dry-run
```

_See code: [src/commands/plugin/add.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/plugin/add.ts)_

## `lps plugin pull`

Pull installed plugins from WordPress into loopress.json

```
USAGE
  $ lps plugin pull [-d]

FLAGS
  -d, --dry-run  Show what would change without making changes

DESCRIPTION
  Pull installed plugins from WordPress into loopress.json

EXAMPLES
  $ lps plugin pull

  $ lps plugin pull --dry-run
```

_See code: [src/commands/plugin/pull.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/plugin/pull.ts)_

## `lps plugin push`

Push plugins to WordPress to match loopress.json

```
USAGE
  $ lps plugin push [-d]

FLAGS
  -d, --dry-run  Show what would change without making changes

DESCRIPTION
  Push plugins to WordPress to match loopress.json

EXAMPLES
  $ lps plugin push

  $ lps plugin push --dry-run
```

_See code: [src/commands/plugin/push.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/plugin/push.ts)_

## `lps project config`

Add or update a WordPress project environment. By default, authorizes via WordPress in your browser; manual username/Application Password entry is available as a fallback.

```
USAGE
  $ lps project config

DESCRIPTION
  Add or update a WordPress project environment. By default, authorizes via WordPress in your browser; manual
  username/Application Password entry is available as a fallback.

EXAMPLES
  $ lps project config
```

_See code: [src/commands/project/config.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/project/config.ts)_

## `lps project list`

List configured WordPress projects

```
USAGE
  $ lps project list

DESCRIPTION
  List configured WordPress projects

EXAMPLES
  $ lps project list
```

_See code: [src/commands/project/list.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/project/list.ts)_

## `lps project pull`

Pull projects and environments from your Loopress account that are not configured locally yet

```
USAGE
  $ lps project pull

DESCRIPTION
  Pull projects and environments from your Loopress account that are not configured locally yet

EXAMPLES
  $ lps project pull
```

_See code: [src/commands/project/pull.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/project/pull.ts)_

## `lps project push`

Push locally configured projects, environments and credentials to your Loopress account

```
USAGE
  $ lps project push

DESCRIPTION
  Push locally configured projects, environments and credentials to your Loopress account

EXAMPLES
  $ lps project push
```

_See code: [src/commands/project/push.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/project/push.ts)_

## `lps project remove`

Remove one or more WordPress projects or environments

```
USAGE
  $ lps project remove

DESCRIPTION
  Remove one or more WordPress projects or environments

EXAMPLES
  $ lps project remove
```

_See code: [src/commands/project/remove.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/project/remove.ts)_

## `lps project switch`

Switch the active project and environment

```
USAGE
  $ lps project switch

DESCRIPTION
  Switch the active project and environment

EXAMPLES
  $ lps project switch
```

_See code: [src/commands/project/switch.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/project/switch.ts)_

## `lps seo list`

List posts with SEO meta, and redirects if supported by the active SEO plugin, on WordPress

```
USAGE
  $ lps seo list [-j] [--post-type <value>...]

FLAGS
  -j, --json                  Output in JSON format
      --post-type=<value>...  Limit to specific post types

DESCRIPTION
  List posts with SEO meta, and redirects if supported by the active SEO plugin, on WordPress

EXAMPLES
  $ lps seo list

  $ lps seo list --post-type post
```

_See code: [src/commands/seo/list.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/seo/list.ts)_

## `lps seo pull [PATH]`

Pull SEO settings, post meta, and (if supported) redirects from WordPress

```
USAGE
  $ lps seo pull [PATH] [-d] [--post-type <value>...]

ARGUMENTS
  [PATH]  Path to SEO directory (overrides project config)

FLAGS
  -d, --dry-run               Show what would change without making changes
      --post-type=<value>...  Limit post meta to specific post types

DESCRIPTION
  Pull SEO settings, post meta, and (if supported) redirects from WordPress

EXAMPLES
  $ lps seo pull

  $ lps seo pull --post-type post --post-type page
```

_See code: [src/commands/seo/pull.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/seo/pull.ts)_

## `lps seo push [PATH]`

Push SEO settings, post meta, and redirects to WordPress. Local redirect files created remotely are renamed on disk to the `<id>-<slug>` convention. Fails clearly per file if the active SEO plugin does not support redirects.

```
USAGE
  $ lps seo push [PATH] [-d]

ARGUMENTS
  [PATH]  Path to SEO directory (overrides project config)

FLAGS
  -d, --dry-run  Show what would change without making changes

DESCRIPTION
  Push SEO settings, post meta, and redirects to WordPress. Local redirect files created remotely are renamed on disk to
  the `<id>-<slug>` convention. Fails clearly per file if the active SEO plugin does not support redirects.

EXAMPLES
  $ lps seo push
```

_See code: [src/commands/seo/push.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/seo/push.ts)_

## `lps snippet list`

List snippets from WordPress

```
USAGE
  $ lps snippet list [-j]

FLAGS
  -j, --json  Output in JSON format

DESCRIPTION
  List snippets from WordPress

EXAMPLES
  $ lps snippet list
```

_See code: [src/commands/snippet/list.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/snippet/list.ts)_

## `lps snippet publish [PATH]`

Publish snippets to your Loopress account so they can be deployed to other projects. Does not touch any WordPress site.

```
USAGE
  $ lps snippet publish [PATH]

ARGUMENTS
  [PATH]  Path to snippets directory (overrides project config)

DESCRIPTION
  Publish snippets to your Loopress account so they can be deployed to other projects. Does not touch any WordPress
  site.

EXAMPLES
  $ lps snippet publish

  $ lps snippet publish --path ./snippets
```

_See code: [src/commands/snippet/publish.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/snippet/publish.ts)_

## `lps snippet pull [PATH]`

Pull snippets from WordPress

```
USAGE
  $ lps snippet pull [PATH] [-d]

ARGUMENTS
  [PATH]  Path to snippets directory (overrides project config)

FLAGS
  -d, --dry-run  Show what would change without making changes

DESCRIPTION
  Pull snippets from WordPress

EXAMPLES
  $ lps snippet pull

  $ lps snippet pull --path ./snippets
```

_See code: [src/commands/snippet/pull.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/snippet/pull.ts)_

## `lps snippet push [PATH]`

Push snippets to WordPress. Local snippet files created or updated remotely are renamed on disk to the `<id>-<slug>` convention.

```
USAGE
  $ lps snippet push [PATH] [-d]

ARGUMENTS
  [PATH]  Path to snippets directory (overrides project config)

FLAGS
  -d, --dry-run  Show what would change without making changes

DESCRIPTION
  Push snippets to WordPress. Local snippet files created or updated remotely are renamed on disk to the `<id>-<slug>`
  convention.

EXAMPLES
  $ lps snippet push

  $ lps snippet push --path ./snippets
```

_See code: [src/commands/snippet/push.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/snippet/push.ts)_

## `lps status`

Show which WordPress project and environment commands will target

```
USAGE
  $ lps status

DESCRIPTION
  Show which WordPress project and environment commands will target

EXAMPLES
  $ lps status
```

_See code: [src/commands/status.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/status.ts)_

## `lps telemetry disable`

Disable error reporting to Sentry

```
USAGE
  $ lps telemetry disable

DESCRIPTION
  Disable error reporting to Sentry

EXAMPLES
  $ lps telemetry disable
```

_See code: [src/commands/telemetry/disable.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/telemetry/disable.ts)_

## `lps telemetry enable`

Enable error reporting to Sentry

```
USAGE
  $ lps telemetry enable

DESCRIPTION
  Enable error reporting to Sentry

EXAMPLES
  $ lps telemetry enable
```

_See code: [src/commands/telemetry/enable.ts](https://github.com/loopress/loopress/blob/v0.17.0/src/commands/telemetry/enable.ts)_
<!-- commandsstop -->
