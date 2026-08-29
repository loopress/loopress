<?php

declare(strict_types=1);

namespace Loopress\Seo\Service;

use Loopress\Seo\Contract\SeoRedirectProvider;
use Loopress\Seo\Exception\RedirectsUnavailableException;

// One of two interchangeable SeoProvider backends (see SeoService for the arbitration between
// this and YoastService), the same shape as CodeSnippetsSnippetProvider/WPCodeSnippetProvider.
// RankMath is also the only one of the two implementing SeoRedirectProvider: Yoast's equivalent
// is Premium-only.
//
// Post-level SEO data (title, description, robots, canonical, social, and per-post schema
// blocks) is all stored as postmeta prefixed `rank_math_`. Rather than hardcoding the list of
// known keys (long, and grows whenever RankMath ships a new field or schema type), the generic
// `rank_math_*` sync in AbstractSeoService reads and writes back whatever RankMath itself
// writes, with no allowlist to keep in sync with RankMath's own releases. Only the redirects
// half below is RankMath-specific.
class RankMathService extends AbstractSeoService implements SeoRedirectProvider
{
    public function isActive(): bool
    {
        return defined('RANK_MATH_VERSION');
    }

    protected function metaPrefix(): string
    {
        return 'rank_math_';
    }

    protected function optionTitles(): string
    {
        return 'rank-math-options-titles';
    }

    protected function providerLabel(): string
    {
        return 'RankMath';
    }

    // ── Redirects ───────────────────────────────────────────────────────────────────────

    /** @return array<int, array<string, mixed>> */
    public function listRedirections(): array
    {
        global $wpdb;
        $this->requireRedirectionsModuleEnabled();

        $rows = $wpdb->get_results(
            $wpdb->prepare("SELECT * FROM %i WHERE status != 'trashed' ORDER BY id ASC", $this->redirectionsTable()),
            ARRAY_A
        );

        return array_map([$this, 'exportRedirection'], $rows ?? []);
    }

    /** @return array<string, mixed>|null */
    public function getRedirection(int $id): ?array
    {
        global $wpdb;
        $this->requireRedirectionsModuleEnabled();

        $row = $wpdb->get_row(
            $wpdb->prepare('SELECT * FROM %i WHERE id = %d', $this->redirectionsTable(), $id),
            ARRAY_A
        );

        return $row === null ? null : $this->exportRedirection($row);
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function createRedirection(array $data): array
    {
        global $wpdb;
        $this->requireRedirectionsModuleEnabled();

        $now = current_time('mysql');
        $wpdb->insert($this->redirectionsTable(), [
            'created'     => $now,
            'header_code' => (int) ($data['headerCode'] ?? 301),
            'hits'        => 0,
            'sources'     => maybe_serialize($data['sources'] ?? []),
            'status'      => (string) ($data['status'] ?? 'active'),
            'updated'     => $now,
            'url_to'      => (string) ($data['urlTo'] ?? ''),
        ]);

        return $this->getRedirection((int) $wpdb->insert_id) ?? [];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>|null
     */
    public function updateRedirection(int $id, array $data): ?array
    {
        global $wpdb;
        $this->requireRedirectionsModuleEnabled();

        if ($this->getRedirection($id) === null) {
            return null;
        }

        $update = ['updated' => current_time('mysql')];
        if (isset($data['sources'])) {
            $update['sources'] = maybe_serialize($data['sources']);
        }
        if (isset($data['urlTo'])) {
            $update['url_to'] = (string) $data['urlTo'];
        }
        if (isset($data['headerCode'])) {
            $update['header_code'] = (int) $data['headerCode'];
        }
        if (isset($data['status'])) {
            $update['status'] = (string) $data['status'];
        }

        $wpdb->update($this->redirectionsTable(), $update, ['id' => $id]);

        return $this->getRedirection($id);
    }

    // Table/column names (`{$wpdb->prefix}rank_math_redirections`; id, sources, url_to,
    // header_code, status, hits, created, updated) confirmed against RankMath's own
    // includes/class-installer.php on a real install (e2e/rankmath-sync.spec.ts exercises this
    // against that same real install).
    private function redirectionsTable(): string
    {
        global $wpdb;

        return $wpdb->prefix . 'rank_math_redirections';
    }

    // Unlike the plugin-wide isActive() gate (checked at the REST controller, same as every
    // other resource here), Redirections is one of several optional modules RankMath ships
    // disabled by default (Dashboard > Modules): its table is only created once an admin turns
    // it on. Discovered by hand against a real install, where the table was genuinely absent;
    // without this guard, the queries above would silently return an empty list or fail with an
    // opaque "table doesn't exist" error instead of pointing at the actual cause.
    private function requireRedirectionsModuleEnabled(): void
    {
        $modules = get_option('rank_math_modules', []);
        if (!is_array($modules) || !in_array('redirections', $modules, true)) {
            throw new RedirectsUnavailableException('The RankMath Redirections module is not enabled. Enable it under RankMath > Dashboard > Modules.');
        }
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function exportRedirection(array $row): array
    {
        return [
            'createdAt'  => $row['created'] ?? null,
            'headerCode' => (int) ($row['header_code'] ?? 301),
            'hits'       => (int) ($row['hits'] ?? 0),
            'id'         => (int) $row['id'],
            'sources'    => maybe_unserialize($row['sources'] ?? ''),
            'status'     => (string) ($row['status'] ?? 'active'),
            'updatedAt'  => $row['updated'] ?? null,
            'urlTo'      => (string) ($row['url_to'] ?? ''),
        ];
    }
}
