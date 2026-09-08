import {Flags, ux} from '@oclif/core'
import {resolve} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {resolveResourceDir} from '../utils/resource-dirs.js'
import {LoopressCommand} from './base.js'
import {compareStates, isEmptyDiff, type ResourceState, type StateDiff} from './diff-state.js'
import {composerLocalState, composerRemoteState, type ResourceStateProvider} from './resource-state.js'
import {WpClient} from './wp-client.js'

const c = ux.colorize

export type ResourceDiffJson = {
  added: string[]
  changed: Array<{id: string; patch: string}>
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
    return {
      left: async () => provider.remote(this.wp, sides.warn),
      resource: provider.resource,
      right: sides.againstWp
        ? async () => provider.remote(sides.againstWp!, sides.warn)
        : async () => provider.local(resolveResourceDir(provider.dirKind, this.localConfig, dirOverride), sides.warn),
      title: provider.title,
    }
  }

  // Runs every target, prints a git-style section per resource, and returns the structured
  // result. Sets a non-zero exit code on drift or on a resource that could not be compared,
  // so the command doubles as a CI gate.
  protected async report(targets: DiffTarget[], sides: DiffSides): Promise<DiffJson> {
    this.out(`Comparing ${c('bold', sides.leftLabel)} ${c('dim', '→')} ${c('bold', sides.rightLabel)}\n`)

    const resources: Record<string, ResourceDiffJson> = {}
    let drift = false
    let failed = false

    for (const target of targets) {
      const outcome = await this.diffResource(target, sides)
      resources[target.resource] = outcome.json
      if (outcome.drift) drift = true
      if (outcome.json.error !== undefined) failed = true
    }

    if (failed) this.out(c('red', '\nSome resources could not be compared; this run is inconclusive.'))
    else this.out(drift ? c('yellow', '\nDrift detected.') : c('green', '\nNo drift. Everything is in sync.'))

    if (drift || failed) process.exitCode = 1

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

  private async diffResource(target: DiffTarget, sides: DiffSides): Promise<{drift: boolean; json: ResourceDiffJson}> {
    let leftState: ResourceState
    let rightState: ResourceState
    try {
      ;[leftState, rightState] = await Promise.all([target.left(), target.right()])
    } catch (error) {
      const {message} = error as Error
      this.out(`${c('bold', target.title)}  ${c('red', 'error: ' + message)}`)
      return {drift: false, json: {added: [], changed: [], error: message, removed: []}}
    }

    const stateDiff = compareStates(leftState, rightState, {left: sides.leftLabel, right: sides.rightLabel})
    this.renderSection(target.title, stateDiff)

    return {
      drift: !isEmptyDiff(stateDiff),
      json: {added: stateDiff.added, changed: stateDiff.changed, removed: stateDiff.removed},
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

// Indents an already-formatted change block (a per-field list or a header-less unified diff)
// so it sits visually under the `~ id` line.
function indentPatch(patch: string): string {
  return patch
    .split('\n')
    .map((line) => (line === '' ? line : `    ${line}`))
    .join('\n')
    .trimEnd()
}
