<?php

declare(strict_types=1);

namespace Loopress\Pages\RestApi;

use Loopress\Infrastructure\AbstractFilesDirectory;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_Post;
use WP_REST_Request;
use WP_REST_Response;

/**
 * `lps template push`/`list`/`diff`: a versioned templates/ folder of block templates, stored the
 * way the Site Editor stores its own (a `wp_template` post tied to the active theme through the
 * `wp_theme` taxonomy), so WordPress renders them natively and a static page picks one with its
 * `template:` header. Custom templates only, never an override of a WordPress or theme template.
 * Block themes only: a classic theme never reads `wp_template` posts.
 *
 * A template's identity is its post_name within the active theme. Every refusal in
 * put_template() happens before any write.
 */
class TemplatesController
{
    use RequiresManageOptionsCapability;

    // '_' prefix: without it WordPress lists the marker in the "Custom Fields" panel.
    public const MARKER_META = '_loopress_template';

    // Same rule as a page slug (see PagesController::SLUG_PATTERN), mirrored in
    // cli/src/utils/template-format.ts.
    private const SLUG_PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*$';

    private const SIZE_FILTER_SUBJECT = 'templates';

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/templates', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_templates'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'put_template'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => [
                    'slug'  => ['required' => true, 'type' => 'string', 'pattern' => self::SLUG_PATTERN],
                    'title' => ['required' => true, 'type' => 'string'],
                    'html'  => ['required' => true, 'type' => 'string'],
                ],
            ],
        ]);
    }

    public function list_templates(): WP_REST_Response
    {
        $templates = array_map(fn(int $id): array => $this->toArray($id), $this->templateIds(null, true));

        return new WP_REST_Response($templates, 200);
    }

    // ponytail: no named lock like PagesController's, two concurrent first pushes of the same new
    // template could create two posts. Add the lock if template pushes ever run in parallel.
    public function put_template(WP_REST_Request $request): WP_REST_Response
    {
        $slug  = (string) $request->get_param('slug');
        $title = (string) $request->get_param('title');
        $html  = (string) $request->get_param('html');

        if (!wp_is_block_theme()) {
            return $this->error(409, sprintf(
                'Template "%s" was not pushed: the active theme is not a block theme, and classic themes never use block templates.',
                $slug
            ));
        }

        // Custom templates only: a hierarchy slug (page, single, index...) or one the theme ships
        // would silently restyle every page using it, not just the pages that opt in.
        if (isset(get_default_block_template_types()[$slug]) || get_block_file_template(get_stylesheet() . '//' . $slug) !== null) {
            return $this->error(409, sprintf(
                'Template "%s" is a WordPress or theme template, Loopress only declares custom templates. Rename the file.',
                $slug
            ));
        }

        $maxFileBytes = (int) apply_filters('loopress_max_file_bytes', AbstractFilesDirectory::MAX_FILE_BYTES, self::SIZE_FILTER_SUBJECT);
        if (strlen($html) > $maxFileBytes) {
            return $this->error(413, sprintf(
                'Template "%s" is %d bytes, over the %d byte limit. Split it, or raise the loopress_max_file_bytes filter.',
                $slug,
                strlen($html),
                $maxFileBytes
            ));
        }

        $existing   = $this->templateIds($slug, false);
        $existingId = $existing === [] ? null : $existing[0];
        if ($existingId !== null && get_post_meta($existingId, self::MARKER_META, true) !== '1') {
            return $this->error(409, sprintf(
                'Template "%s" was customized in the Site Editor and is not managed by Loopress. Rename the file, or clear the customizations in Appearance > Editor > Templates.',
                $slug
            ));
        }

        $maxTotalBytes = (int) apply_filters('loopress_max_files_total_bytes', AbstractFilesDirectory::MAX_TOTAL_BYTES, self::SIZE_FILTER_SUBJECT);
        $totalBytes    = strlen($html) + $this->otherTemplatesBytes($existingId);
        if ($totalBytes > $maxTotalBytes) {
            return $this->error(413, sprintf(
                'Pushing "%s" would bring managed templates to %d bytes, over the %d byte total limit. Raise the loopress_max_files_total_bytes filter.',
                $slug,
                $totalBytes,
                $maxTotalBytes
            ));
        }

        $postarr = [
            'post_type'    => 'wp_template',
            'post_name'    => $slug,
            'post_title'   => $title,
            'post_status'  => 'publish',
            'post_content' => $html,
            'meta_input'   => [self::MARKER_META => '1'],
        ];

        // wp_slash(): wp_insert_post() unslashes its input, a backslash in the markup would be lost.
        $result = $existingId === null
            ? wp_insert_post(wp_slash($postarr), true)
            : wp_update_post(wp_slash($postarr + ['ID' => $existingId]), true);

        if (is_wp_error($result)) {
            return $this->error(500, $result->get_error_message());
        }

        // Set here rather than through tax_input, which silently drops the term when the current
        // user lacks the taxonomy's assign_terms capability.
        $id = (int) $result;
        wp_set_object_terms($id, get_stylesheet(), 'wp_theme');

        return new WP_REST_Response($this->toArray($id), $existingId === null ? 201 : 200);
    }

    /**
     * Templates of the active theme: only the Loopress ones when $managedOnly, else any (a Site
     * Editor customization included), optionally narrowed to one slug.
     *
     * @return int[]
     */
    private function templateIds(?string $slug, bool $managedOnly): array
    {
        $args = [
            'post_type'   => 'wp_template',
            'post_status' => 'any',
            'numberposts' => -1,
            'fields'      => 'ids',
            'orderby'     => 'name',
            'order'       => 'ASC',
            'tax_query'   => [ // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
                ['taxonomy' => 'wp_theme', 'field' => 'name', 'terms' => get_stylesheet()],
            ],
        ];
        if ($slug !== null) {
            $args['name'] = $slug;
        }
        if ($managedOnly) {
            $args['meta_key']   = self::MARKER_META; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
            $args['meta_value'] = '1'; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
        }

        return array_map('intval', get_posts($args));
    }

    private function otherTemplatesBytes(?int $excludeId): int
    {
        $total = 0;
        foreach ($this->templateIds(null, true) as $id) {
            $post = get_post($id);
            if ($id !== $excludeId && $post instanceof WP_Post) {
                $total += strlen($post->post_content);
            }
        }

        return $total;
    }

    /** @return array{slug: string, title: string, html: string} */
    private function toArray(int $id): array
    {
        $post = get_post($id);
        if (!$post instanceof WP_Post) {
            throw new \RuntimeException(esc_html("Template {$id} not found"));
        }

        return [
            'slug'  => $post->post_name,
            'title' => $post->post_title,
            'html'  => $post->post_content,
        ];
    }

    private function error(int $status, string $message): WP_REST_Response
    {
        return new WP_REST_Response(['error' => $message], $status);
    }
}
