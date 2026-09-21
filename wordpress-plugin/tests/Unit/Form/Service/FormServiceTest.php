<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Form\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Form\Contract\FormProvider;
use Loopress\Form\Exception\NoActiveFormPluginException;
use Loopress\Form\Exception\StaleFormRevisionException;
use Loopress\Form\Service\FormService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class FormServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        // revisionOf()'s hash goes through wp_json_encode(), unavailable outside a real
        // WordPress load; a plain json_encode() delegate is exactly what it does for the plain
        // arrays every form fixture in this file already is.
        Functions\when('wp_json_encode')->alias(static fn (mixed $value): string|false => json_encode($value));
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    private function provider(bool $active): FormProvider&MockObject
    {
        $provider = $this->createMock(FormProvider::class);
        $provider->method('isActive')->willReturn($active);

        return $provider;
    }

    public function test_is_active_false_when_no_provider_is_active(): void
    {
        $service = new FormService($this->provider(false), $this->provider(false));

        $this->assertFalse($service->isActive());
    }

    public function test_is_active_true_when_a_provider_is_active(): void
    {
        $service = new FormService($this->provider(false), $this->provider(true));

        $this->assertTrue($service->isActive());
    }

    public function test_delegates_to_the_first_active_provider(): void
    {
        $inactive = $this->provider(false);
        $inactive->expects($this->never())->method('list');

        $active = $this->provider(true);
        $forms  = [['id' => 1, 'settings' => ['form_title' => 'Contact']]];
        $active->method('list')->willReturn($forms);

        $service = new FormService($inactive, $active);

        $this->assertSame($forms, $service->list());
    }

    public function test_list_throws_when_no_provider_is_active(): void
    {
        $service = new FormService($this->provider(false));

        $this->expectException(NoActiveFormPluginException::class);
        $service->list();
    }

    public function test_list_throws_when_more_than_one_provider_is_active(): void
    {
        $first = $this->provider(true);
        $first->expects($this->never())->method('list');

        $second = $this->provider(true);
        $second->expects($this->never())->method('list');

        $service = new FormService($first, $second);

        $this->expectException(NoActiveFormPluginException::class);
        $this->expectExceptionMessage('Multiple form plugins are active');
        $service->list();
    }

    public function test_is_active_true_when_more_than_one_provider_is_active(): void
    {
        // isActive() only answers "is there a usable provider", it must not throw on its own;
        // the multi-provider conflict is only raised when a form operation is actually attempted.
        $service = new FormService($this->provider(true), $this->provider(true));

        $this->assertTrue($service->isActive());
    }

    public function test_create_delegates_to_active_provider(): void
    {
        $input  = ['settings' => ['form_title' => 'New']];
        $result = ['id' => 2, 'settings' => ['form_title' => 'New']];

        $active = $this->provider(true);
        $active->method('create')->with($input)->willReturn($result);

        $service = new FormService($active);

        $created = $service->create($input);

        $this->assertSame(2, $created['id']);
        $this->assertSame(['form_title' => 'New'], $created['settings']);
        $this->assertIsString($created['revision']);
    }

    public function test_update_delegates_to_active_provider(): void
    {
        $input  = ['settings' => ['form_title' => 'Updated']];
        $result = ['id' => 2, 'settings' => ['form_title' => 'Updated']];

        $active = $this->provider(true);
        $active->method('update')->with(2, $input)->willReturn($result);

        $service = new FormService($active);

        $updated = $service->update(2, $input);

        $this->assertSame(2, $updated['id']);
        $this->assertSame(['form_title' => 'Updated'], $updated['settings']);
        $this->assertIsString($updated['revision']);
    }

    public function test_get_delegates_to_active_provider(): void
    {
        $result = ['id' => 2, 'settings' => ['form_title' => 'Contact']];

        $active = $this->provider(true);
        $active->method('get')->with(2)->willReturn($result);

        $service = new FormService($active);

        $form = $service->get(2);

        $this->assertSame(2, $form['id']);
        $this->assertSame(['form_title' => 'Contact'], $form['settings']);
        $this->assertIsString($form['revision']);
    }

    public function test_get_returns_null_when_the_form_does_not_exist(): void
    {
        $active = $this->provider(true);
        $active->method('get')->with(999)->willReturn(null);

        $service = new FormService($active);

        $this->assertNull($service->get(999));
    }

    public function test_delete_delegates_to_active_provider(): void
    {
        $active = $this->provider(true);
        $active->method('delete')->with(2)->willReturn(true);

        $service = new FormService($active);

        $this->assertTrue($service->delete(2));
    }

    public function test_delete_throws_when_no_provider_is_active(): void
    {
        $service = new FormService($this->provider(false));

        $this->expectException(NoActiveFormPluginException::class);
        $service->delete(2);
    }

    // ── revision / conditional writes (#234) ────────────────────────────────

    public function test_get_revision_is_stable_for_the_same_form(): void
    {
        $active = $this->provider(true);
        $active->method('get')->willReturn(['id' => 2, 'settings' => ['form_title' => 'Contact']]);

        $service = new FormService($active);

        $first  = $service->get(2);
        $second = $service->get(2);

        $this->assertSame($first['revision'], $second['revision']);
    }

    public function test_get_revision_differs_for_different_content(): void
    {
        $active = $this->provider(true);
        $active->method('get')->willReturnOnConsecutiveCalls(
            ['id' => 2, 'settings' => ['form_title' => 'Contact']],
            ['id' => 2, 'settings' => ['form_title' => 'Contact Us']],
        );

        $service = new FormService($active);

        $before = $service->get(2);
        $after  = $service->get(2);

        $this->assertNotSame($before['revision'], $after['revision']);
    }

    // Regression coverage (#234): the revision must not depend on `id`, which never changes for
    // a given form and is only there to identify the resource, not describe its content.
    public function test_get_revision_ignores_the_id_field(): void
    {
        $active = $this->provider(true);
        $active->method('get')->willReturnOnConsecutiveCalls(
            ['id' => 2, 'settings' => ['form_title' => 'Contact']],
            ['id' => 999, 'settings' => ['form_title' => 'Contact']],
        );

        $service = new FormService($active);

        $first  = $service->get(2);
        $second = $service->get(999);

        $this->assertSame($first['revision'], $second['revision']);
    }

    // Regression coverage (#234, mirrors OptionsService::revisionOf()'s autoload coverage):
    // `modified`/`modified_gmt` are the form's own volatile save-bookkeeping fields (see
    // FORM_VOLATILE_KEYS in cli/src/lib/resource-state.ts), not tracked content; a bare re-save
    // that bumped only those must not present as a "stale" precondition failure.
    public function test_get_revision_ignores_modified_and_modified_gmt(): void
    {
        $active = $this->provider(true);
        $active->method('get')->willReturnOnConsecutiveCalls(
            ['id' => 2, 'settings' => ['form_title' => 'Contact'], 'modified' => 100, 'modified_gmt' => 100],
            ['id' => 2, 'settings' => ['form_title' => 'Contact'], 'modified' => 200, 'modified_gmt' => 200],
        );

        $service = new FormService($active);

        $before = $service->get(2);
        $after  = $service->get(2);

        $this->assertSame($before['revision'], $after['revision']);
    }

    // Regression coverage (#234): every field an update actually persists (here, the whole
    // canonical shape a provider round-trips, e.g. `settings.notifications`) must move the
    // revision, or a stale local push holding that field's old value could silently overwrite an
    // intervening change to it once some other, hashed field also changed.
    public function test_get_revision_differs_when_only_a_nested_settings_field_changes(): void
    {
        $active = $this->provider(true);
        $active->method('get')->willReturnOnConsecutiveCalls(
            ['id' => 2, 'settings' => ['form_title' => 'Contact', 'notifications' => ['1' => ['email' => 'a@example.test']]]],
            ['id' => 2, 'settings' => ['form_title' => 'Contact', 'notifications' => ['1' => ['email' => 'b@example.test']]]],
        );

        $service = new FormService($active);

        $before = $service->get(2);
        $after  = $service->get(2);

        $this->assertNotSame($before['revision'], $after['revision']);
    }

    public function test_update_succeeds_when_the_expected_revision_still_matches(): void
    {
        $current = ['id' => 2, 'settings' => ['form_title' => 'Contact']];
        $updated = ['id' => 2, 'settings' => ['form_title' => 'Updated']];

        $active = $this->provider(true);
        $active->method('get')->willReturn($current);
        $active->method('update')->with(2, ['settings' => ['form_title' => 'Updated']])->willReturn($updated);

        $service = new FormService($active);

        $currentRevision = $service->get(2)['revision'];
        $result           = $service->update(2, ['settings' => ['form_title' => 'Updated']], $currentRevision);

        $this->assertSame(['form_title' => 'Updated'], $result['settings']);
    }

    // Regression coverage (#234): the whole point of the precondition is that a write is refused,
    // not silently applied, once the form no longer holds the state the caller last read.
    public function test_update_throws_stale_revision_exception_when_the_form_changed_underneath(): void
    {
        $active = $this->provider(true);
        $active->method('get')->willReturn(['id' => 2, 'settings' => ['form_title' => 'Someone else already changed this']]);

        $service = new FormService($active);

        $this->expectException(StaleFormRevisionException::class);
        $service->update(2, ['settings' => ['form_title' => 'Updated']], 'a-revision-that-no-longer-matches');
    }

    // Regression coverage: the message reaches a REST JSON body then the CLI's stderr, never
    // HTML, so it must not have been run through esc_html().
    public function test_stale_revision_exception_message_is_not_html_escaped(): void
    {
        $active = $this->provider(true);
        $active->method('get')->willReturn(['id' => 2, 'settings' => ['form_title' => 'Someone else already changed this']]);

        $service = new FormService($active);

        try {
            $service->update(2, ['settings' => ['form_title' => 'Updated']], 'a-revision-that-no-longer-matches');
            $this->fail('Expected a StaleFormRevisionException.');
        } catch (StaleFormRevisionException $e) {
            $this->assertStringContainsString('Form #2', $e->getMessage());
            $this->assertStringNotContainsString('&quot;', $e->getMessage());
        }
    }

    public function test_update_does_not_call_the_providers_update_when_the_revision_is_stale(): void
    {
        $active = $this->provider(true);
        $active->method('get')->willReturn(['id' => 2, 'settings' => ['form_title' => 'Someone else already changed this']]);
        $active->expects($this->never())->method('update');

        $service = new FormService($active);

        try {
            $service->update(2, ['settings' => ['form_title' => 'Updated']], 'a-revision-that-no-longer-matches');
        } catch (StaleFormRevisionException) {
            $this->addToAssertionCount(1);
        }
    }

    // A form that no longer exists at all is exactly as much "not the state the caller expected"
    // as one holding different content: a precondition must still refuse the write rather than
    // treat "deleted" as an exemption from the check.
    public function test_update_throws_stale_revision_exception_when_the_form_no_longer_exists(): void
    {
        $active = $this->provider(true);
        $active->method('get')->willReturn(null);

        $service = new FormService($active);

        $this->expectException(StaleFormRevisionException::class);
        $service->update(2, ['settings' => ['form_title' => 'Updated']], 'a-revision-from-when-it-existed');
    }

    public function test_update_skips_the_revision_check_entirely_when_none_is_given(): void
    {
        $updated = ['id' => 2, 'settings' => ['form_title' => 'Updated']];

        $active = $this->provider(true);
        $active->method('get')->willReturn(['id' => 2, 'settings' => ['form_title' => 'Whatever is there now']]);
        $active->method('update')->willReturn($updated);

        $service = new FormService($active);

        $result = $service->update(2, ['settings' => ['form_title' => 'Updated']]);

        $this->assertSame(['form_title' => 'Updated'], $result['settings']);
    }
}
