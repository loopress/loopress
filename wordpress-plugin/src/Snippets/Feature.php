<?php

declare(strict_types=1);

namespace Loopress\Snippets;

use Loopress\Contract\FeatureProvider;
use Loopress\Contract\Module;
use Loopress\Snippets\Infrastructure\CodeSnippetsSnippetProvider;
use Loopress\Snippets\Infrastructure\WPCodeSnippetProvider;
use Loopress\Snippets\Module\SnippetModule;
use Loopress\Snippets\Service\SnippetService;
use Psr\Container\ContainerInterface;

use function DI\factory;

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
        ];
    }

    /** @return array<int, class-string<Module>> */
    public static function moduleClasses(): array
    {
        return [SnippetModule::class];
    }
}
