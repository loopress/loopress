---
title: A Curated GraphQL Layer Over WordPress Data, in One Route File
description: A Custom API Route that answers GraphQL queries against a couple of WordPress types, using webonyx/graphql-php, without installing a full GraphQL plugin.
kind: route
---

A headless frontend rendering a product page wants the product's title, price, and three related products' titles, in one request. Against a REST API, that's either several round trips or a bespoke endpoint that happens to return exactly that shape and nothing else, useful once, then abandoned the next time the page's design changes what it needs. GraphQL exists for exactly this: one request, a query describing the shape, a response matching it.

The usual way to get GraphQL on WordPress is a plugin like WPGraphQL, which is the right call if you want the site's entire schema, every post type, every taxonomy, every field, exposed and queryable. That's a lot of surface area for a project that actually needs GraphQL for one or two types on one headless frontend.

## Why this needs a package

Parsing a GraphQL query string, validating it against a schema, and executing it against resolvers is the reference GraphQL algorithm, not something worth reimplementing. [`webonyx/graphql-php`](https://packagist.org/packages/webonyx/graphql-php) is the standard PHP implementation of the GraphQL spec, and it's schema-first in code, not schema-via-plugin-UI: you define types and resolvers as PHP, which is exactly what fits in a route file already written in PHP.

## The route

```php title="api/graphql.php"
<?php

declare(strict_types=1);

use GraphQL\GraphQL;
use GraphQL\Type\Definition\ObjectType;
use GraphQL\Type\Definition\Type;
use GraphQL\Type\Schema;

class GraphqlRoute
{
    public function post(WP_REST_Request $request): array
    {
        $productType = new ObjectType([
            'name'   => 'Product',
            'fields' => [
                'id'    => Type::nonNull(Type::id()),
                'title' => Type::string(),
                'price' => Type::float(),
            ],
        ]);

        $queryType = new ObjectType([
            'name'   => 'Query',
            'fields' => [
                'product' => [
                    'type'    => $productType,
                    'args'    => ['id' => Type::nonNull(Type::id())],
                    'resolve' => static function ($root, array $args): ?array {
                        $post = get_post((int) $args['id']);
                        if ($post === null || $post->post_type !== 'product') {
                            return null;
                        }

                        return [
                            'id'    => (string) $post->ID,
                            'title' => $post->post_title,
                            'price' => (float) get_post_meta($post->ID, '_price', true),
                        ];
                    },
                ],
            ],
        ]);

        $schema = new Schema(['query' => $queryType]);
        $body   = $request->get_json_params() ?? [];

        $result = GraphQL::executeQuery(
            $schema,
            (string) ($body['query'] ?? ''),
            null,
            null,
            $body['variables'] ?? null
        );

        return $result->toArray();
    }
}
```

```bash
composer require webonyx/graphql-php
lps composer push
```

The schema is built inline, on every request, on purpose: for two types this costs nothing measurable, and it keeps the whole schema readable in the one file that defines it, rather than split across a schema builder, a resolver map, and a registration step. That trade stops making sense somewhere around a dozen types, at which point this stops being a good candidate for a single route file and starts being the argument for a real GraphQL plugin.

## Now call it

```bash
curl -X POST https://your-site.com/wp-json/loopress-api/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query { product(id: \"482\") { title price } }"}'
```

```json
{"data": {"product": {"title": "Canvas Tote Bag", "price": 24.5}}}
```

## Permission, and a caveat specific to GraphQL

A REST route has a fixed response shape, whatever `get()` returns. A GraphQL route doesn't, the client's query determines what gets resolved and returned, which is the entire point, but it also means a public GraphQL endpoint accepts query shapes you didn't specifically design for, not just the one field you tested. `webonyx/graphql-php` has [documented rules](https://webonyx.github.io/graphql-php/security/) for this, `QueryComplexity` and `QueryDepth`, registered globally through `DocumentValidator::addRule()`, worth adding before this route is public, not treated as an afterthought once it already is.

```php
public function permission(): bool
{
    return true;
}
```

## A missing package is scoped to this one route

Without `webonyx/graphql-php` installed, `ObjectType` and `Schema` are undefined classes, an ordinary PHP error on this request. As with every other package used in a route, Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not one missing package inside an intact `vendor/`, so install it through [Composer dependency management](/composer/) first.

## Fields backed by ACF, not raw postmeta

`price` above reads `get_post_meta($post->ID, '_price', true)` because that's how a plugin like WooCommerce already stores it. When the field doesn't come from another plugin, and doesn't need a custom post type either, defining it as an [ACF field group](/acf/) attached to WordPress's own `post` type and reading it with `get_field()` instead means the schema for that field, its type, its label, which post type it applies to, lives in one file synced by Loopress (`lps acf push`), not scattered across `register_post_meta()` calls or, worse, undocumented. This repository's own demo does exactly that: no custom post type, no WooCommerce, a `Post` type instead of `Product`, `readingTime`/`summary` instead of `price`:

```php
'readingTime' => Type::float(),
'summary'     => Type::string(),
// ...
'readingTime' => (float) get_field('reading_time', $post->ID),
'summary'     => (string) get_field('summary', $post->ID),
```

Nothing about the route changes to support this, `get_field()` is a drop-in for `get_post_meta()` here, ACF stores simple field types in the same postmeta table under the field's own name. The composition is the point: the field group is a schema Loopress deploys, the route is an API Loopress also deploys, and neither needs to know about the other beyond the field name they agree on.

## A GraphiQL route, for exploring it interactively

The route above only accepts POST, nothing a browser can poke at directly. A second route, `api/graphiql.php`, serves [GraphiQL](https://github.com/graphql/graphiql) pointed at it, so a teammate can explore the schema and run queries without a separate tool:

```php title="api/graphiql.php"
public function get(): void
{
    $endpoint = esc_url_raw(rest_url('loopress-api/v1/graphql'));

    header('Content-Type: text/html; charset=utf-8');
    echo <<<HTML
    <script type="importmap">{"imports": {"graphiql": "https://esm.sh/graphiql@5.4.0?standalone&external=react,react-dom,@graphiql/react,graphql", "...": "..."}}</script>
    <script type="module">
      import { GraphiQL } from 'graphiql';
      import { createGraphiQLFetcher } from '@graphiql/toolkit';
      // render GraphiQL with fetcher: createGraphiQLFetcher({ url: {$endpoint} })
    </script>
    HTML;
    exit;
}
```

Same raw-output bypass as the PDF and spreadsheet recipes: a route can hand back HTML instead of JSON by setting its own `Content-Type` header and calling `exit` before WordPress's own dispatch gets a chance to serialize anything. React and GraphiQL load as ES modules from a CDN through an import map, GraphiQL's own documented approach for its current major version, no build step, no separate npm project for what's otherwise a one-file recipe.

## What this opens up

The same file grows by adding fields and types, not by adding endpoints, a `relatedProducts` field on `Product` is a resolver, not a new route. It's also narrow enough as a starting point, one file, one schema, one dispatch method, that drafting the first version of it with an AI coding assistant and reviewing the resolvers yourself is a reasonable way to get it written.
