const fs = require('fs')
const path = require('path')

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
const phpPath = path.join(__dirname, '..', 'loopress-plugin.php')
const content = fs.readFileSync(phpPath, 'utf8')
const updated = content.replace(/(\* Version: )[\d.]+/, `$1${pkg.version}`)

if (updated === content) {
  console.error('Version line not found in loopress-plugin.php')
  process.exit(1)
}

fs.writeFileSync(phpPath, updated)
console.log(`Synced version ${pkg.version} to loopress-plugin.php`)
