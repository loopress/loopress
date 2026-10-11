<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit\PostTypes\Service;

use Brain\Monkey;
use Brain\Monkey\Functions;
use Loopress\PostTypes\Exception\InvalidDeclarationException;
use Loopress\PostTypes\Service\RoleService;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use WP_Role;
use WP_Roles;

// The shared behaviour (revisions, conflicts, a throwing entry) is covered once, in
// PostTypeServiceTest; this covers what is specific to roles: in memory, never in the database.
class RoleServiceTest extends TestCase
{
    /** @var array<string, mixed> In-memory wp_options. */
    private array $options = [];

    private WP_Roles $roles;

    private RoleService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();

        Functions\when('get_option')->alias(fn (string $name, mixed $fallback = false): mixed => $this->options[$name] ?? $fallback);
        Functions\when('update_option')->alias(function (string $name, mixed $value): bool {
            $this->options[$name] = $value;
            return true;
        });
        Functions\when('wp_json_encode')->alias(static fn (mixed $data): string|false => json_encode($data));
        Functions\when('is_wp_error')->justReturn(false);

        $this->roles = new WP_Roles();
        $this->roles->roles['editor']        = ['name' => 'Editor', 'capabilities' => ['edit_posts' => true]];
        $this->roles->role_objects['editor'] = new WP_Role('editor', ['edit_posts' => true]);
        $this->roles->role_names['editor']   = 'Editor';

        $this->service = new RoleService();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }

    public function test_a_declared_role_is_added_in_memory_without_writing_the_roles_option(): void
    {
        $this->service->upsert('client', ['name' => 'Client', 'capabilities' => ['read' => true]]);
        $this->service->registerOn($this->roles);

        $this->assertSame(['name' => 'Client', 'capabilities' => ['read' => true]], $this->roles->roles['client']);
        $this->assertSame('Client', $this->roles->role_names['client']);
        $this->assertSame(['read' => true], $this->roles->role_objects['client']->capabilities);
        $this->assertArrayNotHasKey('wp_user_roles', $this->options);
    }

    public function test_a_role_already_in_the_database_is_skipped_not_overwritten(): void
    {
        $this->roles->roles['shop']      = ['name' => 'Shop manager', 'capabilities' => []];
        $this->options[RoleService::OPTION] = ['shop' => ['name' => 'Mine', 'capabilities' => ['read' => true]]];

        $this->service->registerOn($this->roles);

        $this->assertSame('Shop manager', $this->roles->roles['shop']['name']);
    }

    public function test_saving_the_roles_option_strips_the_loopress_roles_only(): void
    {
        $this->options[RoleService::OPTION] = ['client' => ['name' => 'Client', 'capabilities' => []]];
        $this->service->registerOn($this->roles);

        $saved = $this->service->keepOutOfDatabase($this->roles->roles, 'wp_user_roles');

        $this->assertSame(['editor'], array_keys((array) $saved));
        $this->assertSame($this->roles->roles, $this->service->keepOutOfDatabase($this->roles->roles, 'blogname'));
    }

    /** @return array<string, array{string, array<string, mixed>}> */
    public static function invalidRoles(): array
    {
        return [
            'built-in role'       => ['editor', ['name' => 'Editor']],
            'slug over 50 chars'  => [str_repeat('a', 51), ['name' => 'Long']],
            'missing name'        => ['client', ['capabilities' => []]],
            'empty name'          => ['client', ['name' => ' ']],
            'capabilities list'   => ['client', ['name' => 'Client', 'capabilities' => 'read']],
            'non-boolean grant'   => ['client', ['name' => 'Client', 'capabilities' => ['read' => 1]]],
            'unnamed capability'  => ['client', ['name' => 'Client', 'capabilities' => [true]]],
        ];
    }

    /** @param array<string, mixed> $args */
    #[DataProvider('invalidRoles')]
    public function test_upsert_refuses_invalid_roles(string $slug, array $args): void
    {
        $this->expectException(InvalidDeclarationException::class);
        $this->service->upsert($slug, $args);
    }

    public function test_registered_reports_the_source_and_user_count(): void
    {
        $this->options[RoleService::OPTION] = ['client' => ['name' => 'Client', 'capabilities' => []]];
        $this->service->registerOn($this->roles);
        $this->roles->role_names['shop'] = 'Shop manager';
        $this->roles->role_objects['shop'] = new WP_Role('shop', []);

        Functions\when('wp_roles')->justReturn($this->roles);
        Functions\when('count_users')->justReturn(['avail_roles' => ['editor' => 2, 'client' => 3]]);
        Functions\when('translate_user_role')->returnArg();

        $this->assertSame(
            [
                ['slug' => 'editor', 'label' => 'Editor', 'source' => 'wordpress', 'count' => 2, 'managed' => false, 'conflict' => false],
                ['slug' => 'client', 'label' => 'Client', 'source' => 'loopress', 'count' => 3, 'managed' => true, 'conflict' => false],
                ['slug' => 'shop', 'label' => 'Shop manager', 'source' => 'other', 'count' => 0, 'managed' => false, 'conflict' => false],
            ],
            $this->service->registered(),
        );
    }
}
