<?php

declare(strict_types=1);

namespace Loopress\Capabilities\RestApi;

use Loopress\Acf\Service\AcfService;
use Loopress\Form\Service\FormService;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_REST_Response;

/**
 * What this site can do, read by the CLI once per command so it decides before running anything
 * instead of pushing and reading the error back (e.g. snippets on a site without a snippet plugin).
 * Shipped in both editions. Full-only features extend it through the `loopress_capabilities`
 * filter (the edition, the snippet plugin, the Loopress child theme), so this shared code never
 * references them, same as `loopress_admin_data`.
 */
final readonly class CapabilitiesController
{
    use RequiresManageOptionsCapability;

    public function __construct(private AcfService $acf, private FormService $forms) {}

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/capabilities', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_capabilities'],
            'permission_callback' => $this->permissionCallback(),
        ]);
    }

    public function get_capabilities(): WP_REST_Response
    {
        return new WP_REST_Response(apply_filters('loopress_capabilities', [
            'version'         => LOOPRESS_VERSION,
            'edition'         => 'light',
            'environmentType' => wp_get_environment_type(),
            'integrations'    => ['acf' => $this->acf->isActive(), 'form' => $this->forms->isActive()],
            'theme'           => ['active' => get_stylesheet(), 'template' => get_template(), 'isBlock' => wp_is_block_theme()],
        ]), 200);
    }
}
