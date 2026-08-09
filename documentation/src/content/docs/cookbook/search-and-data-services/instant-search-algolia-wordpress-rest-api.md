---
title: Typo-Tolerant Search in WordPress with an Algolia-Backed Route
description: A Custom API Route that proxies product search to Algolia instead of WP_Query's LIKE-based search, using algolia/algoliasearch-client-php.
kind: route
draft: true
---

A product catalog's search box uses WordPress's default search, `s=` against `WP_Query`, which under the hood is a `LIKE '%term%'` scan of `post_title` and `post_content`. It has no concept of relevance, "leather bag" and "bag leather brown" score the same, no typo tolerance, "levis" finds nothing if the product is titled "Levi's", and it gets slower as the catalog grows because there's no index built for search, just a table scan with wildcards on either side of the term.

## Why this needs a package, and a service

Real search relevance, ranking, typo tolerance, faceting, is a different kind of engineering than what a relational database's `LIKE` does. [Algolia](https://www.algolia.com/) is a hosted search service built specifically for this, and [`algolia/algoliasearch-client-php`](https://packagist.org/packages/algolia/algoliasearch-client-php) is its official client. This is the "linking WordPress to another tool" case rather than the "package does the work locally" case from the rest of this series: the actual searching happens on Algolia's infrastructure, the route's job is indexing data into it and querying it back out.

## The route

```php title="api/search.php"
<?php

declare(strict_types=1);

use Algolia\AlgoliaSearch\Api\SearchClient;

class Search
{
    public function get(WP_REST_Request $request): array
    {
        $query = (string) $request->get_param('q');

        $client = SearchClient::create(
            (string) get_option('algolia_app_id'),
            (string) get_option('algolia_search_key')
        );

        $response = $client->searchSingleIndex('products', [
            'query'       => $query,
            'hitsPerPage' => 20,
        ]);

        // TODO: verify the exact return shape of getHits() against the installed
        // algoliasearch-client-php version, array of arrays vs typed objects.
        return ['query' => $query, 'results' => $response->getHits()];
    }

    public function permission(): bool
    {
        return true;
    }
}
```

```bash
composer require algolia/algoliasearch-client-php
lps composer push
```

Getting product data into the `products` index in the first place is a separate concern, a `post` verb on this same file, a second route, or a scheduled job, not shown here to keep this one focused on the part that's actually search-specific.

## Now call it

```bash
curl "https://your-site.com/wp-json/loopress-api/v1/search?q=levis"
```

```json
{"query": "levis", "results": [{"objectID": "482", "title": "Levi's 501 Jeans", "price": 69.5}]}
```

## Why proxy this at all, Algolia's search key is meant to be public

Algolia's Search API Key is designed to sit in a browser, plenty of Algolia integrations query it directly from the frontend, no backend involved. A route still earns its place here: the frontend never learns the app ID, the index name, or that Algolia is the provider behind it, swapping search providers later is a backend change, not a frontend one, and anything WordPress-specific, merging in stock level, applying a customer's own pricing, restricting results by post status, has to happen somewhere, a route is a natural place for it.

## The key this route uses matters

Algolia separates a Search API Key, read-only, scoped to querying, safe even in frontend code, from the Admin API Key, which can create, delete, and reconfigure indices. The key configured here has to be the Search key. If this route (or the option it reads from) ever leaks, a Search key limits the blast radius to "someone can query the product index," not "someone can delete it."

## A missing package, or an unreachable Algolia

Two different failures, worth telling apart the same way as any other package used in a route. If `algolia/algoliasearch-client-php` isn't installed, `SearchClient` is an undefined class, an ordinary PHP error on this request, not something Loopress catches: it only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not one missing package inside an intact one. If the package is there but Algolia is unreachable or the key is wrong, `searchSingleIndex()` throws its own exception, also the route's own code to handle, a production version of this should catch that and return a graceful error (or fall back to `WP_Query`) rather than a raw 500.

## What this opens up

The same client handles indexing on `post_updated`, faceted filtering by category or price range, search-as-you-type with Algolia's own typo tolerance and ranking doing the heavy lifting. It's also a narrow enough route, one query in, one client call, one result set out, that it's a reasonable one to have an AI coding assistant draft and review against the actual Algolia response shape before trusting it.
