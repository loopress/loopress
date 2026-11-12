<?php

declare(strict_types=1);

namespace Loopress\Tests\Stubs;

use Loopress\Infrastructure\Narrow;

// Stand-in for $wpdb around the content copy: SELECTs answer with the rows a test queued (in
// call order), every write and delete is recorded so a test can assert what reached the tables.
final class FakeContentWpdb
{
    public string $prefix            = 'wp_';
    public string $posts             = 'wp_posts';
    public string $postmeta          = 'wp_postmeta';
    public string $terms             = 'wp_terms';
    public string $termmeta          = 'wp_termmeta';
    public string $term_taxonomy     = 'wp_term_taxonomy';
    public string $term_relationships = 'wp_term_relationships';
    public string $last_error        = 'disk full';
    public bool $failWrites          = false;

    /** @var list<list<array<string, mixed>>> */
    public array $results = [];
    /** @var list<list<string>> */
    public array $columns = [];
    /** @var list<string> */
    public array $queries = [];
    /** @var list<array{string, array<string, mixed>}> */
    public array $inserted = [];
    /** @var list<array{string, array<string, mixed>}> */
    public array $replaced = [];

    public function prepare(string $query, mixed ...$args): string
    {
        return vsprintf(str_replace(['%s', '%d'], ["'%s'", '%d'], $query), array_map(Narrow::string(...), $args));
    }

    /** @return list<array<string, mixed>> */
    public function get_results(string $query, string $output = ''): array
    {
        $this->queries[] = $query;

        return array_shift($this->results) ?? [];
    }

    /** @return list<string> */
    public function get_col(string $query): array
    {
        $this->queries[] = $query;

        return array_shift($this->columns) ?? [];
    }

    public function query(string $query): int
    {
        $this->queries[] = $query;

        return 1;
    }

    /** @param array<string, mixed> $row */
    public function insert(string $table, array $row): int|false
    {
        $this->inserted[] = [$table, $row];

        return $this->failWrites ? false : 1;
    }

    /** @param array<string, mixed> $row */
    public function replace(string $table, array $row): int|false
    {
        $this->replaced[] = [$table, $row];

        return $this->failWrites ? false : 1;
    }
}
