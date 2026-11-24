import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {ejectHookFile, php, planEject} from '../../src/lib/eject.js'

describe('php', () => {
  it('writes JSON values as PHP literals, escaping quotes and backslashes', () => {
    expect(php({a: [1, true, null], b: String.raw`it's \ here`})).toBe("[\n    'a' => [\n        1,\n        true,\n        null,\n    ],\n    'b' => 'it\\'s \\\\ here',\n]")
    expect(php([])).toBe('[]')
    expect(php({})).toBe('[]')
  })

  it('never indents the lines of a multi-line string', () => {
    expect(php({content: 'a\n  b'}, 1)).toBe("[\n        'content' => 'a\n  b',\n    ]")
  })
})

describe('ejectHookFile', () => {
  const file = String.raw`<?php
declare(strict_types=1);

namespace Acme\Hooks;

use Loopress\Hooks\Attribute\Action;
use Loopress\Hooks\Attribute\{Cron, Filter};

final class Orders
{
    #[Action('save_post', priority: 5, acceptedArgs: 2)]
    public function saved(int $id, $post): void {}

    #[Filter("the_title", 20)]
    public function title(string $title): string { return $title; }

    #[Filter('excerpt_length', acceptedArgs: 0)]
    public static function length(): int { return 20; }

    #[Cron('daily')]
    public function cleanup(): void {}

    #[Action('init')]
    private function hidden(): void {}
}
`

  it('turns each public attribute into its binding and drops what no longer resolves', () => {
    const hook = ejectHookFile('shop/orders', file)

    expect(hook.className).toBe(String.raw`\Acme\Hooks\Orders`)
    expect(hook.bindings).toEqual([
      {acceptedArgs: 2, hook: 'save_post', kind: 'action', method: 'saved', priority: 5},
      {acceptedArgs: 1, hook: 'the_title', kind: 'filter', method: 'title', priority: 20},
      {acceptedArgs: 1, hook: 'excerpt_length', kind: 'filter', method: 'length', priority: 10},
      // HookLoader's default event name, so events already scheduled keep running.
      {acceptedArgs: 0, hook: 'loopress_hooks_cron_shop_orders_cleanup', kind: 'cron', method: 'cleanup', priority: 10, recurrence: 'daily'},
    ])
    expect(hook.content).not.toContain('Loopress')
    expect(hook.content).not.toContain('#[')
    expect(hook.content).toContain("namespace Acme\\Hooks;\n\ndefined('ABSPATH') || exit;\n")
    expect(hook.content).toContain('public function saved(int $id, $post): void {}')
  })

  it('refuses what it cannot turn into a plain call', () => {
    expect(() => ejectHookFile('a', "<?php\nclass A {\n#[Action(self::HOOK)]\npublic function a(): void {}\n}\n")).toThrow('not a plain string or integer')
    expect(() => ejectHookFile('a', "<?php\nclass A {\n#[Action('init')]\npublic function a(): void { new \\Loopress\\Mailer(); }\n}\n")).toThrow('Loopress classes')
    expect(() => ejectHookFile('a', '<?php\nclass A {}\nclass B {}\n')).toThrow('exactly one class')
    expect(() => ejectHookFile('a', '<?php\nclass A { public function a(): void {} }\n')).toThrow('no public')
  })
})

describe('planEject', () => {
  let dir: string
  const write = (path: string, content: string): void => {
    mkdirSync(dirname(join(dir, path)), {recursive: true})
    writeFileSync(join(dir, path), content)
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lps-eject-test-'))
  })

  afterEach(() => {
    rmSync(dir, {force: true, recursive: true})
  })

  it('generates one plugin with the native call of every runtime resource', async () => {
    write('cpt/book.json', JSON.stringify({public: true, supports: ['title']}))
    write('taxonomies/genre.json', JSON.stringify({hierarchical: true, object_type: ['book']}))
    write('meta/book.json', JSON.stringify({isbn: {single: true, type: 'string'}}))
    write('roles/librarian.json', JSON.stringify({capabilities: {read: true}, name: 'Librarian'}))
    write('patterns/hero.html', '<!--\ntitle: Hero\n-->\n<p>Hi</p>\n')
    write('pages/about.html', '<!--\ntitle: About\nfull-width: true\n-->\n<h1>About</h1>\n')
    write('theme/css/style.css', 'body{}')
    write('options/blogname.json', '{}')
    write('hooks/notify.php', "<?php\nclass Notify {\n#[Action('init')]\npublic function run(): void {}\n}\n")

    const plan = await planEject(dir, {}, 'my-site')
    expect(plan.unsupported).toEqual([])
    expect(plan.files.map((file) => file.path)).toEqual(['my-site.php', 'bootstrap.php', 'pages/about.html', 'hooks/notify.php'])
    expect(plan.files[0]?.content).toContain('Plugin Name: My Site')
    expect(plan.files[0]?.content).toContain("defined('LOOPRESS_PLUGIN_URL')")
    expect(plan.files[2]?.content).toBe('<h1>About</h1>\n')

    const bootstrap = plan.files[1]?.content ?? ''
    expect(bootstrap).toContain("register_taxonomy('genre', [\n        'book',\n    ], [\n        'hierarchical' => true,\n    ]);\n}, 8);")
    expect(bootstrap).toContain("register_post_type('book', [")
    expect(bootstrap).toContain("register_post_meta('book', 'isbn', [")
    expect(bootstrap).toContain("add_role('librarian', 'Librarian', [\n        'read' => true,\n    ]);")
    expect(bootstrap).toContain("register_block_pattern('loopress/hero', [\n        'title' => 'Hero',\n        'content' => '<p>Hi</p>\n',\n    ]);")
    expect(bootstrap).toContain("wp_enqueue_style('loopress-child-theme'")
    expect(bootstrap).toContain("'about' => [\n        'fullWidth' => true,\n        'hideTitle' => false,\n    ],")
    expect(bootstrap).toContain("add_action('init', $isolate([$hook1, 'run'], 'hooks/notify.php', false), 10, 1);")
    expect(bootstrap).not.toContain('wp_enqueue_block_style')
  })

  it('lists every resource it cannot eject yet, all at once', async () => {
    write('apps/shop/index.html', '')
    write('blocks/acme/card/block.json', '{}')
    write('hooks/broken.php', '<?php\n')
    write('apps/.gitkeep', '')

    const plan = await planEject(dir, {}, 'site')
    expect(plan.unsupported).toEqual([
      'apps (apps/)',
      'dynamic blocks (blocks/)',
      'hooks/broken.php: expected exactly one class declaration, found 0',
    ])
  })

  it('ships API routes, lib/ and Composer libraries', async () => {
    write(
      'api/orders/[id].php',
      "<?php\nnamespace Acme;\nuse Loopress\\Api\\Attribute\\Permission;\n#[Permission(public: true)]\nfinal class Order\n{\n    public function get(): array { return []; }\n}\n",
    )
    write('api/index.php', '<?php\n')
    write('lib/Mailer.php', '<?php\nnamespace LoopressLib;\nfinal class Mailer {}\n')
    write('composer.json', JSON.stringify({repositories: [{type: 'vcs', url: 'https://example.com/m.git'}], require: {'monolog/monolog': '^3', php: '>=8.1', 'wpackagist-plugin/akismet': '*'}}))

    const plan = await planEject(dir, {api: {namespace: 'acme/v2'}}, 'site')
    expect(plan.unsupported).toEqual([])
    expect(plan.files.map((file) => file.path).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'api/orders/[id].php',
      'bootstrap.php',
      'composer.json',
      'lib/Mailer.php',
      'runtime/api-attributes.php',
      'site.php',
    ])
    expect(plan.notes).toHaveLength(1)
    const bootstrap = plan.files.find((file) => file.path === 'bootstrap.php')?.content ?? ''
    expect(bootstrap).toContain(String.raw`['orders/[id].php', '/orders/(?P<id>[^/]+)', \Acme\Order::class],`)
    expect(bootstrap).toContain("register_rest_route('acme/v2', $route, $endpoints);")
    expect(bootstrap).toContain("require_once __DIR__ . '/vendor/autoload.php';")
    expect(bootstrap).toContain(String.raw`$prefix = 'LoopressLib\\';`)
    expect(plan.files.find((file) => file.path === 'composer.json')?.content).toContain('monolog/monolog')
    expect(plan.files.find((file) => file.path === 'composer.json')?.content).not.toContain('akismet')
    expect(plan.files.find((file) => file.path === 'composer.json')?.content).toContain('https://example.com/m.git')
  })

  it('reads the namespace of a braced namespace block', async () => {
    write('api/braced.php', '<?php\nnamespace Acme {\nclass Braced { public function get() {} }\n}\n')
    const plan = await planEject(dir, {}, 'site')
    expect(plan.files.find((file) => file.path === 'bootstrap.php')?.content).toContain(String.raw`\Acme\Braced::class`)
  })

  it('refuses a route file with two classes, and two files for one route', async () => {
    write('api/a.php', '<?php\nclass A {}\nclass B {}\n')
    write('api/orders.php', '<?php\nclass O1 {}\n')
    write('api/orders/index.php', '<?php\nclass O2 {}\n')
    const plan = await planEject(dir, {}, 'site')
    expect(plan.unsupported).toEqual(['api/a.php: expected exactly one class declaration, found 2', 'api/orders/index.php: same route as api/orders.php'])
  })

  it('follows the directories loopress.json sets', async () => {
    write('wp/types/book.json', '{}')

    const plan = await planEject(dir, {cptDir: 'types', rootDir: 'wp'}, 'site')
    expect(plan.files[1]?.content).toContain("register_post_type('book', [])")
  })
})
