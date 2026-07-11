import {Args} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {writeLocalConfig} from '../../utils/loopress-config.js'

export default class Add extends LoopressCommand {
  static args = {
    slug: Args.string({description: 'Plugin slug on WordPress.org', required: true}),
  }
  static description = 'Add a WordPress.org plugin to loopress.json'
  static examples = ['$ lps plugin add woocommerce', '$ lps plugin add contact-form-7 --dry-run']
  static flags = {
    ...LoopressCommand.dryRunFlag,
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Add)
    const {slug} = args

    const existing = this.localConfig.plugins ?? {}

    if (existing[slug] === 'latest') {
      this.log(`${slug} is already in loopress.json, nothing to do.`)
      return
    }

    const updated = existing[slug] !== undefined

    if (this.dryRun) {
      this.log(`[dry-run] Would ${updated ? 'update' : 'add'} ${slug} in loopress.json`)
      return
    }

    await writeLocalConfig({
      ...this.localConfig,
      plugins: {...existing, [slug]: 'latest'},
    })

    this.log(`${updated ? 'Updated' : 'Added'} ${slug}`)
  }
}
