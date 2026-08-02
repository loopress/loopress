<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit;

use FilesystemIterator;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;

// Exercises the real uninstall.php file directly (copied into a disposable temp directory so
// its own __DIR__ resolves there, not into this repo's actual vendor/), rather than refactoring
// it into a testable class: it's a WordPress-invoked bootstrap script, not application code, and
// copying it is cheaper than adding an abstraction it doesn't otherwise need.
class UninstallTest extends TestCase
{
    #[RunInSeparateProcess]
    public function test_returns_early_without_fataling_when_vendor_autoload_is_missing(): void
    {
        // Regression coverage: a dev checkout symlinked into wp-content/plugins/ without
        // `composer install` has no vendor/ yet. Reproduced live via a disposable plugin copy
        // during the 6th QA pass (DELETE wp/v2/plugins returned a clean 200 instead of the
        // fatal `Failed opening required '.../vendor/autoload.php'` seen before this fix.
        $dir = $this->makeTempPluginCopy(withVendor: false);

        define('WP_UNINSTALL_PLUGIN', true);

        // Reaching this line at all is the assertion: the old code fataled on the require_once
        // before ever getting here.
        include $dir . '/uninstall.php';
        $this->addToAssertionCount(1);

        $this->removeDirRecursive($dir);
    }

    #[RunInSeparateProcess]
    public function test_removes_the_loopress_content_directory_when_vendor_autoload_is_present(): void
    {
        $dir = $this->makeTempPluginCopy(withVendor: true);
        $contentDir = $dir . '/wp-content';
        mkdir($contentDir . '/loopress', 0777, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir

        define('WP_CONTENT_DIR', $contentDir);
        define('WP_UNINSTALL_PLUGIN', true);

        include $dir . '/uninstall.php';

        $this->assertSame([$contentDir . '/loopress/'], \Symfony\Component\Filesystem\Filesystem::$removed);

        $this->removeDirRecursive($dir);
    }

    private function makeTempPluginCopy(bool $withVendor): string
    {
        $dir = sys_get_temp_dir() . '/loopress-uninstall-test-' . uniqid();
        mkdir($dir, 0777, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir
        copy(dirname(__DIR__, 2) . '/uninstall.php', $dir . '/uninstall.php');

        if ($withVendor) {
            // A minimal fake autoloader for Symfony\Component\Filesystem\Filesystem: exercises
            // uninstall.php's real `use`/`new Filesystem()` code path without pulling in the
            // real composer vendor tree, and records calls instead of touching the real
            // filesystem beyond this temp dir.
            mkdir($dir . '/vendor', 0777, true); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_mkdir
            file_put_contents( // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
                $dir . '/vendor/autoload.php',
                "<?php\n" .
                "namespace Symfony\\Component\\Filesystem;\n" .
                "class Filesystem {\n" .
                "    public static array \$removed = [];\n" .
                "    public function remove(string \$dir): void { self::\$removed[] = \$dir; }\n" .
                "}\n",
            );
        }

        return $dir;
    }

    private function removeDirRecursive(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }

        foreach (new FilesystemIterator($dir) as $item) {
            $item->isDir() ? $this->removeDirRecursive($item->getPathname()) : unlink($item->getPathname()); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
        }

        rmdir($dir); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rmdir
    }
}
