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
    ['a class in a bracketed namespace', 'namespace App {\n    use Foo\\Bar;\n    final class A { public function f() { return 1; } }\n}'],
    // Templates inside a class or function body only run when called.
    ['a method that outputs a template', 'class A {\n    public function f(): string {\n        ob_start();\n        ?>\n<p>hi</p>\n        <?php\n        return ob_get_clean();\n    }\n}'],
    [
      'a template using the alternative syntax and echo tags',
      `#[Filter('the_content')]
final class Card
{
    public function render(array $items): void
    {
        ?>
        <ul class="<?php echo esc_attr($this->cls); ?>">
            <?php foreach ($items as $item) : ?>
                <?php if ($item) : ?><li><?= esc_html($item) ?></li><?php endif; ?>
            <?php endforeach; ?>
        </ul>
        <?php
    }

    private function other(): int { return 1; }
}`,
    ],
    ['a template with braces and semicolons in its HTML', 'class A { function f() { ?>\n<style>a { color: red; }</style><script>if (x) { y(); }</script>\n<?php } }'],
    ['templates in two methods', 'class A {\n    function f() { ?><p>1</p><?php }\n    function g() { ?><p>2</p><?php }\n}'],
    ['a template in a closure inside a method', 'class A { function f() { return function () { ?><p>hi</p><?php }; } }'],
    ['a template in a top-level function', 'function tpl(): void { ?>\n<p>hi</p>\n<?php }\nclass A {}'],
    ['a template method in a bracketed namespace', 'namespace App {\n    class A { function f() { ?><p>hi</p><?php } }\n}'],
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
    // A template inside a method must not hide what follows the class.
    ['class A { function f() { ?><p>ok</p><?php } }\n?>\n<p>leak</p>', 'inline HTML after ?>'],
    ['class A { function f() { ?><p>ok</p><?php } }\n?>\n<p>leak</p>\n<?php\nclass B {}', 'inline HTML after ?>'],
    ["class A { function f() { ?><p>ok</p><?php } }\nadd_action('init', 'x');", 'add_action'],
    ['namespace App {\n    class A {}\n    ?>\n<p>leak</p>\n<?php\n}', 'inline HTML after ?>'],
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
