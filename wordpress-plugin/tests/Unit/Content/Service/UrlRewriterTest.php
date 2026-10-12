<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Content\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Content\Exception\NotLocalEnvironmentException;
use Loopress\Content\Service\ContentService;
use Loopress\Content\Service\UrlRewriter;
use PHPUnit\Framework\TestCase;

class UrlRewriterTest extends TestCase
{
    private UrlRewriter $rewriter;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        Functions\when('is_serialized')->alias(static fn (string $value): bool => $value === 'b:0;' || @unserialize($value) !== false);
        $this->rewriter = new UrlRewriter('https://prod.test', 'https://site.local', 'https://prod.test/wp-content/uploads');
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_rewrites_links_but_keeps_media_on_the_source_site(): void
    {
        $this->assertSame(
            '<a href="https://site.local/about/">x</a><img src="https://prod.test/wp-content/uploads/a.jpg">',
            $this->rewriter->rewrite('<a href="https://prod.test/about/">x</a><img src="https://prod.test/wp-content/uploads/a.jpg">'),
        );
    }

    public function test_leaves_a_longer_host_alone(): void
    {
        $this->assertSame('https://prod.testing.com/a https://site.local', $this->rewriter->rewrite('https://prod.testing.com/a https://prod.test'));
    }

    public function test_keeps_serialized_lengths_valid(): void
    {
        $value = serialize(['link' => 'https://prod.test/shop', 'nested' => [serialize('https://prod.test/')], 'n' => 3]);

        $this->assertSame(
            ['link' => 'https://site.local/shop', 'nested' => [serialize('https://site.local/')], 'n' => 3],
            unserialize((string) $this->rewriter->rewrite($value)),
        );
    }

    public function test_leaves_values_without_the_source_url_untouched(): void
    {
        $this->assertNull($this->rewriter->rewrite(null));
        $this->assertSame('a:1:{i:0;s:3:"abc";}', $this->rewriter->rewrite('a:1:{i:0;s:3:"abc";}'));
    }

    public function test_import_refuses_a_site_that_is_not_local(): void
    {
        Functions\when('wp_get_environment_type')->justReturn('production');

        $this->expectException(NotLocalEnvironmentException::class);

        (new ContentService())->reset('https://prod.test', 'https://prod.test/wp-content/uploads');
    }
}
