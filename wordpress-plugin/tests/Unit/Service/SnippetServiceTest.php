<?php

namespace Loopress\Tests\Unit\Service;

use Loopress\Contract\SnippetProvider;
use Loopress\Service\SnippetService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class SnippetServiceTest extends TestCase
{
    private function provider(bool $active): SnippetProvider&MockObject
    {
        $provider = $this->createMock(SnippetProvider::class);
        $provider->method('isActive')->willReturn($active);

        return $provider;
    }

    public function test_is_active_false_when_no_provider_is_active(): void
    {
        $service = new SnippetService($this->provider(false), $this->provider(false));

        $this->assertFalse($service->isActive());
    }

    public function test_is_active_true_when_a_provider_is_active(): void
    {
        $service = new SnippetService($this->provider(false), $this->provider(true));

        $this->assertTrue($service->isActive());
    }

    public function test_delegates_to_the_first_active_provider(): void
    {
        $inactive = $this->provider(false);
        $inactive->expects($this->never())->method('getSnippets');

        $active = $this->provider(true);
        $active->method('getSnippets')->willReturn([['id' => 1]]);

        $service = new SnippetService($inactive, $active);

        $this->assertSame([['id' => 1]], $service->getSnippets());
    }

    public function test_get_snippets_throws_when_no_provider_is_active(): void
    {
        $service = new SnippetService($this->provider(false));

        $this->expectException(\RuntimeException::class);
        $service->getSnippets();
    }

    public function test_create_snippet_delegates_to_active_provider(): void
    {
        $active = $this->provider(true);
        $active->method('createSnippet')->with(['title' => 'New'])->willReturn(['id' => 2]);

        $service = new SnippetService($active);

        $this->assertSame(['id' => 2], $service->createSnippet(['title' => 'New']));
    }

    public function test_update_snippet_delegates_to_active_provider(): void
    {
        $active = $this->provider(true);
        $active->method('updateSnippet')->with(2, ['title' => 'Updated'])->willReturn(['id' => 2]);

        $service = new SnippetService($active);

        $this->assertSame(['id' => 2], $service->updateSnippet(2, ['title' => 'Updated']));
    }

    public function test_get_snippet_delegates_to_active_provider(): void
    {
        $active = $this->provider(true);
        $active->method('getSnippet')->with(2)->willReturn(['id' => 2]);

        $service = new SnippetService($active);

        $this->assertSame(['id' => 2], $service->getSnippet(2));
    }
}
