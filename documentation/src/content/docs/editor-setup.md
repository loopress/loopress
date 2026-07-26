---
title: Editor Setup
description: Get WordPress autocomplete and static analysis in your project with WordPress stubs, without installing WordPress in your repo.
---

Your Loopress project holds plain PHP files, [route files](/api/routes/) in `api/` and [snippets](/snippets/) in `snippets/`, that call WordPress functions and classes: `get_option()`, `WP_REST_Request`, `sanitize_text_field()`. WordPress itself is not in the repo, so out of the box your editor flags all of them as undefined: no autocomplete, no signature help, and false errors on every line.

The fix is **WordPress stubs**: declaration-only versions of every WordPress function, class, and constant. They give your tooling the full WordPress API surface without installing or running WordPress. Pick the setup matching your editor below; they are independent, use one or combine them.

## VS Code with Intelephense

[Intelephense](https://marketplace.visualstudio.com/items?itemName=bmewburn.vscode-intelephense-client) ships WordPress stubs built in, they just aren't enabled by default. Add `"wordpress"` to the `intelephense.stubs` setting.

One gotcha: the setting **replaces** the default list instead of extending it, so you need the whole default list plus `"wordpress"`. Copy this into your project's `.vscode/settings.json`:

```json
{
  "intelephense.stubs": [
    "apache", "bcmath", "bz2", "calendar", "com_dotnet", "Core", "ctype", "curl",
    "date", "dba", "dom", "enchant", "exif", "FFI", "fileinfo", "filter", "fpm",
    "ftp", "gd", "gettext", "gmp", "hash", "iconv", "imap", "intl", "json",
    "ldap", "libxml", "mbstring", "meta", "mysqli", "oci8", "odbc", "openssl",
    "pcntl", "pcre", "PDO", "pdo_ibm", "pdo_mysql", "pdo_pgsql", "pdo_sqlite",
    "pgsql", "Phar", "posix", "pspell", "readline", "Reflection", "session",
    "shmop", "SimpleXML", "snmp", "soap", "sockets", "sodium", "SPL", "sqlite3",
    "standard", "superglobals", "sysvmsg", "sysvsem", "sysvshm", "tidy",
    "tokenizer", "xml", "xmlreader", "xmlrpc", "xmlwriter", "xsl", "Zend OPcache",
    "zip", "zlib",
    "wordpress"
  ]
}
```

Commit the file: everyone opening the project gets working WordPress completion with zero setup. This is the exact configuration the Loopress repositories themselves use.

## PhpStorm, or any editor via Composer

The [`php-stubs/wordpress-stubs`](https://github.com/php-stubs/wordpress-stubs) package provides the same declarations as a Composer dev dependency:

```bash
composer require --dev php-stubs/wordpress-stubs
```

PhpStorm indexes `vendor/` automatically, so WordPress symbols resolve as soon as the install finishes. The same goes for any editor whose PHP language server reads Composer's `vendor/` directory.

The stubs are declarations only, nothing in them executes, and as a dev dependency they never end up anywhere near your WordPress site.

:::note
This `composer.json` is your project's own tooling, unrelated to [Loopress's Composer feature](/composer/) which manages the dependencies installed on the WordPress site itself. Your `api/` route files can `use` packages from the latter, not from your local dev dependencies.
:::

## Static analysis with PHPStan

To go beyond autocomplete and actually type-check your route files, pair the stubs with [PHPStan](https://phpstan.org/) and the [`szepeviktor/phpstan-wordpress`](https://github.com/szepeviktor/phpstan-wordpress) extension, which teaches PHPStan WordPress-specific behavior on top of the raw declarations:

```bash
composer require --dev phpstan/phpstan szepeviktor/phpstan-wordpress php-stubs/wordpress-stubs
```

Then in `phpstan.neon`:

```yaml
includes:
    - vendor/szepeviktor/phpstan-wordpress/extension.neon

parameters:
    level: 6
    paths:
        - api
    bootstrapFiles:
        - vendor/php-stubs/wordpress-stubs/wordpress-stubs.php
```

```bash
vendor/bin/phpstan analyse
```

This catches a wrong argument type or a misspelled WordPress function before `lps api push` does, and it runs fine in CI since it needs no WordPress installation. The Loopress plugin itself is checked this way at level 9.

## Stubs for other plugins

The `php-stubs` organization publishes stubs for major plugins too, useful when your route files or snippets call their functions:

| Package | Covers |
|---------|--------|
| [`php-stubs/acf-pro-stubs`](https://github.com/php-stubs/acf-pro-stubs) | ACF functions like `get_field()` |
| [`php-stubs/woocommerce-stubs`](https://github.com/php-stubs/woocommerce-stubs) | WooCommerce classes and functions |

Install them the same way and, for PHPStan, add their stub file to `bootstrapFiles`.
