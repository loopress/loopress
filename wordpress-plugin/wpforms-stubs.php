<?php

// Function/class signatures for WPForms (https://wordpress.org/plugins/wpforms-lite/), purely
// for static analysis. WPForms isn't a Composer dependency of this plugin (it's an optional
// runtime dependency, only present when the user has it installed and active, see
// WPFormsProvider::isActive()), so neither PHPStan nor Psalm can otherwise see these. Signatures
// verified directly against WPForms Lite's own source (src/WPForms.php, includes/class-form.php,
// includes/functions/forms.php), not guessed from public docs. Mirrors the bracketed
// multi-namespace layout of the real src/WPForms.php: wpforms()'s own return type
// (WPForms\WPForms) only resolves correctly relative to that same layout.

namespace WPForms {

    /**
     * Minimal stub of WPForms' own main class: only the member this codebase actually reads
     * (WpFormsService talks to wpforms()->form), not the real class's full shape. `$form` is a
     * real WPForms_Form_Handler instance at runtime (lazily built by __get()/obj()), not a
     * literal declared property, this is a static-analysis-only simplification.
     */
    final class WPForms
    {
        public \WPForms_Form_Handler $form;
    }
}

namespace {

    function wpforms(): \WPForms\WPForms
    {
        return new \WPForms\WPForms();
    }

    /**
     * @return array<string, mixed>|false|null
     */
    function wpforms_decode(string $data)
    {
        return null;
    }

    /**
     * Minimal stub of WPForms' own WPForms_Form_Handler class: only the members WpFormsService
     * actually calls, not the real class's full shape.
     */
    class WPForms_Form_Handler
    {
        /**
         * @param int|string $id
         * @param array<string, mixed> $args
         * @return array<string, mixed>|false|\WP_Post[]
         */
        public function get($id = '', array $args = [])
        {
            return false;
        }

        /**
         * @param array<string, mixed> $args
         * @param array<string, mixed> $data
         * @return false|int
         */
        public function add(string $title = '', array $args = [], array $data = [])
        {
            return false;
        }

        /**
         * @param int|string $form_id
         * @param array<string, mixed> $data
         * @param array<string, mixed> $args
         * @return false|int
         */
        public function update($form_id = '', array $data = [], array $args = [])
        {
            return false;
        }

        /**
         * @param array<int>|int $ids
         */
        public function delete($ids = []): bool
        {
            return false;
        }
    }
}
