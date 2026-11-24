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
@loopress/cli/0.36.0 linux-x64 node-v24.22.2
$ lps --help [COMMAND]
USAGE
  $ lps COMMAND
...
```
<!-- usagestop -->

# Error reporting

Crash reporting is opt-in: nothing is sent until you say yes. The first interactive
command asks once (default no). Non-interactive shells and CI never ask and send nothing
until you run `lps telemetry enable`. Run `lps telemetry disable` to opt out again, or set
`LOOPRESS_TELEMETRY_DISABLED=1` to override a yes for a single run.

A crash report has the command name, its flag names (never their values or arguments),
your Node.js version, OS, and the error message with site URLs removed. WordPress
credentials are never included.

# Commands

<!-- commands -->
* [`lps acf diff [PATH]`](#lps-acf-diff-path)
* [`lps acf list`](#lps-acf-list)
* [`lps acf pull [PATH]`](#lps-acf-pull-path)
* [`lps acf push [PATH]`](#lps-acf-push-path)
* [`lps acf rollback [PATH]`](#lps-acf-rollback-path)
* [`lps api diff [PATH]`](#lps-api-diff-path)
* [`lps api list`](#lps-api-list)
* [`lps api pull [PATH]`](#lps-api-pull-path)
* [`lps api push [PATH]`](#lps-api-push-path)
* [`lps api remove FILENAME`](#lps-api-remove-filename)
* [`lps api rm FILENAME`](#lps-api-rm-filename)
* [`lps api rollback [PATH]`](#lps-api-rollback-path)
* [`lps app list`](#lps-app-list)
* [`lps app pull [PATH]`](#lps-app-pull-path)
* [`lps app push [NAME]`](#lps-app-push-name)
* [`lps app remove NAME`](#lps-app-remove-name)
* [`lps app rm NAME`](#lps-app-rm-name)
* [`lps app rollback [PATH]`](#lps-app-rollback-path)
* [`lps block diff [PATH]`](#lps-block-diff-path)
* [`lps block list`](#lps-block-list)
* [`lps block pull [PATH]`](#lps-block-pull-path)
* [`lps block push [PATH]`](#lps-block-push-path)
* [`lps block remove SLUG`](#lps-block-remove-slug)
* [`lps block rm SLUG`](#lps-block-rm-slug)
* [`lps block rollback [PATH]`](#lps-block-rollback-path)
* [`lps composer init`](#lps-composer-init)
* [`lps composer pull`](#lps-composer-pull)
* [`lps composer push`](#lps-composer-push)
* [`lps composer rollback [PATH]`](#lps-composer-rollback-path)
* [`lps content copy FROM`](#lps-content-copy-from)
* [`lps cpt diff [PATH]`](#lps-cpt-diff-path)
* [`lps cpt list`](#lps-cpt-list)
* [`lps cpt pull [PATH]`](#lps-cpt-pull-path)
* [`lps cpt push [PATH]`](#lps-cpt-push-path)
* [`lps cpt remove SLUG`](#lps-cpt-remove-slug)
* [`lps cpt rm SLUG`](#lps-cpt-rm-slug)
* [`lps cpt rollback [PATH]`](#lps-cpt-rollback-path)
* [`lps dev`](#lps-dev)
* [`lps diff`](#lps-diff)
* [`lps doctor`](#lps-doctor)
* [`lps eject`](#lps-eject)
* [`lps form diff [PATH]`](#lps-form-diff-path)
* [`lps form list`](#lps-form-list)
* [`lps form pull [PATH]`](#lps-form-pull-path)
* [`lps form push [PATH]`](#lps-form-push-path)
* [`lps form rollback [PATH]`](#lps-form-rollback-path)
* [`lps help [COMMAND]`](#lps-help-command)
* [`lps hook diff [PATH]`](#lps-hook-diff-path)
* [`lps hook list`](#lps-hook-list)
* [`lps hook pull [PATH]`](#lps-hook-pull-path)
* [`lps hook push [PATH]`](#lps-hook-push-path)
* [`lps hook remove FILENAME`](#lps-hook-remove-filename)
* [`lps hook rm FILENAME`](#lps-hook-rm-filename)
* [`lps hook rollback [PATH]`](#lps-hook-rollback-path)
* [`lps init`](#lps-init)
* [`lps login`](#lps-login)
* [`lps logout`](#lps-logout)
* [`lps menu diff [PATH]`](#lps-menu-diff-path)
* [`lps menu list`](#lps-menu-list)
* [`lps menu pull [PATH]`](#lps-menu-pull-path)
* [`lps menu push [PATH]`](#lps-menu-push-path)
* [`lps menu rollback [PATH]`](#lps-menu-rollback-path)
* [`lps meta diff [PATH]`](#lps-meta-diff-path)
* [`lps meta list`](#lps-meta-list)
* [`lps meta pull [PATH]`](#lps-meta-pull-path)
* [`lps meta push [PATH]`](#lps-meta-push-path)
* [`lps meta remove SLUG`](#lps-meta-remove-slug)
* [`lps meta rm SLUG`](#lps-meta-rm-slug)
* [`lps meta rollback [PATH]`](#lps-meta-rollback-path)
* [`lps option add NAME`](#lps-option-add-name)
* [`lps option diff [PATH]`](#lps-option-diff-path)
* [`lps option list`](#lps-option-list)
* [`lps option pull [PATH]`](#lps-option-pull-path)
* [`lps option push [PATH]`](#lps-option-push-path)
* [`lps option remove NAME`](#lps-option-remove-name)
* [`lps option rm NAME`](#lps-option-rm-name)
* [`lps option rollback [PATH]`](#lps-option-rollback-path)
* [`lps page diff [PATH]`](#lps-page-diff-path)
* [`lps page list`](#lps-page-list)
* [`lps page push [SLUG]`](#lps-page-push-slug)
* [`lps page rollback [PATH]`](#lps-page-rollback-path)
* [`lps pattern diff [PATH]`](#lps-pattern-diff-path)
* [`lps pattern list`](#lps-pattern-list)
* [`lps pattern pull [PATH]`](#lps-pattern-pull-path)
* [`lps pattern push [PATH]`](#lps-pattern-push-path)
* [`lps pattern remove SLUG`](#lps-pattern-remove-slug)
* [`lps pattern rm SLUG`](#lps-pattern-rm-slug)
* [`lps pattern rollback [PATH]`](#lps-pattern-rollback-path)
* [`lps plugin add SLUG`](#lps-plugin-add-slug)
* [`lps plugin audit`](#lps-plugin-audit)
* [`lps plugin outdated`](#lps-plugin-outdated)
* [`lps plugin pull`](#lps-plugin-pull)
* [`lps plugin push`](#lps-plugin-push)
* [`lps plugin rollback [PATH]`](#lps-plugin-rollback-path)
* [`lps plugin status`](#lps-plugin-status)
* [`lps plugin update [SLUG]`](#lps-plugin-update-slug)
* [`lps project config`](#lps-project-config)
* [`lps project export`](#lps-project-export)
* [`lps project import`](#lps-project-import)
* [`lps project link`](#lps-project-link)
* [`lps project list`](#lps-project-list)
* [`lps project remove`](#lps-project-remove)
* [`lps project rm`](#lps-project-rm)
* [`lps project rotate`](#lps-project-rotate)
* [`lps project switch`](#lps-project-switch)
* [`lps promote FROM TO`](#lps-promote-from-to)
* [`lps pull`](#lps-pull)
* [`lps push`](#lps-push)
* [`lps role diff [PATH]`](#lps-role-diff-path)
* [`lps role list`](#lps-role-list)
* [`lps role pull [PATH]`](#lps-role-pull-path)
* [`lps role push [PATH]`](#lps-role-push-path)
* [`lps role remove SLUG`](#lps-role-remove-slug)
* [`lps role rm SLUG`](#lps-role-rm-slug)
* [`lps role rollback [PATH]`](#lps-role-rollback-path)
* [`lps scf diff [PATH]`](#lps-scf-diff-path)
* [`lps scf list`](#lps-scf-list)
* [`lps scf pull [PATH]`](#lps-scf-pull-path)
* [`lps scf push [PATH]`](#lps-scf-push-path)
* [`lps scf rollback [PATH]`](#lps-scf-rollback-path)
* [`lps snippet diff [PATH]`](#lps-snippet-diff-path)
* [`lps snippet list`](#lps-snippet-list)
* [`lps snippet pull [PATH]`](#lps-snippet-pull-path)
* [`lps snippet push [PATH]`](#lps-snippet-push-path)
* [`lps snippet remove ID`](#lps-snippet-remove-id)
* [`lps snippet rm ID`](#lps-snippet-rm-id)
* [`lps snippet rollback [PATH]`](#lps-snippet-rollback-path)
* [`lps status`](#lps-status)
* [`lps taxonomy diff [PATH]`](#lps-taxonomy-diff-path)
* [`lps taxonomy list`](#lps-taxonomy-list)
* [`lps taxonomy pull [PATH]`](#lps-taxonomy-pull-path)
* [`lps taxonomy push [PATH]`](#lps-taxonomy-push-path)
* [`lps taxonomy remove SLUG`](#lps-taxonomy-remove-slug)
* [`lps taxonomy rm SLUG`](#lps-taxonomy-rm-slug)
* [`lps taxonomy rollback [PATH]`](#lps-taxonomy-rollback-path)
* [`lps telemetry disable`](#lps-telemetry-disable)
* [`lps telemetry enable`](#lps-telemetry-enable)
* [`lps theme activate [STYLESHEET]`](#lps-theme-activate-stylesheet)
* [`lps theme add SLUG`](#lps-theme-add-slug)
* [`lps theme pull`](#lps-theme-pull)
* [`lps theme push`](#lps-theme-push)
* [`lps theme status`](#lps-theme-status)
* [`lps theme style diff [PATH]`](#lps-theme-style-diff-path)
* [`lps theme style pull [PATH]`](#lps-theme-style-pull-path)
* [`lps theme style push [PATH]`](#lps-theme-style-push-path)
* [`lps theme style rollback [PATH]`](#lps-theme-style-rollback-path)
* [`lps theme template diff`](#lps-theme-template-diff)
* [`lps theme template list`](#lps-theme-template-list)
* [`lps theme template push`](#lps-theme-template-push)
* [`lps theme template rollback [PATH]`](#lps-theme-template-rollback-path)
* [`lps theme version pull`](#lps-theme-version-pull)
* [`lps theme version push`](#lps-theme-version-push)
* [`lps theme version rollback [PATH]`](#lps-theme-version-rollback-path)
* [`lps validate`](#lps-validate)

## `lps acf diff [PATH]`

Show what differs in ACF field groups, post types, taxonomies, and options pages between your local files and a WordPress environment, or between two environments

```
USAGE
  $ lps acf diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to ACF directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in ACF field groups, post types, taxonomies, and options pages between your local files and a
  WordPress environment, or between two environments

ALIASES
  $ lps scf diff

EXAMPLES
  $ lps acf diff

  $ lps acf diff --env staging

  $ lps acf diff --env staging --against production
```

_See code: [src/commands/acf/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/acf/diff.ts)_

## `lps acf list`

List ACF field groups, post types, taxonomies, and options pages currently on WordPress

```
USAGE
  $ lps acf list [--json] [--env <value>] [--type field-groups|post-types|taxonomies|options-pages...]

FLAGS
  --env=<value>       Target environment by name (default: "local", or the project's only environment)
  --type=<option>...  Limit to specific ACF object types
                      <options: field-groups|post-types|taxonomies|options-pages>

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List ACF field groups, post types, taxonomies, and options pages currently on WordPress

ALIASES
  $ lps scf list

EXAMPLES
  $ lps acf list

  $ lps acf list --type field-groups
```

_See code: [src/commands/acf/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/acf/list.ts)_

## `lps acf pull [PATH]`

Pull ACF field groups, post types, taxonomies, and options pages from WordPress into local files

```
USAGE
  $ lps acf pull [PATH] [--json] [--env <value>] [-d] [-y] [--type
    field-groups|post-types|taxonomies|options-pages...]

ARGUMENTS
  [PATH]  Path to ACF directory (overrides project config)

FLAGS
  -d, --dry-run           Show what would change without making changes
  -y, --yes               Answer yes to confirmation prompts
      --env=<value>       Target environment by name (default: "local", or the project's only environment)
      --type=<option>...  Limit to specific ACF object types
                          <options: field-groups|post-types|taxonomies|options-pages>

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull ACF field groups, post types, taxonomies, and options pages from WordPress into local files

ALIASES
  $ lps scf pull

EXAMPLES
  $ lps acf pull

  $ lps acf pull --type field-groups
```

_See code: [src/commands/acf/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/acf/pull.ts)_

## `lps acf push [PATH]`

Push local ACF field groups, post types, taxonomies, and options pages to WordPress

```
USAGE
  $ lps acf push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y] [--type
    field-groups|post-types|taxonomies|options-pages...]

ARGUMENTS
  [PATH]  Path to ACF directory (overrides project config)

FLAGS
  -d, --dry-run           Show what would change without making changes
  -y, --yes               Answer yes to confirmation prompts
      --env=<value>       Target environment by name (default: "local", or the project's only environment)
      --overwrite         Push even over changes made on the site outside Loopress since your last push. Pages: also
                          take over a same-slug page Loopress did not create
      --type=<option>...  Limit to specific ACF object types
                          <options: field-groups|post-types|taxonomies|options-pages>

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push local ACF field groups, post types, taxonomies, and options pages to WordPress

ALIASES
  $ lps scf push

EXAMPLES
  $ lps acf push

  $ lps acf push --type field-groups
```

_See code: [src/commands/acf/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/acf/push.ts)_

## `lps acf rollback [PATH]`

Restore ACF field groups, post types, taxonomies, and options pages to a snapshot taken automatically before an earlier `lps acf push`

```
USAGE
  $ lps acf rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to ACF directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore ACF field groups, post types, taxonomies, and options pages to a snapshot taken automatically before an
  earlier `lps acf push`

ALIASES
  $ lps scf rollback

EXAMPLES
  $ lps acf rollback

  $ lps acf rollback --list

  $ lps acf rollback --to 1732000000000

  $ lps acf rollback --dry-run
```

_See code: [src/commands/acf/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/acf/rollback.ts)_

## `lps api diff [PATH]`

Show what differs in custom API route files between your local files and a WordPress environment, or between two environments

```
USAGE
  $ lps api diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to api directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in custom API route files between your local files and a WordPress environment, or between two
  environments

EXAMPLES
  $ lps api diff

  $ lps api diff --env staging

  $ lps api diff --env staging --against production
```

_See code: [src/commands/api/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/api/diff.ts)_

## `lps api list`

List custom API route files currently on WordPress

```
USAGE
  $ lps api list [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List custom API route files currently on WordPress

EXAMPLES
  $ lps api list
```

_See code: [src/commands/api/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/api/list.ts)_

## `lps api pull [PATH]`

Pull custom API route files, and their namespace, from WordPress into local files

```
USAGE
  $ lps api pull [PATH] [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  [PATH]  Path to api directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull custom API route files, and their namespace, from WordPress into local files

EXAMPLES
  $ lps api pull

  $ lps api pull ./api
```

_See code: [src/commands/api/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/api/pull.ts)_

## `lps api push [PATH]`

Push local custom API route files, and their namespace, to WordPress

```
USAGE
  $ lps api push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y] [--prune]

ARGUMENTS
  [PATH]  Path to api directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create
      --[no-]prune   Delete server-side route files not present locally (default), --no-prune keeps them

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push local custom API route files, and their namespace, to WordPress

EXAMPLES
  $ lps api push

  $ lps api push ./api

  $ lps api push --no-prune
```

_See code: [src/commands/api/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/api/push.ts)_

## `lps api remove FILENAME`

Remove one custom API route file from WordPress

```
USAGE
  $ lps api remove FILENAME [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  FILENAME  The route file to remove, its slug without the .php extension (e.g. "hello" or "invoice-pdf/[order_id]")

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Remove one custom API route file from WordPress

ALIASES
  $ lps api remove

EXAMPLES
  $ lps api rm hello

  $ lps api remove hello --yes
```

## `lps api rm FILENAME`

Remove one custom API route file from WordPress

```
USAGE
  $ lps api rm FILENAME [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  FILENAME  The route file to remove, its slug without the .php extension (e.g. "hello" or "invoice-pdf/[order_id]")

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Remove one custom API route file from WordPress

ALIASES
  $ lps api remove

EXAMPLES
  $ lps api rm hello

  $ lps api remove hello --yes
```

_See code: [src/commands/api/rm.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/api/rm.ts)_

## `lps api rollback [PATH]`

Restore API route files to a snapshot taken automatically before an earlier `lps api push`

```
USAGE
  $ lps api rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to api directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore API route files to a snapshot taken automatically before an earlier `lps api push`

EXAMPLES
  $ lps api rollback

  $ lps api rollback --list

  $ lps api rollback --to 1732000000000

  $ lps api rollback --dry-run
```

_See code: [src/commands/api/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/api/rollback.ts)_

## `lps app list`

List single-page apps deployed to WordPress

```
USAGE
  $ lps app list [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List single-page apps deployed to WordPress

EXAMPLES
  $ lps app list
```

_See code: [src/commands/app/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/app/list.ts)_

## `lps app pull [PATH]`

Pull single-page app bundles from WordPress into local files

```
USAGE
  $ lps app pull [PATH] [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  [PATH]  Path to apps directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull single-page app bundles from WordPress into local files

EXAMPLES
  $ lps app pull
```

_See code: [src/commands/app/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/app/pull.ts)_

## `lps app push [NAME]`

Build and push single-page app bundles to WordPress. Each app is an `apps/<name>/` directory holding a loopress.app.json and a dist/ folder. When the app has a package.json with a `build` script, it runs first (use --no-build to skip it). Only files whose content changed are uploaded.

```
USAGE
  $ lps app push [NAME] [--json] [--env <value>] [--overwrite] [--build] [-d] [-y]

ARGUMENTS
  [NAME]  Push only this app (defaults to every app in the directory)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --[no-]build   Run the app's package.json build script before pushing
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Build and push single-page app bundles to WordPress. Each app is an `apps/<name>/` directory holding a
  loopress.app.json and a dist/ folder. When the app has a package.json with a `build` script, it runs first (use
  --no-build to skip it). Only files whose content changed are uploaded.

EXAMPLES
  $ lps app push

  $ lps app push search

  $ lps app push --no-build
```

_See code: [src/commands/app/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/app/push.ts)_

## `lps app remove NAME`

Remove a single-page app from WordPress: deletes its bundle from wp-content/loopress/apps/ and unregisters the shortcode. Local files are left untouched.

```
USAGE
  $ lps app remove NAME [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  NAME  App to remove from WordPress

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Remove a single-page app from WordPress: deletes its bundle from wp-content/loopress/apps/ and unregisters the
  shortcode. Local files are left untouched.

ALIASES
  $ lps app remove

EXAMPLES
  $ lps app rm search
```

## `lps app rm NAME`

Remove a single-page app from WordPress: deletes its bundle from wp-content/loopress/apps/ and unregisters the shortcode. Local files are left untouched.

```
USAGE
  $ lps app rm NAME [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  NAME  App to remove from WordPress

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Remove a single-page app from WordPress: deletes its bundle from wp-content/loopress/apps/ and unregisters the
  shortcode. Local files are left untouched.

ALIASES
  $ lps app remove

EXAMPLES
  $ lps app rm search
```

_See code: [src/commands/app/rm.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/app/rm.ts)_

## `lps app rollback [PATH]`

Restore the single-page apps to a snapshot taken automatically before an earlier `lps app push`: uploads the files of the previous build, then commits it, and removes the apps that push created.

```
USAGE
  $ lps app rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to apps directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore the single-page apps to a snapshot taken automatically before an earlier `lps app push`: uploads the files of
  the previous build, then commits it, and removes the apps that push created.

EXAMPLES
  $ lps app rollback

  $ lps app rollback --list

  $ lps app rollback --to 1732000000000

  $ lps app rollback --dry-run
```

_See code: [src/commands/app/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/app/rollback.ts)_

## `lps block diff [PATH]`

Show what differs in dynamic blocks between your local blocks/ folders and a WordPress environment, or between two environments

```
USAGE
  $ lps block diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to blocks directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in dynamic blocks between your local blocks/ folders and a WordPress environment, or between two
  environments

EXAMPLES
  $ lps block diff

  $ lps block diff --env staging

  $ lps block diff --env staging --against production
```

_See code: [src/commands/block/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/block/diff.ts)_

## `lps block list`

List the dynamic blocks Loopress registers on WordPress (loopress/<slug>), with their load and render errors

```
USAGE
  $ lps block list [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List the dynamic blocks Loopress registers on WordPress (loopress/<slug>), with their load and render errors

EXAMPLES
  $ lps block list
```

_See code: [src/commands/block/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/block/list.ts)_

## `lps block pull [PATH]`

Pull the dynamic blocks Loopress registers on WordPress into blocks/<slug>/ folders

```
USAGE
  $ lps block pull [PATH] [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  [PATH]  Path to blocks directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull the dynamic blocks Loopress registers on WordPress into blocks/<slug>/ folders

EXAMPLES
  $ lps block pull
```

_See code: [src/commands/block/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/block/pull.ts)_

## `lps block push [PATH]`

Push local dynamic blocks (`blocks/<slug>/` holding block.json, render.php, and optionally style.css and view.js) to WordPress, registered as loopress/<slug> and placed with `<!-- wp:loopress/<slug> /-->`. Each block is replaced as a whole. Create or update only, never deletes a block (use `lps block rm`).

```
USAGE
  $ lps block push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y]

ARGUMENTS
  [PATH]  Path to blocks directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push local dynamic blocks (`blocks/<slug>/` holding block.json, render.php, and optionally style.css and view.js) to
  WordPress, registered as loopress/<slug> and placed with `<!-- wp:loopress/<slug> /-->`. Each block is replaced as a
  whole. Create or update only, never deletes a block (use `lps block rm`).

EXAMPLES
  $ lps block push

  $ lps block push --dry-run
```

_See code: [src/commands/block/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/block/push.ts)_

## `lps block remove SLUG`

Remove a dynamic block from WordPress. A <!-- wp:loopress/<slug> /--> left in a page or template renders nothing until it is pushed again. Local files are left untouched.

```
USAGE
  $ lps block remove SLUG [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  SLUG  The block to remove, its blocks/ folder name (e.g. "hero")

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Remove a dynamic block from WordPress. A <!-- wp:loopress/<slug> /--> left in a page or template renders nothing until
  it is pushed again. Local files are left untouched.

ALIASES
  $ lps block remove

EXAMPLES
  $ lps block rm hero

  $ lps block rm hero --yes
```

## `lps block rm SLUG`

Remove a dynamic block from WordPress. A <!-- wp:loopress/<slug> /--> left in a page or template renders nothing until it is pushed again. Local files are left untouched.

```
USAGE
  $ lps block rm SLUG [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  SLUG  The block to remove, its blocks/ folder name (e.g. "hero")

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Remove a dynamic block from WordPress. A <!-- wp:loopress/<slug> /--> left in a page or template renders nothing until
  it is pushed again. Local files are left untouched.

ALIASES
  $ lps block remove

EXAMPLES
  $ lps block rm hero

  $ lps block rm hero --yes
```

_See code: [src/commands/block/rm.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/block/rm.ts)_

## `lps block rollback [PATH]`

Restore dynamic blocks to a snapshot taken automatically before an earlier `lps block push`

```
USAGE
  $ lps block rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to blocks directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore dynamic blocks to a snapshot taken automatically before an earlier `lps block push`

EXAMPLES
  $ lps block rollback

  $ lps block rollback --list

  $ lps block rollback --to 1732000000000

  $ lps block rollback --dry-run
```

_See code: [src/commands/block/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/block/rollback.ts)_

## `lps composer init`

Create a composer.json wired to WPackagist for installing WordPress.org plugins and themes

```
USAGE
  $ lps composer init [--env <value>] [-d]

FLAGS
  -d, --dry-run      Show what would change without making changes
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

DESCRIPTION
  Create a composer.json wired to WPackagist for installing WordPress.org plugins and themes

EXAMPLES
  $ lps composer init

  $ lps composer init --dry-run
```

_See code: [src/commands/composer/init.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/composer/init.ts)_

## `lps composer pull`

Pull composer.json and composer.lock from WordPress into local files

```
USAGE
  $ lps composer pull [--json] [--env <value>] [-d]

FLAGS
  -d, --dry-run      Show what would change without making changes
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull composer.json and composer.lock from WordPress into local files

EXAMPLES
  $ lps composer pull

  $ lps composer pull --dry-run
```

_See code: [src/commands/composer/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/composer/pull.ts)_

## `lps composer push`

Push composer.json to WordPress and run Composer to resolve and install dependencies

```
USAGE
  $ lps composer push [--json] [--env <value>] [--overwrite] [-d] [-y] [--force]

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --force        Allow downgrades and take over plugins/themes installed outside Loopress
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push composer.json to WordPress and run Composer to resolve and install dependencies

EXAMPLES
  $ lps composer push

  $ lps composer push --dry-run
```

_See code: [src/commands/composer/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/composer/push.ts)_

## `lps composer rollback [PATH]`

Restore the site's composer.json to a snapshot taken automatically before an earlier `lps composer push`, then run Composer on it. A package the push added is uninstalled. A downgrade needs --force: it does not undo database migrations.

```
USAGE
  $ lps composer rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>] [--force]

ARGUMENTS
  [PATH]  Path to project (unused) (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --force        Roll back even when it downgrades a package (database migrations are not undone)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore the site's composer.json to a snapshot taken automatically before an earlier `lps composer push`, then run
  Composer on it. A package the push added is uninstalled. A downgrade needs --force: it does not undo database
  migrations.

EXAMPLES
  $ lps composer rollback

  $ lps composer rollback --list

  $ lps composer rollback --to 1732000000000

  $ lps composer rollback --dry-run
```

_See code: [src/commands/composer/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/composer/rollback.ts)_

## `lps content copy FROM`

Replace the local site's content (posts, pages, public custom post types, terms) with the content of <from>, activate the theme and plugins active there (when installed locally), then push the project to the local site so tracked configuration wins. Media stay served by <from>, users, comments and orders are never copied.

```
USAGE
  $ lps content copy FROM [--json] [-d] [-y]

ARGUMENTS
  FROM  Environment to copy the content from

FLAGS
  -d, --dry-run  Show what would change without making changes
  -y, --yes      Answer yes to confirmation prompts

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Replace the local site's content (posts, pages, public custom post types, terms) with the content of <from>, activate
  the theme and plugins active there (when installed locally), then push the project to the local site so tracked
  configuration wins. Media stay served by <from>, users, comments and orders are never copied.

EXAMPLES
  $ lps content copy production

  $ lps content copy staging --dry-run
```

_See code: [src/commands/content/copy.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/content/copy.ts)_

## `lps cpt diff [PATH]`

Show what differs in custom post types between your local cpt/ files and a WordPress environment, or between two environments

```
USAGE
  $ lps cpt diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to cpt directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in custom post types between your local cpt/ files and a WordPress environment, or between two
  environments

EXAMPLES
  $ lps cpt diff

  $ lps cpt diff --env staging

  $ lps cpt diff --env staging --against production
```

_See code: [src/commands/cpt/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/cpt/diff.ts)_

## `lps cpt list`

List the post types registered on WordPress and where each comes from (Loopress, WordPress, ACF, CPT UI, a theme or plugin). Only Loopress ones are pulled and pushed.

```
USAGE
  $ lps cpt list [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List the post types registered on WordPress and where each comes from (Loopress, WordPress, ACF, CPT UI, a theme or
  plugin). Only Loopress ones are pulled and pushed.

EXAMPLES
  $ lps cpt list
```

_See code: [src/commands/cpt/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/cpt/list.ts)_

## `lps cpt pull [PATH]`

Pull the custom post types Loopress manages on WordPress into cpt/<slug>.json files. Post types registered by a theme or another plugin are never pulled, see `lps cpt list`.

```
USAGE
  $ lps cpt pull [PATH] [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  [PATH]  Path to the cpt directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull the custom post types Loopress manages on WordPress into cpt/<slug>.json files. Post types registered by a theme
  or another plugin are never pulled, see `lps cpt list`.

EXAMPLES
  $ lps cpt pull
```

_See code: [src/commands/cpt/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/cpt/pull.ts)_

## `lps cpt push [PATH]`

Push local custom post types (`cpt/<slug>.json`, register_post_type() arguments) to WordPress. Create or update only, never deletes a post type: use `lps cpt rm` for that.

```
USAGE
  $ lps cpt push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y]

ARGUMENTS
  [PATH]  Path to the cpt directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push local custom post types (`cpt/<slug>.json`, register_post_type() arguments) to WordPress. Create or update only,
  never deletes a post type: use `lps cpt rm` for that.

EXAMPLES
  $ lps cpt push
```

_See code: [src/commands/cpt/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/cpt/push.ts)_

## `lps cpt remove SLUG`

Stop registering a Loopress custom post type on WordPress. Its posts are kept in the database, hidden until the post type is pushed again.

```
USAGE
  $ lps cpt remove SLUG [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  SLUG  The post type slug, its cpt/ file name without .json

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Stop registering a Loopress custom post type on WordPress. Its posts are kept in the database, hidden until the post
  type is pushed again.

ALIASES
  $ lps cpt remove

EXAMPLES
  $ lps cpt rm <slug>

  $ lps cpt remove <slug> --yes
```

## `lps cpt rm SLUG`

Stop registering a Loopress custom post type on WordPress. Its posts are kept in the database, hidden until the post type is pushed again.

```
USAGE
  $ lps cpt rm SLUG [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  SLUG  The post type slug, its cpt/ file name without .json

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Stop registering a Loopress custom post type on WordPress. Its posts are kept in the database, hidden until the post
  type is pushed again.

ALIASES
  $ lps cpt remove

EXAMPLES
  $ lps cpt rm <slug>

  $ lps cpt remove <slug> --yes
```

_See code: [src/commands/cpt/rm.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/cpt/rm.ts)_

## `lps cpt rollback [PATH]`

Restore custom post types to a snapshot taken automatically before an earlier `lps cpt push`

```
USAGE
  $ lps cpt rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to cpt directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore custom post types to a snapshot taken automatically before an earlier `lps cpt push`

EXAMPLES
  $ lps cpt rollback

  $ lps cpt rollback --list

  $ lps cpt rollback --to 1732000000000

  $ lps cpt rollback --dry-run
```

_See code: [src/commands/cpt/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/cpt/rollback.ts)_

## `lps dev`

Watch project files and push changes to the local WordPress instance as they happen. Always targets the "local" environment, run `lps snippet push` etc. directly for any other environment.

```
USAGE
  $ lps dev [--only <value>...] [--skip <value>...]

FLAGS
  --only=<value>...  Only watch these resources (comma-separated or repeated): snippet, template, part, css, block,
                     page, api, hook, plugin
  --skip=<value>...  Watch every resource except these (comma-separated or repeated)

DESCRIPTION
  Watch project files and push changes to the local WordPress instance as they happen. Always targets the "local"
  environment, run `lps snippet push` etc. directly for any other environment.

EXAMPLES
  $ lps dev

  $ lps dev --only=snippet,api

  $ lps dev --skip=plugin
```

_See code: [src/commands/dev.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/dev.ts)_

## `lps diff`

Show what differs between your local tracked files and a WordPress environment, or between two environments. Covers snippets, forms, ACF, API routes, hooks, dynamic blocks, templates, template parts, pages, menus, custom post types, taxonomies, post meta, roles, block patterns, options, theme styles, and Composer. Plugins and themes have their own `lps plugin status` / `lps theme status`. Exit code: 0 in sync, 1 on drift, 2 when a resource could not be compared, so it doubles as a CI drift gate.

```
USAGE
  $ lps diff [--json] [--env <value>] [--against <value>] [--skip-unsupported] [--only <value>...] [--skip
    <value>...]

FLAGS
  --against=<value>   Compare the primary environment against this second environment instead of against local files
  --env=<value>       Target environment by name (default: "local", or the project's only environment)
  --only=<value>...   Only compare these resources (comma-separated or repeated): snippet, form, acf, api, hook, block,
                      template, part, page, menu, cpt, taxonomy, meta, role, pattern, option, theme-style, composer
  --skip=<value>...   Compare every resource except these (comma-separated or repeated)
  --skip-unsupported  Skip the resources the project uses but this site can't hold (a missing plugin, a Full feature on
                      Light) instead of failing, and warn about each

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs between your local tracked files and a WordPress environment, or between two environments. Covers
  snippets, forms, ACF, API routes, hooks, dynamic blocks, templates, template parts, pages, menus, custom post types,
  taxonomies, post meta, roles, block patterns, options, theme styles, and Composer. Plugins and themes have their own
  `lps plugin status` / `lps theme status`. Exit code: 0 in sync, 1 on drift, 2 when a resource could not be compared,
  so it doubles as a CI drift gate.

EXAMPLES
  $ lps diff

  $ lps diff --env staging

  $ lps diff --env staging --against production

  $ lps diff --only snippet --only acf

  $ lps diff --skip composer
```

_See code: [src/commands/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/diff.ts)_

## `lps doctor`

Diagnose connectivity, plugin, credential and hook problems for the targeted environment

```
USAGE
  $ lps doctor [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Diagnose connectivity, plugin, credential and hook problems for the targeted environment

EXAMPLES
  $ lps doctor

  $ lps doctor --env production
```

_See code: [src/commands/doctor.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/doctor.ts)_

## `lps eject`

Turn this project into one standard WordPress plugin, so the site works the same without Loopress. Reads the repo only, never the site

```
USAGE
  $ lps eject [--dry-run] [--force] [--out <value>]

FLAGS
  --dry-run      List what would be generated, write nothing
  --force        Replace the output folder when it already exists
  --out=<value>  Output folder (default: eject/<project-slug>)

DESCRIPTION
  Turn this project into one standard WordPress plugin, so the site works the same without Loopress. Reads the repo
  only, never the site

EXAMPLES
  $ lps eject

  $ lps eject --dry-run

  $ lps eject --out ../my-site-plugin --force
```

_See code: [src/commands/eject.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/eject.ts)_

## `lps form diff [PATH]`

Show what differs in forms between your local files and a WordPress environment, or between two environments

```
USAGE
  $ lps form diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to forms directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in forms between your local files and a WordPress environment, or between two environments

EXAMPLES
  $ lps form diff

  $ lps form diff --env staging

  $ lps form diff --env staging --against production
```

_See code: [src/commands/form/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/form/diff.ts)_

## `lps form list`

List forms currently on WordPress

```
USAGE
  $ lps form list [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List forms currently on WordPress

EXAMPLES
  $ lps form list
```

_See code: [src/commands/form/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/form/list.ts)_

## `lps form pull [PATH]`

Pull forms from WordPress into local files

```
USAGE
  $ lps form pull [PATH] [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  [PATH]  Path to forms directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull forms from WordPress into local files

EXAMPLES
  $ lps form pull
```

_See code: [src/commands/form/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/form/pull.ts)_

## `lps form push [PATH]`

Push local form files to WordPress. Local files created or updated remotely are renamed on disk to the `<id>-<slug>.json` convention.

```
USAGE
  $ lps form push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y] [--allow-notifications]

ARGUMENTS
  [PATH]  Path to forms directory (overrides project config)

FLAGS
  -d, --dry-run              Show what would change without making changes
  -y, --yes                  Answer yes to confirmation prompts
      --allow-notifications  Also push each form's notification and confirmation settings (recipients, sender,
                             messages). Off by default: the server keeps its own so a stray push can't redirect
                             submissions.
      --env=<value>          Target environment by name (default: "local", or the project's only environment)
      --overwrite            Push even over changes made on the site outside Loopress since your last push. Pages: also
                             take over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push local form files to WordPress. Local files created or updated remotely are renamed on disk to the
  `<id>-<slug>.json` convention.

EXAMPLES
  $ lps form push

  $ lps form push --allow-notifications
```

_See code: [src/commands/form/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/form/push.ts)_

## `lps form rollback [PATH]`

Restore forms to a snapshot taken automatically before an earlier `lps form push`

```
USAGE
  $ lps form rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to forms directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore forms to a snapshot taken automatically before an earlier `lps form push`

EXAMPLES
  $ lps form rollback

  $ lps form rollback --list

  $ lps form rollback --to 1732000000000

  $ lps form rollback --dry-run
```

_See code: [src/commands/form/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/form/rollback.ts)_

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

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/7.0.6/src/commands/help.ts)_

## `lps hook diff [PATH]`

Show what differs in hook files between your local files and a WordPress environment, or between two environments

```
USAGE
  $ lps hook diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to hooks directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in hook files between your local files and a WordPress environment, or between two environments

EXAMPLES
  $ lps hook diff

  $ lps hook diff --env staging

  $ lps hook diff --env staging --against production
```

_See code: [src/commands/hook/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/hook/diff.ts)_

## `lps hook list`

List hook files (actions, filters, cron) currently on WordPress

```
USAGE
  $ lps hook list [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List hook files (actions, filters, cron) currently on WordPress

EXAMPLES
  $ lps hook list
```

_See code: [src/commands/hook/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/hook/list.ts)_

## `lps hook pull [PATH]`

Pull hook files (actions, filters, cron) from WordPress into local files

```
USAGE
  $ lps hook pull [PATH] [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  [PATH]  Path to hooks directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull hook files (actions, filters, cron) from WordPress into local files

EXAMPLES
  $ lps hook pull

  $ lps hook pull ./hooks
```

_See code: [src/commands/hook/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/hook/pull.ts)_

## `lps hook push [PATH]`

Push local hook files (actions, filters, cron) to WordPress

```
USAGE
  $ lps hook push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y] [--prune]

ARGUMENTS
  [PATH]  Path to hooks directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create
      --[no-]prune   Delete server-side hook files not present locally (default), --no-prune keeps them

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push local hook files (actions, filters, cron) to WordPress

EXAMPLES
  $ lps hook push

  $ lps hook push ./hooks

  $ lps hook push --no-prune
```

_See code: [src/commands/hook/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/hook/push.ts)_

## `lps hook remove FILENAME`

Remove one hook file (action, filter, cron) from WordPress

```
USAGE
  $ lps hook remove FILENAME [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  FILENAME  The hook file to remove, its slug without the .php extension (e.g. "hello" or "invoice-pdf/[order_id]")

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Remove one hook file (action, filter, cron) from WordPress

ALIASES
  $ lps hook remove

EXAMPLES
  $ lps hook rm hello

  $ lps hook remove hello --yes
```

## `lps hook rm FILENAME`

Remove one hook file (action, filter, cron) from WordPress

```
USAGE
  $ lps hook rm FILENAME [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  FILENAME  The hook file to remove, its slug without the .php extension (e.g. "hello" or "invoice-pdf/[order_id]")

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Remove one hook file (action, filter, cron) from WordPress

ALIASES
  $ lps hook remove

EXAMPLES
  $ lps hook rm hello

  $ lps hook remove hello --yes
```

_See code: [src/commands/hook/rm.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/hook/rm.ts)_

## `lps hook rollback [PATH]`

Restore hook files to a snapshot taken automatically before an earlier `lps hook push`

```
USAGE
  $ lps hook rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to hooks directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore hook files to a snapshot taken automatically before an earlier `lps hook push`

EXAMPLES
  $ lps hook rollback

  $ lps hook rollback --list

  $ lps hook rollback --to 1732000000000

  $ lps hook rollback --dry-run
```

_See code: [src/commands/hook/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/hook/rollback.ts)_

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

_See code: [src/commands/init.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/init.ts)_

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

_See code: [src/commands/login.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/login.ts)_

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

_See code: [src/commands/logout.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/logout.ts)_

## `lps menu diff [PATH]`

Show what differs in nav menus and the active theme menu locations between your local files and a WordPress environment, or between two environments

```
USAGE
  $ lps menu diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to menus directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in nav menus and the active theme menu locations between your local files and a WordPress
  environment, or between two environments

EXAMPLES
  $ lps menu diff

  $ lps menu diff --env staging

  $ lps menu diff --env staging --against production
```

_See code: [src/commands/menu/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/menu/diff.ts)_

## `lps menu list`

List nav menus and the active theme menu locations on WordPress

```
USAGE
  $ lps menu list [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List nav menus and the active theme menu locations on WordPress

EXAMPLES
  $ lps menu list
```

_See code: [src/commands/menu/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/menu/list.ts)_

## `lps menu pull [PATH]`

Pull nav menus and the active theme menu locations from WordPress

```
USAGE
  $ lps menu pull [PATH] [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  [PATH]  Path to menus directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull nav menus and the active theme menu locations from WordPress

EXAMPLES
  $ lps menu pull
```

_See code: [src/commands/menu/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/menu/pull.ts)_

## `lps menu push [PATH]`

Push local nav menus and the active theme menu locations to WordPress. Each menu's post_type/taxonomy items are resolved by slug on the target environment, never by a raw id; an item whose target does not exist there fails the whole menu rather than guessing.

```
USAGE
  $ lps menu push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y]

ARGUMENTS
  [PATH]  Path to menus directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push local nav menus and the active theme menu locations to WordPress. Each menu's post_type/taxonomy items are
  resolved by slug on the target environment, never by a raw id; an item whose target does not exist there fails the
  whole menu rather than guessing.

EXAMPLES
  $ lps menu push
```

_See code: [src/commands/menu/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/menu/push.ts)_

## `lps menu rollback [PATH]`

Restore nav menus and menu locations to a snapshot taken automatically before an earlier `lps menu push`

```
USAGE
  $ lps menu rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to menus directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore nav menus and menu locations to a snapshot taken automatically before an earlier `lps menu push`

EXAMPLES
  $ lps menu rollback

  $ lps menu rollback --list

  $ lps menu rollback --to 1732000000000

  $ lps menu rollback --dry-run
```

_See code: [src/commands/menu/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/menu/rollback.ts)_

## `lps meta diff [PATH]`

Show what differs in post meta keys between your local meta/ files and a WordPress environment, or between two environments

```
USAGE
  $ lps meta diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to meta directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in post meta keys between your local meta/ files and a WordPress environment, or between two
  environments

EXAMPLES
  $ lps meta diff

  $ lps meta diff --env staging

  $ lps meta diff --env staging --against production
```

_See code: [src/commands/meta/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/meta/diff.ts)_

## `lps meta list`

List the meta keys registered for each post type on WordPress (with register_post_meta()), and whether Loopress declares them. Only Loopress ones are pulled and pushed.

```
USAGE
  $ lps meta list [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List the meta keys registered for each post type on WordPress (with register_post_meta()), and whether Loopress
  declares them. Only Loopress ones are pulled and pushed.

EXAMPLES
  $ lps meta list
```

_See code: [src/commands/meta/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/meta/list.ts)_

## `lps meta pull [PATH]`

Pull the post meta keys Loopress manages on WordPress into meta/<post-type>.json files, never their values. Keys registered by a theme or another plugin are never pulled, see `lps meta list`.

```
USAGE
  $ lps meta pull [PATH] [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  [PATH]  Path to the meta directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull the post meta keys Loopress manages on WordPress into meta/<post-type>.json files, never their values. Keys
  registered by a theme or another plugin are never pulled, see `lps meta list`.

EXAMPLES
  $ lps meta pull
```

_See code: [src/commands/meta/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/meta/pull.ts)_

## `lps meta push [PATH]`

Push local post meta keys (meta/<post-type>.json, each key mapped to its register_post_meta() arguments) to WordPress. Create or update only, never deletes (use `lps meta rm`), never touches meta values.

```
USAGE
  $ lps meta push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y]

ARGUMENTS
  [PATH]  Path to the meta directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push local post meta keys (meta/<post-type>.json, each key mapped to its register_post_meta() arguments) to WordPress.
  Create or update only, never deletes (use `lps meta rm`), never touches meta values.

EXAMPLES
  $ lps meta push
```

_See code: [src/commands/meta/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/meta/push.ts)_

## `lps meta remove SLUG`

Stop registering the Loopress meta keys of one post type (its meta/<post-type>.json file) on WordPress. Their values are kept in the database.

```
USAGE
  $ lps meta remove SLUG [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  SLUG  The post meta slug, its meta/ file name without .json

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Stop registering the Loopress meta keys of one post type (its meta/<post-type>.json file) on WordPress. Their values
  are kept in the database.

ALIASES
  $ lps meta remove

EXAMPLES
  $ lps meta rm <slug>

  $ lps meta remove <slug> --yes
```

## `lps meta rm SLUG`

Stop registering the Loopress meta keys of one post type (its meta/<post-type>.json file) on WordPress. Their values are kept in the database.

```
USAGE
  $ lps meta rm SLUG [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  SLUG  The post meta slug, its meta/ file name without .json

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Stop registering the Loopress meta keys of one post type (its meta/<post-type>.json file) on WordPress. Their values
  are kept in the database.

ALIASES
  $ lps meta remove

EXAMPLES
  $ lps meta rm <slug>

  $ lps meta remove <slug> --yes
```

_See code: [src/commands/meta/rm.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/meta/rm.ts)_

## `lps meta rollback [PATH]`

Restore post meta keys to a snapshot taken automatically before an earlier `lps meta push`

```
USAGE
  $ lps meta rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to meta directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore post meta keys to a snapshot taken automatically before an earlier `lps meta push`

EXAMPLES
  $ lps meta rollback

  $ lps meta rollback --list

  $ lps meta rollback --to 1732000000000

  $ lps meta rollback --dry-run
```

_See code: [src/commands/meta/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/meta/rollback.ts)_

## `lps option add NAME`

Fetch a WordPress option by name and start tracking it locally. Run `lps option list` first to find the name: this copies a raw value across environments, verify it does not embed post/user IDs before pushing it elsewhere.

```
USAGE
  $ lps option add NAME [--json] [--env <value>] [-d] [--path <value>]

ARGUMENTS
  NAME  Option name to start tracking (see `lps option list`)

FLAGS
  -d, --dry-run       Show what would change without making changes
      --env=<value>   Target environment by name (default: "local", or the project's only environment)
      --path=<value>  Path to options directory (overrides project config)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Fetch a WordPress option by name and start tracking it locally. Run `lps option list` first to find the name: this
  copies a raw value across environments, verify it does not embed post/user IDs before pushing it elsewhere.

EXAMPLES
  $ lps option add wpseo_titles

  $ lps option add siteurl
```

_See code: [src/commands/option/add.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/option/add.ts)_

## `lps option diff [PATH]`

Show what differs, for locally tracked options, between your local files and a WordPress environment, or between two environments

```
USAGE
  $ lps option diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to options directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs, for locally tracked options, between your local files and a WordPress environment, or between two
  environments

EXAMPLES
  $ lps option diff

  $ lps option diff --env staging

  $ lps option diff --env staging --against production
```

_See code: [src/commands/option/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/option/diff.ts)_

## `lps option list`

List WordPress option names currently on the site (names and autoload only, never values). CORE flags a WordPress-native default (certain); SOURCE? is a best-effort guessed plugin slug, found by name or by scanning active plugins' own PHP source (uncertain unless confirmed, occasionally wrong or blank, never trust it over CORE); PLUGIN is that slug's own declared display name, a label only, no confidence of its own. Use this to find the name of the option you want, then `lps option add <name>` to track it.

```
USAGE
  $ lps option list [--json] [--env <value>] [--no-core]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)
  --no-core      Exclude WordPress-native default options and the CORE column from the output, including --json

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List WordPress option names currently on the site (names and autoload only, never values). CORE flags a
  WordPress-native default (certain); SOURCE? is a best-effort guessed plugin slug, found by name or by scanning active
  plugins' own PHP source (uncertain unless confirmed, occasionally wrong or blank, never trust it over CORE); PLUGIN is
  that slug's own declared display name, a label only, no confidence of its own. Use this to find the name of the option
  you want, then `lps option add <name>` to track it.

EXAMPLES
  $ lps option list

  $ lps option list --no-core
```

_See code: [src/commands/option/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/option/list.ts)_

## `lps option pull [PATH]`

Refresh locally tracked options from WordPress. Options not yet tracked are never pulled, run `lps option add <name>` for those first.

```
USAGE
  $ lps option pull [PATH] [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  [PATH]  Path to options directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Refresh locally tracked options from WordPress. Options not yet tracked are never pulled, run `lps option add <name>`
  for those first.

EXAMPLES
  $ lps option pull
```

_See code: [src/commands/option/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/option/pull.ts)_

## `lps option push [PATH]`

Push locally tracked, non-readonly options to WordPress (upsert only, never deletes an untracked option). Options marked "readonly": true in their local file are skipped, edit the file to override.

```
USAGE
  $ lps option push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y]

ARGUMENTS
  [PATH]  Path to options directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push locally tracked, non-readonly options to WordPress (upsert only, never deletes an untracked option). Options
  marked "readonly": true in their local file are skipped, edit the file to override.

EXAMPLES
  $ lps option push
```

_See code: [src/commands/option/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/option/push.ts)_

## `lps option remove NAME`

Stop tracking an option locally and delete it from WordPress. Local untracking always happens (git-reversible); pass --local-only to skip the WordPress delete and only stop tracking.

```
USAGE
  $ lps option remove NAME [--json] [--env <value>] [-d] [-y] [--local-only] [--path <value>]

ARGUMENTS
  NAME  Option name to stop tracking

FLAGS
  -d, --dry-run       Show what would change without making changes
  -y, --yes           Answer yes to confirmation prompts
      --env=<value>   Target environment by name (default: "local", or the project's only environment)
      --local-only    Untrack locally without deleting the option on WordPress
      --path=<value>  Path to options directory (overrides project config)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Stop tracking an option locally and delete it from WordPress. Local untracking always happens (git-reversible); pass
  --local-only to skip the WordPress delete and only stop tracking.

ALIASES
  $ lps option remove

EXAMPLES
  $ lps option rm wpseo_titles

  $ lps option rm wpseo_titles --local-only
```

## `lps option rm NAME`

Stop tracking an option locally and delete it from WordPress. Local untracking always happens (git-reversible); pass --local-only to skip the WordPress delete and only stop tracking.

```
USAGE
  $ lps option rm NAME [--json] [--env <value>] [-d] [-y] [--local-only] [--path <value>]

ARGUMENTS
  NAME  Option name to stop tracking

FLAGS
  -d, --dry-run       Show what would change without making changes
  -y, --yes           Answer yes to confirmation prompts
      --env=<value>   Target environment by name (default: "local", or the project's only environment)
      --local-only    Untrack locally without deleting the option on WordPress
      --path=<value>  Path to options directory (overrides project config)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Stop tracking an option locally and delete it from WordPress. Local untracking always happens (git-reversible); pass
  --local-only to skip the WordPress delete and only stop tracking.

ALIASES
  $ lps option remove

EXAMPLES
  $ lps option rm wpseo_titles

  $ lps option rm wpseo_titles --local-only
```

_See code: [src/commands/option/rm.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/option/rm.ts)_

## `lps option rollback [PATH]`

Restore tracked options to a snapshot taken automatically before an earlier `lps option push`

```
USAGE
  $ lps option rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to options directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore tracked options to a snapshot taken automatically before an earlier `lps option push`

EXAMPLES
  $ lps option rollback

  $ lps option rollback --list

  $ lps option rollback --to 1732000000000

  $ lps option rollback --dry-run
```

_See code: [src/commands/option/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/option/rollback.ts)_

## `lps page diff [PATH]`

Show what differs in static pages between your local files and a WordPress environment, or between two environments

```
USAGE
  $ lps page diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to pages directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in static pages between your local files and a WordPress environment, or between two environments

EXAMPLES
  $ lps page diff

  $ lps page diff --env staging

  $ lps page diff --env staging --against production
```

_See code: [src/commands/page/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/page/diff.ts)_

## `lps page list`

List the static pages managed by Loopress on WordPress

```
USAGE
  $ lps page list [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List the static pages managed by Loopress on WordPress

EXAMPLES
  $ lps page list
```

_See code: [src/commands/page/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/page/list.ts)_

## `lps page push [SLUG]`

Push local static HTML pages (pages/<slug>.html) to WordPress, or only one when a slug is given. The `status` header (draft or publish, draft by default) is applied on every push.

```
USAGE
  $ lps page push [SLUG] [--json] [--env <value>] [--overwrite] [-d] [-y]

ARGUMENTS
  [SLUG]  Push only this page (its file name without .html). Pushes every page when omitted.

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push local static HTML pages (pages/<slug>.html) to WordPress, or only one when a slug is given. The `status` header
  (draft or publish, draft by default) is applied on every push.

EXAMPLES
  $ lps page push

  $ lps page push legal-notice

  $ lps page push --dry-run

  $ lps page push about --overwrite
```

_See code: [src/commands/page/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/page/push.ts)_

## `lps page rollback [PATH]`

Restore static pages to a snapshot taken automatically before an earlier `lps page push`

```
USAGE
  $ lps page rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to pages directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore static pages to a snapshot taken automatically before an earlier `lps page push`

EXAMPLES
  $ lps page rollback

  $ lps page rollback --list

  $ lps page rollback --to 1732000000000

  $ lps page rollback --dry-run
```

_See code: [src/commands/page/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/page/rollback.ts)_

## `lps pattern diff [PATH]`

Show what differs in block patterns between your local patterns/ files and a WordPress environment, or between two environments

```
USAGE
  $ lps pattern diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to patterns directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in block patterns between your local patterns/ files and a WordPress environment, or between two
  environments

EXAMPLES
  $ lps pattern diff

  $ lps pattern diff --env staging

  $ lps pattern diff --env staging --against production
```

_See code: [src/commands/pattern/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/pattern/diff.ts)_

## `lps pattern list`

List the block patterns registered on WordPress by Loopress, the theme and plugins (not WordPress core). Only Loopress ones are pulled and pushed.

```
USAGE
  $ lps pattern list [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List the block patterns registered on WordPress by Loopress, the theme and plugins (not WordPress core). Only Loopress
  ones are pulled and pushed.

EXAMPLES
  $ lps pattern list
```

_See code: [src/commands/pattern/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/pattern/list.ts)_

## `lps pattern pull [PATH]`

Pull the block patterns Loopress manages on WordPress into patterns/<slug>.html files. Patterns registered by the theme or a plugin are never pulled, see `lps pattern list`.

```
USAGE
  $ lps pattern pull [PATH] [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  [PATH]  Path to the patterns directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull the block patterns Loopress manages on WordPress into patterns/<slug>.html files. Patterns registered by the
  theme or a plugin are never pulled, see `lps pattern list`.

EXAMPLES
  $ lps pattern pull
```

_See code: [src/commands/pattern/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/pattern/pull.ts)_

## `lps pattern push [PATH]`

Push local block patterns (patterns/<slug>.html, block markup under a title/categories header) to WordPress, registered as loopress/<slug> and referenced with <!-- wp:pattern {"slug":"loopress/<slug>"} /-->. Create or update only, never deletes a pattern (use `lps pattern rm`).

```
USAGE
  $ lps pattern push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y]

ARGUMENTS
  [PATH]  Path to the patterns directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push local block patterns (patterns/<slug>.html, block markup under a title/categories header) to WordPress,
  registered as loopress/<slug> and referenced with <!-- wp:pattern {"slug":"loopress/<slug>"} /-->. Create or update
  only, never deletes a pattern (use `lps pattern rm`).

EXAMPLES
  $ lps pattern push
```

_See code: [src/commands/pattern/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/pattern/push.ts)_

## `lps pattern remove SLUG`

Stop registering a Loopress block pattern on WordPress. A wp:pattern reference to it renders nothing until it is pushed again, copies already inserted in posts stay.

```
USAGE
  $ lps pattern remove SLUG [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  SLUG  The pattern slug, its patterns/ file name without .html

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Stop registering a Loopress block pattern on WordPress. A wp:pattern reference to it renders nothing until it is
  pushed again, copies already inserted in posts stay.

ALIASES
  $ lps pattern remove

EXAMPLES
  $ lps pattern rm <slug>

  $ lps pattern remove <slug> --yes
```

## `lps pattern rm SLUG`

Stop registering a Loopress block pattern on WordPress. A wp:pattern reference to it renders nothing until it is pushed again, copies already inserted in posts stay.

```
USAGE
  $ lps pattern rm SLUG [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  SLUG  The pattern slug, its patterns/ file name without .html

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Stop registering a Loopress block pattern on WordPress. A wp:pattern reference to it renders nothing until it is
  pushed again, copies already inserted in posts stay.

ALIASES
  $ lps pattern remove

EXAMPLES
  $ lps pattern rm <slug>

  $ lps pattern remove <slug> --yes
```

_See code: [src/commands/pattern/rm.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/pattern/rm.ts)_

## `lps pattern rollback [PATH]`

Restore block patterns to a snapshot taken automatically before an earlier `lps pattern push`

```
USAGE
  $ lps pattern rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to patterns directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore block patterns to a snapshot taken automatically before an earlier `lps pattern push`

EXAMPLES
  $ lps pattern rollback

  $ lps pattern rollback --list

  $ lps pattern rollback --to 1732000000000

  $ lps pattern rollback --dry-run
```

_See code: [src/commands/pattern/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/pattern/rollback.ts)_

## `lps plugin add SLUG`

Add a WordPress.org plugin to loopress.json

```
USAGE
  $ lps plugin add SLUG [--json] [--env <value>] [-d] [--version <value>]

ARGUMENTS
  SLUG  Plugin slug on WordPress.org

FLAGS
  -d, --dry-run          Show what would change without making changes
      --env=<value>      Target environment by name (default: "local", or the project's only environment)
      --version=<value>  Exact version to pin (default: "latest", tracked on every push)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Add a WordPress.org plugin to loopress.json

EXAMPLES
  $ lps plugin add woocommerce

  $ lps plugin add woocommerce --version 9.4.2

  $ lps plugin add contact-form-7 --dry-run
```

_See code: [src/commands/plugin/add.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/plugin/add.ts)_

## `lps plugin audit`

Check the plugins in loopress.json for known vulnerabilities (wpvulnerability.net) and health issues

```
USAGE
  $ lps plugin audit [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Check the plugins in loopress.json for known vulnerabilities (wpvulnerability.net) and health issues

EXAMPLES
  $ lps plugin audit
```

_See code: [src/commands/plugin/audit.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/plugin/audit.ts)_

## `lps plugin outdated`

Compare the plugins in loopress.json to the latest WordPress.org versions (exits 1 when one is behind or cannot be checked)

```
USAGE
  $ lps plugin outdated [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Compare the plugins in loopress.json to the latest WordPress.org versions (exits 1 when one is behind or cannot be
  checked)

EXAMPLES
  $ lps plugin outdated

  $ lps plugin outdated --json
```

_See code: [src/commands/plugin/outdated.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/plugin/outdated.ts)_

## `lps plugin pull`

Pull installed plugins from WordPress into loopress.json (or composer.json), pinned to their live versions. Plugins already tracked are refreshed; new ones are offered as a list to tick, so plugins that only belong on this environment (cache, security, backups) stay out of the project.

```
USAGE
  $ lps plugin pull [--json] [--env <value>] [-d] [-y] [--plugin <value>...]

FLAGS
  -d, --dry-run            Show what would change without making changes
  -y, --yes                Answer yes to confirmation prompts
      --env=<value>        Target environment by name (default: "local", or the project's only environment)
      --plugin=<value>...  Start tracking this installed plugin too, without asking (repeatable)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull installed plugins from WordPress into loopress.json (or composer.json), pinned to their live versions. Plugins
  already tracked are refreshed; new ones are offered as a list to tick, so plugins that only belong on this environment
  (cache, security, backups) stay out of the project.

EXAMPLES
  $ lps plugin pull

  $ lps plugin pull --env production --plugin query-monitor
```

_See code: [src/commands/plugin/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/plugin/pull.ts)_

## `lps plugin push`

Install WordPress.org plugins on WordPress to match loopress.json (active state included) or composer.json, via Composer + WPackagist

```
USAGE
  $ lps plugin push [--json] [--env <value>] [--overwrite] [-d] [-y] [--activate] [--force] [--prune]

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --activate     composer.json projects only: activate every plugin it declares. Without it, plugins keep their
                     current state and new ones stay inactive
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --force        Allow downgrades and let Loopress take over plugins installed outside it (replaces their files)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create
      --prune        Deactivate plugins that are active on the site but absent from loopress.json (or composer.json)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Install WordPress.org plugins on WordPress to match loopress.json (active state included) or composer.json, via
  Composer + WPackagist

EXAMPLES
  $ lps plugin push

  $ lps plugin push --dry-run

  $ lps plugin push --force --prune
```

_See code: [src/commands/plugin/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/plugin/push.ts)_

## `lps plugin rollback [PATH]`

Restore the plugins (versions and active state) to a snapshot taken automatically before an earlier `lps plugin push`. A plugin the push installed is uninstalled, one it uninstalled is reinstalled. A downgrade needs --force: it does not undo database migrations.

```
USAGE
  $ lps plugin rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>] [--force]

ARGUMENTS
  [PATH]  Path to project (unused) (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --force        Roll back even when it downgrades a package (database migrations are not undone)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore the plugins (versions and active state) to a snapshot taken automatically before an earlier `lps plugin push`.
  A plugin the push installed is uninstalled, one it uninstalled is reinstalled. A downgrade needs --force: it does not
  undo database migrations.

EXAMPLES
  $ lps plugin rollback

  $ lps plugin rollback --list

  $ lps plugin rollback --to 1732000000000

  $ lps plugin rollback --dry-run
```

_See code: [src/commands/plugin/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/plugin/rollback.ts)_

## `lps plugin status`

Compare the plugins on WordPress against loopress.json and report drift (missing, wrong version, inactive, untracked)

```
USAGE
  $ lps plugin status [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Compare the plugins on WordPress against loopress.json and report drift (missing, wrong version, inactive, untracked)

EXAMPLES
  $ lps plugin status
```

_See code: [src/commands/plugin/status.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/plugin/status.ts)_

## `lps plugin update [SLUG]`

Rewrite plugin versions in loopress.json to the latest WordPress.org releases (loopress.json only, run `lps plugin push` to apply)

```
USAGE
  $ lps plugin update [SLUG...] [--json] [--env <value>] [-d] [--minor | --patch]

ARGUMENTS
  [SLUG...]  Plugin slug(s) in loopress.json to update (default: all of them)

FLAGS
  -d, --dry-run      Show what would change without making changes
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --minor        Stay on the current major version (minor and patch releases only)
      --patch        Stay on the current minor version (patch releases only)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Rewrite plugin versions in loopress.json to the latest WordPress.org releases (loopress.json only, run `lps plugin
  push` to apply)

EXAMPLES
  $ lps plugin update

  $ lps plugin update woocommerce akismet

  $ lps plugin update --minor

  $ lps plugin update --patch --json
```

_See code: [src/commands/plugin/update.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/plugin/update.ts)_

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

_See code: [src/commands/project/config.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/project/config.ts)_

## `lps project export`

Print a config.json holding only the current project and one environment, to store as a CI secret (--env is required)

```
USAGE
  $ lps project export [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

DESCRIPTION
  Print a config.json holding only the current project and one environment, to store as a CI secret (--env is required)

EXAMPLES
  $ lps project export --env staging

  $ lps project export --env production | gh secret set LOOPRESS_CONFIG
```

_See code: [src/commands/project/export.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/project/export.ts)_

## `lps project import`

Import projects and environments from your Loopress account that are not configured locally yet

```
USAGE
  $ lps project import

DESCRIPTION
  Import projects and environments from your Loopress account that are not configured locally yet

EXAMPLES
  $ lps project import
```

_See code: [src/commands/project/import.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/project/import.ts)_

## `lps project link`

Create or link locally configured projects and environments on your Loopress account

```
USAGE
  $ lps project link [-y]

FLAGS
  -y, --yes  Answer yes to confirmation prompts

DESCRIPTION
  Create or link locally configured projects and environments on your Loopress account

EXAMPLES
  $ lps project link
```

_See code: [src/commands/project/link.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/project/link.ts)_

## `lps project list`

List configured WordPress projects

```
USAGE
  $ lps project list [--json]

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List configured WordPress projects

EXAMPLES
  $ lps project list
```

_See code: [src/commands/project/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/project/list.ts)_

## `lps project remove`

Remove one or more WordPress projects or environments

```
USAGE
  $ lps project remove

DESCRIPTION
  Remove one or more WordPress projects or environments

ALIASES
  $ lps project remove

EXAMPLES
  $ lps project rm
```

## `lps project rm`

Remove one or more WordPress projects or environments

```
USAGE
  $ lps project rm

DESCRIPTION
  Remove one or more WordPress projects or environments

ALIASES
  $ lps project remove

EXAMPLES
  $ lps project rm
```

_See code: [src/commands/project/rm.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/project/rm.ts)_

## `lps project rotate`

Rotate the WordPress application password for the current (or --env) environment

```
USAGE
  $ lps project rotate [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

DESCRIPTION
  Rotate the WordPress application password for the current (or --env) environment

EXAMPLES
  $ lps project rotate

  $ lps project rotate --env staging
```

_See code: [src/commands/project/rotate.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/project/rotate.ts)_

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

_See code: [src/commands/project/switch.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/project/switch.ts)_

## `lps promote FROM TO`

Copy every tracked resource from one environment to another by pulling from <from> then pushing to <to>. Local tracked files are overwritten with <from> in the process. With --dry-run, <from> is pulled into a throwaway copy of the project instead, and the push is only previewed.

```
USAGE
  $ lps promote FROM TO [--json] [-d] [-y] [--skip-unsupported] [--overwrite]

ARGUMENTS
  FROM  Environment to copy the configuration from
  TO    Environment to copy the configuration to

FLAGS
  -d, --dry-run           Show what would change without making changes
  -y, --yes               Answer yes to confirmation prompts
      --overwrite         Push even over changes made on the site outside Loopress since your last push. Pages: also
                          take over a same-slug page Loopress did not create
      --skip-unsupported  Skip the resources the project uses but this site can't hold (a missing plugin, a Full feature
                          on Light) instead of failing, and warn about each

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Copy every tracked resource from one environment to another by pulling from <from> then pushing to <to>. Local tracked
  files are overwritten with <from> in the process. With --dry-run, <from> is pulled into a throwaway copy of the
  project instead, and the push is only previewed.

EXAMPLES
  $ lps promote staging production

  $ lps promote production staging --dry-run

  $ lps promote staging production --skip-unsupported
```

_See code: [src/commands/promote.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/promote.ts)_

## `lps pull`

Pull every tracked resource from WordPress into local files in one run: composer dependencies, plugins, post types, taxonomies, post meta, roles, ACF, API routes, hooks, dynamic blocks, forms, patterns, Global Styles, menus, options, and snippets

```
USAGE
  $ lps pull [--json] [--env <value>] [-d] [-y] [--skip-unsupported]

FLAGS
  -d, --dry-run           Show what would change without making changes
  -y, --yes               Answer yes to confirmation prompts
      --env=<value>       Target environment by name (default: "local", or the project's only environment)
      --skip-unsupported  Skip the resources the project uses but this site can't hold (a missing plugin, a Full feature
                          on Light) instead of failing, and warn about each

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull every tracked resource from WordPress into local files in one run: composer dependencies, plugins, post types,
  taxonomies, post meta, roles, ACF, API routes, hooks, dynamic blocks, forms, patterns, Global Styles, menus, options,
  and snippets

EXAMPLES
  $ lps pull

  $ lps pull --env staging

  $ lps pull --dry-run
```

_See code: [src/commands/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/pull.ts)_

## `lps push`

Push every local resource to WordPress in one run: plugins, composer dependencies, post types, taxonomies, post meta, roles, ACF, API routes, hooks, dynamic blocks, forms, patterns, templates and parts, Global Styles, pages, menus, options, and snippets

```
USAGE
  $ lps push [--json] [--env <value>] [-d] [-y] [--only <value>...] [--skip <value>...]
    [--skip-unsupported] [--overwrite]

FLAGS
  -d, --dry-run           Show what would change without making changes
  -y, --yes               Answer yes to confirmation prompts
      --env=<value>       Target environment by name (default: "local", or the project's only environment)
      --only=<value>...   Only push these resources (comma-separated or repeated): plugin, composer, cpt, taxonomy,
                          meta, role, acf, api, hook, block, form, pattern, template, theme-style, page, menu, option,
                          snippet
      --overwrite         Push even over changes made on the site outside Loopress since your last push. Pages: also
                          take over a same-slug page Loopress did not create
      --skip=<value>...   Push every resource except these (comma-separated or repeated)
      --skip-unsupported  Skip the resources the project uses but this site can't hold (a missing plugin, a Full feature
                          on Light) instead of failing, and warn about each

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push every local resource to WordPress in one run: plugins, composer dependencies, post types, taxonomies, post meta,
  roles, ACF, API routes, hooks, dynamic blocks, forms, patterns, templates and parts, Global Styles, pages, menus,
  options, and snippets

EXAMPLES
  $ lps push

  $ lps push --env staging

  $ lps push --dry-run

  $ lps push --only acf,page

  $ lps push --skip plugin --skip composer
```

_See code: [src/commands/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/push.ts)_

## `lps role diff [PATH]`

Show what differs in roles between your local roles/ files and a WordPress environment, or between two environments

```
USAGE
  $ lps role diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to roles directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in roles between your local roles/ files and a WordPress environment, or between two environments

EXAMPLES
  $ lps role diff

  $ lps role diff --env staging

  $ lps role diff --env staging --against production
```

_See code: [src/commands/role/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/role/diff.ts)_

## `lps role list`

List the user roles on WordPress, where each comes from (Loopress, WordPress, a plugin) and how many users have it. Only Loopress ones are pulled and pushed.

```
USAGE
  $ lps role list [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List the user roles on WordPress, where each comes from (Loopress, WordPress, a plugin) and how many users have it.
  Only Loopress ones are pulled and pushed.

EXAMPLES
  $ lps role list
```

_See code: [src/commands/role/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/role/list.ts)_

## `lps role pull [PATH]`

Pull the roles Loopress manages on WordPress into roles/<slug>.json files. Built-in roles and roles created by a plugin are never pulled, see `lps role list`.

```
USAGE
  $ lps role pull [PATH] [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  [PATH]  Path to the roles directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull the roles Loopress manages on WordPress into roles/<slug>.json files. Built-in roles and roles created by a
  plugin are never pulled, see `lps role list`.

EXAMPLES
  $ lps role pull
```

_See code: [src/commands/role/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/role/pull.ts)_

## `lps role push [PATH]`

Push local roles (roles/<slug>.json, a "name" and its "capabilities") to WordPress. Create or update only, never deletes a role (use `lps role rm`), never changes which users have it.

```
USAGE
  $ lps role push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y]

ARGUMENTS
  [PATH]  Path to the roles directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push local roles (roles/<slug>.json, a "name" and its "capabilities") to WordPress. Create or update only, never
  deletes a role (use `lps role rm`), never changes which users have it.

EXAMPLES
  $ lps role push
```

_See code: [src/commands/role/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/role/push.ts)_

## `lps role remove SLUG`

Stop registering a Loopress role on WordPress. Its users keep it in their profile, with no capability until the role is pushed again.

```
USAGE
  $ lps role remove SLUG [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  SLUG  The role slug, its roles/ file name without .json

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Stop registering a Loopress role on WordPress. Its users keep it in their profile, with no capability until the role
  is pushed again.

ALIASES
  $ lps role remove

EXAMPLES
  $ lps role rm <slug>

  $ lps role remove <slug> --yes
```

## `lps role rm SLUG`

Stop registering a Loopress role on WordPress. Its users keep it in their profile, with no capability until the role is pushed again.

```
USAGE
  $ lps role rm SLUG [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  SLUG  The role slug, its roles/ file name without .json

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Stop registering a Loopress role on WordPress. Its users keep it in their profile, with no capability until the role
  is pushed again.

ALIASES
  $ lps role remove

EXAMPLES
  $ lps role rm <slug>

  $ lps role remove <slug> --yes
```

_See code: [src/commands/role/rm.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/role/rm.ts)_

## `lps role rollback [PATH]`

Restore roles to a snapshot taken automatically before an earlier `lps role push`

```
USAGE
  $ lps role rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to roles directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore roles to a snapshot taken automatically before an earlier `lps role push`

EXAMPLES
  $ lps role rollback

  $ lps role rollback --list

  $ lps role rollback --to 1732000000000

  $ lps role rollback --dry-run
```

_See code: [src/commands/role/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/role/rollback.ts)_

## `lps scf diff [PATH]`

Show what differs in ACF field groups, post types, taxonomies, and options pages between your local files and a WordPress environment, or between two environments

```
USAGE
  $ lps scf diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to ACF directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in ACF field groups, post types, taxonomies, and options pages between your local files and a
  WordPress environment, or between two environments

ALIASES
  $ lps scf diff

EXAMPLES
  $ lps acf diff

  $ lps acf diff --env staging

  $ lps acf diff --env staging --against production
```

## `lps scf list`

List ACF field groups, post types, taxonomies, and options pages currently on WordPress

```
USAGE
  $ lps scf list [--json] [--env <value>] [--type field-groups|post-types|taxonomies|options-pages...]

FLAGS
  --env=<value>       Target environment by name (default: "local", or the project's only environment)
  --type=<option>...  Limit to specific ACF object types
                      <options: field-groups|post-types|taxonomies|options-pages>

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List ACF field groups, post types, taxonomies, and options pages currently on WordPress

ALIASES
  $ lps scf list

EXAMPLES
  $ lps acf list

  $ lps acf list --type field-groups
```

## `lps scf pull [PATH]`

Pull ACF field groups, post types, taxonomies, and options pages from WordPress into local files

```
USAGE
  $ lps scf pull [PATH] [--json] [--env <value>] [-d] [-y] [--type
    field-groups|post-types|taxonomies|options-pages...]

ARGUMENTS
  [PATH]  Path to ACF directory (overrides project config)

FLAGS
  -d, --dry-run           Show what would change without making changes
  -y, --yes               Answer yes to confirmation prompts
      --env=<value>       Target environment by name (default: "local", or the project's only environment)
      --type=<option>...  Limit to specific ACF object types
                          <options: field-groups|post-types|taxonomies|options-pages>

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull ACF field groups, post types, taxonomies, and options pages from WordPress into local files

ALIASES
  $ lps scf pull

EXAMPLES
  $ lps acf pull

  $ lps acf pull --type field-groups
```

## `lps scf push [PATH]`

Push local ACF field groups, post types, taxonomies, and options pages to WordPress

```
USAGE
  $ lps scf push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y] [--type
    field-groups|post-types|taxonomies|options-pages...]

ARGUMENTS
  [PATH]  Path to ACF directory (overrides project config)

FLAGS
  -d, --dry-run           Show what would change without making changes
  -y, --yes               Answer yes to confirmation prompts
      --env=<value>       Target environment by name (default: "local", or the project's only environment)
      --overwrite         Push even over changes made on the site outside Loopress since your last push. Pages: also
                          take over a same-slug page Loopress did not create
      --type=<option>...  Limit to specific ACF object types
                          <options: field-groups|post-types|taxonomies|options-pages>

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push local ACF field groups, post types, taxonomies, and options pages to WordPress

ALIASES
  $ lps scf push

EXAMPLES
  $ lps acf push

  $ lps acf push --type field-groups
```

## `lps scf rollback [PATH]`

Restore ACF field groups, post types, taxonomies, and options pages to a snapshot taken automatically before an earlier `lps acf push`

```
USAGE
  $ lps scf rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to ACF directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore ACF field groups, post types, taxonomies, and options pages to a snapshot taken automatically before an
  earlier `lps acf push`

ALIASES
  $ lps scf rollback

EXAMPLES
  $ lps acf rollback

  $ lps acf rollback --list

  $ lps acf rollback --to 1732000000000

  $ lps acf rollback --dry-run
```

## `lps snippet diff [PATH]`

Show what differs in snippets between your local files and a WordPress environment, or between two environments

```
USAGE
  $ lps snippet diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to snippets directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in snippets between your local files and a WordPress environment, or between two environments

EXAMPLES
  $ lps snippet diff

  $ lps snippet diff --env staging

  $ lps snippet diff --env staging --against production
```

_See code: [src/commands/snippet/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/snippet/diff.ts)_

## `lps snippet list`

List snippets currently on WordPress

```
USAGE
  $ lps snippet list [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List snippets currently on WordPress

EXAMPLES
  $ lps snippet list
```

_See code: [src/commands/snippet/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/snippet/list.ts)_

## `lps snippet pull [PATH]`

Pull snippets from WordPress into local files

```
USAGE
  $ lps snippet pull [PATH] [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  [PATH]  Path to snippets directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull snippets from WordPress into local files

EXAMPLES
  $ lps snippet pull

  $ lps snippet pull ./snippets
```

_See code: [src/commands/snippet/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/snippet/pull.ts)_

## `lps snippet push [PATH]`

Push local snippet files to WordPress. Local snippet files created or updated remotely are renamed on disk to the `<id>-<slug>` convention.

```
USAGE
  $ lps snippet push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y] [--prune]

ARGUMENTS
  [PATH]  Path to snippets directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create
      --[no-]prune   Delete site snippets not present locally (default), --no-prune keeps them

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push local snippet files to WordPress. Local snippet files created or updated remotely are renamed on disk to the
  `<id>-<slug>` convention.

EXAMPLES
  $ lps snippet push

  $ lps snippet push ./snippets

  $ lps snippet push --no-prune
```

_See code: [src/commands/snippet/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/snippet/push.ts)_

## `lps snippet remove ID`

Remove one snippet from WordPress. Its local files are not touched: delete them too, or the next push creates the snippet again.

```
USAGE
  $ lps snippet remove ID [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  ID  The id of the snippet to remove (see `lps snippet list`)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Remove one snippet from WordPress. Its local files are not touched: delete them too, or the next push creates the
  snippet again.

ALIASES
  $ lps snippet remove

EXAMPLES
  $ lps snippet rm 12

  $ lps snippet remove 12 --yes
```

## `lps snippet rm ID`

Remove one snippet from WordPress. Its local files are not touched: delete them too, or the next push creates the snippet again.

```
USAGE
  $ lps snippet rm ID [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  ID  The id of the snippet to remove (see `lps snippet list`)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Remove one snippet from WordPress. Its local files are not touched: delete them too, or the next push creates the
  snippet again.

ALIASES
  $ lps snippet remove

EXAMPLES
  $ lps snippet rm 12

  $ lps snippet remove 12 --yes
```

_See code: [src/commands/snippet/rm.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/snippet/rm.ts)_

## `lps snippet rollback [PATH]`

Restore snippets to a snapshot taken automatically before an earlier `lps snippet push`

```
USAGE
  $ lps snippet rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to snippets directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore snippets to a snapshot taken automatically before an earlier `lps snippet push`

EXAMPLES
  $ lps snippet rollback

  $ lps snippet rollback --list

  $ lps snippet rollback --to 1732000000000

  $ lps snippet rollback --dry-run
```

_See code: [src/commands/snippet/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/snippet/rollback.ts)_

## `lps status`

Show which WordPress project and environment commands will target

```
USAGE
  $ lps status [--json] [--env <value>]

FLAGS
  --env=<value>  Show what would be targeted with this environment, as other commands do with --env

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show which WordPress project and environment commands will target

EXAMPLES
  $ lps status

  $ lps status --env staging
```

_See code: [src/commands/status.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/status.ts)_

## `lps taxonomy diff [PATH]`

Show what differs in taxonomies between your local taxonomies/ files and a WordPress environment, or between two environments

```
USAGE
  $ lps taxonomy diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to taxonomies directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in taxonomies between your local taxonomies/ files and a WordPress environment, or between two
  environments

EXAMPLES
  $ lps taxonomy diff

  $ lps taxonomy diff --env staging

  $ lps taxonomy diff --env staging --against production
```

_See code: [src/commands/taxonomy/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/taxonomy/diff.ts)_

## `lps taxonomy list`

List the taxonomies registered on WordPress, where each comes from (Loopress, WordPress, ACF, CPT UI, a theme or plugin) and the post types it attaches to. Only Loopress ones are pulled and pushed.

```
USAGE
  $ lps taxonomy list [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List the taxonomies registered on WordPress, where each comes from (Loopress, WordPress, ACF, CPT UI, a theme or
  plugin) and the post types it attaches to. Only Loopress ones are pulled and pushed.

EXAMPLES
  $ lps taxonomy list
```

_See code: [src/commands/taxonomy/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/taxonomy/list.ts)_

## `lps taxonomy pull [PATH]`

Pull the taxonomies Loopress manages on WordPress into taxonomies/<slug>.json files, never their terms. Taxonomies registered by a theme or another plugin are never pulled, see `lps taxonomy list`.

```
USAGE
  $ lps taxonomy pull [PATH] [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  [PATH]  Path to the taxonomies directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull the taxonomies Loopress manages on WordPress into taxonomies/<slug>.json files, never their terms. Taxonomies
  registered by a theme or another plugin are never pulled, see `lps taxonomy list`.

EXAMPLES
  $ lps taxonomy pull
```

_See code: [src/commands/taxonomy/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/taxonomy/pull.ts)_

## `lps taxonomy push [PATH]`

Push local taxonomies (taxonomies/<slug>.json, register_taxonomy() arguments plus "object_type") to WordPress. Create or update only, never deletes a taxonomy (use `lps taxonomy rm`), never touches its terms.

```
USAGE
  $ lps taxonomy push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y]

ARGUMENTS
  [PATH]  Path to the taxonomies directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push local taxonomies (taxonomies/<slug>.json, register_taxonomy() arguments plus "object_type") to WordPress. Create
  or update only, never deletes a taxonomy (use `lps taxonomy rm`), never touches its terms.

EXAMPLES
  $ lps taxonomy push
```

_See code: [src/commands/taxonomy/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/taxonomy/push.ts)_

## `lps taxonomy remove SLUG`

Stop registering a Loopress taxonomy on WordPress. Its terms are kept in the database, hidden until the taxonomy is pushed again.

```
USAGE
  $ lps taxonomy remove SLUG [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  SLUG  The taxonomy slug, its taxonomies/ file name without .json

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Stop registering a Loopress taxonomy on WordPress. Its terms are kept in the database, hidden until the taxonomy is
  pushed again.

ALIASES
  $ lps taxonomy remove

EXAMPLES
  $ lps taxonomy rm <slug>

  $ lps taxonomy remove <slug> --yes
```

## `lps taxonomy rm SLUG`

Stop registering a Loopress taxonomy on WordPress. Its terms are kept in the database, hidden until the taxonomy is pushed again.

```
USAGE
  $ lps taxonomy rm SLUG [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  SLUG  The taxonomy slug, its taxonomies/ file name without .json

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Stop registering a Loopress taxonomy on WordPress. Its terms are kept in the database, hidden until the taxonomy is
  pushed again.

ALIASES
  $ lps taxonomy remove

EXAMPLES
  $ lps taxonomy rm <slug>

  $ lps taxonomy remove <slug> --yes
```

_See code: [src/commands/taxonomy/rm.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/taxonomy/rm.ts)_

## `lps taxonomy rollback [PATH]`

Restore taxonomies to a snapshot taken automatically before an earlier `lps taxonomy push`

```
USAGE
  $ lps taxonomy rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to taxonomies directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore taxonomies to a snapshot taken automatically before an earlier `lps taxonomy push`

EXAMPLES
  $ lps taxonomy rollback

  $ lps taxonomy rollback --list

  $ lps taxonomy rollback --to 1732000000000

  $ lps taxonomy rollback --dry-run
```

_See code: [src/commands/taxonomy/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/taxonomy/rollback.ts)_

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

_See code: [src/commands/telemetry/disable.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/telemetry/disable.ts)_

## `lps telemetry enable`

Opt in to error reporting to Sentry (off until you say yes)

```
USAGE
  $ lps telemetry enable

DESCRIPTION
  Opt in to error reporting to Sentry (off until you say yes)

EXAMPLES
  $ lps telemetry enable
```

_See code: [src/commands/telemetry/enable.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/telemetry/enable.ts)_

## `lps theme activate [STYLESHEET]`

Activate a theme on WordPress, the Loopress child theme by default. A child theme without settings of its own starts from a copy of its parent's theme mods and Global Styles. Set "activateChildTheme": true in loopress.json to have `lps theme template push` keep the child active.

```
USAGE
  $ lps theme activate [STYLESHEET] [--json] [--env <value>] [-d] [-y]

ARGUMENTS
  [STYLESHEET]  Theme to activate (default: the Loopress child theme, <parent>-loopress)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Activate a theme on WordPress, the Loopress child theme by default. A child theme without settings of its own starts
  from a copy of its parent's theme mods and Global Styles. Set "activateChildTheme": true in loopress.json to have `lps
  theme template push` keep the child active.

EXAMPLES
  $ lps theme activate

  $ lps theme activate twentytwentyfive --env staging

  $ lps theme activate --dry-run
```

_See code: [src/commands/theme/activate.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/activate.ts)_

## `lps theme add SLUG`

Add a WordPress.org theme to loopress.json

```
USAGE
  $ lps theme add SLUG [--json] [--env <value>] [-d] [--version <value>]

ARGUMENTS
  SLUG  Theme slug on WordPress.org

FLAGS
  -d, --dry-run          Show what would change without making changes
      --env=<value>      Target environment by name (default: "local", or the project's only environment)
      --version=<value>  Exact version to pin (default: "latest")

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Add a WordPress.org theme to loopress.json

EXAMPLES
  $ lps theme add generatepress

  $ lps theme add generatepress --version 3.4.0
```

_See code: [src/commands/theme/add.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/add.ts)_

## `lps theme pull`

Pull everything theme related from WordPress: theme versions into loopress.json, then Global Styles into a local file

```
USAGE
  $ lps theme pull [--json] [--env <value>] [-d]

FLAGS
  -d, --dry-run      Show what would change without making changes
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull everything theme related from WordPress: theme versions into loopress.json, then Global Styles into a local file

EXAMPLES
  $ lps theme pull

  $ lps theme pull --env staging

  $ lps theme pull --dry-run
```

_See code: [src/commands/theme/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/pull.ts)_

## `lps theme push`

Push everything theme related to WordPress: theme versions from loopress.json, then block templates and parts, then Global Styles. Switches the active theme only to the Loopress child, when loopress.json sets "activateChildTheme": true.

```
USAGE
  $ lps theme push [--json] [--env <value>] [-d] [-y] [--force]

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --force        Passed to `lps theme version push`

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push everything theme related to WordPress: theme versions from loopress.json, then block templates and parts, then
  Global Styles. Switches the active theme only to the Loopress child, when loopress.json sets "activateChildTheme":
  true.

EXAMPLES
  $ lps theme push

  $ lps theme push --env staging

  $ lps theme push --dry-run
```

_See code: [src/commands/theme/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/push.ts)_

## `lps theme status`

Compare the themes on WordPress against loopress.json and report version drift

```
USAGE
  $ lps theme status [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Compare the themes on WordPress against loopress.json and report version drift

EXAMPLES
  $ lps theme status
```

_See code: [src/commands/theme/status.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/status.ts)_

## `lps theme style diff [PATH]`

Show what differs in the active block theme's Global Styles (Site Editor > Styles) between your local file and a WordPress environment, or between two environments

```
USAGE
  $ lps theme style diff [PATH] [--json] [--env <value>] [--against <value>]

ARGUMENTS
  [PATH]  Path to theme styles directory (overrides project config)

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in the active block theme's Global Styles (Site Editor > Styles) between your local file and a
  WordPress environment, or between two environments

EXAMPLES
  $ lps theme style diff

  $ lps theme style diff --env staging

  $ lps theme style diff --env staging --against production
```

_See code: [src/commands/theme/style/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/style/diff.ts)_

## `lps theme style pull [PATH]`

Pull the active block theme's Global Styles customizations (Site Editor > Styles) from WordPress into a local file

```
USAGE
  $ lps theme style pull [PATH] [--json] [--env <value>] [-d]

ARGUMENTS
  [PATH]  Path to theme styles directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull the active block theme's Global Styles customizations (Site Editor > Styles) from WordPress into a local file

EXAMPLES
  $ lps theme style pull
```

_See code: [src/commands/theme/style/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/style/pull.ts)_

## `lps theme style push [PATH]`

Push the local Global Styles file to the active block theme's Site Editor > Styles on WordPress

```
USAGE
  $ lps theme style push [PATH] [--json] [--env <value>] [--overwrite] [-d] [-y]

ARGUMENTS
  [PATH]  Path to theme styles directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push the local Global Styles file to the active block theme's Site Editor > Styles on WordPress

EXAMPLES
  $ lps theme style push
```

_See code: [src/commands/theme/style/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/style/push.ts)_

## `lps theme style rollback [PATH]`

Restore the active theme's Global Styles to a snapshot taken automatically before an earlier `lps theme style push`

```
USAGE
  $ lps theme style rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to theme styles directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore the active theme's Global Styles to a snapshot taken automatically before an earlier `lps theme style push`

EXAMPLES
  $ lps theme style rollback

  $ lps theme style rollback --list

  $ lps theme style rollback --to 1732000000000

  $ lps theme style rollback --dry-run
```

_See code: [src/commands/theme/style/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/style/rollback.ts)_

## `lps theme template diff`

Show what differs in block templates and parts between your local files and a WordPress environment, or between two environments. Templates and parts edited in the Site Editor show up too.

```
USAGE
  $ lps theme template diff [--json] [--env <value>] [--against <value>]

FLAGS
  --against=<value>  Compare the primary environment against this second environment instead of against local files
  --env=<value>      Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show what differs in block templates and parts between your local files and a WordPress environment, or between two
  environments. Templates and parts edited in the Site Editor show up too.

EXAMPLES
  $ lps theme template diff

  $ lps theme template diff --env staging

  $ lps theme template diff --env staging --against production
```

_See code: [src/commands/theme/template/diff.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/template/diff.ts)_

## `lps theme template list`

Show the Loopress child theme of the active block theme: whether it is active, its templates and parts, and those edited in the Site Editor

```
USAGE
  $ lps theme template list [--json] [--env <value>]

FLAGS
  --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Show the Loopress child theme of the active block theme: whether it is active, its templates and parts, and those
  edited in the Site Editor

EXAMPLES
  $ lps theme template list
```

_See code: [src/commands/theme/template/list.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/template/list.ts)_

## `lps theme template push`

Push block templates (`theme/templates/<slug>.html`), template parts (`theme/parts/<slug>.html`) and the theme CSS (theme/css/style.css, `theme/blocks/<namespace>/<block>.css`, bundled with esbuild) as the files of a child theme of the active block theme, `<parent>-loopress`. The child mirrors the project: files removed locally are removed from it. It is activated only when loopress.json sets "activateChildTheme": true, see `lps theme activate`.

```
USAGE
  $ lps theme template push [--json] [--env <value>] [--overwrite] [-d] [-y]

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Push block templates (`theme/templates/<slug>.html`), template parts (`theme/parts/<slug>.html`) and the theme CSS
  (theme/css/style.css, `theme/blocks/<namespace>/<block>.css`, bundled with esbuild) as the files of a child theme of the
  active block theme, `<parent>-loopress`. The child mirrors the project: files removed locally are removed from it. It is
  activated only when loopress.json sets "activateChildTheme": true, see `lps theme activate`.

EXAMPLES
  $ lps theme template push

  $ lps theme template push --dry-run
```

_See code: [src/commands/theme/template/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/template/push.ts)_

## `lps theme template rollback [PATH]`

Restore the Loopress child theme (templates, parts and theme CSS) to a snapshot taken automatically before an earlier `lps theme template push`. Like the push, it mirrors the snapshot: a template or part the push added is removed.

```
USAGE
  $ lps theme template rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>]

ARGUMENTS
  [PATH]  Path to templates directory (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore the Loopress child theme (templates, parts and theme CSS) to a snapshot taken automatically before an earlier
  `lps theme template push`. Like the push, it mirrors the snapshot: a template or part the push added is removed.

EXAMPLES
  $ lps theme template rollback

  $ lps theme template rollback --list

  $ lps theme template rollback --to 1732000000000

  $ lps theme template rollback --dry-run
```

_See code: [src/commands/theme/template/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/template/rollback.ts)_

## `lps theme version pull`

Pull installed themes from WordPress into loopress.json, pinned to their live versions

```
USAGE
  $ lps theme version pull [--json] [--env <value>] [-d]

FLAGS
  -d, --dry-run      Show what would change without making changes
      --env=<value>  Target environment by name (default: "local", or the project's only environment)

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Pull installed themes from WordPress into loopress.json, pinned to their live versions

EXAMPLES
  $ lps theme version pull
```

_See code: [src/commands/theme/version/pull.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/version/pull.ts)_

## `lps theme version push`

Install WordPress.org themes on WordPress to match loopress.json, via Composer + WPackagist (versions only, never switches the active theme)

```
USAGE
  $ lps theme version push [--json] [--env <value>] [--overwrite] [-d] [-y] [--force]

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --force        Allow downgrades and take over themes installed outside Loopress
      --overwrite    Push even over changes made on the site outside Loopress since your last push. Pages: also take
                     over a same-slug page Loopress did not create

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Install WordPress.org themes on WordPress to match loopress.json, via Composer + WPackagist (versions only, never
  switches the active theme)

EXAMPLES
  $ lps theme version push

  $ lps theme version push --force
```

_See code: [src/commands/theme/version/push.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/version/push.ts)_

## `lps theme version rollback [PATH]`

Restore the WordPress.org theme versions to a snapshot taken automatically before an earlier `lps theme version push`. A theme the push installed is uninstalled, one it uninstalled is reinstalled. Never switches the active theme. A downgrade needs --force.

```
USAGE
  $ lps theme version rollback [PATH] [--json] [--env <value>] [-d] [-y] [--list] [--to <value>] [--force]

ARGUMENTS
  [PATH]  Path to project (unused) (overrides project config)

FLAGS
  -d, --dry-run      Show what would change without making changes
  -y, --yes          Answer yes to confirmation prompts
      --env=<value>  Target environment by name (default: "local", or the project's only environment)
      --force        Roll back even when it downgrades a package (database migrations are not undone)
      --list         List available snapshots instead of rolling back
      --to=<value>   Roll back to this snapshot id instead of the most recent one

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Restore the WordPress.org theme versions to a snapshot taken automatically before an earlier `lps theme version push`.
  A theme the push installed is uninstalled, one it uninstalled is reinstalled. Never switches the active theme. A
  downgrade needs --force.

EXAMPLES
  $ lps theme version rollback

  $ lps theme version rollback --list

  $ lps theme version rollback --to 1732000000000

  $ lps theme version rollback --dry-run
```

_See code: [src/commands/theme/version/rollback.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/theme/version/rollback.ts)_

## `lps validate`

Check local tracked files are well formed and push-ready, without contacting WordPress

```
USAGE
  $ lps validate [--json]

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Check local tracked files are well formed and push-ready, without contacting WordPress

EXAMPLES
  $ lps validate
```

_See code: [src/commands/validate.ts](https://github.com/loopress/loopress/blob/%40loopress%2Fcli%400.36.0/cli/src/commands/validate.ts)_
<!-- commandsstop -->
