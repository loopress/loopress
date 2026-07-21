<?php

namespace Loopress\Update\Module;

use Loopress\Contract\Module;
use Loopress\Update\Infrastructure\GithubReleaseChecker;
use Loopress\Update\RestApi\UpdateController;

/**
 * KISS v1 of the Loopress Full update flow: a read-only version check exposed over REST
 * and rendered by the admin React app, no download or install yet.
 */
class UpdateCheckModule implements Module
{
    public function __construct(private readonly GithubReleaseChecker $checker)
    {
    }

    public function boot(): void
    {
        add_action('rest_api_init', fn() => (new UpdateController($this->checker))->register_routes());
    }
}
