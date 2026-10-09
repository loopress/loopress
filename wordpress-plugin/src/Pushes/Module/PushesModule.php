<?php

declare(strict_types=1);

namespace Loopress\Pushes\Module;

use Loopress\Contract\Module;
use Loopress\Pushes\PushLog;
use Loopress\Pushes\RestApi\PushesController;

class PushesModule implements Module
{
    public function __construct(
        private readonly PushesController $controller,
        private readonly PushLog $log,
    ) {}

    public function boot(): void
    {
        add_action('rest_api_init', [$this->controller, 'register_routes']);
        add_action('admin_notices', [$this, 'renderManagedNotice']);
    }

    // Warns, on the screen itself, that an edit made there is temporary: the next push from the
    // repository overwrites it. Only once the resource was actually pushed to this site, so a
    // site that never syncs, say, its menus never sees the warning on the Menus screen.
    public function renderManagedNotice(): void
    {
        $screen   = get_current_screen();
        $resource = $screen === null ? null : PushLog::resourceForScreen($screen->id);
        $push     = $resource === null ? null : $this->log->lastPush($resource);
        if ($resource === null || $push === null) {
            return;
        }

        $at = strtotime((string) $push['at']);
        printf(
            '<div class="notice notice-warning"><p><strong>Managed by Loopress.</strong> %s</p></div>',
            esc_html(sprintf(
                'Last pushed %s ago with "lps %s". Changes made here are overwritten by the next push: make them in your repository instead.',
                human_time_diff($at === false ? time() : $at),
                str_replace(':', ' ', $resource),
            )),
        );
    }
}
