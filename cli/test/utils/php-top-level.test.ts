import {describe, expect, it} from 'vitest'

import {firstTopLevelSideEffect, startsWithStrictTypes} from '../../src/utils/php-top-level.js'

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
    ['a method that outputs a template', 'class A {\n    public function f(): string {\n        ob_start();\n        ?>\n<p>hi</p>\n        <?php\n        return ob_get_clean();\n    }\n}'],
    ['a class in a bracketed namespace','namespace App {\n    use Foo\\Bar;\n    final class A { public function f() { return 1; } }\n}'],
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
    ["namespace App {\n    add_filter('x', 'handler');\n    class A {}\n}", 'add_filter'],
    ['class A {} // ?>output', 'inline HTML after ?>'],
  ])('flags %j as %s', (body, found) => {
    expect(firstTopLevelSideEffect(file(body))).toBe(found)
  })

  it('flags inline HTML before the opening tag', () => {
    expect(firstTopLevelSideEffect('\n<?php\nclass A {}')).toBe('inline HTML before <?php')
  })

  it.each([
    ['<?php\ndeclare(strict_types=1);\nclass A {}', true],
    ['<?php\n// head\nDECLARE ( strict_types = 1 );', true],
    ['<?php\nclass A {}\ndeclare(strict_types=1);', false],
    ['<?php\n// declare(strict_types=1);\nclass A {}', false],
    ["<?php\nclass A { const D = 'declare(strict_types=1);'; }", false],
  ])('startsWithStrictTypes(%j) is %s', (content, expected) => {
    expect(startsWithStrictTypes(content)).toBe(expected)
  })
})
