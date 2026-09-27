import {Args, Flags} from '@oclif/core'

import {LoopressCommand} from '../../lib/base.js'
import {pinVersion, type PluginPin} from '../../types/plugin.js'
import {writeLocalConfig} from '../../utils/loopress-config.js'
import {isExactVersion} from '../../utils/version.js'

type AddResult = {
  slug: string
  status: 'added' | 'dry-run' | 'unchanged' | 'updated'
  version: string
}

export default class Add extends LoopressCommand {
  static args = {
    slug: Args.string({description: 'Plugin slug on WordPress.org', required: true}),
  }

  static description = 'Add a WordPress.org plugin to loopress.json'
  static enableJsonFlag = true
  static examples = [
    '$ lps plugin add woocommerce',
    '$ lps plugin add woocommerce --version 9.4.2',
    '$ lps plugin add contact-form-7 --dry-run',
  ]

  static flags = {
    ...LoopressCommand.dryRunFlag,
    version: Flags.string({description: 'Exact version to pin (default: "latest", tracked on every push)'}),
  }

  async run(): Promise<AddResult> {
    const {args, flags} = await this.parse(Add)
    const {slug} = args
    const version = flags.version ?? 'latest'

    if (version !== 'latest' && !isExactVersion(version)) {
      this.error(`--version must be an exact version like 9.4.2, not a Composer constraint. Got "${version}".`)
    }

    const existing = this.localConfig.plugins ?? {}

    const current = existing[slug] as PluginPin | undefined
    if (current !== undefined && pinVersion(current) === version) {
      this.log(`${slug} is already pinned to ${version} in loopress.json, nothing to do.`)
      return {slug, status: 'unchanged', version}
    }

    const isUpdated = current !== undefined

    if (this.dryRun) {
      this.log(`[dry-run] Would ${isUpdated ? 'update' : 'add'} ${slug} (${version}) in loopress.json`)
      return {slug, status: 'dry-run', version}
    }

    await writeLocalConfig({
      ...this.localConfig,
      // Re-pinning a plugin recorded as inactive keeps it inactive.
      plugins: {...existing, [slug]: typeof current === 'object' ? {...current, version} : version},
    })

    this.log(`${isUpdated ? 'Updated' : 'Added'} ${slug} (${version}). Run \`lps plugin push\` to apply.`)
    return {slug, status: isUpdated ? 'updated' : 'added', version}
  }
}
