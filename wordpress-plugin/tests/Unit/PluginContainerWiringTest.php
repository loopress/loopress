<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit;

use DI\Container;
use Loopress\ContainerFactory;
use Loopress\Snippets\Feature as SnippetsFeature;
use Loopress\Snippets\Infrastructure\CodeSnippetsSnippetProvider;
use Loopress\Snippets\Infrastructure\WPCodeSnippetProvider;
use Loopress\Snippets\Module\SnippetModule;
use Loopress\Snippets\Service\SnippetMigrationService;
use Loopress\Update\Feature as UpdateFeature;
use Loopress\Update\Module\UpdateCheckModule;
use PHPUnit\Framework\TestCase;
use ReflectionProperty;

/**
 * Covers the one genuinely risky part of the PHP-DI wiring introduced for the Plus
 * features: SnippetModule needs two SnippetMigrationService instances built from the same
 * two provider types in opposite source/destination order, which autowiring alone cannot
 * disambiguate (see Snippets\Feature::definitions()).
 */
class PluginContainerWiringTest extends TestCase
{
    private function buildContainer(): Container
    {
        return ContainerFactory::create(array_merge(
            UpdateFeature::definitions(),
            SnippetsFeature::definitions(),
        ));
    }

    public function test_update_module_class_resolves(): void
    {
        $container = $this->buildContainer();

        $this->assertInstanceOf(UpdateCheckModule::class, $container->get(UpdateCheckModule::class));
    }

    public function test_snippet_migration_services_wire_source_and_destination_in_the_right_order(): void
    {
        $container = $this->buildContainer();

        $wpCode       = $container->get(WPCodeSnippetProvider::class);
        $codeSnippets = $container->get(CodeSnippetsSnippetProvider::class);

        /** @var SnippetModule $module */
        $module = $container->get(SnippetModule::class);

        $wpCodeToCodeSnippets = (new ReflectionProperty(SnippetModule::class, 'wpCodeToCodeSnippets'))->getValue($module);
        $codeSnippetsToWpCode = (new ReflectionProperty(SnippetModule::class, 'codeSnippetsToWpCode'))->getValue($module);

        $this->assertSame($wpCode, $this->providerOf($wpCodeToCodeSnippets, 'source'));
        $this->assertSame($codeSnippets, $this->providerOf($wpCodeToCodeSnippets, 'destination'));
        $this->assertSame($codeSnippets, $this->providerOf($codeSnippetsToWpCode, 'source'));
        $this->assertSame($wpCode, $this->providerOf($codeSnippetsToWpCode, 'destination'));
    }

    private function providerOf(SnippetMigrationService $service, string $property): object
    {
        return (new ReflectionProperty(SnippetMigrationService::class, $property))->getValue($service);
    }
}
