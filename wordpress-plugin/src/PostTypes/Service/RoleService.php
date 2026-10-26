<?php

declare(strict_types=1);

namespace Loopress\PostTypes\Service;

use Loopress\PostTypes\Exception\InvalidDeclarationException;
use WP_Role;
use WP_Roles;

// User roles declared in `roles/<slug>.json` (`lps role push`), see AbstractDeclaredTypeService.
// A file is `{"name": ..., "capabilities": {cap: bool}}`. Added to the WP_Roles instance in memory
// on every request (wp_roles_init), never with add_role(), which would write them into the
// `<prefix>user_roles` option: the file stays the only source of truth, and `lps role rm` really
// removes the role. Users keep the role in their profile, with no capability, until it's pushed again.
final class RoleService extends AbstractDeclaredTypeService
{
    public const OPTION = 'loopress_roles';

    private const BUILT_IN = ['administrator', 'editor', 'author', 'contributor', 'subscriber'];

    private ?WP_Roles $roles = null;

    /** @var array<string, true> Slugs this request added to $roles, see keepOutOfDatabase(). */
    private array $injected = [];

    public function registerOn(WP_Roles $roles): void
    {
        $this->roles    = $roles;
        $this->injected = [];
        $this->register();
    }

    /**
     * Any code saving the roles (WP_Roles::add_cap() on another role, a role editor plugin) writes
     * the whole in-memory list, ours included: strip them so they never land in the database.
     */
    public function keepOutOfDatabase(mixed $value, string $option): mixed
    {
        if ($this->roles === null || $option !== $this->roles->role_key || !is_array($value)) {
            return $value;
        }

        return array_diff_key($value, $this->injected);
    }

    /**
     * Every role on the site with where it comes from and how many users have it, for the
     * read-only admin viewer and `lps role list`.
     *
     * @return list<array{slug: string, label: string, source: string, count: int, managed: bool, conflict: bool}>
     */
    public function registered(): array
    {
        $stored = $this->stored();
        $roles  = wp_roles();
        $users  = count_users();

        $result = [];
        foreach ($roles->role_names as $slug => $name) {
            $slug   = (string) $slug; // a numeric role slug is an int array key
            $object = $roles->get_role($slug);
            $ours   = $object !== null && $this->isOurs($slug, $object);
            $result[] = [
                'slug'     => $slug,
                'label'    => translate_user_role($name),
                'source'   => match (true) {
                    $ours => 'loopress',
                    in_array($slug, self::BUILT_IN, true) => 'wordpress', // phpcs:ignore WordPress.WP.CapitalPDangit -- a source id, not prose.
                    default => 'other',
                },
                'count'    => (int) ($users['avail_roles'][$slug] ?? 0),
                'managed'  => isset($stored[$slug]),
                'conflict' => isset($stored[$slug]) && !$ours,
            ];
        }

        return $result;
    }

    protected function option(): string
    {
        return self::OPTION;
    }

    protected function noun(): string
    {
        return 'Role';
    }

    protected function directory(): string
    {
        return 'roles';
    }

    protected function maxSlugLength(): int
    {
        return 50;
    }

    // Changing a built-in role from a file would hide edits made to it by the site and its plugins.
    protected function reservedSlugs(): array
    {
        return self::BUILT_IN;
    }

    protected function codeArgs(): array
    {
        return [];
    }

    protected function arrayArgs(): array
    {
        return ['capabilities' => []];
    }

    protected function flushesRewriteRules(): bool
    {
        return false;
    }

    /** @param array<string, mixed> $args */
    protected function assertArgs(string $slug, array $args): void
    {
        $name = $args['name'] ?? null;
        if (!is_string($name) || trim($name) === '') {
            // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML (see phpcs.xml.dist).
            throw new InvalidDeclarationException("Role \"{$slug}\": \"name\" must be a non-empty string.");
        }

        foreach ((array) ($args['capabilities'] ?? []) as $capability => $granted) {
            if (!is_string($capability) || !is_bool($granted)) {
                // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML (see phpcs.xml.dist).
                throw new InvalidDeclarationException("Role \"{$slug}\": \"capabilities\" must map each capability name to true or false.");
            }
        }
    }

    protected function exists(string $slug): bool
    {
        return $this->roles === null || isset($this->roles->roles[$slug]);
    }

    /**
     * @param non-empty-lowercase-string $slug
     * @param array<string, mixed> $args
     */
    protected function registerOne(string $slug, array $args): mixed
    {
        /** @var array<string, bool> $capabilities checked by assertArgs() */
        $capabilities = $args['capabilities'] ?? [];
        $name         = (string) ($args['name'] ?? '');
        $roles        = $this->roles;
        if ($roles === null) {
            return null;
        }

        // What WP_Roles::add_role() does, minus its update_option().
        $roles->roles[$slug]        = ['name' => $name, 'capabilities' => $capabilities];
        $roles->role_objects[$slug] = new WP_Role($slug, $capabilities);
        $roles->role_names[$slug]   = $name;
        $this->injected[$slug]      = true;

        return $roles->role_objects[$slug];
    }
}
