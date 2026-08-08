<?php

// Function signatures for Advanced Custom Fields (https://wordpress.org/plugins/advanced-custom-fields/),
// purely for static analysis. ACF isn't a Composer dependency of this plugin (it's an optional
// runtime dependency, only present when the user has it installed and active, see
// AcfService::isActive()), so neither PHPStan nor Psalm can otherwise see these. Signatures
// verified directly against ACF's own source (includes/acf-internal-post-type-functions.php,
// includes/api/api-helpers.php), not guessed from public docs.

/**
 * @return object|false
 */
function acf_get_internal_post_type_instance(string $post_type = 'acf-field-group')
{
    return false;
}

/**
 * @param int|string $id
 * @return array<string, mixed>|false
 */
function acf_get_internal_post_type($id, string $post_type)
{
    return false;
}

/**
 * @param int|string $id
 * @return \WP_Post|false
 */
function acf_get_internal_post_type_post($id, string $post_type)
{
    return false;
}

/**
 * @param array<string, mixed> $filter
 * @return array<int, array<string, mixed>>
 */
function acf_get_internal_post_type_posts(string $post_type = 'acf-field-group', array $filter = []): array
{
    return [];
}

/**
 * @param array<string, mixed> $post
 * @return array<string, mixed>
 */
function acf_prepare_internal_post_type_for_export(array $post = [], string $post_type = 'acf-field-group'): array
{
    return [];
}

/**
 * @param array<string, mixed> $post
 * @return array<string, mixed>
 */
function acf_import_internal_post_type(array $post, string $post_type): array
{
    return [];
}

/**
 * @param int|string $id
 */
function acf_delete_internal_post_type($id, string $post_type_name): bool
{
    return false;
}

/**
 * @param int|string|array<string, mixed> $selector
 * @return array<int, array<string, mixed>>|false
 */
function acf_get_fields($selector)
{
    return false;
}
