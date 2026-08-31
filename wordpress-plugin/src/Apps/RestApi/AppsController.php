<?php

declare(strict_types=1);

namespace Loopress\Apps\RestApi;

use Loopress\Apps\Infrastructure\AppManifest;
use Loopress\Apps\Infrastructure\AppsDirectory;
use Loopress\Apps\Infrastructure\AppStore;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

/**
 * Management endpoint for `lps app list`/`pull`/`push`/`remove`.
 *
 * Push is three steps, on purpose: PUT one asset at a time (bounded request size, resumable,
 * only the files whose hash changed are sent), then one POST /commit that flips the
 * `loopress_apps` option so the front end starts serving the new build atomically. Assets
 * uploaded but never committed are inert (nothing reads them) and get cleaned up by the next
 * commit.
 */
class AppsController
{
    use RequiresManageOptionsCapability;

    // 8 MiB of decoded bytes per asset. A single bundle chunk above this is rare for a real
    // SPA (a search page is the common case, ~1-3 MB total); chunked upload is a planned
    // follow-up. Filterable so a host with headroom can raise it.
    private const DEFAULT_MAX_ASSET_BYTES = 8 * 1024 * 1024;

    private const NAME_ROUTE_PARAM = '(?P<name>[a-z0-9][a-z0-9-]*)';

    public function __construct(
        private AppsDirectory $directory,
        private AppStore $store,
    ) {}

    public function register_routes(): void
    {
        $this->directory->ensureExists();

        register_rest_route('loopress/v1', '/apps', [
            'methods'             => 'GET',
            'callback'            => [$this, 'list_apps'],
            'permission_callback' => $this->permissionCallback(),
        ]);

        register_rest_route('loopress/v1', '/apps/' . self::NAME_ROUTE_PARAM . '/manifest', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_manifest'],
            'permission_callback' => $this->permissionCallback(),
        ]);

        register_rest_route('loopress/v1', '/apps/' . self::NAME_ROUTE_PARAM . '/asset', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_asset'],
            'permission_callback' => $this->permissionCallback(),
            'args'                => ['path' => ['required' => true, 'type' => 'string']],
        ]);

        register_rest_route('loopress/v1', '/apps/' . self::NAME_ROUTE_PARAM . '/assets', [
            'methods'             => 'PUT',
            'callback'            => [$this, 'put_asset'],
            'permission_callback' => $this->permissionCallback(),
            'args'                => [
                'path'     => ['required' => true, 'type' => 'string'],
                'content'  => ['required' => true, 'type' => 'string'],
                'encoding' => ['required' => false, 'type' => 'string', 'default' => 'base64'],
            ],
        ]);

        register_rest_route('loopress/v1', '/apps/' . self::NAME_ROUTE_PARAM . '/commit', [
            'methods'             => 'POST',
            'callback'            => [$this, 'commit'],
            'permission_callback' => $this->permissionCallback(),
        ]);

        register_rest_route('loopress/v1', '/apps/' . self::NAME_ROUTE_PARAM, [
            'methods'             => 'DELETE',
            'callback'            => [$this, 'delete_app'],
            'permission_callback' => $this->permissionCallback(),
        ]);
    }

    public function list_apps(): WP_REST_Response
    {
        $records = $this->store->all();
        $apps    = [];
        foreach ($this->directory->listAppNames() as $name) {
            $record       = is_array($records[$name] ?? null) ? $records[$name] : [];
            $files        = is_array($record['files'] ?? null) ? $record['files'] : [];
            $apps[] = [
                'name'       => $name,
                'buildId'    => is_string($record['buildId'] ?? null) ? $record['buildId'] : null,
                'routing'    => is_string($record['routing'] ?? null) ? $record['routing'] : null,
                'deployedAt' => is_string($record['deployedAt'] ?? null) ? $record['deployedAt'] : null,
                'fileCount'  => count($files),
                'totalBytes' => array_sum(array_column($files, 'size')),
                'committed'  => $record !== [],
            ];
        }

        return new WP_REST_Response($apps, 200);
    }

    public function get_manifest(WP_REST_Request $request): WP_REST_Response
    {
        $name   = (string) $request->get_param('name');
        $record = $this->store->get($name);
        if ($record === null) {
            return new WP_REST_Response(['error' => "No committed build for app \"{$name}\""], 404);
        }

        return new WP_REST_Response([
            'name'          => $name,
            'buildId'       => $record['buildId'] ?? null,
            'routing'       => $record['routing'] ?? 'hash',
            'mountSelector' => $record['mountSelector'] ?? null,
            'entry'         => $record['entry'] ?? ['scripts' => [], 'styles' => []],
            'files'         => $record['files'] ?? [],
        ], 200);
    }

    public function get_asset(WP_REST_Request $request): WP_REST_Response
    {
        $name = (string) $request->get_param('name');
        $path = (string) $request->get_param('path');

        $contents = $this->directory->readAsset($name, $path);
        if ($contents === null) {
            return new WP_REST_Response(['error' => "Asset not found: {$name}/{$path}"], 404);
        }

        return new WP_REST_Response([
            'path'     => $path,
            'encoding' => 'base64',
            // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- transport encoding for a binary asset over JSON, not obfuscation.
            'content'  => base64_encode($contents),
        ], 200);
    }

    public function put_asset(WP_REST_Request $request): WP_REST_Response
    {
        $name = (string) $request->get_param('name');
        $path = (string) $request->get_param('path');

        if (!AppsDirectory::isValidAppName($name)) {
            return new WP_REST_Response(['error' => 'Invalid app name'], 400);
        }
        if (!AppsDirectory::isValidAssetPath($path)) {
            return new WP_REST_Response(['error' => "Unsafe or unsupported asset path: {$path}"], 400);
        }

        if (strtolower((string) $request->get_param('encoding')) !== 'base64') {
            return new WP_REST_Response(['error' => 'Only base64 encoding is supported'], 400);
        }

        // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- transport decoding for a binary asset sent over JSON, not obfuscation.
        $decoded = base64_decode((string) $request->get_param('content'), true);
        if ($decoded === false) {
            return new WP_REST_Response(['error' => 'content is not valid base64'], 400);
        }

        $max = (int) apply_filters('loopress_app_max_asset_bytes', self::DEFAULT_MAX_ASSET_BYTES);
        if (strlen($decoded) > $max) {
            return new WP_REST_Response([
                'error' => sprintf(
                    'Asset %s is %d bytes, over the %d byte per-file limit. Split the bundle or raise loopress_app_max_asset_bytes.',
                    $path,
                    strlen($decoded),
                    $max
                ),
            ], 413);
        }

        try {
            $this->directory->writeAsset($name, $path, $decoded);
        } catch (\RuntimeException | \InvalidArgumentException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 400);
        }

        return new WP_REST_Response(['path' => $path, 'size' => strlen($decoded)], 200);
    }

    public function commit(WP_REST_Request $request): WP_REST_Response
    {
        $name = (string) $request->get_param('name');
        if (!AppsDirectory::isValidAppName($name)) {
            return new WP_REST_Response(['error' => 'Invalid app name'], 400);
        }

        try {
            $manifest = AppManifest::normalize($request->get_json_params());
        } catch (\InvalidArgumentException $e) {
            return new WP_REST_Response(['error' => 'Invalid manifest: ' . $e->getMessage()], 400);
        }

        // Every declared file must already be on disk with the exact hash the manifest claims.
        $onDisk = $this->directory->listAssets($name);
        foreach ($manifest['files'] as $file) {
            $actual = $onDisk[$file['path']]['sha256'] ?? null;
            if ($actual !== $file['sha256']) {
                return new WP_REST_Response([
                    'error'   => $actual === null
                        ? "Asset not uploaded: {$file['path']}"
                        : "Asset hash mismatch, re-upload: {$file['path']}",
                    'code'    => 'incomplete_upload',
                ], 409);
            }
        }

        // N-1 grace: a lazy chunk referenced by the build we are replacing must keep resolving
        // for visitors who already loaded its index.html. Keep exactly the previous
        // generation's files, drop anything older.
        $previous  = $this->store->get($name);
        $keepPaths = array_column($manifest['files'], 'path');
        foreach ($this->previousPaths($previous) as $grandfathered) {
            $keepPaths[] = $grandfathered;
        }
        $removed = [];
        foreach (array_keys($onDisk) as $existing) {
            if (!in_array($existing, $keepPaths, true)) {
                $this->directory->removeAsset($name, $existing);
                $removed[] = $existing;
            }
        }

        $this->store->put($name, [
            'buildId'          => $manifest['buildId'],
            'routing'          => $manifest['routing'],
            'mountSelector'    => $manifest['mountSelector'],
            'entry'            => $manifest['entry'],
            'files'            => $manifest['files'],
            'previousManifest' => is_array($previous) && is_array($previous['files'] ?? null) ? $previous['files'] : [],
            'deployedAt'       => gmdate('c'),
        ]);

        return new WP_REST_Response([
            'name'      => $name,
            'buildId'   => $manifest['buildId'],
            'fileCount' => count($manifest['files']),
            'removed'   => $removed,
        ], 200);
    }

    public function delete_app(WP_REST_Request $request): WP_REST_Response
    {
        $name = (string) $request->get_param('name');

        if (!$this->directory->hasApp($name) && $this->store->get($name) === null) {
            return new WP_REST_Response(['error' => "Unknown app \"{$name}\""], 404);
        }

        $this->directory->deleteApp($name);
        $this->store->forget($name);

        return new WP_REST_Response(['name' => $name, 'deleted' => true], 200);
    }

    /**
     * @param array<string, mixed>|null $record
     * @return string[]
     */
    private function previousPaths(?array $record): array
    {
        if ($record === null) {
            return [];
        }
        $files = is_array($record['files'] ?? null) ? $record['files'] : [];

        return array_values(array_filter(array_column($files, 'path'), 'is_string'));
    }
}
