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

    // ── delete ────────────────────────────────────────────────────────────────

    public function test_delete_returns_false_when_the_form_does_not_exist(): void
    {
        Functions\when('get_post')->justReturn(null);

        $this->assertFalse($this->provider->delete(999));
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
