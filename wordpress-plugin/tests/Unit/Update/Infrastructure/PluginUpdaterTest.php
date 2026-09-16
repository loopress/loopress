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

        $transient = $this->updater->injectUpdate(new stdClass());

        $basename = LOOPRESS_PLUGIN_SLUG . '/loopress.php';
        $this->assertArrayNotHasKey($basename, $transient->response);
        $this->assertArrayNotHasKey($basename, $transient->no_update);
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
