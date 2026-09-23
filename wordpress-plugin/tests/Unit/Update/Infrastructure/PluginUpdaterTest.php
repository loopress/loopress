<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Update\Infrastructure;

use Brain\Monkey;
use Loopress\Update\Infrastructure\GithubReleaseChecker;
use Loopress\Update\Infrastructure\PluginUpdater;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use stdClass;

class PluginUpdaterTest extends TestCase
{
    private GithubReleaseChecker&MockObject $checker;
    private PluginUpdater $updater;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->checker = $this->createMock(GithubReleaseChecker::class);
        $this->updater = new PluginUpdater($this->checker);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_ignores_a_non_object_transient(): void
    {
        $this->assertFalse($this->updater->injectUpdate(false));
    }

    public function test_reports_no_update_when_already_on_latest(): void
    {
        $this->checker->method('getLatestVersion')->willReturn(LOOPRESS_VERSION);

        $transient = $this->updater->injectUpdate(new stdClass());

        $this->assertArrayNotHasKey(LOOPRESS_PLUGIN_SLUG . '/loopress.php', $transient->response);
        $this->assertArrayHasKey(LOOPRESS_PLUGIN_SLUG . '/loopress.php', $transient->no_update);
        $this->assertSame(LOOPRESS_VERSION, $transient->no_update[LOOPRESS_PLUGIN_SLUG . '/loopress.php']->new_version);
    }

    // WordPress carries the previous transient value forward for a plugin outside
    // wordpress.org: it does not hand this filter a blank object each cycle. Without
    // clearing the stale entry first, a plugin that was updatable last cycle would keep
    // being advertised even after updating (or after the check stops finding an update).
    public function test_clears_a_stale_response_entry_left_from_a_previous_cycle(): void
    {
        $this->checker->method('getLatestVersion')->willReturn(LOOPRESS_VERSION);
        $basename  = LOOPRESS_PLUGIN_SLUG . '/loopress.php';
        $transient = new stdClass();
        $transient->response = [$basename => (object) ['new_version' => '1999.1.1']];

        $result = $this->updater->injectUpdate($transient);

        $this->assertArrayNotHasKey($basename, $result->response);
        $this->assertArrayHasKey($basename, $result->no_update);
    }

    public function test_reports_no_update_when_the_checker_finds_nothing(): void
    {
        $this->checker->method('getLatestVersion')->willReturn(null);

        $transient = $this->updater->injectUpdate(new stdClass());

        $this->assertArrayHasKey(LOOPRESS_PLUGIN_SLUG . '/loopress.php', $transient->no_update);
    }

    public function test_advertises_an_update_with_the_github_zip_as_the_package(): void
    {
        $this->checker->method('getLatestVersion')->willReturn('2999.1.1');
        $this->checker->method('getLatestDownloadUrl')->willReturn('https://example.com/loopress-full.zip');

        $transient = $this->updater->injectUpdate(new stdClass());

        $basename = LOOPRESS_PLUGIN_SLUG . '/loopress.php';
        $this->assertArrayHasKey($basename, $transient->response);
        $this->assertSame('2999.1.1', $transient->response[$basename]->new_version);
        $this->assertSame('https://example.com/loopress-full.zip', $transient->response[$basename]->package);
        $this->assertSame(LOOPRESS_PLUGIN_SLUG, $transient->response[$basename]->slug);
        $this->assertSame($basename, $transient->response[$basename]->plugin);
    }

    public function test_skips_the_plugin_for_this_cycle_when_a_newer_tag_has_no_zip_asset_yet(): void
    {
        $this->checker->method('getLatestVersion')->willReturn('2999.1.1');
        $this->checker->method('getLatestDownloadUrl')->willReturn(null);
        $basename  = LOOPRESS_PLUGIN_SLUG . '/loopress.php';
        $transient = new stdClass();
        // Seeded with stale entries in both arrays from a previous cycle, to prove this
        // inconclusive cycle clears them rather than leaving an old state to linger.
        $transient->no_update = [$basename => (object) ['new_version' => LOOPRESS_VERSION]];

        $result = $this->updater->injectUpdate($transient);

        $this->assertArrayNotHasKey($basename, $result->response);
        $this->assertArrayNotHasKey($basename, $result->no_update);
    }

    public function test_clears_a_stale_no_update_entry_when_an_update_becomes_available(): void
    {
        $this->checker->method('getLatestVersion')->willReturn('2999.1.1');
        $this->checker->method('getLatestDownloadUrl')->willReturn('https://example.com/loopress-full.zip');
        $basename  = LOOPRESS_PLUGIN_SLUG . '/loopress.php';
        $transient = new stdClass();
        $transient->no_update = [$basename => (object) ['new_version' => LOOPRESS_VERSION]];

        $result = $this->updater->injectUpdate($transient);

        $this->assertArrayNotHasKey($basename, $result->no_update);
        $this->assertArrayHasKey($basename, $result->response);
    }

    public function test_plugin_information_ignores_other_actions(): void
    {
        $args = (object) ['slug' => LOOPRESS_PLUGIN_SLUG];

        $this->assertSame('unchanged', $this->updater->pluginInformation('unchanged', 'query_plugins', $args));
    }

    public function test_plugin_information_ignores_a_different_slug(): void
    {
        $args = (object) ['slug' => 'some-other-plugin'];

        $this->assertSame('unchanged', $this->updater->pluginInformation('unchanged', 'plugin_information', $args));
    }

    public function test_plugin_information_returns_details_for_the_matching_slug(): void
    {
        $this->checker->method('getLatestVersion')->willReturn('2999.1.1');
        $this->checker->method('getLatestDownloadUrl')->willReturn('https://example.com/loopress-full.zip');
        $args = (object) ['slug' => LOOPRESS_PLUGIN_SLUG];

        $info = $this->updater->pluginInformation(false, 'plugin_information', $args);

        $this->assertSame(LOOPRESS_PLUGIN_SLUG, $info->slug);
        $this->assertSame('2999.1.1', $info->version);
        $this->assertSame('https://example.com/loopress-full.zip', $info->download_link);
    }
}
