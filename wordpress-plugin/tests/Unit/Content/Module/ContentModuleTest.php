<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Content\Module;

use Brain\Monkey;
use Loopress\Content\Module\ContentModule;
use Loopress\Content\Service\ContentService;
use Loopress\Content\Service\RemoteUploads;
use PHPUnit\Framework\TestCase;

class ContentModuleTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_boot_registers_the_routes_and_serves_missing_uploads_from_the_source(): void
    {
        (new ContentModule(new ContentService(), new RemoteUploads()))->boot();

        $this->assertNotFalse(has_action('rest_api_init'));
        $this->assertNotFalse(has_filter('wp_get_attachment_url'));
        $this->assertNotFalse(has_filter('wp_calculate_image_srcset'));
    }
}
