import {Args, Flags} from '@oclif/core'
import got from 'got'

import {LoopressCommand} from '../../lib/base.js'
import {pinActive, pinVersion, type PluginPin} from '../../types/plugin.js'
import {writeLocalConfig} from '../../utils/loopress-config.js'
import {isExactVersion} from '../../utils/version.js'

type AddResult = {
  // Plugins added alongside because `slug` requires them (its `Requires Plugins` header).
  dependencies: string[]
  slug: string
  status: 'added' | 'dry-run' | 'unchanged' | 'updated'
  version: string
}

export default class Add extends LoopressCommand {
  static override args = {
    slug: Args.string({description: 'Plugin slug on WordPress.org', required: true}),
  }

  static override description = 'Add a WordPress.org plugin to loopress.json'
  static override enableJsonFlag = true
  static override examples = [
    '$ lps plugin add woocommerce',
    '$ lps plugin add woocommerce --version 9.4.2',
    '$ lps plugin add contact-form-7 --dry-run',
  ]

  static override flags = {
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
    const required = await requiredPlugins(slug)
    const dependencies = required.filter((dep) => !Object.hasOwn(existing, dep))
    // An inactive pin keeps its dependency off, so push could never activate `slug`.
    const inactive = required.filter((dep) => Object.hasOwn(existing, dep) && !pinActive(existing[dep]))
    if (inactive.length > 0) {
      this.warn(
        `${slug} requires ${inactive.join(', ')}, pinned inactive in loopress.json. Remove \`"active": false\` there, or push cannot activate ${slug}.`,
      )
    }

    const current = existing[slug] as PluginPin | undefined
    if (current !== undefined && pinVersion(current) === version && dependencies.length === 0) {
      this.log(`${slug} is already pinned to ${version} in loopress.json, nothing to do.`)
      return {dependencies, slug, status: 'unchanged', version}
    }

    const isUpdated = current !== undefined
    const requires = dependencies.length > 0 ? `, with required ${dependencies.join(', ')} (latest)` : ''

    if (this.dryRun) {
      this.log(`[dry-run] Would ${isUpdated ? 'update' : 'add'} ${slug} (${version})${requires} in loopress.json`)
      return {dependencies, slug, status: 'dry-run', version}
    }

    await writeLocalConfig({
      ...this.localConfig,
      plugins: {
        ...existing,
        ...Object.fromEntries(dependencies.map((dep) => [dep, 'latest'])),
        // Re-pinning a plugin recorded as inactive keeps it inactive.
        [slug]: typeof current === 'object' ? {...current, version} : version,
      },
    })

    this.log(`${isUpdated ? 'Updated' : 'Added'} ${slug} (${version})${requires}. Run \`lps plugin push\` to apply.`)
    return {dependencies, slug, status: isUpdated ? 'updated' : 'added', version}
  }
}

// Every plugin `slug` needs active first, transitively, from the `Requires Plugins` header
// WordPress.org exposes as `requires_plugins`. Not on WordPress.org or unreachable: none known,
// and `lps plugin push` still names a missing one when WordPress refuses the activation.
async function requiredPlugins(slug: string): Promise<string[]> {
  const found: string[] = []
  const queue = [slug]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    let info: Record<string, unknown>
    try {
      info = await got('https://api.wordpress.org/plugins/info/1.2/', {
        searchParams: {action: 'plugin_information', 'request[slug]': next},
        timeout: {request: 10_000},
      }).json<Record<string, unknown>>()
    } catch {
      continue
    }

    const requires = Array.isArray(info.requires_plugins) ? info.requires_plugins : []
    for (const dep of requires) {
      if (typeof dep !== 'string' || dep === slug || found.includes(dep)) {
        continue
      }

      found.push(dep)
      queue.push(dep)
    }
  }

  return found
}
