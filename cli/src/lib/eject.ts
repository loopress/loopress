/* eslint-disable unicorn/no-incorrect-template-string-interpolation -- this file writes PHP: `{$name}` is PHP string interpolation, not a mistyped `${name}` */
import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

import {localApiNamespace} from '../utils/api-namespace.js'
import {COMPOSER_JSON} from '../utils/composer.js'
import {
  CPT_SPEC,
  type DeclaredArgs,
  type DeclaredTypeSpec,
  fileExtension,
  META_SPEC,
  parseDeclaredFile,
  PATTERN_SPEC,
  ROLE_SPEC,
  TAXONOMY_SPEC,
} from '../utils/declared-type-format.js'
import {type LoopressLocalConfig} from '../utils/loopress-config.js'
import {readLocalPages} from '../utils/page-format.js'
import {pluralize} from '../utils/pluralize.js'
import {resolveResourceDir, type ResourceDirKind} from '../utils/resource-dirs.js'
import {errorMessage, isRecord} from './narrow.js'
import {walkFiles} from './readdir-tolerant.js'

// `lps eject`: turns the repo (never the site, rule 1 and 3) into one ordinary WordPress plugin
// that does what the Loopress plugin does at runtime for this project, in plain WordPress calls.
// Pure: reads the project, returns the files to write, writes nothing.

export type EjectFile = {content: string; path: string}

export type EjectPlan = {
  files: EjectFile[]
  // What the plugin takes over, one line per resource kind, for the summary and --dry-run.
  generated: string[]
  // What to do by hand before the plugin is zipped and installed.
  notes: string[]
  slug: string
  // Resources this version cannot eject: the command refuses with this list, never a partial eject.
  unsupported: string[]
}

// The child theme `lps theme template push` writes is `<parent>-loopress` (ChildThemeController::SUFFIX).
const CHILD_THEME_SUFFIX = '-loopress'
// PatternService::NAMESPACE: kept so `<!-- wp:pattern {"slug":"loopress/<slug>"} /-->` still resolves.
const PATTERN_NAMESPACE = 'loopress/'

type HookBinding = {
  acceptedArgs: number
  hook: string
  kind: 'action' | 'cron' | 'filter'
  method: string
  priority: number
  recurrence?: string
}

type EjectedHook = {bindings: HookBinding[]; className: string; content: string; slug: string}

type Context = {config: LoopressLocalConfig; cwd: string; root: string; unsupported: string[]}

export async function planEject(cwd: string, config: LoopressLocalConfig, slug: string): Promise<EjectPlan> {
  const root = join(cwd, typeof config.rootDir === 'string' ? config.rootDir : '.')
  const ctx: Context = {config, cwd, root, unsupported: []}

  await refuseUnsupported(ctx)

  const taxonomies = await readDeclared(ctx, TAXONOMY_SPEC)
  const postTypes = await readDeclared(ctx, CPT_SPEC)
  const postMeta = await readDeclared(ctx, META_SPEC)
  const patterns = await readDeclared(ctx, PATTERN_SPEC)
  const roles = await readDeclared(ctx, ROLE_SPEC)
  const hooks = await readHooks(ctx)
  const pages = await readPages(ctx)
  const api = await readApi(ctx)
  const lib = await readLib(ctx)
  const composer = await readComposer(ctx)
  const css = (await hasFiles(dir(ctx, 'css'))) || (await hasFiles(dir(ctx, 'blockCss')))
  const blockCss = await hasFiles(dir(ctx, 'blockCss'))

  const sections: string[] = []
  const generated: string[] = []
  const files: EjectFile[] = []

  if (taxonomies.length > 0) {
    generated.push(`${pluralize(taxonomies.length, 'taxonomy', 'taxonomies')}: register_taxonomy()`)
    sections.push(taxonomySection(taxonomies))
  }

  if (postTypes.length > 0) {
    generated.push(`${pluralize(postTypes.length, 'post type')}: register_post_type()`)
    sections.push(
      initSection('Post types (cpt/), at priority 9 like Loopress, so plugins caching them during init see them.', 9, postTypes.map(
        ({args, slug: type}) => `register_post_type(${php(type)}, ${php(args, 1)});`,
      )),
    )
  }

  if (postMeta.length > 0) {
    const lines = postMeta.flatMap(({args, slug: type}) =>
      Object.entries(args).map(([key, meta]) => `register_post_meta(${php(type)}, ${php(key)}, ${php(meta, 1)});`),
    )
    generated.push(`${pluralize(lines.length, 'post meta key')}: register_post_meta()`)
    sections.push(initSection('Post meta (meta/), after the post types so their post type exists.', 21, lines))
  }

  if (patterns.length > 0) {
    generated.push(`${pluralize(patterns.length, 'block pattern')}: register_block_pattern()`)
    sections.push(
      initSection('Block patterns (patterns/), same "loopress/" names so existing pattern blocks keep resolving.', 20, patterns.map(
        ({args, slug: pattern}) => `register_block_pattern(${php(PATTERN_NAMESPACE + pattern)}, ${php(args, 1)});`,
      )),
    )
  }

  if (roles.length > 0) {
    generated.push(`${pluralize(roles.length, 'role')}: add_role()`)
    sections.push(
      initSection(
        'Roles (roles/). add_role() saves a role once and never changes an existing one: to change its capabilities later, remove_role() it first.',
        10,
        roles.map(({args, slug: role}) => `add_role(${php(role)}, ${php(typeof args.name === 'string' ? args.name : role)}, ${php(args.capabilities ?? {}, 1)});`),
      ),
    )
  }

  if (css) {
    generated.push('theme CSS: the child theme stylesheet enqueue')
    sections.push(cssSection(blockCss))
  }

  if (pages.length > 0) {
    generated.push(`${pluralize(pages.length, 'static page')}: the_content filter`)
    sections.push(pagesSection(pages))
    for (const page of pages) files.push({content: page.html, path: `pages/${page.slug}.html`})
  }

  if (hooks.length > 0) {
    const bindings = hooks.reduce((total, hook) => total + hook.bindings.length, 0)
    generated.push(`${pluralize(hooks.length, 'hook file')} (${pluralize(bindings, 'binding')}): add_action(), add_filter(), wp_schedule_event()`)
    sections.push(hooksSection(hooks))
    for (const hook of hooks) files.push({content: hook.content, path: `hooks/${hook.slug}.php`})
  }

  const notes: string[] = []
  shipCode(ctx, {api, composer, lib}, {files, generated, notes, sections})

  files.unshift({content: mainFile(slug), path: `${slug}.php`}, {content: bootstrapFile(sections), path: 'bootstrap.php'})

  return {files, generated, notes, slug, unsupported: ctx.unsupported}
}

type Shipped = {api: EjectedRoute[]; composer: Awaited<ReturnType<typeof readComposer>>; lib: EjectFile[]}

// The code a project ships as files: Composer libraries, lib/ and API routes.
function shipCode(ctx: Context, {api, composer, lib}: Shipped, out: {files: EjectFile[]; generated: string[]; notes: string[]; sections: string[]}): void {
  if (composer) {
    out.generated.push(`${pluralize(composer.libraries.length, 'Composer library', 'Composer libraries')}: composer.json and vendor/autoload.php`)
    out.sections.unshift(composerSection())
    out.files.push(...composer.files)
    out.notes.push('Run `composer install --no-dev --optimize-autoloader` in the plugin folder before zipping it: vendor/ is not part of the repository.')
  }

  if (lib.length > 0) {
    out.generated.push(`${pluralize(lib.length, 'shared class file')} (lib/): a PSR-4 autoloader for LoopressLib\\`)
    out.sections.splice(composer ? 1 : 0, 0, libSection())
    for (const file of lib) out.files.push({content: file.content, path: `lib/${file.path}`})
  }

  if (api.length > 0) {
    out.generated.push(`${pluralize(api.length, 'API route file')} (api/): register_rest_route()`)
    out.sections.push(apiSection(api, localApiNamespace(ctx.config)))
    out.files.push({content: API_ATTRIBUTES_FILE, path: 'runtime/api-attributes.php'})
    for (const route of api) out.files.push({content: route.content, path: `api/${route.file}`})
  }
}

function dir(ctx: Context, kind: ResourceDirKind): string {
  return resolve(ctx.cwd, resolveResourceDir(kind, ctx.config))
}

async function hasFiles(path: string): Promise<boolean> {
  return (await walkFiles(path)).some((file) => file.split('/').every((part) => !part.startsWith('.')))
}

// Runtime pieces with no generator yet. Listed all at once, so one run shows everything left.
async function refuseUnsupported(ctx: Context): Promise<void> {
  const checks: Array<[string, string]> = [
    [dir(ctx, 'apps'), 'apps (apps/)'],
    [dir(ctx, 'block'), 'dynamic blocks (blocks/)'],
  ]
  for (const [path, label] of checks) {
    if (await hasFiles(path)) ctx.unsupported.push(label)
  }
}

// Libraries only: plugins and themes are already installed on the site, Composer is not what ships them.
const NOT_A_LIBRARY = /^(?:wpackagist-(?:plugin|theme)\/|php$|ext-|lib-)/u

async function readComposer(ctx: Context): Promise<undefined | {files: EjectFile[]; libraries: string[]}> {
  const path = join(ctx.cwd, 'composer.json')
  if (!existsSync(path)) return undefined
  try {
    const composer = COMPOSER_JSON.parse(JSON.parse(await readFile(path, 'utf8')))
    const libraries = Object.keys(composer.require ?? {}).filter((name) => !NOT_A_LIBRARY.test(name) && name.includes('/'))
    if (libraries.length === 0) return undefined
    const require = Object.fromEntries(libraries.map((name) => [name, composer.require?.[name]]))
    // Custom repositories stay: a library that lives only there would not resolve without them.
    const manifest = {config: {platform: {php: '8.1'}}, name: 'site/ejected', repositories: composer.repositories, require, type: 'wordpress-plugin'}
    const files: EjectFile[] = [{content: `${JSON.stringify(manifest, null, 4)}\n`, path: 'composer.json'}]
    return {files, libraries}
  } catch (error) {
    ctx.unsupported.push(`composer.json: ${errorMessage(error)}`)
    return undefined
  }
}

function composerSection(): string {
  return `// Composer libraries (composer.json). vendor/ is installed in the plugin folder before it is zipped.
if (is_file(__DIR__ . '/vendor/autoload.php')) {
    require_once __DIR__ . '/vendor/autoload.php';
} else {
    error_log('vendor/autoload.php is missing, run composer install in the plugin folder'); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
}`
}

// wp-content/loopress/lib/, autoloaded as LoopressLib\ (LoopressEnvironment): same prefix kept.
async function readLib(ctx: Context): Promise<EjectFile[]> {
  const path = join(ctx.root, 'lib')
  const files: EjectFile[] = []
  for (const file of (await walkFiles(path)).toSorted((a, b) => a.localeCompare(b))) {
    if (file === 'index.php' || !file.endsWith('.php') || file.split('/').some((part) => part.startsWith('.'))) continue
    const raw = await readFile(join(path, file), 'utf8')
    files.push({content: withAbspathGuard(raw), path: file})
  }

  return files
}

function libSection(): string {
  return String.raw`// Shared classes (lib/), the LoopressLib\\ namespace the route and hook files already use.
spl_autoload_register(static function (string $class): void {
    $prefix = 'LoopressLib\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }
    $file = __DIR__ . '/lib/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) {
        require_once $file;
    }
});`
}

type EjectedRoute = {className: string; content: string; file: string; route: string}

// Same rule as ApiDirectory::routeSlug() and RouteLoader::segmentToRegex(): a trailing "index"
// names its folder, a "[id]" segment becomes a named capture group.
function routeFor(slug: string): string {
  return `/${slug
    .replace(/\/index$/u, '')
    .split('/')
    .map((segment) => {
      const dynamic = /^\[([A-Za-z_]\w*)\]$/u.exec(segment)
      return dynamic ? `(?P<${dynamic[1]}>[^/]+)` : segment.replaceAll(/[$()*+.?[\\\]^{|}-]/gu, String.raw`\$&`)
    })
    .join('/')}`
}

async function readApi(ctx: Context): Promise<EjectedRoute[]> {
  const path = dir(ctx, 'api')
  const routes: EjectedRoute[] = []
  const seen = new Map<string, string>()
  const names = (await walkFiles(path)).filter((name) => name.endsWith('.php') && name !== 'index.php' && name.split('/').every((part) => !part.startsWith('.')))
  for (const file of names.toSorted((a, b) => a.localeCompare(b))) {
    try {
      const raw = await readFile(join(path, file), 'utf8')
      const lines = raw.split('\n').map((line) => line.trim())
      const classes = lines.map((line) => CLASS_LINE.exec(line)?.[1]).filter((name) => name !== undefined)
      if (classes.length !== 1) throw new Error(`expected exactly one class declaration, found ${classes.length}`)
      const namespace = lines.map((line) => NAMESPACE_LINE.exec(line)?.[1]).find((name) => name !== undefined)
      const slug = file.slice(0, -'.php'.length)
      const route = routeFor(slug)
      const other = seen.get(route)
      if (other !== undefined) throw new Error(`same route as api/${other}`)
      seen.set(route, file)
      routes.push({className: namespace === undefined ? `\\${classes[0]}` : `\\${namespace}\\${classes[0]}`, content: withAbspathGuard(raw), file, route})
    } catch (error) {
      ctx.unsupported.push(`api/${file}: ${errorMessage(error)}`)
    }
  }

  return routes
}

// The attributes route files import, declared here since the Loopress plugin is not there to
// declare them (this file only loads while Loopress is inactive).
const API_ATTRIBUTES_FILE = String.raw`<?php

declare(strict_types=1);

namespace Loopress\Api\Attribute;

defined('ABSPATH') || exit;

#[\Attribute(\Attribute::TARGET_CLASS)]
final class Hidden
{
}

#[\Attribute(\Attribute::TARGET_CLASS | \Attribute::TARGET_METHOD)]
final class Permission
{
    /** @param string|array{0: class-string, 1: string}|null $callback */
    public function __construct(
        public readonly bool $public = false, // phpcs:ignore Universal.NamingConventions.NoReservedKeywordParameterNames.publicFound
        public readonly ?string $capability = null,
        public readonly string|array|null $callback = null,
    ) {
        if (($this->public ? 1 : 0) + ($this->capability !== null ? 1 : 0) + ($this->callback !== null ? 1 : 0) > 1) {
            throw new \InvalidArgumentException('#[Permission] accepts only one of public, capability, or callback.');
        }
    }
}
`

function apiSection(routes: EjectedRoute[], namespace: string): string {
  const table = routes.map(({className, file, route}) => `    [${php(file)}, ${php(route)}, ${className}::class],`).join('\n')
  return String.raw`// API routes (api/): one REST route per file under ${namespace}, one endpoint per public
// get/post/put/patch/delete method. Permission: #[Permission] on the method, on the class, the file's
// permission(), else manage_options. A throwing callback answers 500 (permission: denies), never a fatal.
require_once __DIR__ . '/runtime/api-attributes.php';

add_action('rest_api_init', static function (): void {
    $log = static function (string $message): void {
        error_log('api: ' . $message); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
    };
    $guard = static function (object|string $target, string $method) use ($log): callable {
        return static function (\WP_REST_Request $request) use ($target, $method, $log): bool {
            $callback = [$target, $method];
            if (!is_callable($callback)) {
                return false;
            }
            try {
                $result = call_user_func($callback, $request);
            } catch (\Throwable $e) {
                $log("{$method}() threw: " . $e->getMessage());
                return false;
            }
            return $result === true;
        };
    };
    $files = [
${table}
    ];
    $verbs = ['get' => 'GET', 'post' => 'POST', 'put' => 'PUT', 'patch' => 'PATCH', 'delete' => 'DELETE'];

    foreach ($files as [$file, $route, $class]) {
        try {
            require_once __DIR__ . '/api/' . $file;
            $instance = new $class();
            $reflection = new \ReflectionClass($instance);
            $hidden = $reflection->getAttributes(\Loopress\Api\Attribute\Hidden::class) !== [];
            $endpoints = [];
            foreach ($verbs as $method => $httpMethod) {
                if (!method_exists($instance, $method) || !(new \ReflectionMethod($instance, $method))->isPublic()) {
                    continue;
                }
                $attributes = (new \ReflectionMethod($instance, $method))->getAttributes(\Loopress\Api\Attribute\Permission::class)
                    ?: $reflection->getAttributes(\Loopress\Api\Attribute\Permission::class);
                $permission = $attributes === [] ? null : $attributes[0]->newInstance();
                if ($permission === null) {
                    $check = method_exists($instance, 'permission') && (new \ReflectionMethod($instance, 'permission'))->isPublic()
                        ? $guard($instance, 'permission')
                        : static fn (): bool => current_user_can('manage_options');
                } elseif ($permission->public) {
                    $check = static fn (): bool => true;
                } elseif ($permission->callback !== null) {
                    $check = is_array($permission->callback) ? $guard($permission->callback[0], $permission->callback[1]) : $guard($instance, $permission->callback);
                } else {
                    $capability = $permission->capability ?? 'manage_options';
                    $check = static fn (): bool => current_user_can($capability);
                }
                $endpoint = [
                    'methods'             => $httpMethod,
                    'callback'            => static function (\WP_REST_Request $request) use ($instance, $method, $log): mixed {
                        try {
                            return $instance->$method($request);
                        } catch (\Throwable $e) {
                            $log("{$method}() threw: " . $e->getMessage());
                            return new \WP_REST_Response(['error' => 'Internal error'], 500);
                        }
                    },
                    'permission_callback' => $check,
                ];
                if ($hidden) {
                    $endpoint['show_in_index'] = false;
                }
                if (method_exists($instance, 'headers')) {
                    $endpoint['loopress_instance'] = $instance;
                }
                $endpoints[] = $endpoint;
            }
            if ($endpoints === []) {
                $log("{$file}: no public get/post/put/patch/delete method");
                continue;
            }
            register_rest_route(${php(namespace)}, $route, $endpoints);
        } catch (\Throwable $e) {
            $log("{$file}: failed to load: " . $e->getMessage());
        }
    }

    // The files' headers(), CORS and the like, applied once per request they match.
    add_filter('rest_pre_serve_request', static function (bool $served, mixed $result, \WP_REST_Request $request) use ($log): bool {
        $instance = $request->get_attributes()['loopress_instance'] ?? null;
        if (!is_object($instance)) {
            return $served;
        }
        try {
            $headers = $instance->headers();
        } catch (\Throwable $e) {
            $log('headers() threw: ' . $e->getMessage());
            return $served;
        }
        foreach (is_array($headers) ? $headers : [] as $name => $value) {
            if (is_string($name) && is_string($value)) {
                header("{$name}: {$value}"); // phpcs:ignore WordPress.Security.SafeRedirect -- not a redirect
            }
        }
        return $served;
    }, 10, 3);
});`
}

async function readDeclared(ctx: Context, spec: DeclaredTypeSpec): Promise<Array<{args: DeclaredArgs; slug: string}>> {
  const path = dir(ctx, spec.dirKind)
  const extension = fileExtension(spec)
  const items: Array<{args: DeclaredArgs; slug: string}> = []
  const names = (await walkFiles(path)).filter((name) => !name.includes('/') && name.endsWith(extension))
  for (const file of names.toSorted((a, b) => a.localeCompare(b))) {
    try {
      const raw = await readFile(join(path, file), 'utf8')
      items.push(parseDeclaredFile(spec, join(path, file), raw))
    } catch (error) {
      ctx.unsupported.push(`${spec.dir}/${file}: ${errorMessage(error)}`)
    }
  }

  return items
}

async function readPages(ctx: Context): Promise<Array<{fullWidth: boolean; hideTitle: boolean; html: string; slug: string}>> {
  const {pages, problems} = await readLocalPages(dir(ctx, 'page'))
  for (const problem of problems) ctx.unsupported.push(`pages/${problem.file}: ${problem.message}`)
  return pages.toSorted((a, b) => a.slug.localeCompare(b.slug))
}

async function readHooks(ctx: Context): Promise<EjectedHook[]> {
  const path = dir(ctx, 'hooks')
  const hooks: EjectedHook[] = []
  const names = (await walkFiles(path)).filter((name) => name.endsWith('.php'))
  for (const file of names.toSorted((a, b) => a.localeCompare(b))) {
    try {
      const raw = await readFile(join(path, file), 'utf8')
      hooks.push(ejectHookFile(file.slice(0, -'.php'.length), raw))
    } catch (error) {
      ctx.unsupported.push(`hooks/${file}: ${errorMessage(error)}`)
    }
  }

  return hooks
}

const ATTRIBUTE_LINE = /^#\[(?:\\?Loopress\\Hooks\\Attribute\\)?(Action|Cron|Filter)\((.*)\)\]$/u
const METHOD_LINE = /^((?:(?:final|private|protected|public|static) )*)function &?(\w+)/u
const KINDS = new Map<string, HookBinding['kind']>([
  ['Action', 'action'],
  ['Cron', 'cron'],
  ['Filter', 'filter'],
])
const CLASS_LINE = /^(?:(?:abstract|final|readonly) )*class (\w+)/u
const NAMESPACE_LINE = /^namespace ([\w\\]+)\s*[;{]/u

// One hook file: its class, its #[Action]/#[Filter]/#[Cron] methods (what HookLoader binds), and
// the file as written minus the Loopress `use` lines and attributes, which no longer resolve.
// Line based: each attribute on its own line, the way the docs and `lps hook pull` write them.
export function ejectHookFile(slug: string, raw: string): EjectedHook {
  const kept: string[] = []
  let pending: Array<{args: string; kind: HookBinding['kind']}> = []
  const bindings: HookBinding[] = []

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    const attribute = ATTRIBUTE_LINE.exec(trimmed)
    const kind = attribute ? KINDS.get(attribute[1] ?? '') : undefined
    if (kind) {
      pending.push({args: attribute?.[2] ?? '', kind})
    } else if (!/^use \\?Loopress\\/u.test(trimmed)) {
      kept.push(line)
      const method = METHOD_LINE.exec(trimmed)
      if (method && pending.length > 0) {
        bindings.push(...bindMethod(pending, method[1] ?? '', method[2] ?? '', slug))
        pending = []
      }
    }
  }

  const content = kept.join('\n')
  const classes = kept.map((line) => CLASS_LINE.exec(line.trim())?.[1]).filter((name) => name !== undefined)
  if (classes.length !== 1) throw new Error(`expected exactly one class declaration, found ${classes.length}`)
  if (bindings.length === 0) throw new Error('no public #[Action], #[Filter], or #[Cron] method found, each attribute on its own line')
  if (/#\[\s*(?:Action|Cron|Filter)\b/u.test(content)) throw new Error('put each #[Action], #[Filter] and #[Cron] attribute on its own line')
  if (/\bLoopress\\/u.test(content)) throw new Error('uses Loopress classes other than the hook attributes')

  const namespace = kept.map((line) => NAMESPACE_LINE.exec(line.trim())?.[1]).find((name) => name !== undefined)
  const className = namespace === undefined ? `\\${classes[0]}` : `\\${namespace}\\${classes[0]}`
  return {bindings, className, content: withAbspathGuard(content), slug}
}

// HookLoader binds public methods only, and the first attribute of each kind per method.
function bindMethod(pending: Array<{args: string; kind: HookBinding['kind']}>, modifiers: string, method: string, slug: string): HookBinding[] {
  if (/\b(?:private|protected)\b/u.test(modifiers)) return []
  const first = pending.filter(({kind}, index) => pending.findIndex((other) => other.kind === kind) === index)
  return first.map(({args, kind}) => toBinding(kind, method, parseAttributeArgs(args), slug))
}

// What `lps hook push` adds on the site: the file is never run when requested over HTTP.
function withAbspathGuard(content: string): string {
  const lines = content.replaceAll(/\n{3,}/gu, '\n\n').split('\n')
  if (lines.some((line) => line.includes("defined('ABSPATH')"))) return lines.join('\n')
  // After the namespace, PHP's first statement, else after the declare, else after the opening tag.
  const after = ['namespace ', 'declare(', '<?php'].map((start) => lines.findIndex((line) => line.trimStart().startsWith(start)))
  const at = after.find((index) => index !== -1)
  if (at === undefined) return lines.join('\n')
  const spacer = lines[at + 1]?.trim() === '' ? [] : ['']
  lines.splice(at + 1, 0, '', "defined('ABSPATH') || exit;", ...spacer)
  return lines.join('\n')
}

const ARG_NAMES = {action: ['hook', 'priority', 'acceptedArgs'], cron: ['recurrence', 'hook'], filter: ['hook', 'priority', 'acceptedArgs']}
const ARG = /^(?:(\w+)\s*:\s*)?('[^'\\]*'|"[^"$\\]*"|-?\d+)$/u

// Splits on the commas outside quotes: attribute arguments here are plain strings and integers.
function splitArgs(source: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote = ''
  for (const char of source) {
    if (quote === '' && char === ',') {
      parts.push(current)
      current = ''
      continue
    }

    if (quote === '' && (char === "'" || char === '"')) quote = char
    else if (char === quote) quote = ''
    current += char
  }

  if (current.trim() !== '') parts.push(current)
  return parts
}

function parseAttributeArgs(source: string): Array<{name?: string; value: number | string}> {
  return splitArgs(source).map((part) => {
    const arg = ARG.exec(part.trim())
    const literal = arg?.[2]
    if (!literal) throw new Error(`attribute argument "${part.trim()}" is not a plain string or integer`)
    const value = /^-?\d/u.test(literal) ? Number(literal) : literal.slice(1, -1)
    return arg[1] ? {name: arg[1], value} : {value}
  })
}

function toBinding(kind: HookBinding['kind'], method: string, args: ReturnType<typeof parseAttributeArgs>, slug: string): HookBinding {
  const names = ARG_NAMES[kind]
  const values: Record<string, number | string> = {}
  for (const [index, arg] of args.entries()) {
    const name = arg.name ?? names[index]
    if (!name || !names.includes(name)) throw new Error(`#[${kind}] on ${method}(): unknown argument "${arg.name ?? index}"`)
    values[name] = arg.value
  }

  const str = (key: string): string | undefined => (typeof values[key] === 'string' ? values[key] : undefined)
  if (kind === 'cron') {
    const recurrence = str('recurrence')
    if (!recurrence) throw new Error(`#[Cron] on ${method}(): no recurrence`)
    // HookLoader's default event name, kept so the events already scheduled on the site still match.
    const hook = str('hook') ?? `loopress_hooks_cron_${slug.replaceAll('/', '_')}_${method}`
    return {acceptedArgs: 0, hook, kind, method, priority: 10, recurrence}
  }

  const hook = str('hook')
  if (!hook) throw new Error(`#[${kind === 'action' ? 'Action' : 'Filter'}] on ${method}(): no hook name`)
  const int = (key: string, fallback: number): number => (typeof values[key] === 'number' ? values[key] : fallback)
  const acceptedArgs = int('acceptedArgs', 1)
  return {acceptedArgs: kind === 'filter' ? Math.max(acceptedArgs, 1) : acceptedArgs, hook, kind, method, priority: int('priority', 10)}
}

function phpEntries(value: unknown, depth: number): string[] {
  if (Array.isArray(value)) return value.map((item) => php(item, depth + 1))
  if (isRecord(value)) return Object.entries(value).map(([key, item]) => `${php(key)} => ${php(item, depth + 1)}`)
  return []
}

// A JSON value as a PHP literal, short arrays, indented from `depth`. Strings are never re-indented.
export function php(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    const escaped = value.replaceAll('\\', '\\\\').replaceAll("'", String.raw`\'`)
    return `'${escaped}'`
  }

  const entries = phpEntries(value, depth)
  if (entries.length === 0) return '[]'
  const inner = ' '.repeat(4 * depth + 4)
  const body = entries.map((entry) => `${inner}${entry},`).join('\n')
  return `[\n${body}\n${' '.repeat(4 * depth)}]`
}

function initSection(comment: string, priority: number, lines: string[]): string {
  const body = lines.map((line) => `    ${line}`).join('\n\n')
  return `// ${comment}\nadd_action('init', static function (): void {\n${body}\n}, ${priority});`
}

function taxonomySection(taxonomies: Array<{args: DeclaredArgs; slug: string}>): string {
  const lines = taxonomies.map(({args, slug}) => {
    const {object_type: objectType, ...rest} = args
    return `register_taxonomy(${php(slug)}, ${php(Array.isArray(objectType) ? objectType : [], 1)}, ${php(rest, 1)});`
  })
  return initSection('Taxonomies (taxonomies/), at priority 8, before the post types, as WordPress recommends.', 8, lines)
}

function cssSection(blockCss: boolean): string {
  const block = blockCss
    ? `

// One stylesheet per theme/blocks/<namespace>/<block>.css, printed only on pages using that block.
add_action('init', static function () use ($isLoopressChild): void {
    if (!$isLoopressChild()) {
        return;
    }
    foreach (glob(get_stylesheet_directory() . '/blocks/*/*.css') ?: [] as $path) {
        $name = basename(dirname($path)) . '/' . basename($path, '.css');
        wp_enqueue_block_style($name, [
            'handle' => 'loopress-block-' . str_replace('/', '-', $name),
            'src'    => get_stylesheet_directory_uri() . "/blocks/{$name}.css",
            'path'   => $path,
            'ver'    => (string) filemtime($path),
        ]);
    }
});`
    : ''

  return `// Theme CSS (theme/css/): already bundled into the child theme's style.css, which WordPress never
// enqueues by itself. Same handle as before, so the page HTML does not change.
$isLoopressChild = static fn (): bool => str_ends_with(get_stylesheet(), ${php(CHILD_THEME_SUFFIX)}) && get_template() !== get_stylesheet();

add_action('wp_enqueue_scripts', static function () use ($isLoopressChild): void {
    $path = get_stylesheet_directory() . '/style.css';
    if (!$isLoopressChild() || !is_file($path)) {
        return;
    }
    wp_enqueue_style('loopress-child-theme', get_stylesheet_uri(), [], (string) filemtime($path));
    wp_style_add_data('loopress-child-theme', 'path', $path);
});

add_action('after_setup_theme', static function () use ($isLoopressChild): void {
    if ($isLoopressChild()) {
        add_editor_style('style.css');
    }
});${block}`
}

function pagesSection(pages: Array<{fullWidth: boolean; hideTitle: boolean; slug: string}>): string {
  const list = php(Object.fromEntries(pages.map((page) => [page.slug, {fullWidth: page.fullWidth, hideTitle: page.hideTitle}])))
  return `// Static pages (pages/): each page's body is pages/<slug>.html, rendered in place of its empty
// post_content, by page slug. post_content is never written, the pages stay locked to these files.
$pages = ${list};

// The file of a page this plugin renders, or null.
$pageFile = static function (int $postId) use ($pages): ?string {
    if ($postId <= 0 || get_post_type($postId) !== 'page') {
        return null;
    }
    $slug = (string) get_post_field('post_name', $postId);

    return isset($pages[$slug]) ? __DIR__ . "/pages/{$slug}.html" : null;
};

// How many the_content runs are in progress: a nested run for the same page (a shortcode calling
// the_content on its inner text) gets its own content back, not the page again.
$contentDepth = static function (): int {
    global $wp_current_filter;

    return count(array_keys(is_array($wp_current_filter) ? $wp_current_filter : [], 'the_content', true));
};
$renderingAt   = [];
$autopPriority = null;

// Priority 0: before do_blocks, wpautop and do_shortcode, so the HTML still gets shortcodes.
// wpautop is unhooked for that page only, and put back at the end of the same run.
add_filter('the_content', static function (mixed $content) use ($pageFile, $contentDepth, &$renderingAt, &$autopPriority): mixed {
    $postId = (int) get_the_ID();
    $file   = $pageFile($postId);
    if ($file === null || !is_string($content) || trim($content) !== '' || !is_file($file)) {
        return $content;
    }
    $depth = $contentDepth();
    if (isset($renderingAt[$postId]) && $depth > $renderingAt[$postId]) {
        return $content;
    }
    $renderingAt[$postId] = $depth;
    $priority = has_filter('the_content', 'wpautop');
    if (is_int($priority)) {
        remove_filter('the_content', 'wpautop', $priority);
        $autopPriority = $priority;
    }

    return (string) file_get_contents($file);
}, 0);

add_filter('the_content', static function (mixed $content) use ($contentDepth, &$renderingAt, &$autopPriority): mixed {
    $depth       = $contentDepth();
    $renderingAt = array_filter($renderingAt, static fn (int $at): bool => $at < $depth);
    if ($autopPriority !== null) {
        add_filter('the_content', 'wpautop', $autopPriority);
        $autopPriority = null;
    }

    return $content;
}, PHP_INT_MAX);

// No editor for these pages, the file is the source. Previews stay allowed, trashing too.
add_filter('map_meta_cap', static function (array $caps, string $cap, int $userId, array $args) use ($pageFile): array {
    if (($cap === 'edit_post' || $cap === 'edit_page') && $pageFile((int) ($args[0] ?? 0)) !== null && !is_preview() && !get_query_var('preview')) {
        return ['do_not_allow'];
    }

    return $caps;
}, 10, 4);

// The full-width and hide-title headers.
add_action('wp_head', static function () use ($pages, $pageFile): void {
    $postId = get_queried_object_id();
    if (!is_page() || $pageFile($postId) === null) {
        return;
    }
    $page     = $pages[(string) get_post_field('post_name', $postId)];
    $selector = sprintf('body.page-id-%d', $postId);
    $rules    = [];
    if ($page['fullWidth']) {
        $rules[] = "{$selector} .wp-block-post-content { --wp--style--global--content-size: none; --wp--style--global--wide-size: none; "
            . '--wp--style--root--padding-left: 0px; --wp--style--root--padding-right: 0px; }';
        $rules[] = "{$selector} .has-global-padding:has(.wp-block-post-content):not(:has(.wp-block-template-part)) { "
            . '--wp--style--root--padding-left: 0px; --wp--style--root--padding-right: 0px; }';
    }
    if ($page['hideTitle']) {
        $rules[] = "{$selector} .wp-block-post-title { display: none; }";
    }
    if ($rules !== []) {
        echo '<style id="loopress-page-styles">' . implode(' ', $rules) . '</style>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }
});`
}

function hooksSection(hooks: EjectedHook[]): string {
  const blocks = hooks.map((hook, index) => {
    const variable = `$hook${index + 1}`
    const file = `hooks/${hook.slug}.php`
    const lines = [`// ${file}`, `require_once __DIR__ . ${php('/' + file)};`, `${variable} = new ${hook.className}();`]
    for (const binding of hook.bindings) {
      const callback = `$isolate([${variable}, ${php(binding.method)}], ${php(file)}, ${binding.kind === 'filter' ? 'true' : 'false'})`
      if (binding.kind === 'cron') {
        lines.push(
          `add_action(${php(binding.hook)}, ${callback});`,
          `if (wp_next_scheduled(${php(binding.hook)}) === false) {`,
          `    wp_schedule_event(time(), ${php(binding.recurrence)}, ${php(binding.hook)});`,
          '}',
        )
      } else {
        lines.push(`add_${binding.kind}(${php(binding.hook)}, ${callback}, ${binding.priority}, ${binding.acceptedArgs});`)
      }
    }

    return lines.join('\n')
  })

  const isolate = String.raw`$isolate = static fn (callable $callback, string $file, bool $isFilter): \Closure => static function (mixed ...$args) use ($callback, $file, $isFilter): mixed {
    try {
        return $callback(...$args);
    } catch (\Throwable $e) {
        error_log("{$file}: " . $e->getMessage()); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
        return $isFilter ? ($args[0] ?? null) : null;
    }
};`

  return `// Hooks (hooks/): the classes as written, each #[Action], #[Filter] and #[Cron] as the WordPress
// call it stood for. One callback throwing is logged and skipped, it never takes the page down,
// and a filter then returns its value unchanged.
${isolate}

${blocks.join('\n\n')}`
}

function bootstrapFile(sections: string[]): string {
  return `<?php
/**
 * Everything this site needs, in plain WordPress calls. Generated by \`lps eject\` from the
 * project repository: edit it freely, it is yours now.
 */

declare(strict_types=1);

defined('ABSPATH') || exit;

${sections.join('\n\n')}
`
}

function mainFile(slug: string): string {
  const name = slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  return `<?php
/**
 * Plugin Name: ${name}
 * Description: The code and configuration of this site, as a standard WordPress plugin.
 * Version: 1.0.0
 * Requires PHP: 8.1
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 */

declare(strict_types=1);

defined('ABSPATH') || exit;

// While the Loopress plugin is active it registers all of this itself: this plugin waits until
// Loopress is deactivated, so nothing is ever registered twice and the switch has no gap.
add_action('plugins_loaded', static function (): void {
    if (defined('LOOPRESS_PLUGIN_URL') || defined('LOOPRESS_VERSION')) {
        return;
    }
    require __DIR__ . '/bootstrap.php';
}, 0);
`
}
