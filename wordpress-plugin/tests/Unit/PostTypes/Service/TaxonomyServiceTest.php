<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\PostTypes\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\PostTypes\Exception\InvalidDeclarationException;
use Loopress\PostTypes\Service\TaxonomyService;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

// The shared behaviour (revisions, flush, conflicts, a throwing entry) is covered once, in
// PostTypeServiceTest; this covers what is specific to taxonomies.
class TaxonomyServiceTest extends TestCase
{
    /** @var array<string, mixed> In-memory wp_options. */
    private array $options = [];

    /** @var array<string, array{objectType: mixed, args: array<string, mixed>}> What register_taxonomy() received. */
    private array $wpRegistered = [];

    /** @var array<string, object> What register_taxonomy() returned, as WordPress keeps it. */
    private array $wpObjects = [];

    private TaxonomyService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        Functions\when('get_option')->alias(fn (string $name, mixed $fallback = false): mixed => $this->options[$name] ?? $fallback);
        Functions\when('update_option')->alias(function (string $name, mixed $value): bool {
            $this->options[$name] = $value;
            return true;
        });
        Functions\when('wp_json_encode')->alias(static fn (mixed $data): string|false => json_encode($data));
        Functions\when('is_wp_error')->justReturn(false);
        Functions\when('taxonomy_exists')->alias(fn (string $slug): bool => isset($this->wpRegistered[$slug]));
        Functions\when('register_taxonomy')->alias(function (string $slug, mixed $objectType, array $args): object {
            $this->wpRegistered[$slug] = ['objectType' => $objectType, 'args' => $args];
            $this->wpObjects[$slug]    = (object) [
                'label' => $args['label'] ?? $slug, '_builtin' => false, 'public' => true, 'show_ui' => true, 'object_type' => $objectType,
            ];

            return $this->wpObjects[$slug];
        });

        $this->service = new TaxonomyService();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_object_type_is_stored_with_the_args_but_passed_as_the_second_parameter(): void
    {
        $this->service->upsert('genre', ['object_type' => ['book'], 'hierarchical' => true]);

        $this->assertSame(['genre' => ['object_type' => ['book'], 'hierarchical' => true]], $this->options[TaxonomyService::OPTION]);

        $this->service->register();

        $this->assertSame(['objectType' => ['book'], 'args' => ['hierarchical' => true]], $this->wpRegistered['genre']);
    }

    public function test_a_taxonomy_without_object_type_registers_unattached(): void
    {
        $this->service->upsert('genre', []);
        $this->service->register();

        $this->assertSame([], $this->wpRegistered['genre']['objectType']);
    }

    /** @return array<string, array{string, array<string, mixed>}> */
    public static function invalidTaxonomies(): array
    {
        return [
            'slug over 32 chars'  => [str_repeat('a', 33), []],
            'core taxonomy'       => ['category', []],
            'public query var'    => ['year', []],
            'object_type string'  => ['genre', ['object_type' => 'book']],
            'meta box callback'   => ['genre', ['meta_box_cb' => 'system']],
            'count callback'      => ['genre', ['update_count_callback' => 'system']],
        ];
    }

    /** @param array<string, mixed> $args */
    #[DataProvider('invalidTaxonomies')]
    public function test_upsert_refuses_invalid_taxonomies(string $slug, array $args): void
    {
        $this->expectException(InvalidDeclarationException::class);
        $this->service->upsert($slug, $args);
    }

    public function test_a_32_char_slug_is_accepted(): void
    {
        $slug = str_repeat('a', 32);

        $this->assertSame($slug, $this->service->upsert($slug, [])['slug']);
    }

    public function test_registered_reports_the_source_terms_and_attached_post_types(): void
    {
        $this->options[TaxonomyService::OPTION] = ['genre' => ['object_type' => ['book']]];
        $this->options['cptui_taxonomies']      = ['region' => []];
        $this->service->register();

        Functions\when('get_taxonomies')->justReturn([
            'category' => (object) ['label' => 'Categories', '_builtin' => true, 'public' => true, 'show_ui' => true, 'object_type' => ['post']],
            'genre'    => $this->wpObjects['genre'],
            'region'   => (object) ['label' => 'Regions', '_builtin' => false, 'public' => true, 'show_ui' => true, 'object_type' => ['event']],
            'internal' => (object) ['label' => 'Internal', '_builtin' => false, 'public' => false, 'show_ui' => false, 'object_type' => []],
        ]);
        Functions\when('wp_count_terms')->justReturn('4');

        $this->assertSame(
            [
                ['slug' => 'category', 'label' => 'Categories', 'source' => 'wordpress', 'count' => 4, 'objectTypes' => ['post'], 'managed' => false, 'conflict' => false],
                ['slug' => 'genre', 'label' => 'genre', 'source' => 'loopress', 'count' => 4, 'objectTypes' => ['book'], 'managed' => true, 'conflict' => false],
                ['slug' => 'region', 'label' => 'Regions', 'source' => 'cptui', 'count' => 4, 'objectTypes' => ['event'], 'managed' => false, 'conflict' => false],
            ],
            $this->service->registered(),
        );
    }
}
