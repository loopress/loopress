<?php

namespace Loopress\Module;

use Loopress\Contract\Module;
use Loopress\RestApi\SnippetController;
use Loopress\RestApi\SnippetMigrationController;
use Loopress\Service\CodeSnippetsSnippetProvider;
use Loopress\Service\SnippetMigrationService;
use Loopress\Service\SnippetService;
use Loopress\Service\WPCodeSnippetProvider;

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
