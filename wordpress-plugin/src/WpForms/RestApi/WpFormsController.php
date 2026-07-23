<?php

declare(strict_types=1);

namespace Loopress\WpForms\RestApi;

use Loopress\RestApi\RequiresManageOptionsCapability;
use Loopress\WpForms\Service\WpFormsService;
use WP_REST_Request;
use WP_REST_Response;

class WpFormsController
{
    use RequiresManageOptionsCapability;

    public function __construct(private WpFormsService $wpFormsService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/wpforms', [
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

        register_rest_route('loopress/v1', '/wpforms/(?P<id>\d+)', [
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
        if (!$this->wpFormsService->isActive()) {
            return new WP_REST_Response(['error' => 'WPForms is not active'], 400);
        }

        return new WP_REST_Response($this->wpFormsService->list(), 200);
    }

    public function get_form(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->wpFormsService->isActive()) {
            return new WP_REST_Response(['error' => 'WPForms is not active'], 400);
        }

        $form = $this->wpFormsService->get((int) $request->get_param('id'));
        if ($form === null) {
            return new WP_REST_Response(['error' => 'Form not found'], 404);
        }

        return new WP_REST_Response($form, 200);
    }

    public function create_form(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->wpFormsService->isActive()) {
            return new WP_REST_Response(['error' => 'WPForms is not active'], 400);
        }

        $data = $request->get_json_params();
        if ($data === []) {
            return new WP_REST_Response(['error' => 'Request body must be a non-empty JSON object.'], 400);
        }

        try {
            $form = $this->wpFormsService->create($data);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        return new WP_REST_Response($form, 201);
    }

    public function update_form(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->wpFormsService->isActive()) {
            return new WP_REST_Response(['error' => 'WPForms is not active'], 400);
        }

        $data = $request->get_json_params();
        if ($data === []) {
            return new WP_REST_Response(['error' => 'Request body must be a non-empty JSON object.'], 400);
        }

        try {
            $form = $this->wpFormsService->update((int) $request->get_param('id'), $data);
        } catch (\RuntimeException $e) {
            return new WP_REST_Response(['error' => $e->getMessage()], 500);
        }

        if ($form === null) {
            return new WP_REST_Response(['error' => 'Form not found'], 404);
        }

        return new WP_REST_Response($form, 200);
    }

    public function delete_form(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->wpFormsService->isActive()) {
            return new WP_REST_Response(['error' => 'WPForms is not active'], 400);
        }

        $deleted = $this->wpFormsService->delete((int) $request->get_param('id'));
        if (!$deleted) {
            return new WP_REST_Response(['error' => 'Form not found'], 404);
        }

        return new WP_REST_Response(null, 204);
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
