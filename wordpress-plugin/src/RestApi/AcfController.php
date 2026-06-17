<?php

namespace Loopress\RestApi;

use Loopress\Service\AcfService;
use WP_REST_Request;
use WP_REST_Response;

class AcfController
{
    public function __construct(private AcfService $acfService) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/acf/field-groups', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_field_groups'],
                'permission_callback' => fn() => current_user_can('manage_options'),
            ],
            [
                'methods'             => 'POST',
                'callback'            => [$this, 'import_field_group'],
                'permission_callback' => fn() => current_user_can('manage_options'),
            ],
        ]);
    }

    public function get_field_groups(): WP_REST_Response
    {
        if (!$this->acfService->isAcfActive()) {
            return new WP_REST_Response(['error' => 'ACF is not active'], 400);
        }

        return new WP_REST_Response($this->acfService->getFieldGroups(), 200);
    }

    public function import_field_group(WP_REST_Request $request): WP_REST_Response
    {
        if (!$this->acfService->isAcfActive()) {
            return new WP_REST_Response(['error' => 'ACF is not active'], 400);
        }

        $data = $request->get_json_params();

        if (empty($data) || !is_array($data)) {
            return new WP_REST_Response(['error' => 'Invalid field group data: expected an object'], 400);
        }

        if (empty($data['key']) || !is_string($data['key']) || !str_starts_with($data['key'], 'group_')) {
            return new WP_REST_Response(['error' => 'Invalid field group data: key must be a string starting with "group_"'], 400);
        }

        if (empty($data['title']) || !is_string($data['title'])) {
            return new WP_REST_Response(['error' => 'Invalid field group data: title must be a non-empty string'], 400);
        }

        if (isset($data['fields']) && !is_array($data['fields'])) {
            return new WP_REST_Response(['error' => 'Invalid field group data: fields must be an array'], 400);
        }

        if (isset($data['location']) && !is_array($data['location'])) {
            return new WP_REST_Response(['error' => 'Invalid field group data: location must be an array'], 400);
        }

        $result = $this->acfService->importFieldGroup($data);

        return new WP_REST_Response($result, 200);
    }
}
