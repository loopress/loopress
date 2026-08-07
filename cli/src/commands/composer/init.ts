import {confirm} from '@inquirer/prompts'
import {existsSync} from 'node:fs'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {isInteractive} from '../../lib/interactive.js'
import {type ComposerJson} from '../../utils/composer.js'

const WPACKAGIST_REPOSITORY = {type: 'composer', url: 'https://wpackagist.org'}
const INSTALLERS_PACKAGE = 'composer/installers'
const INSTALLERS_CONSTRAINT = '^2.0'

// The server runs Composer with `--working-dir` set to wp-content/loopress/ (see
// LoopressEnvironment::getLoopressDir), not the WordPress root, so installer-paths must climb out
// of that directory to land plugins/themes in their usual wp-content/ locations.
const INSTALLER_PATHS = {
  '../plugins/{$name}/': ['type:wordpress-plugin'],
  '../themes/{$name}/': ['type:wordpress-theme'],
}

export default class ComposerInit extends LoopressCommand {
  static description = 'Create a composer.json wired to WPackagist for installing WordPress.org plugins and themes'
  static examples = ['$ lps composer init', '$ lps composer init --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
  }

  async run(): Promise<void> {
    const composerJsonPath = join(process.cwd(), this.rootDir, 'composer.json')

    if (existsSync(composerJsonPath)) {
      if (!isInteractive()) {
        this.log('composer.json already exists, not overwriting (non-interactive terminal).')
        return
      }

      const isOverwrite = await confirm({default: false, message: 'composer.json already exists. Overwrite?'})
      if (!isOverwrite) {
        this.log('Aborted.')
        return
      }
    }

    const composerJson: ComposerJson = {
      // composer/installers is itself a Composer plugin, and Composer 2.2+ refuses to run any
      // plugin that isn't explicitly trusted when running non-interactively (which every
      // `composer push` on the server does). Without this, the very first real push against
      // this scaffold 500s on Composer's own plugin-trust gate before ever touching a package.
      config: {'allow-plugins': {[INSTALLERS_PACKAGE]: true}},
      extra: {'installer-paths': INSTALLER_PATHS},
      name: 'loopress/site-dependencies',
      repositories: [WPACKAGIST_REPOSITORY],
      require: {
        [INSTALLERS_PACKAGE]: INSTALLERS_CONSTRAINT,
      },
    }

    if (this.dryRun) {
      this.log(`[dry-run] Would write composer.json to ${composerJsonPath}`)
      return
    }

    await writeFile(composerJsonPath, JSON.stringify(composerJson, null, 2) + '\n', 'utf8')

    this.log(`Wrote composer.json to ${composerJsonPath}`)
    this.log('Add plugins with `wpackagist-plugin/<slug>` and a theme with `wpackagist-theme/<slug>` in require, then run `lps composer push`.')
  }
}
