<?php

declare(strict_types=1);

namespace Loopress\Update\Module;

use Loopress\Contract\Module;
use Loopress\Update\Infrastructure\GithubReleaseChecker;
use Loopress\Update\Infrastructure\PluginUpdater;
use Loopress\Update\RestApi\UpdateController;

/**
 * The Loopress Full update flow: a read-only version check exposed over REST and rendered
 * by the admin React app as an early heads-up, plus PluginUpdater wiring the same check
 * into WordPress's native Plugins-page update UI, where the actual download and install
 * happens.
 */
class UpdateCheckModule implements Module
{
    public function __construct(
        private readonly GithubReleaseChecker $checker,
        private readonly PluginUpdater $updater,
    ) {
    }

    public function boot(): void
    {
        add_action('rest_api_init', fn() => (new UpdateController($this->checker))->register_routes());
        $this->updater->register();
    }
}
