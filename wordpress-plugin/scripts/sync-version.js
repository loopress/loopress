const fs = require('fs')
const path = require('path')

const rootDir = path.join(__dirname, '..')

function resolveInRoot(relativePath) {
  const resolved = path.resolve(rootDir, relativePath)
  if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
    throw new Error(`Refusing to access path outside plugin root: ${relativePath}`)
  }
  return resolved
}

const pkg = JSON.parse(fs.readFileSync(resolveInRoot('package.json'), 'utf8'))

const targets = [
  { file: 'loopress.php', pattern: /(\* Version: )[\d.]+/, label: 'Version header' },
  { file: 'readme.txt', pattern: /(Stable tag: )[\d.]+/, label: 'Stable tag' },
]

for (const { file, pattern, label } of targets) {
  const filePath = resolveInRoot(file)
  const content = fs.readFileSync(filePath, 'utf8')
  const updated = content.replace(pattern, `$1${pkg.version}`)

  if (updated === content) {
    console.error(`${label} line not found in ${file}`)
    process.exit(1)
  }

  fs.writeFileSync(filePath, updated)
  console.log(`Synced version ${pkg.version} to ${file} (${label})`)
}
