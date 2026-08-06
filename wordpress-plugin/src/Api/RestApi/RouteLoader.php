<?php

declare(strict_types=1);

namespace Loopress\Api\RestApi;

use Loopress\Api\ApiNamespace;
use Loopress\Api\Infrastructure\ApiDirectory;
use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;

/**
 * Scans wp-content/loopress/api/*.php on rest_api_init, requires each file by convention
 * (kebab-case filename -> PascalCase class), and registers one WP REST route per file under
 * ApiNamespace::current() (loopress-api/v1 by default, not loopress/v1, to avoid colliding
 * with ApiFilesController's own management endpoint).
 */
class RouteLoader
{
    use RequiresManageOptionsCapability;

    /** @var array<string, string> method name => HTTP method */
    private const VERBS = ['get' => 'GET', 'post' => 'POST', 'put' => 'PUT', 'patch' => 'PATCH', 'delete' => 'DELETE'];

    /** @var array<string, object> route ("namespace/slug", no leading slash) => file instance, read by applyHeaders() */
    private array $headerInstances = [];

    public function __construct(private ApiDirectory $directory, private LoopressEnvironment $environment) {}

    public function loadAndRegister(): void
    {
        // Deliberate, not incidental: without this, a route file's `use` of the developer's
        // own Composer packages (installed via the separate Composer feature, delivered to
        // wp-content/loopress/vendor/) only happens to resolve today because the Dependencies
        // feature's ComposerModule is booted earlier in the same request for an unrelated
        // reason (its own diagnostics banner) and leaves the autoloader registered process-
        // wide. That's implementation-detail coupling, not a guarantee: Api owns requiring
        // its own dependency here instead of relying on another feature's side effect.
        $this->requireUserAutoload();

        foreach ($this->directory->listSlugs() as $slug) {
            $this->loadFile($slug);
        }

        // Single dispatch-level hook for every file's headers(), rather than one hook per
        // file: needed even for a plain response, but especially for the OPTIONS preflight
        // WP core answers automatically without ever invoking the file's own verb method.
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
        // permission() is now passed by reference, never called here: WP invokes it lazily
        // at dispatch, as permission_callback(WP_REST_Request): bool, the same way any
        // native WP REST permission_callback works. No more fabricate-a-callable
        // indirection, and no more is_callable() guard on its return value: a file's
        // permission() is always a valid callable reference once hasPublicMethod() confirms
        // it exists and is public, there's no malformed-shape failure mode left to guard.
        $permission = $this->hasPublicMethod($instance, 'permission')
            ? $this->wrapPermission([$instance, 'permission'])
            : $this->permissionCallback();

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
    // visibility, so both checks are required.
    public function hasPublicMethod(object $instance, string $method): bool
    {
        return method_exists($instance, $method) && (new \ReflectionMethod($instance, $method))->isPublic();
    }

    // permission() now runs at dispatch, not at registration inside loadFile()'s try/catch:
    // an uncaught throw here would fatal this one request rather than being caught while
    // skipping the route at boot. Same principle already applied to headers() in
    // applyHeaders() below: fail closed (deny) and log, rather than let WP see an uncaught
    // exception from a permission_callback.
    private function wrapPermission(callable $permission): callable
    {
        return function (WP_REST_Request $request) use ($permission) {
            try {
                return $permission($request);
            } catch (\Throwable $e) {
                $this->log('permission() threw: ' . $e->getMessage());
                return false;
            }
        };
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

        try {
            $headers = call_user_func([$instance, 'headers']);
        } catch (\Throwable $e) {
            // WP doesn't wrap filter callbacks in exception handling: an uncaught throw here
            // would break every request to this route, not just registration at boot like the
            // equivalent guard around permission() in loadFile().
            $this->log('headers() threw: ' . $e->getMessage());
            return $served;
        }

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

    private function requireUserAutoload(): void
    {
        $autoload = $this->environment->getAutoloadPath();
        if ($autoload === null) {
            return;
        }

        // Runs before the per-file loop below: a broken user vendor/ (missing dependency,
        // corrupted autoloader) must never fatal rest_api_init for the whole site, same
        // blast-radius principle as loadFile()'s own try/catch, but wider here since an
        // uncaught failure at this point would take down every route, not just this
        // developer's own api/ files.
        try {
            require_once $autoload;
        } catch (\Throwable $e) {
            $this->log('failed to load the user vendor autoloader: ' . $e->getMessage());
        }
    }

    private function loadFile(string $slug): void
    {
        $className = self::classNameFor($slug);

        // A collision (WP core, another plugin, another api/ file) must never fatal the
        // whole site's rest_api_init.
        if (class_exists($className, false)) {
            $this->log("skipping api/{$slug}.php: class {$className} is already declared");
            return;
        }

        try {
            require_once $this->directory->filePath($slug);
            $instance  = new $className();
            $endpoints = $this->endpointsFor($instance);
        } catch (\Throwable $e) {
            // Covers real parse errors too: since PHP 7, a compile error in a required file
            // throws \ParseError (a \Throwable), catchable here rather than fataling the
            // whole request the way an uncaught one would (same site-wide blast radius as the
            // write-time race condition in ApiDirectory::write(), different trigger). Also
            // covers a file that required cleanly but doesn't actually declare $className
            // (e.g. a typo, `new $className()` throws \Error): none of these may ever fatal
            // rest_api_init.
            $this->log("failed to load api/{$slug}.php: " . $e->getMessage());
            return;
        }

        if ($endpoints === []) {
            // Every other failure branch in this method already logs (collision above, parse
            // error above); this one didn't, so a typo'd verb method (Get() instead of get(),
            // or an accidentally-private one) failed in total silence, indistinguishable from
            // "this file intentionally has no routes yet."
            $this->log("api/{$slug}.php: no public HTTP verb method found (get/post/put/patch/delete) — route not registered");
            return;
        }

        $namespace = ApiNamespace::current();
        $route     = '/' . $slug;
        register_rest_route($namespace, $route, $endpoints);

        if ($this->hasPublicMethod($instance, 'headers')) {
            $this->headerInstances[$namespace . $route] = $instance;
        }
    }

    private function log(string $message): void
    {
        error_log('Loopress api/: ' . $message); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
    }
}
