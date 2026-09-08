import {Flags, ux} from '@oclif/core'
import {resolve} from 'node:path'

import {configManager} from '../config/project-config.manager.js'
import {LoopressCommand} from '../lib/base.js'
import {compareStates, isEmptyDiff, type ResourceState, type StateDiff} from '../lib/diff-state.js'
import {composerLocalState, composerRemoteState, RESOURCE_STATE_PROVIDERS} from '../lib/resource-state.js'
import {WpClient} from '../lib/wp-client.js'
import {resolveResourceDir} from '../utils/resource-dirs.js'

const c = ux.colorize

type ResourceDiffJson = {
  added: string[]
  changed: Array<{id: string; patch: string}>
  error?: string
  removed: string[]
}

type DiffJson = {
  drift: boolean
  left: string
  resources: Record<string, ResourceDiffJson>
  right: string
}

type DiffTarget = {
  left: () => Promise<ResourceState>
  resource: string
  right: () => Promise<ResourceState>
  title: string
}

export default class Diff extends LoopressCommand {
  static description = [
    'Show what differs between your local tracked files and a WordPress environment, or between two environments.',
    'Covers snippets, pages, forms, ACF, API routes, SEO, and Composer. Plugins and themes have their own `lps plugin status` / `lps theme status`.',
    'Exits non-zero when anything differs, so it doubles as a CI drift gate.',
  ].join(' ')

  static enableJsonFlag = true

  static examples = ['$ lps diff', '$ lps diff --env staging', '$ lps diff --env staging --against production']

  static flags = {
    against: Flags.string({
      description: 'Compare the primary environment against this second environment instead of against local files',
    }),
  }

  async run(): Promise<DiffJson> {
    const {flags} = await this.parse(Diff)

    if (flags.against === this.siteConfig.name) {
      this.error('--against must be a different environment from the one being compared.')
    }

    const leftLabel = this.siteConfig.name
    const rightLabel = flags.against ?? 'local'
    const againstWp = flags.against ? this.wpForEnvironment(flags.against) : undefined

    this.out(`Comparing ${c('bold', leftLabel)} ${c('dim', '→')} ${c('bold', rightLabel)}\n`)

    const resources: Record<string, ResourceDiffJson> = {}
    let drift = false
    let failed = false

    for (const target of this.buildTargets(againstWp)) {
      const outcome = await this.diffResource(target, {left: leftLabel, right: rightLabel})
      resources[target.resource] = outcome.json
      if (outcome.drift) drift = true
      if (outcome.json.error !== undefined) failed = true
    }

    if (failed) this.out(c('red', '\nSome resources could not be compared; this run is inconclusive.'))
    else this.out(drift ? c('yellow', '\nDrift detected.') : c('green', '\nNo drift. Everything is in sync.'))

    // A resource that failed to fetch is not "no drift": a CI gate must not pass on a
    // comparison that never ran.
    if (drift || failed) process.exitCode = 1

    return {drift, left: leftLabel, resources, right: rightLabel}
  }

  private buildTargets(againstWp: undefined | WpClient): DiffTarget[] {
    const warn = (message: string): void => {
      this.warn(message)
    }

    const targets: DiffTarget[] = RESOURCE_STATE_PROVIDERS.map((provider) => ({
      left: async () => provider.remote(this.wp, warn),
      resource: provider.resource,
      right: againstWp
        ? async () => provider.remote(againstWp, warn)
        : async () => provider.local(resolveResourceDir(provider.dirKind, this.localConfig), warn),
      title: provider.title,
    }))

    // resolve(), not join(): an absolute `rootDir` in loopress.json must stay absolute rather
    // than being prefixed with the cwd, so Composer is read from the same place as the
    // file-backed resources.
    const localRoot = resolve(process.cwd(), this.rootDir)
    targets.push({
      left: async () => composerRemoteState(this.wp),
      resource: 'composer',
      right: againstWp ? async () => composerRemoteState(againstWp) : async () => composerLocalState(localRoot),
      title: 'Composer',
    })

    return targets
  }

  private async diffResource(target: DiffTarget, labels: {left: string; right: string}): Promise<{drift: boolean; json: ResourceDiffJson}> {
    let leftState: ResourceState
    let rightState: ResourceState
    try {
      ;[leftState, rightState] = await Promise.all([target.left(), target.right()])
    } catch (error) {
      const {message} = error as Error
      this.out(`${c('bold', target.title)}  ${c('red', 'error: ' + message)}`)
      return {drift: false, json: {added: [], changed: [], error: message, removed: []}}
    }

    const stateDiff = compareStates(leftState, rightState, labels)
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
