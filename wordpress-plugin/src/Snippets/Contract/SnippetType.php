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
}
