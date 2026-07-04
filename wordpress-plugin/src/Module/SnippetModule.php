<?php

namespace Loopress\Module;

use Loopress\Contract\Module;
use Loopress\RestApi\SnippetController;
use Loopress\Service\CodeSnippetsSnippetProvider;
use Loopress\Service\SnippetService;
use Loopress\Service\WPCodeSnippetProvider;

class SnippetModule implements Module
{
    private SnippetService $service;

    public function __construct()
    {
        $this->service = new SnippetService(
            new WPCodeSnippetProvider(),
            new CodeSnippetsSnippetProvider(),
        );
    }

    public function boot(): void
    {
        add_action('rest_api_init', fn() => (new SnippetController($this->service))->register_routes());
    }
}
