<?php

namespace Loopress\Service;

use Loopress\Contract\SnippetProvider;
use WP_REST_Request;

/**
 * Talks to the Code Snippets plugin (https://wordpress.org/plugins/code-snippets/) by
 * dispatching internal REST requests to its own `code-snippets/v1/snippets` routes, rather
 * than reimplementing its storage. Code Snippets, unlike WPCode, already exposes a REST API,
 * so this provider forwards to it instead of talking to WordPress core storage directly.
 */
class CodeSnippetsSnippetProvider implements SnippetProvider
{
    private const NAMESPACE = 'code-snippets/v1';
    private const ROUTE     = '/snippets';

    /** Code Snippets scope slugs that map to a canonical location regardless of type. */
    private const SCOPE_TO_LOCATION = [
        'admin'          => 'admin',
        'admin-css'      => 'admin',
        'content'        => 'everywhere',
        'footer-content' => 'footer',
        'front-end'      => 'frontend',
        'global'         => 'everywhere',
        'head-content'   => 'header',
        'single-use'     => 'once',
        'site-css'       => 'frontend',
        'site-footer-js' => 'footer',
        'site-head-js'   => 'header',
    ];

    public function isActive(): bool
    {
        return class_exists('Code_Snippets\\Plugin');
    }

    /** @return array<int, array<string, mixed>> */
    public function getSnippets(): array
    {
        $response = $this->dispatchList('GET', self::ROUTE);

        return array_map([$this, 'fromRemote'], $response);
    }

    /** @return array<string, mixed>|null */
    public function getSnippet(int $id): ?array
    {
        try {
            $response = $this->dispatchOne('GET', self::ROUTE . "/{$id}");
        } catch (\RuntimeException $e) {
            return null;
        }

        return $this->fromRemote($response);
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function createSnippet(array $data): array
    {
        $response = $this->dispatchOne('POST', self::ROUTE, $this->toPayload($data));

        return $this->fromRemote($response);
    }

    /** @param array<string, mixed> $data @return array<string, mixed>|null */
    public function updateSnippet(int $id, array $data): ?array
    {
        try {
            $response = $this->dispatchOne('PUT', self::ROUTE . "/{$id}", $this->toPayload($data));
        } catch (\RuntimeException $e) {
            return null;
        }

        return $this->fromRemote($response);
    }

    public function deleteSnippet(int $id): bool
    {
        // Doesn't go through dispatch()/dispatchOne(): a DELETE response has no body to coerce
        // into an array, only a success/error status to check.
        $request = new WP_REST_Request('DELETE', self::NAMESPACE . self::ROUTE . "/{$id}");

        return !rest_do_request($request)->is_error();
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    private function toPayload(array $data): array
    {
        $payload = [];

        if (isset($data['name'])) {
            $payload['name'] = $data['name'];
        }
        if (isset($data['code'])) {
            $payload['code'] = $data['code'];
        }
        if (isset($data['active'])) {
            $payload['active'] = (bool) $data['active'];
        }
        if (isset($data['description'])) {
            $payload['desc'] = $data['description'];
        }
        if (isset($data['tags'])) {
            $payload['tags'] = $data['tags'];
        }
        if (isset($data['priority'])) {
            $payload['priority'] = (int) $data['priority'];
        }
        if (isset($data['type'], $data['location'])) {
            $payload['scope'] = $this->scopeFromTypeAndLocation((string) $data['type'], (string) $data['location']);
        }

        return $payload;
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    private function fromRemote(array $data): array
    {
        $scope = (string) ($data['scope'] ?? 'global');
        $type  = $this->typeFromScope($scope);

        return [
            'active'              => (bool) ($data['active'] ?? false),
            'code'                => (string) ($data['code'] ?? ''),
            'description'         => (string) ($data['desc'] ?? ''),
            'id'                  => (int) ($data['id'] ?? 0),
            'insertMethod'        => 'auto',
            'location'            => self::SCOPE_TO_LOCATION[$scope] ?? $this->defaultLocationForType($type),
            'name'                => (string) ($data['name'] ?? ''),
            'priority'            => isset($data['priority']) ? (int) $data['priority'] : 10,
            'shortcodeAttributes' => [],
            'tags'                => is_array($data['tags'] ?? null) ? $data['tags'] : [],
            'type'                => $type,
        ];
    }

    private function typeFromScope(string $scope): string
    {
        if (str_ends_with($scope, '-css')) {
            return 'css';
        }
        if (str_ends_with($scope, '-js')) {
            return 'js';
        }
        if (str_ends_with($scope, 'content')) {
            return 'html';
        }

        return 'php';
    }

    private function defaultLocationForType(string $type): string
    {
        return match ($type) {
            'css' => 'header',
            'html', 'js', 'text' => 'footer',
            default => 'everywhere',
        };
    }

    private function scopeFromTypeAndLocation(string $type, string $location): string
    {
        return match ($type) {
            'css' => match ($location) {
                'frontend' => 'site-css',
                'admin'    => 'admin-css',
                default    => throw new \RuntimeException("Code Snippets does not support the \"{$location}\" location for CSS snippets. Use one of: frontend, admin."),
            },
            'html' => match ($location) {
                'header'     => 'head-content',
                'footer'     => 'footer-content',
                'everywhere' => 'content',
                default      => throw new \RuntimeException("Code Snippets does not support the \"{$location}\" location for HTML snippets. Use one of: header, footer, everywhere."),
            },
            'js' => match ($location) {
                'header' => 'site-head-js',
                'footer' => 'site-footer-js',
                default  => throw new \RuntimeException("Code Snippets does not support the \"{$location}\" location for JS snippets. Use one of: header, footer."),
            },
            'php' => match ($location) {
                'everywhere' => 'global',
                'frontend'   => 'front-end',
                'admin'      => 'admin',
                'once'       => 'single-use',
                default      => throw new \RuntimeException("Code Snippets does not support the \"{$location}\" location for PHP snippets. Use one of: everywhere, frontend, admin, once."),
            },
            'text' => throw new \RuntimeException('Code Snippets has no "text" snippet type.'),
            default => throw new \RuntimeException("Unknown snippet type \"{$type}\"."),
        };
    }

    /** @param array<string, mixed> $body @return array<string, mixed> */
    private function dispatchOne(string $method, string $path, array $body = []): array
    {
        return $this->dispatch($method, $path, $body);
    }

    /** @param array<string, mixed> $body @return array<int, array<string, mixed>> */
    private function dispatchList(string $method, string $path, array $body = []): array
    {
        return $this->dispatch($method, $path, $body);
    }

    /** @param array<string, mixed> $body @return array<mixed> */
    private function dispatch(string $method, string $path, array $body = []): array
    {
        // Leading slash is required: WP_REST_Server::dispatch() matches routes with an
        // anchored `^/...$` regex, so a route missing it never matches and rest_do_request()
        // fails with "No route was found matching the URL and request method."
        $request = new WP_REST_Request($method, '/' . self::NAMESPACE . $path);

        foreach ($body as $key => $value) {
            $request->set_param($key, $value);
        }

        $response = rest_do_request($request);

        if ($response->is_error()) {
            $error = $response->as_error();
            throw new \RuntimeException($error instanceof \WP_Error ? $error->get_error_message() : 'Code Snippets request failed.');
        }

        return $response->get_data();
    }
}
