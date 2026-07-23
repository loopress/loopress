<?php

declare(strict_types=1);

namespace Loopress\Snippets\RestApi;

use Loopress\RestApi\RequiresManageOptionsCapability;
use Loopress\Snippets\Contract\SnippetData;
use Loopress\Snippets\Exception\NoActiveSnippetPluginException;
use Loopress\Snippets\Service\SnippetMigrationService;
use WP_REST_Request;
use WP_REST_Response;

class SnippetMigrationController
{
    use RequiresManageOptionsCapability;

    public function __construct(
        private SnippetMigrationService $wpCodeToCodeSnippets,
        private SnippetMigrationService $codeSnippetsToWpCode,
    ) {}

    public function register_routes(): void
    {
        register_rest_route(
            'loopress/v1',
            '/snippets/migration/(?P<direction>wpcode-to-code-snippets|code-snippets-to-wpcode)',
            [
                [
                    'methods'             => 'GET',
                    'callback'            => [$this, 'get_migration_status'],
                    'permission_callback' => $this->permissionCallback(),
                ],
                [
                    'methods'             => 'POST',
                    'callback'            => [$this, 'migrate'],
                    'permission_callback' => $this->permissionCallback(),
                    'args'                => [
                        'ids' => $this->idsArg(),
                    ],
                ],
            ],
        );
    }

    public function get_migration_status(WP_REST_Request $request): WP_REST_Response
    {
        $service = $this->serviceFor((string) $request->get_param('direction'));

        return new WP_REST_Response([
            'sourceActive'      => $service->sourceActive(),
            'destinationActive' => $service->destinationActive(),
            'snippets'          => array_map(static fn(SnippetData $s): array => $s->toArray(), $service->getMigratableSnippets()),
        ], 200);
    }

    public function migrate(WP_REST_Request $request): WP_REST_Response
    {
        $service = $this->serviceFor((string) $request->get_param('direction'));

        if (!$service->isReady()) {
            return new WP_REST_Response(
                ['error' => 'Both a source and destination snippet plugin must be active to migrate.'],
                409,
            );
        }

        try {
            $ids     = array_map('intval', (array) $request->get_param('ids'));
            $results = $service->migrate($ids);
        } catch (NoActiveSnippetPluginException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 409);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        return new WP_REST_Response($results, 200);
    }

    private function serviceFor(string $direction): SnippetMigrationService
    {
        return $direction === 'code-snippets-to-wpcode' ? $this->codeSnippetsToWpCode : $this->wpCodeToCodeSnippets;
    }

    /** @return array<string, mixed> */
    private function idsArg(): array
    {
        return [
            'required'          => true,
            'type'              => 'array',
            'items'             => ['type' => 'integer'],
            'validate_callback' => fn($v): bool => is_array($v) && $v !== [] && array_reduce(
                $v,
                fn(bool $ok, $id): bool => $ok && is_numeric($id) && (int) $id > 0,
                true,
            ),
        ];
    }
}
