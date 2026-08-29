<?php

declare(strict_types=1);

namespace Loopress\Form\RestApi;

use Loopress\Form\Exception\NoActiveFormPluginException;
use Loopress\Form\Service\FormService;
use Loopress\RestApi\MapsServiceExceptions;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Request;
use WP_REST_Response;

class FormController
{
    use MapsServiceExceptions;
    use RequiresManageOptionsCapability;

    private const STATUSES = [NoActiveFormPluginException::class => 409];

    public function __construct(private FormService $formService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/forms', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_forms'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'create_form'],
                'permission_callback' => $this->permissionCallback(),
            ],
        ]);

        register_rest_route('loopress/v1', '/forms/(?P<id>\d+)', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_form'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => $this->idArg(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'update_form'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => $this->idArg(),
            ],
            [
                'methods'             => 'DELETE',
                'callback'            => [$this, 'delete_form'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => $this->idArg(),
            ],
        ]);
    }

    public function list_forms(): WP_REST_Response
    {
        if (!$this->formService->isActive()) {
            return $this->inactiveResponse();
        }

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->formService->list(), 200),
            self::STATUSES,
        );
    }

    public function get_form(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->formService->isActive()) {
            return $this->inactiveResponse();
        }

        return $this->mapServiceExceptions(function () use ($request): WP_REST_Response {
            $form = $this->formService->get((int) $request->get_param('id'));

            return $form === null
                ? new WP_REST_Response(['error' => 'Form not found'], 404)
                : new WP_REST_Response($form, 200);
        }, self::STATUSES);
    }

    public function create_form(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->formService->isActive()) {
            return $this->inactiveResponse();
        }

        $data = $request->get_json_params();
        if (!is_array($data) || $data === []) {
            return new WP_REST_Response(['error' => 'Request body must be a non-empty JSON object.'], 400);
        }

        return $this->mapServiceExceptions(
            fn(): WP_REST_Response => new WP_REST_Response($this->formService->create($data), 201),
            self::STATUSES,
        );
    }

    public function update_form(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->formService->isActive()) {
            return $this->inactiveResponse();
        }

        $data = $request->get_json_params();
        if (!is_array($data) || $data === []) {
            return new WP_REST_Response(['error' => 'Request body must be a non-empty JSON object.'], 400);
        }

        return $this->mapServiceExceptions(function () use ($request, $data): WP_REST_Response {
            $form = $this->formService->update((int) $request->get_param('id'), $data);

            return $form === null
                ? new WP_REST_Response(['error' => 'Form not found'], 404)
                : new WP_REST_Response($form, 200);
        }, self::STATUSES);
    }

    public function delete_form(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->formService->isActive()) {
            return $this->inactiveResponse();
        }

        return $this->mapServiceExceptions(function () use ($request): WP_REST_Response {
            $deleted = $this->formService->delete((int) $request->get_param('id'));

            return $deleted
                ? new WP_REST_Response(null, 204)
                : new WP_REST_Response(['error' => 'Form not found'], 404);
        }, self::STATUSES);
    }

    private function inactiveResponse(): WP_REST_Response
    {
        return new WP_REST_Response(['error' => 'No supported form plugin is active'], 409);
    }

    /** @return array<string, mixed> */
    private function idArg(): array
    {
        return [
            'id' => [
                'required'          => true,
                'sanitize_callback' => 'absint',
                'validate_callback' => fn($v) => is_numeric($v) && $v > 0,
            ],
        ];
    }
}
