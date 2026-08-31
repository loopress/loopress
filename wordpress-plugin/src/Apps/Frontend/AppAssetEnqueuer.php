<?php

declare(strict_types=1);

namespace Loopress\Apps\Frontend;

use Loopress\Apps\Infrastructure\AppStore;

/**
 * Turns a committed app record into `wp_enqueue_script`/`wp_enqueue_style` calls. The entry
 * filenames are content-hashed by the bundler, and the enqueue `?ver` is the buildId, so a
 * new deploy busts every cache without any extra machinery. Modern bundlers emit ES modules,
 * so the entry <script> tags are rewritten to `type="module"`.
 */
class AppAssetEnqueuer
{
    /**
     * Script handles this enqueuer marked as ES modules, for the script_loader_tag filter.
     *
     * @var array<string, true>
     */
    private array $moduleHandles = [];

    public function __construct(private AppStore $store) {}

    public function enqueue(string $name): void
    {
        $record = $this->store->get($name);
        if ($record === null) {
            return;
        }

        $buildId = is_string($record['buildId'] ?? null) ? $record['buildId'] : null;
        $entry   = is_array($record['entry'] ?? null) ? $record['entry'] : ['scripts' => [], 'styles' => []];
        $base    = content_url('loopress/apps/' . $name . '/');

        foreach ((array) ($entry['styles'] ?? []) as $i => $rel) {
            wp_enqueue_style($this->handle($name, 'style', $i), $base . ltrim((string) $rel, '/'), [], $buildId);
        }

        $firstHandle = null;
        foreach ((array) ($entry['scripts'] ?? []) as $i => $rel) {
            $handle = $this->handle($name, 'script', $i);
            wp_enqueue_script($handle, $base . ltrim((string) $rel, '/'), [], $buildId, true);
            $this->moduleHandles[$handle] = true;
            $firstHandle ??= $handle;
        }

        if ($firstHandle !== null) {
            wp_localize_script($firstHandle, 'loopressApp_' . str_replace('-', '_', $name), [
                'name'      => $name,
                'mount'     => $record['mountSelector'] ?? null,
                // Absolute URL the bundle is served from. Lets an app resolve a public/ asset
                // referenced from rendered markup (`base + 'icons.svg'`) without hardcoding
                // the path, for the cases the bundler's own base handling does not cover.
                'base'      => esc_url_raw($base),
                'buildId'   => $buildId,
                'restUrl'   => esc_url_raw(rest_url()),
                'restNonce' => wp_create_nonce('wp_rest'),
            ]);
        }
    }

    /**
     * Filter for `script_loader_tag`: adds type="module" to the entry scripts this enqueuer
     * registered, leaving every other script on the page untouched.
     */
    public function filterModuleType(string $tag, string $handle): string
    {
        if (!isset($this->moduleHandles[$handle]) || str_contains($tag, 'type="module"')) {
            return $tag;
        }

        return preg_replace('/<script\s/', '<script type="module" ', $tag, 1) ?? $tag;
    }

    private function handle(string $name, string $kind, int|string $index): string
    {
        return "loopress-app-{$name}-{$kind}-{$index}";
    }
}
