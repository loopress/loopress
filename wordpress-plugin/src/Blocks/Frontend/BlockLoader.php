<?php

declare(strict_types=1);

namespace Loopress\Blocks\Frontend;

use Loopress\Blocks\Infrastructure\BlocksDirectory;
use Loopress\Infrastructure\Narrow;

/**
 * Registers every wp-content/loopress/blocks/<slug>/ folder as the dynamic block
 * loopress/<slug>, on 'init' like any block. WordPress does the registration itself
 * (register_block_type() on the folder), this class only adds what a block living outside a
 * plugin or theme needs:
 *
 * - a render callback that catches whatever render.php throws, so a broken block renders
 *   nothing instead of breaking the page (same stance as HookLoader's wrapped callbacks);
 * - working asset URLs: WordPress resolves `file:./style.css` with plugins_url(), which builds
 *   a broken URL for a folder outside wp-content/plugins/ (see filterAssetUrl());
 * - a cache-busting `version` and `"inserter": false` by default (see filterMetadata()).
 */
final class BlockLoader
{
    // Same throttle as HookLoader: a block failing on every request of a busy site must not
    // write to the database on every request.
    private const RUNTIME_ERROR_WRITE_INTERVAL = 60;

    private ?string $root = null;

    public function __construct(private readonly BlocksDirectory $directory) {}

    public function registerAll(): void
    {
        $errors = [];
        foreach ($this->directory->listSlugs() as $slug) {
            $error = $this->registerOne($slug);
            if ($error !== null) {
                $this->log("blocks/{$slug}: {$error}");
                $errors[$slug] = $error;
            }
        }

        // update_option() skips the query when the value is unchanged.
        update_option(BlocksDirectory::LOAD_ERRORS_OPTION, $errors, false);
    }

    private function registerOne(string $slug): ?string
    {
        $name = "loopress/{$slug}";
        $json = file_get_contents($this->directory->blockPath($slug) . 'block.json'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
        $metadata = is_string($json) ? json_decode($json, true) : null;
        if (!is_array($metadata)) {
            return 'block.json is not a valid JSON object';
        }
        if (($metadata['name'] ?? null) !== $name) {
            return "block.json \"name\" must be \"{$name}\"";
        }
        // Skipped rather than registered over: WordPress refuses a second registration anyway,
        // with a notice that says nothing about Loopress.
        if (\WP_Block_Type_Registry::get_instance()->is_registered($name)) {
            return "{$name} is already registered by a theme or plugin";
        }

        $registered = register_block_type($this->directory->blockPath($slug), [
            // Overrides the callback WordPress builds from a "render" field, if block.json has one.
            'render_callback' => fn(array $attributes = [], string $content = '', ?\WP_Block $block = null): string => $this->render($slug, $attributes, $content, $block),
        ]);

        return $registered === false ? 'WordPress refused to register the block' : null;
    }

    /** @param array<array-key, mixed> $attributes */
    public function render(string $slug, array $attributes, string $content, ?\WP_Block $block): string
    {
        $file  = $this->directory->blockPath($slug) . 'render.php';
        $level = ob_get_level();
        ob_start();

        try {
            // Isolated scope: render.php sees exactly WordPress's own template contract.
            (static function (string $__file, array $attributes, string $content, ?\WP_Block $block): void { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter -- read by the included template
                include $__file; // NOSONAR php:S2003: a block renders once per occurrence on the page, include_once would print it once
            })($file, $attributes, $content, $block);

            return (string) ob_get_clean();
        } catch (\Throwable $e) {
            while (ob_get_level() > $level) {
                ob_end_clean();
            }
            $this->recordRuntimeError($slug, $e);

            return '';
        }
    }

    /**
     * 'block_type_metadata': only for Loopress blocks. `version` defaults to block.json's mtime
     * (rewritten on every push), otherwise WordPress versions the assets with its own version and
     * browsers keep a stale style.css. Hidden from the inserter by default: these blocks are
     * placed in pages/ and templates/ files, not picked in wp-admin.
     *
     * @param array<array-key, mixed> $metadata
     * @return array<array-key, mixed>
     */
    public function filterMetadata(array $metadata): array
    {
        $file = $metadata['file'] ?? null;
        if (!is_string($file) || !$this->isOurs($file)) {
            return $metadata;
        }

        $mtime                = filemtime($file);
        $metadata['version'] ??= $mtime === false ? null : (string) $mtime;

        $supports = Narrow::map($metadata['supports'] ?? null);
        $supports['inserter'] ??= false;
        $metadata['supports'] = $supports;

        return $metadata;
    }

    // 'plugins_url': get_block_asset_url() falls back to plugins_url(basename($path), $path) for
    // anything outside wp-includes/ and the active theme, which only works under wp-content/plugins/.
    public function filterAssetUrl(string $url, string $path, string $plugin): string // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter -- plugins_url filter signature
    {
        $root = $this->root();
        if ($root === null || !$this->isOurs($plugin)) {
            return $url;
        }

        return content_url('loopress/blocks/' . substr(wp_normalize_path($plugin), strlen($root) + 1));
    }

    private function isOurs(string $path): bool
    {
        $root = $this->root();
        return $root !== null && str_starts_with(wp_normalize_path($path), $root . '/');
    }

    // Resolved like WordPress resolves block paths (realpath, normalized), so a symlinked
    // wp-content still matches.
    private function root(): ?string
    {
        if ($this->root === null) {
            $real       = realpath($this->directory->root());
            $this->root = $real === false ? '' : wp_normalize_path($real);
        }

        return $this->root === '' ? null : $this->root;
    }

    // Kept for `lps block list`, tagged with render.php's revision so a re-pushed block stops
    // reporting it. Recording must never break the page either.
    private function recordRuntimeError(string $slug, \Throwable $error): void
    {
        $this->log("blocks/{$slug}/render.php threw: " . $error->getMessage());

        try {
            $stored   = get_option(BlocksDirectory::RUNTIME_ERRORS_OPTION, []);
            $stored   = is_array($stored) ? $stored : [];
            $previous = Narrow::map($stored[$slug] ?? null);
            $entry    = [
                'message'  => $error->getMessage(),
                'at'       => time(),
                'revision' => $this->directory->renderRevision($slug),
            ];

            if (
                ($previous['message'] ?? null) === $entry['message']
                && ($previous['revision'] ?? null) === $entry['revision']
                && $entry['at'] - Narrow::int($previous['at'] ?? null) < self::RUNTIME_ERROR_WRITE_INTERVAL
            ) {
                return;
            }

            $stored[$slug] = $entry;
            update_option(BlocksDirectory::RUNTIME_ERRORS_OPTION, $stored, false);
        } catch (\Throwable $e) {
            $this->log('could not record a block runtime error: ' . $e->getMessage());
        }
    }

    private function log(string $message): void
    {
        error_log('Loopress blocks/: ' . $message); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
    }
}
