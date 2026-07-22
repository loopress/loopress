<?php

declare(strict_types=1);

namespace Loopress\Snippets\Module;

use Loopress\Contract\Module;
use Loopress\Snippets\RestApi\SnippetController;
use Loopress\Snippets\RestApi\SnippetMigrationController;
use Loopress\Snippets\Service\CodeSnippetsSnippetProvider;
use Loopress\Snippets\Service\SnippetMigrationService;
use Loopress\Snippets\Service\SnippetService;
use Loopress\Snippets\Service\WPCodeSnippetProvider;

class SnippetModule implements Module
{
    private SnippetService $service;
    private SnippetMigrationService $wpCodeToCodeSnippets;
    private SnippetMigrationService $codeSnippetsToWpCode;

    public function __construct()
    {
        $wpCode       = new WPCodeSnippetProvider();
        $codeSnippets = new CodeSnippetsSnippetProvider();

        $this->service              = new SnippetService($wpCode, $codeSnippets);
        $this->wpCodeToCodeSnippets = new SnippetMigrationService($wpCode, $codeSnippets);
        $this->codeSnippetsToWpCode = new SnippetMigrationService($codeSnippets, $wpCode);
    }

    public function boot(): void
    {
        add_action('rest_api_init', function () {
            (new SnippetController($this->service))->register_routes();
            (new SnippetMigrationController($this->wpCodeToCodeSnippets, $this->codeSnippetsToWpCode))->register_routes();
        });
    }
}
