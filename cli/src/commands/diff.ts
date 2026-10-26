import {Flags} from '@oclif/core'

import {getCapabilities, missingIntegration} from '../lib/capabilities.js'
import {DiffCommand, type DiffJson, type DiffSides, type DiffTarget} from '../lib/diff-command.js'
import {RESOURCE_STATE_PROVIDERS, type ResourceStateProvider} from '../lib/resource-state.js'
import {type WpClient} from '../lib/wp-client.js'
import {projectUses, resolveResourceDir} from '../utils/resource-dirs.js'
import {globalStylesFiles} from '../utils/theme-styles-format.js'

// Everything `lps diff` can compare, in report order. Composer isn't a directory-backed
// provider (see resource-state.ts) so it's named here explicitly.
const RESOURCES = [...RESOURCE_STATE_PROVIDERS.map((provider) => provider.resource), 'composer'] as const

export default class Diff extends DiffCommand {
  static description = [
    'Show what differs between your local tracked files and a WordPress environment, or between two environments.',
    'Covers snippets, forms, ACF, API routes, hooks, templates, template parts, pages, menus, custom post types, taxonomies, post meta, roles, block patterns, options, theme styles, and Composer. Plugins and themes have their own `lps plugin status` / `lps theme status`.',
    'Exit code: 0 in sync, 1 on drift, 2 when a resource could not be compared, so it doubles as a CI drift gate.',
  ].join(' ')

  static enableJsonFlag = true

  static examples = [
    '$ lps diff',
    '$ lps diff --env staging',
    '$ lps diff --env staging --against production',
    '$ lps diff --only snippet --only acf',
    '$ lps diff --skip composer',
  ]

  static flags = {
    ...DiffCommand.againstFlag,
    only: Flags.string({description: 'Only compare these resources', multiple: true, options: [...RESOURCES]}),
    skip: Flags.string({description: 'Compare every resource except these', multiple: true, options: [...RESOURCES]}),
  }

  async run(): Promise<DiffJson> {
    const {flags} = await this.parse(Diff)

    const sides = this.resolveSides(flags.against)
    const selected = this.selectResources(flags.only, flags.skip)

    const providers = RESOURCE_STATE_PROVIDERS.filter((provider) => selected.has(provider.resource))
    const targets: DiffTarget[] = [
      ...(await Promise.all(
        providers.map(async (provider) => ({
          ...this.providerTarget(provider, sides),
          skip: !(await this.projectUses(provider)) && (await this.siteLacks(provider, sides)),
        })),
      )),
      ...(selected.has('composer') ? [this.composerTarget(sides)] : []),
    ]

    return this.report(targets, sides)
  }

  // Tells apart a resource the project doesn't use from one it does, for the ones a site can lack:
  // a plugin-backed resource without its directory, Global Styles without a tracked file.
  private async projectUses(provider: ResourceStateProvider): Promise<boolean> {
    if (provider.dirKind === 'themeStyles') {
      return (await globalStylesFiles(resolveResourceDir('themeStyles', this.localConfig))).length > 0
    }

    return projectUses(provider.dirKind, this.localConfig)
  }

  // `--only` narrows the default set, `--skip` then removes from whatever that set is, same
  // precedence a combined `--only=a,b --skip=b` reads as (mirrors dev-watch's resolveResourceTypes).
  private selectResources(only: string[] | undefined, skip: string[] | undefined): Set<string> {
    const base = only && only.length > 0 ? only : RESOURCES
    return new Set(base.filter((resource) => !(skip ?? []).includes(resource)))
  }

  // Either side can't hold the resource. Capabilities that can't be read (site down, plugin too
  // old) skip nothing: the comparison then reports the failure itself, as inconclusive.
  private async siteLacks(provider: ResourceStateProvider, sides: DiffSides): Promise<boolean> {
    const sites: Array<[WpClient, string]> = [[this.wp, sides.leftLabel]]
    if (sides.againstWp) sites.push([sides.againstWp, sides.rightLabel])
    try {
      const all = await Promise.all(sites.map(async ([wp, name]) => getCapabilities(wp, name)))
      return all.some((capabilities) => missingIntegration(provider.dirKind, capabilities) !== undefined)
    } catch {
      return false
    }
  }
}
