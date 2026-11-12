<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Blocks\RestApi;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Blocks\Infrastructure\BlocksDirectory;
use Loopress\Blocks\RestApi\BlockFilesController;
use Loopress\Tests\Stubs\RestRequest;
use Loopress\Tests\Unit\DigsIntoArrays;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Filesystem\Filesystem;

class BlockFilesControllerTest extends TestCase
{
    use DigsIntoArrays;

    private const BLOCK_JSON = '{"apiVersion":3,"name":"loopress/hero","title":"Hero"}';

    private string $tmpDir;
    private BlocksDirectory $directory;
    private BlockFilesController $controller;
    /** @var array<string, mixed> */
    private array $options = [];

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->tmpDir = sys_get_temp_dir() . '/loopress-blockfiles-test-' . uniqid();
        mkdir($this->tmpDir, 0755, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir
        if (!defined('WP_CONTENT_DIR')) {
            define('WP_CONTENT_DIR', $this->tmpDir);
        }
        if (!defined('ABSPATH')) {
            define('ABSPATH', $this->tmpDir . '/');
        }

        Functions\when('apply_filters')->alias(static fn(string $hook, mixed $value = null): mixed => $value);
        Functions\when('get_option')->alias(fn(string $name, mixed $fallback = false): mixed => $this->options[$name] ?? $fallback);

        $this->directory  = new BlocksDirectory();
        $this->controller = new BlockFilesController($this->directory);
    }

    protected function tearDown(): void
    {
        (new Filesystem())->remove([WP_CONTENT_DIR . '/loopress', $this->tmpDir]);
        Monkey\tearDown();
        parent::tearDown();
    }

    /** @param array<string, mixed> $params */
    private function push(array $params): \WP_REST_Response
    {
        return $this->controller->push_block(RestRequest::with($params));
    }

    public function test_a_pushed_block_is_listed_with_its_files(): void
    {
        $response = $this->push(['slug' => 'hero', 'files' => ['block.json' => self::BLOCK_JSON, 'render.php' => '<p>hi</p>']]);

        $this->assertSame(200, $response->status);
        $this->assertSame(['slug' => 'hero', 'files' => ['block.json', 'render.php']], $response->data);
        $this->assertSame(
            [['slug' => 'hero', 'files' => ['block.json' => self::BLOCK_JSON, 'render.php' => '<p>hi</p>']]],
            $this->controller->list_blocks()->data,
        );
    }

    public function test_the_listing_reports_a_load_error_and_a_runtime_error_of_the_current_render_file_only(): void
    {
        $this->push(['slug' => 'hero', 'files' => ['block.json' => self::BLOCK_JSON, 'render.php' => '<p>hi</p>']]);
        $revision = $this->directory->renderRevision('hero');
        $this->options[BlocksDirectory::LOAD_ERRORS_OPTION]    = ['hero' => 'bad block.json'];
        $this->options[BlocksDirectory::RUNTIME_ERRORS_OPTION] = ['hero' => ['revision' => $revision, 'message' => 'Undefined variable', 'at' => 0]];

        $listed = $this->controller->list_blocks()->data;

        $this->assertSame('bad block.json', self::at($listed, 0, 'error'));
        $this->assertSame(['message' => 'Undefined variable', 'at' => '1970-01-01T00:00:00+00:00'], self::at($listed, 0, 'runtimeError'));

        // Pushing a fixed render.php makes the stored error stale: it is not reported anymore.
        $this->push(['slug' => 'hero', 'files' => ['block.json' => self::BLOCK_JSON, 'render.php' => '<p>fixed</p>']]);
        $this->assertArrayNotHasKey('runtimeError', self::arrayAt($this->controller->list_blocks()->data, 0));
    }

    public function test_a_bad_slug_or_bad_files_are_refused_with_the_reason_and_nothing_is_written(): void
    {
        $cases = [
            ['Bad Slug', ['block.json' => self::BLOCK_JSON, 'render.php' => ''], 'Invalid block slug'],
            ['hero', 'text', '"files" must be an object'],
            ['hero', ['evil.php' => 'x'], 'unsupported file "evil.php"'],
            ['hero', ['block.json' => 12, 'render.php' => ''], 'block.json must be a string.'],
            ['hero', ['block.json' => self::BLOCK_JSON], 'render.php is required.'],
            ['hero', ['render.php' => '<p>'], 'block.json is required.'],
            ['hero', ['block.json' => '[1]', 'render.php' => '<p>'], 'block.json is not a valid JSON object.'],
            ['hero', ['block.json' => '{"name":"loopress/other"}', 'render.php' => '<p>'], 'must be "loopress/hero"'],
            ['hero', ['block.json' => self::BLOCK_JSON, 'render.php' => '<?php $a = ;'], 'PHP Parse error'],
            ['hero', ['block.json' => self::BLOCK_JSON, 'render.php' => '<?php namespace Foo; echo 1;'], 'remove its namespace statement'],
            ['hero', ['block.json' => self::BLOCK_JSON, 'render.php' => '<?php declare(strict_types=1); echo 1;'], 'remove its declare statement'],
        ];

        foreach ($cases as [$slug, $files, $message]) {
            $response = $this->push(['slug' => $slug, 'files' => $files]);

            $this->assertSame(400, $response->status, $message);
            $this->assertStringContainsString($message, self::stringAt($response->data, 'error'));
        }
        $this->assertSame([], $this->directory->listSlugs());
    }

    public function test_deleting_removes_the_block_and_an_unknown_one_is_a_404(): void
    {
        $this->push(['slug' => 'hero', 'files' => ['block.json' => self::BLOCK_JSON, 'render.php' => '<p>hi</p>']]);

        $deleted = $this->controller->delete_block(RestRequest::with(['slug' => 'hero']));
        $this->assertSame(200, $deleted->status);
        $this->assertSame(['slug' => 'hero', 'deleted' => true], $deleted->data);
        $this->assertSame([], $this->directory->listSlugs());

        $this->assertSame(404, $this->controller->delete_block(RestRequest::with(['slug' => 'hero']))->status);
        $this->assertSame(400, $this->controller->delete_block(RestRequest::with(['slug' => '../etc']))->status);
    }
}
