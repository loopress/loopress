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

  // The lexer must skip strings, heredocs and comments whole, or a brace or keyword in them
  // would shift the brace depth.
  it.each([
    ['a top-level call', '<?php\nfoo();', 'foo'],
    ['a bare block right after the opening tag', '<?php\n{ exit; }', '{'],
    ['a single-quoted string statement', "'x';", 'a string'],
    ['a double-quoted string statement', '"x";', 'a string'],
    ['a backtick command', '`ls`;', '`'],
    ['a heredoc statement', '<<<EOT\n}\nEOT;\nclass A {}', 'a string'],
    ['an expression in parentheses', '(function () {})();', '('],
    ['a call after an escaped quote in a string', 'class A { const X = "a\\"{"; }\nfoo();', 'foo'],
    ['a call after an escaped quote in a single-quoted string', "class A { const X = 'a\\'{'; }\nfoo();", 'foo'],
    ['a call after a string holding braces', 'class A { const X = "{x{"; }\nfoo();', 'foo'],
    ['a call after an empty heredoc', 'class A { const X = <<<EOT\nEOT;\n}\nfoo();', 'foo'],
    ['a call before a later heredoc', 'class A { function f() { return 1 <<<2; } }\nfoo(); $x = <<<EOT\nx\nEOT;', 'foo'],
    ['inline HTML between two tags', 'class A {}\n?>hi\n<?php\nclass B {}', 'inline HTML after ?>'],
    ['a call after a heredoc holding a brace', 'class A { const X = <<<EOT\n{\nEOT;\n}\nfoo();', 'foo'],
    ['a call after a nowdoc with an indented closing identifier', "class A { const X = <<<'EOT'\n  {\n  EOT;\n}\nfoo();", 'foo'],
    ['a call after a quoted heredoc label with spaces', 'class A { const X = <<< "EOT"\n{\nEOT;\n}\nfoo();', 'foo'],
    ['a call after a heredoc whose label prefixes a line', 'class A { const X = <<<EOT\nEOTX }\nEOT;\n}\nfoo();', 'foo'],
    ['a call after a line comment', '// a comment {\nfoo();', 'foo'],
    ['a call after a hash comment', '# a comment {\nfoo();', 'foo'],
    ['a call after a block comment', '/* a } comment */ foo();', 'foo'],
    ['a call hidden behind a fake block comment end', '/*/ foo(); */\nbar();', 'bar'],
    ['a call after a comment opening an array', 'class A { const X = [# {\n]; }\nfoo();', 'foo'],
    ['a call after an attributed function on the same line', '#[Attr] function f() {} bar();', 'bar'],
    ['a call after an attribute', '#[Attr] foo();', 'foo'],
    ['a call after an attribute holding brackets', "#[Attr(['a' => [1]], ']')] foo();", 'foo'],
    ['a call after a closing tag that opens again', 'class A {}\n?><?php\nfoo();', 'foo'],
    ['a call after a closing tag ending a statement', 'const X = 1 ?>\n<?php\nfoo();', 'foo'],
    ['a bare block in a bracketed namespace', 'namespace App {\n    { foo(); }\n}', '{'],
    ['two newlines after a closing tag', 'class A {}\n?>\n\n', 'inline HTML after ?>'],
    ['a stray closing brace', '} foo();', 'foo'],
  ])('flags %s', (_, body, found) => {
    const content = body.startsWith('<?php') ? body : file(body)
    expect(firstTopLevelSideEffect(content)).toBe(found)
  })

  it.each([
    ['a trailing line comment without a newline', 'class A {} // the end'],
    ['an unterminated block comment', 'class A {} /* open'],
    ['an unterminated string', "class A { const X = 'open"],
    ['an unterminated heredoc', 'class A { const X = <<<EOT\n}\nfoo();'],
    ['a closing tag right before reopening', 'class A {}\n?>\n<?php\nclass B {}'],
    ['a closing tag with a CRLF', 'class A {}\n?>\r\n'],
    ['a shift operator in a method', 'class A { function f() { return 1 <<<2; } }'],
  ])('accepts %s', (_, body) => {
    expect(firstTopLevelSideEffect(file(body))).toBeNull()
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
    ['declare(strict_types=1);', false],
    ['#####declare(strict_types=1);', false],
    ['\n<?php\ndeclare(strict_types=1);', false],
    ['<?php\ndeclare(strict_types=1)', false],
  ])('startsWithStrictTypes(%j) is %s', (content, expected) => {
    expect(startsWithStrictTypes(content)).toBe(expected)
  })
})
