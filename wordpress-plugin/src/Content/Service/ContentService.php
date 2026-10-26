<?php

declare(strict_types=1);

namespace Loopress\Content\Service;

use Loopress\Content\Exception\InvalidContentRowException;
use Loopress\Content\Exception\NotLocalEnvironmentException;
use Loopress\Infrastructure\Narrow;

// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- every IN list is either %s placeholders passed to prepare(), or integers from (int)/intval.

// `lps content pull`: copies a site's content (posts of public post types, terms of public
// taxonomies, their meta and relationships) into the local site, IDs unchanged so every
// reference between them still holds. Code goes up, content comes down: the export runs on any
// site, the import only on a "local" one. Users, comments and orders are never exported, every
// imported post is attributed to the importing user. Whatever Loopress versions (menus, ACF,
// snippets, templates...) is not content: the CLI re-pushes the repo right after the import.
final class ContentService
{
    public const SOURCE_OPTION = 'loopress_content_source';

    private const POST_COLUMNS = [
        'ID', 'post_date', 'post_date_gmt', 'post_content', 'post_title', 'post_excerpt', 'post_status',
        'comment_status', 'ping_status', 'post_password', 'post_name', 'to_ping', 'pinged', 'post_modified',
        'post_modified_gmt', 'post_content_filtered', 'post_parent', 'guid', 'menu_order', 'post_type', 'post_mime_type',
    ];
    private const META_COLUMNS       = ['meta_key', 'meta_value'];
    private const RELATIONSHIP_COLUMNS = ['object_id', 'term_taxonomy_id', 'term_order'];
    private const TERM_COLUMNS       = ['term_id', 'name', 'slug', 'term_group'];
    private const TAXONOMY_COLUMNS   = ['term_taxonomy_id', 'term_id', 'taxonomy', 'description', 'parent', 'count'];
    private const SKIPPED_META_KEYS  = ['_edit_lock', '_edit_last'];

    /** @return array{home: string, uploadsUrl: string, postTypes: list<string>, taxonomies: list<string>} */
    public function info(): array
    {
        return [
            'home'       => home_url(),
            'uploadsUrl' => wp_get_upload_dir()['baseurl'],
            'postTypes'  => $this->postTypes(),
            'taxonomies' => $this->taxonomies(),
        ];
    }

    /** @return array{posts: list<array<string, mixed>>, postmeta: list<array<string, mixed>>, termRelationships: list<array<string, mixed>>, next: ?int} */
    public function exportPosts(int $after, int $limit): array
    {
        /** @var \wpdb $wpdb */
        global $wpdb;

        $types = $this->postTypes();
        /** @var list<array<string, mixed>> $posts */
        $posts = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$wpdb->posts} WHERE ID > %d AND post_type IN (" . $this->placeholders($types) . ") AND post_status NOT IN ('auto-draft', 'trash') ORDER BY ID LIMIT %d",
            $after,
            ...[...$types, $limit],
        ), ARRAY_A);

        $ids = array_map(static fn(array $post): int => Narrow::int($post['ID'] ?? 0), $posts);
        if ($ids === []) {
            return ['posts' => [], 'postmeta' => [], 'termRelationships' => [], 'next' => null];
        }

        $in = implode(',', $ids);
        /** @var list<array<string, mixed>> $postmeta */
        $postmeta = $wpdb->get_results($wpdb->prepare(
            "SELECT post_id, meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id IN ({$in}) AND meta_key NOT IN (" . $this->placeholders(self::SKIPPED_META_KEYS) . ')',
            ...self::SKIPPED_META_KEYS,
        ), ARRAY_A);

        $taxonomies = $this->taxonomies();
        /** @var list<array<string, mixed>> $relationships */
        $relationships = $taxonomies === [] ? [] : $wpdb->get_results($wpdb->prepare(
            "SELECT tr.object_id, tr.term_taxonomy_id, tr.term_order FROM {$wpdb->term_relationships} tr INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id WHERE tr.object_id IN ({$in}) AND tt.taxonomy IN (" . $this->placeholders($taxonomies) . ')',
            ...$taxonomies,
        ), ARRAY_A);

        return [
            'posts'             => $posts,
            'postmeta'          => $postmeta,
            'termRelationships' => $relationships,
            'next'              => count($ids) < $limit ? null : max($ids),
        ];
    }

    /** @return array{terms: list<array<string, mixed>>, termTaxonomy: list<array<string, mixed>>, termmeta: list<array<string, mixed>>, next: ?int} */
    public function exportTerms(int $after, int $limit): array
    {
        /** @var \wpdb $wpdb */
        global $wpdb;

        $taxonomies = $this->taxonomies();
        if ($taxonomies === []) {
            return ['terms' => [], 'termTaxonomy' => [], 'termmeta' => [], 'next' => null];
        }

        $placeholders = $this->placeholders($taxonomies);
        /** @var list<array<string, mixed>> $terms */
        $terms = $wpdb->get_results($wpdb->prepare(
            "SELECT DISTINCT t.* FROM {$wpdb->terms} t INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_id = t.term_id WHERE t.term_id > %d AND tt.taxonomy IN ({$placeholders}) ORDER BY t.term_id LIMIT %d",
            $after,
            ...[...$taxonomies, $limit],
        ), ARRAY_A);

        $ids = array_map(static fn(array $term): int => Narrow::int($term['term_id'] ?? 0), $terms);
        if ($ids === []) {
            return ['terms' => [], 'termTaxonomy' => [], 'termmeta' => [], 'next' => null];
        }

        $in = implode(',', $ids);
        /** @var list<array<string, mixed>> $termTaxonomy */
        $termTaxonomy = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$wpdb->term_taxonomy} WHERE term_id IN ({$in}) AND taxonomy IN ({$placeholders})",
            ...$taxonomies,
        ), ARRAY_A);
        /** @var list<array<string, mixed>> $termmeta */
        $termmeta = $wpdb->get_results("SELECT term_id, meta_key, meta_value FROM {$wpdb->termmeta} WHERE term_id IN ({$in})", ARRAY_A);

        return [
            'terms'        => $terms,
            'termTaxonomy' => $termTaxonomy,
            'termmeta'     => $termmeta,
            'next'         => count($ids) < $limit ? null : max($ids),
        ];
    }

    // Deletes every local post of a public post type and every term of a public taxonomy, then
    // remembers the source site for the URL rewriting of the imports that follow and for
    // RemoteUploads.
    /** @return array{posts: int, terms: int} */
    public function reset(string $sourceHome, string $sourceUploadsUrl): array
    {
        /** @var \wpdb $wpdb */
        global $wpdb;
        $this->assertLocal();

        $types = $this->postTypes();
        $postIds = array_map('intval', $wpdb->get_col($wpdb->prepare(
            "SELECT ID FROM {$wpdb->posts} WHERE post_type IN (" . $this->placeholders($types) . ')',
            ...$types,
        )));
        $this->deletePosts($postIds);

        $taxonomies = $this->taxonomies();
        $termIds = $taxonomies === [] ? [] : array_map('intval', $wpdb->get_col($wpdb->prepare(
            "SELECT DISTINCT term_id FROM {$wpdb->term_taxonomy} WHERE taxonomy IN (" . $this->placeholders($taxonomies) . ')',
            ...$taxonomies,
        )));
        $this->deleteTerms($termIds, []);

        update_option(self::SOURCE_OPTION, ['home' => $sourceHome, 'uploadsUrl' => $sourceUploadsUrl], false);
        wp_cache_flush();

        return ['posts' => count($postIds), 'terms' => count($termIds)];
    }

    // Any local row holding an incoming ID is replaced, whatever its type: a versioned one
    // (an ACF group, a menu item...) is restored by the push that follows the import.
    /**
     * @param list<mixed> $posts
     * @param list<mixed> $postmeta
     * @param list<mixed> $relationships
     * @return array{posts: int}
     */
    public function importPosts(array $posts, array $postmeta, array $relationships): array
    {
        /** @var \wpdb $wpdb */
        global $wpdb;
        $this->assertLocal();

        $rows = array_map(fn(mixed $post): array => $this->pick($post, self::POST_COLUMNS), $posts);
        $ids  = array_map(static fn(array $row): int => (int) ($row['ID'] ?? 0), $rows);
        $this->deletePosts($ids);

        $rewriter = $this->rewriter();
        $author   = get_current_user_id();
        foreach ($rows as $row) {
            foreach (['post_content', 'post_excerpt', 'post_content_filtered'] as $column) {
                $this->rewriteColumn($rewriter, $row, $column);
            }

            $this->write($wpdb->posts, ['post_author' => $author, 'comment_count' => 0] + $row);
        }

        $known = array_flip($ids);
        foreach ($postmeta as $meta) {
            $row = $this->pick($meta, ['post_id', ...self::META_COLUMNS]);
            if (isset($known[(int) ($row['post_id'] ?? 0)])) {
                $this->rewriteColumn($rewriter, $row, 'meta_value');
                $this->write($wpdb->postmeta, $row);
            }
        }

        foreach ($relationships as $relationship) {
            $row = $this->pick($relationship, self::RELATIONSHIP_COLUMNS);
            if (isset($known[(int) ($row['object_id'] ?? 0)])) {
                $this->write($wpdb->term_relationships, $row, true);
            }
        }

        wp_cache_flush();

        return ['posts' => count($rows)];
    }

    /**
     * @param list<mixed> $terms
     * @param list<mixed> $termTaxonomy
     * @param list<mixed> $termmeta
     * @return array{terms: int}
     */
    public function importTerms(array $terms, array $termTaxonomy, array $termmeta): array
    {
        /** @var \wpdb $wpdb */
        global $wpdb;
        $this->assertLocal();

        $termRows     = array_map(fn(mixed $term): array => $this->pick($term, self::TERM_COLUMNS), $terms);
        $taxonomyRows = array_map(fn(mixed $row): array => $this->pick($row, self::TAXONOMY_COLUMNS), $termTaxonomy);
        $ids          = array_map(static fn(array $row): int => (int) ($row['term_id'] ?? 0), $termRows);
        $this->deleteTerms($ids, array_map(static fn(array $row): int => (int) ($row['term_taxonomy_id'] ?? 0), $taxonomyRows));

        $known = array_flip($ids);
        foreach ($termRows as $row) {
            $this->write($wpdb->terms, $row);
        }

        foreach ($taxonomyRows as $row) {
            if (isset($known[(int) ($row['term_id'] ?? 0)])) {
                $this->write($wpdb->term_taxonomy, $row);
            }
        }

        $rewriter = $this->rewriter();
        foreach ($termmeta as $meta) {
            $row = $this->pick($meta, ['term_id', ...self::META_COLUMNS]);
            if (isset($known[(int) ($row['term_id'] ?? 0)])) {
                $this->rewriteColumn($rewriter, $row, 'meta_value');
                $this->write($wpdb->termmeta, $row);
            }
        }

        foreach (array_unique(array_column($taxonomyRows, 'taxonomy')) as $taxonomy) {
            clean_taxonomy_cache((string) $taxonomy);
        }
        wp_cache_flush();

        return ['terms' => count($termRows)];
    }

    private function assertLocal(): void
    {
        if (wp_get_environment_type() !== 'local') {
            throw new NotLocalEnvironmentException(
                'Content import deletes this site\'s posts and terms, so it only runs on a site whose environment type is "local". Add define(\'WP_ENVIRONMENT_TYPE\', \'local\'); to its wp-config.php if it is a local site.',
            );
        }
    }

    /** @param array<int> $ids */
    private function deletePosts(array $ids): void
    {
        /** @var \wpdb $wpdb */
        global $wpdb;

        foreach (array_chunk($ids, 500) as $chunk) {
            $in = implode(',', $chunk);
            $wpdb->query("DELETE FROM {$wpdb->postmeta} WHERE post_id IN ({$in})");
            $wpdb->query("DELETE FROM {$wpdb->term_relationships} WHERE object_id IN ({$in})");
            $wpdb->query("DELETE FROM {$wpdb->posts} WHERE ID IN ({$in})");
        }
    }

    /**
     * @param array<int> $termIds
     * @param array<int> $termTaxonomyIds rows to delete on top of those of $termIds
     */
    private function deleteTerms(array $termIds, array $termTaxonomyIds): void
    {
        /** @var \wpdb $wpdb */
        global $wpdb;

        foreach (array_chunk($termIds, 500) as $chunk) {
            $in = implode(',', $chunk);
            $termTaxonomyIds = [...$termTaxonomyIds, ...array_map('intval', $wpdb->get_col("SELECT term_taxonomy_id FROM {$wpdb->term_taxonomy} WHERE term_id IN ({$in})"))];
            $wpdb->query("DELETE FROM {$wpdb->termmeta} WHERE term_id IN ({$in})");
            $wpdb->query("DELETE FROM {$wpdb->terms} WHERE term_id IN ({$in})");
        }

        foreach (array_chunk(array_unique($termTaxonomyIds), 500) as $chunk) {
            $in = implode(',', $chunk);
            $wpdb->query("DELETE FROM {$wpdb->term_relationships} WHERE term_taxonomy_id IN ({$in})");
            $wpdb->query("DELETE FROM {$wpdb->term_taxonomy} WHERE term_taxonomy_id IN ({$in})");
        }
    }

    // A failed write must fail the batch: reported as imported, it would let the CLI carry on and
    // push over a site that is missing rows.
    /** @param array<string, null|scalar> $row */
    private function write(string $table, array $row, bool $replace = false): void
    {
        /** @var \wpdb $wpdb */
        global $wpdb;

        $written = $replace ? $wpdb->replace($table, $row) : $wpdb->insert($table, $row);
        if ($written === false) {
            // phpcs:disable WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML: esc_html() would print &quot; (see phpcs.xml.dist).
            throw new \RuntimeException("Could not write to {$table}: {$wpdb->last_error}");
            // phpcs:enable WordPress.Security.EscapeOutput.ExceptionNotEscaped
        }
    }

    // The trust boundary: column names go into SQL unescaped by $wpdb->insert(), so only the
    // listed ones are kept, and every value must be a scalar or null. The first listed column is
    // the row's key and is required, the others fall back to the table's defaults when absent.
    /**
     * @param non-empty-list<string> $columns
     * @return array<string, null|scalar>
     */
    private function pick(mixed $row, array $columns): array
    {
        if (!is_array($row) || !isset($row[$columns[0]])) {
            // phpcs:disable WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML: esc_html() would print &quot; (see phpcs.xml.dist).
            throw new InvalidContentRowException("Each row must be a JSON object with a \"{$columns[0]}\".");
            // phpcs:enable WordPress.Security.EscapeOutput.ExceptionNotEscaped
        }

        $picked = [];
        foreach ($columns as $column) {
            if (!array_key_exists($column, $row)) {
                continue;
            }

            $value = $row[$column];
            if ($value !== null && !is_scalar($value)) {
                // phpcs:disable WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML: esc_html() would print &quot; (see phpcs.xml.dist).
                throw new InvalidContentRowException("Column \"{$column}\" must be a scalar or null.");
                // phpcs:enable WordPress.Security.EscapeOutput.ExceptionNotEscaped
            }

            $picked[$column] = $value;
        }

        return $picked;
    }

    /** @param array<string, null|scalar> $row */
    private function rewriteColumn(UrlRewriter $rewriter, array &$row, string $column): void
    {
        if (isset($row[$column])) {
            $row[$column] = $rewriter->rewrite((string) $row[$column]);
        }
    }

    private function rewriter(): UrlRewriter
    {
        $source = get_option(self::SOURCE_OPTION);
        $home   = is_array($source) ? Narrow::string($source['home'] ?? '') : '';
        $uploads = is_array($source) ? Narrow::string($source['uploadsUrl'] ?? '') : '';

        return new UrlRewriter($home, home_url(), $uploads);
    }

    /** @return list<string> */
    private function postTypes(): array
    {
        return array_values(get_post_types(['public' => true]));
    }

    /** @return list<string> */
    private function taxonomies(): array
    {
        return array_values(get_taxonomies(['public' => true]));
    }

    /** @param list<string> $values */
    private function placeholders(array $values): string
    {
        return implode(',', array_fill(0, count($values), '%s'));
    }
}
