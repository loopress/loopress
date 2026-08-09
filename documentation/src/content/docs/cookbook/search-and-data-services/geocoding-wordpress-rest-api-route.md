---
title: Geocoding an Address in a WordPress Route with Geocoder PHP
description: A Custom API Route that turns a store location's street address into latitude and longitude, using geocoder-php and its Nominatim provider, so a map pin doesn't have to be entered by hand.
kind: route
draft: true
---

A site has a `location` custom post type, one per store, each with a street address stored as post meta. The frontend wants to plot every store on a map, which needs latitude and longitude, not a string. The usual workaround is a content editor manually looking up coordinates and pasting two numbers into a field, which works until the fortieth location, or until an address has a typo and nobody notices the pin landed in the wrong city.

## Why this needs a package

Geocoding, turning "221 rue de Rivoli, Paris" into a coordinate pair, means calling an external service that maintains address data and matches fuzzy input against it. WordPress doesn't have one built in, and hand-rolling an HTTP call against a specific provider's API shape locks the whole integration to that one provider. [geocoder-php](https://github.com/geocoder-php/Geocoder) is a small ecosystem of PHP packages built around a common `Geocoder` interface, with a separate provider package per service, Google Maps, Nominatim (OpenStreetMap), MapQuest, and others, so a route written against the interface doesn't have to be rewritten if the provider changes later.

## The route

```php title="api/geocode/[location_id].php"
<?php

declare(strict_types=1);

use Geocoder\Provider\Nominatim\Nominatim;
use Geocoder\Query\GeocodeQuery;
use Geocoder\StatefulGeocoder;
use GuzzleHttp\Client;

class Geocode
{
    public function post(WP_REST_Request $request): array|WP_Error
    {
        $locationId = (int) $request->get_param('location_id');
        $address    = get_post_meta($locationId, 'address', true);

        if (!is_string($address) || $address === '') {
            return new WP_Error('no_address', 'This location has no address set.', ['status' => 400]);
        }

        $httpClient = new Client();

        // TODO: verify against geocoder-php/nominatim-provider's current docs whether
        // withOpenStreetMapServer() needs a PSR-17 request factory as a third argument in the
        // installed version, some providers in this ecosystem do.
        $provider = Nominatim::withOpenStreetMapServer($httpClient, get_bloginfo('name') . ' geocoder');
        $geocoder = new StatefulGeocoder($provider);

        $results = $geocoder->geocodeQuery(GeocodeQuery::create($address));
        if ($results->isEmpty()) {
            return new WP_Error('not_found', 'No match for that address.', ['status' => 422]);
        }

        $coordinates = $results->first()->getCoordinates();
        $lat = $coordinates->getLatitude();
        $lng = $coordinates->getLongitude();

        update_post_meta($locationId, 'lat', $lat);
        update_post_meta($locationId, 'lng', $lng);

        return ['lat' => $lat, 'lng' => $lng];
    }
}
```

```bash
composer require geocoder-php/nominatim-provider
composer require guzzlehttp/guzzle
lps composer push
```

Nominatim is OpenStreetMap's free geocoding service, no API key, which is why it's the provider used here rather than one that needs a billing account behind it. Its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) caps request volume and requires a real identifying user agent string, both fine for geocoding a location as its address is saved, not for geocoding on every page view.

## Now call it

```bash
curl -X POST https://your-site.com/wp-json/loopress-api/v1/geocode/12 \
  -u "admin:xxxx xxxx xxxx xxxx xxxx xxxx"
```

```json
{"lat": 48.8606, "lng": 2.3376}
```

## Permission

Geocoding here writes coordinates back to a post, so it's a content-editing action, not a public read. Anyone who can already edit the location can trigger it, nothing narrower is needed:

```php
public function permission(WP_REST_Request $request): bool
{
    return current_user_can('edit_post', (int) $request->get_param('location_id'));
}
```

## A missing package is scoped to this route

Without `geocoder-php/nominatim-provider` and its dependencies installed, `Nominatim` and `StatefulGeocoder` are undefined classes, an ordinary PHP error on this one request. Loopress only [catches and logs](/api/routes/#failure-isolation) a corrupted or missing `vendor/autoload.php` itself, not an individual missing package inside an intact one, so install both packages through [Composer dependency management](/composer/) before pushing this route.

## What this opens up

The same interface swaps providers without touching the route's logic, Nominatim for a free tier, Google Maps if the volume or accuracy needs outgrow it. It's also a narrow enough file, one address in, one coordinate pair out, one permission check, that it's realistic to have an AI coding assistant draft it and review the actual API calls against the provider's docs before trusting it.
