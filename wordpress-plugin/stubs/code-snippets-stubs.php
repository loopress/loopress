<?php

// Function signatures for the Code Snippets plugin (https://wordpress.org/plugins/code-snippets/),
// purely for static analysis. Code Snippets isn't a Composer dependency of this plugin (it's an
// optional runtime dependency, only present when the user has it installed and active, see
// CodeSnippetsSnippetProvider::isActive()), so neither PHPStan nor Psalm can otherwise see these.

namespace Code_Snippets;

/**
 * Minimal stub of Code Snippets' own Snippet class: only the members this codebase actually
 * reads (CodeSnippetsSnippetProvider::isTrashed()/trashedIds()), not the real class's full
 * shape, for the same reason the functions below are stubbed rather than imported.
 */
class Snippet
{
    public int $id;

    public function is_trashed(): bool
    {
    }
}

/**
 * @param int[] $ids
 * @return Snippet[]
 */
function get_snippets(array $ids = [], ?bool $network = null): array
{
}

function get_snippet(int $id = 0, ?bool $network = null): Snippet
{
}
