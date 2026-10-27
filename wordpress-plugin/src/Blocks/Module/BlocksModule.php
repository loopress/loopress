<?php

declare(strict_types=1);

namespace Loopress\Blocks\Module;

use Loopress\Blocks\Frontend\BlockLoader;
use Loopress\Blocks\RestApi\BlockFilesController;
use Loopress\Contract\Module;

final readonly class BlocksModule implements Module
{
    public function __construct(
        private BlockFilesController $controller,
        private BlockLoader $loader,
    ) {}

    public function boot(): void
    {
        add_filter('loopress_push_resources', static fn(array $resources): array => $resources + ['block:push' => ['label' => 'Dynamic blocks', 'routes' => ['/block-files']]]);

        add_action('rest_api_init', function (): void {
            $this->controller->register_routes();
        });

        add_filter('block_type_metadata', [$this->loader, 'filterMetadata']);
        add_filter('plugins_url', [$this->loader, 'filterAssetUrl'], 10, 3);
        add_action('init', [$this->loader, 'registerAll']);
    }
}
