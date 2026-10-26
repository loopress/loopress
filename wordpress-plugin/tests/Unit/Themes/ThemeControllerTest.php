<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Themes;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Themes\RestApi\ThemeController;
use Loopress\Tests\Stubs\RestRequest;
use Loopress\Tests\Stubs\UserGlobalStyles;
use PHPUnit\Framework\TestCase;

class ThemeControllerTest extends TestCase
{
    /** @var array<string, string> installed themes, stylesheet => template */
    private array $themes = [
        'twentytwentyfive'         => 'twentytwentyfive',
        'twentytwentyfive-loopress' => 'twentytwentyfive',
        'astra'                    => 'astra',
        'orphan-loopress'          => 'orphan',
    ];

    private string $active = 'twentytwentyfive';

    /** @var array<string, mixed> */
    private array $options = [];

    /** @var array<int, array<mixed>> the posts wp_update_post() was given */
    private array $updatedPosts = [];

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        UserGlobalStyles::reset();

        Functions\when('get_stylesheet')->alias(fn(): string => $this->active);
        Functions\when('switch_theme')->alias(function (string $stylesheet): void {
            $this->active = $stylesheet;
        });
        Functions\when('wp_get_theme')->alias(fn(string $stylesheet): object => $this->theme($stylesheet));
        Functions\when('get_option')->alias(fn(string $name): mixed => $this->options[$name] ?? false);
        Functions\when('update_option')->alias(function (string $name, mixed $value): bool {
            $this->options[$name] = $value;

            return true;
        });
        Functions\when('wp_slash')->returnArg();
        Functions\when('wp_update_post')->alias(function (array $post): int {
            $this->updatedPosts[] = $post;

            return 42;
        });
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    private function theme(string $stylesheet): object
    {
        $template = $this->themes[$stylesheet] ?? null;

        return new class($stylesheet, $template) {
            public function __construct(private readonly string $stylesheet, private readonly ?string $template) {}

            public function exists(): bool
            {
                return $this->template !== null;
            }

            public function errors(): \WP_Error|false
            {
                return $this->template === 'orphan' ? new \WP_Error('theme_no_parent', 'The parent theme is missing.') : false;
            }

            public function get_template(): string
            {
                return (string) $this->template;
            }

            public function get_stylesheet(): string
            {
                return $this->stylesheet;
            }
        };
    }

    private function activate(string $stylesheet): \WP_REST_Response
    {
        return (new ThemeController())->activate(RestRequest::with(['stylesheet' => $stylesheet]));
    }

    public function test_switches_to_an_installed_theme(): void
    {
        $response = $this->activate('astra');

        $this->assertSame(200, $response->status);
        $this->assertSame(['active' => 'astra', 'previous' => 'twentytwentyfive', 'changed' => true], $response->get_data());
        $this->assertSame('astra', $this->active);
    }

    public function test_the_active_theme_is_left_alone(): void
    {
        Functions\expect('switch_theme')->never();

        $response = $this->activate('twentytwentyfive');

        $this->assertSame(['active' => 'twentytwentyfive', 'previous' => 'twentytwentyfive', 'changed' => false], $response->get_data());
    }

    public function test_refuses_a_theme_that_is_not_installed(): void
    {
        $response = $this->activate('missing');

        $this->assertSame(404, $response->status);
        $this->assertSame(['error' => 'The theme "missing" is not installed.'], $response->get_data());
        $this->assertSame('twentytwentyfive', $this->active);
    }

    public function test_refuses_a_broken_theme(): void
    {
        $response = $this->activate('orphan-loopress');

        $this->assertSame(409, $response->status);
        $this->assertSame(['error' => 'The theme "orphan-loopress" can\'t be activated: The parent theme is missing.'], $response->get_data());
        $this->assertSame('twentytwentyfive', $this->active);
    }

    public function test_a_child_without_state_starts_from_its_parent_theme_mods_and_global_styles(): void
    {
        $this->options['theme_mods_twentytwentyfive'] = ['custom_logo' => 7];
        UserGlobalStyles::$posts['twentytwentyfive'] = ['ID' => 5, 'post_content' => '{"styles":{"color":{"text":"red"}}}'];

        $this->activate('twentytwentyfive-loopress');

        $this->assertSame('twentytwentyfive-loopress', $this->active);
        $this->assertSame(['custom_logo' => 7], $this->options['theme_mods_twentytwentyfive-loopress']);
        $this->assertSame(['twentytwentyfive-loopress'], UserGlobalStyles::$created);
        $this->assertSame([['ID' => 42, 'post_content' => '{"styles":{"color":{"text":"red"}}}']], $this->updatedPosts);
    }

    public function test_a_child_keeps_the_state_it_already_has(): void
    {
        $this->options['theme_mods_twentytwentyfive']          = ['custom_logo' => 7];
        $this->options['theme_mods_twentytwentyfive-loopress'] = ['custom_logo' => 9];
        UserGlobalStyles::$posts['twentytwentyfive']          = ['ID' => 5, 'post_content' => '{"styles":{}}'];
        UserGlobalStyles::$posts['twentytwentyfive-loopress'] = ['ID' => 6, 'post_content' => '{"styles":{"x":1}}'];

        $this->activate('twentytwentyfive-loopress');

        $this->assertSame(['custom_logo' => 9], $this->options['theme_mods_twentytwentyfive-loopress']);
        $this->assertSame([], UserGlobalStyles::$created);
        $this->assertSame([], $this->updatedPosts);
    }

    public function test_a_theme_that_is_not_a_child_inherits_nothing(): void
    {
        $this->options['theme_mods_twentytwentyfive'] = ['custom_logo' => 7];

        $this->activate('astra');

        $this->assertArrayNotHasKey('theme_mods_astra', $this->options);
    }
}
