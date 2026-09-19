<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Snippets\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Snippets\Contract\SnippetData;
use Loopress\Snippets\Contract\SnippetProvider;
use Loopress\Snippets\Exception\NoActiveSnippetPluginException;
use Loopress\Snippets\Exception\StaleSnippetRevisionException;
use Loopress\Snippets\Service\SnippetService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class SnippetServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        // getSnippet()/createSnippet()/updateSnippet()'s revision hash goes through
        // wp_json_encode(), unavailable outside a real WordPress load; a plain json_encode()
        // delegate is exactly what it does for the JSON-safe values a SnippetData ever holds.
        Functions\when('wp_json_encode')->alias(static fn (mixed $value): string|false => json_encode($value));
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

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

    // Regression coverage (#234): createSnippet()/updateSnippet()/getSnippet() no longer hand
    // back the exact object the provider returned, they wrap it with a computed `revision` (see
    // withRevision()), so these can no longer assertSame() on identity; every other field must
    // still round-trip from the provider untouched.
    public function test_create_snippet_delegates_to_active_provider(): void
    {
        $input  = new SnippetData(name: 'New');
        $result = new SnippetData(id: 2, name: 'New');

        $active = $this->provider(true);
        $active->method('createSnippet')->with($input)->willReturn($result);

        $service  = new SnippetService($active);
        $returned = $service->createSnippet($input);

        $this->assertSame(2, $returned->id);
        $this->assertSame('New', $returned->name);
        $this->assertNotNull($returned->revision);
    }

    public function test_update_snippet_delegates_to_active_provider(): void
    {
        $input  = new SnippetData(name: 'Updated');
        $result = new SnippetData(id: 2, name: 'Updated');

        $active = $this->provider(true);
        $active->method('updateSnippet')->with(2, $input)->willReturn($result);

        $service  = new SnippetService($active);
        $returned = $service->updateSnippet(2, $input);

        $this->assertSame(2, $returned->id);
        $this->assertSame('Updated', $returned->name);
        $this->assertNotNull($returned->revision);
    }

    public function test_get_snippet_delegates_to_active_provider(): void
    {
        $result = new SnippetData(id: 2, name: 'Existing');

        $active = $this->provider(true);
        $active->method('getSnippet')->with(2)->willReturn($result);

        $service  = new SnippetService($active);
        $returned = $service->getSnippet(2);

        $this->assertSame(2, $returned->id);
        $this->assertSame('Existing', $returned->name);
        $this->assertNotNull($returned->revision);
    }

    public function test_get_snippet_returns_null_when_the_provider_finds_nothing(): void
    {
        $active = $this->provider(true);
        $active->method('getSnippet')->with(999)->willReturn(null);

        $service = new SnippetService($active);

        $this->assertNull($service->getSnippet(999));
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

    // ── revision / conditional writes (#234) ────────────────────────────────

    public function test_get_snippet_revision_is_stable_for_the_same_content(): void
    {
        $active = $this->provider(true);
        $active->method('getSnippet')->willReturn(new SnippetData(id: 1, name: 'Same', priority: 10));

        $service = new SnippetService($active);

        $first  = $service->getSnippet(1);
        $second = $service->getSnippet(1);

        $this->assertSame($first->revision, $second->revision);
    }

    public function test_get_snippet_revision_differs_for_different_code(): void
    {
        $active = $this->provider(true);
        $active->method('getSnippet')->willReturnOnConsecutiveCalls(
            new SnippetData(id: 1, name: 'Same', code: 'echo 1;'),
            new SnippetData(id: 1, name: 'Same', code: 'echo 2;'),
        );

        $service = new SnippetService($active);

        $before = $service->getSnippet(1);
        $after  = $service->getSnippet(1);

        $this->assertNotSame($before->revision, $after->revision);
    }

    // Regression coverage (#234): a write can change any of these fields independently of
    // `code`, so the revision must see drift in each of them too, not just the code body, the
    // same care OptionsService::revisionOf() takes with autoload alongside value.
    public function test_get_snippet_revision_differs_for_an_active_only_change(): void
    {
        $active = $this->provider(true);
        $active->method('getSnippet')->willReturnOnConsecutiveCalls(
            new SnippetData(id: 1, code: 'echo 1;', active: false),
            new SnippetData(id: 1, code: 'echo 1;', active: true),
        );

        $service = new SnippetService($active);

        $before = $service->getSnippet(1);
        $after  = $service->getSnippet(1);

        $this->assertSame($before->code, $after->code);
        $this->assertNotSame($before->active, $after->active);
        $this->assertNotSame($before->revision, $after->revision);
    }

    public function test_get_snippet_revision_differs_for_a_location_only_change(): void
    {
        $active = $this->provider(true);
        $active->method('getSnippet')->willReturnOnConsecutiveCalls(
            new SnippetData(id: 1, code: 'echo 1;', location: 'header'),
            new SnippetData(id: 1, code: 'echo 1;', location: 'footer'),
        );

        $service = new SnippetService($active);

        $before = $service->getSnippet(1);
        $after  = $service->getSnippet(1);

        $this->assertNotSame($before->revision, $after->revision);
    }

    public function test_get_snippet_revision_differs_for_a_priority_only_change(): void
    {
        $active = $this->provider(true);
        $active->method('getSnippet')->willReturnOnConsecutiveCalls(
            new SnippetData(id: 1, code: 'echo 1;', priority: 10),
            new SnippetData(id: 1, code: 'echo 1;', priority: 20),
        );

        $service = new SnippetService($active);

        $before = $service->getSnippet(1);
        $after  = $service->getSnippet(1);

        $this->assertNotSame($before->revision, $after->revision);
    }

    // id is intentionally excluded from the hash (see revisionOf()'s docblock); this pins that
    // choice so it isn't accidentally "fixed" later.
    public function test_get_snippet_revision_ignores_id(): void
    {
        $active = $this->provider(true);
        $active->method('getSnippet')->willReturnOnConsecutiveCalls(
            new SnippetData(id: 1, name: 'Same', code: 'echo 1;'),
            new SnippetData(id: 2, name: 'Same', code: 'echo 1;'),
        );

        $service = new SnippetService($active);

        $first  = $service->getSnippet(1);
        $second = $service->getSnippet(2);

        $this->assertSame($first->revision, $second->revision);
    }

    public function test_update_snippet_succeeds_when_the_expected_revision_still_matches(): void
    {
        $active = $this->provider(true);
        $active->method('getSnippet')->willReturn(new SnippetData(id: 1, name: 'Current'));
        $active->method('updateSnippet')->willReturn(new SnippetData(id: 1, name: 'New'));

        $service         = new SnippetService($active);
        $currentRevision = $service->getSnippet(1)->revision;

        $result = $service->updateSnippet(1, new SnippetData(name: 'New'), $currentRevision);

        $this->assertSame('New', $result->name);
    }

    // Regression coverage (#234): the whole point of the precondition is that a write is
    // refused, not silently applied, once the snippet no longer holds the content the caller
    // last read.
    public function test_update_snippet_throws_stale_revision_exception_when_the_content_changed_underneath(): void
    {
        $active = $this->provider(true);
        $active->method('getSnippet')->willReturn(new SnippetData(id: 1, name: 'Someone else already changed this'));

        $service = new SnippetService($active);

        $this->expectException(StaleSnippetRevisionException::class);
        $service->updateSnippet(1, new SnippetData(name: 'New'), 'a-revision-that-no-longer-matches');
    }

    public function test_update_snippet_does_not_call_the_provider_update_when_the_revision_is_stale(): void
    {
        $active = $this->provider(true);
        $active->method('getSnippet')->willReturn(new SnippetData(id: 1, name: 'Someone else already changed this'));
        $active->expects($this->never())->method('updateSnippet');

        $service = new SnippetService($active);

        try {
            $service->updateSnippet(1, new SnippetData(name: 'New'), 'a-revision-that-no-longer-matches');
        } catch (StaleSnippetRevisionException) {
            $this->addToAssertionCount(1);
        }
    }

    // A snippet that no longer exists at all is exactly as much "not the content the caller
    // expected" as one holding different content: a precondition must still refuse the write
    // rather than treat "vanished" as an exemption from the check.
    public function test_update_snippet_throws_stale_revision_exception_when_the_snippet_no_longer_exists(): void
    {
        $active = $this->provider(true);
        $active->method('getSnippet')->willReturn(null);

        $service = new SnippetService($active);

        $this->expectException(StaleSnippetRevisionException::class);
        $service->updateSnippet(1, new SnippetData(name: 'New'), 'a-revision-from-when-it-existed');
    }

    public function test_update_snippet_skips_the_revision_check_entirely_when_none_is_given(): void
    {
        $active = $this->provider(true);
        $active->expects($this->never())->method('getSnippet');
        $active->method('updateSnippet')->willReturn(new SnippetData(id: 1, name: 'New'));

        $service = new SnippetService($active);
        $result  = $service->updateSnippet(1, new SnippetData(name: 'New'));

        $this->assertSame('New', $result->name);
    }
}
