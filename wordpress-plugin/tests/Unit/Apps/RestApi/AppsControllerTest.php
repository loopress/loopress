<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Apps\RestApi;

use Loopress\Tests\Stubs\RestRequest;
use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Apps\Infrastructure\AppsDirectory;
use Loopress\Apps\Infrastructure\AppStore;
use Loopress\Apps\RestApi\AppsController;
use Loopress\Apps\Service\AppsDiagnostics;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Loopress\Tests\Unit\DigsIntoArrays;

class AppsControllerTest extends TestCase
{
    use DigsIntoArrays;

    private AppsDirectory&MockObject $directory;
    private AppStore&MockObject $store;
    private AppsDiagnostics&MockObject $diagnostics;
    private AppsController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->directory   = $this->createMock(AppsDirectory::class);
        $this->store       = $this->createMock(AppStore::class);
        $this->diagnostics = $this->createMock(AppsDiagnostics::class);
        $this->controller  = new AppsController($this->directory, $this->store, $this->diagnostics);

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
    private function b64(string $raw): string
    {
        return base64_encode($raw);
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
        $byName   = array_column(self::arrayAt($response->data), null, 'name');

        $this->assertSame(200, $response->status);
        $this->assertTrue(self::at($byName, 'search', 'committed'));
        $this->assertSame(2, self::at($byName, 'search', 'fileCount'));
        $this->assertSame(30, self::at($byName, 'search', 'totalBytes'));
        $this->assertSame('abc123def456', self::at($byName, 'search', 'buildId'));

        $this->assertFalse(self::at($byName, 'portal', 'committed'));
        $this->assertSame(0, self::at($byName, 'portal', 'fileCount'));
        $this->assertNull(self::at($byName, 'portal', 'buildId'));
    }

    // ── get_manifest ────────────────────────────────────────────────────────

    public function test_get_manifest_returns_404_when_no_committed_build(): void
    {
        $this->store->method('get')->with('search')->willReturn(null);

        $response = $this->controller->get_manifest(RestRequest::with(['name' => 'search']));

        $this->assertSame(404, $response->status);
    }

    public function test_get_manifest_returns_the_stored_record(): void
    {
        $this->store->method('get')->with('search')->willReturn([
            'buildId'       => 'abc123def456',
            'routing'       => 'hash',
            'mountSelector' => '#loopress-app-search',
            'crossOrigin'   => 'same-origin',
            'entry'         => ['scripts' => ['assets/index-x.js'], 'styles' => []],
            'files'         => [['path' => 'assets/index-x.js', 'sha256' => self::HASH_JS, 'size' => 10]],
        ]);

        $response = $this->controller->get_manifest(RestRequest::with(['name' => 'search']));

        $this->assertSame(200, $response->status);
        $this->assertSame('same-origin', self::at($response->data, 'crossOrigin'), 'pull must get it back, or it drops it locally');
        $this->assertSame('search', self::at($response->data, 'name'));
        $this->assertSame('abc123def456', self::at($response->data, 'buildId'));
        $this->assertSame('#loopress-app-search', self::at($response->data, 'mountSelector'));
        $this->assertCount(1, self::arrayAt($response->data, 'files'));
    }

    // ── get_asset ───────────────────────────────────────────────────────────

    public function test_get_asset_returns_404_when_the_file_is_absent(): void
    {
        $this->directory->method('readAsset')->with('search', 'assets/missing.js')->willReturn(null);

        $response = $this->controller->get_asset(RestRequest::with(['name' => 'search', 'path' => 'assets/missing.js']));

        $this->assertSame(404, $response->status);
    }

    public function test_get_asset_returns_base64_encoded_contents(): void
    {
        $this->directory->method('readAsset')->with('search', 'assets/x.css')->willReturn('body{}');

        $response = $this->controller->get_asset(RestRequest::with(['name' => 'search', 'path' => 'assets/x.css']));

        $this->assertSame(200, $response->status);
        $this->assertSame('base64', self::at($response->data, 'encoding'));
        $this->assertSame($this->b64('body{}'), self::at($response->data, 'content'));
    }

    public function test_get_asset_rejects_a_traversal_attempt_in_the_app_name(): void
    {
        $this->directory->expects($this->never())->method('readAsset');

        $response = $this->controller->get_asset(RestRequest::with(['name' => '../etc', 'path' => 'assets/x.js']));

        $this->assertSame(400, $response->status);
    }

    // ── put_asset ───────────────────────────────────────────────────────────

    public function test_put_asset_rejects_an_invalid_app_name(): void
    {
        $this->directory->expects($this->never())->method('writeAsset');

        $response = $this->controller->put_asset(RestRequest::with([
            'name' => 'Bad_Name', 'path' => 'assets/x.js', 'content' => $this->b64('x'), 'encoding' => 'base64',
        ]));

        $this->assertSame(400, $response->status);
    }

    public function test_put_asset_rejects_an_unsafe_asset_path(): void
    {
        $this->directory->expects($this->never())->method('writeAsset');

        $response = $this->controller->put_asset(RestRequest::with([
            'name' => 'search', 'path' => '../evil.js', 'content' => $this->b64('x'), 'encoding' => 'base64',
        ]));

        $this->assertSame(400, $response->status);
        $this->assertStringContainsString('Unsafe', self::stringAt($response->data, 'error'));
    }

    public function test_put_asset_rejects_a_non_base64_encoding(): void
    {
        $this->directory->expects($this->never())->method('writeAsset');

        $response = $this->controller->put_asset(RestRequest::with([
            'name' => 'search', 'path' => 'assets/x.js', 'content' => 'x', 'encoding' => 'gzip',
        ]));

        $this->assertSame(400, $response->status);
    }

    public function test_put_asset_rejects_content_that_is_not_valid_base64(): void
    {
        $this->directory->expects($this->never())->method('writeAsset');

        $response = $this->controller->put_asset(RestRequest::with([
            'name' => 'search', 'path' => 'assets/x.js', 'content' => '!!! not base64 !!!', 'encoding' => 'base64',
        ]));

        $this->assertSame(400, $response->status);
    }

    public function test_put_asset_rejects_a_file_over_the_size_cap(): void
    {
        Functions\when('apply_filters')->justReturn(4);
        $this->directory->expects($this->never())->method('writeAsset');

        $response = $this->controller->put_asset(RestRequest::with([
            'name' => 'search', 'path' => 'assets/x.js', 'content' => $this->b64('ten-bytes!'), 'encoding' => 'base64',
        ]));

        $this->assertSame(413, $response->status);
    }

    public function test_put_asset_writes_the_decoded_bytes_and_reports_the_size(): void
    {
        $this->directory->expects($this->once())
            ->method('writeAsset')
            ->with('search', 'assets/x.js', 'console.log(1)');

        $response = $this->controller->put_asset(RestRequest::with([
            'name' => 'search', 'path' => 'assets/x.js', 'content' => $this->b64('console.log(1)'), 'encoding' => 'base64',
        ]));

        $this->assertSame(200, $response->status);
        $this->assertSame(14, self::at($response->data, 'size'));
    }

    public function test_put_asset_returns_400_when_the_directory_refuses_the_write(): void
    {
        $this->directory->method('writeAsset')->willThrowException(new \RuntimeException('disk full'));

        $response = $this->controller->put_asset(RestRequest::with([
            'name' => 'search', 'path' => 'assets/x.js', 'content' => $this->b64('x'), 'encoding' => 'base64',
        ]));

        $this->assertSame(400, $response->status);
    }

    // ── commit ──────────────────────────────────────────────────────────────

    public function test_commit_rejects_an_invalid_app_name(): void
    {
        $this->store->expects($this->never())->method('put');

        $response = $this->controller->commit(RestRequest::with(['name' => 'Bad_Name']));

        $this->assertSame(400, $response->status);
    }

    public function test_commit_returns_400_for_a_malformed_manifest(): void
    {
        $this->store->expects($this->never())->method('put');

        // A well-formed request object, but the body has none of the manifest fields.
        $response = $this->controller->commit(RestRequest::with(['name' => 'search']));

        $this->assertSame(400, $response->status);
        $this->assertStringContainsString('Invalid manifest', self::stringAt($response->data, 'error'));
    }

    public function test_commit_returns_409_when_a_declared_asset_was_never_uploaded(): void
    {
        $this->directory->method('listAssets')->with('search')->willReturn([]);
        $this->store->expects($this->never())->method('put');

        $request = RestRequest::with($this->validManifestBody());
        $request->set_param('name', 'search');

        $response = $this->controller->commit($request);

        $this->assertSame(409, $response->status);
        $this->assertSame('incomplete_upload', self::at($response->data, 'code'));
        $this->assertStringContainsString('not uploaded', self::stringAt($response->data, 'error'));
    }

    public function test_commit_returns_409_when_an_uploaded_asset_hash_does_not_match(): void
    {
        $this->directory->method('listAssets')->with('search')->willReturn([
            'assets/index-x.js'  => ['sha256' => str_repeat('9', 64), 'size' => 10],
            'assets/index-y.css' => ['sha256' => self::HASH_CSS, 'size' => 20],
        ]);
        $this->store->expects($this->never())->method('put');

        $request = RestRequest::with($this->validManifestBody());
        $request->set_param('name', 'search');

        $response = $this->controller->commit($request);

        $this->assertSame(409, $response->status);
        $this->assertStringContainsString('re-upload', self::stringAt($response->data, 'error'));
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

        $request = RestRequest::with($this->validManifestBody());
        $request->set_param('name', 'search');

        $response = $this->controller->commit($request);

        $this->assertSame(200, $response->status);
        $this->assertSame('9f2a1c7b4e10', self::at($response->data, 'buildId'));
        $this->assertSame(2, self::at($response->data, 'fileCount'));
        $this->assertNotNull($captured);
        $this->assertSame('9f2a1c7b4e10', $captured['buildId']);
        $this->assertIsString($captured['deployedAt']);
        $this->assertCount(2, self::arrayAt($captured, 'files'));
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

        $request = RestRequest::with($body);
        $request->set_param('name', 'search');

        $response = $this->controller->commit($request);

        $this->assertSame(200, $response->status);
        $this->assertSame(['assets/ancient.js'], $removed);
        $this->assertContains('assets/ancient.js', self::arrayAt($response->data, 'removed'));
    }

    // ── delete_app ──────────────────────────────────────────────────────────

    public function test_delete_app_returns_404_when_the_app_is_unknown(): void
    {
        $this->directory->method('hasApp')->with('search')->willReturn(false);
        $this->store->method('get')->with('search')->willReturn(null);
        $this->directory->expects($this->never())->method('deleteApp');

        $response = $this->controller->delete_app(RestRequest::with(['name' => 'search']));

        $this->assertSame(404, $response->status);
    }

    public function test_delete_app_removes_the_bundle_and_forgets_the_record(): void
    {
        $this->directory->method('hasApp')->with('search')->willReturn(true);
        $this->store->method('get')->with('search')->willReturn(null);

        $this->directory->expects($this->once())->method('deleteApp')->with('search');
        $this->store->expects($this->once())->method('forget')->with('search');

        $response = $this->controller->delete_app(RestRequest::with(['name' => 'search']));

        $this->assertSame(200, $response->status);
        $this->assertTrue(self::at($response->data, 'deleted'));
    }

    public function test_commit_applies_and_echoes_the_crossOrigin_policy(): void
    {
        $this->directory->method('listAssets')->willReturn([
            'assets/index-x.js'  => ['sha256' => self::HASH_JS, 'size' => 10],
            'assets/index-y.css' => ['sha256' => self::HASH_CSS, 'size' => 20],
        ]);
        $this->directory->expects($this->once())->method('writeCrossOriginPolicy')->with('search', 'same-origin')->willReturn(true);

        $request = RestRequest::with(['crossOrigin' => 'same-origin'] + $this->validManifestBody());
        $request->set_param('name', 'search');

        $response = $this->controller->commit($request);

        $this->assertSame(200, $response->status);
        $this->assertSame('same-origin', self::at($response->data, 'crossOrigin'));
    }

    public function test_commit_does_not_echo_a_crossOrigin_policy_it_could_not_apply(): void
    {
        $this->directory->method('listAssets')->willReturn([
            'assets/index-x.js'  => ['sha256' => self::HASH_JS, 'size' => 10],
            'assets/index-y.css' => ['sha256' => self::HASH_CSS, 'size' => 20],
        ]);
        $this->directory->method('writeCrossOriginPolicy')->willReturn(false); // site-owned .htaccess

        $request = RestRequest::with(['crossOrigin' => 'same-origin'] + $this->validManifestBody());
        $request->set_param('name', 'search');

        $response = $this->controller->commit($request);

        $this->assertSame(200, $response->status);
        $this->assertNull(self::at($response->data, 'crossOrigin'));
    }
}
