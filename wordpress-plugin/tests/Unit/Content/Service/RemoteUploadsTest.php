<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Content\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Content\Service\RemoteUploads;
use Loopress\Tests\Unit\DigsIntoArrays;
use PHPUnit\Framework\TestCase;

class RemoteUploadsTest extends TestCase
{
    use DigsIntoArrays;

    private string $basedir;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->basedir = sys_get_temp_dir() . '/loopress-uploads-' . uniqid();
        mkdir($this->basedir);
        touch($this->basedir . '/local.png');
        Functions\when('wp_get_upload_dir')->justReturn(['baseurl' => 'https://local.test/uploads', 'basedir' => $this->basedir]);
    }

    protected function tearDown(): void
    {
        unlink($this->basedir . '/local.png');
        rmdir($this->basedir);
        Monkey\tearDown();
        parent::tearDown();
    }

    private function copied(): void
    {
        Functions\when('get_option')->justReturn(['home' => 'https://prod.test', 'uploadsUrl' => 'https://prod.test/uploads/']);
    }

    public function test_a_missing_file_is_served_from_the_source_site(): void
    {
        $this->copied();

        $this->assertSame('https://prod.test/uploads/2026/a.png', (new RemoteUploads())->attachmentUrl('https://local.test/uploads/2026/a.png'));
    }

    public function test_a_file_that_exists_locally_keeps_its_local_url(): void
    {
        $this->copied();

        $this->assertSame('https://local.test/uploads/local.png', (new RemoteUploads())->attachmentUrl('https://local.test/uploads/local.png'));
    }

    public function test_urls_outside_the_uploads_folder_are_untouched(): void
    {
        $this->copied();

        $this->assertSame('https://cdn.test/a.png', (new RemoteUploads())->attachmentUrl('https://cdn.test/a.png'));
        $this->assertSame('https://local.test/uploadsX/a.png', (new RemoteUploads())->attachmentUrl('https://local.test/uploadsX/a.png'));
    }

    public function test_nothing_is_rewritten_when_no_content_was_copied(): void
    {
        foreach ([false, [], ['uploadsUrl' => '']] as $option) {
            Functions\when('get_option')->justReturn($option);

            $this->assertSame('https://local.test/uploads/a.png', (new RemoteUploads())->attachmentUrl('https://local.test/uploads/a.png'));
        }
    }

    public function test_srcset_rewrites_only_the_missing_sources(): void
    {
        $this->copied();

        $sources = (new RemoteUploads())->srcset([
            300 => ['url' => 'https://local.test/uploads/a-300.png', 'descriptor' => 'w', 'value' => 300],
            600 => ['url' => 'https://local.test/uploads/local.png', 'descriptor' => 'w', 'value' => 600],
            900 => 'not a source',
            1200 => ['descriptor' => 'w'],
        ]);

        $this->assertSame('https://prod.test/uploads/a-300.png', self::at($sources, 300, 'url'));
        $this->assertSame(300, self::at($sources, 300, 'value'));
        $this->assertSame('https://local.test/uploads/local.png', self::at($sources, 600, 'url'));
        $this->assertSame('not a source', $sources[900]);
        $this->assertSame(['descriptor' => 'w'], $sources[1200]);
    }
}
