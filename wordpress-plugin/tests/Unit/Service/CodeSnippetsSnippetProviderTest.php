<?php

namespace Loopress\Tests\Unit\Service;

use Loopress\Service\CodeSnippetsSnippetProvider;
use PHPUnit\Framework\TestCase;

class CodeSnippetsSnippetProviderTest extends TestCase
{
    private CodeSnippetsSnippetProvider $provider;

    protected function setUp(): void
    {
        parent::setUp();
        $this->provider = new CodeSnippetsSnippetProvider();
    }

    public function test_is_not_active_when_code_snippets_plugin_class_is_missing(): void
    {
        $this->assertFalse($this->provider->isActive());
    }

    public function test_get_snippets_throws_not_implemented(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->provider->getSnippets();
    }

    public function test_get_snippet_throws_not_implemented(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->provider->getSnippet(1);
    }

    public function test_create_snippet_throws_not_implemented(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->provider->createSnippet(['title' => 'New']);
    }

    public function test_update_snippet_throws_not_implemented(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->provider->updateSnippet(1, ['title' => 'Updated']);
    }
}
