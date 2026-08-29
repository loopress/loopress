<?php

declare(strict_types=1);

namespace Loopress\Seo\Service;

// One of two interchangeable SeoProvider backends (see SeoService for the arbitration between
// this and RankMathService), the same shape as CodeSnippetsSnippetProvider/WPCodeSnippetProvider.
// Doesn't implement SeoRedirectProvider: Yoast's redirect manager is a Premium-only feature with
// a storage model this codebase hasn't verified against a real install (see RankMathService for
// the equivalent RankMath feature, which is free and so is covered).
//
// Post-level SEO data (title, description, robots, canonical, social, and schema type
// selection) is all stored as postmeta prefixed `_yoast_wpseo_` (the leading underscore marks
// it "protected" in WordPress's own sense, hidden from the default custom fields UI, but it
// reads/writes through get_post_meta()/update_post_meta() exactly like any other meta). See
// AbstractSeoService for the generic sync logic shared with RankMathService.
class YoastService extends AbstractSeoService
{
    public function isActive(): bool
    {
        return defined('WPSEO_VERSION');
    }

    protected function metaPrefix(): string
    {
        return '_yoast_wpseo_';
    }

    protected function optionTitles(): string
    {
        return 'wpseo_titles';
    }

    protected function providerLabel(): string
    {
        return 'Yoast';
    }
}
