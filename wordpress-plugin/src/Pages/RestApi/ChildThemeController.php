<?php

declare(strict_types=1);

namespace Loopress\Pages\RestApi;

use Loopress\Infrastructure\AbstractFilesDirectory;
use Loopress\Pages\Frontend\ChildThemeStyles;
use Loopress\RestApi\RequiresManageOptionsCapability;
use Symfony\Component\Filesystem\Filesystem;
use WP_REST_Request;
use WP_REST_Response;

/**
 * `lps theme template push`/`list`/`diff`: the project's templates/, parts/ and theme CSS (bundled
 * by the CLI) written as files of a child theme of the block theme in use, `<parent>-loopress`, the way WordPress itself expects a
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
 * @psalm-type BlockStyle = array{name: string, css: string}
 * @psalm-type Asset = array{path: string, content: string}
 * @phpstan-type BlockStyle array{name: string, css: string}
 * @phpstan-type Asset array{path: string, content: string}
 */
final class ChildThemeController
{
    use RequiresManageOptionsCapability;

    public const SUFFIX = '-loopress';

    // What Loopress declared, so `lps theme template diff` compares like for like: theme.json alone
    // can't tell the entries Loopress wrote from the parent's ones it copies in (see themeJson()).
    public const MANIFEST = 'loopress-manifest.json';

    // Mirrored in cli/src/utils/template-format.ts. sanitize_key()'s charset, not a page slug's:
    // the template hierarchy embeds post type and taxonomy slugs as is (taxonomy-download_tag).
    private const SLUG_PATTERN = '^[a-z0-9_-]+$';

    // register_block_type()'s own rule. Also what keeps a block style file inside blocks/.
    public const BLOCK_NAME_PATTERN = '^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$';

    // Fonts and images a url() of the CSS points at (cli/src/utils/theme-css.ts), never a script
    // or PHP: these files are served from the theme directory. No leading dot, so never "..".
    public const ASSET_PATH_PATTERN = '^assets/[A-Za-z0-9_-][A-Za-z0-9._-]*\\.(avif|eot|gif|jpe?g|otf|png|svg|ttf|webp|woff2?)$';

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
        $blockStyle = [
            'type'       => 'object',
            'required'   => ['name', 'css'],
            'properties' => [
                'name' => ['type' => 'string', 'pattern' => self::BLOCK_NAME_PATTERN],
                'css'  => ['type' => 'string'],
            ],
        ];
        $asset = [
            'type'       => 'object',
            'required'   => ['path', 'content'],
            'properties' => [
                'path'    => ['type' => 'string', 'pattern' => self::ASSET_PATH_PATTERN],
                'content' => ['type' => 'string'],
            ],
        ];
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
                    // Optional, so a CLI older than the theme CSS still pushes its templates.
                    'style'     => ['type' => 'string', 'default' => ''],
                    'blocks'    => ['type' => 'array', 'default' => [], 'items' => $blockStyle],
                    'assets'    => ['type' => 'array', 'default' => [], 'items' => $asset],
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
        $style = (string) $request->get_param('style');
        /** @var array<int, BlockStyle> $blocks */
        $blocks = (array) ($request->get_param('blocks') ?? []);
        /** @var array<int, Asset> $assets */
        $assets = (array) ($request->get_param('assets') ?? []);

        $files = ['style.css' => $style];
        foreach ($templates as $template) {
            $files["templates/{$template['slug']}.html"] = $template['html'];
        }
        foreach ($parts as $part) {
            $files["parts/{$part['slug']}.html"] = $part['html'];
        }
        foreach ($blocks as $block) {
            $files["blocks/{$block['name']}.css"] = $block['css'];
        }
        foreach ($assets as $asset) {
            // Fonts and images are binary, JSON carries them as base64. Written as files, never run.
            $content = base64_decode($asset['content'], true); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
            if ($content === false) {
                return $this->error(400, sprintf('"%s" is not valid base64.', $asset['path']));
            }
            $files[$asset['path']] = $content;
        }

        $sizeError = $this->sizeError($files);
        if ($sizeError !== null) {
            return $this->error(413, $sizeError);
        }

        try {
            $this->write($parentTheme, $templates, $parts, $files);
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
     * @param array<string, string> $files contents by path in the child
     */
    private function sizeError(array $files): ?string
    {
        $maxFile  = (int) apply_filters('loopress_max_file_bytes', AbstractFilesDirectory::MAX_FILE_BYTES, self::SIZE_FILTER_SUBJECT);
        $maxTotal = (int) apply_filters('loopress_max_files_total_bytes', AbstractFilesDirectory::MAX_TOTAL_BYTES, self::SIZE_FILTER_SUBJECT);
        $total    = 0;

        foreach ($files as $path => $content) {
            $bytes  = strlen($content);
            $total += $bytes;
            if ($bytes > $maxFile) {
                return sprintf('"%s" is %d bytes, over the %d byte limit. Raise the loopress_max_file_bytes filter.', $path, $bytes, $maxFile);
            }
        }

        return $total > $maxTotal
            ? sprintf('The child theme files total %d bytes, over the %d byte limit. Raise the loopress_max_files_total_bytes filter.', $total, $maxTotal)
            : null;
    }

    /**
     * Builds the whole child in a staging directory, then swaps it in with two renames, so a
     * failure halfway never leaves a half-written theme live. The staging name starts with a dot:
     * WordPress skips those when it scans the themes directory.
     *
     * @param array<int, Template> $templates
     * @param array<int, Part> $parts
     * @param array<string, string> $files every file but style.css's header, theme.json and the manifest, by path
     */
    private function write(string $parentTheme, array $templates, array $parts, array $files): void
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
            $files['style.css'] = $this->styleCss($parentTheme) . $files['style.css'];
            $this->filesystem->dumpFile("{$staging}/theme.json", $this->json($this->themeJson($parentTheme, $templates, $parts)));
            $this->filesystem->dumpFile("{$staging}/" . self::MANIFEST, $this->json($this->manifest($templates, $parts)));
            foreach ($files as $path => $content) {
                $this->filesystem->dumpFile("{$staging}/{$path}", $content);
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
            . "Description: Generated by Loopress from the project's theme/ folder. Every lps theme template push rewrites this theme, edit the project files instead.\n*/\n";
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
                ], fn(string|array|null $value): bool => $value !== null);
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
            'unknownBlocks' => $this->unknownBlocks($dir),
            'css'        => (object) $this->cssHashes($dir),
        ];
    }

    /**
     * sha256 of each CSS file as the CLI sent it (style.css without the header write() adds), for
     * `lps theme template push --dry-run` to tell which ones the push would change. A header-only
     * style.css means the project has none, so it is left out.
     *
     * @return array<string, string> e.g. ['style.css' => '…', 'blocks/core/button.css' => '…']
     */
    private function cssHashes(string $dir): array
    {
        $hashes = [];
        // Local file of the child theme Loopress itself wrote, not a remote URL.
        $style = is_file("{$dir}/style.css") ? (string) file_get_contents("{$dir}/style.css") : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        $headerEnd = strpos($style, "*/\n");
        $style = $headerEnd === false ? $style : substr($style, $headerEnd + 3);
        if ($style !== '') {
            $hashes['style.css'] = hash('sha256', $style);
        }
        foreach (ChildThemeStyles::blockStyles($dir) as $name => $path) {
            $hashes["blocks/{$name}.css"] = (string) hash_file('sha256', $path);
        }

        return $hashes;
    }

    /**
     * Block style files of the child named after no registered block: wp_enqueue_block_style()
     * would never load them, silently. Read from the registry of this site, so a block from a
     * plugin inactive here shows up too: the CLI warns, it never refuses.
     *
     * @return string[] e.g. ['core/buton']
     */
    private function unknownBlocks(string $dir): array
    {
        $registry = \WP_Block_Type_Registry::get_instance();

        return array_values(array_filter(
            array_keys(ChildThemeStyles::blockStyles($dir)),
            fn(string $name): bool => !$registry->is_registered($name)
        ));
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
