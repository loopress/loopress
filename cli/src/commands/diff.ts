import {Flags} from '@oclif/core'

import {DiffCommand, type DiffJson, type DiffTarget} from '../lib/diff-command.js'
import {RESOURCE_STATE_PROVIDERS} from '../lib/resource-state.js'

// Everything `lps diff` can compare, in report order. Composer isn't a directory-backed
// provider (see resource-state.ts) so it's named here explicitly.
const RESOURCES = [...RESOURCE_STATE_PROVIDERS.map((provider) => provider.resource), 'composer'] as const

export default class Diff extends DiffCommand {
  static description = [
    'Show what differs between your local tracked files and a WordPress environment, or between two environments.',
    'Covers snippets, pages, forms, ACF, API routes, Hooks, SEO, and Composer. Plugins and themes have their own `lps plugin status` / `lps theme status`.',
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

    const targets: DiffTarget[] = [
      ...RESOURCE_STATE_PROVIDERS.filter((provider) => selected.has(provider.resource)).map((provider) =>
        this.providerTarget(provider, sides),
      ),
      ...(selected.has('composer') ? [this.composerTarget(sides)] : []),
    ]

    return this.report(targets, sides)
  }

  // `--only` narrows the default set, `--skip` then removes from whatever that set is, same
  // precedence a combined `--only=a,b --skip=b` reads as (mirrors dev-watch's resolveResourceTypes).
  private selectResources(only: string[] | undefined, skip: string[] | undefined): Set<string> {
    const base = only && only.length > 0 ? only : RESOURCES
    return new Set(base.filter((resource) => !(skip ?? []).includes(resource)))
  }
}
