#!/usr/bin/env node
// Assembles one edition of the plugin into a staging directory and zips it. Both editions
// are built from the same source tree; see README.md for the split. Flavor argument to
// product name: 'light' -> Loopress Light (loopress-light.zip), 'full' -> Loopress
// (loopress.zip).
//
// Usage: node scripts/build-flavor.cjs <light|full>
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const flavor = process.argv[2]
if (!['light', 'full'].includes(flavor)) {
  console.error('Usage: node scripts/build-flavor.cjs <light|full>')
  process.exit(1)
}

const root = path.resolve(__dirname, '..')
const stageDir = path.join(root, '.build-stage', flavor)
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: 'inherit' })
}

fs.rmSync(stageDir, { recursive: true, force: true })
fs.mkdirSync(stageDir, { recursive: true })

// 1. PHP source: src/Dependencies/ only ships in the full edition. Even in the light
// build, this directory must be absent from the artifact, not merely inactive
// (wordpress.org guidelines, see obsidian/Product/WordPress.org Plugin Distribution.md §2-3).
fs.cpSync(path.join(root, 'src'), path.join(stageDir, 'src'), {
  recursive: true,
  filter: (src) => flavor === 'full' || !src.startsWith(path.join(root, 'src', 'Dependencies')),
})

// 2. Entry file: strip or keep the marked Plus block, patch the header for the full edition.
const START = '/* LOOPRESS_PLUS_START */'
const END = '/* LOOPRESS_PLUS_END */'
let entry = fs.readFileSync(path.join(root, 'loopress.php'), 'utf8')
const blockPattern = new RegExp(`[ \\t]*${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}\\n?`, 'g')

if (flavor === 'light') {
  entry = entry.replace(blockPattern, '')
} else {
  // Keep the code between the markers, drop only the marker comment lines themselves.
  entry = entry.replace(new RegExp(`[ \\t]*${escapeRegExp(START)}\\n`, 'g'), '')
  entry = entry.replace(new RegExp(`[ \\t]*${escapeRegExp(END)}\\n`, 'g'), '')
  entry = entry.replace('Plugin Name: Loopress Light', 'Plugin Name: Loopress')
  entry = entry.replace(
    ' * Description:',
    ' * Update URI: https://loopress.dev\n * Description:',
  )
}
fs.writeFileSync(path.join(stageDir, 'loopress.php'), entry)

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 3. uninstall.php: full-edition only, it cleans up wp-content/loopress/ which only
// that edition ever creates.
if (flavor === 'full') {
  fs.copyFileSync(path.join(root, 'uninstall.php'), path.join(stageDir, 'uninstall.php'))
}

// 4. readme.txt: each edition has its own. The root readme.txt describes the full
// edition, since development always targets that feature set by default;
// flavors/light/readme.txt holds the wordpress.org-only cut-down variant.
fs.copyFileSync(
  flavor === 'full' ? path.join(root, 'readme.txt') : path.join(root, 'flavors/light/readme.txt'),
  path.join(stageDir, 'readme.txt'),
)

// 5. composer.json + vendor/: light ships an empty require (autoloader only), full
// ships the real composer/composer dependency staged and installed fresh.
const rootComposerJson = JSON.parse(fs.readFileSync(path.join(root, 'composer.json'), 'utf8'))
const stageComposerJson =
  flavor === 'light'
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
if (flavor === 'full' && fs.existsSync(path.join(root, 'composer.lock'))) {
  fs.copyFileSync(path.join(root, 'composer.lock'), path.join(stageDir, 'composer.lock'))
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
const frontendEntry = flavor === 'light' ? 'frontend/light/index.tsx' : 'frontend/full/index.tsx'
run(wpScripts, ['build', frontendEntry], root)
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
const zipName = flavor === 'full' ? 'loopress' : 'loopress-light'
fs.writeFileSync(
  path.join(stageDir, 'package.json'),
  JSON.stringify(
    {
      name: zipName,
      version: pkg.version,
      files: [
        'assets',
        'build',
        'src',
        'vendor',
        'composer.json',
        'loopress.php',
        'readme.txt',
        ...(flavor === 'full' ? ['uninstall.php'] : []),
      ],
    },
    null,
    4,
  ),
)

// 9. Zip, then move it next to the other build artifacts at the project root (where CI
// and the release workflow expect it).
run(wpScripts, ['plugin-zip'], stageDir)
fs.copyFileSync(path.join(stageDir, `${zipName}.zip`), path.join(root, `${zipName}.zip`))

console.log(`\n${zipName}.zip ready at ${path.join(root, `${zipName}.zip`)}`)
