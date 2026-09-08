<?php

declare(strict_types=1);

namespace Loopress\Api\RestApi;

use Loopress\Api\ApiNamespace;
use Loopress\Api\Attribute\Permission;
use Loopress\Api\Infrastructure\ApiDirectory;
use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
use Loopress\Infrastructure\AbstractFileLoader;
use Loopress\Infrastructure\AbstractFilesDirectory;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;

/**
 * Scans wp-content/loopress/api/*.php, requires each file, and registers what its class
 * declares: one WP REST route under ApiNamespace::current() (loopress-api/v1 by default, not
 * loopress/v1, to avoid colliding with ApiFilesController's own management endpoint) per public
 * HTTP-verb method (loadAndRegister(), on rest_api_init). Scheduled/hook-only registration
 * (formerly this class's own #[Cron] support) now lives in Hooks\RestApi\HookLoader, a
 * dedicated hooks/ directory: see that class for #[Action]/#[Filter]/#[Cron].
 *
 * File scanning, one-class-per-file discovery, collision/parse-error handling and load-error
 * bookkeeping all live in AbstractFileLoader; this class only turns a resolved instance into
 * REST routes.
 */
class RouteLoader extends AbstractFileLoader
{
    use RequiresManageOptionsCapability;

    /** @var array<string, string> method name => HTTP method */
    private const VERBS = ['get' => 'GET', 'post' => 'POST', 'put' => 'PUT', 'patch' => 'PATCH', 'delete' => 'DELETE'];

    // Matches a single dynamic path segment, e.g. '[order_id]' capturing 'order_id'. First
    // char restricted to a letter or underscore: the capture becomes a PCRE named group
    // in segmentToRegex() below, and a leading digit there (e.g. '[1abc]') is a compile
    // error PHP's preg_match() fails on silently (returns false, not 0), which WP core's own
    // match loop then reads as "no match" rather than an error, a route that would never
    // match any request, with nothing pointing at why.
    private const DYNAMIC_SEGMENT_PATTERN = '/^\[([A-Za-z_]\w*)\]$/';

    public function __construct(private ApiDirectory $directory, private LoopressEnvironment $environment) {}

    protected function directory(): AbstractFilesDirectory
    {
        return $this->directory;
    }

    protected function userAutoloadPath(): ?string
    {
        return $this->environment->getAutoloadPath();
    }

    protected function slugLabel(): string
    {
        return 'api';
    }

    protected function loadErrorsOption(): string
    {
        return ApiDirectory::LOAD_ERRORS_OPTION;
    }

    protected function prepare(): void
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
    }

    protected function afterRegister(): void
    {
        // Single dispatch-level hook for every file's headers(), rather than one hook per
        // file: needed even for a plain response, but especially for the OPTIONS preflight
        // WP core answers automatically without ever invoking the file's own verb method.
        add_filter('rest_pre_serve_request', [$this, 'applyHeaders'], 10, 3);
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
                $result = call_user_func([$target, $method], $request);
            } catch (\Throwable $e) {
                $this->log("{$method}() threw: " . $e->getMessage());
                return false;
            }

            // WP core only denies on a strict `=== false` return, so anything non-bool
            // (e.g. the pre-#[Permission] convention of permission() returning a Closure
            // to be called later) would otherwise pass through as "allowed" instead of
            // failing closed like every other rejection path in this class.
            if (!is_bool($result)) {
                $this->log("{$method}() must return bool, got " . get_debug_type($result));
                return false;
            }

            return $result;
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

    protected function loadFile(string $slug): void
    {
        $instance = $this->resolveInstance($slug);
        if ($instance === null) {
            return;
        }

        try {
            $endpoints = $this->endpointsFor($instance);
        } catch (\Throwable $e) {
            // Covers a throwing #[Permission] attribute constructor the same way the
            // require/instantiate try/catch in resolveInstance() covers a parse error: never
            // fatal rest_api_init for every other file over one file's bad attribute.
            $this->fail($slug, 'failed to load: ' . $e->getMessage());
            return;
        }

        if ($endpoints === []) {
            // Every other failure branch already logs (collision, parse error, both in
            // resolveInstance()); this one didn't, so a typo'd verb method (Get() instead of
            // get(), or an accidentally-private one) failed in total silence, indistinguishable
            // from "this file intentionally has no routes yet."
            $this->fail($slug, 'no public HTTP verb method found (get/post/put/patch/delete)');
            return;
        }

        register_rest_route(ApiNamespace::current(), self::routeFor($slug), $endpoints);
    }
}
