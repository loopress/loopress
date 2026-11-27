---
title: Safe by Default
description: What Loopress does when a hook, an API route or a cron job you pushed is wrong, and what it cannot catch.
edition: full
---

You will push a bug one day. This page lists what the Loopress plugin does with it, case by case, and where it stops. Each case names the plugin code that does it and the test that covers it, in the [`loopress/loopress`](https://github.com/loopress/loopress) repository.

## When your code is wrong

| Situation | What happens |
|---|---|
| [A PHP syntax error](#a-php-syntax-error) | Refused at push. Nothing is written. |
| [A hook that throws](#a-hook-that-throws) | Caught and logged, the other hooks keep running. |
| [A filter that throws](#a-filter-that-throws) | Returns the value it was given. |
| [A cron job that throws](#a-cron-job-that-throws) | Caught and logged, like a hook. |
| [A route handler that throws](#a-route-handler-that-throws) | A clean 500 for that request. |
| [A route you forgot to protect](#a-route-you-forgot-to-protect) | Administrators only, until you open it. |
| [What it can't catch](#what-it-cant-catch) | Fatal errors that are not exceptions. |

### A PHP syntax error

A hook or route file that does not parse is refused at push with a 400, and the error names the line. The check runs before the write, so nothing is written and the site keeps the previous version of the file.

The check uses PHP's own parser in-process (`token_get_all()` with `TOKEN_PARSE`), so it works on managed hosts that disable `exec`. Where `exec` and a `php` binary are available, `php -l` runs as well.

- Code: [`AbstractFilesController.php`](https://github.com/loopress/loopress/blob/main/wordpress-plugin/src/Infrastructure/AbstractFilesController.php), `checkSyntax()`
- Tests: `test_push_file_returns_400_when_content_has_invalid_php_syntax` in `tests/Unit/Hooks/RestApi/HookFilesControllerTest.php` and `tests/Unit/Api/RestApi/ApiFilesControllerTest.php` (both assert nothing is written), and the end-to-end specs `hook-push.spec.ts` and `api-routes-sync.spec.ts` ("rejects a ... file with invalid PHP syntax")

### A hook that throws

An `#[Action]` method that throws is caught: the exception goes to the PHP error log, and the other callbacks on that hook, and every other hook file, keep running. The last error each file threw is also kept on the site, so [`lps hook list`](/hooks/#lps-hook-list) and [`lps doctor`](/cli/doctor/) show it. Pushing a new version of the file clears it.

- Code: [`HookLoader.php`](https://github.com/loopress/loopress/blob/main/wordpress-plugin/src/Hooks/RestApi/HookLoader.php), `wrapActionCallback()` and `recordRuntimeError()`
- Tests: `test_bindingsFor_action_callback_catches_a_throw_and_does_not_propagate` and `test_a_throwing_callback_records_its_error_for_the_file_version_that_threw_it` in `tests/Unit/Hooks/RestApi/HookLoaderTest.php`, `test_list_files_reports_the_last_runtime_error_of_the_file_version_that_threw_it` in `tests/Unit/Hooks/RestApi/HookFilesControllerTest.php`

### A filter that throws

A `#[Filter]` method that throws returns the value it was given, unchanged, instead of `null`. A bug in a `the_content` filter leaves the post as it was, not blank.

- Code: `HookLoader.php`, `wrapFilterCallback()`
- Tests: `test_bindingsFor_filter_callback_returns_the_original_value_unchanged_on_a_throw` and `test_bindingsFor_filter_callback_falls_back_to_the_original_value_on_a_throw_even_with_zero_accepted_args` in `HookLoaderTest.php`

:::caution[Filters that restrict access fail open]
Returning the original value is right for `the_content`, wrong for a filter that denies something (`user_has_cap`, `rest_authentication_errors`, a checkout validation): the restriction is skipped. Catch errors yourself in those filters and return the restrictive answer, see [Hooks](/hooks/#action-and-filter).
:::

### A cron job that throws

A `#[Cron]` method that throws is caught and logged the same way as a hook, so one job's bug does not stop the other jobs WP-Cron runs in that pass. Its last error shows in `lps hook list` and `lps doctor` too.

- Code: `HookLoader.php`, `wrapCronCallback()`

### A route handler that throws

A route's `get()`, `post()` or other verb method that throws answers that request with a JSON `500` (`{"error": "Internal error"}`) and logs the message. The exception text is not sent to the caller, and the rest of the site and of its REST API is unaffected.

- Code: [`RouteLoader.php`](https://github.com/loopress/loopress/blob/main/wordpress-plugin/src/Api/RestApi/RouteLoader.php), `wrapVerbCallback()`
- Test: `test_endpointsFor_wraps_a_throwing_verb_callback_instead_of_fataling` in `tests/Unit/Api/RestApi/RouteLoaderTest.php`

### A route you forgot to protect

A route is closed by default: only a user with the `manage_options` capability (an administrator) can call it, until you mark it public with `#[Permission(public: true)]` or write its `permission()` method, see [Authentication and permissions](/api/routes/#authentication-and-permissions). A permission check that throws denies the request and logs the error.

- Code: `RouteLoader.php`, `resolvePermission()` (the `manage_options` default) and `wrapCallableMethod()` (a throw returns `false`)
- Tests: `test_endpointsFor_wraps_a_throwing_permission_to_fail_closed` and `test_endpointsFor_denies_the_pre_direct_callback_permission_convention_instead_of_granting_it` in `RouteLoaderTest.php`

## What it can't catch

Fatal errors that are not exceptions still stop the request: memory exhaustion, a timeout, or a method declared twice in a class. PHP's parser accepts that last one, so on a host where `php -l` cannot run it passes the push check, then stops every request that loads the file. These are not `Throwable`, so no `try`/`catch` in the plugin sees them.

Test on staging first, then ship what staging ran:

```bash
lps push --env staging
lps promote staging production
```

See [`lps promote`](/workflow/#lps-promote).

## When the site changed without you

The cases above are about your code. These are about the site changing under it:

- **A push stops on an outside edit.** It names any tracked item edited on the site since this machine last pulled or pushed, and writes nothing (in a terminal, it asks), unless you pass `--overwrite`. See [changes made outside Loopress](/concepts/#changes-made-outside-loopress).
- **A push to production asks first.** An environment of type `production` needs a confirmation at the terminal, or `--yes` in a recognized CI. `--yes` alone in a plain shell is refused.
- **A rollback checks for later edits.** Before restoring a snapshot, it compares the site with what that push left, shows the differences and asks before it goes on (`--yes` to go on anyway). See [Rollback](/rollback/).

## Related

- [Hooks](/hooks/)
- [Writing route files](/api/routes/), including [failure isolation](/api/routes/#failure-isolation)
- [Multi-environment workflow](/workflow/)
- [Rollback](/rollback/)
