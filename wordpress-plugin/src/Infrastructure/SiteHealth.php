<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

/**
 * Surfaces a feature's diagnostics in WordPress's own Tools > Site Health screen, where admins
 * already look, instead of a Loopress-only tab nobody opens unless something is visibly broken.
 * Shared so each feature (dependencies, apps) only supplies its issue list.
 */
final class SiteHealth
{
    /**
     * @param callable(): list<array{code: string, message: string}> $issues
     */
    public static function register(string $id, string $label, string $tab, callable $issues): void
    {
        add_filter('site_status_tests', static function (array $tests) use ($id, $label, $tab, $issues): array {
            $tests['direct'][$id] = [
                'label' => $label,
                'test'  => static function () use ($id, $label, $tab, $issues): array {
                    try {
                        $found = $issues();
                    } catch (\Throwable $e) {
                        // A failing probe must not break the whole Site Health screen.
                        $found = [['code' => 'probe_failed', 'message' => $e->getMessage()]];
                    }

                    return self::result($id, $label, $tab, $found);
                },
            ];

            return $tests;
        });
    }

    /**
     * @param list<array{code: string, message: string}> $issues
     * @return array<string, mixed>
     */
    public static function result(string $id, string $label, string $tab, array $issues): array
    {
        $result = [
            'label'       => $label . ': no issues found',
            'status'      => 'good',
            'badge'       => ['label' => 'Loopress', 'color' => 'blue'],
            'description' => '',
            'actions'     => '',
            'test'        => $id,
        ];

        if ($issues === []) {
            return $result;
        }

        $result['label']       = $label . ' needs attention';
        $result['status']      = 'recommended';
        $result['description'] = implode('', array_map(
            static fn(array $issue): string => '<p>' . esc_html($issue['message']) . '</p>',
            $issues,
        ));
        $result['actions'] = sprintf(
            '<p><a href="%s">Open Loopress</a></p>',
            esc_url(admin_url('admin.php?page=loopress#' . $tab)),
        );

        return $result;
    }
}
