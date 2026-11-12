<?php

declare(strict_types=1);

namespace Loopress\Tests\Unit;

use Brain\Monkey\Actions;
use Brain\Monkey\Filters;

// Brain Monkey records add_action()/add_filter() but never runs the callbacks, so a module test
// declares the hooks it cares about before boot() and then fires the captured callbacks itself.
trait RecordsHooks
{
    /** @var array<string, list<callable(mixed...): mixed>> */
    protected array $actions = [];
    /** @var array<string, list<callable(mixed...): mixed>> */
    protected array $filters = [];

    protected function recordActions(string ...$hooks): void
    {
        foreach ($hooks as $hook) {
            Actions\expectAdded($hook)->zeroOrMoreTimes()->whenHappen(function (callable $callback) use ($hook): void {
                $this->actions[$hook][] = $callback;
            });
        }
    }

    protected function recordFilters(string ...$hooks): void
    {
        foreach ($hooks as $hook) {
            Filters\expectAdded($hook)->zeroOrMoreTimes()->whenHappen(function (callable $callback) use ($hook): void {
                $this->filters[$hook][] = $callback;
            });
        }
    }

    protected function fireAction(string $hook, mixed ...$args): void
    {
        $this->assertArrayHasKey($hook, $this->actions, "Nothing hooked on action {$hook}");
        foreach ($this->actions[$hook] as $callback) {
            $callback(...$args);
        }
    }

    protected function applyFilter(string $hook, mixed $value, mixed ...$args): mixed
    {
        $this->assertArrayHasKey($hook, $this->filters, "Nothing hooked on filter {$hook}");
        foreach ($this->filters[$hook] as $callback) {
            $value = $callback($value, ...$args);
        }

        return $value;
    }
}
