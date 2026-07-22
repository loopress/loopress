<?php

declare(strict_types=1);

namespace Loopress\Snippets\Module;

use Loopress\Contract\Module;
use Loopress\Snippets\RestApi\SnippetController;
use Loopress\Snippets\RestApi\SnippetMigrationController;
use Loopress\Snippets\Service\SnippetMigrationService;
use Loopress\Snippets\Service\SnippetService;

class SnippetModule implements Module
{
    public function __construct(
        private SnippetService $service,
        private SnippetMigrationService $wpCodeToCodeSnippets,
        private SnippetMigrationService $codeSnippetsToWpCode,
    ) {}

    public function boot(): void
    {
        add_action('rest_api_init', function () {
            (new SnippetController($this->service))->register_routes();
            (new SnippetMigrationController($this->wpCodeToCodeSnippets, $this->codeSnippetsToWpCode))->register_routes();
        });
    }
}
