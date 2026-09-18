import got from 'got'
import {Listr} from 'listr2'
import {resolve} from 'node:path'

import {authManager} from '../config/auth.manager.js'
import {API_URL} from './api-client.js'
import {LoopressCommand} from './base.js'
import {type ResourceState} from './diff-state.js'
import {guardProductionPush} from './guard-production-push.js'
import {type ResourceStateProvider} from './resource-state.js'
import {writeSnapshot} from './snapshot-store.js'

export abstract class PushCommand extends LoopressCommand {
  protected failedCount = 0
  // Refusals of the production guard never reach the site, so they must not pollute the
  // deployment history with failure records.
  private refusedByGuard = false

  // Reads `provider`'s remote state right before a real push, for `writeAfterPushSnapshot` to
  // pair with the actual post-push remote state once the push completes. A dry run changes
  // nothing, so there is nothing to snapshot. Best-effort: a read failure (the site briefly
  // unreachable) must never block the push itself, the same "never interrupt the push flow"
  // stance recordDeployment takes; `undefined` tells `writeAfterPushSnapshot` there is no
  // restore point to complete.
  protected async captureBeforePushState(provider: ResourceStateProvider, dir: string): Promise<ResourceState | undefined> {
    if (this.dryRun) return undefined

    try {
      return await provider.remote(
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
  }

  async catch(err: Error): Promise<void> {
    if (!this.dryRun && !this.refusedByGuard && this.siteConfig) {
      await this.recordDeployment('failure')
    }

    return super.catch(err)
  }

  protected async guardProductionPush(): Promise<void> {
    await guardProductionPush({
      dryRun: this.dryRun,
      error: (message) => this.error(message),
      onRefuse: () => {
        this.refusedByGuard = true
      },
      siteConfig: this.siteConfig,
      yes: this.yes,
    })
  }

  async init(): Promise<void> {
    await super.init()
    await this.guardProductionPush()
  }

  protected async recordDeployment(status: 'failure' | 'success'): Promise<void> {
    const token = process.env.LOOPRESS_TOKEN ?? authManager.getAuth()?.token ?? null
    if (!token) return

    try {
      await got.post(`${API_URL}/deployments`, {
        headers: {Authorization: `Bearer ${token}`},
        json: {status, url: this.siteConfig.url},
        timeout: {request: 3000},
      })
    } catch {
      // non-blocking: recording must never interrupt the push flow
    }
  }

  protected async recordSuccess(): Promise<void> {
    if (!this.dryRun) await this.recordDeployment('success')
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
    await new Listr(
      items.map((item) => ({
        task: async (_ctx, taskCtx) => task(item, taskCtx),
        title: `Push ${label(item)}`,
      })),
      {concurrent: false, exitOnError: false, renderer: this.jsonEnabled() ? 'silent' : 'default'},
    ).run()
  }

  // Pairs `beforeState` (from captureBeforePushState, read before this push touched anything)
  // with a fresh remote read taken right after the push, and writes both as one rollback
  // snapshot. Reading the after-state from WordPress itself, rather than assuming it matches
  // the local files that were pushed, is what keeps this correct for every resource's own
  // partial-push semantics: a readonly option skipped by `option push`, a snippet or SEO
  // redirect that gets a server-assigned id on create, a theme-styles push that only touches the
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
}
