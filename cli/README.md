# Loopress

A new CLI generated with oclif

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/mynewcli.svg)](https://npmjs.org/package/mynewcli)
[![Downloads/week](https://img.shields.io/npm/dw/mynewcli.svg)](https://npmjs.org/package/mynewcli)

<!-- toc -->

- [Usage](#usage)
- [Commands](#commands)
<!-- tocstop -->

# Usage

<!-- usage -->

```sh-session
$ npm install -g @loopress/cli
$ lps COMMAND
running command...
$ lps (--version)
@loopress/cli/0.1.0 darwin-arm64 node-v24.11.0
$ lps --help [COMMAND]
USAGE
  $ lps COMMAND
...
```

<!-- usagestop -->

# Commands

<!-- commands -->

- [`lps help [COMMAND]`](#lps-help-command)
- [`lps login`](#lps-login)
- [`lps logout`](#lps-logout)
- [`lps plugins`](#lps-plugins)
- [`lps plugins add PLUGIN`](#lps-plugins-add-plugin)
- [`lps plugins:inspect PLUGIN...`](#lps-pluginsinspect-plugin)
- [`lps plugins install PLUGIN`](#lps-plugins-install-plugin)
- [`lps plugins link PATH`](#lps-plugins-link-path)
- [`lps plugins remove [PLUGIN]`](#lps-plugins-remove-plugin)
- [`lps plugins reset`](#lps-plugins-reset)
- [`lps plugins uninstall [PLUGIN]`](#lps-plugins-uninstall-plugin)
- [`lps plugins unlink [PLUGIN]`](#lps-plugins-unlink-plugin)
- [`lps plugins update`](#lps-plugins-update)
- [`lps project config`](#lps-project-config)
- [`lps project list`](#lps-project-list)
- [`lps project remove`](#lps-project-remove)
- [`lps project remove-env`](#lps-project-remove-env)
- [`lps project switch`](#lps-project-switch)
- [`lps project switch-env`](#lps-project-switch-env)
- [`lps snippets list`](#lps-snippets-list)
- [`lps snippets pull [PATH]`](#lps-snippets-pull-path)
- [`lps snippets push [PATH]`](#lps-snippets-push-path)
- [`lps styles pull`](#lps-styles-pull)
- [`lps styles push`](#lps-styles-push)

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

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/6.2.50/src/commands/help.ts)_

## `lps login`

Log in to Loopress via the console

```
USAGE
  $ lps login

DESCRIPTION
  Log in to Loopress via the console

EXAMPLES
  $ lps login
```

_See code: [src/commands/login.ts](https://github.com/loopress/loopress/blob/v0.1.0/src/commands/login.ts)_

## `lps logout`

Log out from Loopress console

```
USAGE
  $ lps logout

DESCRIPTION
  Log out from Loopress console

EXAMPLES
  $ lps logout
```

_See code: [src/commands/logout.ts](https://github.com/loopress/loopress/blob/v0.1.0/src/commands/logout.ts)_

## `lps plugins`

List installed plugins.

```
USAGE
  $ lps plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ lps plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.74/src/commands/plugins/index.ts)_

## `lps plugins add PLUGIN`

Installs a plugin into lps.

```
USAGE
  $ lps plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into lps.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the LPS_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the LPS_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ lps plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ lps plugins add myplugin

  Install a plugin from a github url.

    $ lps plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ lps plugins add someuser/someplugin
```

## `lps plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ lps plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ lps plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.74/src/commands/plugins/inspect.ts)_

## `lps plugins install PLUGIN`

Installs a plugin into lps.

```
USAGE
  $ lps plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into lps.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the LPS_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the LPS_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ lps plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ lps plugins install myplugin

  Install a plugin from a github url.

    $ lps plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ lps plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.74/src/commands/plugins/install.ts)_

## `lps plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ lps plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ lps plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.74/src/commands/plugins/link.ts)_

## `lps plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ lps plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ lps plugins unlink
  $ lps plugins remove

EXAMPLES
  $ lps plugins remove myplugin
```

## `lps plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ lps plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.74/src/commands/plugins/reset.ts)_

## `lps plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ lps plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ lps plugins unlink
  $ lps plugins remove

EXAMPLES
  $ lps plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.74/src/commands/plugins/uninstall.ts)_

## `lps plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ lps plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ lps plugins unlink
  $ lps plugins remove

EXAMPLES
  $ lps plugins unlink myplugin
```

## `lps plugins update`

Update installed plugins.

```
USAGE
  $ lps plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.74/src/commands/plugins/update.ts)_

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

_See code: [src/commands/project/config.ts](https://github.com/loopress/loopress/blob/v0.1.0/src/commands/project/config.ts)_

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

_See code: [src/commands/project/list.ts](https://github.com/loopress/loopress/blob/v0.1.0/src/commands/project/list.ts)_

## `lps project remove`

Remove one or more WordPress project configurations

```
USAGE
  $ lps project remove

DESCRIPTION
  Remove one or more WordPress project configurations

EXAMPLES
  $ lps project remove
```

_See code: [src/commands/project/remove.ts](https://github.com/loopress/loopress/blob/v0.1.0/src/commands/project/remove.ts)_

## `lps project remove-env`

Remove one or more environments from the current project

```
USAGE
  $ lps project remove-env

DESCRIPTION
  Remove one or more environments from the current project

EXAMPLES
  $ lps project remove-env
```

_See code: [src/commands/project/remove-env.ts](https://github.com/loopress/loopress/blob/v0.1.0/src/commands/project/remove-env.ts)_

## `lps project switch`

Switch the active project

```
USAGE
  $ lps project switch

DESCRIPTION
  Switch the active project

EXAMPLES
  $ lps project switch
```

_See code: [src/commands/project/switch.ts](https://github.com/loopress/loopress/blob/v0.1.0/src/commands/project/switch.ts)_

## `lps project switch-env`

Switch the active environment within the current project

```
USAGE
  $ lps project switch-env

DESCRIPTION
  Switch the active environment within the current project

EXAMPLES
  $ lps project switch-env
```

_See code: [src/commands/project/switch-env.ts](https://github.com/loopress/loopress/blob/v0.1.0/src/commands/project/switch-env.ts)_

## `lps snippets list`

List snippets from WordPress

```
USAGE
  $ lps snippets list [--password <value>] [--url <value>] [--user <value>] [-j] [-p code-snippets|wpcode]

FLAGS
  -j, --json             Output in JSON format
  -p, --plugin=<option>  [default: code-snippets] WordPress snippet plugin to target
                         <options: code-snippets|wpcode>

GLOBAL FLAGS
  --password=<value>  WordPress application password (fallback; prefer `lps project config`)
  --url=<value>       WordPress URL (fallback; prefer `lps project config`)
  --user=<value>      WordPress username (fallback; prefer `lps project config`)

DESCRIPTION
  List snippets from WordPress

EXAMPLES
  $ lps snippets list

  $ lps snippets list --url http://example.com

  $ lps snippets list --plugin wpcode
```

_See code: [src/commands/snippets/list.ts](https://github.com/loopress/loopress/blob/v0.1.0/src/commands/snippets/list.ts)_

## `lps snippets pull [PATH]`

Pull snippets from WordPress

```
USAGE
  $ lps snippets pull [PATH] [--password <value>] [--url <value>] [--user <value>] [-d] [-p code-snippets|wpcode]

ARGUMENTS
  [PATH]  Path to snippets directory (overrides project config)

FLAGS
  -d, --dryRun           Dry run - show what would happen without making changes
  -p, --plugin=<option>  [default: code-snippets] WordPress snippet plugin to target
                         <options: code-snippets|wpcode>

GLOBAL FLAGS
  --password=<value>  WordPress application password (fallback; prefer `lps project config`)
  --url=<value>       WordPress URL (fallback; prefer `lps project config`)
  --user=<value>      WordPress username (fallback; prefer `lps project config`)

DESCRIPTION
  Pull snippets from WordPress

EXAMPLES
  $ lps snippets pull

  $ lps snippets pull --url http://example.com

  $ lps snippets pull --path ./snippets

  $ lps snippets pull --plugin wpcode
```

_See code: [src/commands/snippets/pull.ts](https://github.com/loopress/loopress/blob/v0.1.0/src/commands/snippets/pull.ts)_

## `lps snippets push [PATH]`

Push snippets to WordPress

```
USAGE
  $ lps snippets push [PATH] [--password <value>] [--url <value>] [--user <value>] [-d] [-p code-snippets|wpcode]

ARGUMENTS
  [PATH]  Path to snippets directory (overrides project config)

FLAGS
  -d, --dryRun           Dry run - show what would happen without making changes
  -p, --plugin=<option>  [default: code-snippets] WordPress snippet plugin to target
                         <options: code-snippets|wpcode>

GLOBAL FLAGS
  --password=<value>  WordPress application password (fallback; prefer `lps project config`)
  --url=<value>       WordPress URL (fallback; prefer `lps project config`)
  --user=<value>      WordPress username (fallback; prefer `lps project config`)

DESCRIPTION
  Push snippets to WordPress

EXAMPLES
  $ lps snippets push

  $ lps snippets push --url http://example.com

  $ lps snippets push --path ./snippets

  $ lps snippets push --plugin wpcode
```

_See code: [src/commands/snippets/push.ts](https://github.com/loopress/loopress/blob/v0.1.0/src/commands/snippets/push.ts)_

## `lps styles pull`

Pull Global Styles from WordPress

```
USAGE
  $ lps styles pull [--password <value>] [--url <value>] [--user <value>] [-d]

FLAGS
  -d, --dryRun  Dry run - show what would happen without making changes

GLOBAL FLAGS
  --password=<value>  WordPress application password (fallback; prefer `lps project config`)
  --url=<value>       WordPress URL (fallback; prefer `lps project config`)
  --user=<value>      WordPress username (fallback; prefer `lps project config`)

DESCRIPTION
  Pull Global Styles from WordPress

EXAMPLES
  $ lps styles pull

  $ lps styles pull --url http://example.com
```

_See code: [src/commands/styles/pull.ts](https://github.com/loopress/loopress/blob/v0.1.0/src/commands/styles/pull.ts)_

## `lps styles push`

Push Global Styles to WordPress

```
USAGE
  $ lps styles push [--password <value>] [--url <value>] [--user <value>] [-d]

FLAGS
  -d, --dryRun  Dry run - show what would happen without making changes

GLOBAL FLAGS
  --password=<value>  WordPress application password (fallback; prefer `lps project config`)
  --url=<value>       WordPress URL (fallback; prefer `lps project config`)
  --user=<value>      WordPress username (fallback; prefer `lps project config`)

DESCRIPTION
  Push Global Styles to WordPress

EXAMPLES
  $ lps styles push

  $ lps styles push --url http://example.com
```

_See code: [src/commands/styles/push.ts](https://github.com/loopress/loopress/blob/v0.1.0/src/commands/styles/push.ts)_

<!-- commandsstop -->
