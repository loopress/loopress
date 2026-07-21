<?php

namespace Loopress\Tests\Stubs;

// Minimal in-memory stand-in for WordPress's $wpdb, used only by RankMathService's redirects
// tests. RankMathService accesses $wpdb through an untyped `global $wpdb`, so any object
// exposing these method/property names duck-types as a drop-in replacement, no real wpdb
// class needed.
class FakeWpdb
{
    public string $prefix = 'wp_';
    public int $insert_id = 0;

    /** @var array<int, array<string, mixed>> */
    public array $rows = [];

    private int $nextId = 1;

    /** @return array{args: array<int, mixed>} */
    public function prepare(string $query, mixed ...$args): array
    {
        return ['args' => $args];
    }

    /** @param array{args: array<int, mixed>}|string $prepared @return array<int, array<string, mixed>> */
    public function get_results(array|string $prepared, string $output = 'ARRAY_A'): array
    {
        return array_values(array_filter($this->rows, fn(array $row): bool => $row['status'] !== 'trashed'));
    }

    /**
     * The id is always the last placeholder in the queries RankMathService issues (the table
     * name, passed via `%i`, comes first when present), so this reads the last prepared arg
     * rather than a fixed index.
     *
     * @param array{args: array<int, mixed>}|string $prepared @return array<string, mixed>|null
     */
    public function get_row(array|string $prepared, string $output = 'ARRAY_A'): ?array
    {
        $args = is_array($prepared) ? $prepared['args'] : [];
        $id   = (int) ($args === [] ? 0 : $args[array_key_last($args)]);

        return $this->rows[$id] ?? null;
    }

    /** @param array<string, mixed> $data */
    public function insert(string $table, array $data): void
    {
        $id = $this->nextId++;
        $this->rows[$id] = array_merge(['id' => $id], $data);
        $this->insert_id = $id;
    }

    /** @param array<string, mixed> $data @param array<string, mixed> $where */
    public function update(string $table, array $data, array $where): void
    {
        $id = (int) ($where['id'] ?? 0);
        if (isset($this->rows[$id])) {
            $this->rows[$id] = array_merge($this->rows[$id], $data);
        }
    }
}
