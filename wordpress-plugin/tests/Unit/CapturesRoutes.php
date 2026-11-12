<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit;

use Brain\Monkey\Functions;
use Loopress\Infrastructure\Narrow;

// Records what a controller's register_routes() hands to register_rest_route(), so a test can
// assert the routes, their methods, who may call them and how their arguments are validated.
trait CapturesRoutes
{
    /** @var array<string, list<array<mixed>>> route => one entry per HTTP method */
    protected array $routes = [];

    protected function captureRoutes(): void
    {
        Functions\when('register_rest_route')->alias(function (string $restNamespace, string $route, array $args): bool {
            /** @var list<array<mixed>> $handlers */
            $handlers = array_is_list($args) ? $args : [$args];
            $this->routes[$route] = $handlers;

            return true;
        });
    }

    /** @return array<mixed> */
    protected function handler(string $route, string $method): array
    {
        foreach ($this->routes[$route] ?? [] as $handler) {
            if ($handler['methods'] === $method) {
                return $handler;
            }
        }
        $this->fail("No {$method} handler registered on {$route}");
    }

    /** Reads `args` of a handler, e.g. routeArg('/pushes', 'POST', 'resource', 'enum'). */
    protected function routeArg(string $route, string $method, string ...$path): mixed
    {
        $value = $this->handler($route, $method)['args'] ?? null;
        foreach ($path as $key) {
            $this->assertIsArray($value);
            $value = $value[$key] ?? null;
        }

        return $value;
    }

    /** @return list<string> "METHOD route" of every handler, sorted */
    protected function registered(): array
    {
        $all = [];
        foreach ($this->routes as $route => $handlers) {
            foreach ($handlers as $handler) {
                $all[] = Narrow::string($handler['methods']) . ' ' . $route;
            }
        }
        sort($all);

        return $all;
    }

    protected function assertGuardedByManageOptions(): void
    {
        foreach ($this->routes as $route => $handlers) {
            foreach ($handlers as $handler) {
                $check = $handler['permission_callback'];
                $this->assertIsCallable($check);
                Functions\when('current_user_can')->alias(static fn(string $cap): bool => $cap === 'manage_options');
                $this->assertTrue($check(), "{$route} must allow manage_options");
                Functions\when('current_user_can')->justReturn(false);
                $this->assertFalse($check(), "{$route} must refuse everyone else");
            }
        }
    }
}
