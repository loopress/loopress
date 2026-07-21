#!/usr/bin/env node
// Assembles one edition of the plugin into a staging directory and zips it. Both editions
// are built from the same source tree; see README.md for the split. Flavor argument to
// product name: 'light' -> Loopress Light (loopress-light.zip), 'full' -> Loopress Full
// (loopress-full.zip).
//
// Usage: node scripts/build-flavor.cjs <light|full>
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

// Every path used below is built from `root` plus a literal string segment taken from
// this object, never from the CLI argument itself: the argument only ever selects which
// one of these two fixed configs to use (via the regex-validated lookup below), so there
// is no way for a "faulty" argument to make the script read or write outside these paths.
const FLAVORS = {
  light: {
    zipName: 'loopress-light',
    textDomain: 'loopress-light',
    readmeSource: 'flavors/light/readme.txt',
    frontendEntry: 'frontend/light/index.tsx',
    stripPlusBlock: true,
    // Full-only src/ subdirectories, absent from this edition's zip, not merely inactive.
    fullOnlySrcDirs: ['Dependencies', 'Update', 'Snippets'],
    includeUninstall: false,
    emptyComposerRequire: true,
  },
  full: {
    zipName: 'loopress-full',
    textDomain: 'loopress-full',
    readmeSource: 'readme.txt',
    frontendEntry: 'frontend/full/index.tsx',
    stripPlusBlock: false,
    fullOnlySrcDirs: [],
    includeUninstall: true,
    emptyComposerRequire: false,
  },
}

// Validated against a literal allowlist pattern (not just an object-key lookup) so that
// static analysis can see, right here, that flavorArg can only ever be "light" or "full"
// before it is used to build any path below.
const flavorArg = process.argv[2]
if (typeof flavorArg !== 'string' || !/^(light|full)$/.test(flavorArg)) {
  console.error('Usage: node scripts/build-flavor.cjs <light|full>')
  process.exit(1)
}
const flavor = FLAVORS[flavorArg]

const root = path.resolve(__dirname, '..')

// Resolve and bound-check stageDir against its parent directory, rather than trusting the
// join above: this is the pattern static analysis actually recognizes as clearing the
// taint on `flavorArg`, since a regex check on the source value alone isn't enough once
// it flows into a joined path (see the many `fs.*` calls below that read/write under
// stageDir).
const buildStageRoot = path.resolve(root, '.build-stage')
const stageDir = path.resolve(buildStageRoot, flavorArg)
if (stageDir !== buildStageRoot && !stageDir.startsWith(buildStageRoot + path.sep)) {
  console.error('Refusing to build outside the .build-stage directory')
  process.exit(1)
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: 'inherit' })
}

fs.rmSync(stageDir, { recursive: true, force: true })
fs.mkdirSync(stageDir, { recursive: true })

// 1. PHP source: src/Dependencies/ (Composer management), src/Update/ (update check), and
// src/Snippets/ (Code Snippets / WPCode sync) only ship in the full edition. Even in the
// light build, these directories must be absent from the artifact, not merely inactive:
// wordpress.org guidelines forbid the Composer feature outright, reserve update-checking
// for their own SVN-based flow, and rejected the snippet sync REST endpoints themselves as
// a remote arbitrary-code-deployment mechanism (see obsidian/Product/WordPress.org Plugin
// Distribution.md §2b in the monorepo), so Loopress Light must never carry any of the three,
// even dormant code.
const excludedSrcDirs = flavor.fullOnlySrcDirs.map((dir) => path.join(root, 'src', dir))
fs.cpSync(path.join(root, 'src'), path.join(stageDir, 'src'), {
  recursive: true,
  filter: (src) => !excludedSrcDirs.some((dir) => src === dir || src.startsWith(dir + path.sep)),
})

// 2. Entry file: strip or keep the marked Plus block, patch the header for the full edition.
const START = '/* LOOPRESS_PLUS_START */'
const END = '/* LOOPRESS_PLUS_END */'
let entry = fs.readFileSync(path.join(root, 'loopress.php'), 'utf8')
const blockPattern = new RegExp(`[ \\t]*${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}\\n?`, 'g')

if (flavor.stripPlusBlock) {
  entry = entry.replace(blockPattern, '')
} else {
  // Keep the code between the markers, drop only the marker comment lines themselves.
  entry = entry.replace(new RegExp(`[ \\t]*${escapeRegExp(START)}\\n`, 'g'), '')
  entry = entry.replace(new RegExp(`[ \\t]*${escapeRegExp(END)}\\n`, 'g'), '')
  entry = entry.replace('Plugin Name: Loopress Light', 'Plugin Name: Loopress Full')
  entry = entry.replace(
    ' * Description:',
    ' * Update URI: https://loopress.dev\n * Description:',
  )
}

// The source carries 'loopress', a placeholder left over from before the light/full split.
// Neither edition's real slug is 'loopress' anymore (see FLAVORS above), so every build must
// rewrite it to its own text domain, in the header and in translation calls alike, or the
// WordPress Plugin Check tool flags a text domain mismatch against the packaged zip.
entry = entry.replace('Text Domain: loopress', `Text Domain: ${flavor.textDomain}`)
entry = entry.replace("'loopress'", `'${flavor.textDomain}'`)

fs.writeFileSync(path.join(stageDir, 'loopress.php'), entry)

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 3. uninstall.php: full-edition only, it cleans up wp-content/loopress/ which only
// that edition ever creates.
if (flavor.includeUninstall) {
  fs.copyFileSync(path.join(root, 'uninstall.php'), path.join(stageDir, 'uninstall.php'))
}

// 4. readme.txt: each edition has its own. The root readme.txt describes the full
// edition, since development always targets that feature set by default;
// flavors/light/readme.txt holds the wordpress.org-only cut-down variant.
fs.copyFileSync(path.join(root, flavor.readmeSource), path.join(stageDir, 'readme.txt'))

// 5. composer.json + vendor/: light ships an empty require (autoloader only), full
// ships the real composer/composer dependency staged and installed fresh.
const rootComposerJson = JSON.parse(fs.readFileSync(path.join(root, 'composer.json'), 'utf8'))
const stageComposerJson = flavor.emptyComposerRequire
  ? { ...rootComposerJson, require: {} }
  : rootComposerJson
delete stageComposerJson['require-dev']
delete stageComposerJson.scripts
fs.writeFileSync(path.join(stageDir, 'composer.json'), JSON.stringify(stageComposerJson, null, 4))

// The full flavor ships the same composer.json as the repo root, so the root lock file
// is still valid for it: reusing it makes `composer install` reproducible (exact versions
// already tested by CI) instead of re-resolving from scratch on every build. The light
// flavor's require is forced to {}, which the root lock doesn't match, so it always
// resolves fresh (trivially, since there's nothing to resolve).
const rootComposerLock = path.join(root, 'composer.lock')
if (!flavor.emptyComposerRequire && fs.existsSync(rootComposerLock)) {
  fs.copyFileSync(rootComposerLock, path.join(stageDir, 'composer.lock'))
}
run('composer', ['install', '--no-dev', '--no-interaction', '--prefer-dist', '--optimize-autoloader'], stageDir)

// 6. Frontend: built in the real project (real node_modules), then copied into the
// stage. The light entry point never imports frontend/dependencies/, so its bundle
// carries no Composer UI code. Both editions' entry files are named index.tsx (in
// their own frontend/full/ or frontend/light/ folder), so wp-scripts always writes
// build/index.tsx.js regardless of which one was just built: the shared PHP
// (AdminPageModule) hardcodes that exact path, and testing either edition against
// the plugin's live source (not a packaged zip) is just a matter of building or
// watching the entry you want last, see package.json's dev:light/dev:full.
const wpScripts = path.join(root, 'node_modules', '.bin', 'wp-scripts')
run(wpScripts, ['build', flavor.frontendEntry], root)
fs.mkdirSync(path.join(stageDir, 'build'), { recursive: true })
fs.copyFileSync(
  path.join(root, 'build', 'index.tsx.js'),
  path.join(stageDir, 'build', 'index.tsx.js'),
)
fs.copyFileSync(
  path.join(root, 'build', 'index.tsx.asset.php'),
  path.join(stageDir, 'build', 'index.tsx.asset.php'),
)

// 7. assets/ (logo etc.), generated by the `prebuild` script into the real project dir.
fs.cpSync(path.join(root, 'assets'), path.join(stageDir, 'assets'), { recursive: true })

// 8. package.json driving `wp-scripts plugin-zip` (zip name + root folder = "name" field,
// file list = "files" field). Mirrors the old prepack/postpack package.json renaming
// dance, but scoped to the stage instead of mutating the real package.json in place.
fs.writeFileSync(
  path.join(stageDir, 'package.json'),
  JSON.stringify(
    {
      name: flavor.zipName,
      version: pkg.version,
      files: [
        'assets',
        'build',
        'src',
        'vendor',
        'composer.json',
        'loopress.php',
        'readme.txt',
        ...(flavor.includeUninstall ? ['uninstall.php'] : []),
      ],
    },
    null,
    4,
  ),
)

// 9. Zip, then move it next to the other build artifacts at the project root (where CI
// and the release workflow expect it).
run(wpScripts, ['plugin-zip'], stageDir)
fs.copyFileSync(
  path.join(stageDir, `${flavor.zipName}.zip`),
  path.join(root, `${flavor.zipName}.zip`),
)

console.log(`\n${flavor.zipName}.zip ready at ${path.join(root, `${flavor.zipName}.zip`)}`)
