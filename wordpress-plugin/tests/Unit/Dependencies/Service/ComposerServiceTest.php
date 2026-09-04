<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Dependencies\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Dependencies\Infrastructure\ComposerRunner;
use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
use Loopress\Dependencies\Infrastructure\PackagistClient;
use Loopress\Dependencies\Service\ComposerService;
use Loopress\Tests\Stubs\FakeHttpClient;
use Nyholm\Psr7\Response;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class ComposerServiceTest extends TestCase
{
    private LoopressEnvironment&MockObject $environment;
    private ComposerRunner&MockObject $runner;
    private PackagistClient&MockObject $packagist;
    private FakeHttpClient $httpClient;
    private ComposerService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->environment    = $this->createMock(LoopressEnvironment::class);
        $this->runner   = $this->createMock(ComposerRunner::class);
        $this->packagist = $this->createMock(PackagistClient::class);
        $this->httpClient = new FakeHttpClient();

        // Default: vendor/ not publicly reachable. getDiagnostics() tests that don't care
        // about the exposure check override this via Functions\when()/willReturn().
        $this->httpClient->willReturn(new Response(404));
        Functions\when('get_transient')->justReturn(false);
        Functions\when('set_transient')->justReturn(true);
        Functions\when('content_url')->justReturn('https://example.test/wp-content/loopress/vendor/composer/installed.json');

        $this->service = new ComposerService(
            $this->environment,
            $this->runner,
            $this->packagist,
            $this->httpClient,
        );
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── ensureInitialized (lib/ autoload dump-autoload) ──────────────────────
    // Exercised through getInstalled(), one of ensureInitialized()'s three callers: it's a
    // private method, its effect (does it trigger dump-autoload?) is what matters here, not
    // the internal call.

    public function test_getInstalled_triggers_a_dump_autoload_when_lib_autoload_was_just_migrated(): void
    {
        $this->environment->method('readComposerJson')->willReturn([]);
        $this->environment->method('needsLibAutoloadDump')->willReturn(true);

        $this->runner->expects($this->once())->method('run')->with(['dump-autoload']);

        $this->service->getInstalled();
    }

    public function test_getInstalled_does_not_trigger_a_dump_autoload_when_nothing_was_migrated(): void
    {
        $this->environment->method('readComposerJson')->willReturn([]);
        $this->environment->method('needsLibAutoloadDump')->willReturn(false);

        $this->runner->expects($this->never())->method('run');

        $this->service->getInstalled();
    }

    public function test_getInstalled_survives_a_failed_dump_autoload(): void
    {
        // getInstalled()/getDiagnostics()/getJson() don't wrap this call in a try/catch the
        // way requirePackage()/repair()/etc. do: a failed migration dump-autoload must never
        // turn a plain read into an uncaught exception.
        $this->environment->method('readComposerJson')->willReturn([]);
        $this->environment->method('needsLibAutoloadDump')->willReturn(true);
        $this->runner->method('run')->willThrowException(new \RuntimeException('lock held'));

        $this->assertSame([], $this->service->getInstalled());
    }

    // ── getInstalled ─────────────────────────────────────────────────────────

    public function test_getInstalled_returns_empty_when_no_require(): void
    {
        $this->environment->method('readComposerJson')->willReturn([]);
        $this->assertSame([], $this->service->getInstalled());
    }

    public function test_getInstalled_falls_back_to_constraint_without_lock_file(): void
    {
        $this->environment->method('readComposerJson')->willReturn([
            'require' => [
                'guzzlehttp/guzzle' => '^7.0',
                'monolog/monolog'   => '^3.0',
            ],
        ]);
        $this->environment->method('readComposerLock')->willReturn(null);

        $result = $this->service->getInstalled();

        $this->assertCount(2, $result);
        $this->assertSame('guzzlehttp/guzzle', $result[0]['name']);
        $this->assertSame('^7.0', $result[0]['version']);
        $this->assertSame('^7.0', $result[0]['constraint']);
        $this->assertSame('monolog/monolog', $result[1]['name']);
    }

    public function test_getInstalled_reports_exact_locked_versions(): void
    {
        $this->environment->method('readComposerJson')->willReturn([
            'require' => ['guzzlehttp/guzzle' => '^7.0'],
        ]);
        // wp_json_encode() isn't available in this unit test (WordPress isn't loaded); this is
        // just building a fixture string, not runtime plugin code.
        $this->environment->method('readComposerLock')->willReturn(json_encode([ // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode
            'packages' => [
                ['name' => 'guzzlehttp/guzzle', 'version' => '7.8.1'],
            ],
        ]));

        $result = $this->service->getInstalled();

        $this->assertSame('7.8.1', $result[0]['version']);
        $this->assertSame('^7.0', $result[0]['constraint']);
    }

    // ── getJson ──────────────────────────────────────────────────────────────

    public function test_getJson_returns_raw_composer_json(): void
    {
        $this->environment->method('readComposerJsonRaw')->willReturn('{"name":"demo/site"}');
        $this->assertSame('{"name":"demo/site"}', $this->service->getJson());
    }

    public function test_getJson_returns_null_when_missing(): void
    {
        $this->environment->method('readComposerJsonRaw')->willReturn(null);
        $this->assertNull($this->service->getJson());
    }

    // ── getVersions ──────────────────────────────────────────────────────────

    public function test_getVersions_delegates_to_packagist(): void
    {
        $expected = [['version' => '7.8.0', 'php_compatible' => true, 'php_constraint' => '>=7.2.5']];
        $this->packagist->method('getVersions')->with('guzzlehttp/guzzle')->willReturn($expected);

        $this->assertSame($expected, $this->service->getVersions('guzzlehttp/guzzle'));
    }

    // ── requirePackage ────────────────────────────────────────────────────────

    public function test_requirePackage_runs_composer_and_returns_output(): void
    {
        $this->runner->method('run')
            ->with(['require', 'guzzlehttp/guzzle:^7.0'])
            ->willReturn(['exit_code' => 0, 'output' => 'Package installed.']);

        $output = $this->service->requirePackage('guzzlehttp/guzzle', '^7.0');
        $this->assertSame('Package installed.', $output);
    }

    public function test_requirePackage_throws_runtime_exception_on_composer_failure(): void
    {
        $this->runner->method('run')->willReturn([
            'exit_code' => 1,
            'output'    => 'Could not find package.',
        ]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Could not find package.');
        $this->service->requirePackage('bad/package', '^1.0');
    }

    // ── removePackage ─────────────────────────────────────────────────────────

    public function test_removePackage_runs_composer_and_returns_output(): void
    {
        $this->runner->method('run')
            ->with(['remove', 'guzzlehttp/guzzle'])
            ->willReturn(['exit_code' => 0, 'output' => 'Package removed.']);

        $output = $this->service->removePackage('guzzlehttp/guzzle');
        $this->assertSame('Package removed.', $output);
    }

    // ── repair ───────────────────────────────────────────────────────────────

    public function test_repair_runs_composer_install(): void
    {
        $this->runner->method('run')
            ->with(['install'])
            ->willReturn(['exit_code' => 0, 'output' => 'Nothing to install.']);

        $output = $this->service->repair();
        $this->assertSame('Nothing to install.', $output);
    }

    // ── getDiagnostics ────────────────────────────────────────────────────────

    public function test_getDiagnostics_no_issues_when_platform_matches(): void
    {
        $this->environment->method('readComposerJson')->willReturn([
            'config' => ['platform' => ['php' => PHP_VERSION]],
        ]);

        $result = $this->service->getDiagnostics();

        $this->assertSame(PHP_VERSION, $result['php_version']);
        $this->assertSame(PHP_VERSION, $result['platform_php']);
        $this->assertEmpty($result['issues']);
    }

    public function test_getDiagnostics_reports_mismatch(): void
    {
        $this->environment->method('readComposerJson')->willReturn([
            'config' => ['platform' => ['php' => '8.0.0']],
        ]);

        $result = $this->service->getDiagnostics();

        $this->assertCount(1, $result['issues']);
        $this->assertSame('platform_php_mismatch', $result['issues'][0]['code']);
    }

    public function test_getDiagnostics_reports_missing_platform(): void
    {
        $this->environment->method('readComposerJson')->willReturn([]);

        $result = $this->service->getDiagnostics();

        $this->assertCount(1, $result['issues']);
        $this->assertSame('platform_php_missing', $result['issues'][0]['code']);
        $this->assertNull($result['platform_php']);
    }

    public function test_getDiagnostics_reports_vendor_publicly_accessible(): void
    {
        $this->environment->method('readComposerJson')->willReturn([
            'config' => ['platform' => ['php' => PHP_VERSION]],
        ]);
        $this->httpClient->willReturn(new Response(200, [], '{"packages":[]}'));

        $result = $this->service->getDiagnostics();

        $this->assertCount(1, $result['issues']);
        $this->assertSame('vendor_publicly_accessible', $result['issues'][0]['code']);
    }

    // ── fixPlatform ──────────────────────────────────────────────────────────

    public function test_fixPlatform_writes_current_php_version(): void
    {
        $this->environment->method('readComposerJson')->willReturn([
            'config' => ['platform' => ['php' => '8.0.0']],
        ]);

        $this->environment->expects($this->once())
            ->method('writeComposerJson')
            ->with($this->callback(function (array $json): bool {
                return $json['config']['platform']['php'] === PHP_VERSION;
            }));

        $this->service->fixPlatform();
    }

    // ── audit ─────────────────────────────────────────────────────────────────

    public function test_audit_returns_empty_on_clean_result(): void
    {
        $this->runner->method('run')
            ->with(['audit'], ['--format' => 'json'])
            ->willReturn([
                'exit_code' => 0,
                'output'    => '{"advisories":{},"abandoned":{}}',
            ]);

        $result = $this->service->audit();
        $this->assertEmpty($result['advisories']);
        $this->assertEmpty($result['abandoned']);
    }

    public function test_audit_handles_non_json_preamble(): void
    {
        $this->runner->method('run')->willReturn([
            'exit_code' => 1,
            'output'    => 'Some preamble text{"advisories":{"pkg":[]},"abandoned":{}}',
        ]);

        $result = $this->service->audit();
        $this->assertArrayHasKey('advisories', $result);
    }

    public function test_audit_throws_on_fatal_exit_code(): void
    {
        $this->runner->method('run')->willReturn([
            'exit_code' => 2,
            'output'    => 'Fatal error',
        ]);

        $this->expectException(\RuntimeException::class);
        $this->service->audit();
    }

    // ── getOutdated ──────────────────────────────────────────────────────────

    public function test_getOutdated_filters_packages_already_up_to_date(): void
    {
        $this->runner->method('run')
            ->with(['outdated'], ['--direct' => true, '--format' => 'json'])
            ->willReturn([
                'exit_code' => 0,
                'output'    => json_encode([ // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode
                    'installed' => [
                        ['name' => 'guzzlehttp/guzzle', 'version' => '7.8.0', 'latest' => '7.9.0'],
                        ['name' => 'monolog/monolog', 'version' => '3.0.0', 'latest' => '3.0.0'],
                    ],
                ]),
            ]);

        $result = $this->service->getOutdated();

        $this->assertCount(1, $result);
        $this->assertSame([
            'name'    => 'guzzlehttp/guzzle',
            'version' => '7.8.0',
            'latest'  => '7.9.0',
        ], $result[0]);
    }

    public function test_getOutdated_returns_empty_when_everything_is_current(): void
    {
        $this->runner->method('run')->willReturn([
            'exit_code' => 0,
            'output'    => '{"installed":[]}',
        ]);

        $this->assertSame([], $this->service->getOutdated());
    }

    public function test_getOutdated_handles_non_json_preamble(): void
    {
        $this->runner->method('run')->willReturn([
            'exit_code' => 0,
            'output'    => 'Some preamble text{"installed":[{"name":"a/b","version":"1.0.0","latest":"1.1.0"}]}',
        ]);

        $result = $this->service->getOutdated();
        $this->assertCount(1, $result);
    }

    public function test_getOutdated_throws_on_nonzero_exit_code(): void
    {
        $this->runner->method('run')->willReturn([
            'exit_code' => 1,
            'output'    => 'Fatal error',
        ]);

        $this->expectException(\RuntimeException::class);
        $this->service->getOutdated();
    }

    // ── sync ──────────────────────────────────────────────────────────────────

    /** applyScaffold is exercised directly in LoopressEnvironmentTest; here it's the identity. */
    private function stubScaffoldIdentity(): void
    {
        $this->environment->method('applyScaffold')->willReturnArgument(0);
    }

    public function test_sync_renders_plugins_into_wpackagist_requires_and_maps_latest(): void
    {
        $this->stubScaffoldIdentity();
        $this->environment->method('readComposerJson')->willReturn([
            'require' => ['wpackagist-plugin/old' => '1.0.0', 'monolog/monolog' => '^3.0'],
        ]);
        $this->environment->method('readComposerLock')->willReturn(null);
        $this->environment->method('managedDirExists')->willReturn(false);
        $this->environment->method('readComposerJsonRaw')->willReturn('{}');

        $written = null;
        $this->environment->method('writeComposerJson')
            ->willReturnCallback(function (array $json) use (&$written): void {
                $written = $json;
            });

        $this->runner->method('run')->with(['update'])->willReturn(['exit_code' => 0, 'output' => 'ok']);

        $this->service->sync(['plugins' => ['woocommerce' => '9.4.2', 'wordpress-seo' => 'latest']], null, false);

        // plugins section replaces every wpackagist-plugin/*; libraries untouched (no section).
        $this->assertSame('9.4.2', $written['require']['wpackagist-plugin/woocommerce']);
        $this->assertSame('*', $written['require']['wpackagist-plugin/wordpress-seo']);
        $this->assertArrayNotHasKey('wpackagist-plugin/old', $written['require']);
        $this->assertSame('^3.0', $written['require']['monolog/monolog']);
    }

    public function test_sync_runs_install_when_lock_provided_and_reports_removed(): void
    {
        $this->stubScaffoldIdentity();
        $this->environment->method('readComposerJson')->willReturn(['require' => []]);
        $this->environment->method('managedDirExists')->willReturn(false);
        $this->environment->method('readComposerJsonRaw')->willReturn('{}');
        $this->environment->method('readComposerLock')->willReturnOnConsecutiveCalls(
            '{"packages":[{"name":"wpackagist-plugin/gone"}]}', // previous
            '{"packages":[]}',                                  // after install
        );

        $this->runner->method('run')->with(['install'])->willReturn(['exit_code' => 0, 'output' => 'ok']);

        $result = $this->service->sync(['plugins' => []], '{"packages":[]}', false);
        $this->assertSame(['wpackagist-plugin/gone'], $result['removed']);
    }

    public function test_sync_throws_unmanaged_when_folder_exists_and_not_forced(): void
    {
        $this->stubScaffoldIdentity();
        $this->environment->method('readComposerJson')->willReturn(['require' => []]);
        $this->environment->method('readComposerLock')->willReturn(null);
        $this->environment->method('managedDirExists')->willReturn(true);
        $this->environment->method('managedPackageDir')->willReturn('/wp-content/plugins/woocommerce');

        $this->expectException(\Loopress\Dependencies\Exception\UnmanagedPackageException::class);
        $this->service->sync(['plugins' => ['woocommerce' => '9.4.2']], null, false);
    }

    public function test_sync_stages_unmanaged_folder_when_forced_and_discards_it_on_success(): void
    {
        $this->stubScaffoldIdentity();
        $this->environment->method('readComposerJson')->willReturn(['require' => []]);
        $this->environment->method('readComposerLock')->willReturn(null);
        $this->environment->method('managedDirExists')->willReturn(true);
        $this->environment->method('readComposerJsonRaw')->willReturn('{}');
        $this->environment->method('stageManagedDir')->with('wpackagist-plugin/woocommerce')->willReturn('/staging/woocommerce-abc');

        $this->environment->expects($this->never())->method('restoreStagedDir');
        $this->environment->expects($this->once())->method('discardStagedDir')->with('/staging/woocommerce-abc');
        $this->runner->method('run')->willReturn(['exit_code' => 0, 'output' => 'ok']);

        $this->service->sync(['plugins' => ['woocommerce' => '9.4.2']], null, true);
    }

    // Regression coverage: removeManagedDir() used to delete a force-takeover's original folder
    // outright, before Composer ever ran; a failed run then left the site with neither the old
    // files nor the new ones. The takeover now stages (moves) the folder instead, so a failure
    // can restore it, same as composer.json/composer.lock already do.
    public function test_sync_restores_a_staged_folder_when_the_forced_takeover_fails(): void
    {
        $this->stubScaffoldIdentity();
        $this->environment->method('readComposerJson')->willReturn(['require' => []]);
        $this->environment->method('readComposerLock')->willReturn(null);
        $this->environment->method('managedDirExists')->willReturn(true);
        $this->environment->method('stageManagedDir')->with('wpackagist-plugin/woocommerce')->willReturn('/staging/woocommerce-abc');

        $this->environment->expects($this->once())->method('restoreStagedDir')->with('wpackagist-plugin/woocommerce', '/staging/woocommerce-abc');
        $this->environment->expects($this->never())->method('discardStagedDir');
        $this->runner->method('run')->willReturn(['exit_code' => 1, 'output' => 'Install failed.']);

        try {
            $this->service->sync(['plugins' => ['woocommerce' => '9.4.2']], null, true);
            $this->fail('Expected RuntimeException');
        } catch (\RuntimeException $e) {
            $this->assertSame('Install failed.', $e->getMessage());
        }
    }

    public function test_sync_restores_previous_manifests_on_failure(): void
    {
        $this->stubScaffoldIdentity();
        $this->environment->method('readComposerJson')->willReturn(['require' => []]);
        $this->environment->method('readComposerLock')->willReturn('{"old": "lock"}');
        $this->environment->method('managedDirExists')->willReturn(false);

        $writtenJson = [];
        $this->environment->method('writeComposerJson')
            ->willReturnCallback(function (array $json) use (&$writtenJson): void {
                $writtenJson[] = $json;
            });
        $writtenLock = [];
        $this->environment->method('writeComposerLock')
            ->willReturnCallback(function (string $lock) use (&$writtenLock): void {
                $writtenLock[] = $lock;
            });

        $this->runner->method('run')->willReturn(['exit_code' => 1, 'output' => 'Install failed.']);

        try {
            $this->service->sync(['plugins' => []], '{"new": "lock"}', false);
            $this->fail('Expected RuntimeException');
        } catch (\RuntimeException $e) {
            $this->assertSame('Install failed.', $e->getMessage());
        }

        $this->assertCount(2, $writtenJson); // rendered, then rollback
        $this->assertSame(['{"new": "lock"}', '{"old": "lock"}'], $writtenLock);
    }

    public function test_sync_deletes_written_lock_on_failure_when_none_existed_before(): void
    {
        $this->stubScaffoldIdentity();
        $this->environment->method('readComposerJson')->willReturn(['require' => []]);
        $this->environment->method('readComposerLock')->willReturn(null);
        $this->environment->method('managedDirExists')->willReturn(false);

        $this->environment->expects($this->once())->method('deleteComposerLock');
        $this->runner->method('run')->willReturn(['exit_code' => 1, 'output' => 'Install failed.']);

        $this->expectException(\RuntimeException::class);
        $this->service->sync(['plugins' => []], '{"new": "lock"}', false);
    }
}
