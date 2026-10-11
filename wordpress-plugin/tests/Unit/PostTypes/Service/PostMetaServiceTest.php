<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\PostTypes\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\PostTypes\Exception\InvalidDeclarationException;
use Loopress\PostTypes\Service\AbstractDeclaredTypeService;
use Loopress\PostTypes\Service\PostMetaService;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

// The shared behaviour (revisions, a throwing entry) is covered once, in PostTypeServiceTest;
// this covers what is specific to post meta: per-key arguments and per-key conflicts.
class PostMetaServiceTest extends TestCase
{
    /** @var array<string, mixed> In-memory wp_options. */
    private array $options = [];

    /** @var array<string, array<string, array<string, mixed>>> post type => key => args, as WordPress keeps them. */
    private array $wpMeta = [];

    private PostMetaService $service;

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
        Functions\when('registered_meta_key_exists')->alias(fn (string $type, string $key, string $postType): bool => isset($this->wpMeta[$postType][$key]));
        Functions\when('register_post_meta')->alias(function (string $postType, string $key, array $args): bool {
            $this->wpMeta[$postType][$key] = $args;
            return true;
        });
        Functions\when('get_registered_meta_keys')->alias(fn (string $type, string $postType): array => $this->wpMeta[$postType] ?? []);

        $this->service = new PostMetaService();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_each_key_is_registered_on_the_post_type_without_a_rewrite_flush(): void
    {
        $this->service->upsert('book', [
            'isbn'  => ['type' => 'string', 'single' => true, 'show_in_rest' => true],
            '_note' => ['type' => 'string'],
        ]);
        $this->service->register();

        $this->assertSame(['type' => 'string', 'single' => true, 'show_in_rest' => true], $this->wpMeta['book']['isbn']);
        $this->assertSame(['type' => 'string'], $this->wpMeta['book']['_note']);
        $this->assertArrayNotHasKey(AbstractDeclaredTypeService::FLUSH_OPTION, $this->options);
    }

    public function test_built_in_post_types_are_accepted(): void
    {
        $this->assertSame('post', $this->service->upsert('post', ['subtitle' => ['type' => 'string']])['slug']);
        $this->assertSame('page', $this->service->upsert('page', [])['slug']);
    }

    public function test_a_key_registered_first_by_other_code_is_skipped_and_reported_as_a_conflict(): void
    {
        $this->wpMeta['book']['isbn']           = ['type' => 'integer'];
        $this->options[PostMetaService::OPTION] = ['book' => ['isbn' => ['type' => 'string'], 'pages' => ['type' => 'integer']]];
        $this->service->register();

        $this->assertSame(['type' => 'integer'], $this->wpMeta['book']['isbn']);
        $this->assertSame(['type' => 'integer'], $this->wpMeta['book']['pages']);

        Functions\when('get_post_types')->justReturn(['book' => 'book']);

        $this->assertSame(
            [
                ['postType' => 'book', 'key' => 'isbn', 'type' => 'integer', 'single' => false, 'showInRest' => false, 'source' => 'other', 'acf' => false, 'managed' => true, 'conflict' => true],
                ['postType' => 'book', 'key' => 'pages', 'type' => 'integer', 'single' => false, 'showInRest' => false, 'source' => 'loopress', 'acf' => false, 'managed' => true, 'conflict' => false],
            ],
            $this->service->registered(),
        );
    }

    /** @return array<string, array{string, array<string, mixed>}> */
    public static function invalidMeta(): array
    {
        return [
            'post type over 20 chars'   => [str_repeat('a', 21), []],
            'key with a space'          => ['book', ['my key' => ['type' => 'string']]],
            'args not an object'        => ['book', ['isbn' => 'string']],
            'missing type'              => ['book', ['isbn' => ['single' => true]]],
            'unknown type'              => ['book', ['isbn' => ['type' => 'date']]],
            'sanitize callback'         => ['book', ['isbn' => ['type' => 'string', 'sanitize_callback' => 'system']]],
            'auth callback'             => ['book', ['isbn' => ['type' => 'string', 'auth_callback' => '__return_true']]],
            'single not a boolean'      => ['book', ['isbn' => ['type' => 'string', 'single' => 'yes']]],
            'show_in_rest a string'     => ['book', ['isbn' => ['type' => 'string', 'show_in_rest' => 'yes']]],
            'REST prepare callback'     => ['book', ['isbn' => ['type' => 'string', 'show_in_rest' => ['prepare_callback' => 'system']]]],
            'non-whole integer default' => ['book', ['pages' => ['type' => 'integer', 'default' => 1.5]]],
            'array in REST, no schema'  => ['book', ['authors' => ['type' => 'array', 'show_in_rest' => true]]],
            'default of the wrong type' => ['book', ['pages' => ['type' => 'integer', 'default' => '0']]],
        ];
    }

    /** @param array<string, mixed> $args */
    #[DataProvider('invalidMeta')]
    public function test_upsert_refuses_invalid_meta(string $slug, array $args): void
    {
        $this->expectException(InvalidDeclarationException::class);
        $this->service->upsert($slug, $args);
    }

    public function test_a_whole_float_integer_default_is_accepted_and_registered_as_an_int(): void
    {
        $this->service->upsert('book', ['pages' => ['type' => 'integer', 'default' => 1000.0]]);
        $this->service->register();

        $this->assertSame(1000, $this->wpMeta['book']['pages']['default']);
    }

    public function test_an_array_with_a_rest_schema_and_a_typed_default_are_accepted(): void
    {
        $args = [
            'authors' => ['type' => 'array', 'show_in_rest' => ['schema' => ['items' => ['type' => 'string']]]],
            'price'   => ['type' => 'number', 'default' => 0],
        ];

        $this->assertSame($args, $this->service->upsert('book', $args)['args']);
    }
}
