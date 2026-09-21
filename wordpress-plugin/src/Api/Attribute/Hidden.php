<?php

declare(strict_types=1);

namespace Loopress\Api\Attribute;

/**
 * Marks every endpoint of a route file with show_in_index => false: the route keeps working
 * exactly as before, it just stops appearing in /wp-json/ and its namespace's discovery index.
 * Opt-in, class-level only (WP has no per-verb notion of index visibility). See
 * RouteLoader::endpointsFor().
 */
#[\Attribute(\Attribute::TARGET_CLASS)]
final class Hidden
{
}
