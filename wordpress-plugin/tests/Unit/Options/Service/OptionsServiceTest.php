<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Options\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Options\Exception\ReservedOptionNameException;
use Loopress\Options\Exception\UnsupportedOptionValueException;
use Loopress\Options\Service\OptionsService;
use Loopress\Tests\Stubs\FakeOptionsWpdb;
use PHPUnit\Framework\TestCase;

class OptionsServiceTest extends TestCase
{
    private OptionsService $service;
    private FakeOptionsWpdb $wpdb;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->service = new OptionsService();
        $this->wpdb    = new FakeOptionsWpdb();
        $GLOBALS['wpdb'] = $this->wpdb;
    }

    protected function tearDown(): void
    {
        unset($GLOBALS['wpdb']);
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── listOptionNames ─────────────────────────────────────────────────────

    public function test_list_option_names_excludes_transients(): void
    {
        Functions\when('get_option')->justReturn([]);
        $this->wpdb->rows = [
            'blogname'                    => 'yes',
            '_transient_something'        => 'no',
            '_site_transient_update_core' => 'no',
            'my_plugin_settings'          => 'no',
        ];

        $result = $this->service->listOptionNames();

        $this->assertSame(
            [
                ['name' => 'blogname', 'autoload' => 'yes', 'core' => true, 'guess' => null, 'confirmed' => false, 'pluginName' => null],
                ['name' => 'my_plugin_settings', 'autoload' => 'no', 'core' => false, 'guess' => null, 'confirmed' => false, 'pluginName' => null],
            ],
            $result,
        );
    }

    public function test_list_option_names_flags_a_known_wordpress_core_default(): void
    {
        Functions\when('get_option')->justReturn([]);
        $this->wpdb->rows = ['siteurl' => 'yes'];

        $result = $this->service->listOptionNames();

        $this->assertTrue($result[0]['core']);
    }

    public function test_list_option_names_guesses_a_source_from_an_active_plugin_slug(): void
    {
        Functions\when('get_option')->justReturn(['code-snippets/code-snippets.php']);
        $this->wpdb->rows = ['code_snippets_settings' => 'auto'];

        $result = $this->service->listOptionNames();

        $this->assertFalse($result[0]['core']);
        $this->assertSame('code-snippets', $result[0]['guess']);
    }

    // Regression coverage: even a straightforward slug/prefix match (RankMath's slug is
    // "seo-by-rank-math", but its options are prefixed "rank-math-options-"/"rank_math_") often
    // fails, which is exactly why this is exposed as a separate "guess" field, never merged with
    // the certain "core" flag.
    public function test_list_option_names_leaves_guess_null_when_no_active_plugin_prefix_matches(): void
    {
        Functions\when('get_option')->justReturn(['seo-by-rank-math/rank-math.php']);
        $this->wpdb->rows = ['rank-math-options-titles' => 'yes'];

        $result = $this->service->listOptionNames();

        $this->assertNull($result[0]['guess']);
    }

    public function test_list_option_names_never_guesses_for_a_confirmed_core_option(): void
    {
        // Contrived: a plugin slug that would otherwise prefix-match a real core option name.
        Functions\when('get_option')->justReturn(['site/site.php']);
        $this->wpdb->rows = ['site_icon' => 'yes'];

        $result = $this->service->listOptionNames();

        $this->assertTrue($result[0]['core']);
        $this->assertNull($result[0]['guess']);
    }

    // Regression coverage (found live): "wpforms-lite" only matches "_wpforms_transient_*" once
    // both the "-lite" marketing suffix and the option's leading underscore are accounted for.
    public function test_list_option_names_guesses_via_the_slugs_first_segment_and_a_leading_underscore(): void
    {
        Functions\when('get_option')->justReturn(['wpforms-lite/wpforms.php']);
        $this->wpdb->rows = ['_wpforms_transient_addons' => 'off'];

        $result = $this->service->listOptionNames();

        $this->assertSame('wpforms-lite', $result[0]['guess']);
    }

    // Regression coverage: a first segment shorter than MIN_GUESS_SEGMENT_LENGTH (e.g. "seo" from
    // "seo-by-rank-math") must not become a prefix candidate, it would match almost anything.
    public function test_list_option_names_does_not_use_an_overly_short_first_segment(): void
    {
        Functions\when('get_option')->justReturn(['seo-by-rank-math/rank-math.php']);
        $this->wpdb->rows = ['seo_completely_unrelated_option' => 'yes'];

        $result = $this->service->listOptionNames();

        $this->assertNull($result[0]['guess']);
    }

    public function test_list_option_names_ignores_single_file_plugins_with_no_folder_slug(): void
    {
        Functions\when('get_option')->justReturn(['hello.php']);
        $this->wpdb->rows = ['my_option' => 'yes'];

        $result = $this->service->listOptionNames();

        $this->assertNull($result[0]['guess']);
    }

    // ── getOption ────────────────────────────────────────────────────────────

    public function test_get_option_returns_null_when_the_option_does_not_exist(): void
    {
        Functions\when('get_option')->alias(fn(string $name, mixed $fallback = false): mixed => $fallback);

        $this->assertNull($this->service->getOption('missing'));
    }

    // Regression coverage: get_option()'s own default (false) is also a value the option can
    // legitimately be set to, so a naive "did I get false back" check would misreport this case
    // as "not found".
    public function test_get_option_distinguishes_a_false_value_from_a_missing_option(): void
    {
        Functions\when('get_option')->justReturn(false);
        $this->wpdb->rows = ['feature_flag' => 'yes'];

        $result = $this->service->getOption('feature_flag');

        $this->assertNotNull($result);
        $this->assertFalse($result['value']);
    }

    public function test_get_option_returns_the_value_and_autoload(): void
    {
        Functions\when('get_option')->justReturn(['titleSeparator' => '-']);
        $this->wpdb->rows = ['wpseo_titles' => 'no'];

        $result = $this->service->getOption('wpseo_titles');

        $this->assertSame(['titleSeparator' => '-'], $result['value']);
        $this->assertSame('no', $result['autoload']);
    }

    public function test_get_option_throws_when_the_value_is_not_json_safe(): void
    {
        Functions\when('get_option')->justReturn((object) ['not' => 'json-safe']);
        $this->wpdb->rows = ['legacy_option' => 'yes'];

        $this->expectException(UnsupportedOptionValueException::class);
        $this->service->getOption('legacy_option');
    }

    // ── updateOption ─────────────────────────────────────────────────────────

    public function test_update_option_throws_for_a_reserved_name(): void
    {
        $this->expectException(ReservedOptionNameException::class);
        $this->service->updateOption('active_plugins', ['x'], null);
    }

    public function test_update_option_stores_and_returns_the_new_value(): void
    {
        Functions\when('update_option')->justReturn(true);
        Functions\when('get_option')->justReturn(['a' => 1]);
        $this->wpdb->rows = ['my_option' => 'yes'];

        $result = $this->service->updateOption('my_option', ['a' => 1], null);

        $this->assertSame(['a' => 1], $result['value']);
    }

    // Regression coverage: update_option() returns false both on failure and when the new value
    // equals the old one (a no-op). Re-reading afterwards, rather than trusting that return
    // value, is what keeps a same-value push from being reported as a failure.
    public function test_update_option_does_not_treat_a_no_op_write_as_a_failure(): void
    {
        Functions\when('update_option')->justReturn(false);
        Functions\when('get_option')->justReturn(['a' => 1]);
        $this->wpdb->rows = ['my_option' => 'yes'];

        $result = $this->service->updateOption('my_option', ['a' => 1], null);

        $this->assertSame(['a' => 1], $result['value']);
    }

    // Regression coverage (found against a real WordPress 6.6+ site, which reports 'off' rather
    // than the legacy 'no'): a tracked option pulled with autoload "off" must still turn autoload
    // off on push, not silently flip it back on because only the old spelling was recognized.
    public function test_update_option_turns_autoload_off_for_both_no_and_off(): void
    {
        Functions\when('get_option')->justReturn(['a' => 1]);
        $this->wpdb->rows = ['my_option' => 'off'];

        foreach (['no', 'off'] as $autoload) {
            $captured = null;
            Functions\when('update_option')->alias(function (string $name, mixed $value, mixed $sentAutoload) use (&$captured): bool {
                $captured = $sentAutoload;
                return true;
            });

            $this->service->updateOption('my_option', ['a' => 1], $autoload);

            $this->assertFalse($captured, "autoload \"{$autoload}\" should turn autoload off");
        }
    }

    public function test_update_option_turns_autoload_on_for_yes_and_on(): void
    {
        Functions\when('get_option')->justReturn(['a' => 1]);
        $this->wpdb->rows = ['my_option' => 'on'];

        foreach (['yes', 'on'] as $autoload) {
            $captured = null;
            Functions\when('update_option')->alias(function (string $name, mixed $value, mixed $sentAutoload) use (&$captured): bool {
                $captured = $sentAutoload;
                return true;
            });

            $this->service->updateOption('my_option', ['a' => 1], $autoload);

            $this->assertTrue($captured, "autoload \"{$autoload}\" should turn autoload on");
        }
    }

    // ── deleteOption ─────────────────────────────────────────────────────────

    public function test_delete_option_throws_for_a_reserved_name(): void
    {
        $this->expectException(ReservedOptionNameException::class);
        $this->service->deleteOption('template');
    }

    public function test_delete_option_deletes_a_non_reserved_option(): void
    {
        Functions\expect('delete_option')->once()->with('my_option')->andReturn(true);

        $this->service->deleteOption('my_option');
        $this->addToAssertionCount(1);
    }
}
