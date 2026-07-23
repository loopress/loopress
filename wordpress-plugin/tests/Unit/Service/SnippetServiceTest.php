<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Service;

use Loopress\Snippets\Contract\SnippetData;
use Loopress\Snippets\Contract\SnippetProvider;
use Loopress\Snippets\Exception\NoActiveSnippetPluginException;
use Loopress\Snippets\Service\SnippetService;
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
        $snippets = [new SnippetData(id: 1)];
        $active->method('getSnippets')->willReturn($snippets);

        $service = new SnippetService($inactive, $active);

        $this->assertSame($snippets, $service->getSnippets());
    }

    public function test_get_snippets_throws_when_no_provider_is_active(): void
    {
        $service = new SnippetService($this->provider(false));

        $this->expectException(NoActiveSnippetPluginException::class);
        $service->getSnippets();
    }

    public function test_get_snippets_throws_when_more_than_one_provider_is_active(): void
    {
        $first = $this->provider(true);
        $first->expects($this->never())->method('getSnippets');

        $second = $this->provider(true);
        $second->expects($this->never())->method('getSnippets');

        $service = new SnippetService($first, $second);

        $this->expectException(NoActiveSnippetPluginException::class);
        $this->expectExceptionMessage('Multiple snippet plugins are active');
        $service->getSnippets();
    }

    public function test_is_active_true_when_more_than_one_provider_is_active(): void
    {
        // isActive() only answers "is there a usable provider", it must not throw on its own;
        // the multi-provider conflict is only raised when a snippet operation is actually attempted.
        $service = new SnippetService($this->provider(true), $this->provider(true));

        $this->assertTrue($service->isActive());
    }

    public function test_create_snippet_delegates_to_active_provider(): void
    {
        $input  = new SnippetData(name: 'New');
        $result = new SnippetData(id: 2, name: 'New');

        $active = $this->provider(true);
        $active->method('createSnippet')->with($input)->willReturn($result);

        $service = new SnippetService($active);

        $this->assertSame($result, $service->createSnippet($input));
    }

    public function test_update_snippet_delegates_to_active_provider(): void
    {
        $input  = new SnippetData(name: 'Updated');
        $result = new SnippetData(id: 2, name: 'Updated');

        $active = $this->provider(true);
        $active->method('updateSnippet')->with(2, $input)->willReturn($result);

        $service = new SnippetService($active);

        $this->assertSame($result, $service->updateSnippet(2, $input));
    }

    public function test_get_snippet_delegates_to_active_provider(): void
    {
        $result = new SnippetData(id: 2);

        $active = $this->provider(true);
        $active->method('getSnippet')->with(2)->willReturn($result);

        $service = new SnippetService($active);

        $this->assertSame($result, $service->getSnippet(2));
    }

    public function test_delete_snippet_delegates_to_active_provider(): void
    {
        $active = $this->provider(true);
        $active->method('deleteSnippet')->with(2)->willReturn(true);

        $service = new SnippetService($active);

        $this->assertTrue($service->deleteSnippet(2));
    }

    public function test_delete_snippet_throws_when_no_provider_is_active(): void
    {
        $service = new SnippetService($this->provider(false));

        $this->expectException(NoActiveSnippetPluginException::class);
        $service->deleteSnippet(2);
    }
}
