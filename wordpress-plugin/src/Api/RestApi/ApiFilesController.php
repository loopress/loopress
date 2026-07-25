<?php

declare(strict_types=1);

namespace Loopress\Api\RestApi;

use Loopress\Api\Infrastructure\ApiDirectory;
use Loopress\Api\Infrastructure\FileWriter;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

/**
 * Management endpoint used by `lps api push`/`pull`/`list`, distinct from the custom routes
 * a pushed file itself exposes (see RouteLoader, registered under loopress-api/v1 instead of
 * loopress/v1 to avoid a namespace collision).
 */
class ApiFilesController
{
    use RequiresManageOptionsCapability;

    // Matches FileWriter/RouteLoader's filename convention: lowercase kebab-case only, no
    // path traversal, extension is never taken from the client (see obsidian doc "Sécurité
    // de l'upload").
    private const FILENAME_PATTERN = '/^[a-z0-9-]+$/';

    public function __construct(private ApiDirectory $directory) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/api-files', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_files'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);

        register_rest_route('loopress/v1', '/api-files/(?P<filename>[a-z0-9-]+)', [
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'push_file'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => [
                    'filename' => [
                        'required'          => true,
                        'validate_callback' => static fn($value): bool => is_string($value) && preg_match(self::FILENAME_PATTERN, $value) === 1,
                    ],
                    'content' => [
                        'required' => true,
                        'type'     => 'string',
                    ],
                ],
            ],
        ]);
    }

    public function list_files(): WP_REST_Response
    {
        $files = [];
        foreach ($this->directory->listSlugs() as $slug) {
            $content = $this->directory->read($slug);
            if ($content === null) {
                continue;
            }

            $files[] = ['filename' => $slug, 'content' => FileWriter::stripGuard($content)];
        }

        return new WP_REST_Response($files, 200);
    }

    public function push_file(WP_REST_Request $request): WP_REST_Response
    {
        $filename = (string) $request->get_param('filename');
        $content  = (string) $request->get_param('content');

        try {
            $guarded = FileWriter::withGuard($content);
        } catch (\InvalidArgumentException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 400);
        }

        try {
            $this->directory->write($filename, $guarded);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        return new WP_REST_Response(['filename' => $filename], 200);
    }
}
