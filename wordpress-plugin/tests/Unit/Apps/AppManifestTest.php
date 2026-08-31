<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Apps;

use Loopress\Apps\Infrastructure\AppManifest;
use PHPUnit\Framework\TestCase;

class AppManifestTest extends TestCase
{
    /** @return array<string, mixed> */
    private function validManifest(): array
    {
        $js  = str_repeat('a', 64);
        $css = str_repeat('b', 64);

        return [
            'buildId'       => '9f2a1c7b4e10',
            'routing'       => 'hash',
            'mountSelector' => '#loopress-app-search',
            'entry'         => [
                'scripts' => ['assets/index-x.js'],
                'styles'  => ['assets/index-y.css'],
            ],
            'files' => [
                ['path' => 'assets/index-x.js', 'sha256' => $js, 'size' => 10],
                ['path' => 'assets/index-y.css', 'sha256' => $css, 'size' => 20],
                ['path' => 'index.html', 'sha256' => str_repeat('c', 64), 'size' => 5],
            ],
        ];
    }

    public function test_normalize_returns_the_vetted_shape(): void
    {
        $out = AppManifest::normalize($this->validManifest());

        $this->assertSame('9f2a1c7b4e10', $out['buildId']);
        $this->assertSame('hash', $out['routing']);
        $this->assertSame(['assets/index-x.js'], $out['entry']['scripts']);
        $this->assertCount(3, $out['files']);
    }

    public function test_normalize_rejects_history_routing(): void
    {
        $manifest            = $this->validManifest();
        $manifest['routing'] = 'history';

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('not supported');
        AppManifest::normalize($manifest);
    }

    public function test_normalize_rejects_a_bad_mount_selector(): void
    {
        $manifest                  = $this->validManifest();
        $manifest['mountSelector'] = 'loopress-app-search';

        $this->expectException(\InvalidArgumentException::class);
        AppManifest::normalize($manifest);
    }

    public function test_normalize_rejects_an_entry_not_present_in_files(): void
    {
        $manifest                     = $this->validManifest();
        $manifest['entry']['scripts'] = ['assets/not-listed.js'];

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('not in files');
        AppManifest::normalize($manifest);
    }

    public function test_normalize_rejects_an_unsafe_file_path(): void
    {
        $manifest          = $this->validManifest();
        $manifest['files'][] = ['path' => '../evil.js', 'sha256' => str_repeat('d', 64), 'size' => 1];

        $this->expectException(\InvalidArgumentException::class);
        AppManifest::normalize($manifest);
    }

    public function test_normalize_rejects_a_php_file(): void
    {
        $manifest            = $this->validManifest();
        $manifest['files'][0]['path'] = 'assets/shell.php';
        $manifest['entry']['scripts'] = ['assets/shell.php'];

        $this->expectException(\InvalidArgumentException::class);
        AppManifest::normalize($manifest);
    }

    public function test_normalize_rejects_a_bad_sha256(): void
    {
        $manifest                     = $this->validManifest();
        $manifest['files'][0]['sha256'] = 'nope';

        $this->expectException(\InvalidArgumentException::class);
        AppManifest::normalize($manifest);
    }

    public function test_normalize_rejects_empty_files(): void
    {
        $manifest          = $this->validManifest();
        $manifest['files'] = [];

        $this->expectException(\InvalidArgumentException::class);
        AppManifest::normalize($manifest);
    }

    public function test_normalize_rejects_duplicate_file_paths(): void
    {
        $manifest            = $this->validManifest();
        $manifest['files'][] = ['path' => 'assets/index-x.js', 'sha256' => str_repeat('e', 64), 'size' => 1];

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('duplicate');
        AppManifest::normalize($manifest);
    }
}
