<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Infrastructure;

use Loopress\Infrastructure\DirectoryGuard;
use PHPUnit\Framework\TestCase;

class DirectoryGuardTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir() . '/loopress-guard-test-' . uniqid() . '/';
        mkdir($this->dir, 0755, true);
    }

    protected function tearDown(): void
    {
        if (is_file($this->dir . '.htaccess')) {
            unlink($this->dir . '.htaccess');
        }
        rmdir($this->dir);
        parent::tearDown();
    }

    public function test_writeHtaccess_creates_a_missing_file(): void
    {
        DirectoryGuard::writeHtaccess($this->dir, "# Loopress: v1\n");

        $this->assertSame("# Loopress: v1\n", file_get_contents($this->dir . '.htaccess'));
    }

    public function test_writeHtaccess_updates_a_file_loopress_still_manages(): void
    {
        file_put_contents($this->dir . '.htaccess', "# Loopress: v1\n");

        DirectoryGuard::writeHtaccess($this->dir, "# Loopress: v2\nHeader set X-Content-Type-Options \"nosniff\"\n");

        $this->assertStringContainsString('nosniff', (string) file_get_contents($this->dir . '.htaccess'));
        $this->assertSame([], glob($this->dir . '.htaccess.*'), 'no temp file left behind');
    }

    public function test_writeHtaccess_leaves_a_file_the_site_owner_took_over(): void
    {
        file_put_contents($this->dir . '.htaccess', "# custom rules\nRequire all denied\n");

        DirectoryGuard::writeHtaccess($this->dir, "# Loopress: v2\n");

        $this->assertSame("# custom rules\nRequire all denied\n", file_get_contents($this->dir . '.htaccess'));
    }
}
