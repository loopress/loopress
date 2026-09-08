<?php

declare(strict_types=1);

namespace Loopress\Infrastructure;

/**
 * Scans an AbstractFilesDirectory of single-class PHP files, requires each at most once, and
 * hands the concrete subclass the instance to register however it needs to (one WP REST route
 * per verb in RouteLoader, one add_action()/add_filter() per attribute in HookLoader). Every
 * rejection is fail-closed: a bad file is logged and recorded, never fataled, so one broken
 * file can't take down rest_api_init / plugins_loaded for the whole site.
 */
abstract class AbstractFileLoader
{
    /** @var array<string, string> slug => failure reason, accumulated over one loadAndRegister() pass. */
    private array $errors = [];

    // slug => instance, or null if it failed to load. A fresh loader is built each request
    // (see each Feature::definitions()), so this never survives across requests.
    /** @var array<string, object|null> */
    private array $instances = [];

    // The scanned directory, typed to its concrete subclass by each loader so PHP-DI
    // autowires the right one.
    abstract protected function directory(): AbstractFilesDirectory;

    // Absolute path to the developer's own vendor autoloader, or null if they have none. A
    // seam rather than a stored dependency because the object that knows it lives in the Plus
    // layer, which the Shared layer this class sits in must not import.
    abstract protected function userAutoloadPath(): ?string;

    // Resolves each slug and registers whatever it declares. Runs inside a single WP hook,
    // never fatals for one bad file.
    abstract protected function loadFile(string $slug): void;

    // The path prefix in every log line and load-error key: 'api', 'hooks', … , taken straight
    // from the directory this loader was handed.
    private function label(): string
    {
        return $this->directory()::SUBDIR;
    }

    // The CLI command that injects the ABSPATH guard, named in resolveInstance()'s "deployed
    // outside …?" hint. Defaults to "lps <label> push"; HookLoader overrides because its verb
    // is singular ("lps hook push", not "lps hooks push").
    protected function pushCommand(): string
    {
        return "lps {$this->label()} push";
    }

    public function loadAndRegister(): void
    {
        $this->prepare();

        foreach ($this->directory()->listSlugs() as $slug) {
            $this->loadFile($slug);
        }

        update_option($this->directory()::LOAD_ERRORS_OPTION, $this->errors, false);

        $this->afterRegister();
    }

    // Overridable setup before the per-file loop. Default: just require the user autoload.
    protected function prepare(): void
    {
        $this->requireUserAutoload();
    }

    // Overridable teardown after the per-file loop. Default: nothing.
    protected function afterRegister(): void
    {
    }

    protected function requireUserAutoload(): void
    {
        $autoload = $this->userAutoloadPath();
        if ($autoload === null) {
            return;
        }

        // Runs before the per-file loop: a broken user vendor/ (missing dependency, corrupted
        // autoloader) must never fatal the request for the whole site, same blast-radius
        // principle as resolveInstance()'s own try/catch, but wider here since an uncaught
        // failure at this point would take down every route/hook, not just this developer's
        // own files.
        try {
            require_once $autoload;
        } catch (\Throwable $e) {
            $this->log('failed to load the user vendor autoloader: ' . $e->getMessage());
        }
    }

    // Requires and instantiates a slug's class at most once per request: a second attempt
    // reuses the cached result (including a null "it failed") instead of re-running this.
    // Discovers the class via ClassScanner (never require()s an unverified file to find out),
    // rejects anything but exactly one class, rejects a name collision (WP core, another
    // plugin, another file in the same directory), warns but does not refuse on a missing
    // ABSPATH guard.
    protected function resolveInstance(string $slug): ?object
    {
        if (array_key_exists($slug, $this->instances)) {
            return $this->instances[$slug];
        }

        $content = $this->directory()->read($slug);
        if ($content === null) {
            // gone between listSlugs() and here (e.g. deleted concurrently); nothing to load
            $this->instances[$slug] = null;
            return null;
        }

        $classes = ClassScanner::declaredClasses($content);
        if (count($classes) !== 1) {
            $found = $classes === [] ? 'none' : implode(', ', $classes);
            $this->fail($slug, "expected exactly one class declaration, found {$found}");
            $this->instances[$slug] = null;
            return null;
        }

        $className = $classes[0];

        // A collision must never fatal the whole site's boot. Checked against the name the
        // file actually declares, not a name computed from its path: two files can only
        // collide if they really do declare the same class.
        if (class_exists($className, false)) {
            $this->fail($slug, "class {$className} is already declared");
            $this->instances[$slug] = null;
            return null;
        }

        // FileWriter::withGuard() only injects the ABSPATH guard for files pushed through the
        // CLI; `pull` deliberately strips it again for a clean Git repo (see FileWriter::
        // stripGuard()). A Git-based deploy (rsync, a deploy hook) that never calls `push`
        // ships that guardless version straight to a publicly reachable wp-content/, where the
        // file is directly requestable over HTTP, bypassing permission_callback entirely.
        // Detecting this can't be more than a log: the registration itself is fine, only a
        // direct HTTP request to the raw file is at risk, refusing to register would punish
        // availability for a risk that isn't this file's fault.
        if (!str_contains($content, "defined('ABSPATH')")) {
            $this->log("{$this->label()}/{$slug}.php: no ABSPATH guard detected, deployed outside {$this->pushCommand()}? File may be directly reachable over HTTP.");
        }

        try {
            require_once $this->directory()->filePath($slug);
            $instance = new $className();
        } catch (\Throwable $e) {
            // Covers real parse errors too: since PHP 7, a compile error in a required file
            // throws \ParseError (a \Throwable), catchable here rather than fataling the whole
            // request the way an uncaught one would. $className is discovered from the file's
            // own tokens above, so it should always exist after a clean require, but a
            // conditional declaration (an `if` around the class) could still leave it missing:
            // none of these may ever fatal the request.
            $this->fail($slug, 'failed to load: ' . $e->getMessage());
            $this->instances[$slug] = null;
            return null;
        }

        $this->instances[$slug] = $instance;
        return $instance;
    }

    // Every loadFile() failure branch goes through here, never $this->log() directly: it's
    // both an error-log line (for a developer who checks it) and an entry in the load-errors
    // option (for one who doesn't). Informational notices that don't block registration (the
    // ABSPATH-guard warning above) are deliberately not routed through this.
    protected function fail(string $slug, string $reason): void
    {
        $this->log("{$this->label()}/{$slug}.php: {$reason}");
        $this->errors[$slug] = $reason;
    }

    protected function log(string $message): void
    {
        error_log("Loopress {$this->label()}/: " . $message); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
    }
}
