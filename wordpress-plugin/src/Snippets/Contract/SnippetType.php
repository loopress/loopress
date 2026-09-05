<?php

declare(strict_types=1);

namespace Loopress\Snippets\Contract;

/** Backed by the same string values already exposed over REST, so the JSON wire format never changes. */
enum SnippetType: string
{
    case Php  = 'php';
    case Js   = 'js';
    case Css  = 'css';
    case Html = 'html';
    case Text = 'text';

    /** Canonical location used when a provider's stored location doesn't map to one it knows. */
    public function defaultLocation(): string
    {
        return match ($this) { // phpcs:ignore PHPCompatibility.Variables.ForbiddenThisUseContexts.OutsideObjectContext -- PHPCompatibility predates PHP 8.1 enums and misreads $this as outside object context here; this is an ordinary enum instance method.
            self::Css                        => 'header',
            self::Html, self::Js, self::Text => 'footer',
            self::Php                        => 'everywhere',
        };
    }
}
