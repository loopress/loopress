<?php

declare(strict_types=1);

namespace Loopress\Snippets\Infrastructure;

use Loopress\Snippets\Contract\SnippetData;
use Loopress\Snippets\Contract\SnippetProvider;
use Loopress\Snippets\Contract\SnippetType;
use Loopress\Snippets\Exception\SnippetProviderRequestException;
use Loopress\Snippets\Exception\UnsupportedLocationException;
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

    /** @return array<int, SnippetData> */
    public function getSnippets(): array
    {
        $response = $this->dispatchList('GET', self::ROUTE);
        $snippets = array_map([$this, 'fromRemote'], $response);

        // fromRemote() always sets id, but SnippetData::$id is nullable (it also represents
        // create/update input, where an id genuinely doesn't exist yet), so this filters out
        // a possibility that can't actually occur here rather than asserting it away.
        $trashedIds = $this->trashedIds(array_values(array_filter(
            array_column($snippets, 'id'),
            static fn(?int $id): bool => $id !== null,
        )));

        return array_values(array_filter(
            $snippets,
            static fn(SnippetData $snippet): bool => !in_array($snippet->id, $trashedIds, true),
        ));
    }

    public function getSnippet(int $id): ?SnippetData
    {
        if ($this->isTrashed($id)) {
            return null;
        }

        try {
            $response = $this->dispatchOne('GET', self::ROUTE . "/{$id}");
        } catch (\RuntimeException $e) {
            return null;
        }

        return $this->fromRemote($response);
    }

    public function createSnippet(SnippetData $data): SnippetData
    {
        $response = $this->dispatchOne('POST', self::ROUTE, $this->toPayload($data));

        return $this->fromRemote($response);
    }

    public function updateSnippet(int $id, SnippetData $data): ?SnippetData
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
        // into an array, only a success/error status to check. Still needs the same leading
        // slash as dispatch() (see its comment): without it the route never matches and this
        // silently reports every delete as "not found" instead of actually deleting anything.
        $request = new WP_REST_Request('DELETE', '/' . self::NAMESPACE . self::ROUTE . "/{$id}");

        return !rest_do_request($request)->is_error();
    }

    /** @return array<string, mixed> */
    private function toPayload(SnippetData $data): array
    {
        $payload = [];

        if ($data->name !== null) {
            $payload['name'] = $data->name;
        }
        if ($data->code !== null) {
            $payload['code'] = $data->code;
        }
        if ($data->active !== null) {
            $payload['active'] = $data->active;
        }
        if ($data->description !== null) {
            $payload['desc'] = $data->description;
        }
        if ($data->tags !== null) {
            $payload['tags'] = $data->tags;
        }
        if ($data->priority !== null) {
            $payload['priority'] = $data->priority;
        }
        if ($data->type !== null && $data->location !== null) {
            $payload['scope'] = $this->scopeFromTypeAndLocation($data->type, $data->location);
        }

        return $payload;
    }

    /** @param array<string, mixed> $data */
    private function fromRemote(array $data): SnippetData
    {
        $scope = (string) ($data['scope'] ?? 'global');
        $type  = $this->typeFromScope($scope);

        return new SnippetData(
            id: (int) ($data['id'] ?? 0),
            name: (string) ($data['name'] ?? ''),
            code: (string) ($data['code'] ?? ''),
            type: $type,
            active: (bool) ($data['active'] ?? false),
            description: (string) ($data['desc'] ?? ''),
            tags: is_array($data['tags'] ?? null) ? $data['tags'] : [],
            location: self::SCOPE_TO_LOCATION[$scope] ?? $this->defaultLocationForType($type),
            insertMethod: 'auto',
            priority: isset($data['priority']) ? (int) $data['priority'] : 10,
            shortcodeAttributes: [],
        );
    }

    private function typeFromScope(string $scope): SnippetType
    {
        if (str_ends_with($scope, '-css')) {
            return SnippetType::Css;
        }
        if (str_ends_with($scope, '-js')) {
            return SnippetType::Js;
        }
        if (str_ends_with($scope, 'content')) {
            return SnippetType::Html;
        }

        return SnippetType::Php;
    }

    private function defaultLocationForType(SnippetType $type): string
    {
        return match ($type) {
            SnippetType::Css                              => 'header',
            SnippetType::Html, SnippetType::Js, SnippetType::Text => 'footer',
            SnippetType::Php                              => 'everywhere',
        };
    }

    private function scopeFromTypeAndLocation(SnippetType $type, string $location): string
    {
        return match ($type) {
            SnippetType::Css => match ($location) {
                'frontend' => 'site-css',
                'admin'    => 'admin-css',
                default    => throw new UnsupportedLocationException(esc_html("Code Snippets does not support the \"{$location}\" location for CSS snippets. Use one of: frontend, admin.")),
            },
            SnippetType::Html => match ($location) {
                'header'     => 'head-content',
                'footer'     => 'footer-content',
                'everywhere' => 'content',
                default      => throw new UnsupportedLocationException(esc_html("Code Snippets does not support the \"{$location}\" location for HTML snippets. Use one of: header, footer, everywhere.")),
            },
            SnippetType::Js => match ($location) {
                'header' => 'site-head-js',
                'footer' => 'site-footer-js',
                default  => throw new UnsupportedLocationException(esc_html("Code Snippets does not support the \"{$location}\" location for JS snippets. Use one of: header, footer.")),
            },
            SnippetType::Php => match ($location) {
                'everywhere' => 'global',
                'frontend'   => 'front-end',
                'admin'      => 'admin',
                'once'       => 'single-use',
                default      => throw new UnsupportedLocationException(esc_html("Code Snippets does not support the \"{$location}\" location for PHP snippets. Use one of: everywhere, frontend, admin, once.")),
            },
            SnippetType::Text => throw new UnsupportedLocationException('Code Snippets has no "text" snippet type.'),
        };
    }

    // Code Snippets' own REST responses cannot tell a trashed snippet apart from a genuinely
    // inactive one: Snippet::prepare_field() normalizes `active` to `false` for both a real
    // `0` and the `-1` trash sentinel it stores in the database, and trash status isn't part
    // of the REST schema at all. `is_trashed()` (backed by that same `-1` sentinel) is the only
    // place that still knows the difference, so this reaches past the REST layer for this one
    // check rather than trying to reconstruct trash detection from data that no longer carries it.
    private function isTrashed(int $id): bool
    {
        return \Code_Snippets\get_snippet($id)->is_trashed();
    }

    /**
     * @param int[] $ids
     * @return int[]
     */
    private function trashedIds(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        // Typed against code-snippets-stubs.php's minimal Snippet stub, not the real class:
        // that class lives in a third-party plugin this codebase doesn't depend on at the
        // autoload level, only at runtime when Code Snippets happens to be active (see
        // isActive()).
        return array_values(array_map(
            static fn(\Code_Snippets\Snippet $snippet): int => $snippet->id,
            array_filter(
                \Code_Snippets\get_snippets($ids),
                static fn(\Code_Snippets\Snippet $snippet): bool => $snippet->is_trashed(),
            ),
        ));
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
            throw new SnippetProviderRequestException($error instanceof \WP_Error ? esc_html($error->get_error_message()) : 'Code Snippets request failed.');
        }

        return $response->get_data();
    }
}
