import {describe, expect, it} from 'vitest'

import {firstTopLevelSideEffect} from '../../src/utils/php-top-level.js'

const file = (body: string): string => `<?php\ndeclare(strict_types=1);\n${body}`

// Same cases as the plugin's ClassScanner::firstTopLevelSideEffect, which rejects these at push.
describe('firstTopLevelSideEffect', () => {
  it.each([
    [
      'a class with its namespace, imports, attributes and comments',
      String.raw`namespace App\Hooks;

use Loopress\Hooks\Attribute\Filter;

// a comment { ;
# another one
/* and a block } */
#[SomeAttribute('x')]
final class ReadingTime
{
    #[Filter('the_content', priority: 20)]
    public function run(string $c): string
    {
        $s = "}{ ;" . '?>' . <<<HTML
            <p>{$c}</p>
            HTML;
        return $s;
    }
}`,
    ],
    ['top-level functions, constants and a trailing closing tag', 'const RATE = 200;\nfunction helper(): int { return 1; }\nclass A {}\n?>\n'],
  ])('accepts %s', (_, body) => {
    expect(firstTopLevelSideEffect(file(body))).toBeNull()
  })

  it.each([
    ["defined('ABSPATH') || exit;\nclass A {}", 'defined'],
    ["if (!defined('ABSPATH')) { exit; }\nclass A {}", 'if'],
    ["class A {}\nadd_filter('the_content', 'x');", 'add_filter'],
    ['$x = 1;\nclass A {}', '$x'],
    ['{ exit; }\nclass A {}', '{'],
    ['class A {}\n?>\n<p>hi</p>', 'inline HTML after ?>'],
  ])('flags %j as %s', (body, found) => {
    expect(firstTopLevelSideEffect(file(body))).toBe(found)
  })

  it('flags inline HTML before the opening tag', () => {
    expect(firstTopLevelSideEffect('\n<?php\nclass A {}')).toBe('inline HTML before <?php')
  })
})
