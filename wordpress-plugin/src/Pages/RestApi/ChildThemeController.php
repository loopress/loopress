<?php

declare(strict_types=1);

namespace Loopress\Pages\RestApi;

use Loopress\Infrastructure\AbstractFilesDirectory;
use Loopress\RestApi\RequiresManageOptionsCapability;
use Symfony\Component\Filesystem\Filesystem;
use WP_REST_Request;
use WP_REST_Response;

/**
 * `lps template push`/`list`/`diff`: the project's templates/ and parts/ written as files of a
 * child theme of the block theme in use, `<parent>-loopress`, the way WordPress itself expects a
 * site to override a parent's templates (Theme Handbook, "Child Themes"). The child directory is
 * a mirror of the repository, owned by Loopress: every push rewrites it whole. The database is
 * never written: it's the Site Editor's own layer, only read here to report drift.
 *
 * Never activates the child, a theme switch moves every per-theme setting (menu locations,
 * logo, widgets, global styles) and stays an explicit human action.
 *
 * @psalm-type Template = array{slug: string, html: string, title?: string, postTypes?: string[]}
 * @psalm-type Part = array{slug: string, html: string, title?: string, area?: string}
 * @phpstan-type Template array{slug: string, html: string, title?: string, postTypes?: string[]}
 * @phpstan-type Part array{slug: string, html: string, title?: string, area?: string}
 */
class ChildThemeController
{
    use RequiresManageOptionsCapability;

    public const SUFFIX = '-loopress';

    // What Loopress declared, so `lps template diff` compares like for like: theme.json alone
    // can't tell the entries Loopress wrote from the parent's ones it copies in (see themeJson()).
    public const MANIFEST = 'loopress-manifest.json';

    // Mirrored in cli/src/utils/template-format.ts, same rule as a page slug.
    private const SLUG_PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*$';

    private const SIZE_FILTER_SUBJECT = 'templates';

    private string $themeRoot;
    private Filesystem $filesystem;

    // Both injectable for tests only: a temp themes directory, and a Filesystem double to make the
    // swap fail halfway.
    public function __construct(?string $themeRoot = null, ?Filesystem $filesystem = null)
    {
        $this->themeRoot  = rtrim($themeRoot ?? get_theme_root(), '/');
        $this->filesystem = $filesystem ?? new Filesystem();
    }

    public function register_routes(): void
    {
        $file = [
            'type'       => 'object',
            'required'   => ['slug', 'html'],
            'properties' => [
                'slug' => ['type' => 'string', 'pattern' => self::SLUG_PATTERN],
                'html' => ['type' => 'string'],
            ],
        ];

        register_rest_route('loopress/v1', '/child-theme', [
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'get_child_theme'],
                'permission_callback' => $this->permissionCallback(),
            ],
            [
                'methods'             => 'PUT',
                'callback'            => [$this, 'put_child_theme'],
                'permission_callback' => $this->permissionCallback(),
                'args'                => [
                    'templates' => ['required' => true, 'type' => 'array', 'items' => $file],
                    'parts'     => ['required' => true, 'type' => 'array', 'items' => $file],
                ],
            ],
        ]);
    }

    public function get_child_theme(): WP_REST_Response
    {
        $parentTheme = $this->parentStylesheet();
        if (is_string($parentTheme) && $parentTheme !== '') {
            return new WP_REST_Response($this->describe($parentTheme), 200);
        }

        return $this->error(409, $parentTheme === null ? $this->notBlockThemeMessage() : $this->grandchildMessage());
    }

    public function put_child_theme(WP_REST_Request $request): WP_REST_Response
    {
        $parentTheme = $this->parentStylesheet();
        if (!is_string($parentTheme) || $parentTheme === '') {
            return $this->error(409, $parentTheme === null ? $this->notBlockThemeMessage() : $this->grandchildMessage());
        }

        /** @var array<int, Template> $templates */
        $templates = (array) $request->get_param('templates');
        /** @var array<int, Part> $parts */
        $parts = (array) $request->get_param('parts');

        $sizeError = $this->sizeError(array_merge($templates, $parts));
        if ($sizeError !== null) {
            return $this->error(413, $sizeError);
        }

        try {
            $this->write($parentTheme, $templates, $parts);
        } catch (\RuntimeException $e) {
            return $this->error(500, $e->getMessage());
        }

        return new WP_REST_Response($this->describe($parentTheme), 200);
    }

    /**
     * The block theme the child extends: the active theme, or its parent when the active theme
     * is already our child. '' when the active theme is some other child theme (WordPress has
     * no grandchild themes), null when it isn't a block theme.
     */
    private function parentStylesheet(): ?string
    {
        if (!wp_is_block_theme()) {
            return null;
        }

        $active = get_stylesheet();
        if (str_ends_with($active, self::SUFFIX) && get_template() !== $active) {
            return get_template();
        }

        return get_template() === $active ? $active : '';
    }

    /**
     * @param array<int, Template|Part> $files
     */
    private function sizeError(array $files): ?string
    {
        $maxFile  = (int) apply_filters('loopress_max_file_bytes', AbstractFilesDirectory::MAX_FILE_BYTES, self::SIZE_FILTER_SUBJECT);
        $maxTotal = (int) apply_filters('loopress_max_files_total_bytes', AbstractFilesDirectory::MAX_TOTAL_BYTES, self::SIZE_FILTER_SUBJECT);
        $total    = 0;

        foreach ($files as $file) {
            $bytes  = strlen($file['html']);
            $total += $bytes;
            if ($bytes > $maxFile) {
                return sprintf('"%s" is %d bytes, over the %d byte limit. Raise the loopress_max_file_bytes filter.', $file['slug'], $bytes, $maxFile);
            }
        }

        return $total > $maxTotal
            ? sprintf('Templates and parts total %d bytes, over the %d byte limit. Raise the loopress_max_files_total_bytes filter.', $total, $maxTotal)
            : null;
    }

    /**
     * Builds the whole child in a staging directory, then swaps it in with two renames, so a
     * failure halfway never leaves a half-written theme live. The staging name starts with a dot:
     * WordPress skips those when it scans the themes directory.
     *
     * @param array<int, Template> $templates
     * @param array<int, Part> $parts
     */
    private function write(string $parentTheme, array $templates, array $parts): void
    {
        $child   = $parentTheme . self::SUFFIX;
        $live    = "{$this->themeRoot}/{$child}";
        $staging = "{$this->themeRoot}/.{$child}-staging";
        $old     = "{$this->themeRoot}/.{$child}-old";

        // Two overlapping pushes would share the staging and backup directories. flock() is
        // released by the OS if PHP dies mid-write, so a crash never leaves a stale lock.
        // Local lock file next to the themes, not a remote URL; flock() needs a real stream handle.
        $lock = fopen("{$this->themeRoot}/.{$child}.lock", 'c'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
        if ($lock === false || !flock($lock, LOCK_EX)) {
            throw new \RuntimeException(esc_html("Failed to lock the child theme {$child} for writing."));
        }

        try {
            $this->filesystem->remove([$staging, $old]);
            $this->filesystem->dumpFile("{$staging}/style.css", $this->styleCss($parentTheme));
            $this->filesystem->dumpFile("{$staging}/theme.json", $this->json($this->themeJson($parentTheme, $templates, $parts)));
            $this->filesystem->dumpFile("{$staging}/" . self::MANIFEST, $this->json($this->manifest($templates, $parts)));
            foreach ($templates as $template) {
                $this->filesystem->dumpFile("{$staging}/templates/{$template['slug']}.html", $template['html']);
            }
            foreach ($parts as $part) {
                $this->filesystem->dumpFile("{$staging}/parts/{$part['slug']}.html", $part['html']);
            }

            $this->swap($staging, $live, $old);
        } catch (\Throwable $e) {
            throw new \RuntimeException(esc_html("Failed to write the child theme {$child}: " . $e->getMessage()));
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
        }

        // WordPress caches each theme's file list and its resolved theme.json.
        wp_clean_themes_cache();
        if (class_exists('WP_Theme_JSON_Resolver')) {
            \WP_Theme_JSON_Resolver::clean_cached_data();
        }
    }

    // The child may be the active theme: if the new directory can't take its place, the old one
    // goes back, a missing active theme would break the whole site.
    private function swap(string $staging, string $live, string $old): void
    {
        $hadLive = is_dir($live);
        if ($hadLive) {
            $this->filesystem->rename($live, $old);
        }

        try {
            $this->filesystem->rename($staging, $live);
        } catch (\Throwable $e) {
            if ($hadLive) {
                $this->filesystem->rename($old, $live);
            }
            throw $e;
        }

        $this->filesystem->remove($old);
    }

    private function styleCss(string $parentTheme): string
    {
        $name = (string) wp_get_theme($parentTheme)->get('Name');

        return "/*\nTheme Name: {$name} Loopress\nTemplate: {$parentTheme}\n"
            . "Description: Generated by Loopress from the project's templates/ and parts/. Every lps template push rewrites this theme, edit the project files instead.\n*/\n";
    }

    /**
     * A child's customTemplates/templateParts replace the parent's lists instead of merging with
     * them, which would strip the parent's parts of their area and its custom templates of their
     * title. So the parent's entries are copied in, and Loopress's own win on the same name.
     *
     * @param array<int, Template> $templates
     * @param array<int, Part> $parts
     * @return array<string, mixed>
     */
    private function themeJson(string $parentTheme, array $templates, array $parts): array
    {
        $parentJson = $this->readJson("{$this->themeRoot}/{$parentTheme}/theme.json");

        $customTemplates = [];
        foreach ($templates as $template) {
            if (isset($template['title']) || isset($template['postTypes'])) {
                $customTemplates[] = array_filter([
                    'name'      => $template['slug'],
                    'title'     => $template['title'] ?? null,
                    'postTypes' => $template['postTypes'] ?? null,
                ], fn($value) => $value !== null);
            }
        }

        $templateParts = array_map(fn(array $part): array => [
            'name'  => $part['slug'],
            'title' => $part['title'] ?? $part['slug'],
            'area'  => $part['area'] ?? 'uncategorized',
        ], $parts);

        return [
            '$schema'         => 'https://schemas.wp.org/trunk/theme.json',
            'version'         => 3,
            'customTemplates' => $this->mergeByName($parentJson['customTemplates'] ?? [], $customTemplates),
            'templateParts'   => $this->mergeByName($parentJson['templateParts'] ?? [], $templateParts),
        ];
    }

    /**
     * @param mixed $inherited
     * @param array<int, array<string, mixed>> $own
     * @return array<int, array<string, mixed>>
     */
    private function mergeByName(mixed $inherited, array $own): array
    {
        $ownNames = array_column($own, 'name');
        $kept     = array_filter(
            is_array($inherited) ? $inherited : [],
            fn($entry): bool => is_array($entry) && !in_array($entry['name'] ?? null, $ownNames, true)
        );

        return array_values(array_merge($kept, $own));
    }

    /**
     * @param array<int, Template> $templates
     * @param array<int, Part> $parts
     * @return array{templates: object, parts: object}
     */
    private function manifest(array $templates, array $parts): array
    {
        $meta = fn(array $file): array => array_diff_key($file, ['slug' => true, 'html' => true]);

        return [
            'templates' => (object) array_combine(array_column($templates, 'slug'), array_map($meta, $templates)),
            'parts'     => (object) array_combine(array_column($parts, 'slug'), array_map($meta, $parts)),
        ];
    }

    /** @return array<string, mixed> */
    private function describe(string $parentTheme): array
    {
        $child    = $parentTheme . self::SUFFIX;
        $dir      = "{$this->themeRoot}/{$child}";
        $manifest = $this->readJson("{$dir}/" . self::MANIFEST);
        $active   = get_stylesheet() === $child;

        return [
            'parent'     => $parentTheme,
            'stylesheet' => $child,
            'exists'     => is_dir($dir),
            'active'     => $active,
            'templates'  => $this->readFiles("{$dir}/templates", (array) ($manifest['templates'] ?? [])),
            'parts'      => $this->readFiles("{$dir}/parts", (array) ($manifest['parts'] ?? [])),
            'customized' => $active ? $this->customized() : [],
        ];
    }

    /**
     * @param array<string, mixed> $meta
     * @return array<int, array<string, mixed>>
     */
    private function readFiles(string $dir, array $meta): array
    {
        $files = glob("{$dir}/*.html");
        $files = $files === false ? [] : $files;
        sort($files);

        return array_map(function (string $path) use ($meta): array {
            $slug = basename($path, '.html');
            // Local file of the child theme Loopress itself wrote, not a remote URL.
            $html = (string) file_get_contents($path); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents

            return ['slug' => $slug, 'html' => $html] + (array) ($meta[$slug] ?? []);
        }, $files);
    }

    /**
     * Templates and parts of the active child edited in the Site Editor: WordPress then keeps a
     * copy in the database (wp_id set), which wins over the child's file.
     *
     * @return string[] e.g. ['templates/single', 'parts/header']
     */
    private function customized(): array
    {
        $customized = [];
        foreach (['wp_template' => 'templates', 'wp_template_part' => 'parts'] as $type => $dir) {
            foreach (get_block_templates([], $type) as $template) {
                if ($template->wp_id !== null && $template->wp_id !== 0) {
                    $customized[] = "{$dir}/{$template->slug}";
                }
            }
        }
        sort($customized);

        return $customized;
    }

    /** @return array<string, mixed> */
    private function readJson(string $path): array
    {
        // Local theme file, not a remote URL.
        $raw  = is_file($path) ? file_get_contents($path) : false; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        $data = $raw === false ? null : json_decode($raw, true);

        return is_array($data) ? $data : [];
    }

    private function json(mixed $data): string
    {
        return (string) wp_json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    }

    private function notBlockThemeMessage(): string
    {
        return 'The active theme is not a block theme. Templates and parts need one (Twenty Twenty-Five, for example).';
    }

    private function grandchildMessage(): string
    {
        return sprintf(
            'The active theme "%s" is already a child theme, and WordPress has no grandchild themes. Activate its parent, or a block theme, first.',
            get_stylesheet()
        );
    }

    private function error(int $status, string $message): WP_REST_Response
    {
        return new WP_REST_Response(['error' => $message], $status);
    }
}
