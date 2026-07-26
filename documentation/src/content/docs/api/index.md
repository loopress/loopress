---
title: Custom API Routes
description: Deploy custom WordPress REST API endpoints from version-controlled PHP files, and see what's live from the plugin's admin UI.
---

Custom API Routes let you version-control custom WordPress REST API endpoints as plain PHP files in Git. Each file becomes one REST route on the site, no other plugin required.

This is a [Loopress Full](/wordpress-plugin/) feature, not available in Loopress Light.

Write a PHP class with one public method per HTTP verb, push it with `lps api push`, and the endpoint is live:

```php
<?php

declare(strict_types=1);

class HelloWorld
{
    public function get(): array
    {
        return ['message' => 'Hello, world!'];
    }
}
```

```
https://example.com/wp-json/loopress-api/v1/hello-world
```

Routes are closed by default (admin credentials required), and every file can opt into its own access rules, CORS headers, and Composer dependencies. A broken file is skipped and logged, never breaking the rest of the site's REST API.

## Pages

- [CLI](/api/cli/): the `lps api pull/push/list` commands and how they treat your local directory
- [Writing Route Files](/api/routes/): the complete file reference, request handling, responses, authentication, CORS, namespaces, and the security model
- [Editor Setup](/editor-setup/): WordPress autocomplete and static analysis in your project via WordPress stubs
- [Admin UI](/api/admin-ui/): the **API** tab that lists every route currently deployed on the site, and the namespace setting
