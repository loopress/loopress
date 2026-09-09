<?php

declare(strict_types=1);

namespace Loopress\Tests\Stubs;

// Minimal in-memory stand-in for $wpdb, used only by OptionsServiceTest for the raw SQL
// OptionsService issues to read autoload and enumerate option names (get_option()/update_
// option()/delete_option() cover everything else and are stubbed via Brain\Monkey instead).
class FakeOptionsWpdb
{
    public string $options = 'wp_options';

    /** @var array<string, string> option_name => autoload */
    public array $rows = [];

    public function prepare(string $query, mixed ...$args): string
    {
        foreach ($args as $arg) {
            $query = preg_replace('/%s/', "'" . addslashes((string) $arg) . "'", $query, 1);
        }

        return $query;
    }

    public function esc_like(string $text): string
    {
        return addcslashes($text, '_%\\');
    }

    /** @return array<int, array<string, string>> */
    public function get_results(string $query, string $output = 'ARRAY_A'): array
    {
        $results = [];
        foreach ($this->rows as $name => $autoload) {
            if (str_starts_with($name, '_transient_') || str_starts_with($name, '_site_transient_')) {
                continue;
            }

            $results[] = ['option_name' => $name, 'autoload' => $autoload];
        }

        ksort($results);

        return $results;
    }

    public function get_var(string $query): ?string
    {
        foreach ($this->rows as $name => $autoload) {
            if (str_contains($query, "= '{$name}'")) {
                return $autoload;
            }
        }

        return null;
    }
}
