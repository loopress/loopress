import {Args} from '@oclif/core'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {loadFiles} from '../../lib/load-files.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {type LocalOption, optionEndpoint, optionFileName, parseLocalOption, type RemoteOption} from '../../utils/option-format.js'
import {pluralize} from '../../utils/pluralize.js'

export default class Pull extends LoopressCommand {
  static args = {
    path: Args.string({description: 'Path to options directory (overrides project config)'}),
  }

  static description =
    'Refresh locally tracked options from WordPress. Options not yet tracked are never pulled, run `lps option add <name>` for those first.'

  static enableJsonFlag = true
  static examples = ['$ lps option pull']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    ...LoopressCommand.yesFlag,
  }

  async run(): Promise<LocalOption[]> {
    const {args} = await this.parse(Pull)
    const dir = this.resolveOptionsPath(args.path)
    const {url} = this.siteConfig

    this.log(`Pulling tracked options from ${url}`)
    this.log(`Options path: ${dir}`)

    const tracked = await loadFiles<LocalOption>(dir, {
      extension: '.json',
      onSkip: (message) => {
        this.warn(message)
      },
      parse: parseLocalOption,
    })

    if (tracked.length === 0) {
      this.log('Nothing tracked locally. Run `lps option add <name>` first.')
      return []
    }

    if (this.dryRun) {
      this.log(`[dry-run] Would refresh ${pluralize(tracked.length, 'option')}: ${tracked.map((option) => option.name).join(', ')}`)
      return tracked
    }

    const refreshed: LocalOption[] = []
    const orphans: string[] = []

    for (const option of tracked) {
      const result = await this.pullOption(dir, option)
      if (result === null) {
        orphans.push(optionFileName(option.name))
      } else {
        refreshed.push(result)
        this.log(`Pulled: ${option.name}`)
      }
    }

    await this.removeOrphanedFiles(dir, orphans, 'no longer exist on WordPress')

    this.log(`Pulled ${pluralize(refreshed.length, 'option')}`)
    return refreshed
  }

  // Returns the refreshed option (and writes it to disk), or null when the tracked name is a
  // 404 on this environment: absent, not a failure (see the orphan reconciliation in run()).
  // readonly is a local policy flag with no WordPress counterpart, always preserved from the
  // existing file rather than overwritten by the pulled value.
  private async pullOption(dir: string, option: LocalOption): Promise<LocalOption | null> {
    let remote: RemoteOption
    try {
      remote = await this.wp.get<RemoteOption>(optionEndpoint(option.name))
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }

    const local: LocalOption = {...remote, readonly: option.readonly}
    await writeFile(join(dir, optionFileName(option.name)), JSON.stringify(local, null, 2) + '\n')
    return local
  }
}
