<?php

declare(strict_types=1);

namespace Loopress\Options\RestApi;

use Loopress\Options\Exception\ProtectedOptionException;
use Loopress\Options\Exception\ReservedOptionNameException;
use Loopress\Options\Exception\UnsupportedOptionValueException;
use Loopress\Options\Service\OptionsService;
use Loopress\RestApi\MapsServiceExceptions;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

class OptionsController
{
    use MapsServiceExceptions;
    use RequiresManageOptionsCapability;

    private const STATUSES = [
        ReservedOptionNameException::class     => 409,
        ProtectedOptionException::class        => 403,
        UnsupportedOptionValueException::class => 422,
    ];

    public function __construct(private OptionsService $optionsService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/options', [
            'methods'             => 'GET',
            'callback'            => [$this, 'list_options'],
            'permission_callback' => $this->permissionCallback(),
        ]);

        register_rest_route('loopress/v1', '/options/(?P<name>[^/]+)', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_option'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'update_option'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [$this, 'delete_option'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);
    }

    // Names+autoload only, values never included: this is a discovery endpoint (skim the site's
    // options to find the one you want to track), not a bulk export. Reading a value is a
    // separate, deliberate call to GET /options/{name}.
    //
    // Every call scans active plugins' own PHP source for every option name the (much cheaper)
    // naming guess left unresolved, to find new guesses (roughly 1-3s on a real site once
    // vendor/tests/languages are pruned from the scan; see OptionsService::listOptionNames()).
    public function list_options(WP_REST_Request $request): WP_REST_Response
    {
        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->optionsService->listOptionNames(), 200),
            self::STATUSES,
        );
    }

    public function get_option(WP_REST_Request $request): WP_REST_Response
    {
        return $this->mapServiceExceptions(function () use ($request): WP_REST_Response {
            $option = $this->optionsService->getOption((string) $request->get_param('name'));

            return $option === null
                ? new WP_REST_Response(['error' => 'Option not found'], 404)
                : new WP_REST_Response($option, 200);
        }, self::STATUSES);
    }

    public function update_option(WP_REST_Request $request): WP_REST_Response
    {
        $body = $request->get_json_params();
        // get_json_params() returns whatever json_decode() produced: an empty body, a bare
        // `null`, or any other JSON scalar all decode to something array_key_exists() can't
        // accept, which throws rather than returning false. is_array() first keeps this a clean
        // 400 instead of an uncaught TypeError bypassing mapServiceExceptions() below.
        if (!is_array($body) || !array_key_exists('value', $body)) {
            return new WP_REST_Response(['error' => 'Request body must include a "value".'], 400);
        }

        $autoload = isset($body['autoload']) && is_string($body['autoload']) ? $body['autoload'] : null;

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response(
                $this->optionsService->updateOption((string) $request->get_param('name'), $body['value'], $autoload),
                200,
            ),
            self::STATUSES,
        );
    }

    public function delete_option(WP_REST_Request $request): WP_REST_Response
    {
        $name = (string) $request->get_param('name');

        return $this->mapServiceExceptions(function () use ($name): WP_REST_Response {
            if ($this->optionsService->getOption($name) === null) {
                return new WP_REST_Response(['error' => 'Option not found'], 404);
            }

            $this->optionsService->deleteOption($name);

            return new WP_REST_Response(['name' => $name, 'deleted' => true], 200);
        }, self::STATUSES);
    }
}
