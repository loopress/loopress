<?php

declare(strict_types=1);

namespace Loopress\Pages\RestApi;

use Loopress\Infrastructure\AbstractFilesDirectory;
use Loopress\Pages\ManagedPage;
use Loopress\RestApi\RequiresManageOptionsCapability;
use WP_Post;
use WP_REST_Request;
use WP_REST_Response;

/**
 * `lps page push`/`list`/`diff`. A page's identity is its post_name (= the local file's slug),
 * never a copy of the slug in a meta. Every refusal in put_page() happens before any write, so
 * a rejected push leaves the site exactly as it was.
 */
class PagesController
{
    use RequiresManageOptionsCapability;

    // Mirrored in cli/src/utils/page-format.ts. Stricter than an api/ path segment on purpose:
    // wp_insert_post() runs post_name through sanitize_title(), which trims leading/trailing
    // hyphens and collapses repeated ones, so "-about" or "a--b" would be stored under another
    // slug than the file's and break the file/page identity.
    private const SLUG_PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*$';

    // pages/home.html is the site's front page, not a /home/ page: once published, pushing it
    // points Settings > Reading at it, replacing whatever was there (the file is the source).
    private const FRONT_PAGE_SLUG = 'home';

    // Label passed to the loopress_max_file_bytes / loopress_max_files_total_bytes filters,
    // alongside 'api' and 'hooks', so a site can tune pages separately.
    private const SIZE_FILTER_SUBJECT = 'pages';

    // One page push is a handful of queries; a lock still held after this long means something
    // is stuck, better a clear 503 than a request hanging until PHP's own time limit.
    private const LOCK_TIMEOUT_SECONDS = 10;

    public function register_routes(): void
    {
        register_rest_route('loopress/v1', '/pages', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'list_pages'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'put_page'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => [
                    'slug'      => ['required' => true, 'type' => 'string', 'pattern' => self::SLUG_PATTERN],
                    'title'     => ['required' => true, 'type' => 'string'],
                    'status'    => ['required' => true, 'type' => 'string', 'enum' => ['draft', 'publish']],
                    'html'      => ['required' => true, 'type' => 'string'],
                    'fullWidth' => ['required' => false, 'type' => 'boolean', 'default' => false],
                    'hideTitle' => ['required' => false, 'type' => 'boolean', 'default' => false],
                    'template'  => ['required' => false, 'type' => 'string', 'default' => ''],
                ],
            ],
        ]);
    }

    public function list_pages(): WP_REST_Response
    {
        $pages = array_map(fn(int $id): array => $this->toArray($id), $this->managedPageIds());

        return new WP_REST_Response($pages, 200);
    }

    public function put_page(WP_REST_Request $request): WP_REST_Response
    {
        global $wpdb;

        // Every check below is a read followed later by a write: two concurrent pushes of the
        // same new slug would both find it free, and since WordPress keeps duplicate slugs for
        // drafts, create two "about" pages the file/page identity can't tell apart. A MySQL
        // named lock serializes pushes across PHP processes and is released by MySQL itself if
        // the request dies. Scoped by table prefix so two sites sharing a database server never
        // wait on each other.
        $lock = $wpdb->prefix . 'loopress_pages_put';
        if ((string) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, %d)', $lock, self::LOCK_TIMEOUT_SECONDS)) !== '1') {
            return $this->error(503, 'Another page push is still running on this site. Try again in a moment.');
        }

        try {
            return $this->upsert($request);
        } finally {
            $wpdb->query($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock));
        }
    }

    private function upsert(WP_REST_Request $request): WP_REST_Response
    {
        $slug      = (string) $request->get_param('slug');
        $title     = (string) $request->get_param('title');
        $status    = (string) $request->get_param('status');
        $html      = (string) $request->get_param('html');
        $fullWidth = (bool) $request->get_param('fullWidth');
        $hideTitle = (bool) $request->get_param('hideTitle');
        $template  = (string) $request->get_param('template');

        $maxFileBytes = (int) apply_filters('loopress_max_file_bytes', AbstractFilesDirectory::MAX_FILE_BYTES, self::SIZE_FILTER_SUBJECT);
        if (strlen($html) > $maxFileBytes) {
            return $this->error(413, sprintf(
                'Page "%s" is %d bytes, over the %d byte limit. Split it, or raise the loopress_max_file_bytes filter.',
                $slug,
                strlen($html),
                $maxFileBytes
            ));
        }

        // Trashing renames post_name to "<slug>__trashed" and keeps the original in
        // _wp_desired_post_slug, so a trashed page is invisible to the 'name' lookup below and a
        // push would silently create a second page next to it.
        if ($this->trashedManagedPageId($slug) !== null) {
            return $this->error(409, sprintf(
                'Page "%s" is in the trash. Restore it manually in wp-admin before pushing it again.',
                $slug
            ));
        }

        $existingId = $this->pageIdBySlug($slug);
        if ($existingId !== null && !ManagedPage::isManaged($existingId)) {
            return $this->error(409, sprintf(
                'A page with slug "%s" already exists and is not managed by Loopress. Rename the file, or remove that page in wp-admin.',
                $slug
            ));
        }

        // wp_insert_post() would otherwise silently rename a taken slug ("about" -> "about-2")
        // and break the file/page identity. Always checked as 'publish': wp_unique_post_slug()
        // skips the check for drafts, which would only defer the rename to the day the page
        // gets published.
        if (wp_unique_post_slug($slug, $existingId ?? 0, 'publish', 'page', 0) !== $slug) {
            return $this->error(409, sprintf(
                'Slug "%s" is already taken on this site (another page, a media file, or a reserved WordPress slug). Rename the file.',
                $slug
            ));
        }

        $maxTotalBytes = (int) apply_filters('loopress_max_files_total_bytes', AbstractFilesDirectory::MAX_TOTAL_BYTES, self::SIZE_FILTER_SUBJECT);
        $totalBytes    = strlen($html) + $this->otherPagesBytes($existingId);
        if ($totalBytes > $maxTotalBytes) {
            return $this->error(413, sprintf(
                'Pushing "%s" would bring managed pages to %d bytes, over the %d byte total limit. Raise the loopress_max_files_total_bytes filter.',
                $slug,
                $totalBytes,
                $maxTotalBytes
            ));
        }

        $postarr = [
            'post_type'     => 'page',
            'post_name'     => $slug,
            'post_title'    => $title,
            'post_status'   => $status,
            'post_content'  => '',
            // The theme's own template picks up full-width/no-title support natively where it
            // exists; an unknown or empty slug just falls back to the default template, WordPress
            // never errors on it. Not validated here on purpose, same as page-format.ts.
            'page_template' => $template,
            'meta_input'    => [
                ManagedPage::MARKER_META     => '1',
                ManagedPage::HTML_META       => $html,
                ManagedPage::FULL_WIDTH_META => $fullWidth ? '1' : '0',
                ManagedPage::HIDE_TITLE_META => $hideTitle ? '1' : '0',
            ],
        ];

        // wp_slash(): both functions, and update_post_meta() behind meta_input, unslash their
        // input. Without it every backslash in the pushed HTML (inline JS, a regex) is lost.
        $result = $existingId === null
            ? wp_insert_post(wp_slash($postarr), true)
            : wp_update_post(wp_slash($postarr + ['ID' => $existingId]), true);

        if (is_wp_error($result)) {
            return $this->error(500, $result->get_error_message());
        }

        // Reading settings synced before toArray(): get_permalink() answers the site root only
        // once this page is the front page, and /home/ again once it no longer is.
        $id        = (int) $result;
        $frontPage = $slug === self::FRONT_PAGE_SLUG ? $this->syncFrontPage($id, $status) : null;
        $data      = $this->toArray($id);
        if ($frontPage !== null) {
            $data['frontPage'] = $frontPage;
        }

        return new WP_REST_Response($data, $existingId === null ? 201 : 200);
    }

    // Returns what changed on the Reading settings, null when nothing did. Only a published page
    // becomes the front page: a draft one would show visitors an empty home. Going back to draft
    // while it is the front page reverts to the latest posts, the same reset WordPress itself
    // applies when a front page is trashed (_reset_front_page_settings_for_post()).
    private function syncFrontPage(int $id, string $status): ?string
    {
        $isFrontPage = get_option('show_on_front') === 'page' && (int) get_option('page_on_front') === $id;

        if ($status === 'publish' && !$isFrontPage) {
            update_option('show_on_front', 'page');
            update_option('page_on_front', $id);
            return 'set';
        }

        if ($status !== 'publish' && $isFrontPage) {
            update_option('show_on_front', 'posts');
            update_option('page_on_front', 0);
            return 'unset';
        }

        return null;
    }

    /** @return int[] */
    private function managedPageIds(): array
    {
        return array_map('intval', get_posts([
            'post_type'   => 'page',
            'post_status' => 'any',
            'numberposts' => -1,
            'fields'      => 'ids',
            'orderby'     => 'name',
            'order'       => 'ASC',
            'meta_key'    => ManagedPage::MARKER_META, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
            'meta_value'  => '1', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
        ]));
    }

    private function pageIdBySlug(string $slug): ?int
    {
        $ids = get_posts([
            'post_type'   => 'page',
            'post_status' => 'any',
            'name'        => $slug,
            'numberposts' => 1,
            'fields'      => 'ids',
        ]);

        return $ids === [] ? null : (int) $ids[0];
    }

    private function trashedManagedPageId(string $slug): ?int
    {
        $ids = get_posts([
            'post_type'   => 'page',
            'post_status' => 'trash',
            'numberposts' => 1,
            'fields'      => 'ids',
            'meta_query'  => [ // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
                ['key' => '_wp_desired_post_slug', 'value' => $slug],
                ['key' => ManagedPage::MARKER_META, 'value' => '1'],
            ],
        ]);

        return $ids === [] ? null : (int) $ids[0];
    }

    private function otherPagesBytes(?int $excludeId): int
    {
        $total = 0;
        foreach ($this->managedPageIds() as $id) {
            if ($id !== $excludeId) {
                $total += strlen((string) get_post_meta($id, ManagedPage::HTML_META, true));
            }
        }

        return $total;
    }

    /** @return array{slug: string, title: string, status: string, link: string, html: string, fullWidth: bool, hideTitle: bool, template: string} */
    private function toArray(int $id): array
    {
        $post = get_post($id);
        if (!$post instanceof WP_Post) {
            throw new \RuntimeException(esc_html("Page {$id} not found"));
        }

        return [
            'slug'      => $post->post_name,
            'title'     => $post->post_title,
            'status'    => $post->post_status,
            'link'      => (string) get_permalink($post),
            'html'      => (string) get_post_meta($id, ManagedPage::HTML_META, true),
            'fullWidth' => get_post_meta($id, ManagedPage::FULL_WIDTH_META, true) === '1',
            'hideTitle' => get_post_meta($id, ManagedPage::HIDE_TITLE_META, true) === '1',
            'template'  => (string) get_page_template_slug($post),
        ];
    }

    private function error(int $status, string $message): WP_REST_Response
    {
        return new WP_REST_Response(['error' => $message], $status);
    }
}
