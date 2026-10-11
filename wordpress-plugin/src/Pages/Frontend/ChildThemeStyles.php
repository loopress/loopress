<?php

declare(strict_types=1);

namespace Loopress\Pages\Frontend;

use Loopress\Pages\RestApi\ChildThemeController;

/**
 * Loads the theme CSS `lps theme template push` writes into the Loopress child theme. WordPress
 * never enqueues a theme's style.css by itself, block theme or not, so this does it, plus one
 * wp_enqueue_block_style() per blocks/<namespace>/<block>.css, which WordPress only prints on
 * pages that render that block. Nothing happens unless the Loopress child is the active theme.
 */
class ChildThemeStyles
{
    public const HANDLE = 'loopress-child-theme';

    public function register(): void
    {
        add_action('wp_enqueue_scripts', [$this, 'enqueueStyle']);
        add_action('after_setup_theme', [$this, 'addEditorStyle']);
        add_action('init', [$this, 'enqueueBlockStyles']);
    }

    public function enqueueStyle(): void
    {
        $dir = $this->activeChildDirectory();
        if ($dir === null) {
            return;
        }

        $path = "{$dir}/style.css";
        // The file's mtime as version: every push changes the URL, so no stale cached stylesheet.
        wp_enqueue_style(self::HANDLE, get_stylesheet_uri(), [], (string) filemtime($path));
        // With a path, WordPress inlines the stylesheet when it's small (wp_maybe_inline_styles).
        wp_style_add_data(self::HANDLE, 'path', $path);
    }

    // Block themes support editor styles already, this makes the editor iframe load style.css too.
    public function addEditorStyle(): void
    {
        if ($this->activeChildDirectory() !== null) {
            add_editor_style('style.css');
        }
    }

    public function enqueueBlockStyles(): void
    {
        $dir = $this->activeChildDirectory();
        if ($dir === null) {
            return;
        }

        $uri = get_stylesheet_directory_uri();
        foreach (self::blockStyles($dir) as $name => $path) {
            wp_enqueue_block_style($name, [
                'handle' => 'loopress-block-' . str_replace('/', '-', $name),
                'src'    => "{$uri}/blocks/{$name}.css",
                'path'   => $path,
                'ver'    => (string) filemtime($path),
            ]);
        }
    }

    /**
     * The child's blocks/<namespace>/<block>.css files, by block name.
     *
     * @return array<string, string>
     */
    public static function blockStyles(string $childDir): array
    {
        $files = glob("{$childDir}/blocks/*/*.css");
        $styles = [];
        foreach ($files === false ? [] : $files as $path) {
            $styles[basename(dirname($path)) . '/' . basename($path, '.css')] = $path;
        }
        ksort($styles);

        return $styles;
    }

    private function activeChildDirectory(): ?string
    {
        $stylesheet = get_stylesheet();
        $isOurChild = str_ends_with($stylesheet, ChildThemeController::SUFFIX) && get_template() !== $stylesheet;

        return $isOurChild ? get_stylesheet_directory() : null;
    }
}
