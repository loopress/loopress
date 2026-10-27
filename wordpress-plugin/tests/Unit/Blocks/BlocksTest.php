<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Blocks;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Blocks\Frontend\BlockLoader;
use Loopress\Blocks\Infrastructure\BlocksDirectory;
use Loopress\Blocks\RestApi\BlockFilesController;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Filesystem\Filesystem;

class BlocksTest extends TestCase
{
    private const BLOCK_JSON = '{"apiVersion":3,"name":"loopress/hero","title":"Hero"}';

    private string $tmpDir;
    private BlocksDirectory $directory;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        $this->tmpDir = sys_get_temp_dir() . '/loopress-blocks-test-' . uniqid();
        mkdir($this->tmpDir, 0755, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir
        if (!defined('WP_CONTENT_DIR')) {
            define('WP_CONTENT_DIR', $this->tmpDir);
        }
        // render.php carries the ABSPATH guard, which would otherwise exit the test run.
        if (!defined('ABSPATH')) {
            define('ABSPATH', $this->tmpDir . '/');
        }

        $this->directory = new BlocksDirectory();
    }

    protected function tearDown(): void
    {
        (new Filesystem())->remove([WP_CONTENT_DIR . '/loopress', $this->tmpDir]);
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_write_guards_render_php_on_disk_and_read_strips_it(): void
    {
        $this->directory->write('hero', ['block.json' => self::BLOCK_JSON, 'render.php' => '<p>hi</p>']);

        $onDisk = (string) file_get_contents($this->directory->blockPath('hero') . 'render.php'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        $this->assertStringStartsWith(BlocksDirectory::GUARD, $onDisk);
        $this->assertSame(['block.json' => self::BLOCK_JSON, 'render.php' => '<p>hi</p>'], $this->directory->read('hero'));
        $this->assertSame(['hero'], $this->directory->listSlugs());
    }

    public function test_write_replaces_the_whole_folder(): void
    {
        $this->directory->write('hero', ['block.json' => self::BLOCK_JSON, 'render.php' => 'a', 'style.css' => 'p{}']);
        $this->directory->write('hero', ['block.json' => self::BLOCK_JSON, 'render.php' => 'b']);

        $this->assertSame(['block.json' => self::BLOCK_JSON, 'render.php' => 'b'], $this->directory->read('hero'));
        // No staging or backup folder left behind next to it.
        $this->assertSame(['hero', 'index.php'], array_values(array_diff((array) scandir($this->directory->root()), ['.', '..'])));
    }

    public function test_write_refuses_a_file_outside_the_allowlist(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->directory->write('hero', ['shell.php' => '<?php']);
    }

    public function test_problems_accepts_a_valid_block(): void
    {
        $files = ['block.json' => self::BLOCK_JSON, 'render.php' => '<?php echo 1;'];
        $this->assertSame($files, BlockFilesController::problems('hero', $files));
    }

    public function test_problems_reports_each_invalid_case(): void
    {
        $this->assertSame('render.php is required.', BlockFilesController::problems('hero', ['block.json' => self::BLOCK_JSON]));
        $this->assertStringContainsString('unsupported file "x.php"', $this->problem('hero', ['x.php' => '']));
        $this->assertSame('block.json "name" must be "loopress/other".', BlockFilesController::problems('other', ['block.json' => self::BLOCK_JSON, 'render.php' => '']));
        $this->assertSame('block.json is not a valid JSON object.', BlockFilesController::problems('hero', ['block.json' => '[]', 'render.php' => '']));
        $this->assertStringContainsString('remove its declare statement', $this->problem('hero', ['block.json' => self::BLOCK_JSON, 'render.php' => "<?php\ndeclare(strict_types=1);\necho 1;"]));
        $this->assertStringContainsString('remove its namespace statement', $this->problem('hero', ['block.json' => self::BLOCK_JSON, 'render.php' => "<?php\nnamespace Acme;\necho 1;"]));
        $this->assertStringStartsWith('render.php: PHP Parse error', $this->problem('hero', ['block.json' => self::BLOCK_JSON, 'render.php' => '<?php if (']));
    }

    /** @param array<string, string> $files */
    private function problem(string $slug, array $files): string
    {
        $problem = BlockFilesController::problems($slug, $files);
        self::assertIsString($problem);

        return $problem;
    }

    public function test_render_passes_attributes_and_swallows_a_throw(): void
    {
        $loader = new BlockLoader($this->directory);

        $this->directory->write('hero', ['block.json' => self::BLOCK_JSON, 'render.php' => '<p><?= $attributes["n"] ?></p>']);
        $this->assertSame('<p>3</p>', $loader->render('hero', ['n' => 3], '', null));

        Functions\when('get_option')->justReturn([]);
        Functions\expect('update_option')->once()->with(BlocksDirectory::RUNTIME_ERRORS_OPTION, \Mockery::on(
            static fn(array $errors): bool => is_array($errors['hero'] ?? null) && ($errors['hero']['message'] ?? null) === 'boom',
        ), false);

        $this->directory->write('hero', ['block.json' => self::BLOCK_JSON, 'render.php' => '<p>half<?php throw new \RuntimeException("boom"); ?>']);
        $level = ob_get_level();
        $this->assertSame('', $loader->render('hero', [], '', null));
        $this->assertSame($level, ob_get_level());
    }

    public function test_filterMetadata_only_touches_loopress_blocks(): void
    {
        Functions\when('wp_normalize_path')->returnArg();
        $this->directory->write('hero', ['block.json' => self::BLOCK_JSON, 'render.php' => '']);
        $loader = new BlockLoader($this->directory);
        $file   = (string) realpath($this->directory->blockPath('hero') . 'block.json');

        $ours = $loader->filterMetadata(['file' => $file, 'supports' => ['html' => false]]);
        $this->assertSame(['html' => false, 'inserter' => false], $ours['supports']);
        $this->assertIsString($ours['version']);

        $kept = $loader->filterMetadata(['file' => $file, 'version' => '2', 'supports' => ['inserter' => true]]);
        $this->assertSame('2', $kept['version']);
        $this->assertSame(['inserter' => true], $kept['supports']);

        $other = ['file' => '/elsewhere/block.json'];
        $this->assertSame($other, $loader->filterMetadata($other));
    }

    public function test_filterAssetUrl_points_into_wp_content(): void
    {
        Functions\when('wp_normalize_path')->returnArg();
        Functions\when('content_url')->alias(static fn(string $path): string => "https://example.test/wp-content/{$path}");
        $this->directory->write('hero', ['block.json' => self::BLOCK_JSON, 'render.php' => '', 'style.css' => '']);
        $loader = new BlockLoader($this->directory);
        $style  = (string) realpath($this->directory->blockPath('hero') . 'style.css');

        $this->assertSame('https://example.test/wp-content/loopress/blocks/hero/style.css', $loader->filterAssetUrl('broken', 'style.css', $style));
        $this->assertSame('kept', $loader->filterAssetUrl('kept', 'x.css', '/wp-content/plugins/x/x.css'));
    }
}
