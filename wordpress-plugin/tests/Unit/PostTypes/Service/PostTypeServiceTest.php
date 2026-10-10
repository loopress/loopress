<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\PostTypes\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\PostTypes\Exception\InvalidPostTypeException;
use Loopress\PostTypes\Exception\StalePostTypeRevisionException;
use Loopress\PostTypes\Service\PostTypeService;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class PostTypeServiceTest extends TestCase
{
    /** @var array<string, mixed> In-memory wp_options. */
    private array $options = [];

    /** @var array<string, array<string, mixed>> What register_post_type() received. */
    private array $wpRegistered = [];

    /** @var array<string, object> What register_post_type() returned, as WordPress keeps it. */
    private array $wpObjects = [];

    private PostTypeService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        Functions\when('get_option')->alias(fn (string $name, mixed $fallback = false): mixed => $this->options[$name] ?? $fallback);
        Functions\when('update_option')->alias(function (string $name, mixed $value): bool {
            $this->options[$name] = $value;
            return true;
        });
        Functions\when('delete_option')->alias(function (string $name): bool {
            unset($this->options[$name]);
            return true;
        });
        Functions\when('wp_json_encode')->alias(static fn (mixed $data): string|false => json_encode($data));
        Functions\when('is_wp_error')->justReturn(false);
        Functions\when('post_type_exists')->alias(fn (string $slug): bool => isset($this->wpRegistered[$slug]));
        Functions\when('register_post_type')->alias(function (string $slug, array $args): object {
            $this->wpRegistered[$slug] = $args;
            $this->wpObjects[$slug] = (object) [
                'label' => $args['label'] ?? $slug, '_builtin' => false, 'public' => false, 'show_ui' => false, 'show_in_menu' => false,
            ];

            return $this->wpObjects[$slug];
        });

        $this->service = new PostTypeService();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_upsert_stores_the_args_and_returns_them_with_a_revision(): void
    {
        $result = $this->service->upsert('book', ['public' => true]);

        $this->assertSame('book', $result['slug']);
        $this->assertSame(['public' => true], $result['args']);
        $this->assertSame(['book' => ['public' => true]], $this->options[PostTypeService::OPTION]);
        $this->assertSame($result, $this->service->get('book'));
    }

    public function test_every_write_schedules_one_rewrite_flush(): void
    {
        $this->service->upsert('book', []);
        $this->assertArrayHasKey(PostTypeService::FLUSH_OPTION, $this->options);

        Functions\expect('flush_rewrite_rules')->once();
        $this->service->flushIfNeeded();
        $this->service->flushIfNeeded();

        $this->assertArrayNotHasKey(PostTypeService::FLUSH_OPTION, $this->options);
    }

    public function test_upsert_refuses_a_stale_revision(): void
    {
        $this->service->upsert('book', ['public' => true]);

        $this->expectException(StalePostTypeRevisionException::class);
        $this->service->upsert('book', ['public' => false], 'not-the-current-one');
    }

    public function test_upsert_accepts_the_current_revision(): void
    {
        $revision = $this->service->upsert('book', ['public' => true])['revision'];

        $this->assertSame(['public' => false], $this->service->upsert('book', ['public' => false], $revision)['args']);
    }

    /** @return array<string, array{string, array<string, mixed>}> */
    public static function invalidPostTypes(): array
    {
        return [
            'uppercase slug'       => ['Book', []],
            'slug over 20 chars'   => ['a_very_long_post_type_slug', []],
            'empty slug'           => ['', []],
            'core post type'       => ['page', []],
            'wp_ prefix'           => ['wp_thing', []],
            'meta box callback'    => ['book', ['register_meta_box_cb' => 'system']],
            'rest controller class' => ['book', ['rest_controller_class' => 'Some\\Class']],
            'capabilities string'  => ['book', ['capabilities' => 'edit_posts']],
            'supports true'        => ['book', ['supports' => true]],
            'labels string'        => ['book', ['labels' => 'Books']],
        ];
    }

    /** @param array<string, mixed> $args */
    #[DataProvider('invalidPostTypes')]
    public function test_upsert_refuses_invalid_post_types_before_storing_anything(string $slug, array $args): void
    {
        try {
            $this->service->upsert($slug, $args);
            $this->fail('Expected InvalidPostTypeException');
        } catch (InvalidPostTypeException) {
            $this->assertArrayNotHasKey(PostTypeService::OPTION, $this->options);
        }
    }

    public function test_delete_removes_only_the_stored_entry(): void
    {
        $this->service->upsert('book', []);

        $this->assertTrue($this->service->delete('book'));
        $this->assertFalse($this->service->delete('book'));
        $this->assertSame([], $this->service->list());
    }

    public function test_register_skips_a_slug_something_else_already_registered(): void
    {
        $this->options[PostTypeService::OPTION] = ['book' => ['label' => 'Ours'], 'movie' => ['label' => 'Movies']];
        $this->wpRegistered['book'] = ['label' => 'Theirs'];

        $this->service->register();

        $this->assertSame(['label' => 'Theirs'], $this->wpRegistered['book']);
        $this->assertSame(['label' => 'Movies'], $this->wpRegistered['movie']);
    }

    public function test_upsert_accepts_the_non_array_values_wordpress_allows(): void
    {
        $this->assertSame(['supports' => false, 'rewrite' => false], $this->service->upsert('book', ['supports' => false, 'rewrite' => false])['args']);
    }

    public function test_register_skips_an_entry_wordpress_throws_on_and_keeps_the_others(): void
    {
        $this->options[PostTypeService::OPTION] = ['book' => ['label' => 'Bad'], 'movie' => ['label' => 'Movies']];
        Functions\when('register_post_type')->alias(function (string $slug, array $args): object {
            if ($slug === 'book') {
                throw new \TypeError('array_merge(): Argument #2 must be of type array');
            }

            $this->wpRegistered[$slug] = $args;
            return (object) [];
        });

        $this->service->register();

        $this->assertSame(['movie'], array_keys($this->wpRegistered));
    }

    public function test_registered_reports_a_loopress_type_replaced_later_as_a_conflict(): void
    {
        $this->options[PostTypeService::OPTION] = ['book' => []];
        $this->service->register();

        // Another plugin registered "book" again after Loopress: WordPress now holds its object.
        Functions\when('get_post_types')->justReturn([
            'book' => (object) ['label' => 'Books', '_builtin' => false, 'public' => true, 'show_ui' => true, 'show_in_menu' => true],
        ]);
        Functions\when('wp_count_posts')->justReturn((object) ['publish' => 0]);

        $this->assertSame(
            [['slug' => 'book', 'label' => 'Books', 'source' => 'other', 'count' => 0, 'managed' => true, 'conflict' => true]],
            $this->service->registered(),
        );
    }

    public function test_registered_reports_the_source_and_conflicts(): void
    {
        $this->options[PostTypeService::OPTION] = ['book' => [], 'movie' => ['label' => 'Movies']];
        $this->options['cptui_post_types']      = ['book' => []];
        $this->wpRegistered['book']             = [];
        $this->service->register();

        $type = static fn (string $label, bool $builtin, bool $isPublic, bool $showUi = false): object => (object) [
            'label' => $label, '_builtin' => $builtin, 'public' => $isPublic, 'show_ui' => $showUi, 'show_in_menu' => $showUi,
        ];
        Functions\when('get_post_types')->justReturn([
            'post'          => $type('Posts', true, true),
            'wp_block'      => $type('Patterns', true, false, true),
            'book'          => $type('Books', false, true),
            'movie'         => $this->wpObjects['movie'],
            'acf-field-group' => $type('Field Groups', false, false),
        ]);
        Functions\when('wp_count_posts')->justReturn((object) ['publish' => 3]);

        $this->assertSame(
            [
                ['slug' => 'post', 'label' => 'Posts', 'source' => 'wordpress', 'count' => 3, 'managed' => false, 'conflict' => false],
                ['slug' => 'book', 'label' => 'Books', 'source' => 'cptui', 'count' => 3, 'managed' => true, 'conflict' => true],
                ['slug' => 'movie', 'label' => 'Movies', 'source' => 'loopress', 'count' => 3, 'managed' => true, 'conflict' => false],
            ],
            $this->service->registered(),
        );
    }
}
