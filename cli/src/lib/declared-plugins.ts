import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

import {parseComposerJson, wpackagistRequire} from '../utils/composer.js'
import {type LoopressLocalConfig} from '../utils/loopress-config.js'
import {isLocalEnvironment} from './wp-client.js'

// The wordpress.org plugins the project declares: composer.json's wpackagist plugins when it
// exists, loopress.json's otherwise. Unreadable or invalid composer.json: none, the commands
// report it.
export async function declaredPlugins(options: {localConfig: LoopressLocalConfig; rootDir: string; siteName: string}): Promise<{fromComposer: boolean; plugins: string[]}> {
  const path = join(process.cwd(), options.rootDir, 'composer.json')
  if (!existsSync(path)) return {fromComposer: false, plugins: Object.keys(options.localConfig.plugins ?? {})}
  try {
    const composerJson = parseComposerJson(await readFile(path, 'utf8'))
    return {fromComposer: true, plugins: Object.keys(wpackagistRequire(composerJson, 'plugin', isLocalEnvironment(options.siteName)))}
  } catch {
    return {fromComposer: true, plugins: []}
  }
}
