<?php

declare(strict_types=1);

namespace Loopress\Apps\Infrastructure;

/**
 * The `loopress_apps` option: the source of truth for what the front end should mount, kept
 * separate from the files on disk so a half-finished `lps app push` (assets uploaded, commit
 * not yet run) never changes what visitors see. `AppsController::commit()` is the only writer.
 *
 * Shape, keyed by app name:
 *   [
 *     'buildId'          => '9f2a1c7b4e10',   // content hash, also the enqueue ?ver
 *     'routing'          => 'hash',
 *     'mountSelector'    => '#loopress-app-search',
 *     'entry'            => ['scripts' => [...relPaths], 'styles' => [...relPaths]],
 *     'files'            => [['path' => ..., 'sha256' => ..., 'size' => ...], ...],
 *     'previousManifest' => [ ...same shape as 'files', the generation before this one ],
 *     'deployedAt'       => '2026-08-30T12:00:00+00:00',
 *   ]
 */
class AppStore
{
    private const OPTION = 'loopress_apps';

    /** @return array<string, mixed> */
    public function all(): array
    {
        $value = get_option(self::OPTION, []);

        return is_array($value) ? $value : [];
    }

    /** @return array<string, mixed>|null */
    public function get(string $name): ?array
    {
        $all = $this->all();

        return isset($all[$name]) && is_array($all[$name]) ? $all[$name] : null;
    }

    /** @param array<string, mixed> $record */
    public function put(string $name, array $record): void
    {
        $all        = $this->all();
        $all[$name] = $record;
        // autoload false: only ever read on a request that renders a [loopress_app] shortcode.
        update_option(self::OPTION, $all, false);
    }

    public function forget(string $name): void
    {
        $all = $this->all();
        unset($all[$name]);
        update_option(self::OPTION, $all, false);
    }
}
