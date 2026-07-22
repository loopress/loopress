<?php

declare(strict_types=1);

namespace Loopress\Snippets;

use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\Snippets\Module\SnippetModule;
use Loopress\Snippets\Service\CodeSnippetsSnippetProvider;
use Loopress\Snippets\Service\SnippetMigrationService;
use Loopress\Snippets\Service\SnippetService;
use Loopress\Snippets\Service\WPCodeSnippetProvider;
use Psr\Container\ContainerInterface;

use function DI\autowire;
use function DI\factory;
use function DI\get;

/**
 * Entry point of the snippet sync feature (Code Snippets / WPCode). Everything under
 * src/Snippets/ ships only in the Loopress Full edition (see scripts/build-flavor.cjs); the
 * plugin entry file calls this inside its build markers, so the Loopress Light artifact
 * never references this namespace. wordpress.org rejected Loopress Light over this exact
 * capability (remote deployment of arbitrary PHP/JS/CSS into Code Snippets or WPCode), so
 * Light must never carry it, even inactive.
 */
class Feature implements FeatureProvider
{
    private const MIGRATION_WPCODE_TO_CODE_SNIPPETS = 'loopress.snippets.migration.wpcode_to_code_snippets';
    private const MIGRATION_CODE_SNIPPETS_TO_WPCODE  = 'loopress.snippets.migration.code_snippets_to_wpcode';

    /** @return array<string, mixed> */
    public static function definitions(): array
    {
        return [
            // SnippetService takes a variadic list of providers: autowiring can't guess how
            // many to pass, so the two supported providers are wired explicitly here.
            SnippetService::class => factory(static fn(ContainerInterface $c): SnippetService => new SnippetService(
                $c->get(WPCodeSnippetProvider::class),
                $c->get(CodeSnippetsSnippetProvider::class),
            )),

            // Both migration directions need the same two concrete provider types in a
            // different source/destination order: autowiring SnippetMigrationService by type
            // alone is ambiguous, so each direction is its own named, explicitly-wired entry,
            // built directly rather than autowired.
            self::MIGRATION_WPCODE_TO_CODE_SNIPPETS => factory(static fn(ContainerInterface $c): SnippetMigrationService => new SnippetMigrationService(
                $c->get(WPCodeSnippetProvider::class),
                $c->get(CodeSnippetsSnippetProvider::class),
            )),
            self::MIGRATION_CODE_SNIPPETS_TO_WPCODE => factory(static fn(ContainerInterface $c): SnippetMigrationService => new SnippetMigrationService(
                $c->get(CodeSnippetsSnippetProvider::class),
                $c->get(WPCodeSnippetProvider::class),
            )),

            SnippetModule::class => autowire()
                ->constructorParameter('wpCodeToCodeSnippets', get(self::MIGRATION_WPCODE_TO_CODE_SNIPPETS))
                ->constructorParameter('codeSnippetsToWpCode', get(self::MIGRATION_CODE_SNIPPETS_TO_WPCODE)),
        ];
    }

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array
    {
        return [SnippetModule::class];
    }
}
