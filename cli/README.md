# Loopress

A new CLI generated with oclif

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/mynewcli.svg)](https://npmjs.org/package/mynewcli)
[![Downloads/week](https://img.shields.io/npm/dw/mynewcli.svg)](https://npmjs.org/package/mynewcli)

<!-- toc -->
* [Loopress](#loopress)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage

<!-- usage -->
```sh-session
$ npm install -g @loopress/cli
$ lps COMMAND
running command...
$ lps (--version)
@loopress/cli/0.6.0 darwin-arm64 node-v24.11.0
$ lps --help [COMMAND]
USAGE
  $ lps COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`lps composer pull`](#lps-composer-pull)
* [`lps composer push`](#lps-composer-push)
* [`lps help [COMMAND]`](#lps-help-command)
* [`lps init`](#lps-init)
* [`lps login`](#lps-login)
* [`lps logout`](#lps-logout)
* [`lps plugin add SLUG [VERSION]`](#lps-plugin-add-slug-version)
* [`lps plugin pull`](#lps-plugin-pull)
* [`lps plugin push`](#lps-plugin-push)
* [`lps project config`](#lps-project-config)
* [`lps project list`](#lps-project-list)
* [`lps project remove`](#lps-project-remove)
* [`lps project switch`](#lps-project-switch)
* [`lps snippet list`](#lps-snippet-list)
* [`lps snippet pull [PATH]`](#lps-snippet-pull-path)
* [`lps snippet push [PATH]`](#lps-snippet-push-path)
* [`lps status`](#lps-status)

## `lps composer pull`

Pull composer.lock from WordPress

```
USAGE
  $ lps composer pull [--password <value>] [--url <value>] [--user <value>] [-d]

FLAGS
  -d, --dry-run  Show what would be written without making changes

GLOBAL FLAGS
  --password=<value>  WordPress application password (fallback; prefer `lps project config`)
  --url=<value>       WordPress URL (fallback; prefer `lps project config`)
  --user=<value>      WordPress username (fallback; prefer `lps project config`)

DESCRIPTION
  Pull composer.lock from WordPress

EXAMPLES
  $ lps composer pull

  $ lps composer pull --dry-run
```

_See code: [src/commands/composer/pull.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/composer/pull.ts)_

## `lps composer push`

Push composer.json and composer.lock to WordPress and run composer install

```
USAGE
  $ lps composer push [--password <value>] [--url <value>] [--user <value>] [-d]

FLAGS
  -d, --dry-run  Show what would change without making changes

GLOBAL FLAGS
  --password=<value>  WordPress application password (fallback; prefer `lps project config`)
  --url=<value>       WordPress URL (fallback; prefer `lps project config`)
  --user=<value>      WordPress username (fallback; prefer `lps project config`)

DESCRIPTION
  Push composer.json and composer.lock to WordPress and run composer install

EXAMPLES
  $ lps composer push

  $ lps composer push --dry-run
```

_See code: [src/commands/composer/push.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/composer/push.ts)_

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

_See code: [src/commands/init.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/init.ts)_

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

_See code: [src/commands/login.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/login.ts)_

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

_See code: [src/commands/logout.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/logout.ts)_

## `lps plugin add SLUG [VERSION]`

Add a WordPress.org plugin to loopress.json

```
USAGE
  $ lps plugin add SLUG [VERSION] [--password <value>] [--url <value>] [--user <value>] [-d]

ARGUMENTS
  SLUG       Plugin slug on WordPress.org
  [VERSION]  Version to pin (default: latest)

FLAGS
  -d, --dry-run  Show what would be written without making changes

GLOBAL FLAGS
  --password=<value>  WordPress application password (fallback; prefer `lps project config`)
  --url=<value>       WordPress URL (fallback; prefer `lps project config`)
  --user=<value>      WordPress username (fallback; prefer `lps project config`)

DESCRIPTION
  Add a WordPress.org plugin to loopress.json

EXAMPLES
  $ lps plugin add woocommerce

  $ lps plugin add woocommerce 8.9.1

  $ lps plugin add contact-form-7 --dry-run
```

_See code: [src/commands/plugin/add.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/plugin/add.ts)_

## `lps plugin pull`

Pull installed plugins from WordPress into loopress.json

```
USAGE
  $ lps plugin pull [--password <value>] [--url <value>] [--user <value>] [-d]

FLAGS
  -d, --dry-run  Show what would be written without making changes

GLOBAL FLAGS
  --password=<value>  WordPress application password (fallback; prefer `lps project config`)
  --url=<value>       WordPress URL (fallback; prefer `lps project config`)
  --user=<value>      WordPress username (fallback; prefer `lps project config`)

DESCRIPTION
  Pull installed plugins from WordPress into loopress.json

EXAMPLES
  $ lps plugin pull

  $ lps plugin pull --dry-run
```

_See code: [src/commands/plugin/pull.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/plugin/pull.ts)_

## `lps plugin push`

Push plugins to WordPress to match loopress.json

```
USAGE
  $ lps plugin push [--password <value>] [--url <value>] [--user <value>] [-d]

FLAGS
  -d, --dry-run  Show what would change without making changes

GLOBAL FLAGS
  --password=<value>  WordPress application password (fallback; prefer `lps project config`)
  --url=<value>       WordPress URL (fallback; prefer `lps project config`)
  --user=<value>      WordPress username (fallback; prefer `lps project config`)

DESCRIPTION
  Push plugins to WordPress to match loopress.json

EXAMPLES
  $ lps plugin push

  $ lps plugin push --dry-run
```

_See code: [src/commands/plugin/push.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/plugin/push.ts)_

## `lps project config`

Add or update a WordPress project environment

```
USAGE
  $ lps project config

DESCRIPTION
  Add or update a WordPress project environment

EXAMPLES
  $ lps project config
```

_See code: [src/commands/project/config.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/project/config.ts)_

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

_See code: [src/commands/project/list.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/project/list.ts)_

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

_See code: [src/commands/project/remove.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/project/remove.ts)_

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

_See code: [src/commands/project/switch.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/project/switch.ts)_

## `lps snippet list`

List snippets from WordPress

```
USAGE
  $ lps snippet list [--password <value>] [--url <value>] [--user <value>] [-j] [-p code-snippets|wpcode]

FLAGS
  -j, --json             Output in JSON format
  -p, --plugin=<option>  WordPress snippet plugin to target (overrides loopress.json)
                         <options: code-snippets|wpcode>

GLOBAL FLAGS
  --password=<value>  WordPress application password (fallback; prefer `lps project config`)
  --url=<value>       WordPress URL (fallback; prefer `lps project config`)
  --user=<value>      WordPress username (fallback; prefer `lps project config`)

DESCRIPTION
  List snippets from WordPress

EXAMPLES
  $ lps snippet list

  $ lps snippet list --url http://example.com

  $ lps snippet list --plugin wpcode
```

_See code: [src/commands/snippet/list.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/snippet/list.ts)_

## `lps snippet pull [PATH]`

Pull snippets from WordPress

```
USAGE
  $ lps snippet pull [PATH] [--password <value>] [--url <value>] [--user <value>] [-d] [-p code-snippets|wpcode]

ARGUMENTS
  [PATH]  Path to snippets directory (overrides project config)

FLAGS
  -d, --dry-run          Show what would be written without making changes
  -p, --plugin=<option>  WordPress snippet plugin to target (overrides loopress.json)
                         <options: code-snippets|wpcode>

GLOBAL FLAGS
  --password=<value>  WordPress application password (fallback; prefer `lps project config`)
  --url=<value>       WordPress URL (fallback; prefer `lps project config`)
  --user=<value>      WordPress username (fallback; prefer `lps project config`)

DESCRIPTION
  Pull snippets from WordPress

EXAMPLES
  $ lps snippet pull

  $ lps snippet pull --url http://example.com

  $ lps snippet pull --path ./snippets

  $ lps snippet pull --plugin wpcode
```

_See code: [src/commands/snippet/pull.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/snippet/pull.ts)_

## `lps snippet push [PATH]`

Push snippets to WordPress

```
USAGE
  $ lps snippet push [PATH] [--password <value>] [--url <value>] [--user <value>] [-d] [-p code-snippets|wpcode]

ARGUMENTS
  [PATH]  Path to snippets directory (overrides project config)

FLAGS
  -d, --dry-run          Show what would change without making changes
  -p, --plugin=<option>  WordPress snippet plugin to target (overrides loopress.json)
                         <options: code-snippets|wpcode>

GLOBAL FLAGS
  --password=<value>  WordPress application password (fallback; prefer `lps project config`)
  --url=<value>       WordPress URL (fallback; prefer `lps project config`)
  --user=<value>      WordPress username (fallback; prefer `lps project config`)

DESCRIPTION
  Push snippets to WordPress

EXAMPLES
  $ lps snippet push

  $ lps snippet push --url http://example.com

  $ lps snippet push --path ./snippets

  $ lps snippet push --plugin wpcode
```

_See code: [src/commands/snippet/push.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/snippet/push.ts)_

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

_See code: [src/commands/status.ts](https://github.com/loopress/loopress/blob/v0.6.0/src/commands/status.ts)_
<!-- commandsstop -->
