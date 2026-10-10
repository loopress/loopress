<?php

declare(strict_types=1);

namespace Loopress\PostTypes\Service;

use Loopress\PostTypes\Exception\InvalidDeclarationException;
use Loopress\PostTypes\Exception\StaleDeclarationRevisionException;

// A WordPress object type declared in the project's files (`cpt/<slug>.json`,
// `taxonomies/<slug>.json`): the plain arguments of its `register_*()` call, stored as data in one
// option and registered on every request. Data only, never code: arguments WordPress would call or
// instantiate are refused (codeArgs()), which is what keeps these resources in Loopress Light.
// Post types and taxonomies differ only in the hooks below and in what registered() reports.
abstract class AbstractDeclaredTypeService
{
    // Set by every write, consumed once on the next `init` (see flushIfNeeded()): rewrite rules
    // must be flushed after the changed type is registered, never during the REST write itself,
    // and never on every request. Shared by post types and taxonomies, one flush covers both.
    public const FLUSH_OPTION = 'loopress_post_types_flush';

    /** @var array<string, object> The object each slug this request registered got, see register(). */
    private array $registered = [];

    /** The wp_options row holding every declaration, slug => arguments. */
    abstract protected function option(): string;

    /** "Post type", "Taxonomy": the subject of every error message. */
    abstract protected function noun(): string;

    /** The project directory the files live in, named in error messages. */
    abstract protected function directory(): string;

    /** WordPress's own length limit for this kind of key. */
    abstract protected function maxSlugLength(): int;

    /** @return list<string> Slugs WordPress reserves for itself (any `wp_` slug is reserved too). */
    abstract protected function reservedSlugs(): array;

    /** @return list<string> Arguments WordPress calls or instantiates: refused, see the class comment. */
    abstract protected function codeArgs(): array;

    /**
     * Arguments WordPress uses as arrays (array_merge(), foreach) without checking first: a string
     * there is a fatal TypeError on every request.
     *
     * @return array<string, list<bool>> argument => what else it may be, if anything
     */
    abstract protected function arrayArgs(): array;

    abstract protected function exists(string $slug): bool;

    /**
     * @param non-empty-lowercase-string $slug
     * @param array<string, mixed> $args
     */
    abstract protected function registerOne(string $slug, array $args): mixed;

    /**
     * Every registered object of this kind a site owner would recognise, with where it comes
     * from, for the read-only admin viewer and `lps <cpt|taxonomy> list`.
     *
     * @return list<array<string, mixed>>
     */
    abstract public function registered(): array;

    /** @return list<array{slug: string, args: array<string, mixed>, revision: string}> */
    public function list(): array
    {
        $result = [];
        foreach ($this->stored() as $slug => $args) {
            $result[] = $this->export($slug, $args);
        }

        return $result;
    }

    /** @return array{slug: string, args: array<string, mixed>, revision: string}|null */
    public function get(string $slug): ?array
    {
        $stored = $this->stored();

        return isset($stored[$slug]) ? $this->export($slug, $stored[$slug]) : null;
    }

    /**
     * Creates or replaces one declaration. With `$expectedRevision`, refused (#234) unless the
     * stored arguments still match it, same contract as MenuService::upsertMenu().
     *
     * @param array<string, mixed> $args
     * @return array{slug: string, args: array<string, mixed>, revision: string}
     */
    public function upsert(string $slug, array $args, ?string $expectedRevision = null): array
    {
        $this->assertValid($slug, $args);

        $stored = $this->stored();
        if ($expectedRevision !== null) {
            $current = isset($stored[$slug]) ? $this->revisionOf($stored[$slug]) : null;
            if ($current !== $expectedRevision) {
                $found = $current === null ? 'it no longer exists' : "its revision is now \"{$current}\"";
                // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML (see phpcs.xml.dist).
                throw new StaleDeclarationRevisionException("{$this->noun()} \"{$slug}\" changed on WordPress since it was last read (expected revision \"{$expectedRevision}\", but {$found}). Re-read it and try again.");
            }
        }

        $stored[$slug] = $args;
        $this->save($stored);

        return $this->export($slug, $args);
    }

    /** Never deletes the content (posts, terms): it stays in the database, hidden until registered again. */
    public function delete(string $slug): bool
    {
        $stored = $this->stored();
        if (!isset($stored[$slug])) {
            return false;
        }

        unset($stored[$slug]);
        $this->save($stored);

        return true;
    }

    /**
     * Registers every stored declaration, skipping (never overwriting) a slug something else
     * already registered: the admin viewer reports it as a conflict. One broken entry never
     * stops the others.
     */
    public function register(): void
    {
        foreach ($this->stored() as $slug => $args) {
            // Re-validated: validated on write, but any other code can write this option too.
            try {
                $this->assertValid($slug, $args);
            } catch (InvalidDeclarationException) {
                continue;
            }

            $slug = strtolower($slug);
            if ($slug === '' || $this->exists($slug)) {
                continue;
            }

            // Past assertValid(), the args shape is the user's file, checked by WordPress itself.
            // A WordPress-side error throws before anything is registered: skip that one entry
            // rather than take the whole site down on every request.
            try {
                $result = $this->registerOne($slug, $args);
            } catch (\Throwable) {
                continue;
            }

            if (is_object($result) && !is_wp_error($result)) {
                $this->registered[$slug] = $result;
            }
        }
    }

    public function flushIfNeeded(): void
    {
        if (get_option(self::FLUSH_OPTION) === false) {
            return;
        }

        delete_option(self::FLUSH_OPTION);
        flush_rewrite_rules(false);
    }

    // Same object, not just same slug: a theme or plugin registering this slug again later in
    // `init` silently replaces ours, which is then a conflict, not a Loopress declaration.
    protected function isOurs(string $slug, object $object): bool
    {
        return ($this->registered[$slug] ?? null) === $object;
    }

    /** @return array<string, array<string, mixed>> */
    protected function stored(): array
    {
        $stored = get_option($this->option(), []);

        /** @var array<string, array<string, mixed>> */
        return is_array($stored) ? $stored : [];
    }

    /** @param array<string, mixed> $args */
    private function assertValid(string $slug, array $args): void
    {
        $max = $this->maxSlugLength();
        if (preg_match('/^[a-z0-9_-]{1,' . $max . '}$/', $slug) !== 1) {
            // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML (see phpcs.xml.dist).
            throw new InvalidDeclarationException("Invalid {$this->lowerNoun()} slug \"{$slug}\": 1 to {$max} lowercase letters, digits, \"_\" or \"-\".");
        }

        if (in_array($slug, $this->reservedSlugs(), true) || str_starts_with($slug, 'wp_')) {
            // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML (see phpcs.xml.dist).
            throw new InvalidDeclarationException("{$this->noun()} slug \"{$slug}\" is reserved by WordPress.");
        }

        foreach ($this->arrayArgs() as $key => $alsoAllowed) {
            if (array_key_exists($key, $args) && !is_array($args[$key]) && !in_array($args[$key], $alsoAllowed, true)) {
                $or = $alsoAllowed === [] ? '' : ' (or ' . implode(', ', array_map(static fn(bool $value): string => $value ? 'true' : 'false', $alsoAllowed)) . ')';
                // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML (see phpcs.xml.dist).
                throw new InvalidDeclarationException("{$this->noun()} \"{$slug}\": \"{$key}\" must be a JSON object or array{$or}.");
            }
        }

        $code = array_values(array_intersect($this->codeArgs(), array_keys($args)));
        if ($code !== []) {
            // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML (see phpcs.xml.dist).
            throw new InvalidDeclarationException("{$this->noun()} \"{$slug}\": \"{$code[0]}\" runs PHP code, use a hook instead of a {$this->directory()}/ file for it.");
        }
    }

    private function lowerNoun(): string
    {
        return strtolower($this->noun());
    }

    /** @param array<string, array<string, mixed>> $stored */
    private function save(array $stored): void
    {
        ksort($stored);
        update_option($this->option(), $stored, true);
        update_option(self::FLUSH_OPTION, 1, false);
    }

    /**
     * @param array<string, mixed> $args
     * @return array{slug: string, args: array<string, mixed>, revision: string}
     */
    private function export(string $slug, array $args): array
    {
        return ['slug' => $slug, 'args' => $args, 'revision' => $this->revisionOf($args)];
    }

    // sha256 for the same reason as OptionsService::revisionOf(): a change-detection tag only.
    /** @param array<string, mixed> $args */
    private function revisionOf(array $args): string
    {
        return hash('sha256', (string) wp_json_encode($args));
    }
}
