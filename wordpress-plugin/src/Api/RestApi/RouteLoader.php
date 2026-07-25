<?php

declare(strict_types=1);

namespace Loopress\Api\RestApi;

use Loopress\Api\Infrastructure\ApiDirectory;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;

/**
 * Scans wp-content/loopress/api/*.php on rest_api_init, requires each file by convention
 * (kebab-case filename -> PascalCase class), and registers one WP REST route per file under
 * loopress-api/v1 (not loopress/v1, to avoid colliding with ApiFilesController's own
 * management endpoint). See obsidian/Product/Custom API Routes.md "Convention de fichier".
 */
class RouteLoader
{
    use RequiresManageOptionsCapability;

    public const NAMESPACE = 'loopress-api/v1';

    /** @var array<string, string> method name => HTTP method */
    private const VERBS = ['get' => 'GET', 'post' => 'POST', 'put' => 'PUT', 'patch' => 'PATCH', 'delete' => 'DELETE'];

    /** @var array<string, object> route ("namespace/slug", no leading slash) => file instance, read by applyHeaders() */
    private array $headerInstances = [];

    public function __construct(private ApiDirectory $directory) {}

    public function loadAndRegister(): void
    {
        foreach ($this->directory->listSlugs() as $slug) {
            $this->loadFile($slug);
        }

        // Single dispatch-level hook for every file's headers(), rather than one hook per
        // file: needed even for a plain response, but especially for the OPTIONS preflight
        // WP core answers automatically without ever invoking the file's own verb method
        // (see obsidian doc "CORS").
        add_filter('rest_pre_serve_request', [$this, 'applyHeaders'], 10, 3);
    }

    public static function classNameFor(string $slug): string
    {
        return str_replace('-', '', ucwords($slug, '-'));
    }

    /**
     * The register_rest_route() endpoint list for one file's instance: one entry per HTTP
     * verb the file publicly implements. Kept as pure logic (no WP calls) so it's testable
     * without stubbing register_rest_route().
     *
     * @return array<int, array{methods: string, callback: array{0: object, 1: string}, permission_callback: callable}>
     */
    public function endpointsFor(object $instance): array
    {
        $permission = $this->permissionCallback();
        if ($this->hasPublicMethod($instance, 'permission') && is_callable([$instance, 'permission'])) {
            // A file's permission() is untrusted input in shape, not just in behaviour: fall
            // back to the closed default rather than register a route with a non-callable
            // permission_callback if it's malformed.
            $override = call_user_func([$instance, 'permission']);
            if (is_callable($override)) {
                $permission = $override;
            }
        }

        $endpoints = [];
        foreach (self::VERBS as $method => $httpMethod) {
            if (!$this->hasPublicMethod($instance, $method)) {
                continue;
            }

            $endpoints[] = [
                'methods'             => $httpMethod,
                'callback'            => [$instance, $method],
                'permission_callback' => $permission,
            ];
        }

        return $endpoints;
    }

    // method_exists() alone returns true for private/protected methods too; a call from
    // outside the class (what register_rest_route's callback dispatch does) would fatal on
    // visibility, so both checks are required (see obsidian doc "Convention de fichier").
    public function hasPublicMethod(object $instance, string $method): bool
    {
        return method_exists($instance, $method) && (new \ReflectionMethod($instance, $method))->isPublic();
    }

    /**
     * Single dispatch-level hook applying each file's headers() declaration.
     *
     * @param mixed $result
     */
    public function applyHeaders(bool $served, $result, WP_REST_Request $request): bool
    {
        $instance = $this->headerInstances[ltrim($request->get_route(), '/')] ?? null;
        if ($instance === null) {
            return $served;
        }

        if (!is_callable([$instance, 'headers'])) {
            return $served;
        }

        $headers = call_user_func([$instance, 'headers']);
        if (!is_array($headers)) {
            return $served;
        }

        foreach ($headers as $name => $value) {
            if (!is_string($name) || !is_string($value)) {
                continue;
            }

            header("{$name}: {$value}"); // phpcs:ignore WordPress.Security.SafeRedirect -- not a redirect, standard WP CORS pattern (rest_send_cors_headers)
        }

        return $served;
    }

    private function loadFile(string $slug): void
    {
        $className = self::classNameFor($slug);

        // A collision (WP core, another plugin, another api/ file) must never fatal the
        // whole site's rest_api_init: see obsidian doc "Collision de nom de classe".
        if (class_exists($className, false)) {
            $this->log("skipping api/{$slug}.php: class {$className} is already declared");
            return;
        }

        try {
            require $this->directory->filePath($slug);
            $instance = new $className();
        } catch (\Throwable $e) {
            // Covers real parse errors too: since PHP 7, a compile error in a required file
            // throws \ParseError (a \Throwable), catchable here rather than fataling the
            // whole request the way an uncaught one would (see obsidian doc "Race condition
            // à l'écriture", same site-wide blast radius, different trigger). Also covers a
            // file that required cleanly but doesn't actually declare $className (e.g. a
            // typo): `new $className()` throws \Error, also a \Throwable.
            $this->log("failed to load api/{$slug}.php: " . $e->getMessage());
            return;
        }

        $endpoints = $this->endpointsFor($instance);
        if ($endpoints === []) {
            return;
        }

        $route = '/' . $slug;
        register_rest_route(self::NAMESPACE, $route, $endpoints);

        if ($this->hasPublicMethod($instance, 'headers')) {
            $this->headerInstances[self::NAMESPACE . $route] = $instance;
        }
    }

    private function log(string $message): void
    {
        error_log('Loopress api/: ' . $message); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
    }
}
