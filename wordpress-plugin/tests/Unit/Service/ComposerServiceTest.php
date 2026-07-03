<?php

namespace Loopress\Tests\Unit\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Exception\ProductionLockException;
use Loopress\Infrastructure\ComposerRunner;
use Loopress\Infrastructure\LoopressEnvironment;
use Loopress\Infrastructure\PackagistClient;
use Loopress\Service\SettingsService;
use Loopress\Service\ComposerService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class ComposerServiceTest extends TestCase
{
    private LoopressEnvironment&MockObject $dxEnv;
    private ComposerRunner&MockObject $runner;
    private PackagistClient&MockObject $packagist;
    private SettingsService&MockObject $settings;
    private ComposerService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->dxEnv    = $this->createMock(LoopressEnvironment::class);
        $this->runner   = $this->createMock(ComposerRunner::class);
        $this->packagist = $this->createMock(PackagistClient::class);
        $this->settings = $this->createMock(SettingsService::class);

        $this->service = new ComposerService(
            $this->dxEnv,
            $this->runner,
            $this->packagist,
            $this->settings,
        );
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── getInstalled ─────────────────────────────────────────────────────────

    public function test_getInstalled_returns_empty_when_no_require(): void
    {
        $this->dxEnv->method('readComposerJson')->willReturn([]);
        $this->assertSame([], $this->service->getInstalled());
    }

    public function test_getInstalled_falls_back_to_constraint_without_lock_file(): void
    {
        $this->dxEnv->method('readComposerJson')->willReturn([
            'require' => [
                'guzzlehttp/guzzle' => '^7.0',
                'monolog/monolog'   => '^3.0',
            ],
        ]);
        $this->dxEnv->method('readComposerLock')->willReturn(null);

        $result = $this->service->getInstalled();

        $this->assertCount(2, $result);
        $this->assertSame('guzzlehttp/guzzle', $result[0]['name']);
        $this->assertSame('^7.0', $result[0]['version']);
        $this->assertSame('^7.0', $result[0]['constraint']);
        $this->assertSame('monolog/monolog', $result[1]['name']);
    }

    public function test_getInstalled_reports_exact_locked_versions(): void
    {
        $this->dxEnv->method('readComposerJson')->willReturn([
            'require' => ['guzzlehttp/guzzle' => '^7.0'],
        ]);
        // wp_json_encode() isn't available in this unit test (WordPress isn't loaded); this is
        // just building a fixture string, not runtime plugin code.
        $this->dxEnv->method('readComposerLock')->willReturn(json_encode([ // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode
            'packages' => [
                ['name' => 'guzzlehttp/guzzle', 'version' => '7.8.1'],
            ],
        ]));

        $result = $this->service->getInstalled();

        $this->assertSame('7.8.1', $result[0]['version']);
        $this->assertSame('^7.0', $result[0]['constraint']);
    }

    // ── getVersions ──────────────────────────────────────────────────────────

    public function test_getVersions_delegates_to_packagist(): void
    {
        $expected = [['version' => '7.8.0', 'php_compatible' => true, 'php_constraint' => '>=7.2.5']];
        $this->packagist->method('getVersions')->with('guzzlehttp/guzzle')->willReturn($expected);

        $this->assertSame($expected, $this->service->getVersions('guzzlehttp/guzzle'));
    }

    // ── requirePackage ────────────────────────────────────────────────────────

    public function test_requirePackage_throws_when_locked(): void
    {
        $this->settings->method('isLocked')->willReturn(true);
        $this->expectException(ProductionLockException::class);
        $this->service->requirePackage('guzzlehttp/guzzle', '^7.0');
    }

    public function test_requirePackage_runs_composer_and_returns_output(): void
    {
        $this->settings->method('isLocked')->willReturn(false);
        $this->runner->method('run')
            ->with(['require', 'guzzlehttp/guzzle:^7.0'])
            ->willReturn(['exit_code' => 0, 'output' => 'Package installed.']);

        $output = $this->service->requirePackage('guzzlehttp/guzzle', '^7.0');
        $this->assertSame('Package installed.', $output);
    }

    public function test_requirePackage_throws_runtime_exception_on_composer_failure(): void
    {
        $this->settings->method('isLocked')->willReturn(false);
        $this->runner->method('run')->willReturn([
            'exit_code' => 1,
            'output'    => 'Could not find package.',
        ]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Could not find package.');
        $this->service->requirePackage('bad/package', '^1.0');
    }

    // ── removePackage ─────────────────────────────────────────────────────────

    public function test_removePackage_throws_when_locked(): void
    {
        $this->settings->method('isLocked')->willReturn(true);
        $this->expectException(ProductionLockException::class);
        $this->service->removePackage('guzzlehttp/guzzle');
    }

    public function test_removePackage_runs_composer_and_returns_output(): void
    {
        $this->settings->method('isLocked')->willReturn(false);
        $this->runner->method('run')
            ->with(['remove', 'guzzlehttp/guzzle'])
            ->willReturn(['exit_code' => 0, 'output' => 'Package removed.']);

        $output = $this->service->removePackage('guzzlehttp/guzzle');
        $this->assertSame('Package removed.', $output);
    }

    // ── repair ───────────────────────────────────────────────────────────────

    public function test_repair_throws_when_locked(): void
    {
        $this->settings->method('isLocked')->willReturn(true);
        $this->expectException(ProductionLockException::class);
        $this->service->repair();
    }

    public function test_repair_runs_composer_install(): void
    {
        $this->settings->method('isLocked')->willReturn(false);
        $this->runner->method('run')
            ->with(['install'])
            ->willReturn(['exit_code' => 0, 'output' => 'Nothing to install.']);

        $output = $this->service->repair();
        $this->assertSame('Nothing to install.', $output);
    }

    // ── getDiagnostics ────────────────────────────────────────────────────────

    public function test_getDiagnostics_no_issues_when_platform_matches(): void
    {
        $this->dxEnv->method('readComposerJson')->willReturn([
            'config' => ['platform' => ['php' => PHP_VERSION]],
        ]);

        $result = $this->service->getDiagnostics();

        $this->assertSame(PHP_VERSION, $result['php_version']);
        $this->assertSame(PHP_VERSION, $result['platform_php']);
        $this->assertEmpty($result['issues']);
    }

    public function test_getDiagnostics_reports_mismatch(): void
    {
        $this->dxEnv->method('readComposerJson')->willReturn([
            'config' => ['platform' => ['php' => '8.0.0']],
        ]);

        $result = $this->service->getDiagnostics();

        $this->assertCount(1, $result['issues']);
        $this->assertSame('platform_php_mismatch', $result['issues'][0]['code']);
    }

    public function test_getDiagnostics_reports_missing_platform(): void
    {
        $this->dxEnv->method('readComposerJson')->willReturn([]);

        $result = $this->service->getDiagnostics();

        $this->assertCount(1, $result['issues']);
        $this->assertSame('platform_php_missing', $result['issues'][0]['code']);
        $this->assertNull($result['platform_php']);
    }

    // ── fixPlatform ──────────────────────────────────────────────────────────

    public function test_fixPlatform_throws_when_locked(): void
    {
        $this->settings->method('isLocked')->willReturn(true);
        $this->expectException(ProductionLockException::class);
        $this->service->fixPlatform();
    }

    public function test_fixPlatform_writes_current_php_version(): void
    {
        $this->settings->method('isLocked')->willReturn(false);
        $this->dxEnv->method('readComposerJson')->willReturn([
            'config' => ['platform' => ['php' => '8.0.0']],
        ]);

        $this->dxEnv->expects($this->once())
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

    // ── sync ──────────────────────────────────────────────────────────────────

    public function test_sync_throws_when_locked(): void
    {
        $this->settings->method('isLocked')->willReturn(true);
        $this->expectException(ProductionLockException::class);
        $this->service->sync('{}', null);
    }

    public function test_sync_rejects_invalid_json(): void
    {
        $this->settings->method('isLocked')->willReturn(false);
        $this->expectException(\InvalidArgumentException::class);
        $this->service->sync('{not json', null);
    }

    public function test_sync_writes_manifests_and_runs_install_when_lock_provided(): void
    {
        $this->settings->method('isLocked')->willReturn(false);
        $this->dxEnv->method('readComposerJson')->willReturn(['name' => 'old/manifest']);
        $this->dxEnv->method('readComposerLock')->willReturn('{"old": "lock"}');

        $this->dxEnv->expects($this->once())
            ->method('writeComposerJson')
            ->with(['name' => 'new/manifest']);
        $this->dxEnv->expects($this->once())
            ->method('writeComposerLock')
            ->with('{"new": "lock"}');

        $this->runner->method('run')
            ->with(['install'])
            ->willReturn(['exit_code' => 0, 'output' => 'Installed.']);

        $output = $this->service->sync('{"name": "new/manifest"}', '{"new": "lock"}');
        $this->assertSame('Installed.', $output);
    }

    public function test_sync_runs_update_when_no_lock_provided(): void
    {
        $this->settings->method('isLocked')->willReturn(false);
        $this->dxEnv->method('readComposerJson')->willReturn([]);
        $this->dxEnv->method('readComposerLock')->willReturn(null);

        $this->runner->method('run')
            ->with(['update'])
            ->willReturn(['exit_code' => 0, 'output' => 'Updated.']);

        $output = $this->service->sync('{"name": "new/manifest"}', null);
        $this->assertSame('Updated.', $output);
    }

    public function test_sync_restores_previous_manifests_on_failure(): void
    {
        $this->settings->method('isLocked')->willReturn(false);
        $this->dxEnv->method('readComposerJson')->willReturn(['name' => 'old/manifest']);
        $this->dxEnv->method('readComposerLock')->willReturn('{"old": "lock"}');

        // First write: the incoming manifest. Second write: the rollback.
        $writtenJson = [];
        $this->dxEnv->method('writeComposerJson')
            ->willReturnCallback(function (array $json) use (&$writtenJson): void {
                $writtenJson[] = $json;
            });

        $writtenLock = [];
        $this->dxEnv->method('writeComposerLock')
            ->willReturnCallback(function (string $lock) use (&$writtenLock): void {
                $writtenLock[] = $lock;
            });

        $this->runner->method('run')->willReturn(['exit_code' => 1, 'output' => 'Install failed.']);

        try {
            $this->service->sync('{"name": "new/manifest"}', '{"new": "lock"}');
            $this->fail('Expected RuntimeException');
        } catch (\RuntimeException $e) {
            $this->assertSame('Install failed.', $e->getMessage());
        }

        $this->assertSame([['name' => 'new/manifest'], ['name' => 'old/manifest']], $writtenJson);
        $this->assertSame(['{"new": "lock"}', '{"old": "lock"}'], $writtenLock);
    }

    public function test_sync_deletes_written_lock_on_failure_when_none_existed_before(): void
    {
        $this->settings->method('isLocked')->willReturn(false);
        $this->dxEnv->method('readComposerJson')->willReturn([]);
        $this->dxEnv->method('readComposerLock')->willReturn(null);

        $this->dxEnv->expects($this->once())->method('deleteComposerLock');
        $this->runner->method('run')->willReturn(['exit_code' => 1, 'output' => 'Install failed.']);

        $this->expectException(\RuntimeException::class);
        $this->service->sync('{"name": "new/manifest"}', '{"new": "lock"}');
    }
}
