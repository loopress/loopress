<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Capabilities;

use Brain\Monkey;
use Brain\Monkey\Filters;
use Brain\Monkey\Functions;
use Loopress\Acf\Service\AcfService;
use Loopress\Capabilities\RestApi\CapabilitiesController;
use Loopress\Form\Service\FormService;
use PHPUnit\Framework\TestCase;

class CapabilitiesControllerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        Functions\when('wp_get_environment_type')->justReturn('local');
        Functions\when('get_stylesheet')->justReturn('twentytwentyfive');
        Functions\when('get_template')->justReturn('twentytwentyfive');
        Functions\when('wp_is_block_theme')->justReturn(true);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    private function controller(bool $acf, bool $form): CapabilitiesController
    {
        $acfService = $this->createStub(AcfService::class);
        $acfService->method('isActive')->willReturn($acf);
        $formService = $this->createStub(FormService::class);
        $formService->method('isActive')->willReturn($form);

        return new CapabilitiesController($acfService, $formService);
    }

    public function test_reports_the_light_edition_its_integrations_and_the_active_theme(): void
    {
        $response = $this->controller(true, false)->get_capabilities();

        $this->assertSame(200, $response->status);
        $this->assertSame([
            'version'         => LOOPRESS_VERSION,
            'edition'         => 'light',
            'environmentType' => 'local',
            'integrations'    => ['acf' => true, 'form' => false],
            'theme'           => ['active' => 'twentytwentyfive', 'template' => 'twentytwentyfive', 'isBlock' => true],
        ], $response->get_data());
    }

    public function test_full_only_features_extend_it_through_the_filter(): void
    {
        Filters\expectApplied('loopress_capabilities')->once()->andReturnUsing(
            static fn(array $capabilities): array => array_merge($capabilities, ['edition' => 'full'])
        );

        $data = $this->controller(false, false)->get_capabilities()->get_data();

        $this->assertIsArray($data);
        $this->assertSame('full', $data['edition']);
    }
}
