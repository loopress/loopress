<?php

// Lightweight WordPress REST API stubs for use in unit tests.
// Defined in the global namespace so they match the `use WP_REST_*` imports in controllers.

if (!class_exists('WP_REST_Request')) {
    class WP_REST_Request
    {
        private array $params = [];

        public function __construct(array $params = [])
        {
            $this->params = $params;
        }

        public function get_param(string $key): mixed
        {
            return $this->params[$key] ?? null;
        }

        public function get_json_params(): array
        {
            return $this->params;
        }

        public function get_route(): string
        {
            return $this->params['_route'] ?? '/loopress/v1/test';
        }
    }
}

if (!class_exists('WP_REST_Response')) {
    class WP_REST_Response
    {
        private array $headers = [];

        public function __construct(
            public readonly mixed $data,
            public readonly int   $status = 200,
        ) {}

        public function header(string $name, string $value): void
        {
            $this->headers[$name] = $value;
        }
    }
}

if (!class_exists('WP_REST_Server')) {
    class WP_REST_Server {}
}
