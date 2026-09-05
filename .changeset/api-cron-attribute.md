---
"@loopress/wordpress-plugin": minor
---

Added a `#[Cron]` attribute for declaring WP-Cron jobs directly in custom API route files (`api/*.php`), the same way `#[Permission]` already declares per-verb access control.

```php
use Loopress\Api\Attribute\Cron;

class InvoiceCleanup
{
    #[Cron('daily')]
    public function cleanup(): void
    {
        // ...
    }
}
```

`recurrence` accepts any WordPress schedule name (`hourly`, `twicedaily`, `daily`, or a custom one registered via `cron_schedules`). The event is scheduled once and left alone after that; an optional `hook` name lets other code `do_action()` the same job on demand. A class can mix HTTP verbs and `#[Cron]` methods freely, or declare only `#[Cron]` methods and register no REST route at all. Same fail-closed behavior as the rest of the route-file API: a throwing `#[Cron]` method is caught and logged, never fatal.
