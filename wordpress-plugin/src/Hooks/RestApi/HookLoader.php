<?php

declare(strict_types=1);

namespace Loopress\Hooks\RestApi;

use Loopress\Dependencies\Infrastructure\LoopressEnvironment;
use Loopress\Hooks\Attribute\Action;
use Loopress\Hooks\Attribute\Cron;
use Loopress\Hooks\Attribute\Filter;
use Loopress\Hooks\Infrastructure\HooksDirectory;
use Loopress\Infrastructure\AbstractFileLoader;
use Loopress\Infrastructure\AbstractFilesDirectory;

/**
 * Scans wp-content/loopress/hooks/*.php, requires each file, and binds what its class
 * declares: one add_action() per public #[Action] method, one add_filter() per public
 * #[Filter] method, one add_action()+wp_schedule_event() per public #[Cron] method (see that
 * attribute's docblock for why it's the same underlying primitive as #[Action], only the
 * trigger differs).
 *
 * File scanning, one-class-per-file discovery and collision/parse-error handling live in
 * AbstractFileLoader; this class only turns a resolved instance into WP hook bindings. It
 * runs in a single pass (no separate 'init' pass for #[Cron] the way RouteLoader once needed
 * for its own): HooksModule::boot() already runs on 'plugins_loaded', which fires on every
 * request type, wp-cron.php included. It deliberately does NOT override prepare() to call
 * $this->directory->ensureExists(): loadAndRegister() runs on 'plugins_loaded' for every
 * WP-CLI bootstrap too (core install, plugin activation, any `wp` command run as a different
 * user than the webserver), and creating the directory there would leave it root-owned,
 * unwritable to Apache on the next real push. listSlugs() already returns [] for a directory
 * that doesn't exist yet; HooksDirectory::write() (reached only via a real HTTP request to
 * hook-files) is the only place the directory actually gets created.
 *
 * Unlike a REST route, a bound action/filter runs unconditionally, for every visitor, with no
 * permission_callback of its own: every bound callback is wrapped to catch and log rather
 * than propagate (see wrapActionCallback()/wrapFilterCallback()/wrapCronCallback()); a filter
 * additionally fails open, returning the original unfiltered value, rather than risk turning
 * one broken filter into a blank page for every visitor.
 */
class HookLoader extends AbstractFileLoader
{
    public function __construct(private HooksDirectory $directory, private LoopressEnvironment $environment) {}

    protected function directory(): AbstractFilesDirectory
    {
        return $this->directory;
    }

    protected function userAutoloadPath(): ?string
    {
        return $this->environment->getAutoloadPath();
    }

    // "lps hook push", not the "lps <label> push" default: the CLI verb is singular even
    // though the directory/label is "hooks".
    protected function pushCommand(): string
    {
        return 'lps hook push';
    }

    /**
     * Every WP binding one file's instance declares, built as pure data (no add_action()/
     * add_filter()/wp_schedule_event() calls of its own) so it's testable without stubbing
     * those, same reasoning as RouteLoader::endpointsFor(). loadFile() is what actually
     * registers each entry with WordPress.
     *
     * @return array{
     *   actions: array<int, array{hook: string, priority: int, acceptedArgs: int, callback: callable}>,
     *   filters: array<int, array{hook: string, priority: int, acceptedArgs: int, callback: callable}>,
     *   crons: array<int, array{hook: string, recurrence: string, callback: callable}>,
     * }
     */
    public function bindingsFor(object $instance, string $slug): array
    {
        $actions = [];
        foreach ($this->actionMethodsFor($instance) as [$method, $attribute]) {
            $actions[] = [
                'hook'         => $attribute->hook,
                'priority'     => $attribute->priority,
                'acceptedArgs' => $attribute->acceptedArgs,
                'callback'     => $this->wrapActionCallback($instance, $method, $slug),
            ];
        }

        $filters = [];
        foreach ($this->filterMethodsFor($instance) as [$method, $attribute]) {
            $filters[] = [
                'hook' => $attribute->hook,
                'priority' => $attribute->priority,
                // Always requests at least 1 arg from WP so the wrapper has the original value
                // on hand for its fail-open path, even for a #[Filter(acceptedArgs: 0)] method
                // that itself never receives it (see wrapFilterCallback()).
                'acceptedArgs' => max($attribute->acceptedArgs, 1),
                'callback' => $this->wrapFilterCallback($instance, $method, $slug, $attribute->acceptedArgs),
            ];
        }

        $crons = [];
        foreach ($this->cronMethodsFor($instance) as [$method, $attribute]) {
            $crons[] = [
                'hook'       => $attribute->hook ?? 'loopress_hooks_cron_' . str_replace('/', '_', $slug) . '_' . $method,
                'recurrence' => $attribute->recurrence,
                'callback'   => $this->wrapCronCallback($instance, $method, $slug),
            ];
        }

        return ['actions' => $actions, 'filters' => $filters, 'crons' => $crons];
    }

    protected function loadFile(string $slug): void
    {
        $instance = $this->resolveInstance($slug);
        if ($instance === null) {
            return;
        }

        try {
            $bindings = $this->bindingsFor($instance, $slug);
        } catch (\Throwable $e) {
            // Covers a throwing attribute constructor the same way the require/instantiate
            // try/catch in resolveInstance() covers a parse error: never let one file's bad
            // attribute skip every other file's hooks.
            $this->fail($slug, 'failed to load: ' . $e->getMessage());
            return;
        }

        if ($bindings['actions'] === [] && $bindings['filters'] === [] && $bindings['crons'] === []) {
            // Every other failure branch already logs (collision, parse error, both in
            // resolveInstance()); this one didn't, so a typo'd attribute usage or an
            // accidentally-private method failed in total silence, indistinguishable from
            // "this file intentionally declares nothing yet".
            $this->fail($slug, 'no public #[Action], #[Filter], or #[Cron] method found, nothing registered');
            return;
        }

        foreach ($bindings['actions'] as $action) {
            add_action($action['hook'], $action['callback'], $action['priority'], $action['acceptedArgs']);
        }

        foreach ($bindings['filters'] as $filter) {
            add_filter($filter['hook'], $filter['callback'], $filter['priority'], $filter['acceptedArgs']);
        }

        foreach ($bindings['crons'] as $cron) {
            $this->registerCron($slug, $cron['hook'], $cron['recurrence'], $cron['callback']);
        }
    }

    /** @return array<int, array{0: string, 1: Action}> public method name + its #[Action] attribute, in declaration order. */
    private function actionMethodsFor(object $instance): array
    {
        $found = [];
        foreach ((new \ReflectionClass($instance))->getMethods(\ReflectionMethod::IS_PUBLIC) as $method) {
            $attributes = $method->getAttributes(Action::class);
            if ($attributes !== []) {
                $found[] = [$method->getName(), $attributes[0]->newInstance()];
            }
        }

        return $found;
    }

    /** @return array<int, array{0: string, 1: Filter}> public method name + its #[Filter] attribute, in declaration order. */
    private function filterMethodsFor(object $instance): array
    {
        $found = [];
        foreach ((new \ReflectionClass($instance))->getMethods(\ReflectionMethod::IS_PUBLIC) as $method) {
            $attributes = $method->getAttributes(Filter::class);
            if ($attributes !== []) {
                $found[] = [$method->getName(), $attributes[0]->newInstance()];
            }
        }

        return $found;
    }

    /** @return array<int, array{0: string, 1: Cron}> public method name + its #[Cron] attribute, in declaration order. */
    private function cronMethodsFor(object $instance): array
    {
        $found = [];
        foreach ((new \ReflectionClass($instance))->getMethods(\ReflectionMethod::IS_PUBLIC) as $method) {
            $attributes = $method->getAttributes(Cron::class);
            if ($attributes !== []) {
                $found[] = [$method->getName(), $attributes[0]->newInstance()];
            }
        }

        return $found;
    }

    // A throw here runs on every request that fires $hook, for every visitor: never let it
    // propagate. Nothing to fail open with, an action has no return value WP does anything
    // with.
    private function wrapActionCallback(object $instance, string $method, string $slug): callable
    {
        return function (...$args) use ($instance, $method, $slug): void {
            if (!is_callable([$instance, $method])) {
                return;
            }

            try {
                call_user_func_array([$instance, $method], $args);
            } catch (\Throwable $e) {
                $this->log("hooks/{$slug}.php: {$method}() threw during an action callback: " . $e->getMessage());
            }
        };
    }

    // Same fail-closed reasoning as wrapActionCallback(), plus fails open: on a throw (or a
    // method that vanished between registration and dispatch), the original, unfiltered value
    // passes through unchanged rather than a broken filter silently turning into `null` for
    // every consumer of $hook, which for something like `the_content` would blank the page.
    private function wrapFilterCallback(object $instance, string $method, string $slug, int $acceptedArgs): callable
    {
        return function (...$args) use ($instance, $method, $slug, $acceptedArgs) {
            $original = $args[0] ?? null;

            if (!is_callable([$instance, $method])) {
                return $original;
            }

            try {
                return call_user_func_array([$instance, $method], array_slice($args, 0, $acceptedArgs));
            } catch (\Throwable $e) {
                $this->log("hooks/{$slug}.php: {$method}() threw during a filter callback: " . $e->getMessage());
                return $original;
            }
        };
    }

    // A throw here runs during a real WP-Cron pseudo-request: never let one scheduled job's
    // bug take down whatever else WP-Cron is running in that pass.
    private function wrapCronCallback(object $instance, string $method, string $slug): callable
    {
        return function () use ($instance, $method, $slug): void {
            if (!is_callable([$instance, $method])) {
                return;
            }

            try {
                call_user_func([$instance, $method]);
            } catch (\Throwable $e) {
                $this->log("hooks/{$slug}.php: {$method}() threw during a scheduled cron run: " . $e->getMessage());
            }
        };
    }

    // Bound unconditionally: add_action() is cheap and idempotent from WP's own side.
    // wp_schedule_event() is the side that actually persists (the `cron` option), hence the
    // wp_next_scheduled() guard.
    private function registerCron(string $slug, string $hook, string $recurrence, callable $callback): void
    {
        add_action($hook, $callback);

        if (wp_next_scheduled($hook)) {
            return;
        }

        if (wp_schedule_event(time(), $recurrence, $hook) === false) {
            $this->log("hooks/{$slug}.php: failed to schedule cron '{$hook}', unknown recurrence '{$recurrence}'?");
        }
    }
}
