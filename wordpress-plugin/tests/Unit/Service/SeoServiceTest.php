<?php

namespace Loopress\Tests\Unit\Service;

use Loopress\Contract\SeoProvider;
use Loopress\Contract\SeoRedirectProvider;
use Loopress\Service\SeoService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class SeoServiceTest extends TestCase
{
    private function provider(bool $active): SeoProvider&MockObject
    {
        $provider = $this->createMock(SeoProvider::class);
        $provider->method('isActive')->willReturn($active);

        return $provider;
    }

    private function redirectProvider(bool $active): SeoRedirectProvider&MockObject
    {
        $provider = $this->createMock(SeoRedirectProvider::class);
        $provider->method('isActive')->willReturn($active);

        return $provider;
    }

    // ── isActive / provider arbitration ──────────────────────────────────────

    public function test_is_active_false_when_no_provider_is_active(): void
    {
        $service = new SeoService($this->provider(false), $this->provider(false));

        $this->assertFalse($service->isActive());
    }

    public function test_is_active_true_when_a_provider_is_active(): void
    {
        $service = new SeoService($this->provider(false), $this->provider(true));

        $this->assertTrue($service->isActive());
    }

    // isActive() only answers "is there a usable provider", it must not throw on its own; the
    // multi-provider conflict is only raised when a SEO operation is actually attempted.
    public function test_is_active_true_when_more_than_one_provider_is_active(): void
    {
        $service = new SeoService($this->provider(true), $this->provider(true));

        $this->assertTrue($service->isActive());
    }

    public function test_get_settings_throws_when_no_provider_is_active(): void
    {
        $service = new SeoService($this->provider(false));

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('No supported SEO plugin is active.');
        $service->getSettings();
    }

    public function test_get_settings_throws_when_more_than_one_provider_is_active(): void
    {
        $first = $this->provider(true);
        $first->expects($this->never())->method('getSettings');

        $second = $this->provider(true);
        $second->expects($this->never())->method('getSettings');

        $service = new SeoService($first, $second);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Multiple SEO plugins are active');
        $service->getSettings();
    }

    // ── post meta / settings delegation ──────────────────────────────────────

    public function test_list_post_meta_delegates_to_the_active_provider(): void
    {
        $inactive = $this->provider(false);
        $inactive->expects($this->never())->method('listPostMeta');

        $active = $this->provider(true);
        $active->method('listPostMeta')->with('post')->willReturn([['slug' => 'hello']]);

        $service = new SeoService($inactive, $active);

        $this->assertSame([['slug' => 'hello']], $service->listPostMeta('post'));
    }

    public function test_get_post_meta_delegates_to_the_active_provider(): void
    {
        $active = $this->provider(true);
        $active->method('getPostMeta')->with('post', 'hello')->willReturn(['slug' => 'hello']);

        $service = new SeoService($active);

        $this->assertSame(['slug' => 'hello'], $service->getPostMeta('post', 'hello'));
    }

    public function test_upsert_post_meta_delegates_to_the_active_provider(): void
    {
        $active = $this->provider(true);
        $active->method('upsertPostMeta')->with('post', 'hello', ['title' => 'New'])->willReturn(['slug' => 'hello']);

        $service = new SeoService($active);

        $this->assertSame(['slug' => 'hello'], $service->upsertPostMeta('post', 'hello', ['title' => 'New']));
    }

    public function test_update_settings_delegates_to_the_active_provider(): void
    {
        $active = $this->provider(true);
        $active->method('updateSettings')->with(['titleSeparator' => '-'])->willReturn(['titleSeparator' => '-']);

        $service = new SeoService($active);

        $this->assertSame(['titleSeparator' => '-'], $service->updateSettings(['titleSeparator' => '-']));
    }

    // ── redirects (only some providers support them) ─────────────────────────

    public function test_list_redirections_delegates_when_the_active_provider_supports_redirects(): void
    {
        $active = $this->redirectProvider(true);
        $active->method('listRedirections')->willReturn([['id' => 1]]);

        $service = new SeoService($active);

        $this->assertSame([['id' => 1]], $service->listRedirections());
    }

    // Mirrors ACF options pages requiring ACF PRO: the active provider (e.g. Yoast) is real and
    // active, it just doesn't implement SeoRedirectProvider, so this must fail loudly instead of
    // silently returning an empty list as if there simply were no redirects.
    public function test_list_redirections_throws_when_the_active_provider_does_not_support_redirects(): void
    {
        $service = new SeoService($this->provider(true));

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Redirects are not supported by the active SEO plugin.');
        $service->listRedirections();
    }

    public function test_get_redirection_delegates_when_supported(): void
    {
        $active = $this->redirectProvider(true);
        $active->method('getRedirection')->with(7)->willReturn(['id' => 7]);

        $service = new SeoService($active);

        $this->assertSame(['id' => 7], $service->getRedirection(7));
    }

    public function test_create_redirection_delegates_when_supported(): void
    {
        $active = $this->redirectProvider(true);
        $active->method('createRedirection')->with(['urlTo' => '/new'])->willReturn(['id' => 1, 'urlTo' => '/new']);

        $service = new SeoService($active);

        $this->assertSame(['id' => 1, 'urlTo' => '/new'], $service->createRedirection(['urlTo' => '/new']));
    }

    public function test_update_redirection_delegates_when_supported(): void
    {
        $active = $this->redirectProvider(true);
        $active->method('updateRedirection')->with(1, ['status' => 'inactive'])->willReturn(['id' => 1, 'status' => 'inactive']);

        $service = new SeoService($active);

        $this->assertSame(['id' => 1, 'status' => 'inactive'], $service->updateRedirection(1, ['status' => 'inactive']));
    }

    public function test_create_redirection_throws_when_no_provider_is_active(): void
    {
        $service = new SeoService($this->provider(false));

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('No supported SEO plugin is active.');
        $service->createRedirection(['urlTo' => '/new']);
    }
}
