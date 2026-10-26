<?php

declare(strict_types=1);

namespace Loopress\Pages\Service;

use Loopress\PostTypes\Exception\InvalidDeclarationException;
use Loopress\PostTypes\Service\AbstractDeclaredTypeService;
use WP_Block_Patterns_Registry;

// Block patterns declared in `patterns/<slug>.html` (`lps pattern push`), see
// AbstractDeclaredTypeService. Registered as `loopress/<slug>` on every request, so a
// `<!-- wp:pattern {"slug":"loopress/<slug>"} /-->` reference in a page, template or part renders
// the current version: managed pages can't be opened in the editor (PageFilters), which is what
// would otherwise expand the reference into a copy. Full-only like pages: the content is HTML that
// can carry a <script>.
final class PatternService extends AbstractDeclaredTypeService
{
    public const OPTION = 'loopress_patterns';

    public const NAMESPACE = 'loopress/';

    /** @var array<string, true> Slugs this request registered, see registerOne(). */
    private array $ours = [];

    /**
     * Every pattern registered by Loopress, the theme or a plugin (not WordPress core's own), for
     * `lps pattern list`. Loopress ones are listed by their file slug, the others by full name.
     *
     * @return list<array{slug: string, label: string, source: string, count: int, managed: bool, conflict: bool}>
     */
    public function registered(): array
    {
        $stored = $this->stored();
        $result = [];
        foreach (WP_Block_Patterns_Registry::get_instance()->get_all_registered() as $pattern) {
            $name = (string) ($pattern['name'] ?? '');
            if ($name === '' || str_starts_with($name, 'core/')) {
                continue;
            }

            $slug = str_starts_with($name, self::NAMESPACE) ? substr($name, strlen(self::NAMESPACE)) : $name;
            $ours = isset($this->ours[$slug]) && $slug !== $name;
            $result[] = [
                'slug'     => $ours ? $slug : $name,
                'label'    => (string) ($pattern['title'] ?? $name),
                'source'   => $ours ? 'loopress' : 'other',
                'count'    => 0,
                'managed'  => $ours,
                'conflict' => !$ours && $slug !== $name && isset($stored[$slug]),
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
        return 'Pattern';
    }

    protected function directory(): string
    {
        return 'patterns';
    }

    protected function maxSlugLength(): int
    {
        return 100;
    }

    protected function reservedSlugs(): array
    {
        return [];
    }

    // register_block_pattern() includes filePath as PHP.
    protected function codeArgs(): array
    {
        return ['filePath'];
    }

    protected function arrayArgs(): array
    {
        return ['categories' => [], 'keywords' => [], 'blockTypes' => [], 'postTypes' => [], 'templateTypes' => []];
    }

    protected function flushesRewriteRules(): bool
    {
        return false;
    }

    /** @param array<string, mixed> $args */
    protected function assertArgs(string $slug, array $args): void
    {
        $problem = match (true) {
            !is_string($args['title'] ?? null) || trim($args['title']) === '' => '"title" must be a non-empty string',
            !is_string($args['content'] ?? null) => '"content" must be a string',
            isset($args['description']) && !is_string($args['description']) => '"description" must be a string',
            isset($args['viewportWidth']) && !is_int($args['viewportWidth']) => '"viewportWidth" must be an integer',
            isset($args['inserter']) && !is_bool($args['inserter']) => '"inserter" must be true or false',
            default => null,
        };

        if ($problem !== null) {
            // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- JSON for the CLI, never HTML (see phpcs.xml.dist).
            throw new InvalidDeclarationException("Pattern \"{$slug}\": {$problem}.");
        }
    }

    protected function exists(string $slug): bool
    {
        return WP_Block_Patterns_Registry::get_instance()->is_registered(self::NAMESPACE . $slug);
    }

    /**
     * @param non-empty-lowercase-string $slug
     * @param array<string, mixed> $args
     */
    protected function registerOne(string $slug, array $args): mixed
    {
        /** @var array{title: string, content: string} $args checked by assertArgs(), WordPress handles the rest */
        if (register_block_pattern(self::NAMESPACE . $slug, $args)) {
            $this->ours[$slug] = true;
        }

        return null;
    }
}
