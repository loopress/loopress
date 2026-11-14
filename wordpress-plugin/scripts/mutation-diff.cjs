// Runs Infection only on the src/ PHP files changed since a base ref (default origin/main).
// Whole files, not line ranges: `--git-diff-lines` reads diff paths relative to the git root
// (here `loopress/`, the plugin is a subdirectory) and crashes on them, `--filter` takes paths
// relative to the plugin directory, which `git diff --relative` prints.
// Usage: composer run mutation:diff [-- <base-ref>]
const { execFileSync, spawnSync } = require('child_process')

const base = process.argv[2] || 'origin/main'
if (!/^[\w][\w./~^-]*$/.test(base)) {
  console.error(`Invalid base ref: ${base}`)
  process.exit(1)
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

const mergeBase = git('merge-base', base, 'HEAD')
const files = git('diff', '--relative', '--name-only', '--diff-filter=d', mergeBase, '--', 'src')
  .split('\n')
  .filter((file) => file.endsWith('.php'))

if (files.length === 0) {
  console.log('No changed PHP file under src/, nothing to mutate.')
  process.exit(0)
}

console.log(`Mutating ${files.length} changed file(s) since ${base}:\n  ${files.join('\n  ')}`)

const result = spawnSync(
  'vendor/bin/infection',
  ['--threads=4', '--show-mutations', `--filter=${files.join(',')}`],
  { stdio: 'inherit' },
)
process.exit(result.status ?? 1)
