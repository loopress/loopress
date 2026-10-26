import {confirm} from '@inquirer/prompts'
import {Flags} from '@oclif/core'
import got from 'got'
import {Listr} from 'listr2'
import {resolve} from 'node:path'
import {isDeepStrictEqual} from 'node:util'

import {authManager} from '../config/auth.manager.js'
import {API_URL} from './api-client.js'
import {LoopressCommand} from './base.js'
import {type ResourceState} from './diff-state.js'
import {guardProductionPush} from './guard-production-push.js'
import {isInteractive} from './interactive.js'
import {type ResourceStateProvider} from './resource-state.js'
import {readSnapshot, recordToState, writeSnapshot} from './snapshot-store.js'
import {withoutSpinner, withSpinner} from './spinner.js'

// One item of a dry run's preview, against the site's current state. `removed` only comes from a
// push that mirrors the project (the child theme): every other push leaves site-only items alone.
export type PushChange = {id: string; status: 'changed' | 'created' | 'removed' | 'unchanged'}

export function pushChanges(local: ResourceState, remote: ResourceState, options: {mirror?: boolean; writes?: ((id: string) => boolean) | undefined} = {}): PushChange[] {
  const changes: PushChange[] = [...local.keys()]
    .filter((id) => options.writes?.(id) ?? true)
    .map((id) => {
      if (!remote.has(id)) return {id, status: 'created'}
      return {id, status: isDeepStrictEqual(local.get(id), remote.get(id)) ? 'unchanged' : 'changed'}
    })
  if (options.mirror) {
    for (const id of remote.keys()) if (!local.has(id)) changes.push({id, status: 'removed'})
  }

  return changes.toSorted((a, b) => a.id.localeCompare(b.id))
}

export function logChanges(log: (message: string) => void, changes: Array<{id: string; status: string}>, prefix = ''): void {
  for (const change of changes) log(`[dry-run] ${change.status}: ${prefix}${change.id}`)
}

export abstract class PushCommand extends LoopressCommand {
  // Passed by an aggregate command (`lps theme push`) that already confirmed production once,
  // so its steps skip that prompt while still asking their own confirmations (uninstalls).
  static override baseFlags = {
    ...LoopressCommand.baseFlags,
    overwrite: Flags.boolean({
      description: 'Push even over changes made on the site outside Loopress since your last push. Pages: also take over a same-slug page Loopress did not create',
    }),
    'production-confirmed': Flags.boolean({hidden: true}),
  }

  protected failedCount = 0
  // A dry run's per-item preview, set by captureBeforePushState: what the push would create,
  // change or leave as it is on the site.
  protected previewChanges: PushChange[] = []
  // Both sides those statuses were computed from, for a push that details a changed item.
  protected previewStates?: {local: ResourceState; remote: ResourceState}
  // Refusals of the production guard never reach the site, so they must not pollute the
  // deployment history with failure records.
  private refusedByGuard = false

  // Reads `provider`'s remote state right before a real push, for `writeAfterPushSnapshot` to
  // pair with the actual post-push remote state once the push completes. Best-effort: a read
  // failure (the site briefly unreachable) must never block the push itself, the same "never
  // interrupt the push flow" stance recordDeployment takes; `undefined` tells
  // `writeAfterPushSnapshot` there is no restore point to complete.
  //
  // On a dry run, the same read is the preview's check against the site (see previewRemote), and
  // the reference for its per-item statuses (`previewChanges`).
  //
  // `writes` narrows the outside-edit check to the ids this push actually writes, for a push that
  // skips some local items (`lps page push <slug>`, readonly options, `lps acf push --type`).
  protected async captureBeforePushState(provider: ResourceStateProvider, dir: string, writes?: (id: string) => boolean): Promise<ResourceState | undefined> {
    if (this.dryRun) {
      const remote = await this.previewRemote(provider, dir)
      await this.guardOutsideEdits(provider, dir, remote, writes)
      try {
        const local = await provider.local(dir, () => {}, this.wp)
        this.previewStates = {local, remote}
        this.previewChanges = pushChanges(local, remote, {writes})
      } catch (error) {
        // The push reports the unreadable files itself, but an empty `changes` must not read as
        // "nothing changes".
        this.warn(`Could not list what this push would change: ${(error as Error).message}`)
      }

      logChanges((message) => { this.log(message); }, this.previewChanges)
      return undefined
    }

    let remote: ResourceState
    try {
      remote = await provider.remote(
        this.wp,
        (message) => {
          this.warn(message)
        },
        dir,
      )
    } catch (error) {
      this.warn(`Could not read remote state for a rollback snapshot: ${(error as Error).message}`)
      return undefined
    }

    await this.guardOutsideEdits(provider, dir, remote, writes)
    return remote
  }

  override async catch(err: Error): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- catch() also runs when init() failed before assigning siteConfig
    if (!this.dryRun && !this.refusedByGuard && this.siteConfig) {
      await this.recordDeployment('failure')
    }

    await super.catch(err)
  }

  protected async guardProductionPush(): Promise<void> {
    await guardProductionPush({
      dryRun: this.dryRun,
      error: (message) => this.error(message),
      onRefuse: () => {
        this.refusedByGuard = true
      },
      siteConfig: this.siteConfig,
      yes: this.yes || this.productionConfirmed,
    })
  }

  override async init(): Promise<void> {
    await super.init()
    await this.guardProductionPush()
  }

  // A dry run used to stay local, so it announced "pushed" for a resource the site would refuse
  // (ACF or Rank Math missing: a 400 or 409 on the real push). It now reads the site the same way
  // `lps diff` does and fails the same way, so the preview, and the MCP server's preview and
  // pre-apply check built on it, see what the real push will hit.
  protected async previewRemote(provider: ResourceStateProvider, dir: string): Promise<ResourceState> {
    try {
      return await provider.remote(this.wp, () => {}, dir)
    } catch (error) {
      this.error(`The site would refuse this push: ${(error as Error).message}`)
    }
  }

  protected async recordDeployment(status: 'failure' | 'success'): Promise<void> {
    const token = process.env.LOOPRESS_TOKEN ?? authManager.getAuth()?.token ?? null
    if (!token) return

    try {
      await withSpinner('Recording the deployment', async () =>
        got.post(`${API_URL}/deployments`, {
          headers: {Authorization: `Bearer ${token}`},
          json: {status, url: this.siteConfig.url},
          timeout: {request: 3000},
        }),
      )
    } catch {
      // non-blocking: recording must never interrupt the push flow
    }
  }

  protected async recordSuccess(): Promise<void> {
    if (this.dryRun) return
    await this.recordDeployment('success')
    await this.reportPushToSite()
  }

  // Tells the plugin this push finished, for its Overview tab and the "managed by Loopress"
  // warnings in wp-admin: one record per command (`this.id`, e.g. `acf:push`), since a single push
  // sends one request per item. Best-effort like recordDeployment: a plugin older than the push
  // log answers 404, one that doesn't know this command 400, neither may fail a push that landed.
  protected async reportPushToSite(): Promise<void> {
    if (!this.id) return

    try {
      // Bounded: the site fingerprints the pushed resource before answering, which a large
      // site can make slow, and a finished push must not wait on its own bookkeeping.
      await this.wp.post('loopress/v1/pushes', {resource: this.id}, {timeoutMs: 5000})
    } catch {
      // non-blocking, see above
    }
  }

  // Reports one failed Listr task: status lines go through `task.output` when running inside a
  // Listr renderer (this.warn would race with the repaint), and fall back to `this.warn` when
  // called without a task (e.g. directly in tests). Rethrowing is what lets Listr mark the task
  // failed (red cross) instead of completed; `exitOnError: false` on the list still lets sibling
  // tasks run, and the accumulated `failedCount` drives the command's final "N failed" error.
  protected reportTaskFailure(message: string, error: unknown, task?: {output: string}): never {
    if (task) task.output = message
    else this.warn(`  ${message}`)

    this.failedCount++
    throw error
  }

  // Shared shape of every resource's push list: sequential (`concurrent: false` avoids
  // clobbering `failedCount` and interleaving WordPress writes), and a failing item never
  // stops its siblings (`exitOnError: false`) so `failedCount` reflects every failure, not
  // just the first. `label` feeds the "Push <label>" task title; `task` does the actual work
  // and reports its own failure through `reportTaskFailure`.
  protected async runPushTasks<T>(
    items: T[],
    label: (item: T) => string,
    task: (item: T, task?: {output: string}) => Promise<void>,
  ): Promise<void> {
    await withoutSpinner(async () => {
      await new Listr(
        items.map((item) => ({
          task: async (_ctx, taskCtx) => task(item, taskCtx),
          title: `Push ${label(item)}`,
        })),
        {concurrent: false, exitOnError: false, renderer: this.jsonEnabled() ? 'silent' : 'default'},
      ).run()
    })
  }

  // Pairs `beforeState` (from captureBeforePushState, read before this push touched anything)
  // with a fresh remote read taken right after the push, and writes both as one rollback
  // snapshot. Reading the after-state from WordPress itself, rather than assuming it matches
  // the local files that were pushed, is what keeps this correct for every resource's own
  // partial-push semantics: a readonly option skipped by `option push`, a snippet or form
  // that gets a server-assigned id on create, a theme-styles push that only touches the
  // active stylesheet, an API/hook push that leaves server-side files alone unless `--prune`.
  // `lps <resource> rollback`'s drift check compares the environment's state at rollback time
  // against exactly this after-state, so it has to be what actually landed, not what was sent.
  protected async writeAfterPushSnapshot(provider: ResourceStateProvider, dir: string, beforeState: ResourceState | undefined): Promise<void> {
    if (!beforeState || this.dryRun) return

    try {
      const afterState = await provider.remote(
        this.wp,
        (message) => {
          this.warn(message)
        },
        dir,
      )
      await writeSnapshot({
        afterState,
        beforeState,
        environment: this.siteConfig.name,
        resource: provider.resource,
        rootDir: resolve(process.cwd(), this.rootDir),
      })
    } catch (error) {
      this.warn(`Could not save a rollback snapshot after this push: ${(error as Error).message}`)
    }
  }

  // Refuses to silently overwrite a change made on the site outside Loopress (wp-admin, another
  // tool) since this machine's last push. Flags an id only when both hold:
  // - the site no longer matches what that push left (the latest snapshot's `afterState`, the
  //   same reference rollback's drift check uses), and
  // - this push would write a different value over it (local differs from the site), so a
  //   `pull` that already brought the change into the local files is no reason to stop.
  // Only ids present locally count: a push is additive, it never touches a site-only id. And
  // only ids the site still has with readable content: pushing over a deletion (`lps <resource>
  // rm`, or wp-admin) loses nothing, and a file the site lists without its content (too large
  // to send) can't be compared, so it would otherwise block every push.
  // Ceiling: snapshots live in git-ignored `.loopress/`, so only the machine that pushed last
  // is protected; a record kept on the site would cover teammates and CI.
  private async guardOutsideEdits(provider: ResourceStateProvider, dir: string, remote: ResourceState, writes?: (id: string) => boolean): Promise<void> {
    if (this.overwrite) return

    let expected: ResourceState
    let local: ResourceState
    let pushedAt: string
    try {
      const snapshot = await readSnapshot(resolve(process.cwd(), this.rootDir), provider.resource, this.siteConfig.name)
      expected = recordToState(snapshot.afterState)
      pushedAt = snapshot.createdAt
    } catch {
      // No earlier push from this machine.
      return
    }

    // Unreadable files are skipped with a warning, so a failure here is the site's (ACF's
    // normalize route): the check can't run, and a push must not go on unchecked.
    try {
      local = await provider.local(dir, () => {}, this.wp)
    } catch (error) {
      this.error(`Could not check for changes made on ${this.siteConfig.url} outside Loopress: ${(error as Error).message}. Retry, or pass --overwrite.`)
    }

    const overwritten = [...local.keys()].filter(
      (id) =>
        (writes?.(id) ?? true) &&
        remote.get(id) !== undefined &&
        !sameEntry(remote, expected, id) &&
        !sameEntry(local, remote, id),
    )
    if (overwritten.length === 0) return

    const message =
      `Changed on ${this.siteConfig.url} outside Loopress since your last push (${pushedAt}), this push would overwrite: ${overwritten.join(', ')}. ` +
      `Review with \`lps diff --only ${provider.resource}\`, bring the site's version into your files, or pass --overwrite.`
    // A dry run only previews: say what the real push would stop on.
    if (this.dryRun) {
      this.warn(message)
      return
    }

    if (!isInteractive()) this.error(message)

    this.warn(message)
    if (!(await confirm({default: false, message: 'Overwrite those changes?'}))) this.error('Aborted.')
  }
}

function sameEntry(left: ResourceState, right: ResourceState, id: string): boolean {
  return left.has(id) === right.has(id) && isDeepStrictEqual(left.get(id), right.get(id))
}
