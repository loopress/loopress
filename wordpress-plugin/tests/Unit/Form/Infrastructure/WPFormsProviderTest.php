<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\Form\Infrastructure;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\Form\Infrastructure\WPFormsProvider;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;
use WP_Post;

class WPFormsProviderTest extends TestCase
{
    private WPFormsProvider $provider;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
        $this->provider = new WPFormsProvider();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    // ── isActive ─────────────────────────────────────────────────────────────

    #[RunInSeparateProcess]
    public function test_is_not_active_when_wpforms_function_is_missing(): void
    {
        // wpforms() genuinely doesn't exist in the test environment (WPForms isn't loaded),
        // so this exercises the real function_exists() check rather than a stub, same
        // convention as AcfServiceTest's isActive() coverage. Runs in its own process for
        // the same reason: Brain\Monkey's function stubbing is permanent process-wide once
        // used, and every other test here stubs wpforms().
        $this->assertFalse($this->provider->isActive());
    }

    // ── list ──────────────────────────────────────────────────────────────────

    public function test_list_decodes_each_form_and_injects_its_post_id(): void
    {
        $post              = new WP_Post();
        $post->ID          = 12;
        $post->post_content = '{"settings":{"form_title":"Contact"}}';

        $this->stubWpForms($this->fakeFormHandler(['get' => [$post]]));
        Functions\when('wpforms_decode')->justReturn(['settings' => ['form_title' => 'Contact']]);

        $result = $this->provider->list();

        $this->assertSame([['settings' => ['form_title' => 'Contact'], 'id' => 12]], $result);
    }

    public function test_list_returns_empty_array_when_wpforms_get_is_falsy(): void
    {
        $this->stubWpForms($this->fakeFormHandler(['get' => false]));

        $this->assertSame([], $this->provider->list());
    }

    // ── get ───────────────────────────────────────────────────────────────────

    public function test_get_returns_null_when_the_post_does_not_exist(): void
    {
        Functions\when('get_post')->justReturn(null);

        $this->assertNull($this->provider->get(999));
    }

    public function test_get_returns_null_for_a_non_wpforms_post_type(): void
    {
        $post            = new WP_Post();
        $post->ID        = 5;
        $post->post_type = 'post';
        Functions\when('get_post')->justReturn($post);

        $this->assertNull($this->provider->get(5));
    }

    public function test_get_returns_decoded_content_merged_with_the_post_id(): void
    {
        $post               = new WP_Post();
        $post->ID           = 12;
        $post->post_type    = 'wpforms';
        $post->post_content = '{"settings":{"form_title":"Contact"}}';

        Functions\when('get_post')->justReturn($post);
        Functions\when('wpforms_decode')->justReturn(['settings' => ['form_title' => 'Contact']]);

        $this->assertSame(['settings' => ['form_title' => 'Contact'], 'id' => 12], $this->provider->get(12));
    }

    // ── create ────────────────────────────────────────────────────────────────

    public function test_create_throws_when_add_fails(): void
    {
        $this->stubWpForms($this->fakeFormHandler(['add' => false]));

        $this->expectException(\RuntimeException::class);
        $this->provider->create(['settings' => ['form_title' => 'New form']]);
    }

    // wpforms()->form->add() only ever writes a default title/description scaffold (see
    // WPFormsProvider::create()'s comment), the pushed field/settings payload only reaches
    // WordPress through the follow-up update() call, so create() must issue both, in order.
    public function test_create_adds_then_updates_with_the_full_payload(): void
    {
        $post                = new WP_Post();
        $post->ID            = 7;
        $post->post_type     = 'wpforms';
        $post->post_content  = '{}';
        $capturedUpdate      = null;

        $this->stubWpForms($this->fakeFormHandler([
            'add'    => 7,
            'update' => function (int $id, array $data) use (&$capturedUpdate): int {
                $capturedUpdate = [$id, $data];

                return $id;
            },
        ]));
        Functions\when('get_post')->justReturn($post);
        Functions\when('wpforms_decode')->justReturn(['id' => 7, 'settings' => ['form_title' => 'New form']]);

        $result = $this->provider->create(['settings' => ['form_title' => 'New form']]);

        $this->assertSame([7, ['settings' => ['form_title' => 'New form'], 'id' => 7]], $capturedUpdate);
        $this->assertSame(7, $result['id']);
    }

    // The follow-up update() after add() can fail independently of add() itself (e.g. a
    // database error): without this check, create() would report success while the pushed
    // field/settings payload was silently dropped, leaving only the empty add() scaffold.
    public function test_create_throws_when_the_follow_up_update_fails(): void
    {
        $this->stubWpForms($this->fakeFormHandler(['add' => 7, 'update' => false]));

        $this->expectException(\RuntimeException::class);
        $this->provider->create(['settings' => ['form_title' => 'New form']]);
    }

    // ── update ────────────────────────────────────────────────────────────────

    public function test_update_returns_null_when_the_form_does_not_exist(): void
    {
        Functions\when('get_post')->justReturn(null);

        $this->assertNull($this->provider->update(999, ['settings' => ['form_title' => 'X']]));
    }

    public function test_update_throws_when_wpforms_update_fails(): void
    {
        $post                = new WP_Post();
        $post->ID            = 12;
        $post->post_type     = 'wpforms';
        $post->post_content  = '{}';

        Functions\when('get_post')->justReturn($post);
        Functions\when('wpforms_decode')->justReturn(['id' => 12]);
        $this->stubWpForms($this->fakeFormHandler(['update' => false]));

        $this->expectException(\RuntimeException::class);
        $this->provider->update(12, ['settings' => ['form_title' => 'Updated']]);
    }

    // ── notification / confirmation guard (F12) ──────────────────────────────

    /** @param array<string, mixed> $decoded */
    private function captureUpdate(array &$captured, array $decoded = ['id' => 12]): void
    {
        $post               = new WP_Post();
        $post->ID           = 12;
        $post->post_type    = 'wpforms';
        $post->post_content = '{}';
        Functions\when('get_post')->justReturn($post);
        Functions\when('wpforms_decode')->justReturn($decoded);
        $this->stubWpForms($this->fakeFormHandler([
            'update' => function (int $id, array $data) use (&$captured): int {
                $captured = $data;
                return $id;
            },
        ]));
    }

    public function test_update_keeps_the_servers_notifications_when_allowNotifications_is_absent(): void
    {
        $captured = [];
        $this->captureUpdate($captured, [
            'id'       => 12,
            'settings' => ['notifications' => ['1' => ['email' => 'real-admin@site.test']]],
        ]);

        $this->provider->update(12, [
            'settings' => ['notifications' => ['1' => ['email' => 'attacker@evil.example', 'message' => '{all_fields}']]],
        ]);

        $this->assertSame(['1' => ['email' => 'real-admin@site.test']], $captured['settings']['notifications']);
    }

    public function test_create_drops_incoming_notifications_when_allowNotifications_is_absent(): void
    {
        $post               = new WP_Post();
        $post->ID           = 7;
        $post->post_type    = 'wpforms';
        $post->post_content = '{}';
        $captured           = [];
        Functions\when('get_post')->justReturn($post);
        Functions\when('wpforms_decode')->justReturn(['id' => 7]);
        $this->stubWpForms($this->fakeFormHandler([
            'add'    => 7,
            'update' => function (int $id, array $data) use (&$captured): int {
                $captured = $data;
                return $id;
            },
        ]));

        $this->provider->create([
            'settings' => ['form_title' => 'F', 'notifications' => ['1' => ['email' => 'attacker@evil.example']]],
        ]);

        $this->assertArrayNotHasKey('notifications', $captured['settings']);
        $this->assertArrayNotHasKey('allowNotifications', $captured);
    }

    public function test_update_rejects_an_invalid_recipient_when_notifications_are_allowed(): void
    {
        Functions\when('is_email')->alias(fn(string $v): bool => str_contains($v, '@') && str_contains($v, '.'));
        $captured = [];
        $this->captureUpdate($captured);

        $this->expectException(\Loopress\Form\Exception\FormNotificationException::class);
        $this->provider->update(12, [
            'allowNotifications' => true,
            'settings'           => ['notifications' => ['1' => ['email' => 'not-an-email']]],
        ]);
    }

    public function test_update_rejects_a_spoofed_sender_address_when_notifications_are_allowed(): void
    {
        Functions\when('is_email')->alias(fn(string $v): bool => (bool) preg_match('/^[^@\s]+@[^@\s]+\.[^@\s]+$/', $v));
        Functions\when('get_option')->justReturn('https://mysite.test');
        Functions\when('wp_parse_url')->justReturn('mysite.test');
        $captured = [];
        $this->captureUpdate($captured);

        $this->expectException(\Loopress\Form\Exception\FormNotificationException::class);
        $this->provider->update(12, [
            'allowNotifications' => true,
            'settings'           => ['notifications' => ['1' => ['email' => '{admin_email}', 'sender_address' => 'noreply@evil.example']]],
        ]);
    }

    public function test_update_accepts_valid_notifications_and_strips_the_message_when_allowed(): void
    {
        Functions\when('is_email')->alias(fn(string $v): bool => (bool) preg_match('/^[^@\s]+@[^@\s]+\.[^@\s]+$/', $v));
        Functions\when('get_option')->justReturn('https://mysite.test');
        Functions\when('wp_parse_url')->justReturn('mysite.test');
        Functions\when('sanitize_text_field')->alias(fn(string $v): string => trim($v));
        $captured = [];
        $this->captureUpdate($captured);

        $this->provider->update(12, [
            'allowNotifications' => true,
            'settings'           => [
                'notifications' => ['1' => [
                    'email'          => 'team@mysite.test, {admin_email}',
                    'sender_address' => 'noreply@mysite.test',
                    'subject'        => 'New entry',
                    'message'        => 'Hi <script>steal()</script> {all_fields}',
                ],
                ],
            ],
        ]);

        $this->assertSame('Hi  {all_fields}', $captured['settings']['notifications']['1']['message']);
        $this->assertSame('noreply@mysite.test', $captured['settings']['notifications']['1']['sender_address']);
    }

    // ── delete ────────────────────────────────────────────────────────────────

    public function test_delete_returns_false_when_the_form_does_not_exist(): void
    {
        Functions\when('get_post')->justReturn(null);

        $this->assertFalse($this->provider->delete(999));
    }

    // Distinct from "not found": the form exists (confirmed by get() above) but
    // wpforms()->form->delete() itself failed (e.g. a database error), which must not be
    // reported the same way as "not found" or the controller would return a misleading 404.
    public function test_delete_throws_when_wpforms_delete_fails(): void
    {
        $post                = new WP_Post();
        $post->ID            = 12;
        $post->post_type     = 'wpforms';
        $post->post_content  = '{}';

        Functions\when('get_post')->justReturn($post);
        Functions\when('wpforms_decode')->justReturn(['id' => 12]);
        $this->stubWpForms($this->fakeFormHandler(['delete' => false]));

        $this->expectException(\RuntimeException::class);
        $this->provider->delete(12);
    }

    public function test_delete_delegates_to_wpforms_form_delete(): void
    {
        $post                = new WP_Post();
        $post->ID            = 12;
        $post->post_type     = 'wpforms';
        $post->post_content  = '{}';

        Functions\when('get_post')->justReturn($post);
        Functions\when('wpforms_decode')->justReturn(['id' => 12]);
        $this->stubWpForms($this->fakeFormHandler(['delete' => true]));

        $this->assertTrue($this->provider->delete(12));
    }

    /** @param array<string, mixed> $behavior */
    private function fakeFormHandler(array $behavior): object
    {
        return new class($behavior) {
            public function __construct(private array $behavior) {}

            /** @param array<string, mixed> $args @param array<string, mixed> $data */
            public function add(string $title = '', array $args = [], array $data = []): false|int
            {
                return $this->behavior['add'] ?? false;
            }

            /** @param array<int> $ids */
            public function delete(array $ids = []): bool
            {
                return $this->behavior['delete'] ?? false;
            }

            /** @param array<string, mixed> $args */
            public function get(int|string $id = '', array $args = []): mixed
            {
                return $this->behavior['get'] ?? false;
            }

            /** @param array<string, mixed> $data @param array<string, mixed> $args */
            public function update(int|string $id = '', array $data = [], array $args = []): false|int
            {
                $update = $this->behavior['update'] ?? false;

                return is_callable($update) ? $update($id, $data) : $update;
            }
        };
    }

    private function stubWpForms(object $formHandler): void
    {
        Functions\when('wpforms')->justReturn((object) ['form' => $formHandler]);
    }
}
