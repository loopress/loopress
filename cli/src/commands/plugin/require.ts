import {Args, Flags} from '@oclif/core'
import got from 'got'
import {spawnSync} from 'node:child_process'

import {LoopressCommand} from '../../lib/base.js'
import {readLocalConfig, writeLocalConfig} from '../../utils/loopress-config.js'

const WP_ORG_API = 'https://api.wordpress.org/plugins/info/1.2/'

interface WpOrgPluginInfo {
  error?: string
  slug: string
  version: string
}

export async function resolvePluginVersion(slug: string, version: string): Promise<string> {
  if (version !== 'latest') return version

  let info: WpOrgPluginInfo
  try {
    info = await got
      .get(WP_ORG_API, {
        searchParams: {
          action: 'plugin_information',
          'request[slug]': slug,
        },
      })
      .json()
  } catch {
    throw new Error(`Plugin "${slug}" not found on WordPress.org.`)
  }

  if (info.error) throw new Error(`Plugin "${slug}" not found on WordPress.org.`)

  return info.version
}

export default class Require extends LoopressCommand {
  static args = {
    slug: Args.string({description: 'Plugin slug (WordPress.org) or Composer package (vendor/package)', required: true}),
    version: Args.string({description: 'Version to pin (default: latest)'}),
  }
  static description = 'Add a plugin to loopress.json (WordPress.org) or run composer require (vendor/package)'
  static examples = [
    '$ lps plugins require woocommerce',
    '$ lps plugins require woocommerce 8.9.1',
    '$ lps plugins require wpackagist-plugin/advanced-custom-fields',
    '$ lps plugins require contact-form-7 --dry-run',
  ]
  static flags = {
    ...LoopressCommand.baseFlags,
    'dry-run': Flags.boolean({char: 'd', description: 'Show what would be written without making changes'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Require)
    const dryRun = flags['dry-run']
    const {slug} = args
    const requestedVersion = args.version ?? 'latest'

    if (slug.includes('/')) {
      await this.requireComposerPackage(slug, requestedVersion, dryRun)
      return
    }

    await this.requireWpOrgPlugin(slug, requestedVersion, dryRun)
  }

  private async requireComposerPackage(pkg: string, version: string, dryRun: boolean): Promise<void> {
    const composerArg = version !== 'latest' ? `${pkg}:${version}` : pkg
    this.log(`Running: composer require ${composerArg}`)

    if (dryRun) {
      this.log(`[dry-run] Would run: composer require ${composerArg}`)
      return
    }

    const result = spawnSync('composer', ['require', composerArg], {stdio: 'inherit'})
    if (result.status !== 0) {
      this.error('composer require failed. Make sure Composer is installed and accessible.')
    }
  }

  private async requireWpOrgPlugin(slug: string, requestedVersion: string, dryRun: boolean): Promise<void> {
    this.log(`Resolving ${slug}@${requestedVersion}...`)

    let resolvedVersion: string
    try {
      resolvedVersion = await resolvePluginVersion(slug, requestedVersion)
    } catch (error) {
      this.error((error as Error).message)
    }

    this.log(`Resolved: ${slug}@${resolvedVersion}`)

    const localConfig = await readLocalConfig()
    const existing = localConfig.plugins ?? {}

    if (existing[slug] === resolvedVersion) {
      this.log(`${slug}@${resolvedVersion} is already in loopress.json — nothing to do.`)
      return
    }

    const updated = existing[slug] !== undefined
    const label = updated ? `${existing[slug]} → ${resolvedVersion}` : resolvedVersion

    if (dryRun) {
      this.log(`[dry-run] Would ${updated ? 'update' : 'add'} ${slug}: ${label}`)
      return
    }

    await writeLocalConfig({
      ...localConfig,
      plugins: {...existing, [slug]: resolvedVersion},
    })

    this.log(`${updated ? 'Updated' : 'Added'} ${slug}: ${label}`)
  }
}
