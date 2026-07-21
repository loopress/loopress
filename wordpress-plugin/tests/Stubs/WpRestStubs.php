<?php

// Lightweight WordPress REST API stubs for use in unit tests.
// Defined in the global namespace so they match the `use WP_REST_*` imports in controllers.

if (!class_exists('WP_REST_Request')) {
    class WP_REST_Request
    {
        private array $params = [];
        private string $method = '';
        private string $route = '';

        /**
         * Accepts either the real WordPress signature (string $method, string $route) or, for
         * tests that just want to stub params directly, an array of params as the first argument.
         */
        public function __construct(array|string $methodOrParams = [], string $route = '')
        {
            if (is_array($methodOrParams)) {
                $this->params = $methodOrParams;
                return;
            }

            $this->method = $methodOrParams;
            $this->route  = $route;
        }

        public function get_param(string $key): mixed
        {
            return $this->params[$key] ?? null;
        }

        public function set_param(string $key, mixed $value): void
        {
            $this->params[$key] = $value;
        }

        public function get_json_params(): array
        {
            return $this->params;
        }

        public function get_route(): string
        {
            return $this->route !== '' ? $this->route : ($this->params['_route'] ?? '/loopress/v1/test');
        }

        public function get_method(): string
        {
            return $this->method;
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

        public function get_data(): mixed
        {
            return $this->data;
        }

        public function is_error(): bool
        {
            return $this->data instanceof WP_Error || $this->status >= 400;
        }

        public function as_error(): ?WP_Error
        {
            return $this->data instanceof WP_Error ? $this->data : null;
        }
    }
}

if (!class_exists('WP_REST_Server')) {
    class WP_REST_Server {}
}

if (!class_exists('WP_Post')) {
    class WP_Post
    {
        public int $ID = 0;
        public string $post_content = '';
        public string $post_name = '';
        public string $post_status = 'draft';
        public string $post_title = '';
        public string $post_type = 'post';
    }
}

if (!class_exists('WP_Error')) {
    class WP_Error
    {
        public function __construct(
            private string $code = '',
            private string $message = '',
        ) {}

        public function get_error_message(): string
        {
            return $this->message;
        }

        public function get_error_code(): string
        {
            return $this->code;
        }
    }
}

if (!function_exists('wp_mkdir_p')) {
    function wp_mkdir_p(string $path): bool
    {
        // This *is* the fake implementation of wp_mkdir_p() for tests; there's no
        // WP_Filesystem to defer to since WordPress itself isn't loaded here.
        return mkdir($path, 0755, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir
    }
}

if (!function_exists('esc_html')) {
    function esc_html(string $text): string
    {
        return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
    }
}
