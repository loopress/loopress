<?php

declare(strict_types=1);

namespace Loopress\Api\Infrastructure;

use Loopress\Infrastructure\AbstractFilesDirectory;

/**
 * wp-content/loopress/api/: where custom route files live on the filesystem. See
 * AbstractFilesDirectory for the mechanics; mirrors Dependencies\Infrastructure\
 * LoopressEnvironment's own wp-content/loopress/ directory.
 */
class ApiDirectory extends AbstractFilesDirectory
{
    public const SUBDIR = 'api';

    // Written by RouteLoader at the end of every loadAndRegister() pass (autoload: false,
    // it's only ever read from the plugin's own admin UI / the CLI, never on the hot path),
    // overwritten in full each time so a file that failed last boot and loads clean this time
    // drops off without any separate "resolved" state to track. Read by ApiFilesController::
    // list_files() to annotate the "API Routes" view with per-file load failures (see US-5 in
    // the plugin's "Extensions proposées (2e vague)" doc).
    public const LOAD_ERRORS_OPTION = 'loopress_api_load_errors';

    // Only the root index.php is the anti-listing guard; a nested one is a route file.
    protected function isIgnoredFile(string $relativePath): bool
    {
        return $relativePath === 'index.php';
    }

    // The route a slug resolves to, before RouteLoader turns each segment into a regex: a
    // trailing 'index' segment names its parent directory, so 'orders/index' and 'orders' are
    // the same route. Shared by RouteLoader (registration) and ApiFilesController (push-time
    // collision check) so both agree on what "the same route" means.
    public static function routeSlug(string $slug): string
    {
        return preg_replace('#/index$#', '', $slug) ?? $slug;
    }
}
