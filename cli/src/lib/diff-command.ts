import {Args, Flags, ux} from '@oclif/core'
import {resolve} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {resolveResourceDir} from '../utils/resource-dirs.js'
import {LoopressCommand} from './base.js'
import {compareStates, isEmptyDiff, type ResourceState, type StateChange, type StateDiff} from './diff-state.js'
import {errorMessage} from './narrow.js'
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
  // The project doesn't use this resource and a site can't hold it (no plugin for it, or a
  // classic theme for Global Styles): reported as skipped instead of making the run inconclusive.
  skip?: boolean
  title: string
}

// `left` is always the primary environment. `right` is a second environment (`--against`) or
// the local tracked files.
export type DiffSides = {
  againstWp: undefined | WpClient
  leftLabel: string
  // The header's name for the right side: "local files", not "local", since the local
  // environment is itself named "local" ("Comparing local → local").
  rightHeading: string
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
    const {againstWp} = sides
    return {
      left: async () => composerRemoteState(this.wp),
      resource: 'composer',
      right: againstWp ? async () => composerRemoteState(againstWp) : async () => composerLocalState(localRoot),
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
    const {againstWp} = sides

    return {
      left: async () => provider.remote(this.wp, sides.warn, dir),
      resource: provider.resource,
      right: againstWp ? async () => provider.remote(againstWp, sides.warn, dir) : async () => provider.local(dir, sides.warn, this.wp),
      title: provider.title,
    }
  }

  // Runs every target (concurrently), prints a git-style section per resource in target order,
  // a tally, and the verdict, then returns the structured result. Exit code: 1 on drift, 2
  // when a resource could not be compared (inconclusive), so the command doubles as a CI gate.
  protected async report(targets: DiffTarget[], sides: DiffSides): Promise<DiffJson> {
    this.out(`Comparing ${c('bold', sides.leftLabel)} ${c('dim', '→')} ${c('bold', sides.rightHeading)}\n`)

    const results = await Promise.all(targets.map(async (target) => this.computeResource(target, sides)))

    // Every resource failing the same way (site down, bad credentials) is one problem: say it
    // once instead of once per resource.
    const sharedError = sharedFailure(results.map((result) => result.json.error))
    if (sharedError !== undefined) {
      // Named, since some resources may have compared fine (one that needs no request).
      const failedTitles = results.filter((result) => result.json.error !== undefined).map((result) => result.title)
      this.out(c('red', `error (${failedTitles.join(', ')}): ${sharedError}`))
    }

    const resources: Record<string, ResourceDiffJson> = {}
    let drift = false
    let failed = false
    let compared = 0
    let added = 0
    let removed = 0
    let changed = 0

    const checked = results.filter((result) => !result.skipped)
    for (const result of checked) {
      resources[result.resource] = result.json

      if (result.json.error !== undefined) {
        failed = true
        this.renderFailure(result.title, result.json.error, sharedError)
        continue
      }

      compared += 1
      added += result.json.added.length
      removed += result.json.removed.length
      changed += result.json.changed.length
      if (result.stateDiff) this.renderSection(result.title, result.stateDiff)
      if (result.drift) drift = true
    }

    const skipped = results.filter((result) => result.skipped)
    for (const result of skipped) this.out(`${c('bold', result.title)}  ${c('dim', 'not configured, skipped')}`)

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
      rightHeading: against ?? 'local files',
      rightLabel: against ?? 'local',
      warn: (message) => {
        this.warn(message)
      },
    }
  }

  // Every `lps diff` variant resolves to this structured report (narrowing oclif's
  // `run(): Promise<any>`), so tests and callers get a typed result off `.run()`.
  abstract override run(): Promise<DiffJson>

  // Fetches and compares one target. No output (so targets can run concurrently); `report`
  // renders `stateDiff` afterwards in a fixed order.
  private async computeResource(
    target: DiffTarget,
    sides: DiffSides,
  ): Promise<{drift: boolean; json: ResourceDiffJson; resource: string; skipped?: boolean; stateDiff?: StateDiff; title: string}> {
    const empty = {added: [], changed: [], removed: []}
    if (target.skip) return {drift: false, json: empty, resource: target.resource, skipped: true, title: target.title}

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
      const message = errorMessage(error)
      return {drift: false, json: {...empty, error: message}, resource: target.resource, title: target.title}
    }
  }

  private out(message: string): void {
    if (!this.jsonEnabled()) this.log(message)
  }

  private renderFailure(title: string, error: string, sharedError: string | undefined): void {
    // Already printed once by `report` when every failure is the same.
    if (sharedError !== undefined) return
    const errorLabel = c('red', `error: ${error}`)
    this.out(`${c('bold', title)}  ${errorLabel}`)
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

    return new WpClient(env.url, env.token, env.name)
  }
}

// Builds the `lps <resource> diff` command class for one directory-backed resource. They differ
// only in wording and which provider they target, so the whole body lives here.
// `command` is the CLI topic when it isn't the resource key (e.g. `theme style` for theme-styles).
export function resourceDiffCommand(
  resource: string,
  options: {command?: string; description: string; pathNoun: string},
): typeof DiffCommand {
  const command = options.command ?? resource
  class ResourceDiff extends DiffCommand {
    static override args = {
      path: Args.string({description: `Path to ${options.pathNoun} (overrides project config)`}),
    }

    static override description = options.description
    static override enableJsonFlag = true
    static override examples = [
      `$ lps ${command} diff`,
      `$ lps ${command} diff --env staging`,
      `$ lps ${command} diff --env staging --against production`,
    ]

    static override flags = {...DiffCommand.againstFlag}

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

// The one error every failed resource shares, when more than one failed (see `report`).
function sharedFailure(errors: Array<string | undefined>): string | undefined {
  const failures = errors.filter((error) => error !== undefined)
  const distinct = new Set(failures)
  return failures.length > 1 && distinct.size === 1 ? failures[0] : undefined
}
