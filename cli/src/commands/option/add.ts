import {Args, Flags} from '@oclif/core'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {LoopressCommand} from '../../lib/base.js'
import {isNotFoundError} from '../../lib/wp-client.js'
import {
  defaultReadonlyFor,
  isReservedOptionName,
  type LocalOption,
  optionEndpoint,
  optionFileName,
  type RemoteOption,
} from '../../utils/option-format.js'

export default class Add extends LoopressCommand {
  static args = {
    name: Args.string({description: 'Option name to start tracking (see `lps option list`)', required: true}),
  }

  static description =
    'Fetch a WordPress option by name and start tracking it locally. Run `lps option list` first to find the name: ' +
    'this copies a raw value across environments, verify it does not embed post/user IDs before pushing it elsewhere.'

  static enableJsonFlag = true
  static examples = ['$ lps option add wpseo_titles', '$ lps option add siteurl']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    path: Flags.string({description: 'Path to options directory (overrides project config)'}),
  }

  async run(): Promise<LocalOption> {
    const {args, flags} = await this.parse(Add)
    const {name} = args
    const dir = this.resolveOptionsPath(flags.path)

    if (isReservedOptionName(name)) {
      this.error(`"${name}" is managed by \`lps plugin\`/\`lps theme\`, not \`lps option\`.`)
    }

    let remote: RemoteOption
    try {
      remote = await this.wp.get<RemoteOption>(optionEndpoint(name))
    } catch (error) {
      if (isNotFoundError(error)) {
        this.error(`Option "${name}" was not found on ${this.siteConfig.url}. Run \`lps option list\` to see available names.`)
      }

      throw error
    }

    const local: LocalOption = {...remote, readonly: defaultReadonlyFor(name)}
    const file = join(dir, optionFileName(name))

    if (this.dryRun) {
      this.log(`[dry-run] Would track "${name}" at ${file}`)
      return local
    }

    await mkdir(dir, {recursive: true})
    await writeFile(file, JSON.stringify(local, null, 2) + '\n')

    this.log(`Tracking "${name}"${local.readonly ? ' (readonly: push will skip it, see the file to override)' : ''} at ${file}`)
    return local
  }
}
