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

        $syntaxError = $this->checkSyntax($guarded);
        if ($syntaxError !== null) {
            return new WP_REST_Response(['error' => "File has invalid PHP syntax: {$syntaxError}"], 400);
        }

        try {
            $this->directory->write($filename, $guarded);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        return new WP_REST_Response(['filename' => $filename], 200);
    }

    // A file that fails to write was never going to work anyway, but one that writes fine
    // and only fails later, inside RouteLoader's own rest_api_init try/catch, gives the user
    // zero signal: `api push` reports success and `api list` shows the file as present (it
    // only checks the file exists), while the route silently 404s. Catching real syntax
    // errors here, at push time, is what lets the CLI actually tell the user something's
    // wrong instead of only the PHP error log. `php -l` (via the running interpreter, so it
    // matches the actual PHP version this site executes the file with) is the only reliable
    // way to check this without either executing the file's own class body or requiring a
    // full userland parser dependency; `exec()` is routinely disabled on managed hosts, so
    // this degrades to "can't verify" rather than blocking a push that might be perfectly
    // valid.
    private function checkSyntax(string $code): ?string
    {
        if (!function_exists('exec') || str_contains((string) ini_get('disable_functions'), 'exec')) {
            return null;
        }

        $tmpFile = tempnam(sys_get_temp_dir(), 'loopress-api-');
        if ($tmpFile === false) {
            return null;
        }

        file_put_contents($tmpFile, $code); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

        $output   = [];
        $exitCode = 0;
        exec(escapeshellarg(PHP_BINARY) . ' -l ' . escapeshellarg($tmpFile) . ' 2>&1', $output, $exitCode); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.system_calls_exec

        unlink($tmpFile); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink

        if ($exitCode === 0) {
            return null;
        }

        // First line is always "PHP Parse error: ..." or "PHP Fatal error: ...", the rest is
        // an "Errors parsing ..." footer that repeats the filename back, not useful to the user.
        return $output[0] ?? 'Unknown syntax error.';
    }
}
