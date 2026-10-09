<?php

declare(strict_types=1);

namespace Loopress\Snippets\Module;

use Loopress\Contract\Module;
use Loopress\Snippets\RestApi\SnippetController;
use Loopress\Snippets\Service\SnippetService;

class SnippetModule implements Module
{
    public function __construct(private readonly SnippetService $service) {}

    public function boot(): void
    {
        // Push log entries reported by this feature's `lps` command (the shared Pushes module
        // reads them through this filter, never referenced from here by class).
        add_filter('loopress_push_resources', static fn(array $resources): array => $resources + ['snippet:push' => ['label' => 'Snippets', 'routes' => ['/snippets'], 'screens' => ['snippet', 'wpcode']]]);

        add_action('rest_api_init', function (): void {
            (new SnippetController($this->service))->register_routes();
        });
    }
}
