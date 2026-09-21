import {confirm} from '@inquirer/prompts'
import {Args, Flags, ux} from '@oclif/core'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

import {pluralize} from '../utils/pluralize.js'
import {resolveResourceDir} from '../utils/resource-dirs.js'
import {LoopressCommand} from './base.js'
import {compareStates, isEmptyDiff, type StateDiff} from './diff-state.js'
import {guardProductionPush} from './guard-production-push.js'
import {isInteractive} from './interactive.js'
import {getResourceStateProvider} from './resource-state.js'
import {materializeSnapshot} from './rollback-materialize.js'
import {listSnapshots, readSnapshot, recordToState, type SnapshotSummary} from './snapshot-store.js'

const c = ux.colorize

export type RollbackResult = {
  // Present only when the environment's current state didn't match what the original push
  // expected to leave behind, i.e. something else touched it since. Surfaced in the structured
  // (--json/MCP) result too, not just the human-readable log, so a caller reviewing a preview
  // (the MCP confirmToken handshake's first call) can actually see it before confirming.
  drift?: {added: string[]; changed: string[]; removed: string[]}
  id?: string
  restored?: {added: string[]; changed: string[]; removed: string[]}
  snapshots?: SnapshotSummary[]
  status: 'dry-run' | 'listed' | 'no-op' | 'success'
}

function summarize(diff: StateDiff): {added: string[]; changed: string[]; removed: string[]} {
  return {added: diff.added, changed: diff.changed.map((change) => change.id), removed: diff.removed}
}

function indentPatch(patch: string): string {
  return patch
    .split('\n')
    .map((line) => (line === '' ? line : `    ${line}`))
    .join('\n')
    .trimEnd()
}

// Builds the `lps <resource> rollback` command for one resource-state-backed resource (the 9
// listed in resource-state.ts's RESOURCE_STATE_PROVIDERS). `lps <resource> push` writes a
// snapshot of the environment's state right before every real push (see snapshot-store.ts);
// this command restores one: by default the most recent, or `--to <id>` for an older one.
//
// A rollback is only safe when nothing else touched the environment between the original push
// and now, otherwise it silently overwrites a legitimate later change. So before restoring
// anything, this runs the equivalent of `lps <resource> diff` between the environment's current
// state and the state the original push expected to leave behind, and requires explicit
// confirmation (the same interactive/`--yes` shape as guardProductionPush) when they differ.
export function resourceRollbackCommand(resource: string, options: {description: string; pathNoun: string}): typeof LoopressCommand {
  class ResourceRollback extends LoopressCommand {
    static args = {
      path: Args.string({description: `Path to ${options.pathNoun} (overrides project config)`}),
    }

    static description = options.description
    static enableJsonFlag = true
    static examples = [
      `$ lps ${resource} rollback`,
      `$ lps ${resource} rollback --list`,
      `$ lps ${resource} rollback --to 1732000000000`,
      `$ lps ${resource} rollback --dry-run`,
    ]

    static flags = {
      ...LoopressCommand.dryRunFlag,
      ...LoopressCommand.yesFlag,
      list: Flags.boolean({description: 'List available snapshots instead of rolling back'}),
      to: Flags.string({description: 'Roll back to this snapshot id instead of the most recent one'}),
    }

    async run(): Promise<RollbackResult> {
      const {args, flags} = await this.parse(ResourceRollback)
      const provider = getResourceStateProvider(resource)
      const rootDir = resolve(process.cwd(), this.rootDir)

      if (flags.list) {
        const snapshots = await listSnapshots(rootDir, resource, this.siteConfig.name)
        this.renderList(snapshots)
        return {snapshots, status: 'listed'}
      }

      const dir = resolveResourceDir(provider.dirKind, this.localConfig, args.path)

      let snapshot
      try {
        snapshot = await readSnapshot(rootDir, resource, this.siteConfig.name, flags.to)
      } catch (error) {
        this.error((error as Error).message)
      }

      await guardProductionPush({
        dryRun: this.dryRun,
        error: (message) => this.error(message),
        siteConfig: this.siteConfig,
        yes: this.yes,
      })

      this.log(`Rolling back ${provider.title} on ${this.siteConfig.url} to the snapshot from ${snapshot.createdAt} (${snapshot.id})`)

      const warn = (message: string) => {
        this.warn(message)
      }

      const currentState = await provider.remote(this.wp, warn, dir)

      // Has anything else changed the environment since the original push? Compare its current
      // state against what that push expected to leave behind (`afterState`), not against the
      // snapshot we're about to restore (`beforeState`), those are expected to differ, that's
      // the whole point of rolling back.
      const drift = compareStates(recordToState(snapshot.afterState), currentState, {
        left: `expected (right after the ${snapshot.createdAt} push)`,
        right: 'current',
      })

      const driftSummary = isEmptyDiff(drift) ? undefined : summarize(drift)
      if (driftSummary) {
        this.renderDiff(`${provider.title} has changed on ${this.siteConfig.url} since that push:`, drift)
        await this.confirmDespiteDrift()
      }

      const restoreState = recordToState(snapshot.beforeState)
      const restoreDiff = compareStates(currentState, restoreState, {left: 'current', right: `snapshot ${snapshot.id}`})

      if (isEmptyDiff(restoreDiff)) {
        this.log('Nothing to restore, the environment already matches this snapshot.')
        return {drift: driftSummary, id: snapshot.id, restored: summarize(restoreDiff), status: 'no-op'}
      }

      this.renderDiff(`This would restore ${provider.title} to:`, restoreDiff)

      // `<resource> push` only creates and updates, it never deletes (see each resource's own
      // push command, e.g. option push's "upsert only, never deletes an untracked option"):
      // an item present now but absent from the snapshot stays present after "restoring" it.
      if (restoreDiff.removed.length > 0) {
        this.warn(
          `${pluralize(restoreDiff.removed.length, 'item')} present now but not in this snapshot will NOT be removed ` +
            `(${restoreDiff.removed.join(', ')}): restoring only creates and updates, the same as \`lps ${resource} push\`. Remove ${restoreDiff.removed.length === 1 ? 'it' : 'them'} by hand if that's part of undoing the original push.`,
        )
      }

      if (this.dryRun) {
        return {drift: driftSummary, id: snapshot.id, restored: summarize(restoreDiff), status: 'dry-run'}
      }

      // Only the items that actually need restoring, not the whole snapshot: an item already
      // matching `beforeState` needs no push, and re-pushing it anyway would put every other
      // item this resource ever had at push time (however unrelated to what actually drifted)
      // through the delegated push's own validation, where a single unrelated failure would
      // fail the whole rollback.
      const idsToRestore = new Set([...restoreDiff.added, ...restoreDiff.changed.map((change) => change.id)])
      const stateToRestore = Object.fromEntries(Object.entries(snapshot.beforeState).filter(([id]) => idsToRestore.has(id)))

      const tmpDir = await mkdtemp(join(tmpdir(), `loopress-rollback-${resource}-`))
      try {
        await materializeSnapshot(resource, stateToRestore, tmpDir)
        // tmpDir is positional (the same [PATH] arg every resource push command takes, see e.g.
        // commands/snippet/push.ts's `static args`), not a --path flag. --env/--yes: the
        // production guard and the drift confirmation above already covered what the delegated
        // push's own guard would ask again, same reasoning as the top-level `lps push`
        // delegating to each resource's push command in commands/push.ts.
        await this.config.runCommand(`${resource}:push`, [tmpDir, '--env', this.siteConfig.name, '--yes'])
      } finally {
        // A cleanup failure here must never hide a real error from the push above: warn about
        // it and let the original error (if any) keep propagating instead of being replaced.
        await rm(tmpDir, {force: true, recursive: true}).catch((error: unknown) => {
          this.warn(`Could not remove the temporary directory "${tmpDir}": ${(error as Error).message}`)
        })
      }

      this.log(`Rolled back ${provider.title} to the snapshot from ${snapshot.createdAt}.`)
      return {drift: driftSummary, id: snapshot.id, restored: summarize(restoreDiff), status: 'success'}
    }

    private async confirmDespiteDrift(): Promise<void> {
      if (this.dryRun || this.yes) return

      if (!isInteractive()) {
        this.error(
          'The environment has changed since this snapshot was taken. Re-run with --yes to roll back anyway (overwriting those later changes).',
        )
      }

      const proceed = await confirm({
        default: false,
        message: 'The environment has changed since this snapshot was taken. Roll back anyway, overwriting those later changes?',
      })
      if (!proceed) this.error('Aborted.')
    }

    private renderDiff(heading: string, diff: StateDiff): void {
      if (this.jsonEnabled()) return

      this.log(c('bold', heading))
      for (const id of diff.added) this.log(c('green', `  + ${id}`))
      for (const id of diff.removed) this.log(c('red', `  - ${id}`))
      for (const change of diff.changed) {
        this.log(c('yellow', `  ~ ${change.id}`))
        this.log(indentPatch(change.patch))
      }
    }

    private renderList(snapshots: SnapshotSummary[]): void {
      if (this.jsonEnabled()) return

      if (snapshots.length === 0) {
        this.log(
          `No snapshots found for "${resource}" on "${this.siteConfig.name}". A snapshot is written automatically by \`lps ${resource} push\`.`,
        )
        return
      }

      this.log(`Snapshots for "${resource}" on "${this.siteConfig.name}" (most recent first):`)
      for (const snapshot of snapshots) {
        this.log(`  ${snapshot.id}  ${snapshot.createdAt}`)
      }
    }
  }

  return ResourceRollback
}
