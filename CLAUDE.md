# Loopress - Claude Instructions

## Worktrees

Create worktrees inside `.claude/worktrees/`. This folder must be listed in `.gitignore`.

## MCP server parity

The `mcp/` package wraps CLI commands as tool calls. When you add, remove, or change a CLI command (especially a `list`/`pull`/`push` under `cli/src/commands/`), check that `mcp/src/tools/` still matches: add the missing tool, update its inputs, and refresh the tool tables in `mcp/README.md` and `documentation/src/content/docs/cli/mcp.md`.

## WordPress plugin: run what CI runs before pushing

CI fails on things a quick local check misses, so a `wordpress-plugin` change runs the whole set, on the whole plugin, not only the touched directory: `composer check` (phpunit, phpstan, psalm, psalm taint analysis, phpcs, rector dry run, deptrac).
- phpcs *warnings* fail CI too, and `tests/` is checked like `src/`.
- A new REST controller or module goes into the existing suppression lists: `phpstan.neon` (the `get_json_params()` list) and `psalm.xml` (the `RestApi` directories, among others). Copy what the neighbouring modules do.
- An exception message with interpolation needs the `phpcs:disable WordPress.Security.EscapeOutput.ExceptionNotEscaped` pattern already used in `src/`.
- CI runs PHP 8.2 and WordPress Plugin Check: no function newer than the plugin's minimum WordPress version (e.g. `array_is_list` needs WP 6.5).

## Changesets

`@loopress/wordpress-plugin` is CalVer, `YYYY.minor.patch`: the first number is the year, then `minor` for a feature and `patch` for a fix, never `major`. `@loopress/cli` and `@loopress/mcp` (one fixed group) follow plain semver. `website` and `documentation` take no changeset.

## Compatibility

Breaking changes to a project's layout or `loopress.json` need no migration, fallback or deprecation path for now: change it and update the docs.

## Documentation

A change to a CLI command, a config option or a plugin behavior updates `documentation/src/content/docs/` in the same PR.

## SonarCloud

A Node script that builds a path from a CLI argument must test the raw argument with a regex or string equality right after reading it (`if (!/^(light|full)$/.test(arg)) exit`, see `wordpress-plugin/scripts/build-flavor.cjs`). An allowlist object lookup alone does not clear the finding.

## Writing style

Never use the em dash "—" in code or website content. Use a comma, a period, or rephrase the sentence instead.
