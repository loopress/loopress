---
title: Typo-Tolerant Instant Search in WooCommerce with Algolia
description: Index a WooCommerce catalog into Algolia with a Hook, then query it straight from a React single-page app using algolia/algoliasearch-client-php and the official Algolia JS client.
kind: app
---

A product catalog's search box uses WordPress's default search, `s=` against `WP_Query`, which under the hood is a `LIKE '%term%'` scan of `post_title` and `post_content`. It has no concept of relevance, "leather bag" and "bag leather brown" score the same, no typo tolerance, "levis" finds nothing if the product is titled "Levi's", and it gets slower as the catalog grows because there's no index built for search, just a table scan with wildcards on either side of the term.

## Why this needs a package, and a service

Real search relevance, ranking, typo tolerance, faceting, is a different kind of engineering than what a relational database's `LIKE` does. [Algolia](https://www.algolia.com/) is a hosted search service built specifically for this, and [`algolia/algoliasearch-client-php`](https://packagist.org/packages/algolia/algoliasearch-client-php) is its official PHP client. This is the "linking WordPress to another tool" case rather than the "package does the work locally" case from the rest of this series: the actual searching happens on Algolia's infrastructure, a Hook's job is keeping data indexed into it, an App's job is querying it back out.

## Index your catalog with a Hook

A [Hook](/hooks/) is what keeps Algolia current as products change in WordPress, bound directly to WooCommerce's own product lifecycle rather than to a URL:

```php title="hooks/algolia-index.php"
<?php

declare(strict_types=1);

use Loopress\Hooks\Attribute\Action;
use Algolia\AlgoliaSearch\Api\SearchClient;

// Two hooks, not one: a brand-new product fires woocommerce_new_product, never
// woocommerce_update_product (that one's update-only). Both run after
// WC_Product::save() finishes, unlike save_post_product, which fires mid-save,
// before WooCommerce's own meta box has written price/stock, so wc_get_product()
// there could still read the previous values.
class AlgoliaIndex
{
    #[Action('woocommerce_new_product')]
    public function onCreate(int $productId): void
    {
        $this->index($productId);
    }

    #[Action('woocommerce_update_product')]
    public function onUpdate(int $productId): void
    {
        $this->index($productId);
    }

    private function index(int $productId): void
    {
        $product = wc_get_product($productId);

        if (!$product instanceof WC_Product || $product->get_status() !== 'publish') {
            return;
        }

        $client = SearchClient::create(
            (string) get_option('algolia_app_id'),
            (string) get_option('algolia_write_key')
        );

        $categories = wc_get_product_terms($productId, 'product_cat', ['fields' => 'names']);

        $client->saveObject('products', [
            'objectID' => (string) $productId,
            'title'    => $product->get_name(),
            'price'    => (float) $product->get_regular_price(),
            'category' => $categories[0] ?? null,
        ]);
    }
}
```

```bash
composer require algolia/algoliasearch-client-php
lps composer push
lps hook push
```

Save a product in wp-admin (new or edited) and it's in the `products` index before the page even finishes loading, no cron, no manual re-sync. A deleted or unpublished product isn't cleaned up here, that's `woocommerce_trash_product` calling `$client->deleteObject('products', (string) $productId)`, the same shape, left out to keep this one focused on the indexing half.

## Query it back from a React app

Algolia's Search API Key is designed to sit in a browser, so the search UI itself, a [single-page app](/apps/), talks to Algolia directly with the official `algoliasearch` JS client, no WordPress round-trip on every keystroke:

```tsx title="apps/algolia-search/src/App.tsx"
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { algoliasearch } from "algoliasearch";

// The Search API Key, not Write or Admin: safe to ship in a browser bundle by
// design, see "Which key goes where" below.
const client = algoliasearch("YOUR_APP_ID", "YOUR_SEARCH_KEY");

type ProductHit = {
  objectID: string;
  title: string;
  price: number;
  _highlightResult?: { title?: { value?: string } };
};

export default function App() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  // Facet counts, attributesForFaceting on the index must list "category" or this
  // comes back empty, not an error. No queryKey deps: category counts don't change
  // while the page is open, one fetch for the component's lifetime.
  const { data: categories = {} } = useQuery({
    queryKey: ["algolia-categories"],
    queryFn: async () => {
      const res = await client.searchSingleIndex<ProductHit>({
        indexName: "products",
        searchParams: { query: "", facets: ["category"], hitsPerPage: 0 },
      });
      return res.facets?.category ?? {};
    },
  });

  // query and category both in the key: either one changing re-runs the search,
  // and TanStack Query caches each combination, flipping a filter back and forth
  // doesn't re-hit Algolia. enabled skips the request entirely with nothing typed
  // and no category picked, rather than firing a "match everything" query.
  const { data: hits = [] } = useQuery({
    queryKey: ["algolia-search", query, category],
    queryFn: async () => {
      const res = await client.searchSingleIndex<ProductHit>({
        indexName: "products",
        searchParams: {
          query,
          hitsPerPage: 20,
          facetFilters: category ? [`category:${category}`] : undefined,
        },
      });
      return res.hits as ProductHit[];
    },
    enabled: Boolean(query || category),
  });

  return (
    <div className="algolia-search">
      <input
        id="q"
        type="text"
        placeholder="Search products…"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="filters">
        {Object.entries(categories).map(([name, count]) => (
          <button
            key={name}
            type="button"
            className={name === category ? "active" : ""}
            onClick={() => setCategory(name === category ? null : name)}
          >
            {name} ({count})
          </button>
        ))}
      </div>
      <ul>
        {(query || category ? hits : []).map((hit) => (
          <li key={hit.objectID}>
            <span dangerouslySetInnerHTML={{ __html: hit._highlightResult?.title?.value ?? hit.title }} />
            <span>${hit.price}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

The mount side is Loopress's own contract, not Algolia's: the shortcode renders an empty `<div>` and localizes its id, `main.tsx` reads that instead of assuming `#root`:

```tsx title="apps/algolia-search/src/main.tsx"
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App";

// Loopress renders `<div id="loopress-app-<name>">` for the shortcode and localizes
// this global with that same selector: `#root` (index.html) only exists for local
// `npm run dev`, the real deploy never ships it.
const mountSelector =
  (globalThis as { loopressApp_algolia_search?: { mount: string } }).loopressApp_algolia_search?.mount ?? "#root";
const mountEl = document.querySelector(mountSelector);
if (!mountEl) throw new Error(`loopress app mount point ${mountSelector} not found`);

const queryClient = new QueryClient();

createRoot(mountEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

```bash
npm --prefix apps/algolia-search run build
lps app push algolia-search
```

Then drop it on any page with the built-in Shortcode block: `[loopress_app name="algolia-search"]`. That's the whole integration, no route to write or deploy for this part.

## Or replace a search box that's already there

Dropping the shortcode on a page works, but a storefront usually already has a search box, in the header, in a sidebar widget, wherever the theme puts it. Rather than adding a second one, a second [Hook](/hooks/) can swap the existing one out, using `#[Filter]` instead of `#[Action]`: WooCommerce's own product search box is built by `get_product_search_form()`, and every theme and widget that renders one routes through the `get_product_search_form` filter to do it:

```php title="hooks/replace-header-search.php"
<?php

declare(strict_types=1);

use Loopress\Hooks\Attribute\Filter;

class ReplaceHeaderSearch
{
    #[Filter('get_product_search_form')]
    public function withAlgoliaSearch(string $form): string
    {
        return do_shortcode('[loopress_app name="algolia-search"]');
    }
}
```

```bash
lps hook push
```

A `#[Filter]` must return the (possibly modified) value it receives, unlike an `#[Action]`, which returns nothing; here the shortcode's own markup replaces WooCommerce's default form outright, `$form` (the original HTML) is simply discarded. The same `lps hook push` from the indexing hook deploys this one too, `lps hook push` always pushes every file in `hooks/`, not just the one that changed. The technique generalizes past WooCommerce: any theme or plugin that renders its search box (or any other widget) through a filter can be swapped the same way, find the filter with a quick search of the theme or plugin's source for `apply_filters`.

## Which key goes where

Algolia issues more than one API key, and each of these two files needs a different one. `App.tsx` reads the Search key: read-only, scoped to querying, safe even shipped straight into a browser bundle. The hook reads `algolia_write_key`: it can create and update records, needed to index, but still can't delete or reconfigure an index the way the Admin key can. Neither file needs the Admin key at all, and it shouldn't be the one stored in `algolia_write_key`: if the hook's option value ever leaked, a Write key limits the blast radius to "someone can write bad data into the index," not "someone can delete the whole index."

## A missing package, or an unreachable Algolia

A hook has a simpler failure story than a route: no separate autoload-isolation layer to reason about, just [whether the method throws](/hooks/#action-and-filter). If `algolia/algoliasearch-client-php` isn't installed, `SearchClient::create()` throws (an undefined class), same as if the package were there but Algolia was unreachable or the key was wrong and `saveObject()` threw its own exception, either way it's already caught and logged for you, the `#[Action]` simply doesn't run, a product save never fatals over it. On the app's side, a bad Search key or an unreachable Algolia surfaces as `client.searchSingleIndex()` rejecting, worth wrapping in the usual React error boundary or a fallback empty state rather than an unhandled promise rejection.

## What this opens up

`category` above isn't hypothetical, it's what makes faceted filtering possible: the app passes `facetFilters: ["category:Footwear"]` alongside or instead of a text query, as long as the index's `attributesForFaceting` lists `category`. The hook's `index()` method is a natural place to add more attributes the same way, a stock flag, a price bracket, once the app needs to filter on them, not just full-text match. Querying Algolia straight from the browser keeps this integration to two files, a hook and an app, no backend proxy to write or deploy. If a search UI ever needs to merge in WordPress-specific data the frontend shouldn't compute itself, a customer's own pricing, a stock check, restricting results by post status, a [Custom API Route](/api/routes/) sitting between the app and Algolia is the natural place for that, same Search-key-to-Write-key split, just one more hop.
