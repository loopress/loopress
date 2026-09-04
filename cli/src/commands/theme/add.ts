import {Args, Flags} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {writeLocalConfig} from '../../utils/loopress-config.js'
import {isExactVersion} from '../../utils/version.js'

export default class Add extends LoopressCommand {
  static args = {
    slug: Args.string({description: 'Theme slug on WordPress.org', required: true}),
  }

  static description = 'Add a WordPress.org theme to loopress.json'
  static examples = ['$ lps theme add generatepress', '$ lps theme add generatepress --version 3.4.0']
  static flags = {
    ...LoopressCommand.dryRunFlag,
    version: Flags.string({description: 'Exact version to pin (default: "latest")'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Add)
    const {slug} = args
    const version = flags.version ?? 'latest'

    if (version !== 'latest' && !isExactVersion(version)) {
      this.error(`--version must be an exact version like 3.4.0, not a Composer constraint. Got "${version}".`)
    }

    const existing = this.localConfig.themes ?? {}

    if (existing[slug] === version) {
      this.log(`${slug} is already pinned to ${version}, nothing to do.`)
      return
    }

    const isUpdated = existing[slug] !== undefined
    if (this.dryRun) {
      this.log(`[dry-run] Would ${isUpdated ? 'update' : 'add'} ${slug} (${version})`)
      return
    }

    await writeLocalConfig({...this.localConfig, themes: {...existing, [slug]: version}})
    this.log(`${isUpdated ? 'Updated' : 'Added'} ${slug} (${version}). Run \`lps theme push\` to apply.`)
  }
}
