<?php

declare(strict_types=1);

namespace Loopress\Hooks\Infrastructure;

use Loopress\Infrastructure\AbstractFilesDirectory;

/**
 * wp-content/loopress/hooks/: where custom action/filter/cron files live on the filesystem.
 * See AbstractFilesDirectory for the mechanics; no bracketed dynamic-segment slugs here, a
 * hook name is never a URL path so there's nothing for a segment like '[order_id]' to mean.
 */
class HooksDirectory extends AbstractFilesDirectory
{
    public const SUBDIR = 'hooks';

    // Same reasoning as ApiDirectory::LOAD_ERRORS_OPTION: written by HookLoader at the end of
    // every loadAndRegister() pass, overwritten in full each time, read by HookFilesController
    // to annotate the CLI/admin view with per-file load failures.
    public const LOAD_ERRORS_OPTION = 'loopress_hooks_load_errors';
}
