<?php

declare(strict_types=1);

namespace Loopress\Api\RestApi;

use Loopress\Api\ApiNamespace;
use Loopress\Api\Attribute\Permission;
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

    /** Matches a single dynamic path segment, e.g. '[order_id]' capturing 'order_id'. */
    private const DYNAMIC_SEGMENT_PATTERN = '/^\[(\w+)\]$/';

    public function __construct(private ApiDirectory $directory, private LoopressEnvironment $environment) {}

    public function loadAndRegister(): void
    {
        // Repairs the anti-listing index.php regardless of how api/*.php files actually got
        // onto the filesystem: ApiDirectory::ensureExists() previously only ran from
        // ApiFilesController::push_file(), so a Git-based deployment (rsync, a deploy hook)
        // that never called lps api push never got this file at all.
        $this->directory->ensureExists();

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

    // Each segment PascalCased and concatenated: 'invoice-pdf/[order_id]' -> 'InvoicePdfOrderId'.
    // The folder prefix in the name is what keeps a dynamic segment name from colliding across
    // different folders (e.g. orders/[id] and items/[id] don't produce the same class name).
    public static function classNameFor(string $slug): string
    {
        $className = '';
        foreach (explode('/', $slug) as $segment) {
            $segment    = preg_replace(self::DYNAMIC_SEGMENT_PATTERN, '$1', $segment) ?? $segment;
            $className .= str_replace(['-', '_'], '', ucwords($segment, '-_'));
        }

        return $className;
    }

    // A literal segment is escaped so it matches itself; a dynamic one becomes a named capture
    // group WP_REST_Server matches against the resolved request path, exactly like the regex
    // routes Loopress's own management endpoints already use (see ApiFilesController).
    private static function segmentToRegex(string $segment): string
    {
        if (preg_match(self::DYNAMIC_SEGMENT_PATTERN, $segment, $matches) === 1) {
            return '(?P<' . $matches[1] . '>[^/]+)';
        }

        // '@' matches the delimiter WP_REST_Server::match_request_to_handler() itself uses
        // (preg_match('@^' . $route . '$@i', ...)) when matching this route at dispatch.
        return preg_quote($segment, '@');
    }

    /** @return non-falsy-string always starts with '/', what register_rest_route() requires. */
    private static function routeFor(string $slug): string
    {
        return '/' . implode('/', array_map(self::segmentToRegex(...), explode('/', $slug)));
    }

    /**
     * The register_rest_route() endpoint list for one file's instance: one entry per HTTP
     * verb the file publicly implements. Kept as pure logic (no WP calls) so it's testable
     * without stubbing register_rest_route().
     *
     * @return array<int, array{methods: string, callback: array{0: object, 1: string}, permission_callback: callable, loopress_instance?: object}>
     */
    public function endpointsFor(object $instance): array
    {
        $endpoints = [];
        foreach (self::VERBS as $method => $httpMethod) {
            if (!$this->hasPublicMethod($instance, $method)) {
                continue;
            }

            $endpoint = [
                'methods'             => $httpMethod,
                'callback'            => [$instance, $method],
                'permission_callback' => $this->resolvePermission($instance, $method),
            ];

            // WP passes unknown keys through register_rest_route() untouched, and reflects
            // whichever endpoint entry actually matched back onto the request via
            // set_attributes() (verified against WP core: WP_REST_Server::
            // match_request_to_handler() and rest_handle_options_request() both do this, the
            // latter covering the OPTIONS preflight too). applyHeaders() reads it back from
            // there instead of a route-string-keyed lookup, which would need reworking for
            // every dynamic-segment route path added here.
            if ($this->hasPublicMethod($instance, 'headers')) {
                $endpoint['loopress_instance'] = $instance;
            }

            $endpoints[] = $endpoint;
        }

        return $endpoints;
    }

    // Resolved per verb, not once for the whole file: a method-level #[Permission] only
    // applies to that one verb, so this has to run inside endpointsFor()'s loop. Priority,
    // most specific first: #[Permission] on the verb method, #[Permission] on the class,
    // the file's own permission() (passed by reference, never called here: WP invokes it
    // lazily at dispatch, as permission_callback(WP_REST_Request): bool, the same way any
    // native WP REST permission_callback works), the closed manage_options default.
    private function resolvePermission(object $instance, string $verbMethod): callable
    {
        $attribute = $this->permissionAttributeFor($instance, $verbMethod);
        if ($attribute !== null) {
            return $this->permissionFromAttribute($instance, $attribute);
        }

        return $this->hasPublicMethod($instance, 'permission')
            ? $this->wrapCallableMethod($instance, 'permission')
            : $this->permissionCallback();
    }

    private function permissionAttributeFor(object $instance, string $verbMethod): ?Permission
    {
        $methodAttributes = (new \ReflectionMethod($instance, $verbMethod))->getAttributes(Permission::class);
        if ($methodAttributes !== []) {
            return $methodAttributes[0]->newInstance();
        }

        $classAttributes = (new \ReflectionClass($instance))->getAttributes(Permission::class);
        return $classAttributes === [] ? null : $classAttributes[0]->newInstance();
    }

    private function permissionFromAttribute(object $instance, Permission $attribute): callable
    {
        if ($attribute->public) {
            return static fn(): bool => true;
        }

        if ($attribute->callback !== null) {
            // A shared static method ([Class::class, 'method']) or a local method name on
            // $instance, either way still user code, still wrapped fail-closed below, same
            // reasoning as the file's own permission().
            return is_array($attribute->callback)
                ? $this->wrapCallableMethod($attribute->callback[0], $attribute->callback[1])
                : $this->wrapCallableMethod($instance, $attribute->callback);
        }

        $capability = $attribute->capability ?? 'manage_options';
        return static fn(): bool => current_user_can($capability);
    }

    // method_exists() alone returns true for private/protected methods too; a call from
    // outside the class (what register_rest_route's callback dispatch does) would fatal on
    // visibility, so both checks are required.
    public function hasPublicMethod(object $instance, string $method): bool
    {
        return method_exists($instance, $method) && (new \ReflectionMethod($instance, $method))->isPublic();
    }

    // A permission_callback resolved from user code (the file's own permission(), or a
    // #[Permission(callback: ...)] target, local or a shared static method) now runs at
    // dispatch, not at registration inside loadFile()'s try/catch: an uncaught throw here
    // would fatal this one request rather than being caught while skipping the route at
    // boot. Same principle already applied to headers() in applyHeaders() below: fail closed
    // (deny) and log, rather than let WP see an uncaught exception from a permission_callback.
    //
    // Takes the target and method name separately rather than a pre-built [$target, $method]
    // array, so that array literal stays inline at the is_callable()/call_user_func() call
    // sites below, same shape phpstan already accepts for the identical pattern in
    // applyHeaders(): it can't verify a bare object (or class-string) has a given method
    // otherwise.
    private function wrapCallableMethod(object|string $target, string $method): callable
    {
        return function (WP_REST_Request $request) use ($target, $method) {
            if (!is_callable([$target, $method])) {
                return false;
            }

            try {
                return call_user_func([$target, $method], $request);
            } catch (\Throwable $e) {
                $this->log("{$method}() threw: " . $e->getMessage());
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
        $instance = $request->get_attributes()['loopress_instance'] ?? null;
        if (!is_object($instance)) {
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

        // FileWriter::withGuard() only injects the ABSPATH guard for files that went through
        // lps api push; `lps api pull` deliberately strips it again for a clean Git repo (see
        // FileWriter::stripGuard()), so the source-controlled version of every api/ file never
        // has it. A Git-based deploy (rsync, a deploy hook) that never calls lps api push ships
        // that guardless version straight to a publicly reachable wp-content/, where the file
        // is directly requestable over HTTP, bypassing permission_callback entirely. Detecting
        // this can't be more than a log: the route itself is fine, only a direct HTTP request to
        // the raw file is at risk, refusing to register would punish availability for a risk
        // that isn't this route's fault.
        $content = $this->directory->read($slug);
        if ($content !== null && !str_contains($content, "defined('ABSPATH')")) {
            $this->log("api/{$slug}.php: no ABSPATH guard detected, deployed outside lps api push? File may be directly reachable over HTTP.");
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
            $this->log("api/{$slug}.php: no public HTTP verb method found (get/post/put/patch/delete), route not registered");
            return;
        }

        register_rest_route(ApiNamespace::current(), self::routeFor($slug), $endpoints);
    }

    private function log(string $message): void
    {
        error_log('Loopress api/: ' . $message); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
    }
}
