import {Args, Flags, ux} from '@oclif/core'
import {resolve} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {resolveResourceDir} from '../utils/resource-dirs.js'
import {LoopressCommand} from './base.js'
import {compareStates, isEmptyDiff, type ResourceState, type StateChange, type StateDiff} from './diff-state.js'
import {composerLocalState, composerRemoteState, getResourceStateProvider, type ResourceStateProvider} from './resource-state.js'
import {WpClient} from './wp-client.js'

const c = ux.colorize

export type ResourceDiffJson = {
  added: string[]
  changed: StateChange[]
  error?: string
  removed: string[]
}

export type DiffJson = {
  drift: boolean
  left: string
  resources: Record<string, ResourceDiffJson>
  right: string
}

export type DiffTarget = {
  left: () => Promise<ResourceState>
  resource: string
  right: () => Promise<ResourceState>
  title: string
}

// `left` is always the primary environment. `right` is a second environment (`--against`) or
// the local tracked files.
type DiffSides = {
  againstWp: undefined | WpClient
  leftLabel: string
  rightLabel: string
  warn: (message: string) => void
}

// Shared machinery for `lps diff` and the per-resource `lps <resource> diff` commands: the
// `--against` flag, resolving the two sides, turning a provider into a comparison target, and
// running + rendering the comparison with a CI-friendly exit code.
export abstract class DiffCommand extends LoopressCommand {
  // Spread into each concrete command's `static flags`, same pattern as PushCommand.dryRunFlag.
  static againstFlag = {
    against: Flags.string({
      description: 'Compare the primary environment against this second environment instead of against local files',
    }),
  }

  protected composerTarget(sides: DiffSides): DiffTarget {
    // resolve(), not join(): an absolute `rootDir` in loopress.json must stay absolute rather
    // than being prefixed with the cwd, so Composer is read from the same place as the
    // file-backed resources.
    const localRoot = resolve(process.cwd(), this.rootDir)
    return {
      left: async () => composerRemoteState(this.wp),
      resource: 'composer',
      right: sides.againstWp ? async () => composerRemoteState(sides.againstWp!) : async () => composerLocalState(localRoot),
      title: 'Composer',
    }
  }

  // Turns a directory-backed provider into a target; `dirOverride` is the optional `[PATH]`
  // arg the per-resource commands accept.
  protected providerTarget(provider: ResourceStateProvider, sides: DiffSides, dirOverride?: string): DiffTarget {
    if (dirOverride !== undefined && sides.againstWp) {
      this.error('A [PATH] argument cannot be combined with --against: --against compares two environments, not local files.')
    }

    const dir = resolveResourceDir(provider.dirKind, this.localConfig, dirOverride)

    return {
      left: async () => provider.remote(this.wp, sides.warn, dir),
      resource: provider.resource,
      right: sides.againstWp ? async () => provider.remote(sides.againstWp!, sides.warn, dir) : async () => provider.local(dir, sides.warn),
      title: provider.title,
    }
  }

  // Runs every target (concurrently), prints a git-style section per resource in target order,
  // a tally, and the verdict, then returns the structured result. Exit code: 1 on drift, 2
  // when a resource could not be compared (inconclusive), so the command doubles as a CI gate.
  protected async report(targets: DiffTarget[], sides: DiffSides): Promise<DiffJson> {
    this.out(`Comparing ${c('bold', sides.leftLabel)} ${c('dim', '→')} ${c('bold', sides.rightLabel)}\n`)

    const results = await Promise.all(targets.map(async (target) => this.computeResource(target, sides)))

    const resources: Record<string, ResourceDiffJson> = {}
    let drift = false
    let failed = false
    let compared = 0
    let added = 0
    let removed = 0
    let changed = 0

    for (const result of results) {
      resources[result.resource] = result.json

      if (result.json.error !== undefined) {
        failed = true
        const errorLabel = c('red', `error: ${result.json.error}`)
        this.out(`${c('bold', result.title)}  ${errorLabel}`)
        continue
      }

      compared += 1
      added += result.json.added.length
      removed += result.json.removed.length
      changed += result.json.changed.length
      if (result.stateDiff) this.renderSection(result.title, result.stateDiff)
      if (result.drift) drift = true
    }

    this.out(`\n${compared} compared: ${changed} changed, ${added} added, ${removed} removed`)
    if (failed) this.out(c('red', 'Some resources could not be compared; this run is inconclusive.'))
    else this.out(drift ? c('yellow', 'Drift detected.') : c('green', 'Everything is in sync.'))

    if (failed) process.exitCode = 2
    else if (drift) process.exitCode = 1

    return {drift, left: sides.leftLabel, resources, right: sides.rightLabel}
  }

  protected resolveSides(against: string | undefined): DiffSides {
    if (against === this.siteConfig.name) {
      this.error('--against must be a different environment from the one being compared.')
    }

    return {
      againstWp: against ? this.wpForEnvironment(against) : undefined,
      leftLabel: this.siteConfig.name,
      rightLabel: against ?? 'local',
      warn: (message) => {
        this.warn(message)
      },
    }
  }

  // Every `lps diff` variant resolves to this structured report (narrowing oclif's
  // `run(): Promise<any>`), so tests and callers get a typed result off `.run()`.
  abstract run(): Promise<DiffJson>

  // Fetches and compares one target. No output (so targets can run concurrently); `report`
  // renders `stateDiff` afterwards in a fixed order.
  private async computeResource(
    target: DiffTarget,
    sides: DiffSides,
  ): Promise<{drift: boolean; json: ResourceDiffJson; resource: string; stateDiff?: StateDiff; title: string}> {
    try {
      const [leftState, rightState] = await Promise.all([target.left(), target.right()])
      const stateDiff = compareStates(leftState, rightState, {left: sides.leftLabel, right: sides.rightLabel})
      return {
        drift: !isEmptyDiff(stateDiff),
        json: {added: stateDiff.added, changed: stateDiff.changed, removed: stateDiff.removed},
        resource: target.resource,
        stateDiff,
        title: target.title,
      }
    } catch (error) {
      const {message} = error as Error
      return {drift: false, json: {added: [], changed: [], error: message, removed: []}, resource: target.resource, title: target.title}
    }
  }

  private out(message: string): void {
    if (!this.jsonEnabled()) this.log(message)
  }

  private renderSection(title: string, stateDiff: StateDiff): void {
    if (isEmptyDiff(stateDiff)) {
      this.out(`${c('bold', title)}  ${c('dim', 'in sync')}`)
      return
    }

    this.out(c('bold', title))
    for (const id of stateDiff.added) this.out(c('green', `  + ${id}`))
    for (const id of stateDiff.removed) this.out(c('red', `  - ${id}`))
    for (const change of stateDiff.changed) {
      this.out(c('yellow', `  ~ ${change.id}`))
      this.out(indentPatch(change.patch))
    }
  }

  private wpForEnvironment(envName: string): WpClient {
    const env = configManager.getEnvironment(this.projectId, envName)
    if (!env) {
      this.error(`Environment "${envName}" not found in this project.`)
    }

    if (!env.token) {
      this.error(`No credentials configured for "${envName}". Run \`lps project config\` to add them.`)
    }

    return new WpClient(env.url, env.token)
  }
}

// Builds the `lps <resource> diff` command class for one directory-backed resource. They differ
// only in wording and which provider they target, so the whole body lives here.
export function resourceDiffCommand(resource: string, options: {description: string; pathNoun: string}): typeof DiffCommand {
  class ResourceDiff extends DiffCommand {
    static args = {
      path: Args.string({description: `Path to ${options.pathNoun} (overrides project config)`}),
    }

    static description = options.description
    static enableJsonFlag = true
    static examples = [
      `$ lps ${resource} diff`,
      `$ lps ${resource} diff --env staging`,
      `$ lps ${resource} diff --env staging --against production`,
    ]

    static flags = {...DiffCommand.againstFlag}

    async run(): Promise<DiffJson> {
      const {args, flags} = await this.parse(ResourceDiff)
      const sides = this.resolveSides(flags.against)
      return this.report([this.providerTarget(getResourceStateProvider(resource), sides, args.path)], sides)
    }
  }

  return ResourceDiff
}

// Indents an already-formatted change block (a per-field list or a header-less unified diff)
// so it sits visually under the `~ id` line.
function indentPatch(patch: string): string {
  return patch
    .split('\n')
    .map((line) => (line === '' ? line : `    ${line}`))
    .join('\n')
    .trimEnd()
}
