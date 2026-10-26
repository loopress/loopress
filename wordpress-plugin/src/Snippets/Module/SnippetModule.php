<?php

declare(strict_types=1);

namespace Loopress\Snippets\Module;

use Loopress\Contract\Module;
use Loopress\Infrastructure\Narrow;
use Loopress\Snippets\RestApi\SnippetController;
use Loopress\Snippets\Service\SnippetService;

final readonly class SnippetModule implements Module
{
    public function __construct(private SnippetService $service) {}

    public function boot(): void
    {
        // Push log entries reported by this feature's `lps` command (the shared Pushes module
        // reads them through this filter, never referenced from here by class).
        add_filter('loopress_push_resources', static fn(array $resources): array => $resources + ['snippet:push' => ['label' => 'Snippets', 'routes' => ['/snippets'], 'screens' => ['snippet', 'wpcode']]]);

        // Read by the shared Capabilities module through this filter, same reason as above.
        add_filter('loopress_capabilities', function (array $capabilities): array {
            $capabilities['integrations'] = ['snippets' => $this->service->isActive()] + Narrow::map($capabilities['integrations'] ?? null);

            return $capabilities;
        });

        add_action('rest_api_init', function (): void {
            (new SnippetController($this->service))->register_routes();
        });
    }
}
