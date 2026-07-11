<?php

// Function signatures for the Code Snippets plugin (https://wordpress.org/plugins/code-snippets/),
// purely for static analysis. Code Snippets isn't a Composer dependency of this plugin (it's an
// optional runtime dependency, only present when the user has it installed and active, see
// CodeSnippetsSnippetProvider::isActive()), so neither PHPStan nor Psalm can otherwise see these.

namespace Code_Snippets;

/**
 * @param int[] $ids
 * @return object[]
 */
function get_snippets(array $ids = [], ?bool $network = null): array
{
}

function get_snippet(int $id = 0, ?bool $network = null): object
{
}
