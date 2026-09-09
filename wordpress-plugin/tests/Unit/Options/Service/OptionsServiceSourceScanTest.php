<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Options\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Options\Service\OptionsService;
use Loopress\Tests\Stubs\FakeOptionsWpdb;
use PHPUnit\Framework\TestCase;

// Exercises listOptionNames() end to end against a real (throwaway) filesystem
// tree: scanActivePluginSourceForOptions()/phpFilesIn() are private, and the whole point of this
// feature is real file traversal, so a fake wpdb isn't enough here the way it is for
// OptionsServiceTest. Mirrors ApiDirectoryTest's WP_PLUGIN_DIR-via-a-throwaway-tmp-dir convention.
class OptionsServiceSourceScanTest extends TestCase
{
    private OptionsService $service;
    private FakeOptionsWpdb $wpdb;
    private string $tmpDir;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->service = new OptionsService();
        $this->wpdb    = new FakeOptionsWpdb();
        $GLOBALS['wpdb'] = $this->wpdb;

        $this->tmpDir = sys_get_temp_dir() . '/loopress-options-scan-test-' . uniqid();
        mkdir($this->tmpDir, 0755, true);
        if (!defined('WP_PLUGIN_DIR')) {
            define('WP_PLUGIN_DIR', $this->tmpDir);
        }
    }

    protected function tearDown(): void
    {
        $entries = glob(WP_PLUGIN_DIR . '/*');
        foreach ($entries === false ? [] : $entries as $entry) {
            is_dir($entry) ? $this->rrmdir($entry) : unlink($entry);
        }

        $this->rrmdir($this->tmpDir);
        unset($GLOBALS['wpdb']);
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_finds_an_option_referenced_as_a_quoted_string_in_an_active_plugin(): void
    {
        $this->scaffoldPlugin('seo-by-rank-math', 'class-rank-math.php', "<?php\nget_option( 'rank-math-options-titles' );\n");
        Functions\when('get_option')->justReturn(['seo-by-rank-math/rank-math.php']);
        $this->wpdb->rows = ['rank-math-options-titles' => 'auto'];

        $result = $this->service->listOptionNames();

        $this->assertSame('seo-by-rank-math', $result[0]['guess']);
        $this->assertTrue($result[0]['confirmed']);
    }

    // Regression coverage: a raw substring match ('mail' inside 'email_settings') would be a
    // false positive; only a quoted PHP string literal counts as real evidence of usage.
    public function test_does_not_match_a_name_that_only_appears_as_part_of_a_longer_word(): void
    {
        $this->scaffoldPlugin('some-plugin', 'file.php', "<?php\nget_option( 'mail_settings_extended' );\n");
        Functions\when('get_option')->justReturn(['some-plugin/some-plugin.php']);
        $this->wpdb->rows = ['mail' => 'yes'];

        $result = $this->service->listOptionNames();

        $this->assertNull($result[0]['guess']);
    }

    public function test_skips_vendor_test_and_language_directories(): void
    {
        $this->scaffoldPlugin('some-plugin', 'vendor/lib/autoload.php', "<?php\nget_option( 'buried_option' );\n");
        Functions\when('get_option')->justReturn(['some-plugin/some-plugin.php']);
        $this->wpdb->rows = ['buried_option' => 'yes'];

        $result = $this->service->listOptionNames();

        $this->assertNull($result[0]['guess']);
    }

    // Regression coverage: this is the false-attribution failure mode found live against a real
    // site (a code-quality linter's own rules reference a long list of core/other plugins' option
    // names). Ambiguous evidence must stay honest ("don't know"), never pick one candidate.
    public function test_leaves_guess_null_when_the_name_is_found_in_more_than_one_plugin(): void
    {
        $this->scaffoldPlugin('plugin-a', 'file.php', "<?php\nget_option( 'shared_option_name' );\n");
        $this->scaffoldPlugin('plugin-b', 'file.php', "<?php\nget_option( 'shared_option_name' );\n");
        Functions\when('get_option')->justReturn(['plugin-a/plugin-a.php', 'plugin-b/plugin-b.php']);
        $this->wpdb->rows = ['shared_option_name' => 'yes'];

        $result = $this->service->listOptionNames();

        $this->assertNull($result[0]['guess']);
    }

    // Regression coverage: scanning must never override a name already resolved by the (cheaper)
    // naming heuristic, even when the filesystem holds evidence that would otherwise "win" as an
    // unambiguous single match, one prior test's whole point (see OptionsServiceTest) was that
    // this scan should only run for names the cheap heuristic left unresolved.
    public function test_never_rescans_a_name_the_naming_heuristic_already_resolved(): void
    {
        $this->scaffoldPlugin('unrelated-plugin', 'file.php', "<?php\nget_option( 'my_plugin_setting' );\n");
        Functions\when('get_option')->justReturn(['my-plugin/my-plugin.php', 'unrelated-plugin/unrelated-plugin.php']);
        $this->wpdb->rows = ['my_plugin_setting' => 'yes'];

        $result = $this->service->listOptionNames();

        // Resolved by the my-plugin/ slug prefix, not by the (single, otherwise "winning") match
        // planted in unrelated-plugin/'s source.
        $this->assertSame('my-plugin', $result[0]['guess']);
    }

    // ── pluginName ───────────────────────────────────────────────────────────

    public function test_attaches_the_guessed_plugins_declared_name(): void
    {
        $this->scaffoldPlugin('my-plugin', 'my-plugin.php', "<?php\n/**\n * Plugin Name: My Cool Plugin\n */\n");
        Functions\when('get_option')->justReturn(['my-plugin/my-plugin.php']);
        $this->wpdb->rows = ['my_plugin_setting' => 'yes']; // guessed via the my-plugin/ slug prefix
        // Regression coverage (found live): the real WP header label is "Plugin Name", not "Name"
        // ('Name' is only the array key get_file_data() returns it under); passing 'Name' as the
        // search regex itself silently matches nothing on a real plugin file.
        Functions\expect('get_file_data')
            ->once()
            ->with(\Mockery::any(), ['Name' => 'Plugin Name'])
            ->andReturn(['Name' => 'My Cool Plugin']);

        $result = $this->service->listOptionNames();

        $this->assertSame('my-plugin', $result[0]['guess']);
        $this->assertSame('My Cool Plugin', $result[0]['pluginName']);
    }

    public function test_leaves_plugin_name_null_when_there_is_no_guess(): void
    {
        Functions\when('get_option')->justReturn([]);
        $this->wpdb->rows = ['totally_unguessable_name' => 'yes'];

        $result = $this->service->listOptionNames();

        $this->assertNull($result[0]['guess']);
        $this->assertNull($result[0]['pluginName']);
    }

    // A plugin that was active when the guess was made but has since been deactivated (or its
    // main file otherwise unreadable) must not fail the whole list, just leave the label blank.
    public function test_leaves_plugin_name_null_when_the_guessed_plugins_main_file_is_missing(): void
    {
        Functions\when('get_option')->justReturn(['my-plugin/my-plugin.php']);
        $this->wpdb->rows = ['my_plugin_setting' => 'yes'];
        // No file scaffolded at all for my-plugin/my-plugin.php.

        $result = $this->service->listOptionNames();

        $this->assertSame('my-plugin', $result[0]['guess']);
        $this->assertNull($result[0]['pluginName']);
    }

    private function scaffoldPlugin(string $slug, string $relativeFile, string $content): void
    {
        $path = WP_PLUGIN_DIR . '/' . $slug . '/' . $relativeFile;
        mkdir(dirname($path), 0755, true);
        file_put_contents($path, $content);
    }

    private function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }

        $items = scandir($dir);
        foreach ($items === false ? [] : $items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }

            $path = $dir . '/' . $item;
            is_dir($path) ? $this->rrmdir($path) : unlink($path);
        }

        rmdir($dir);
    }
}
