<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Apps\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Apps\Infrastructure\AppsDirectory;
use Loopress\Apps\Infrastructure\AppStore;
use Loopress\Apps\RestApi\AppsController;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use WP_REST_Request;

class AppsControllerTest extends TestCase
{
    private AppsDirectory&MockObject $directory;
    private AppStore&MockObject $store;
    private AppsController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->directory  = $this->createMock(AppsDirectory::class);
        $this->store      = $this->createMock(AppStore::class);
        $this->controller = new AppsController($this->directory, $this->store);

        // put_asset() reads a filterable per-file size cap; default is "no filter changed it".
        Functions\when('apply_filters')->alias(static fn (string $hook, mixed $value = null): mixed => $value);
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    private const HASH_JS  = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    private const HASH_CSS = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    // base64 is the asset transport encoding these endpoints speak, not obfuscation.
    private static function b64(string $raw): string
    {
        return base64_encode($raw); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
    }

    /** @return array<string, mixed> */
    private function validManifestBody(): array
    {
        return [
            'buildId'       => '9f2a1c7b4e10',
            'routing'       => 'hash',
            'mountSelector' => '#loopress-app-search',
            'entry'         => ['scripts' => ['assets/index-x.js'], 'styles' => ['assets/index-y.css']],
            'files'         => [
                ['path' => 'assets/index-x.js', 'sha256' => self::HASH_JS, 'size' => 10],
                ['path' => 'assets/index-y.css', 'sha256' => self::HASH_CSS, 'size' => 20],
            ],
        ];
    }

    // ── list_apps ───────────────────────────────────────────────────────────

    public function test_list_apps_merges_directory_names_with_store_records(): void
    {
        $this->directory->method('listAppNames')->willReturn(['portal', 'search']);
        $this->store->method('all')->willReturn([
            'search' => [
                'buildId'    => 'abc123def456',
                'routing'    => 'hash',
                'deployedAt' => '2026-08-30T12:00:00+00:00',
                'files'      => [['path' => 'a.js', 'size' => 10], ['path' => 'b.js', 'size' => 20]],
            ],
        ]);

        $response = $this->controller->list_apps();
        $byName   = array_column($response->data, null, 'name');

        $this->assertSame(200, $response->status);
        $this->assertTrue($byName['search']['committed']);
        $this->assertSame(2, $byName['search']['fileCount']);
        $this->assertSame(30, $byName['search']['totalBytes']);
        $this->assertSame('abc123def456', $byName['search']['buildId']);

        $this->assertFalse($byName['portal']['committed']);
        $this->assertSame(0, $byName['portal']['fileCount']);
        $this->assertNull($byName['portal']['buildId']);
    }

    // ── get_manifest ────────────────────────────────────────────────────────

    public function test_get_manifest_returns_404_when_no_committed_build(): void
    {
        $this->store->method('get')->with('search')->willReturn(null);

        $response = $this->controller->get_manifest(new WP_REST_Request(['name' => 'search']));

        $this->assertSame(404, $response->status);
    }

    public function test_get_manifest_returns_the_stored_record(): void
    {
        $this->store->method('get')->with('search')->willReturn([
            'buildId'       => 'abc123def456',
            'routing'       => 'hash',
            'mountSelector' => '#loopress-app-search',
            'entry'         => ['scripts' => ['assets/index-x.js'], 'styles' => []],
            'files'         => [['path' => 'assets/index-x.js', 'sha256' => self::HASH_JS, 'size' => 10]],
        ]);

        $response = $this->controller->get_manifest(new WP_REST_Request(['name' => 'search']));

        $this->assertSame(200, $response->status);
        $this->assertSame('search', $response->data['name']);
        $this->assertSame('abc123def456', $response->data['buildId']);
        $this->assertSame('#loopress-app-search', $response->data['mountSelector']);
        $this->assertCount(1, $response->data['files']);
    }

    // ── get_asset ───────────────────────────────────────────────────────────

    public function test_get_asset_returns_404_when_the_file_is_absent(): void
    {
        $this->directory->method('readAsset')->with('search', 'assets/missing.js')->willReturn(null);

        $response = $this->controller->get_asset(new WP_REST_Request(['name' => 'search', 'path' => 'assets/missing.js']));

        $this->assertSame(404, $response->status);
    }

    public function test_get_asset_returns_base64_encoded_contents(): void
    {
        $this->directory->method('readAsset')->with('search', 'assets/x.css')->willReturn('body{}');

        $response = $this->controller->get_asset(new WP_REST_Request(['name' => 'search', 'path' => 'assets/x.css']));

        $this->assertSame(200, $response->status);
        $this->assertSame('base64', $response->data['encoding']);
        $this->assertSame(self::b64('body{}'), $response->data['content']);
    }

    public function test_get_asset_rejects_a_traversal_attempt_in_the_app_name(): void
    {
        $this->directory->expects($this->never())->method('readAsset');

        $response = $this->controller->get_asset(new WP_REST_Request(['name' => '../etc', 'path' => 'assets/x.js']));

        $this->assertSame(400, $response->status);
    }

    // ── put_asset ───────────────────────────────────────────────────────────

    public function test_put_asset_rejects_an_invalid_app_name(): void
    {
        $this->directory->expects($this->never())->method('writeAsset');

        $response = $this->controller->put_asset(new WP_REST_Request([
            'name' => 'Bad_Name', 'path' => 'assets/x.js', 'content' => self::b64('x'), 'encoding' => 'base64',
        ]));

        $this->assertSame(400, $response->status);
    }

    public function test_put_asset_rejects_an_unsafe_asset_path(): void
    {
        $this->directory->expects($this->never())->method('writeAsset');

        $response = $this->controller->put_asset(new WP_REST_Request([
            'name' => 'search', 'path' => '../evil.js', 'content' => self::b64('x'), 'encoding' => 'base64',
        ]));

        $this->assertSame(400, $response->status);
        $this->assertStringContainsString('Unsafe', (string) $response->data['error']);
    }

    public function test_put_asset_rejects_a_non_base64_encoding(): void
    {
        $this->directory->expects($this->never())->method('writeAsset');

        $response = $this->controller->put_asset(new WP_REST_Request([
            'name' => 'search', 'path' => 'assets/x.js', 'content' => 'x', 'encoding' => 'gzip',
        ]));

        $this->assertSame(400, $response->status);
    }

    public function test_put_asset_rejects_content_that_is_not_valid_base64(): void
    {
        $this->directory->expects($this->never())->method('writeAsset');

        $response = $this->controller->put_asset(new WP_REST_Request([
            'name' => 'search', 'path' => 'assets/x.js', 'content' => '!!! not base64 !!!', 'encoding' => 'base64',
        ]));

        $this->assertSame(400, $response->status);
    }

    public function test_put_asset_rejects_a_file_over_the_size_cap(): void
    {
        Functions\when('apply_filters')->justReturn(4);
        $this->directory->expects($this->never())->method('writeAsset');

        $response = $this->controller->put_asset(new WP_REST_Request([
            'name' => 'search', 'path' => 'assets/x.js', 'content' => self::b64('ten-bytes!'), 'encoding' => 'base64',
        ]));

        $this->assertSame(413, $response->status);
    }

    public function test_put_asset_writes_the_decoded_bytes_and_reports_the_size(): void
    {
        $this->directory->expects($this->once())
            ->method('writeAsset')
            ->with('search', 'assets/x.js', 'console.log(1)');

        $response = $this->controller->put_asset(new WP_REST_Request([
            'name' => 'search', 'path' => 'assets/x.js', 'content' => self::b64('console.log(1)'), 'encoding' => 'base64',
        ]));

        $this->assertSame(200, $response->status);
        $this->assertSame(14, $response->data['size']);
    }

    public function test_put_asset_returns_400_when_the_directory_refuses_the_write(): void
    {
        $this->directory->method('writeAsset')->willThrowException(new \RuntimeException('disk full'));

        $response = $this->controller->put_asset(new WP_REST_Request([
            'name' => 'search', 'path' => 'assets/x.js', 'content' => self::b64('x'), 'encoding' => 'base64',
        ]));

        $this->assertSame(400, $response->status);
    }

    // ── commit ──────────────────────────────────────────────────────────────

    public function test_commit_rejects_an_invalid_app_name(): void
    {
        $this->store->expects($this->never())->method('put');

        $response = $this->controller->commit(new WP_REST_Request(['name' => 'Bad_Name']));

        $this->assertSame(400, $response->status);
    }

    public function test_commit_returns_400_for_a_malformed_manifest(): void
    {
        $this->store->expects($this->never())->method('put');

        // A well-formed request object, but the body has none of the manifest fields.
        $response = $this->controller->commit(new WP_REST_Request(['name' => 'search']));

        $this->assertSame(400, $response->status);
        $this->assertStringContainsString('Invalid manifest', (string) $response->data['error']);
    }

    public function test_commit_returns_409_when_a_declared_asset_was_never_uploaded(): void
    {
        $this->directory->method('listAssets')->with('search')->willReturn([]);
        $this->store->expects($this->never())->method('put');

        $request = new WP_REST_Request($this->validManifestBody());
        $request->set_param('name', 'search');

        $response = $this->controller->commit($request);

        $this->assertSame(409, $response->status);
        $this->assertSame('incomplete_upload', $response->data['code']);
        $this->assertStringContainsString('not uploaded', (string) $response->data['error']);
    }

    public function test_commit_returns_409_when_an_uploaded_asset_hash_does_not_match(): void
    {
        $this->directory->method('listAssets')->with('search')->willReturn([
            'assets/index-x.js'  => ['sha256' => str_repeat('9', 64), 'size' => 10],
            'assets/index-y.css' => ['sha256' => self::HASH_CSS, 'size' => 20],
        ]);
        $this->store->expects($this->never())->method('put');

        $request = new WP_REST_Request($this->validManifestBody());
        $request->set_param('name', 'search');

        $response = $this->controller->commit($request);

        $this->assertSame(409, $response->status);
        $this->assertStringContainsString('re-upload', (string) $response->data['error']);
    }

    public function test_commit_flips_the_store_record_once_every_asset_is_present(): void
    {
        $this->directory->method('listAssets')->with('search')->willReturn([
            'assets/index-x.js'  => ['sha256' => self::HASH_JS, 'size' => 10],
            'assets/index-y.css' => ['sha256' => self::HASH_CSS, 'size' => 20],
        ]);
        $this->store->method('get')->with('search')->willReturn(null);

        $captured = null;
        $this->store->expects($this->once())
            ->method('put')
            ->with('search', $this->callback(function (array $record) use (&$captured): bool {
                $captured = $record;
                return true;
            }));

        $request = new WP_REST_Request($this->validManifestBody());
        $request->set_param('name', 'search');

        $response = $this->controller->commit($request);

        $this->assertSame(200, $response->status);
        $this->assertSame('9f2a1c7b4e10', $response->data['buildId']);
        $this->assertSame(2, $response->data['fileCount']);
        $this->assertSame('9f2a1c7b4e10', $captured['buildId']);
        $this->assertIsString($captured['deployedAt']);
        $this->assertCount(2, $captured['files']);
    }

    public function test_commit_keeps_the_previous_generation_files_and_drops_older_ones(): void
    {
        $body = [
            'buildId'       => '9f2a1c7b4e10',
            'routing'       => 'hash',
            'mountSelector' => '#loopress-app-search',
            'entry'         => ['scripts' => ['assets/new.js'], 'styles' => []],
            'files'         => [['path' => 'assets/new.js', 'sha256' => self::HASH_JS, 'size' => 10]],
        ];

        $this->directory->method('listAssets')->with('search')->willReturn([
            'assets/new.js'     => ['sha256' => self::HASH_JS, 'size' => 10],
            'assets/old.js'     => ['sha256' => str_repeat('7', 64), 'size' => 8],
            'assets/ancient.js' => ['sha256' => str_repeat('6', 64), 'size' => 6],
        ]);
        // The build we are replacing referenced assets/old.js: keep it one generation.
        $this->store->method('get')->with('search')->willReturn([
            'files' => [['path' => 'assets/old.js', 'sha256' => str_repeat('7', 64), 'size' => 8]],
        ]);

        $removed = [];
        $this->directory->method('removeAsset')->willReturnCallback(
            static function (string $name, string $path) use (&$removed): void {
                $removed[] = $path;
            }
        );

        $request = new WP_REST_Request($body);
        $request->set_param('name', 'search');

        $response = $this->controller->commit($request);

        $this->assertSame(200, $response->status);
        $this->assertSame(['assets/ancient.js'], $removed);
        $this->assertContains('assets/ancient.js', $response->data['removed']);
    }

    // ── delete_app ──────────────────────────────────────────────────────────

    public function test_delete_app_returns_404_when_the_app_is_unknown(): void
    {
        $this->directory->method('hasApp')->with('search')->willReturn(false);
        $this->store->method('get')->with('search')->willReturn(null);
        $this->directory->expects($this->never())->method('deleteApp');

        $response = $this->controller->delete_app(new WP_REST_Request(['name' => 'search']));

        $this->assertSame(404, $response->status);
    }

    public function test_delete_app_removes_the_bundle_and_forgets_the_record(): void
    {
        $this->directory->method('hasApp')->with('search')->willReturn(true);
        $this->store->method('get')->with('search')->willReturn(null);

        $this->directory->expects($this->once())->method('deleteApp')->with('search');
        $this->store->expects($this->once())->method('forget')->with('search');

        $response = $this->controller->delete_app(new WP_REST_Request(['name' => 'search']));

        $this->assertSame(200, $response->status);
        $this->assertTrue($response->data['deleted']);
    }
}
