const fs = require('fs')
const path = require('path')

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))

const targets = [
  { file: 'loopress.php', pattern: /(\* Version: )[\d.]+/, label: 'Version header' },
  { file: 'readme.txt', pattern: /(Stable tag: )[\d.]+/, label: 'Stable tag' },
]

for (const { file, pattern, label } of targets) {
  const filePath = path.join(__dirname, '..', file)
  const content = fs.readFileSync(filePath, 'utf8')
  const updated = content.replace(pattern, `$1${pkg.version}`)

  if (updated === content) {
    console.error(`${label} line not found in ${file}`)
    process.exit(1)
  }

  fs.writeFileSync(filePath, updated)
  console.log(`Synced version ${pkg.version} to ${file} (${label})`)
}
