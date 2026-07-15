const fs = require('fs')
const path = require('path')

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))

const targets = [
  { file: 'loopress.php', pattern: /(\* Version: )[\d.]+/, label: 'Version header' },
  { file: 'loopress.php', pattern: /(define\('LOOPRESS_VERSION', ')[\d.]+/, label: 'LOOPRESS_VERSION constant' },
  { file: 'readme.txt', pattern: /(Stable tag: )[\d.]+/, label: 'Loopress (full edition) stable tag' },
  { file: 'flavors/light/readme.txt', pattern: /(Stable tag: )[\d.]+/, label: 'Loopress Light stable tag' },
]

for (const { file, pattern, label } of targets) {
  const filePath = path.join(__dirname, '..', file)
  const content = fs.readFileSync(filePath, 'utf8')

  // Checked independently of the replacement result: comparing `updated === content` instead
  // would misreport "not found" whenever the file already has the current version, since the
  // replacement is then a no-op that also leaves the content unchanged.
  if (!pattern.test(content)) {
    console.error(`${label} line not found in ${file}`)
    process.exit(1)
  }

  const updated = content.replace(pattern, `$1${pkg.version}`)
  fs.writeFileSync(filePath, updated)
  console.log(`Synced version ${pkg.version} to ${file} (${label})`)
}
