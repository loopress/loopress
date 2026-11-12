import {existsSync} from 'node:fs'
import {resolve} from 'node:path'

import {getCapabilities, integrationFix, type MissingIntegration, missingIntegration, missingModule, type SiteCapabilities} from '../lib/capabilities.js'
import {declaredPlugins} from '../lib/declared-plugins.js'
import {DiffCommand, type DiffJson, type DiffSides, type DiffTarget} from '../lib/diff-command.js'
import {parseSelectionFlag, selectionFlags, selectResources} from '../lib/resource-selection.js'
import {RESOURCE_STATE_PROVIDERS, type ResourceStateProvider} from '../lib/resource-state.js'
import {type WpClient} from '../lib/wp-client.js'
import {projectUses, resolveResourceDir} from '../utils/resource-dirs.js'
import {globalStylesFiles} from '../utils/theme-styles-format.js'

// Everything `lps diff` can compare, in report order. Composer isn't a directory-backed
// provider (see resource-state.ts) so it's named here explicitly.
const RESOURCES = [...RESOURCE_STATE_PROVIDERS.map((provider) => provider.resource), 'composer'] as const

export default class Diff extends DiffCommand {
  static override description = [
    'Show what differs between your local tracked files and a WordPress environment, or between two environments.',
    'Covers snippets, forms, ACF, API routes, hooks, dynamic blocks, templates, template parts, pages, menus, custom post types, taxonomies, post meta, roles, block patterns, options, theme styles, and Composer. Plugins and themes have their own `lps plugin status` / `lps theme status`.',
    'Exit code: 0 in sync, 1 on drift, 2 when a resource could not be compared, so it doubles as a CI drift gate.',
  ].join(' ')

  static override enableJsonFlag = true

  static override examples = [
    '$ lps diff',
    '$ lps diff --env staging',
    '$ lps diff --env staging --against production',
    '$ lps diff --only snippet --only acf',
    '$ lps diff --skip composer',
  ]

  static override flags = {
    ...DiffCommand.againstFlag,
    ...DiffCommand.skipUnsupportedFlag,
    ...selectionFlags('compare', RESOURCES),
  }

  async run(): Promise<DiffJson> {
    const {flags} = await this.parse(Diff)

    const sides = this.resolveSides(flags.against)
    const selected = new Set(
      selectResources(
        RESOURCES,
        parseSelectionFlag(flags.only, 'only', RESOURCES, (message) => this.error(message)),
        parseSelectionFlag(flags.skip, 'skip', RESOURCES, (message) => this.error(message)),
      ),
    )

    const providers = RESOURCE_STATE_PROVIDERS.filter((provider) => selected.has(provider.resource))
    const skipUnsupported = flags['skip-unsupported']
    const targets: DiffTarget[] = [
      ...(await Promise.all(
        providers.flatMap((provider) => {
          const targets = [this.providerTarget(provider, sides)]
          // The namespace is the API module's own setting: it is skipped with it.
          if (provider.resource === 'api') targets.push(this.namespaceTarget(sides))
          return targets.map(async (target) => {
            const lacking = await this.siteMissing((capabilities) => missingIntegration(provider.dirKind, capabilities), sides)
            return this.withSiteSkip(target, lacking, await this.projectUses(provider), skipUnsupported)
          })
        }),
      )),
      ...(selected.has('composer') ? [await this.composerSiteTarget(sides, skipUnsupported)] : []),
    ]

    if (skipUnsupported) {
      const declared = await declaredPlugins({localConfig: this.localConfig, rootDir: this.rootDir, siteName: this.siteConfig.name})
      for (const {unsupported} of targets) {
        if (unsupported) unsupported.fix = integrationFix(unsupported.missing, declared)
      }
    }

    const result = await this.report(targets, sides)
    // Only the environment against its local files is drift; two environments differing is not.
    if (!sides.againstWp) await this.reportDrift(result)
    return result
  }

  private async composerSiteTarget(sides: DiffSides, skipUnsupported: boolean): Promise<DiffTarget> {
    const lacking = await this.siteMissing((capabilities) => missingModule('dependencies', 'Composer files', capabilities), sides)
    const used = existsSync(resolve(process.cwd(), this.rootDir, 'composer.json'))
    return this.withSiteSkip(this.composerTarget(sides), lacking, used, skipUnsupported)
  }

  // Tells apart a resource the project doesn't use from one it does, for the ones a site can lack:
  // a plugin-backed resource without its directory, Global Styles without a tracked file.
  private async projectUses(provider: ResourceStateProvider): Promise<boolean> {
    if (provider.dirKind === 'themeStyles') {
      return (await globalStylesFiles(resolveResourceDir('themeStyles', this.localConfig))).length > 0
    }

    return projectUses(provider.dirKind, this.localConfig)
  }

  // Either side can't hold the resource. Capabilities that can't be read (site down, plugin too
  // old) skip nothing: the comparison then reports the failure itself, as inconclusive.
  private async siteMissing(
    missing: (capabilities: SiteCapabilities) => MissingIntegration | undefined,
    sides: DiffSides,
  ): Promise<undefined | {missing: MissingIntegration; site: string}> {
    try {
      // Inside the try: `this.wp` errors out without credentials, the comparison reports that.
      const sites: Array<[WpClient, string]> = [[this.wp, sides.leftLabel]]
      if (sides.againstWp) sites.push([sides.againstWp, sides.rightLabel])
      const all = await Promise.all(sites.map(async ([wp, site]) => ({capabilities: await getCapabilities(wp, site), site})))
      for (const {capabilities, site} of all) {
        const found = missing(capabilities)
        if (found) return {missing: found, site}
      }

      return undefined
    } catch {
      return undefined
    }
  }

  // A resource the site can't hold is skipped when the project doesn't use it, and also when it
  // does with --skip-unsupported, which then reports why instead of "not configured".
  private withSiteSkip(
    target: DiffTarget,
    lacking: undefined | {missing: MissingIntegration; site: string},
    used: boolean,
    skipUnsupported: boolean,
  ): DiffTarget {
    if (!lacking) return target
    if (!used) return {...target, skip: true}
    if (!skipUnsupported) return target
    return {...target, skip: true, unsupported: {missing: lacking.missing, reason: `${lacking.missing.reason} on ${lacking.site}`}}
  }
}
