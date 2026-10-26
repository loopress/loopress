<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Pages;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Pages\Service\PatternService;
use Loopress\PostTypes\Exception\InvalidDeclarationException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use WP_Block_Patterns_Registry;
use Loopress\Tests\Unit\DigsIntoArrays;

// The shared behaviour (revisions, conflicts, a throwing entry) is covered once, in
// PostTypeServiceTest; this covers what is specific to patterns.
class PatternServiceTest extends TestCase
{
    use DigsIntoArrays;

    /** @var array<string, mixed> In-memory wp_options. */
    private array $options = [];

    private PatternService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        WP_Block_Patterns_Registry::reset();

        Functions\when('get_option')->alias(fn (string $name, mixed $fallback = false): mixed => $this->options[$name] ?? $fallback);
        Functions\when('update_option')->alias(function (string $name, mixed $value): bool {
            $this->options[$name] = $value;
            return true;
        });
        Functions\when('wp_json_encode')->alias(static fn (mixed $data): string|false => json_encode($data));
        Functions\when('is_wp_error')->justReturn(false);
        Functions\when('register_block_pattern')->alias(static function (string $name, array $args): bool {
            $registry           = WP_Block_Patterns_Registry::get_instance();
            $registry->patterns = array_merge(self::arrayAt($registry->patterns), [$name => ['name' => $name] + $args]);
            return true;
        });

        $this->service = new PatternService();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_a_pattern_is_registered_under_the_loopress_namespace(): void
    {
        $this->service->upsert('hero', ['title' => 'Hero', 'content' => '<p>Hi</p>', 'categories' => ['banner']]);
        $this->service->register();

        $this->assertSame(
            ['name' => 'loopress/hero', 'title' => 'Hero', 'content' => '<p>Hi</p>', 'categories' => ['banner']],
            self::at(WP_Block_Patterns_Registry::get_instance()->patterns, 'loopress/hero'),
        );
        $this->assertArrayNotHasKey(PatternService::FLUSH_OPTION, $this->options);
    }

    /** @return array<string, array{string, array<string, mixed>}> */
    public static function invalidPatterns(): array
    {
        return [
            'missing title'       => ['hero', ['content' => '']],
            'missing content'     => ['hero', ['title' => 'Hero']],
            'php file'            => ['hero', ['title' => 'Hero', 'content' => '', 'filePath' => '/tmp/x.php']],
            'categories string'   => ['hero', ['title' => 'Hero', 'content' => '', 'categories' => 'banner']],
            'viewport as string'  => ['hero', ['title' => 'Hero', 'content' => '', 'viewportWidth' => '800']],
            'inserter as string'  => ['hero', ['title' => 'Hero', 'content' => '', 'inserter' => 'no']],
            'uppercase slug'      => ['Hero', ['title' => 'Hero', 'content' => '']],
        ];
    }

    /** @param array<string, mixed> $args */
    #[DataProvider('invalidPatterns')]
    public function test_upsert_refuses_invalid_patterns(string $slug, array $args): void
    {
        $this->expectException(InvalidDeclarationException::class);
        $this->service->upsert($slug, $args);
    }

    public function test_registered_lists_loopress_and_theme_patterns_but_not_core_ones(): void
    {
        $registry           = WP_Block_Patterns_Registry::get_instance();
        $registry->patterns = [
            'core/quote'        => ['name' => 'core/quote', 'title' => 'Quote'],
            'mytheme/footer'    => ['name' => 'mytheme/footer', 'title' => 'Footer'],
            'loopress/taken'    => ['name' => 'loopress/taken', 'title' => 'Someone else'],
        ];
        $this->options[PatternService::OPTION] = [
            'hero'  => ['title' => 'Hero', 'content' => ''],
            'taken' => ['title' => 'Mine', 'content' => ''],
        ];
        $this->service->register();

        $this->assertSame(
            [
                ['slug' => 'mytheme/footer', 'label' => 'Footer', 'source' => 'other', 'count' => 0, 'managed' => false, 'conflict' => false],
                ['slug' => 'loopress/taken', 'label' => 'Someone else', 'source' => 'other', 'count' => 0, 'managed' => false, 'conflict' => true],
                ['slug' => 'hero', 'label' => 'Hero', 'source' => 'loopress', 'count' => 0, 'managed' => true, 'conflict' => false],
            ],
            $this->service->registered(),
        );
    }
}
