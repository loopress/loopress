<?php

declare(strict_types=1);

namespace Loopress\Api\Attribute;

/**
 * Marks every endpoint of a route file with show_in_index => false: the route keeps working
 * exactly as before, it just stops appearing in /wp-json/ and its namespace's discovery index.
 * Opt-in, class-level only: WordPress itself supports show_in_index per verb, RouteLoader
 * just reads this attribute once per class and applies it to every verb the file implements,
 * a Loopress simplicity choice, not a WordPress limitation. See RouteLoader::endpointsFor().
 */
#[\Attribute(\Attribute::TARGET_CLASS)]
final class Hidden
{
}
