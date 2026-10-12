<?php

declare(strict_types=1);

namespace Loopress\Content\Module;

use Loopress\Contract\Module;
use Loopress\Content\RestApi\ContentController;
use Loopress\Content\Service\ContentService;
use Loopress\Content\Service\RemoteUploads;

class ContentModule implements Module
{
    public function __construct(private readonly ContentService $service, private readonly RemoteUploads $uploads) {}

    public function boot(): void
    {
        add_action('rest_api_init', function (): void {
            (new ContentController($this->service))->register_routes();
        });

        add_filter('wp_get_attachment_url', [$this->uploads, 'attachmentUrl']);
        add_filter('wp_calculate_image_srcset', [$this->uploads, 'srcset']);
    }
}
