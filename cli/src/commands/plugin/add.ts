import {Args, Flags} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {writeLocalConfig} from '../../utils/loopress-config.js'

export default class Add extends LoopressCommand {
  static args = {
    slug: Args.string({description: 'Plugin slug on WordPress.org', required: true}),
  }

  static description = 'Add a WordPress.org plugin to loopress.json'
  static examples = [
    '$ lps plugin add woocommerce',
    '$ lps plugin add woocommerce --version 9.4.2',
    '$ lps plugin add contact-form-7 --dry-run',
  ]

  static flags = {
    ...LoopressCommand.dryRunFlag,
    version: Flags.string({description: 'Exact version to pin (default: "latest", tracked on every push)'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Add)
    const {slug} = args
    const version = flags.version ?? 'latest'

    const existing = this.localConfig.plugins ?? {}

    if (existing[slug] === version) {
      this.log(`${slug} is already pinned to ${version} in loopress.json, nothing to do.`)
      return
    }

    const isUpdated = existing[slug] !== undefined

    if (this.dryRun) {
      this.log(`[dry-run] Would ${isUpdated ? 'update' : 'add'} ${slug} (${version}) in loopress.json`)
      return
    }

    await writeLocalConfig({
      ...this.localConfig,
      plugins: {...existing, [slug]: version},
    })

    this.log(`${isUpdated ? 'Updated' : 'Added'} ${slug} (${version}). Run \`lps plugin push\` to apply.`)
  }
}
