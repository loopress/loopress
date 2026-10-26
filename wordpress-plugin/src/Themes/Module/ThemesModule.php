<?php

declare(strict_types=1);

namespace Loopress\Themes\Module;

use Loopress\Contract\Module;
use Loopress\Themes\RestApi\ThemeController;

// Shipped in both editions: switching themes deploys no code, and `lps content copy` aligns the
// local theme on a Light site too. The Loopress child theme itself stays in Pages (Full).
final class ThemesModule implements Module
{
    public function boot(): void
    {
        add_action('rest_api_init', static fn() => (new ThemeController())->register_routes());
    }
}
