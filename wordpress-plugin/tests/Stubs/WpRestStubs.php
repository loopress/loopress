<?php

declare(strict_types=1);

// Lightweight WordPress REST API stubs for use in unit tests.
// Defined in the global namespace so they match the `use WP_REST_*` imports in controllers.

if (!class_exists('WP_REST_Request')) {
    class WP_REST_Request
    {
        private array $params = [];
        private string $method = '';
        private array $attributes = [];
        private mixed $jsonParams = null;
        private bool $jsonParamsOverridden = false;

        /**
         * Accepts either the real WordPress signature (string $method, string $route) or, for
         * tests that just want to stub params directly, an array of params as the first argument.
         */
        public function __construct(array|string $methodOrParams = [], private readonly string $route = '')
        {
            if (is_array($methodOrParams)) {
                $this->params = $methodOrParams;
                return;
            }

            $this->method = $methodOrParams;
        }

        public function get_param(string $key): mixed
        {
            return $this->params[$key] ?? null;
        }

        public function set_param(string $key, mixed $value): void
        {
            $this->params[$key] = $value;
        }

        // Real WP_REST_Request::get_json_params() decodes the raw request body and can return
        // anything json_decode() produces (null, a scalar, an array), not just an array. Left
        // unset, it falls back to $params like before, so existing callers are unaffected.
        public function set_json_params(mixed $value): void
        {
            $this->jsonParams          = $value;
            $this->jsonParamsOverridden = true;
        }

        public function get_json_params(): mixed
        {
            return $this->jsonParamsOverridden ? $this->jsonParams : $this->params;
        }

        public function get_route(): string
        {
            return $this->route !== '' ? $this->route : ($this->params['_route'] ?? '/loopress/v1/test');
        }

        public function get_method(): string
        {
            return $this->method;
        }

        public function set_attributes(array $attributes): void
        {
            $this->attributes = $attributes;
        }

        public function get_attributes(): array
        {
            return $this->attributes;
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
        public int $menu_order = 0;
        public string $post_content = '';
        public string $post_excerpt = '';
        public string $post_name = '';
        public string $post_status = 'draft';
        public string $post_title = '';
        public string $post_type = 'post';
    }
}

if (!class_exists('WP_Term')) {
    class WP_Term
    {
        public string $description = '';
        public string $name = '';
        public string $slug = '';
        public string $taxonomy = '';
        public int $term_id = 0;
    }
}

if (!class_exists('WP_Role')) {
    class WP_Role
    {
        /** @param array<string, bool> $capabilities */
        public function __construct(public string $name, public array $capabilities) {}
    }
}

if (!class_exists('WP_Roles')) {
    class WP_Roles
    {
        /** @var array<string, array{name: string, capabilities: array<string, bool>}> */
        public array $roles = [];
        /** @var array<string, WP_Role> */
        public array $role_objects = [];
        /** @var array<string, string> */
        public array $role_names = [];
        public string $role_key = 'wp_user_roles';

        public function get_role(string $role): ?WP_Role
        {
            return $this->role_objects[$role] ?? null;
        }
    }
}

if (!class_exists('WP_Block_Patterns_Registry')) {
    class WP_Block_Patterns_Registry
    {
        private static ?self $instance = null;

        /** @var array<string, array<string, mixed>> Tests write it directly, name => properties. */
        public array $patterns = [];

        public static function get_instance(): self
        {
            return self::$instance ??= new self();
        }

        public static function reset(): void
        {
            self::$instance = null;
        }

        public function is_registered(string $name): bool
        {
            return isset($this->patterns[$name]);
        }

        /** @return list<array<string, mixed>> */
        public function get_all_registered(): array
        {
            return array_values($this->patterns);
        }
    }
}

if (!class_exists('WP_Error')) {
    class WP_Error
    {
        public function __construct(
            private readonly string $code = '',
            private readonly string $message = '',
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
        return mkdir($path, 0755, true);
    }
}

if (!function_exists('esc_html')) {
    function esc_html(string $text): string
    {
        return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
    }
}

if (!class_exists('WP_Block_Type_Registry')) {
    class WP_Block_Type_Registry
    {
        /** @var string[] block names a test declares registered */
        public static array $registered = [];

        public static function get_instance(): self
        {
            return new self();
        }

        public function is_registered(string $name): bool
        {
            return in_array($name, self::$registered, true);
        }
    }
}

// Records nodes instead of rendering them, for AdminPageModule's admin bar entry.
if (!class_exists('WP_Admin_Bar')) {
    class WP_Admin_Bar
    {
        /** @var array<string, array<string, mixed>> */
        public array $nodes = [];

        /** @param array<string, mixed> $args */
        public function add_node(array $args): void
        {
            $this->nodes[(string) $args['id']] = $args;
        }
    }
}
